-- =====================================================
-- Migration 044: Anda y Gana — Passenger Flow Tables
-- =====================================================

-- ag_ride_requests: passenger requests a ride with an offered price
CREATE TABLE IF NOT EXISTS ag_ride_requests (
  id               uuid    DEFAULT gen_random_uuid() PRIMARY KEY,
  passenger_id     uuid    NOT NULL REFERENCES ag_users(id) ON DELETE CASCADE,
  origin_address   text    NOT NULL,
  origin_lat       float8  NOT NULL,
  origin_lng       float8  NOT NULL,
  dest_address     text    NOT NULL,
  dest_lat         float8  NOT NULL,
  dest_lng         float8  NOT NULL,
  offered_price    numeric(12,2) NOT NULL,
  status           text    NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','accepted','in_progress','completed','cancelled')),
  driver_id        uuid    REFERENCES ag_drivers(id),
  accepted_at      timestamptz,
  completed_at     timestamptz,
  cancelled_at     timestamptz,
  created_at       timestamptz DEFAULT now(),
  updated_at       timestamptz DEFAULT now()
);

ALTER TABLE ag_ride_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ag_ride_requests_policy" ON ag_ride_requests FOR ALL USING (true);

-- ag_chat_messages: real-time chat between passenger and driver
CREATE TABLE IF NOT EXISTS ag_chat_messages (
  id                 uuid    DEFAULT gen_random_uuid() PRIMARY KEY,
  request_id         uuid    NOT NULL REFERENCES ag_ride_requests(id) ON DELETE CASCADE,
  sender_ag_user_id  uuid    NOT NULL REFERENCES ag_users(id),
  message            text    NOT NULL,
  created_at         timestamptz DEFAULT now()
);

ALTER TABLE ag_chat_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ag_chat_messages_policy" ON ag_chat_messages FOR ALL USING (true);

-- ag_ratings: driver rated by passenger after a trip
CREATE TABLE IF NOT EXISTS ag_ratings (
  id           uuid    DEFAULT gen_random_uuid() PRIMARY KEY,
  request_id   uuid    NOT NULL REFERENCES ag_ride_requests(id) ON DELETE CASCADE,
  passenger_id uuid    NOT NULL REFERENCES ag_users(id),
  driver_id    uuid    NOT NULL REFERENCES ag_drivers(id),
  stars        smallint NOT NULL CHECK (stars BETWEEN 1 AND 5),
  comment      text,
  created_at   timestamptz DEFAULT now(),
  UNIQUE (request_id)
);

ALTER TABLE ag_ratings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ag_ratings_policy" ON ag_ratings FOR ALL USING (true);

-- Index for common query patterns
CREATE INDEX IF NOT EXISTS ag_ride_requests_passenger_status_idx
  ON ag_ride_requests(passenger_id, status);

CREATE INDEX IF NOT EXISTS ag_ride_requests_driver_status_idx
  ON ag_ride_requests(driver_id, status);

CREATE INDEX IF NOT EXISTS ag_chat_messages_request_idx
  ON ag_chat_messages(request_id, created_at);

CREATE INDEX IF NOT EXISTS ag_ratings_driver_idx
  ON ag_ratings(driver_id);
