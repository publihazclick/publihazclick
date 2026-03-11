import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? '';
const RESEND_FROM = Deno.env.get('RESEND_FROM') ?? 'Publihazclick <noreply@publihazclick.com>';
const APP_URL = Deno.env.get('APP_URL') ?? 'https://publihazclick.vercel.app';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

function buildWelcomeHtml(name: string, packagesUrl: string): string {
  const displayName = name || 'Amigo';
  return `<!DOCTYPE html>
<html lang="es" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <meta http-equiv="Content-Type" content="text/html; charset=utf-8">
  <title>¡Excelente decisión! Bienvenido a PubliHazClick</title>
</head>
<body style="margin:0;padding:0;background-color:#050505;font-family:Arial,Helvetica,sans-serif;-webkit-font-smoothing:antialiased;mso-line-height-rule:exactly;">

<table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#050505">
<tr><td align="center" style="padding:40px 16px;">

  <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;">

    <!-- LOGO -->
    <tr>
      <td align="center" style="padding-bottom:28px;">
        <img src="https://www.publihazclick.com/logo.webp" alt="PubliHazClick" height="52"
             style="display:block;height:52px;width:auto;border:0;">
      </td>
    </tr>

    <!-- HERO -->
    <tr>
      <td bgcolor="#0a0a0a" style="border-radius:20px;border:1px solid #00E5FF22;padding:0;overflow:hidden;">

        <!-- Franja superior cyan -->
        <table width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr><td bgcolor="#00E5FF" style="height:4px;font-size:1px;line-height:1px;">&nbsp;</td></tr>
        </table>

        <table width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td align="center" style="padding:44px 36px 40px;">

              <!-- Badge -->
              <table cellpadding="0" cellspacing="0" border="0" align="center" style="margin-bottom:22px;">
                <tr>
                  <td bgcolor="#00E5FF15" style="border-radius:100px;border:1px solid #00E5FF40;padding:6px 20px;">
                    <span style="color:#00E5FF;font-size:10px;font-weight:700;letter-spacing:2.5px;text-transform:uppercase;">✦ BIENVENIDO A LA FAMILIA ✦</span>
                  </td>
                </tr>
              </table>

              <!-- Título -->
              <h1 style="margin:0 0 18px 0;font-size:34px;font-weight:900;line-height:1.15;color:#ffffff;letter-spacing:-0.5px;">
                Excelente decisión,<br>
                <span style="color:#00E5FF;">${displayName} 🚀</span>
              </h1>

              <!-- Sub -->
              <p style="margin:0;font-size:16px;color:#94a3b8;line-height:1.7;max-width:460px;">
                Te has registrado en <strong style="color:#ffffff;">PubliHazClick</strong> para
                aprender cómo generar ingresos extras desde tu celular.
                A continuación te explico todo lo que necesitas para comenzar 👇
              </p>

            </td>
          </tr>
        </table>
      </td>
    </tr>

    <tr><td style="height:20px;"></td></tr>

    <!-- SECCIÓN: 4 VIDEOS -->
    <tr>
      <td>
        <p style="margin:0 0 16px 0;font-size:10px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:2.5px;text-align:center;">
          Todo lo que necesitas saber
        </p>

        <!-- Video 1 -->
        <table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#0a0a0a"
               style="border-radius:16px;border:1px solid #00E5FF15;margin-bottom:10px;">
          <tr>
            <td style="padding:20px 24px;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr valign="middle">
                  <!-- Ícono -->
                  <td width="48" style="padding-right:16px;">
                    <table cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td bgcolor="#00E5FF15" style="border-radius:12px;width:48px;height:48px;text-align:center;vertical-align:middle;">
                          <span style="font-size:22px;line-height:48px;">🎯</span>
                        </td>
                      </tr>
                    </table>
                  </td>
                  <!-- Texto -->
                  <td>
                    <p style="margin:0 0 3px 0;font-size:13px;font-weight:700;color:#ffffff;">¿Qué es PubliHazClick?</p>
                    <p style="margin:0;font-size:12px;color:#475569;">Entiende la plataforma en minutos</p>
                  </td>
                  <!-- CTA -->
                  <td align="right" style="padding-left:12px;">
                    <a href="https://youtu.be/8No839pTjOU?si=3kNWPM9_PkgVbENi" target="_blank"
                       style="display:inline-block;padding:8px 18px;background:#00E5FF;color:#000000;text-decoration:none;font-size:12px;font-weight:700;border-radius:8px;white-space:nowrap;">
                      Ver video →
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>

        <!-- Video 2 -->
        <table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#0a0a0a"
               style="border-radius:16px;border:1px solid #ffffff0d;margin-bottom:10px;">
          <tr>
            <td style="padding:20px 24px;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr valign="middle">
                  <td width="48" style="padding-right:16px;">
                    <table cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td bgcolor="#00E5FF15" style="border-radius:12px;width:48px;height:48px;text-align:center;vertical-align:middle;">
                          <span style="font-size:22px;line-height:48px;">👤</span>
                        </td>
                      </tr>
                    </table>
                  </td>
                  <td>
                    <p style="margin:0 0 3px 0;font-size:13px;font-weight:700;color:#ffffff;">¿Quién es el propietario?</p>
                    <p style="margin:0;font-size:12px;color:#475569;">Conoce al equipo detrás de la plataforma</p>
                  </td>
                  <td align="right" style="padding-left:12px;">
                    <a href="https://youtu.be/lZuG-n7SM00?si=J3uKcaDxSFEWnZFo" target="_blank"
                       style="display:inline-block;padding:8px 18px;background:#00E5FF;color:#000000;text-decoration:none;font-size:12px;font-weight:700;border-radius:8px;white-space:nowrap;">
                      Ver video →
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>

        <!-- Video 3 -->
        <table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#0a0a0a"
               style="border-radius:16px;border:1px solid #ffffff0d;margin-bottom:10px;">
          <tr>
            <td style="padding:20px 24px;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr valign="middle">
                  <td width="48" style="padding-right:16px;">
                    <table cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td bgcolor="#FF007F15" style="border-radius:12px;width:48px;height:48px;text-align:center;vertical-align:middle;">
                          <span style="font-size:22px;line-height:48px;">💳</span>
                        </td>
                      </tr>
                    </table>
                  </td>
                  <td>
                    <p style="margin:0 0 3px 0;font-size:13px;font-weight:700;color:#ffffff;">¿Cómo comprar tu espacio?</p>
                    <p style="margin:0;font-size:12px;color:#475569;">Tutorial paso a paso para adquirir tu paquete</p>
                  </td>
                  <td align="right" style="padding-left:12px;">
                    <a href="https://youtu.be/965DmVgae8U?si=CZYN9zGhxpEllXr0" target="_blank"
                       style="display:inline-block;padding:8px 18px;background:#FF007F;color:#ffffff;text-decoration:none;font-size:12px;font-weight:700;border-radius:8px;white-space:nowrap;">
                      Ver tutorial →
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>

        <!-- Video 4 -->
        <table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#0a0a0a"
               style="border-radius:16px;border:1px solid #FF007F22;">
          <tr>
            <td style="padding:20px 24px;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr valign="middle">
                  <td width="48" style="padding-right:16px;">
                    <table cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td bgcolor="#FF007F15" style="border-radius:12px;width:48px;height:48px;text-align:center;vertical-align:middle;">
                          <span style="font-size:22px;line-height:48px;">💰</span>
                        </td>
                      </tr>
                    </table>
                  </td>
                  <td>
                    <p style="margin:0 0 3px 0;font-size:13px;font-weight:700;color:#ffffff;">¿Cómo son las ganancias?</p>
                    <p style="margin:0;font-size:12px;color:#475569;">Aprende a calcular tu potencial de ingresos</p>
                  </td>
                  <td align="right" style="padding-left:12px;">
                    <a href="https://youtu.be/zGoUXrl3m8w?si=HlylTh3qULf-oFfA" target="_blank"
                       style="display:inline-block;padding:8px 18px;background:#FF007F;color:#ffffff;text-decoration:none;font-size:12px;font-weight:700;border-radius:8px;white-space:nowrap;">
                      Ver tutorial →
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>

      </td>
    </tr>

    <tr><td style="height:20px;"></td></tr>

    <!-- CTA FINAL -->
    <tr>
      <td bgcolor="#0a0a0a" style="border-radius:20px;border:1px solid #FF007F22;padding:0;overflow:hidden;">

        <table width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr><td bgcolor="#FF007F" style="height:4px;font-size:1px;line-height:1px;">&nbsp;</td></tr>
        </table>

        <table width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td align="center" style="padding:36px 32px 40px;">
              <p style="margin:0 0 8px 0;font-size:24px;font-weight:900;color:#ffffff;">
                ¿Listo para empezar?
              </p>
              <p style="margin:0 0 28px 0;font-size:14px;color:#64748b;line-height:1.6;">
                Un solo pago activa 30 días de ganancias diarias.<br>
                Sin renovaciones automáticas.
              </p>
              <table cellpadding="0" cellspacing="0" border="0" align="center">
                <tr>
                  <td bgcolor="#FF007F" style="border-radius:14px;">
                    <a href="${packagesUrl}" target="_blank"
                       style="display:inline-block;padding:17px 52px;color:#ffffff;text-decoration:none;font-size:15px;font-weight:900;letter-spacing:0.5px;text-transform:uppercase;">
                      Adquirir mi Paquete →
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin:18px 0 0 0;font-size:12px;color:#334155;">
                Desde <strong style="color:#ffffff;">$16 USD</strong> · Plan de 30 días
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>

    <tr><td style="height:32px;"></td></tr>

    <!-- FOOTER -->
    <tr>
      <td align="center" style="border-top:1px solid #ffffff08;padding-top:28px;">
        <img src="https://www.publihazclick.com/logo.webp" alt="PubliHazClick" height="36"
             style="display:block;height:36px;width:auto;margin:0 auto 14px;border:0;">
        <p style="margin:0 0 4px 0;font-size:12px;color:#334155;font-weight:600;">
          © 2026 PubliHazClick — Aprende a generar ingresos extras desde tu celular
        </p>
        <p style="margin:0 0 4px 0;font-size:11px;color:#1e293b;">
          publihazcick.com@gmail.com
        </p>
        <p style="margin:0;font-size:11px;color:#1e293b;line-height:1.5;">
          Recibiste este correo porque te registraste en PubliHazClick.<br>
          Si no fuiste tú, puedes ignorar este mensaje.
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

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { email, name } = await req.json();

    if (!email) {
      return json({ success: false, error: 'Email requerido' });
    }

    if (!RESEND_API_KEY) {
      console.error('RESEND_API_KEY not configured');
      return json({ success: false, error: 'Email service not configured' });
    }

    const packagesUrl = `${APP_URL}/dashboard/packages`;

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: RESEND_FROM,
        to: [email],
        subject: '🚀 Excelente decisión — Bienvenido a PubliHazClick',
        html: buildWelcomeHtml(name ?? '', packagesUrl),
      }),
    });

    const result = await res.json();

    if (!res.ok) {
      console.error('Resend error:', result);
      return json({ success: false, error: result.message ?? 'Error sending email' });
    }

    console.log(`Welcome email sent to ${email}`, result.id);
    return json({ success: true, id: result.id });
  } catch (err) {
    console.error('send-welcome-email error:', err);
    return json({ success: false, error: String(err) });
  }
});
