// =============================================================================
// Edge Function: create-dlocal-payment
// Crea una sesión de pago con dLocal Go y guarda el registro en payments
// Docs: https://docs.dlocalgo.com/integration-api/welcome-to-dlocal-go-api/payments
// =============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const DLOCAL_API_KEY    = Deno.env.get('DLOCAL_API_KEY')!;
const DLOCAL_SECRET_KEY = Deno.env.get('DLOCAL_SECRET_KEY')!;
const DLOCAL_BASE_URL   = Deno.env.get('DLOCAL_BASE_URL') ?? 'https://api.dlocalgo.com';
const APP_URL           = Deno.env.get('APP_URL') ?? 'https://publihazclick.com';
const SUPABASE_URL        = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

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

// JWT ya verificado por el gateway de Supabase.
// Solo decodificamos el payload para extraer user_id y email.
function decodeJwtPayload(token: string): { sub: string; email?: string } {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Invalid JWT');
  const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
  return JSON.parse(atob(b64));
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    // ── 1. Extraer usuario del JWT ───────────────────────────────────────────
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return json({ error: 'No autorizado' }, 401);

    const token = authHeader.replace('Bearer ', '');
    const jwtPayload = decodeJwtPayload(token);
    const userId = jwtPayload.sub;
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
      .select('id, name, price, currency')
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

    // ── 5. Obtener perfil de usuario ─────────────────────────────────────────
    const { data: profile } = await supabase
      .from('profiles')
      .select('username, email')
      .eq('id', userId)
      .single();

    // ── 6. Crear pago en dLocal Go ───────────────────────────────────────────
    // Auth: Bearer API_KEY:SECRET_KEY (según docs oficiales)
    // Recargo del 4% para compensar la comisión de dLocal
    const DLOCAL_FEE_PERCENT = 0.04;
    const orderId = `PHC-${userId.replace(/-/g, '').substring(0, 8).toUpperCase()}-${Date.now()}`;
    const baseAmount = Number(pkg.price);
    const adjustedAmount = Math.round(baseAmount * (1 + DLOCAL_FEE_PERCENT) * 100) / 100;

    const dlocalBody = {
      amount: adjustedAmount,
      currency: ((pkg.currency as string) ?? 'USD').toUpperCase(),
      country: 'CO',
      order_id: orderId,
      description: `${pkg.name} - Publihazclick`,
      success_url: `${APP_URL}/dashboard/packages?dlocal=success`,
      back_url: `${APP_URL}/dashboard/packages?dlocal=cancelled`,
      notification_url: `${SUPABASE_URL}/functions/v1/dlocal-webhook`,
      payer: {
        name: profile?.username ?? 'Usuario Publihazclick',
        email: profile?.email ?? userEmail,
      },
    };

    console.log('dLocal request body:', JSON.stringify(dlocalBody));

    const dlocalRes = await fetch(`${DLOCAL_BASE_URL}/v1/payments`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${DLOCAL_API_KEY}:${DLOCAL_SECRET_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(dlocalBody),
    });

    if (!dlocalRes.ok) {
      const errText = await dlocalRes.text();
      console.error(`dLocal error (${dlocalRes.status}):`, errText);
      return json({
        error: 'Error al crear pago con dLocal Go. Intenta de nuevo.',
        detail: errText,
      }, 502);
    }

    const dlocalData = await dlocalRes.json();
    console.log('dLocal response:', JSON.stringify(dlocalData));

    // ── 7. Guardar pago en DB ────────────────────────────────────────────────
    const { error: insertError } = await supabase.from('payments').insert({
      user_id:                userId,
      package_id:             pkg.id,
      package_name:           pkg.name,
      amount_in_cents:        Math.round(Number(pkg.price) * 100),
      currency:               ((pkg.currency as string) ?? 'USD').toUpperCase(),
      status:                 'pending',
      payment_method:         'dlocal',
      gateway:                'dlocal',
      gateway_transaction_id: dlocalData.id,
      gateway_reference:      orderId,
      dlocal_payment_id:      dlocalData.id,
      metadata: {
        package_price:  pkg.price,
        dlocal_status:  dlocalData.status,
        order_id:       orderId,
      },
    });

    if (insertError) {
      console.error('Error guardando pago en DB:', insertError);
    }

    // ── 8. Responder con URL de redirección ──────────────────────────────────
    return json({
      url:        dlocalData.redirect_url,
      payment_id: dlocalData.id,
      status:     dlocalData.status,
    });

  } catch (err) {
    console.error('Error inesperado:', err);
    return json({ error: 'Error interno del servidor' }, 500);
  }
});
