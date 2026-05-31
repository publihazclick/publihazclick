// ag-tts: proxy de Google Translate TTS (gratuito, sin API key)
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const url  = new URL(req.url);
    const text = (url.searchParams.get('text') || '').slice(0, 200);
    if (!text) return new Response('missing text', { status: 400, headers: CORS });

    const ttsUrl = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(text)}&tl=es&client=tw-ob`;

    const res = await fetch(ttsUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 10; Mobile) AppleWebKit/537.36',
        'Referer': 'https://translate.google.com/',
      },
    });

    if (!res.ok) return new Response('tts error', { status: 502, headers: CORS });

    const audio = await res.arrayBuffer();
    return new Response(audio, {
      headers: {
        ...CORS,
        'Content-Type': 'audio/mpeg',
        'Cache-Control': 'public, max-age=86400',
      },
    });
  } catch (e) {
    return new Response('error', { status: 500, headers: CORS });
  }
});
