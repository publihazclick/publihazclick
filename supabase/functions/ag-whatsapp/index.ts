import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ─── Config ──────────────────────────────────────────────────────────────────
const WA_TOKEN            = Deno.env.get('META_WA_TOKEN')!;
const PHONE_NUMBER_ID     = Deno.env.get('META_WA_PHONE_NUMBER_ID')!;
// Segunda línea de WhatsApp, exclusiva para registro/soporte de conductores --
// mismo WABA y mismo token que el número de pedir viajes (ver memoria
// movi_whatsapp_support_number), Meta manda "value.metadata.phone_number_id"
// en cada webhook entrante y así se distingue a cuál de los dos llegó el
// mensaje (ver el branching en serve() más abajo).
const SUPPORT_PHONE_NUMBER_ID = Deno.env.get('META_WA_SUPPORT_PHONE_NUMBER_ID') ?? '';
const APP_URL = Deno.env.get('APP_URL') ?? '';
const WEBHOOK_VERIFY_TOKEN = Deno.env.get('META_WA_WEBHOOK_VERIFY_TOKEN') ?? 'movi_webhook_2026';
const SUPABASE_URL        = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY    = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const MIN_PRICE    = 5000;
// Número de soporte de Movi (el mismo ya usado en la app para wa.me/573134453649)
const SUPPORT_PHONE = '573134453649';
// Número dedicado a conductores (registro/soporte, ver memoria
// movi_whatsapp_support_number) -- se usa para redirigir a quien escribe al
// número de VIAJES preguntando por trabajar como conductor, en vez de intentar
// responder esa lógica dos veces en dos números distintos.
const DRIVER_SUPPORT_PHONE = '573009645697';

// Llamada enmascarada por PSTN (Telnyx) -- mismo proveedor/patrón que usa ag-masked-call
// para conductor->pasajero desde la app. Acá cubre el sentido contrario: pasajero de
// WhatsApp -> conductor. No se puede reusar la función ag-masked-call tal cual porque esa
// exige un JWT real de Supabase Auth, y los pasajeros invitados de WhatsApp no tienen
// cuenta de Auth (mismo motivo documentado en triggerWaSos y en el estado in_trip para "a
// bordo"). Se replica la misma llamada a la API de Telnyx con el cliente de service role.
const TELNYX_API_KEY        = Deno.env.get('TELNYX_API_KEY') ?? '';
const TELNYX_APPLICATION_ID = Deno.env.get('TELNYX_TEXML_APPLICATION_SID') ?? '';
const TELNYX_MASKING_PHONE  = Deno.env.get('TELNYX_MASKING_PHONE_NUMBER') ?? '';

const SERVICE_LABELS: Record<string, string> = {
  carro:     '🚗 Carro',
  moto:      '🏍️ Moto',
  domicilio: '📦 Domicilio',
  ciudad:    '🌆 Ciudad a Ciudad',
  flete:     '🚛 Flete',
};

// ─── Textos que cambian según si el servicio mueve una PERSONA o un PAQUETE ──
// Todo el copy de destino en adelante (confirmar destino, precio, "a bordo",
// en curso, completado) estaba escrito solo pensando en pasajero -- "¿a dónde
// VAS?", "¿ya SUBISTE al vehículo?", "LLEGASTE" -- y se reutilizaba tal cual
// para Domicilio, donde quien "viaja" es el paquete, no el usuario (bug real
// reportado 2026-08-11: "las respuestas no están acordes al flujo de cada
// servicio"). flete queda incluido a futuro por si algún día se habilita por
// este canal -- es el mismo caso que domicilio (se envía un bulto, no una
// persona).
function isDeliveryService(svc: string | null | undefined): boolean {
  return svc === 'domicilio' || svc === 'flete';
}

// ─── Texto de la pregunta de destino ──────────────────────────────────────────
// "¿Hacia dónde va?" (neutral, en 3ra persona) en vez de "¿A dónde vas?" -- con
// el nombre de la persona cuando el viaje es para otra persona, no para quien
// escribe (pedido explícito del usuario 2026-08-11). Un solo lugar para las 3
// veces que se pregunta el destino, para que no se desincronicen entre sí.
function destQuestionText(session: Record<string, unknown>): string {
  if (isDeliveryService(session.service_type as string)) {
    return `¿A dónde debe llegar el paquete?`;
  }
  if (session.is_for_self === false && session.traveler_name) {
    return `¿Hacia dónde va ${session.traveler_name}?`;
  }
  return `¿Hacia dónde va?`;
}

// ─── Nombre de la persona que viaja, cuando el viaje NO es para quien escribe ──
// Usado por todo el resto del flujo (oferta, confirmación, llegada, inicio de
// viaje, recibo) para hablar de la persona correcta en vez de tratar al
// pasajero de WhatsApp como si fuera quien físicamente viaja -- pedido
// explícito del usuario 2026-08-11 ("estamos respondiendo como si el pedido
// fuera para la misma persona"). null cuando es para quien escribe (el caso
// de siempre, sin cambios de wording).
function travelerLabel(session: Record<string, unknown>): string | null {
  if (session.is_for_self === false && session.traveler_name) return session.traveler_name as string;
  return null;
}
// Misma idea que travelerLabel() pero a partir de ag_trip_requests.for_other
// (jsonb {name, phone, requested_by_phone}, ver createWaTrip) en vez de la
// sesión -- para los avisos de un viaje que ya no es "el actual" de la
// conversación (puede haber otro pedido en curso al mismo tiempo, ver
// handleInternalEvent), la sesión ya no es una fuente confiable de a quién
// pertenece ese viaje.
function travelerLabelFromForOther(forOther: unknown): string | null {
  if (forOther && typeof forOther === 'object' && (forOther as Record<string, unknown>).name) {
    return (forOther as Record<string, unknown>).name as string;
  }
  return null;
}
function svcCopy(svc: string | null | undefined) {
  const delivery = isDeliveryService(svc);
  return {
    delivery,
    driverNoun:    delivery ? 'mensajero' : 'conductor',
    vehicleEmoji:  svc === 'moto' ? '🏍️' : svc === 'domicilio' ? '📦' : svc === 'flete' ? '🚛' : '🚗',
  };
}

// ─── Supabase client (service role) ──────────────────────────────────────────
function db() {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

// ─── "Subir oferta" (migración 243) ───────────────────────────────────────────
// Monto sugerido al subir oferta: mismos pasos en pesos que ya usa la app
// (adjustTripPriceSmart() en anda-gana.component.ts) -- NO un porcentaje, para
// que el salto sea proporcionalmente más chico entre más caro es el viaje. Si
// se cambia uno de los dos lados, cambiar el otro para que no queden distintos.
function _raiseOfferStep(current: number): number {
  return current < 8000 ? 500 : current < 20000 ? 1000 : 2000;
}
function _raiseOfferSuggested(current: number): number {
  return current + _raiseOfferStep(current);
}
// Por encima de este múltiplo del monto actual, se pide confirmar una vez más
// antes de aplicar -- protección contra errores de tipeo (ej. un cero de más).
const RAISE_OFFER_SANITY_MULTIPLIER = 3;

/** Aplica el monto final de "subir oferta": guarda el precio de origen la primera vez (no lo
 * pisa en subidas siguientes), actualiza el precio, reenvía el push real a conductores
 * cercanos, y le confirma al pasajero -- compartido por el camino directo y el confirmado. */
async function _applyRaisedOffer(phone: string, tripId: string, currentPrice: number, newPrice: number, delivery: boolean) {
  const supabase = db();
  const { data: updated } = await supabase.from('ag_trip_requests')
    .update({ offered_price: newPrice, updated_at: new Date().toISOString() })
    .eq('id', tripId).eq('status', 'searching')
    .select('initial_offered_price').maybeSingle();

  // COALESCE manual (no en SQL directo porque pasa por supabase-js): si initial_offered_price
  // todavía está vacío, esta es la primera vez que se sube la oferta de este viaje -- se guarda
  // el monto ANTERIOR a este cambio como el de origen, para poder mostrar "empezaste en $X" en
  // subidas futuras sin perder ese dato.
  let initialPrice = updated?.initial_offered_price as number | null;
  if (initialPrice == null) {
    initialPrice = currentPrice;
    await supabase.from('ag_trip_requests').update({ initial_offered_price: initialPrice }).eq('id', tripId);
  }

  await supabase.rpc('ag_rebroadcast_trip_request', { p_trip_id: tripId });
  await upsertSession(phone, { state: 'matching', matching_started_at: new Date().toISOString(), pending_raise_amount: null });

  const noun = delivery ? 'mensajeros' : 'conductores';
  const startedLine = initialPrice < currentPrice
    ? ` (empezaste en *$${initialPrice.toLocaleString('es-CO')}*)`
    : '';
  await sendText(phone,
    `💰 Tu oferta subió de *$${currentPrice.toLocaleString('es-CO')}* a *$${newPrice.toLocaleString('es-CO')}*${startedLine}.\n\n` +
    `🔍 Seguimos buscando ${noun} cerca de ti...\n\nTe avisamos apenas alguien acepte.`
  );
}

// ─── Registro de mensajes para el panel de soporte (ver migración 237) ───────
// Guarda cada mensaje entrante/saliente de ambos números (viajes=pasajero,
// soporte=conductor) para poder verlos como conversación en el admin. No
// bloquea el flujo real -- si falla, solo queda sin loguear ese mensaje.
function logWaMessage(
  phone: string,
  role: 'conductor' | 'pasajero',
  direction: 'in' | 'out',
  body: string,
  msgType = 'text',
): void {
  db().from('ag_wa_message_log').insert({
    wa_phone: phone,
    role,
    direction,
    body: (body ?? '').slice(0, 4000),
    msg_type: msgType,
  }).then(({ error }) => {
    if (error) console.error('[WA] logWaMessage error:', error);
  });
}

// ─── BSUID vs número real ──────────────────────────────────────────────────────
// Desde abril 2026 Meta permite a los usuarios de WhatsApp ocultar su número
// real detrás de un "username" -- para esos usuarios el webhook YA NO manda
// "from" (número), solo "from_user_id" con un Business-Scoped User ID (BSUID,
// formato tipo "CO.1745906379785888"). Para responderles hay que mandar el
// mensaje saliente con el campo "recipient" (el BSUID) en vez de "to" (que
// exige un número real) -- si se manda como "to" Meta rechaza con "(#100)
// The parameter to is required" porque no reconoce el BSUID como número
// válido. Esto es lo que causaba el bug real reportado 2026-08-11 ("no le
// llega a un iPhone") -- no era un bug de iOS, era un pasajero con username
// activado; confirmado viendo el payload crudo real de Meta en los logs.
function isBsuid(id: string): boolean {
  return !/^\+?\d+$/.test(id);
}
function recipientField(id: string): { to: string } | { recipient: string } {
  return isBsuid(id) ? { recipient: id } : { to: id };
}

// ─── WhatsApp API helpers ─────────────────────────────────────────────────────
async function sendText(to: string, text: string): Promise<{ ok: boolean; status?: number; body?: string }> {
  try {
    const res = await fetch(`https://graph.facebook.com/v20.0/${PHONE_NUMBER_ID}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${WA_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        ...recipientField(to),
        type: 'text',
        text: { preview_url: false, body: text },
      }),
    });
    const bodyText = await res.text();
    // Antes esto no revisaba res.ok -- un rechazo de la API de Meta (token vencido,
    // numero no registrado, fuera de ventana de 24h) quedaba invisible: el fetch "exitoso"
    // (sin lanzar excepcion) hacia parecer que el mensaje se habia enviado cuando en
    // realidad Meta lo rechazo. Se loguea siempre para poder diagnosticar sin adivinar.
    if (!res.ok) console.error('[WA] sendText Meta API error:', res.status, bodyText);
    logWaMessage(to, 'pasajero', 'out', text, 'text');
    return { ok: res.ok, status: res.status, body: bodyText };
  } catch (e) {
    console.error('[WA] sendText fetch error:', e);
    return { ok: false, body: String(e) };
  }
}

// ─── Mensaje de plantilla aprobada (no depende de la ventana de 24h) ─────────
/**
 * BUG REAL 2026-09-02: Meta rechazaba SIEMPRE la plantilla trip_error_alert con
 * '(#100) Invalid parameter -- Parameter name is missing or empty', asi que ningun aviso al
 * admin llegaba nunca por plantilla; todos caian al texto libre de respaldo, que solo se
 * entrega si la ventana de 24h esta abierta. Si el admin llevaba mas de un dia sin escribirle
 * al bot, NO le llegaba nada y en silencio (el log decia "enviado" igual, ver logWaMessage
 * abajo). Causa: esa plantilla esta definida en Meta con parameter_format NAMED
 * ({{contexto}}/{{detalle}}) y aca se mandaban los valores por posicion. Comprobado consultando
 * la definicion real en Meta: trip_error_alert es NAMED, viaje_completado y conductor_llego son
 * POSITIONAL -- por eso esas dos si funcionaban y solo fallaba esta.
 *
 * paramNames opcional: si viene, se manda parameter_name en cada variable (plantillas NAMED);
 * si no viene, se mandan por posicion como siempre (plantillas POSITIONAL).
 */
async function sendTemplate(to: string, templateName: string, langCode: string, bodyParams: string[], paramNames?: string[]): Promise<{ ok: boolean; status?: number; body?: string }> {
  try {
    const res = await fetch(`https://graph.facebook.com/v20.0/${PHONE_NUMBER_ID}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${WA_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        ...recipientField(to),
        type: 'template',
        template: {
          name: templateName,
          language: { code: langCode },
          components: [
            { type: 'body', parameters: bodyParams.map((t, i) => (
              paramNames?.[i] ? { type: 'text', parameter_name: paramNames[i], text: t }
                              : { type: 'text', text: t }
            )) },
          ],
        },
      }),
    });
    const bodyText = await res.text();
    if (!res.ok) console.error('[WA] sendTemplate Meta API error:', res.status, bodyText);
    // El log tiene que reflejar la realidad: antes registraba el mensaje aunque Meta lo
    // rechazara, asi que decia 'enviado' cuando no habia llegado nada. Bug real 2026-09-02.
    const marcaTpl = res.ok ? '' : `[NO ENTREGADO ${res.status}] `;
    logWaMessage(to, 'pasajero', 'out', `${marcaTpl}[plantilla ${templateName}] ${bodyParams.join(' | ')}`, 'template');
    return { ok: res.ok, status: res.status, body: bodyText };
  } catch (e) {
    console.error('[WA] sendTemplate fetch error:', e);
    return { ok: false, body: String(e) };
  }
}

type WaResult = { ok: boolean; status?: number; body?: string };

// ─── Marcar leído + mostrar "escribiendo..." mientras el bot procesa ─────────
// Antes las respuestas llegaban instantáneas incluso después de geocodificar
// una dirección o llamar a OpenAI (varios segundos), lo que se siente robótico
// -- "un bot no debería tardar pero tampoco debería ser instantáneo". Meta
// muestra el indicador nativo hasta 25s o hasta que se envíe el siguiente
// mensaje, lo que ocurra primero -- no hace falta apagarlo a mano.
async function markReadWithTyping(messageId: string, phoneNumberId: string = PHONE_NUMBER_ID): Promise<void> {
  try {
    await fetch(`https://graph.facebook.com/v20.0/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${WA_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        status: 'read',
        message_id: messageId,
        typing_indicator: { type: 'text' },
      }),
    });
  } catch (e) { console.error('[WA] markReadWithTyping error:', e); }
}

// ─── Resumen legible de un payload interactivo/media para el log de mensajes ──
function summarizeOutboundPayload(payload: Record<string, unknown>): { text: string; type: string } {
  const type = (payload.type as string) ?? 'text';
  if (type === 'text') return { text: ((payload.text as Record<string, unknown>)?.body as string) ?? '', type };
  if (type === 'interactive') {
    const interactive = payload.interactive as Record<string, unknown>;
    const bodyText = ((interactive?.body as Record<string, unknown>)?.text as string) ?? '';
    const buttons = (interactive?.action as Record<string, unknown>)?.buttons as Array<Record<string, unknown>> | undefined;
    const btnTitles = buttons?.map(b => (b.reply as Record<string, unknown>)?.title).filter(Boolean).join(' / ');
    return { text: btnTitles ? `${bodyText}\n[botones: ${btnTitles}]` : bodyText, type: (interactive?.type as string) ?? type };
  }
  if (type === 'image') return { text: ((payload.image as Record<string, unknown>)?.caption as string) ?? '[imagen]', type };
  if (type === 'location') {
    const loc = payload.location as Record<string, unknown>;
    return { text: `[ubicación] ${(loc?.name as string) ?? ''} ${(loc?.address as string) ?? ''}`.trim(), type };
  }
  return { text: `[${type}]`, type };
}

async function sendGraph(payload: Record<string, unknown>): Promise<WaResult> {
  try {
    const { to, ...rest } = payload;
    const fullBody = { messaging_product: 'whatsapp', ...(to ? recipientField(to as string) : {}), ...rest };
    const res = await fetch(`https://graph.facebook.com/v20.0/${PHONE_NUMBER_ID}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${WA_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(fullBody),
    });
    const bodyText = await res.text();
    if (!res.ok) console.error('[WA] sendGraph Meta API error:', res.status, bodyText, 'sent:', JSON.stringify(fullBody));
    if (to) {
      const summary = summarizeOutboundPayload(payload);
      logWaMessage(to as string, 'pasajero', 'out', summary.text, summary.type);
    }
    return { ok: res.ok, status: res.status, body: bodyText };
  } catch (e) {
    console.error('[WA] sendGraph fetch error:', e);
    return { ok: false, body: String(e) };
  }
}

// ─── Botones nativos (reemplaza "responde 1, 2 o 3" por algo que se toca) ────
// Maximo 3 botones (limite real de la API), titulo <=20 caracteres. Nunca
// llevan header de imagen -- ver nota en presentOffer() sobre por qué ese
// combo falla en silencio en WhatsApp para iOS.
async function sendButtons(to: string, bodyText: string, buttons: { id: string; title: string }[]): Promise<WaResult> {
  const interactive: Record<string, unknown> = {
    type: 'button',
    body: { text: bodyText },
    action: { buttons: buttons.slice(0, 3).map(b => ({ type: 'reply', reply: { id: b.id, title: b.title.slice(0, 20) } })) },
  };
  return sendGraph({ to, type: 'interactive', interactive });
}

// ─── Botón nativo "Enviar ubicación" -- 1 toque comparte el GPS actual ───────
// Tipo especial de Meta (location_request_message, no un botón normal): abre
// el picker nativo de ubicación de WhatsApp con un solo toque, en vez de que
// el pasajero tenga que saber ir al clip 📎 → Ubicación. No reemplaza el
// camino de escribir la dirección a mano -- el body sigue mencionándolo como
// respaldo, por si el cliente de WhatsApp del pasajero no soporta este tipo
// de mensaje o simplemente prefiere escribir.
async function sendLocationRequest(to: string, bodyText: string): Promise<WaResult> {
  const interactive: Record<string, unknown> = {
    type: 'location_request_message',
    body: { text: bodyText },
    action: { name: 'send_location' },
  };
  return sendGraph({ to, type: 'interactive', interactive });
}

// ─── Foto real (conductor, comprobantes) como imagen del chat ────────────────
async function sendImage(to: string, imageUrl: string, caption?: string): Promise<WaResult> {
  return sendGraph({ to, type: 'image', image: { link: imageUrl, caption } });
}

// ─── Ubicación como mapa nativo dentro del chat, no un link de texto ─────────
async function sendLocation(to: string, lat: number, lng: number, name?: string, address?: string): Promise<WaResult> {
  return sendGraph({ to, type: 'location', location: { latitude: lat, longitude: lng, name, address } });
}

// ─── Normalizar número a E.164 ────────────────────────────────────────────────
function toE164(phone: string): string {
  // Un BSUID (ver isBsuid()) no es un número -- pasarlo por esta lógica lo
  // destruiría (le quita todo lo que no sea dígito). Se deja intacto.
  if (isBsuid(phone)) return phone;
  const digits = phone.replace(/\D/g, '');
  if (phone.startsWith('+')) return `+${digits}`;
  if (digits.length === 10) return `+57${digits}`;
  if (digits.length === 12 && digits.startsWith('57')) return `+${digits}`;
  return `+${digits}`;
}

// ─── Llamada enmascarada por PSTN (Telnyx) ────────────────────────────────────
// Marca primero a `from` y, cuando contesta, el propio <Dial> del TeXML marca a `to` --
// ambos lados ven TELNYX_MASKING_PHONE, nunca el número real del otro. Mismo endpoint y
// mismo patrón que usa ag-masked-call/index.ts (la función que ya usa la app para
// conductor->pasajero) -- ver ese archivo para el detalle de por qué este endpoint
// especifico (no exige account_sid) y por qué no hay "sid" en la respuesta.
async function startMaskedCall(from: string, to: string): Promise<{ ok: boolean; error?: string }> {
  if (!TELNYX_API_KEY || !TELNYX_APPLICATION_ID || !TELNYX_MASKING_PHONE) {
    console.error('[WA] startMaskedCall: Telnyx no configurado');
    return { ok: false, error: 'not_configured' };
  }
  try {
    const texml = `<Response><Dial callerId="${TELNYX_MASKING_PHONE}" timeLimit="600">${to}</Dial></Response>`;
    const params = new URLSearchParams({ To: from, From: TELNYX_MASKING_PHONE, Texml: texml });
    const res = await fetch(`https://api.telnyx.com/v2/texml/calls/${TELNYX_APPLICATION_ID}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${TELNYX_API_KEY}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });
    if (!res.ok) {
      const err = await res.text();
      console.error('[WA] startMaskedCall Telnyx error:', res.status, err);
      return { ok: false, error: err };
    }
    return { ok: true };
  } catch (e) {
    console.error('[WA] startMaskedCall fetch error:', e);
    return { ok: false, error: String(e) };
  }
}

// ─── Fetch con límite de tiempo -- Nominatim en particular puede tardar
// varios segundos o directamente colgarse bajo carga (es un servicio público
// gratuito, sin SLA); sin esto una sola consulta lenta se sentía como que
// "todo el chat va rápido menos cuando mando mi ubicación" (bug real
// reportado 2026-08-11). 4s es tiempo de sobra para una API de geocoding
// que responde bien, y corta la espera si no.
async function fetchWithTimeout(url: string, opts: RequestInit = {}, ms = 4000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...opts, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// ─── Deletrear el tipo de vía completo ("Av" -> "Avenida") ───────────────────
// Mapbox a veces abrevia el tipo de vía al inicio de la dirección ("Av 7
// 7-115", "Cra 4 10-20", "Cl 12 3-45") -- entendible para alguien acostumbrado
// a leer direcciones, pero no para "que sea todo en un lenguaje muy humano...
// gente de barrios sin estudios" (pedido explícito 2026-08-28). Se expande
// siempre a la palabra completa, solo cuando aparece como la PRIMERA palabra
// de la dirección (que es donde Mapbox pone el tipo de vía) para no tocar por
// error una palabra parecida en medio de un nombre de barrio o lugar.
const STREET_TYPE_EXPANSIONS: Record<string, string> = {
  'av':     'Avenida',
  'avda':   'Avenida',
  'cl':     'Calle',
  'cll':    'Calle',
  'cra':    'Carrera',
  'cr':     'Carrera',
  'kr':     'Carrera',
  'kra':    'Carrera',
  'dg':     'Diagonal',
  'diag':   'Diagonal',
  'tv':     'Transversal',
  'trans':  'Transversal',
  'trv':    'Transversal',
  'circ':   'Circunvalar',
};
function expandStreetType(segment: string): string {
  return segment.replace(/^([A-Za-zÁÉÍÓÚáéíóú]+)\.?\s+/, (full, word) => {
    const expanded = STREET_TYPE_EXPANSIONS[word.toLowerCase()];
    return expanded ? `${expanded} ` : full;
  });
}


// ─── Barrio (best-effort, en paralelo, nunca bloquea la respuesta) ───────────
// Pedido explícito del usuario 2026-08-28: "no podemos devolver también el
// barrio". Se confirmó consultando varios puntos reales de Cúcuta que Mapbox
// NO tiene ninguna capa "neighborhood" para esta ciudad (el context nunca la
// trae, ni pidiéndola explícitamente) -- OpenStreetMap/Nominatim sí la tiene
// para las mismas coordenadas exactas ("Zulima", confirmado). Nominatim ya se
// había sacado del camino PRINCIPAL de geocodificación por ser lento y sin
// SLA (ver comentario en reverseGeocode) -- acá se usa solo como dato EXTRA,
// arrancado en paralelo con Mapbox (no en serie) y con timeout corto propio,
// así que si Nominatim tarda o falla el pasajero de todos modos recibe su
// dirección a tiempo, solo sin el barrio.
async function fetchNeighborhood(lat: number, lng: number): Promise<string | undefined> {
  try {
    const r = await fetchWithTimeout(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1&accept-language=es`,
      { headers: { 'User-Agent': 'Movi-App/1.0 (movi@publihazclick.com)' } },
      900
    );
    const j = await r.json();
    const addr = j?.address as Record<string, string> | undefined;
    // OSM etiqueta el barrio con distintos tags según qué tan bien mapeada
    // esté la zona -- se prueban los 3 más comunes en ciudades colombianas,
    // del más específico al más general.
    return addr?.neighbourhood || addr?.suburb || addr?.quarter || undefined;
  } catch (e) {
    console.error('[Geo] fetchNeighborhood (Nominatim) error:', e);
    return undefined;
  }
}

// ─── Geocoding inverso (solo Mapbox) ───────────────────────────────────────────
async function reverseGeocode(lat: number, lng: number): Promise<string> {
  // Mapbox como única fuente -- el mismo token publico que ya usa el mapa de
  // la app (environment.ts, andaGana.mapboxToken). No se usa Google aca
  // porque la API key del proyecto solo tiene Places API habilitada, no
  // Geocoding API (el endpoint de reverse geocoding "clasico" de Google) --
  // probado y confirmado con REQUEST_DENIED antes de elegir Mapbox.
  //
  // Nominatim (OSM) YA NO se usa como respaldo -- medido en producción que
  // es la causa real de que "todo el chat vaya rápido menos cuando mando mi
  // ubicación" (bug real reportado 2026-08-11, dos veces): es un servicio
  // público gratuito sin SLA, y bajo las pruebas de este mismo fix devolvió
  // un error de límite de solicitudes en vivo. Mapbox medido en producción
  // responde en ~10-15ms de forma consistente -- no vale la pena la
  // "seguridad" de un segundo resultado si ese segundo resultado es lo que
  // vuelve lenta e impredecible toda la función. Si Mapbox no da un
  // resultado confiable, se cae directo a coordenadas crudas (rápido,
  // siempre disponible, y más honesto que una dirección adivinada).
  // Arrancada ANTES de esperar a Mapbox (no con await todavía) para que
  // corra en paralelo de verdad, no en serie -- se recoge más abajo, después
  // de tener ya la calle/ciudad de Mapbox.
  const neighborhoodPromise = fetchNeighborhood(lat, lng);
  const mapboxToken = Deno.env.get('MAPBOX_PUBLIC_TOKEN');
  if (mapboxToken) {
    try {
      // Timeout bajado de 3000ms a 1500ms (2026-08-28): medido en producción que
      // Mapbox responde en ~10-50ms en el caso normal -- el timeout de 3s solo
      // importa cuando Mapbox está degradado/caído, y en ese caso peor es hacer
      // esperar al pasajero 3 segundos completos antes de caer a coordenadas
      // crudas (ya de por sí un resultado válido, ver comentario abajo) que
      // cortar a la mitad y mostrar algo rápido.
      const r = await fetchWithTimeout(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${mapboxToken}&language=es&types=address,poi`,
        {}, 1500
      );
      const j = await r.json();
      // Se piden dos "types" (address,poi) -- Mapbox devuelve el mejor match
      // de CADA tipo por separado, no solo el más relevante en general. Antes
      // se tomaba siempre features[0] (el primero, no necesariamente el más
      // cercano) y se aceptaba con hasta 3km de margen -- eso alcanzaba para
      // no mostrar una dirección de otra ciudad, pero no era suficiente para
      // que la dirección mostrada describiera de verdad el punto exacto que
      // mandó el pasajero (bug real reportado 2026-08-11: "no devuelves
      // precisa la ubicación"). Ahora se compara la distancia real de CADA
      // candidato y se usa el más cercano, con un margen mucho más ajustado
      // (150m -- precisión de "misma cuadra", no "misma zona").
      const features = (j?.features ?? []) as Array<{ place_name?: string; center?: [number, number] }>;
      let best: { name: string; dist: number } | null = null;
      for (const f of features) {
        if (!f?.place_name || !f?.center) continue;
        const dist = haversineKm(lat, lng, f.center[1], f.center[0]);
        if (!best || dist < best.dist) best = { name: f.place_name, dist };
      }
      if (best && best.dist <= 0.15) {
        // Limpieza para que la dirección la entienda cualquier persona, sin
        // importar su nivel educativo (pedido explícito 2026-08-28: "que sea
        // todo en un lenguaje muy humano... gente de barrios sin estudios").
        // Mapbox devuelve el código postal PEGADO al nombre de la ciudad en
        // el mismo segmento ("540001 San José de Cúcuta") y agrega el
        // departamento como segmento aparte -- antes esto se mandaba tal
        // cual (recortando solo a 3 segmentos), así que el pasajero veía
        // "Calle 1B 2 15, 540001 San José de Cúcuta, Norte de Santander": un
        // número sin explicación que nadie identifica como código postal, y
        // un departamento que no ayuda a reconocer la propia dirección.
        // Ahora se quita el código postal (siempre 4-6 dígitos al inicio de
        // un segmento) y se deja solo calle + ciudad -- nunca departamento
        // ni "Colombia".
        const segments = best.name
          .split(',')
          .map(s => s.replace(/^\s*\d{4,6}\s+/, '').trim())
          .filter(s => s.length > 0 && s.toLowerCase() !== 'colombia');
        // El tipo de vía abreviado ("Av", "Cra", "Cl") solo puede venir en el
        // primer segmento (la calle) -- los demás son ciudad/barrio, no hace
        // falta tocarlos.
        if (segments[0]) segments[0] = expandStreetType(segments[0]);
        const [street, city] = segments;
        // Para este punto ya pasó tiempo de sobra (todo lo de arriba: fetch a
        // Mapbox + parsear) -- normalmente neighborhoodPromise ya está resuelta
        // y este await es instantáneo; si no, espera como mucho lo que le
        // quede de su propio timeout de 900ms.
        const barrio = await neighborhoodPromise;
        // Sin la palabra "barrio" repetida -- se lee como cualquier persona
        // diría su propia dirección: "calle, zona, ciudad", sin etiquetas
        // (pedido explícito del usuario 2026-08-28: se veía raro repetir
        // "barrio" dos veces cuando también se agrega el barrio que escribió
        // el pasajero, ver combineWithBarrioHint).
        return barrio
          ? [street, barrio.trim(), city].filter(Boolean).join(', ')
          : segments.slice(0, 2).join(', ');
      }
    } catch (e) { console.error('[Geo] Mapbox reverseGeocode error:', e); }
  }
  // Sin resultado confiable cerca del punto real -- mejor mostrar las
  // coordenadas crudas (que sí son exactas) que una dirección inventada que
  // puede quedar en otra parte de la ciudad o del país.
  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}

async function forwardGeocode(text: string, biasLat?: number, biasLng?: number): Promise<{ lat: number; lng: number; address: string } | null> {
  // Google Places (Text Search) como fuente principal -- la misma API key que
  // ya usa el buscador de la app (ver memoria buscador_google_places), con
  // Maps JavaScript API + Places API habilitadas. Entiende direcciones
  // informales/colombianas ("cra 5 con calle 10", nombres de barrios, lugares
  // conocidos) muchisimo mejor que Nominatim/OSM, que casi siempre devolvia
  // "no encontré esa dirección" con el texto tal cual lo escribe un pasajero
  // real por WhatsApp (bug reportado 2026-08-10). Nominatim se deja como
  // ultimo respaldo si Google falla (cuota, red, o sin resultados).
  //
  // biasLat/biasLng (cuando se conoce el origen del pasajero) hacen que
  // Google prefiera resultados cercanos en vez del más "famoso" a nivel
  // nacional -- sin esto, nombres genéricos que se repiten en varias
  // ciudades ("Unicentro", "Centro Mayor", "Éxito") casi siempre devolvían el
  // de Bogotá sin importar en qué ciudad estuviera el pasajero real (bug
  // real reportado 2026-08-11: "el destino sale en otra ciudad").
  const googleKey = Deno.env.get('GOOGLE_MAPS_API_KEY');
  if (googleKey) {
    try {
      const q = encodeURIComponent(text + ', Colombia');
      let url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${q}&region=co&language=es&key=${googleKey}`;
      if (biasLat != null && biasLng != null) {
        // location+radius en Text Search es un sesgo (no restringe resultados
        // fuera del radio) -- sigue encontrando lugares lejos si el texto es
        // específico, solo prioriza los cercanos cuando el nombre es ambiguo.
        url += `&location=${biasLat},${biasLng}&radius=50000`;
      }
      const r = await fetchWithTimeout(url);
      const j = await r.json();
      if (j.status === 'OK' && j.results?.length) {
        // El "location+radius" de arriba es solo un sesgo blando -- Google
        // igual puede devolver primero un lugar homónimo lejano ("La Ermita"
        // existe en varias ciudades) si le parece más relevante/famoso. Se
        // filtra duro por distancia real al origen: Movi son viajes
        // intraurbanos, así que un resultado a cientos de km NUNCA es el
        // destino correcto aunque el nombre coincida (bug real reportado
        // 2026-08-12: pasajero en su ciudad, destino "la ermita" cayó a
        // 665km en Cali/San Pedro). Si ninguno cae cerca, se descarta la
        // lista completa (no se usa el más lejano) y se sigue probando con
        // Nominatim más abajo.
        const MAX_BIAS_KM = 60;
        const candidates = (biasLat != null && biasLng != null)
          ? j.results.filter((it: any) => {
              const loc = it.geometry?.location;
              return loc?.lat != null && loc?.lng != null &&
                haversineKm(biasLat, biasLng, loc.lat, loc.lng) <= MAX_BIAS_KM;
            })
          : j.results;
        const item = candidates[0];
        const loc = item?.geometry?.location;
        if (loc?.lat != null && loc?.lng != null) {
          return {
            lat: loc.lat,
            lng: loc.lng,
            address: (item.name && item.formatted_address && !item.formatted_address.startsWith(item.name))
              ? `${item.name}, ${item.formatted_address}`
              : (item.formatted_address ?? item.name ?? text),
          };
        }
      } else if (j.status !== 'ZERO_RESULTS') {
        console.error('[Geo] Google Places error:', j.status, j.error_message);
      }
    } catch (e) { console.error('[Geo] Google Places fetch error:', e); }
  }

  try {
    const q = encodeURIComponent(text + ', Colombia');
    const r = await fetchWithTimeout(
      `https://nominatim.openstreetmap.org/search?q=${q}&format=json&countrycodes=co&limit=5`,
      { headers: { 'User-Agent': 'Movi-App/1.0 (movi@publihazclick.com)' } }
    );
    const results = await r.json();
    if (results?.length) {
      // Mismo filtro duro de cercanía que arriba, por la misma razón --
      // Nominatim es el último respaldo y puede repetir el mismo error de
      // devolver un homónimo en otra ciudad.
      const MAX_BIAS_KM = 60;
      const candidates = (biasLat != null && biasLng != null)
        ? results.filter((it: any) =>
            haversineKm(biasLat, biasLng, parseFloat(it.lat), parseFloat(it.lon)) <= MAX_BIAS_KM)
        : results;
      const item = candidates[0];
      if (item) {
        return {
          lat: parseFloat(item.lat),
          lng: parseFloat(item.lon),
          address: item.display_name.split(',').slice(0, 3).join(',').trim(),
        };
      }
    }
  } catch (e) { console.error('[Geo] Nominatim fallback error:', e); }
  return null;
}

// ─── Última ubicación conocida del pasajero (sesgo de ciudad para el ORIGEN) ──
// A diferencia del destino (que ya tiene el origen recién geocodificado como
// sesgo, ver forwardGeocode(text, session.origin_lat, ...) en awaiting_dest),
// cuando el pasajero escribe su dirección de ORIGEN todavía no tenemos
// ninguna coordenada suya en la sesión -- Google Places Text Search sin sesgo
// devuelve el resultado más "famoso" a nivel nacional (bug real reportado
// 2026-08-11: "trae direcciones o barrios de otra ciudad"). Se usa el origen
// de su viaje más reciente (cualquier estado, no hace falta que haya
// completado) como sesgo -- un pasajero recurrente casi siempre pide desde la
// misma ciudad. Si nunca ha pedido un viaje, no hay forma de adivinar su
// ciudad sin coordenadas reales, así que se sigue sin sesgo (fallback ya
// existente, no es un bug distinto).
async function lastKnownCityBias(phone: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const supabase = db();
    const { data } = await supabase
      .from('ag_trip_requests')
      .select('origin_lat, origin_lng')
      .eq('wa_phone', phone)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data?.origin_lat != null && data?.origin_lng != null) {
      return { lat: data.origin_lat as number, lng: data.origin_lng as number };
    }
  } catch (e) { console.error('[Geo] lastKnownCityBias error:', e); }
  return null;
}

// ─── Validación geoespacial Colombia ─────────────────────────────────────────
function isInColombia(lat: number, lng: number): boolean {
  return lat >= -4.5 && lat <= 13.5 && lng >= -79.0 && lng <= -66.5;
}

// ─── Haversine ────────────────────────────────────────────────────────────────
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 +
    Math.cos(lat1 * Math.PI/180) * Math.cos(lat2 * Math.PI/180) * Math.sin(dLng/2)**2;
  return R * 2 * Math.asin(Math.sqrt(a));
}

// ─── Distancia + duración reales por calles (Mapbox Directions) ──────────────
// Mismo patrón defensivo que ya usa reverseGeocode() más arriba (mismo token
// MAPBOX_PUBLIC_TOKEN, mismo fetchWithTimeout) -- si Mapbox falla o no hay
// token, cae a línea recta + una velocidad urbana asumida (30 km/h, mismo
// respaldo que usa _calcPrice() en la app) en vez de bloquear la solicitud.
// Reemplaza a haversineKm() en presentDestConfirm()/createWaTrip() para que el
// precio sugerido y el distance_km guardado reflejen calles reales, igual que
// ya hace la app (_drawRoute() en anda-gana.component.ts).
async function getRouteDistanceDuration(
  oLat: number, oLng: number, dLat: number, dLng: number
): Promise<{ distKm: number; durationMin: number }> {
  const fallbackKm = haversineKm(oLat, oLng, dLat, dLng);
  const mapboxToken = Deno.env.get('MAPBOX_PUBLIC_TOKEN');
  if (!mapboxToken) return { distKm: fallbackKm, durationMin: fallbackKm / 30 * 60 };
  try {
    const url = `https://api.mapbox.com/directions/v5/mapbox/driving-traffic/${oLng},${oLat};${dLng},${dLat}`
      + `?overview=false&access_token=${mapboxToken}`;
    const r = await fetchWithTimeout(url, {}, 2500);
    const j = await r.json();
    const route = j?.routes?.[0];
    if (route?.distance != null && route?.duration != null) {
      return { distKm: route.distance / 1000, durationMin: route.duration / 60 };
    }
  } catch (e) { console.error('[getRouteDistanceDuration] Mapbox error:', e); }
  return { distKm: fallbackKm, durationMin: fallbackKm / 30 * 60 };
}

// ─── Calcular precio sugerido ─────────────────────────────────────────────────
// Debe coincidir con la fórmula real que usa la app (_calcPrice/_calcDomPrice
// en anda-gana.component.ts) -- antes esto era solo tarifa*km sin ningún
// cobro base, así que en viajes cortos (la mayoría de los viajes dentro de
// una ciudad) el precio sugerido por WhatsApp salía mucho más barato que
// pedir exactamente el mismo viaje desde la app (bug real reportado
// 2026-08-11: "las veo demasiado baratas"). El intento anterior de arreglar
// domicilio (rate=1000, comentario de abajo) también estaba mal calibrado --
// domicilio en la app no usa la tarifa de moto, usa su propia fórmula fija
// de $1500/km sin cobro base (_calcDomPrice).
// Multiplicador de demanda (horas pico) -- misma RPC que ya usa la app
// (agService.currentSurge(), siempre llamada sin zona = multiplicador global
// vigente) para que la tarifa sugerida por WhatsApp tenga paridad real con la
// app. Antes esta función nunca lo aplicaba -- las tarifas base sí están
// calibradas para igualar a InDrive (ver _calcPrice en anda-gana.component.ts),
// pero en horas de alta demanda InDrive sí sube su precio sugerido y Movi por
// WhatsApp se quedaba siempre en la tarifa plana, saliendo más barato sin
// motivo real (bug real reportado 2026-08-11: "el precio sugerido es más
// barato que indriver"). Si la consulta falla, se usa 1 (sin recargo) en vez
// de bloquear la solicitud.
// Fase 3 del plan hacia unicornio (2026-08-14, ver memoria
// movi_unicorn_code_plan_2026-08-14): cuando se conoce el punto de origen del
// pasajero, se usa ag_blended_surge (combina este horario fijo de siempre CON
// oferta/demanda real en vivo -- toma el más alto de los dos) en vez de solo
// ag_current_surge. Sin coordenadas, sigue exactamente igual que antes -- cero
// cambio de comportamiento para cualquier caller que no las tenga.
async function currentSurgeMultiplier(lat?: number, lng?: number): Promise<number> {
  try {
    if (lat != null && lng != null) {
      const { data, error } = await db().rpc('ag_blended_surge', { p_lat: lat, p_lng: lng, p_zone_id: null });
      if (error) { console.error('[Price] ag_blended_surge error:', error); return 1; }
      return Number(data ?? 1);
    }
    const { data, error } = await db().rpc('ag_current_surge', { p_zone_id: null });
    if (error) { console.error('[Price] ag_current_surge error:', error); return 1; }
    return Number(data ?? 1);
  } catch (e) { console.error('[Price] currentSurgeMultiplier fetch error:', e); return 1; }
}

// Recalibrado 2026-08-30 -- espejo exacto del cambio en _calcPrice() de
// anda-gana.component.ts (ver comentario allá para el porqué completo): carro y
// moto ahora también cobran por minutos estimados, no solo km, para que un
// viaje largo con tráfico cueste más, igual que Uber/DiDi/InDrive. domicilio,
// flete y ciudad quedan sin tocar -- fuera del pedido explícito del usuario.
async function suggestPrice(distKm: number, service: string, originLat?: number, originLng?: number, durationMin?: number): Promise<number> {
  const surge = await currentSurgeMultiplier(originLat, originLng);
  // Respaldo: misma velocidad asumida que usa _calcPrice() en la app cuando no
  // se conoce la duración real (30 km/h).
  const minutes = durationMin ?? (distKm / 30 * 60);
  if (service === 'domicilio') {
    return Math.max(MIN_PRICE, Math.round(distKm * 1500 * surge / 500) * 500);
  }
  if (service === 'moto') {
    const raw = Math.max(3000, 2500 + distKm * 800 + minutes * 80);
    return Math.round(raw * surge / 500) * 500;
  }
  if (service === 'flete') {
    const raw = Math.max(8000, 6000 + distKm * 1500);
    return Math.round(raw * surge / 500) * 500;
  }
  if (service === 'ciudad') {
    return Math.max(MIN_PRICE, Math.round(distKm * 1800 * surge / 500) * 500);
  }
  // carro (default)
  const raw = Math.max(4500, 4000 + distKm * 1000 + minutes * 150);
  return Math.round(raw * surge / 500) * 500;
}

// ─── Sesión WA ────────────────────────────────────────────────────────────────
async function getSession(phone: string) {
  const supabase = db();
  const { data } = await supabase
    .from('ag_wa_sessions')
    .select('*')
    .eq('wa_phone', phone)
    .maybeSingle();
  return data;
}

async function upsertSession(phone: string, patch: Record<string, unknown>) {
  const supabase = db();
  const { data } = await supabase
    .from('ag_wa_sessions')
    .upsert({ wa_phone: phone, last_message_at: new Date().toISOString(), ...patch },
             { onConflict: 'wa_phone' })
    .select()
    .single();
  return data;
}

async function resetSession(phone: string) {
  const supabase = db();
  await supabase.from('ag_wa_sessions').upsert({
    wa_phone: phone,
    state: 'idle',
    service_type: null,
    origin_lat: null, origin_lng: null, origin_address: null,
    dest_name: null, dest_lat: null, dest_lng: null,
    offered_price: null, package_desc: null,
    trip_request_id: null, active_offer_id: null,
    driver_name: null, driver_price: null, driver_phone: null,
    driver_vehicle: null, driver_plate: null,
    matching_started_at: null, pending_dest_text: null,
    origin_barrio_hint: null, pending_location_kind: null,
    last_message_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
  }, { onConflict: 'wa_phone' });
}

// ─── Crear usuario WA guest ───────────────────────────────────────────────────
async function getOrCreateWaUser(phone: string, name: string): Promise<string | null> {
  const supabase = db();
  const { data } = await supabase.rpc('ag_get_or_create_wa_user', {
    p_phone: toE164(phone),
    p_name: name || 'Usuario WA',
  });
  return data ?? null;
}

// ─── Crear solicitud de viaje ─────────────────────────────────────────────────
async function createWaTrip(session: Record<string, unknown>): Promise<string | null> {
  const supabase = db();

  let userId = session.ag_user_id as string | null;
  if (!userId) {
    userId = await getOrCreateWaUser(session.wa_phone as string, 'Usuario WA');
    if (userId) {
      await supabase.from('ag_wa_sessions')
        .update({ ag_user_id: userId })
        .eq('wa_phone', session.wa_phone as string);
    }
  }

  const serviceType = session.service_type as string;
  const originAddr = session.origin_address as string ?? '';
  const oLat = session.origin_lat as number;
  const oLng = session.origin_lng as number;
  const dLat = session.dest_lat as number;
  const dLng = session.dest_lng as number;
  // vehicle_type es NOT NULL con CHECK IN ('carro','moto') -- domicilio usa moto por
  // ser el vehiculo tipico de mensajeria en Colombia (el pasajero no elige vehiculo
  // aparte para domicilios en el flujo de WhatsApp, a diferencia de la app).
  const vehicleType = serviceType === 'moto' ? 'moto' : serviceType === 'carro' ? 'carro' : 'moto';
  // Distancia real por calles (no línea recta) -- igual que ya usa presentDestConfirm() para
  // el precio sugerido y _drawRoute() en la app, para que distance_km refleje el trayecto real.
  const { distKm: realDistKm } = await getRouteDistanceDuration(oLat, oLng, dLat, dLng);

  const tripData: Record<string, unknown> = {
    passenger_user_id: userId,
    service_type:  serviceType,
    vehicle_type:  vehicleType,
    origin_name:   originAddr,
    origin_lat:    oLat,
    origin_lng:    oLng,
    dest_name:     session.dest_name,
    dest_lat:      dLat,
    dest_lng:      dLng,
    distance_km:   realDistKm,
    offered_price: session.offered_price,
    status:        'searching',
    source:        'whatsapp',
    // OJO: se guarda tal cual (sin toE164) porque ag_wa_sessions.wa_phone -- la
    // clave que usan getSession()/upsertSession() -- se guarda SIN "+" (el
    // formato que manda Meta en el campo "from" del webhook). Si aca se guardaba
    // con "+" (bug real 2026-08-09), getSession(payload.wa_phone) en
    // handleInternalEvent('offer_received') nunca encontraba la sesion y el
    // aviso de "conductor disponible" se perdia en silencio -- el pasajero solo
    // se enteraba si volvia a escribir algo (recuperacion oportunista en el
    // estado 'matching'). sendText() ya funciona igual con o sin "+".
    wa_phone:      session.wa_phone as string,
    passenger_note: session.package_desc
      ? `[WA] ${serviceType === 'domicilio' ? 'Domicilio' : 'Flete'}: ${session.package_desc}`
      : '[Pedido vía WhatsApp]',
  };

  // Viaje pedido para otra persona (pedido explícito del usuario 2026-08-11):
  // se reutilizan dos columnas de ag_trip_requests que ya existían pero nunca
  // se habían usado en ningún lado del código -- passenger_name (el conductor
  // YA la lee con prioridad sobre el nombre de la cuenta, ver
  // anda-gana.component.ts) y for_other (agregada en la migración 116). No se
  // toca nada cuando is_for_self es true/undefined (el caso de siempre).
  if (session.is_for_self === false && session.traveler_name) {
    tripData.passenger_name = session.traveler_name;
    tripData.for_other = {
      name: session.traveler_name,
      phone: session.traveler_phone ?? null,
      requested_by_phone: session.wa_phone,
    };
  }

  const { data, error } = await supabase
    .from('ag_trip_requests')
    .insert(tripData)
    .select('id')
    .single();

  if (error) { console.error('[WA] createWaTrip error:', error); return null; }
  return data?.id ?? null;
}

// ─── Buscar la siguiente oferta pendiente de un viaje ────────────────────────
// Usado para no perder ofertas que llegaron mientras el pasajero ya estaba
// respondiendo a otra (el trigger de DB las descarta en silencio en ese caso,
// pero quedan en 'pending' en ag_trip_offers — esto las recupera).
async function fetchNextPendingOffer(tripId: string): Promise<Record<string, unknown> | null> {
  const supabase = db();

  const { data: offer } = await supabase
    .from('ag_trip_offers')
    .select('id, driver_id, offered_price')
    .eq('trip_request_id', tripId)
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!offer) return null;

  let driverName = 'Conductor';
  let driverPhone = '';
  let driverVeh = '';
  let driverPlate = '';
  let driverPhoto = '';
  let driverRating = 0;

  let driverTrips = 0;

  const { data: driver } = await supabase
    .from('ag_drivers')
    .select('vehicle_brand, vehicle_model, vehicle_color, plate, ag_user_id, metric_trips_completed')
    .eq('id', offer.driver_id as string)
    .maybeSingle();

  if (driver) {
    driverVeh   = [driver.vehicle_brand, driver.vehicle_model, driver.vehicle_color].filter(Boolean).join(' ');
    driverPlate = driver.plate ?? '';
    driverTrips = (driver.metric_trips_completed as number) ?? 0;

    const { data: user } = await supabase
      .from('ag_users')
      .select('full_name, phone, selfie_url')
      .eq('id', driver.ag_user_id as string)
      .maybeSingle();
    if (user) {
      driverName  = user.full_name ?? driverName;
      driverPhone = user.phone ?? '';
      driverPhoto = user.selfie_url ?? '';
    }

    const { data: ratings } = await supabase
      .from('ag_trip_ratings')
      .select('stars')
      .eq('rated_user_id', driver.ag_user_id as string)
      .eq('rated_by_role', 'passenger');
    if (ratings?.length) {
      driverRating = ratings.reduce((s, r) => s + ((r.stars as number) ?? 0), 0) / ratings.length;
    }
  }

  return {
    offer_id:       offer.id as string,
    driver_name:    driverName,
    driver_price:   offer.offered_price as number,
    driver_phone:   driverPhone,
    driver_vehicle: driverVeh,
    driver_plate:   driverPlate,
    driver_photo:   driverPhoto,
    driver_rating:  driverRating,
    driver_trips:   driverTrips,
  };
}

// ─── Mostrar una oferta al pasajero por WhatsApp ──────────────────────────────
// Con foto real del conductor como header de la tarjeta cuando existe (casi
// siempre, se verifica en el registro) -- antes era puro texto plano, la
// primera cara que veía el pasajero era la de su conductor en persona.
async function presentOffer(phone: string, o: Record<string, unknown>, prefix = ''): Promise<void> {
  await upsertSession(phone, {
    state:           'awaiting_offer_response',
    active_offer_id: o.offer_id,
    driver_name:     o.driver_name,
    driver_price:    o.driver_price,
    driver_phone:    o.driver_phone,
    driver_vehicle:  o.driver_vehicle,
    driver_plate:    o.driver_plate,
  });

  const rating  = o.driver_rating as number;
  const trips   = o.driver_trips as number ?? 0;
  const price   = (o.driver_price as number).toLocaleString('es-CO');
  const copy    = svcCopy(o.service_type as string | undefined);
  const details = [
    o.driver_vehicle ? `${copy.vehicleEmoji} ${o.driver_vehicle}` : null,
    o.driver_plate   ? `Placa ${o.driver_plate}` : null,
  ].filter(Boolean).join(' · ');

  // Señal de confianza: rating + viajes completados si hay historial, o solo
  // el conteo de viajes si aún no tiene calificaciones -- un conductor con
  // "32 viajes" ya dice algo aunque nadie lo haya calificado todavía. Si es
  // nuevo (0 viajes) se omite la línea entera en vez de mostrar "0 viajes",
  // que restaría confianza en vez de darla.
  const trustParts = [
    rating > 0 ? `⭐ ${rating.toFixed(1)}` : null,
    trips  > 0 ? `${trips} viaje${trips === 1 ? '' : 's'}` : null,
  ].filter(Boolean).join(' · ');

  // o.for_name: nombre de la persona que viaja, cuando el viaje no es para
  // quien escribe (ver travelerLabel()) -- pasado por cada caller desde su
  // propia sesión. "Vix quiere llevarte" no tiene sentido si quien viaja es
  // otra persona.
  const forName = o.for_name as string | null | undefined;
  const action = copy.delivery
    ? 'quiere recoger tu paquete 📦'
    : (forName ? `quiere llevar a *${forName}* 🚗` : 'quiere llevarte 🚗');
  const body =
    `${prefix}${o.driver_name} ${action}\n\n` +
    (trustParts ? `${trustParts}` + (details ? ` · ${details}` : '') + `\n` : (details ? `${details}\n` : '')) +
    `💰 Te cobra *$${price}*`;

  const buttons = [
    { id: `accept_offer_${o.offer_id}`, title: '✅ Aceptar' },
    { id: `reject_offer_${o.offer_id}`, title: '🔄 Buscar otro' },
  ];

  // La foto va como mensaje de imagen aparte, NUNCA como header de un mensaje
  // interactivo -- WhatsApp para iOS falla en silencio al renderizar un
  // "interactive button" con "header: {type: image}" (Meta acepta el envío,
  // pasajero nunca ve nada, sin error visible en ningún log); en Android
  // el mismo payload sí se ve bien. Separarlos usa dos tipos de mensaje
  // simples y bien soportados en todos los clientes en vez de la combinación
  // problemática -- pedido explícito del usuario 2026-08-11 ("necesito que
  // sirva a todo tipo de dispositivo").
  if (o.driver_photo) {
    await sendImage(phone, o.driver_photo as string);
  }
  await sendButtons(phone, body, buttons);
}

// ─── Transcribir nota de voz (Meta media → OpenAI Whisper) ────────────────────
async function transcribeAudio(mediaId: string): Promise<string | null> {
  const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!apiKey) return null;
  try {
    const metaRes = await fetch(`https://graph.facebook.com/v20.0/${mediaId}`, {
      headers: { Authorization: `Bearer ${WA_TOKEN}` },
    });
    if (!metaRes.ok) return null;
    const meta = await metaRes.json();
    const mediaUrl = meta?.url as string | undefined;
    if (!mediaUrl) return null;

    const audioRes = await fetch(mediaUrl, { headers: { Authorization: `Bearer ${WA_TOKEN}` } });
    if (!audioRes.ok) return null;
    const audioBlob = await audioRes.blob();

    const form = new FormData();
    form.append('file', audioBlob, 'audio.ogg');
    form.append('model', 'whisper-1');
    form.append('language', 'es');

    const trRes = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    });
    if (!trRes.ok) { console.error('[AI] transcribe error', trRes.status, await trRes.text()); return null; }
    const trJson = await trRes.json();
    return (trJson?.text as string)?.trim() || null;
  } catch (e) { console.error('[AI] transcribeAudio error:', e); return null; }
}

// ─── Interpretar una solicitud en lenguaje natural (texto libre o transcrito) ─
// Capa opcional sobre el menú de botones -- si el pasajero escribe (o dicta)
// todo de una vez ("necesito un carro del centro al aeropuerto, pago 20 mil"),
// esto evita forzarlo a navegar las 5 preguntas del menú clásico. Si no se
// puede interpretar con confianza, se cae de vuelta al menú de siempre.
interface ParsedRequest {
  service_type: 'carro' | 'moto' | 'domicilio' | 'ciudad' | 'flete' | null;
  origin_text:  string | null;
  dest_text:    string | null;
  package_desc: string | null;
}
async function parseFreeTextRequest(text: string): Promise<ParsedRequest | null> {
  const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!apiKey) return null;
  try {
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        response_format: { type: 'json_object' },
        temperature: 0,
        messages: [
          {
            role: 'system',
            content:
              'Extraes datos de una solicitud de viaje/domicilio en Colombia escrita o dictada por ' +
              'WhatsApp. Responde SOLO un objeto JSON con estas claves:\n' +
              '- service_type: uno de "carro","moto","domicilio","ciudad","flete", o null si no está claro.\n' +
              '- origin_text: string con el lugar/dirección de origen mencionado, o null si no se menciona.\n' +
              '- dest_text: string con el lugar/dirección de destino mencionado, o null si no se menciona.\n' +
              '- package_desc: string describiendo qué se envía (solo si service_type es domicilio o flete), o null.\n' +
              'Si el mensaje no es claramente una solicitud de viaje/domicilio, responde con todas las claves en null.',
          },
          { role: 'user', content: text },
        ],
      }),
    });
    if (!r.ok) { console.error('[AI] parse error', r.status, await r.text()); return null; }
    const j = await r.json();
    const raw = j?.choices?.[0]?.message?.content as string | undefined;
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const validServices = ['carro', 'moto', 'domicilio', 'ciudad', 'flete'];
    return {
      service_type: validServices.includes(parsed.service_type) ? parsed.service_type : null,
      origin_text:  typeof parsed.origin_text === 'string' ? parsed.origin_text : null,
      dest_text:    typeof parsed.dest_text === 'string' ? parsed.dest_text : null,
      package_desc: typeof parsed.package_desc === 'string' ? parsed.package_desc : null,
    };
  } catch (e) { console.error('[AI] parseFreeTextRequest error:', e); return null; }
}

// ─── Piloto: interpretar una respuesta que no calzó con el validador rápido ───
// Se llama SOLO cuando el match rápido (regex/botones/isYes/isNo) ya falló --
// no reemplaza el camino rápido, es una segunda oportunidad antes de repetir el
// mensaje robótico de siempre. Nunca hace avanzar el flujo si no está seguro:
// "matched" de baja confianza se degrada a "unclear" en vez de arriesgar un dato
// que el usuario nunca dijo (ver movi-wa-humanizacion, piloto en 3 estados
// 2026-08-11: awaiting_traveler_phone, awaiting_dest_confirm, awaiting_offer_response).
interface FallbackInterpretation {
  outcome: 'matched' | 'distraction' | 'unclear';
  matched_value: string | null;
  reply_text: string | null;
  confidence: number;
}
async function interpretFallback(params: {
  state: string;
  question: string;
  answerFormat: string;
  userText: string;
}): Promise<FallbackInterpretation | null> {
  const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!apiKey) return null;
  try {
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        response_format: { type: 'json_object' },
        temperature: 0.3,
        messages: [
          {
            role: 'system',
            content:
              'Eres el asistente de Movi (app de viajes/domicilios por WhatsApp en Colombia). El usuario está ' +
              'a mitad de un flujo y le acabamos de hacer una pregunta puntual, pero su respuesta no calzó con ' +
              'el formato exacto esperado. Decide qué pasó SIN inventar datos que el usuario no dijo.\n\n' +
              'Responde SOLO un objeto JSON con estas claves:\n' +
              '- outcome: "matched" si el texto sí corresponde con confianza a una respuesta válida (aunque ' +
              'tenga typos, otro formato, o esté escrito informal); "distraction" si claramente dijo/preguntó ' +
              'algo distinto al tema (otra pregunta, un comentario, un saludo); "unclear" si de verdad no se ' +
              'puede saber qué quiso decir.\n' +
              '- matched_value: SOLO si outcome="matched", el valor siguiendo EXACTO el formato pedido en ' +
              '"Formato de respuesta esperado" (abajo). null en cualquier otro caso.\n' +
              '- reply_text: SOLO si outcome="distraction" o "unclear", un mensaje corto, cálido y natural en ' +
              'español de Colombia (máximo 2 frases, con algún emoji si encaja) -- si es "distraction", responde ' +
              'brevemente lo que preguntó Y regresa a la pregunta pendiente; si es "unclear", reformula la ' +
              'pregunta original con otras palabras (nunca repitas la misma frase). null si outcome="matched".\n' +
              '- confidence: número entre 0 y 1, qué tan seguro estás del outcome.\n\n' +
              `Pregunta pendiente: "${params.question}"\n` +
              `Formato de respuesta esperado: ${params.answerFormat}`,
          },
          { role: 'user', content: params.userText },
        ],
      }),
    });
    if (!r.ok) { console.error('[AI] interpretFallback error', r.status, await r.text()); return null; }
    const j = await r.json();
    const raw = j?.choices?.[0]?.message?.content as string | undefined;
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const outcome: string = ['matched', 'distraction', 'unclear'].includes(parsed.outcome) ? parsed.outcome : 'unclear';
    const confidence = typeof parsed.confidence === 'number' ? parsed.confidence : 0;
    // No confiar en un "matched" de baja confianza -- degradar a "unclear" en vez de arriesgar.
    const safeOutcome = outcome === 'matched' && confidence < 0.72 ? 'unclear' : outcome;
    return {
      outcome: safeOutcome as FallbackInterpretation['outcome'],
      matched_value: safeOutcome === 'matched' && typeof parsed.matched_value === 'string' ? parsed.matched_value : null,
      reply_text: typeof parsed.reply_text === 'string' ? parsed.reply_text : null,
      confidence,
    };
  } catch (e) { console.error('[AI] interpretFallback error:', e); return null; }
}

async function logFallbackInterpretation(
  phone: string, state: string, userText: string, result: FallbackInterpretation | null
): Promise<void> {
  try {
    await db().from('ag_wa_fallback_interpretations').insert({
      wa_phone: phone,
      state,
      user_text: userText,
      outcome: result?.outcome ?? 'error',
      matched_value: result?.matched_value ?? null,
      reply_text: result?.reply_text ?? null,
      confidence: result?.confidence ?? null,
    });
  } catch (e) { console.error('[AI] logFallbackInterpretation error:', e); }
}

// ─── Preguntar el barrio/sector ANTES del GPS (solo origen) ──────────────────
// Pedido explícito del usuario 2026-08-28: zonas grandes tipo "Ciudadela Juan
// Atalaya" agrupan decenas de barrios reales (ej. "Comuneros") que ni Mapbox
// ni OpenStreetMap tienen mapeados como subdivisión propia -- confirmado con
// datos reales (ver reverseGeocode). Solo aplica al punto de RECOGIDA, nunca
// al destino (pedido explícito) -- ahí sí importa que el conductor llegue al
// barrio exacto; para el destino basta con las coordenadas.
// `kind` decide qué mensaje mandar DESPUÉS de que el pasajero responda el
// barrio (ver el bloque `state === 'awaiting_barrio'`), porque cada camino
// que llega hasta acá necesitaba antes un mensaje ligeramente distinto:
// - 'self': quien escribe es quien viaja -- botón nativo de compartir GPS.
// - 'traveler_relay': el viaje es para alguien más que no tiene el teléfono
//   en la mano -- se le pide reenviar la ubicación de esa persona, no hay
//   botón nativo porque ese botón comparte el GPS de QUIEN LO TOCA.
// - 'package': domicilio/flete, después de ya haber anotado qué se envía.
type OriginPromptKind = 'self' | 'traveler_relay' | 'package';
async function askOriginBarrio(
  phone: string,
  kind: OriginPromptKind,
  travelerName?: string | null,
  packageDesc?: string | null,
): Promise<void> {
  await upsertSession(phone, { state: 'awaiting_barrio', pending_location_kind: kind });
  const who = kind === 'traveler_relay' ? `está ${travelerName ?? 'esa persona'}` : 'estás';
  const prefix = packageDesc ? `Anotado: _"${packageDesc}"_\n\n` : '';
  await sendText(phone,
    `${prefix}📍 *¿En qué barrio o sector ${who}?*\n\n` +
    `_(ej: "Comuneros", "El Bosque", "Centro") -- así el conductor ubica mejor la zona._`
  );
}

// ─── Combinar el barrio que escribió el pasajero con lo que detecta el GPS ───
// NUNCA reemplaza lo que ya venía (calle, zona/barrio automático, ciudad) --
// pedido explícito del usuario: "no le quites la zona grande... sino que lo
// complementamos". Si el barrio escrito ya aparece dentro de la dirección
// (ej. el GPS sí lo detectó solo esta vez), no se duplica.
function combineWithBarrioHint(addr: string, hint?: string | null): string {
  const h = hint?.trim();
  if (!h) return addr;
  if (addr.toLowerCase().includes(h.toLowerCase())) return addr;
  const parts = addr.split(', ');
  if (parts.length >= 2) {
    // Justo después de la calle (parts[0]), antes de la zona/barrio
    // automático y la ciudad -- "calle, [barrio del pasajero], zona grande
    // automática, ciudad", sin repetir la palabra "barrio" (se veía raro
    // repetida cuando también hay zona automática -- pedido explícito).
    parts.splice(1, 0, h);
    return parts.join(', ');
  }
  // Sin suficientes segmentos para insertar con sentido (ej. coordenadas
  // crudas de respaldo cuando Mapbox no dio resultado) -- se agrega al
  // final, sigue siendo información útil aunque no quede en el orden ideal.
  return `${addr}, ${h}`;
}

// ─── Confirmar origen (reusado por el flujo clásico y el flujo inteligente) ───
async function presentOriginConfirm(phone: string, addr: string, lat: number, lng: number, session: Record<string, unknown>): Promise<void> {
  const forName = travelerLabel(session);
  const base = forName ? `📍 ¿Ahí está *${forName}*? (*${addr}*)` : `📍 ¿Estás en *${addr}*?`;
  // Botón limitado a 20 caracteres por WhatsApp (sendButtons trunca con
  // .slice(0,20) -- ver incidente real documentado más abajo en "En otro
  // lugar"), así que la explicación completa de qué hace "Editar" no cabe en
  // el título del botón. Se explica en el cuerpo del mensaje en su lugar
  // (2026-08-12, pedido del usuario): que sepa que si escribe su dirección
  // completa a mano, esa es la que le llega tal cual al conductor.
  // "¿No es exacta?" (versión anterior) se leía como una AFIRMACIÓN del bot
  // ("no es exacta") en vez de una pregunta real -- bug de UX real reportado
  // 2026-08-14: pasajeros que ya habían dado la dirección correcta la volvían
  // a escribir por pura confusión, pensando que el bot les estaba diciendo
  // que estaba mal. Redactado de nuevo sin ninguna pregunta ni negación: solo
  // informa qué hace el botón, sin insinuar que la dirección mostrada esté
  // incorrecta.
  const question = `${base}\n\n_Si prefieres escribir tu dirección exacta (calle, número, barrio), toca *Editar* y el conductor llega justo a la puerta._`;
  // Guardar la sesión y enviar el mensaje son operaciones independientes (ninguna
  // necesita el resultado de la otra) -- en paralelo en vez de en serie ahorra
  // un round-trip completo, parte del mismo fix de lentitud de 2026-08-11.
  await Promise.all([
    upsertSession(phone, {
      state: 'awaiting_origin_confirm',
      origin_lat: lat, origin_lng: lng, origin_address: addr,
    }),
    sendButtons(phone, question, [
      { id: 'origin_yes', title: '✅ Sí, confirmar' },
      { id: 'origin_no', title: '✏️ Editar dirección' },
    ]),
  ]);
}

// ─── Confirmar destino + precio sugerido (reusado por ambos flujos) ───────────
async function presentDestConfirm(
  phone: string, addr: string, lat: number | null, lng: number | null, session: Record<string, unknown>,
  precomputedRoute?: { distKm: number; durationMin: number },
): Promise<void> {
  const oLat = session.origin_lat as number;
  const oLng = session.origin_lng as number;
  let distKm = 0;
  let suggested = MIN_PRICE;
  if (lat != null && lng != null && oLat && oLng) {
    // precomputedRoute viene ya resuelto desde el webhook (lanzado en paralelo apenas se
    // conoce la sesión, ver serve() más abajo) -- ahorra un round-trip completo a Mapbox
    // Directions aquí, mismo patrón que ya usa precomputedAddr para el reverse-geocode.
    // Bug real reportado 2026-08-31 (tercera vez que "la ubicación es lenta"): la llamada a
    // Directions que agregó la recalibración de precio del día anterior corría en serie
    // DESPUÉS de reverseGeocode, sumando latencia nueva a cada ubicación compartida.
    const route = precomputedRoute ?? await getRouteDistanceDuration(oLat, oLng, lat, lng);
    distKm = route.distKm;
    suggested = await suggestPrice(distKm, session.service_type as string ?? 'carro', oLat, oLng, route.durationMin);
  }

  const distText = distKm > 0 ? ` (${distKm.toFixed(1)} km)` : '';
  const forName = travelerLabel(session);
  const base = isDeliveryService(session.service_type as string)
    ? `📍 ¿Ahí se debe entregar el paquete: *${addr}*?${distText}`
    : forName
      ? `📍 ¿${forName} va a *${addr}*?${distText}`
      : `📍 ¿Vas a *${addr}*?${distText}`;
  // Misma nota que en presentOriginConfirm: el título del botón no tiene
  // espacio (límite de 20 caracteres de WhatsApp) para explicar qué hace
  // "Editar", así que va en el cuerpo del mensaje.
  // "¿No es exacta?" (versión anterior) se leía como una AFIRMACIÓN del bot
  // ("no es exacta") en vez de una pregunta real -- bug de UX real reportado
  // 2026-08-14: pasajeros que ya habían dado la dirección correcta la volvían
  // a escribir por pura confusión, pensando que el bot les estaba diciendo
  // que estaba mal. Redactado de nuevo sin ninguna pregunta ni negación: solo
  // informa qué hace el botón, sin insinuar que la dirección mostrada esté
  // incorrecta.
  const question = `${base}\n\n_Si prefieres escribir tu dirección exacta (calle, número, barrio), toca *Editar* y el conductor llega justo a la puerta._`;

  // Guardar sesión + enviar mensaje en paralelo -- ver misma nota en
  // presentOriginConfirm.
  await Promise.all([
    upsertSession(phone, {
      state: 'awaiting_dest_confirm',
      dest_name: addr, dest_lat: lat ?? null, dest_lng: lng ?? null,
      offered_price: suggested, pending_dest_text: null,
    }),
    sendButtons(phone,
      question,
      [
        { id: 'dest_yes', title: '✅ Sí, confirmar' },
        { id: 'dest_no', title: '✏️ Editar dirección' },
      ]
    ),
  ]);
}

// ─── Servicios que aun no se pueden pedir por WhatsApp ────────────────────────
// "Ciudad a Ciudad" y "Flete" viven en tablas y flujos de precio totalmente
// distintos (cc_/fl_) que createWaTrip() no llena -- en vez de dejar la
// solicitud rota en silencio (nunca le llegaba nada al conductor), se avisa
// claro y se manda a la app, que si soporta esos dos completos.
// Play Store en vez del APK suelto de Supabase Storage (pedido explícito del
// usuario 2026-08-14, ya publicada -- ver memoria movi_play_store_link) --
// instalar un APK suelto activa la advertencia de Android de "fuente
// desconocida", Play Store es la señal de app oficial/seria que se quiere
// transmitir, además de dar actualizaciones automáticas. Se quita
// "pcampaignid=web_share" del link que pasó el usuario -- es solo un
// parámetro de tracking que agrega Google al compartir desde su propia app,
// no hace falta para que el link funcione.
const APP_DOWNLOAD_LINK = 'https://play.google.com/store/apps/details?id=com.publihazclick.movi';
async function sendUnsupportedServiceMessage(phone: string, svc: string): Promise<void> {
  await resetSession(phone);
  await sendText(phone,
    `${SERVICE_LABELS[svc] ?? svc} todavía no está disponible por este chat 😔\n\n` +
    `Por ahora ese servicio solo se puede pedir desde la app de Movi (Play Store):\n${APP_DOWNLOAD_LINK}\n\n` +
    `Escribe *hola* si quieres pedir un Carro, Moto o Domicilio por aquí.`
  );

  // Bug real reportado 2026-08-13: un pasajero con OTRO pedido en curso a la
  // vez que su viaje actual terminaba (ver "pedir otro vehículo" y
  // ag_wa_pending_ratings más abajo) escribió "5" pensando que estaba
  // calificando ese viaje ya terminado -- pero como su sesión seguía en
  // awaiting_service del segundo pedido, "5" se leyó como la opción de menú
  // "Flete" (no soportado por chat) en vez de la calificación, y su "5" se
  // perdió sin más. resetSession() ya deja la sesión libre acá mismo -- se
  // aprovecha para mostrar la calificación pendiente de una vez, en vez de
  // esperar a que el pasajero mande otro mensaje cualquiera para recién ahí
  // acordarse de pedírsela (ver presentIdleOrPendingRating, mismo criterio).
  await presentIdleOrPendingRating(phone, async () => {});
}

// ─── Arrancar el flujo a partir de una solicitud interpretada por IA ──────────
async function startSmartFlow(phone: string, parsed: ParsedRequest): Promise<void> {
  const svc = parsed.service_type as string;
  if (svc === 'ciudad' || svc === 'flete') { await sendUnsupportedServiceMessage(phone, svc); return; }
  const needsPackage = svc === 'domicilio' || svc === 'flete';

  if (needsPackage && !parsed.package_desc) {
    await upsertSession(phone, { state: 'awaiting_package_desc', service_type: svc, pending_dest_text: parsed.dest_text });
    await sendText(phone,
      `${SERVICE_LABELS[svc]} detectado ✨\n\nDescríbeme qué necesitas enviar/recoger:\n_(ej: "Ropa, bolsa pequeña")_`
    );
    return;
  }

  await upsertSession(phone, {
    service_type: svc,
    package_desc: parsed.package_desc ?? null,
    pending_dest_text: parsed.dest_text,
  });

  // "¿Para ti o para otra persona?" -- mismo paso nuevo que en el menú de
  // botones (awaiting_for_whom), por consistencia. Se pierde el atajo de
  // saltar directo a confirmar origen aunque parsed.origin_text ya lo traiga
  // (simplificación a propósito: es un caso raro -- lenguaje natural CON
  // origen explícito -- y evita duplicar la lógica de "otra persona" dos
  // veces con riesgo de que queden inconsistentes entre sí). El origen se
  // vuelve a pedir normal en awaiting_origin, sea para uno mismo o para otra
  // persona.
  await upsertSession(phone, { state: 'awaiting_for_whom', is_for_self: true, traveler_name: null, traveler_phone: null });
  await sendButtons(phone,
    `${SERVICE_LABELS[svc]} detectado ✨\n\n¿Este viaje es para ti o para otra persona?`,
    [
      { id: 'for_self', title: 'Para mí' },
      { id: 'for_other', title: 'Otra persona' },
    ]
  );
}

// ─── Invitar a instalar la app real tras un par de viajes por WhatsApp ────────
async function maybeOfferAppDownload(phone: string): Promise<void> {
  try {
    const supabase = db();
    const { count } = await supabase
      .from('ag_trip_requests')
      .select('id', { count: 'exact', head: true })
      .eq('wa_phone', toE164(phone))
      .eq('source', 'whatsapp')
      .eq('status', 'completed');
    if (count === 2) {
      await sendText(phone,
        `🚀 *Psst...* ya llevas 2 viajes con Movi por WhatsApp.\n\n` +
        `Con la app puedes ver el mapa en vivo, pagar más fácil y pedir en un toque. Descárgala gratis en Play Store:\n` +
        `${APP_DOWNLOAD_LINK}`
      );
    }
  } catch (e) { console.error('[WA] maybeOfferAppDownload error:', e); }
}

// ─── Presentar el programa de invitados tras el 1er viaje completado ─────────
// Pedido explícito del usuario 2026-08-14: contarle al pasajero que existe,
// justo en el mejor momento (viaje bueno, sin nada pendiente por responder) y
// separado del aviso de la app (que sale en el 2do viaje) para no juntar dos
// mensajes de venta el mismo día. Solo se manda UNA vez en la vida del
// número. El link es real -- se arma con el ag_user_id que ya existe desde
// que se creó la solicitud (createWaTrip -> ag_get_or_create_wa_user), no
// hace falta que haya instalado la app ni pasado por la web todavía.
async function maybeOfferReferralProgram(phone: string, agUserId: string | null): Promise<void> {
  if (!agUserId) return;
  try {
    const supabase = db();
    const { count } = await supabase
      .from('ag_trip_requests')
      .select('id', { count: 'exact', head: true })
      .eq('wa_phone', toE164(phone))
      .eq('source', 'whatsapp')
      .eq('status', 'completed');
    if (count === 1) {
      const link = await buildReferralLink(agUserId);
      // El texto explica QUÉ hace único al link (ligado a su cuenta, la misma
      // de este número de WhatsApp) para que entienda cómo el sistema sabe
      // que un invitado es suyo, sin tener que avisar nada a mano -- pedido
      // explícito del usuario: generar confianza, no solo anunciar el bono.
      await sendText(phone,
        `🎁 *¿Sabías que puedes ganar dinero invitando gente a Movi?*\n\n` +
        `Tienes un link 100% personal, único y ligado a tu cuenta (la misma de este número de WhatsApp) -- no hay otro igual. Cuando alguien se registra con él, el sistema ya sabe automáticamente que es tu invitado, sin que tengas que avisarnos nada.\n\n` +
        `Por cada servicio que esa persona complete -- sea que use Movi como pasajero o como conductor -- ganas el *2%, de por vida*.\n\n` +
        `Tu link:\n${link}\n\n` +
        `Compártelo por WhatsApp, redes o donde quieras 🙌`
      );
    }
  } catch (e) { console.error('[WA] maybeOfferReferralProgram error:', e); }
}

// ─── Menú de servicios ────────────────────────────────────────────────────────
// Botones nativos con los 3 servicios que hoy se pueden pedir completos por
// WhatsApp (carro/moto/domicilio comparten tabla y flujo). Ciudad a Ciudad y
// Flete siguen accesibles escribiéndolos -- viven en otro sistema, ver
// sendUnsupportedServiceMessage().
async function sendServiceButtons(phone: string, bodyText: string): Promise<void> {
  await sendButtons(phone, bodyText, [
    { id: 'svc_carro', title: '🚗 Carro' },
    { id: 'svc_moto', title: '🏍️ Moto' },
    { id: 'svc_domicilio', title: '📦 Domicilio' },
  ]);
}

// Punto único para mostrar el menú de servicios y dejar la sesión lista para
// recibirlo -- antes había 4 lugares que mandaban el menú, y 3 de ellos
// dejaban el estado en 'idle' en vez de 'awaiting_service'. El bloque idle
// ignora respuestas cortas (un dígito como "2"), así que el pasajero
// respondía el número que el bot le acababa de pedir y el bot lo descartaba
// en silencio, mandando el saludo de nuevo desde cero (bug real reportado
// 2026-08-11: "las opciones 2,3,4,5 no son coherentes").
async function presentServiceMenu(phone: string, bodyText: string, extraPatch: Record<string, unknown> = {}): Promise<void> {
  await upsertSession(phone, {
    state: 'awaiting_service',
    expires_at: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
    ...extraPatch,
  });
  await sendServiceButtons(phone, bodyText);
}

// ─── Normalizar respuestas sí/no ──────────────────────────────────────────────
// Ademas del match exacto de siempre, reconoce el titulo de los botones nativos
// ("✅ Aceptar a Mateo", "🔄 Buscar otro") que ahora reemplazan "responde 1/2"
// -- el titulo trae el nombre del conductor pegado y nunca calzaria exacto.
function isYes(t: string): boolean {
  const n = t.trim().toLowerCase();
  if (/^(si|sí|yes|ok|okay|1|✅|👍|dale|acepto|confirmo|listo|bueno|claro)$/i.test(n)) return true;
  return n.includes('aceptar') || n.includes('confirmar');
}
function isNo(t: string): boolean {
  const n = t.trim().toLowerCase();
  if (/^(no|nope|2|❌|👎|cambiar|editar|otro|incorrecta|mal)$/i.test(n)) return true;
  return n.includes('buscar otro') || n.includes('cambiar') || n.includes('editar');
}
function isCancel(t: string): boolean {
  // "cancela" (sin r) y "ya no quiero"/"no quiero" agregados 2026-08-14 --
  // formas muy naturales de cancelar que no calzaban (probado con cientos de
  // variantes reales). Sigue siendo match EXACTO del mensaje completo, no
  // substring, así que no hay riesgo de falso positivo con una dirección u
  // otra respuesta que contenga esas palabras de pasada.
  return /^(cancelar|cancela|cancel|salir|exit|ya no quiero|no quiero)$/i.test(t.trim());
}

// Saludos/reinicio -- antes vivían mezclados con isCancel() y borraban TODO el
// pedido en curso (incluido el servicio ya elegido) si el pasajero simplemente
// volvía a saludar a mitad de la conversación (ej: después de que fallaba la
// búsqueda de una dirección) -- bug real reportado 2026-08-10, se sentía como
// "le digo que quiero un carro y me lo vuelve a preguntar". Un saludo a mitad
// de flujo ya no cancela nada, solo recuerda en qué se quedó.
function isGreeting(t: string): boolean {
  return /^(menu|menú|inicio|start|hola|hi|hello|comenzar)$/i.test(t.trim());
}

// Humanización de saludos (2026-08-14, pedido explícito del usuario): un "buenos
// días"/"buenas tardes" siempre recibía el mismo texto fijo, lo que se sentía a
// automatización. Se rota entre variantes según la hora real de Colombia, y se
// personaliza con el nombre real de la cuenta cuando se conoce (nunca con el
// nombre de perfil de WhatsApp del pasajero -- ver nota en el flujo IDLE, eso
// ya se había descartado antes por poco preciso/profesional).
function bogotaHour(): number {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Bogota', hour: 'numeric', hour12: false }).formatToParts(new Date());
  return parseInt(parts.find(p => p.type === 'hour')?.value ?? '12', 10);
}
function greetingOpener(realName?: string | null): string {
  const h = bogotaHour();
  const period = h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches';
  const who = realName ? `, ${realName}` : '';
  const variants = [
    `¡Hola${who}! 👋`,
    `¡${period}${who}! 👋`,
    `¡${period}${who}!`,
    `¡Qué tal${who}! 👋`,
  ];
  return variants[Math.floor(Math.random() * variants.length)];
}
// Nombre real de la cuenta (si existe), NO el nombre de perfil de WhatsApp --
// solo el primer nombre, que suena más natural en un saludo corto.
async function lookupRealFirstName(phone: string): Promise<string | null> {
  try {
    const { data } = await db().from('ag_users').select('full_name').eq('phone', toE164(phone)).maybeSingle();
    const n = (data?.full_name as string | undefined)?.trim();
    return n ? n.split(' ')[0] : null;
  } catch (e) { console.error('[WA] lookupRealFirstName error:', e); return null; }
}

function isSos(t: string): boolean {
  return /^(sos|s\.o\.s\.?|ayuda|emergencia|auxilio|help)$/i.test(t.trim());
}
// Comando global para pedir un vehículo nuevo mientras otro ya va en curso --
// reconocido tanto del botón "🚗🏍️ Otro vehículo" (ver evento trip_started en
// handleInternalEvent) como si el pasajero lo escribe a mano. Pedido
// explícito del usuario 2026-08-12.
function isNewOrderRequest(t: string): boolean {
  const n = t.trim().toLowerCase();
  return n.includes('otro vehiculo') || n.includes('otro vehículo') ||
    n.includes('otro carro') || n.includes('otra moto') ||
    n.includes('nuevo pedido') || n.includes('nuevo viaje') || n.includes('pedir otro');
}

// Alguien pregunta por trabajar/registrarse como conductor pero le escribe al
// número de VIAJES (no al de soporte a conductores) -- bug real encontrado
// 2026-08-14: si mencionaba el vehículo ("quiero trabajar con mi moto") el
// intérprete de lenguaje natural lo tomaba como un pedido de viaje real y
// arrancaba el flujo de reserva. Se detecta ANTES de intentar interpretar el
// mensaje como pedido, y se redirige al número de conductores en vez de
// intentar responder esa lógica aquí también (ese número ya tiene su propio
// bot dedicado y probado a fondo para esto).
function isDriverJobInquiry(t: string): boolean {
  const n = t.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const strong = [
    'ser conductor', 'ser domiciliario', 'afili', 'vacante', 'reclut',
    'unirme', 'postularme', 'postular como', 'aplicar como conductor', 'como aplico',
    'registrarme como conductor', 'quiero ser conductor',
    'requisitos para ser conductor', 'requisitos para trabajar',
    'necesito trabajo', 'busco trabajo', 'busco empleo', 'necesito empleo',
    'contratan conductores', 'como entro a trabajar', 'como hago para trabajar',
    'como puedo trabajar', 'informacion para trabajar', 'quiero conducir con',
    'quiero conducir para', 'quiero manejar para', 'como me uno', 'quiero pertenecer',
    'parte del equipo', 'parte de movi',
  ];
  if (strong.some(p => n.includes(p))) return true;
  // "trabajar" solo es ambiguo (puede ser "voy para mi trabajo", un pedido de
  // viaje real) -- se exige que aparezca junto a una referencia a Movi,
  // conductor/domiciliario, o "mi" vehículo propio.
  if (!n.includes('trabaj')) return false;
  const qualifier = ['ustedes', 'uds', 'movi', 'conductor', 'domiciliario',
    'mi carro', 'mi moto', 'mi vehiculo', 'mi propio carro', 'mi propia moto'];
  return qualifier.some(q => n.includes(q));
}
function driverJobInquiryReply(): string {
  return `¡Qué bueno que quieras unirte a Movi! 🚗🏍️\n\n` +
    `Este número es solo para pedir viajes -- para todo lo de registro como conductor ` +
    `(requisitos, documentos, comisión, bonos) escríbenos directo aquí:\n` +
    `https://wa.me/${DRIVER_SUPPORT_PHONE}\n\n` +
    `Ahí te ayudamos con todo el proceso.`;
}

// ─── Disparar alerta SOS para un usuario de WhatsApp ──────────────────────────
// ag-sos-trigger (el mecanismo normal de la app) exige un JWT real de Supabase
// Auth y un user_id en auth.users -- los invitados de WhatsApp no tienen ninguno
// de los dos (son ag_users con is_wa_guest=true, sin cuenta de Auth). En vez de
// forzar esa tabla, se manda de una vez un aviso por WhatsApp a soporte (mismo
// número ya usado en la app) con la ubicación conocida, más un registro best-
// effort en ag_admin_notifications para que quede trazado.
async function triggerWaSos(phone: string, contactName: string, session: Record<string, unknown>): Promise<void> {
  const lat = session.origin_lat as number | null;
  const lng = session.origin_lng as number | null;
  const mapsLink = lat && lng ? `https://maps.google.com/?q=${lat},${lng}` : 'sin ubicación registrada';
  const tripId = session.trip_request_id as string | null;

  await sendText(toE164(SUPPORT_PHONE),
    `🆘 *ALERTA SOS — Pasajero por WhatsApp*\n\n` +
    `👤 ${contactName || 'Usuario'}\n` +
    `📱 ${toE164(phone)}\n` +
    `📍 ${mapsLink}\n` +
    (tripId ? `🚗 Viaje: ${tripId}\n` : '') +
    `Estado: ${session.state ?? 'idle'}`
  );

  try {
    const supabase = db();
    await supabase.from('ag_admin_notifications').insert({
      type:  'sos_whatsapp',
      ref_id: tripId ?? null,
      title: `SOS WhatsApp: ${contactName || toE164(phone)}`,
      body:  mapsLink,
    });
  } catch (e) { console.error('[WA] SOS notification insert error:', e); }

  await sendText(phone,
    `🆘 *Alerta enviada.*\n\nUn agente de Movi se pondrá en contacto contigo lo antes posible.\n\n` +
    `Si es una emergencia real, llama ya al *123*.`
  );
}

// ─── Máquina de estados ───────────────────────────────────────────────────────
async function handleConversation(
  phone: string,
  contactName: string,
  msgType: string,
  msgText: string,
  msgLat?: number,
  msgLng?: number,
  precomputedAddr?: string,
  precomputedSession?: Record<string, unknown> | null,
  precomputedRoute?: { distKm: number; durationMin: number },
) {
  // Recuperar o crear sesión -- precomputedSession viene ya resuelta desde el
  // webhook (en paralelo con markReadWithTyping/reverseGeocode, ver serve()),
  // así se evita un segundo round-trip a la DB por el mismo dato.
  let session = precomputedSession !== undefined ? (precomputedSession ?? { wa_phone: phone, state: 'idle' })
    : await getSession(phone) ?? { wa_phone: phone, state: 'idle' };

  // Sesión expirada → reset
  if (session.expires_at && new Date(session.expires_at) < new Date()) {
    await resetSession(phone);
    session = { wa_phone: phone, state: 'idle' };
  }

  // Si el viaje asociado a la sesión ya terminó (completado o cancelado por
  // cualquier vía, no solo las que el bot ya sabe reconocer), la conversación
  // no debe seguir atada a él -- se trata como un mensaje nuevo desde cero en
  // vez de arrastrar un estado de un viaje que ya no existe. awaiting_rating
  // se deja fuera de este chequeo porque tiene su propia lógica equivalente
  // más abajo (sigue pudiendo capturar la calificación si es justo eso lo
  // que responde el pasajero).
  if (session.trip_request_id && session.state && session.state !== 'idle' && session.state !== 'awaiting_rating') {
    const { data: tripCheck } = await db()
      .from('ag_trip_requests')
      .select('status')
      .eq('id', session.trip_request_id as string)
      .maybeSingle();
    if (tripCheck && (tripCheck.status === 'completed' || tripCheck.status === 'cancelled')) {
      await resetSession(phone);
      session = { wa_phone: phone, state: 'idle' };
    }
  }

  let state = (session.state as string | null | undefined) ?? 'idle';
  const text  = msgText.trim();

  // Si el pasajero está en el paso de "¿en qué barrio?" (ver askOriginBarrio)
  // pero de una vez comparte su ubicación GPS -- por costumbre, porque no
  // leyó el mensaje, o porque prefiere hacerlo así -- no tiene sentido
  // bloquearlo pidiéndole que primero escriba el barrio: se acepta la
  // ubicación directamente, igual que si ya hubiera estado en awaiting_origin.
  // Sin barrio agregado esta vez (queda null), simplemente no hay nada que
  // combinar en presentOriginConfirm.
  if (state === 'awaiting_barrio' && msgType === 'location' && msgLat != null && msgLng != null) {
    state = 'awaiting_origin';
  }

  // SOS reconocible en cualquier estado de la conversación, sin depender de
  // tener la app abierta ni de haber navegado ningún menú.
  if (isSos(text)) {
    await triggerWaSos(phone, contactName, session);
    return;
  }

  // Cancelar en cualquier estado -- awaiting_rating queda afuera a propósito:
  // ahí el viaje YA terminó, no hay nada que cancelar, y "cancelar" en ese
  // punto se reprocesa como mensaje nuevo (ver bloque awaiting_rating) en vez
  // de mostrar el falso "Solicitud cancelada" de un viaje ya completado.
  if (isCancel(text) && state !== 'idle' && state !== 'awaiting_rating') {
    const tripId = session.trip_request_id as string | null;
    let assignedDriverId: string | null = null;

    if (tripId) {
      // Marca el viaje real como cancelado -- antes esto SOLO reseteaba la
      // sesión de WhatsApp sin tocar ag_trip_requests, así que un conductor
      // ya buscando o YA ASIGNADO nunca se enteraba de la cancelación (el
      // viaje quedaba vivo en la base de datos indefinidamente, sin
      // reembolso de comisión, mientras el pasajero veía "cancelada") --
      // bug real reportado 2026-08-11. Mismo camino que usa la app
      // (cancelTripRequest() en anda-gana.service.ts): un UPDATE simple del
      // status, que el conductor recibe en tiempo real por su propia
      // suscripción y que dispara solo el reembolso ya existente
      // (trg_ag_trip_cancellation, migración 188). El filtro por status
      // evita pisar un viaje que ya haya llegado a completed/cancelled por
      // otro camino mientras el mensaje viajaba. .select() devuelve la fila
      // solo si el UPDATE de verdad afectó algo, sirve para saber si ya
      // había un conductor asignado (driver_id solo se llena al aceptar la
      // oferta -- ag_on_offer_accepted -- así que si viene null es porque
      // todavía nadie había aceptado, sin importar si ya se había mostrado
      // una oferta pendiente).
      const { data: cancelledTrip } = await db().from('ag_trip_requests')
        .update({
          status:        'cancelled',
          cancelled_at:  new Date().toISOString(),
          updated_at:    new Date().toISOString(),
          cancel_reason: 'Cancelado por el pasajero vía WhatsApp',
        })
        .eq('id', tripId)
        .in('status', ['searching', 'accepted'])
        .select('driver_id')
        .maybeSingle();
      assignedDriverId = cancelledTrip?.driver_id as string | null ?? null;
    }

    // Si ya había un conductor asignado y en camino, el trigger de "viaje ya
    // no disponible" (migración 181, ag_notify_drivers_trip_no_longer_available)
    // NO lo cubre -- ese solo reacciona cuando el viaje SEGUÍA buscando
    // (OLD.status = 'searching'), no cuando ya estaba 'accepted'. Sin este
    // aviso directo, el único mecanismo que le llegaba era la suscripción en
    // tiempo real de su propia app -- si la tenía cerrada o en segundo plano
    // seguía manejando hacia el punto de recogida sin enterarse nunca (mismo
    // tipo de hueco de "app cerrada" ya corregido antes para otros eventos
    // de este canal, ver movi_push_closed_app_drift_bug).
    const copy = svcCopy(session.service_type as string);
    if (assignedDriverId) {
      const supabase = db();
      const { data: driver } = await supabase.from('ag_drivers').select('ag_user_id').eq('id', assignedDriverId).maybeSingle();
      if (driver?.ag_user_id) {
        const { data: driverUser } = await supabase.from('ag_users').select('auth_user_id').eq('id', driver.ag_user_id as string).maybeSingle();
        if (driverUser?.auth_user_id) {
          fetch(`${SUPABASE_URL}/functions/v1/ag-send-push`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SERVICE_ROLE_KEY}` },
            body: JSON.stringify({
              user_ids: [driverUser.auth_user_id],
              title: '❌ El pasajero canceló',
              body:  copy.delivery ? 'Ya no necesitas recoger el paquete.' : 'Ya no necesitas ir a recogerlo.',
              url:   `/anda-gana`,
              tag:   `trip-${tripId}`,
              urgent: true,
            }),
          }).catch((e) => console.error('[WA] push aviso cancelacion a conductor error:', e));
        }
      }
    }

    await resetSession(phone);
    const driverName = session.driver_name as string | null;
    await presentIdleOrPendingRating(phone, () => presentServiceMenu(phone, assignedDriverId
      ? `Solicitud cancelada ❌\n\nLe avisamos a tu ${copy.driverNoun}${driverName ? ` (*${driverName}*)` : ''} que ya no necesitas el servicio.\n\n¿En qué más te ayudo?`
      : `Solicitud cancelada. ¿En qué te ayudo ahora?`));
    return;
  }

  // Pedir un vehículo nuevo mientras el actual ya va en curso -- solo se
  // permite cuando el viaje de la conversación activa YA NO necesita más
  // respuestas del pasajero para seguir: ya está en camino al destino
  // (in_trip con driver_stage on_route o más adelante -- la persona ya está
  // a bordo) o ya terminó del todo (awaiting_rating). En cualquier otro
  // estado (armando/confirmando ESTE pedido: eligiendo servicio, dirección,
  // esperando ofertas, etc.) se sigue bloqueando igual que siempre -- ahí sí
  // hace falta la respuesta del pasajero para poder continuar, y arrancar
  // un pedido paralelo sería confuso. Pedido explícito del usuario
  // 2026-08-12: "que pueda pedir otro vehículo apenas la otra persona esté
  // a bordo".
  if (isNewOrderRequest(text) && state !== 'idle') {
    let allowed = state === 'awaiting_rating';
    if (!allowed && state === 'in_trip' && session.trip_request_id) {
      const { data: currentTrip } = await db()
        .from('ag_trip_requests')
        .select('driver_stage')
        .eq('id', session.trip_request_id as string)
        .maybeSingle();
      allowed = !!currentTrip?.driver_stage &&
        ['on_route', 'arrived_at_destination', 'completed'].includes(currentTrip.driver_stage as string);
    }
    if (allowed) {
      // El viaje que queda en la sesión sigue vivo solo como filas de
      // ag_trip_requests/ag_trip_offers -- sus avisos futuros (llegada al
      // destino, ubicación en vivo, completado) ya no dependen de esta
      // sesión (ver handleInternalEvent, ahora usa el payload de cada
      // evento en vez de la sesión compartida), y "cancelar" nunca podrá
      // tocarlo porque trip_request_id deja de apuntarle desde ya.
      await resetSession(phone);
      await presentServiceMenu(phone, `¡Claro! 🚗 ¿Qué necesitas ahora?`);
      return;
    }
    // Todavía no se puede -- sigue al mensaje normal de "sigo aquí" de abajo.
  }

  // Saludo/reinicio a mitad de un pedido ya en curso -- ya NO cancela nada
  // (ver isGreeting arriba). Solo se le recuerda que sigue esperando su
  // respuesta anterior, sin perder el servicio/origen/destino ya elegidos.
  if (isGreeting(text) && state !== 'idle') {
    await sendText(phone, `¡Hola de nuevo! 👋 Sigo aquí, esperando tu respuesta anterior.\n\nEscribe *cancelar* si prefieres empezar de nuevo.`);
    return;
  }

  // ── IDLE / WELCOME ──────────────────────────────────────────────────────────
  if (state === 'idle') {
    // Preguntas de "quiero trabajar/ser conductor" se revisan ANTES de intentar
    // interpretar el mensaje como pedido de viaje -- ver isDriverJobInquiry.
    if (isDriverJobInquiry(text)) {
      await sendText(phone, driverJobInquiryReply());
      return;
    }
    // Si ya escribió/dictó una solicitud completa desde el primer mensaje
    // ("hola necesito un carro para el aeropuerto"), no obligarlo a repetirla.
    if (text.length >= 8) {
      const parsed = await parseFreeTextRequest(text);
      if (parsed?.service_type) {
        await startSmartFlow(phone, parsed);
        return;
      }
    }
    // No se usa el nombre de perfil de WhatsApp para saludar -- muchos
    // pasajeros tienen apodos o nombres que no son el suyo real como nombre
    // de contacto, y se veía poco profesional/impreciso (pedido explícito del
    // usuario 2026-08-10). Sí se usa el nombre REAL de la cuenta si ya existe.
    const realName = await lookupRealFirstName(phone);
    await presentServiceMenu(phone,
      `${greetingOpener(realName)} Soy *Leidy Guzmán,* servicio al cliente de *Movi.*\n¿En qué te ayudo hoy?\n\n` +
      `_¿Necesitas viaje urbano, domicilio, viaje de ciudad a ciudad o un flete? Selecciona la opción o escríbeme cuál._`,
      { contact_name: contactName }
    );
    return;
  }

  // ── AWAITING_SERVICE ────────────────────────────────────────────────────────
  if (state === 'awaiting_service') {
    // Mismo chequeo que en IDLE -- corre primero para que "quiero trabajar con
    // mi moto" nunca se cuele por el match de substring de abajo (que buscaría
    // "moto" dentro del texto y lo tomaría como si hubiera elegido ese servicio).
    if (isDriverJobInquiry(text)) {
      await sendText(phone, driverJobInquiryReply());
      return;
    }
    const map: Record<string, string> = {
      '1': 'carro', '2': 'moto', '3': 'domicilio', '4': 'ciudad', '5': 'flete',
      'carro': 'carro', 'moto': 'moto', 'domicilio': 'domicilio',
      'ciudad': 'ciudad', 'flete': 'flete',
    };
    const normalized = text.toLowerCase();
    // Coincidencia flexible: el número emoji (1️⃣) trae bytes invisibles pegados
    // al dígito, y algunos clientes de WhatsApp reenvían la línea completa del
    // menú ("1️⃣ 🚗 Carro") en vez de solo "1" al tocar una sugerencia rapida --
    // el match exacto original fallaba en ambos casos y mandaba "no entendí"
    // de vuelta con el mismo menú (bug real reportado 2026-08-09: el pasajero
    // respondía "1" y le llegaba el menú otra vez). Se prueba match exacto,
    // luego el primer dígito 1-5 en cualquier parte del texto, luego la
    // palabra clave del servicio en cualquier parte del texto.
    const digitMatch = normalized.match(/[1-5]/)?.[0];
    const svc = map[normalized]
      ?? (digitMatch ? map[digitMatch] : undefined)
      ?? Object.keys(SERVICE_LABELS).find(k => normalized.includes(k));
    if (!svc) {
      // Capa de lenguaje natural: intentar interpretar la frase completa antes
      // de rendirse con "no entendí".
      if (text.length >= 8) {
        const parsed = await parseFreeTextRequest(text);
        if (parsed?.service_type) {
          await startSmartFlow(phone, parsed);
          return;
        }
      }
      await sendServiceButtons(phone, `Creo que no te entendí bien 🤔 ¿cuál de estas necesitas?`);
      return;
    }

    if (svc === 'ciudad' || svc === 'flete') { await sendUnsupportedServiceMessage(phone, svc); return; }

    const needsPackage = svc === 'domicilio' || svc === 'flete';
    if (needsPackage) {
      await upsertSession(phone, { state: 'awaiting_package_desc', service_type: svc });
      await sendText(phone,
        `${SERVICE_LABELS[svc]} seleccionado.\n\n` +
        `Primero, descríbeme qué necesitas enviar/recoger:\n` +
        `_(ej: "Ropa, bolsa pequeña")_`
      );
    } else {
      // "¿Para ti o para otra persona?" -- solo aplica a Carro/Moto (viajes de
      // pasajero). Domicilio ya tiene su propio concepto de "destinatario"
      // (recipient_name/recipient_phone, quien recibe el paquete) -- distinto,
      // no se toca. Pedido explícito del usuario 2026-08-11.
      await upsertSession(phone, { state: 'awaiting_for_whom', service_type: svc, is_for_self: true, traveler_name: null, traveler_phone: null });
      await sendButtons(phone,
        `${SERVICE_LABELS[svc]} seleccionado 👍\n\n¿Este viaje es para ti o para otra persona?`,
        [
          { id: 'for_self', title: 'Para mí' },
          { id: 'for_other', title: 'Otra persona' },
        ]
      );
    }
    return;
  }

  // ── AWAITING_FOR_WHOM ────────────────────────────────────────────────────────
  if (state === 'awaiting_for_whom') {
    const n = text.trim().toLowerCase();
    const isForOther = n.includes('otra') || n.includes('otro');
    // Bug real encontrado 2026-08-14 probando cientos de variantes: "para mi
    // novia"/"para mi hijo"/"para mi mamá" caían aquí como "para mí" porque
    // "para m" es substring de todas esas frases -- el pasajero se saltaba
    // TODA la advertencia de responsabilidad y el registro de quién viaja de
    // verdad. El match rápido ahora exige que sea "para mí" SOLO (nada más
    // después), no cualquier frase que empiece así.
    // "pa mi" (forma coloquial de "para mí") -- bug encontrado en la ronda 2
    // de pruebas 2026-08-14: al exigir "para" completo, "pa mi" caía al
    // camino de IA y se malinterpretaba como "otra persona". "pa" se acepta
    // igual que "para" en todos los patrones.
    const isForSelfFast = !isForOther && (/^(para|pa)?\s*m[ií]\.?$/.test(n) || /^si,?\s*(es\s+)?(para|pa)?\s*m[ií]\.?$/.test(n) || /^es\s+(para|pa)\s+m[ií]\.?$/.test(n));
    let resolution: 'other' | 'self' | null = isForOther ? 'other' : isForSelfFast ? 'self' : null;
    let interpForWhom: FallbackInterpretation | null = null;
    if (!resolution) {
      // Cualquier cosa que no sea un match limpio ("para mi novia", una
      // distracción, etc.) se resuelve con IA antes de repetir el menú --
      // mismo patrón ya probado en awaiting_dest_confirm/awaiting_offer_response.
      interpForWhom = await interpretFallback({
        state,
        question: '¿Este viaje es para ti o para otra persona?',
        answerFormat: '"self" si el viaje es para quien escribe, "other" si es para alguien más aunque lo mencione indirectamente (ej. "para mi novia", "para mi hijo" son "other", NO "self"). En matched_value escribe exactamente "self" u "other".',
        userText: text,
      });
      await logFallbackInterpretation(phone, state, text, interpForWhom);
      if (interpForWhom?.outcome === 'matched' && (interpForWhom.matched_value === 'self' || interpForWhom.matched_value === 'other')) {
        resolution = interpForWhom.matched_value as 'self' | 'other';
      }
    }
    if (resolution === 'other') {
      await upsertSession(phone, { state: 'awaiting_liability_ack' });
      // Pedido explícito del usuario 2026-08-14: resaltar acá que la seguridad
      // de conductores Y pasajeros es la prioridad de Movi (conductores
      // verificados, pasajeros identificados) -- "aun así" conecta esa
      // tranquilidad con la advertencia de responsabilidad que sigue, sin
      // restarle peso: la plataforma ya hace su parte, pero quien pide el
      // servicio para otra persona sigue siendo responsable de a quién invita.
      await sendButtons(phone,
        `⚠️ *Importante antes de continuar*\n\n` +
        `En Movi lo más importante es la seguridad de conductores y pasajeros: todos nuestros conductores pasan por un proceso de verificación, y cada pasajero también queda identificado en la plataforma.\n\n` +
        `Aun así, al pedir el servicio para otra persona, *eres totalmente responsable* de cualquier daño físico o material que esa persona pueda causarle al conductor.\n\n` +
        `Te recomendamos pedirlo solo para personas de tu entera confianza.\n\n` +
        `¿Entiendes y aceptas esto?`,
        [
          { id: 'ack_yes', title: 'Sí, acepto' },
          { id: 'ack_no', title: 'Cancelar' },
        ]
      );
    } else if (resolution === 'self') {
      await askOriginBarrio(phone, 'self');
    } else {
      await sendButtons(phone, interpForWhom?.reply_text || `¿Es para ti o para otra persona?`, [
        { id: 'for_self', title: 'Para mí' },
        { id: 'for_other', title: 'Otra persona' },
      ]);
    }
    return;
  }

  // ── AWAITING_LIABILITY_ACK ───────────────────────────────────────────────────
  if (state === 'awaiting_liability_ack') {
    // Match a medida en vez de isYes/isNo -- esas funciones están afinadas para su
    // propio vocabulario ("aceptar"/"confirmar", no "acepto") y para "Cancelar" no
    // hay match en isNo() (ni exacto ni por substring), así que confiar en ellas
    // aquí dejaría este paso roto en silencio con el texto real de estos botones.
    const n = text.trim().toLowerCase();
    let liabilityDecision: 'yes' | 'no' | null =
      (n.includes('acepto') || n === 'si' || n === 'sí') ? 'yes' :
      (n.includes('cancelar') || n === 'no') ? 'no' : null;
    let interpLiability: FallbackInterpretation | null = null;
    if (!liabilityDecision) {
      // Bug real encontrado 2026-08-14: "de acuerdo" (sí) y "mejor no"/"no
      // quiero" (cancelar) -- respuestas naturales muy comunes -- no
      // calzaban con el match exacto y dejaban al pasajero atascado
      // repitiendo los mismos botones. También cubre preguntas de seguridad
      // genuinas ("¿esto es seguro?") que antes no tenían respuesta.
      interpLiability = await interpretFallback({
        state,
        question: '¿Entiendes y aceptas la responsabilidad por la otra persona?',
        answerFormat: 'sí (acepta la responsabilidad y continúa) o no (cancela). En matched_value escribe exactamente "yes" o "no".',
        userText: text,
      });
      await logFallbackInterpretation(phone, state, text, interpLiability);
      if (interpLiability?.outcome === 'matched' && (interpLiability.matched_value === 'yes' || interpLiability.matched_value === 'no')) {
        liabilityDecision = interpLiability.matched_value;
      }
    }
    if (liabilityDecision === 'yes') {
      await upsertSession(phone, { state: 'awaiting_traveler_name', is_for_self: false });
      await sendText(phone, `¿Cómo se llama la persona que viaja?`);
    } else if (liabilityDecision === 'no') {
      await upsertSession(phone, { state: 'awaiting_for_whom' });
      await sendButtons(phone, `Entendido. ¿Es para ti o para otra persona?`, [
        { id: 'for_self', title: 'Para mí' },
        { id: 'for_other', title: 'Otra persona' },
      ]);
    } else {
      await sendButtons(phone, interpLiability?.reply_text || `¿Entiendes y aceptas la responsabilidad por la otra persona?`, [
        { id: 'ack_yes', title: 'Sí, acepto' },
        { id: 'ack_no', title: 'Cancelar' },
      ]);
    }
    return;
  }

  // ── AWAITING_TRAVELER_NAME ───────────────────────────────────────────────────
  if (state === 'awaiting_traveler_name') {
    if (text.trim().length < 2) {
      await sendText(phone, `Por favor escribe el nombre de la persona que viaja.`);
      return;
    }
    // Bug real encontrado 2026-08-14 probando cientos de variantes: CUALQUIER
    // texto se guardaba tal cual como el nombre del pasajero -- alguien
    // preguntando "¿para qué necesitas el nombre?" en vez de responder
    // quedaba con esa pregunta literal guardada como su nombre, y así le
    // llegaba al conductor. Un primer intento filtraba solo frases con forma
    // de PREGUNTA, pero la ronda 2 de pruebas encontró que frases sin "?" ni
    // palabra interrogativa al inicio se seguían colando ("mi esposa", "no sé
    // todavía cómo se llama", "es privado eso") -- se guardaban tal cual, no
    // eran nombres reales. En vez de perseguir cada frase nueva con más
    // regex, se resuelve SIEMPRE con IA (mismo patrón ya probado en
    // awaiting_dest_confirm/awaiting_offer_response/awaiting_traveler_phone),
    // dejando que sea la IA la que decida si es de verdad un nombre.
    let travelerNameValue: string | null = null;
    const interpName = await interpretFallback({
      state,
      question: '¿Cómo se llama la persona que viaja?',
      answerFormat: 'el nombre de una persona (nombre y opcionalmente apellido). Si el mensaje NO es un nombre real (es una pregunta, una relación como "mi esposa" sin nombre propio, una negativa a responder, o cualquier comentario), es "distraction" o "unclear", nunca "matched". En matched_value, si sí es un nombre, escríbelo tal cual.',
      userText: text,
    });
    await logFallbackInterpretation(phone, state, text, interpName);
    if (interpName?.outcome === 'matched' && interpName.matched_value) {
      travelerNameValue = interpName.matched_value;
    } else if (interpName) {
      await sendText(phone, interpName.reply_text || `¿Cómo se llama la persona que viaja?`);
      return;
    } else {
      travelerNameValue = text.trim();
    }
    await upsertSession(phone, { state: 'awaiting_traveler_same_location', traveler_name: travelerNameValue });
    await sendButtons(phone, `¿${travelerNameValue} está contigo ahora mismo (misma ubicación)?`, [
      { id: 'same_loc_yes', title: 'Sí, está conmigo' },
      { id: 'same_loc_no', title: 'En otro lugar' },
    ]);
    return;
  }

  // ── AWAITING_TRAVELER_SAME_LOCATION ─────────────────────────────────────────
  if (state === 'awaiting_traveler_same_location') {
    const travelerName = (session.traveler_name as string) ?? 'esa persona';
    // Match a medida (ver misma nota en awaiting_liability_ack) -- "conmigo"/"otro
    // lugar" no calzan con el vocabulario de isYes()/isNo().
    //
    // BUG REAL 2026-08-11: el botón se llamaba "No, está en otro lugar" (22
    // caracteres) -- sendButtons() trunca el title a 20 con .slice(0,20) (límite
    // real de la API de WhatsApp), así que lo que llegaba de vuelta al tocarlo
    // era "No, está en otro lu" (sin "gar"). Ni el match de "otro lugar" ni el de
    // "no" calzaban con eso, así que caía siempre al else y reenviaba los MISMOS
    // botones -- el pasajero quedaba en un bucle sin poder avanzar. Se acortó el
    // título a "En otro lugar" (13 caracteres, con margen de sobra).
    const n = text.trim().toLowerCase();
    let sameLocDecision: 'yes' | 'no' | null =
      (n.includes('conmigo') || n === 'si' || n === 'sí') ? 'yes' :
      (n.includes('otro lugar') || n === 'no') ? 'no' : null;
    let interpSameLoc: FallbackInterpretation | null = null;
    if (!sameLocDecision) {
      // Bug real encontrado 2026-08-14: "aquí está" (sí) y "está en la casa"
      // (no, en otro lugar) -- respuestas naturales muy comunes -- no
      // calzaban con el match exacto y dejaban al pasajero atascado
      // repitiendo los mismos botones.
      interpSameLoc = await interpretFallback({
        state,
        question: `¿${travelerName} está contigo ahora mismo (misma ubicación)?`,
        answerFormat: 'sí (está en la misma ubicación de quien escribe) o no (está en otro lugar distinto). En matched_value escribe exactamente "yes" o "no".',
        userText: text,
      });
      await logFallbackInterpretation(phone, state, text, interpSameLoc);
      if (interpSameLoc?.outcome === 'matched' && (interpSameLoc.matched_value === 'yes' || interpSameLoc.matched_value === 'no')) {
        sameLocDecision = interpSameLoc.matched_value;
      }
    }
    if (sameLocDecision === 'yes') {
      await askOriginBarrio(phone, 'self');
    } else if (sameLocDecision === 'no') {
      await askOriginBarrio(phone, 'traveler_relay', travelerName);
    } else {
      await sendButtons(phone, interpSameLoc?.reply_text || `¿${travelerName} está contigo ahora mismo?`, [
        { id: 'same_loc_yes', title: 'Sí, está conmigo' },
        { id: 'same_loc_no', title: 'En otro lugar' },
      ]);
    }
    return;
  }

  // ── AWAITING_PACKAGE_DESC ───────────────────────────────────────────────────
  if (state === 'awaiting_package_desc') {
    // Mismo bug que en awaiting_traveler_name (2026-08-14), mismo fix
    // definitivo tras la ronda 2 de pruebas: filtrar solo frases con forma de
    // pregunta dejaba pasar comentarios sin "?" ni palabra interrogativa
    // ("tiene límite de peso", "es frío o normal"), que se guardaban tal cual
    // como si fueran la descripción real. Se resuelve SIEMPRE con IA.
    let packageDescValue: string | null = null;
    const interpPkg = await interpretFallback({
      state,
      question: 'Descríbeme qué necesitas enviar/recoger (ej: "Ropa, bolsa pequeña")',
      answerFormat: 'una descripción breve de un paquete/objeto a enviar. Si el mensaje NO describe un paquete (es una pregunta, un comentario), es "distraction" o "unclear", nunca "matched". En matched_value, si sí describe un paquete, escríbelo tal cual.',
      userText: text,
    });
    await logFallbackInterpretation(phone, state, text, interpPkg);
    if (interpPkg?.outcome === 'matched' && interpPkg.matched_value) {
      packageDescValue = interpPkg.matched_value;
    } else if (interpPkg) {
      await sendText(phone, interpPkg.reply_text || `Descríbeme qué necesitas enviar/recoger:\n_(ej: "Ropa, bolsa pequeña")_`);
      return;
    } else {
      packageDescValue = text;
    }
    await upsertSession(phone, { package_desc: packageDescValue });
    await askOriginBarrio(phone, 'package', undefined, packageDescValue);
    return;
  }

  // ── AWAITING_BARRIO ──────────────────────────────────────────────────────────
  // Ver askOriginBarrio() -- pregunta previa al GPS, solo para el origen.
  if (state === 'awaiting_barrio') {
    // Si el pasajero escribe "barrio Comuneros" en vez de solo "Comuneros",
    // se le quita la palabra "barrio" acá -- se guarda siempre el nombre
    // limpio, así después nunca queda repetida al combinarlo (ver
    // combineWithBarrioHint).
    const barrioText = text.trim().replace(/^barrio\s+/i, '').trim();
    if (barrioText.length < 2) {
      await sendText(phone, `Escríbeme el nombre del barrio o sector (ej: "Comuneros", "El Bosque").`);
      return;
    }
    const kind = (session.pending_location_kind as OriginPromptKind | null) ?? 'self';
    await upsertSession(phone, { state: 'awaiting_origin', origin_barrio_hint: barrioText, pending_location_kind: null });
    if (kind === 'traveler_relay') {
      const travelerName = (session.traveler_name as string) ?? 'esa persona';
      await sendText(phone,
        `📍 *¿Dónde está ${travelerName}?* (punto de recogida)\n\n` +
        `Envía su ubicación (pídele que te la comparta y reenvíala aquí) o escribe la dirección completa (calle y ciudad).`
      );
    } else if (kind === 'package') {
      await sendText(phone,
        `📍 *¿Dónde estás?* (punto de recogida)\n\n` +
        `Envía tu ubicación o escribe la dirección completa (calle y ciudad).`
      );
    } else {
      await sendLocationRequest(phone,
        `📍 *¿Dónde estás?*\n\n` +
        `Toca el botón para compartir tu ubicación actual, o escribe tu dirección completa (calle y ciudad).`
      );
    }
    return;
  }

  // ── AWAITING_ORIGIN ─────────────────────────────────────────────────────────
  if (state === 'awaiting_origin') {
    let lat: number | undefined;
    let lng: number | undefined;
    let addr = '';

    if (msgType === 'location' && msgLat != null && msgLng != null) {
      lat = msgLat; lng = msgLng;
      if (!isInColombia(lat, lng)) {
        await sendText(phone, `📍 Esa ubicación no parece estar en Colombia.\n\nEnvía tu ubicación actual o escribe tu dirección completa (calle, barrio y ciudad).`);
        return;
      }
      // precomputedAddr ya viene resuelto desde el webhook (se lanzó en paralelo
      // con markReadWithTyping, ver serve() más abajo) -- ahorra un round-trip
      // completo a Mapbox aquí, que era la causa real de la lentitud reportada
      // (bug real 2026-08-11, segunda vez: "la carga de la ubicación volvió a
      // ser lenta"). Si por lo que sea no llegó precalculada (ej. llamada desde
      // otro lugar), se calcula aquí como respaldo, igual que antes.
      addr = precomputedAddr ?? await reverseGeocode(lat, lng);
    } else if (text.length > 4) {
      const bias = await lastKnownCityBias(phone);
      const geo = await forwardGeocode(text, bias?.lat, bias?.lng);
      if (!geo) {
        await sendText(phone, `No encontré esa dirección 🔍\n\nIntenta ser más específico (calle, barrio y ciudad) o envía tu ubicación con el clip 📎.`);
        return;
      }
      if (!isInColombia(geo.lat, geo.lng)) {
        await sendText(phone, `📍 Esa dirección no está en Colombia. Escribe una dirección válida en Colombia.`);
        return;
      }
      // Se muestra/guarda literal lo que el pasajero escribió, no el
      // formatted_address de Google -- geo.lat/geo.lng (de ese mismo match)
      // siguen usándose para el mapa/ruta, pero el texto que confirma el
      // pasajero es exactamente el suyo (reportado 2026-08-12: la dirección
      // devuelta salía "un poco diferente" a la escrita).
      lat = geo.lat; lng = geo.lng; addr = text.trim();
    } else {
      await sendText(phone, `Por favor envía tu ubicación (📎 → Ubicación) o escribe la dirección completa (calle, barrio y ciudad).`);
      return;
    }

    // Complementa (nunca reemplaza) con el barrio que el pasajero ya escribió
    // a mano en awaiting_barrio -- ver combineWithBarrioHint().
    addr = combineWithBarrioHint(addr, session.origin_barrio_hint as string | undefined);
    await presentOriginConfirm(phone, addr, lat, lng, session);
    return;
  }

  // ── AWAITING_ORIGIN_CONFIRM ─────────────────────────────────────────────────
  if (state === 'awaiting_origin_confirm') {
    // Bug real encontrado 2026-08-14: "sii"/"siii"/"correcto"/"exacto" (sí) y
    // "no es ahí"/"está mal" (no) -- respuestas naturales muy comunes -- no
    // calzaban con isYes()/isNo() (match exacto) y dejaban al pasajero
    // atascado. Mismo mecanismo de IA ya probado en awaiting_dest_confirm
    // (su gemelo, que sí entendía estas mismas frases).
    let originDecision: 'yes' | 'no' | null = isYes(text) ? 'yes' : isNo(text) ? 'no' : null;
    let interpOriginConfirm: FallbackInterpretation | null = null;
    if (!originDecision) {
      const originAddr = (session.origin_address as string) ?? 'esa dirección';
      interpOriginConfirm = await interpretFallback({
        state,
        question: `¿Confirmas que tu ubicación es "${originAddr}"?`,
        answerFormat: 'sí (confirma que la dirección está correcta) o no (quiere cambiar/corregir la dirección). En matched_value escribe exactamente "yes" o "no".',
        userText: text,
      });
      await logFallbackInterpretation(phone, state, text, interpOriginConfirm);
      if (interpOriginConfirm?.outcome === 'matched' && (interpOriginConfirm.matched_value === 'yes' || interpOriginConfirm.matched_value === 'no')) {
        originDecision = interpOriginConfirm.matched_value;
      }
    }
    if (originDecision === 'yes') {
      // Viaje para otra persona: falta su número de celular antes de seguir a
      // destino -- se pide acá, una sola vez (traveler_phone todavía vacío),
      // justo después de confirmar dónde se recoge. pending_dest_text (atajo
      // de lenguaje natural) se conserva en la sesión tal cual y se resuelve
      // normalmente apenas vuelva de awaiting_traveler_phone.
      if (session.is_for_self === false && !session.traveler_phone) {
        const travelerName = (session.traveler_name as string) ?? 'esa persona';
        await upsertSession(phone, { state: 'awaiting_traveler_phone' });
        await sendText(phone, `📱 ¿Cuál es el número de celular de *${travelerName}*? (para que el conductor pueda ubicarla si hace falta)`);
        return;
      }

      // Flujo inteligente: si ya sabíamos el destino desde el mensaje original
      // en lenguaje natural, saltar directo a confirmarlo en vez de preguntar.
      const pendingDest = session.pending_dest_text as string | null;
      if (pendingDest) {
        const geo = await forwardGeocode(pendingDest, session.origin_lat as number, session.origin_lng as number);
        if (geo && isInColombia(geo.lat, geo.lng)) {
          // pendingDest ya es literal lo que escribió/dijo el pasajero (la
          // frase de destino extraída del mensaje original) -- mismo criterio
          // que en awaiting_origin/awaiting_dest, no usar geo.address.
          await presentDestConfirm(phone, pendingDest, geo.lat, geo.lng, session);
          return;
        }
        await upsertSession(phone, { pending_dest_text: null });
      }

      await upsertSession(phone, { state: 'awaiting_dest' });
      await sendText(phone,
        `¡Perfecto! 🎯\n\n` +
        `📍 *${destQuestionText(session)}*\n\n` +
        `Envía la ubicación de destino o escribe la dirección.`
      );
    } else if (originDecision === 'no') {
      await upsertSession(phone, { state: 'awaiting_origin', origin_lat: null, origin_lng: null, origin_address: null });
      await sendText(phone,
        `Entendido. 📍 Envía tu ubicación actual o escribe la dirección completa (calle, barrio y ciudad).`
      );
    } else {
      await sendText(phone, interpOriginConfirm?.reply_text || `Responde *si* para confirmar o *no* para cambiar la dirección.`);
    }
    return;
  }

  // ── AWAITING_TRAVELER_PHONE ──────────────────────────────────────────────────
  if (state === 'awaiting_traveler_phone') {
    let digits = text.replace(/\D/g, '');
    if (digits.length < 7) {
      // Piloto de interpretación humana (2026-08-11): antes de repetir el mensaje
      // de siempre, un intento con IA por si el usuario sí dio un celular válido
      // pero en un formato que el regex no reconoció, o se distrajo con otra cosa.
      const travelerName = (session.traveler_name as string) ?? 'la persona que viaja';
      const interp = await interpretFallback({
        state,
        question: `¿Cuál es el número de celular de ${travelerName}?`,
        answerFormat: 'un número de celular colombiano (normalmente 10 dígitos empezando por 3; puede venir con espacios, guiones, paréntesis o el prefijo +57). En matched_value escribe el número limpio, solo dígitos.',
        userText: text,
      });
      await logFallbackInterpretation(phone, state, text, interp);
      if (interp?.outcome === 'matched' && interp.matched_value) {
        digits = interp.matched_value.replace(/\D/g, '');
      }
      if (digits.length < 7) {
        await sendText(phone, interp?.reply_text || `Ese número no parece válido. Escribe el celular de la persona que viaja (solo números).`);
        return;
      }
    }
    await upsertSession(phone, { traveler_phone: digits });

    // Mismo flujo que el "sí" de awaiting_origin_confirm (atajo de lenguaje
    // natural si ya se conocía el destino, si no preguntar destino normal) --
    // duplicado a propósito en vez de factorizarlo, para no arriesgar tocar
    // ese camino ya probado hoy con el resto de la sesión.
    const pendingDest = session.pending_dest_text as string | null;
    if (pendingDest) {
      const geo = await forwardGeocode(pendingDest, session.origin_lat as number, session.origin_lng as number);
      if (geo && isInColombia(geo.lat, geo.lng)) {
        // Igual que en el otro camino de arriba: literal lo que escribió el
        // pasajero, no geo.address.
        await presentDestConfirm(phone, pendingDest, geo.lat, geo.lng, session);
        return;
      }
      await upsertSession(phone, { pending_dest_text: null });
    }

    await upsertSession(phone, { state: 'awaiting_dest' });
    await sendText(phone,
      `¡Perfecto! 🎯\n\n` +
      `📍 *${destQuestionText(session)}*\n\n` +
      `Envía la ubicación de destino o escribe la dirección.`
    );
    return;
  }

  // ── AWAITING_DEST ───────────────────────────────────────────────────────────
  if (state === 'awaiting_dest') {
    let lat: number | undefined;
    let lng: number | undefined;
    let addr = '';

    if (msgType === 'location' && msgLat != null && msgLng != null) {
      lat = msgLat; lng = msgLng;
      addr = precomputedAddr ?? await reverseGeocode(lat, lng);
    } else if (text.length > 4) {
      const geo = await forwardGeocode(text, session.origin_lat as number, session.origin_lng as number);
      if (!geo) {
        // dest_lat/dest_lng son NOT NULL en ag_trip_requests -- antes esto dejaba
        // pasar la direccion en texto plano sin coordenadas y la solicitud nunca
        // se creaba (fallaba en silencio al final del flujo). Se exige coordenadas
        // igual que ya se exige en el origen.
        await sendText(phone, `No encontré esa dirección 🔍\n\nIntenta ser más específico o envía tu ubicación con el clip 📎.`);
        return;
      }
      // Mismo criterio que en awaiting_origin: literal lo escrito por el
      // pasajero, no el formatted_address de Google.
      lat = geo.lat; lng = geo.lng; addr = text.trim();
    } else {
      await sendText(phone, `Escribe la dirección de destino o envía la ubicación con el clip 📎.`);
      return;
    }

    // precomputedRoute solo aplica al camino de ubicación compartida (msgType==='location')
    // -- para una dirección escrita el destino recién se resuelve arriba (forwardGeocode), no
    // había forma de haberlo precalculado antes de llegar aquí.
    const routeForConfirm = msgType === 'location' ? precomputedRoute : undefined;
    await presentDestConfirm(phone, addr, lat ?? null, lng ?? null, session, routeForConfirm);
    return;
  }

  // ── AWAITING_DEST_CONFIRM ───────────────────────────────────────────────────
  if (state === 'awaiting_dest_confirm') {
    // Piloto de interpretación humana (2026-08-11): si el match rápido de
    // isYes/isNo no calza, un intento con IA antes de repetir el mensaje de
    // siempre -- el resultado solo decide CUÁL de los dos caminos ya probados
    // (confirmar / cambiar) correr, nunca cambia lo que cada uno hace.
    let decision: 'yes' | 'no' | null = isYes(text) ? 'yes' : isNo(text) ? 'no' : null;
    let interp: FallbackInterpretation | null = null;
    if (!decision) {
      const destName = (session.dest_name as string) ?? 'ese destino';
      interp = await interpretFallback({
        state,
        question: `¿Confirmas que el destino es "${destName}"?`,
        answerFormat: 'sí (confirma que el destino está correcto) o no (quiere cambiar/corregir el destino). En matched_value escribe exactamente "yes" o "no".',
        userText: text,
      });
      await logFallbackInterpretation(phone, state, text, interp);
      if (interp?.outcome === 'matched' && (interp.matched_value === 'yes' || interp.matched_value === 'no')) {
        decision = interp.matched_value;
      }
    }

    if (decision === 'yes') {
      const suggested = session.offered_price as number ?? MIN_PRICE;
      const delivery = isDeliveryService(session.service_type as string);
      // Piso recomendado (no obligatorio -- el único mínimo que de verdad bloquea
      // sigue siendo MIN_PRICE en awaiting_price, esto es solo lo que se muestra):
      // 75.23% del precio sugerido, pedido explícito del usuario 2026-08-19 para
      // desincentivar ofertas muy bajas por conciencia con los conductores.
      // Redondeado hacia ARRIBA al múltiplo de 500 más cercano -- nunca puede
      // quedar por debajo del 75.23% exacto, solo igual o por encima.
      const recommendedMin = Math.max(MIN_PRICE, Math.ceil(suggested * 0.7523 / 500) * 500);
      await upsertSession(phone, { state: 'awaiting_price' });
      await sendText(phone,
        `Destino confirmado ✅\n\n` +
        (delivery ? `💰 *¿Cuánto ofreces por este envío?*\n\n` : `💰 *¿Cuánto ofreces por este viaje?*\n\n`) +
        `Precio sugerido: *$${suggested.toLocaleString('es-CO')}*\n\n` +
        `_Te recomendamos, por conciencia y solidaridad con nuestros conductores que están dispuestos a prestarte el mejor servicio, no ofrecer menos de $${recommendedMin.toLocaleString('es-CO')} -- son conductores que día a día buscan, después de una larga jornada, llevar el sustento a sus hogares. Gracias por tu comprensión 🙏_\n\n` +
        `• Escribe un monto (ej: *${recommendedMin.toLocaleString('es-CO')}*)\n` +
        `• O escribe *ok* para usar el precio sugerido`
      );
    } else if (decision === 'no') {
      await upsertSession(phone, { state: 'awaiting_dest', dest_name: null, dest_lat: null, dest_lng: null });
      await sendText(phone, `Entendido. ${destQuestionText(session)} Escribe la dirección o envía la ubicación de destino.`);
    } else {
      await sendText(phone, interp?.reply_text || `Responde *si* para confirmar el destino o *no* para cambiarlo.`);
    }
    return;
  }

  // ── AWAITING_PRICE ──────────────────────────────────────────────────────────
  if (state === 'awaiting_price') {
    const suggested = session.offered_price as number ?? MIN_PRICE;
    // Mismo cálculo que en awaiting_dest_confirm (75.23% del precio sugerido,
    // redondeado hacia ARRIBA al múltiplo de 500) -- pedido explícito del
    // usuario 2026-08-19: pasó de ser solo una recomendación en el texto a ser
    // el mínimo real que se exige aquí, en vez de MIN_PRICE (que sigue siendo
    // el piso absoluto de la plataforma, pero recommendedMin siempre es igual
    // o mayor).
    const recommendedMin = Math.max(MIN_PRICE, Math.ceil(suggested * 0.7523 / 500) * 500);
    let price = suggested;

    if (!isYes(text)) {
      const parsed = parseInt(text.replace(/\D/g, ''), 10);
      if (isNaN(parsed) || parsed < recommendedMin) {
        // Bug real encontrado 2026-08-14: números en palabras ("diez mil") no
        // se entendían (quitar todo lo que no es dígito deja vacío), y
        // formatos mixtos ("10 mil pesos") se leían MAL como $10 en vez de
        // $10.000 (el "mil"/"pesos" se descartaba, solo quedaba el "10").
        // También cubre preguntas genuinas sobre el precio antes de rendirse
        // con el mensaje genérico de "monto mínimo".
        const delivery = isDeliveryService(session.service_type as string);
        const interpPrice = await interpretFallback({
          state,
          question: `¿Cuánto ofreces por este ${delivery ? 'envío' : 'viaje'}? (precio sugerido: $${suggested.toLocaleString('es-CO')})`,
          answerFormat: `un monto en pesos colombianos como número entero sin puntos ni decimales (ej: si dice "diez mil" o "10 mil pesos", matched_value debe ser "10000"). Debe ser al menos ${recommendedMin}. Si el mensaje no es un monto (es una pregunta o comentario), es "distraction" o "unclear", nunca "matched".`,
          userText: text,
        });
        await logFallbackInterpretation(phone, state, text, interpPrice);
        const aiParsed = interpPrice?.outcome === 'matched' && interpPrice.matched_value
          ? parseInt(interpPrice.matched_value.replace(/\D/g, ''), 10) : NaN;
        if (!isNaN(aiParsed) && aiParsed >= recommendedMin) {
          price = aiParsed;
        } else {
          // Si la IA reconoció la intención (ej. una pregunta genuina sobre el
          // precio) se prioriza su respuesta contextual; si no, el mensaje fijo
          // explica el nuevo mínimo obligatorio.
          await sendText(phone, interpPrice?.reply_text ||
            `El monto mínimo que aceptamos es $${recommendedMin.toLocaleString('es-CO')} 🚫\n\n` +
            `Así cuidamos que la ganancia sea justa para el conductor.\n\n` +
            `Escribe un monto de al menos $${recommendedMin.toLocaleString('es-CO')}, o *ok* para usar el precio sugerido ($${suggested.toLocaleString('es-CO')}).`
          );
          return;
        }
      } else {
        price = parsed;
      }
    }

    await upsertSession(phone, { offered_price: price, state: 'matching', matching_started_at: new Date().toISOString() });

    // Crear el viaje en la DB
    const tripId = await createWaTrip({ ...session, offered_price: price });
    if (!tripId) {
      await sendText(phone, `Hubo un error al crear tu solicitud 😔\nIntenta de nuevo o escribe *cancelar*.`);
      return;
    }

    await upsertSession(phone, { trip_request_id: tripId });

    const svc = SERVICE_LABELS[session.service_type as string] ?? 'Servicio';
    const delivery = isDeliveryService(session.service_type as string);
    const forName = travelerLabel(session);
    await sendText(phone,
      (delivery
        ? `🔍 Buscando mensajero disponible...\n\n`
        : forName
          ? `🔍 Buscando conductores cerca de *${forName}*...\n\n`
          : `🔍 Buscando conductores cerca de ti...\n\n`) +
      `${svc}\n` +
      `📍 Desde: ${session.origin_address}\n` +
      `📍 Hasta: ${session.dest_name}\n` +
      `💰 Tu oferta: *$${price.toLocaleString('es-CO')}*\n\n` +
      `Te avisamos cuando alguien acepte. Máx. 5 minutos.\n` +
      `Escribe *cancelar* si deseas cancelar la solicitud.\n\n` +
      `✅ ¡Solicitud enviada!`
    );
    return;
  }

  // ── MATCHING ─────────────────────────────────────────────────────────────────
  if (state === 'matching') {
    // Verificar si el viaje ya fue aceptado
    const tripId = session.trip_request_id as string;
    if (tripId) {
      const supabase = db();
      const { data: trip } = await supabase
        .from('ag_trip_requests')
        .select('status')
        .eq('id', tripId)
        .single();
      if (trip?.status === 'accepted') {
        // Self-heal: la sesión se quedó en 'matching' aunque el viaje ya fue
        // aceptado -- normalmente presentOffer() la pasa a 'awaiting_offer_response'
        // y luego a 'in_trip', pero si el evento offer_received nunca llegó (ej. el
        // webhook estuvo devolviendo 401 durante el incidente de verify_jwt de esta
        // misma sesión) esta sesión se queda huérfana. Antes esto mandaba el mismo
        // texto genérico para SIEMPRE en cada mensaje, sin dejar nunca llegar al
        // bloque IN_TRIP -- así que el pasajero no podía pedir ubicación en vivo ni
        // usar "a bordo"/"ya lo entregué" (bug real reportado 2026-08-11). Se
        // reconstruye la sesión con los datos reales del conductor y se avanza a
        // in_trip de una vez, igual que hace la aceptación normal.
        const { data: fullTrip } = await supabase
          .from('ag_trip_requests')
          .select('driver_id, final_price, offered_price')
          .eq('id', tripId)
          .maybeSingle();

        let driverName: string | null = null;
        let driverPhone: string | null = null;
        let driverVeh = '';
        let driverPlate: string | null = null;
        if (fullTrip?.driver_id) {
          const { data: driver } = await supabase.from('ag_drivers')
            .select('vehicle_brand, vehicle_model, vehicle_color, plate, ag_user_id')
            .eq('id', fullTrip.driver_id as string).maybeSingle();
          if (driver) {
            driverVeh   = [driver.vehicle_brand, driver.vehicle_model, driver.vehicle_color].filter(Boolean).join(' ');
            driverPlate = driver.plate as string ?? null;
            const { data: user } = await supabase.from('ag_users')
              .select('full_name, phone').eq('id', driver.ag_user_id as string).maybeSingle();
            driverName  = user?.full_name as string ?? null;
            driverPhone = user?.phone as string ?? null;
          }
        }

        await upsertSession(phone, {
          state: 'in_trip',
          driver_name: driverName, driver_phone: driverPhone,
          driver_vehicle: driverVeh || null, driver_plate: driverPlate,
          driver_price: (fullTrip?.final_price as number) ?? (fullTrip?.offered_price as number) ?? null,
        });

        const emoji = svcCopy(session.service_type as string).vehicleEmoji;
        await sendText(phone,
          `🎉 ¡Ya tienes conductor asignado!\n\n` +
          (driverName ? `*${driverName}*\n` : '') +
          (driverVeh   ? `${emoji} ${driverVeh}` : '') +
          (driverPlate ? ` · ${driverPlate}` : '') +
          `\n\nEscribe *cancelar* si necesitas cancelar el viaje.`
        );
        return;
      }

      // Chequeo oportunista: puede haber una oferta pendiente que llegó
      // mientras el pasajero estaba ocupado respondiendo otra (o que el
      // aviso push no alcanzó a llegar) — no debe perderse.
      const nextOffer = await fetchNextPendingOffer(tripId);
      if (nextOffer) {
        await presentOffer(phone, { ...nextOffer, service_type: session.service_type, for_name: travelerLabel(session) });
        return;
      }
    }

    // Timeout de respaldo (12 minutos = las 3 rondas de 4 min que ya maneja el
    // cron ag_wa_stale_search_check, migración 241). El aviso proactivo real
    // (con el número de conductores que vieron la solicitud y los botones
    // seguir buscando/subir oferta/cancelar) ya lo manda ese cron sin depender
    // de que el pasajero escriba nada -- este bloque solo queda como red de
    // seguridad para cuando el pasajero SÍ escribe algo mientras espera (ej.
    // "cancelar", o cualquier otro mensaje) y para el caso raro en que el cron
    // no haya podido correr.
    const matchStart = session.matching_started_at ? new Date(session.matching_started_at as string) : new Date();
    const elapsedMin = (Date.now() - matchStart.getTime()) / 60000;
    if (elapsedMin > 12) {
      // Cancelar el viaje en DB si existe
      const tripId = session.trip_request_id as string;
      if (tripId) {
        const supabase = db();
        await supabase.from('ag_trip_requests')
          .update({
            status:        'cancelled',
            cancelled_at:  new Date().toISOString(),
            updated_at:    new Date().toISOString(),
            cancel_reason: 'Cancelado automáticamente — nadie aceptó en 12 minutos',
          })
          .eq('id', tripId)
          .eq('status', 'searching');
      }
      await resetSession(phone);
      const noneFoundNoun = isDeliveryService(session.service_type as string) ? 'mensajero disponible' : 'conductores disponibles';
      await presentServiceMenu(phone,
        `😔 No encontramos ${noneFoundNoun} en este momento.\n\n` +
        `Puedes intentarlo de nuevo ya mismo o en unos minutos.`
      );
      return;
    }

    const minLeft = Math.ceil(12 - elapsedMin);
    const waitingNoun = isDeliveryService(session.service_type as string) ? 'mensajero' : 'conductores';
    await sendText(phone, `⏳ Buscando ${waitingNoun}... (${minLeft} min restantes)\n\nEscribe *cancelar* para cancelar.`);
    return;
  }

  // ── STALE_SEARCH_CONFIRM ─────────────────────────────────────────────────────
  // Responde al aviso proactivo de "nadie ha aceptado tu solicitud todavía"
  // (disparado por el evento interno 'stale_search_check', ver handleInternalEvent
  // más abajo) -- botones "Seguir buscando" / "Subir oferta" / "Cancelar".
  if (state === 'stale_search_confirm') {
    const tripId   = session.trip_request_id as string;
    const delivery = isDeliveryService(session.service_type as string);

    let decision: 'keep' | 'raise' | 'cancel' | null = null;
    if (/subir\s*oferta/i.test(text)) decision = 'raise';
    else if (/seguir\s*buscando/i.test(text) || isYes(text)) decision = 'keep';
    else if (/cancelar/i.test(text) || isNo(text)) decision = 'cancel';

    let interp: FallbackInterpretation | null = null;
    if (!decision) {
      interp = await interpretFallback({
        state,
        question: `Tu solicitud sigue sin conductor. ¿Qué quieres hacer: seguir buscando, subir la oferta, o cancelar?`,
        answerFormat: 'matched_value debe ser exactamente "keep" (seguir buscando), "raise" (subir oferta) o "cancel" (cancelar).',
        userText: text,
      });
      await logFallbackInterpretation(phone, state, text, interp);
      if (interp?.outcome === 'matched' && ['keep', 'raise', 'cancel'].includes(interp.matched_value ?? '')) {
        decision = interp.matched_value as 'keep' | 'raise' | 'cancel';
      }
    }

    if (decision === 'cancel') {
      if (tripId) {
        const supabase = db();
        await supabase.from('ag_trip_requests')
          .update({
            status:        'cancelled',
            cancelled_at:  new Date().toISOString(),
            updated_at:    new Date().toISOString(),
            cancel_reason: 'Cancelado por el pasajero — nadie había aceptado',
          })
          .eq('id', tripId)
          .eq('status', 'searching');
      }
      await resetSession(phone);
      await presentServiceMenu(phone, `Solicitud cancelada ❌\n\nCuando quieras, vuelve a intentarlo.`);
      return;
    }

    if (decision === 'keep') {
      if (tripId) {
        // Reenvía la notificación real a conductores cercanos -- mismo push que
        // se manda al crear el viaje, para que de verdad vuelvan a sonar los
        // celulares de quienes no se dieron cuenta la primera vez.
        await db().rpc('ag_rebroadcast_trip_request', { p_trip_id: tripId });
      }
      await upsertSession(phone, { state: 'matching', matching_started_at: new Date().toISOString() });
      const noun = delivery ? 'mensajeros' : 'conductores';
      await sendText(phone, `🔍 Seguimos buscando ${noun} cerca de ti...\n\nTe avisamos apenas alguien acepte.`);
      return;
    }

    if (decision === 'raise') {
      // Rediseño 2026-08-30 (migración 243): antes esto aplicaba +15% a ciegas sin preguntar.
      // Ahora se sugiere un monto (mismos pasos que la app, ver _raiseOfferSuggested) y el
      // pasajero puede aceptarlo o escribir el suyo -- ver estado stale_raise_offer_amount.
      const { data: trip } = await db().from('ag_trip_requests')
        .select('offered_price').eq('id', tripId).maybeSingle();
      const current = (trip?.offered_price as number) ?? MIN_PRICE;
      const suggested = _raiseOfferSuggested(current);
      await upsertSession(phone, { state: 'stale_raise_offer_amount', offered_price: current });
      await sendText(phone,
        `Tu oferta actual es *$${current.toLocaleString('es-CO')}*.\n\n` +
        `Para llamar más la atención de los ${delivery ? 'mensajeros' : 'conductores'}, podrías subir a *$${suggested.toLocaleString('es-CO')}*.\n\n` +
        `• Escribe el monto que quieras ofrecer\n` +
        `• O escribe *ok* para usar $${suggested.toLocaleString('es-CO')}`
      );
      return;
    }

    await sendText(phone, interp?.reply_text ||
      `Responde:\n*Seguir buscando* — seguimos intentando\n*Subir oferta* — ofrecer un poco más para captar más atención\n*Cancelar* — cancelar la solicitud`
    );
    return;
  }

  // ── STALE_RAISE_OFFER_AMOUNT ─────────────────────────────────────────────────
  // Procesa el monto para "Subir oferta" (migración 243) -- mismo patrón ya probado
  // que usa awaiting_price: acepta *ok* para el sugerido, un monto escrito (con
  // interpretFallback de respaldo para texto libre tipo "diez mil"), exige que sea
  // mayor al actual, y si es mucho mayor pide confirmar antes de aplicarlo.
  if (state === 'stale_raise_offer_amount') {
    const tripId   = session.trip_request_id as string;
    const delivery = isDeliveryService(session.service_type as string);
    const current  = session.offered_price as number ?? MIN_PRICE;
    const suggested = _raiseOfferSuggested(current);

    let newAmount: number | null = isYes(text) ? suggested : null;
    let interp: FallbackInterpretation | null = null;

    if (newAmount == null) {
      const parsed = parseInt(text.replace(/\D/g, ''), 10);
      if (!isNaN(parsed)) {
        newAmount = parsed;
      } else {
        const interpAmount = await interpretFallback({
          state,
          question: `¿A cuánto quieres subir tu oferta? (actual: $${current.toLocaleString('es-CO')}, sugerido: $${suggested.toLocaleString('es-CO')})`,
          answerFormat: `un monto en pesos colombianos como número entero sin puntos ni decimales (ej: si dice "diez mil" o "10 mil pesos", matched_value debe ser "10000"). Debe ser mayor a ${current}. Si el mensaje no es un monto (es una pregunta o comentario), es "distraction" o "unclear", nunca "matched".`,
          userText: text,
        });
        await logFallbackInterpretation(phone, state, text, interpAmount);
        interp = interpAmount;
        if (interpAmount?.outcome === 'matched' && interpAmount.matched_value) {
          newAmount = parseInt(interpAmount.matched_value.replace(/\D/g, ''), 10);
        }
      }
    }

    if (newAmount == null || isNaN(newAmount)) {
      await sendText(phone, interp?.reply_text ||
        `No entendí el monto 🤔\n\nEscribe un número (ej: *${suggested.toLocaleString('es-CO')}*), o *ok* para usar el sugerido.`
      );
      return;
    }

    if (newAmount <= current) {
      await sendText(phone,
        `Ese monto debe ser mayor a tu oferta actual de *$${current.toLocaleString('es-CO')}* 🚫\n\n` +
        `Escribe un monto más alto, o *ok* para usar $${suggested.toLocaleString('es-CO')}.`
      );
      return;
    }

    if (newAmount > current * RAISE_OFFER_SANITY_MULTIPLIER) {
      await upsertSession(phone, { state: 'stale_raise_offer_confirm_high', pending_raise_amount: newAmount });
      await sendText(phone,
        `Eso es *$${newAmount.toLocaleString('es-CO')}* — bastante más que tu oferta actual de *$${current.toLocaleString('es-CO')}*. ¿Seguro?\n\n` +
        `Escribe *confirmar* para aplicarlo, o escribe otro monto.`
      );
      return;
    }

    await _applyRaisedOffer(phone, tripId, current, newAmount, delivery);
    return;
  }

  // ── STALE_RAISE_OFFER_CONFIRM_HIGH ───────────────────────────────────────────
  if (state === 'stale_raise_offer_confirm_high') {
    const tripId   = session.trip_request_id as string;
    const delivery = isDeliveryService(session.service_type as string);
    const current  = session.offered_price as number ?? MIN_PRICE;
    const pending  = session.pending_raise_amount as number | null;

    if (isYes(text) || /confirmar/i.test(text)) {
      if (pending == null) {
        // Red de seguridad: si por algo se perdió el monto pendiente, vuelve a pedirlo en vez
        // de aplicar un número inexistente.
        await upsertSession(phone, { state: 'stale_raise_offer_amount' });
        await sendText(phone, `Se me perdió ese monto 😅\n\nEscribe de nuevo cuánto quieres ofrecer.`);
        return;
      }
      await _applyRaisedOffer(phone, tripId, current, pending, delivery);
      return;
    }

    // Cualquier otra respuesta descarta el monto alto y vuelve a preguntar, sin perder el hilo.
    await upsertSession(phone, { state: 'stale_raise_offer_amount', pending_raise_amount: null });
    const suggested = _raiseOfferSuggested(current);
    await sendText(phone,
      `Ok, no se aplicó ese monto.\n\n` +
      `Escribe otro monto, o *ok* para usar $${suggested.toLocaleString('es-CO')}.`
    );
    return;
  }

  // ── AWAITING_OFFER_RESPONSE ──────────────────────────────────────────────────
  if (state === 'awaiting_offer_response') {
    const offerId  = session.active_offer_id as string;
    const tripId   = session.trip_request_id as string;

    // Piloto de interpretación humana (2026-08-11): mismo patrón que
    // awaiting_dest_confirm -- la IA solo decide cuál camino ya probado correr,
    // nunca toca la lógica de aceptar/rechazar la oferta en sí.
    let decision: 'yes' | 'no' | null = isYes(text) ? 'yes' : isNo(text) ? 'no' : null;
    let interp: FallbackInterpretation | null = null;
    if (!decision) {
      const driverNounEarly = svcCopy(session.service_type as string).driverNoun;
      interp = await interpretFallback({
        state,
        question: `¿Aceptas al ${driverNounEarly} ${session.driver_name} por $${(session.driver_price as number ?? 0).toLocaleString('es-CO')}?`,
        answerFormat: 'sí (acepta esta oferta) o no (la rechaza y sigue buscando otra). En matched_value escribe exactamente "yes" o "no".',
        userText: text,
      });
      await logFallbackInterpretation(phone, state, text, interp);
      if (interp?.outcome === 'matched' && (interp.matched_value === 'yes' || interp.matched_value === 'no')) {
        decision = interp.matched_value;
      }
    }

    if (decision === 'yes') {
      if (offerId && tripId) {
        const supabase = db();
        const { error } = await supabase.rpc('ag_wa_accept_offer', {
          p_offer_id: offerId,
          p_trip_request_id: tripId,
        });
        if (error) {
          await sendText(phone, `Uy, no pude confirmar la oferta 😔 ¿me confirmas de nuevo tocando "Aceptar"?`);
          return;
        }
        await upsertSession(phone, { state: 'in_trip' });
        const oLat = session.origin_lat as number;
        const oLng = session.origin_lng as number;
        const emoji = svcCopy(session.service_type as string).vehicleEmoji;
        await sendText(phone,
          `🎉 ¡Listo! *${session.driver_name}* va para allá.\n\n` +
          (session.driver_vehicle ? `${emoji} ${session.driver_vehicle}` : '') +
          (session.driver_plate   ? ` · ${session.driver_plate}` : '') +
          `\n💰 Acordaron *$${(session.driver_price as number ?? 0).toLocaleString('es-CO')}*` +
          // Bug real reportado 2026-08-11 (varias veces): esta línea mandaba
          // SUPPORT_PHONE (el número "de soporte" hardcodeado en el archivo) --
          // que en este entorno de pruebas es EL MISMO número real del
          // conductor de prueba, así que el pasajero terminaba viendo el
          // celular real del conductor de todos modos. Nunca debía darse un
          // número aquí: ya existe llamada enmascarada (escribir "llamar",
          // ver más abajo en el estado in_trip) y puente de chat en ambos
          // sentidos (cualquier texto libre en este mismo chat le llega al
          // conductor) -- ninguno expone el número real de nadie.
          `\n📱 Si necesitas contactarlo, escribe *llamar* o mándale un mensaje aquí mismo` +
          `\n\nTe aviso apenas llegue.`
        );
        // Ubicación nativa del punto de recogida -- mismo motivo que el
        // seguimiento en vivo: un mapa real en el chat, no un link.
        if (oLat && oLng) await sendLocation(phone, oLat, oLng, travelerLabel(session) ? 'Punto de recogida' : 'Tu punto de recogida');
      }
    } else if (decision === 'no') {
      // Rechazar esta oferta y seguir buscando
      if (offerId) {
        const supabase = db();
        await supabase.from('ag_trip_offers')
          .update({ status: 'rejected' })
          .eq('id', offerId);
      }

      // Antes de volver a esperar, ¿ya hay otra oferta pendiente (de otro
      // conductor) esperando en la cola? Si sí, mostrarla de una vez en vez
      // de perderla / esperar a que llegue un nuevo aviso.
      const nextOffer = tripId ? await fetchNextPendingOffer(tripId) : null;
      if (nextOffer) {
        await presentOffer(phone, { ...nextOffer, service_type: session.service_type, for_name: travelerLabel(session) }, 'Oferta rechazada ❌\n\n');
        return;
      }

      await upsertSession(phone, {
        state: 'matching',
        active_offer_id: null,
        driver_name: null, driver_price: null, driver_phone: null,
        driver_vehicle: null, driver_plate: null,
        matching_started_at: new Date().toISOString(),
      });
      await sendText(phone,
        `Oferta rechazada ❌\n\nSiguiendo la búsqueda...\nTe avisamos cuando haya un nuevo ${svcCopy(session.service_type as string).driverNoun} disponible.`
      );
    } else {
      const driverNoun = svcCopy(session.service_type as string).driverNoun;
      await sendText(phone, interp?.reply_text ||
        `Responde:\n*1* o *si* — aceptar al ${driverNoun} ${session.driver_name}\n*2* o *no* — buscar otro ${driverNoun}`
      );
    }
    return;
  }

  // ── IN_TRIP ──────────────────────────────────────────────────────────────────
  if (state === 'in_trip') {
    const delivery    = isDeliveryService(session.service_type as string);
    const driverNoun  = svcCopy(session.service_type as string).driverNoun;

    // Llamada enmascarada: el pasajero escribe "llamar"/"llámame" y Telnyx lo llama
    // primero a él, y cuando contesta lo conecta con el conductor -- ninguno de los
    // dos ve el número real del otro. Simetría con el botón "Llamar" del conductor en
    // la app (callPassengerFromTrip -> ag-masked-call), que para este mismo caso
    // (pasajero invitado de WhatsApp, sin auth_user_id) cae al mismo mecanismo de
    // Telnyx -- pedido explícito del usuario 2026-08-11. Se revisa ANTES que el
    // puente de chat de más abajo para que "llamar" no se reenvíe como si fuera un
    // mensaje de texto normal.
    if (/^llam/i.test(text.trim())) {
      const tripId = session.trip_request_id as string | null;
      if (tripId) {
        const supabase = db();
        const { data: trip } = await supabase
          .from('ag_trip_requests')
          .select('driver_id')
          .eq('id', tripId)
          .maybeSingle();
        const { data: driver } = trip?.driver_id
          ? await supabase.from('ag_drivers').select('ag_user_id').eq('id', trip.driver_id as string).maybeSingle()
          : { data: null };
        const { data: driverUser } = driver?.ag_user_id
          ? await supabase.from('ag_users').select('phone').eq('id', driver.ag_user_id as string).maybeSingle()
          : { data: null };

        // La llamada enmascarada marca por PSTN de verdad (Telnyx) -- necesita
        // un número real, no sirve con un BSUID (pasajero con "username" de
        // WhatsApp activado, sin número visible). Se avisa claro en vez de
        // intentar marcar un identificador que no es un teléfono.
        if (isBsuid(phone)) {
          await sendText(phone, `No podemos hacer la llamada porque tu WhatsApp no comparte tu número 😔\n\nEscríbele por aquí en el chat, o desactiva el nombre de usuario en Ajustes de WhatsApp para poder llamarte.`);
        } else if (driverUser?.phone) {
          const result = await startMaskedCall(toE164(phone), toE164(driverUser.phone as string));
          await sendText(phone, result.ok
            ? `📞 Te estamos llamando... contesta y te conectamos con tu ${driverNoun}.`
            : `No pudimos iniciar la llamada 😔 Intenta de nuevo en unos segundos.`);
        } else {
          await sendText(phone, `No encontramos el número de tu ${driverNoun} 😔`);
        }
        return;
      }
    }

    // Confirmación de "ya estoy a bordo" (pasajero) / "ya se lo entregué"
    // (domicilio) -- botón que sale junto al aviso de llegada del conductor
    // (ver evento driver_arrived). Le avisa al conductor por push nativo
    // (mismo canal que las solicitudes nuevas, ya llega con la app cerrada)
    // que ya puede arrancar. Match por texto (no por id de botón) porque el
    // resto del bot ya sigue ese mismo patrón (ver isYes/isNo) y así también
    // funciona si el pasajero lo escribe a mano en vez de tocar el botón.
    if (/a bordo|entregu[eé]/i.test(text)) {
      const tripId = session.trip_request_id as string | null;
      if (tripId) {
        const supabase = db();
        const { data: trip } = await supabase
          .from('ag_trip_requests')
          .select('driver_id, driver_stage, status, origin_lat, origin_lng')
          .eq('id', tripId)
          .maybeSingle();

        // driver_stage YA en on_route (o más adelante) -- esta confirmación
        // ya se procesó antes (por WhatsApp o por la app), no repetir el
        // aviso ni la validación de GPS.
        const alreadyStarted = trip?.driver_stage && ['on_route', 'picked_up', 'arrived_at_destination', 'completed'].includes(trip.driver_stage as string);

        if (trip?.driver_id && trip.status === 'accepted' && !alreadyStarted) {
          // Antes esto SOLO guardaba passenger_boarded_at -- nunca tocaba
          // driver_stage, así que el viaje se quedaba atascado en
          // heading_to_pickup/arrived_at_pickup para siempre: la app del
          // conductor nunca activaba la navegación al destino, y el viaje
          // jamás podía llegar a completarse de verdad (bug real reportado
          // 2026-08-11 -- "que inicie el viaje de ambos lados, igual que en
          // la app"). En la app, CUALQUIERA de los dos lados (pasajero o
          // conductor) dispara la misma transición llamando al RPC
          // ag_advance_trip_stage(trip_id, 'on_route') -- verificado en
          // 200_ag_fix_advance_trip_stage_columns.sql. No se puede invocar
          // ese RPC tal cual desde acá porque valida auth.uid() contra
          // ag_users.auth_user_id, y los pasajeros invitados de WhatsApp no
          // tienen cuenta de Auth (mismo motivo por el que SOS tampoco usa
          // el RPC normal, ver triggerWaSos). Se replica su misma lógica con
          // el cliente de service role: misma tolerancia GPS (300m contra la
          // ubicación real del conductor, igual que reverseGeocode/
          // asksLocation ya usan en este archivo) y mismo WHERE
          // status='accepted', para que el resultado en la base de datos sea
          // idéntico sin importar por cuál canal se confirmó.
          let gpsBlocked = false;
          if (trip.origin_lat != null && trip.origin_lng != null) {
            const { data: loc } = await supabase
              .from('ag_driver_locations')
              .select('lat, lng')
              .eq('driver_id', trip.driver_id as string)
              .maybeSingle();
            if (loc?.lat != null && loc?.lng != null) {
              const distKm = haversineKm(loc.lat as number, loc.lng as number, trip.origin_lat as number, trip.origin_lng as number);
              if (distKm > 0.3) gpsBlocked = true;
            }
          }

          if (gpsBlocked) {
            await sendText(phone, `Todavía no detectamos a tu ${driverNoun} cerca del punto de recogida 📍\n\nEsperen a que esté más cerca y vuelve a intentarlo.`);
            return;
          }

          await supabase.from('ag_trip_requests')
            .update({
              driver_stage: 'on_route',
              passenger_boarded_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq('id', tripId)
            .eq('status', 'accepted');

          const { data: driver } = await supabase
            .from('ag_drivers').select('ag_user_id').eq('id', trip.driver_id as string).maybeSingle();
          if (driver?.ag_user_id) {
            const { data: driverUser } = await supabase
              .from('ag_users').select('auth_user_id').eq('id', driver.ag_user_id as string).maybeSingle();
            if (driverUser?.auth_user_id) {
              fetch(`${SUPABASE_URL}/functions/v1/ag-send-push`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SERVICE_ROLE_KEY}` },
                body: JSON.stringify({
                  user_ids: [driverUser.auth_user_id],
                  title: delivery ? '📦 Ya te entregaron el paquete' : '🚗 Tu pasajero ya está a bordo',
                  body:  'Puedes arrancar hacia el destino.',
                  url:   `/anda-gana?trip_request_id=${tripId}`,
                  tag:   `board-${tripId}`,
                }),
              }).catch((e) => console.error('[WA] push aviso a bordo error:', e));
            }
          }
        }
        {
          const forNameBoard = travelerLabel(session);
          await sendText(phone, delivery
            ? `¡Listo! 📦 Ya le avisamos a tu mensajero que puede salir.`
            : forNameBoard
              ? `¡Buen viaje para *${forNameBoard}*! 🚗 Esperamos que sea de su agrado 😊`
              : `¡Buen viaje! 🚗 Esperamos que este viaje sea de tu agrado 😊`);
        }
        return;
      }
    }

    // Antes cualquier mensaje en este estado recibía la misma respuesta
    // genérica -- si el pasajero pregunta por su conductor en lenguaje
    // natural ("dónde está", "cuánto falta", "ya casi llega?"), se le
    // reenvía la ubicación en vivo real en vez de "tu viaje está en curso".
    const asksLocation = /d[oó]nde|ubicaci[oó]n|cu[aá]nto falta|ya lleg|falta mucho|est[aá] cerca|cuanto (se )?demora/i.test(text);
    if (asksLocation) {
      const tripId = session.trip_request_id as string | null;
      if (tripId) {
        const supabase = db();
        const { data: trip } = await supabase
          .from('ag_trip_requests')
          .select('driver_id, driver_stage')
          .eq('id', tripId)
          .maybeSingle();
        if (trip?.driver_id) {
          const { data: loc } = await supabase
            .from('ag_driver_locations')
            .select('lat, lng')
            .eq('driver_id', trip.driver_id as string)
            .maybeSingle();
          if (loc?.lat != null && loc?.lng != null) {
            const stage = trip.driver_stage as string ?? '';
            const forName = travelerLabel(session);
            const label = stage === 'heading_to_pickup'
              ? (delivery ? 'Va en camino a recoger tu paquete' : forName ? `Va en camino a recoger a ${forName}` : 'Va en camino a recogerte')
              : stage === 'arrived_at_pickup'
                ? 'Llegó al punto de recogida'
                : 'Va en camino';
            await sendLocation(phone, loc.lat as number, loc.lng as number, `Tu ${driverNoun}`, label);
            return;
          }
        }
      }
    }
    // Chat: cualquier texto libre que llega hasta acá (no era "a bordo", no
    // era una pregunta de ubicación) se trata como un mensaje real para el
    // conductor -- antes se perdía en el mismo texto genérico de abajo.
    // Se inserta en ag_chat_messages, la MISMA tabla que ya usa el chat de la
    // app, así aparece en la conversación real del conductor y no como un
    // canal aparte (pedido explícito del usuario 2026-08-11: puente de chat
    // completo en ambos sentidos). El sentido contrario, conductor -> WA, lo
    // resuelve el trigger de la migración 212 (ag_wa_chat_relay_to_passenger_fn).
    if (msgType === 'text' && text.length > 0) {
      const tripId         = session.trip_request_id as string | null;
      const senderAgUserId = session.ag_user_id as string | null;
      if (tripId && senderAgUserId) {
        const supabase = db();
        const { data: trip } = await supabase
          .from('ag_trip_requests')
          .select('driver_id')
          .eq('id', tripId)
          .maybeSingle();

        if (trip?.driver_id) {
          await supabase.from('ag_chat_messages').insert({
            request_id: tripId,
            sender_ag_user_id: senderAgUserId,
            message: text,
          });

          // Push directo -- el chat de la app solo tiene suscripción en
          // tiempo real (sirve solo con la app abierta), igual que ya se
          // hace para "a bordo" y para avisar cancelaciones -- para que le
          // llegue al conductor aunque tenga la app cerrada.
          const { data: driver } = await supabase
            .from('ag_drivers').select('ag_user_id').eq('id', trip.driver_id as string).maybeSingle();
          if (driver?.ag_user_id) {
            const { data: driverUser } = await supabase
              .from('ag_users').select('auth_user_id').eq('id', driver.ag_user_id as string).maybeSingle();
            if (driverUser?.auth_user_id) {
              fetch(`${SUPABASE_URL}/functions/v1/ag-send-push`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SERVICE_ROLE_KEY}` },
                body: JSON.stringify({
                  user_ids: [driverUser.auth_user_id],
                  title: delivery ? '💬 Mensaje sobre tu domicilio' : '💬 Mensaje de tu pasajero',
                  body:  text.slice(0, 150),
                  url:   `/anda-gana?trip_request_id=${tripId}`,
                  tag:   `chat-${tripId}`,
                }),
              }).catch((e) => console.error('[WA] push chat a conductor error:', e));
            }
          }

          await sendText(phone, `✅ Le avisamos a tu ${driverNoun}.`);
          return;
        }
      }
    }

    await sendText(phone, delivery
      ? `Tu envío está en curso 📦\n\nEscribe *llamar* para hablar con tu ${driverNoun}, o *cancelar* si tienes algún problema.`
      : `Tu viaje está en curso 🚗\n\nEscribe *llamar* para hablar con tu ${driverNoun}, o *cancelar* si tienes algún problema.`);
    return;
  }

  // ── AWAITING_RATING ─────────────────────────────────────────────────────────
  if (state === 'awaiting_rating') {
    if (/^(omitir|saltar|no|skip)$/i.test(text)) {
      await resetSession(phone);
      await presentIdleOrPendingRating(phone, async () => {
        await sendText(phone,
          `Sin problema 👍\n\n` +
          `En Movi no descansamos: estamos disponibles las 24 horas del día, todos los días, para viajes urbanos, domicilios, viajes de ciudad a ciudad o fletes.\n` +
          `Cuando quieras, escríbeme *hola* y te atiendo personalmente.`
        );
        await maybeOfferReferralProgram(phone, session.ag_user_id as string | null);
        await maybeOfferAppDownload(phone);
      });
      return;
    }

    const stars = parseInt(text, 10);
    if (!Number.isInteger(stars) || stars < 1 || stars > 5 || !/^\d+$/.test(text)) {
      // El viaje ya terminó -- si lo que responde no es una calificación (ej.
      // ya está pidiendo un viaje nuevo), no lo dejamos atascado insistiendo
      // con "responde un número": se reprocesa como un mensaje nuevo desde
      // cero, igual que si la sesión ya estuviera en idle.
      await resetSession(phone);
      await handleConversation(phone, contactName, msgType, msgText, msgLat, msgLng);
      return;
    }

    const tripId       = session.trip_request_id as string | null;
    const raterUserId  = session.ag_user_id as string | null;
    if (tripId && raterUserId) {
      const supabase = db();
      const { data: trip } = await supabase.from('ag_trip_requests').select('driver_id').eq('id', tripId).maybeSingle();
      if (trip?.driver_id) {
        const { data: driver } = await supabase.from('ag_drivers').select('ag_user_id').eq('id', trip.driver_id as string).maybeSingle();
        if (driver?.ag_user_id) {
          await supabase.from('ag_trip_ratings').upsert({
            trip_request_id: tripId,
            rated_by_role:   'passenger',
            rater_user_id:   raterUserId,
            rated_user_id:   driver.ag_user_id,
            stars,
          }, { onConflict: 'trip_request_id,rated_by_role' });
        }
      }
    }

    await resetSession(phone);
    await presentIdleOrPendingRating(phone, async () => {
      await sendText(phone,
        `¡Gracias por calificar al conductor! ${'⭐'.repeat(stars)}\n\n` +
        `En Movi no descansamos: estamos disponibles las 24 horas del día, todos los días, para viajes urbanos, domicilios, viajes de ciudad a ciudad o fletes.\n` +
        `Cuando quieras, escríbeme *hola* y te atiendo personalmente.`
      );
      await maybeOfferReferralProgram(phone, session.ag_user_id as string | null);
      await maybeOfferAppDownload(phone);
    });
    return;
  }

  // ── ESTADO DESCONOCIDO → reset ───────────────────────────────────────────────
  await resetSession(phone);
  await presentIdleOrPendingRating(phone, () => presentServiceMenu(phone, `Uy, no logré entender eso 🤔 ¿en qué te ayudo?`));
}

// ─── Pedir la calificación del conductor (reusado por trip_completed y por
// el drenado de ag_wa_pending_ratings cuando la conversación vuelve a estar
// libre) ────────────────────────────────────────────────────────────────────
async function presentRatingRequest(phone: string, r: {
  tripId: string; driverName: string; amount: number; tipAmount: number;
  distanceKm: number; delivery: boolean; forName: string | null;
}): Promise<void> {
  const cop = (n: number) => `$${Number(n).toLocaleString('es-CO')}`;
  const receiptLines = [
    r.distanceKm > 0 ? `📏 ${r.distanceKm.toFixed(1)} km recorridos` : null,
    r.tipAmount > 0  ? `🙌 Propina: ${cop(r.tipAmount)}` : null,
  ].filter(Boolean).join('\n');

  await upsertSession(phone, { state: 'awaiting_rating', trip_request_id: r.tripId });

  // Mismo criterio que ya existía: plantilla aprobada "viaje_completado"
  // salvo cuando el viaje es para otra persona (la plantilla es texto fijo
  // de Meta, no se le puede meter el nombre de otra persona -- ver bug real
  // 2026-08-11 documentado en la versión anterior de este bloque).
  let waResult = r.forName
    ? { ok: false }
    : await sendTemplate(phone, 'viaje_completado', 'es_CO', [
        r.distanceKm.toFixed(1), cop(r.amount), r.driverName,
      ]);
  if (!waResult.ok) {
    await sendText(phone,
      (r.delivery
        ? `🏁 Tu paquete fue entregado 💚\n\n`
        : r.forName
          ? `🏁 *${r.forName}* llegó — gracias por viajar con Movi 💚\n\n`
          : `🏁 Llegaste — gracias por viajar con Movi 💚\n\n`) +
      (receiptLines ? `${receiptLines}\n` : '') +
      `💰 *Total: ${cop(r.amount)}*\n\n` +
      (r.forName
        ? `⭐ ¿Cómo le fue a *${r.forName}* con *${r.driverName}*? Responde del *1* al *5*.\n`
        : `⭐ ¿Cómo te fue con *${r.driverName}*? Responde del *1* al *5*.\n`) +
      `_(o escribe *omitir* para saltar)_`
    );
  }
}

// Revisa si hay una calificación pendiente encolada (ver evento trip_completed
// más abajo) antes de mostrar el menú de idle -- si hay, se prioriza pedirla
// (mismo criterio que ya existía cuando solo había un viaje posible: se
// calificaba antes de poder pedir algo nuevo). Se usa en los puntos donde la
// conversación vuelve a quedar libre de verdad (cancelar, calificación ya
// respondida/omitida, estado desconocido) -- NO en el disparador de "pedir
// otro vehículo", que a propósito va directo al menú sin esperar por esto.
async function presentIdleOrPendingRating(phone: string, idleAction: () => Promise<void>): Promise<void> {
  const { data: pending } = await db()
    .from('ag_wa_pending_ratings')
    .select('*')
    .eq('wa_phone', phone)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!pending) { await idleAction(); return; }

  await db().from('ag_wa_pending_ratings').delete().eq('id', pending.id as string);
  await presentRatingRequest(phone, {
    tripId:     pending.trip_request_id as string,
    driverName: pending.driver_name as string ?? 'tu conductor',
    amount:     pending.amount as number ?? 0,
    tipAmount:  pending.tip_amount as number ?? 0,
    distanceKm: pending.distance_km as number ?? 0,
    delivery:   pending.is_delivery as boolean ?? false,
    forName:    pending.for_name as string | null,
  });
}

// ─── Manejar eventos internos (DB triggers) ───────────────────────────────────
async function handleInternalEvent(payload: Record<string, unknown>) {
  const event   = payload._internal_event as string;
  const phone   = payload.wa_phone as string;

  if (!phone || !event) return;

  if (event === 'offer_received') {
    const session = await getSession(phone);
    // El trip_request_id del payload tiene que ser el mismo que la
    // conversación activa está esperando -- con más de un viaje en curso
    // por teléfono, "matching" ya no alcanza solo por sí (podría ser el
    // estado de una segunda conversación distinta a la de esta oferta).
    // 'stale_search_confirm' también es válido: el pasajero puede recibir
    // una oferta real justo mientras está viendo el aviso de "nadie ha
    // aceptado todavía" (migración 241) -- sin este estado extra, esa
    // oferta se perdería en silencio.
    if (!session || (session.state !== 'matching' && session.state !== 'stale_search_confirm') || session.trip_request_id !== payload.trip_request_id) return;

    // Misma tarjeta (foto + botones) que usa el chequeo oportunista en
    // fetchNextPendingOffer/presentOffer -- una sola forma de mostrar una
    // oferta, sin importar si llegó por el aviso instantáneo del trigger o
    // por recuperación al siguiente mensaje del pasajero.
    await presentOffer(phone, {
      offer_id:       payload.offer_id as string,
      driver_name:    payload.driver_name as string ?? 'Conductor',
      driver_price:   payload.offered_price as number ?? 0,
      driver_phone:   payload.driver_phone as string ?? '',
      driver_vehicle: payload.driver_vehicle as string ?? '',
      driver_plate:   payload.driver_plate as string ?? '',
      driver_photo:   payload.driver_photo as string ?? '',
      driver_rating:  payload.driver_rating as number ?? 0,
      driver_trips:   payload.driver_trips as number ?? 0,
      service_type:   payload.service_type as string,
      for_name:       travelerLabelFromForOther(payload.for_other),
    });
  }

  if (event === 'driver_arrived') {
    const delivery    = isDeliveryService(payload.service_type as string | undefined);
    const driverName  = payload.driver_name as string ?? (delivery ? 'Tu mensajero' : 'Tu conductor');
    const lat = payload.origin_lat as number | null;
    const lng = payload.origin_lng as number | null;
    // Marca/modelo/color + placa -- vienen directo del trigger (migración
    // 217), no de la sesión: con más de un viaje en curso por teléfono, la
    // sesión puede ya pertenecer a un pedido distinto a este. Para que el
    // pasajero pueda reconocer el vehículo en la calle cuando el conductor
    // llega, no solo cuando acepta la oferta (pedido explícito del usuario
    // 2026-08-11).
    const vehicleLine = [
      payload.driver_vehicle as string | undefined,
      payload.driver_plate ? `Placa ${payload.driver_plate}` : null,
    ].filter(Boolean).join(' · ');
    // Antes esto solo se enteraba por el ping de ubicacion en vivo del cron
    // (cada 4 min) -- ahora es instantaneo, disparado por el trigger apenas
    // el conductor marca "llegue al punto de recogida" en la app.
    //
    // El aviso de llegada y el boton "Ya estoy a bordo" van en UN SOLO mensaje
    // interactivo -- antes eran 2 mensajes separados (plantilla + botones) y
    // llegaban en orden impredecible: una plantilla de WhatsApp pasa por un
    // pipeline de renderizado propio en los servidores de Meta que puede tardar
    // mas que un mensaje interactivo normal, aunque el mensaje interactivo se
    // haya mandado DESPUES en nuestro codigo -- el pasajero terminaba viendo el
    // boton "a bordo" antes que el aviso de llegada (bug real reportado
    // 2026-08-10). Un solo mensaje elimina la carrera por construccion. La
    // plantilla aprobada "conductor_llego" (sin boton, no se le agrego uno al
    // crearla) se deja solo como ultimo respaldo por si el pasajero ya salio de
    // la ventana de 24h de conversacion -- caso raro en este punto del flujo,
    // el pasajero acaba de interactuar hace minutos. La plantilla es texto fijo
    // aprobado por Meta -- no se puede variar por tipo de servicio sin crear y
    // aprobar una plantilla nueva, así que ese respaldo se queda con el
    // wording de pasajero en los dos casos (mejor un mensaje aprobado genérico
    // que ninguno).
    // Viaje para otra persona (no aplica a domicilio, ver alcance de la
    // feature): "te está esperando"/"Sal cuando estés listo" no tiene sentido
    // si quien va a subir es otra persona. El título del botón SIGUE
    // necesitando contener "a bordo" literal -- el estado in_trip reconoce la
    // confirmación de abordaje con el regex /a bordo|entregu[eé]/i (más abajo
    // en este archivo), y "Ya está a bordo" lo sigue cumpliendo igual que
    // "Ya estoy a bordo".
    const forName = travelerLabelFromForOther(payload.for_other);
    // Aviso de los 4 minutos (240s) -- mismo límite que ya usa la app en
    // pantalla (driverArrivalTimer/arrivedAtPickupTimer, ambos arrancan en
    // 240 y solo son un contador visual ahí, no hay cancelación automática
    // real al llegar a 0) pero que el canal de WhatsApp nunca comunicaba.
    // Pedido explícito del usuario 2026-08-11 -- se agrega en los dos casos
    // (para uno mismo y para otra persona) porque el límite real es el mismo
    // sin importar quién sube, solo cambiaba a quién se lo decíamos.
    const waitNotice = `\n\n⏱️ Tiene un máximo de *4 minutos* para salir y abordar el vehículo.`;
    const arrivedBody = delivery
      ? `📍 *${driverName}* ya llegó al punto de recogida. Entrégale tu paquete cuando estés listo 📦`
      : forName
        ? `📍 *${driverName}* ya llegó y está esperando a *${forName}*. ¡Que salga cuando esté listo! 🚗${waitNotice}`
        : `📍 *${driverName}* ya llegó y te está esperando. ¡Sal cuando estés listo! 🚗${waitNotice.replace('Tiene', 'Tienes')}`;
    const boardQuestion = delivery ? `¿Ya se lo entregaste?` : (forName ? `¿${forName} ya está a bordo?` : `¿Ya subiste al vehículo?`);
    const boardButtonTitle = delivery ? '✅ Ya se lo entregué' : (forName ? '✅ Ya está a bordo' : '✅ Ya estoy a bordo');
    let waResult = await sendButtons(phone,
      arrivedBody + `\n\n` + (vehicleLine ? `${vehicleLine}\n\n` : '') + boardQuestion,
      [{ id: 'board_confirm', title: boardButtonTitle }],
    );
    if (!waResult.ok) {
      const tplResult = await sendTemplate(phone, 'conductor_llego', 'es_CO', [driverName]);
      if (!tplResult.ok) {
        await sendText(phone, arrivedBody + (vehicleLine ? `\n\n${vehicleLine}` : ''));
      }
    }
    if (lat != null && lng != null) await sendLocation(phone, lat, lng, forName ? 'Punto de recogida' : 'Tu punto de recogida');
  }

  // Recordatorio a los ~2 minutos de que el conductor llegó y el pasajero
  // sigue sin abordar -- disparado por el cron ag_wa_arrival_reminder
  // (migración 216, mismo patrón que ag_wa_broadcast_live_locations). Un
  // mensaje de WhatsApp no se puede actualizar solo (no hay contador en
  // vivo real dentro de un mensaje), así que esto es lo más parecido: un
  // segundo mensaje que avisa cuánto tiempo queda de los 4 minutos totales.
  // Pedido explícito del usuario 2026-08-11.
  if (event === 'arrival_reminder') {
    const driverName = payload.driver_name as string ?? 'Tu conductor';
    const forName     = travelerLabelFromForOther(payload.for_other);
    await sendText(phone,
      forName
        ? `⏱️ Quedan *2 minutos* para que *${forName}* aborde con *${driverName}* antes de que se cumpla el máximo de espera.`
        : `⏱️ Te quedan *2 minutos* para abordar con *${driverName}* antes de que se cumpla el máximo de espera.`
    );
  }

  // Cron ag_wa_stale_search_check (migración 241) -- avisa proactivamente cuando
  // el pasajero lleva 4/8/12 minutos sin que nadie acepte su viaje, sin depender
  // de que vuelva a escribir. Antes ese chequeo era 100% reactivo (solo se
  // evaluaba cuando el pasajero volvía a escribir algo, ver el estado 'matching'
  // más arriba), así que si se quedaba callado esperando el mensaje "Buscando
  // conductores cerca de ti..." se quedaba ahí para siempre aunque la solicitud
  // ya llevara rato invisible para los conductores (getSearchingRequests solo
  // trae solicitudes de los últimos 4 minutos -- mismo límite real que usa la
  // tarjeta del conductor en la app). Pedido explícito del usuario 2026-08-30.
  if (event === 'stale_search_check') {
    const tripId    = payload.trip_request_id as string;
    const delivery  = isDeliveryService(payload.service_type as string | undefined);
    const forName   = travelerLabelFromForOther(payload.for_other);
    // Número decorativo mientras la base real de conductores es chica -- pedido
    // explícito del usuario: entre 12 y 23, distinto en cada ronda, para que el
    // pasajero sienta que sí hay interés real aunque el match tarde. Quitar esta
    // simulación el día que el número real de conductores activos alcance para
    // que la cifra real ya sea creíble por sí sola.
    const sawCount = Math.floor(Math.random() * 12) + 12;
    const noun = delivery ? 'mensajeros' : 'conductores';
    // Pedido explicito del usuario 2026-09-02: al ofrecer 'Subir oferta' hay que explicarle por
    // que le conviene, no solo darle el boton. La razon real es simple y conviene decirla tal
    // cual: el conductor elige entre varias solicitudes y toma primero la que mejor le paga.
    const body =
      `👀 *${sawCount}* ${noun} vieron tu solicitud${forName ? ` para *${forName}*` : ''}, pero ninguno la ha aceptado todavía.\n\n` +
      `💡 Los ${noun} suelen tomar primero los viajes que pagan un poco mejor. ` +
      `Si subes tu oferta, lo más probable es que alguien la acepte enseguida.\n\n` +
      `¿Qué quieres hacer?`;

    // Nota: ag_wa_sessions NO tiene columna for_other -- ese dato vive solo en
    // ag_trip_requests.for_other (jsonb) y llega aquí vía payload.for_other, ya
    // usado arriba en travelerLabelFromForOther() para el texto del mensaje; no
    // hace falta persistirlo en la sesión.
    await upsertSession(phone, { state: 'stale_search_confirm', trip_request_id: tripId, service_type: payload.service_type });
    await sendButtons(phone, body, [
      { id: 'stale_keep_looking', title: '🔍 Seguir buscando' },
      { id: 'stale_raise_offer',  title: '💰 Subir oferta' },
      { id: 'stale_cancel',       title: '❌ Cancelar' },
    ]);
    return;
  }

  // Cron ag_wa_stale_search_check -- cierre de una solicitud que nadie tomo nunca.
  //
  // Pedido explicito del usuario 2026-09-02. Hasta ahora una solicitud en 'searching' NO
  // expiraba jamas: ag_cancel_abandoned_trips solo cancela viajes ya 'accepted' cuyo conductor
  // se quedo mudo. Habia solicitudes de mas de 24 horas todavia abiertas, con el pasajero
  // tecnicamente 'buscando conductor' desde el dia anterior. Es mas honesto cerrarle la
  // solicitud y decirle como volver a pedir, que dejarlo esperando algo que no va a llegar.
  //
  // La sesion se devuelve a 'idle' para que su siguiente mensaje arranque un flujo limpio en
  // vez de caer en el estado viejo de esta solicitud ya muerta.
  if (event === 'search_expired') {
    const delivery = isDeliveryService(payload.service_type as string | undefined);
    const forName  = travelerLabelFromForOther(payload.for_other);
    const quien    = delivery ? 'mensajero' : 'conductor';
    await upsertSession(phone, { state: 'idle', trip_request_id: null });
    await sendText(phone,
      `😔 No encontramos ${quien} disponible${forName ? ` para *${forName}*` : ''} esta vez.` +
      `

Cerramos la solicitud para que no te quedes esperando. Suele haber mas ${quien}es ` +
      `disponibles en horas pico.` +
      `

Cuando quieras intentar de nuevo, solo escribe *hola* y lo pedimos en un minuto. 🙌`,
    );
    return;
  }

  if (event === 'trip_started') {
    // driver_stage pasó a 'on_route' -- el viaje arrancó de verdad hacia el
    // destino. Dispara sin importar si lo confirmó el pasajero por WhatsApp
    // (ver estado in_trip más arriba, que ahora también avanza driver_stage)
    // o el conductor desde la app (RPC ag_advance_trip_stage) -- migración
    // 211, pedido explícito del usuario 2026-08-11 para que ambos caminos
    // queden en paridad. Cuando lo confirma el propio pasajero por WhatsApp
    // ya recibió un "¡Buen viaje!" inmediato en el mismo mensaje -- este es
    // el aviso equivalente para cuando quien confirmó fue el conductor.
    const delivery   = isDeliveryService(payload.service_type as string | undefined);
    const driverName = payload.driver_name as string ?? (delivery ? 'Tu mensajero' : 'Tu conductor');
    const forName    = travelerLabelFromForOther(payload.for_other);
    const body = delivery
      ? `🚀 *${driverName}* ya va en camino a entregar tu paquete.`
      : forName
        ? `🚀 ¡En camino! *${driverName}* ya arrancó con *${forName}* hacia el destino.`
        : `🚀 ¡Vamos en camino! *${driverName}* ya arrancó hacia tu destino.`;
    // A partir de aquí este viaje ya no necesita más respuestas del pasajero
    // para seguir -- se ofrece de una vez la opción de pedir otro vehículo
    // (para él mismo o para alguien más) sin esperar a que este termine.
    // Reconocido como comando global por isNewOrderRequest() (también si lo
    // escribe a mano en vez de tocar el botón), sin importar en qué estado
    // quede la conversación después de este aviso. Pedido explícito del
    // usuario 2026-08-12.
    await sendButtons(phone, body, [{ id: 'new_order', title: '🚗🏍️ Otro vehículo' }]);
  }

  // Puente de chat: el conductor escribió desde el chat de la app en un
  // viaje pedido por WhatsApp (migración 212, ag_wa_chat_relay_to_passenger_fn
  // -- solo dispara si quien escribió es el conductor asignado, nunca el
  // propio mensaje del pasajero, ver nota de prevención de loop en esa
  // migración). Se reenvía tal cual, sin traducir ni resumir -- es una
  // conversación real entre dos personas, no una notificación del sistema.
  if (event === 'chat_message') {
    const driverName = payload.driver_name as string ?? 'Tu conductor';
    const message     = (payload.message as string ?? '').trim();
    if (message) {
      await sendText(phone, `💬 *${driverName}:*\n${message}`);
    }
  }

  if (event === 'trip_completed') {
    const session      = await getSession(phone);
    const delivery     = isDeliveryService(payload.service_type as string | undefined);
    const amount       = payload.amount as number ?? 0;
    const tipAmount    = payload.tip_amount as number ?? 0;
    const distanceKm   = payload.distance_km as number ?? 0;
    const driverName   = payload.driver_name as string ?? (delivery ? 'tu mensajero' : 'tu conductor');
    const forName      = travelerLabelFromForOther(payload.for_other);
    const tripId       = payload.trip_request_id as string;

    // Con más de un viaje en curso por teléfono, el que se completó ahora
    // puede NO ser el que la conversación activa está tratando (ej: el
    // pasajero está armando un segundo pedido, o ya está en el viaje de
    // ESE segundo pedido). En ese caso no se le puede pedir la calificación
    // de inmediato -- se perdería la respuesta a lo que sea que esté
    // haciendo -- se manda el recibo igual (para que sepa que ese viaje
    // terminó) y se encola la calificación para cuando la conversación
    // vuelva a quedar libre (ver presentIdleOrPendingRating). Si la sesión
    // ya está en idle, o ya era justo la de este viaje, es el camino de
    // siempre: se pide la calificación ya mismo.
    const busyWithOtherTrip = !!session && session.state !== 'idle' && session.trip_request_id !== tripId;

    if (!busyWithOtherTrip) {
      await presentRatingRequest(phone, { tripId, driverName, amount, tipAmount, distanceKm, delivery, forName });
      return;
    }

    const cop = (n: number) => `$${Number(n).toLocaleString('es-CO')}`;
    const receiptLines = [
      distanceKm > 0 ? `📏 ${distanceKm.toFixed(1)} km recorridos` : null,
      tipAmount > 0  ? `🙌 Propina: ${cop(tipAmount)}` : null,
    ].filter(Boolean).join('\n');
    await sendText(phone,
      (delivery
        ? `🏁 Tu paquete fue entregado 💚\n\n`
        : forName
          ? `🏁 *${forName}* llegó — gracias por viajar con Movi 💚\n\n`
          : `🏁 Llegaste — gracias por viajar con Movi 💚\n\n`) +
      (receiptLines ? `${receiptLines}\n` : '') +
      `💰 *Total: ${cop(amount)}*\n\n` +
      `⭐ Todavía no te pedimos la calificación de este viaje -- te la vamos a preguntar aparte apenas termines lo que estás haciendo ahora. _No hace falta que respondas nada todavía._`
    );
    await db().from('ag_wa_pending_ratings').insert({
      wa_phone: phone, trip_request_id: tripId, driver_name: driverName,
      amount, tip_amount: tipAmount, distance_km: distanceKm,
      is_delivery: delivery, for_name: forName,
    });
  }

  if (event === 'live_location') {
    const lat   = payload.lat as number | null;
    const lng   = payload.lng as number | null;
    const stage = payload.driver_stage as string ?? '';
    if (lat == null || lng == null) return;

    const delivery = isDeliveryService(payload.service_type as string | undefined);
    const forNameLive = travelerLabelFromForOther(payload.for_other);
    const label = stage === 'heading_to_pickup'
      ? (delivery ? 'Va en camino a recoger tu paquete' : forNameLive ? `Va en camino a recoger a ${forNameLive}` : 'Va en camino a recogerte')
      : stage === 'arrived_at_pickup'
        ? 'Llegó al punto de recogida'
        : 'Va en camino';

    // Mensaje de ubicación nativo de WhatsApp -- se ve como un mapa real
    // dentro del chat, no como un link de texto que hay que tocar y esperar
    // a que abra otra app.
    await sendLocation(phone, lat, lng, `Tu ${delivery ? 'mensajero' : 'conductor'}`, label);
  }
}

// ════════════════════════════════════════════════════════════════════════════
// ─── Bot de soporte/registro de conductores (número separado, ver arriba) ────
// Conversación completamente distinta a la de pedir viajes: no hay máquina de
// estados de viaje, es un FAQ con IA sobre cómo registrarse como conductor,
// documentos requeridos y estado de una solicitud ya enviada -- con escalamiento
// a un humano (el mismo SUPPORT_PHONE que ya recibe otras alertas del sistema)
// cuando la IA no tiene una respuesta segura. Ver memoria movi_whatsapp_support_number.
// ════════════════════════════════════════════════════════════════════════════

async function sendSupportGraph(payload: Record<string, unknown>): Promise<WaResult> {
  try {
    const { to, ...rest } = payload;
    const fullBody = { messaging_product: 'whatsapp', ...(to ? recipientField(to as string) : {}), ...rest };
    const res = await fetch(`https://graph.facebook.com/v20.0/${SUPPORT_PHONE_NUMBER_ID}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${WA_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(fullBody),
    });
    const bodyText = await res.text();
    if (!res.ok) console.error('[WA-Support] sendGraph Meta API error:', res.status, bodyText, 'sent:', JSON.stringify(fullBody));
    if (to) {
      const summary = summarizeOutboundPayload(payload);
      logWaMessage(to as string, 'conductor', 'out', summary.text, summary.type);
    }
    return { ok: res.ok, status: res.status, body: bodyText };
  } catch (e) {
    console.error('[WA-Support] sendGraph fetch error:', e);
    return { ok: false, body: String(e) };
  }
}

async function sendSupportText(to: string, text: string): Promise<WaResult> {
  return sendSupportGraph({ to, type: 'text', text: { preview_url: false, body: text } });
}

// ─── Código de verificación por WhatsApp ──────────────────────────────────────
// Pedido explícito del usuario 2026-09-01, después de que un conductor real quedara trancado
// en el registro porque su operador rechaza el remitente alfanumérico "MOVI" de Telnyx (ver
// [[movi_otp_alpha_sender_movi_rejected]]). El SMS depende del operador de cada persona;
// WhatsApp no. En la app aparece un botón "Pedir código por WhatsApp" que abre este chat con
// el mensaje ya escrito -- la persona solo aprieta enviar. Como es ELLA quien nos escribe
// primero, se abre la ventana de servicio de 24h de Meta y responderle el código sale gratis
// (Meta cobra las conversaciones que inicia el negocio, no las que inicia el usuario).
//
// CANDADO DE SEGURIDAD -- lo más importante de todo este bloque: el código se manda ÚNICAMENTE
// al mismo número de WhatsApp que lo está pidiendo, y solo si ese número tiene un registro en
// curso pedido desde la app. Sin esa condición cualquiera podría escribir el número de otra
// persona en la app, pedirnos el código desde su propio WhatsApp y quedarse con la cuenta
// ajena (con su billetera y su plata adentro). NUNCA relajar esta condición ni permitir que el
// código se mande a un número distinto del que escribe.

function normalizarTexto(t: string): string {
  return (t ?? '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Devuelve true si el mensaje fue consumido acá (y NO debe seguir al bot normal).
 * Devuelve false si no tiene nada que ver con pedir un código, para que el flujo de
 * siempre (viajes o soporte) lo procese como si esta función no existiera.
 */
async function handleOtpCodeRequest(
  fromPhone: string,
  msgText: string,
  isSupportNumber: boolean,
): Promise<boolean> {
  const t = normalizarTexto(msgText);
  if (!t) return false;

  // Dos niveles de detección, a propósito:
  //  - EXPLÍCITA: la frase que la app deja preescrita en el chat. Se atiende siempre.
  //  - GENÉRICA: alguien que lo pide con sus propias palabras ("no me llega el codigo del
  //    registro"). Solo se atiende si de verdad hay un registro en curso para ese número --
  //    si no, se deja pasar al bot normal para no secuestrar una conversación cualquiera.
  const explicita = t.includes('codigo de verificacion');
  const generica  = /(codigo|clave)/.test(t)
                 && /(verific|registr|ingres|entrar|acced|acces|activar|sms|no me lleg|no lleg|nunca lleg)/.test(t);
  if (!explicita && !generica) return false;

  const rol: 'conductor' | 'pasajero' = isSupportNumber ? 'conductor' : 'pasajero';
  const responder = async (texto: string) => {
    if (isSupportNumber) await sendSupportText(fromPhone, texto);
    else                 await sendText(fromPhone, texto);
    logWaMessage(fromPhone, rol, 'out', texto);
  };

  // Un BSUID no es un número de teléfono (ver isBsuid/toE164), así que no hay forma de
  // comprobar que quien escribe es el dueño del número que se está registrando -- y sin esa
  // comprobación no se manda ningún código. Falla cerrado, a propósito.
  if (isBsuid(fromPhone)) {
    if (!explicita) return false;
    await responder(
      'No puedo enviarte el código por acá porque WhatsApp no me está compartiendo tu número 😔\n\n' +
      'Pídelo por SMS desde la app, o escríbeme desde el mismo número que estás registrando.',
    );
    return true;
  }

  const phone = toE164(fromPhone);

  // ag-otp-send inserta la fila en ag_otp_codes ANTES de intentar mandar el SMS, así que la
  // fila existe incluso cuando el envío falló -- que es justo el caso que esto viene a
  // rescatar. Ventana de 30 min: suficiente para que alcance a leer el error, tocar el botón
  // y mandarnos el mensaje, sin dejar la puerta abierta indefinidamente.
  const desde = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  const { data: pendiente, error: qErr } = await db()
    .from('ag_otp_codes')
    .select('id')
    .eq('phone', phone)
    .gte('created_at', desde)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (qErr) {
    console.error('[WA][otp] error consultando ag_otp_codes:', qErr);
    await responder('Tuve un problema generando tu código 😔 Intenta de nuevo en un minuto.');
    return true;
  }

  if (!pendiente) {
    // Sin registro en curso no se manda nada. Si lo pidió con sus propias palabras, se deja
    // pasar al bot normal (que sabe responder dudas); si usó el botón de la app, se le explica.
    if (!explicita) return false;
    await responder(
      'No encuentro un registro en curso para este número 🤔\n\n' +
      'Abre la app Movi, escribe *este mismo número* de celular y, cuando te pida el código, ' +
      'vuelve a tocar "Pedir código por WhatsApp".\n\n' +
      'Por seguridad, el código solo se le puede enviar al dueño del número.',
    );
    return true;
  }

  const code      = String(Math.floor(100000 + Math.random() * 900000));
  const hash      = await sha256Hex(code);
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

  // Mismo patrón que ag-otp-send: invalidar los códigos viejos sin usar antes de emitir uno
  // nuevo, para que solo haya uno válido a la vez.
  await db().from('ag_otp_codes').delete().eq('phone', phone).eq('used', false);
  const { error: insErr } = await db()
    .from('ag_otp_codes')
    .insert({ phone, code_hash: hash, expires_at: expiresAt });

  if (insErr) {
    console.error('[WA][otp] error insertando código:', insErr);
    await responder('Tuve un problema generando tu código 😔 Intenta de nuevo en un minuto.');
    return true;
  }

  await responder(
    `🔐 Tu código de verificación Movi es:\n\n*${code}*\n\n` +
    'Escríbelo en la app para continuar. Vence en 10 minutos.\n\n' +
    '⚠️ No se lo compartas a nadie: con ese código se entra a tu cuenta.',
  );
  return true;
}

// ─── Sesión del bot de soporte ────────────────────────────────────────────────
async function getSupportSession(phone: string) {
  const { data } = await db().from('ag_wa_support_sessions').select('*').eq('wa_phone', phone).maybeSingle();
  return data as Record<string, unknown> | null;
}

async function upsertSupportSession(phone: string, patch: Record<string, unknown>) {
  await db().from('ag_wa_support_sessions').upsert(
    { wa_phone: phone, last_message_at: new Date().toISOString(), ...patch },
    { onConflict: 'wa_phone' },
  );
}

// Después de este tiempo sin que un asesor cierre la conversación, el bot
// vuelve a responder solo -- para que un conductor no quede "colgado" para
// siempre si el aviso de escalamiento se le pasó por alto al equipo de soporte.
const ESCALATION_TTL_MS = 48 * 60 * 60 * 1000;

// ─── Perfil real de un conductor, buscado por teléfono ────────────────────────
// Reusa exactamente las mismas columnas que ya muestra la app (ag_users + ag_drivers)
// -- status/rejection_reason, saldo de billetera, vencimiento de documentos del
// vehículo ACTUAL -- así el bot contesta con datos reales en vez de una respuesta
// genérica, para lo que sea que pregunten sobre SU cuenta puntual.
interface DriverProfile {
  agUserId: string; driverId: string; fullName: string; status: string; rejectionReason: string | null;
  walletBalance: number; documentsExpired: boolean; vehicleNeedsUpdate: boolean;
  soatExpiry: string | null; licenseExpiry: string | null; tecnoExpiry: string | null; civilLiabilityExpiry: string | null;
}
async function lookupDriverProfile(phone: string): Promise<DriverProfile | null> {
  try {
    const supabase = db();
    const { data: user } = await supabase
      .from('ag_users').select('id, full_name').eq('phone', toE164(phone)).maybeSingle();
    if (!user) return null;
    const { data: driver } = await supabase
      .from('ag_drivers')
      .select('id, status, rejection_reason, wallet_balance, documents_expired, vehicle_needs_update, soat_expiry, license_expiry, tecno_expiry, civil_liability_expiry')
      .eq('ag_user_id', user.id as string).maybeSingle();
    if (!driver) return null;
    return {
      agUserId:             user.id as string,
      driverId:             driver.id as string,
      fullName:             (user.full_name as string) ?? 'Conductor',
      status:               driver.status as string,
      rejectionReason:      driver.rejection_reason as string | null,
      walletBalance:        (driver.wallet_balance as number) ?? 0,
      documentsExpired:     driver.documents_expired as boolean,
      vehicleNeedsUpdate:   driver.vehicle_needs_update as boolean,
      soatExpiry:           driver.soat_expiry as string | null,
      licenseExpiry:        driver.license_expiry as string | null,
      tecnoExpiry:          driver.tecno_expiry as string | null,
      civilLiabilityExpiry: driver.civil_liability_expiry as string | null,
    };
  } catch (e) { console.error('[WA-Support] lookupDriverProfile error:', e); return null; }
}

// ─── Billetera de invitados (referidos) ───────────────────────────────────────
// 2% del valor de cada viaje completado por un invitado -- ya sea que el
// invitado tome viajes como pasajero, o que trabaje como conductor -- se
// acredita a quien lo invitó, de forma vitalicia (sin fecha de corte). Si la
// misma persona invitó al pasajero Y al conductor de un mismo viaje, solo se
// paga una vez. Confirmado leyendo ag_complete_trip() directo en la base real
// el 2026-08-13 (pedido explícito del usuario de comunicar esto a conductores).
/** Link corto y personalizado (?r=<código>, ej. "carlos4821") en vez del UUID crudo -- pedido
 * explícito del usuario 2026-08-22 (ver migración 231_ag_referral_ref_code). Cae al UUID si el
 * usuario todavía no tiene ref_code por alguna razón (no debería pasar, el trigger lo asigna
 * al crear la fila, pero el link nunca debe salir roto por esto). */
async function buildReferralLink(agUserId: string): Promise<string> {
  const supabase = db();
  const { data } = await supabase.from('ag_users').select('ref_code').eq('id', agUserId).maybeSingle();
  const code = data?.ref_code || agUserId;
  return `${APP_URL || 'https://www.publihazclick.com'}/movi?r=${code}`;
}

async function getReferralInfo(agUserId: string): Promise<{ balance: number; totalEarned: number; referredCount: number }> {
  try {
    const supabase = db();
    const [{ data: wallet }, { count }] = await Promise.all([
      supabase.from('ag_referral_wallet').select('balance, total_earned').eq('ag_user_id', agUserId).maybeSingle(),
      supabase.from('ag_users').select('id', { count: 'exact', head: true }).eq('referred_by', agUserId),
    ]);
    return {
      balance:       (wallet?.balance as number) ?? 0,
      totalEarned:   (wallet?.total_earned as number) ?? 0,
      referredCount: count ?? 0,
    };
  } catch (e) { console.error('[WA-Support] getReferralInfo error:', e); return { balance: 0, totalEarned: 0, referredCount: 0 }; }
}

// Cuenta básica de Movi por teléfono, SIN exigir que tenga solicitud de
// conductor -- el programa de invitados aplica a cualquier cuenta, y alguien
// puede preguntar "cómo invito" antes de siquiera haberse registrado.
async function lookupAgUserBasic(phone: string): Promise<{ agUserId: string; fullName: string } | null> {
  try {
    const { data } = await db().from('ag_users').select('id, full_name').eq('phone', toE164(phone)).maybeSingle();
    if (!data) return null;
    return { agUserId: data.id as string, fullName: (data.full_name as string) ?? 'Conductor' };
  } catch (e) { console.error('[WA-Support] lookupAgUserBasic error:', e); return null; }
}

// Mensaje del programa de invitados -- reusado tanto si ya sabemos quién es
// (conductor con perfil completo) como si solo tenemos una cuenta básica, o
// ni siquiera eso (agUserId null -- explica el programa en general y manda a
// registrarse primero para conseguir el link).
async function buildReferralMessage(agUserId: string | null, fullName: string | null): Promise<string> {
  const intro = `🎁 *Programa de invitados de Movi:*\n\nGanas el *2% de por vida* de cada servicio que complete alguien que invites -- sea que se registre como pasajero o como conductor. Se paga en cada viaje que haga esa persona, sin fecha de corte.`;
  if (!agUserId) {
    return `${intro}\n\nTodavía no encuentro una cuenta de Movi con este número. Regístrate en la app (como pasajero o conductor) y ahí mismo consigues tu link personal para empezar a invitar.`;
  }
  const ref = await getReferralInfo(agUserId);
  const link = await buildReferralLink(agUserId);
  return `${intro}\n\n` +
    `Invitados hasta ahora: *${ref.referredCount}*\n` +
    `Ganado en total: *${fmtCOP(ref.totalEarned)}*\n` +
    `Saldo disponible para retirar: *${fmtCOP(ref.balance)}* (mínimo $10.000, a cuenta de ahorros, corriente, Nequi o Daviplata)\n\n` +
    `Tu link personal para invitar:\n${link}`;
}

// ─── Beneficios reales (viajes del mes/total, próximo bono) ──────────────────
// Misma RPC que usa la app (ag_get_driver_benefits) -- ver ag_bonus_milestones:
// 10 viajes=$2.000, 25=$3.500, 50=$6.000, luego $24.000 cada 100 viajes de por vida.
async function getDriverBenefits(driverId: string): Promise<Record<string, unknown> | null> {
  try {
    const { data, error } = await db().rpc('ag_get_driver_benefits', { p_driver_id: driverId });
    if (error) { console.error('[WA-Support] getDriverBenefits error:', error); return null; }
    return data as Record<string, unknown>;
  } catch (e) { console.error('[WA-Support] getDriverBenefits error:', e); return null; }
}

function fmtCOP(n: number): string {
  return `$${Math.round(n).toLocaleString('es-CO')}`;
}
function fmtDate(d: string | null): string {
  if (!d) return 'sin registrar';
  return new Date(d + 'T00:00:00').toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' });
}

// ─── FAQ con IA sobre requisitos/registro/operación de conductor ─────────────
// Base de conocimiento extraída directamente del código real de la app (docTypes/
// vehicleDocFields/tutorialSteps en anda-gana.component.ts, comisión/bonos en
// anda-gana.service.ts + tabla ag_bonus_milestones, política de cancelación en
// la migración 188, límites de antigüedad en platform_settings) -- pedido
// explícito del usuario 2026-08-13: cubrir TODO lo relacionado a conductor con
// la info real de la plataforma, para que casi nunca haga falta un humano.
// Los datos puntuales de la cuenta de quien escribe (saldo, documentos, bonos,
// estado de la solicitud) NO van aquí -- esos se resuelven aparte con datos
// reales de la base antes de llegar a la IA (ver handleSupportConversation).
const DRIVER_FAQ_SYSTEM_PROMPT = `Eres el asistente de soporte de conductores de Movi (app de viajes/domicilios tipo InDrive en Colombia), atendiendo por WhatsApp. Hablas en español de Colombia, cálido, claro y directo, con mensajes cortos para WhatsApp (evita párrafos largos; usa saltos de línea y viñetas simples con "-" si ayuda a leer mejor). Para negrita usa UN solo asterisco (*así*, el formato real de WhatsApp) -- nunca dobles asteriscos (**así**), en WhatsApp se ven los símbolos literales y queda feo.

Usa SOLO la información real de abajo -- si algo no está aquí y no lo puedes deducir con certeza, es mejor escalar que inventar.

═══ CÓMO REGISTRARSE COMO CONDUCTOR ═══
- Se hace desde la app Movi (no desde WhatsApp): entrar a "Quiero ser conductor" y completar 4 pasos -- Datos personales, Documentos de identidad, Licencia, Vehículo. Llenar el formulario toma unos 5 minutos.
- Datos personales pedidos: nombre completo, fecha de nacimiento, país, departamento, ciudad, número de cédula. Debe escribirse exactamente como aparece en los documentos oficiales.
- Documentos del CONDUCTOR: cédula (documento colombiano -- es obligatorio ser colombiano para conducir en Movi), foto de la cédula, licencia de conducción vigente, y una selfie de rostro SIN la cédula (para que el pasajero lo reconozca al llegar).
- Documentos del VEHÍCULO: SOAT vigente, tarjeta de propiedad (foto frontal y trasera), revisión tecnomecánica vigente, fotos del vehículo. El seguro de responsabilidad civil ya NO se pide (no es obligatorio en Colombia como el SOAT).
- *¿Qué carros y motos se aceptan?* Se aceptan carros Y motos matriculados en Colombia O en Venezuela (placa colombiana o venezolana, ambas están bien -- no hay restricción de formato de placa por país). Lo único que debe ser colombiano es la cédula del CONDUCTOR (la persona), no el vehículo.
- *¿Desde qué año se aceptan?* Carros: modelo ${new Date().getFullYear() - 23} en adelante (máximo 23 años de antigüedad). Motos: modelo ${new Date().getFullYear() - 17} en adelante (máximo 17 años de antigüedad). Si el vehículo es más viejo que eso no se puede registrar (ni seguir conectado si ya lo tenía registrado y se le venció el límite mientras estaba activo). SIEMPRE que pregunten por año/antigüedad de carro o moto, responde con el año mínimo exacto de arriba, no solo "el máximo son X años" -- muchos conductores no van a restar el año ellos mismos.
- Un conductor puede tener carro Y moto guardados a la vez y elegir cuál es su vehículo "actual" desde "Mis vehículos" en la app -- el historial de viajes, la billetera, las calificaciones y los bonos no se pierden al cambiar. Al cambiar de vehículo actual, los documentos/vencimientos que se revisan pasan a ser los del vehículo recién elegido.
- Revisión de la solicitud: 24-48 horas hábiles después de enviar todos los documentos.
- Si rechazan la solicitud, se puede corregir lo que falte y volver a enviar los documentos desde la app -- no hay que registrarse de cero otra vez.

═══ SERVICIOS QUE PUEDE OFRECER UN CONDUCTOR ═══
- Viaje (carro): transporte de pasajeros en carro dentro de la ciudad.
- Moto: transporte de pasajeros en moto.
- Domicilio: entrega de paquetes en moto.
- Flete: transporte de carga/mudanzas en vehículos más grandes.
- Ciudad a ciudad: viajes intermunicipales.
Un mismo conductor puede recibir solicitudes de varios de estos servicios según qué vehículo tenga activo.

═══ CÓMO FUNCIONA UN VIAJE ═══
- El conductor se conecta con el botón verde "En línea" (necesita GPS y permiso de ubicación activados) y empieza a ver solicitudes cercanas con un precio sugerido.
- El conductor puede aceptar el precio que pidió el pasajero o hacer una contraoferta con otro precio.
- El precio sugerido sube automáticamente en horas de alta demanda (multiplicador de "hora pico").
- Antes de salir se recomienda revisar SOAT vigente, tecnomecánica, combustible y que el vehículo esté limpio -- los pasajeros califican todo el servicio.
- Durante el viaje hay llamada enmascarada disponible (conductor y pasajero se pueden llamar sin ver el número real del otro).
- Hay botón de SOS/emergencia disponible durante el viaje.

═══ DINERO: CÓMO SE PAGA UN CONDUCTOR ═══
- El pasajero le paga al conductor DIRECTO (no pasa por Movi). Movi cobra su comisión de la billetera prepagada del conductor, no del pago del viaje.
- Comisión de Movi: 12% fijo sobre el valor de cada viaje, se descuenta automáticamente de la billetera del conductor.
- El conductor debe mantener saldo en su billetera para poder seguir recibiendo viajes; se recarga desde la app con tarjeta o PSE.
- Si un pasajero cancela DESPUÉS de que el conductor ya aceptó (y ya se cobró la comisión): si el pasajero nunca llegó a abordar el vehículo, la comisión se devuelve automáticamente al saldo del conductor; si el pasajero ya iba a bordo cuando se canceló, el viaje se considera hecho y no hay devolución. Esto no depende de quién cancela, depende de si hubo servicio real (validado con el GPS real del conductor, no solo con un botón).
- Bonos en efectivo por hitos de viajes completados de por vida (no se resetean cada mes): al llegar a 10 viajes, $2.000; a 25 viajes, $3.500; a 50 viajes, $6.000; de ahí en adelante, $24.000 adicionales cada 100 viajes más.

═══ DOCUMENTOS VENCIDOS ═══
- Licencia, SOAT y tecnomecánica tienen fecha de vencimiento (el seguro de responsabilidad civil ya no se pide).
- Si algo vence en 5 días o menos aparece un aviso en la app; si ya venció, la cuenta queda bloqueada para conectarse (no puede recibir viajes) hasta que se renueve.
- Renovar (subir el documento con la fecha nueva) desbloquea la cuenta al instante, no hay que esperar revisión.
- El bloqueo solo mira los documentos del vehículo que está marcado como "actual" en ese momento.

═══ PROGRAMA DE INVITADOS (REFERIDOS) ═══
- Cada conductor tiene un link personal para invitar gente a Movi (se consigue en la app, sección de referidos/invitados).
- Quien se registre con ese link -- sea como PASAJERO o como CONDUCTOR -- queda como su invitado, sin importar cuál de los dos roles use.
- El conductor gana el 2% del valor de CADA servicio que complete su invitado, de forma vitalicia (no tiene fecha de corte ni límite de tiempo) -- si su invitado se convirtió en conductor y hace 500 viajes en toda su vida en Movi, gana 2% de cada uno de esos 500 viajes; si su invitado es pasajero y pide viajes por años, gana 2% de cada uno de esos viajes también.
- Si esa misma persona invitó tanto al pasajero como al conductor de un mismo viaje, solo se paga una vez (no se duplica).
- Esta comisión de invitados es aparte de la billetera normal del conductor (la que paga la comisión del 12%) -- tiene su propio saldo.
- Se puede retirar desde $10.000 COP en adelante, a cuenta de ahorros, cuenta corriente, Nequi o Daviplata.

═══ SEGURIDAD Y CALIDAD ═══
- Los pasajeros califican al conductor después de cada viaje (estrellas).
- Llamada enmascarada (ninguno de los dos ve el número real del otro) y botón de SOS durante el viaje.
- El registro pide selfie y cédula para verificar identidad.

═══ CUENTA E INICIO DE SESIÓN ═══
- No hay contraseña que se pueda "olvidar" -- el inicio de sesión en Movi es con el número de celular, se manda un código de un solo uso por SMS o WhatsApp y con eso entra. Si alguien pregunta por su contraseña, explícale esto: no la necesita, entra con su número y el código que le llega.
- Se puede cambiar el número de celular registrado (pide verificación por SMS al número nuevo) y dar de baja la cuenta desde el menú de Seguridad en la app -- dar de baja bloquea el acceso pero no borra el historial.

═══ CONFIANZA / "¿VALE LA PENA?" ═══
Si preguntan si Movi es confiable, si vale la pena, cuánto se puede ganar en general, o algo similar (no es un reclamo, es duda genuina antes de animarse) -- respóndeles tú mismo, con confianza y calidez, usando lo de arriba: comisión fija transparente del 12%, bonos por hitos de viajes, programa de invitados con 2% de por vida, pasajeros y conductores se califican mutuamente, verificación de identidad en el registro, llamada enmascarada y SOS en cada viaje. Esto NO es motivo para escalar.

═══ QUÉ HACER CUANDO NO SABES ALGO ═══
No toda pregunta de un conductor es sobre la política interna de Movi -- muchas son preguntas generales de trámites/documentos en Colombia que SÍ tienen una respuesta real buscable (ej. "¿qué es el RUNT?", "¿dónde saco la tecnomecánica en Bucaramanga?", "¿cuánto cuesta el SOAT de una moto?", "¿qué pasa si me para un agente de tránsito sin tecnomecánica?"). Para esas, NO escales -- se resuelven con una búsqueda.

Si la pregunta es vaga pero claramente relacionada con seguridad durante un viaje (ej. "¿qué pasa si un pasajero me hace algo?", "¿y si me pasa algo en la calle?") respóndela con la sección SEGURIDAD Y CALIDAD de arriba (botón de SOS, llamada enmascarada) -- no es motivo para escalar, es una pregunta informativa aunque suene alarmante.

Elige exactamente una acción:
- "answer": para todo lo que puedas responder con confianza usando la información de arriba (política y funcionamiento real de Movi).
- "search": para preguntas informativas/factuales que NO son política interna de Movi pero sí tienen una respuesta real y objetiva que se puede buscar (trámites, requisitos legales de tránsito en Colombia, definiciones, precios de mercado, etc.).
- "escalate": SOLO si la persona pide explícitamente hablar con un humano/asesor; es un reclamo o problema puntual de SU cuenta (ej. "me cobraron mal", "un pasajero me trató mal", "perdí un objeto"); reporta una emergencia o situación de seguridad real; o la pregunta no tiene ninguna relación con ser conductor ni con trámites/vehículos. No escales solo porque la pregunta venga informal o mal escrita -- primero intenta "answer" o "search".

Responde SOLO un objeto JSON con estas claves:
- "action": "answer" | "search" | "escalate".
- "answer": tu respuesta en texto plano para WhatsApp (string), SOLO si action="answer". null en los otros dos casos.
- "search_query": SOLO si action="search", una consulta de búsqueda corta y clara en español para encontrar la respuesta (string). null en los otros dos casos.`;

interface FaqDecision { action: 'answer' | 'search' | 'escalate'; answer: string | null; searchQuery: string | null; }

async function answerDriverFaq(question: string): Promise<FaqDecision> {
  const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!apiKey) return { action: 'escalate', answer: null, searchQuery: null };
  try {
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        response_format: { type: 'json_object' },
        temperature: 0.3,
        messages: [
          { role: 'system', content: DRIVER_FAQ_SYSTEM_PROMPT },
          { role: 'user', content: question },
        ],
      }),
    });
    if (!r.ok) { console.error('[WA-Support] answerDriverFaq error', r.status, await r.text()); return { action: 'escalate', answer: null, searchQuery: null }; }
    const j = await r.json();
    const raw = j?.choices?.[0]?.message?.content as string | undefined;
    if (!raw) return { action: 'escalate', answer: null, searchQuery: null };
    const parsed = JSON.parse(raw);
    const action: string = ['answer', 'search', 'escalate'].includes(parsed.action) ? parsed.action : 'escalate';
    if (action === 'answer' && typeof parsed.answer !== 'string') return { action: 'escalate', answer: null, searchQuery: null };
    if (action === 'search' && typeof parsed.search_query !== 'string') return { action: 'escalate', answer: null, searchQuery: null };
    return {
      action: action as FaqDecision['action'],
      answer: action === 'answer' ? parsed.answer as string : null,
      searchQuery: action === 'search' ? parsed.search_query as string : null,
    };
  } catch (e) { console.error('[WA-Support] answerDriverFaq error:', e); return { action: 'escalate', answer: null, searchQuery: null }; }
}

// ─── Búsqueda web real para lo que no es política interna de Movi ────────────
// Usa la Responses API de OpenAI con la herramienta de búsqueda web integrada
// -- pedido explícito del usuario 2026-08-13: en vez de escalar a un humano
// apenas algo no está en el FAQ estático, que el bot busque de verdad y
// responda. Si la búsqueda falla por cualquier motivo, se cae a escalar (ver
// caller) en vez de dejar al conductor sin respuesta.
async function searchWebAnswer(originalQuestion: string, searchQuery: string): Promise<string | null> {
  const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!apiKey) return null;
  try {
    const r = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        tools: [{ type: 'web_search_preview' }],
        input: `Eres el asistente de soporte de conductores de Movi (app de viajes/domicilios en Colombia), respondiendo por WhatsApp. Un conductor preguntó: "${originalQuestion}"\n\nBusca en internet lo necesario para responderle con información real y actualizada de Colombia. Responde en español de Colombia, corto y directo (máximo 5-6 líneas, es un chat de WhatsApp, no un artículo). No repitas la pregunta ni digas "según mi búsqueda", solo da la respuesta como si ya la supieras. IMPORTANTE: texto plano sin formato Markdown -- nunca uses enlaces tipo [texto](url) ni asteriscos de encabezado; si necesitas citar una fuente, solo el nombre (ej. "según la Policía Nacional"), nunca la URL completa.\n\nConsulta sugerida: ${searchQuery}`,
      }),
    });
    if (!r.ok) { console.error('[WA-Support] searchWebAnswer error', r.status, await r.text()); return null; }
    const j = await r.json();
    // La Responses API expone un atajo "output_text" con el texto final ya
    // ensamblado; si no viene (según versión de API), se arma a mano
    // recorriendo output[] buscando el primer mensaje con texto.
    let text: string | null = null;
    if (typeof j?.output_text === 'string' && j.output_text.trim()) {
      text = j.output_text.trim();
    } else {
      const output = j?.output as Array<Record<string, unknown>> | undefined;
      for (const item of output ?? []) {
        if (item.type !== 'message') continue;
        const content = item.content as Array<Record<string, unknown>> | undefined;
        const textPart = content?.find(c => typeof c.text === 'string');
        if (textPart) { text = (textPart.text as string).trim(); break; }
      }
    }
    if (!text) return null;
    // Red de seguridad por si el modelo igual mete un link Markdown -- en
    // WhatsApp se ve como "[texto](url?utm_source=openai)" literal, feo y
    // roto (no es clickeable). Se deja solo el texto de la cita.
    return text.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
  } catch (e) { console.error('[WA-Support] searchWebAnswer error:', e); return null; }
}

async function escalateSupportConversation(phone: string, name: string, lastMessage: string): Promise<void> {
  await Promise.all([
    upsertSupportSession(phone, { escalated: true, escalated_at: new Date().toISOString() }),
    sendSupportText(phone, 'Ya te conecto con un asesor de Movi 🙌 En un momento te escribe por acá mismo.'),
    sendText(SUPPORT_PHONE, `🧑‍✈️ *Movi Conductores* — conversación escalada\n\n${name} (${phone})\n"${lastMessage}"\n\nResponde directo desde la bandeja de entrada de WhatsApp Business (número Movi Conductores).`),
  ]);
}

// Auditoría de cada interacción -- qué preguntó, qué acción tomó el bot y con
// qué le respondió. Usado tanto para revisar calidad con el tiempo como para
// las pruebas masivas de cobertura pedidas por el usuario 2026-08-14. Nunca
// debe tumbar la conversación si falla (best-effort).
async function logSupportInteraction(phone: string, question: string, action: string, answerText: string | null): Promise<void> {
  try {
    await db().from('ag_wa_support_log').insert({ wa_phone: phone, question, action, answer_text: answerText });
  } catch (e) { console.error('[WA-Support] logSupportInteraction error:', e); }
}

// ─── Conversación completa del número de soporte ──────────────────────────────
async function handleSupportConversation(phone: string, name: string, msgText: string): Promise<void> {
  const session = await getSupportSession(phone);

  // Ya escalada a un humano -- el bot se queda callado para no pisar al asesor,
  // salvo que ya pasó el TTL (ver ESCALATION_TTL_MS) y probablemente nadie
  // retomó la conversación.
  if (session?.escalated) {
    const escalatedAt = session.escalated_at ? new Date(session.escalated_at as string).getTime() : 0;
    if (Date.now() - escalatedAt < ESCALATION_TTL_MS) return;
    await upsertSupportSession(phone, { escalated: false, escalated_at: null });
  }

  // Saludo o mensaje demasiado corto/genérico ("hola", "ayuda", "info", solo
  // emojis) -- no hay pregunta real que interpretar todavía, así que no tiene
  // sentido ni buscar ni menos escalar a un humano por esto. Se responde con
  // un menú fijo (instantáneo, sin IA) invitando a preguntar algo puntual.
  // Bug real encontrado 2026-08-13 probando cientos de preguntas: "ayuda" e
  // "info" solas escalaban a un humano en vez de guiar a la persona.
  const bareWords = msgText.trim().toLowerCase().replace(/[¿?¡!.,]/g, '');
  const isGreeting = bareWords.length <= 20 &&
    /^(hola|ola|buenas|buenos dias|buenas tardes|buenas noches|ayuda|info|informacion|inicio|menu|hey|hi)$/.test(bareWords);
  if (isGreeting) {
    const menuText =
      `${greetingOpener(name && name !== 'Usuario' ? name : null)} Soy el asistente de conductores de Movi.\n\n` +
      `Pregúntame lo que necesites, por ejemplo:\n` +
      `- Cómo registrarme y qué documentos necesito\n` +
      `- Cuánto es la comisión y cómo me pagan\n` +
      `- Bonos por viajes y programa de invitados\n` +
      `- El estado de mi solicitud, mi saldo o mis documentos\n\n` +
      `Escribe tu pregunta y te respondo.`;
    await sendSupportText(phone, menuText);
    await logSupportInteraction(phone, msgText, 'greeting_menu', menuText);
    return;
  }

  // OJO: sin \b al final de cada raíz -- "aprobad\b" nunca matchea "aprobado"
  // porque no hay límite de palabra entre "d" y "o" (ambos son caracteres de
  // palabra). Bug real encontrado 2026-08-13 (pedido explícito del usuario de
  // probar "cómo invito a otros y gano" -- con \b esa frase no activaba nada
  // porque "invitad" tampoco matchea "invitar"). Todas las raíces de abajo son
  // substrings sueltos a propósito, para cubrir cualquier conjugación/plural
  // en español (invitar/invita/invito/invitación, aprobado/aprobada/aprueban,
  // vencido/vencida/vencidos, bono/bonos, bloqueado, etc.).
  const lower = msgText.toLowerCase();
  const asksStatus   = /estado|solicitud|aprobad|aprueban|aprobaron|rechazad|revisaron/.test(lower);
  const asksWallet   = /saldo|billetera|cuanto tengo|cu[aá]nto tengo|cuanta plata|cu[aá]nta plata|recarg/.test(lower);
  const asksDocs     = /vencen|vence|vencimiento|vencid|bloque|no puedo conectar|no me deja conectar|por qu[eé] no puedo|documentos/.test(lower);
  const asksBonus    = /bono|hito|cuantos viajes|cu[aá]ntos viajes|proximo bono|pr[oó]ximo bono/.test(lower);
  const asksReferral = /invit|referid|mi link|codigo de invitaci|c[oó]digo de invitaci|link de invitaci|gano.*(otro|amigo|persona)/.test(lower);
  const needsProfile = asksStatus || asksWallet || asksDocs || asksBonus || asksReferral;

  let action = '';
  let answerText: string | null = null;

  // Preguntas sobre SU cuenta puntual -- se resuelven con datos reales de la
  // base, nunca con la IA (evita que invente un saldo o una fecha que no es).
  if (needsProfile) {
    const profile = await lookupDriverProfile(phone);
    if (!profile) {
      // El programa de invitados no depende de tener una solicitud de
      // conductor aprobada -- cualquier cuenta de Movi (o incluso alguien que
      // todavía no se ha registrado) puede preguntar cómo funciona. No tiene
      // sentido responderle "no encuentro tu solicitud" a esa pregunta puntual.
      if (asksReferral) {
        const basicUser = await lookupAgUserBasic(phone);
        action = 'profile:referral_no_account';
        answerText = await buildReferralMessage(basicUser?.agUserId ?? null, basicUser?.fullName ?? null);
      } else {
        action = 'profile:not_found';
        answerText = 'No encuentro ninguna solicitud registrada con este número 🤔\n\n¿Ya completaste el registro en la app Movi (sección "Quiero ser conductor")? Si el registro lo hiciste con otro número, dime cuál para buscarlo.';
      }
    } else if (asksStatus) {
      action = 'profile:status';
      if (profile.status === 'approved') {
        answerText = `¡Buenas noticias, ${profile.fullName}! ✅ Tu cuenta de conductor ya está *aprobada*. Ya puedes conectarte desde la app y empezar a recibir viajes.`;
      } else if (profile.status === 'rejected') {
        answerText = `Tu solicitud fue *rechazada*${profile.rejectionReason ? `:\n\n"${profile.rejectionReason}"` : '.'}\n\nCorrige lo que haga falta y vuelve a enviar tus documentos desde la app.`;
      } else {
        answerText = `Tu solicitud sigue *en revisión* 🕐 (normalmente toma 24-48 horas hábiles). Te avisamos apenas quede lista.`;
      }
    } else if (asksWallet) {
      action = 'profile:wallet';
      answerText = `Tu saldo actual en la billetera es *${fmtCOP(profile.walletBalance)}* 💰\n\nAhí se descuenta automáticamente el 12% de comisión de cada viaje. Puedes recargar desde la app con tarjeta o PSE.`;
    } else if (asksDocs) {
      action = 'profile:docs';
      const lines = [
        `Licencia: ${fmtDate(profile.licenseExpiry)}`,
        `SOAT: ${fmtDate(profile.soatExpiry)}`,
        `Tecnomecánica: ${fmtDate(profile.tecnoExpiry)}`,
        `Seguro responsabilidad civil: ${fmtDate(profile.civilLiabilityExpiry)}`,
      ].join('\n');
      const blockedMsg = profile.documentsExpired
        ? '\n\n🔴 Tienes al menos un documento vencido -- tu cuenta está bloqueada para conectarte hasta que lo renueves desde la app. Se desbloquea al instante al subir el documento nuevo.'
        : profile.vehicleNeedsUpdate
          ? '\n\n🟠 Tu vehículo actual superó el límite de antigüedad permitido -- actualiza tus datos en "Mis vehículos" para poder conectarte.'
          : '\n\n✅ Todo en orden, no tienes nada vencido ni bloqueado.';
      answerText = `📋 *Vencimiento de tus documentos:*\n\n${lines}${blockedMsg}`;
    } else if (asksBonus) {
      const benefits = await getDriverBenefits(profile.driverId);
      if (!benefits) {
        action = 'profile:bonus_error';
        answerText = 'No pude consultar tus bonos en este momento, intenta de nuevo en un rato 🙏';
      } else {
        action = 'profile:bonus';
        const totalTrips = benefits.total_trips as number;
        const nextTrips = benefits.next_milestone_trips as number | null;
        const nextBonus = benefits.next_milestone_bonus as number | null;
        const lifetimeBonus = benefits.lifetime_bonus_earned as number;
        const remaining = nextTrips != null ? nextTrips - totalTrips : null;
        answerText =
          `🎁 *Tus bonos, ${profile.fullName}:*\n\n` +
          `Viajes completados: *${totalTrips}*\n` +
          `Bonos ganados hasta ahora: *${fmtCOP(lifetimeBonus)}*\n` +
          (nextTrips != null && nextBonus != null
            ? `Próximo bono: *${fmtCOP(nextBonus)}* al llegar a *${nextTrips} viajes* (te faltan ${remaining}).`
            : 'No hay un próximo bono configurado por ahora.');
      }
    } else if (asksReferral) {
      action = 'profile:referral';
      answerText = await buildReferralMessage(profile.agUserId, profile.fullName);
    }
  }

  if (answerText == null) {
    const faq = await answerDriverFaq(msgText);
    if (faq.action === 'answer' && faq.answer) {
      action = 'answer';
      answerText = faq.answer;
    } else if (faq.action === 'search' && faq.searchQuery) {
      const searched = await searchWebAnswer(msgText, faq.searchQuery);
      if (searched) { action = 'search'; answerText = searched; }
      // Si la búsqueda falla (sin internet/API/timeout), answerText sigue
      // null y cae a escalar más abajo -- mejor eso que dejar al conductor
      // sin ninguna respuesta.
    }
  }

  if (answerText != null) {
    await sendSupportText(phone, answerText);
    await logSupportInteraction(phone, msgText, action, answerText);
    return;
  }

  await escalateSupportConversation(phone, name, msgText);
  await logSupportInteraction(phone, msgText, 'escalate', null);
}

// ─── Servidor principal ───────────────────────────────────────────────────────
serve(async (req) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };

  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const url = new URL(req.url);

  // Verificación del webhook de Meta (GET)
  if (req.method === 'GET') {
    const mode      = url.searchParams.get('hub.mode');
    const token     = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');
    if (mode === 'subscribe' && token === WEBHOOK_VERIFY_TOKEN) {
      return new Response(challenge, { status: 200 });
    }
    return new Response('Forbidden', { status: 403 });
  }

  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return new Response('Bad Request', { status: 400 }); }

  // Envío manual desde código Angular (no de Meta ni de trigger)
  if (!body._internal_event && !body.entry && (body.phone || body.to === 'admin')) {
    const { phone, to, event, data, message } = body as Record<string, unknown>;
    // to:'admin' manda al número de soporte (SUPPORT_PHONE, server-side) en vez de
    // exigir un phone del frontend -- así el número de soporte no queda expuesto
    // en el bundle del cliente. Usado por reportTripError() en anda-gana.service.ts.
    const targetPhone = to === 'admin' ? SUPPORT_PHONE : (phone as string | undefined);
    if (!targetPhone) return new Response(JSON.stringify({ error: 'phone required' }), { status: 400 });

    const msgData = (data as Record<string, string>) ?? {};
    let text = (message as string) ?? '';

    // error_alert usa la plantilla aprobada "trip_error_alert" (categoria Utilidad)
    // para no depender de la ventana de 24h de conversacion -- si la plantilla
    // todavia no fue aprobada por Meta (o falla por cualquier motivo), cae de
    // vuelta al texto libre de siempre como respaldo.
    if (event === 'error_alert') {
      const contexto = msgData.context ?? 'desconocido';
      const detalle  = msgData.message ?? '';
      const tplResult = await sendTemplate(toE164(targetPhone), 'trip_error_alert', 'es_CO', [contexto, detalle], ['contexto', 'detalle']);
      let waResult: WaResult = tplResult;
      let txtResult: WaResult | null = null;
      if (!waResult.ok) {
        txtResult = await sendText(toE164(targetPhone), `🔴 *Movi* — Error en el flujo de viaje\n\n📍 Contexto: ${contexto}\n⚠️ ${detalle}`);
        waResult = txtResult;
      }
      try {
        const supabase = db();
        await supabase.from('ag_admin_notifications').insert({
          type:  'trip_error',
          title: `Error en flujo de viaje: ${contexto}`,
          body:  detalle,
        });
      } catch (e) { console.error('[WA] error_alert notification insert error:', e); }
      // Diagnostico permanente pero gateado (mismo patron que ag-otp-send): con ?debug=1 en la
      // URL se devuelve el error crudo de Meta de CADA intento. Hace falta porque logWaMessage()
      // registra el mensaje aunque Meta lo rechace, asi que el log dice "enviado" cuando en
      // realidad no llego nada -- y sin logs de ejecucion no habia forma de ver el motivo real.
      const urlDbg = new URL(req.url);
      if (urlDbg.searchParams.get('debug') === '1') {
        return new Response(JSON.stringify({
          sent: waResult.ok,
          plantilla: { ok: tplResult.ok, status: tplResult.status, body: (tplResult.body ?? '').slice(0, 500) },
          texto: txtResult ? { ok: txtResult.ok, status: txtResult.status, body: (txtResult.body ?? '').slice(0, 500) } : 'no hizo falta',
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify({ sent: waResult.ok }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // new_registration: aviso al dueño cada vez que alguien se registra en Movi
    // (pasajero o conductor), pedido explícito 2026-08-15. Reusa la MISMA
    // plantilla aprobada "trip_error_alert" que error_alert (2 variables de
    // texto libre, categoría Utilidad ya aprobada por Meta -- no hace falta
    // pedir una plantilla nueva) pero se guarda con su propio type en
    // ag_admin_notifications para no mezclarlo con errores reales de viaje.
    if (event === 'new_registration') {
      const contexto = msgData.context ?? 'Nuevo registro en Movi';
      const detalle  = msgData.message ?? '';
      let waResult = await sendTemplate(toE164(targetPhone), 'trip_error_alert', 'es_CO', [contexto, detalle], ['contexto', 'detalle']);
      if (!waResult.ok) {
        waResult = await sendText(toE164(targetPhone), `🆕 *Movi* — ${contexto}\n\n${detalle}`);
      }
      try {
        const supabase = db();
        await supabase.from('ag_admin_notifications').insert({
          type:  'new_registration',
          title: contexto,
          body:  detalle,
        });
      } catch (e) { console.error('[WA] new_registration notification insert error:', e); }
      return new Response(JSON.stringify({ sent: waResult.ok }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!text && event) {
      const eventMap: Record<string, (d: Record<string, string>) => string> = {
        trip_request: d => `🚗 *Movi* — Nueva solicitud de viaje\n\n📍 Desde: ${d.origin}\n📍 Hasta: ${d.destination}\n💰 Oferta: $${d.price}\n\nAbre la app para ofertar.`,
        offer_received: d => `🚗 *Movi* — Nueva oferta\n\n${d.driver_name} ofrece $${d.price}\n\nAbre la app para responder.`,
        trip_accepted: d => `✅ *Movi* — ¡Viaje aceptado!\n\nConductor: ${d.driver_name}\nVehículo: ${d.vehicle}\nPlaca: ${d.plate}`,
        driver_arrived: d => `📍 *Movi* — ¡Tu conductor llegó!\n\n${d.driver_name} está esperándote.`,
        trip_started: d => `🚀 *Movi* — ¡Viaje iniciado!\n\nDestino: ${d.destination}`,
        trip_completed: d => `🏁 *Movi* — Viaje completado\n\nTotal: $${d.amount}\n¡Gracias por viajar con Movi!`,
        trip_cancelled: d => `❌ *Movi* — Viaje cancelado\n\nMotivo: ${d.reason}`,
        withdrawal_approved: d => `💸 *Movi* — Retiro aprobado\n\n$${d.amount} en proceso (máx 24 hrs hábiles).`,
        sos_alert: d => `🆘 *ALERTA SOS*\n\nUsuario: ${d.user_name}\nUbicación: ${d.location}\nViaje: ${d.trip_id}`,
      };
      text = eventMap[event as string]?.(msgData) ?? (msgData.message ?? '');
    }

    if (text) {
      const waResult = await sendText(toE164(targetPhone), text);
      return new Response(JSON.stringify({ sent: waResult.ok }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({ sent: false, error: 'no text' }), { status: 400 });
  }

  // Evento interno de DB trigger
  if (body._internal_event) {
    await handleInternalEvent(body);
    return new Response('ok', { status: 200 });
  }

  // Webhook de Meta (mensajes entrantes de usuarios)
  if (body.object === 'whatsapp_business_account' || body.entry) {
    try {
      const entry   = (body.entry as unknown[])?.[0] as Record<string, unknown>;
      const changes = (entry?.changes as unknown[])?.[0] as Record<string, unknown>;
      const value   = changes?.value as Record<string, unknown>;
      const messages = value?.messages as unknown[];

      if (messages?.length) {
        // t0 para medir cuánto tarda de verdad procesar una ubicación de
        // pasajero (ver ag_wa_location_latency, migración 239) -- alimenta la
        // señal 4 de ag_health_check(): si algún envío de ubicación real tarda
        // más de 3s, avisa solo, sin depender de que alguien vuelva a
        // reportarlo. Pedido explícito del usuario 2026-08-28 ("necesito que
        // si ya estas seguro eso no se vuelva a dañar").
        const t0           = Date.now();
        const msg         = messages[0] as Record<string, unknown>;
        const msgId       = msg.id as string | undefined;

        // Si el pasajero activó "username" (oculta su número), Meta ya no manda
        // "from" -- solo "from_user_id" con su BSUID (ver nota de isBsuid() más
        // arriba). Se usa ese como identificador de todos modos: la sesión
        // (ag_wa_sessions.wa_phone) y el resto del código lo tratan como texto
        // opaco, y recipientField() sabe mandar "recipient" en vez de "to" al
        // responderle.
        const fromPhone   = (msg.from as string | undefined) ?? (msg.from_user_id as string | undefined);
        if (!fromPhone) {
          console.error('[WA] mensaje sin "from" ni "from_user_id":', JSON.stringify(msg));
          return new Response('ok', { status: 200 });
        }

        // A cuál de los dos números (viajes o soporte a conductores) llegó
        // este mensaje -- ver SUPPORT_PHONE_NUMBER_ID más arriba. Meta manda
        // este campo en todo webhook entrante independientemente del número.
        const incomingPhoneNumberId = (value?.metadata as Record<string, unknown> | undefined)?.phone_number_id as string | undefined;
        const isSupportNumber = !!SUPPORT_PHONE_NUMBER_ID && incomingPhoneNumberId === SUPPORT_PHONE_NUMBER_ID;

        // markReadWithTyping es puramente cosmético (el "escribiendo..." se
        // autolimpia solo al mandar la respuesta real, o a los 25s) -- nada más
        // abajo depende de que termine, así que se dispara sin esperar. Antes se
        // esperaba en el mismo Promise.all que reverseGeocode/getSession, así que
        // el tiempo total de respuesta quedaba atado a lo que tardara ESTE fetch a
        // Meta (un endpoint distinto al de enviar mensajes, sin garantía de ser
        // rápido) aunque el geocode y la sesión ya estuvieran listos hace rato --
        // causa real reportada 2026-08-18 de que compartir la ubicación (con el
        // botón nuevo) se sentía lento otra vez.
        if (msgId) {
          markReadWithTyping(msgId, isSupportNumber ? SUPPORT_PHONE_NUMBER_ID : PHONE_NUMBER_ID)
            .catch(e => console.error('[WA] markReadWithTyping (fire-and-forget) error:', e));
        }

        // El registro anti-duplicado (Meta entrega los webhooks "al menos una
        // vez", no "exactamente una vez" -- si tardamos en responder o hay
        // cualquier hipo de red, reintenta el MISMO mensaje; sin este insert
        // handleConversation() corría dos veces y el saludo/menú de Movi le
        // llegaba duplicado al usuario, bug real 2026-08-09), el reverse-geocode
        // de una ubicación compartida (Mapbox) y la carga de la sesión (DB) van a
        // 2 tablas distintas + 1 host externo, totalmente independientes entre sí
        // -- no hay razón para que el insert de dedupe bloquee a los otros dos
        // antes de arrancar. Medido con instrumentación real 2026-08-18: corrían
        // en serie y el insert de dedupe por sí solo agregaba ~150-215ms al
        // tiempo de respuesta de CUALQUIER mensaje, incluida una ubicación
        // compartida. Ahora van los 3 en paralelo y se revisa el resultado del
        // dedupe después -- si resulta ser un duplicado, el geocode/sesión ya
        // calculados de más se descartan sin problema (sin efectos secundarios).
        const rawLoc = msg.type === 'location' ? (msg.location as Record<string, unknown>) : null;
        const rawLat = rawLoc?.latitude as number | undefined;
        const rawLng = rawLoc?.longitude as number | undefined;
        // Ubicación compartida mientras se espera el destino (awaiting_dest): apenas se conoce
        // la sesión (con el origen ya guardado ahí), lanzar YA la consulta de ruta real a
        // Mapbox Directions -- sin esto, ese round-trip corría recién adentro de
        // presentDestConfirm(), en serie DESPUÉS del reverse-geocode, sumando latencia nueva a
        // cada ubicación compartida (bug real reportado 2026-08-31: "la ubicación es lenta",
        // introducido por la recalibración de precio del día anterior). Mismo patrón ya
        // probado que usa precomputedAddr más abajo -- lanzar temprano, en paralelo, no en
        // serie con el resto del procesamiento del webhook.
        let precomputedRoutePromise: Promise<{ distKm: number; durationMin: number }> | undefined;
        const sessionPromise = isSupportNumber ? Promise.resolve(undefined) : getSession(fromPhone).then(s => {
          if (s && s.state === 'awaiting_dest' && rawLat != null && rawLng != null
              && s.origin_lat != null && s.origin_lng != null) {
            precomputedRoutePromise = getRouteDistanceDuration(
              s.origin_lat as number, s.origin_lng as number, rawLat, rawLng,
            );
          }
          return s;
        });
        const [dedupeResult, precomputedAddr, precomputedSession] = await Promise.all([
          msgId ? db().from('ag_wa_processed_messages').insert({ message_id: msgId }) : Promise.resolve({ error: null }),
          (!isSupportNumber && rawLat != null && rawLng != null) ? reverseGeocode(rawLat, rawLng) : Promise.resolve(undefined),
          sessionPromise,
        ]);
        const precomputedRoute = precomputedRoutePromise ? await precomputedRoutePromise : undefined;
        if (dedupeResult?.error) {
          // 23505 = unique_violation -- mensaje repetido, no reprocesar.
          if ((dedupeResult.error as { code?: string }).code === '23505') {
            return new Response('ok', { status: 200 });
          }
          console.error('[WA] dedupe insert error:', dedupeResult.error);
        }

        let   msgType     = msg.type as string;
        const contactName = ((value?.contacts as unknown[])?.[0] as Record<string, unknown>)?.profile as Record<string, unknown>;
        const name        = (contactName?.name as string) ?? 'Usuario';

        let msgText = '';
        let msgLat: number | undefined;
        let msgLng: number | undefined;

        if (msgType === 'text') {
          msgText = ((msg.text as Record<string, unknown>)?.body as string) ?? '';
        } else if (msgType === 'location') {
          const loc = msg.location as Record<string, unknown>;
          msgLat = loc?.latitude as number;
          msgLng = loc?.longitude as number;
          msgText = (loc?.name as string) ?? (loc?.address as string) ?? '';
        } else if (msgType === 'interactive') {
          const interactive = msg.interactive as Record<string, unknown>;
          msgText = ((interactive?.button_reply as Record<string, unknown>)?.title as string)
            ?? ((interactive?.list_reply as Record<string, unknown>)?.title as string)
            ?? '';
        } else if (msgType === 'audio') {
          // Nota de voz: transcribir con Whisper y tratarla como si fuera texto
          // normal -- así funciona en cualquier punto de la conversación sin
          // duplicar la máquina de estados.
          const audioId = (msg.audio as Record<string, unknown>)?.id as string | undefined;
          const transcribed = audioId ? await transcribeAudio(audioId) : null;
          if (transcribed) {
            msgText = transcribed;
            msgType = 'text';
          } else {
            const errText = `No pude escuchar tu audio 😔\n\n¿Puedes escribirlo o intentar de nuevo?`;
            if (isSupportNumber) await sendSupportText(fromPhone, errText);
            else await sendText(fromPhone, errText);
            return new Response('ok', { status: 200 });
          }
        }

        logWaMessage(fromPhone, isSupportNumber ? 'conductor' : 'pasajero', 'in', msgText, msgType);

        // Pedido de codigo de verificacion por WhatsApp -- corre ANTES del bot normal
        // (viajes o soporte) y corta el procesamiento si consumio el mensaje. Si el mensaje
        // no tiene nada que ver con un codigo devuelve false, y todo sigue igual que antes.
        if (await handleOtpCodeRequest(fromPhone, msgText, isSupportNumber)) {
          return new Response('ok', { status: 200 });
        }

        if (isSupportNumber) {
          await handleSupportConversation(fromPhone, name, msgText);
        } else {
          await handleConversation(fromPhone, name, msgType, msgText, msgLat, msgLng, precomputedAddr as string | undefined, precomputedSession, precomputedRoute);
        }

        // Fire-and-forget: no debe agregar latencia a la respuesta real que
        // ya se le mandó al pasajero.
        if (rawLat != null && rawLng != null) {
          db().from('ag_wa_location_latency').insert({ wa_phone: fromPhone, ms: Date.now() - t0 })
            .then(({ error }) => { if (error) console.error('[WA] location latency log error:', error); });
        }
      }
    } catch (e) {
      console.error('[WA] Webhook processing error:', e);
    }
    return new Response('ok', { status: 200 }); // Siempre 200 a Meta
  }

  return new Response('ok', { status: 200 });
});
