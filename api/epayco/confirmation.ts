// =============================================================================
// POST /api/epayco/confirmation
// Webhook de confirmación de pago ePayco para recargas de wallet Movi.
// ePayco llama este endpoint cuando un pago es confirmado o rechazado.
//
// Seguridad: verifica la firma SHA256 antes de procesar cualquier pago.
// Firma: SHA256(P_CUST_ID^P_KEY^x_ref_payco^x_transaction_id^x_amount^x_currency_code)
// =============================================================================

import { createClient } from '@supabase/supabase-js';
import { createHash } from 'crypto';

const SUPABASE_URL = process.env['SUPABASE_URL']!;
const SERVICE_KEY  = process.env['SUPABASE_SERVICE_ROLE_KEY']!;
const P_CUST_ID    = process.env['EPAYCO_P_CUST_ID']!;
const P_KEY        = process.env['EPAYCO_P_KEY']!;   // Llave de firma de webhooks

function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

// ePayco puede enviar los params como x-www-form-urlencoded o JSON
async function parseBody(req: any): Promise<Record<string, string>> {
  const contentType: string = req.headers['content-type'] ?? '';

  if (req.body && typeof req.body === 'object') {
    // Vercel ya parsea el body automáticamente
    const result: Record<string, string> = {};
    for (const k of Object.keys(req.body)) {
      result[k] = String(req.body[k] ?? '');
    }
    return result;
  }

  return {};
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  try {
    // ── 1. Parsear parámetros enviados por ePayco ─────────────────────────
    const p = await parseBody(req);

    // También leer query params (ePayco a veces usa GET para la confirmation URL)
    const url = new URL(req.url, `https://${req.headers['host']}`);
    for (const [k, v] of url.searchParams.entries()) {
      if (!p[k]) p[k] = v;
    }

    const x_ref_payco         = p['x_ref_payco']         ?? '';
    const x_transaction_id    = p['x_transaction_id']    ?? '';
    const x_transaction_state = p['x_transaction_state'] ?? '';
    const x_cod_response      = p['x_cod_response']      ?? '';
    const x_amount            = p['x_amount']            ?? '';
    const x_currency_code     = p['x_currency_code']     ?? '';
    const x_signature         = p['x_signature']         ?? '';
    const x_extra1            = p['x_extra1']            ?? ''; // ag_wallet_payments UUID
    const x_extra2            = p['x_extra2']            ?? ''; // driver UUID
    const x_extra3            = p['x_extra3']            ?? ''; // 'ag_wallet'

    console.log(`[epayco/confirmation] ref=${x_ref_payco} state=${x_transaction_state} cod=${x_cod_response} extra3=${x_extra3}`);

    // ── 2. Verificar firma SHA256 ──────────────────────────────────────────
    // Fórmula: SHA256(P_CUST_ID^P_KEY^x_ref_payco^x_transaction_id^x_amount^x_currency_code)
    const signInput   = [P_CUST_ID, P_KEY, x_ref_payco, x_transaction_id, x_amount, x_currency_code].join('^');
    const expectedSig = sha256(signInput);

    if (x_signature.toLowerCase() !== expectedSig.toLowerCase()) {
      console.warn('[epayco/confirmation] Firma inválida — recibida:', x_signature, '— esperada:', expectedSig);
      // Responder 200 para que ePayco no reintente; la firma inválida significa que no es un pago legítimo
      return res.status(200).json({ ok: false, reason: 'invalid_signature' });
    }

    // ── 3. Solo procesar pagos ACEPTADOS (cod_response = 1) ───────────────
    if (x_cod_response !== '1') {
      console.log(`[epayco/confirmation] Pago no aceptado (cod=${x_cod_response}) — ignorado`);
      return res.status(200).json({ ok: true, reason: `state_${x_transaction_state}_ignored` });
    }

    // ── 4. Procesar recarga de wallet Movi ────────────────────────────────
    if (x_extra3 === 'ag_wallet' && x_extra1) {
      const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

      // Aprobar el pago y acreditar el saldo al wallet del conductor
      const { error: approveErr } = await supabase.rpc('ag_approve_wallet_payment', {
        p_payment_id: x_extra1,
      });

      if (approveErr) {
        console.error('[epayco/confirmation] Error en ag_approve_wallet_payment:', approveErr);
        return res.status(500).json({ ok: false, error: 'Wallet approval failed' });
      }

      // Guardar la referencia de ePayco en el registro
      await supabase
        .from('ag_wallet_payments')
        .update({ epayco_ref: x_ref_payco, status: 'approved' })
        .eq('id', x_extra1);

      console.log(`[epayco/confirmation] Wallet recargado — payment=${x_extra1} driver=${x_extra2} ref=${x_ref_payco}`);
      return res.status(200).json({ ok: true, reason: 'ag_wallet_approved' });
    }

    // Si x_extra3 no es 'ag_wallet', no es un pago de Movi — ignorar
    return res.status(200).json({ ok: true, reason: 'not_ag_wallet' });

  } catch (err) {
    console.error('[epayco/confirmation] Error inesperado:', err);
    return res.status(500).json({ ok: false, error: 'Internal server error' });
  }
}
