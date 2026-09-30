-- ============================================================================
-- Migración 286: guardar los acuses de entrega de WhatsApp (2026-09-30).
--
-- ── LA PREGUNTA QUE NO SE PODÍA RESPONDER ──────────────────────────────────
-- El usuario preguntó algo elemental: "lo que respondí desde la bandeja, ¿les
-- llegó a su WhatsApp o no?". Y la respuesta honesta era: NO SE SABE.
--
-- `ag_wa_message_log` guarda una fila cada vez que se le PIDE a Meta que mande un
-- mensaje, sin mirar si Meta lo aceptó y sin saber nunca si se entregó. Meta manda
-- al mismo webhook un aviso por cada mensaje saliente (`sent` -> `delivered` ->
-- `read`, o `failed` con el motivo), y el código los ignoraba por completo: solo
-- procesaba `value.messages` (entrantes) y dejaba caer `value.statuses`.
--
-- O sea que hasta hoy "está en el log" significaba únicamente "se lo pedimos a
-- Meta", no "le llegó". Eso ya había engañado antes: el bug del 2026-09-02 con la
-- plantilla trip_error_alert se marcaba como enviado aunque Meta lo rechazara, y
-- se arregló a medias poniéndole "[NO ENTREGADO 400]" al texto del log -- pero solo
-- en sendTemplate, no en los mensajes normales ni en los del número de soporte.
--
-- ── LO QUE SÍ SE PUDO COMPROBAR SIN ESTO ───────────────────────────────────
-- Las 13 respuestas que el admin mandó desde la bandeja salieron todas DENTRO de la
-- ventana de 24h (entre 0,5 y 3,8 horas después del último mensaje de cada persona),
-- así que no aplica el modo de falla silencioso de Meta. Es evidencia fuerte, pero
-- no es prueba de entrega. La prueba es el acuse, y el acuse no se guardaba.
--
-- Los acuses de esos 13 mensajes ya llegaron al webhook y se descartaron: ese pasado
-- es irrecuperable. De acá en adelante queda registrado.
-- ============================================================================

ALTER TABLE public.ag_wa_message_log
  ADD COLUMN IF NOT EXISTS wamid          TEXT,
  ADD COLUMN IF NOT EXISTS estado_entrega TEXT,
  ADD COLUMN IF NOT EXISTS entregado_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS leido_at       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS error_meta     TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ag_wa_message_log_estado_entrega_check'
  ) THEN
    ALTER TABLE public.ag_wa_message_log
      ADD CONSTRAINT ag_wa_message_log_estado_entrega_check
      CHECK (estado_entrega IS NULL
             OR estado_entrega IN ('aceptado','enviado','entregado','leido','fallido'));
  END IF;
END $$;

COMMENT ON COLUMN public.ag_wa_message_log.wamid IS
  'ID que devuelve Meta al aceptar el mensaje. Es lo que permite casar el acuse de entrega con la fila. Migracion 286.';
COMMENT ON COLUMN public.ag_wa_message_log.estado_entrega IS
  'aceptado (Meta lo recibio), enviado, entregado, leido, fallido. NULL en los entrantes y en lo guardado antes de la migracion 286.';
COMMENT ON COLUMN public.ag_wa_message_log.error_meta IS
  'Motivo que da Meta cuando el estado es fallido. Migracion 286.';

-- El acuse llega por wamid, así que es la búsqueda caliente de este flujo.
CREATE INDEX IF NOT EXISTS idx_ag_wa_message_log_wamid
  ON public.ag_wa_message_log (wamid) WHERE wamid IS NOT NULL;


-- ─── Aplicar un acuse de Meta ───────────────────────────────────────────────
-- Los acuses NO llegan en orden garantizado y se repiten: Meta puede mandar
-- 'delivered' después de 'read', o el mismo dos veces. Por eso se usa una jerarquía
-- y nunca se retrocede -- si ya está en 'leido', un 'delivered' que llega tarde no
-- lo baja. 'fallido' sí pisa cualquier cosa: es la única señal que importa de
-- verdad y no puede quedar tapada por un 'sent' anterior.
CREATE OR REPLACE FUNCTION public.ag_wa_aplicar_acuse(
  p_wamid  text,
  p_estado text,
  p_ts     timestamptz DEFAULT NOW(),
  p_error  text        DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_rango CONSTANT jsonb := '{"aceptado":1,"enviado":2,"entregado":3,"leido":4}'::jsonb;
  v_actual text;
  v_ok     boolean := false;
BEGIN
  IF p_wamid IS NULL OR p_estado IS NULL THEN RETURN false; END IF;

  SELECT estado_entrega INTO v_actual
  FROM ag_wa_message_log WHERE wamid = p_wamid LIMIT 1;

  IF v_actual IS NULL AND NOT EXISTS (SELECT 1 FROM ag_wa_message_log WHERE wamid = p_wamid) THEN
    -- Acuse de un mensaje que no tenemos registrado (por ejemplo uno mandado antes
    -- de esta migración). No es un error: simplemente no hay nada que actualizar.
    RETURN false;
  END IF;

  IF p_estado = 'fallido' THEN
    UPDATE ag_wa_message_log
       SET estado_entrega = 'fallido', error_meta = p_error
     WHERE wamid = p_wamid;
    RETURN true;
  END IF;

  IF v_actual = 'fallido' THEN RETURN false; END IF;

  IF v_actual IS NOT NULL
     AND COALESCE((v_rango ->> p_estado)::int, 0) <= COALESCE((v_rango ->> v_actual)::int, 0) THEN
    RETURN false;  -- acuse viejo o repetido
  END IF;

  UPDATE ag_wa_message_log
     SET estado_entrega = p_estado,
         entregado_at   = CASE WHEN p_estado IN ('entregado','leido') THEN COALESCE(entregado_at, p_ts) ELSE entregado_at END,
         leido_at       = CASE WHEN p_estado = 'leido' THEN COALESCE(leido_at, p_ts) ELSE leido_at END
   WHERE wamid = p_wamid;

  v_ok := true;
  RETURN v_ok;
END;
$function$;

COMMENT ON FUNCTION public.ag_wa_aplicar_acuse(text, text, timestamptz, text) IS
  'Aplica un acuse de entrega de Meta sobre ag_wa_message_log, sin retroceder de estado y sin dejar que un acuse tardio tape un fallo. Migracion 286.';

GRANT EXECUTE ON FUNCTION public.ag_wa_aplicar_acuse(text, text, timestamptz, text) TO service_role;


-- ─── El hilo del panel ahora dice si llegó ──────────────────────────────────
-- Se agregan las columnas nuevas al final para no romper nada de lo que ya lee la
-- bandeja. NULL en estado_entrega significa "no se sabe" (mensajes de antes de esta
-- migración), y la pantalla tiene que decir eso y no inventarse un ✓.
--
-- DROP + CREATE obligatorio, no CREATE OR REPLACE: cambia el tipo de retorno y
-- Postgres lo rechaza con 42P13 ("cannot change return type of existing function").
-- Es la misma piedra de las migraciones 266 y 280 -- y como el endpoint de consulta
-- corre todo el archivo como una sola transacción, el error tumbó también el ALTER
-- TABLE de arriba y no quedó aplicado nada.
DROP FUNCTION IF EXISTS public.ag_wa_thread(text, integer);

CREATE FUNCTION public.ag_wa_thread(p_phone text, p_limit integer DEFAULT 500)
RETURNS TABLE(
  direction      text,
  msg_type       text,
  body           text,
  created_at     timestamptz,
  sent_by        text,
  sent_by_name   text,
  estado_entrega text,
  entregado_at   timestamptz,
  leido_at       timestamptz,
  error_meta     text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT t.direction, t.msg_type, t.body, t.created_at, t.sent_by, t.sent_by_name,
         t.estado_entrega, t.entregado_at, t.leido_at, t.error_meta
  FROM (
    SELECT l.id, l.direction, l.msg_type, l.body, l.created_at, l.sent_by, l.sent_by_name,
           l.estado_entrega, l.entregado_at, l.leido_at, l.error_meta
    FROM ag_wa_message_log l
    WHERE ag_wa_norm_phone(l.wa_phone) = ag_wa_norm_phone(p_phone)
      AND COALESCE(l.sent_by, '') <> 'alerta'
    ORDER BY l.created_at DESC, l.id DESC
    LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 500), 2000))
  ) t
  ORDER BY t.created_at ASC, t.id ASC;
$function$;

GRANT EXECUTE ON FUNCTION public.ag_wa_thread(text, integer) TO service_role;


-- ─── Vigilancia: mensajes que Meta rechazó o nunca entregó ──────────────────
-- Sirve para lo que hoy no se puede ver de ninguna forma: cuántas de nuestras
-- respuestas no llegaron. Se deja como vista para poder consultarla sin desplegar
-- nada, y para colgarle un aviso automático más adelante si hace falta.
CREATE OR REPLACE VIEW public.ag_wa_entregas_v AS
  SELECT
    (created_at AT TIME ZONE 'America/Bogota')::date          AS dia,
    role,
    COALESCE(sent_by, 'desconocido')                          AS quien,
    COUNT(*)                                                  AS salientes,
    COUNT(*) FILTER (WHERE estado_entrega IS NULL)            AS sin_acuse,
    COUNT(*) FILTER (WHERE estado_entrega = 'aceptado')        AS solo_aceptado,
    COUNT(*) FILTER (WHERE estado_entrega = 'enviado')         AS enviados,
    COUNT(*) FILTER (WHERE estado_entrega = 'entregado')       AS entregados,
    COUNT(*) FILTER (WHERE estado_entrega = 'leido')           AS leidos,
    COUNT(*) FILTER (WHERE estado_entrega = 'fallido')         AS fallidos
  FROM public.ag_wa_message_log
  WHERE direction = 'out'
  GROUP BY 1, 2, 3
  ORDER BY 1 DESC, 2, 3;

COMMENT ON VIEW public.ag_wa_entregas_v IS
  'Cuantos mensajes salientes se entregaron, se leyeron o fallaron, por dia / canal / autor. Migracion 286.';

GRANT SELECT ON public.ag_wa_entregas_v TO service_role;
