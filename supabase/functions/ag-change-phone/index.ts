// Edge Function: ag-change-phone
// Cambia el número de celular de una cuenta ya logueada, de forma segura:
// 1) el cliente ya mandó un OTP al número NUEVO via ag-otp-send
// 2) esta función verifica ese código, confirma que el número no esté en
//    uso por otra cuenta, y sincroniza las credenciales sintéticas del auth
//    user (email+password derivados del teléfono, ver ag-otp-verify) para
//    que el siguiente login con el número nuevo funcione.
//
// Requiere sesión activa (se despliega CON verificación de JWT) -- el
// user_id se saca del token, nunca se confía en uno mandado por el cliente,
// para que nadie pueda secuestrar la cuenta de otra persona con solo tener
// un código OTP de un número cualquiera.

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
    const authHeader = req.headers.get('Authorization') ?? '';
    const jwt = authHeader.replace(/^Bearer\s+/i, '');
    if (!jwt) return json({ ok: false, error: 'Sesión requerida' }, 401);

    const body = await req.json();
    const { new_phone, code } = body;
    if (!new_phone || !code) return json({ ok: false, error: 'Número y código requeridos' }, 400);

    const sb = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Identificar al usuario dueño de la sesión -- NUNCA confiar en un id mandado por el cliente
    const { data: userData, error: userErr } = await sb.auth.getUser(jwt);
    if (userErr || !userData?.user) return json({ ok: false, error: 'Sesión inválida' }, 401);
    const authUserId = userData.user.id;

    const { data: agUser, error: agUserErr } = await sb
      .from('ag_users').select('*').eq('auth_user_id', authUserId).maybeSingle();
    if (agUserErr || !agUser) return json({ ok: false, error: 'Cuenta no encontrada' }, 404);
    if (agUser.is_deleted) return json({ ok: false, error: 'Esta cuenta fue dada de baja' }, 403);

    const normalized = toE164(new_phone);
    if (normalized === agUser.phone) {
      return json({ ok: false, error: 'Ese ya es tu número actual' });
    }

    // Verificar OTP del número nuevo (enviado antes por ag-otp-send)
    const hash = await sha256(String(code).trim());
    const { data: otpData, error: otpError } = await sb
      .from('ag_otp_codes')
      .select('id, code_hash')
      .eq('phone', normalized)
      .eq('used', false)
      .gte('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (otpError || !otpData) {
      return json({ ok: false, error: 'Código expirado o inválido. Solicita uno nuevo.' });
    }
    if (otpData.code_hash !== hash) {
      return json({ ok: false, error: 'Código incorrecto. Verifica e intenta de nuevo.' });
    }
    await sb.from('ag_otp_codes').update({ used: true }).eq('id', otpData.id);

    // El número nuevo no puede estar en uso por otra cuenta activa
    const { data: taken } = await sb
      .from('ag_users').select('id').eq('phone', normalized).eq('is_deleted', false)
      .neq('id', agUser.id).maybeSingle();
    if (taken) {
      return json({ ok: false, error: 'Ese número ya está registrado en otra cuenta de Movi.' });
    }

    // Sincronizar credenciales sintéticas del auth user (mismo algoritmo que ag-otp-verify)
    // -- si no se actualiza esto, el próximo login con el número nuevo crearía un auth user
    // duplicado en vez de reconocer esta misma cuenta.
    const salt = Deno.env.get('AG_SESSION_SALT') ?? 'movi-ag-2026';
    const pwHash = await sha256(normalized + salt);
    const syntheticEmail = `ag_${normalized.replace(/\+/g, '')}@movi-driver.app`;
    const syntheticPassword = `Ag${pwHash.slice(0, 30)}`;

    const { error: updateAuthErr } = await sb.auth.admin.updateUserById(authUserId, {
      email: syntheticEmail,
      password: syntheticPassword,
      email_confirm: true,
    });
    if (updateAuthErr) {
      console.error('[ag-change-phone] updateUserById failed:', updateAuthErr.message);
      return json({ ok: false, error: 'No se pudo actualizar la cuenta. Intenta de nuevo.' });
    }

    const { data: updatedProfile, error: updateProfileErr } = await sb
      .from('ag_users')
      .update({ phone: normalized, phone_verified: true })
      .eq('id', agUser.id)
      .select('*').single();

    if (updateProfileErr) {
      console.error('[ag-change-phone] update ag_users failed:', updateProfileErr.message);
      return json({ ok: false, error: 'No se pudo guardar el número nuevo. Intenta de nuevo.' });
    }

    return json({ ok: true, profile: updatedProfile });
  } catch (e) {
    console.error('[ag-change-phone] unhandled error:', e);
    return json({ ok: false, error: 'Error interno. Intenta de nuevo.' });
  }
});
