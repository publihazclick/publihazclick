-- =============================================================================
-- Migration 015: Corregir issues de seguridad reportados por Supabase Advisors
-- Issues: RLS faltante/vacío, políticas permisivas, search_path mutable
-- =============================================================================

-- ── Issue 1: Habilitar RLS en banner_ads (RLS_DISABLED_IN_PUBLIC - ERROR) ─────
ALTER TABLE banner_ads ENABLE ROW LEVEL SECURITY;

-- Visitantes pueden ver banners activos (lectura pública para mostrarlos)
CREATE POLICY "Public can view active banners"
  ON banner_ads FOR SELECT
  USING (status = 'active');

-- Anunciantes gestionan sus propios banners
CREATE POLICY "Advertisers can manage own banners"
  ON banner_ads FOR ALL
  USING (auth.uid() = advertiser_id)
  WITH CHECK (auth.uid() = advertiser_id);

-- Admins pueden hacer todo
CREATE POLICY "Admins can manage all banner_ads"
  ON banner_ads FOR ALL
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'dev'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'dev'))
  );

-- ── Issue 2: Políticas para tabla donations (RLS_ENABLED_NO_POLICY - INFO) ────
CREATE POLICY "Users can view own donations"
  ON donations FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage all donations"
  ON donations FOR ALL
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'dev'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'dev'))
  );

-- Sistema puede insertar donaciones (via SECURITY DEFINER)
CREATE POLICY "System can insert donations"
  ON donations FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- ── Issue 3: Políticas para tabla package_banners (RLS_ENABLED_NO_POLICY) ─────
CREATE POLICY "Users can manage own package banners"
  ON package_banners FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can manage all package banners"
  ON package_banners FOR ALL
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'dev'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'dev'))
  );

-- ── Issue 4: Corregir política always-true en activity_logs (RLS_POLICY_ALWAYS_TRUE) ──
DROP POLICY IF EXISTS "System can insert activity logs" ON activity_logs;

-- Solo usuarios autenticados pueden insertar su propio log
-- (log_activity es SECURITY DEFINER y bypasea RLS de todas formas)
CREATE POLICY "Authenticated can insert own activity logs"
  ON activity_logs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- ── Issues 5-13: Fijar search_path en funciones (FUNCTION_SEARCH_PATH_MUTABLE) ─
ALTER FUNCTION activate_user_package(uuid, uuid)
  SET search_path = public;

ALTER FUNCTION approve_payment(uuid)
  SET search_path = public;

ALTER FUNCTION reject_payment(uuid, text)
  SET search_path = public;

ALTER FUNCTION calculate_donation(numeric)
  SET search_path = public;

ALTER FUNCTION generate_referral_code()
  SET search_path = public;

ALTER FUNCTION generate_referral_code(character varying)
  SET search_path = public;

ALTER FUNCTION generate_unique_username(character varying)
  SET search_path = public;

ALTER FUNCTION is_admin_or_dev(uuid)
  SET search_path = public;

ALTER FUNCTION log_activity(uuid, character varying, character varying, uuid, jsonb)
  SET search_path = public;

ALTER FUNCTION update_referral_count()
  SET search_path = public;

-- =============================================================================
-- FIN: Issue pendiente (requiere dashboard Supabase):
--   auth_leaked_password_protection → Auth > Settings > Leaked Password Protection
-- =============================================================================
