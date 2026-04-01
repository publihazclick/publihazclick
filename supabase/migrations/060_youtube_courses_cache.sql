-- =============================================================================
-- YouTube courses cache table
-- Stores course results from YouTube API so users always see content
-- Refreshed daily by Edge Function youtube-cache-refresh
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.youtube_courses_cache (
  id BIGSERIAL PRIMARY KEY,
  category TEXT NOT NULL,
  video_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  thumbnail TEXT,
  channel_name TEXT,
  channel_id TEXT,
  published_at TIMESTAMPTZ,
  view_count BIGINT DEFAULT 0,
  like_count BIGINT DEFAULT 0,
  duration TEXT,
  cached_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(category, video_id)
);

-- Index for fast category lookups
CREATE INDEX IF NOT EXISTS idx_yt_cache_category ON public.youtube_courses_cache(category);
CREATE INDEX IF NOT EXISTS idx_yt_cache_cached_at ON public.youtube_courses_cache(cached_at);

-- RLS: anyone can read, only service role can write
ALTER TABLE public.youtube_courses_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read youtube cache"
  ON public.youtube_courses_cache FOR SELECT
  USING (true);

-- Table to track last refresh per category
CREATE TABLE IF NOT EXISTS public.youtube_cache_meta (
  category TEXT PRIMARY KEY,
  last_refreshed TIMESTAMPTZ DEFAULT now(),
  course_count INT DEFAULT 0
);

ALTER TABLE public.youtube_cache_meta ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read cache meta"
  ON public.youtube_cache_meta FOR SELECT
  USING (true);
