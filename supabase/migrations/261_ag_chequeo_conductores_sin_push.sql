-- ============================================================================
-- 261 — Chequeo automático de conductores sin notificaciones activas
-- ============================================================================
--
-- POR QUÉ EXISTE ESTO
-- -------------------
-- Caso real que lo motivó (2026-09-03): el conductor ANDRES (+573145697734,
-- carro, Los Patios) se registró el 29-ago, pagó una recarga de $10.000 y
-- estuvo 4 días y medio SIN recibir una sola solicitud de viaje. La causa no
-- era el reparto: era que nunca llegó a registrarse su token FCM en
-- ag_push_subs. Sin token, las 3 ramas de ag_notify_drivers_on_trip_request
-- lo excluyen (dos exigen token, la tercera exige is_online=true).
--
-- Al auditarlo resultó que NO era un caso aislado: 8 de 45 conductores estaban
-- en la misma situación, todos con saldo $0 y 0 ofertas hechas. Gente que se
-- registró, instaló la app, y quedó invisible para el sistema sin que ni ellos
-- ni nosotros nos enteráramos.
--
-- Hay DOS formas de caer en este hueco, y las dos se cubren acá:
--
--   1. El token nunca se registró. _registerNativePush() solo corre al abrir la
--      pantalla de conductor o al togglear "En línea". Si Android niega el
--      permiso de notificaciones (o Capacitor lo deja pegado en 'denied' tras
--      una sola negación), nada lo reintenta y nada avisa.
--
--   2. El token se registró y después murió. Cuando FCM responde UNREGISTERED
--      /404, ag-send-push borra la fila de ag_push_subs (ver index.ts:184).
--      Correcto —el token ya no sirve— pero deja al conductor otra vez mudo.
--      Divan Rincon, Edinson Quintero y Jesus cayeron exactamente por acá.
--
-- QUÉ HACE
-- --------
-- Una función de diagnóstico reutilizable (ag_push_health_report) + una tabla
-- de avisos ya enviados para no repetir. La edge function ag-push-health-check
-- consume esto a diario y avisa al conductor y a la administración.
--
-- Deliberadamente NO se toca ag_notify_drivers_on_trip_request: el reparto ya
-- fue ampliado en la migración 253 y está bien. El hueco no es a quién se le
-- reparte, es que el conductor no tiene dónde recibirlo.
-- ============================================================================

-- ─── Tabla de avisos enviados ───────────────────────────────────────────────
-- Sirve para dos cosas: no volverle a escribir al mismo conductor todos los
-- días (sería spam y termina en bloqueo), y dejar rastro de qué se intentó.
CREATE TABLE IF NOT EXISTS public.ag_push_health_alerts (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id    uuid NOT NULL REFERENCES public.ag_drivers(id) ON DELETE CASCADE,
  motivo       text NOT NULL,          -- 'sin_token' | 'token_rechazado'
  canal        text NOT NULL,          -- 'sms' | 'whatsapp' | 'simulado'
  enviado_ok   boolean,                -- null = todavía no se resolvió el envío
  detalle      text,                   -- respuesta del proveedor si falló
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ag_push_health_alerts_driver
  ON public.ag_push_health_alerts (driver_id, created_at DESC);

ALTER TABLE public.ag_push_health_alerts ENABLE ROW LEVEL SECURITY;

-- Sin políticas para el rol autenticado a propósito: esto es data operativa
-- interna. La edge function entra con service_role (que salta RLS) y el panel
-- admin la lee por RPC. Un conductor no tiene por qué ver esta tabla.

COMMENT ON TABLE public.ag_push_health_alerts IS
  'Avisos enviados a conductores que quedaron sin notificaciones activas. Ver migración 261.';


-- ─── Historial de corridas ──────────────────────────────────────────────────
-- Un renglón por corrida del chequeo. Permite ver la tendencia: si el número
-- de conductores sin push sube en vez de bajar, algo se rompió en el registro
-- del token y no en los conductores.
CREATE TABLE IF NOT EXISTS public.ag_push_health_checks (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  total_drivers   integer NOT NULL,
  con_push        integer NOT NULL,
  sin_push        integer NOT NULL,
  avisados        integer NOT NULL DEFAULT 0,
  detalle         jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ag_push_health_checks ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.ag_push_health_checks IS
  'Snapshot diario del estado de notificaciones de la flota. Ver migración 261.';


-- ─── Función de diagnóstico ─────────────────────────────────────────────────
-- Devuelve el estado completo en un solo JSON. Reutilizable desde la edge
-- function del cron y desde el panel admin, para que ambos midan lo mismo y no
-- se desfasen (que fue justo el problema del informe de push corregido el
-- 2026-09-01: dos lugares contando distinto).
--
-- p_dias_max_aviso: no volver a avisar si ya se le avisó en los últimos N días.
-- p_max_avisos:     si tras N avisos el conductor no activó nada, dejar de
--                   insistir. No queremos ser la app que fastidia.
CREATE OR REPLACE FUNCTION public.ag_push_health_report(
  p_dias_max_aviso integer DEFAULT 7,
  p_max_avisos     integer DEFAULT 3
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH flota AS (
    SELECT
      d.id                                    AS driver_id,
      u.full_name                             AS nombre,
      u.phone                                 AS telefono,
      u.city                                  AS ciudad,
      COALESCE(d.vehicle_type, 'carro')       AS vehiculo,
      d.status,
      d.created_at                            AS registrado,
      d.wallet_balance                        AS saldo,
      -- ¿Tiene hoy un token FCM utilizable?
      EXISTS (
        SELECT 1 FROM public.ag_push_subs ps
        WHERE ps.user_id = u.auth_user_id
          AND ps.provider = 'fcm'
          AND ps.fcm_token IS NOT NULL
      )                                       AS tiene_push,
      -- Señal de token moribundo: el último push que se le mandó fue rechazado
      -- por FCM. Puede seguir teniendo fila en ag_push_subs pero no sirve.
      (
        SELECT l.fcm_ok FROM public.ag_trip_push_log l
        WHERE l.driver_id = d.id AND l.fcm_ok IS NOT NULL
        ORDER BY l.sent_at DESC LIMIT 1
      )                                       AS ultimo_push_ok,
      (SELECT count(*) FROM public.ag_trip_offers o WHERE o.driver_id = d.id) AS ofertas,
      -- Cuántas veces ya le avisamos, y cuándo fue la última
      (SELECT count(*) FROM public.ag_push_health_alerts a
        WHERE a.driver_id = d.id AND a.enviado_ok IS TRUE)                    AS avisos_previos,
      (SELECT max(a.created_at) FROM public.ag_push_health_alerts a
        WHERE a.driver_id = d.id AND a.enviado_ok IS TRUE)                    AS ultimo_aviso
    FROM public.ag_drivers d
    JOIN public.ag_users u ON u.id = d.ag_user_id
    WHERE COALESCE(u.is_deleted, false) = false
      AND COALESCE(u.is_blocked, false) = false
      -- Mismos estados que acepta el reparto real (ver
      -- ag_notify_drivers_on_trip_request): si el reparto lo considera, este
      -- chequeo también. Si algún día cambia allá, tiene que cambiar acá.
      AND d.status IN ('approved', 'quick', 'pending')
  ),
  afectados AS (
    SELECT *,
      CASE WHEN NOT tiene_push AND ultimo_push_ok IS FALSE THEN 'token_rechazado'
           ELSE 'sin_token' END AS motivo,
      -- Un teléfono sin +57 no sirve para mandar nada (ver la normalización a
      -- E.164 que hubo que hacer en ag_users). Se reporta igual, pero marcado.
      (telefono ~ '^\+[1-9][0-9]{7,14}$') AS telefono_valido
    FROM flota
    WHERE NOT tiene_push
  ),
  avisables AS (
    SELECT * FROM afectados
    WHERE telefono_valido
      AND avisos_previos < p_max_avisos
      AND (ultimo_aviso IS NULL OR ultimo_aviso < now() - make_interval(days => p_dias_max_aviso))
  )
  SELECT jsonb_build_object(
    'generado_en',  now(),
    'total',        (SELECT count(*) FROM flota),
    'con_push',     (SELECT count(*) FROM flota WHERE tiene_push),
    'sin_push',     (SELECT count(*) FROM afectados),
    'avisables',    (SELECT count(*) FROM avisables),
    -- Todos los afectados, para el reporte a administración
    'afectados', COALESCE((
      SELECT jsonb_agg(to_jsonb(a) ORDER BY a.registrado DESC) FROM afectados a
    ), '[]'::jsonb),
    -- Solo los que toca avisar en esta corrida
    'a_avisar', COALESCE((
      SELECT jsonb_agg(to_jsonb(v) ORDER BY v.registrado DESC) FROM avisables v
    ), '[]'::jsonb)
  );
$$;

COMMENT ON FUNCTION public.ag_push_health_report IS
  'Estado de notificaciones de la flota: quién quedó sin token FCM y a quién toca avisarle. Ver migración 261.';

GRANT EXECUTE ON FUNCTION public.ag_push_health_report(integer, integer) TO service_role;


-- ─── Registrar un aviso enviado ─────────────────────────────────────────────
-- La edge function llama a esto después de cada intento. Se registra tanto el
-- éxito como el fallo: un aviso que no salió no debe contar contra el tope de
-- p_max_avisos (por eso el filtro de arriba mira enviado_ok IS TRUE).
CREATE OR REPLACE FUNCTION public.ag_push_health_log_alert(
  p_driver_id uuid,
  p_motivo    text,
  p_canal     text,
  p_ok        boolean,
  p_detalle   text DEFAULT NULL
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.ag_push_health_alerts (driver_id, motivo, canal, enviado_ok, detalle)
  VALUES (p_driver_id, p_motivo, p_canal, p_ok, p_detalle);
$$;

GRANT EXECUTE ON FUNCTION public.ag_push_health_log_alert(uuid, text, text, boolean, text) TO service_role;
