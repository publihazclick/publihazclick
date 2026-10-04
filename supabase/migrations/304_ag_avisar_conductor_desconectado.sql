-- 304: avisar al conductor desconectado para que vuelva a ponerse en línea con un toque.
--
-- POR QUÉ (2026-10-03): ese día, a las 11 p.m., de 98 conductores habilitados solo 1 estaba "en
-- línea", y 39 desconectados habían usado la app en los últimos 7 días. Al ABRIR la app el
-- conductor queda en línea solo (_initDriverHome); el problema es que la app se cierra (Android,
-- el fabricante, un reinicio) y nadie le avisa. Pedido del usuario: "evitar que los conductores
-- estén fuera de línea".
--
-- ag_recordar_conectarse(motivo, driver_ids):
--   'desconexion' -> lo llama ag_cleanup_stale_online_drivers con los que acaba de pasar a
--                    desconectados porque la app dejó de dar señal (30 min).
--   'diario'      -> cron 6:30 a.m. y 4:30 p.m. (Colombia) para los desconectados que usaron la
--                    app en los últimos 14 días.
-- Manda un push de tipo "aviso" (notificación común, sin pantalla completa; la muestra la APK
-- 1.4.32+ aunque la app esté cerrada) y un WhatsApp gratis a los que tienen la ventana de 24 h.
-- Cuidados: nada de 10 p.m. a 5:30 a.m.; máximo uno cada 5 h por conductor
-- (ag_drivers.recordatorio_online_at); nunca a quien está en línea o tiene un viaje en curso;
-- respeta notify_new_requests y el "NO MÁS" del WhatsApp. NO desconecta a nadie: solo avisa
-- (regla: el conductor es el único que decide desconectarse).

ALTER TABLE public.ag_drivers
  ADD COLUMN IF NOT EXISTS recordatorio_online_at timestamptz;

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
      AND (d.recordatorio_online_at IS NULL OR d.recordatorio_online_at < now() - interval '5 hours')
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

-- La limpieza de cada 10 min: igual que en producción, más el aviso a los que corrige.
CREATE OR REPLACE FUNCTION public.ag_cleanup_stale_online_drivers()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_threshold interval := interval '30 minutes';
  v_bajados   uuid[];
BEGIN
  -- Cerrar la sesión abierta con el último momento real en que se supo del conductor
  -- (su último GPS), no con "ahora" -- así total_seconds refleja el tiempo real online.
  --
  -- OJO: la condición NO exige d.is_online = true. startGpsTracking() tiene manejadores de
  -- error (permiso de GPS denegado / perdido) que apagan is_online directo con
  -- setDriverOnline(false) SIN llamar a endOnlineSession() -- eso deja exactamente la misma
  -- sesión huérfana pero con is_online YA en false, así que exigir is_online=true aquí
  -- (como en el primer intento de esta migración) las dejaba pasar de largo. Se cierra
  -- cualquier sesión abierta cuyo conductor esté realmente inalcanzable, sin importar por
  -- cuál camino quedó así.
  UPDATE public.ag_online_sessions s
  SET ended_at = LEAST(COALESCE(dl.updated_at, s.started_at), now()),
      total_seconds = GREATEST(0, EXTRACT(EPOCH FROM (LEAST(COALESCE(dl.updated_at, s.started_at), now()) - s.started_at))::int)
  FROM public.ag_drivers d
  LEFT JOIN public.ag_driver_locations dl ON dl.driver_id = d.id
  WHERE s.driver_id = d.id
    AND s.ended_at IS NULL
    AND (d.is_online = false OR dl.updated_at IS NULL OR dl.updated_at < now() - v_threshold);

  -- Desde la migración 304 se recoge a QUIÉNES se corrigió (la app se les cerró y dejaron de dar
  -- señal) para avisarles que quedaron desconectados -- ver ag_recordar_conectarse.
  WITH bajados AS (
    UPDATE public.ag_drivers d
    SET is_online = false
    WHERE d.is_online = true
      AND NOT EXISTS (
        SELECT 1 FROM public.ag_driver_locations dl
        WHERE dl.driver_id = d.id AND dl.updated_at > now() - v_threshold
      )
    RETURNING d.id
  )
  SELECT array_agg(id) INTO v_bajados FROM bajados;

  IF v_bajados IS NOT NULL THEN
    BEGIN
      PERFORM public.ag_recordar_conectarse('desconexion', v_bajados);
    EXCEPTION WHEN OTHERS THEN
      NULL;   -- el aviso nunca puede romper la corrección del dato
    END;
  END IF;
END;
$function$;

-- Recordatorio diario: 6:30 a.m. y 4:30 p.m. hora Colombia (UTC-5) = 11:30 y 21:30 UTC.
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname IN ('movi-recordar-conectarse-manana', 'movi-recordar-conectarse-tarde');
SELECT cron.schedule('movi-recordar-conectarse-manana', '30 11 * * *', $c$SELECT public.ag_recordar_conectarse('diario');$c$);
SELECT cron.schedule('movi-recordar-conectarse-tarde',  '30 21 * * *', $c$SELECT public.ag_recordar_conectarse('diario');$c$);
