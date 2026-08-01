// Edge Function: ag-livekit-token — firma tokens JWT de LiveKit para llamadas de voz
// gratuitas/baratas conductor<->pasajero (reemplaza la llamada enmascarada por Twilio,
// que cobra por minuto vía PSTN). La sala se nombra "movi-call-<trip_request_id>", asi
// que queda aislada por viaje. Deployada con --no-verify-jwt (mismo patron que
// ag-send-push/ag-quick-accept en este proyecto): no valida sesion de Supabase Auth,
// valida directamente contra la tabla que el que llama (ag_user_id) es de verdad el
// conductor o el pasajero de ESE viaje especifico antes de firmar el token.
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

function base64UrlEncode(data: Uint8Array | string): string {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function signJwtHS256(payload: Record<string, unknown>, apiSecret: string): Promise<string> {
  const header = { alg: 'HS256', typ: 'JWT' };
  const headerB64 = base64UrlEncode(JSON.stringify(header));
  const payloadB64 = base64UrlEncode(JSON.stringify(payload));
  const toSign = `${headerB64}.${payloadB64}`;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(apiSecret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(toSign));
  return `${toSign}.${base64UrlEncode(new Uint8Array(signature))}`;
}

async function signClientToken(identity: string, name: string, room: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: LIVEKIT_API_KEY,
    sub: identity,
    iat: now,
    nbf: now,
    exp: now + 60 * 60, // 1h, de sobra para una llamada
    name,
    video: {
      room,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    },
  };
  return signJwtHS256(payload, LIVEKIT_API_SECRET);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    if (!LIVEKIT_API_KEY || !LIVEKIT_API_SECRET || !LIVEKIT_URL) {
      return json({ error: 'LiveKit no configurado en el servidor' }, 500);
    }

    const body = await req.json().catch(() => null);
    const tripRequestId = body?.trip_request_id as string | undefined;
    const agUserId = body?.ag_user_id as string | undefined;
    if (!tripRequestId || !agUserId) return json({ error: 'trip_request_id y ag_user_id requeridos' }, 400);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Consultas simples y separadas a proposito (en vez de un embed anidado de
    // PostgREST) para no depender de que las relaciones FK se resuelvan solas.
    const { data: trip } = await supabase
      .from('ag_trip_requests')
      .select('id, passenger_user_id')
      .eq('id', tripRequestId)
      .maybeSingle();
    if (!trip) return json({ error: 'Viaje no encontrado' }, 404);

    const { data: offer } = await supabase
      .from('ag_trip_offers')
      .select('driver_id')
      .eq('trip_request_id', tripRequestId)
      .eq('status', 'accepted')
      .maybeSingle();
    if (!offer) return json({ error: 'Este viaje no tiene conductor asignado' }, 404);

    const { data: driver } = await supabase
      .from('ag_drivers')
      .select('ag_user_id')
      .eq('id', offer.driver_id)
      .maybeSingle();

    const passengerAgUserId = trip.passenger_user_id as string;
    const driverAgUserId = driver?.ag_user_id as string | undefined;

    const isPassenger = agUserId === passengerAgUserId;
    const isDriver = agUserId === driverAgUserId;
    if (!isPassenger && !isDriver) {
      return json({ error: 'No autorizado para llamar en este viaje' }, 403);
    }

    const { data: users } = await supabase
      .from('ag_users')
      .select('id, full_name')
      .in('id', [passengerAgUserId, driverAgUserId].filter(Boolean));
    const nameOf = (id: string | undefined) => users?.find(u => u.id === id)?.full_name ?? (id === driverAgUserId ? 'Conductor' : 'Pasajero');
    const myName = isDriver ? nameOf(driverAgUserId) : nameOf(passengerAgUserId);
    const peerName = isDriver ? nameOf(passengerAgUserId) : nameOf(driverAgUserId);

    const room = `movi-call-${tripRequestId}`;
    const token = await signClientToken(agUserId, myName, room);

    return json({ token, url: LIVEKIT_URL, room, peer_name: peerName });
  } catch (err) {
    console.error('Error en ag-livekit-token:', err);
    return json({ error: 'Error interno del servidor' }, 500);
  }
});
