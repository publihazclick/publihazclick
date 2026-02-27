-- =============================================================================
-- Migration 021: Políticas RLS para que admins puedan ver clicks y referidos
-- =============================================================================

CREATE POLICY "Admins can view all ptc_clicks"
  ON ptc_clicks FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'dev'))
  );

CREATE POLICY "Admins can view all referrals"
  ON referrals FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'dev'))
  );
