-- =============================================
-- Add youtube_url and updated_at columns to ptc_tasks
-- Also add location column if missing, and update RLS
-- =============================================

-- Add youtube_url column for YouTube video embedding
ALTER TABLE ptc_tasks ADD COLUMN IF NOT EXISTS youtube_url TEXT;

-- Add updated_at column
ALTER TABLE ptc_tasks ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Add location column if not present
ALTER TABLE ptc_tasks ADD COLUMN IF NOT EXISTS location VARCHAR(20) DEFAULT 'app';

-- Allow admin/dev roles to manage all PTC tasks
DO $body$
BEGIN
  -- Drop existing restrictive policy if it exists
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'ptc_tasks'
    AND policyname = 'Admins can manage all PTC tasks'
  ) THEN
    DROP POLICY "Admins can manage all PTC tasks" ON ptc_tasks;
  END IF;
END $body$;

CREATE POLICY "Admins can manage all PTC tasks"
  ON ptc_tasks FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('admin', 'dev')
    )
  );

-- Create index on youtube_url for quick lookups
CREATE INDEX IF NOT EXISTS idx_ptc_tasks_youtube_url ON ptc_tasks(youtube_url) WHERE youtube_url IS NOT NULL;

-- Create index on location
CREATE INDEX IF NOT EXISTS idx_ptc_tasks_location ON ptc_tasks(location);
