// Edge Function: ag-masked-call
// Inicia una llamada enmascarada entre pasajero y conductor durante un viaje activo.
// Estrategia: Twilio marca al caller y redirige al destinatario mediante TwiML inline.
// El caller ve el número Twilio, el destinatario ve el número Twilio. Números reales ocultos.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL         = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const TWILIO_SID           = Deno.env.get('TWILIO_ACCOUNT_SID') ?? '';
const TWILIO_TOKEN         = Deno.env.get('TWILIO_AUTH_TOKEN') ?? '';
const TWILIO_PHONE         = Deno.env.get('TWILIO_PHONE_NUMBER') ?? '';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
function json(d: unknown, s = 200) { return new Response(JSON.stringify(d), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } }); }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  if (!TWILIO_SID || !TWILIO_TOKEN || !TWILIO_PHONE) {
    return json({ error: 'Twilio no configurado (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER)' }, 500);
  }

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
    const { trip_request_id } = body;
    if (!trip_request_id) return json({ error: 'trip_request_id requerido' }, 400);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Resolver pasajero y conductor del viaje
    const { data: trip } = await supabase.from('ag_trip_requests').select('passenger_user_id, driver_id, status').eq('id', trip_request_id).maybeSingle();
    if (!trip) return json({ error: 'Viaje no encontrado' }, 404);
    if (!['accepted', 'in_progress', 'on_route', 'arrived', 'pickup'].includes((trip as any).status)) {
      return json({ error: 'El viaje no está activo' }, 400);
    }

    // Phones de pasajero y conductor
    const { data: passUser } = await supabase.from('ag_users').select('auth_user_id, phone').eq('id', (trip as any).passenger_user_id).maybeSingle();
    const { data: drvLookup } = await supabase.from('ag_drivers').select('ag_user_id').eq('id', (trip as any).driver_id).maybeSingle();
    const { data: drvUser } = drvLookup ? await supabase.from('ag_users').select('auth_user_id, phone').eq('id', (drvLookup as any).ag_user_id).maybeSingle() : { data: null };

    if (!passUser || !drvUser) return json({ error: 'Usuarios no encontrados' }, 404);

    const passPhone = (passUser as any).phone;
    const drvPhone = (drvUser as any).phone;
    const isPassenger = (passUser as any).auth_user_id === userId;
    const isDriver = (drvUser as any).auth_user_id === userId;
    if (!isPassenger && !isDriver) return json({ error: 'No eres parte de este viaje' }, 403);

    // Quien llama: fromPhone ; Destinatario: toPhone
    const fromPhone = isPassenger ? passPhone : drvPhone;
    const toPhone   = isPassenger ? drvPhone : passPhone;
    if (!fromPhone || !toPhone) return json({ error: 'Falta número de teléfono de alguna parte' }, 400);

    // Normalizar a E.164 (+57...)
    const normE164 = (p: string) => {
      const clean = (p || '').replace(/\D/g, '');
      if (clean.startsWith('57')) return '+' + clean;
      if (clean.length === 10) return '+57' + clean;
      if (p.startsWith('+')) return p;
      return '+' + clean;
    };
    const from = normE164(fromPhone);
    const to   = normE164(toPhone);

    // TwiML inline: Twilio llamará a `from` y cuando conteste, marcará a `to`.
    // La llamada conectada muestra TWILIO_PHONE para ambos lados.
    const twiml = `<Response><Dial callerId="${TWILIO_PHONE}" timeLimit="600">${to}</Dial></Response>`;
    const params = new URLSearchParams({
      To: from,
      From: TWILIO_PHONE,
      Twiml: twiml,
    });
    const auth = btoa(`${TWILIO_SID}:${TWILIO_TOKEN}`);
    const twRes = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Calls.json`, {
      method: 'POST',
      headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });
    if (!twRes.ok) {
      const err = await twRes.text();
      console.error('[twilio-call]', twRes.status, err);
      return json({ error: 'Twilio error', detail: err }, 502);
    }
    const out = await twRes.json();
    return json({ ok: true, call_sid: out.sid, from_masked: TWILIO_PHONE });
  } catch (err) {
    console.error('ag-masked-call:', err);
    return json({ error: 'Error interno', detail: String(err) }, 500);
  }
});
