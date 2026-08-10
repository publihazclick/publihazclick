// Edge Function: ag-masked-call
// Inicia una llamada enmascarada entre pasajero y conductor durante un viaje activo.
// Estrategia: Telnyx (TeXML) marca al caller y redirige al destinatario mediante TeXML
// inline (<Dial callerId=...>). El caller ve el número de Telnyx, el destinatario ve el
// número de Telnyx. Números reales ocultos.
//
// Antes usaba Twilio -- se migró a Telnyx porque el usuario ya tiene cuenta verificada ahí
// (usada para OTP/SMS) y Twilio nunca llegó a configurarse en este proyecto (pedido
// explícito del usuario 2026-08-11: "no quiero Twilio, es difícil verificar cuenta ahí").
// Mismo patrón que ya usa ag-masked-call con TwiML: se le pasa el XML inline en el propio
// request (parámetro Texml), sin necesitar webhooks ni infraestructura con estado --
// Telnyx llama primero a `from`, y cuando contesta, el propio <Dial> del TeXML llama a `to`.
//
// Endpoint usado: POST /v2/texml/calls/{connection_id} (connection_id = el Application ID
// de la TeXML Application "Movi Masked Calling" creada en el dashboard de Telnyx). Existe
// una versión más nueva del endpoint (/v2/texml/Accounts/{account_sid}/Calls) pero exige un
// account_sid que no es trivial de obtener por API -- este endpoint más simple está
// documentado y funciona igual (mismos parámetros To/From/Texml).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL          = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const TELNYX_API_KEY        = Deno.env.get('TELNYX_API_KEY') ?? '';
const TELNYX_APPLICATION_ID = Deno.env.get('TELNYX_TEXML_APPLICATION_SID') ?? '';
const TELNYX_MASKING_PHONE  = Deno.env.get('TELNYX_MASKING_PHONE_NUMBER') ?? '';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
function json(d: unknown, s = 200) { return new Response(JSON.stringify(d), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } }); }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  if (!TELNYX_API_KEY || !TELNYX_APPLICATION_ID || !TELNYX_MASKING_PHONE) {
    return json({ error: 'Telnyx no configurado (TELNYX_API_KEY, TELNYX_TEXML_APPLICATION_SID, TELNYX_MASKING_PHONE_NUMBER)' }, 500);
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

    // TeXML inline: Telnyx llamará a `from` y cuando conteste, el <Dial> marcará a `to`.
    // La llamada conectada muestra TELNYX_MASKING_PHONE para ambos lados. timeLimit en
    // segundos (600 = 10 min), mismo tope que ya se usaba con Twilio como protección de
    // costo ante una llamada que se quede conectada sin colgar.
    const texml = `<Response><Dial callerId="${TELNYX_MASKING_PHONE}" timeLimit="600">${to}</Dial></Response>`;
    const params = new URLSearchParams({
      To: from,
      From: TELNYX_MASKING_PHONE,
      Texml: texml,
    });
    const tnxRes = await fetch(`https://api.telnyx.com/v2/texml/calls/${TELNYX_APPLICATION_ID}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${TELNYX_API_KEY}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });
    if (!tnxRes.ok) {
      const err = await tnxRes.text();
      console.error('[telnyx-call]', tnxRes.status, err);
      return json({ error: 'Telnyx error', detail: err }, 502);
    }
    const out = await tnxRes.json();
    // A diferencia de Twilio, la respuesta de este endpoint de Telnyx NO trae un "sid" --
    // solo { from, to, status } (verificado contra la documentación oficial). call_sid queda
    // como el status en su lugar; no se pierde nada real porque el frontend nunca llegó a usar
    // ese valor (startMaskedCall() lo recibe pero ningún caller lee callSid hoy).
    return json({ ok: true, call_sid: out.status ?? null, from_masked: TELNYX_MASKING_PHONE });
  } catch (err) {
    console.error('ag-masked-call:', err);
    return json({ error: 'Error interno', detail: String(err) }, 500);
  }
});
