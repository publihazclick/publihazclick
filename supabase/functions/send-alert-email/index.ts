// =============================================================================
// Edge Function: send-alert-email
// Envía email de alerta usando Resend.
// Usada por pg_cron (check_epayco_health) cuando detecta anomalías.
// Deploy con --no-verify-jwt (pg_cron no envía JWT de usuario).
// =============================================================================

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? '';
const RESEND_FROM    = Deno.env.get('RESEND_FROM') ?? 'Publihazclick <noreply@publihazclick.com>';
const ALERT_TO       = Deno.env.get('ALERT_TO') ?? 'publihazclick@gmail.com';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, authorization',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  if (!RESEND_API_KEY) {
    console.error('RESEND_API_KEY no configurada');
    return json({ error: 'email_service_not_configured' }, 500);
  }

  let payload: { subject?: string; html?: string; text?: string; to?: string };
  try {
    payload = await req.json();
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }

  const subject = payload.subject?.trim() || '🚨 Alerta Publihazclick';
  const to      = payload.to?.trim() || ALERT_TO;
  const html    = payload.html || `<pre>${escapeHtml(payload.text ?? '')}</pre>`;

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({
        from:    RESEND_FROM,
        to:      [to],
        subject,
        html,
      }),
    });

    if (!res.ok) {
      const errBody = await res.text();
      console.error('Resend error', res.status, errBody);
      return json({ error: 'resend_failed', status: res.status, body: errBody }, 502);
    }

    const data = await res.json();
    console.log(`Alert email sent to ${to}: ${subject}`);
    return json({ ok: true, id: data.id });
  } catch (err) {
    console.error('Error inesperado enviando alerta:', err);
    return json({ error: 'internal', message: String(err) }, 500);
  }
});

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
