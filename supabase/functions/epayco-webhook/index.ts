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
      console.log(`Recarga billetera IA aprobada — payment: ${x_extra1}, ref: ${x_ref_payco}`);
      return ok('ai_wallet_approved');
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
