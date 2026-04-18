-- Verificación automática de documentos del conductor con OCR + GPT-4o Vision
-- Guarda el resultado detallado de cada intento y permite auto-aprobación

CREATE TABLE IF NOT EXISTS public.ag_driver_verifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID NOT NULL REFERENCES public.ag_drivers(id) ON DELETE CASCADE,
  score INTEGER NOT NULL CHECK (score BETWEEN 0 AND 100),
  auto_decision TEXT NOT NULL CHECK (auto_decision IN ('approved','needs_review','rejected')),
  extracted JSONB NOT NULL DEFAULT '{}'::jsonb,
  flags JSONB NOT NULL DEFAULT '[]'::jsonb,
  model TEXT DEFAULT 'gpt-4o',
  cost_usd NUMERIC(8,4),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ag_driver_verif_driver ON public.ag_driver_verifications(driver_id, created_at DESC);
ALTER TABLE public.ag_driver_verifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ag_verif_self_read" ON public.ag_driver_verifications;
CREATE POLICY "ag_verif_self_read" ON public.ag_driver_verifications FOR SELECT
  USING (driver_id IN (SELECT id FROM public.ag_drivers WHERE ag_user_id IN (SELECT id FROM public.ag_users WHERE auth_user_id = auth.uid())));

-- RPC que aplica la decisión automática: approved/rejected escriben en ag_drivers
CREATE OR REPLACE FUNCTION public.ag_apply_verification(
  p_driver_id UUID,
  p_score INTEGER,
  p_decision TEXT,
  p_extracted JSONB,
  p_flags JSONB
) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_current_status TEXT;
BEGIN
  IF p_decision NOT IN ('approved','needs_review','rejected') THEN
    RAISE EXCEPTION 'decision inválida: %', p_decision;
  END IF;

  SELECT status INTO v_current_status FROM public.ag_drivers WHERE id = p_driver_id;
  IF v_current_status IS NULL THEN RAISE EXCEPTION 'Conductor no existe'; END IF;

  INSERT INTO public.ag_driver_verifications (driver_id, score, auto_decision, extracted, flags)
  VALUES (p_driver_id, p_score, p_decision, p_extracted, p_flags);

  -- Solo mover el status si estaba pendiente (no sobrescribe decisiones manuales)
  IF v_current_status = 'pending' THEN
    IF p_decision = 'approved' THEN
      UPDATE public.ag_drivers
      SET status = 'approved', approved_at = now(), reviewed_at = now(),
          rejection_reason = NULL
      WHERE id = p_driver_id;
    ELSIF p_decision = 'rejected' THEN
      UPDATE public.ag_drivers
      SET status = 'rejected', reviewed_at = now(),
          rejection_reason = COALESCE(
            (SELECT string_agg(value::text, '; ') FROM jsonb_array_elements_text(p_flags)),
            'Documentos no verificables automáticamente'
          )
      WHERE id = p_driver_id;
    END IF;
    -- 'needs_review' queda en pending, humano lo revisa
  END IF;
END;
$$;
GRANT EXECUTE ON FUNCTION public.ag_apply_verification(UUID, INTEGER, TEXT, JSONB, JSONB) TO service_role;
