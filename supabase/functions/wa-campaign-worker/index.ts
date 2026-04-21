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

interface SendResult { ok: boolean; messageId: string | null; error?: string }

function extractKeyId(resp: unknown): string | null {
  const r = resp as Record<string, unknown> | null;
  if (!r) return null;
  const key = r.key as Record<string, unknown> | undefined;
  if (key && typeof key.id === 'string') return key.id;
  // Algunos endpoints devuelven en `data` o en root
  const data = (r.data as Record<string, unknown>) ?? null;
  if (data) {
    const dKey = data.key as Record<string, unknown> | undefined;
    if (dKey && typeof dKey.id === 'string') return dKey.id;
  }
  return null;
}

async function evoSendText(instance: string, number: string, text: string, delayMs: number): Promise<SendResult> {
  try {
    const res = await fetch(`${EVOLUTION_API_URL}/message/sendText/${instance}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': EVOLUTION_API_KEY },
      body: JSON.stringify({ number, text, delay: delayMs }),
    });
    const data = await res.json();
    const id = extractKeyId(data);
    return { ok: !!id, messageId: id, error: id ? undefined : JSON.stringify(data).slice(0, 500) };
  } catch (e) {
    return { ok: false, messageId: null, error: String(e).slice(0, 500) };
  }
}

async function evoSendMedia(instance: string, number: string, mediatype: string, media: string, caption: string, mimetype: string, fileName: string): Promise<SendResult> {
  try {
    const res = await fetch(`${EVOLUTION_API_URL}/message/sendMedia/${instance}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': EVOLUTION_API_KEY },
      body: JSON.stringify({ number, mediatype, mimetype, caption, media, fileName }),
    });
    const data = await res.json();
    const id = extractKeyId(data);
    return { ok: !!id, messageId: id, error: id ? undefined : JSON.stringify(data).slice(0, 500) };
  } catch (e) {
    return { ok: false, messageId: null, error: String(e).slice(0, 500) };
  }
}

async function evoSendAudio(instance: string, number: string, audio: string): Promise<SendResult> {
  try {
    const res = await fetch(`${EVOLUTION_API_URL}/message/sendWhatsAppAudio/${instance}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': EVOLUTION_API_KEY },
      body: JSON.stringify({ number, audio }),
    });
    const data = await res.json();
    const id = extractKeyId(data);
    return { ok: !!id, messageId: id, error: id ? undefined : JSON.stringify(data).slice(0, 500) };
  } catch (e) {
    return { ok: false, messageId: null, error: String(e).slice(0, 500) };
  }
}

function randomDelay(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Verifica si la campaña está dentro de su ventana horaria. Si no tiene
 * schedule definido, siempre devuelve true. Respeta schedule_timezone,
 * schedule_days (0=dom..6=sab; vacío = todos) y soporta ventanas que
 * cruzan medianoche.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function inSchedule(campaign: any): boolean {
  const start: string | null = campaign.schedule_start_time;
  const end:   string | null = campaign.schedule_end_time;
  if (!start || !end) return true;

  const tz = (campaign.schedule_timezone as string) || 'America/Bogota';
  const days: number[] = Array.isArray(campaign.schedule_days) ? campaign.schedule_days : [];

  // Obtener hora y día en la TZ especificada
  const now = new Date();
  const fmt = new Intl.DateTimeFormat('en-US', {
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    weekday: 'short', hour12: false, timeZone: tz,
  });
  const parts = fmt.formatToParts(now);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const p: any = {};
  for (const pp of parts) p[pp.type] = pp.value;

  const wdMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const currentDow = wdMap[p.weekday as string] ?? 0;

  if (days.length > 0 && !days.includes(currentDow)) return false;

  const toMinutes = (hm: string) => {
    const [h, m] = hm.split(':').map((x) => parseInt(x, 10));
    return (h || 0) * 60 + (m || 0);
  };
  const curMin = parseInt(p.hour as string, 10) * 60 + parseInt(p.minute as string, 10);
  const startMin = toMinutes(start);
  const endMin   = toMinutes(end);

  if (startMin <= endMin) return curMin >= startMin && curMin <= endMin;
  // Ventana que cruza medianoche
  return curMin >= startMin || curMin <= endMin;
}

/**
 * Selecciona el texto del mensaje para un destinatario. Si la plantilla
 * tiene content_variants, hace rotación aleatoria entre content + variants
 * para reducir el riesgo de bloqueo por enviar el mismo texto idéntico a
 * muchos destinatarios.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function pickContent(template: any, baseContent: string): string {
  const variants: string[] = Array.isArray(template?.content_variants) ? template.content_variants : [];
  const clean = variants.map((s) => (s || '').trim()).filter((s) => s.length > 0);
  if (clean.length === 0) return baseContent;
  // Incluimos el contenido base como una opción más
  const pool = [baseContent, ...clean];
  return pool[Math.floor(Math.random() * pool.length)];
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
    // ── Ventana horaria ────────────────────────────────────────────────
    // Si la campaña tiene horario configurado y ahora estamos FUERA de él,
    // simplemente la saltamos y esperamos a que el siguiente cron (dentro
    // de la ventana) la retome. La campaña queda 'running', no failed.
    if (!inSchedule(campaign)) {
      continue;
    }

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

    // Obtener la instancia de Evolution API asociada.
    // El nombre de la instancia en Evolution API se guarda en `phone_number`.
    const instanceName = sessions[0].phone_number as string | null;
    if (!instanceName) {
      await supabase.from('wa_campaigns').update({ status: 'failed' }).eq('id', campaign.id);
      continue;
    }

    // Obtener plantilla
    const { data: template } = await supabase
      .from('wa_templates')
      .select('*')
      .eq('id', campaign.template_id)
      .single();

    // ── Bloque actual ──────────────────────────────────────────────────
    // El worker procesa SOLO el bloque current_block. Si ese bloque ya no
    // tiene pendientes, avanzamos al siguiente (o marcamos completed si
    // ya procesamos todos los bloques).
    const blockCount   = Math.max(1, (campaign.block_count as number) || 1);
    const currentBlock = Math.min(blockCount - 1, (campaign.current_block as number) || 0);
    const batchSize    = campaign.batch_size || 10;

    // Obtener mensajes pendientes del bloque actual (limitado al batch)
    const { data: pendingMsgs } = await supabase
      .from('wa_campaign_messages')
      .select('*, contact:wa_contacts(id,phone,name)')
      .eq('campaign_id', campaign.id)
      .eq('status', 'pending')
      .eq('block_index', currentBlock)
      .order('created_at', { ascending: true })
      .limit(batchSize);

    if (!pendingMsgs?.length) {
      // ¿Quedan bloques siguientes?
      if (currentBlock + 1 < blockCount) {
        await supabase.from('wa_campaigns')
          .update({ current_block: currentBlock + 1 })
          .eq('id', campaign.id);
        // El próximo cron tomará el nuevo bloque
        continue;
      }

      // Revisar que realmente no queden pendings en ningún bloque antes de completar
      const { data: anyPending } = await supabase
        .from('wa_campaign_messages')
        .select('id')
        .eq('campaign_id', campaign.id)
        .eq('status', 'pending')
        .limit(1);

      if (!anyPending?.length) {
        await supabase.from('wa_campaigns').update({
          status: 'completed',
          completed_at: new Date().toISOString(),
        }).eq('id', campaign.id);
      }
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

      let result: SendResult = { ok: false, messageId: null, error: 'No enviado' };
      // Rotador: elige una variante aleatoria (incluyendo la base) para
      // reducir riesgo de bloqueo por texto idéntico repetido.
      const baseContent = msg.content || template?.content || '';
      const rotated = pickContent(template, baseContent);
      // Re-aplicar variables sobre la variante rotada
      const messageContent = rotated
        .replace(/\{nombre\}/gi, contact.name || '')
        .replace(/\{telefono\}/gi, contact.phone || '');

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mediaItems: Array<{ kind: string; url: string; filename?: string; mimetype?: string }> =
        Array.isArray(template?.media_items) ? template!.media_items as any[] : [];

      try {
        if (mediaItems.length > 0) {
          // Envío multi-media: imágenes, audios, videos y PDFs en el mismo
          // mensaje. El texto viaja como caption del PRIMER image/video; si
          // no hay image/video, se manda como texto separado al final.
          const captionableIdx = mediaItems.findIndex(
            (m) => m.kind === 'image' || m.kind === 'video',
          );

          const results: SendResult[] = [];
          for (let i = 0; i < mediaItems.length; i++) {
            const item = mediaItems[i];
            const caption = i === captionableIdx ? messageContent : '';
            const filename = item.filename || 'archivo';
            const mimetype = item.mimetype || '';

            let r: SendResult;
            if (item.kind === 'image') {
              r = await evoSendMedia(
                instanceName, contact.phone, 'image', item.url,
                caption, mimetype || 'image/jpeg', filename,
              );
            } else if (item.kind === 'video') {
              r = await evoSendMedia(
                instanceName, contact.phone, 'video', item.url,
                caption, mimetype || 'video/mp4', filename,
              );
            } else if (item.kind === 'pdf') {
              r = await evoSendMedia(
                instanceName, contact.phone, 'document', item.url,
                caption, mimetype || 'application/pdf', filename,
              );
            } else if (item.kind === 'audio') {
              r = await evoSendAudio(instanceName, contact.phone, item.url);
            } else {
              r = { ok: false, messageId: null, error: `tipo media desconocido: ${item.kind}` };
            }
            results.push(r);

            // Delay corto entre items del MISMO mensaje (2-4s)
            if (i < mediaItems.length - 1) {
              await sleep(randomDelay(2000, 4000));
            }
          }

          // Si había texto y ningún media lo llevó como caption, enviar al final
          if (captionableIdx === -1 && messageContent.trim()) {
            await sleep(randomDelay(1500, 3000));
            const rText = await evoSendText(instanceName, contact.phone, messageContent, 0);
            results.push(rText);
          }

          const okCount = results.filter(r => r.ok).length;
          const firstOk = results.find(r => r.ok);
          const firstErr = results.find(r => !r.ok);
          result = {
            ok: okCount > 0 && okCount === results.length,
            messageId: firstOk?.messageId ?? null,
            error: okCount === results.length ? undefined : (firstErr?.error || 'Alguno de los envíos falló'),
          };
        } else if (template?.message_type === 'image' && template.media_url) {
          result = await evoSendMedia(instanceName, contact.phone, 'image', template.media_url, messageContent, 'image/jpeg', template.media_filename || 'imagen.jpg');
        } else if (template?.message_type === 'pdf' && template.media_url) {
          result = await evoSendMedia(instanceName, contact.phone, 'document', template.media_url, messageContent, 'application/pdf', template.media_filename || 'documento.pdf');
        } else if (template?.message_type === 'video' && template.media_url) {
          result = await evoSendMedia(instanceName, contact.phone, 'video', template.media_url, messageContent, 'video/mp4', template.media_filename || 'video.mp4');
        } else if (template?.message_type === 'audio' && template.media_url) {
          result = await evoSendAudio(instanceName, contact.phone, template.media_url);
        } else {
          result = await evoSendText(instanceName, contact.phone, messageContent, 0);
        }
      } catch (e) {
        result = { ok: false, messageId: null, error: String(e).slice(0, 500) };
      }

      // Actualizar estado del mensaje
      await supabase.from('wa_campaign_messages').update({
        status: result.ok ? 'sent' : 'failed',
        sent_at: result.ok ? new Date().toISOString() : null,
        evolution_message_id: result.messageId,
        error_message: result.ok ? null : (result.error ?? 'Error al enviar mensaje'),
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
