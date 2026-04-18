// Temporal: endpoint de DIAGNÓSTICO + envío
// Si llega { debug: true } devuelve la config visible sin secretos reales.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? '';
const BREVO_API_KEY  = Deno.env.get('BREVO_API_KEY') ?? '';
const EMAIL_FROM = Deno.env.get('LIVECAM_EMAIL_FROM')
                   ?? Deno.env.get('RESEND_FROM')
                   ?? 'LiveCam Pro <onboarding@resend.dev>';
const APP_URL = Deno.env.get('LIVECAM_APP_URL') ?? 'https://livecam-pro.vercel.app';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}

type EmailType = 'welcome' | 'withdrawal_approved' | 'withdrawal_rejected' | 'fan_new_subscriber' | 'model_verified' | 'custom';

function template(type: EmailType, data: Record<string, any>): { subject: string; html: string } {
  const brand = `<div style="text-align:center;margin-bottom:24px"><strong style="color:#ec4899;font-size:24px">LiveCam <span style="color:#f472b6">Pro</span></strong></div>`;
  const footer = `<hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0" /><p style="color:#9ca3af;font-size:12px;text-align:center">&copy; 2026 LiveCam Pro</p>`;
  const wrap = (body: string) => `<div style="background:#0a0a0a;padding:24px"><div style="max-width:560px;margin:0 auto;background:#fff;color:#111;border-radius:12px;padding:32px;font-family:system-ui,-apple-system,sans-serif">${brand}${body}${footer}</div></div>`;
  switch (type) {
    case 'welcome': return { subject: `Bienvenid@ a LiveCam Pro, ${data.username ?? ''}!`, html: wrap(`<h2>Hola ${data.username ?? ''}!</h2><p>Tu cuenta ha sido creada. Estás list@.</p><p><a href="${APP_URL}" style="display:inline-block;padding:12px 24px;background:#ec4899;color:#fff;border-radius:8px;text-decoration:none;font-weight:bold">Ir a LiveCam Pro</a></p>`) };
    case 'withdrawal_approved': return { subject: `Retiro aprobado: ${data.tokens} tokens`, html: wrap(`<h2>Retiro aprobado</h2><p><strong>${data.tokens} tokens</strong> enviados vía ${data.payment_method}.</p>`) };
    case 'withdrawal_rejected': return { subject: `Retiro rechazado`, html: wrap(`<h2>Retiro rechazado</h2><p>${data.tokens} tokens. ${data.notes ?? ''}</p>`) };
    case 'fan_new_subscriber': return { subject: `Nuevo fan: ${data.subscriber_username}`, html: wrap(`<h2>¡Nuevo fan!</h2><p><strong>${data.subscriber_username}</strong> — ${data.monthly_tokens} tokens/mes.</p>`) };
    case 'model_verified': return { subject: `Cuenta verificada`, html: wrap(`<h2>¡Verificada!</h2><p>Ya tienes el badge.</p>`) };
    default: return { subject: data.subject ?? '(sin asunto)', html: wrap(data.html ?? '') };
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const body = await req.json();

    // DEBUG: devolver info sin secretos reales
    if (body?.debug === true) {
      return json({
        hasResend: !!RESEND_API_KEY,
        hasBrevo: !!BREVO_API_KEY,
        emailFrom: EMAIL_FROM,
        appUrl: APP_URL,
        resendKeyPrefix: RESEND_API_KEY ? RESEND_API_KEY.slice(0, 8) + '...' : null,
      });
    }

    // CHECK status de un email por ID
    if (body?.check_email_id) {
      const r = await fetch(`https://api.resend.com/emails/${body.check_email_id}`, {
        headers: { Authorization: `Bearer ${RESEND_API_KEY}` },
      });
      return json({ status: r.status, data: await r.text() });
    }

    if (!RESEND_API_KEY && !BREVO_API_KEY) return json({ error: 'Email no configurado' }, 500);

    const to = body?.to as string;
    const type = (body?.type ?? 'custom') as EmailType;
    const data = body?.data ?? {};
    if (!to) return json({ error: 'to requerido' }, 400);

    const { subject, html } = template(type, data);

    if (RESEND_API_KEY) {
      const payload = { from: EMAIL_FROM, to: [to], subject, html };
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const respText = await res.text();
      if (!res.ok) {
        console.error('[resend]', res.status, respText);
        return json({ error: 'Resend error', status: res.status, detail: respText, sentFrom: EMAIL_FROM }, 502);
      }
      return json({ ok: true, provider: 'resend', id: JSON.parse(respText).id, sentFrom: EMAIL_FROM });
    }

    if (BREVO_API_KEY) {
      const fromMatch = EMAIL_FROM.match(/^(.*)<(.+)>$/);
      const fromName = fromMatch?.[1]?.trim().replace(/"/g, '') ?? 'LiveCam Pro';
      const fromEmail = fromMatch?.[2]?.trim() ?? EMAIL_FROM;
      const res = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { 'api-key': BREVO_API_KEY, 'Content-Type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ sender: { name: fromName, email: fromEmail }, to: [{ email: to }], subject, htmlContent: html }),
      });
      if (!res.ok) { const err = await res.text(); return json({ error: 'Brevo error', detail: err }, 502); }
      return json({ ok: true, provider: 'brevo', id: (await res.json()).messageId });
    }

    return json({ error: 'Sin proveedor' }, 500);
  } catch (err) {
    console.error('send-email error:', err);
    return json({ error: 'Error interno', detail: String(err) }, 500);
  }
});
