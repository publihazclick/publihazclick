import { createClient } from 'npm:@supabase/supabase-js@2';

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

Deno.serve(async (req) => {
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
      return json({ ok: false, error: 'Código expirado o inválido. Solicita uno nuevo.' });
    }

    if (data.code_hash !== hash) {
      return json({ ok: false, error: 'Código incorrecto. Verifica e intenta de nuevo.' });
    }

    // Marcar como usado
    await sb.from('ag_otp_codes').update({ used: true }).eq('id', data.id);

    // Crear sesión Supabase para este número de teléfono
    // Email/password sintéticos derivados del número (determinístico: mismo teléfono = mismo usuario)
    const salt = Deno.env.get('AG_SESSION_SALT') ?? 'movi-ag-2026';
    const pwHash = await sha256(normalized + salt);
    const syntheticEmail = `ag_${normalized.replace(/\+/g, '')}@movi-driver.app`;
    const syntheticPassword = `Ag${pwHash.slice(0, 30)}`;

    // Intentar crear usuario (si ya existe, ignorar error)
    await sb.auth.admin.createUser({
      email: syntheticEmail,
      password: syntheticPassword,
      email_confirm: true,
      user_metadata: { phone: normalized, source: 'movi_otp' },
    });

    // Iniciar sesión con las credenciales
    const { data: signIn, error: signInErr } = await sb.auth.signInWithPassword({
      email: syntheticEmail,
      password: syntheticPassword,
    });

    if (signInErr || !signIn?.session) {
      // Devolver ok:true sin sesión — el cliente intentará anonymous auth como fallback
      return json({ ok: true });
    }

    // Vincular este auth_user_id al perfil ag_users para que topup/API encuentren el conductor
    await sb.from('ag_users')
      .update({ auth_user_id: signIn.user!.id })
      .eq('phone', normalized);

    return json({
      ok: true,
      access_token: signIn.session.access_token,
      refresh_token: signIn.session.refresh_token,
    });
  } catch (e) {
    console.error(e);
    return json({ ok: false, error: 'Error interno. Intenta de nuevo.' });
  }
});
