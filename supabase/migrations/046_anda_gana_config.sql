-- =====================================================
-- Migration 046: Anda y Gana — Admin Config
-- =====================================================

-- Global config key-value store for Anda y Gana
CREATE TABLE IF NOT EXISTS ag_config (
  key        text PRIMARY KEY,
  value      text NOT NULL,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE ag_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ag_config_policy" ON ag_config FOR ALL USING (true);

-- Default commission rate: 15%
INSERT INTO ag_config (key, value) VALUES ('commission_rate', '15')
  ON CONFLICT (key) DO NOTHING;

-- Block/unblock ag_users
ALTER TABLE ag_users ADD COLUMN IF NOT EXISTS is_blocked boolean NOT NULL DEFAULT false;
ALTER TABLE ag_users ADD COLUMN IF NOT EXISTS blocked_reason text;
