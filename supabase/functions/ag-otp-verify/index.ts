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

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { phone, code } = await req.json();
    if (!phone || !code) return json({ error: 'phone y code requeridos' }, 400);

    const normalized = toE164(phone);
    const hash = await sha256(String(code).trim());

    const sb = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data, error } = await sb
      .from('ag_otp_codes')
      .select('id, code_hash')
      .eq('phone', normalized)
      .eq('used', false)
      .gte('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error || !data) {
      return json({ ok: false, error: 'Código expirado o inválido. Solicita uno nuevo.' }, 400);
    }

    if (data.code_hash !== hash) {
      return json({ ok: false, error: 'Código incorrecto. Verifica e intenta de nuevo.' }, 400);
    }

    // Marcar como usado
    await sb.from('ag_otp_codes').update({ used: true }).eq('id', data.id);

    return json({ ok: true });
  } catch (e) {
    console.error(e);
    return json({ error: 'Error interno' }, 500);
  }
});
