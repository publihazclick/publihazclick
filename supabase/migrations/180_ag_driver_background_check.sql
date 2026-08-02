-- Verificación de antecedentes (Policía Nacional) + licencia RUNT via Verifik.
-- Complementa la verificación de documentos con GPT-4o Vision (ag_driver_verifications,
-- migracion 114) -- son dos sistemas independientes. Pedido explicito del usuario 2026-08-02:
-- si esta verificacion falla, el conductor queda rechazado de forma AUTOMATICA, sin pasar
-- por revision humana.

CREATE TABLE IF NOT EXISTS public.ag_driver_background_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID NOT NULL REFERENCES public.ag_drivers(id) ON DELETE CASCADE,
  passed BOOLEAN NOT NULL,
  reason TEXT,
  police_record JSONB,
  license_record JSONB,
  provider TEXT NOT NULL DEFAULT 'verifik',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ag_bg_check_driver ON public.ag_driver_background_checks(driver_id, created_at DESC);
ALTER TABLE public.ag_driver_background_checks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ag_bg_check_self_read" ON public.ag_driver_background_checks;
CREATE POLICY "ag_bg_check_self_read" ON public.ag_driver_background_checks FOR SELECT
  USING (driver_id IN (SELECT id FROM public.ag_drivers WHERE ag_user_id IN (SELECT id FROM public.ag_users WHERE auth_user_id = auth.uid())));

-- RPC que aplica el resultado. A diferencia de ag_apply_verification (migracion 114, que
-- SOLO actua si el status actual es 'pending' para no pisar decisiones manuales), este
-- rechazo es de SEGURIDAD y se aplica sin importar el status actual -- incluso si el
-- conductor ya habia sido aprobado por la verificacion de documentos, un antecedente
-- judicial real o una licencia invalida debe bloquearlo igual. Nunca aprueba por si solo:
-- solo puede degradar a 'rejected', jamas mueve un conductor a 'approved'.
CREATE OR REPLACE FUNCTION public.ag_apply_background_check(
  p_driver_id UUID,
  p_passed BOOLEAN,
  p_reason TEXT,
  p_police JSONB,
  p_license JSONB
) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.ag_driver_background_checks (driver_id, passed, reason, police_record, license_record)
  VALUES (p_driver_id, p_passed, p_reason, p_police, p_license);

  IF NOT p_passed THEN
    UPDATE public.ag_drivers
    SET status = 'rejected', reviewed_at = now(), rejection_reason = p_reason
    WHERE id = p_driver_id AND status <> 'rejected';
  END IF;
END;
$$;
GRANT EXECUTE ON FUNCTION public.ag_apply_background_check(UUID, BOOLEAN, TEXT, JSONB, JSONB) TO service_role;
