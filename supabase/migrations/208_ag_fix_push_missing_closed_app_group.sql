-- Migration 208: restaurar el grupo de "conductor con app cerrada" en el push de
-- nueva solicitud, perdido en un hotfix aplicado en caliente (2026-07-30, cambios de
-- formato de notificacion con RemoteViews/marca) que reemplazo la funcion completa
-- sin conservar el UNION de la migracion 163 ("ag_push_offline_drivers").
--
-- Bug real reportado por el usuario: los conductores con la app COMPLETAMENTE
-- cerrada dejaron de recibir push de nuevas solicitudes -- no es especifico de
-- WhatsApp, afecta a cualquier solicitud nueva (WhatsApp o app nativa), porque el
-- trigger de INSERT en ag_trip_requests solo evaluaba conductores con is_online=true
-- Y gps actualizado en los ultimos 10 min. Con la app cerrada, is_online queda en
-- false (ver memoria movi_push_fullscreen_modal) y el gps deja de actualizarse --
-- esos conductores nunca entraban al SELECT.
--
-- Se restaura el Grupo 2 (conductores con token FCM valido, sin exigir is_online,
-- con ventana de gps mas amplia de 4h) EXACTO como ya lo tiene la funcion hermana
-- de cancelacion (migracion 181, ag_notify_drivers_trip_no_longer_available) --
-- ambas funciones deben notificar al mismo conjunto de conductores. Se conserva
-- intacto el resto de la funcion vigente en produccion (formato de payload con
-- trip_id/price/dist/origin/dest para el diseño de notificacion con marca, filtro
-- de vehicle_type que tambien acepta domicilio/fletes/ciudad para cualquier tipo
-- de vehiculo).

CREATE OR REPLACE FUNCTION public.ag_notify_drivers_on_trip_request()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_supabase_url TEXT;
  v_service_key  TEXT;
  v_user_ids     TEXT[];
  v_price_fmt    TEXT;
  v_payload      jsonb;
BEGIN
  IF NEW.status <> 'searching' THEN RETURN NEW; END IF;

  SELECT decrypted_secret INTO v_supabase_url FROM vault.decrypted_secrets WHERE name = 'supabase_url' LIMIT 1;
  SELECT decrypted_secret INTO v_service_key  FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1;
  IF v_supabase_url IS NULL OR v_service_key IS NULL THEN RETURN NEW; END IF;

  v_price_fmt := '$' || to_char(NEW.offered_price, 'FM999G999G999');

  SELECT ARRAY_AGG(DISTINCT uid) INTO v_user_ids FROM (

    -- Grupo 1: conductores con app abierta (is_online=true, gps reciente)
    SELECT u.auth_user_id::text AS uid
    FROM public.ag_drivers d
    JOIN public.ag_driver_locations dl ON dl.driver_id = d.id
    JOIN public.ag_users u ON u.id = d.ag_user_id
    WHERE d.is_online = true
      AND d.status IN ('approved', 'quick')
      AND (d.vehicle_type = NEW.vehicle_type
           OR NEW.vehicle_type IN ('domicilio','fletes','ciudad'))
      AND COALESCE(d.notify_new_requests, true) = true
      AND dl.updated_at > NOW() - INTERVAL '10 minutes'
      AND (
        6371 * acos(
          LEAST(1.0,
            cos(radians(NEW.origin_lat)) * cos(radians(dl.lat))
            * cos(radians(dl.lng) - radians(NEW.origin_lng))
            + sin(radians(NEW.origin_lat)) * sin(radians(dl.lat))
          )
        )
      ) <= 20

    UNION

    -- Grupo 2: conductores con token FCM valido aunque la app este cerrada
    -- (is_online puede estar en false, se usa el ultimo gps conocido hasta 4h).
    SELECT u.auth_user_id::text AS uid
    FROM public.ag_drivers d
    JOIN public.ag_driver_locations dl ON dl.driver_id = d.id
    JOIN public.ag_users u ON u.id = d.ag_user_id
    JOIN public.ag_push_subs ps
      ON ps.user_id = u.auth_user_id
      AND ps.provider = 'fcm'
      AND ps.fcm_token IS NOT NULL
    WHERE d.status IN ('approved', 'quick')
      AND (d.vehicle_type = NEW.vehicle_type
           OR NEW.vehicle_type IN ('domicilio','fletes','ciudad'))
      AND COALESCE(d.notify_new_requests, true) = true
      AND dl.updated_at > NOW() - INTERVAL '4 hours'
      AND (
        6371 * acos(
          LEAST(1.0,
            cos(radians(NEW.origin_lat)) * cos(radians(dl.lat))
            * cos(radians(dl.lng) - radians(NEW.origin_lng))
            + sin(radians(NEW.origin_lat)) * sin(radians(dl.lat))
          )
        )
      ) <= 20

  ) sub;

  IF v_user_ids IS NULL OR array_length(v_user_ids, 1) = 0 THEN
    RETURN NEW;
  END IF;

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
