// =============================================================================
// Edge Function: create-nequi-payment
// Crea una transacción Nequi vía Wompi y guarda el registro en payments
// =============================================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const WOMPI_PRIVATE_KEY   = Deno.env.get('WOMPI_PRIVATE_KEY')!;
const WOMPI_BASE_URL      = Deno.env.get('WOMPI_BASE_URL') ?? 'https://sandbox.wompi.co/v1';
const SUPABASE_URL        = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// Tasa de cambio de respaldo (se actualiza vía env var en producción)
const USD_TO_COP_FALLBACK = 4200;

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

// Obtiene la tasa COP/USD actual (Open source, sin clave)
async function getUsdToCopRate(): Promise<number> {
  try {
    const envRate = Deno.env.get('USD_TO_COP_RATE');
    if (envRate) return parseFloat(envRate);

    const res = await fetch('https://api.exchangerate-api.com/v4/latest/USD');
    if (!res.ok) return USD_TO_COP_FALLBACK;
    const data = await res.json();
    return data.rates?.COP ?? USD_TO_COP_FALLBACK;
  } catch {
    return USD_TO_COP_FALLBACK;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: cors });
  }

  try {
    // ── 1. Verificar JWT ─────────────────────────────────────────────────────
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return json({ error: 'No autorizado' }, 401);
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return json({ error: 'Token inválido o expirado' }, 401);
    }

    // ── 2. Parsear y validar body ─────────────────────────────────────────────
    const body = await req.json().catch(() => null);
    if (!body) return json({ error: 'Body inválido' }, 400);

    const { package_id, phone_number } = body as { package_id: string; phone_number: string };

    if (!package_id || !phone_number) {
      return json({ error: 'package_id y phone_number son requeridos' }, 400);
    }

    // Validar número colombiano: 10 dígitos, empieza en 3
    const cleanPhone = phone_number.replace(/\D/g, '');
    if (!/^3\d{9}$/.test(cleanPhone)) {
      return json({ error: 'Número Nequi inválido. Debe ser un número colombiano de 10 dígitos (ej: 3001234567)' }, 400);
    }

    // ── 3. Obtener paquete ────────────────────────────────────────────────────
    const { data: pkg, error: pkgError } = await supabase
      .from('packages')
      .select('id, name, price, currency')
      .eq('id', package_id)
      .eq('is_active', true)
      .single();

    if (pkgError || !pkg) {
      return json({ error: 'Paquete no encontrado o inactivo' }, 404);
    }

    // ── 4. Verificar que el usuario no tenga paquete activo ──────────────────
    const { data: activePackages } = await supabase
      .from('user_packages')
      .select('id')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .gte('end_date', new Date().toISOString())
      .limit(1);

    if (activePackages && activePackages.length > 0) {
      return json({ error: 'Ya tienes un paquete activo' }, 409);
    }

    // ── 5. Verificar que no haya un pago pendiente reciente ──────────────────
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const { data: pendingPayment } = await supabase
      .from('payments')
      .select('id, gateway_transaction_id')
      .eq('user_id', user.id)
      .eq('package_id', package_id)
      .eq('status', 'pending')
      .gte('created_at', fiveMinutesAgo)
      .limit(1)
      .maybeSingle();

    // Si hay uno pendiente reciente, devolver el mismo transaction_id
    if (pendingPayment) {
      return json({
        transaction_id: pendingPayment.gateway_transaction_id,
        status: 'PENDING',
        message: 'Ya tienes un pago pendiente. Revisa tu app Nequi.',
        reused: true,
      });
    }

    // ── 6. Calcular monto en COP ──────────────────────────────────────────────
    const profile = await supabase
      .from('profiles')
      .select('username, email')
      .eq('id', user.id)
      .single();

    const rate = await getUsdToCopRate();
    const priceUSD = pkg.price as number;
    const amountCOP = Math.round(priceUSD * rate);
    const amountInCents = amountCOP * 100;

    // ── 7. Crear referencia única ─────────────────────────────────────────────
    const timestamp = Date.now();
    const shortUserId = user.id.replace(/-/g, '').substring(0, 8).toUpperCase();
    const shortPkgId  = package_id.replace(/-/g, '').substring(0, 8).toUpperCase();
    const reference   = `PHC-${shortUserId}-${shortPkgId}-${timestamp}`;

    // ── 8. Llamar a Wompi API ─────────────────────────────────────────────────
    const wompiPayload = {
      amount_in_cents: amountInCents,
      currency: 'COP',
      customer_email: profile.data?.email ?? user.email ?? '',
      payment_method: {
        type: 'NEQUI',
        phone_number: cleanPhone,
      },
      reference,
      customer_data: {
        phone_number: cleanPhone,
        full_name: profile.data?.username ?? 'Usuario Publihazclick',
      },
    };

    const wompiRes = await fetch(`${WOMPI_BASE_URL}/transactions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${WOMPI_PRIVATE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(wompiPayload),
    });

    if (!wompiRes.ok) {
      const errBody = await wompiRes.json().catch(() => ({}));
      console.error('Wompi error:', errBody);
      return json(
        { error: 'Error al iniciar el pago con Nequi. Intenta de nuevo.' },
        502
      );
    }

    const wompiData = await wompiRes.json();
    const transaction = wompiData.data;

    // ── 9. Guardar pago en DB ─────────────────────────────────────────────────
    const { error: insertError } = await supabase.from('payments').insert({
      user_id:                user.id,
      package_id:             pkg.id,
      package_name:           pkg.name,
      amount_in_cents:        amountInCents,
      currency:               'COP',
      status:                 'pending',
      payment_method:         'nequi',
      gateway:                'wompi',
      gateway_transaction_id: transaction.id,
      gateway_reference:      reference,
      phone_number:           cleanPhone,
      metadata: {
        package_price_usd: priceUSD,
        usd_to_cop_rate:   rate,
        wompi_initial_status: transaction.status,
      },
    });

    if (insertError) {
      console.error('Error guardando pago:', insertError);
      // No abortamos — el pago ya fue creado en Wompi
    }

    // ── 10. Responder ─────────────────────────────────────────────────────────
    return json({
      transaction_id:  transaction.id,
      reference,
      status:          transaction.status, // PENDING
      amount_in_cents: amountInCents,
      amount_cop:      amountCOP,
      message:         '¡Revisa tu app Nequi! Tienes una notificación pendiente de aprobación.',
    });

  } catch (err) {
    console.error('Error inesperado:', err);
    return json({ error: 'Error interno del servidor' }, 500);
  }
});
