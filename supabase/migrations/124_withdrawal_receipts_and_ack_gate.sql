-- =============================================================================
-- 124: "Retiros Publihazclick" — comprobantes de pago + gate por ack del usuario
-- ----------------------------------------------------------------------------
-- Objetivo:
--   1. Admin puede marcar un retiro como PAGADO subiendo una imagen del
--      comprobante. Al marcar como pagado:
--        - Se descuenta real_balance al usuario.
--        - Se envía notificación al usuario con el comprobante.
--        - El usuario queda bloqueado de tareas PTC hasta que confirme el
--          comprobante con un comentario.
--   2. Usuario confirma con comentario (ack_withdrawal_receipt). Esto desbloquea
--      las tareas diarias.
--   3. Defensa en BD: trigger BEFORE INSERT en ptc_clicks impide hacer clicks
--      mientras exista un retiro completado sin ack.
-- =============================================================================

-- ── 1) Columnas nuevas en withdrawal_requests ────────────────────────────────
ALTER TABLE public.withdrawal_requests
  ADD COLUMN IF NOT EXISTS receipt_url         TEXT,
  ADD COLUMN IF NOT EXISTS admin_notes         TEXT,
  ADD COLUMN IF NOT EXISTS receipt_uploaded_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS acknowledged_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS user_comment        TEXT;

CREATE INDEX IF NOT EXISTS idx_withdrawals_user_pending_ack
  ON public.withdrawal_requests (user_id)
  WHERE status = 'completed' AND acknowledged_at IS NULL;


-- ── 2) Storage bucket para comprobantes ──────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'withdrawal-receipts',
  'withdrawal-receipts',
  true,
  10485760,
  ARRAY['image/jpeg','image/png','image/webp','image/gif']
)
ON CONFLICT (id) DO UPDATE
  SET public = EXCLUDED.public,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Public can view withdrawal receipts" ON storage.objects;
CREATE POLICY "Public can view withdrawal receipts"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'withdrawal-receipts');

DROP POLICY IF EXISTS "Admins can upload withdrawal receipts" ON storage.objects;
CREATE POLICY "Admins can upload withdrawal receipts"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'withdrawal-receipts'
    AND public.is_admin_or_dev(auth.uid())
  );

DROP POLICY IF EXISTS "Admins can update withdrawal receipts" ON storage.objects;
CREATE POLICY "Admins can update withdrawal receipts"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'withdrawal-receipts'
    AND public.is_admin_or_dev(auth.uid())
  );

DROP POLICY IF EXISTS "Admins can delete withdrawal receipts" ON storage.objects;
CREATE POLICY "Admins can delete withdrawal receipts"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'withdrawal-receipts'
    AND public.is_admin_or_dev(auth.uid())
  );


-- ── 3) RPC: mark_withdrawal_paid — admin marca como pagado con comprobante ──
CREATE OR REPLACE FUNCTION public.mark_withdrawal_paid(
  p_withdrawal_id UUID,
  p_receipt_url   TEXT,
  p_admin_notes   TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin   UUID := auth.uid();
  v_user_id UUID;
  v_amount  NUMERIC;
  v_status  TEXT;
  v_bal     NUMERIC;
  v_title   TEXT;
  v_msg     TEXT;
BEGIN
  IF v_admin IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT public.is_admin_or_dev(v_admin) THEN
    RAISE EXCEPTION 'admin/dev role required' USING ERRCODE = '42501';
  END IF;

  IF p_receipt_url IS NULL OR length(trim(p_receipt_url)) = 0 THEN
    RAISE EXCEPTION 'receipt_url is required' USING ERRCODE = '22023';
  END IF;

  -- Lock withdrawal row
  SELECT user_id, amount, status::TEXT
    INTO v_user_id, v_amount, v_status
  FROM public.withdrawal_requests
  WHERE id = p_withdrawal_id
  FOR UPDATE;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'withdrawal not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_status = 'completed' THEN
    RAISE EXCEPTION 'withdrawal already paid' USING ERRCODE = 'P0001';
  END IF;

  IF v_status = 'rejected' THEN
    RAISE EXCEPTION 'withdrawal was rejected' USING ERRCODE = 'P0001';
  END IF;

  -- Lock user row, check + deduct balance
  SELECT real_balance INTO v_bal
  FROM public.profiles
  WHERE id = v_user_id
  FOR UPDATE;

  IF COALESCE(v_bal, 0) < v_amount THEN
    RAISE EXCEPTION 'user balance insufficient (balance=%, amount=%)', COALESCE(v_bal, 0), v_amount
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.profiles
     SET real_balance = real_balance - v_amount,
         updated_at   = NOW()
   WHERE id = v_user_id;

  -- Update withdrawal
  UPDATE public.withdrawal_requests
     SET status              = 'completed',
         receipt_url         = p_receipt_url,
         admin_notes         = NULLIF(trim(p_admin_notes), ''),
         receipt_uploaded_at = NOW(),
         processed_at        = COALESCE(processed_at, NOW()),
         processed_by        = v_admin
   WHERE id = p_withdrawal_id;

  -- Notify user
  v_title := 'Pago de retiro exitoso';
  v_msg := 'Tu retiro de $' || to_char(v_amount, 'FM999G999G999G990') ||
           ' COP fue pagado. Revisa el comprobante en la campana de notificaciones y deja un comentario para confirmar recibido. Debes comentar para continuar con tus tareas diarias.';

  INSERT INTO public.user_notifications (user_id, title, message, type)
  VALUES (v_user_id, v_title, v_msg, 'success');

  RETURN jsonb_build_object(
    'ok', true,
    'withdrawal_id', p_withdrawal_id,
    'user_id', v_user_id,
    'amount', v_amount
  );
END;
$$;

REVOKE ALL ON FUNCTION public.mark_withdrawal_paid(UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_withdrawal_paid(UUID, TEXT, TEXT) TO authenticated;


-- ── 4) RPC: ack_withdrawal_receipt — usuario confirma con comentario ─────────
CREATE OR REPLACE FUNCTION public.ack_withdrawal_receipt(
  p_withdrawal_id UUID,
  p_comment       TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user   UUID := auth.uid();
  v_owner  UUID;
  v_status TEXT;
  v_ack    TIMESTAMPTZ;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '28000';
  END IF;

  IF p_comment IS NULL OR length(trim(p_comment)) < 2 THEN
    RAISE EXCEPTION 'comment required (minimum 2 chars)' USING ERRCODE = '22023';
  END IF;

  SELECT user_id, status::TEXT, acknowledged_at
    INTO v_owner, v_status, v_ack
  FROM public.withdrawal_requests
  WHERE id = p_withdrawal_id
  FOR UPDATE;

  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'withdrawal not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_owner <> v_user THEN
    RAISE EXCEPTION 'not your withdrawal' USING ERRCODE = '42501';
  END IF;

  IF v_status <> 'completed' THEN
    RAISE EXCEPTION 'withdrawal not paid yet' USING ERRCODE = 'P0001';
  END IF;

  IF v_ack IS NOT NULL THEN
    -- Idempotente
    RETURN jsonb_build_object('ok', true, 'already_ack', true);
  END IF;

  UPDATE public.withdrawal_requests
     SET acknowledged_at = NOW(),
         user_comment    = trim(p_comment)
   WHERE id = p_withdrawal_id;

  -- Marcar la notificación relacionada como leída
  UPDATE public.user_notifications
     SET is_read = true
   WHERE user_id = v_user
     AND type = 'success'
     AND title = 'Pago de retiro exitoso'
     AND is_read = false;

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.ack_withdrawal_receipt(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ack_withdrawal_receipt(UUID, TEXT) TO authenticated;


-- ── 5) Helper: ¿el usuario tiene un retiro pagado sin confirmar? ─────────────
CREATE OR REPLACE FUNCTION public.user_has_pending_withdrawal_ack(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.withdrawal_requests
    WHERE user_id = p_user_id
      AND status = 'completed'
      AND receipt_url IS NOT NULL
      AND acknowledged_at IS NULL
  );
$$;

GRANT EXECUTE ON FUNCTION public.user_has_pending_withdrawal_ack(UUID) TO authenticated;


-- ── 6) RPC para el frontend: obtener el retiro pendiente de ack (si existe) ──
CREATE OR REPLACE FUNCTION public.get_pending_withdrawal_ack()
RETURNS TABLE (
  id                  UUID,
  amount              NUMERIC,
  method              TEXT,
  receipt_url         TEXT,
  admin_notes         TEXT,
  receipt_uploaded_at TIMESTAMPTZ,
  created_at          TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user UUID := auth.uid();
BEGIN
  IF v_user IS NULL THEN RETURN; END IF;

  RETURN QUERY
  SELECT
    w.id,
    w.amount,
    w.method::TEXT,
    w.receipt_url,
    w.admin_notes,
    w.receipt_uploaded_at,
    w.created_at
  FROM public.withdrawal_requests w
  WHERE w.user_id = v_user
    AND w.status = 'completed'
    AND w.receipt_url IS NOT NULL
    AND w.acknowledged_at IS NULL
  ORDER BY w.receipt_uploaded_at DESC NULLS LAST
  LIMIT 1;
END;
$$;

REVOKE ALL ON FUNCTION public.get_pending_withdrawal_ack() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_pending_withdrawal_ack() TO authenticated;


-- ── 7) Trigger defensa: bloquear inserts en ptc_clicks si falta ack ──────────
CREATE OR REPLACE FUNCTION public.enforce_withdrawal_ack_on_clicks()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.user_has_pending_withdrawal_ack(NEW.user_id) THEN
    RAISE EXCEPTION 'Debes confirmar con un comentario el comprobante de tu último pago antes de continuar con las tareas diarias.'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_withdrawal_ack_on_clicks ON public.ptc_clicks;
CREATE TRIGGER trg_enforce_withdrawal_ack_on_clicks
  BEFORE INSERT ON public.ptc_clicks
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_withdrawal_ack_on_clicks();


-- ── 8) Verificación ──────────────────────────────────────────────────────────
DO $$
BEGIN
  ASSERT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'mark_withdrawal_paid'),
    'mark_withdrawal_paid missing';
  ASSERT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'ack_withdrawal_receipt'),
    'ack_withdrawal_receipt missing';
  ASSERT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'get_pending_withdrawal_ack'),
    'get_pending_withdrawal_ack missing';
  ASSERT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_enforce_withdrawal_ack_on_clicks'),
    'trigger missing';
END $$;
