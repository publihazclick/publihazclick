// =============================================================================
// Edge Function: check-payment-status
// Consulta el estado de una transacción directamente en Wompi
// Usada por el frontend para polling mientras espera la aprobación del usuario
// =============================================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const WOMPI_PUBLIC_KEY    = Deno.env.get('WOMPI_PUBLIC_KEY')!;
const WOMPI_PRIVATE_KEY   = Deno.env.get('WOMPI_PRIVATE_KEY')!;
const WOMPI_BASE_URL      = Deno.env.get('WOMPI_BASE_URL') ?? 'https://sandbox.wompi.co/v1';
const SUPABASE_URL        = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

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

// Mapeo de estados Wompi → estados internos
function mapWompiStatus(wompiStatus: string): string {
  const map: Record<string, string> = {
    PENDING:  'pending',
    APPROVED: 'approved',
    DECLINED: 'declined',
    VOIDED:   'voided',
    ERROR:    'error',
  };
  return map[wompiStatus] ?? 'pending';
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: cors });
  }

  try {
    // ── 1. Verificar autenticación ────────────────────────────────────────────
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return json({ error: 'No autorizado' }, 401);
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return json({ error: 'Token inválido' }, 401);
    }

    // ── 2. Obtener transaction_id de la URL ───────────────────────────────────
    const url = new URL(req.url);
    const transactionId = url.searchParams.get('transaction_id');

    if (!transactionId) {
      return json({ error: 'transaction_id es requerido' }, 400);
    }

    // ── 3. Verificar que el pago pertenece al usuario ─────────────────────────
    const { data: payment, error: paymentError } = await supabase
      .from('payments')
      .select('id, user_id, status, package_id, package_name, amount_in_cents')
      .eq('gateway_transaction_id', transactionId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (paymentError || !payment) {
      return json({ error: 'Transacción no encontrada' }, 404);
    }

    // Si ya tiene un estado final, devolver sin consultar Wompi
    if (['approved', 'declined', 'voided', 'error'].includes(payment.status)) {
      return json({
        transaction_id: transactionId,
        status: payment.status,
        package_name: payment.package_name,
        amount_in_cents: payment.amount_in_cents,
        final: true,
      });
    }

    // ── 4. Consultar estado actual en Wompi ───────────────────────────────────
    const wompiRes = await fetch(`${WOMPI_BASE_URL}/transactions/${transactionId}`, {
      headers: {
        Authorization: `Bearer ${WOMPI_PRIVATE_KEY}`,
      },
    });

    if (!wompiRes.ok) {
      // Si Wompi no responde, devolver el estado que tenemos en DB
      return json({
        transaction_id: transactionId,
        status: payment.status,
        package_name: payment.package_name,
        amount_in_cents: payment.amount_in_cents,
        final: false,
      });
    }

    const wompiData = await wompiRes.json();
    const transaction = wompiData.data;
    const newStatus = mapWompiStatus(transaction.status);

    // ── 5. Actualizar DB si el estado cambió ─────────────────────────────────
    if (newStatus !== payment.status) {
      await supabase
        .from('payments')
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq('id', payment.id);

      // Si fue aprobado, activar el paquete
      if (newStatus === 'approved') {
        await supabase.rpc('process_successful_payment', {
          p_gateway_transaction_id: transactionId,
          p_new_status: 'approved',
        });
      }
    }

    return json({
      transaction_id: transactionId,
      status: newStatus,
      package_name: payment.package_name,
      amount_in_cents: payment.amount_in_cents,
      final: ['approved', 'declined', 'voided', 'error'].includes(newStatus),
    });

  } catch (err) {
    console.error('Error inesperado:', err);
    return json({ error: 'Error interno del servidor' }, 500);
  }
});
