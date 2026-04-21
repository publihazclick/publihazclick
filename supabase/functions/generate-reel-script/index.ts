// =============================================================================
// Edge Function: generate-reel-script
// Genera guiones adaptados por plataforma usando Google Gemini API
// Plataformas: tiktok | instagram | facebook | shorts | youtube
// =============================================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY') ?? '';
const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY') ?? '';
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
  duration: number;
  min_scenes: number;
  max_scenes: number;
  hook_seconds: number;
  cta: string;
  hashtag_count: number;
  overlay_max_words: number;
  tips: string;
  seo_label: string;
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

    if (!profile) {
      return json({ error: 'Perfil no encontrado' }, 403);
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
      duration: userDuration,
    } = body as {
      description: string;
      tone?: string;
      audience?: string;
      platform?: string;
      video_type?: string;
      niche?: string;
      monetization?: string;
      duration?: number;
    };

    if (!description || description.trim().length < 10) {
      return json({ error: 'La descripción debe tener al menos 10 caracteres' }, 400);
    }

    const safeDescription = description.trim().replace(/"/g, '\\"');

    // ── 3. Resolver config de plataforma ──────────────────────────────────
    const platformKey = platform?.toLowerCase() ?? 'shorts';
    const baseCfg = PLATFORM_CONFIGS[platformKey] ?? PLATFORM_CONFIGS['shorts'];

    const finalDuration = userDuration && userDuration > 0 ? userDuration : baseCfg.duration;

    const durationRatio = finalDuration / baseCfg.duration;
    const minScenes = Math.max(2, Math.round(baseCfg.min_scenes * durationRatio));
    const maxScenes = Math.max(minScenes + 1, Math.round(baseCfg.max_scenes * durationRatio));
    const hookSeconds = finalDuration <= 30 ? Math.min(baseCfg.hook_seconds, 2) : baseCfg.hook_seconds;

    const cfg = {
      ...baseCfg,
      duration: finalDuration,
      min_scenes: minScenes,
      max_scenes: maxScenes,
      hook_seconds: hookSeconds,
    };

    const toneText = tone || 'profesional';
    const audienceText = audience || 'público general';
    const nicheText = niche || 'general';
    const monetizationText = monetization || 'marca personal';
    const videoTypeText = video_type || 'tutorial';

    const isLongForm = finalDuration >= 180;

    // ── 4. Construir prompt ───────────────────────────────────────────────

    const shortFormPrompt = `Eres un guionista de clase mundial para videos virales de ${cfg.name}.

Genera un guión PROFESIONAL para un video de ${cfg.name} de exactamente ${cfg.duration} segundos.

TÍTULO DEL VIDEO (usa este título exacto): "${safeDescription}"

CONTEXTO:
- Plataforma: ${cfg.name}
- Duración EXACTA: ${cfg.duration} segundos
- Tipo: ${videoTypeText} | Nicho: ${nicheText} | Tono: ${toneText} | Audiencia: ${audienceText} | Monetización: ${monetizationText}

ESTRATEGIA DE RETENCIÓN:
1. HOOK (0-${cfg.hook_seconds}s): Curiosidad extrema. PROHIBIDO "Hola" o "En este video".
2. DESARROLLO: Micro-ganchos entre escenas. Ritmo dinámico.
3. CIERRE: Resolución + CTA natural.

REGLAS DE ${cfg.name.toUpperCase()}:
- ${cfg.tips}
- Entre ${cfg.min_scenes} y ${cfg.max_scenes} escenas
- Suma de duration_seconds = EXACTAMENTE ${cfg.duration}s
- Narración natural en español (2.5 palabras/segundo)
- Text overlay máximo ${cfg.overlay_max_words} palabras
- Descripciones visuales en inglés cinematográfico
- CTA: "${cfg.cta}"

RESPONDE ÚNICAMENTE con JSON válido (sin markdown):
{
  "title": "${safeDescription}",
  "hook": "frase gancho",
  "scenes": [
    {
      "scene": 1,
      "duration_seconds": 5,
      "narration": "texto narración español",
      "visual_description": "cinematic English description",
      "camera_direction": "Close-up / Wide shot / POV",
      "text_overlay": "texto corto"
    }
  ],
  "total_duration": ${cfg.duration},
  "cta": "${cfg.cta}",
  "music_suggestion": "género + mood",
  "seo": {
    "title": "título SEO",
    "hashtags": ["tag1", "tag2"],
    "description": "caption viral"
  }
}`;

    const durationMinutes = Math.round(cfg.duration / 60);
    const longFormPrompt = `Eres un guionista profesional de YouTube experto en retención.

Genera un guión PROFESIONAL para un video de ${durationMinutes} minuto${durationMinutes > 1 ? 's' : ''} (${cfg.duration} segundos).

TÍTULO DEL VIDEO (usa este título exacto): "${safeDescription}"

CONTEXTO:
- Duración EXACTA: ${cfg.duration} segundos
- Tipo: ${videoTypeText} | Nicho: ${nicheText} | Tono: ${toneText} | Audiencia: ${audienceText} | Monetización: ${monetizationText}

ESTRUCTURA:
1. HOOK (0-${cfg.hook_seconds}s): Promesa irresistible. NUNCA "Hola, bienvenidos".
2. INTRO: Contexto + por qué quedarse.
3. DESARROLLO (${cfg.min_scenes}-${cfg.max_scenes} secciones): Contenido profundo con micro-ganchos.
4. CIERRE: Resumen + CTA triple.
- ${cfg.tips}

REGLAS:
- Entre ${cfg.min_scenes} y ${cfg.max_scenes} escenas
- Suma de duration_seconds = EXACTAMENTE ${cfg.duration}s
- Narración conversacional en español (2.5 palabras/segundo)
- Text overlay máximo ${cfg.overlay_max_words} palabras
- Descripciones visuales en inglés
- Incluir capítulos con timestamps

RESPONDE ÚNICAMENTE con JSON válido (sin markdown):
{
  "title": "${safeDescription}",
  "hook": "promesa de valor",
  "scenes": [
    {
      "scene": 1,
      "duration_seconds": 15,
      "narration": "narración español",
      "visual_description": "English description",
      "camera_direction": "Talking head / B-roll",
      "text_overlay": "capítulo"
    }
  ],
  "total_duration": ${cfg.duration},
  "cta": "${cfg.cta}",
  "music_suggestion": "género",
  "chapters": [{"timestamp": "0:00", "title": "Intro"}],
  "seo": {
    "title": "título SEO",
    "hashtags": ["tag1"],
    "description": "descripción YouTube"
  }
}`;

    const prompt = isLongForm ? longFormPrompt : shortFormPrompt;

    // ── 5. Llamar a Gemini con fallback automático a OpenAI ────────────────
    if (!GEMINI_API_KEY && !OPENAI_API_KEY) {
      return json({ error: 'Servicio de IA no configurado.' }, 503);
    }

    let rawText: string | null = null;
    let providerUsed: 'gemini' | 'openai' = 'gemini';

    // Intento 1: Gemini
    if (GEMINI_API_KEY) {
      try {
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

        if (geminiRes.ok) {
          const geminiData = await geminiRes.json();
          rawText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text ?? null;
        } else {
          const errBody = await geminiRes.text().catch(() => '');
          console.error('[reel-script] Gemini error:', geminiRes.status, errBody);
        }
      } catch (e) {
        console.error('[reel-script] Gemini fetch failed:', e);
      }
    }

    // Intento 2: OpenAI como fallback si Gemini no produjo resultado
    if (!rawText && OPENAI_API_KEY) {
      try {
        const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${OPENAI_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.85,
            response_format: { type: 'json_object' },
          }),
        });
        if (openaiRes.ok) {
          const data = await openaiRes.json();
          rawText = data?.choices?.[0]?.message?.content ?? null;
          providerUsed = 'openai';
        } else {
          const errBody = await openaiRes.text().catch(() => '');
          console.error('[reel-script] OpenAI error:', openaiRes.status, errBody);
        }
      } catch (e) {
        console.error('[reel-script] OpenAI fetch failed:', e);
      }
    }

    if (!rawText) {
      return json({
        error: 'El servicio de IA está temporalmente saturado. Por favor intenta de nuevo en 1 minuto.',
      }, 503);
    }

    console.log('[reel-script] provider used:', providerUsed);

    // ── 6. Parsear JSON de la respuesta ───────────────────────────────────
    const cleanJson = rawText.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();

    let script;
    try {
      script = JSON.parse(cleanJson);
    } catch {
      console.error('JSON parse error. Raw:', rawText);
      return json({ error: 'La IA generó una respuesta inválida. Intenta de nuevo.' }, 502);
    }

    if (!script.scenes || !Array.isArray(script.scenes) || script.scenes.length < 2) {
      return json({ error: 'El guión no tiene suficientes escenas. Intenta de nuevo.' }, 502);
    }

    // ── 7. Responder ──────────────────────────────────────────────────────
    return json({
      success: true,
      platform: platformKey,
      platform_config: {
        name: cfg.name,
        format: cfg.format,
        duration: finalDuration,
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
