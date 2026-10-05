-- 316 (2026-10-05): la solicitud de viaje le vuelve a SONAR al conductor cada 30 s, hasta 5 veces.
--
-- Pedido del usuario: "que no les suene una sola vez sino varias veces cada x tiempo mientras la
-- solicitud de viaje esté activa". Decisión del usuario: cada 30 s, máximo 5 repeticiones (~2,5 min).
--
-- NO necesita APK nueva: MoviFirebaseMessagingService.showFullScreenTripNotification publica la
-- notificación con id = tripId.hashCode() y SIN setOnlyAlertOnce, así que cada push del mismo viaje
-- actualiza la MISMA notificación (no se amontonan) y Android vuelve a sonar y vibrar.
--
-- A quién le vuelve a sonar: solo a los conductores del reparto original (ronda 0 de
-- ag_trip_push_log) que todavía NO la vieron. Se excluye a quien:
--   - ya la abrió, la tocó o le apareció en pantalla (opened_at / tapped_at / foreground_at),
--   - ya la vio en la app (ag_driver_metric_events 'offer_seen'),
--   - ya ofertó (ag_trip_offers),
--   - apagó los avisos de solicitudes (notify_new_requests = false),
--   - está haciendo otro viaje (ag_trip_requests status 'accepted' con su driver_id).
-- Para cuando la solicitud deja de estar en 'searching' (la tomó alguien o se canceló) no se
-- repite más, y ag_notify_drivers_trip_no_longer_available ya quita la notificación.
-- El aviso por WhatsApp a conductores NO se repite (ver alertaSolicitudConductores).
-- El reintento de los 3 minutos (ag_check_and_retry_dispatch, ronda 1) sigue igual.
--
-- En ag_trip_push_log las repeticiones quedan como ronda 11..15 (11 = primera repetición), para
-- no confundirlas con la ronda 0 (reparto original) ni la 1 (reintento de los 3 minutos).

ALTER TABLE public.ag_trip_requests
  ADD COLUMN IF NOT EXISTS sonidos_repetidos integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ultimo_sonido_at timestamptz;

CREATE OR REPLACE FUNCTION public.ag_repetir_sonido_solicitudes()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  r             record;
  v_url         text;
  v_key         text;
  v_user_ids    text[];
  v_driver_ids  uuid[];
  v_price_fmt   text;
  v_enviadas    integer := 0;
BEGIN
  SELECT decrypted_secret INTO v_url FROM vault.decrypted_secrets WHERE name = 'supabase_url' LIMIT 1;
  SELECT decrypted_secret INTO v_key FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1;
  IF v_url IS NULL OR v_key IS NULL THEN RETURN 0; END IF;

  FOR r IN
    SELECT tr.*
    FROM public.ag_trip_requests tr
    WHERE tr.status = 'searching'
      AND tr.sonidos_repetidos < 5
      -- Tope de seguridad: nunca repetir una solicitud vieja (p. ej. una "Seguir buscando").
      AND tr.created_at > now() - interval '4 minutes'
      -- 25 s y no 30: el cron corre cada 30 s y así no se salta una vuelta por milisegundos.
      AND coalesce(tr.ultimo_sonido_at, tr.created_at) <= now() - interval '25 seconds'
    FOR UPDATE SKIP LOCKED
  LOOP
    SELECT array_agg(DISTINCT u.auth_user_id::text), array_agg(DISTINCT d.id)
      INTO v_user_ids, v_driver_ids
    FROM public.ag_trip_push_log l
    JOIN public.ag_drivers d ON d.id = l.driver_id
    JOIN public.ag_users u   ON u.id = d.ag_user_id
    WHERE l.trip_request_id = r.id
      AND l.round = 0
      AND coalesce(d.notify_new_requests, true) = true
      AND NOT EXISTS (
        SELECT 1 FROM public.ag_trip_push_log v
        WHERE v.trip_request_id = r.id AND v.driver_id = d.id
          AND (v.opened_at IS NOT NULL OR v.tapped_at IS NOT NULL OR v.foreground_at IS NOT NULL))
      AND NOT EXISTS (
        SELECT 1 FROM public.ag_driver_metric_events e
        WHERE e.trip_id = r.id AND e.driver_id = d.id AND e.event_type = 'offer_seen')
      AND NOT EXISTS (
        SELECT 1 FROM public.ag_trip_offers o
        WHERE o.trip_request_id = r.id AND o.driver_id = d.id)
      AND NOT EXISTS (
        SELECT 1 FROM public.ag_trip_requests t
        WHERE t.driver_id = d.id AND t.status = 'accepted');

    -- Se cuenta la vuelta aunque no quede nadie a quien sonarle: así el tope de 5 se respeta igual.
    UPDATE public.ag_trip_requests
       SET sonidos_repetidos = sonidos_repetidos + 1, ultimo_sonido_at = now()
     WHERE id = r.id;

    IF v_user_ids IS NULL OR array_length(v_user_ids, 1) IS NULL THEN CONTINUE; END IF;

    BEGIN
      INSERT INTO public.ag_trip_push_log (trip_request_id, driver_id, round)
      SELECT r.id, did, 11 + r.sonidos_repetidos FROM unnest(v_driver_ids) AS did;
    EXCEPTION WHEN OTHERS THEN NULL; END;

    -- Mismo contenido que el aviso original (ag_notify_drivers_on_trip_request): para el conductor
    -- es la misma solicitud sonando otra vez, no un aviso distinto.
    v_price_fmt := '$' || to_char(r.offered_price, 'FM999G999G999');
    BEGIN
      PERFORM net.http_post(
        url     := v_url || '/functions/v1/ag-send-push',
        headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_key),
        body    := jsonb_build_object(
          'user_ids', v_user_ids,
          'title',    'Nueva solicitud · ' || v_price_fmt,
          'body',     COALESCE(r.origin_name, 'Origen sin nombre') || ' → ' || r.dest_name
                      || E'\n' || v_price_fmt || ' · ' || round(r.distance_km::numeric, 1) || ' km',
          'url',      '/anda-gana?trip_request_id=' || r.id::text,
          'tag',      'trip-' || r.id::text,
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

    v_enviadas := v_enviadas + 1;
  END LOOP;

  RETURN v_enviadas;
END;
$$;

REVOKE ALL ON FUNCTION public.ag_repetir_sonido_solicitudes() FROM PUBLIC, anon, authenticated;

-- Cada 30 segundos (pg_cron 1.6 acepta intervalos en segundos).
SELECT cron.unschedule('movi-repetir-sonido-solicitudes')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'movi-repetir-sonido-solicitudes');
SELECT cron.schedule('movi-repetir-sonido-solicitudes', '30 seconds', 'SELECT public.ag_repetir_sonido_solicitudes();');
