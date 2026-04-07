// Edge Function: Generate video scripts with OpenAI GPT-4o
const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY') ?? '';
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };

const PLATFORM_CONFIGS: Record<string, { maxDuration: number; style: string }> = {
  tiktok: { maxDuration: 60, style: 'ultra dinámico, hook en los primeros 2 segundos, trending, Gen Z' },
  instagram: { maxDuration: 90, style: 'estético, visual, lifestyle, aspiracional, carrusel mental' },
  shorts: { maxDuration: 60, style: 'informativo rápido, educativo, valor inmediato' },
  facebook: { maxDuration: 180, style: 'storytelling emocional, conexión personal, engagement' },
  youtube: { maxDuration: 600, style: 'profundo, educativo, retención alta, SEO optimizado, capítulos' },
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    if (!OPENAI_API_KEY) {
      return new Response(JSON.stringify({ error: 'OpenAI not configured' }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    const { topic, platform, duration, language, tone, product_info } = await req.json();
    if (!topic || !platform) {
      return new Response(JSON.stringify({ error: 'topic and platform required' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    const config = PLATFORM_CONFIGS[platform] ?? PLATFORM_CONFIGS.instagram;
    const targetDuration = duration ?? Math.min(30, config.maxDuration);
    const lang = language ?? 'español latinoamericano';
    const toneDesc = tone ?? 'profesional pero cercano';

    const systemPrompt = `Eres un experto guionista de video viral y director creativo con 15 años de experiencia en contenido digital. Generas guiones en formato JSON estructurado.

REGLAS ESTRICTAS:
- Idioma: ${lang}
- Plataforma: ${platform} — estilo: ${config.style}
- Duración objetivo: ${targetDuration} segundos
- Tono: ${toneDesc}
- El HOOK debe capturar atención en los primeros 2 segundos
- Cada escena debe tener narración natural (como habla una persona real)
- Las descripciones visuales deben ser cinematográficas y detalladas
- El CTA (call to action) debe ser irresistible
${product_info ? `- Producto/servicio: ${product_info}` : ''}

FORMATO DE RESPUESTA (JSON estricto):
{
  "title": "título viral del video",
  "hook": "frase gancho de los primeros 2 segundos",
  "scenes": [
    {
      "scene": 1,
      "duration_seconds": 5,
      "narration": "lo que dice la voz",
      "visual_description": "descripción detallada de lo que se ve",
      "camera_direction": "tipo de toma (close-up, aerial, tracking, etc)",
      "text_overlay": "texto en pantalla si aplica"
    }
  ],
  "total_duration": 30,
  "cta": "call to action final",
  "music_suggestion": "tipo de música recomendada",
  "seo": {
    "title": "título SEO optimizado",
    "hashtags": ["#hashtag1", "#hashtag2"],
    "description": "descripción para la publicación"
  }
}`;

    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Crea un guión viral sobre: ${topic}` },
        ],
        temperature: 0.8,
        max_tokens: 3000,
        response_format: { type: 'json_object' },
      }),
    });

    if (!resp.ok) {
      const err = await resp.text();
      throw new Error(`OpenAI error: ${resp.status} - ${err}`);
    }

    const data = await resp.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) throw new Error('No script generated');

    const script = JSON.parse(content);

    return new Response(JSON.stringify({
      script,
      model: 'gpt-4o-mini',
      tokens_used: data.usage?.total_tokens ?? 0,
    }), {
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });
  }
});
