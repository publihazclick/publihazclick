-- Migration 246: limpiar sesiones "en línea" huérfanas (2026-09-01)
--
-- Contexto: al auditar is_online se encontró que la mayoría de los conductores marcados
-- is_online=true tienen GPS de horas o DÍAS de antigüedad -- sesiones abandonadas porque
-- la app se cerró de golpe (crash, sin red, el usuario mató el proceso) sin pasar por
-- setDriverOnline(false)/endOnlineSession(). No afecta el matching de solicitudes ni el
-- precio dinámico (ambos ya exigen GPS reciente además de is_online=true), pero sí corrompe
-- dos cosas:
--   1. ag_drivers.is_online queda mintiendo indefinidamente (cualquier conteo futuro de
--      "conductores en línea" que no filtre por GPS lo hereda).
--   2. ag_online_sessions se queda con started_at de hace días y ended_at NULL -- si el
--      conductor consulta "horas en línea hoy" (getTodayOnlineSeconds en el frontend) sin
--      haber reabierto la app, ve un número absurdo (se vio un caso real: 206.5 horas).
--      Y si vuelve a abrir la app, startOnlineSession() sí cierra esa fila vieja, pero sin
--      calcular total_seconds (queda NULL para siempre) -- se pierde el dato real.
--
-- Umbral: 30 minutos sin GPS. Es mayor que el latido de ubicación (3 min, ver commit
-- 258c702) y que la ventana de 10 min que usa el matching -- deja margen de sobra para
-- cortes de red temporales sin desconectar a un conductor real por accidente.

CREATE OR REPLACE FUNCTION public.ag_cleanup_stale_online_drivers()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_threshold interval := interval '30 minutes';
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

  UPDATE public.ag_drivers d
  SET is_online = false
  WHERE d.is_online = true
    AND NOT EXISTS (
      SELECT 1 FROM public.ag_driver_locations dl
      WHERE dl.driver_id = d.id AND dl.updated_at > now() - v_threshold
    );
END;
$$;

SELECT cron.schedule(
  'movi-cleanup-stale-online-drivers',
  '*/10 * * * *',
  'SELECT public.ag_cleanup_stale_online_drivers();'
);

-- Correr una vez de inmediato para corregir el estado actual (no solo hacia adelante).
SELECT public.ag_cleanup_stale_online_drivers();
