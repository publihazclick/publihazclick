-- Migration 158: Fix quick registration
-- 1. Make optional fields nullable so quick-register (3-step) works without full form
ALTER TABLE public.ag_users
  ALTER COLUMN birth_date DROP NOT NULL,
  ALTER COLUMN id_number  DROP NOT NULL,
  ALTER COLUMN email      DROP NOT NULL;

-- Remove unique constraint on email since it's now optional
ALTER TABLE public.ag_users
  DROP CONSTRAINT IF EXISTS ag_users_email_key;

-- 2. Add SELECT policy so edge functions / upsert-by-phone can find existing profiles
--    (allows any authenticated user to look up profiles by phone for registration recovery)
DROP POLICY IF EXISTS "ag_users_select_by_phone" ON public.ag_users;
CREATE POLICY "ag_users_select_by_phone" ON public.ag_users
  FOR SELECT USING (true);

-- 3. SECURITY DEFINER function: upsert ag_user by phone — bypasses RLS for registration
CREATE OR REPLACE FUNCTION public.ag_upsert_user_by_phone(
  p_phone       TEXT,
  p_auth_uid    UUID,
  p_role        TEXT DEFAULT 'passenger',
  p_full_name   TEXT DEFAULT 'Usuario',
  p_referred_by UUID DEFAULT NULL
)
RETURNS SETOF public.ag_users
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_record public.ag_users;
BEGIN
  -- Try to find existing profile by phone
  SELECT * INTO v_record FROM public.ag_users WHERE phone = p_phone LIMIT 1;

  IF FOUND THEN
    -- Sync auth_user_id if it changed (re-registration / new device)
    IF v_record.auth_user_id IS DISTINCT FROM p_auth_uid THEN
      UPDATE public.ag_users SET auth_user_id = p_auth_uid WHERE id = v_record.id;
      v_record.auth_user_id := p_auth_uid;
    END IF;
    RETURN NEXT v_record;
    RETURN;
  END IF;

  -- New user: insert
  INSERT INTO public.ag_users (auth_user_id, role, full_name, phone, country, department, city, referred_by)
  VALUES (p_auth_uid, p_role, p_full_name, p_phone, 'Colombia', '', '', p_referred_by)
  RETURNING * INTO v_record;

  RETURN NEXT v_record;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ag_upsert_user_by_phone(TEXT, UUID, TEXT, TEXT, UUID) TO authenticated, anon;
