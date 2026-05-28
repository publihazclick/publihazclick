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
    const body = await req.json();
    const { phone, code, name, role, referred_by } = body;
    if (!phone || !code) return json({ error: 'phone y code requeridos' }, 400);

    const normalized = toE164(phone);
    const hash = await sha256(String(code).trim());

    const sb = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Verify OTP code
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

    // Mark OTP as used
    await sb.from('ag_otp_codes').update({ used: true }).eq('id', otpData.id);

    // Create/get synthetic auth user (deterministic: same phone = same auth user)
    const salt = Deno.env.get('AG_SESSION_SALT') ?? 'movi-ag-2026';
    const pwHash = await sha256(normalized + salt);
    const syntheticEmail = `ag_${normalized.replace(/\+/g, '')}@movi-driver.app`;
    const syntheticPassword = `Ag${pwHash.slice(0, 30)}`;

    // Create user if not exists (ignore error if already exists)
    const { data: createData } = await sb.auth.admin.createUser({
      email: syntheticEmail,
      password: syntheticPassword,
      email_confirm: true,
      user_metadata: { phone: normalized, source: 'movi_otp' },
    });

    // Sign in to get session tokens
    const { data: signIn, error: signInErr } = await sb.auth.signInWithPassword({
      email: syntheticEmail,
      password: syntheticPassword,
    });

    const authUserId = signIn?.user?.id ?? createData?.user?.id;

    if (!authUserId) {
      // Cannot create auth session — return ok without profile (client falls back)
      return json({ ok: true });
    }

    // Upsert ag_users record using service role (bypasses all RLS)
    const userRole = role === 'driver' ? 'driver' : 'passenger';
    const fullName = (name && String(name).trim()) ? String(name).trim() : (userRole === 'driver' ? 'Conductor' : 'Usuario');

    // Check if user already exists by phone
    const { data: existing } = await sb
      .from('ag_users')
      .select('*')
      .eq('phone', normalized)
      .maybeSingle();

    let agUser: any = null;

    if (existing) {
      // Update auth_user_id if changed
      if (existing.auth_user_id !== authUserId) {
        const { data: updated } = await sb
          .from('ag_users')
          .update({ auth_user_id: authUserId })
          .eq('id', existing.id)
          .select('*')
          .single();
        agUser = updated ?? existing;
      } else {
        agUser = existing;
      }
    } else {
      // Insert new user
      const insertPayload: Record<string, any> = {
        auth_user_id: authUserId,
        role: userRole,
        full_name: fullName,
        phone: normalized,
        country: 'Colombia',
        department: '',
        city: '',
      };
      if (referred_by && typeof referred_by === 'string' && referred_by.length === 36) {
        // Validate referred_by looks like a UUID before inserting
        insertPayload.referred_by = referred_by;
      }
      const { data: inserted, error: insertErr } = await sb
        .from('ag_users')
        .insert(insertPayload)
        .select('*')
        .single();
      if (insertErr) {
        console.error('[ag-otp-verify] insert ag_users:', insertErr);
        // Don't fail the whole request — return ok with tokens, let client retry
      } else {
        agUser = inserted;
      }
    }

    if (!signIn?.session) {
      return json({ ok: true, profile: agUser });
    }

    return json({
      ok: true,
      access_token: signIn.session.access_token,
      refresh_token: signIn.session.refresh_token,
      profile: agUser,
    });
  } catch (e) {
    console.error(e);
    return json({ ok: false, error: 'Error interno. Intenta de nuevo.' });
  }
});
