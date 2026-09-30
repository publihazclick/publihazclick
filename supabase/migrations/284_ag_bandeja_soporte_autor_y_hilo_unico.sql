-- ============================================================================
-- Migración 284: la bandeja de soporte tiene que mostrar QUIÉN contestó y
-- juntar en un solo hilo lo que el admin responde a mano (2026-09-29).
--
-- ── BUG REAL (el que provocó el pedido) ────────────────────────────────────
-- Cuando el admin responde desde el panel, el mensaje SÍ sale y SÍ llega, pero
-- se guardaba bajo OTRO wa_phone que el resto de la conversación:
--
--   ag-whatsapp, rama de envío manual:  sendText(toE164(targetPhone), ...)
--       toE164('573132326337') -> '+573132326337'   <- así se guardaba la respuesta
--   webhook de Meta (todo lo entrante):  logWaMessage(fromPhone, ...)
--       Meta manda el número SIN '+' -> '573132326337'  <- así está el resto del hilo
--
-- Como `ag_wa_conversations_summary` agrupa por `wa_phone` en crudo, la respuesta
-- del admin abría una CONVERSACIÓN FANTASMA de un solo mensaje, y dentro del hilo
-- real no aparecía nunca. Desde el panel se veía como si no hubiera respondido.
--
-- Medido en producción antes del arreglo: 384 salientes guardados con '+' sobre
-- 9 números, y CERO entrantes con '+' (es decir, los 9 son hilos de un solo lado).
-- La prueba de que hacía daño de verdad: el 2026-09-30 a las 04:01-04:02 UTC el
-- mismo saludo de asesora salió CUATRO veces al mismo conductor (+573132326337,
-- ids 2415-2418, en 80 segundos) -- se reenvió porque el panel no lo mostraba.
--
-- ── ARREGLO ────────────────────────────────────────────────────────────────
-- Se normaliza al LEER, no se reescribe el histórico: así nada se pierde y volver
-- atrás es cambiar estas funciones, no recuperar datos. `ag-whatsapp` además
-- normaliza al escribir de ahora en adelante, para que el desfase no siga creciendo.
--
-- ── QUIÉN CONTESTÓ ─────────────────────────────────────────────────────────
-- `ag_wa_message_log` solo guardaba `direction`: todo lo saliente se veía igual,
-- sin forma de saber si lo contestó la automatización de la API de Meta o una
-- persona escribiendo en el panel. Se agrega `sent_by`:
--   'bot'     -> lo respondió la automatización (flujo de viajes o FAQ con IA)
--   'admin'   -> lo escribió una persona a mano desde la bandeja del panel
--   'sistema' -> aviso automático de un evento (viaje aceptado, conductor llegó...)
--   'alerta'  -> aviso interno al número del admin; NO es una conversación con un
--                cliente, así que queda fuera de la bandeja
-- ============================================================================

ALTER TABLE public.ag_wa_message_log
  ADD COLUMN IF NOT EXISTS sent_by      TEXT,
  ADD COLUMN IF NOT EXISTS sent_by_name TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ag_wa_message_log_sent_by_check'
  ) THEN
    ALTER TABLE public.ag_wa_message_log
      ADD CONSTRAINT ag_wa_message_log_sent_by_check
      CHECK (sent_by IS NULL OR sent_by IN ('bot', 'admin', 'sistema', 'alerta'));
  END IF;
END $$;

COMMENT ON COLUMN public.ag_wa_message_log.sent_by IS
  'Quien produjo el mensaje saliente: bot (automatizacion), admin (persona en el panel), sistema (aviso de evento), alerta (aviso interno al admin). NULL en los entrantes. Migracion 284.';
COMMENT ON COLUMN public.ag_wa_message_log.sent_by_name IS
  'Nombre de la persona que escribio, solo cuando sent_by = admin. Migracion 284.';


-- ─── Relleno del histórico ──────────────────────────────────────────────────
-- No es una adivinanza: antes de esta migración había exactamente dos caminos de
-- salida, y cada uno dejaba el teléfono en un formato distinto.
--   · sin '+'  -> salió respondiendo al webhook de Meta = automatización ('bot')
--   · con '+'  -> pasó por la rama de envío manual de ag-whatsapp, que es la que
--                 usan el panel admin, los avisos de evento de la app y los avisos
--                 internos al número del admin.
-- Dentro de los de '+' se separan por destino y por marca del texto:
--   · al número del admin (573134453649)  -> 'alerta'
--   · con la marca '*Movi*'               -> 'sistema' (plantilla de evento)
--   · el resto                            -> 'admin'  (texto escrito a mano)
-- Verificado fila por fila sobre los 384 salientes con '+': quedan 7 como 'admin'
-- (id 1463, "Quedo atento a cualquier inquietud" del 09-07, e ids 2415-2420, el
-- saludo de asesora del 09-29 a tres conductores).
UPDATE public.ag_wa_message_log
   SET sent_by = CASE
         WHEN left(wa_phone, 1) <> '+'               THEN 'bot'
         WHEN ltrim(wa_phone, '+') = '573134453649'  THEN 'alerta'
         WHEN body LIKE '%*Movi*%'                   THEN 'sistema'
         ELSE 'admin'
       END
 WHERE direction = 'out' AND sent_by IS NULL;


-- ─── Teléfono normalizado ───────────────────────────────────────────────────
-- Un BSUID ("CO.1025109683878541", ver isBsuid() en ag-whatsapp) no empieza por
-- '+' y sale intacto, que es justo lo que se necesita.
CREATE OR REPLACE FUNCTION public.ag_wa_norm_phone(p_phone text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $function$ SELECT ltrim(COALESCE(p_phone, ''), '+') $function$;

COMMENT ON FUNCTION public.ag_wa_norm_phone(text) IS
  'Telefono de WhatsApp sin el + inicial, para que la respuesta del admin y el resto del hilo caigan en la misma conversacion. Migracion 284.';

CREATE INDEX IF NOT EXISTS idx_ag_wa_message_log_norm_phone
  ON public.ag_wa_message_log (public.ag_wa_norm_phone(wa_phone), created_at DESC);


-- ─── Resumen de conversaciones (v4) ─────────────────────────────────────────
-- Cambios sobre la 280: agrupa por teléfono normalizado, deja fuera los avisos
-- internos al admin, y devuelve con qué se cerró el hilo y cuánto puso cada uno.
-- DROP + CREATE obligatorio: cambia el tipo de retorno.
DROP FUNCTION IF EXISTS public.ag_wa_conversations_summary(text);

CREATE FUNCTION public.ag_wa_conversations_summary(p_role text)
RETURNS TABLE(
  wa_phone      text,
  last_body     text,
  last_dir      text,
  last_type     text,
  last_at       timestamptz,
  msg_count     bigint,
  last_in_at    timestamptz,
  last_sent_by  text,
  sin_responder boolean,
  admin_count   bigint,
  bot_count     bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH base AS (
    SELECT
      ag_wa_norm_phone(l.wa_phone) AS ph,
      l.id, l.direction, l.msg_type, l.body, l.created_at, l.sent_by
    FROM ag_wa_message_log l
    WHERE l.role = p_role
      -- Los avisos internos al número del admin no son una conversación con un
      -- cliente: eran 367 mensajes (el hilo más largo de toda la bandeja) tapando
      -- las conversaciones de verdad.
      AND COALESCE(l.sent_by, '') <> 'alerta'
  ),
  agg AS (
    SELECT
      ph,
      COUNT(*)                                                        AS msg_count,
      MAX(created_at) FILTER (WHERE direction = 'in')                 AS last_in_at,
      COUNT(*) FILTER (WHERE direction = 'out' AND sent_by = 'admin') AS admin_count,
      COUNT(*) FILTER (WHERE direction = 'out'
                         AND COALESCE(sent_by, 'bot') = 'bot')        AS bot_count
    FROM base
    GROUP BY ph
  ),
  -- Última línea del hilo: es la que se muestra en la lista.
  ult AS (
    SELECT DISTINCT ON (ph) ph, body, direction, msg_type, created_at
    FROM base
    ORDER BY ph, created_at DESC, id DESC
  ),
  -- Último SALIENTE: dice quién atendió por última vez, incluso si después la
  -- persona volvió a escribir.
  ult_out AS (
    SELECT DISTINCT ON (ph) ph, sent_by
    FROM base
    WHERE direction = 'out'
    ORDER BY ph, created_at DESC, id DESC
  )
  SELECT
    u.ph, u.body, u.direction, u.msg_type, u.created_at,
    a.msg_count, a.last_in_at,
    o.sent_by,
    (u.direction = 'in'),
    a.admin_count, a.bot_count
  FROM ult u
  JOIN agg a USING (ph)
  LEFT JOIN ult_out o USING (ph)
  ORDER BY u.created_at DESC;
$function$;

GRANT EXECUTE ON FUNCTION public.ag_wa_conversations_summary(text) TO service_role;


-- ─── Hilo de una conversación ───────────────────────────────────────────────
-- Reemplaza el SELECT directo que hacía ag-admin-action (`eq('wa_phone', phone)`),
-- que era justo el que no encontraba las respuestas guardadas con '+'.
-- El tope se pide SIEMPRE por el lado nuevo y se voltea después (misma razón que
-- se explicó en la 280: pedir los 500 más viejos congelaba el hilo en agosto).
CREATE OR REPLACE FUNCTION public.ag_wa_thread(p_phone text, p_limit integer DEFAULT 500)
RETURNS TABLE(
  direction    text,
  msg_type     text,
  body         text,
  created_at   timestamptz,
  sent_by      text,
  sent_by_name text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT t.direction, t.msg_type, t.body, t.created_at, t.sent_by, t.sent_by_name
  FROM (
    SELECT l.id, l.direction, l.msg_type, l.body, l.created_at, l.sent_by, l.sent_by_name
    FROM ag_wa_message_log l
    WHERE ag_wa_norm_phone(l.wa_phone) = ag_wa_norm_phone(p_phone)
      AND COALESCE(l.sent_by, '') <> 'alerta'
    ORDER BY l.created_at DESC, l.id DESC
    LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 500), 2000))
  ) t
  ORDER BY t.created_at ASC, t.id ASC;
$function$;

COMMENT ON FUNCTION public.ag_wa_thread(text, integer) IS
  'Hilo completo de una conversacion de WhatsApp, juntando lo guardado con y sin + y marcando quien respondio cada mensaje. Migracion 284.';

GRANT EXECUTE ON FUNCTION public.ag_wa_thread(text, integer) TO service_role;
