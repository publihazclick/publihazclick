// ag-tts: convierte texto a voz usando OpenAI TTS y retorna MP3
// El cliente lo reproduce con new Audio() — funciona en TODO Android WebView
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const url  = new URL(req.url);
    const text = (url.searchParams.get('text') || '').slice(0, 300);
    if (!text) return new Response('missing text', { status: 400, headers: CORS });

    const OPENAI_KEY = Deno.env.get('OPENAI_API_KEY');
    if (!OPENAI_KEY) return new Response('no key', { status: 500, headers: CORS });

    const res = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'tts-1',      // más rápido que tts-1-hd, suficiente para nav
        voice: 'nova',       // voz femenina cálida, clara, similar a Google Maps
        input: text,
        speed: 1.0,
        response_format: 'mp3',
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error('OpenAI TTS error:', res.status, err);
      return new Response('tts error', { status: 502, headers: CORS });
    }

    const audio = await res.arrayBuffer();
    return new Response(audio, {
      headers: {
        ...CORS,
        'Content-Type': 'audio/mpeg',
        'Cache-Control': 'public, max-age=86400', // 24h cache — mismas instrucciones = mismo audio
      },
    });
  } catch (e) {
    console.error('ag-tts error:', e);
    return new Response('error', { status: 500, headers: CORS });
  }
});
