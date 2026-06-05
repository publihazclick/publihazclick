import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

const WA_TOKEN = Deno.env.get('META_WA_TOKEN')!;
const PHONE_NUMBER_ID = Deno.env.get('META_WA_PHONE_NUMBER_ID')!;
const WEBHOOK_VERIFY_TOKEN = Deno.env.get('META_WA_WEBHOOK_VERIFY_TOKEN') ?? 'movi_webhook_2026';

function toE164(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (phone.startsWith('+')) return `+${digits}`;
  if (digits.length === 10) return `+57${digits}`;
  if (digits.length === 12 && digits.startsWith('57')) return `+${digits}`;
  return `+${digits}`;
}

async function sendTextMessage(to: string, text: string): Promise<boolean> {
  const phone = toE164(to);
  const url = `https://graph.facebook.com/v20.0/${PHONE_NUMBER_ID}/messages`;

  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${WA_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: phone,
      type: 'text',
      text: { preview_url: false, body: text },
    }),
  });

  if (!resp.ok) {
    const err = await resp.text();
    console.error('Meta WA error:', resp.status, err);
    return false;
  }
  return true;
}

// Mensajes predefinidos para cada evento de Movi
function buildMessage(event: string, data: Record<string, string>): string {
  switch (event) {
    case 'trip_request':
      return `🚗 *Movi* — Nueva solicitud de viaje\n\n📍 Origen: ${data.origin}\n📍 Destino: ${data.destination}\n💰 Precio ofrecido: $${data.price}\n\nAbre la app para ver y aceptar el viaje.`;

    case 'offer_received':
      return `🚗 *Movi* — Tienes una nueva oferta\n\nEl conductor ${data.driver_name} (⭐ ${data.driver_rating}) oferta $${data.price} por tu viaje.\n\nAbre la app para aceptar o contraofertar.`;

    case 'trip_accepted':
      return `✅ *Movi* — ¡Tu viaje fue aceptado!\n\nConductor: ${data.driver_name}\nVehículo: ${data.vehicle}\nPlaca: ${data.plate}\n\nEl conductor está en camino. Puedes rastrearlo en la app.`;

    case 'driver_arrived':
      return `📍 *Movi* — ¡Tu conductor llegó!\n\n${data.driver_name} está esperándote. Tienes 5 minutos para abordar.\n\nAbre la app para confirmar.`;

    case 'trip_started':
      return `🚀 *Movi* — ¡Tu viaje comenzó!\n\nDestino: ${data.destination}\nBuen viaje 😊`;

    case 'trip_completed':
      return `🏁 *Movi* — Viaje completado\n\nTotal: $${data.amount}\nGracias por usar Movi. ¡Califica tu experiencia en la app!`;

    case 'trip_cancelled':
      return `❌ *Movi* — Viaje cancelado\n\nMotivo: ${data.reason}\n\n¿Necesitas otro viaje? Abre la app para solicitar uno nuevo.`;

    case 'new_driver_offer_passenger':
      return `🚗 *Movi* — Nueva oferta de conductor\n\n${data.driver_name} ofrece llevarte por $${data.price}.\nCalificación: ⭐ ${data.driver_rating}\n\nAbre la app para responder.`;

    case 'withdrawal_approved':
      return `💸 *Movi* — Retiro aprobado\n\nTu retiro de $${data.amount} fue aprobado y está en proceso.\nLlegará en máximo 24 horas hábiles.`;

    case 'sos_alert':
      return `🆘 *Movi* — ALERTA DE EMERGENCIA\n\nEl usuario ${data.user_name} activó el botón de pánico.\nUbicación: ${data.location}\nViaje ID: ${data.trip_id}`;

    default:
      return data.message ?? 'Mensaje de Movi';
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const url = new URL(req.url);

  // Verificación del webhook de Meta (GET)
  if (req.method === 'GET') {
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');

    if (mode === 'subscribe' && token === WEBHOOK_VERIFY_TOKEN) {
      console.log('Webhook verificado por Meta');
      return new Response(challenge, { status: 200 });
    }
    return new Response('Forbidden', { status: 403 });
  }

  // Webhook entrante de Meta (mensajes de usuarios)
  if (req.method === 'POST' && url.pathname.endsWith('/webhook')) {
    try {
      const body = await req.json();
      const entry = body?.entry?.[0];
      const changes = entry?.changes?.[0]?.value;
      const messages = changes?.messages;

      if (messages?.length) {
        const msg = messages[0];
        const from = msg.from; // número del usuario
        const text = msg.text?.body ?? '';
        const msgId = msg.id;

        console.log(`Mensaje WA entrante de ${from}: ${text}`);

        // Guardar en Supabase
        const supabase = createClient(
          Deno.env.get('SUPABASE_URL')!,
          Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
        );

        await supabase.from('ag_whatsapp_messages').insert({
          from_number: from,
          message_text: text,
          wa_message_id: msgId,
          direction: 'inbound',
        });

        // Respuesta automática básica
        if (text.toLowerCase().includes('hola') || text.toLowerCase().includes('ayuda')) {
          await sendTextMessage(from,
            '👋 Hola, soy Movi. Para solicitar un viaje o recibir soporte, abre la app en: https://www.publihazclick.com/anda-gana'
          );
        }
      }

      return new Response('ok', { status: 200 });
    } catch (e) {
      console.error('Webhook error:', e);
      return new Response('ok', { status: 200 }); // Siempre 200 a Meta
    }
  }

  // Envío de mensajes desde Movi (POST principal)
  if (req.method === 'POST') {
    try {
      const { phone, event, data, message } = await req.json();

      if (!phone) return json({ error: 'phone requerido' }, 400);

      const text = message ?? buildMessage(event ?? 'custom', data ?? {});
      const sent = await sendTextMessage(phone, text);

      if (!sent) return json({ sent: false, error: 'No se pudo enviar el mensaje WA' }, 500);

      return json({ sent: true });
    } catch (e) {
      console.error(e);
      return json({ error: 'Internal error' }, 500);
    }
  }

  return json({ error: 'Method not allowed' }, 405);
});
