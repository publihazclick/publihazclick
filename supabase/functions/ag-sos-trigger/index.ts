// Edge Function: ag-sos-trigger
// Registra evento SOS, notifica contactos de emergencia vía SMS (Twilio o Telnyx)
// y crea notificación interna para admin.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL         = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const TWILIO_SID           = Deno.env.get('TWILIO_ACCOUNT_SID') ?? '';
const TWILIO_TOKEN         = Deno.env.get('TWILIO_AUTH_TOKEN') ?? '';
const TWILIO_PHONE         = Deno.env.get('TWILIO_PHONE_NUMBER') ?? '';
const TELNYX_API_KEY       = Deno.env.get('TELNYX_API_KEY') ?? '';
const TELNYX_FROM          = Deno.env.get('TELNYX_PHONE_NUMBER') ?? '';
const TELNYX_PROFILE       = Deno.env.get('TELNYX_MESSAGING_PROFILE_ID') ?? '';
const APP_URL              = Deno.env.get('APP_URL') ?? 'https://publihazclick.com';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
function json(d: unknown, s = 200) {
  return new Response(JSON.stringify(d), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });
}

async function sendSms(to: string, text: string): Promise<boolean> {
  // Prefer Twilio (soporta mejor COL); fallback Telnyx
  if (TWILIO_SID && TWILIO_TOKEN && TWILIO_PHONE) {
    try {
      const body = new URLSearchParams({ To: to, From: TWILIO_PHONE, Body: text });
      const auth = btoa(`${TWILIO_SID}:${TWILIO_TOKEN}`);
      const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`, {
        method: 'POST',
        headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      });
      if (r.ok) return true;
      console.error('[twilio]', r.status, await r.text());
    } catch (e) { console.error('twilio err', e); }
  }
  if (TELNYX_API_KEY && TELNYX_FROM) {
    try {
      const r = await fetch('https://api.telnyx.com/v2/messages', {
        method: 'POST',
        headers: { Authorization: `Bearer ${TELNYX_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: TELNYX_FROM, to, text,
          ...(TELNYX_PROFILE ? { messaging_profile_id: TELNYX_PROFILE } : {}),
        }),
      });
      if (r.ok) return true;
      console.error('[telnyx]', r.status, await r.text());
    } catch (e) { console.error('telnyx err', e); }
  }
  return false;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return json({ error: 'No autorizado' }, 401);
    const userJwt = authHeader.replace('Bearer ', '');

    // Validate user
    let userId: string | null = null;
    try {
      const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { Authorization: `Bearer ${userJwt}`, apikey: SUPABASE_SERVICE_KEY } });
      if (r.ok) userId = (await r.json())?.id ?? null;
    } catch {}
    if (!userId) { try { userId = JSON.parse(atob(userJwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))?.sub ?? null; } catch {} }
    if (!userId) return json({ error: 'Sesión inválida' }, 401);

    const body = await req.json();
    const { trip_id, lat, lng, accuracy_m, message } = body;

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // 1. Crear evento SOS
    const { data: sos, error: sosErr } = await supabase.from('ag_sos_events').insert({
      user_id: userId, trip_id: trip_id ?? null,
      lat: lat ?? null, lng: lng ?? null, accuracy_m: accuracy_m ?? null,
      message: message ?? null,
    }).select('id').single();
    if (sosErr || !sos) return json({ error: 'Error registrando SOS', detail: sosErr?.message }, 500);

    // 2. Obtener contactos de emergencia
    const { data: contacts } = await supabase.from('ag_emergency_contacts').select('*').eq('user_id', userId);
    const { data: profile } = await supabase.from('profiles').select('full_name, username, phone').eq('id', userId).maybeSingle();
    const personName = (profile as any)?.full_name ?? (profile as any)?.username ?? 'Usuario Movi';
    const mapsLink = lat && lng ? `https://maps.google.com/?q=${lat},${lng}` : '';
    const smsText = `🚨 ALERTA MOVI: ${personName} activó botón de pánico. ${mapsLink ? 'Ubicación: ' + mapsLink : ''} Si es emergencia, llama al 123.`.slice(0, 320);

    let notified = 0;
    if (contacts && contacts.length > 0) {
      await Promise.all((contacts as any[]).map(async c => {
        const ok = await sendSms(c.phone, smsText);
        if (ok) notified++;
      }));
    }

    // 3. Crear notificación admin (si tabla existe)
    try {
      await supabase.from('ag_admin_notifications').insert({
        type: 'sos',
        ref_id: sos.id,
        title: `SOS: ${personName}`,
        body: mapsLink || 'Sin ubicación',
      });
    } catch {}

    // 4. Actualizar evento con contadores
    await supabase.from('ag_sos_events').update({
      notified_contacts: notified, notified_admin: true,
    }).eq('id', sos.id);

    return json({ ok: true, sos_id: sos.id, contacts_notified: notified, maps_link: mapsLink });
  } catch (err) {
    console.error('ag-sos-trigger:', err);
    return json({ error: 'Error interno', detail: String(err) }, 500);
  }
});
