-- 249: el informe de visibilidad de push tiene que decir la verdad
--
-- Pedido explicito del usuario 2026-09-01. El informe de la migracion 248 nacio para responder
-- "¿los conductores estan viendo las solicitudes?" y NO podia responderla:
--
--   1. "notificados" contaba a quienes se les APUNTO el envio (la fila se inserta antes de
--      mandar el push) y nunca se guardaba si FCM lo acepto. Un conductor con el token vencido
--      o la app desinstalada contaba igual que uno al que si le llego.
--   2. "abrieron el push" se marcaba TAMBIEN desde el listener pushNotificationReceived, que
--      solo dispara con la app en primer plano y SIN que el conductor toque nada -- justo el
--      caso mas comun de un conductor en linea esperando viajes. O sea que contaba como
--      "abrio" a gente que nunca vio una notificacion.
--
-- Ahora se guardan por separado las cuatro señales, que significan cosas distintas:
--   apuntados            -> a cuantos apunto el envio
--   fcm_ok = true        -> FCM/WebPush ACEPTO el envio para ese conductor
--   fcm_ok = false       -> se intento y el proveedor lo rechazo
--   fcm_ok IS NULL       -> ni siquiera habia suscripcion registrada, no se pudo intentar
--   foreground_at        -> le aparecio en pantalla con la app abierta (no toco nada)
--   tapped_at            -> TOCO la notificacion de verdad
--
-- opened_at se conserva (se sigue llenando con la primera señal de cualquier tipo) para no
-- romper nada que ya lo lea, pero el informe ya no lo usa. Las filas anteriores a esta
-- migracion tienen opened_at sin poder saber de cual de los dos casos vino: quedan con las
-- columnas nuevas en NULL a proposito, en vez de inventarles un valor.

ALTER TABLE public.ag_trip_push_log
  ADD COLUMN IF NOT EXISTS fcm_ok        boolean,
  ADD COLUMN IF NOT EXISTS foreground_at timestamptz,
  ADD COLUMN IF NOT EXISTS tapped_at     timestamptz;

-- El cliente ahora dice DE DONDE viene la señal. Se borra la version de 2 argumentos y se crea
-- una de 3 con default 'tap': asi una app vieja que todavia llame con 2 argumentos sigue
-- funcionando sin romperse. El default es 'tap' porque eso es lo que hacian 3 de los 4
-- llamadores originales; el cuarto (pushNotificationReceived, el que estaba mal) se corrige en
-- el frontend de este mismo cambio para que mande 'foreground'.
DROP FUNCTION IF EXISTS public.ag_log_push_opened(uuid, uuid);

CREATE OR REPLACE FUNCTION public.ag_log_push_opened(
  p_trip_request_id uuid,
  p_driver_id       uuid,
  p_source          text DEFAULT 'tap'
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE public.ag_trip_push_log
  SET opened_at     = COALESCE(opened_at, now()),
      foreground_at = CASE WHEN p_source = 'foreground' THEN COALESCE(foreground_at, now()) ELSE foreground_at END,
      tapped_at     = CASE WHEN p_source = 'tap'        THEN COALESCE(tapped_at, now())     ELSE tapped_at     END
  WHERE trip_request_id = p_trip_request_id
    AND driver_id = p_driver_id
    AND (
      (p_source = 'foreground' AND foreground_at IS NULL)
      OR (p_source = 'tap' AND tapped_at IS NULL)
    );
END;
$$;
GRANT EXECUTE ON FUNCTION public.ag_log_push_opened(uuid, uuid, text) TO authenticated;

-- Aviso al admin con las cuatro cifras separadas.
CREATE OR REPLACE FUNCTION public.ag_check_and_retry_dispatch()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  r               RECORD;
  v_supabase_url  TEXT;
  v_service_key   TEXT;
  v_user_ids      TEXT[];
  v_driver_ids    uuid[];
  v_origin_geog   extensions.geography;
  v_matched       integer;
  v_total_notified integer;
  v_fcm_ok         integer;
  v_fcm_fail       integer;
  v_sin_token      integer;
  v_foreground     integer;
  v_tapped         integer;
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
    SELECT count(DISTINCT driver_id),
           count(DISTINCT driver_id) FILTER (WHERE fcm_ok IS TRUE),
           count(DISTINCT driver_id) FILTER (WHERE fcm_ok IS FALSE),
           count(DISTINCT driver_id) FILTER (WHERE fcm_ok IS NULL),
           count(DISTINCT driver_id) FILTER (WHERE foreground_at IS NOT NULL),
           count(DISTINCT driver_id) FILTER (WHERE tapped_at IS NOT NULL)
    INTO v_total_notified, v_fcm_ok, v_fcm_fail, v_sin_token, v_foreground, v_tapped
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
                       ' · apuntados: '                 || COALESCE(v_total_notified::text, '0') ||
                       ' · FCM acepto: '                || COALESCE(v_fcm_ok::text, '0') ||
                       ' · rechazados: '                || COALESCE(v_fcm_fail::text, '0') ||
                       ' · sin token: '                 || COALESCE(v_sin_token::text, '0') ||
                       ' · les aparecio en pantalla: '  || COALESCE(v_foreground::text, '0') ||
                       ' · tocaron la notificacion: '   || COALESCE(v_tapped::text, '0')
          )
        ),
        timeout_milliseconds := 5000
      );
    EXCEPTION WHEN OTHERS THEN NULL; END;

    UPDATE public.ag_trip_requests SET dispatch_alerted_at = now() WHERE id = r.id;
  END LOOP;
END;
$function$
;

DROP VIEW IF EXISTS public.ag_trip_push_visibility_v;
CREATE VIEW public.ag_trip_push_visibility_v AS
SELECT
  l.trip_request_id,
  tr.origin_name, tr.dest_name, tr.vehicle_type, tr.offered_price, tr.status, tr.created_at,
  l.driver_id,
  u.full_name AS driver_name,
  l.round,
  l.sent_at,
  l.fcm_ok,
  CASE WHEN l.fcm_ok IS TRUE THEN 'FCM acepto'
       WHEN l.fcm_ok IS FALSE THEN 'rechazado por el proveedor'
       ELSE 'sin suscripcion registrada' END AS entrega,
  l.foreground_at,
  l.tapped_at,
  (l.tapped_at IS NOT NULL) AS toco_la_notificacion,
  (l.foreground_at IS NOT NULL) AS le_aparecio_en_pantalla,
  l.opened_at
FROM public.ag_trip_push_log l
JOIN public.ag_trip_requests tr ON tr.id = l.trip_request_id
JOIN public.ag_drivers d ON d.id = l.driver_id
JOIN public.ag_users u ON u.id = d.ag_user_id
ORDER BY l.trip_request_id, l.round, l.sent_at;
