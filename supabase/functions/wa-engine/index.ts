// =============================================================================
// Edge Function: wa-engine
// Proxy seguro hacia Evolution API para envio real de mensajes WhatsApp.
// Maneja: crear instancia, obtener QR, enviar texto/media/audio/PDF, estado.
// =============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL         = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const EVOLUTION_API_URL    = Deno.env.get('EVOLUTION_API_URL') ?? '';
const EVOLUTION_API_KEY    = Deno.env.get('EVOLUTION_API_KEY') ?? '';

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

function decodeJwt(token: string): { sub: string } {
  const b64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
  return JSON.parse(atob(b64));
}

async function evoFetch(path: string, method = 'GET', body?: unknown): Promise<unknown> {
  const url = `${EVOLUTION_API_URL}${path}`;
  const opts: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
      'apikey': EVOLUTION_API_KEY,
    },
  };
  if (body && method !== 'GET') opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  return res.json();
}

// ── Verificar suscripcion activa ─────────────────────────────────────────────
async function checkSubscription(supabase: ReturnType<typeof createClient>, userId: string): Promise<boolean> {
  const { data } = await supabase
    .from('wa_subscriptions')
    .select('id')
    .eq('user_id', userId)
    .eq('status', 'active')
    .gte('expires_at', new Date().toISOString())
    .limit(1);
  return (data?.length ?? 0) > 0;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    if (!EVOLUTION_API_URL || !EVOLUTION_API_KEY) {
      return json({ error: 'Evolution API no configurada' }, 500);
    }

    // Auth
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return json({ error: 'No autorizado' }, 401);
    const userId = decodeJwt(authHeader.replace('Bearer ', '')).sub;
    if (!userId) return json({ error: 'Token invalido' }, 401);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Verificar suscripcion
    const hasSub = await checkSubscription(supabase, userId);
    if (!hasSub) return json({ error: 'Suscripcion no activa' }, 403);

    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const action = body.action as string;

    // ── Acciones ──────────────────────────────────────────────────────────────

    // 1. Crear instancia WhatsApp
    if (action === 'create_instance') {
      const instanceName = `phc_${userId.substring(0, 8)}_${Date.now()}`;
      const result = await evoFetch('/instance/create', 'POST', {
        instanceName,
        integration: 'WHATSAPP-BAILEYS',
        qrcode: true,
        rejectCall: true,
        alwaysOnline: false,
        readMessages: false,
        readStatus: false,
        syncFullHistory: false,
      });

      // Guardar sesion en DB
      const evoResult = result as Record<string, unknown>;
      await supabase.from('wa_sessions').insert({
        user_id: userId,
        session_name: (body.name as string) || 'Principal',
        phone_number: null,
        status: 'qr_pending',
      });

      return json({ ok: true, instance: instanceName, data: evoResult });
    }

    // 2. Obtener QR Code
    if (action === 'get_qr') {
      const instance = body.instance as string;
      if (!instance) return json({ error: 'instance requerido' }, 400);
      const result = await evoFetch(`/instance/connect/${instance}`, 'GET');
      return json({ ok: true, data: result });
    }

    // 3. Estado de la instancia
    if (action === 'get_status') {
      const instance = body.instance as string;
      if (instance) {
        const result = await evoFetch(`/instance/fetchInstances?instanceName=${instance}`, 'GET');
        return json({ ok: true, data: result });
      }
      // Todas las instancias del usuario
      const result = await evoFetch('/instance/fetchInstances', 'GET');
      return json({ ok: true, data: result });
    }

    // 4. Desconectar / eliminar instancia
    if (action === 'delete_instance') {
      const instance = body.instance as string;
      if (!instance) return json({ error: 'instance requerido' }, 400);
      await evoFetch(`/instance/delete/${instance}`, 'DELETE');
      return json({ ok: true });
    }

    // 5. Enviar texto
    if (action === 'send_text') {
      const instance = body.instance as string;
      const number = body.number as string;
      const text = body.text as string;
      const delay = (body.delay as number) || 0;
      if (!instance || !number || !text) return json({ error: 'instance, number y text requeridos' }, 400);

      const result = await evoFetch(`/message/sendText/${instance}`, 'POST', {
        number,
        text,
        delay: delay * 1000, // convertir segundos a ms
      });
      return json({ ok: true, data: result });
    }

    // 6. Enviar media (imagen, video, documento/PDF)
    if (action === 'send_media') {
      const instance = body.instance as string;
      const number = body.number as string;
      const mediatype = body.mediatype as string; // 'image', 'video', 'document'
      const media = body.media as string; // URL del archivo
      const caption = (body.caption as string) || '';
      const fileName = (body.fileName as string) || 'archivo';
      const mimetype = (body.mimetype as string) || 'application/octet-stream';
      const delay = (body.delay as number) || 0;

      if (!instance || !number || !media) return json({ error: 'instance, number y media requeridos' }, 400);

      const result = await evoFetch(`/message/sendMedia/${instance}`, 'POST', {
        number,
        mediatype,
        mimetype,
        caption,
        media,
        fileName,
        delay: delay * 1000,
      });
      return json({ ok: true, data: result });
    }

    // 7. Enviar audio (se envia como nota de voz)
    if (action === 'send_audio') {
      const instance = body.instance as string;
      const number = body.number as string;
      const audio = body.audio as string; // URL del audio
      const delay = (body.delay as number) || 0;

      if (!instance || !number || !audio) return json({ error: 'instance, number y audio requeridos' }, 400);

      const result = await evoFetch(`/message/sendWhatsAppAudio/${instance}`, 'POST', {
        number,
        audio,
        delay: delay * 1000,
      });
      return json({ ok: true, data: result });
    }

    // 8. Enviar campaña masiva (orquestador)
    if (action === 'start_campaign') {
      const campaignId = body.campaign_id as string;
      if (!campaignId) return json({ error: 'campaign_id requerido' }, 400);

      // Obtener campaña
      const { data: campaign } = await supabase
        .from('wa_campaigns')
        .select('*, template:wa_templates(*)')
        .eq('id', campaignId)
        .eq('user_id', userId)
        .single();

      if (!campaign) return json({ error: 'Campaña no encontrada' }, 404);
      if (!campaign.template) return json({ error: 'Plantilla no asignada' }, 400);

      // Obtener contactos segun target
      let contacts: { id: string; phone: string; name: string | null }[] = [];
      if (campaign.target_type === 'all') {
        const { data } = await supabase
          .from('wa_contacts')
          .select('id, phone, name')
          .eq('user_id', userId)
          .eq('is_valid', true)
          .eq('is_blocked', false);
        contacts = data ?? [];
      } else if (campaign.target_type === 'group' && campaign.target_group_id) {
        const { data: members } = await supabase
          .from('wa_contact_group_members')
          .select('contact_id')
          .eq('group_id', campaign.target_group_id);
        const ids = (members ?? []).map((m: { contact_id: string }) => m.contact_id);
        if (ids.length > 0) {
          const { data } = await supabase
            .from('wa_contacts')
            .select('id, phone, name')
            .in('id', ids)
            .eq('is_valid', true)
            .eq('is_blocked', false);
          contacts = data ?? [];
        }
      }

      if (contacts.length === 0) {
        return json({ error: 'No hay contactos validos para esta campaña' }, 400);
      }

      // Actualizar campaña como running
      await supabase.from('wa_campaigns').update({
        status: 'running',
        started_at: new Date().toISOString(),
        total_contacts: contacts.length,
      }).eq('id', campaignId);

      // Crear registros de mensajes pendientes
      const messageRows = contacts.map(c => ({
        campaign_id: campaignId,
        contact_id: c.id,
        status: 'pending',
        content: campaign.template.content
          .replace(/\{nombre\}/gi, c.name || '')
          .replace(/\{telefono\}/gi, c.phone || ''),
      }));

      await supabase.from('wa_campaign_messages').insert(messageRows);

      // Obtener instancia activa del usuario
      const { data: sessions } = await supabase
        .from('wa_sessions')
        .select('*')
        .eq('user_id', userId)
        .eq('status', 'connected')
        .limit(1);

      if (!sessions?.length) {
        await supabase.from('wa_campaigns').update({ status: 'failed' }).eq('id', campaignId);
        return json({ error: 'No tienes una sesion de WhatsApp conectada' }, 400);
      }

      // Nota: El envio real se procesaria en un worker/cron que lee los mensajes pendientes
      // y los envia respetando los delays. Aqui iniciamos el proceso.
      return json({
        ok: true,
        message: `Campaña iniciada con ${contacts.length} contactos`,
        campaign_id: campaignId,
        contacts_count: contacts.length,
      });
    }

    return json({ error: `Accion '${action}' no reconocida` }, 400);

  } catch (err) {
    console.error('wa-engine error:', err);
    return json({ error: 'Error interno del servidor' }, 500);
  }
});
