-- Migration 220: tabla de log para el piloto de "interpretación humana" del bot
-- de WhatsApp (ag-whatsapp/index.ts), pedido por el usuario 2026-08-11.
--
-- Cada vez que el validador rápido de un estado falla y se le pasa el mensaje al
-- intérprete de IA (GPT-4o-mini), se registra qué escribió el usuario y qué
-- decidió el modelo -- para poder revisar después casos reales y ajustar el
-- prompt, en vez de que el modelo "aprenda solo" (no es cómo funcionan estos
-- modelos en producción; esto es la versión real y segura de "mejorar con el
-- tiempo": un humano revisa los datos y afina las instrucciones).

CREATE TABLE public.ag_wa_fallback_interpretations (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wa_phone       text NOT NULL,
  state          text NOT NULL,
  user_text      text NOT NULL,
  outcome        text NOT NULL,      -- 'matched' | 'distraction' | 'unclear' | 'error'
  matched_value  text,
  reply_text     text,
  confidence     numeric,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ag_wa_fallback_interpretations_state_idx ON public.ag_wa_fallback_interpretations (state, created_at DESC);
CREATE INDEX ag_wa_fallback_interpretations_outcome_idx ON public.ag_wa_fallback_interpretations (outcome, created_at DESC);

ALTER TABLE public.ag_wa_fallback_interpretations ENABLE ROW LEVEL SECURITY;
-- solo el service role (la propia función edge) escribe/lee acá, sin policies
-- para authenticated/anon -- mismo patrón que el resto de tablas internas de ag_wa_*.
