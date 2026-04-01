// =============================================================================
// Edge Function: youtube-cache-refresh
// Fetches courses from YouTube API and stores them in Supabase.
// Called once daily (or on-demand) to keep cache fresh.
// Deploy with: supabase functions deploy youtube-cache-refresh --no-verify-jwt
// =============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const YOUTUBE_API_KEY = Deno.env.get('YOUTUBE_API_KEY') ?? '';
const YT_API = 'https://www.googleapis.com/youtube/v3';

const CATEGORIES = [
  'Marketing Digital',
  'Creación de Contenido',
  'Creación de Marca',
  'Dropshipping',
  'Importación y Exportación',
  'E-commerce',
  'Redes Sociales',
  'SEO y Posicionamiento',
  'Google Ads',
  'Facebook Ads',
  'Diseño Gráfico',
  'Edición de Video',
  'Finanzas Personales',
  'Emprendimiento',
  'Programación',
  'Inteligencia Artificial',
];

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface YTSearchItem {
  id: { videoId?: string };
  snippet: { title: string };
}

interface YTVideoItem {
  id: string;
  snippet: {
    title: string;
    description: string;
    thumbnails: { high?: { url: string }; medium?: { url: string } };
    channelTitle: string;
    channelId: string;
    publishedAt: string;
  };
  contentDetails: { duration: string };
  statistics: { viewCount: string; likeCount: string };
}

function decodeHtml(html: string): string {
  return html
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'");
}

function parseDuration(iso: string): string {
  if (!iso) return '';
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return '';
  const h = parseInt(match[1] ?? '0', 10);
  const m = parseInt(match[2] ?? '0', 10);
  const s = parseInt(match[3] ?? '0', 10);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

async function fetchCoursesForCategory(category: string): Promise<YTVideoItem[]> {
  const searchQuery = `curso completo gratis ${category}`;
  const searchParams = new URLSearchParams({
    part: 'snippet',
    type: 'video',
    q: searchQuery,
    maxResults: '12',
    order: 'relevance',
    relevanceLanguage: 'es',
    safeSearch: 'strict',
    key: YOUTUBE_API_KEY,
  });

  const searchRes = await fetch(`${YT_API}/search?${searchParams}`);
  if (!searchRes.ok) throw new Error(`Search failed: ${searchRes.status}`);
  const searchData = await searchRes.json();

  const videoIds = (searchData.items ?? [])
    .filter((i: YTSearchItem) => i.id.videoId)
    .map((i: YTSearchItem) => i.id.videoId)
    .join(',');

  if (!videoIds) return [];

  const detailParams = new URLSearchParams({
    part: 'snippet,contentDetails,statistics',
    id: videoIds,
    key: YOUTUBE_API_KEY,
  });

  const detailRes = await fetch(`${YT_API}/videos?${detailParams}`);
  if (!detailRes.ok) throw new Error(`Details failed: ${detailRes.status}`);
  const detailData = await detailRes.json();

  return detailData.items ?? [];
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: cors });
  }

  if (!YOUTUBE_API_KEY) {
    return new Response(
      JSON.stringify({ error: 'YOUTUBE_API_KEY not set' }),
      { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } },
    );
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  // Optional: refresh only specific category
  const url = new URL(req.url);
  const onlyCategory = url.searchParams.get('category');
  const categoriesToRefresh = onlyCategory
    ? CATEGORIES.filter(c => c.toLowerCase() === onlyCategory.toLowerCase())
    : CATEGORIES;

  const results: Record<string, number> = {};
  let errors: string[] = [];

  for (const category of categoriesToRefresh) {
    try {
      const videos = await fetchCoursesForCategory(category);

      if (videos.length > 0) {
        // Upsert courses
        const rows = videos.map((v: YTVideoItem) => ({
          category,
          video_id: v.id,
          title: decodeHtml(v.snippet.title),
          description: (v.snippet.description ?? '').substring(0, 300),
          thumbnail: v.snippet.thumbnails.high?.url ?? v.snippet.thumbnails.medium?.url ?? '',
          channel_name: v.snippet.channelTitle,
          channel_id: v.snippet.channelId,
          published_at: v.snippet.publishedAt,
          view_count: parseInt(v.statistics.viewCount ?? '0', 10),
          like_count: parseInt(v.statistics.likeCount ?? '0', 10),
          duration: parseDuration(v.contentDetails.duration),
          cached_at: new Date().toISOString(),
        }));

        const { error } = await supabase
          .from('youtube_courses_cache')
          .upsert(rows, { onConflict: 'category,video_id' });

        if (error) {
          errors.push(`${category}: DB error - ${error.message}`);
        } else {
          results[category] = videos.length;
        }

        // Update meta
        await supabase
          .from('youtube_cache_meta')
          .upsert({
            category,
            last_refreshed: new Date().toISOString(),
            course_count: videos.length,
          }, { onConflict: 'category' });
      }

      // Small delay to respect API rate limits
      await new Promise(r => setTimeout(r, 200));
    } catch (err) {
      errors.push(`${category}: ${String(err)}`);
    }
  }

  const totalCourses = Object.values(results).reduce((a, b) => a + b, 0);

  return new Response(
    JSON.stringify({
      ok: true,
      refreshed: Object.keys(results).length,
      totalCourses,
      results,
      errors: errors.length > 0 ? errors : undefined,
    }),
    {
      status: 200,
      headers: { ...cors, 'Content-Type': 'application/json' },
    },
  );
});
