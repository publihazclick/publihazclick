// =============================================================================
// Edge Function: livecam-api
// API pública REST autenticada por Bearer API key.
// Endpoints:
//   GET  /livecam-api/me               -> perfil del dueño de la key
//   GET  /livecam-api/models           -> listar modelos activos
//   GET  /livecam-api/models/:slug     -> detalle modelo
//   GET  /livecam-api/my-tips          -> tips recibidos (si es modelo)
//   GET  /livecam-api/my-earnings      -> earnings si es studio
// =============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL         = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};
function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}

async function sha256Hex(s: string): Promise<string> {
  const buf = new TextEncoder().encode(s);
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const url = new URL(req.url);
  // Path after /functions/v1/livecam-api
  let path = url.pathname.replace(/^\/functions\/v1\/livecam-api/, '').replace(/^\//, '');

  // API key auth
  const authHeader = req.headers.get('Authorization') ?? '';
  const key = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!key) return json({ error: 'API key requerida. Envía Authorization: Bearer <key>' }, 401);

  const keyHash = await sha256Hex(key);
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const { data: apiKey } = await supabase.from('livecam_api_keys').select('*').eq('key_hash', keyHash).is('revoked_at', null).maybeSingle();
  if (!apiKey) return json({ error: 'API key inválida o revocada' }, 401);

  // touch last_used
  supabase.from('livecam_api_keys').update({ last_used_at: new Date().toISOString() }).eq('id', apiKey.id).then(() => {});

  const userId = apiKey.user_id;
  const scopes: string[] = apiKey.scopes ?? ['read'];

  try {
    if (path === 'me' || path === '') {
      const { data: profile } = await supabase.from('livecam_profiles')
        .select('id,username,email,role,token_balance,created_at').eq('id', userId).maybeSingle();
      return json({ profile, scopes });
    }

    if (path === 'models') {
      const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '50', 10), 200);
      const onlyLive = url.searchParams.get('live') === '1';
      let q = supabase.from('livecam_models').select('id,slug,display_name,bio,category,avatar_url,is_live,is_verified,total_followers,total_earned_tokens').eq('is_active', true);
      if (onlyLive) q = q.eq('is_live', true);
      const { data } = await q.order('total_followers', { ascending: false }).limit(limit);
      return json({ models: data ?? [] });
    }

    const modelMatch = path.match(/^models\/([^/]+)$/);
    if (modelMatch) {
      const { data } = await supabase.from('livecam_models').select('*').eq('slug', modelMatch[1]).maybeSingle();
      if (!data) return json({ error: 'Modelo no encontrado' }, 404);
      return json({ model: data });
    }

    if (path === 'my-tips') {
      const { data: m } = await supabase.from('livecam_models').select('id').eq('user_id', userId).maybeSingle();
      if (!m) return json({ error: 'No tienes perfil de modelo' }, 403);
      const { data } = await supabase.from('livecam_tips').select('*').eq('model_id', m.id).order('created_at', { ascending: false }).limit(100);
      return json({ tips: data ?? [] });
    }

    if (path === 'my-earnings') {
      const { data: s } = await supabase.from('livecam_studios').select('id').eq('user_id', userId).maybeSingle();
      if (!s) return json({ error: 'No tienes estudio' }, 403);
      const { data } = await supabase.from('livecam_studio_earnings').select('*').eq('studio_id', s.id).order('created_at', { ascending: false }).limit(200);
      return json({ earnings: data ?? [] });
    }

    return json({ error: 'Endpoint no encontrado', path }, 404);
  } catch (err) {
    console.error('api error:', err);
    return json({ error: 'Error interno', detail: String(err) }, 500);
  }
});
