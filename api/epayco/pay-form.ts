// =============================================================================
// GET /api/epayco/pay-form?id=<payment_uuid>
// Devuelve una página HTML que auto-submete un formulario POST a ePayco.
// Esto permite que el WebView de Capacitor navegue a nuestra URL (mismo dominio)
// y desde allí haga el POST a ePayco sin que Capacitor lo intercepte como
// "navegación externa" (los POST no son bloqueados por shouldOverrideUrlLoading).
// =============================================================================

import { createClient } from '@supabase/supabase-js';
import { createHash } from 'crypto';

const SUPABASE_URL = process.env['SUPABASE_URL']!;
const SERVICE_KEY  = process.env['SUPABASE_SERVICE_ROLE_KEY']!;
const P_CUST_ID    = process.env['EPAYCO_P_CUST_ID']!;
const P_KEY        = process.env['EPAYCO_P_KEY']!;
const APP_URL      = process.env['APP_URL'] ?? 'https://www.publihazclick.com';

function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    return res.status(405).send('<h1>Method Not Allowed</h1>');
  }

  const paymentId = (req.query?.id ?? '') as string;
  if (!paymentId || !/^[0-9a-f-]{36}$/i.test(paymentId)) {
    return res.status(400).send('<h1>Falta o es inválido el parámetro id</h1>');
  }

  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    const { data: payment } = await supabase
      .from('ag_wallet_payments')
      .select('id, invoice, amount, driver_id, status')
      .eq('id', paymentId)
      .eq('status', 'pending')
      .maybeSingle();

    if (!payment) {
      return res.status(404).send(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Error</title></head>
        <body style="font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#000;color:#fff;flex-direction:column;gap:12px">
          <p style="font-size:16px;font-weight:bold">Pago no encontrado o ya procesado</p>
          <a href="https://www.publihazclick.com/anda-gana" style="color:#22d3ee">Volver a Movi</a>
        </body></html>`);
    }

    const { data: driverRow } = await supabase
      .from('ag_drivers')
      .select('ag_users(full_name, phone, email)')
      .eq('id', payment.driver_id)
      .maybeSingle();

    const agUser = (driverRow as any)?.ag_users;

    const testRequest = '0';
    const amountStr = Number(payment.amount).toFixed(2);
    const sigStr = [P_CUST_ID, P_KEY, payment.invoice, amountStr, '0', '0', 'COP', testRequest].join('^');
    const signature = sha256(sigStr);
    console.log(`[pay-form] cust_id=${P_CUST_ID} key_len=${P_KEY?.length} invoice=${payment.invoice} amount=${amountStr} sig=${signature}`);

    const fields: Record<string, string> = {
      p_cust_id_cliente:  P_CUST_ID,
      p_key:              P_KEY,
      p_id_invoice:       payment.invoice,
      p_description:      `Recarga Movi - ${agUser?.full_name ?? 'Conductor'}`,
      p_amount:           amountStr,
      p_tax:              '0',
      p_tax_base:         '0',
      p_currency_code:    'COP',
      p_signature:        signature,
      p_test_request:     testRequest,
      p_url_response:     `${APP_URL}/anda-gana?wallet=result`,
      p_url_confirmation: `${APP_URL}/api/epayco/confirmation`,
      p_email_comprador:  agUser?.email ?? '',
      p_nombre_comprador: agUser?.full_name ?? '',
      p_movil_comprador:  agUser?.phone ?? '',
      p_extra1:           payment.id,
      p_extra2:           payment.driver_id,
      p_extra3:           'ag_wallet',
    };

    const inputs = Object.entries(fields)
      .map(([name, value]) => `<input type="hidden" name="${escapeHtml(name)}" value="${escapeHtml(value)}" />`)
      .join('\n    ');

    const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Redirigiendo al pago seguro...</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: #000;
      color: #fff;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      gap: 16px;
      padding: 24px;
    }
    .spinner {
      width: 44px; height: 44px;
      border: 4px solid rgba(255,255,255,0.15);
      border-top-color: #22d3ee;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    p { font-size: 15px; color: rgba(255,255,255,0.75); text-align: center; }
    .lock { font-size: 28px; }
  </style>
</head>
<body>
  <div class="lock">🔒</div>
  <div class="spinner"></div>
  <p>Abriendo pago seguro con ePayco...</p>
  <form id="f" method="POST" action="https://checkout.epayco.co/payment.cgi">
    ${inputs}
  </form>
  <script>document.getElementById('f').submit();</script>
</body>
</html>`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store, no-cache');
    return res.status(200).send(html);

  } catch (err: any) {
    console.error('[pay-form] Error:', err);
    return res.status(500).send(`<h1>Error interno: ${escapeHtml(err?.message ?? 'desconocido')}</h1>`);
  }
}
