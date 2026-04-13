-- Tabla para reportes de incidentes y pasajeros/conductores
CREATE TABLE IF NOT EXISTS ag_reports (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  reporter_user_id UUID NOT NULL REFERENCES ag_users(id),
  type TEXT NOT NULL CHECK (type IN ('incident', 'passenger', 'driver')),
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'resolved', 'dismissed')),
  admin_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  reviewed_at TIMESTAMPTZ
);

-- RLS
ALTER TABLE ag_reports ENABLE ROW LEVEL SECURITY;

-- Usuarios pueden crear reportes
CREATE POLICY "Users can insert own reports"
  ON ag_reports FOR INSERT
  WITH CHECK (reporter_user_id IN (SELECT id FROM ag_users WHERE auth_user_id = auth.uid()));

-- Usuarios pueden ver sus propios reportes
CREATE POLICY "Users can view own reports"
  ON ag_reports FOR SELECT
  USING (reporter_user_id IN (SELECT id FROM ag_users WHERE auth_user_id = auth.uid()));

-- Admins pueden ver y actualizar todos
CREATE POLICY "Admins full access"
  ON ag_reports FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'dev')));
