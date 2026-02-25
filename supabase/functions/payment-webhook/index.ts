// =============================================================================
// Edge Function: payment-webhook
// Recibe notificaciones de Wompi cuando una transacción cambia de estado.
// Verifica la firma y activa el paquete si el pago fue aprobado.
//
// URL a configurar en Wompi Dashboard → Configuración → Webhooks:
//   https://<tu-proyecto>.supabase.co/functions/v1/payment-webhook
// =============================================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { createHmac } from 'https://deno.land/std@0.168.0/node/crypto.ts';

const WOMPI_EVENTS_SECRET  = Deno.env.get('WOMPI_EVENTS_SECRET')!;
const WOMPI_PRIVATE_KEY    = Deno.env.get('WOMPI_PRIVATE_KEY')!;
const WOMPI_BASE_URL       = Deno.env.get('WOMPI_BASE_URL') ?? 'https://sandbox.wompi.co/v1';
const SUPABASE_URL         = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// =============================================================================
// Verificación de firma Wompi
// Checksum = SHA256( transactionId + status + amountInCents + currency + secretKey )
// =============================================================================
function verifyWompiSignature(
  transaction: {
    id: string;
    status: string;
    amount_in_cents: number;
    currency: string;
  },
  receivedChecksum: string
): boolean {
  if (!WOMPI_EVENTS_SECRET) return false;

  const raw = `${transaction.id}${transaction.status}${transaction.amount_in_cents}${transaction.currency}${WOMPI_EVENTS_SECRET}`;
  const computed = createHmac('sha256', WOMPI_EVENTS_SECRET)
    .update(raw)
    .digest('hex');

  return computed === receivedChecksum;
}

// Mapeo de estados Wompi → estados internos
function mapWompiStatus(wompiStatus: string): string {
  const map: Record<string, string> = {
    PENDING:  'pending',
    APPROVED: 'approved',
    DECLINED: 'declined',
    VOIDED:   'voided',
    ERROR:    'error',
  };
  return map[wompiStatus] ?? 'error';
}

serve(async (req) => {
  // Solo POST
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  try {
    // ── 1. Parsear el evento ──────────────────────────────────────────────────
    const body = await req.json().catch(() => null);
    if (!body || !body.event || !body.data?.transaction) {
      console.error('Webhook: payload inválido', body);
      return new Response('Bad Request', { status: 400 });
    }

    const { event, data } = body;
    const transaction = data.transaction;

    console.log(`Wompi webhook: ${event} → TX ${transaction.id} → ${transaction.status}`);

    // ── 2. Solo procesar eventos de transacciones ─────────────────────────────
    if (event !== 'transaction.updated') {
      return new Response('OK', { status: 200 });
    }

    // ── 3. Verificar firma ────────────────────────────────────────────────────
    const receivedChecksum = req.headers.get('x-event-checksum') ?? '';

    // En sandbox se permite omitir la verificación; en producción es obligatoria
    const isProduction = WOMPI_BASE_URL.includes('production');
    if (isProduction && !verifyWompiSignature(transaction, receivedChecksum)) {
      console.error('Firma inválida:', receivedChecksum);
      return new Response('Unauthorized', { status: 401 });
    }

    // ── 4. Verificar el estado directamente en Wompi (doble confirmación) ─────
    const wompiRes = await fetch(`${WOMPI_BASE_URL}/transactions/${transaction.id}`, {
      headers: { Authorization: `Bearer ${WOMPI_PRIVATE_KEY}` },
    });

    if (!wompiRes.ok) {
      console.error('No se pudo verificar la transacción en Wompi');
      return new Response('Service Unavailable', { status: 503 });
    }

    const verified = (await wompiRes.json()).data;
    const internalStatus = mapWompiStatus(verified.status);

    // ── 5. Procesar el pago en la DB ──────────────────────────────────────────
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    const { data: rpcResult, error: rpcError } = await supabase.rpc(
      'process_successful_payment',
      {
        p_gateway_transaction_id: transaction.id,
        p_new_status: internalStatus,
      }
    );

    if (rpcError) {
      console.error('Error RPC process_successful_payment:', rpcError);
    } else {
      console.log(`Pago ${transaction.id} procesado → ${internalStatus} (RPC: ${rpcResult})`);
    }

    // Siempre responder 200 para que Wompi no reintente
    return new Response(JSON.stringify({ received: true, status: internalStatus }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('Error inesperado en webhook:', err);
    // Responder 200 igual — si devolvemos 5xx Wompi reintentará indefinidamente
    return new Response(JSON.stringify({ received: true, error: 'internal' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
