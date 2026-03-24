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

    if (!amount || amount < 5000) return json({ error: 'Monto mínimo: $5.000 COP' }, 400);
    if (amount > 1000000)         return json({ error: 'Monto máximo: $1.000.000 COP' }, 400);

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
    return json({
      publicKey:      EPAYCO_PUBLIC_KEY,
      test:           EPAYCO_TEST === 'true',
      name:           'Recarga billetera Anda y Gana',
      description:    `Recarga de $${amount.toLocaleString('es-CO')} COP`,
      invoice,
      currency:       'cop',
      amount:         String(amount),
      tax_base:       '0',
      tax:            '0',
      country:        'CO',
      lang:           'es',
      email_billing:  userEmail,
      name_billing:   agUser.full_name ?? 'Conductor',
      extra1:         payment.id,      // ag_wallet_payments UUID
      extra2:         driver.id,       // driver UUID
      extra3:         'ag_wallet',     // flag para webhook
      confirmation:   `${SUPABASE_URL}/functions/v1/epayco-webhook`,
      response:       `${APP_URL}/anda-gana?wallet=result`,
    });

  } catch (err) {
    console.error('Error inesperado:', err);
    return json({ error: 'Error interno del servidor' }, 500);
  }
});
