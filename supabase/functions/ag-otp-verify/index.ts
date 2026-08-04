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

async function signInWithRetry(
  sb: any,
  email: string,
  password: string,
  existingAuthId: string | null
): Promise<{ userId: string | null; session: any }> {
  // 1. Try sign-in (user exists with correct password)
  const { data: si1 } = await sb.auth.signInWithPassword({ email, password });
  if (si1?.user) return { userId: si1.user.id, session: si1.session };

  // 2. If sign-in failed and we have an existing auth user → update their credentials
  if (existingAuthId) {
    try {
      await sb.auth.admin.updateUserById(existingAuthId, {
        email,
        password,
        email_confirm: true,
      });
      const { data: si2 } = await sb.auth.signInWithPassword({ email, password });
      if (si2?.user) return { userId: si2.user.id, session: si2.session };
    } catch (e) {
      console.error('[ag-otp-verify] updateUserById failed:', e);
    }
  }

  // 3. Create new auth user (first-time registration or auth user deleted)
  const { data: cd, error: createErr } = await sb.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { source: 'movi_otp' },
  });
  if (cd?.user) {
    const { data: si3 } = await sb.auth.signInWithPassword({ email, password });
    if (si3?.user) return { userId: si3.user.id, session: si3.session };
    // Created but sign-in still failing — return userId without session
    return { userId: cd.user.id, session: null };
  }

  console.error('[ag-otp-verify] all auth attempts failed. createErr:', createErr?.message);
  return { userId: null, session: null };
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

    // Verify OTP
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

    // Synthetic auth credentials (deterministic per phone)
    const salt = Deno.env.get('AG_SESSION_SALT') ?? 'movi-ag-2026';
    const pwHash = await sha256(normalized + salt);
    const syntheticEmail = `ag_${normalized.replace(/\+/g, '')}@movi-driver.app`;
    const syntheticPassword = `Ag${pwHash.slice(0, 30)}`;

    // Check existing ag_users by phone — array select handles duplicate phones
    const { data: phoneArr } = await sb
      .from('ag_users').select('*').eq('phone', normalized).order('created_at', { ascending: false });

    // Prefer driver role if duplicates exist
    const existingByPhone: any = phoneArr && phoneArr.length > 0
      ? (phoneArr.find((u: any) => u.role === 'driver') ?? phoneArr[0])
      : null;

    if (existingByPhone?.is_deleted) {
      return json({ ok: false, error: 'Esta cuenta fue dada de baja. Contacta soporte si quieres reactivarla.' });
    }

    const existingAuthId: string | null = existingByPhone?.auth_user_id ?? null;

    // Get or create auth session — with full retry logic
    const { userId: authUserId, session: signInSession } = await signInWithRetry(
      sb, syntheticEmail, syntheticPassword, existingAuthId
    );

    if (!authUserId) {
      console.error('[ag-otp-verify] could not obtain authUserId for', normalized);
      return json({ ok: true, authFailed: true });
    }

    // Upsert ag_users (service role — bypasses RLS)
    const userRole = role === 'driver' ? 'driver' : 'passenger';
    const fullName = (name && String(name).trim()) ? String(name).trim()
      : (userRole === 'driver' ? 'Conductor' : 'Usuario');

    let agUser: any = null;

    if (existingByPhone) {
      // Update auth_user_id to the (possibly new) synthetic auth user
      if (existingByPhone.auth_user_id !== authUserId) {
        const { data: updated } = await sb
          .from('ag_users')
          .update({ auth_user_id: authUserId })
          .eq('id', existingByPhone.id)
          .select('*').single();
        agUser = updated ?? existingByPhone;
      } else {
        agUser = existingByPhone;
      }
    } else {
      // Check by auth_user_id
      const { data: byAuth } = await sb
        .from('ag_users').select('*').eq('auth_user_id', authUserId).maybeSingle();
      if (byAuth) {
        agUser = byAuth;
      } else {
        // New user — insert
        const basePayload: Record<string, any> = {
          auth_user_id: authUserId,
          role: userRole,
          full_name: fullName,
          phone: normalized,
          country: 'Colombia',
          department: '',
          city: '',
        };
        const validRef = referred_by && typeof referred_by === 'string'
          && /^[0-9a-f-]{36}$/i.test(referred_by);
        const payload = validRef ? { ...basePayload, referred_by } : basePayload;

        let { data: inserted, error: insertErr } = await sb
          .from('ag_users').insert(payload).select('*').single();

        if (insertErr && validRef) {
          const retry = await sb.from('ag_users').insert(basePayload).select('*').single();
          inserted = retry.data; insertErr = retry.error;
        }
        if (insertErr) {
          console.error('[ag-otp-verify] insert ag_users:', JSON.stringify(insertErr));
          const { data: fb } = await sb.from('ag_users').select('*').eq('auth_user_id', authUserId).maybeSingle();
          agUser = fb ?? null;
        } else {
          agUser = inserted;
        }
      }
    }

    if (!signInSession) {
      return json({ ok: true, profile: agUser });
    }

    return json({
      ok: true,
      access_token: signInSession.access_token,
      refresh_token: signInSession.refresh_token,
      profile: agUser,
    });
  } catch (e) {
    console.error('[ag-otp-verify] unhandled error:', e);
    return json({ ok: false, error: 'Error interno. Intenta de nuevo.' });
  }
});
