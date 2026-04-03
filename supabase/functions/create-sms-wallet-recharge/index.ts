// =============================================================================
// Edge Function: create-sms-wallet-recharge
// Crea un registro de pago pendiente para recarga de billetera SMS y devuelve
// los parámetros para el checkout de ePayco (checkout.js).
// =============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL         = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const EPAYCO_PUBLIC_KEY    = Deno.env.get('EPAYCO_PUBLIC_KEY') ?? '';
const EPAYCO_TEST          = Deno.env.get('EPAYCO_TEST') ?? 'true';

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

// Montos válidos de recarga en COP (10,20,50,150,250,500,1000,1500,2000 USD × 3700)
const VALID_AMOUNTS = [
  37_000, 74_000, 185_000, 555_000, 925_000,
  1_850_000, 3_700_000,
];

// ── Comisión ePayco: 2.99% + $900 COP fijo + IVA 19% sobre la comisión ─────
const EPAYCO_RATE = 0.035581;
const EPAYCO_FIXED = 1071;

function calcChargeAmount(baseAmount: number): number {
  return Math.ceil((baseAmount + EPAYCO_FIXED) / (1 - EPAYCO_RATE));
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
      console.error('Missing env: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
      return json({ error: 'Configuración del servidor incompleta' }, 500);
    }
    if (!EPAYCO_PUBLIC_KEY) {
      console.error('Missing env: EPAYCO_PUBLIC_KEY');
      return json({ error: 'Configuración de ePayco incompleta' }, 500);
    }

    // ── 1. Verificar JWT ─────────────────────────────────────────────────────
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return json({ error: 'No autorizado' }, 401);

    const token = authHeader.replace('Bearer ', '');
    const jwtPayload = decodeJwtPayload(token);
    const userId    = jwtPayload.sub;
    const userEmail = jwtPayload.email ?? '';

    if (!userId) return json({ error: 'Token sin user ID' }, 401);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // ── 2. Obtener perfil del usuario ──────────────────────────────────────
    const { data: profile } = await supabase
      .from('profiles')
      .select('username, email, role')
      .eq('id', userId)
      .single();

    if (!profile) {
      return json({ error: 'Perfil de usuario no encontrado' }, 404);
    }

    // ── 3. Parsear body ──────────────────────────────────────────────────────
    const body = await req.json().catch(() => null);
    if (!body?.amount) return json({ error: 'amount requerido' }, 400);

    const amount = Number(body.amount);
    if (!VALID_AMOUNTS.includes(amount)) {
      return json({ error: `Monto inválido. Valores válidos: ${VALID_AMOUNTS.join(', ')} COP` }, 400);
    }

    // ── 4. Crear registro de pago pendiente ─────────────────────────────────
    const invoice = `SMSWALLET-${Date.now()}-${userId.substring(0, 8).toUpperCase()}`;

    const { data: payment, error: insertError } = await supabase
      .from('sms_wallet_payments')
      .insert({
        user_id: userId,
        amount,
        status: 'pending',
        invoice,
      })
      .select('id')
      .single();

    if (insertError || !payment) {
      // Si la tabla no existe, usar ai_wallet_payments como fallback con extra3 para diferenciar
      console.error('Error insertando pago SMS:', insertError);
      return json({ error: 'Error al registrar el pago. Intenta de nuevo.' }, 500);
    }

    // ── 5. Calcular monto con comisión ePayco incluida ────────────────────
    const chargeAmount = calcChargeAmount(amount);

    // ── 6. Devolver parámetros para checkout.js ─────────────────────────────
    return json({
      publicKey:       EPAYCO_PUBLIC_KEY,
      test:            EPAYCO_TEST === 'true',
      name:            'Recarga Billetera SMS',
      description:     `Recarga de $${amount.toLocaleString('es-CO')} COP — Billetera SMS PubliHazClick`,
      invoice,
      currency:        'cop',
      amount:          String(chargeAmount),
      tax_base:        '0',
      tax:             '0',
      country:         'CO',
      lang:            'es',
      email_billing:   profile.email ?? userEmail,
      name_billing:    profile.username ?? 'Usuario',
      extra1:          payment.id,        // sms_wallet_payments UUID
      extra2:          userId,            // user ID
      extra3:          'sms_wallet',      // identificador para el webhook
      confirmation:    `${SUPABASE_URL}/functions/v1/epayco-webhook`,
      response:        `https://www.publihazclick.com/dashboard/sms-masivos?epayco=result`,
      payment_db_id:   payment.id,
      base_amount:     amount,
      charge_amount:   chargeAmount,
      fee_amount:      chargeAmount - amount,
    });

  } catch (err) {
    console.error('Error inesperado:', err);
    return json({ error: 'Error interno del servidor' }, 500);
  }
});
