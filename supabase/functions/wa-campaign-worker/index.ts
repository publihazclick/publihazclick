// =============================================================================
// Edge Function: wa-campaign-worker
// Procesa mensajes pendientes de campañas WhatsApp activas.
// Se ejecuta via cron cada minuto o por invocacion manual.
// Respeta delays, limites diarios/horarios, lotes y warmup.
// =============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL         = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const EVOLUTION_API_URL    = Deno.env.get('EVOLUTION_API_URL') ?? '';
const EVOLUTION_API_KEY    = Deno.env.get('EVOLUTION_API_KEY') ?? '';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

async function evoSendText(instance: string, number: string, text: string, delayMs: number): Promise<boolean> {
  try {
    const res = await fetch(`${EVOLUTION_API_URL}/message/sendText/${instance}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': EVOLUTION_API_KEY },
      body: JSON.stringify({ number, text, delay: delayMs }),
    });
    const data = await res.json();
    return !!data?.key;
  } catch {
    return false;
  }
}

async function evoSendMedia(instance: string, number: string, mediatype: string, media: string, caption: string, mimetype: string, fileName: string): Promise<boolean> {
  try {
    const res = await fetch(`${EVOLUTION_API_URL}/message/sendMedia/${instance}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': EVOLUTION_API_KEY },
      body: JSON.stringify({ number, mediatype, mimetype, caption, media, fileName }),
    });
    const data = await res.json();
    return !!data?.key;
  } catch {
    return false;
  }
}

async function evoSendAudio(instance: string, number: string, audio: string): Promise<boolean> {
  try {
    const res = await fetch(`${EVOLUTION_API_URL}/message/sendWhatsAppAudio/${instance}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': EVOLUTION_API_KEY },
      body: JSON.stringify({ number, audio }),
    });
    const data = await res.json();
    return !!data?.key;
  } catch {
    return false;
  }
}

function randomDelay(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  if (!EVOLUTION_API_URL || !EVOLUTION_API_KEY) {
    return json({ error: 'Evolution API no configurada' }, 500);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  // Obtener campañas en estado 'running'
  const { data: campaigns } = await supabase
    .from('wa_campaigns')
    .select('*')
    .eq('status', 'running')
    .order('started_at', { ascending: true });

  if (!campaigns?.length) {
    return json({ ok: true, message: 'No hay campañas activas', processed: 0 });
  }

  let totalProcessed = 0;

  for (const campaign of campaigns) {
    // Obtener sesion conectada del usuario
    const { data: sessions } = await supabase
      .from('wa_sessions')
      .select('*')
      .eq('user_id', campaign.user_id)
      .eq('status', 'connected')
      .limit(1);

    if (!sessions?.length) {
      // Sin sesion conectada - marcar como fallida
      await supabase.from('wa_campaigns').update({ status: 'failed' }).eq('id', campaign.id);
      continue;
    }

    // Obtener la instancia de Evolution API asociada
    // Usamos el nombre de la sesion como referencia
    const sessionName = sessions[0].session_name;

    // Obtener plantilla
    const { data: template } = await supabase
      .from('wa_templates')
      .select('*')
      .eq('id', campaign.template_id)
      .single();

    // Calcular limite para esta ejecucion
    const batchSize = campaign.batch_size || 10;

    // Obtener mensajes pendientes (limitado al batch)
    const { data: pendingMsgs } = await supabase
      .from('wa_campaign_messages')
      .select('*, contact:wa_contacts(id,phone,name)')
      .eq('campaign_id', campaign.id)
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(batchSize);

    if (!pendingMsgs?.length) {
      // No hay mas mensajes pendientes - completar campaña
      await supabase.from('wa_campaigns').update({
        status: 'completed',
        completed_at: new Date().toISOString(),
      }).eq('id', campaign.id);
      continue;
    }

    // Procesar cada mensaje del lote
    for (const msg of pendingMsgs) {
      const contact = msg.contact as { id: string; phone: string; name: string | null };
      if (!contact?.phone) {
        await supabase.from('wa_campaign_messages').update({
          status: 'failed',
          error_message: 'Contacto sin telefono',
        }).eq('id', msg.id);
        continue;
      }

      // Marcar como enviando
      await supabase.from('wa_campaign_messages').update({ status: 'sending' }).eq('id', msg.id);

      let success = false;
      const messageContent = msg.content || template?.content || '';

      try {
        if (template?.message_type === 'image' && template.media_url) {
          success = await evoSendMedia(sessionName, contact.phone, 'image', template.media_url, messageContent, 'image/jpeg', template.media_filename || 'imagen.jpg');
        } else if (template?.message_type === 'pdf' && template.media_url) {
          success = await evoSendMedia(sessionName, contact.phone, 'document', template.media_url, messageContent, 'application/pdf', template.media_filename || 'documento.pdf');
        } else if (template?.message_type === 'video' && template.media_url) {
          success = await evoSendMedia(sessionName, contact.phone, 'video', template.media_url, messageContent, 'video/mp4', template.media_filename || 'video.mp4');
        } else if (template?.message_type === 'audio' && template.media_url) {
          success = await evoSendAudio(sessionName, contact.phone, template.media_url);
        } else {
          // Texto simple
          success = await evoSendText(sessionName, contact.phone, messageContent, 0);
        }
      } catch {
        success = false;
      }

      // Actualizar estado del mensaje
      await supabase.from('wa_campaign_messages').update({
        status: success ? 'sent' : 'failed',
        sent_at: success ? new Date().toISOString() : null,
        error_message: success ? null : 'Error al enviar mensaje',
      }).eq('id', msg.id);

      totalProcessed++;

      // Esperar delay aleatorio entre mensajes
      const delay = randomDelay(
        (campaign.min_delay_seconds || 8) * 1000,
        (campaign.max_delay_seconds || 25) * 1000
      );
      await sleep(delay);
    }

    // Pausa entre lotes
    if (campaign.batch_pause_seconds) {
      await sleep(campaign.batch_pause_seconds * 1000);
    }
  }

  return json({ ok: true, processed: totalProcessed });
});
