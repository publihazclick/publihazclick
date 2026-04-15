// =============================================================================
// Edge Function: xzoom-livekit-token
// Firma tokens JWT de LiveKit con permisos según el rol del usuario.
// - Anfitrión: canPublish, canPublishData, canSubscribe + dispara egress
// - Suscriptor (con suscripción activa): solo canSubscribe + canPublishData (chat)
// Valida siempre contra la BD antes de firmar.
//
// Grabación: si hay S3 config (LIVEKIT_EGRESS_S3_*), inicia egress automático
// al rol host. Si no, crea la live_session sin egress (modo sin grabación).
// =============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL         = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const LIVEKIT_API_KEY      = Deno.env.get('LIVEKIT_API_KEY') ?? '';
const LIVEKIT_API_SECRET   = Deno.env.get('LIVEKIT_API_SECRET') ?? '';
const LIVEKIT_URL          = Deno.env.get('LIVEKIT_URL') ?? '';

// Egress S3 (opcional — si no se configura, no se graba)
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

function decodeJwtPayload(token: string): { sub: string; email?: string } {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Invalid JWT');
  const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
  return JSON.parse(atob(b64));
}

// Base64URL sin padding — requerido por JWT
function base64UrlEncode(data: Uint8Array | string): string {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function signJwtHS256(
  payload: Record<string, unknown>,
  apiSecret: string,
): Promise<string> {
  const header = { alg: 'HS256', typ: 'JWT' };
  const headerB64 = base64UrlEncode(JSON.stringify(header));
  const payloadB64 = base64UrlEncode(JSON.stringify(payload));
  const toSign = `${headerB64}.${payloadB64}`;

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(apiSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(toSign));
  return `${toSign}.${base64UrlEncode(new Uint8Array(signature))}`;
}

async function signClientToken(params: {
  identity: string;
  name: string;
  room: string;
  canPublish: boolean;
  canSubscribe: boolean;
  canPublishData: boolean;
  canRecord: boolean;
  ttlSeconds?: number;
}): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const payload: Record<string, unknown> = {
    iss: LIVEKIT_API_KEY,
    sub: params.identity,
    iat: now,
    nbf: now,
    exp: now + (params.ttlSeconds ?? 4 * 60 * 60),
    name: params.name,
    video: {
      room: params.room,
      roomJoin: true,
      canPublish: params.canPublish,
      canSubscribe: params.canSubscribe,
      canPublishData: params.canPublishData,
      canUpdateOwnMetadata: true,
      ...(params.canRecord ? { roomRecord: true } : {}),
    },
  };
  return signJwtHS256(payload, LIVEKIT_API_SECRET);
}

async function signAdminToken(ttlSeconds = 300): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const payload: Record<string, unknown> = {
    iss: LIVEKIT_API_KEY,
    sub: LIVEKIT_API_KEY,
    iat: now,
    nbf: now,
    exp: now + ttlSeconds,
    video: {
      roomAdmin: true,
      roomCreate: true,
      roomList: true,
      roomRecord: true,
      room: '*',
    },
  };
  return signJwtHS256(payload, LIVEKIT_API_SECRET);
}

function livekitHttpBase(): string {
  // wss://publihazclick-a6r1aer2.livekit.cloud → https://publihazclick-a6r1aer2.livekit.cloud
  return LIVEKIT_URL.replace(/^wss:\/\//, 'https://').replace(/^ws:\/\//, 'http://');
}

/**
 * Inicia la grabación (RoomCompositeEgress) de la sala.
 * Devuelve egressId en éxito, null si S3 no está configurado, throw en error.
 */
async function startRoomEgress(roomName: string, hostId: string): Promise<string | null> {
  if (!EGRESS_S3_ENDPOINT || !EGRESS_S3_ACCESS_KEY || !EGRESS_S3_SECRET || !EGRESS_S3_BUCKET) {
    console.log('[xzoom-egress] S3 config incompleto — grabación deshabilitada');
    return null;
  }

  const adminToken = await signAdminToken();
  const filepath = `xzoom/${hostId}/${Date.now()}.mp4`;

  const body = {
    room_name: roomName,
    preset: 'H264_720P_30',
    file_outputs: [
      {
        file_type: 'MP4',
        filepath,
        s3: {
          access_key: EGRESS_S3_ACCESS_KEY,
          secret: EGRESS_S3_SECRET,
          region: EGRESS_S3_REGION,
          bucket: EGRESS_S3_BUCKET,
          endpoint: EGRESS_S3_ENDPOINT,
          force_path_style: EGRESS_S3_FORCE_PATH === 'true',
        },
      },
    ],
  };

  const res = await fetch(
    `${livekitHttpBase()}/twirp/livekit.Egress/StartRoomCompositeEgress`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    },
  );

  const text = await res.text();
  if (!res.ok) {
    console.error('[xzoom-egress] LiveKit error', res.status, text);
    throw new Error(`Egress start failed: ${res.status} ${text}`);
  }

  const data = JSON.parse(text);
  return data.egress_id ?? null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
      return json({ error: 'Configuración Supabase incompleta' }, 500);
    }
    if (!LIVEKIT_API_KEY || !LIVEKIT_API_SECRET || !LIVEKIT_URL) {
      return json({ error: 'LiveKit no configurado en el servidor' }, 500);
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return json({ error: 'No autorizado' }, 401);

    const userJwt = authHeader.replace('Bearer ', '');
    const jwtPayload = decodeJwtPayload(userJwt);
    const userId = jwtPayload.sub;
    if (!userId) return json({ error: 'Token sin user ID' }, 401);

    const body = await req.json().catch(() => null);
    const hostId = body?.host_id as string | undefined;
    if (!hostId) return json({ error: 'host_id requerido' }, 400);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Obtener perfil y anfitrión
    const [{ data: profile }, { data: host }] = await Promise.all([
      supabase.from('profiles').select('username, email').eq('id', userId).maybeSingle(),
      supabase
        .from('xzoom_hosts')
        .select('id, user_id, display_name, livekit_room_name, is_active')
        .eq('id', hostId)
        .maybeSingle(),
    ]);

    if (!profile) return json({ error: 'Perfil no encontrado' }, 404);
    if (!host) return json({ error: 'Anfitrión no encontrado' }, 404);
    if (!host.is_active && host.user_id !== userId) {
      return json({ error: 'Este anfitrión no está activo' }, 403);
    }

    const isHost = host.user_id === userId;
    let canPublish = false;
    let canSubscribe = false;
    let canRecord = false;

    if (isHost) {
      canPublish = true;
      canSubscribe = true;
      canRecord = true;
    } else {
      const { data: hasSub } = await supabase.rpc('xzoom_has_active_viewer_subscription', {
        p_viewer_user_id: userId,
        p_host_id: host.id,
      });
      if (!hasSub) {
        return json({ error: 'Necesitas una suscripción activa para ver este canal' }, 403);
      }
      canSubscribe = true;
    }

    const token = await signClientToken({
      identity: userId,
      name: profile.username ?? 'Usuario',
      room: host.livekit_room_name,
      canPublish,
      canSubscribe,
      canPublishData: true,
      canRecord,
    });

    // Si es el host, preparamos live_session y disparamos egress si es posible
    let egressStarted = false;
    let recordingEnabled = false;
    if (isHost) {
      try {
        // ¿Ya hay una live_session abierta?
        const { data: activeSession } = await supabase
          .from('xzoom_live_sessions')
          .select('id, livekit_egress_id')
          .eq('host_id', host.id)
          .is('ended_at', null)
          .maybeSingle();

        let sessionId = activeSession?.id;

        // Crear live_session si no existe
        if (!sessionId) {
          const { data: newSession } = await supabase
            .from('xzoom_live_sessions')
            .insert({
              host_id: host.id,
              livekit_room_name: host.livekit_room_name,
              started_at: new Date().toISOString(),
              recording_status: EGRESS_S3_ENDPOINT ? 'pending' : 'disabled',
            })
            .select('id')
            .single();
          sessionId = newSession?.id;
        }

        // Intentar iniciar egress (solo si S3 está configurado y no hay egress activo)
        if (sessionId && !activeSession?.livekit_egress_id && EGRESS_S3_ENDPOINT) {
          const egressId = await startRoomEgress(host.livekit_room_name, host.id);
          if (egressId) {
            await supabase
              .from('xzoom_live_sessions')
              .update({
                livekit_egress_id: egressId,
                recording_status: 'processing',
              })
              .eq('id', sessionId);
            egressStarted = true;
            recordingEnabled = true;
          }
        } else if (activeSession?.livekit_egress_id) {
          recordingEnabled = true;
        }
      } catch (e) {
        console.error('[xzoom-egress] Failed to start recording:', e);
        // NO bloqueamos la transmisión si falla la grabación
      }
    }

    return json({
      token,
      url: LIVEKIT_URL,
      room: host.livekit_room_name,
      role: isHost ? 'host' : 'viewer',
      recording_enabled: recordingEnabled,
      egress_started: egressStarted,
      host: {
        id: host.id,
        display_name: host.display_name,
      },
    });
  } catch (err) {
    console.error('Error en xzoom-livekit-token:', err);
    return json({ error: 'Error interno del servidor' }, 500);
  }
});
