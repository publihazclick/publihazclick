// =============================================================================
// POST /api/wallet/topup
// Crea el registro de pago pendiente y devuelve los campos firmados para que
// el frontend haga un form POST directo a secure.epayco.co/payment/process.
// La firma se calcula aquí con la clave privada — nunca sale del servidor.
// Este enfoque funciona en navegadores, WebView Android/iOS y Capacitor.
// =============================================================================

import { createClient } from '@supabase/supabase-js';
import { createHash } from 'crypto';

const SUPABASE_URL = process.env['SUPABASE_URL']!;
const SERVICE_KEY  = process.env['SUPABASE_SERVICE_ROLE_KEY']!;
const P_CUST_ID    = process.env['EPAYCO_P_CUST_ID']!;
const P_KEY        = process.env['EPAYCO_P_KEY']!;
const APP_URL      = process.env['APP_URL'] ?? 'https://www.publihazclick.com';

const MIN_AMOUNT = 5_000;
const MAX_AMOUNT = 500_000;

function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

export default async function handler(req: any, res: any) {
  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Método no permitido' });
    }

    // ── 1. Verificar JWT ──────────────────────────────────────────────────────
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

    // ── 2. Validar monto ──────────────────────────────────────────────────────
    const body = req.body ?? {};
    const amt = Number(body.amount ?? 0);

    if (!amt || amt < MIN_AMOUNT) {
      return res.status(400).json({ error: `Monto mínimo: $${MIN_AMOUNT.toLocaleString('es-CO')} COP` });
    }
    if (amt > MAX_AMOUNT) {
      return res.status(400).json({ error: `Monto máximo: $${MAX_AMOUNT.toLocaleString('es-CO')} COP` });
    }

    // ── 3. Buscar perfil del conductor ────────────────────────────────────────
    const { data: agUserInitial } = await supabase
      .from('ag_users')
      .select('id, role, full_name, phone, email')
      .eq('auth_user_id', user.id)
      .maybeSingle();
    let agUser: any = agUserInitial;

    // Fallback por teléfono — intenta múltiples formatos (E.164, sin código país, sin +)
    if (!agUser) {
      const phoneFromMeta: string = (user.user_metadata?.['phone'] as string) ?? '';
      const emailPhone = user.email?.match(/^ag_(\d+)@movi-driver\.app$/)?.[1];
      const base = phoneFromMeta || (emailPhone ? `+${emailPhone}` : '');

      const phonesToTry: string[] = [];
      if (base) {
        phonesToTry.push(base);
        if (base.startsWith('+')) phonesToTry.push(base.slice(1));      // sin +
        if (base.startsWith('+57') && base.length === 13) phonesToTry.push(base.slice(3)); // solo 10 dígitos
        if (base.startsWith('57') && base.length === 12) phonesToTry.push(base.slice(2));
      }

      for (const phone of phonesToTry) {
        const { data: byPhone } = await supabase
          .from('ag_users')
          .select('id, role, full_name, phone, email')
          .eq('phone', phone)
          .maybeSingle();
        if (byPhone) {
          agUser = byPhone;
          await supabase.from('ag_users').update({ auth_user_id: user.id }).eq('id', byPhone.id);
          break;
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

    // ── 4. Crear registro de pago pendiente ───────────────────────────────────
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

    // ── 5. Calcular firma para form POST a secure.epayco.co ───────────────────
    // Fórmula: SHA256(p_cust_id^p_key^invoice^amount^tax^tax_base^currency^test)
    const testRequest = 'FALSE';
    const sigStr = [P_CUST_ID, P_KEY, invoice, String(amt), '0', '0', 'COP', testRequest].join('^');
    const signature = sha256(sigStr);

    // ── 6. Devolver campos del formulario ─────────────────────────────────────
    // El frontend crea un <form> con estos campos y lo envía a formAction.
    // No se usa checkout.js — funciona en cualquier WebView/Capacitor.
    const formFields = {
      p_cust_id_cliente:  P_CUST_ID,
      p_key:              P_KEY,   // requerido por secure.epayco.co/payment/process
      p_id_invoice:       invoice,
      p_description:      `Recarga Movi - ${agUser.full_name ?? 'Conductor'}`,
      p_amount:           String(amt),
      p_tax:              '0',
      p_tax_base:         '0',
      p_currency_code:    'COP',
      p_signature:        signature,
      p_test_request:     testRequest,
      p_url_response:     `${APP_URL}/anda-gana?wallet=result`,
      p_url_confirmation: `${APP_URL}/api/epayco/confirmation`,
      p_email_comprador:  user.email ?? agUser.email ?? '',
      p_nombre_comprador: agUser.full_name ?? '',
      p_movil_comprador:  agUser.phone ?? '',
      p_extra1:           payment.id,
      p_extra2:           driver.id,
      p_extra3:           'ag_wallet',
    };

    return res.status(200).json({
      formAction: 'https://secure.epayco.co/payment/process',
      formFields,
      invoice,
      paymentId: payment.id,
    });

  } catch (err: any) {
    console.error('[topup] Excepción no capturada:', err);
    return res.status(500).json({ error: err?.message ?? 'Error interno del servidor' });
  }
}
