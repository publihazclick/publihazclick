// =============================================================================
// Edge Function: xzoom-livekit-webhook
// Recibe eventos de LiveKit Cloud (room_started, room_finished, egress_ended).
// Al iniciar transmisión, notifica por email SOLO a los suscriptores activos.
// IMPORTANTE: deploy con --no-verify-jwt
// =============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL         = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const LIVEKIT_API_KEY      = Deno.env.get('LIVEKIT_API_KEY') ?? '';
const LIVEKIT_API_SECRET   = Deno.env.get('LIVEKIT_API_SECRET') ?? '';
const RESEND_API_KEY       = Deno.env.get('RESEND_API_KEY') ?? '';
const RESEND_FROM          = Deno.env.get('RESEND_FROM') ?? 'XZOOM EN VIVO <noreply@publihazclick.com>';

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

async function verifyLivekitAuth(authHeader: string | null, body: string): Promise<boolean> {
  if (!authHeader) return false;
  const parts = authHeader.split('.');
  if (parts.length !== 3) return false;
  try {
    const toSign = `${parts[0]}.${parts[1]}`;
    const key = await crypto.subtle.importKey(
      'raw', new TextEncoder().encode(LIVEKIT_API_SECRET),
      { name: 'HMAC', hash: 'SHA-256' }, false, ['verify'],
    );
    const sigBytes = Uint8Array.from(
      atob(parts[2].replace(/-/g, '+').replace(/_/g, '/') + '==='.slice(0, (4 - parts[2].length % 4) % 4)),
      (c) => c.charCodeAt(0),
    );
    const valid = await crypto.subtle.verify('HMAC', key, sigBytes, new TextEncoder().encode(toSign));
    if (!valid) return false;
    const payloadJson = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
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

/**
 * Envía email a los suscriptores activos del anfitrión notificando que está EN VIVO.
 * Solo envía a suscriptores con suscripción activa y no expirada.
 */
async function notifySubscribers(
  supabase: any,
  hostId: string,
  hostName: string,
  hostSlug: string,
): Promise<number> {
  if (!RESEND_API_KEY) {
    console.log('[xzoom-webhook] RESEND_API_KEY no configurada, omitiendo emails');
    return 0;
  }

  // Obtener suscriptores activos con email
  const { data: subs, error } = await supabase
    .from('xzoom_viewer_subscriptions')
    .select('viewer_user_id, guest_email')
    .eq('host_id', hostId)
    .eq('status', 'active')
    .gte('expires_at', new Date().toISOString());

  if (error || !subs?.length) {
    console.log(`[xzoom-webhook] ${subs?.length ?? 0} suscriptores activos para ${hostName}`);
    return 0;
  }

  // Recopilar emails
  const emails: string[] = [];
  const userIds = subs.filter((s: any) => s.viewer_user_id).map((s: any) => s.viewer_user_id);
  const guestEmails = subs.filter((s: any) => s.guest_email).map((s: any) => s.guest_email);

  // Emails de usuarios registrados
  if (userIds.length > 0) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('email')
      .in('id', userIds);
    if (profiles) {
      profiles.forEach((p: any) => { if (p.email) emails.push(p.email); });
    }
  }

  // Emails de invitados
  guestEmails.forEach((e: string) => emails.push(e));

  // Eliminar duplicados
  const uniqueEmails = [...new Set(emails)];
  if (uniqueEmails.length === 0) return 0;

  console.log(`[xzoom-webhook] Enviando email a ${uniqueEmails.length} suscriptores de ${hostName}`);

  const landingUrl = `https://www.publihazclick.com/xzoom/h/${hostSlug}`;

  // Enviar emails (en lotes de 50 para no saturar Resend)
  let sent = 0;
  for (let i = 0; i < uniqueEmails.length; i += 50) {
    const batch = uniqueEmails.slice(i, i + 50);
    try {
      await fetch('https://api.resend.com/emails/batch', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(batch.map(email => ({
          from: RESEND_FROM.replace(/^[^<]*</, `${hostName} via XZOOM EN VIVO <`),
          to: [email],
          subject: `🔴 ${hostName} está EN VIVO ahora — XZOOM EN VIVO`,
          html: `
            <div style="font-family:'Inter',system-ui,sans-serif;max-width:500px;margin:0 auto;background:#0a0a0a;border-radius:16px;overflow:hidden;border:1px solid #1e293b;">
              <div style="background:linear-gradient(135deg,#dc2626,#ef4444);padding:24px 28px;text-align:center;">
                <p style="margin:0;font-size:12px;font-weight:800;letter-spacing:2px;text-transform:uppercase;color:rgba(255,255,255,0.8);">XZOOM EN VIVO</p>
                <h1 style="margin:8px 0 0;font-size:24px;font-weight:900;color:#fff;">${hostName} está EN VIVO</h1>
              </div>
              <div style="padding:28px;text-align:center;">
                <p style="margin:0 0 20px;font-size:15px;color:#94a3b8;line-height:1.6;">
                  Tu anfitrión <strong style="color:#fff;">${hostName}</strong> acaba de iniciar una transmisión en vivo. ¡No te la pierdas!
                </p>
                <a href="${landingUrl}" style="display:inline-block;padding:14px 32px;background:linear-gradient(135deg,#dc2626,#ef4444);color:#fff;text-decoration:none;border-radius:100px;font-weight:800;font-size:14px;letter-spacing:0.5px;text-transform:uppercase;">
                  Ver transmisión en vivo
                </a>
                <p style="margin:20px 0 0;font-size:11px;color:#475569;">
                  Recibes este email porque estás suscrito a ${hostName} en XZOOM EN VIVO.
                </p>
              </div>
            </div>
          `,
        }))),
      });
      sent += batch.length;
    } catch (e) {
      console.error(`[xzoom-webhook] Error enviando batch de emails:`, e);
    }
  }

  console.log(`[xzoom-webhook] ${sent} emails enviados`);
  return sent;
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

    // Solo procesar salas XZOOM (no livecam)
    if (roomName.startsWith('livecam-')) return ok('not_xzoom_ignored');

    // Localizar el host por livekit_room_name
    const { data: host } = await supabase
      .from('xzoom_hosts').select('id, display_name, slug').eq('livekit_room_name', roomName).maybeSingle();
    if (!host) {
      console.warn(`Host no encontrado para room: ${roomName}`);
      return ok('host_not_found_ignored');
    }

    switch (event.event) {
      case 'room_started': {
        // Marcar host como EN VIVO
        await supabase.from('xzoom_hosts').update({ is_live: true }).eq('id', host.id);

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
            recording_status: 'disabled',
          });
        }

        // Notificar por email a los suscriptores activos
        try {
          await notifySubscribers(supabase, host.id, host.display_name, host.slug);
        } catch (e) {
          console.error('[xzoom-webhook] Error notificando suscriptores:', e);
          // No bloqueamos el webhook si falla la notificación
        }

        return ok('room_started');
      }

      case 'room_finished': {
        // Marcar host como OFFLINE
        await supabase.from('xzoom_hosts').update({ is_live: false }).eq('id', host.id);

        await supabase
          .from('xzoom_live_sessions')
          .update({ ended_at: new Date().toISOString() })
          .eq('host_id', host.id)
          .is('ended_at', null);
        return ok('room_finished');
      }

      case 'participant_joined': {
        const numP = event.room?.numParticipants ?? 0;
        await supabase.rpc('xzoom_update_peak_viewers', {
          p_host_id: host.id, p_count: numP,
        }).then((r: any) => {
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
