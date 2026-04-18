// =============================================================================
// Edge Function: livecam-rtmp-ingress
// Crea / rota una clave RTMP persistente para que la modelo transmita desde OBS.
// Usa LiveKit Ingress API. Al publicar por RTMP, LiveKit inyecta el stream en su
// livekit_room_name como si fuera cualquier otro publisher.
// =============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL         = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const LIVEKIT_API_KEY      = Deno.env.get('LIVEKIT_API_KEY') ?? '';
const LIVEKIT_API_SECRET   = Deno.env.get('LIVEKIT_API_SECRET') ?? '';
const LIVEKIT_URL          = Deno.env.get('LIVEKIT_URL') ?? '';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}

function b64u(data: Uint8Array | string): string {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function signAdminToken(): Promise<string> {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const payload = { iss: LIVEKIT_API_KEY, sub: LIVEKIT_API_KEY, iat: now, nbf: now, exp: now + 300,
    video: { roomAdmin: true, roomCreate: true, room: '*', ingressAdmin: true } };
  const toSign = `${b64u(JSON.stringify(header))}.${b64u(JSON.stringify(payload))}`;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(LIVEKIT_API_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(toSign));
  return `${toSign}.${b64u(new Uint8Array(sig))}`;
}

function livekitHttpBase(): string { return LIVEKIT_URL.replace(/^wss:\/\//, 'https://').replace(/^ws:\/\//, 'http://'); }

async function createIngress(room: string, identity: string, name: string, existingId?: string): Promise<{ ingressId: string; url: string; streamKey: string } | null> {
  const adminToken = await signAdminToken();
  // 1 = RTMP_INPUT
  const body = {
    input_type: 1,
    name: `rtmp-${name}`,
    room_name: room,
    participant_identity: identity,
    participant_name: name,
    reusable: true,
    video: { source: 1, preset: 3 }, // camera, 1080p
    audio: { source: 1, preset: 1 },
  };
  const res = await fetch(`${livekitHttpBase()}/twirp/livekit.Ingress/CreateIngress`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) { console.error('[rtmp-ingress]', res.status, await res.text()); return null; }
  const out = await res.json();
  return { ingressId: out.ingress_id, url: out.url, streamKey: out.stream_key };
}

async function deleteIngress(id: string): Promise<void> {
  try {
    const adminToken = await signAdminToken();
    await fetch(`${livekitHttpBase()}/twirp/livekit.Ingress/DeleteIngress`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ingress_id: id }),
    });
  } catch (e) { console.error('[rtmp-ingress] delete', e); }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return json({ error: 'Supabase no configurado' }, 500);
    if (!LIVEKIT_API_KEY || !LIVEKIT_API_SECRET || !LIVEKIT_URL) return json({ error: 'LiveKit no configurado' }, 500);

    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return json({ error: 'No autorizado' }, 401);
    const userJwt = authHeader.replace('Bearer ', '');

    const body = await req.json().catch(() => ({}));
    const action = (body?.action ?? 'get') as 'get' | 'rotate' | 'revoke';

    // Verify user
    let userId: string | null = null;
    try {
      const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { Authorization: `Bearer ${userJwt}`, apikey: SUPABASE_SERVICE_KEY } });
      if (r.ok) { userId = (await r.json())?.id ?? null; }
    } catch {}
    if (!userId) { try { userId = JSON.parse(atob(userJwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))?.sub ?? null; } catch {} }
    if (!userId) return json({ error: 'Sesión inválida' }, 401);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    const { data: model } = await supabase.from('livecam_models').select('id, display_name, livekit_room_name, user_id').eq('user_id', userId).maybeSingle();
    if (!model) return json({ error: 'No tienes perfil de modelo' }, 404);

    const { data: existing } = await supabase.from('livecam_rtmp_keys').select('*').eq('model_id', model.id).maybeSingle();

    if (action === 'get') {
      if (existing) return json({ rtmp_url: existing.rtmp_url, stream_key: existing.stream_key, room: existing.room_name });
      // create new
      const created = await createIngress(model.livekit_room_name, model.user_id, model.display_name);
      if (!created) return json({ error: 'No se pudo crear ingress RTMP' }, 500);
      await supabase.from('livecam_rtmp_keys').insert({
        model_id: model.id, ingress_id: created.ingressId, stream_key: created.streamKey,
        rtmp_url: created.url, room_name: model.livekit_room_name,
      });
      return json({ rtmp_url: created.url, stream_key: created.streamKey, room: model.livekit_room_name });
    }

    if (action === 'rotate') {
      if (existing?.ingress_id) await deleteIngress(existing.ingress_id);
      const created = await createIngress(model.livekit_room_name, model.user_id, model.display_name);
      if (!created) return json({ error: 'No se pudo rotar' }, 500);
      if (existing) {
        await supabase.from('livecam_rtmp_keys').update({
          ingress_id: created.ingressId, stream_key: created.streamKey, rtmp_url: created.url,
          room_name: model.livekit_room_name, last_rotated_at: new Date().toISOString(),
        }).eq('id', existing.id);
      } else {
        await supabase.from('livecam_rtmp_keys').insert({
          model_id: model.id, ingress_id: created.ingressId, stream_key: created.streamKey,
          rtmp_url: created.url, room_name: model.livekit_room_name,
        });
      }
      return json({ rtmp_url: created.url, stream_key: created.streamKey, room: model.livekit_room_name });
    }

    if (action === 'revoke') {
      if (existing?.ingress_id) await deleteIngress(existing.ingress_id);
      if (existing) await supabase.from('livecam_rtmp_keys').delete().eq('id', existing.id);
      return json({ ok: true });
    }

    return json({ error: 'Acción inválida' }, 400);
  } catch (err) {
    console.error('rtmp-ingress error:', err);
    return json({ error: 'Error interno' }, 500);
  }
});
