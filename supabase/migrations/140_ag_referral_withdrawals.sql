-- ═══════════════════════════════════════════════════════
-- Migration 140: Solicitudes de retiro de comisiones por referidos
-- ═══════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.ag_referral_withdrawal_requests (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  ag_user_id   uuid        NOT NULL REFERENCES public.ag_users(id) ON DELETE CASCADE,
  amount       integer     NOT NULL CHECK (amount > 0),
  method       text        NOT NULL CHECK (method IN ('bank','nequi','daviplata','efectivo')),
  details      jsonb       NOT NULL DEFAULT '{}',
  status       text        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','completed')),
  admin_notes  text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ag_ref_wd_user ON public.ag_referral_withdrawal_requests(ag_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ag_ref_wd_pending ON public.ag_referral_withdrawal_requests(status) WHERE status = 'pending';

ALTER TABLE public.ag_referral_withdrawal_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ref_wd_owner" ON public.ag_referral_withdrawal_requests;
CREATE POLICY "ref_wd_owner" ON public.ag_referral_withdrawal_requests FOR SELECT
  USING (ag_user_id IN (SELECT id FROM public.ag_users WHERE auth_user_id = auth.uid()));

DROP POLICY IF EXISTS "ref_wd_insert_owner" ON public.ag_referral_withdrawal_requests;
CREATE POLICY "ref_wd_insert_owner" ON public.ag_referral_withdrawal_requests FOR INSERT
  WITH CHECK (ag_user_id IN (SELECT id FROM public.ag_users WHERE auth_user_id = auth.uid()));

DROP POLICY IF EXISTS "ref_wd_update_admin" ON public.ag_referral_withdrawal_requests;
CREATE POLICY "ref_wd_update_admin" ON public.ag_referral_withdrawal_requests FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','dev')));

CREATE OR REPLACE FUNCTION public.ag_request_referral_withdrawal(
  p_user_id  uuid,
  p_amount   integer,
  p_method   text,
  p_details  jsonb
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_auth      uuid;
  v_wallet_id uuid;
  v_balance   integer;
  v_id        uuid;
BEGIN
  SELECT auth_user_id INTO v_auth FROM public.ag_users WHERE id = p_user_id;
  IF v_auth IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'No autorizado'; END IF;
  IF p_amount < 10000 THEN RAISE EXCEPTION 'Mínimo 10.000 COP'; END IF;

  SELECT id, balance INTO v_wallet_id, v_balance
  FROM public.ag_referral_wallet
  WHERE ag_user_id = p_user_id
  FOR UPDATE;

  IF v_wallet_id IS NULL OR v_balance < p_amount THEN
    RAISE EXCEPTION 'Saldo insuficiente';
  END IF;

  UPDATE public.ag_referral_wallet
  SET balance = balance - p_amount
  WHERE id = v_wallet_id;

  INSERT INTO public.ag_referral_withdrawal_requests (ag_user_id, amount, method, details)
  VALUES (p_user_id, p_amount, p_method, COALESCE(p_details, '{}'))
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;
