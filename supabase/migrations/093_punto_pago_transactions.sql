-- ============================================================
-- Tabla para registrar todas las transacciones de Punto Pago
-- ============================================================

CREATE TABLE IF NOT EXISTS punto_pago_transactions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category      text NOT NULL,               -- recargas, servicios, creditos, giros, etc.
  provider_name text NOT NULL,               -- nombre del operador/proveedor
  reference     text NOT NULL,               -- n��mero de teléfono, factura, etc.
  amount        numeric(12,2) NOT NULL,      -- monto en COP
  external_id   text,                        -- ID de transacción del agregador
  custom_identifier text,                    -- referencia interna
  status        text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','completed','failed','refunded')),
  raw_response  jsonb,                       -- respuesta cruda del agregador
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- Índices
CREATE INDEX idx_ppt_user_id    ON punto_pago_transactions(user_id);
CREATE INDEX idx_ppt_status     ON punto_pago_transactions(status);
CREATE INDEX idx_ppt_category   ON punto_pago_transactions(category);
CREATE INDEX idx_ppt_created_at ON punto_pago_transactions(created_at DESC);

-- RLS
ALTER TABLE punto_pago_transactions ENABLE ROW LEVEL SECURITY;

-- Los usuarios solo ven sus propias transacciones
CREATE POLICY "Users can view own transactions"
  ON punto_pago_transactions FOR SELECT
  USING (auth.uid() = user_id);

-- Solo el service_role puede insertar (desde Edge Functions)
CREATE POLICY "Service role can insert"
  ON punto_pago_transactions FOR INSERT
  WITH CHECK (true);

-- Trigger para updated_at
CREATE OR REPLACE FUNCTION update_ppt_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_ppt_updated_at
  BEFORE UPDATE ON punto_pago_transactions
  FOR EACH ROW EXECUTE FUNCTION update_ppt_updated_at();
