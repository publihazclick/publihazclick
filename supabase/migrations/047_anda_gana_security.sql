-- =====================================================
-- Migration 047: Anda y Gana — Security System
-- =====================================================

-- Add security fields to ag_users
ALTER TABLE ag_users ADD COLUMN IF NOT EXISTS emergency_contact_name  text;
ALTER TABLE ag_users ADD COLUMN IF NOT EXISTS emergency_contact_phone text;
ALTER TABLE ag_users ADD COLUMN IF NOT EXISTS selfie_url              text;
ALTER TABLE ag_users ADD COLUMN IF NOT EXISTS selfie_verified         boolean NOT NULL DEFAULT false;
ALTER TABLE ag_users ADD COLUMN IF NOT EXISTS selfie_verified_at      timestamptz;

-- Panic alerts table
CREATE TABLE IF NOT EXISTS ag_panic_alerts (
  id           uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  request_id   uuid        NOT NULL REFERENCES ag_ride_requests(id) ON DELETE CASCADE,
  passenger_id uuid        NOT NULL REFERENCES ag_users(id),
  driver_id    uuid        REFERENCES ag_drivers(id),
  location_lat double precision,
  location_lng double precision,
  resolved     boolean     NOT NULL DEFAULT false,
  created_at   timestamptz DEFAULT now()
);

ALTER TABLE ag_panic_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ag_panic_alerts_policy" ON ag_panic_alerts FOR ALL USING (true);

CREATE INDEX IF NOT EXISTS ag_panic_alerts_passenger_idx ON ag_panic_alerts(passenger_id);
CREATE INDEX IF NOT EXISTS ag_panic_alerts_resolved_idx  ON ag_panic_alerts(resolved);
