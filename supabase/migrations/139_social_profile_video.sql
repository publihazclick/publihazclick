-- Add video_url to social_business_profiles
ALTER TABLE public.social_business_profiles
  ADD COLUMN IF NOT EXISTS video_url TEXT;
