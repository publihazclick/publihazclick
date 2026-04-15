// =============================================================================
// Edge Function: create-xzoom-public-subscription
// Permite que un visitante (sin cuenta) se suscriba a un anfitrión XZOOM
// directamente desde la landing privada /xzoom/h/:slug.
//
// Flujo:
//   1. Recibe host_slug + email + full_name (sin JWT)
//   2. Valida host, crea xzoom_viewer_subscriptions con status=pending y
//      guest_email + guest_full_name (viewer_user_id NULL)
//   3. Devuelve params de checkout ePayco con extra3='xzoom_viewer_subscription'
//   4. Cuando ePayco confirma el pago, epayco-webhook activa la sub y crea
//      el auth user con ese email + envía link de recovery para setear clave.
//
// La comisión % se lee dinámicamente desde platform_settings.xzoom_commission_rate
// (default 0.12 / 12%).
// =============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL         = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const EPAYCO_PUBLIC_KEY    = Deno.env.get('EPAYCO_PUBLIC_KEY') ?? '';
const EPAYCO_TEST          = Deno.env.get('EPAYCO_TEST') ?? 'true';

const DEFAULT_COMMISSION_RATE = 0.12;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

const EPAYCO_RATE = 0.035581;
const EPAYCO_FIXED = 1071;
function calcChargeAmount(baseAmount: number): number {
  return Math.ceil((baseAmount + EPAYCO_FIXED) / (1 - EPAYCO_RATE));
}

function isValidEmail(e: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}

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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY || !EPAYCO_PUBLIC_KEY) {
      return json({ error: 'Configuración del servidor incompleta' }, 500);
    }

    const body = await req.json().catch(() => null);
    const hostSlug = (body?.host_slug as string | undefined)?.trim();
    const email    = (body?.email as string | undefined)?.trim().toLowerCase();
    const fullName = (body?.full_name as string | undefined)?.trim();

    if (!hostSlug) return json({ error: 'host_slug requerido' }, 400);
    if (!email || !isValidEmail(email)) return json({ error: 'Email inválido' }, 400);
    if (!fullName || fullName.length < 2) return json({ error: 'Nombre inválido' }, 400);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Cargar el anfitrión por slug
    const { data: host } = await supabase
      .from('xzoom_hosts')
      .select('id, display_name, subscriber_price_cop, is_active, user_id')
      .eq('slug', hostSlug)
      .maybeSingle();

    if (!host) return json({ error: 'Anfitrión no encontrado' }, 404);
    if (!host.is_active) return json({ error: 'Este anfitrión no está activo' }, 400);
    if (!host.subscriber_price_cop || host.subscriber_price_cop <= 0) {
      return json({ error: 'El anfitrión no tiene precio configurado' }, 400);
    }

    const copAmount = host.subscriber_price_cop;
    const commissionRate = await getCommissionRate(supabase);
    const platformCop = Math.floor(copAmount * commissionRate);
    const hostEarningsCop = copAmount - platformCop;

    const invoice = `XZOOMPUB-${Date.now()}-${email.substring(0, 8).replace(/[^a-z0-9]/g, '')}`;

    const { data: subscription, error: insertError } = await supabase
      .from('xzoom_viewer_subscriptions')
      .insert({
        viewer_user_id:   null,
        host_id:          host.id,
        status:           'pending',
        price_cop:        copAmount,
        currency:         'COP',
        commission_rate:  commissionRate,
        platform_cop:     platformCop,
        host_earnings_cop: hostEarningsCop,
        auto_renew:       true,
        payment_method:   'epayco',
        payment_reference: invoice,
        guest_email:      email,
        guest_full_name:  fullName,
      })
      .select('id')
      .single();

    if (insertError || !subscription) {
      console.error('Error insertando suscripción XZOOM public:', insertError);
      return json({ error: 'Error al registrar el pago' }, 500);
    }

    const chargeAmount = calcChargeAmount(copAmount);

    return json({
      publicKey:       EPAYCO_PUBLIC_KEY,
      test:            EPAYCO_TEST === 'true',
      name:            `XZOOM EN VIVO — ${host.display_name}`,
      description:     `Suscripción mensual a ${host.display_name}`,
      invoice,
      currency:        'cop',
      amount:          String(chargeAmount),
      tax_base:        '0',
      tax:             '0',
      country:         'CO',
      lang:            'es',
      email_billing:   email,
      name_billing:    fullName,
      extra1:          subscription.id,
      extra2:          host.id,
      extra3:          'xzoom_viewer_subscription',
      confirmation:    `${SUPABASE_URL}/functions/v1/epayco-webhook`,
      response:        `https://www.publihazclick.com/xzoom/h/${hostSlug}?epayco=result`,
    });
  } catch (err) {
    console.error('Error create-xzoom-public-subscription:', err);
    return json({ error: 'Error interno del servidor' }, 500);
  }
});
