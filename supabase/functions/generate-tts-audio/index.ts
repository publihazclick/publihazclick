// =============================================================================
// Edge Function: generate-tts-audio
// Genera audio TTS usando Microsoft Edge Neural Voices (gratis, sin API key)
// =============================================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { UniversalEdgeTTS } from 'npm:edge-tts-universal@1.4.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function jsonError(msg: string, status = 400) {
  return new Response(JSON.stringify({ error: msg }), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: cors });
  }

  try {
    // ── 1. Verificar JWT ──────────────────────────────────────────────────
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return jsonError('No autorizado', 401);
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const token = authHeader.replace('Bearer ', '');
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return jsonError('Token inválido o expirado', 401);
    }

    // Verificar rol
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!profile || !['advertiser', 'admin', 'dev'].includes(profile.role)) {
      return jsonError('No tienes permisos para usar esta función', 403);
    }

    // ── 2. Parsear body ───────────────────────────────────────────────────
    const body = await req.json().catch(() => null);
    if (!body) return jsonError('Body inválido');

    const { text, voice } = body as { text: string; voice?: string };

    if (!text || text.trim().length < 2) {
      return jsonError('El texto debe tener al menos 2 caracteres');
    }

    if (text.trim().length > 2000) {
      return jsonError('El texto no puede exceder 2000 caracteres');
    }

    // ── 3. Generar audio TTS ──────────────────────────────────────────────
    const selectedVoice = voice || 'es-CO-GonzaloNeural';

    const tts = new UniversalEdgeTTS(text.trim(), selectedVoice);
    const result = await tts.synthesize();
    const audioBuffer = await result.audio.arrayBuffer();

    // ── 4. Retornar audio ─────────────────────────────────────────────────
    return new Response(new Uint8Array(audioBuffer), {
      status: 200,
      headers: {
        ...cors,
        'Content-Type': 'audio/mpeg',
        'Content-Disposition': 'inline; filename="tts-audio.mp3"',
      },
    });
  } catch (err) {
    console.error('TTS Error:', err);
    return jsonError('Error al generar audio TTS. Intenta de nuevo.', 500);
  }
});
