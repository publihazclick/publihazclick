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
    const { phone } = body;
    if (!phone) return json({ ok: false, error: 'phone requerido' }, 400);

    const normalized = toE164(phone);

    const sb = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Verify this phone has at least one registered ag_users record
    const { data: usersArr } = await sb
      .from('ag_users')
      .select('*')
      .eq('phone', normalized)
      .order('created_at', { ascending: false });

    if (!usersArr || usersArr.length === 0) {
      // Phone not registered — must go through OTP flow
      return json({ ok: false, error: 'not_registered' });
    }

    // Prefer driver record if multiple
    const agUser = usersArr.find((u: any) => u.role === 'driver') ?? usersArr[0];

    // Synthetic credentials (same logic as ag-otp-verify)
    const salt = Deno.env.get('AG_SESSION_SALT') ?? 'movi-ag-2026';
    const pwHash = await sha256(normalized + salt);
    const syntheticEmail = `ag_${normalized.replace(/\+/g, '')}@movi-driver.app`;
    const syntheticPassword = `Ag${pwHash.slice(0, 30)}`;

    // Try sign-in
    const { data: si } = await sb.auth.signInWithPassword({ email: syntheticEmail, password: syntheticPassword });
    if (si?.session) {
      return json({
        ok: true,
        access_token: si.session.access_token,
        refresh_token: si.session.refresh_token,
        profile: agUser,
      });
    }

    // Sign-in failed — try updating the auth user (salt change or similar)
    const existingAuthId: string | null = agUser.auth_user_id ?? null;
    if (existingAuthId) {
      try {
        await sb.auth.admin.updateUserById(existingAuthId, {
          email: syntheticEmail,
          password: syntheticPassword,
          email_confirm: true,
        });
        const { data: si2 } = await sb.auth.signInWithPassword({ email: syntheticEmail, password: syntheticPassword });
        if (si2?.session) {
          return json({
            ok: true,
            access_token: si2.session.access_token,
            refresh_token: si2.session.refresh_token,
            profile: agUser,
          });
        }
      } catch (e) {
        console.error('[ag-reauth] updateUserById failed:', e);
      }
    }

    // Create new auth user as last resort
    const { data: cd } = await sb.auth.admin.createUser({
      email: syntheticEmail,
      password: syntheticPassword,
      email_confirm: true,
      user_metadata: { source: 'movi_reauth' },
    });
    if (cd?.user) {
      // Update ag_users with new auth_user_id
      await sb.from('ag_users').update({ auth_user_id: cd.user.id }).eq('id', agUser.id);
      const { data: si3 } = await sb.auth.signInWithPassword({ email: syntheticEmail, password: syntheticPassword });
      if (si3?.session) {
        return json({
          ok: true,
          access_token: si3.session.access_token,
          refresh_token: si3.session.refresh_token,
          profile: { ...agUser, auth_user_id: cd.user.id },
        });
      }
    }

    console.error('[ag-reauth] all sign-in attempts failed for', normalized);
    return json({ ok: false, error: 'auth_failed' });
  } catch (e) {
    console.error('[ag-reauth] unhandled error:', e);
    return json({ ok: false, error: 'Error interno. Intenta de nuevo.' });
  }
});
