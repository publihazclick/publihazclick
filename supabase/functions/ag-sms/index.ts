// Supabase Edge Function: Send SMS via Telnyx
// Env vars required: TELNYX_API_KEY, TELNYX_PHONE_NUMBER, TELNYX_MESSAGING_PROFILE_ID (optional)

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

    const apiKey     = Deno.env.get('TELNYX_API_KEY');
    const fromNumber = Deno.env.get('TELNYX_PHONE_NUMBER');
    const profileId  = Deno.env.get('TELNYX_MESSAGING_PROFILE_ID');

    if (!apiKey || !fromNumber) {
      // Telnyx not configured — return success so dev mode still works
      console.warn('Telnyx not configured, SMS not sent');
      return json({ sent: false, dev: true });
    }

    const payload: Record<string, string> = {
      from: fromNumber,
      to: phone,
      text: `Tu código de verificación Anda y Gana es: ${code}. Válido por 10 minutos.`,
    };
    if (profileId) {
      payload.messaging_profile_id = profileId;
    }

    const resp = await fetch('https://api.telnyx.com/v2/messages', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!resp.ok) {
      const err = await resp.text();
      console.error('Telnyx error:', err);
      return json({ sent: false, error: 'SMS provider error' }, 500);
    }

    return json({ sent: true });
  } catch (e) {
    console.error(e);
    return json({ error: 'Internal error' }, 500);
  }
});
