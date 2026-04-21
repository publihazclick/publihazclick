-- =============================================================================
-- RPC: get_my_referral_network
-- Devuelve los invitados directos (nivel 1) y los invitados de esos invitados
-- (nivel 2) del usuario autenticado. Usa SECURITY DEFINER para evitar
-- bloqueos de RLS sobre la tabla profiles.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_my_referral_network()
RETURNS TABLE(
  id                    UUID,
  username              TEXT,
  full_name             TEXT,
  level                 INTEGER,
  total_referrals_count INTEGER,
  has_active_package    BOOLEAN,
  avatar_url            TEXT,
  created_at            TIMESTAMPTZ,
  referred_by           UUID,
  referral_depth        INTEGER,
  invited_by_username   TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user UUID := auth.uid();
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  RETURN QUERY
  -- Nivel 1: invitados directos
  SELECT
    p.id,
    p.username::TEXT,
    p.full_name::TEXT,
    COALESCE(p.level, 1),
    COALESCE(p.total_referrals_count, 0),
    COALESCE(p.has_active_package, FALSE),
    p.avatar_url,
    p.created_at,
    p.referred_by,
    1 AS referral_depth,
    NULL::TEXT AS invited_by_username
  FROM profiles p
  WHERE p.referred_by = v_user

  UNION ALL

  -- Nivel 2: invitados de los invitados directos
  SELECT
    p2.id,
    p2.username::TEXT,
    p2.full_name::TEXT,
    COALESCE(p2.level, 1),
    COALESCE(p2.total_referrals_count, 0),
    COALESCE(p2.has_active_package, FALSE),
    p2.avatar_url,
    p2.created_at,
    p2.referred_by,
    2 AS referral_depth,
    p1.username::TEXT AS invited_by_username
  FROM profiles p2
  JOIN profiles p1 ON p1.id = p2.referred_by
  WHERE p1.referred_by = v_user;
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_referral_network() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_referral_network() TO authenticated;
