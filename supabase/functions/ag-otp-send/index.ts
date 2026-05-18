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

function toE164(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (phone.startsWith('+')) return `+${digits}`;
  if (digits.length === 10) return `+57${digits}`;
  if (digits.length === 12 && digits.startsWith('57')) return `+${digits}`;
  return `+${digits}`;
}

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function sendSms(phone: string, code: string): Promise<boolean> {
  const apiKey    = Deno.env.get('TELNYX_API_KEY');
  const fromPhone = Deno.env.get('TELNYX_PHONE_NUMBER');
  const profileId = Deno.env.get('TELNYX_MESSAGING_PROFILE_ID');

  if (apiKey && fromPhone) {
    const payload: Record<string, string> = {
      from: fromPhone,
      to: phone,
      text: `Tu código de verificación Movi es: ${code}. Válido por 10 minutos.`,
    };
    if (profileId) payload.messaging_profile_id = profileId;

    const res = await fetch('https://api.telnyx.com/v2/messages', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (res.ok) return true;
    console.error('Telnyx error:', await res.text());
  }

  const sid   = Deno.env.get('TWILIO_ACCOUNT_SID');
  const token = Deno.env.get('TWILIO_AUTH_TOKEN');
  const from  = Deno.env.get('TWILIO_PHONE_NUMBER');

  if (sid && token && from) {
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${btoa(`${sid}:${token}`)}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          From: from,
          To: phone,
          Body: `Tu código de verificación Movi es: ${code}. Válido por 10 minutos.`,
        }).toString(),
      }
    );
    if (res.ok) return true;
    console.error('Twilio error:', await res.text());
  }

  return false;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { phone } = await req.json();
    if (!phone) return json({ error: 'phone requerido' }, 400);

    const normalized = toE164(phone);
    if (normalized.length < 10) return json({ error: 'Número de teléfono inválido' }, 400);

    const sb = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Rate limit: máximo 3 códigos por número en los últimos 10 minutos
    const { count } = await sb
      .from('ag_otp_codes')
      .select('id', { count: 'exact', head: true })
      .eq('phone', normalized)
      .gte('created_at', new Date(Date.now() - 10 * 60 * 1000).toISOString());

    if ((count ?? 0) >= 3) {
      return json({ error: 'Demasiados intentos. Espera unos minutos.' }, 429);
    }

    // Generar código de 6 dígitos
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const hash = await sha256(code);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    // Invalidar códigos anteriores del mismo número
    await sb.from('ag_otp_codes').delete().eq('phone', normalized).eq('used', false);

    // Insertar nuevo código
    const { error: insertError } = await sb.from('ag_otp_codes').insert({
      phone: normalized,
      code_hash: hash,
      expires_at: expiresAt,
    });

    if (insertError) {
      console.error('Insert error:', insertError);
      return json({ error: 'Error interno' }, 500);
    }

    const sent = await sendSms(normalized, code);
    if (!sent) return json({ error: 'No se pudo enviar el SMS. Intenta de nuevo.' }, 500);

    return json({ ok: true });
  } catch (e) {
    console.error(e);
    return json({ error: 'Error interno' }, 500);
  }
});
