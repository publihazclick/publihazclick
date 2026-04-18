// Edge function: traducción corta de mensajes de chat con gpt-4o-mini
const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY') ?? '';
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type' };
function json(d: unknown, s = 200) { return new Response(JSON.stringify(d), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } }); }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  if (!OPENAI_API_KEY) return json({ error: 'OpenAI no configurada' }, 500);

  try {
    const { text, target = 'es' } = await req.json();
    if (!text || typeof text !== 'string') return json({ error: 'text requerido' }, 400);
    if (text.length > 500) return json({ error: 'texto muy largo' }, 400);

    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: `Translate short chat messages to ${target}. If already in ${target}, return original. Reply ONLY with the translation, no explanations. Preserve emojis.` },
          { role: 'user', content: text },
        ],
        max_tokens: 200,
        temperature: 0,
      }),
    });
    if (!r.ok) return json({ error: 'openai error' }, 502);
    const out = await r.json();
    return json({ translation: out.choices?.[0]?.message?.content?.trim() ?? text });
  } catch (err) {
    return json({ error: 'Error interno', detail: String(err) }, 500);
  }
});
