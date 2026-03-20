// Supabase Edge Function: Send SMS via Twilio
// Env vars required: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER

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

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { phone, code } = await req.json();
    if (!phone || !code) return json({ error: 'phone and code required' }, 400);

    const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
    const authToken  = Deno.env.get('TWILIO_AUTH_TOKEN');
    const fromNumber = Deno.env.get('TWILIO_FROM_NUMBER');

    if (!accountSid || !authToken || !fromNumber) {
      // Twilio not configured — return success so dev mode still works
      console.warn('Twilio not configured, SMS not sent');
      return json({ sent: false, dev: true });
    }

    const url  = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
    const body = new URLSearchParams({
      To:   phone,
      From: fromNumber,
      Body: `Tu código de verificación Anda y Gana es: ${code}. Válido por 10 minutos.`,
    });

    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${btoa(`${accountSid}:${authToken}`)}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    });

    if (!resp.ok) {
      const err = await resp.text();
      console.error('Twilio error:', err);
      return json({ sent: false, error: 'SMS provider error' }, 500);
    }

    return json({ sent: true });
  } catch (e) {
    console.error(e);
    return json({ error: 'Internal error' }, 500);
  }
});
