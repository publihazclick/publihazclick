// =============================================================================
// Edge Function: create-epayco-payment
// Crea un registro de pago en DB y devuelve los parámetros para el checkout
// de ePayco (checkout.js). El pago real lo inicia el frontend con checkout.js.
// =============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL         = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const EPAYCO_PUBLIC_KEY    = Deno.env.get('EPAYCO_PUBLIC_KEY')!;
const EPAYCO_TEST          = Deno.env.get('EPAYCO_TEST') ?? 'true';
const APP_URL              = Deno.env.get('APP_URL') ?? 'https://publihazclick.com';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

function decodeJwtPayload(token: string): { sub: string; email?: string } {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Invalid JWT');
  const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
  return JSON.parse(atob(b64));
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    // ── 1. Verificar JWT ─────────────────────────────────────────────────────
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return json({ error: 'No autorizado' }, 401);

    const token = authHeader.replace('Bearer ', '');
    const jwtPayload = decodeJwtPayload(token);
    const userId    = jwtPayload.sub;
    const userEmail = jwtPayload.email ?? '';

    if (!userId) return json({ error: 'Token sin user ID' }, 401);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // ── 2. Parsear body ──────────────────────────────────────────────────────
    const body = await req.json().catch(() => null);
    if (!body?.package_id) return json({ error: 'package_id requerido' }, 400);

    const { package_id } = body as { package_id: string };

    // ── 3. Obtener paquete ───────────────────────────────────────────────────
    const { data: pkg, error: pkgError } = await supabase
      .from('packages')
      .select('id, name, price, price_cop, currency')
      .eq('id', package_id)
      .eq('is_active', true)
      .single();

    if (pkgError || !pkg) return json({ error: 'Paquete no encontrado o inactivo' }, 404);

    // ── 4. Verificar que no tenga paquete activo ─────────────────────────────
    const { data: activePkgs } = await supabase
      .from('user_packages')
      .select('id')
      .eq('user_id', userId)
      .eq('status', 'active')
      .gte('end_date', new Date().toISOString())
      .limit(1);

    if (activePkgs?.length) return json({ error: 'Ya tienes un paquete activo' }, 409);

    // ── 5. Obtener perfil ────────────────────────────────────────────────────
    const { data: profile } = await supabase
      .from('profiles')
      .select('username, email')
      .eq('id', userId)
      .single();

    // ── 6. Calcular monto en COP ─────────────────────────────────────────────
    const copAmount = pkg.price_cop ?? Math.round(Number(pkg.price) * 4200);
    const invoice   = `PHC-${Date.now()}-${userId.substring(0, 8).toUpperCase()}`;

    // ── 7. Guardar pago pendiente en DB ──────────────────────────────────────
    const { data: payment, error: insertError } = await supabase
      .from('payments')
      .insert({
        user_id:         userId,
        package_id:      pkg.id,
        package_name:    pkg.name,
        amount_in_cents: copAmount * 100,
        currency:        'COP',
        status:          'pending',
        payment_method:  'epayco',
        gateway:         'epayco',
        gateway_reference: invoice,
        metadata: {
          package_price_cop: copAmount,
          invoice,
          initiated_at: new Date().toISOString(),
        },
      })
      .select('id')
      .single();

    if (insertError || !payment) {
      console.error('Error insertando pago:', insertError);
      return json({ error: 'Error al registrar el pago. Intenta de nuevo.' }, 500);
    }

    // ── 8. Devolver parámetros para checkout.js ──────────────────────────────
    return json({
      // Parámetros para ePayco checkout.js
      publicKey:       EPAYCO_PUBLIC_KEY,
      test:            EPAYCO_TEST === 'true',
      name:            pkg.name,
      description:     `Paquete ${pkg.name} — Publihazclick`,
      invoice,
      currency:        'cop',
      amount:          String(copAmount),
      tax_base:        '0',
      tax:             '0',
      country:         'CO',
      lang:            'es',
      email_billing:   profile?.email ?? userEmail,
      name_billing:    profile?.username ?? 'Usuario',
      extra1:          payment.id,       // nuestro payment UUID en DB
      extra2:          pkg.id,           // package ID
      extra3:          userId,           // user ID
      confirmation:    `${SUPABASE_URL}/functions/v1/epayco-webhook`,
      response:        `${APP_URL}/dashboard/packages?epayco=result`,
      // ID del pago en nuestra DB
      payment_db_id:   payment.id,
    });

  } catch (err) {
    console.error('Error inesperado:', err);
    return json({ error: 'Error interno del servidor' }, 500);
  }
});
