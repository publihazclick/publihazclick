import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const HEYGEN_API_KEY = Deno.env.get('HEYGEN_API_KEY') ?? '';

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

function decodeJwtPayload(token: string): { sub: string } {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Invalid JWT');
  return JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    if (!HEYGEN_API_KEY) return json({ error: 'HeyGen API key no configurada' }, 500);

    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return json({ error: 'No autorizado' }, 401);

    const userId = decodeJwtPayload(authHeader.replace('Bearer ', '')).sub;
    if (!userId) return json({ error: 'Token sin user ID' }, 401);

    const body = await req.json().catch(() => null);
    if (!body) return json({ error: 'Body requerido' }, 400);

    const { avatar_id, talking_photo_id, voice_id, script, title, dimension, character_type } = body;

    if (!voice_id || !script) return json({ error: 'voice_id y script son requeridos' }, 400);

    // Construir character config según el tipo
    let character: Record<string, unknown>;
    if (character_type === 'talking_photo' && talking_photo_id) {
      character = { type: 'talking_photo', talking_photo_id };
    } else if (avatar_id) {
      character = { type: 'avatar', avatar_id, avatar_style: 'normal' };
    } else {
      return json({ error: 'avatar_id o talking_photo_id requerido' }, 400);
    }

    const heygenRes = await fetch('https://api.heygen.com/v2/video/generate', {
      method: 'POST',
      headers: {
        'X-Api-Key': HEYGEN_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: title ?? 'Video PubliHazClick',
        dimension: dimension ?? { width: 1920, height: 1080 },
        video_inputs: [{
          character,
          voice: { type: 'text', input_text: script, voice_id, speed: 1.0 },
        }],
      }),
    });

    const heygenData = await heygenRes.json();

    if (!heygenRes.ok || heygenData.error) {
      console.error('HeyGen error:', JSON.stringify(heygenData));
      return json({ error: heygenData.error?.message ?? 'Error al generar video' }, 500);
    }

    const videoId = heygenData.data?.video_id;
    if (!videoId) return json({ error: 'No se obtuvo video_id' }, 500);

    return json({ video_id: videoId, status: 'processing', message: 'Video en proceso de generacion.' });

  } catch (err) {
    console.error('Error:', err);
    return json({ error: 'Error interno del servidor' }, 500);
  }
});
