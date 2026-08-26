// =============================================================================
// Edge Function: ag-create-wallet-recharge
// Crea un registro de recarga pendiente y devuelve params para ePayco checkout
// =============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL         = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const EPAYCO_PUBLIC_KEY    = Deno.env.get('EPAYCO_PUBLIC_KEY')!;
const EPAYCO_TEST          = Deno.env.get('EPAYCO_TEST') ?? 'true';
const APP_URL              = Deno.env.get('APP_URL') ?? 'https://www.publihazclick.com';

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

// ── Costo de la pasarela de pago, trasladado al conductor ───────────────────
// El conductor paga monto + comisión; a la billetera solo entra "amount" (lo
// que pidió). Fórmula PSE derivada empíricamente de 2 transacciones reales
// aprobadas en la cuenta ePayco de producción (2026-08-26): $10.000 → comisión
// $2.380 y $98.000 → comisión $4.669,80. Resolviendo el sistema fijo+% da
// ~$2.120 fijo + 2,60% variable. Tarjeta solo tiene 1 dato real ($102.727 →
// comisión $4.854,86 ≈ 4,73%); se usa como % plano sin fijo por ser el patrón
// típico de comisión de franquicia de tarjeta, con un margen de seguridad.
const PSE_FIXED_COP  = 2120;
const PSE_PCT        = 0.0260;
const CARD_PCT       = 0.050; // 4.73% real + margen de seguridad (menor confianza, 1 solo dato)

type PaymentMethod = 'pse' | 'card';

function gatewayFeeCop(method: PaymentMethod, walletAmount: number): number {
  const raw = method === 'pse'
    ? PSE_FIXED_COP + walletAmount * PSE_PCT
    : walletAmount * CARD_PCT;
  return Math.ceil(raw / 10) * 10; // redondeo a la decena más cercana hacia arriba
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    // ── 1. Verificar JWT ─────────────────────────────────────────────────────
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return json({ error: 'No autorizado' }, 401);

    const token      = authHeader.replace('Bearer ', '');
    const jwtPayload = decodeJwtPayload(token);
    const authUserId = jwtPayload.sub;
    const userEmail  = jwtPayload.email ?? '';

    if (!authUserId) return json({ error: 'Token sin user ID' }, 401);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // ── 2. Parsear body ──────────────────────────────────────────────────────
    const body = await req.json().catch(() => null);
    const amount = Number(body?.amount ?? 0);
    const method: PaymentMethod = body?.method === 'card' ? 'card' : 'pse';

    if (!amount || amount < 10000) return json({ error: 'Monto mínimo: $10.000 COP' }, 400);
    if (amount > 1000000)          return json({ error: 'Monto máximo: $1.000.000 COP' }, 400);

    const fee   = gatewayFeeCop(method, amount);
    const total = amount + fee;

    // ── 3. Obtener ag_user y driver ─────────────────────────────────────────
    const { data: agUser } = await supabase
      .from('ag_users')
      .select('id, full_name, phone')
      .eq('auth_user_id', authUserId)
      .maybeSingle();

    if (!agUser) return json({ error: 'Perfil de conductor no encontrado' }, 404);

    const { data: driver } = await supabase
      .from('ag_drivers')
      .select('id')
      .eq('ag_user_id', agUser.id)
      .maybeSingle();

    if (!driver) return json({ error: 'Conductor no encontrado' }, 404);

    // ── 4. Crear registro de pago pendiente ──────────────────────────────────
    const invoice = `AG-${Date.now()}-${driver.id.substring(0, 8).toUpperCase()}`;

    const { data: payment, error: insertErr } = await supabase
      .from('ag_wallet_payments')
      .insert({
        driver_id: driver.id,
        amount:    amount,
        status:    'pending',
        invoice:   invoice,
      })
      .select('id')
      .single();

    if (insertErr || !payment) {
      console.error('Error creando pago:', insertErr);
      return json({ error: 'Error al registrar el pago. Intenta de nuevo.' }, 500);
    }

    // ── 5. Devolver parámetros para ePayco checkout.js ───────────────────────
    // Nota: se le cobra al conductor "total" (amount + fee), pero el registro
    // en ag_wallet_payments.amount (arriba) quedó en "amount" (lo que pidió) —
    // así que a la billetera solo se acredita eso, sin importar el fee.
    return json({
      publicKey:      EPAYCO_PUBLIC_KEY,
      test:           EPAYCO_TEST === 'true',
      name:           'Recarga billetera Anda y Gana',
      description:    `Recarga de $${amount.toLocaleString('es-CO')} COP`,
      invoice,
      currency:       'cop',
      amount:         String(total),
      tax_base:       '0',
      tax:            '0',
      country:        'CO',
      lang:           'es',
      email_billing:  userEmail,
      name_billing:   agUser.full_name ?? 'Conductor',
      extra1:         payment.id,      // ag_wallet_payments UUID
      extra2:         driver.id,       // driver UUID
      extra3:         'ag_wallet',     // flag para webhook
      confirmation:   `${SUPABASE_URL}/functions/v1/ag-epayco-webhook`,
      response:       `${APP_URL}/anda-gana?wallet=result`,
      // Desglose para mostrarle al conductor en la app (no es parte del checkout de ePayco)
      walletCredit:   amount,
      gatewayFee:      fee,
      totalToPay:     total,
      method,
    });

  } catch (err) {
    console.error('Error inesperado:', err);
    return json({ error: 'Error interno del servidor' }, 500);
  }
});
