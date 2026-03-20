-- =====================================================
-- Migration 048: Anda y Gana — Real-time GPS Tracking
-- =====================================================

-- Driver last-known location (upsert by driver_id)
CREATE TABLE IF NOT EXISTS ag_driver_locations (
  driver_id  uuid PRIMARY KEY REFERENCES ag_drivers(id) ON DELETE CASCADE,
  request_id uuid REFERENCES ag_ride_requests(id) ON DELETE SET NULL,
  lat        double precision NOT NULL,
  lng        double precision NOT NULL,
  heading    double precision,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE ag_driver_locations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ag_driver_locations_policy" ON ag_driver_locations FOR ALL USING (true);
