// =============================================================================
// POST /api/wallet/topup
// Crea el registro de pago pendiente y devuelve los parámetros del checkout
// de ePayco para que el frontend abra el modal con checkout.epayco.co/checkout.js
// La llave privada nunca sale del servidor.
// =============================================================================

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL  = process.env['SUPABASE_URL']!;
const SERVICE_KEY   = process.env['SUPABASE_SERVICE_ROLE_KEY']!;
const P_CUST_ID     = process.env['EPAYCO_P_CUST_ID']!;
const PUBLIC_KEY    = process.env['EPAYCO_PUBLIC_KEY']!;
const APP_URL       = process.env['APP_URL'] ?? 'https://www.publihazclick.com';

const MIN_AMOUNT = 5_000;
const MAX_AMOUNT = 500_000;

export default async function handler(req: any, res: any) {
  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Método no permitido' });
    }

    // ── 1. Verificar JWT ────────────────────────────────────────────────────
    const authHeader: string = req.headers['authorization'] ?? '';
    if (!authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No autorizado' });
    }
    const token = authHeader.slice(7);

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) {
      return res.status(401).json({ error: 'Token inválido o expirado' });
    }

    // ── 2. Validar monto ────────────────────────────────────────────────────
    const body = req.body ?? {};
    const amt = Number(body.amount ?? 0);

    if (!amt || amt < MIN_AMOUNT) {
      return res.status(400).json({ error: `Monto mínimo: $${MIN_AMOUNT.toLocaleString('es-CO')} COP` });
    }
    if (amt > MAX_AMOUNT) {
      return res.status(400).json({ error: `Monto máximo: $${MAX_AMOUNT.toLocaleString('es-CO')} COP` });
    }

    // ── 3. Buscar perfil del conductor ──────────────────────────────────────
    const { data: agUserInitial } = await supabase
      .from('ag_users')
      .select('id, role, full_name, phone, email')
      .eq('auth_user_id', user.id)
      .maybeSingle();
    let agUser: any = agUserInitial;

    // Fallback por teléfono (conductor registrado con sesión anónima)
    if (!agUser) {
      const phoneFromMeta: string = (user.user_metadata?.['phone'] as string) ?? '';
      const emailPhone = user.email?.match(/^ag_(\d+)@movi-driver\.app$/)?.[1];
      const lookupPhone = phoneFromMeta || (emailPhone ? `+${emailPhone}` : '');
      if (lookupPhone) {
        const { data: byPhone } = await supabase
          .from('ag_users')
          .select('id, role, full_name, phone, email')
          .eq('phone', lookupPhone)
          .maybeSingle();
        if (byPhone) {
          agUser = byPhone;
          await supabase.from('ag_users').update({ auth_user_id: user.id }).eq('id', byPhone.id);
        }
      }
    }

    if (!agUser) {
      return res.status(404).json({ error: 'Perfil no encontrado en Movi' });
    }
    if (agUser.role !== 'driver') {
      return res.status(403).json({ error: 'Solo los conductores pueden recargar el wallet' });
    }

    const { data: driver } = await supabase
      .from('ag_drivers')
      .select('id')
      .eq('ag_user_id', agUser.id)
      .maybeSingle();

    if (!driver) {
      return res.status(404).json({ error: 'Registro de conductor no encontrado' });
    }

    // ── 4. Crear registro de pago pendiente ─────────────────────────────────
    const invoice = `AG-${Date.now()}-${driver.id.substring(0, 8).toUpperCase()}`;

    const { data: payment, error: insertErr } = await supabase
      .from('ag_wallet_payments')
      .insert({ driver_id: driver.id, amount: amt, status: 'pending', invoice })
      .select('id')
      .single();

    if (insertErr || !payment) {
      console.error('[topup] Error insertando ag_wallet_payments:', insertErr);
      return res.status(500).json({ error: 'Error al registrar el pago. Inténtalo de nuevo.' });
    }

    // ── 5. Devolver parámetros del checkout de ePayco ───────────────────────
    // El frontend carga checkout.epayco.co/checkout.js y abre el modal con estos params.
    // No se genera hash aquí — ePayco JS SDK lo maneja internamente con la public key.
    const checkoutParams = {
      // Credenciales
      publicKey: PUBLIC_KEY,
      pCustIdCliente: P_CUST_ID,
      test: false,
      // Transacción
      name: 'Recarga Wallet Movi',
      description: `Recarga de saldo - ${agUser.full_name ?? 'Conductor'}`,
      invoice,
      currency: 'COP',
      amount: String(amt),
      tax_base: '0',
      tax: '0',
      country: 'CO',
      lang: 'es',
      // Cliente
      email_billing: user.email ?? agUser.email ?? '',
      name_billing: agUser.full_name ?? '',
      mobilephone_billing: agUser.phone ?? '',
      // Extras (reenviados en el webhook)
      extra1: payment.id,    // UUID ag_wallet_payments
      extra2: driver.id,     // UUID conductor
      extra3: 'ag_wallet',   // tag para el webhook
      // URLs
      confirmation: `${APP_URL}/api/epayco/confirmation`,
      response: `${APP_URL}/anda-gana?wallet=result`,
      // Redirigir (funciona en WebView Capacitor y en navegador)
      external: 'true',
      methodConfirmation: 'POST',
    };

    return res.status(200).json({ checkoutParams, invoice, paymentId: payment.id });

  } catch (err: any) {
    console.error('[topup] Excepción no capturada:', err);
    return res.status(500).json({ error: err?.message ?? 'Error interno del servidor' });
  }
}
