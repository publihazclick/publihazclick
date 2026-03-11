// =============================================================================
// Edge Function: generate-reel-script
// Genera guiones adaptados por plataforma usando Google Gemini API
// Plataformas: tiktok | instagram | facebook | shorts | youtube
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

// ─── Configuración por plataforma ─────────────────────────────────────────────

interface PlatformConfig {
  name: string;
  format: 'short-form' | 'long-form';
  duration: number;         // segundos totales del video
  min_scenes: number;
  max_scenes: number;
  hook_seconds: number;     // segundos máx para el hook
  cta: string;              // CTA sugerida
  hashtag_count: number;    // cuántos hashtags generar
  overlay_max_words: number; // palabras máx en text overlay
  tips: string;             // consejos específicos de la plataforma
  seo_label: string;        // nombre del campo SEO principal
}

const PLATFORM_CONFIGS: Record<string, PlatformConfig> = {
  tiktok: {
    name: 'TikTok',
    format: 'short-form',
    duration: 45,
    min_scenes: 4,
    max_scenes: 6,
    hook_seconds: 1,
    cta: 'Sígueme para más 👉 @usuario',
    hashtag_count: 5,
    overlay_max_words: 5,
    tips: 'Hook EXTREMADAMENTE rápido (menos de 1 segundo), ritmo acelerado, usa sonidos trending, CTA directo al final. El scroll es implacable — atrapa inmediatamente.',
    seo_label: 'Hashtags',
  },
  instagram: {
    name: 'Instagram Reels',
    format: 'short-form',
    duration: 30,
    min_scenes: 3,
    max_scenes: 5,
    hook_seconds: 2,
    cta: 'Guarda este reel 💾 y sígueme para más',
    hashtag_count: 10,
    overlay_max_words: 6,
    tips: 'Visualmente estético, colores vibrantes, texto overlay grande y legible, música trending. Primera imagen debe ser impactante para el thumbnail.',
    seo_label: 'Hashtags',
  },
  facebook: {
    name: 'Facebook Reels',
    format: 'short-form',
    duration: 60,
    min_scenes: 5,
    max_scenes: 8,
    hook_seconds: 3,
    cta: 'Comparte con alguien que necesite esto 👫',
    hashtag_count: 3,
    overlay_max_words: 8,
    tips: 'Storytelling emocional, SIEMPRE incluir subtítulos (70% ve sin sonido), contenido compartible y de valor para la comunidad. CTAs de compartir.',
    seo_label: 'Descripción',
  },
  shorts: {
    name: 'YouTube Shorts',
    format: 'short-form',
    duration: 58,
    min_scenes: 5,
    max_scenes: 8,
    hook_seconds: 2,
    cta: 'Suscríbete para más 🔔 Dale like si te ayudó',
    hashtag_count: 4,
    overlay_max_words: 7,
    tips: 'Loop perfecto (el final conecta con el inicio), pregunta intrigante en el hook, responde al final. Usar #Shorts en el título.',
    seo_label: 'Hashtags',
  },
  youtube: {
    name: 'YouTube',
    format: 'long-form',
    duration: 480,
    min_scenes: 8,
    max_scenes: 14,
    hook_seconds: 15,
    cta: 'Dale like y suscríbete si esto te ayudó 👍 Comenta tu pregunta abajo',
    hashtag_count: 8,
    overlay_max_words: 10,
    tips: 'Hook de 15s con promesa de valor, intro de 30s, desarrollo profundo con ejemplos, múltiples CTAs (like al inicio, suscribirse a mitad, comentar al final). Incluir capítulos.',
    seo_label: 'Tags/Palabras clave',
  },
};

// ─── Handler ──────────────────────────────────────────────────────────────────

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
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return json({ error: 'Token inválido o expirado' }, 401);
    }

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

    const {
      description,
      tone,
      audience,
      platform,
      video_type,
      niche,
      monetization,
    } = body as {
      description: string;
      tone?: string;
      audience?: string;
      platform?: string;
      video_type?: string;
      niche?: string;
      monetization?: string;
    };

    if (!description || description.trim().length < 10) {
      return json({ error: 'La descripción debe tener al menos 10 caracteres' }, 400);
    }

    // ── 3. Resolver config de plataforma ──────────────────────────────────
    const platformKey = platform?.toLowerCase() ?? 'shorts';
    const cfg = PLATFORM_CONFIGS[platformKey] ?? PLATFORM_CONFIGS['shorts'];

    const toneText = tone || 'profesional';
    const audienceText = audience || 'público general';
    const nicheText = niche || 'general';
    const monetizationText = monetization || 'marca personal';
    const videoTypeText = video_type || 'tutorial';

    const isLongForm = cfg.format === 'long-form';

    // ── 4. Construir prompt para Gemini ───────────────────────────────────

    const shortFormPrompt = `Eres un director creativo experto en videos cortos virales para ${cfg.name}.

Genera un guión para un video de ${cfg.name} de exactamente ${cfg.duration} segundos sobre:
"${description.trim()}"

CONTEXTO:
- Plataforma: ${cfg.name}
- Tipo de video: ${videoTypeText}
- Nicho: ${nicheText}
- Monetización: ${monetizationText}
- Tono: ${toneText}
- Audiencia: ${audienceText}

REGLAS DE ${cfg.name.toUpperCase()}:
- ${cfg.tips}
- El hook debe captar atención en los primeros ${cfg.hook_seconds} segundo(s) — CRÍTICO
- Genera entre ${cfg.min_scenes} y ${cfg.max_scenes} escenas
- La suma de duraciones debe ser exactamente ${cfg.duration} segundos
- Text overlay máximo ${cfg.overlay_max_words} palabras
- Las descripciones visuales SIEMPRE en inglés (para generación IA)
- CTA final sugerida: "${cfg.cta}"

RESPONDE ÚNICAMENTE con JSON válido (sin markdown):
{
  "title": "Título atractivo del video",
  "hook": "Frase gancho — máximo ${cfg.hook_seconds}s para captar atención",
  "scenes": [
    {
      "scene": 1,
      "duration_seconds": 5,
      "narration": "Texto que se dice en español, natural y fluido",
      "visual_description": "Cinematic visual description in English for AI image generation",
      "camera_direction": "Close-up / Wide shot / POV / etc",
      "text_overlay": "Texto overlay corto"
    }
  ],
  "total_duration": ${cfg.duration},
  "cta": "${cfg.cta}",
  "music_suggestion": "Tipo de música o sonido trending para ${cfg.name}",
  "seo": {
    "title": "Título optimizado con palabra clave principal",
    "hashtags": ["hashtag1", "hashtag2"],
    "description": "Descripción/caption optimizado para ${cfg.name} con CTA"
  }
}`;

    const longFormPrompt = `Eres un guionista experto en videos de YouTube de larga duración.

Genera un guión detallado para un video de YouTube de ${Math.round(cfg.duration / 60)} minutos sobre:
"${description.trim()}"

CONTEXTO:
- Tipo de video: ${videoTypeText}
- Nicho: ${nicheText}
- Monetización: ${monetizationText}
- Tono: ${toneText}
- Audiencia: ${audienceText}

ESTRUCTURA DE YOUTUBE (${Math.round(cfg.duration / 60)} min):
- Hook (0-${cfg.hook_seconds}s): Promesa de valor y por qué quedarse
- Intro (15-45s): Quién eres, de qué trata el video
- Desarrollo: ${cfg.min_scenes}-${cfg.max_scenes} secciones con contenido de valor
- Cierre: Resumen + CTA múltiple (like + suscribirse + comentar)
- ${cfg.tips}

REGLAS:
- Genera entre ${cfg.min_scenes} y ${cfg.max_scenes} escenas/secciones
- La suma de duraciones debe ser ~${cfg.duration} segundos
- Text overlay máximo ${cfg.overlay_max_words} palabras
- Descripciones visuales SIEMPRE en inglés
- Incluir capítulos con timestamps

RESPONDE ÚNICAMENTE con JSON válido (sin markdown):
{
  "title": "Título con palabra clave + número o promesa",
  "hook": "Promesa de valor de los primeros ${cfg.hook_seconds} segundos",
  "scenes": [
    {
      "scene": 1,
      "duration_seconds": 15,
      "narration": "Texto de narración detallado en español",
      "visual_description": "Detailed cinematic visual description in English",
      "camera_direction": "Talking head / Screen recording / B-roll / etc",
      "text_overlay": "Texto overlay o título de capítulo"
    }
  ],
  "total_duration": ${cfg.duration},
  "cta": "${cfg.cta}",
  "music_suggestion": "Música de fondo recomendada para YouTube",
  "chapters": [
    { "timestamp": "0:00", "title": "Intro" },
    { "timestamp": "0:30", "title": "Sección 1" }
  ],
  "seo": {
    "title": "Título SEO con keyword principal + atractivo click",
    "hashtags": ["hashtag1", "keyword2"],
    "description": "Descripción larga para YouTube con keywords, timestamps y CTA"
  }
}`;

    const prompt = isLongForm ? longFormPrompt : shortFormPrompt;

    // ── 5. Llamar a Gemini API ────────────────────────────────────────────
    const geminiRes = await fetch(`${GEMINI_URL}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.85,
          topP: 0.95,
          maxOutputTokens: isLongForm ? 4096 : 2048,
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

    // ── 6. Parsear JSON de la respuesta ───────────────────────────────────
    const cleanJson = rawText.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();

    let script;
    try {
      script = JSON.parse(cleanJson);
    } catch {
      console.error('JSON parse error. Raw:', rawText);
      return json({ error: 'La IA generó una respuesta inválida. Intenta de nuevo.' }, 502);
    }

    if (!script.scenes || !Array.isArray(script.scenes) || script.scenes.length < cfg.min_scenes) {
      return json({ error: 'El guión generado no tiene suficientes escenas. Intenta de nuevo.' }, 502);
    }

    // ── 7. Responder ──────────────────────────────────────────────────────
    return json({
      success: true,
      platform: platformKey,
      platform_config: {
        name: cfg.name,
        format: cfg.format,
        duration: cfg.duration,
        aspect: platformKey === 'youtube' ? '16:9' : (platformKey === 'facebook' ? '16:9' : '9:16'),
        hashtag_count: cfg.hashtag_count,
        seo_label: cfg.seo_label,
      },
      script: {
        title: script.title || 'Guión sin título',
        hook: script.hook || '',
        scenes: script.scenes,
        total_duration: script.total_duration || cfg.duration,
        cta: script.cta || cfg.cta,
        music_suggestion: script.music_suggestion || '',
        chapters: script.chapters || null,
        seo: script.seo || null,
      },
    });
  } catch (err) {
    console.error('Error inesperado:', err);
    return json({ error: 'Error interno del servidor' }, 500);
  }
});
