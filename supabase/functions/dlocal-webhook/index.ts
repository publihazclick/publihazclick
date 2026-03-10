// =============================================================================
// Edge Function: dlocal-webhook
// Recibe notificaciones de pago de dLocal Go y activa paquetes automáticamente
// verify_jwt: false — dLocal llama directamente sin JWT de usuario
// Docs: https://docs.dlocalgo.com/integration-api/welcome-to-dlocal-go-api/payments/notifications
// =============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const DLOCAL_API_KEY      = Deno.env.get('DLOCAL_API_KEY')!;
const DLOCAL_SECRET_KEY   = Deno.env.get('DLOCAL_SECRET_KEY')!;
const DLOCAL_BASE_URL     = Deno.env.get('DLOCAL_BASE_URL') ?? 'https://api.dlocalgo.com';
const SUPABASE_URL        = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, authorization',
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

// Firma: HMAC-SHA256(SecretKey, ApiKey + payload_json)
async function hmacSha256Hex(key: string, message: string): Promise<string> {
  const encoder = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(message));
  return Array.from(new Uint8Array(sig))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    // ── 1. Leer body raw ────────────────────────────────────────────────────
    const rawBody = await req.text();
    console.log('dLocal webhook raw body:', rawBody);

    // ── 2. Verificar firma de dLocal ────────────────────────────────────────
    // Header: "V2-HMAC-SHA256, Signature: [hex_signature]"
    // Signature = HMAC-SHA256(SecretKey, ApiKey + payload_json)
    const authHeader = req.headers.get('Authorization') ?? '';
    const sigMatch = authHeader.match(/Signature:\s*([a-f0-9]+)/i);
    const receivedSig = sigMatch?.[1] ?? '';

    const expectedSig = await hmacSha256Hex(
      DLOCAL_SECRET_KEY,
      DLOCAL_API_KEY + rawBody,
    );

    if (receivedSig !== expectedSig) {
      console.warn('dLocal webhook: firma inválida');
      console.warn('Received:', receivedSig);
      console.warn('Expected:', expectedSig);
      return json({ error: 'Invalid signature' }, 401);
    }

    // ── 3. Parsear payload ──────────────────────────────────────────────────
    // dLocal Go solo envía { "payment_id": "DP-XXX" }
    const payload = JSON.parse(rawBody) as { payment_id: string };
    const dlocalPaymentId = payload.payment_id;

    console.log(`dLocal webhook: notificación para pago ${dlocalPaymentId}`);

    // ── 4. Consultar status real del pago en dLocal Go API ──────────────────
    const dlocalRes = await fetch(`${DLOCAL_BASE_URL}/v1/payments/${dlocalPaymentId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${DLOCAL_API_KEY}:${DLOCAL_SECRET_KEY}`,
      },
    });

    if (!dlocalRes.ok) {
      const errText = await dlocalRes.text();
      console.error(`Error consultando pago en dLocal (${dlocalRes.status}):`, errText);
      return json({ error: 'Failed to retrieve payment from dLocal' }, 502);
    }

    const dlocalPayment = await dlocalRes.json();
    const status = dlocalPayment.status as string;

    console.log(`dLocal pago ${dlocalPaymentId} → status: ${status}`);

    // ── 5. Solo procesar pagos exitosos (status PAID) ───────────────────────
    if (status?.toUpperCase() !== 'PAID') {
      return json({ ok: true, message: `Status "${status}" ignorado` });
    }

    // ── 6. Buscar pago en DB por dlocal_payment_id ──────────────────────────
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    const { data: payment, error: lookupError } = await supabase
      .from('payments')
      .select('id, status')
      .eq('dlocal_payment_id', dlocalPaymentId)
      .maybeSingle();

    if (lookupError || !payment) {
      console.error('Pago no encontrado para dlocal_payment_id:', dlocalPaymentId);
      // Devolvemos 200 para que dLocal no reintente indefinidamente
      return json({ ok: true, message: 'Payment not found — ignored' });
    }

    // Evitar doble procesamiento
    if (payment.status === 'approved') {
      return json({ ok: true, message: 'Already approved' });
    }

    // ── 7. Aprobar pago y activar paquete (RPC SECURITY DEFINER) ────────────
    const { error: approveError } = await supabase.rpc('approve_payment', {
      p_payment_id: payment.id,
    });

    if (approveError) {
      console.error('Error al aprobar pago:', approveError);
      return json({ error: 'Approval failed' }, 500);
    }

    console.log(`Pago ${payment.id} aprobado automáticamente vía dLocal Go`);
    return json({ ok: true, approved: true, payment_id: payment.id });

  } catch (err) {
    console.error('Error en webhook dLocal:', err);
    return json({ error: 'Internal server error' }, 500);
  }
});
