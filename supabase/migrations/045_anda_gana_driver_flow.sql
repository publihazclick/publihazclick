-- =====================================================
-- Migration 045: Anda y Gana — Driver Flow
-- =====================================================

-- Add availability toggle to ag_drivers
ALTER TABLE ag_drivers ADD COLUMN IF NOT EXISTS is_available boolean NOT NULL DEFAULT false;

-- ag_passenger_ratings: driver rates passenger after trip
CREATE TABLE IF NOT EXISTS ag_passenger_ratings (
  id           uuid     DEFAULT gen_random_uuid() PRIMARY KEY,
  request_id   uuid     NOT NULL REFERENCES ag_ride_requests(id) ON DELETE CASCADE,
  driver_id    uuid     NOT NULL REFERENCES ag_drivers(id),
  passenger_id uuid     NOT NULL REFERENCES ag_users(id),
  stars        smallint NOT NULL CHECK (stars BETWEEN 1 AND 5),
  comment      text,
  created_at   timestamptz DEFAULT now(),
  UNIQUE (request_id)
);

ALTER TABLE ag_passenger_ratings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ag_passenger_ratings_policy" ON ag_passenger_ratings FOR ALL USING (true);

CREATE INDEX IF NOT EXISTS ag_passenger_ratings_driver_idx    ON ag_passenger_ratings(driver_id);
CREATE INDEX IF NOT EXISTS ag_passenger_ratings_passenger_idx ON ag_passenger_ratings(passenger_id);
