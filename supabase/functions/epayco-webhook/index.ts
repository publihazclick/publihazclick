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
const RESEND_API_KEY       = Deno.env.get('RESEND_API_KEY') ?? '';
const RESEND_FROM          = Deno.env.get('RESEND_FROM') ?? 'Publihazclick <noreply@publihazclick.com>';
const APP_URL              = Deno.env.get('APP_URL') ?? 'https://publihazclick.com';

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

// ── Email: confirmación de compra de curso ────────────────────────────────
function buildCourseConfirmationHtml(params: {
  buyerName: string;
  courseTitle: string;
  courseUrl: string;
  creatorName: string;
  amountCOP: number;
  thumbnailUrl?: string;
}): string {
  const { buyerName, courseTitle, courseUrl, creatorName, amountCOP, thumbnailUrl } = params;
  const price = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(amountCOP);
  const thumb = thumbnailUrl
    ? `<img src="${thumbnailUrl}" alt="${courseTitle}" width="560" style="width:100%;max-width:560px;height:auto;display:block;border-radius:12px 12px 0 0;object-fit:cover;max-height:200px;">`
    : `<div style="width:100%;height:120px;background:#0f172a;display:flex;align-items:center;justify-content:center;border-radius:12px 12px 0 0;font-size:40px;">📚</div>`;

  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>¡Acceso a tu curso activado!</title></head>
<body style="margin:0;padding:0;background:#050505;font-family:Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#050505">
<tr><td align="center" style="padding:40px 16px;">
<table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;">

  <!-- LOGO -->
  <tr><td align="center" style="padding-bottom:28px;">
    <img src="https://www.publihazclick.com/logo.webp" alt="PubliHazClick" height="48" style="display:block;height:48px;width:auto;border:0;">
  </td></tr>

  <!-- HERO CARD -->
  <tr><td bgcolor="#0a0a0a" style="border-radius:20px;border:1px solid #0ea5e920;overflow:hidden;padding:0;">
    <table width="100%" cellpadding="0" cellspacing="0" border="0">
      <!-- Franja cyan -->
      <tr><td bgcolor="#0ea5e9" style="height:4px;font-size:1px;line-height:1px;">&nbsp;</td></tr>
      <!-- Thumbnail -->
      <tr><td style="padding:0;">${thumb}</td></tr>
      <!-- Content -->
      <tr><td style="padding:32px 36px 36px;">
        <!-- Badge -->
        <table cellpadding="0" cellspacing="0" border="0" style="margin-bottom:20px;">
          <tr><td bgcolor="#0ea5e915" style="border-radius:100px;border:1px solid #0ea5e940;padding:5px 16px;">
            <span style="color:#38bdf8;font-size:10px;font-weight:700;letter-spacing:2px;text-transform:uppercase;">✦ ACCESO ACTIVADO ✦</span>
          </td></tr>
        </table>
        <!-- Title -->
        <h1 style="margin:0 0 12px;font-size:28px;font-weight:900;color:#fff;line-height:1.2;">
          ¡Felicitaciones, <span style="color:#38bdf8;">${buyerName}</span>!
        </h1>
        <p style="margin:0 0 20px;font-size:15px;color:#94a3b8;line-height:1.7;">
          Tu compra fue procesada exitosamente. Ya tienes acceso completo al curso:
        </p>
        <!-- Course box -->
        <table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#111827" style="border-radius:12px;border:1px solid #0ea5e920;margin-bottom:24px;">
          <tr><td style="padding:20px 24px;">
            <p style="margin:0 0 4px;font-size:11px;color:#475569;font-weight:700;text-transform:uppercase;letter-spacing:1px;">Curso adquirido</p>
            <p style="margin:0 0 8px;font-size:18px;font-weight:900;color:#fff;">${courseTitle}</p>
            <p style="margin:0 0 12px;font-size:13px;color:#64748b;">por <strong style="color:#94a3b8;">${creatorName}</strong></p>
            <table cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td bgcolor="#0ea5e915" style="border-radius:8px;border:1px solid #0ea5e930;padding:4px 14px;">
                  <span style="color:#38bdf8;font-size:13px;font-weight:700;">${price}</span>
                </td>
              </tr>
            </table>
          </td></tr>
        </table>
        <!-- CTA Button -->
        <table cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;">
          <tr><td bgcolor="#0ea5e9" style="border-radius:14px;">
            <a href="${courseUrl}" target="_blank"
               style="display:inline-block;padding:16px 48px;color:#fff;text-decoration:none;font-size:15px;font-weight:900;letter-spacing:0.5px;">
              Comenzar el curso →
            </a>
          </td></tr>
        </table>
        <p style="margin:16px 0 0;font-size:12px;color:#334155;text-align:center;">
          O copia este enlace: <a href="${courseUrl}" style="color:#38bdf8;">${courseUrl}</a>
        </p>
      </td></tr>
    </table>
  </td></tr>

  <tr><td style="height:20px;"></td></tr>

  <!-- INFO BOXES -->
  <tr><td>
    <table width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td width="49%" bgcolor="#0a0a0a" style="border-radius:12px;border:1px solid #1e293b;padding:18px 20px;vertical-align:top;">
          <p style="margin:0 0 6px;font-size:22px;">🔑</p>
          <p style="margin:0 0 4px;font-size:13px;font-weight:700;color:#fff;">Acceso permanente</p>
          <p style="margin:0;font-size:12px;color:#475569;line-height:1.5;">Puedes ver el curso las veces que quieras, sin límite de tiempo.</p>
        </td>
        <td width="2%"></td>
        <td width="49%" bgcolor="#0a0a0a" style="border-radius:12px;border:1px solid #1e293b;padding:18px 20px;vertical-align:top;">
          <p style="margin:0 0 6px;font-size:22px;">📱</p>
          <p style="margin:0 0 4px;font-size:13px;font-weight:700;color:#fff;">Cualquier dispositivo</p>
          <p style="margin:0;font-size:12px;color:#475569;line-height:1.5;">Accede desde tu celular, tablet o computador cuando quieras.</p>
        </td>
      </tr>
    </table>
  </td></tr>

  <tr><td style="height:32px;"></td></tr>

  <!-- FOOTER -->
  <tr><td align="center" style="border-top:1px solid #ffffff08;padding-top:24px;">
    <img src="https://www.publihazclick.com/logo.webp" alt="PubliHazClick" height="32" style="display:block;height:32px;width:auto;margin:0 auto 12px;border:0;">
    <p style="margin:0 0 4px;font-size:11px;color:#334155;">© 2026 PubliHazClick</p>
    <p style="margin:0;font-size:11px;color:#1e293b;line-height:1.5;">
      Recibiste este correo porque realizaste una compra en PubliHazClick.<br>
      ¿Tienes dudas? Escríbenos a publihazcick.com@gmail.com
    </p>
  </td></tr>
  <tr><td style="height:40px;"></td></tr>

</table>
</td></tr></table>
</body></html>`;
}

// ── Email: activación XZOOM EN VIVO para visitante que pagó sin cuenta ─────
function buildXzoomActivationHtml(params: {
  guestName: string;
  hostName: string;
  activationUrl: string;
  amountCOP: number;
}): string {
  const { guestName, hostName, activationUrl, amountCOP } = params;
  const price = new Intl.NumberFormat('es-CO', {
    style: 'currency', currency: 'COP', minimumFractionDigits: 0,
  }).format(amountCOP);

  return `<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8"><title>Activa tu cuenta XZOOM EN VIVO</title></head>
<body style="margin:0;padding:0;background:#050505;font-family:Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" bgcolor="#050505"><tr><td align="center" style="padding:40px 16px;">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
  <tr><td align="center" style="padding-bottom:28px;">
    <img src="https://www.publihazclick.com/logo.webp" alt="PubliHazClick" height="48" style="display:block;height:48px;width:auto;border:0;">
  </td></tr>
  <tr><td bgcolor="#0a0a0a" style="border-radius:20px;border:1px solid #ff3b3030;overflow:hidden;">
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr><td bgcolor="#ff3b30" style="height:4px;font-size:1px;line-height:1px;">&nbsp;</td></tr>
      <tr><td style="padding:40px 36px 36px;">
        <table cellpadding="0" cellspacing="0" style="margin-bottom:22px;">
          <tr><td bgcolor="#ff3b3015" style="border-radius:100px;border:1px solid #ff3b3040;padding:6px 18px;">
            <span style="color:#ff6b6b;font-size:10px;font-weight:700;letter-spacing:2px;text-transform:uppercase;">✦ PAGO CONFIRMADO ✦</span>
          </td></tr>
        </table>
        <h1 style="color:#fff;font-size:26px;font-weight:900;margin:0 0 14px;line-height:1.2;">
          ¡Bienvenido a XZOOM EN VIVO, ${guestName}!
        </h1>
        <p style="color:#a1a1aa;font-size:15px;line-height:1.65;margin:0 0 18px;">
          Tu suscripción mensual a <strong style="color:#ff6b6b;">${hostName}</strong> fue activada correctamente.
        </p>
        <p style="color:#a1a1aa;font-size:14px;line-height:1.65;margin:0 0 28px;">
          Creamos una cuenta para ti con este correo. Solo falta un paso: hacé clic en el botón de abajo para definir tu contraseña y entrar a la sala en vivo.
        </p>
        <table cellpadding="0" cellspacing="0" style="margin:0 0 28px;"><tr><td bgcolor="#ff3b30" style="border-radius:100px;">
          <a href="${activationUrl}" style="display:inline-block;padding:16px 34px;color:#fff;font-size:14px;font-weight:800;letter-spacing:0.5px;text-transform:uppercase;text-decoration:none;">
            Activar mi cuenta →
          </a>
        </td></tr></table>
        <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:12px;border-top:1px solid #ffffff10;padding-top:22px;">
          <tr><td style="padding:6px 0;">
            <span style="color:#71717a;font-size:12px;">Anfitrión:</span>
            <strong style="color:#fff;font-size:13px;margin-left:8px;">${hostName}</strong>
          </td></tr>
          <tr><td style="padding:6px 0;">
            <span style="color:#71717a;font-size:12px;">Pagaste:</span>
            <strong style="color:#ff6b6b;font-size:13px;margin-left:8px;">${price} / mes</strong>
          </td></tr>
        </table>
        <p style="color:#52525b;font-size:11px;line-height:1.55;margin:26px 0 0;">
          Si el botón no funciona, copia y pega este enlace en tu navegador:<br>
          <span style="color:#71717a;word-break:break-all;">${activationUrl}</span>
        </p>
      </td></tr>
    </table>
  </td></tr>
  <tr><td align="center" style="padding:28px 0 0;color:#52525b;font-size:11px;">
    © 2026 PubliHazClick · XZOOM EN VIVO
  </td></tr>
</table>
</td></tr></table>
</body></html>`;
}

// Genera link de recovery + crea auth user si no existe (para suscripciones guest)
async function activateGuestSubscription(
  supabase: any,
  subscriptionId: string,
): Promise<{ ok: boolean; reason?: string }> {
  const { data: sub } = await supabase
    .from('xzoom_viewer_subscriptions')
    .select('id, viewer_user_id, guest_email, guest_full_name, host_id, price_cop, activation_sent_at')
    .eq('id', subscriptionId)
    .maybeSingle();

  if (!sub) return { ok: false, reason: 'subscription_not_found' };
  if (sub.viewer_user_id) return { ok: true, reason: 'already_linked' };
  if (!sub.guest_email) return { ok: false, reason: 'not_a_guest' };
  if (sub.activation_sent_at) return { ok: true, reason: 'already_sent' };

  const email    = (sub.guest_email as string).toLowerCase();
  const fullName = (sub.guest_full_name as string | null) ?? 'Suscriptor';

  // Buscar host para el email
  const { data: host } = await supabase
    .from('xzoom_hosts')
    .select('display_name, slug')
    .eq('id', sub.host_id)
    .maybeSingle();
  const hostName = host?.display_name ?? 'el anfitrión';
  const hostSlug = host?.slug ?? '';

  // 1. Buscar si el usuario ya existe en auth.users
  let userId: string | null = null;
  try {
    const { data: existing } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1, email });
    if (existing?.users?.length) userId = existing.users[0].id;
  } catch (e) {
    console.warn('[xzoom guest] listUsers falló, intentando crear:', e);
  }

  // 2. Si no existe, crearlo
  if (!userId) {
    try {
      const { data: created, error: createErr } = await supabase.auth.admin.createUser({
        email,
        email_confirm: true,
        user_metadata: { full_name: fullName, source: 'xzoom_guest_subscription' },
      });
      if (createErr) {
        // Puede ser duplicado (race): intentar leer de nuevo
        console.warn('[xzoom guest] createUser err:', createErr.message);
        const { data: retry } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1, email });
        if (retry?.users?.length) userId = retry.users[0].id;
      } else {
        userId = created?.user?.id ?? null;
      }
    } catch (e) {
      console.error('[xzoom guest] Excepción creando auth user:', e);
    }
  }

  if (!userId) {
    return { ok: false, reason: 'create_user_failed' };
  }

  // 3. Generar link de recovery (para que setee su clave)
  let activationUrl = `${APP_URL}/xzoom`;
  try {
    const { data: linkData, error: linkErr } = await supabase.auth.admin.generateLink({
      type: 'recovery',
      email,
      options: {
        redirectTo: hostSlug
          ? `${APP_URL}/xzoom/h/${hostSlug}`
          : `${APP_URL}/xzoom`,
      },
    });
    if (linkErr) {
      console.error('[xzoom guest] generateLink recovery err:', linkErr.message);
    }
    const actionLink = (linkData as any)?.properties?.action_link ?? (linkData as any)?.action_link;
    if (actionLink) activationUrl = actionLink;
  } catch (e) {
    console.error('[xzoom guest] Excepción generateLink:', e);
  }

  // 4. Vincular sub al nuevo user_id
  try {
    await supabase.rpc('xzoom_link_guest_subscription', {
      p_subscription_id: subscriptionId,
      p_user_id: userId,
    });
  } catch (e) {
    console.error('[xzoom guest] link RPC err:', e);
  }

  // 5. Enviar email con Resend
  if (RESEND_API_KEY) {
    try {
      const resp = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: RESEND_FROM,
          to: [email],
          subject: `✅ Tu suscripción a ${hostName} está lista — activa tu cuenta`,
          html: buildXzoomActivationHtml({
            guestName: fullName,
            hostName,
            activationUrl,
            amountCOP: sub.price_cop,
          }),
        }),
      });
      if (!resp.ok) {
        const txt = await resp.text();
        console.error('[xzoom guest] Resend err:', resp.status, txt);
      } else {
        console.log(`[xzoom guest] Email de activación enviado a ${email}`);
      }
    } catch (e) {
      console.error('[xzoom guest] Excepción Resend:', e);
    }
  } else {
    console.warn('[xzoom guest] RESEND_API_KEY no configurado; no se envió email');
  }

  return { ok: true };
}

// SHA256 como hex
async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// Parsear parámetros desde GET (query string) o POST (body JSON o form-urlencoded)
// ePayco usa GET para la "Response URL" y POST para la "Confirmation URL".
// Aceptamos ambos para que cualquier configuración en el panel de ePayco funcione.
async function parseParams(req: Request): Promise<Record<string, string>> {
  const url = new URL(req.url);
  const params: Record<string, string> = {};

  // Query params (GET y como fallback en POST)
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
        // application/x-www-form-urlencoded
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
    // ── 1. Parsear parámetros enviados por ePayco (GET o POST) ───────────────
    const p = await parseParams(req);
    console.log(`ePayco webhook ${req.method} params:`, JSON.stringify(p));

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

    // ── 4A-2. Si es recarga de billetera IA ─────────────────────────────────
    if (x_extra3 === 'ai_wallet' && x_extra1) {
      const { error: approveErr } = await supabase.rpc('ai_approve_wallet_payment', {
        p_payment_id: x_extra1,
      });
      if (approveErr) {
        console.error('Error aprobando recarga de billetera IA:', approveErr);
        return fail('AI Wallet approval failed', 500);
      }
      await supabase.from('ai_wallet_payments')
        .update({ epayco_ref: x_ref_payco })
        .eq('id', x_extra1);

      // ── Comisión por referido: Herramientas IA ──
      try {
        const { data: aiPay } = await supabase.from('ai_wallet_payments')
          .select('user_id, amount').eq('id', x_extra1).single();
        if (aiPay) {
          const res = await supabase.rpc('credit_referral_commission', {
            p_referred_id: aiPay.user_id,
            p_module: 'herramientas_ia',
            p_source_amount: aiPay.amount,
            p_source_id: x_extra1,
            p_description: 'Comisión por recarga Herramientas IA de invitado',
          });
          console.log('Comisión IA referido:', JSON.stringify(res.data));
        }
      } catch (e) { console.error('Error comisión IA referido:', e); }

      console.log(`Recarga billetera IA aprobada — payment: ${x_extra1}, ref: ${x_ref_payco}`);
      return ok('ai_wallet_approved');
    }

    // ── 4A-3. Si es recarga de billetera SMS ──────────────────────────────────
    if (x_extra3 === 'sms_wallet' && x_extra1) {
      // Actualizar pago como aprobado
      await supabase.from('sms_wallet_payments')
        .update({ status: 'approved', epayco_ref: x_ref_payco, approved_at: new Date().toISOString() })
        .eq('id', x_extra1);

      // Obtener el monto del pago (credit_amount incluye bonus por volumen)
      const { data: smsPay } = await supabase.from('sms_wallet_payments')
        .select('user_id, amount, credit_amount')
        .eq('id', x_extra1)
        .single();

      if (smsPay) {
        // Acreditar en la billetera SMS (credit_amount o amount como fallback)
        await supabase.rpc('sms_wallet_credit', {
          p_user_id: smsPay.user_id,
          p_amount: smsPay.credit_amount ?? smsPay.amount,
        });

        // ── Comisión por referido: SMS Masivos ──
        try {
          const res = await supabase.rpc('credit_referral_commission', {
            p_referred_id: smsPay.user_id,
            p_module: 'sms_masivos',
            p_source_amount: smsPay.amount,
            p_source_id: x_extra1,
            p_description: 'Comisión por recarga SMS Masivos de invitado',
          });
          console.log('Comisión SMS referido:', JSON.stringify(res.data));
        } catch (e) { console.error('Error comisión SMS referido:', e); }
      }

      console.log(`Recarga billetera SMS aprobada — payment: ${x_extra1}, ref: ${x_ref_payco}`);
      return ok('sms_wallet_approved');
    }

    // ── 4A-4. Si es suscripción WhatsApp Automatico ─────────────────────────
    if (x_extra3 === 'wa_subscription' && x_extra1) {
      const now = new Date();
      const expires = new Date(now);
      expires.setDate(expires.getDate() + 30);

      const { error: waErr } = await supabase
        .from('wa_subscriptions')
        .update({
          status: 'active',
          started_at: now.toISOString(),
          expires_at: expires.toISOString(),
          payment_reference: x_ref_payco,
        })
        .eq('id', x_extra1);

      if (waErr) {
        console.error('Error activando suscripción WA:', waErr);
        return fail('WA subscription activation failed', 500);
      }

      // ── Comisión por referido: WhatsApp Automatico ──
      try {
        const { data: waSub } = await supabase
          .from('wa_subscriptions')
          .select('user_id, price')
          .eq('id', x_extra1)
          .single();
        if (waSub) {
          const res = await supabase.rpc('credit_referral_commission', {
            p_referred_id: waSub.user_id,
            p_module: 'whatsapp_automatico',
            p_source_amount: Number(x_amount),
            p_source_id: x_extra1,
            p_description: 'Comisión por suscripción WhatsApp Automatico de invitado',
          });
          console.log('Comisión WA referido:', JSON.stringify(res.data));
        }
      } catch (e) { console.error('Error comisión WA referido:', e); }

      console.log(`Suscripción WA ${x_extra1} activada — ref: ${x_ref_payco}`);
      return ok('wa_subscription_approved');
    }

    // ── 4A-5. Si es suscripción Facebook Automatico ─────────────────────────
    if (x_extra3 === 'fb_subscription' && x_extra1) {
      const now = new Date();
      const expires = new Date(now);
      expires.setDate(expires.getDate() + 30);

      const { error: fbErr } = await supabase
        .from('fb_subscriptions')
        .update({
          status: 'active',
          started_at: now.toISOString(),
          expires_at: expires.toISOString(),
          payment_reference: x_ref_payco,
        })
        .eq('id', x_extra1);

      if (fbErr) {
        console.error('Error activando suscripción FB:', fbErr);
        return fail('FB subscription activation failed', 500);
      }

      // ── Comisión por referido: Facebook Automatico ──
      try {
        const { data: fbSub } = await supabase
          .from('fb_subscriptions').select('user_id, price').eq('id', x_extra1).single();
        if (fbSub) {
          const res = await supabase.rpc('credit_referral_commission', {
            p_referred_id: fbSub.user_id,
            p_module: 'facebook_automatico',
            p_source_amount: Number(x_amount),
            p_source_id: x_extra1,
            p_description: 'Comisión por suscripción Facebook Automatico de invitado',
          });
          console.log('Comisión FB referido:', JSON.stringify(res.data));
        }
      } catch (e) { console.error('Error comisión FB referido:', e); }

      console.log(`Suscripción FB ${x_extra1} activada — ref: ${x_ref_payco}`);
      return ok('fb_subscription_approved');
    }

    // ── 4A-6. Si es suscripción XZOOM EN VIVO (anfitrión) ───────────────────
    if (x_extra3 === 'xzoom_host_subscription' && x_extra1) {
      const now = new Date();
      const expires = new Date(now);
      expires.setDate(expires.getDate() + 30);

      const { error: xhErr } = await supabase
        .from('xzoom_host_subscriptions')
        .update({
          status: 'active',
          started_at: now.toISOString(),
          expires_at: expires.toISOString(),
          payment_reference: x_ref_payco,
        })
        .eq('id', x_extra1);

      if (xhErr) {
        console.error('Error activando suscripción XZOOM host:', xhErr);
        return fail('XZOOM host subscription activation failed', 500);
      }

      // Activar el host (is_active = TRUE) — x_extra2 trae el host_id
      if (x_extra2) {
        await supabase
          .from('xzoom_hosts')
          .update({ is_active: true })
          .eq('id', x_extra2);
      }

      console.log(`Suscripción XZOOM host ${x_extra1} activada — ref: ${x_ref_payco}`);
      return ok('xzoom_host_subscription_approved');
    }

    // ── 4A-7. Si es suscripción XZOOM EN VIVO (suscriptor a anfitrión) ──────
    if (x_extra3 === 'xzoom_viewer_subscription' && x_extra1) {
      const now = new Date();
      const expires = new Date(now);
      expires.setDate(expires.getDate() + 30);

      const { error: xvErr } = await supabase
        .from('xzoom_viewer_subscriptions')
        .update({
          status: 'active',
          started_at: now.toISOString(),
          expires_at: expires.toISOString(),
          payment_reference: x_ref_payco,
        })
        .eq('id', x_extra1);

      if (xvErr) {
        console.error('Error activando suscripción XZOOM viewer:', xvErr);
        return fail('XZOOM viewer subscription activation failed', 500);
      }

      // Si es una sub GUEST (sin viewer_user_id), crear el auth user + enviar link de activación
      try {
        const guestRes = await activateGuestSubscription(supabase, x_extra1);
        console.log('[xzoom guest activation]', JSON.stringify(guestRes));
      } catch (e) {
        console.error('[xzoom guest activation] excepción:', e);
      }

      // Acreditar ganancias al balance del anfitrión (usa host_earnings_cop ya calculado)
      try {
        const { data: creditRes, error: creditErr } = await supabase.rpc(
          'xzoom_credit_host_earnings',
          { p_subscription_id: x_extra1 },
        );
        if (creditErr) {
          console.error('Error acreditando ganancias XZOOM al anfitrión:', creditErr);
        } else {
          console.log('Ganancias XZOOM acreditadas al anfitrión:', JSON.stringify(creditRes));
        }
      } catch (e) {
        console.error('Excepción acreditando ganancias XZOOM:', e);
      }

      console.log(`Suscripción XZOOM viewer ${x_extra1} activada — ref: ${x_ref_payco}`);
      return ok('xzoom_viewer_subscription_approved');
    }

    // ── 4B. Si es compra de curso ────────────────────────────────────────────
    if (x_extra3 === 'curso_purchase' && x_extra1) {
      // Obtener datos de la compra antes de completar
      const { data: purchase } = await supabase
        .from('course_purchases')
        .select(`
          amount_cop,
          courses ( title, slug, thumbnail_url, profiles!creator_id ( username ) ),
          profiles!buyer_id ( username, email )
        `)
        .eq('id', x_extra1)
        .single();

      const { error: courseErr } = await supabase.rpc('complete_course_purchase', {
        p_purchase_id: x_extra1,
      });
      if (courseErr) {
        console.error('Error completando compra de curso:', courseErr);
        return fail('Course purchase completion failed', 500);
      }
      // Registrar la referencia de ePayco
      await supabase.from('course_purchases')
        .update({ epayco_ref: x_ref_payco })
        .eq('id', x_extra1);

      // ── Enviar email de confirmación al comprador ────────────────────────
      if (purchase && RESEND_API_KEY) {
        try {
          const course       = (purchase as any).courses;
          const buyer        = (purchase as any).profiles;
          const creator      = course?.profiles;
          const buyerEmail   = buyer?.email ?? '';
          const buyerName    = buyer?.username ?? 'Estudiante';
          const courseTitle  = course?.title ?? 'Tu curso';
          const courseSlug   = course?.slug ?? '';
          const creatorName  = creator?.username ?? 'el creador';
          const courseUrl    = `${APP_URL}/advertiser/cursos/ver/${courseSlug}`;
          const thumbnailUrl = course?.thumbnail_url ?? '';

          if (buyerEmail) {
            await fetch('https://api.resend.com/emails', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${RESEND_API_KEY}`,
                'Content-Type':  'application/json',
              },
              body: JSON.stringify({
                from:    RESEND_FROM,
                to:      [buyerEmail],
                subject: `✅ ¡Acceso activado! Tu curso "${courseTitle}" ya está listo`,
                html:    buildCourseConfirmationHtml({
                  buyerName,
                  courseTitle,
                  courseUrl,
                  creatorName,
                  amountCOP: purchase.amount_cop,
                  thumbnailUrl,
                }),
              }),
            });
            console.log(`Email de confirmación enviado a ${buyerEmail} para curso ${courseTitle}`);
          }
        } catch (emailErr) {
          // No bloquear el flujo si falla el email
          console.error('Error enviando email de confirmación de curso:', emailErr);
        }
      }

      // ── Comisión por referido: Cursos (Academia) ──
      try {
        const { data: purchaseForComm } = await supabase
          .from('course_purchases')
          .select('buyer_id, amount_cop')
          .eq('id', x_extra1)
          .single();
        if (purchaseForComm) {
          const res = await supabase.rpc('credit_referral_commission', {
            p_referred_id: purchaseForComm.buyer_id,
            p_module: 'cursos',
            p_source_amount: purchaseForComm.amount_cop,
            p_source_id: x_extra1,
            p_description: 'Comisión por compra de curso de invitado',
          });
          console.log('Comisión curso referido:', JSON.stringify(res.data));
        }
      } catch (e) { console.error('Error comisión curso referido:', e); }

      console.log(`Compra de curso ${x_extra1} completada — ref: ${x_ref_payco}`);
      return ok('curso_purchase_approved');
    }

    // ── 4C. Si es compra de tokens LiveCam Pro ──────────────────────────────
    if (x_extra3 === 'livecam_token_purchase' && x_extra1) {
      const tokensToCredit = parseInt(x_extra2 || '0', 10);
      if (tokensToCredit <= 0) {
        console.error('livecam_token_purchase: tokens inválidos:', x_extra2);
        return fail('Invalid token amount', 400);
      }

      // Update purchase status
      await supabase.from('livecam_token_purchases')
        .update({ status: 'completed' })
        .eq('id', x_extra1);

      // Get user_id from purchase
      const { data: purchase } = await supabase.from('livecam_token_purchases')
        .select('user_id')
        .eq('id', x_extra1)
        .single();

      if (purchase?.user_id) {
        // Credit tokens to user balance
        await supabase.from('livecam_profiles')
          .update({
            token_balance: supabase.rpc ? undefined : 0, // handled by raw SQL below
          })
          .eq('id', purchase.user_id);

        // Use raw update for atomic increment
        await supabase.rpc('livecam_credit_tokens', {
          p_user_id: purchase.user_id,
          p_tokens: tokensToCredit,
        });
      }

      console.log(`LiveCam token purchase ${x_extra1} completed — ${tokensToCredit} tokens credited — ref: ${x_ref_payco}`);
      return ok('livecam_token_purchase_approved');
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
    const { error: updateError } = await supabase
      .from('payments')
      .update({
        gateway_transaction_id: x_transaction_id,
        metadata: {
          x_ref_payco,
          x_transaction_id,
          x_transaction_state,
          x_amount,
          x_currency_code,
          x_approval_code: p['x_approval_code'] ?? '',
          x_bank_name: p['x_bank_name'] ?? '',
          x_payment_method: p['x_payment_method'] ?? '',
          confirmed_at: new Date().toISOString(),
        },
      })
      .eq('id', paymentId);

    if (updateError) {
      console.error('Error actualizando referencia de pago:', updateError);
      // No bloqueamos — aún intentamos aprobar
    }

    // ── 6. Aprobar pago y activar paquete (RPC SECURITY DEFINER) ────────────
    const { data: approveData, error: approveError } = await supabase.rpc('approve_payment', {
      p_payment_id: paymentId,
    });

    if (approveError) {
      console.error('Error al aprobar pago:', approveError);
      return fail('Approval failed', 500);
    }

    if (approveData === false) {
      console.warn(`approve_payment devolvió false para ${paymentId} (pago ya aprobado o no pendiente)`);
      return ok('already_processed');
    }

    console.log(`Pago ${paymentId} aprobado automáticamente vía ePayco`);
    return ok('approved');

  } catch (err) {
    console.error('Error inesperado en webhook ePayco:', err);
    return fail('Internal server error', 500);
  }
});
