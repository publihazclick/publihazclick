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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = await req.json();
    const { phone, vehicle_type, vehicle_brand, vehicle_color, plate } = body;
    if (!phone) return json({ ok: false, error: 'phone requerido' }, 400);

    const normalized = toE164(phone);

    // Service role — bypasses ALL RLS and auth
    const sb = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Find ag_users by phone
    const { data: agUser, error: userErr } = await sb
      .from('ag_users')
      .select('*')
      .eq('phone', normalized)
      .maybeSingle();

    if (userErr || !agUser) {
      console.error('[ag-register-driver] ag_users not found for', normalized, userErr);
      return json({ ok: false, error: 'Perfil no encontrado. Vuelve a verificar tu número.' });
    }

    // Update role to driver if needed
    if (agUser.role !== 'driver') {
      await sb.from('ag_users').update({ role: 'driver' }).eq('id', agUser.id);
      agUser.role = 'driver';
    }

    // Find or create ag_drivers record
    const { data: existingDriver } = await sb
      .from('ag_drivers')
      .select('id, status, metric_trips_completed')
      .eq('ag_user_id', agUser.id)
      .maybeSingle();

    if (existingDriver) {
      // Update vehicle details
      const updateData: Record<string, any> = {};
      if (vehicle_type) updateData.vehicle_type = vehicle_type;
      if (vehicle_brand) { updateData.vehicle_brand = vehicle_brand; }
      if (vehicle_color) { updateData.vehicle_color = vehicle_color; }
      if (plate) { updateData.plate = plate; updateData.vehicle_plate = plate; }
      if ((existingDriver.metric_trips_completed ?? 0) === 0) updateData.status = 'quick';

      if (Object.keys(updateData).length > 0) {
        await sb.from('ag_drivers').update(updateData).eq('id', existingDriver.id);
      }
    } else {
      // Create new ag_drivers record
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

    // Return updated profile
    const { data: updatedUser } = await sb
      .from('ag_users').select('*').eq('id', agUser.id).single();

    const { data: driverRow } = await sb
      .from('ag_drivers').select('*').eq('ag_user_id', agUser.id).single();

    return json({ ok: true, profile: updatedUser ?? agUser, driver: driverRow });
  } catch (e) {
    console.error('[ag-register-driver] error:', e);
    return json({ ok: false, error: 'Error interno. Intenta de nuevo.' });
  }
});
