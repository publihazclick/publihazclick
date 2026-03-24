-- =============================================================================
-- Migration 056: Anda y Gana — Sistema de calificaciones
-- =============================================================================

-- ── Estado 'completed' en ag_trip_requests ───────────────────────────────────
ALTER TABLE ag_trip_requests
  DROP CONSTRAINT IF EXISTS ag_trip_requests_status_check;

ALTER TABLE ag_trip_requests
  ADD CONSTRAINT ag_trip_requests_status_check
    CHECK (status IN ('searching','accepted','cancelled','completed'));

ALTER TABLE ag_trip_requests
  ADD COLUMN IF NOT EXISTS completed_at timestamptz;

-- ── Tabla de calificaciones ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ag_trip_ratings (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_request_id uuid        NOT NULL REFERENCES ag_trip_requests(id) ON DELETE CASCADE,
  rated_by_role   text        NOT NULL CHECK (rated_by_role IN ('passenger','driver')),
  rater_user_id   uuid        NOT NULL REFERENCES ag_users(id),
  rated_user_id   uuid        NOT NULL REFERENCES ag_users(id),
  stars           integer     NOT NULL CHECK (stars BETWEEN 1 AND 5),
  comment         text,
  created_at      timestamptz DEFAULT now(),
  UNIQUE (trip_request_id, rated_by_role)
);

CREATE INDEX IF NOT EXISTS ag_ratings_rated_user_idx ON ag_trip_ratings(rated_user_id);

ALTER TABLE ag_trip_ratings ENABLE ROW LEVEL SECURITY;

-- Cada usuario ve las calificaciones que le hicieron y las que él hizo
DROP POLICY IF EXISTS "user_sees_own_ratings" ON ag_trip_ratings;
CREATE POLICY "user_sees_own_ratings" ON ag_trip_ratings FOR SELECT
  USING (
    rater_user_id IN (SELECT id FROM ag_users WHERE auth_user_id = auth.uid())
    OR
    rated_user_id IN (SELECT id FROM ag_users WHERE auth_user_id = auth.uid())
  );

-- Cualquier usuario autenticado puede insertar una calificación para su viaje
DROP POLICY IF EXISTS "user_insert_rating" ON ag_trip_ratings;
CREATE POLICY "user_insert_rating" ON ag_trip_ratings FOR INSERT
  WITH CHECK (
    rater_user_id IN (SELECT id FROM ag_users WHERE auth_user_id = auth.uid())
  );

-- ── RPC para completar viaje (seguro) ────────────────────────────────────────
CREATE OR REPLACE FUNCTION ag_complete_trip(p_trip_request_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE ag_trip_requests
  SET status = 'completed', completed_at = now(), updated_at = now()
  WHERE id = p_trip_request_id
    AND status = 'accepted';
END;
$$;
