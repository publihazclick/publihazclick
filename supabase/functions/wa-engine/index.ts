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

// Valida el JWT usando el endpoint /auth/v1/user de Supabase.
// Soporta HS256 y ES256 (firma asimétrica).
async function verifyUser(
  supabase: ReturnType<typeof createClient>,
  token: string,
): Promise<string | null> {
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user.id;
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

// Evolution API v2.x usa `byEvents`/`base64` en /instance/create y
// `webhookByEvents`/`webhookBase64` en /webhook/set. Le pasamos el objeto
// con los nombres correctos en cada lugar.
const WEBHOOK_EVENTS = ['CONNECTION_UPDATE', 'QRCODE_UPDATED', 'MESSAGES_UPDATE', 'SEND_MESSAGE'];

function buildCreateWebhookPayload(webhookUrl: string) {
  return {
    url: webhookUrl,
    byEvents: false,
    base64: true,
    events: WEBHOOK_EVENTS,
  };
}

// Fallback: Evolution v2.2.x a veces ignora el webhook pasado en /instance/create.
// Lo registramos explicitamente con /webhook/set como red de seguridad.
async function ensureWebhookRegistered(instance: string, webhookUrl: string): Promise<void> {
  try {
    await evoFetch(`/webhook/set/${instance}`, 'POST', {
      webhook: {
        enabled: true,
        url: webhookUrl,
        webhookByEvents: false,
        webhookBase64: true,
        events: WEBHOOK_EVENTS,
      },
    });
  } catch (e) {
    console.error('[wa-engine] ensureWebhookRegistered failed', e);
  }
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
    const token = authHeader.replace('Bearer ', '');

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const userId = await verifyUser(supabase, token);
    if (!userId) return json({ error: 'Token invalido' }, 401);

    // Verificar suscripcion
    const hasSub = await checkSubscription(supabase, userId);
    if (!hasSub) return json({ error: 'Suscripcion no activa' }, 403);

    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const action = body.action as string;

    // ── Acciones ──────────────────────────────────────────────────────────────

    // 1. Crear instancia WhatsApp
    if (action === 'create_instance') {
      const instanceName = `phc_${userId.substring(0, 8)}_${Date.now()}`;

      // URL del webhook para recibir eventos de Evolution API (conexion / mensajes)
      const webhookUrl = `${SUPABASE_URL}/functions/v1/wa-evolution-webhook`;

      const result = await evoFetch('/instance/create', 'POST', {
        instanceName,
        integration: 'WHATSAPP-BAILEYS',
        qrcode: true,
        rejectCall: true,
        alwaysOnline: false,
        readMessages: false,
        readStatus: false,
        syncFullHistory: false,
        webhook: buildCreateWebhookPayload(webhookUrl),
      });

      // Red de seguridad: registrar el webhook por endpoint dedicado por si
      // Evolution ignoro el campo `webhook` del create.
      await ensureWebhookRegistered(instanceName, webhookUrl);

      // Guardar sesion en DB — phone_number guarda el nombre de la instancia
      // para poder identificarla luego en las operaciones de Evolution API.
      const evoResult = result as Record<string, unknown>;
      const { data: inserted } = await supabase
        .from('wa_sessions')
        .insert({
          user_id: userId,
          session_name: (body.name as string) || 'Principal',
          phone_number: instanceName,
          status: 'qr_pending',
        })
        .select('id')
        .single();

      return json({
        ok: true,
        instance: instanceName,
        session_id: inserted?.id ?? null,
        data: evoResult,
      });
    }

    // 2. Obtener QR Code — resiliente a instancias huerfanas o dormidas
    if (action === 'get_qr') {
      const instance = body.instance as string;
      if (!instance) return json({ error: 'instance requerido' }, 400);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const extractQR = (r: any) => {
        const qr = r?.qrcode ?? r ?? {};
        return {
          code: (qr?.code ?? r?.code ?? null) as string | null,
          base64: (qr?.base64 ?? r?.base64 ?? null) as string | null,
          pairingCode: (qr?.pairingCode ?? r?.pairingCode ?? null) as string | null,
        };
      };

      // ¿Existe la instancia en Evolution?
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const fetched = await evoFetch(`/instance/fetchInstances?instanceName=${instance}`, 'GET') as any;
      const exists = Array.isArray(fetched) && fetched.length > 0;

      let code: string | null = null;
      let base64: string | null = null;
      let pairingCode: string | null = null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const debug: Record<string, any> = { exists };

      if (exists) {
        debug.fetched = fetched;

        // Logout por si quedo pegada a una sesion anterior que ya no responde.
        // Esto fuerza a Evolution a generar un QR nuevo al llamar connect.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let logoutResp: any = null;
        try {
          logoutResp = await evoFetch(`/instance/logout/${instance}`, 'DELETE');
        } catch (e) { logoutResp = { error: String(e) }; }
        debug.logout = logoutResp;

        await new Promise((r) => setTimeout(r, 1500));

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let result: any = await evoFetch(`/instance/connect/${instance}`, 'GET');
        ({ code, base64, pairingCode } = extractQR(result));
        debug.connect1 = result;

        // Si todavia no genero QR, esperar y reintentar (QR puede ser async).
        if (!code && !base64) {
          await new Promise((r) => setTimeout(r, 4000));
          result = await evoFetch(`/instance/connect/${instance}`, 'GET');
          ({ code, base64, pairingCode } = extractQR(result));
          debug.connect2 = result;
        }

        // Ultimo recurso: borrar y recrear desde cero.
        if (!code && !base64) {
          try { await evoFetch(`/instance/delete/${instance}`, 'DELETE'); } catch { /* noop */ }
          await new Promise((r) => setTimeout(r, 1500));

          const webhookUrl = `${SUPABASE_URL}/functions/v1/wa-evolution-webhook`;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const created = await evoFetch('/instance/create', 'POST', {
            instanceName: instance,
            integration: 'WHATSAPP-BAILEYS',
            qrcode: true,
            rejectCall: true,
            alwaysOnline: false,
            readMessages: false,
            readStatus: false,
            syncFullHistory: false,
            webhook: buildCreateWebhookPayload(webhookUrl),
          }) as any;
          await ensureWebhookRegistered(instance, webhookUrl);
          ({ code, base64, pairingCode } = extractQR(created));
          debug.recreated = created;

          if (!code && !base64) {
            await new Promise((r) => setTimeout(r, 3000));
            result = await evoFetch(`/instance/connect/${instance}`, 'GET');
            ({ code, base64, pairingCode } = extractQR(result));
            debug.connectAfterRecreate = result;
          }
        }
      } else {
        // No existe: crear con el mismo nombre.
        const webhookUrl = `${SUPABASE_URL}/functions/v1/wa-evolution-webhook`;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const created = await evoFetch('/instance/create', 'POST', {
          instanceName: instance,
          integration: 'WHATSAPP-BAILEYS',
          qrcode: true,
          rejectCall: true,
          alwaysOnline: false,
          readMessages: false,
          readStatus: false,
          syncFullHistory: false,
          webhook: buildCreateWebhookPayload(webhookUrl),
        }) as any;
        await ensureWebhookRegistered(instance, webhookUrl);

        ({ code, base64, pairingCode } = extractQR(created));

        if (!code && !base64) {
          await new Promise((r) => setTimeout(r, 2500));
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const conn = await evoFetch(`/instance/connect/${instance}`, 'GET') as any;
          ({ code, base64, pairingCode } = extractQR(conn));
          debug.connectAfterCreate = conn;
        }
        debug.created = created;

        await supabase
          .from('wa_sessions')
          .update({ status: 'qr_pending' })
          .eq('phone_number', instance)
          .eq('user_id', userId);
      }

      // Si Evolution aun no genera el QR sincronamente, leer de la BD lo que
      // haya llegado por webhook (QRCODE_UPDATED).
      if (!code && !base64) {
        const { data: sess } = await supabase
          .from('wa_sessions')
          .select('qr_code, qr_base64, pairing_code, qr_updated_at')
          .eq('phone_number', instance)
          .eq('user_id', userId)
          .maybeSingle();
        const s = sess as Record<string, unknown> | null;
        if (s) {
          // Solo aceptamos QR reciente (<60s) para evitar mostrar uno caducado.
          const ageMs = s.qr_updated_at ? Date.now() - Date.parse(s.qr_updated_at as string) : Infinity;
          if (ageMs < 60_000) {
            code = code || (s.qr_code as string | null);
            base64 = base64 || (s.qr_base64 as string | null);
            pairingCode = pairingCode || (s.pairing_code as string | null);
            debug.fromDb = true;
          } else {
            debug.dbQrStale = ageMs;
          }
        }
      }

      return json({ ok: true, data: { code, base64, pairingCode, count: 1, _debug: debug } });
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

      // Disparar el worker de forma asincrona para que el primer lote se envie
      // de inmediato sin esperar al cron.
      fetch(`${SUPABASE_URL}/functions/v1/wa-campaign-worker`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        },
        body: JSON.stringify({ trigger: 'start_campaign', campaign_id: campaignId }),
      }).catch((e) => console.error('worker trigger failed:', e));

      return json({
        ok: true,
        message: `Campaña iniciada con ${contacts.length} contactos. El envio comenzara en segundos.`,
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
