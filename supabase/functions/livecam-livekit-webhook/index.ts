// =============================================================================
// Edge Function: livecam-livekit-webhook
// Recibe eventos de LiveKit Cloud para LiveCam Pro.
// Deploy con --no-verify-jwt
// =============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL         = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const LIVEKIT_API_SECRET   = Deno.env.get('LIVEKIT_API_SECRET') ?? '';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type' };
function ok(msg = 'ok') { return new Response(JSON.stringify({ ok: true, msg }), { status: 200, headers: { ...cors, 'Content-Type': 'application/json' } }); }

async function verifyLivekitAuth(authHeader: string | null, body: string): Promise<boolean> {
  if (!authHeader) return false;
  const parts = authHeader.split('.');
  if (parts.length !== 3) return false;
  try {
    const toSign = `${parts[0]}.${parts[1]}`;
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(LIVEKIT_API_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
    const sigBytes = Uint8Array.from(atob(parts[2].replace(/-/g, '+').replace(/_/g, '/') + '==='.slice(0, (4 - parts[2].length % 4) % 4)), c => c.charCodeAt(0));
    return await crypto.subtle.verify('HMAC', key, sigBytes, new TextEncoder().encode(toSign));
  } catch { return false; }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return ok('method_ignored');

  try {
    const rawBody = await req.text();
    const valid = await verifyLivekitAuth(req.headers.get('Authorization'), rawBody);
    if (!valid) return ok('invalid_signature_ignored');

    const event = JSON.parse(rawBody) as {
      event: string;
      room?: { name?: string; numParticipants?: number };
      egressInfo?: { egressId?: string; roomName?: string; status?: string; fileResults?: Array<{ filename?: string; duration?: number; size?: number; location?: string }> };
    };

    console.log(`[livecam-webhook] ${event.event}`);
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const roomName = event.room?.name ?? event.egressInfo?.roomName;
    if (!roomName) return ok('no_room');

    // Only handle livecam rooms
    if (!roomName.startsWith('livecam-')) return ok('not_livecam');

    const { data: model } = await supabase.from('livecam_models').select('id').eq('livekit_room_name', roomName).maybeSingle();
    if (!model) return ok('model_not_found');

    switch (event.event) {
      case 'room_started':
        await supabase.from('livecam_models').update({ is_live: true }).eq('id', model.id);
        break;

      case 'room_finished':
        await supabase.from('livecam_models').update({ is_live: false }).eq('id', model.id);
        await supabase.from('livecam_live_sessions').update({ ended_at: new Date().toISOString() }).eq('model_id', model.id).is('ended_at', null);
        break;

      case 'egress_ended': {
        const info = event.egressInfo;
        const file = info?.fileResults?.[0];
        const status = info?.status === 'EGRESS_COMPLETE' ? 'ready' : 'failed';
        await supabase.from('livecam_live_sessions').update({
          recording_status: status,
          recording_url: file?.location ?? file?.filename ?? null,
          recording_size_bytes: file?.size ?? null,
          recording_duration_seconds: file?.duration ? Math.floor(file.duration / 1_000_000_000) : null,
        }).eq('model_id', model.id).order('started_at', { ascending: false }).limit(1);
        break;
      }
    }

    return ok(event.event);
  } catch (err) {
    console.error('[livecam-webhook] error:', err);
    return ok('error_logged');
  }
});
