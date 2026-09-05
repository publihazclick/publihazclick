-- Migración 271: enseñarle al bot desde WhatsApp (2026-09-05).
--
-- QUÉ RESUELVE
-- Cuando el bot de soporte no está seguro de una respuesta, escala a un humano. Hoy eso
-- termina ahí: el admin contesta a esa persona y la próxima vez que alguien pregunte lo
-- mismo, el bot vuelve a escalar. No aprende nada.
--
-- Con esto, la respuesta del admin se guarda y viaja con el bot: la siguiente persona que
-- pregunte algo parecido la recibe al instante. Pedido explícito del usuario:
-- "yo puedo ir enseñando al bot... a fin de que llegado el momento ni siquiera necesites
-- de mí y no tengas que escalar nada".
--
-- HASTA DÓNDE LLEGA (dicho de frente)
-- Converge para preguntas de CONOCIMIENTO (documentos, comisión, cobertura, precios) --
-- que son 8 de las 8 escaladas reales que hubo hasta hoy. NO converge para casos de cuenta
-- ("me cobraron mal", "un pasajero me trató mal"): esos no se resuelven sabiendo más, sino
-- haciendo algo, y eso sigue siendo del admin.
--
-- POR QUÉ NO SE USA BÚSQUEDA VECTORIAL
-- El volumen lo permite: 50 preguntas en 3 semanas, ~2-3 escaladas por semana. Aun sumando
-- 130 respuestas al año, caben de sobra dentro del prompt del modelo. Meter pgvector +
-- embeddings agregaría costo por consulta y una pieza más que puede fallar, para resolver
-- un problema de escala que este bot no tiene. Si algún día pasa de ~300 respuestas, ahí sí.

CREATE TABLE IF NOT EXISTS public.ag_wa_faq_aprendido (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  canal           text NOT NULL CHECK (canal IN ('conductor', 'pasajero')),
  pregunta        text NOT NULL,
  respuesta       text,                                   -- NULL mientras está pendiente
  estado          text NOT NULL DEFAULT 'pendiente'
                    CHECK (estado IN ('pendiente', 'activa', 'archivada')),
  preguntada_por  text,                                   -- teléfono de quien preguntó
  -- ID del mensaje de WhatsApp que se le mandó al admin. Cuando el admin RESPONDE CITANDO
  -- ese mensaje, WhatsApp manda este mismo id en `context.id` y sabemos exactamente a cuál
  -- de las preguntas pendientes está contestando -- sin adivinar, aunque lleguen varias
  -- seguidas.
  wamid_aviso     text,
  veces_usada     integer NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  respondida_at   timestamptz
);

CREATE INDEX IF NOT EXISTS idx_faq_aprendido_estado_canal
  ON public.ag_wa_faq_aprendido (estado, canal);
CREATE INDEX IF NOT EXISTS idx_faq_aprendido_wamid
  ON public.ag_wa_faq_aprendido (wamid_aviso) WHERE wamid_aviso IS NOT NULL;

ALTER TABLE public.ag_wa_faq_aprendido ENABLE ROW LEVEL SECURITY;
-- Sin políticas a propósito: solo la edge function (service_role) y el panel admin por RPC.

COMMENT ON TABLE public.ag_wa_faq_aprendido IS
  'Respuestas que el admin le enseña al bot de soporte por WhatsApp. Ver migración 271.';

-- ─── Lo que el bot lee en cada pregunta ─────────────────────────────────────────
-- Devuelve las respuestas aprendidas y activas de un canal, más recientes primero.
-- Se limita a 200 por seguridad: es muchísimo más de lo que este bot va a acumular en años,
-- pero evita que un día el prompt crezca sin techo y empiece a costar de más.
CREATE OR REPLACE FUNCTION public.ag_wa_faq_activas(p_canal text)
RETURNS TABLE(id bigint, pregunta text, respuesta text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id, pregunta, respuesta
  FROM public.ag_wa_faq_aprendido
  WHERE canal = p_canal
    AND estado = 'activa'
    AND respuesta IS NOT NULL
  ORDER BY respondida_at DESC NULLS LAST
  LIMIT 200;
$$;

-- ─── Guardar lo que el admin enseñó ─────────────────────────────────────────────
-- Devuelve la fila que quedó respondida (o nada si no había ninguna pendiente que calce).
--
-- p_wamid: el mensaje citado por el admin. Si viene y calza, gana -- es la señal exacta.
-- Si no viene, se toma la pendiente más reciente de las últimas 24h. Se limita a 24h a
-- propósito: contestar algo de hace tres días casi seguro es contestar otra cosa.
CREATE OR REPLACE FUNCTION public.ag_wa_faq_responder(p_respuesta text, p_wamid text DEFAULT NULL)
RETURNS TABLE(id bigint, canal text, pregunta text, preguntada_por text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id bigint;
BEGIN
  IF p_wamid IS NOT NULL THEN
    SELECT f.id INTO v_id
    FROM public.ag_wa_faq_aprendido f
    WHERE f.wamid_aviso = p_wamid AND f.estado = 'pendiente'
    LIMIT 1;
  END IF;

  IF v_id IS NULL THEN
    SELECT f.id INTO v_id
    FROM public.ag_wa_faq_aprendido f
    WHERE f.estado = 'pendiente'
      AND f.created_at > now() - interval '24 hours'
    ORDER BY f.created_at DESC
    LIMIT 1;
  END IF;

  IF v_id IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.ag_wa_faq_aprendido f
  SET respuesta = p_respuesta, estado = 'activa', respondida_at = now()
  WHERE f.id = v_id;

  RETURN QUERY
  SELECT f.id, f.canal, f.pregunta, f.preguntada_por
  FROM public.ag_wa_faq_aprendido f
  WHERE f.id = v_id;
END;
$$;

-- ─── Deshacer ───────────────────────────────────────────────────────────────────
-- Si el bot guardó la respuesta en la pregunta equivocada (pasa cuando el admin contesta
-- sin citar y hay varias pendientes), esto la archiva y la deja fuera del prompt.
CREATE OR REPLACE FUNCTION public.ag_wa_faq_archivar(p_id bigint)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH x AS (
    UPDATE public.ag_wa_faq_aprendido SET estado = 'archivada' WHERE id = p_id RETURNING 1
  )
  SELECT EXISTS (SELECT 1 FROM x);
$$;
