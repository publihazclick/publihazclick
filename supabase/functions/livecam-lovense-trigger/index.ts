// Edge Function: livecam-lovense-trigger
// Dispara una acción en el juguete Lovense del modelo cuando recibe un tip.
// Lee lovense_dev_token + lovense_levels del modelo y llama al API Lovense.
// Mapea tokens → acción según levels config.
//
// Lovense Commands API: https://developer.lovense.com/docs/standard-solutions/commands.html

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL         = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type' };
function json(d: unknown, s = 200) { return new Response(JSON.stringify(d), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } }); }

interface Level { min_tokens: number; max_tokens: number; action: string; duration_sec?: number; label?: string; }

function pickLevel(levels: Level[], tokens: number): Level | null {
  const sorted = [...levels].sort((a, b) => a.min_tokens - b.min_tokens);
  for (const lv of sorted) {
    if (tokens >= lv.min_tokens && (lv.max_tokens == null || tokens <= lv.max_tokens)) return lv;
  }
  return sorted[sorted.length - 1] ?? null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const body = await req.json();
    const modelId = body?.model_id as string;
    const tokens = Number(body?.tokens ?? 0);
    if (!modelId || !tokens) return json({ error: 'model_id y tokens requeridos' }, 400);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const { data: m } = await supabase.from('livecam_models').select('lovense_enabled, lovense_dev_token, lovense_levels').eq('id', modelId).maybeSingle();
    if (!m || !(m as any).lovense_enabled || !(m as any).lovense_dev_token) {
      return json({ ok: false, reason: 'lovense_disabled' });
    }

    const levels = (m as any).lovense_levels as Level[];
    if (!levels || levels.length === 0) return json({ ok: false, reason: 'no_levels_configured' });
    const lv = pickLevel(levels, tokens);
    if (!lv) return json({ ok: false, reason: 'no_level_matched' });

    // Lovense Command API: https://api.lovense-api.com/api/lan/v2/command
    const payload = {
      token: (m as any).lovense_dev_token,
      uid: modelId,
      command: 'Function',
      action: lv.action,
      timeSec: lv.duration_sec ?? 5,
      apiVer: '1',
    };

    const r = await fetch('https://api.lovense-api.com/api/lan/v2/command', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const text = await r.text();
    if (!r.ok) return json({ ok: false, reason: 'lovense_error', detail: text }, 502);

    return json({ ok: true, level: lv, lovense: text.slice(0, 200) });
  } catch (err) {
    console.error('lovense-trigger error:', err);
    return json({ error: 'Error interno', detail: String(err) }, 500);
  }
});
