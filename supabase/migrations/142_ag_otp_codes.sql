-- OTP codes para verificación de teléfono en Anda y Gana
-- Reemplaza Firebase Phone Auth con Telnyx (más confiable en APK Capacitor)

CREATE TABLE ag_otp_codes (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  phone      text        NOT NULL,
  code_hash  text        NOT NULL,
  expires_at timestamptz NOT NULL,
  used       boolean     NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ag_otp_codes_phone_idx ON ag_otp_codes (phone, expires_at);

-- Solo edge functions (service_role) acceden a esta tabla
ALTER TABLE ag_otp_codes ENABLE ROW LEVEL SECURITY;
