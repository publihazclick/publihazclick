// =============================================================================
// Edge Function: generate-niches
// Genera sugerencias de nichos virales con OpenAI GPT. Cobra 'niches_gemini'.
// =============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL         = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const OPENAI_API_KEY       = Deno.env.get('OPENAI_API_KEY') ?? '';

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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    if (!OPENAI_API_KEY) return json({ error: 'OpenAI no configurado' }, 500);

    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return json({ error: 'No autorizado' }, 401);
    const token = authHeader.replace('Bearer ', '');

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user) return json({ error: 'Token inválido' }, 401);

    const body = await req.json().catch(() => ({})) as { platform?: string; monetization?: string; count?: number; language?: string };
    const platform = (body.platform || 'general').toLowerCase();
    const monetization = body.monetization || '';
    const count = Math.min(Math.max(body.count || 10, 3), 20);
    const language = body.language || 'español latinoamericano';

    // Cobrar primero
    const { data: charge, error: chargeErr } = await supabase.rpc('charge_ai_action', {
      p_user_id: user.id,
      p_action_id: 'niches_gemini',
      p_metadata: { platform, monetization, count },
    });
    if (chargeErr) return json({ error: 'Error al cobrar' }, 500);
    if (!charge?.ok) {
      return json({ error: charge?.error ?? 'Saldo insuficiente', need_recharge: true, required: charge?.required, balance: charge?.balance }, 402);
    }

    // Llamar a OpenAI
    const sys = `Eres un estratega de contenido viral con 10 años de experiencia. Generas sugerencias de nichos de alto engagement y potencial viral en ${platform}. Responde SOLO JSON válido.`;
    const user_prompt = `Genera ${count} nichos virales para ${platform}${monetization ? `, con monetización tipo: ${monetization}` : ''}. Para cada nicho devuelve:
- name: nombre corto y atractivo
- description: 1 frase explicando qué contenido se crea
- audience: público objetivo
- viralScore: número 1-10 estimando potencial viral
- monetization: idea corta de cómo monetizar

Responde SOLO con este JSON exacto (sin backticks ni texto adicional):
{ "niches": [ { "name": "...", "description": "...", "audience": "...", "viralScore": 8, "monetization": "..." } ] }

Idioma: ${language}`;

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'system', content: sys }, { role: 'user', content: user_prompt }],
        temperature: 0.8,
        response_format: { type: 'json_object' },
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.error('[generate-niches] openai error:', res.status, errText);
      return json({ error: 'Error al generar nichos' }, 502);
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content ?? '{}';
    let parsed: { niches?: unknown[] };
    try { parsed = JSON.parse(content); } catch { parsed = {}; }
    const niches = Array.isArray(parsed.niches) ? parsed.niches : [];

    return json({
      success: true,
      niches,
      charged: charge.charged,
      balance_after: charge.balance_after,
    });

  } catch (err) {
    console.error('[generate-niches] error:', err);
    return json({ error: 'Error interno' }, 500);
  }
});
