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

// Token packs
const PACKS: Record<number, { tokens: number; priceCop: number }> = {
  50:   { tokens: 50,   priceCop: 9900 },
  110:  { tokens: 110,  priceCop: 19900 },
  250:  { tokens: 250,  priceCop: 39900 },
  550:  { tokens: 550,  priceCop: 79900 },
  1100: { tokens: 1100, priceCop: 149900 },
  2500: { tokens: 2500, priceCop: 299900 },
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY || !EPAYCO_PUBLIC_KEY) {
      return json({ error: 'Configuración incompleta' }, 500);
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

    const chargeAmount = calcChargeAmount(pack.priceCop);

    return json({
      publicKey:     EPAYCO_PUBLIC_KEY,
      test:          EPAYCO_TEST === 'true',
      name:          `LiveCam Pro — ${pack.tokens} Tokens`,
      description:   `Compra de ${pack.tokens} tokens en LiveCam Pro`,
      invoice,
      currency:      'cop',
      amount:        String(chargeAmount),
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
      response:      `https://livecam-pro.vercel.app/tokens?epayco=result`,
    });
  } catch (err) {
    console.error('livecam-buy-tokens error:', err);
    return json({ error: 'Error interno' }, 500);
  }
});
