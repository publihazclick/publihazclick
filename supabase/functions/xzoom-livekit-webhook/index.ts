// =============================================================================
// Edge Function: xzoom-livekit-webhook
// Recibe eventos de LiveKit Cloud (room_started, room_finished, egress_ended).
// Crea/actualiza filas en xzoom_live_sessions y marca grabaciones listas.
// IMPORTANTE: deploy con --no-verify-jwt (LiveKit no envía JWT de usuario).
// LiveKit firma con HS256 del API secret en header 'Authorization'.
// =============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL         = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const LIVEKIT_API_KEY      = Deno.env.get('LIVEKIT_API_KEY') ?? '';
const LIVEKIT_API_SECRET   = Deno.env.get('LIVEKIT_API_SECRET') ?? '';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
};

function ok(msg = 'ok') {
  return new Response(JSON.stringify({ ok: true, msg }), {
    status: 200,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

function fail(msg: string, status = 400) {
  return new Response(JSON.stringify({ ok: false, error: msg }), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

// Valida el JWT de autenticación que LiveKit añade en el header Authorization.
// Es un JWT HS256 firmado con LIVEKIT_API_SECRET; contiene hash del body.
async function verifyLivekitAuth(authHeader: string | null, body: string): Promise<boolean> {
  if (!authHeader) return false;
  const parts = authHeader.split('.');
  if (parts.length !== 3) return false;

  try {
    // Recomputar firma
    const toSign = `${parts[0]}.${parts[1]}`;
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(LIVEKIT_API_SECRET),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify'],
    );
    const sigBytes = Uint8Array.from(
      atob(parts[2].replace(/-/g, '+').replace(/_/g, '/') + '==='.slice(0, (4 - parts[2].length % 4) % 4)),
      (c) => c.charCodeAt(0),
    );
    const valid = await crypto.subtle.verify(
      'HMAC', key, sigBytes, new TextEncoder().encode(toSign),
    );
    if (!valid) return false;

    // Verificar hash del body (LiveKit incluye 'sha256' del body en el payload)
    const payloadJson = JSON.parse(
      atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')),
    );
    if (payloadJson.sha256) {
      const bodyHash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(body));
      const bodyHashB64 = btoa(String.fromCharCode(...new Uint8Array(bodyHash)));
      if (bodyHashB64 !== payloadJson.sha256) return false;
    }
    return true;
  } catch (e) {
    console.error('Error verificando firma LiveKit:', e);
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return fail('Method not allowed', 405);

  try {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY || !LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
      return fail('Config incompleta', 500);
    }

    const rawBody = await req.text();
    const authHeader = req.headers.get('Authorization');

    const valid = await verifyLivekitAuth(authHeader, rawBody);
    if (!valid) {
      console.warn('xzoom-livekit-webhook: firma inválida');
      // 200 para que LiveKit no reintente
      return ok('invalid_signature_ignored');
    }

    const event = JSON.parse(rawBody) as {
      event: string;
      room?: { name?: string; sid?: string; numParticipants?: number };
      participant?: { identity?: string };
      egressInfo?: {
        egressId?: string;
        roomName?: string;
        status?: string;
        fileResults?: Array<{ filename?: string; duration?: number; size?: number; location?: string }>;
      };
    };

    console.log(`LiveKit webhook event: ${event.event}`);
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    const roomName = event.room?.name ?? event.egressInfo?.roomName;
    if (!roomName) return ok('no_room_ignored');

    // Localizar el host por livekit_room_name
    const { data: host } = await supabase
      .from('xzoom_hosts').select('id').eq('livekit_room_name', roomName).maybeSingle();
    if (!host) {
      console.warn(`Host no encontrado para room: ${roomName}`);
      return ok('host_not_found_ignored');
    }

    switch (event.event) {
      case 'room_started': {
        // Crear live_session nueva (si no existe una abierta)
        const { data: existing } = await supabase
          .from('xzoom_live_sessions')
          .select('id')
          .eq('host_id', host.id)
          .is('ended_at', null)
          .maybeSingle();
        if (!existing) {
          await supabase.from('xzoom_live_sessions').insert({
            host_id: host.id,
            livekit_room_name: roomName,
            started_at: new Date().toISOString(),
            recording_status: 'disabled', // se cambiará a 'processing' cuando empiece egress
          });
        }
        return ok('room_started');
      }

      case 'room_finished': {
        // Cerrar la live_session abierta
        await supabase
          .from('xzoom_live_sessions')
          .update({ ended_at: new Date().toISOString() })
          .eq('host_id', host.id)
          .is('ended_at', null);
        return ok('room_finished');
      }

      case 'participant_joined': {
        // Incrementar peak_viewers si supera el actual
        const numP = event.room?.numParticipants ?? 0;
        await supabase.rpc('xzoom_update_peak_viewers', {
          p_host_id: host.id, p_count: numP,
        }).then((r) => {
          if (r.error) console.warn('RPC peak no existe aún, ignorando:', r.error.message);
        });
        return ok('participant_joined');
      }

      case 'egress_started': {
        await supabase
          .from('xzoom_live_sessions')
          .update({ recording_status: 'processing' })
          .eq('host_id', host.id)
          .is('ended_at', null);
        return ok('egress_started');
      }

      case 'egress_ended': {
        const info = event.egressInfo;
        if (info?.status !== 'EGRESS_COMPLETE') {
          await supabase
            .from('xzoom_live_sessions')
            .update({ recording_status: 'failed' })
            .eq('host_id', host.id)
            .order('started_at', { ascending: false })
            .limit(1);
          return ok('egress_failed');
        }
        const file = info?.fileResults?.[0];
        await supabase
          .from('xzoom_live_sessions')
          .update({
            recording_status: 'ready',
            recording_url: file?.location ?? file?.filename ?? null,
            recording_size_bytes: file?.size ?? null,
            recording_duration_seconds: file?.duration ? Math.floor(file.duration / 1_000_000_000) : null,
          })
          .eq('host_id', host.id)
          .order('started_at', { ascending: false })
          .limit(1);
        return ok('egress_ended');
      }

      default:
        return ok(`event_${event.event}_ignored`);
    }
  } catch (err) {
    console.error('Error xzoom-livekit-webhook:', err);
    return fail('Internal error', 500);
  }
});
