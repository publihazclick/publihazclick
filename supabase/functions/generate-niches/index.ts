// =============================================================================
// Edge Function: generate-niches
// Genera sugerencias de nichos virales con Google Gemini.
// Cobra 'niches_gemini' desde el wallet del usuario antes de llamar al modelo.
// Si Gemini retorna quota 429, intenta fallback a OpenAI (si está configurado).
// =============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL         = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const GEMINI_API_KEY       = Deno.env.get('GEMINI_API_KEY') ?? '';
const OPENAI_API_KEY       = Deno.env.get('OPENAI_API_KEY') ?? '';

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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Niche = { name: string; description: string; audience?: string; viralScore?: number; monetization?: string };

function extractJson(text: string): { niches?: Niche[] } | null {
  // Gemini y OpenAI a veces envuelven en ```json … ```
  const cleaned = text.replace(/```json\n?|```\n?/g, '').trim();
  try { return JSON.parse(cleaned); } catch { return null; }
}

async function viaGemini(prompt: string): Promise<Niche[]> {
  if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY no configurada');
  const res = await fetch(`${GEMINI_URL}?key=${GEMINI_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.8,
      },
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    const err = new Error(`Gemini ${res.status}: ${body.substring(0, 200)}`);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (err as any).status = res.status;
    throw err;
  }
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  const parsed = extractJson(text);
  return Array.isArray(parsed?.niches) ? parsed.niches : [];
}

async function viaOpenAI(prompt: string): Promise<Niche[]> {
  if (!OPENAI_API_KEY) throw new Error('OPENAI_API_KEY no configurada');
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.8,
      response_format: { type: 'json_object' },
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    const err = new Error(`OpenAI ${res.status}: ${body.substring(0, 200)}`);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (err as any).status = res.status;
    throw err;
  }
  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content ?? '';
  const parsed = extractJson(text);
  return Array.isArray(parsed?.niches) ? parsed.niches : [];
}

async function refund(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  amount: number,
  reason: string,
) {
  if (amount <= 0) return;
  try {
    const { data: wallet } = await supabase
      .from('ai_wallets').select('id, balance').eq('user_id', userId).single();
    if (!wallet) return;
    await supabase.from('ai_wallets').update({
      balance: (wallet.balance as number) + amount,
      updated_at: new Date().toISOString(),
    }).eq('user_id', userId);
    await supabase.from('ai_wallet_transactions').insert({
      wallet_id: wallet.id,
      user_id: userId,
      type: 'refund',
      amount,
      balance_after: (wallet.balance as number) + amount,
      description: `Reembolso nichos (${reason})`,
      metadata: { action_id: 'niches_gemini', reason },
    });
  } catch (e) {
    console.error('[niches] refund failed:', e);
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return json({ error: 'No autorizado' }, 401);
    const token = authHeader.replace('Bearer ', '');

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user) return json({ error: 'Token inválido' }, 401);

    const body = await req.json().catch(() => ({})) as {
      platform?: string; monetization?: string; count?: number; language?: string;
    };
    const platform     = (body.platform || 'general').toLowerCase();
    const monetization = body.monetization || '';
    const count        = Math.min(Math.max(body.count || 10, 3), 20);
    const language     = body.language || 'español latinoamericano';

    // Cobrar primero
    const { data: charge, error: chargeErr } = await supabase.rpc('charge_ai_action', {
      p_user_id: user.id,
      p_action_id: 'niches_gemini',
      p_metadata: { platform, monetization, count },
    });
    if (chargeErr) return json({ error: 'Error al cobrar' }, 500);
    if (!charge?.ok) {
      return json({
        error: charge?.error ?? 'Saldo insuficiente',
        need_recharge: true,
        required: charge?.required,
        balance: charge?.balance,
      }, 402);
    }

    const prompt = `Eres un estratega de contenido viral con 10 años de experiencia. Genera ${count} nichos virales para ${platform}${monetization ? `, con monetización: ${monetization}` : ''}. Idioma: ${language}.

Para cada nicho devuelve:
- name: nombre corto y atractivo
- description: 1 frase explicando qué contenido se crea
- audience: público objetivo
- viralScore: número 1-10
- monetization: idea corta de cómo monetizar

Responde SOLO con este JSON exacto:
{ "niches": [ { "name": "...", "description": "...", "audience": "...", "viralScore": 8, "monetization": "..." } ] }`;

    // Estrategia: intentamos Gemini primero. Si devuelve 429 (quota agotada)
    // o algún error y OpenAI está configurado, usamos OpenAI como fallback
    // (SIN cobrar de nuevo — ya cobramos arriba).
    let niches: Niche[] = [];
    let providerUsed = 'gemini';
    try {
      niches = await viaGemini(prompt);
    } catch (geminiErr) {
      console.warn('[niches] Gemini falló:', geminiErr);
      if (OPENAI_API_KEY) {
        try {
          niches = await viaOpenAI(prompt);
          providerUsed = 'openai';
        } catch (openaiErr) {
          console.error('[niches] OpenAI también falló:', openaiErr);
          await refund(supabase, user.id, charge.charged ?? 0, 'ambos proveedores IA fallaron');
          return json({
            error: 'Servicio de IA temporalmente saturado. Intenta en 1 minuto.',
          }, 503);
        }
      } else {
        await refund(supabase, user.id, charge.charged ?? 0, 'gemini falló sin fallback');
        return json({ error: 'Servicio de IA temporalmente saturado. Intenta en 1 minuto.' }, 503);
      }
    }

    if (niches.length === 0) {
      await refund(supabase, user.id, charge.charged ?? 0, 'no niches returned');
      return json({ error: 'La IA no devolvió nichos. Intenta reformular.' }, 502);
    }

    return json({
      success: true,
      niches,
      provider: providerUsed,
      charged: charge.charged,
      balance_after: charge.balance_after,
    });

  } catch (err) {
    console.error('[generate-niches] error:', err);
    return json({ error: 'Error interno' }, 500);
  }
});
