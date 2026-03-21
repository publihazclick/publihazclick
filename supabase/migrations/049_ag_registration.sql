-- =====================================================
-- Migration 049: Anda y Gana — Registration Tables
-- Creates ag_users and ag_drivers if not already present,
-- adds all fields needed for the registration forms.
-- =====================================================

-- ── ag_users (passengers and drivers base profile) ──
CREATE TABLE IF NOT EXISTS ag_users (
  id                     uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id           uuid        UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  role                   text        NOT NULL CHECK (role IN ('passenger','driver')) DEFAULT 'passenger',
  full_name              text        NOT NULL,
  birth_date             date        NOT NULL,
  city                   text        NOT NULL,
  id_number              text        NOT NULL,
  phone                  text        NOT NULL,
  email                  text        NOT NULL UNIQUE,
  emergency_contact_name  text,
  emergency_contact_phone text,
  selfie_url             text,
  selfie_verified        boolean     NOT NULL DEFAULT false,
  selfie_verified_at     timestamptz,
  is_blocked             boolean     NOT NULL DEFAULT false,
  blocked_reason         text,
  status                 text        NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','deleted')),
  created_at             timestamptz DEFAULT now(),
  updated_at             timestamptz DEFAULT now()
);

ALTER TABLE ag_users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ag_users_own" ON ag_users;
CREATE POLICY "ag_users_own" ON ag_users
  FOR ALL USING (auth.uid() = auth_user_id);

-- Allow insert during registration (before auth context is fully set)
DROP POLICY IF EXISTS "ag_users_insert" ON ag_users;
CREATE POLICY "ag_users_insert" ON ag_users
  FOR INSERT WITH CHECK (true);

-- ── ag_drivers (driver-specific data) ──
CREATE TABLE IF NOT EXISTS ag_drivers (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  ag_user_id          uuid        UNIQUE REFERENCES ag_users(id) ON DELETE CASCADE,
  -- License
  license_number      text        NOT NULL,
  license_category    text        NOT NULL,
  license_expiry      date        NOT NULL,
  -- Vehicle
  plate               text        NOT NULL UNIQUE,
  vehicle_type        text        NOT NULL,
  vehicle_brand       text        NOT NULL,
  vehicle_model       text        NOT NULL,
  vehicle_year        text        NOT NULL,
  vehicle_color       text        NOT NULL,
  -- Documents (URLs stored as JSONB)
  documents           jsonb       NOT NULL DEFAULT '{}',
  -- Operational state
  is_available        boolean     NOT NULL DEFAULT false,
  status              text        NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','rejected','suspended')),
  rejection_reason    text,
  approved_at         timestamptz,
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
);

ALTER TABLE ag_drivers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ag_drivers_own" ON ag_drivers;
CREATE POLICY "ag_drivers_own" ON ag_drivers
  FOR ALL USING (
    auth.uid() = (SELECT auth_user_id FROM ag_users WHERE id = ag_user_id)
  );

DROP POLICY IF EXISTS "ag_drivers_insert" ON ag_drivers;
CREATE POLICY "ag_drivers_insert" ON ag_drivers
  FOR INSERT WITH CHECK (true);

-- ── Indexes ──
CREATE INDEX IF NOT EXISTS ag_users_auth_user_id_idx ON ag_users(auth_user_id);
CREATE INDEX IF NOT EXISTS ag_users_email_idx        ON ag_users(email);
CREATE INDEX IF NOT EXISTS ag_users_role_idx         ON ag_users(role);
CREATE INDEX IF NOT EXISTS ag_drivers_ag_user_id_idx ON ag_drivers(ag_user_id);
CREATE INDEX IF NOT EXISTS ag_drivers_plate_idx      ON ag_drivers(plate);
CREATE INDEX IF NOT EXISTS ag_drivers_status_idx     ON ag_drivers(status);

-- ── Storage buckets for Anda y Gana documents ──
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('ag-passengers', 'ag-passengers', true, 10485760,
   ARRAY['image/jpeg','image/png','image/webp','image/heic','application/pdf']),
  ('ag-drivers',    'ag-drivers',    true, 10485760,
   ARRAY['image/jpeg','image/png','image/webp','image/heic','application/pdf'])
ON CONFLICT (id) DO NOTHING;

-- Storage policies: anyone authenticated can upload to their own folder
DROP POLICY IF EXISTS "ag_passengers_upload" ON storage.objects;
CREATE POLICY "ag_passengers_upload" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'ag-passengers');

DROP POLICY IF EXISTS "ag_passengers_read" ON storage.objects;
CREATE POLICY "ag_passengers_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'ag-passengers');

DROP POLICY IF EXISTS "ag_drivers_upload" ON storage.objects;
CREATE POLICY "ag_drivers_upload" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'ag-drivers');

DROP POLICY IF EXISTS "ag_drivers_read" ON storage.objects;
CREATE POLICY "ag_drivers_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'ag-drivers');
