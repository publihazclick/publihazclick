-- =====================================================
-- 032: User Payment Methods table
-- Stores payment methods per user in DB instead of localStorage
-- =====================================================

CREATE TABLE IF NOT EXISTS user_payment_methods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  method_id TEXT NOT NULL,        -- e.g. 'nequi', 'paypal', 'binance'
  label TEXT NOT NULL,            -- Display name e.g. 'Nequi', 'PayPal'
  icon TEXT NOT NULL DEFAULT 'account_balance_wallet',
  category TEXT NOT NULL,         -- 'colombia', 'venezuela', 'mexico', 'global', 'crypto', etc.
  data JSONB NOT NULL DEFAULT '{}', -- Method-specific fields (phone, email, wallet, etc.)
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for fast lookups
CREATE INDEX idx_user_payment_methods_user ON user_payment_methods(user_id);

-- Unique constraint: one method_id + primary data value per user
CREATE UNIQUE INDEX idx_user_payment_methods_unique ON user_payment_methods(user_id, method_id, (data->>'primary_value'));

-- RLS
ALTER TABLE user_payment_methods ENABLE ROW LEVEL SECURITY;

-- Users can see their own payment methods
CREATE POLICY "Users can view own payment methods"
  ON user_payment_methods FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own payment methods
CREATE POLICY "Users can insert own payment methods"
  ON user_payment_methods FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own payment methods
CREATE POLICY "Users can update own payment methods"
  ON user_payment_methods FOR UPDATE
  USING (auth.uid() = user_id);

-- Users can delete their own payment methods
CREATE POLICY "Users can delete own payment methods"
  ON user_payment_methods FOR DELETE
  USING (auth.uid() = user_id);

-- Admin/dev full access
CREATE POLICY "Admin full access to payment methods"
  ON user_payment_methods FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'dev')
    )
  );
