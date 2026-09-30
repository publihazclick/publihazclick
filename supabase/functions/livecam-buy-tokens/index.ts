// =============================================================================
// Edge Function: livecam-buy-tokens
// Crea checkout ePayco para compra de tokens en LiveCam Pro.
// Al confirmar pago, epayco-webhook acredita tokens al usuario.
// =============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL         = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const EPAYCO_PUBLIC_KEY    = Deno.env.get('EPAYCO_PUBLIC_KEY') ?? '';
const EPAYCO_TEST          = Deno.env.get('EPAYCO_TEST') ?? 'false';

// A dónde vuelve el usuario después de pagar en ePayco.
//
// Antes estaba escrito a mano como 'https://livecam-pro.vercel.app/tokens?epayco=result'
// (2026-09-30): el único sitio de todo el código que seguía amarrado a Vercel, y encima a
// una URL que HOY devuelve HTTP 402 -- Vercel la suspendió por falta de pago. O sea que
// quien pagara tokens terminaba en una página muerta, con la plata ya cobrada.
//
// SIN RESPALDO A PROPÓSITO. Poner una URL por defecto acá es lo que escondió el problema
// durante meses: parecía que funcionaba. Si la variable no está configurada, esta función
// se niega a crear el cobro (ver la validación en el handler) en vez de mandar a alguien a
// pagar para caer en el vacío. Mejor no cobrar que cobrar y dejar al cliente perdido.
const LIVECAM_APP_URL      = Deno.env.get('LIVECAM_APP_URL') ?? '';

const EPAYCO_RATE = 0.035581;
const EPAYCO_FIXED = 1071;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}

function calcChargeAmount(base: number): number {
  return Math.ceil((base + EPAYCO_FIXED) / (1 - EPAYCO_RATE));
}

// Token packs — precios YA incluyen comisión ePayco (el usuario paga esto exacto)
const PACKS: Record<number, { tokens: number; priceCop: number }> = {
  50:   { tokens: 50,   priceCop: 11900 },
  110:  { tokens: 110,  priceCop: 21900 },
  250:  { tokens: 250,  priceCop: 42900 },
  550:  { tokens: 550,  priceCop: 83900 },
  1100: { tokens: 1100, priceCop: 156900 },
  2500: { tokens: 2500, priceCop: 312900 },
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY || !EPAYCO_PUBLIC_KEY) {
      return json({ error: 'Configuración incompleta' }, 500);
    }

    // Sin sitio a dónde volver no se cobra. Ver la nota de LIVECAM_APP_URL arriba: cobrarle
    // a alguien y devolverlo a una página caída es peor que no dejarlo comprar.
    if (!LIVECAM_APP_URL.startsWith('http')) {
      console.error('livecam-buy-tokens: falta LIVECAM_APP_URL, no se crea el cobro');
      return json({ error: 'Las compras están temporalmente deshabilitadas.' }, 503);
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return json({ error: 'No autorizado' }, 401);
    const userJwt = authHeader.replace('Bearer ', '');

    const body = await req.json().catch(() => null);
    const tokens = body?.tokens as number | undefined;
    if (!tokens || !PACKS[tokens]) return json({ error: 'Paquete de tokens inválido' }, 400);

    const pack = PACKS[tokens];

    // Validate user
    let userId: string | null = null;
    let userEmail = '';
    let username = '';
    try {
      const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { Authorization: `Bearer ${userJwt}`, apikey: SUPABASE_SERVICE_KEY } });
      if (r.ok) { const u = await r.json(); userId = u?.id; userEmail = u?.email ?? ''; }
    } catch {}
    if (!userId) {
      try { const d = JSON.parse(atob(userJwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))); userId = d?.sub; userEmail = d?.email ?? ''; } catch {}
    }
    if (!userId) return json({ error: 'Sesión inválida' }, 401);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    const { data: profile } = await supabase.from('livecam_profiles').select('username, email').eq('id', userId).maybeSingle();
    if (profile) { username = profile.username ?? ''; userEmail = userEmail || (profile.email ?? ''); }

    const invoice = `LCTOKEN-${Date.now()}-${userId.substring(0, 8).toUpperCase()}`;

    // Create purchase record
    const { data: purchase, error: insertErr } = await supabase
      .from('livecam_token_purchases')
      .insert({ user_id: userId, tokens: pack.tokens, price_cop: pack.priceCop, payment_method: 'epayco', payment_reference: invoice, status: 'pending' })
      .select('id').single();

    if (insertErr || !purchase) {
      console.error('Error inserting token purchase:', insertErr);
      return json({ error: 'Error registrando compra' }, 500);
    }

    // Precio ya incluye comisión ePayco — se pasa directo sin recargo adicional
    return json({
      publicKey:     EPAYCO_PUBLIC_KEY,
      test:          EPAYCO_TEST === 'true',
      name:          `LiveCam Pro — ${pack.tokens} Tokens`,
      description:   `Compra de ${pack.tokens} tokens en LiveCam Pro`,
      invoice,
      currency:      'cop',
      amount:        String(pack.priceCop),
      tax_base:      '0',
      tax:           '0',
      country:       'CO',
      lang:          'es',
      email_billing: userEmail,
      name_billing:  username || 'Usuario',
      extra1:        purchase.id,
      extra2:        String(pack.tokens),
      extra3:        'livecam_token_purchase',
      confirmation:  `${SUPABASE_URL}/functions/v1/epayco-webhook`,
      response:      `${LIVECAM_APP_URL.replace(/\/+$/, '')}/tokens?epayco=result`,
    });
  } catch (err) {
    console.error('livecam-buy-tokens error:', err);
    return json({ error: 'Error interno' }, 500);
  }
});
