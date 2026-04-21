-- Almacenar el QR que Evolution API envia por webhook (QRCODE_UPDATED).
-- Asi el frontend puede leerlo cuando la llamada sincrona a /instance/connect
-- devuelve vacio (Evolution genera el QR asincronamente).

ALTER TABLE wa_sessions
  ADD COLUMN IF NOT EXISTS qr_base64 text,
  ADD COLUMN IF NOT EXISTS qr_code text,
  ADD COLUMN IF NOT EXISTS pairing_code text,
  ADD COLUMN IF NOT EXISTS qr_updated_at timestamptz;
