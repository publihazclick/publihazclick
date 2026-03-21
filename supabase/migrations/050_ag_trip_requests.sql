-- =====================================================
-- Migration 050: Anda y Gana — Trip Requests
-- =====================================================

CREATE TABLE IF NOT EXISTS ag_trip_requests (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  passenger_user_id uuid        REFERENCES ag_users(id) ON DELETE CASCADE,
  origin_lat        double precision NOT NULL,
  origin_lng        double precision NOT NULL,
  dest_name         text        NOT NULL,
  dest_lat          double precision NOT NULL,
  dest_lng          double precision NOT NULL,
  distance_km       double precision NOT NULL,
  vehicle_type      text        NOT NULL CHECK (vehicle_type IN ('carro','moto')),
  offered_price     integer     NOT NULL,
  status            text        NOT NULL DEFAULT 'searching'
    CHECK (status IN ('searching','accepted','cancelled','completed')),
  driver_id         uuid        REFERENCES ag_drivers(id),
  created_at        timestamptz DEFAULT now(),
  updated_at        timestamptz DEFAULT now()
);

ALTER TABLE ag_trip_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "trip_requests_own" ON ag_trip_requests;
CREATE POLICY "trip_requests_own" ON ag_trip_requests
  FOR ALL USING (
    passenger_user_id IN (SELECT id FROM ag_users WHERE auth_user_id = auth.uid())
  );

DROP POLICY IF EXISTS "trip_requests_drivers_read" ON ag_trip_requests;
CREATE POLICY "trip_requests_drivers_read" ON ag_trip_requests
  FOR SELECT USING (status = 'searching');

CREATE INDEX IF NOT EXISTS ag_trip_requests_status_idx      ON ag_trip_requests(status);
CREATE INDEX IF NOT EXISTS ag_trip_requests_passenger_idx   ON ag_trip_requests(passenger_user_id);
CREATE INDEX IF NOT EXISTS ag_trip_requests_created_at_idx  ON ag_trip_requests(created_at DESC);
