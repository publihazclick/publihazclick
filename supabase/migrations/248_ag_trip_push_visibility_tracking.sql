-- Migration 248: saber a QUIÉN se le mandó cada push y quién lo abrió (2026-09-01)
--
-- Pedido explícito del usuario: poder saber qué conductores vieron cada solicitud de
-- viaje, para confirmar si de verdad están leyendo las notificaciones push.
--
-- Hasta ahora no existía ningún registro de "a estos conductores se les mandó push por
-- esta solicitud" -- el trigger y el reintento (migración 247) calculaban la lista y la
-- mandaban, pero nunca la guardaban en ningún lado. Tampoco existía forma de saber si un
-- conductor específico ABRIÓ la notificación -- lo más cercano (offer_seen,
-- ag_driver_metric_events) se dispara cada vez que la app tiene la lista abierta con
-- resultados, sea porque tocó el push o porque ya tenía la app abierta por su cuenta --
-- no distingue una cosa de la otra.
--
-- Nueva tabla ag_trip_push_log: una fila por (solicitud, conductor, intento) cuando se le
-- manda el push, con opened_at que se llena cuando ese conductor específico abre la app
-- DESDE esa notificación puntual (_showIncomingTripById en el frontend, que solo se llama
-- desde el deep link nativo trip_request_id=... o el puente __moviHandleTripPush -- ambos
-- disparan ÚNICAMENTE al tocar la notificación real, nunca por abrir la app normal).

CREATE TABLE IF NOT EXISTS public.ag_trip_push_log (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_request_id   uuid NOT NULL REFERENCES public.ag_trip_requests(id) ON DELETE CASCADE,
  driver_id         uuid NOT NULL REFERENCES public.ag_drivers(id) ON DELETE CASCADE,
  round             integer NOT NULL DEFAULT 0,  -- 0 = aviso inicial, 1 = reintento a los 3 min (ver migración 247)
  sent_at           timestamptz NOT NULL DEFAULT now(),
  opened_at         timestamptz
);

CREATE INDEX IF NOT EXISTS idx_ag_trip_push_log_trip ON public.ag_trip_push_log(trip_request_id);
CREATE INDEX IF NOT EXISTS idx_ag_trip_push_log_driver ON public.ag_trip_push_log(driver_id);

ALTER TABLE public.ag_trip_push_log ENABLE ROW LEVEL SECURITY;
-- Mismo criterio de acceso que el resto de tablas ag_ (control real vía RLS de las tablas
-- base + guard de rutas Angular, no por rol aquí) -- lectura abierta, escritura solo via
-- RPC/trigger con SECURITY DEFINER.
CREATE POLICY ag_trip_push_log_select ON public.ag_trip_push_log FOR SELECT USING (true);

-- ── Registrar el envío inicial (round 0) ────────────────────────────────────────────
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
      AND extensions.ST_DWithin(dl.geog, v_origin_geog, 20000)

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
      AND dl.updated_at > NOW() - INTERVAL '4 hours'
      AND extensions.ST_DWithin(dl.geog, v_origin_geog, 20000)

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

-- ── Registrar el reintento (round 1) + enriquecer el aviso al admin ────────────────
CREATE OR REPLACE FUNCTION public.ag_check_and_retry_dispatch()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  r               RECORD;
  v_supabase_url  TEXT;
  v_service_key   TEXT;
  v_user_ids      TEXT[];
  v_driver_ids    uuid[];
  v_origin_geog   extensions.geography;
  v_matched       integer;
  v_total_notified integer;
  v_total_opened   integer;
BEGIN
  SELECT decrypted_secret INTO v_supabase_url FROM vault.decrypted_secrets WHERE name = 'supabase_url' LIMIT 1;
  SELECT decrypted_secret INTO v_service_key  FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1;
  IF v_supabase_url IS NULL OR v_service_key IS NULL THEN RETURN; END IF;

  -- ── Ronda 1: reintento a los 3 minutos ──────────────────────────────────
  FOR r IN
    SELECT tr.*
    FROM public.ag_trip_requests tr
    WHERE tr.status = 'searching'
      AND tr.dispatch_retry_round = 0
      AND tr.created_at <= now() - interval '3 minutes'
      AND NOT EXISTS (SELECT 1 FROM public.ag_trip_offers o WHERE o.trip_request_id = tr.id)
  LOOP
    v_origin_geog := extensions.ST_SetSRID(extensions.ST_MakePoint(r.origin_lng, r.origin_lat), 4326)::extensions.geography;

    SELECT ARRAY_AGG(DISTINCT uid) INTO v_user_ids FROM (
      SELECT u.auth_user_id::text AS uid
      FROM public.ag_drivers d
      JOIN public.ag_driver_locations dl ON dl.driver_id = d.id
      JOIN public.ag_users u ON u.id = d.ag_user_id
      WHERE d.is_online = true
        AND d.status IN ('approved', 'quick', 'pending')
        AND (CASE WHEN d.vehicle_type = 'moto' THEN 'moto' ELSE 'carro' END) = r.vehicle_type
        AND COALESCE(d.notify_new_requests, true) = true
        AND dl.updated_at > NOW() - INTERVAL '10 minutes'
        AND extensions.ST_DWithin(dl.geog, v_origin_geog, 30000)

      UNION

      SELECT u.auth_user_id::text AS uid
      FROM public.ag_drivers d
      JOIN public.ag_driver_locations dl ON dl.driver_id = d.id
      JOIN public.ag_users u ON u.id = d.ag_user_id
      JOIN public.ag_push_subs ps
        ON ps.user_id = u.auth_user_id AND ps.provider = 'fcm' AND ps.fcm_token IS NOT NULL
      WHERE d.status IN ('approved', 'quick', 'pending')
        AND (CASE WHEN d.vehicle_type = 'moto' THEN 'moto' ELSE 'carro' END) = r.vehicle_type
        AND COALESCE(d.notify_new_requests, true) = true
        AND dl.updated_at > NOW() - INTERVAL '4 hours'
        AND extensions.ST_DWithin(dl.geog, v_origin_geog, 30000)
    ) sub;

    v_matched := COALESCE(array_length(v_user_ids, 1), 0);

    IF v_matched > 0 THEN
      BEGIN
        SELECT ARRAY_AGG(DISTINCT d.id) INTO v_driver_ids
        FROM public.ag_drivers d
        JOIN public.ag_users u ON u.id = d.ag_user_id
        WHERE u.auth_user_id::text = ANY(v_user_ids);

        IF v_driver_ids IS NOT NULL THEN
          INSERT INTO public.ag_trip_push_log (trip_request_id, driver_id, round)
          SELECT r.id, did, 1 FROM unnest(v_driver_ids) AS did;
        END IF;
      EXCEPTION WHEN OTHERS THEN NULL; END;

      BEGIN
        PERFORM net.http_post(
          url     := v_supabase_url || '/functions/v1/ag-send-push',
          headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_service_key),
          body    := jsonb_build_object(
            'user_ids', v_user_ids,
            'title',    '🔔 Solicitud esperando · $' || to_char(r.offered_price, 'FM999G999G999'),
            'body',     COALESCE(r.origin_name, 'Origen sin nombre') || ' → ' || r.dest_name,
            'url',      '/anda-gana?trip_request_id=' || r.id::text,
            'tag',      'trip-retry-' || r.id::text,
            'urgent',   true,
            'trip_id',  r.id::text,
            'price',    r.offered_price::text,
            'dist',     round(r.distance_km::numeric, 1)::text,
            'origin',   COALESCE(r.origin_name, 'Origen sin nombre'),
            'dest',     r.dest_name
          ),
          timeout_milliseconds := 5000
        );
      EXCEPTION WHEN OTHERS THEN NULL; END;
    END IF;

    UPDATE public.ag_trip_requests
    SET dispatch_retry_round = 1, dispatch_round1_matched = v_matched
    WHERE id = r.id;
  END LOOP;

  -- ── Ronda 2: aviso al admin a los 6 minutos si sigue sin ofertas ────────
  -- Enriquecido: incluye cuántos de los notificados de verdad ABRIERON el push
  -- (ag_trip_push_log.opened_at), para distinguir "nadie lo vio" de "lo vieron y no
  -- les interesó".
  FOR r IN
    SELECT tr.*
    FROM public.ag_trip_requests tr
    WHERE tr.status = 'searching'
      AND tr.dispatch_retry_round = 1
      AND tr.dispatch_alerted_at IS NULL
      AND tr.created_at <= now() - interval '6 minutes'
      AND NOT EXISTS (SELECT 1 FROM public.ag_trip_offers o WHERE o.trip_request_id = tr.id)
  LOOP
    SELECT count(DISTINCT driver_id), count(DISTINCT driver_id) FILTER (WHERE opened_at IS NOT NULL)
    INTO v_total_notified, v_total_opened
    FROM public.ag_trip_push_log WHERE trip_request_id = r.id;

    BEGIN
      PERFORM net.http_post(
        url     := v_supabase_url || '/functions/v1/ag-whatsapp',
        headers := jsonb_build_object('Content-Type', 'application/json'),
        body    := jsonb_build_object(
          'to',    'admin',
          'event', 'error_alert',
          'data',  jsonb_build_object(
            'context', 'Solicitud sin ofertas tras 6 min (2 intentos)',
            'message', COALESCE(r.vehicle_type,'?') || ' · $' || r.offered_price::text || ' · ' ||
                       COALESCE(r.origin_name, 'origen desconocido') ||
                       ' · notificados en total: ' || COALESCE(v_total_notified::text, '0') ||
                       ' · abrieron el push: ' || COALESCE(v_total_opened::text, '0')
          )
        ),
        timeout_milliseconds := 5000
      );
    EXCEPTION WHEN OTHERS THEN NULL; END;

    UPDATE public.ag_trip_requests SET dispatch_alerted_at = now() WHERE id = r.id;
  END LOOP;
END;
$$;

-- ── RPC para que el cliente marque "abrí esta notificación" ────────────────────────
CREATE OR REPLACE FUNCTION public.ag_log_push_opened(p_trip_request_id uuid, p_driver_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE public.ag_trip_push_log
  SET opened_at = now()
  WHERE trip_request_id = p_trip_request_id
    AND driver_id = p_driver_id
    AND opened_at IS NULL;
END;
$$;
GRANT EXECUTE ON FUNCTION public.ag_log_push_opened(uuid, uuid) TO authenticated;

-- ── Vista para consultar de un vistazo quién vio cada solicitud ────────────────────
CREATE OR REPLACE VIEW public.ag_trip_push_visibility_v AS
SELECT
  l.trip_request_id,
  tr.origin_name, tr.dest_name, tr.vehicle_type, tr.offered_price, tr.status, tr.created_at,
  l.driver_id,
  u.full_name AS driver_name,
  l.round,
  l.sent_at,
  l.opened_at,
  (l.opened_at IS NOT NULL) AS abrio_el_push
FROM public.ag_trip_push_log l
JOIN public.ag_trip_requests tr ON tr.id = l.trip_request_id
JOIN public.ag_drivers d ON d.id = l.driver_id
JOIN public.ag_users u ON u.id = d.ag_user_id
ORDER BY l.trip_request_id, l.round, l.sent_at;
