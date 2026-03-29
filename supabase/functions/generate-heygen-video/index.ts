// =============================================================================
// Edge Function: generate-heygen-video
// Genera un video con HeyGen API usando avatar + voz + guion del usuario.
// Deploy con: --no-verify-jwt
// =============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL         = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const HEYGEN_API_KEY       = Deno.env.get('HEYGEN_API_KEY') ?? '';

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

function decodeJwtPayload(token: string): { sub: string; email?: string } {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Invalid JWT');
  const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
  return JSON.parse(atob(b64));
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    if (!HEYGEN_API_KEY) return json({ error: 'HeyGen API key no configurada' }, 500);

    // ── 1. Verificar JWT ─────────────────────────────────────────────────────
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return json({ error: 'No autorizado' }, 401);

    const token = authHeader.replace('Bearer ', '');
    const jwtPayload = decodeJwtPayload(token);
    const userId = jwtPayload.sub;
    if (!userId) return json({ error: 'Token sin user ID' }, 401);

    // ── 2. Parsear body ──────────────────────────────────────────────────────
    const body = await req.json().catch(() => null);
    if (!body) return json({ error: 'Body requerido' }, 400);

    const { avatar_id, voice_id, script, title, dimension } = body as {
      avatar_id: string;
      voice_id: string;
      script: string;
      title?: string;
      dimension?: { width: number; height: number };
    };

    if (!avatar_id || !voice_id || !script) {
      return json({ error: 'avatar_id, voice_id y script son requeridos' }, 400);
    }

    // ── 3. Crear video en HeyGen ────────────────────────────────────────────
    const heygenRes = await fetch('https://api.heygen.com/v2/video/generate', {
      method: 'POST',
      headers: {
        'X-Api-Key': HEYGEN_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: title ?? 'Video PubliHazClick',
        dimension: dimension ?? { width: 1920, height: 1080 },
        video_inputs: [
          {
            character: {
              type: 'avatar',
              avatar_id,
              avatar_style: 'normal',
            },
            voice: {
              type: 'text',
              input_text: script,
              voice_id,
              speed: 1.0,
            },
          },
        ],
      }),
    });

    const heygenData = await heygenRes.json();

    if (!heygenRes.ok || heygenData.error) {
      console.error('HeyGen error:', JSON.stringify(heygenData));
      return json({ error: heygenData.error?.message ?? 'Error al generar video con HeyGen' }, 500);
    }

    const videoId = heygenData.data?.video_id;
    if (!videoId) return json({ error: 'No se obtuvo video_id de HeyGen' }, 500);

    console.log(`Video HeyGen creado: ${videoId} para user: ${userId}`);

    return json({
      video_id: videoId,
      status: 'processing',
      message: 'Video en proceso de generación. Puede tomar unos minutos.',
    });

  } catch (err) {
    console.error('Error inesperado:', err);
    return json({ error: 'Error interno del servidor' }, 500);
  }
});
