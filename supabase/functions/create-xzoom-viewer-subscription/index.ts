// =============================================================================
// Edge Function: create-xzoom-viewer-subscription
// Crea un registro de suscripción de suscriptor a un anfitrión XZOOM y
// devuelve los parámetros de checkout de ePayco.
// El precio lo define el anfitrión (xzoom_hosts.subscriber_price_cop).
// Publihazclick retiene commission_rate (default 15%).
// =============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL         = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const EPAYCO_PUBLIC_KEY    = Deno.env.get('EPAYCO_PUBLIC_KEY') ?? '';
const EPAYCO_TEST          = Deno.env.get('EPAYCO_TEST') ?? 'true';

const DEFAULT_COMMISSION_RATE = 0.12;

async function getCommissionRate(supabase: any): Promise<number> {
  try {
    const { data } = await supabase
      .from('platform_settings')
      .select('value')
      .eq('key', 'xzoom_commission_rate')
      .single();
    const raw = (data?.value ?? '').toString().trim();
    if (!raw) return DEFAULT_COMMISSION_RATE;
    const parsed = parseFloat(raw);
    if (isNaN(parsed) || parsed < 0 || parsed >= 1) return DEFAULT_COMMISSION_RATE;
    return parsed;
  } catch {
    return DEFAULT_COMMISSION_RATE;
  }
}

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
    const viewerId  = jwtPayload.sub;
    const viewerEmail = jwtPayload.email ?? '';
    if (!viewerId) return json({ error: 'Token sin user ID' }, 401);

    const body = await req.json().catch(() => null);
    const hostId = body?.host_id as string | undefined;
    if (!hostId) return json({ error: 'host_id requerido' }, 400);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    const { data: profile } = await supabase
      .from('profiles').select('username, email').eq('id', viewerId).single();
    if (!profile) return json({ error: 'Perfil no encontrado' }, 404);

    // Cargar el anfitrión y su precio
    const { data: host } = await supabase
      .from('xzoom_hosts')
      .select('id, display_name, subscriber_price_cop, is_active, user_id')
      .eq('id', hostId)
      .maybeSingle();

    if (!host) return json({ error: 'Anfitrión no encontrado' }, 404);
    if (!host.is_active) return json({ error: 'Este anfitrión no está activo' }, 400);
    if (host.user_id === viewerId) return json({ error: 'No puedes suscribirte a tu propio canal' }, 400);
    if (!host.subscriber_price_cop || host.subscriber_price_cop <= 0) {
      return json({ error: 'El anfitrión no tiene precio configurado' }, 400);
    }

    // Verificar que no tenga suscripción activa a ESTE anfitrión
    const { data: activeSub } = await supabase
      .from('xzoom_viewer_subscriptions')
      .select('id')
      .eq('viewer_user_id', viewerId)
      .eq('host_id', host.id)
      .eq('status', 'active')
      .gte('expires_at', new Date().toISOString())
      .limit(1);
    if (activeSub?.length) {
      return json({ error: 'Ya tienes una suscripción activa a este anfitrión' }, 409);
    }

    const copAmount = host.subscriber_price_cop;
    const commissionRate = await getCommissionRate(supabase);
    const platformCop = Math.floor(copAmount * commissionRate);
    const hostEarningsCop = copAmount - platformCop;

    const invoice = `XZOOMVIEW-${Date.now()}-${viewerId.substring(0, 8).toUpperCase()}`;

    const { data: subscription, error: insertError } = await supabase
      .from('xzoom_viewer_subscriptions')
      .insert({
        viewer_user_id: viewerId,
        host_id: host.id,
        status: 'pending',
        price_cop: copAmount,
        currency: 'COP',
        commission_rate: commissionRate,
        platform_cop: platformCop,
        host_earnings_cop: hostEarningsCop,
        auto_renew: true,
        payment_method: 'epayco',
        payment_reference: invoice,
      })
      .select('id').single();

    if (insertError || !subscription) {
      console.error('Error insertando suscripción XZOOM viewer:', insertError);
      return json({ error: 'Error al registrar el pago' }, 500);
    }

    const chargeAmount = calcChargeAmount(copAmount);

    return json({
      publicKey:       EPAYCO_PUBLIC_KEY,
      test:            EPAYCO_TEST === 'true',
      name:            `XZOOM EN VIVO — ${host.display_name}`,
      description:     `Suscripción mensual a ${host.display_name} en XZOOM EN VIVO`,
      invoice,
      currency:        'cop',
      amount:          String(chargeAmount),
      tax_base:        '0',
      tax:             '0',
      country:         'CO',
      lang:            'es',
      email_billing:   profile.email ?? viewerEmail,
      name_billing:    profile.username ?? 'Suscriptor',
      extra1:          subscription.id,
      extra2:          host.id,
      extra3:          'xzoom_viewer_subscription',
      confirmation:    `${SUPABASE_URL}/functions/v1/epayco-webhook`,
      response:        `https://www.publihazclick.com/dashboard/xzoom-en-vivo?epayco=result`,
      payment_db_id:   subscription.id,
      base_amount:     copAmount,
      charge_amount:   chargeAmount,
      fee_amount:      chargeAmount - copAmount,
    });

  } catch (err) {
    console.error('Error inesperado create-xzoom-viewer-subscription:', err);
    return json({ error: 'Error interno del servidor' }, 500);
  }
});
