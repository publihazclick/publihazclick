// =============================================================================
// Edge Function: wa-evolution-webhook
// Recibe eventos de Evolution API (conexion, mensajes) y actualiza
// wa_sessions y wa_campaign_messages en consecuencia.
// =============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL         = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

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

interface EvolutionEvent {
  event?: string;
  instance?: string;
  data?: Record<string, unknown>;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  let body: EvolutionEvent;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  const eventName = (body.event || '').toLowerCase();
  const instance  = body.instance;
  const data      = body.data ?? {};

  if (!instance) return json({ ok: true, ignored: 'no instance' });

  try {
    // ── CONNECTION_UPDATE ─────────────────────────────────────────────────
    // data: { state: 'open' | 'close' | 'connecting', statusReason?: number }
    if (eventName === 'connection.update' || eventName === 'connection_update') {
      const state = String(data.state ?? '').toLowerCase();
      let newStatus: string | null = null;
      if (state === 'open') newStatus = 'connected';
      else if (state === 'close') newStatus = 'disconnected';
      else if (state === 'connecting') newStatus = 'qr_pending';

      if (newStatus) {
        const patch: Record<string, unknown> = { status: newStatus };
        // Al conectar, limpiar el QR guardado (ya no es util).
        if (newStatus === 'connected') {
          patch.qr_base64 = null;
          patch.qr_code = null;
          patch.pairing_code = null;
          patch.last_connected_at = new Date().toISOString();
        }
        await supabase
          .from('wa_sessions')
          .update(patch)
          .eq('phone_number', instance);
      }
      return json({ ok: true, event: 'connection.update', state, updated: !!newStatus });
    }

    // ── QRCODE_UPDATED ────────────────────────────────────────────────────
    // data: { qrcode: { code, base64, pairingCode } } o anidado distinto.
    if (eventName === 'qrcode.updated' || eventName === 'qrcode_updated') {
      const qr = (data.qrcode as Record<string, unknown>) ?? data;
      const patch: Record<string, unknown> = { status: 'qr_pending', qr_updated_at: new Date().toISOString() };
      if (qr?.base64) patch.qr_base64 = qr.base64 as string;
      if (qr?.code) patch.qr_code = qr.code as string;
      if (qr?.pairingCode) patch.pairing_code = qr.pairingCode as string;

      await supabase
        .from('wa_sessions')
        .update(patch)
        .eq('phone_number', instance);
      return json({ ok: true, event: 'qrcode.updated', stored: !!(qr?.base64 || qr?.code) });
    }

    // ── SEND_MESSAGE (respuesta tras envio) ───────────────────────────────
    // data: { key: { id, remoteJid }, status: 'SENT' | 'PENDING' | ..., messageTimestamp }
    if (eventName === 'send.message' || eventName === 'send_message') {
      const keyId = ((data.key as Record<string, unknown>)?.id ?? '') as string;
      if (keyId) {
        // Match by evolution_message_id (si ya lo guardamos) — idempotente.
        await supabase
          .from('wa_campaign_messages')
          .update({ sent_at: new Date().toISOString() })
          .eq('evolution_message_id', keyId)
          .is('sent_at', null);
      }
      return json({ ok: true, event: 'send.message' });
    }

    // ── MESSAGES_UPDATE (status delivery/read) ─────────────────────────────
    // Puede venir como array en data o como objeto con key + status.
    if (eventName === 'messages.update' || eventName === 'messages_update') {
      const items = Array.isArray(data) ? data : [data];
      for (const item of items) {
        const keyId = ((item as Record<string, unknown>).key as Record<string, unknown>)?.id as string | undefined;
        const statusRaw = String((item as Record<string, unknown>).status ?? '').toLowerCase();
        if (!keyId) continue;

        const patch: Record<string, unknown> = {};
        if (statusRaw === 'delivery_ack' || statusRaw === 'delivered') {
          patch.status = 'delivered';
          patch.delivered_at = new Date().toISOString();
        } else if (statusRaw === 'read' || statusRaw === 'played') {
          patch.status = 'read';
          patch.read_at = new Date().toISOString();
        } else if (statusRaw === 'error' || statusRaw === 'failed') {
          patch.status = 'failed';
          patch.failed_at = new Date().toISOString();
        }

        if (Object.keys(patch).length > 0) {
          await supabase
            .from('wa_campaign_messages')
            .update(patch)
            .eq('evolution_message_id', keyId);
        }
      }
      return json({ ok: true, event: 'messages.update', count: items.length });
    }

    return json({ ok: true, ignored: eventName || 'unknown' });
  } catch (err) {
    console.error('wa-evolution-webhook error:', err);
    return json({ error: 'Internal error', detail: String(err) }, 500);
  }
});
