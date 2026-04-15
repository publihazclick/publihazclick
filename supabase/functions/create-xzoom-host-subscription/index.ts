// =============================================================================
// Edge Function: create-xzoom-host-subscription
// Crea un registro de suscripción de anfitrión XZOOM EN VIVO pendiente y
// devuelve los parámetros de checkout de ePayco.
// Precio base: 48 USD / mes.
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

// ePayco fee formula — igual a los otros create-*-subscription
const EPAYCO_RATE = 0.035581;
const EPAYCO_FIXED = 1071;
function calcChargeAmount(baseAmount: number): number {
  return Math.ceil((baseAmount + EPAYCO_FIXED) / (1 - EPAYCO_RATE));
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY || !EPAYCO_PUBLIC_KEY) {
      return json({ error: 'Configuración del servidor incompleta' }, 500);
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return json({ error: 'No autorizado' }, 401);

    const token = authHeader.replace('Bearer ', '');
    const jwtPayload = decodeJwtPayload(token);
    const userId    = jwtPayload.sub;
    const userEmail = jwtPayload.email ?? '';
    if (!userId) return json({ error: 'Token sin user ID' }, 401);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    const { data: profile } = await supabase
      .from('profiles').select('username, email').eq('id', userId).single();
    if (!profile) return json({ error: 'Perfil no encontrado' }, 404);

    // Debe tener ya un xzoom_hosts (creado al onboarding) — buscarlo
    const { data: host } = await supabase
      .from('xzoom_hosts')
      .select('id, display_name')
      .eq('user_id', userId)
      .maybeSingle();

    if (!host) {
      return json({
        error: 'Primero debes completar tu perfil de anfitrión de XZOOM EN VIVO',
      }, 400);
    }

    // Verificar que no tenga suscripción activa
    const { data: activeSub } = await supabase
      .from('xzoom_host_subscriptions')
      .select('id')
      .eq('host_id', host.id)
      .eq('status', 'active')
      .gte('expires_at', new Date().toISOString())
      .limit(1);
    if (activeSub?.length) {
      return json({ error: 'Ya tienes una suscripción de anfitrión activa' }, 409);
    }

    const body = await req.json().catch(() => null);
    const copAmount = body?.cop_amount ? Number(body.cop_amount) : 0;
    if (!copAmount || copAmount < 150_000) {
      return json({ error: 'Monto COP inválido (mínimo 150.000)' }, 400);
    }

    const invoice = `XZOOMHOST-${Date.now()}-${userId.substring(0, 8).toUpperCase()}`;

    const { data: subscription, error: insertError } = await supabase
      .from('xzoom_host_subscriptions')
      .insert({
        host_id: host.id,
        user_id: userId,
        status: 'pending',
        price_usd: 48.00,
        price_cop: copAmount,
        currency: 'USD',
        auto_renew: true,
        payment_method: 'epayco',
        payment_reference: invoice,
      })
      .select('id').single();

    if (insertError || !subscription) {
      console.error('Error insertando suscripción XZOOM host:', insertError);
      return json({ error: 'Error al registrar el pago' }, 500);
    }

    const chargeAmount = calcChargeAmount(copAmount);

    return json({
      publicKey:       EPAYCO_PUBLIC_KEY,
      test:            EPAYCO_TEST === 'true',
      name:            'XZOOM EN VIVO — Plan Anfitrión',
      description:     'Suscripción mensual XZOOM EN VIVO (anfitrión) — PubliHazClick',
      invoice,
      currency:        'cop',
      amount:          String(chargeAmount),
      tax_base:        '0',
      tax:             '0',
      country:         'CO',
      lang:            'es',
      email_billing:   profile.email ?? userEmail,
      name_billing:    profile.username ?? 'Anfitrión',
      extra1:          subscription.id,
      extra2:          host.id,
      extra3:          'xzoom_host_subscription',
      confirmation:    `${SUPABASE_URL}/functions/v1/epayco-webhook`,
      response:        'https://www.publihazclick.com/dashboard/xzoom-en-vivo?epayco=result',
      payment_db_id:   subscription.id,
      base_amount:     copAmount,
      charge_amount:   chargeAmount,
      fee_amount:      chargeAmount - copAmount,
    });

  } catch (err) {
    console.error('Error inesperado create-xzoom-host-subscription:', err);
    return json({ error: 'Error interno del servidor' }, 500);
  }
});
