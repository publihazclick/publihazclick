// =============================================================================
// Edge Function: xzoom-livekit-token
// Firma tokens JWT de LiveKit con permisos según el rol del usuario.
// - Anfitrión: canPublish, canPublishData, canSubscribe, recorder allowed.
// - Suscriptor (con suscripción activa): solo canSubscribe + canPublishData (chat).
// Valida siempre contra la BD antes de firmar.
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

// Firma JWT HS256 manualmente (no podemos usar librerías Node en Deno edge)
async function signLivekitToken(params: {
  apiKey: string;
  apiSecret: string;
  identity: string;
  name?: string;
  room: string;
  canPublish: boolean;
  canSubscribe: boolean;
  canPublishData: boolean;
  canRecord: boolean;
  ttlSeconds?: number;
}): Promise<string> {
  const {
    apiKey, apiSecret, identity, name, room,
    canPublish, canSubscribe, canPublishData, canRecord,
    ttlSeconds = 4 * 60 * 60, // 4 horas
  } = params;

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'HS256', typ: 'JWT' };
  const payload: Record<string, unknown> = {
    iss: apiKey,
    sub: identity,
    iat: now,
    nbf: now,
    exp: now + ttlSeconds,
    name: name ?? identity,
    video: {
      room,
      roomJoin: true,
      canPublish,
      canSubscribe,
      canPublishData,
      canUpdateOwnMetadata: true,
      ...(canRecord ? { roomRecord: true } : {}),
    },
  };

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
  const sigB64 = base64UrlEncode(new Uint8Array(signature));
  return `${toSign}.${sigB64}`;
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
      // El dueño entra como host — permisos completos
      canPublish = true;
      canSubscribe = true;
      canRecord = true;
    } else {
      // Verificar suscripción activa del viewer a este anfitrión
      const { data: hasSub } = await supabase.rpc('xzoom_has_active_viewer_subscription', {
        p_viewer_user_id: userId,
        p_host_id: host.id,
      });
      if (!hasSub) {
        return json({ error: 'Necesitas una suscripción activa para ver este canal' }, 403);
      }
      canSubscribe = true;
    }

    const token = await signLivekitToken({
      apiKey: LIVEKIT_API_KEY,
      apiSecret: LIVEKIT_API_SECRET,
      identity: userId,
      name: profile.username ?? 'Usuario',
      room: host.livekit_room_name,
      canPublish,
      canSubscribe,
      canPublishData: true, // chat para todos
      canRecord,
    });

    return json({
      token,
      url: LIVEKIT_URL,
      room: host.livekit_room_name,
      role: isHost ? 'host' : 'viewer',
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
