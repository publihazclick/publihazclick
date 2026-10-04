-- 302: solicitudes de viaje también por WhatsApp a conductores con ventana de 24 h abierta.
--
-- POR QUÉ (2026-10-03): medido ese día, el push sale del servidor en <0,5 s pero Android lo entrega
-- tarde o nunca a quien tiene la app cerrada o el celular en reposo: de 579 avisos en 30 días, 386
-- nunca se vieron, y los que sí, con mediana de 15 s. WhatsApp casi nunca se duerme. Decisión del
-- usuario: mandar cada solicitud ADEMÁS por WhatsApp, solo a quienes escribieron al número de
-- conductores en las últimas 24 h (texto libre gratis dentro de la ventana, sin plantilla).
--
-- 1. ag_wa_support_sessions.alertas_viaje_off: el conductor puede responder "NO MÁS" y deja de
--    recibir estos avisos por WhatsApp (el push NO cambia).
-- 2. ag_notify_drivers_on_trip_request: igual que estaba en producción, más UN bloque que llama a
--    ag-whatsapp (_internal_event 'alerta_solicitud_conductores'). Bloque aparte con EXCEPTION:
--    si falla, el push sigue igual.

ALTER TABLE public.ag_wa_support_sessions
  ADD COLUMN IF NOT EXISTS alertas_viaje_off    boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS alertas_viaje_off_at timestamptz;

CREATE OR REPLACE FUNCTION public.ag_notify_drivers_on_trip_request()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_supabase_url TEXT;
  v_service_key  TEXT;
  v_user_ids     TEXT[];
  v_driver_ids   uuid[];
  v_price_fmt    TEXT;
  v_payload      jsonb;
  v_origin_geog  extensions.geography;
BEGIN
  IF NEW.status <> 'searching' THEN RETURN NEW; END IF;

  SELECT decrypted_secret INTO v_supabase_url FROM vault.decrypted_secrets WHERE name = 'supabase_url' LIMIT 1;
  SELECT decrypted_secret INTO v_service_key  FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1;
  IF v_supabase_url IS NULL OR v_service_key IS NULL THEN RETURN NEW; END IF;

  -- WhatsApp a los conductores con ventana de 24 h abierta (2026-10-03, migración 302). Va ANTES
  -- del cálculo del push y en su propio bloque: si falla, el push sigue exactamente igual. El bot
  -- (ag-whatsapp, alertaSolicitudConductores) elige a quién, con las mismas reglas del push.
  BEGIN
    PERFORM net.http_post(
      url     := v_supabase_url || '/functions/v1/ag-whatsapp',
      headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_service_key),
      body    := jsonb_build_object('_internal_event', 'alerta_solicitud_conductores', 'trip_id', NEW.id::text),
      timeout_milliseconds := 15000
    );
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  v_price_fmt := '$' || to_char(NEW.offered_price, 'FM999G999G999');
  v_origin_geog := extensions.ST_SetSRID(extensions.ST_MakePoint(NEW.origin_lng, NEW.origin_lat), 4326)::extensions.geography;

  SELECT ARRAY_AGG(DISTINCT uid) INTO v_user_ids FROM (

    SELECT u.auth_user_id::text AS uid
    FROM public.ag_drivers d
    JOIN public.ag_driver_locations dl ON dl.driver_id = d.id
    JOIN public.ag_users u ON u.id = d.ag_user_id
    WHERE d.is_online = true
      AND d.status IN ('approved', 'quick', 'pending')
      AND ((CASE WHEN d.vehicle_type = 'moto' THEN 'moto' ELSE 'carro' END) = NEW.vehicle_type
           OR NEW.vehicle_type IN ('domicilio','fletes','ciudad'))
      AND COALESCE(d.notify_new_requests, true) = true
      AND dl.updated_at > NOW() - INTERVAL '10 minutes'
      -- Tope de 30 km eliminado (2026-09-03, pedido explicito del usuario): la regla es que
      -- TODO conductor registrado reciba TODA solicitud sin importar a que distancia este. El
      -- conductor decide si le sirve; para eso ahora la app le muestra a cuantos km esta del
      -- punto de recogida (ver pickupDistanceKm en anda-gana.component.ts).

    UNION

    SELECT u.auth_user_id::text AS uid
    FROM public.ag_drivers d
    JOIN public.ag_driver_locations dl ON dl.driver_id = d.id
    JOIN public.ag_users u ON u.id = d.ag_user_id
    JOIN public.ag_push_subs ps
      ON ps.user_id = u.auth_user_id
      AND ps.provider = 'fcm'
      AND ps.fcm_token IS NOT NULL
    WHERE d.status IN ('approved', 'quick', 'pending')
      AND ((CASE WHEN d.vehicle_type = 'moto' THEN 'moto' ELSE 'carro' END) = NEW.vehicle_type
           OR NEW.vehicle_type IN ('domicilio','fletes','ciudad'))
      AND COALESCE(d.notify_new_requests, true) = true
      AND dl.updated_at > NOW() - INTERVAL '7 days'
      -- Tope de 30 km eliminado (2026-09-03, pedido explicito del usuario): la regla es que
      -- TODO conductor registrado reciba TODA solicitud sin importar a que distancia este. El
      -- conductor decide si le sirve; para eso ahora la app le muestra a cuantos km esta del
      -- punto de recogida (ver pickupDistanceKm en anda-gana.component.ts).

    UNION

    -- Rama 3 (2026-09-02): conductor con push activo del que NO tenemos ubicacion utilizable
    -- (nunca la registro, o la ultima es de hace mas de 7 dias). Sin esta rama quedaban
    -- completamente fuera del reparto: eran 13 de 45 conductores reales, gente registrada,
    -- con la app instalada y las notificaciones activas, a la que NUNCA le llegaba una sola
    -- solicitud. No se puede filtrar por distancia porque justamente no hay contra que
    -- medirla; se asume que quien se registro en Movi esta en la ciudad donde opera. Es
    -- deliberado: la regla del negocio es que TODO conductor registrado reciba todas las
    -- solicitudes para poder hacer su primer viaje cuanto antes, y es mucho peor que nadie
    -- vea la solicitud a que la vea alguien lejos (que simplemente no oferta).
    SELECT u.auth_user_id::text AS uid
    FROM public.ag_drivers d
    JOIN public.ag_users u ON u.id = d.ag_user_id
    JOIN public.ag_push_subs ps
      ON ps.user_id = u.auth_user_id
      AND ps.provider = 'fcm'
      AND ps.fcm_token IS NOT NULL
    LEFT JOIN public.ag_driver_locations dl ON dl.driver_id = d.id
    WHERE d.status IN ('approved', 'quick', 'pending')
      AND ((CASE WHEN d.vehicle_type = 'moto' THEN 'moto' ELSE 'carro' END) = NEW.vehicle_type
           OR NEW.vehicle_type IN ('domicilio','fletes','ciudad'))
      AND COALESCE(d.notify_new_requests, true) = true
      AND (dl.driver_id IS NULL OR dl.updated_at <= NOW() - INTERVAL '7 days')
  ) sub;

  IF v_user_ids IS NULL OR array_length(v_user_ids, 1) = 0 THEN
    RETURN NEW;
  END IF;

  -- Registrar a quiénes se les manda -- por auth_user_id, traducido a driver_id real.
  BEGIN
    SELECT ARRAY_AGG(DISTINCT d.id) INTO v_driver_ids
    FROM public.ag_drivers d
    JOIN public.ag_users u ON u.id = d.ag_user_id
    WHERE u.auth_user_id::text = ANY(v_user_ids);

    IF v_driver_ids IS NOT NULL THEN
      INSERT INTO public.ag_trip_push_log (trip_request_id, driver_id, round)
      SELECT NEW.id, did, 0 FROM unnest(v_driver_ids) AS did;
    END IF;
  EXCEPTION WHEN OTHERS THEN NULL; END;

  v_payload := jsonb_build_object(
    'user_ids', v_user_ids,
    'title',    'Nueva solicitud · ' || v_price_fmt,
    'body',     COALESCE(NEW.origin_name, 'Origen sin nombre') || ' → ' || NEW.dest_name
                || E'\n' || v_price_fmt || ' · ' || round(NEW.distance_km::numeric, 1) || ' km',
    'url',      '/anda-gana?trip_request_id=' || NEW.id::text,
    'tag',      'trip-' || NEW.id::text,
    'urgent',   true,
    'trip_id',  NEW.id::text,
    'price',    NEW.offered_price::text,
    'dist',     round(NEW.distance_km::numeric, 1)::text,
    'origin',   COALESCE(NEW.origin_name, 'Origen sin nombre'),
    'dest',     NEW.dest_name
  );

  BEGIN
    PERFORM net.http_post(
      url     := v_supabase_url || '/functions/v1/ag-send-push',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer ' || v_service_key
      ),
      body    := v_payload,
      timeout_milliseconds := 5000
    );
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN NEW;
END;
$function$;
