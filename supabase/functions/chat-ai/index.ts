// Edge function: chat-ai
// Chatbot de marketing con Gemini - asistente especializado en contenido IA
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY') ?? '';
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

const SYSTEM_PROMPT = `Eres PubliBot, el asistente de inteligencia artificial de PubliStudio (parte de PubliHazClick). Eres experto en:

1. Crear prompts efectivos para generar imágenes y videos con IA
2. Estrategias de marketing digital y publicidad en redes sociales
3. Cómo usar las herramientas de PubliStudio:
   - Imagen IA: genera imágenes con Vertex AI Imagen 3 (prompts en inglés para mejores resultados)
   - Video IA: wizard para crear guiones + imágenes + audio + video para TikTok, Instagram, YouTube, etc.
   - Voz IA: convierte texto a audio con voces naturales en español
4. Ideas de contenido, copy para anuncios, captions para redes sociales
5. Estrategias de monetización de contenido (afiliados, dropshipping, marca personal, etc.)

Personalidad: Profesional, amigable, directo. Usa emojis con moderación. Respuestas concisas pero útiles.
SIEMPRE responde en español.
Si te preguntan algo fuera de marketing/contenido IA, redirige amablemente al tema.`;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: cors });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return json({ error: 'No autorizado' }, 401);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
    if (authError || !user) return json({ error: 'Token inválido' }, 401);

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();
    if (!profile || !['advertiser', 'admin', 'dev'].includes(profile.role)) {
      return json({ error: 'Sin permisos' }, 403);
    }

    const body = await req.json().catch(() => null);
    if (!body?.message?.trim()) return json({ error: 'Mensaje requerido' }, 400);
    if (body.message.length > 1000)
      return json({ error: 'Mensaje muy largo (máx 1000 chars)' }, 400);
    if (!GEMINI_API_KEY) return json({ error: 'Servicio no configurado' }, 503);

    const contents: unknown[] = [
      { role: 'user', parts: [{ text: SYSTEM_PROMPT }] },
      {
        role: 'model',
        parts: [
          {
            text: '¡Hola! Soy PubliBot 🤖 Tu asistente de contenido IA. ¿En qué te puedo ayudar hoy?',
          },
        ],
      },
    ];

    if (Array.isArray(body.history)) {
      for (const msg of body.history.slice(-12)) {
        contents.push({ role: msg.role, parts: [{ text: msg.text }] });
      }
    }
    contents.push({ role: 'user', parts: [{ text: body.message.trim() }] });

    const res = await fetch(`${GEMINI_URL}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents,
        generationConfig: { temperature: 0.8, topP: 0.9, maxOutputTokens: 1024 },
      }),
    });

    if (!res.ok) {
      if (res.status === 429)
        return json({ error: 'Límite de uso alcanzado. Intenta en unos minutos.' }, 429);
      return json({ error: 'Error de IA. Intenta de nuevo.' }, 502);
    }

    const data = await res.json();
    const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!reply) return json({ error: 'Sin respuesta de la IA' }, 502);

    return json({ success: true, reply: reply.trim() });
  } catch (err) {
    console.error('Chat AI error:', err);
    return json({ error: 'Error interno' }, 500);
  }
});
