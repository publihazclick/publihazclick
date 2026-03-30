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

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: cors });
  }

  try {
    // Parsear body
    const body = await req.json().catch(() => null);
    if (!body?.topic || body.topic.trim().length < 3) {
      return json({ error: 'El tema debe tener al menos 3 caracteres' });
    }

    if (!YOUTUBE_API_KEY) {
      return json({ error: 'YouTube API no configurada' });
    }

    const query = encodeURIComponent(body.topic.trim());
    const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${query}&type=video&order=viewCount&maxResults=5&relevanceLanguage=es&key=${YOUTUBE_API_KEY}`;

    const ytRes = await fetch(url);
    if (!ytRes.ok) {
      return json({ error: 'Error consultando YouTube' });
    }

    const ytData = await ytRes.json();
    const titles = (ytData.items || []).map((item: { snippet: { title: string }; id: { videoId: string } }) => ({
      title: item.snippet.title,
      videoId: item.id.videoId,
    }));

    return json({ success: true, titles });
  } catch (err) {
    console.error('search-youtube-titles error:', err);
    return json({ error: 'Error interno del servidor' });
  }
});
