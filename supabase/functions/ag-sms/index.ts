import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

// Normaliza a E.164 asumiendo Colombia (+57) si no hay código de país
function toE164(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (phone.startsWith('+')) return `+${digits}`;
  // Colombia: números de 10 dígitos que empiezan con 3 son móviles
  if (digits.length === 10) return `+57${digits}`;
  // Ya tiene código de país (12 dígitos con 57)
  if (digits.length === 12 && digits.startsWith('57')) return `+${digits}`;
  return `+${digits}`;
}

async function sendViaTelnyx(phone: string, code: string): Promise<boolean> {
  const apiKey     = Deno.env.get('TELNYX_API_KEY');
  const fromNumber = Deno.env.get('TELNYX_PHONE_NUMBER');
  const profileId  = Deno.env.get('TELNYX_MESSAGING_PROFILE_ID');

  if (!apiKey || !fromNumber) return false;

  const payload: Record<string, string> = {
    from: fromNumber,
    to: phone,
    text: `Tu código de verificación Anda y Gana es: ${code}. Válido por 10 minutos.`,
  };
  if (profileId) payload.messaging_profile_id = profileId;

  const resp = await fetch('https://api.telnyx.com/v2/messages', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!resp.ok) {
    const err = await resp.text();
    console.error('Telnyx error:', resp.status, err);
    return false;
  }
  return true;
}

async function sendViaTwilio(phone: string, code: string): Promise<boolean> {
  const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
  const authToken  = Deno.env.get('TWILIO_AUTH_TOKEN');
  const fromNumber = Deno.env.get('TWILIO_PHONE_NUMBER');

  if (!accountSid || !authToken || !fromNumber) return false;

  const body = new URLSearchParams({
    From: fromNumber,
    To: phone,
    Body: `Tu código de verificación Anda y Gana es: ${code}. Válido por 10 minutos.`,
  });

  const resp = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
    {
      method: 'POST',
      headers: {
        Authorization: `Basic ${btoa(`${accountSid}:${authToken}`)}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    }
  );

  if (!resp.ok) {
    const err = await resp.text();
    console.error('Twilio error:', resp.status, err);
    return false;
  }
  return true;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { phone, code } = await req.json();
    if (!phone || !code) return json({ error: 'phone and code required' }, 400);

    const normalized = toE164(phone);
    console.log(`Sending SMS to ${normalized}`);

    // Intentar Telnyx primero, luego Twilio como fallback
    const sent = (await sendViaTelnyx(normalized, code)) || (await sendViaTwilio(normalized, code));

    if (!sent) {
      console.error('All SMS providers failed for', normalized);
      return json({ sent: false, error: 'No se pudo enviar el SMS' }, 500);
    }

    return json({ sent: true });
  } catch (e) {
    console.error(e);
    return json({ error: 'Internal error' }, 500);
  }
});
