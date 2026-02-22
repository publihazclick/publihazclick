-- =============================================
-- Storage Buckets Setup for PublihazClick
-- =============================================

-- Create bucket for PTC Ads images
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types, created_at, updated_at)
VALUES (
  'ptc-ads',
  'ptc-ads',
  true,
  5242880, -- 5MB in bytes
  ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'],
  NOW(),
  NOW()
)
ON CONFLICT (id) DO NOTHING;

-- Create bucket for Banner images
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types, created_at, updated_at)
VALUES (
  'banners',
  'banners',
  true,
  5242880, -- 5MB in bytes
  ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'],
  NOW(),
  NOW()
)
ON CONFLICT (id) DO NOTHING;

-- Create bucket for Profile images
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types, created_at, updated_at)
VALUES (
  'profiles',
  'profiles',
  true,
  5242880, -- 5MB in bytes
  ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'],
  NOW(),
  NOW()
)
ON CONFLICT (id) DO NOTHING;

-- =============================================
-- RLS Policies for Public Access (Reading)
-- =============================================

-- PTC Ads: Public read access
DROP POLICY IF EXISTS "Public Access ptc-ads" ON storage.objects;
CREATE POLICY "Public Access ptc-ads"
ON storage.objects FOR SELECT
USING (bucket_id = 'ptc-ads');

-- Banners: Public read access
DROP POLICY IF EXISTS "Public Access banners" ON storage.objects;
CREATE POLICY "Public Access banners"
ON storage.objects FOR SELECT
USING (bucket_id = 'banners');

-- Profiles: Public read access
DROP POLICY IF EXISTS "Public Access profiles" ON storage.objects;
CREATE POLICY "Public Access profiles"
ON storage.objects FOR SELECT
USING (bucket_id = 'profiles');

-- =============================================
-- RLS Policies for Authenticated Uploads
-- =============================================

-- Allow authenticated users to upload PTC ads
DROP POLICY IF EXISTS "Authenticated can upload ptc-ads" ON storage.objects;
CREATE POLICY "Authenticated can upload ptc-ads"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'ptc-ads' 
  AND auth.role() IN ('authenticated', 'service_role')
);

-- Allow authenticated users to upload banners
DROP POLICY IF EXISTS "Authenticated can upload banners" ON storage.objects;
CREATE POLICY "Authenticated can upload banners"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'banners' 
  AND auth.role() IN ('authenticated', 'service_role')
);

-- Allow authenticated users to upload profiles
DROP POLICY IF EXISTS "Authenticated can upload profiles" ON storage.objects;
CREATE POLICY "Authenticated can upload profiles"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'profiles' 
  AND auth.role() IN ('authenticated', 'service_role')
);

-- =============================================
-- RLS Policies for User Updates (Own files)
-- =============================================

-- Allow users to update their own PTC ads
DROP POLICY IF EXISTS "Users can update ptc-ads" ON storage.objects;
CREATE POLICY "Users can update ptc-ads"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'ptc-ads' 
  AND auth.role() IN ('authenticated', 'service_role')
);

-- Allow users to update their own banners
DROP POLICY IF EXISTS "Users can update banners" ON storage.objects;
CREATE POLICY "Users can update banners"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'banners' 
  AND auth.role() IN ('authenticated', 'service_role')
);

-- Allow users to update their own profiles
DROP POLICY IF EXISTS "Users can update profiles" ON storage.objects;
CREATE POLICY "Users can update profiles"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'profiles' 
  AND auth.role() IN ('authenticated', 'service_role')
);

-- =============================================
-- RLS Policies for Deletion (Admin only)
-- =============================================

-- Allow service role to delete PTC ads
DROP POLICY IF EXISTS "Service can delete ptc-ads" ON storage.objects;
CREATE POLICY "Service can delete ptc-ads"
ON storage.objects FOR DELETE
USING (auth.role() = 'service_role');

-- Allow service role to delete banners
DROP POLICY IF EXISTS "Service can delete banners" ON storage.objects;
CREATE POLICY "Service can delete banners"
ON storage.objects FOR DELETE
USING (auth.role() = 'service_role');

-- Allow service role to delete profiles
DROP POLICY IF EXISTS "Service can delete profiles" ON storage.objects;
CREATE POLICY "Service can delete profiles"
ON storage.objects FOR DELETE
USING (auth.role() = 'service_role');

-- =============================================
-- Verify buckets were created
-- =============================================
SELECT id, name, public, file_size_limit 
FROM storage.buckets 
WHERE id IN ('ptc-ads', 'banners', 'profiles');
