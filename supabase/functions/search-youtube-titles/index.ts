import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const YOUTUBE_API_KEY = Deno.env.get('YOUTUBE_API_KEY') ?? '';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

function formatViews(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace('.0', '') + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace('.0', '') + 'K';
  return String(n);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: cors });
  }

  try {
    const body = await req.json().catch(() => null);
    if (!body?.topic || body.topic.trim().length < 3) {
      return json({ error: 'El tema debe tener al menos 3 caracteres' });
    }

    if (!YOUTUBE_API_KEY) {
      return json({ error: 'YouTube API no configurada' });
    }

    const query = encodeURIComponent(body.topic.trim());

    // Paso 1: Buscar 20 videos mas vistos sobre el tema
    const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${query}&type=video&order=viewCount&maxResults=20&relevanceLanguage=es&key=${YOUTUBE_API_KEY}`;
    const searchRes = await fetch(searchUrl);
    if (!searchRes.ok) {
      return json({ error: 'Error consultando YouTube' });
    }

    const searchData = await searchRes.json();
    const items = searchData.items || [];
    if (!items.length) {
      return json({ success: true, titles: [] });
    }

    // Paso 2: Obtener estadisticas reales de cada video
    const videoIds = items.map((item: { id: { videoId: string } }) => item.id.videoId).join(',');
    const statsUrl = `https://www.googleapis.com/youtube/v3/videos?part=statistics,snippet&id=${videoIds}&key=${YOUTUBE_API_KEY}`;
    const statsRes = await fetch(statsUrl);
    if (!statsRes.ok) {
      return json({ error: 'Error obteniendo estadísticas' });
    }

    const statsData = await statsRes.json();

    // Paso 3: Ordenar por vistas reales (mayor a menor) y tomar top 5
    const videos = (statsData.items || [])
      .map((v: { id: string; snippet: { title: string; channelTitle: string; thumbnails: { medium: { url: string } } }; statistics: { viewCount: string; likeCount: string } }) => ({
        title: v.snippet.title,
        videoId: v.id,
        channel: v.snippet.channelTitle,
        thumbnail: v.snippet.thumbnails?.medium?.url || '',
        views: parseInt(v.statistics.viewCount || '0', 10),
        viewsFormatted: formatViews(parseInt(v.statistics.viewCount || '0', 10)),
        likes: parseInt(v.statistics.likeCount || '0', 10),
        likesFormatted: formatViews(parseInt(v.statistics.likeCount || '0', 10)),
      }))
      .sort((a: { views: number }, b: { views: number }) => b.views - a.views)
      .slice(0, 5);

    return json({ success: true, titles: videos });
  } catch (err) {
    console.error('search-youtube-titles error:', err);
    return json({ error: 'Error interno del servidor' });
  }
});
