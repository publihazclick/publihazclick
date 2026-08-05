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

// Traduce el error del trigger ag_validate_vehicle_age (migración 185) a un mensaje claro
// en vez del texto técnico crudo de Postgres.
function friendlyVehicleError(msg: string): string {
  if (msg.includes('VEHICULO_MUY_ANTIGUO:')) return msg.split('VEHICULO_MUY_ANTIGUO:')[1].trim();
  if (msg.includes('AÑO_INVALIDO:')) return msg.split('AÑO_INVALIDO:')[1].trim();
  if (msg.includes('PAIS_NO_PERMITIDO:')) return msg.split('PAIS_NO_PERMITIDO:')[1].trim();
  if (msg.includes('CEDULA_INVALIDA:')) return msg.split('CEDULA_INVALIDA:')[1].trim();
  return 'No se pudo guardar el vehículo. Intenta de nuevo.';
}

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

async function getOrCreateAuthUser(sb: any, normalized: string, existingAuthId?: string | null): Promise<string | null> {
  const salt = Deno.env.get('AG_SESSION_SALT') ?? 'movi-ag-2026';
  const pwHash = await sha256(normalized + salt);
  const email = `ag_${normalized.replace(/\+/g, '')}@movi-driver.app`;
  const password = `Ag${pwHash.slice(0, 30)}`;

  const { data: si } = await sb.auth.signInWithPassword({ email, password });
  if (si?.user?.id) return si.user.id;

  if (existingAuthId) {
    try {
      await sb.auth.admin.updateUserById(existingAuthId, { email, password, email_confirm: true });
      const { data: si2 } = await sb.auth.signInWithPassword({ email, password });
      if (si2?.user?.id) return si2.user.id;
      return existingAuthId;
    } catch {}
  }

  const { data: cd } = await sb.auth.admin.createUser({
    email, password, email_confirm: true,
    user_metadata: { phone: normalized, source: 'movi_otp' },
  });
  if (cd?.user?.id) return cd.user.id;

  return null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = await req.json();
    const { phone, name, vehicle_type, vehicle_brand, vehicle_color, vehicle_year, plate, ag_user_id } = body;
    if (!phone && !ag_user_id) return json({ ok: false, error: 'phone o ag_user_id requerido' }, 400);

    const sb = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    let agUser: any = null;

    // 1. Lookup directo por ID si viene del paso OTP (más confiable que búsqueda por teléfono)
    if (ag_user_id) {
      const { data: byId } = await sb.from('ag_users').select('*').eq('id', ag_user_id).single();
      if (byId) agUser = byId;
    }

    // 2. Buscar por teléfono (múltiples formatos)
    if (!agUser && phone) {
      const normalized = toE164(phone);
      const digits10 = normalized.replace(/^\+57/, '');
      console.log('[ag-register-driver] phone:', phone, '-> normalized:', normalized);

      const { data: byPhone } = await sb
        .from('ag_users')
        .select('*')
        .in('phone', [normalized, digits10, '57' + digits10])
        .order('created_at', { ascending: false })
        .limit(5);

      if (byPhone && byPhone.length > 0) {
        agUser = byPhone.find((u: any) => u.role === 'driver') ?? byPhone[0];
      }

      // 3. Si no existe, crear via auth + insert
      if (!agUser) {
        const authUserId = await getOrCreateAuthUser(sb, normalized, null);
        if (!authUserId) {
          return json({ ok: false, error: 'No se pudo verificar la cuenta. Vuelve a solicitar el código.' });
        }

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
            const { data: fb } = await sb.from('ag_users').select('*').eq('auth_user_id', authUserId).maybeSingle();
            agUser = fb ?? null;
          } else {
            agUser = inserted;
          }
        }
      }
    }

    if (!agUser) {
      return json({ ok: false, error: 'No se pudo crear tu perfil. Intenta de nuevo.' });
    }

    // 4. Asegurar que el rol sea driver
    if (agUser.role !== 'driver') {
      const { data: updated } = await sb
        .from('ag_users').update({ role: 'driver' }).eq('id', agUser.id).select('*').single();
      if (updated) agUser = updated;
    }

    // 5. Crear o actualizar ag_drivers
    const { data: existingDriver } = await sb
      .from('ag_drivers').select('*').eq('ag_user_id', agUser.id).maybeSingle();

    if (existingDriver) {
      const upd: Record<string, any> = {};
      if (vehicle_type) upd.vehicle_type = vehicle_type;
      if (vehicle_brand) upd.vehicle_brand = vehicle_brand;
      if (vehicle_color) upd.vehicle_color = vehicle_color;
      if (vehicle_year) upd.vehicle_year = vehicle_year;
      if (plate) { upd.plate = plate; upd.vehicle_plate = plate; }
      if ((existingDriver.metric_trips_completed ?? 0) === 0) upd.status = 'quick';
      if (Object.keys(upd).length > 0) {
        const { error: updErr } = await sb.from('ag_drivers').update(upd).eq('id', existingDriver.id);
        if (updErr) {
          console.error('[ag-register-driver] update ag_drivers:', JSON.stringify(updErr));
          return json({ ok: false, error: friendlyVehicleError(updErr.message ?? '') });
        }
      }
    } else {
      const { error: driverErr } = await sb.from('ag_drivers').insert({
        ag_user_id: agUser.id,
        vehicle_type: vehicle_type ?? 'car',
        vehicle_brand: vehicle_brand ?? '',
        vehicle_color: vehicle_color ?? '',
        vehicle_year: vehicle_year ?? null,
        plate: plate ?? 'PENDIENTE',
        vehicle_plate: plate ?? 'PENDIENTE',
        status: 'quick',
        is_online: false,
        wallet_balance: 0,
      });
      if (driverErr) {
        console.error('[ag-register-driver] insert ag_drivers:', JSON.stringify(driverErr));
        return json({ ok: false, error: friendlyVehicleError(driverErr.message ?? '') });
      }
    }

    // 6. Retornar datos frescos
    const { data: finalUser } = await sb.from('ag_users').select('*').eq('id', agUser.id).single();
    const { data: driverRow } = await sb.from('ag_drivers').select('*').eq('ag_user_id', agUser.id).single();

    return json({ ok: true, profile: finalUser ?? agUser, driver: driverRow });
  } catch (e) {
    console.error('[ag-register-driver] unhandled error:', e);
    return json({ ok: false, error: 'Error interno. Intenta de nuevo.' });
  }
});
