// =============================================================================
// Edge Function: epayco-webhook
// Recibe confirmación de pago de ePayco y activa el paquete automáticamente.
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

// SHA256 como hex
async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// Parsear body: soporta JSON y form-urlencoded
async function parseBody(req: Request): Promise<Record<string, string>> {
  const contentType = req.headers.get('content-type') ?? '';
  const rawText = await req.text();

  if (contentType.includes('application/json')) {
    try {
      return JSON.parse(rawText);
    } catch {
      return {};
    }
  }

  // application/x-www-form-urlencoded (más común en ePayco)
  const params: Record<string, string> = {};
  for (const pair of rawText.split('&')) {
    const [k, v] = pair.split('=');
    if (k) params[decodeURIComponent(k)] = decodeURIComponent(v ?? '');
  }
  return params;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return fail('Method not allowed', 405);

  try {
    // ── 1. Parsear parámetros enviados por ePayco ────────────────────────────
    const p = await parseBody(req);
    console.log('ePayco webhook params:', JSON.stringify(p));

    const x_ref_payco       = p['x_ref_payco']       ?? '';
    const x_transaction_id  = p['x_transaction_id']  ?? '';
    const x_transaction_state = p['x_transaction_state'] ?? '';
    const x_cod_response    = p['x_cod_response']    ?? '';
    const x_amount          = p['x_amount']          ?? '';
    const x_currency_code   = p['x_currency_code']   ?? '';
    const x_signature       = p['x_signature']       ?? '';
    const x_extra1          = p['x_extra1']          ?? ''; // payment UUID (packages) o ag_wallet_payments UUID
    const x_extra2          = p['x_extra2']          ?? ''; // package ID o driver ID
    const x_extra3          = p['x_extra3']          ?? ''; // 'ag_wallet' para recargas de billetera
    const x_invoice         = p['x_invoice']         ?? '';

    // ── 2. Verificar firma SHA256 ────────────────────────────────────────────
    // Fórmula: SHA256(p_cust_id_cliente^p_key^x_ref_payco^x_transaction_id^x_amount^x_currency_code)
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
      console.warn('ePayco: firma inválida');
      console.warn('Received :', x_signature);
      console.warn('Expected :', expectedSig);
      // Devolvemos 200 para que ePayco no reintente con la misma firma
      return ok('invalid_signature_ignored');
    }

    console.log(
      `ePayco webhook OK — ref: ${x_ref_payco}, state: ${x_transaction_state}, cod: ${x_cod_response}`,
    );

    // ── 3. Solo procesar pagos ACEPTADOS (cod_response = 1) ─────────────────
    if (x_cod_response !== '1') {
      return ok(`state_${x_transaction_state}_ignored`);
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // ── 4A. Si es recarga de billetera Anda y Gana ───────────────────────────
    if (x_extra3 === 'ag_wallet' && x_extra1) {
      const { error: approveErr } = await supabase.rpc('ag_approve_wallet_payment', {
        p_payment_id: x_extra1,
      });
      if (approveErr) {
        console.error('Error aprobando recarga de billetera:', approveErr);
        return fail('Wallet approval failed', 500);
      }
      // Actualizar referencia ePayco en el registro
      await supabase.from('ag_wallet_payments')
        .update({ epayco_ref: x_ref_payco })
        .eq('id', x_extra1);
      console.log(`Recarga billetera AG aprobada — payment: ${x_extra1}, ref: ${x_ref_payco}`);
      return ok('ag_wallet_approved');
    }

    // ── 4B. Si es compra de curso ────────────────────────────────────────────
    if (x_extra3 === 'curso_purchase' && x_extra1) {
      const { error: courseErr } = await supabase.rpc('complete_course_purchase', {
        p_purchase_id: x_extra1,
      });
      if (courseErr) {
        console.error('Error completando compra de curso:', courseErr);
        return fail('Course purchase completion failed', 500);
      }
      // Registrar la referencia de ePayco en la compra
      await supabase.from('course_purchases')
        .update({ epayco_ref: x_ref_payco })
        .eq('id', x_extra1);

      console.log(`Compra de curso ${x_extra1} completada — ref: ${x_ref_payco}`);
      return ok('curso_purchase_approved');
    }

    // ── 4. Buscar pago en DB (flujo paquetes) ────────────────────────────────
    // Intentar por extra1 (payment UUID) o por gateway_reference (invoice)
    let paymentId: string | null = null;

    if (x_extra1) {
      const { data } = await supabase
        .from('payments')
        .select('id, status')
        .eq('id', x_extra1)
        .maybeSingle();

      if (data) paymentId = data.id;
    }

    // Fallback: buscar por invoice
    if (!paymentId && x_invoice) {
      const { data } = await supabase
        .from('payments')
        .select('id, status')
        .eq('gateway_reference', x_invoice)
        .maybeSingle();

      if (data) paymentId = data.id;
    }

    if (!paymentId) {
      console.warn('Pago no encontrado en DB para ref:', x_ref_payco, '/ extra1:', x_extra1);
      return ok('payment_not_found_ignored');
    }

    // ── 5. Actualizar referencia de ePayco en el pago ────────────────────────
    await supabase
      .from('payments')
      .update({
        gateway_transaction_id: x_transaction_id,
        epayco_ref_payco:       x_ref_payco,
        metadata: {
          x_ref_payco,
          x_transaction_id,
          x_transaction_state,
          x_amount,
          x_currency_code,
          confirmed_at: new Date().toISOString(),
        },
      })
      .eq('id', paymentId);

    // ── 6. Aprobar pago y activar paquete (RPC SECURITY DEFINER) ────────────
    const { error: approveError } = await supabase.rpc('approve_payment', {
      p_payment_id: paymentId,
    });

    if (approveError) {
      console.error('Error al aprobar pago:', approveError);
      return fail('Approval failed', 500);
    }

    console.log(`Pago ${paymentId} aprobado automáticamente vía ePayco`);
    return ok('approved');

  } catch (err) {
    console.error('Error inesperado en webhook ePayco:', err);
    return fail('Internal server error', 500);
  }
});
