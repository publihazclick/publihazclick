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

async function getOrCreateAuthUser(sb: any, normalized: string): Promise<string | null> {
  const salt = Deno.env.get('AG_SESSION_SALT') ?? 'movi-ag-2026';
  const pwHash = await sha256(normalized + salt);
  const email = `ag_${normalized.replace(/\+/g, '')}@movi-driver.app`;
  const password = `Ag${pwHash.slice(0, 30)}`;

  // Try sign-in first (user already exists)
  const { data: si } = await sb.auth.signInWithPassword({ email, password });
  if (si?.user?.id) return si.user.id;

  // Create new auth user
  const { data: cd } = await sb.auth.admin.createUser({
    email, password, email_confirm: true,
    user_metadata: { phone: normalized, source: 'movi_otp' },
  });
  if (cd?.user?.id) return cd.user.id;

  // If create failed because user already exists, try updating password then sign-in
  // (handles salt change scenario)
  return null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = await req.json();
    const { phone, name, vehicle_type, vehicle_brand, vehicle_color, plate } = body;
    if (!phone) return json({ ok: false, error: 'phone requerido' }, 400);

    const normalized = toE164(phone);
    console.log('[ag-register-driver] phone received:', phone, '-> normalized:', normalized);

    const sb = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // 1. Find ag_users by phone (service_role — bypasses all RLS)
    let { data: agUser } = await sb
      .from('ag_users').select('*').eq('phone', normalized).maybeSingle();

    console.log('[ag-register-driver] ag_users found by phone:', agUser ? agUser.id : 'NOT FOUND');

    // 2. If not found, create ag_users (happens when ag-otp-verify auth step failed)
    if (!agUser) {
      const authUserId = await getOrCreateAuthUser(sb, normalized);
      console.log('[ag-register-driver] authUserId resolved:', authUserId);

      if (!authUserId) {
        return json({ ok: false, error: 'No se pudo verificar la cuenta. Vuelve a solicitar el código.' });
      }

      // Try finding by auth_user_id first (in case phone format differs)
      const { data: byAuth } = await sb
        .from('ag_users').select('*').eq('auth_user_id', authUserId).maybeSingle();

      if (byAuth) {
        agUser = byAuth;
      } else {
        const fullName = (name && String(name).trim()) ? String(name).trim() : 'Conductor';
        const { data: inserted, error: insertErr } = await sb.from('ag_users').insert({
          auth_user_id: authUserId,
          role: 'driver',
          full_name: fullName,
          phone: normalized,
          country: 'Colombia',
          department: '',
          city: '',
        }).select('*').single();

        if (insertErr) {
          console.error('[ag-register-driver] insert ag_users failed:', JSON.stringify(insertErr));
          // Unique violation — fetch by auth_user_id as last resort
          const { data: fb } = await sb.from('ag_users').select('*').eq('auth_user_id', authUserId).maybeSingle();
          agUser = fb ?? null;
        } else {
          agUser = inserted;
        }
      }
    }

    if (!agUser) {
      return json({ ok: false, error: 'No se pudo crear tu perfil. Intenta de nuevo.' });
    }

    // 3. Ensure role is driver
    if (agUser.role !== 'driver') {
      await sb.from('ag_users').update({ role: 'driver' }).eq('id', agUser.id);
      agUser.role = 'driver';
    }

    // 4. Find or create ag_drivers record
    const { data: existingDriver } = await sb
      .from('ag_drivers').select('*').eq('ag_user_id', agUser.id).maybeSingle();

    if (existingDriver) {
      const updateData: Record<string, any> = {};
      if (vehicle_type) updateData.vehicle_type = vehicle_type;
      if (vehicle_brand) updateData.vehicle_brand = vehicle_brand;
      if (vehicle_color) updateData.vehicle_color = vehicle_color;
      if (plate) { updateData.plate = plate; updateData.vehicle_plate = plate; }
      if ((existingDriver.metric_trips_completed ?? 0) === 0) updateData.status = 'quick';
      if (Object.keys(updateData).length > 0) {
        await sb.from('ag_drivers').update(updateData).eq('id', existingDriver.id);
      }
    } else {
      const { error: insertErr } = await sb.from('ag_drivers').insert({
        ag_user_id: agUser.id,
        vehicle_type: vehicle_type ?? 'car',
        vehicle_brand: vehicle_brand ?? '',
        vehicle_color: vehicle_color ?? '',
        plate: plate ?? 'PENDIENTE',
        vehicle_plate: plate ?? 'PENDIENTE',
        status: 'quick',
        is_online: false,
        wallet_balance: 0,
      });
      if (insertErr) {
        console.error('[ag-register-driver] insert ag_drivers:', JSON.stringify(insertErr));
        return json({ ok: false, error: 'No se pudo guardar el vehículo. Intenta de nuevo.' });
      }
    }

    // 5. Return fresh data
    const { data: finalUser } = await sb.from('ag_users').select('*').eq('id', agUser.id).single();
    const { data: driverRow } = await sb.from('ag_drivers').select('*').eq('ag_user_id', agUser.id).single();

    return json({ ok: true, profile: finalUser ?? agUser, driver: driverRow });
  } catch (e) {
    console.error('[ag-register-driver] unhandled error:', e);
    return json({ ok: false, error: 'Error interno. Intenta de nuevo.' });
  }
});
