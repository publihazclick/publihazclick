// =============================================================================
// Edge Function: generate-reel-script
// Genera guiones para Reels de 60s usando Google Gemini API
// =============================================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const GEMINI_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

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
    // ── 1. Verificar JWT ──────────────────────────────────────────────────
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return json({ error: 'No autorizado' }, 401);
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const token = authHeader.replace('Bearer ', '');
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return json({ error: 'Token inválido o expirado' }, 401);
    }

    // Verificar rol: advertiser, admin o dev
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!profile || !['advertiser', 'admin', 'dev'].includes(profile.role)) {
      return json({ error: 'No tienes permisos para usar esta función' }, 403);
    }

    // ── 2. Parsear body ───────────────────────────────────────────────────
    const body = await req.json().catch(() => null);
    if (!body) return json({ error: 'Body inválido' }, 400);

    const { description, tone, audience } = body as {
      description: string;
      tone?: string;
      audience?: string;
    };

    if (!description || description.trim().length < 10) {
      return json({ error: 'La descripción debe tener al menos 10 caracteres' }, 400);
    }

    // ── 3. Construir prompt para Gemini ───────────────────────────────────
    const toneText = tone || 'profesional';
    const audienceText = audience || 'público general';

    const prompt = `Eres un director creativo experto en videos cortos para redes sociales (Reels/TikTok).

Genera un guión detallado para un Reel de exactamente 60 segundos sobre:
"${description.trim()}"

Tono: ${toneText}
Audiencia: ${audienceText}

REGLAS ESTRICTAS:
- Genera entre 6 y 8 tomas/escenas
- La suma de duraciones debe ser exactamente 60 segundos
- El hook (primera toma) debe captar atención en los primeros 3 segundos
- Cada toma debe tener una descripción visual clara para generar imágenes
- El texto de overlay debe ser corto (máximo 8 palabras)
- Las descripciones visuales deben ser en inglés para generación de imágenes IA
- Responde ÚNICAMENTE con JSON válido, sin markdown ni texto adicional

FORMATO JSON EXACTO:
{
  "title": "Título del Reel",
  "hook": "Frase gancho de los primeros 3 segundos",
  "scenes": [
    {
      "scene": 1,
      "duration_seconds": 8,
      "narration": "Texto de narración en español",
      "visual_description": "Visual description in English for AI image generation, cinematic style",
      "camera_direction": "Tipo de toma: Close-up / Wide shot / etc",
      "text_overlay": "Texto corto overlay"
    }
  ],
  "total_duration": 60,
  "music_suggestion": "Tipo de música recomendada"
}`;

    // ── 4. Llamar a Gemini API ────────────────────────────────────────────
    const geminiRes = await fetch(`${GEMINI_URL}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.9,
          topP: 0.95,
          maxOutputTokens: 2048,
        },
      }),
    });

    if (!geminiRes.ok) {
      const errBody = await geminiRes.text().catch(() => '');
      console.error('Gemini error:', geminiRes.status, errBody);
      return json({ error: 'Error al generar el guión. Intenta de nuevo.' }, 502);
    }

    const geminiData = await geminiRes.json();
    const rawText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!rawText) {
      return json({ error: 'No se recibió respuesta de la IA' }, 502);
    }

    // ── 5. Parsear JSON de la respuesta ───────────────────────────────────
    // Limpiar posibles bloques de markdown
    const cleanJson = rawText.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();

    let script;
    try {
      script = JSON.parse(cleanJson);
    } catch {
      console.error('JSON parse error. Raw:', rawText);
      return json({ error: 'La IA generó una respuesta inválida. Intenta de nuevo.' }, 502);
    }

    // Validar estructura mínima
    if (!script.scenes || !Array.isArray(script.scenes) || script.scenes.length < 3) {
      return json({ error: 'El guión generado no tiene suficientes escenas. Intenta de nuevo.' }, 502);
    }

    // ── 6. Responder ──────────────────────────────────────────────────────
    return json({
      success: true,
      script: {
        title: script.title || 'Guión sin título',
        hook: script.hook || '',
        scenes: script.scenes,
        total_duration: script.total_duration || 60,
        music_suggestion: script.music_suggestion || '',
      },
    });
  } catch (err) {
    console.error('Error inesperado:', err);
    return json({ error: 'Error interno del servidor' }, 500);
  }
});
