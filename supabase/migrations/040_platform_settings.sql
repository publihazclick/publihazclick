-- Tabla de configuración global de la plataforma (key-value)
CREATE TABLE IF NOT EXISTS platform_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS
ALTER TABLE platform_settings ENABLE ROW LEVEL SECURITY;

-- Lectura pública (la landing y cualquier componente pueden leer)
CREATE POLICY "platform_settings_public_read"
  ON platform_settings FOR SELECT
  USING (true);

-- Solo admin/dev pueden escribir
CREATE POLICY "platform_settings_admin_write"
  ON platform_settings FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('admin', 'dev')
    )
  );

-- Valor inicial: URL del video de la landing (vacío por defecto)
INSERT INTO platform_settings (key, value)
VALUES ('landing_video_url', '')
ON CONFLICT (key) DO NOTHING;
