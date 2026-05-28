-- Migration 154: Add origin_name to ag_trip_requests
ALTER TABLE ag_trip_requests
  ADD COLUMN IF NOT EXISTS origin_name text;
