// =============================================================================
// Edge Function: send-promo-email
// Envía email promocional a todos los usuarios sin paquete activo.
// Solo puede ser invocada por admin o dev.
// Body opcional: { preview_to: "email@test.com" } para probar con un solo destinatario.
// =============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL         = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const RESEND_API_KEY       = Deno.env.get('RESEND_API_KEY')!;
const RESEND_FROM          = Deno.env.get('RESEND_FROM') ?? 'Publihazclick <noreply@publihazclick.com>';
const APP_URL              = Deno.env.get('APP_URL') ?? 'https://publihazclick.vercel.app';

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

function decodeJwtPayload(token: string): { sub: string } {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Invalid JWT');
  const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
  return JSON.parse(atob(b64));
}

// ─────────────────────────────────────────────────────────────────────────────
// HTML del email promocional
// ─────────────────────────────────────────────────────────────────────────────
function buildEmailHtml(username: string, packagesUrl: string): string {
  const name = username || 'Amigo';
  return `<!DOCTYPE html>
<html lang="es" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <meta http-equiv="Content-Type" content="text/html; charset=utf-8">
  <title>¡Tu dinero te está esperando en Publihazclick!</title>
</head>
<body style="margin:0;padding:0;background-color:#050505;font-family:Arial,Helvetica,sans-serif;-webkit-font-smoothing:antialiased;mso-line-height-rule:exactly;">

<table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#050505">
<tr><td align="center" style="padding:40px 16px;">

  <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;">

    <!-- ── LOGO ───────────────────────────────────────────────────── -->
    <tr>
      <td align="center" style="padding-bottom:28px;">
        <img src="https://www.publihazclick.com/logo.webp" alt="Publihazclick" height="52"
             style="display:block;height:52px;width:auto;border:0;">
      </td>
    </tr>

    <!-- ── HERO ───────────────────────────────────────────────────── -->
    <tr>
      <td bgcolor="#0a0a0a" style="border-radius:20px;border:1px solid #00E5FF22;padding:0;overflow:hidden;">

        <!-- Franja superior cyan -->
        <table width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td bgcolor="#00E5FF" style="height:4px;font-size:1px;line-height:1px;">&nbsp;</td>
          </tr>
        </table>

        <table width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td align="center" style="padding:44px 36px 40px;">

              <!-- Badge -->
              <table cellpadding="0" cellspacing="0" border="0" align="center" style="margin-bottom:24px;">
                <tr>
                  <td bgcolor="#00E5FF15" style="border-radius:100px;border:1px solid #00E5FF40;padding:6px 20px;">
                    <span style="color:#00E5FF;font-size:10px;font-weight:700;letter-spacing:2.5px;text-transform:uppercase;">✦ OPORTUNIDAD EXCLUSIVA ✦</span>
                  </td>
                </tr>
              </table>

              <!-- Headline -->
              <h1 style="margin:0 0 18px 0;font-size:34px;font-weight:900;line-height:1.15;color:#ffffff;letter-spacing:-0.5px;">
                Tu dinero te está<br>
                <span style="color:#00E5FF;">esperando,</span> ${name}
              </h1>

              <!-- Sub -->
              <p style="margin:0 0 32px 0;font-size:16px;color:#94a3b8;line-height:1.7;max-width:460px;display:block;">
                Miles de personas ya generan ingresos reales desde casa con Publihazclick.
                Solo necesitas <strong style="color:#ffffff;">un paquete básico</strong> para empezar a ganar hoy.
              </p>

              <!-- CTA principal -->
              <table cellpadding="0" cellspacing="0" border="0" align="center">
                <tr>
                  <td bgcolor="#00E5FF" style="border-radius:14px;">
                    <a href="${packagesUrl}" target="_blank"
                       style="display:inline-block;padding:17px 48px;color:#000000;text-decoration:none;font-size:15px;font-weight:900;letter-spacing:0.5px;text-transform:uppercase;">
                      🚀 Adquirir Paquete Básico
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin:18px 0 0 0;font-size:12px;color:#334155;">
                Desde <strong style="color:#ffffff;">$16 USD</strong> · Plan de 30 días · Sin renovación forzada
              </p>

            </td>
          </tr>
        </table>
      </td>
    </tr>

    <!-- Spacer -->
    <tr><td style="height:20px;"></td></tr>

    <!-- ── QUÉ INCLUYE ─────────────────────────────────────────────── -->
    <tr>
      <td>
        <p style="margin:0 0 14px 0;font-size:10px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:2.5px;text-align:center;">
          ¿Qué incluye el paquete básico?
        </p>
        <table width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr valign="top">
            <!-- Card 1 -->
            <td width="33%" style="padding:0 5px;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#0a0a0a"
                     style="border-radius:16px;border:1px solid #00E5FF18;">
                <tr>
                  <td align="center" style="padding:22px 12px;">
                    <p style="margin:0 0 6px 0;font-size:26px;">🖱️</p>
                    <p style="margin:0 0 4px 0;font-size:26px;font-weight:900;color:#00E5FF;line-height:1;">9</p>
                    <p style="margin:0;font-size:9px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:1.5px;line-height:1.4;">
                      Clicks<br>por día
                    </p>
                  </td>
                </tr>
              </table>
            </td>
            <!-- Card 2 -->
            <td width="33%" style="padding:0 5px;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#0a0a0a"
                     style="border-radius:16px;border:1px solid #00E5FF18;">
                <tr>
                  <td align="center" style="padding:22px 12px;">
                    <p style="margin:0 0 6px 0;font-size:26px;">👥</p>
                    <p style="margin:0 0 4px 0;font-size:26px;font-weight:900;color:#00E5FF;line-height:1;">∞</p>
                    <p style="margin:0;font-size:9px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:1.5px;line-height:1.4;">
                      Referidos<br>sin límite
                    </p>
                  </td>
                </tr>
              </table>
            </td>
            <!-- Card 3 -->
            <td width="33%" style="padding:0 5px;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#0a0a0a"
                     style="border-radius:16px;border:1px solid #00E5FF18;">
                <tr>
                  <td align="center" style="padding:22px 12px;">
                    <p style="margin:0 0 6px 0;font-size:26px;">📈</p>
                    <p style="margin:0 0 4px 0;font-size:26px;font-weight:900;color:#00E5FF;line-height:1;">$70K</p>
                    <p style="margin:0;font-size:9px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:1.5px;line-height:1.4;">
                      COP/mes<br>propios
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>

    <!-- Spacer -->
    <tr><td style="height:20px;"></td></tr>

    <!-- ── GANANCIAS ───────────────────────────────────────────────── -->
    <tr>
      <td bgcolor="#0a0a0a" style="border-radius:20px;border:1px solid #ffffff0d;padding:32px 32px 28px;">

        <p style="margin:0 0 22px 0;font-size:17px;font-weight:900;color:#ffffff;">
          💰 ¿Cuánto puedo ganar?
        </p>

        <!-- Fila -->
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:14px;">
          <tr>
            <td style="font-size:13px;color:#94a3b8;">Clicks propios diarios × 30 días</td>
            <td align="right" style="font-size:13px;font-weight:700;color:#ffffff;white-space:nowrap;">~$70.000 COP/mes</td>
          </tr>
        </table>
        <table width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr><td bgcolor="#ffffff0d" style="height:1px;font-size:1px;line-height:1px;">&nbsp;</td></tr>
        </table>

        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:14px 0;">
          <tr>
            <td style="font-size:13px;color:#94a3b8;">Con 3-5 referidos activos</td>
            <td align="right" style="font-size:13px;font-weight:700;color:#00E5FF;white-space:nowrap;">+$208.000 COP/mes</td>
          </tr>
        </table>
        <table width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr><td bgcolor="#ffffff0d" style="height:1px;font-size:1px;line-height:1px;">&nbsp;</td></tr>
        </table>

        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:14px 0;">
          <tr>
            <td style="font-size:13px;color:#94a3b8;">Con 10-19 referidos activos</td>
            <td align="right" style="font-size:13px;font-weight:700;color:#00E5FF;white-space:nowrap;">+$890.000 COP/mes</td>
          </tr>
        </table>
        <table width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr><td bgcolor="#ffffff0d" style="height:1px;font-size:1px;line-height:1px;">&nbsp;</td></tr>
        </table>

        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:14px 0 0 0;">
          <tr>
            <td style="font-size:13px;color:#94a3b8;">Con 45+ referidos activos</td>
            <td align="right" style="font-size:13px;font-weight:700;color:#00E5FF;white-space:nowrap;">$4.000.000+ COP/mes</td>
          </tr>
        </table>

        <!-- Highlight total -->
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:20px;">
          <tr>
            <td bgcolor="#00E5FF0d" style="border-radius:12px;border:1px solid #00E5FF22;padding:16px 20px;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td>
                    <p style="margin:0 0 2px 0;font-size:10px;font-weight:700;color:#00E5FF;text-transform:uppercase;letter-spacing:1.5px;">Potencial máximo</p>
                    <p style="margin:0;font-size:12px;color:#64748b;">Nivel DIAMANTE CORONA · 45+ referidos</p>
                  </td>
                  <td align="right" style="white-space:nowrap;">
                    <p style="margin:0;font-size:22px;font-weight:900;color:#ffffff;">$4.005.000</p>
                    <p style="margin:0;font-size:10px;color:#475569;">COP / mes</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>

      </td>
    </tr>

    <!-- Spacer -->
    <tr><td style="height:20px;"></td></tr>

    <!-- ── CÓMO FUNCIONA ────────────────────────────────────────────── -->
    <tr>
      <td>
        <p style="margin:0 0 14px 0;font-size:10px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:2.5px;text-align:center;">
          Así de simple funciona
        </p>
        <table width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr valign="top">
            <!-- Paso 1 -->
            <td width="33%" style="padding:0 5px;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#0a0a0a"
                     style="border-radius:16px;border:1px solid #ffffff0d;padding:0;">
                <tr>
                  <td align="center" style="padding:20px 14px;">
                    <table cellpadding="0" cellspacing="0" border="0" align="center" style="margin-bottom:10px;">
                      <tr>
                        <td bgcolor="#00E5FF" style="border-radius:50%;width:32px;height:32px;text-align:center;vertical-align:middle;">
                          <span style="color:#000000;font-size:14px;font-weight:900;">1</span>
                        </td>
                      </tr>
                    </table>
                    <p style="margin:0 0 4px 0;font-size:12px;font-weight:700;color:#ffffff;">Adquiere</p>
                    <p style="margin:0;font-size:11px;color:#475569;line-height:1.4;">Compra tu paquete básico</p>
                  </td>
                </tr>
              </table>
            </td>
            <!-- Paso 2 -->
            <td width="33%" style="padding:0 5px;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#0a0a0a"
                     style="border-radius:16px;border:1px solid #ffffff0d;">
                <tr>
                  <td align="center" style="padding:20px 14px;">
                    <table cellpadding="0" cellspacing="0" border="0" align="center" style="margin-bottom:10px;">
                      <tr>
                        <td bgcolor="#00E5FF" style="border-radius:50%;width:32px;height:32px;text-align:center;vertical-align:middle;">
                          <span style="color:#000000;font-size:14px;font-weight:900;">2</span>
                        </td>
                      </tr>
                    </table>
                    <p style="margin:0 0 4px 0;font-size:12px;font-weight:700;color:#ffffff;">Ve anuncios</p>
                    <p style="margin:0;font-size:11px;color:#475569;line-height:1.4;">9 clicks diarios = ganancias</p>
                  </td>
                </tr>
              </table>
            </td>
            <!-- Paso 3 -->
            <td width="33%" style="padding:0 5px;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#0a0a0a"
                     style="border-radius:16px;border:1px solid #ffffff0d;">
                <tr>
                  <td align="center" style="padding:20px 14px;">
                    <table cellpadding="0" cellspacing="0" border="0" align="center" style="margin-bottom:10px;">
                      <tr>
                        <td bgcolor="#FF007F" style="border-radius:50%;width:32px;height:32px;text-align:center;vertical-align:middle;">
                          <span style="color:#ffffff;font-size:14px;font-weight:900;">3</span>
                        </td>
                      </tr>
                    </table>
                    <p style="margin:0 0 4px 0;font-size:12px;font-weight:700;color:#ffffff;">Invita</p>
                    <p style="margin:0;font-size:11px;color:#475569;line-height:1.4;">Multiplica con tu red</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>

    <!-- Spacer -->
    <tr><td style="height:20px;"></td></tr>

    <!-- ── CTA FINAL ───────────────────────────────────────────────── -->
    <tr>
      <td bgcolor="#0a0a0a" style="border-radius:20px;border:1px solid #FF007F22;padding:0;overflow:hidden;">

        <!-- Franja magenta -->
        <table width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td bgcolor="#FF007F" style="height:4px;font-size:1px;line-height:1px;">&nbsp;</td>
          </tr>
        </table>

        <table width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td align="center" style="padding:36px 32px 40px;">
              <p style="margin:0 0 6px 0;font-size:24px;font-weight:900;color:#ffffff;">
                ¿Listo para empezar hoy?
              </p>
              <p style="margin:0 0 26px 0;font-size:14px;color:#64748b;line-height:1.6;">
                Un solo pago activa 30 días de ganancias diarias.<br>
                Sin compromisos. Sin renovaciones automáticas.
              </p>
              <table cellpadding="0" cellspacing="0" border="0" align="center">
                <tr>
                  <td bgcolor="#FF007F" style="border-radius:14px;">
                    <a href="${packagesUrl}" target="_blank"
                       style="display:inline-block;padding:17px 52px;color:#ffffff;text-decoration:none;font-size:15px;font-weight:900;letter-spacing:0.5px;text-transform:uppercase;">
                      Comprar ahora →
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin:18px 0 0 0;font-size:12px;color:#334155;">
                ¿Tienes dudas? Escríbenos por WhatsApp
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>

    <!-- Spacer -->
    <tr><td style="height:32px;"></td></tr>

    <!-- ── FOOTER ──────────────────────────────────────────────────── -->
    <tr>
      <td align="center" style="border-top:1px solid #ffffff08;padding-top:28px;">
        <img src="https://www.publihazclick.com/logo.webp" alt="Publihazclick" height="36"
             style="display:block;height:36px;width:auto;margin:0 auto 14px;border:0;">
        <p style="margin:0 0 6px 0;font-size:12px;color:#334155;font-weight:600;">
          Publihazclick — La plataforma PTC que sí paga
        </p>
        <p style="margin:0 0 6px 0;font-size:11px;color:#1e293b;line-height:1.5;">
          Recibiste este correo porque estás registrado en Publihazclick.<br>
          Si no deseas recibir más correos, ingresa a tu cuenta y actualiza tus preferencias.
        </p>
        <p style="margin:0;font-size:11px;color:#1e293b;">
          © 2025 Publihazclick. Todos los derechos reservados.
        </p>
      </td>
    </tr>

    <tr><td style="height:40px;"></td></tr>

  </table>
</td></tr>
</table>

</body>
</html>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Handler principal — siempre retorna 200; los errores van en el body
// ─────────────────────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    // ── 1. Auth ──────────────────────────────────────────────────────────────
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return json({ success: false, error: 'No autorizado: falta token' });
    }

    const token = authHeader.replace('Bearer ', '');
    let callerId: string;
    try {
      const payload = decodeJwtPayload(token);
      callerId = payload.sub;
    } catch {
      return json({ success: false, error: 'Token inválido' });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // ── 2. Verificar rol admin ────────────────────────────────────────────────
    const { data: caller, error: callerErr } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', callerId)
      .maybeSingle();

    if (callerErr) {
      console.error('Error al leer perfil del caller:', callerErr);
      return json({ success: false, error: `Error al verificar rol: ${callerErr.message}` });
    }

    if (!caller || !['admin', 'dev'].includes(caller.role)) {
      return json({ success: false, error: `Acceso denegado. Rol actual: ${caller?.role ?? 'no encontrado'}` });
    }

    // ── 3. Body opcional ─────────────────────────────────────────────────────
    const body = await req.json().catch(() => ({}));
    const previewTo: string | null = body?.preview_to ?? null;

    // ── 4. Obtener destinatarios ─────────────────────────────────────────────
    let recipients: { email: string; username: string | null }[] = [];

    if (previewTo) {
      recipients = [{ email: previewTo, username: 'Amigo' }];
    } else {
      const { data: users, error: usersError } = await supabase
        .from('profiles')
        .select('email, username')
        .eq('has_active_package', false)
        .not('email', 'is', null)
        .not('email', 'eq', '');

      if (usersError) {
        console.error('Error al obtener usuarios:', usersError);
        return json({ success: false, error: `Error al obtener usuarios: ${usersError.message}` });
      }
      recipients = (users ?? []) as { email: string; username: string | null }[];
    }

    if (!recipients.length) {
      return json({ success: true, sent: 0, errors: 0, total: 0, message: 'No hay usuarios sin paquete activo' });
    }

    // ── 5. Enviar en lotes de 100 (límite de Resend batch) ───────────────────
    const BATCH_SIZE = 100;
    const packagesUrl = `${APP_URL}/dashboard/packages`;
    let sent = 0;
    let errors = 0;
    const errorDetails: string[] = [];

    for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
      const batch = recipients.slice(i, i + BATCH_SIZE);

      const emails = batch.map(u => ({
        from:    RESEND_FROM,
        to:      [u.email],
        subject: '🚀 Tu dinero te está esperando en Publihazclick',
        html:    buildEmailHtml(u.username ?? 'Amigo', packagesUrl),
      }));

      const res = await fetch('https://api.resend.com/emails/batch', {
        method:  'POST',
        headers: {
          'Authorization': `Bearer ${RESEND_API_KEY}`,
          'Content-Type':  'application/json',
        },
        body: JSON.stringify(emails),
      });

      if (res.ok) {
        sent += batch.length;
      } else {
        const errBody = await res.json().catch(() => ({}));
        const errMsg = `HTTP ${res.status}: ${JSON.stringify(errBody)}`;
        console.error('Resend batch error:', errMsg);
        errorDetails.push(errMsg);
        errors += batch.length;
      }
    }

    return json({
      success: errors === 0,
      sent,
      errors,
      total: recipients.length,
      preview: !!previewTo,
      ...(errorDetails.length ? { error_details: errorDetails } : {}),
    });

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('Error inesperado:', msg);
    return json({ success: false, error: `Error interno: ${msg}` });
  }
});
