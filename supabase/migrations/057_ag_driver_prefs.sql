-- =============================================================================
-- Migration 057: Anda y Gana — Preferencias y configuración del conductor
-- =============================================================================

ALTER TABLE ag_drivers
  ADD COLUMN IF NOT EXISTS max_distance_km   integer NOT NULL DEFAULT 20,
  ADD COLUMN IF NOT EXISTS accepts_pets      boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS accepts_luggage   boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS accepts_child_seat boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS hide_phone        boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS notify_sound      boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_vibration  boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS is_online         boolean NOT NULL DEFAULT false;
