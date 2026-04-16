// =============================================================================
// Edge Function: livecam-livekit-token
// Firma tokens JWT de LiveKit para LiveCam Pro.
// - Modelo (dueño): canPublish + canSubscribe + canRecord + inicia egress
// - Viewer (cualquier usuario autenticado): solo canSubscribe + canPublishData
// No requiere suscripción — cualquiera puede ver.
// =============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL         = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const LIVEKIT_API_KEY      = Deno.env.get('LIVEKIT_API_KEY') ?? '';
const LIVEKIT_API_SECRET   = Deno.env.get('LIVEKIT_API_SECRET') ?? '';
const LIVEKIT_URL          = Deno.env.get('LIVEKIT_URL') ?? '';

const EGRESS_S3_ENDPOINT    = Deno.env.get('LIVEKIT_EGRESS_S3_ENDPOINT') ?? '';
const EGRESS_S3_ACCESS_KEY  = Deno.env.get('LIVEKIT_EGRESS_S3_ACCESS_KEY') ?? '';
const EGRESS_S3_SECRET      = Deno.env.get('LIVEKIT_EGRESS_S3_SECRET') ?? '';
const EGRESS_S3_BUCKET      = Deno.env.get('LIVEKIT_EGRESS_S3_BUCKET') ?? '';
const EGRESS_S3_REGION      = Deno.env.get('LIVEKIT_EGRESS_S3_REGION') ?? 'auto';
const EGRESS_S3_FORCE_PATH  = Deno.env.get('LIVEKIT_EGRESS_S3_FORCE_PATH_STYLE') ?? 'true';

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

function base64UrlEncode(data: Uint8Array | string): string {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function signJwtHS256(payload: Record<string, unknown>, secret: string): Promise<string> {
  const header = { alg: 'HS256', typ: 'JWT' };
  const headerB64 = base64UrlEncode(JSON.stringify(header));
  const payloadB64 = base64UrlEncode(JSON.stringify(payload));
  const toSign = `${headerB64}.${payloadB64}`;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(toSign));
  return `${toSign}.${base64UrlEncode(new Uint8Array(signature))}`;
}

async function signClientToken(p: { identity: string; name: string; room: string; canPublish: boolean; canSubscribe: boolean; canPublishData: boolean; canRecord: boolean }): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return signJwtHS256({
    iss: LIVEKIT_API_KEY, sub: p.identity, iat: now, nbf: now, exp: now + 4 * 3600,
    name: p.name,
    video: { room: p.room, roomJoin: true, canPublish: p.canPublish, canSubscribe: p.canSubscribe, canPublishData: p.canPublishData, canUpdateOwnMetadata: true, ...(p.canRecord ? { roomRecord: true } : {}) },
  }, LIVEKIT_API_SECRET);
}

async function signAdminToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return signJwtHS256({
    iss: LIVEKIT_API_KEY, sub: LIVEKIT_API_KEY, iat: now, nbf: now, exp: now + 300,
    video: { roomAdmin: true, roomCreate: true, roomList: true, roomRecord: true, room: '*' },
  }, LIVEKIT_API_SECRET);
}

function livekitHttpBase(): string {
  return LIVEKIT_URL.replace(/^wss:\/\//, 'https://').replace(/^ws:\/\//, 'http://');
}

async function startRoomEgress(roomName: string, modelId: string): Promise<string | null> {
  if (!EGRESS_S3_ENDPOINT || !EGRESS_S3_ACCESS_KEY || !EGRESS_S3_SECRET || !EGRESS_S3_BUCKET) return null;
  const adminToken = await signAdminToken();
  const res = await fetch(`${livekitHttpBase()}/twirp/livekit.Egress/StartRoomCompositeEgress`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      room_name: roomName, preset: 'H264_720P_30',
      file_outputs: [{ file_type: 'MP4', filepath: `livecam/${modelId}/${Date.now()}.mp4`,
        s3: { access_key: EGRESS_S3_ACCESS_KEY, secret: EGRESS_S3_SECRET, region: EGRESS_S3_REGION, bucket: EGRESS_S3_BUCKET, endpoint: EGRESS_S3_ENDPOINT, force_path_style: EGRESS_S3_FORCE_PATH === 'true' } }],
    }),
  });
  if (!res.ok) { console.error('[livecam-egress]', res.status, await res.text()); return null; }
  return (await res.json()).egress_id ?? null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    console.log(`[livecam-token] ENV: SUPABASE_URL=${SUPABASE_URL ? 'SET' : 'EMPTY'}, SERVICE_KEY=${SUPABASE_SERVICE_KEY ? 'SET' : 'EMPTY'}, LIVEKIT_KEY=${LIVEKIT_API_KEY ? 'SET' : 'EMPTY'}`);
    if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return json({ error: 'Configuracion Supabase incompleta en el servidor' }, 500);
    if (!LIVEKIT_API_KEY || !LIVEKIT_API_SECRET || !LIVEKIT_URL) return json({ error: 'LiveKit no configurado' }, 500);

    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return json({ error: 'No autorizado' }, 401);
    const userJwt = authHeader.replace('Bearer ', '');

    const body = await req.json().catch(() => null);
    const modelId = body?.model_id as string | undefined;
    if (!modelId) return json({ error: 'model_id requerido' }, 400);

    // Validate user JWT via /auth/v1/user (supports ES256)
    let userId: string | null = null;
    let userEmail = '';
    try {
      const verifyResp = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
        headers: { Authorization: `Bearer ${userJwt}`, apikey: SUPABASE_SERVICE_KEY },
      });
      console.log(`[livecam-token] /auth/v1/user status=${verifyResp.status}`);
      if (verifyResp.ok) {
        const u = await verifyResp.json();
        userId = u?.id ?? null;
        userEmail = u?.email ?? '';
        console.log(`[livecam-token] verified userId=${userId}, email=${userEmail}`);
      } else {
        const errText = await verifyResp.text();
        console.log(`[livecam-token] /auth/v1/user failed: ${errText}`);
      }
    } catch (e) {
      console.error(`[livecam-token] /auth/v1/user exception:`, e);
    }
    // Fallback: decode JWT payload
    if (!userId) {
      try {
        const payload = JSON.parse(atob(userJwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
        userId = payload?.sub ?? null;
        userEmail = payload?.email ?? '';
        console.log(`[livecam-token] fallback decoded userId=${userId}`);
      } catch (e) {
        console.error(`[livecam-token] JWT decode failed:`, e);
      }
    }
    if (!userId) return json({ error: 'Sesion invalida. Cierra sesion y vuelve a iniciar.' }, 401);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    console.log(`[livecam-token] userId=${userId}, modelId=${modelId}`);

    const { data: profile, error: profileErr } = await supabase.from('livecam_profiles').select('username, email').eq('id', userId).maybeSingle();
    console.log(`[livecam-token] profile query: data=${JSON.stringify(profile)}, error=${JSON.stringify(profileErr)}`);

    // Try find model by ID first, then by user_id as fallback
    let model: any = null;
    const { data: m1 } = await supabase.from('livecam_models').select('id, user_id, display_name, livekit_room_name, is_active').eq('id', modelId).maybeSingle();
    if (m1) {
      model = m1;
    } else {
      // Fallback: maybe modelId is actually the user's own model
      const { data: m2 } = await supabase.from('livecam_models').select('id, user_id, display_name, livekit_room_name, is_active').eq('user_id', modelId).maybeSingle();
      if (m2) model = m2;
      else {
        // Last fallback: user's own model
        const { data: m3 } = await supabase.from('livecam_models').select('id, user_id, display_name, livekit_room_name, is_active').eq('user_id', userId).maybeSingle();
        if (m3) model = m3;
      }
    }

    console.log(`[livecam-token] profile=${profile?.username ?? 'null'}, model=${model?.display_name ?? 'null'}`);

    // Auto-create profile if missing
    if (!profile && userId) {
      console.log(`[livecam-token] Auto-creating profile for ${userId} (${userEmail})`);
      await supabase.from('livecam_profiles').insert({
        id: userId, email: userEmail, username: userEmail.split('@')[0] || 'usuario', role: 'model', is_age_verified: true,
      });
      const { data: p2 } = await supabase.from('livecam_profiles').select('username, email').eq('id', userId).maybeSingle();
      if (p2) (profile as any) = p2;
    }
    if (!profile) return json({ error: 'Perfil no encontrado. Completa tu registro primero.' }, 404);
    if (!model) return json({ error: 'No tienes un perfil de modelo. Crea uno en el dashboard.' }, 404);

    const isModel = model.user_id === userId;

    // Anyone can view — no subscription check needed
    const token = await signClientToken({
      identity: userId,
      name: profile.username ?? 'Usuario',
      room: model.livekit_room_name,
      canPublish: isModel,
      canSubscribe: true,
      canPublishData: true,
      canRecord: isModel,
    });

    if (isModel) {
      // Set model as live
      await supabase.from('livecam_models').update({ is_live: true }).eq('id', model.id);

      // Create or reuse live session
      const { data: active } = await supabase.from('livecam_live_sessions').select('id, livekit_egress_id').eq('model_id', model.id).is('ended_at', null).maybeSingle();
      let sessionId = active?.id;
      if (!sessionId) {
        const { data: ns } = await supabase.from('livecam_live_sessions').insert({
          model_id: model.id, livekit_room_name: model.livekit_room_name,
          started_at: new Date().toISOString(), recording_status: EGRESS_S3_ENDPOINT ? 'pending' : 'disabled',
        }).select('id').single();
        sessionId = ns?.id;
      }

      // Start egress
      if (sessionId && !active?.livekit_egress_id && EGRESS_S3_ENDPOINT) {
        try {
          const egressId = await startRoomEgress(model.livekit_room_name, model.id);
          if (egressId) {
            await supabase.from('livecam_live_sessions').update({ livekit_egress_id: egressId, recording_status: 'processing' }).eq('id', sessionId);
          }
        } catch (e) { console.error('[livecam-egress]', e); }
      }
    }

    return json({ token, url: LIVEKIT_URL, room: model.livekit_room_name, role: isModel ? 'model' : 'viewer' });
  } catch (err) {
    console.error('livecam-livekit-token error:', err);
    return json({ error: 'Error interno' }, 500);
  }
});
