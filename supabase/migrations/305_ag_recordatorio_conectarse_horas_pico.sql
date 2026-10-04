-- 305: el recordatorio diario "¿Te conectas a Movi?" pasa a las horas antes de los picos reales.
--
-- POR QUÉ (2026-10-03): la 304 lo mandaba a las 6:30 a.m. y 4:30 p.m. El usuario preguntó si
-- 6:30 no era muy temprano y la demanda de los últimos 60 días (hora Colombia) lo confirmó:
-- de 5 a 7 a.m. hubo 3 solicitudes en total, mientras que de 6 p.m. a 11 p.m. está la mitad
-- de las solicitudes y es donde más pasajeros quedan sin conductor (a las 9 p.m., 11 de 14).
-- Nuevo horario, unos 30 min antes de cada pico:
--   11:30 a.m. (antes del mediodía)  -> 16:30 UTC
--    5:30 p.m. (antes de las 6 p.m.) -> 22:30 UTC
--    8:30 p.m. (antes de 9-11 p.m.)  -> 01:30 UTC
-- Para que quepan los tres, el mínimo entre avisos al mismo conductor baja de 5 h a 2 h 30 min
-- (máximo 3 al día). El silencio de 10 p.m. a 5:30 a.m. sigue igual. Lo único que cambia en
-- la función es ese intervalo; todo lo demás es idéntico a la 304.

CREATE OR REPLACE FUNCTION public.ag_recordar_conectarse(p_motivo text DEFAULT 'diario', p_driver_ids uuid[] DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_url      text;
  v_key      text;
  v_user_ids text[];
  v_tels     text[];
  v_n        integer := 0;
  v_hora     time := (now() AT TIME ZONE 'America/Bogota')::time;
BEGIN
  IF v_hora < time '05:30' OR v_hora > time '22:00' THEN RETURN 0; END IF;

  SELECT decrypted_secret INTO v_url FROM vault.decrypted_secrets WHERE name = 'supabase_url' LIMIT 1;
  SELECT decrypted_secret INTO v_key FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1;
  IF v_url IS NULL OR v_key IS NULL THEN RETURN 0; END IF;

  WITH c AS (
    SELECT d.id, u.auth_user_id, u.phone
    FROM public.ag_drivers d
    JOIN public.ag_users u ON u.id = d.ag_user_id
    LEFT JOIN public.ag_driver_locations dl ON dl.driver_id = d.id
    WHERE d.status IN ('approved', 'quick', 'pending')
      AND d.is_online = false
      AND COALESCE(d.notify_new_requests, true) = true
      AND (p_driver_ids IS NULL OR d.id = ANY(p_driver_ids))
      -- el diario solo a quien usó la app hace poco (no a registros abandonados hace meses)
      AND (p_driver_ids IS NOT NULL OR dl.updated_at > now() - interval '14 days')
      AND (d.recordatorio_online_at IS NULL OR d.recordatorio_online_at < now() - interval '2 hours 30 minutes')
      AND NOT EXISTS (SELECT 1 FROM public.ag_trip_requests t WHERE t.driver_id = d.id AND t.status = 'accepted')
  ), marcados AS (
    UPDATE public.ag_drivers d SET recordatorio_online_at = now()
    FROM c WHERE d.id = c.id
    RETURNING c.auth_user_id, c.phone
  )
  SELECT array_agg(auth_user_id::text) FILTER (WHERE auth_user_id IS NOT NULL),
         array_agg(ltrim(phone, '+')) FILTER (WHERE phone IS NOT NULL),
         count(*)
    INTO v_user_ids, v_tels, v_n
  FROM marcados;

  IF v_n = 0 THEN RETURN 0; END IF;

  IF v_user_ids IS NOT NULL THEN
    BEGIN
      PERFORM net.http_post(
        url     := v_url || '/functions/v1/ag-send-push',
        headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_key),
        body    := jsonb_build_object(
          'user_ids', to_jsonb(v_user_ids),
          'title',    CASE WHEN p_motivo = 'desconexion' THEN '📴 Quedaste desconectado de Movi' ELSE '🚗 ¿Te conectas a Movi?' END,
          'body',     CASE WHEN p_motivo = 'desconexion'
                           THEN 'La app se cerró y ya no te llegan viajes. Toca aquí para volver a conectarte.'
                           ELSE 'Hay pasajeros pidiendo viajes. Toca aquí y quedas en línea para recibirlos.' END,
          'url',      '/anda-gana',
          'tag',      'movi-conectarse',
          'aviso',    true
        ),
        timeout_milliseconds := 10000
      );
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;

  IF v_tels IS NOT NULL THEN
    BEGIN
      PERFORM net.http_post(
        url     := v_url || '/functions/v1/ag-whatsapp',
        headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_key),
        body    := jsonb_build_object('_internal_event', 'recordatorio_conectarse', 'motivo', p_motivo, 'telefonos', to_jsonb(v_tels)),
        timeout_milliseconds := 15000
      );
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;

  RETURN v_n;
END;
$$;

REVOKE ALL ON FUNCTION public.ag_recordar_conectarse(text, uuid[]) FROM PUBLIC, anon, authenticated;

SELECT cron.unschedule(jobid) FROM cron.job
 WHERE jobname IN ('movi-recordar-conectarse-manana', 'movi-recordar-conectarse-tarde',
                   'movi-recordar-conectarse-mediodia', 'movi-recordar-conectarse-noche');
SELECT cron.schedule('movi-recordar-conectarse-mediodia', '30 16 * * *', $c$SELECT public.ag_recordar_conectarse('diario');$c$);
SELECT cron.schedule('movi-recordar-conectarse-tarde',    '30 22 * * *', $c$SELECT public.ag_recordar_conectarse('diario');$c$);
SELECT cron.schedule('movi-recordar-conectarse-noche',    '30 1 * * *',  $c$SELECT public.ag_recordar_conectarse('diario');$c$);
