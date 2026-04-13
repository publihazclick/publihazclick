// =============================================================================
// Edge Function: create-wa-subscription-payment
// Crea un registro de pago pendiente para suscripción WhatsApp Automatico ($20 USD)
// y devuelve los parámetros para el checkout de ePayco (checkout.js).
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
      .select('username, email')
      .eq('id', userId)
      .single();

    if (!profile) {
      return json({ error: 'Perfil de usuario no encontrado' }, 404);
    }

    // ── 3. Verificar que no tenga suscripción activa ───────────────────────
    const { data: activeSub } = await supabase
      .from('wa_subscriptions')
      .select('id')
      .eq('user_id', userId)
      .eq('status', 'active')
      .gte('expires_at', new Date().toISOString())
      .limit(1);

    if (activeSub?.length) {
      return json({ error: 'Ya tienes una suscripción activa de WhatsApp Automatico' }, 409);
    }

    // ── 4. Parsear body (cop_amount calculado por el frontend) ─────────────
    const body = await req.json().catch(() => null);
    const copAmount = body?.cop_amount ? Number(body.cop_amount) : 0;

    if (!copAmount || copAmount < 50_000) {
      return json({ error: 'Monto COP inválido' }, 400);
    }

    // ── 5. Crear registro de pago pendiente ────────────────────────────────
    const invoice = `WASUB-${Date.now()}-${userId.substring(0, 8).toUpperCase()}`;

    const { data: payment, error: insertError } = await supabase
      .from('wa_subscriptions')
      .insert({
        user_id: userId,
        status: 'inactive',
        price: 20.00,
        currency: 'USD',
        auto_renew: true,
        payment_method: 'epayco',
        payment_reference: invoice,
      })
      .select('id')
      .single();

    if (insertError || !payment) {
      console.error('Error insertando suscripción WA:', insertError);
      return json({ error: 'Error al registrar el pago. Intenta de nuevo.' }, 500);
    }

    // ── 6. Calcular monto con comisión ePayco incluida ────────────────────
    const chargeAmount = calcChargeAmount(copAmount);

    // ── 7. Devolver parámetros para checkout.js ────────────────────────────
    return json({
      publicKey:       EPAYCO_PUBLIC_KEY,
      test:            EPAYCO_TEST === 'true',
      name:            'WhatsApp Automatico — Plan Pro',
      description:     'Suscripción mensual WhatsApp Automatico — $20 USD — PubliHazClick',
      invoice,
      currency:        'cop',
      amount:          String(chargeAmount),
      tax_base:        '0',
      tax:             '0',
      country:         'CO',
      lang:            'es',
      email_billing:   profile.email ?? userEmail,
      name_billing:    profile.username ?? 'Usuario',
      extra1:          payment.id,           // wa_subscriptions UUID
      extra2:          userId,               // user ID
      extra3:          'wa_subscription',    // identificador para el webhook
      confirmation:    `${SUPABASE_URL}/functions/v1/epayco-webhook`,
      response:        'https://www.publihazclick.com/dashboard/automatic-whatsapp?epayco=result',
      payment_db_id:   payment.id,
      base_amount:     copAmount,
      charge_amount:   chargeAmount,
      fee_amount:      chargeAmount - copAmount,
    });

  } catch (err) {
    console.error('Error inesperado:', err);
    return json({ error: 'Error interno del servidor' }, 500);
  }
});
