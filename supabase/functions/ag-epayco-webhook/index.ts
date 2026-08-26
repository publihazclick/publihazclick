// =============================================================================
// Edge Function: ag-epayco-webhook
// Webhook dedicado de ePayco para el proyecto Supabase propio de Movi (Anda y Gana).
// Solo maneja recargas de billetera de conductor (x_extra3 = 'ag_wallet').
//
// Por qué existe esta función separada de "epayco-webhook":
// Movi se migró a su propio proyecto Supabase (hndhgtnjyjwrnzdcgcca) el 2026-07-05,
// pero la función "epayco-webhook" (que maneja cursos, XZOOM, SMS, etc.) se quedó
// solo en el proyecto compartido (btkdmdhzouzvzgyuzgbh) porque esos otros productos
// viven ahí. ag-create-wallet-recharge corre en ESTE proyecto, así que su
// `confirmation` URL apunta aquí (SUPABASE_URL siempre es el proyecto donde corre
// la función). Antes de este fix esa URL no existía → ePayco cobraba y aprobaba el
// pago, pero el webhook de confirmación nunca llegaba a tocar la base de datos de
// Movi y la billetera del conductor nunca se acreditaba.
//
// IMPORTANTE: Deploy con --no-verify-jwt (ePayco no envía JWT de usuario)
//
// Verificación de firma:
//   SHA256(P_CUST_ID_CLIENTE ^ P_KEY ^ x_ref_payco ^ x_transaction_id ^ x_amount ^ x_currency_code)
// =============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL         = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const P_CUST_ID_CLIENTE    = Deno.env.get('EPAYCO_P_CUST_ID_CLIENTE')!;
const P_KEY                = Deno.env.get('EPAYCO_P_KEY')!;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type',
};

function ok(msg = 'ok') {
  return new Response(JSON.stringify({ ok: true, msg }), {
    status: 200,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

function fail(msg: string, status = 400) {
  return new Response(JSON.stringify({ ok: false, error: msg }), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// ePayco usa GET para la "Response URL" y POST para la "Confirmation URL".
// Aceptamos ambos para que cualquier configuración en el panel de ePayco funcione.
async function parseParams(req: Request): Promise<Record<string, string>> {
  const url = new URL(req.url);
  const params: Record<string, string> = {};

  for (const [k, v] of url.searchParams.entries()) {
    params[k] = v;
  }

  if (req.method === 'POST') {
    const contentType = req.headers.get('content-type') ?? '';
    const rawText = await req.text().catch(() => '');

    if (rawText) {
      if (contentType.includes('application/json')) {
        try {
          const json = JSON.parse(rawText);
          for (const k of Object.keys(json)) {
            params[k] = String(json[k] ?? '');
          }
        } catch { /* keep query params only */ }
      } else {
        for (const pair of rawText.split('&')) {
          if (!pair) continue;
          const [k, v] = pair.split('=');
          if (k) params[decodeURIComponent(k)] = decodeURIComponent(v ?? '');
        }
      }
    }
  }

  return params;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST' && req.method !== 'GET') {
    return fail('Method not allowed', 405);
  }

  try {
    const p = await parseParams(req);
    console.log(`ag-epayco-webhook ${req.method} params:`, JSON.stringify(p));

    const x_ref_payco         = p['x_ref_payco']         ?? '';
    const x_transaction_id    = p['x_transaction_id']    ?? '';
    const x_transaction_state = p['x_transaction_state'] ?? '';
    const x_cod_response      = p['x_cod_response']      ?? '';
    const x_amount            = p['x_amount']             ?? '';
    const x_currency_code     = p['x_currency_code']      ?? '';
    const x_signature         = p['x_signature']           ?? '';
    const x_extra1            = p['x_extra1']              ?? ''; // ag_wallet_payments UUID
    const x_extra3            = p['x_extra3']              ?? ''; // 'ag_wallet'

    const signInput = [
      P_CUST_ID_CLIENTE,
      P_KEY,
      x_ref_payco,
      x_transaction_id,
      x_amount,
      x_currency_code,
    ].join('^');

    const expectedSig = await sha256Hex(signInput);

    if (x_signature.toLowerCase() !== expectedSig.toLowerCase()) {
      console.warn('ag-epayco-webhook: firma inválida', { received: x_signature, expected: expectedSig });
      return ok('invalid_signature_ignored');
    }

    console.log(`ag-epayco-webhook OK — ref: ${x_ref_payco}, state: ${x_transaction_state}, cod: ${x_cod_response}`);

    if (x_cod_response !== '1') {
      return ok(`state_${x_transaction_state}_ignored`);
    }

    if (x_extra3 !== 'ag_wallet' || !x_extra1) {
      console.warn('ag-epayco-webhook: extra3/extra1 inesperados', { x_extra3, x_extra1 });
      return ok('unhandled_extra3_ignored');
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    const { error: approveErr } = await supabase.rpc('ag_approve_wallet_payment', {
      p_payment_id: x_extra1,
    });
    if (approveErr) {
      console.error('Error aprobando recarga de billetera:', approveErr);
      return fail('Wallet approval failed', 500);
    }

    await supabase.from('ag_wallet_payments')
      .update({ epayco_ref: x_ref_payco })
      .eq('id', x_extra1);

    console.log(`Recarga billetera AG aprobada — payment: ${x_extra1}, ref: ${x_ref_payco}`);
    return ok('ag_wallet_approved');

  } catch (err) {
    console.error('Error inesperado en ag-epayco-webhook:', err);
    return fail('Internal server error', 500);
  }
});
