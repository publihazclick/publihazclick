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
//
// QUIÉN LO MANDÓ (migración 284). Antes solo se guardaba `direction`, así que en la
// bandeja TODO lo saliente se veía igual y era imposible saber si había contestado la
// automatización o una persona. Ahora cada envío se marca:
//   'bot'     -> lo respondió esta función contestando al webhook de Meta
//   'admin'   -> lo escribió una persona a mano desde la bandeja del panel
//   'sistema' -> aviso automático de un evento del viaje (lo dispara la app o un trigger)
//   'alerta'  -> aviso interno al número del admin, no es conversación con un cliente
// El valor por defecto es 'bot' a propósito: todo lo que sale desde el flujo
// conversacional es del bot, y solo los pocos llamadores que NO lo son lo declaran.
type WaSentBy = 'bot' | 'admin' | 'sistema' | 'alerta';

// El teléfono se guarda SIEMPRE sin el '+' inicial, como lo manda Meta en el webhook.
// Sin esto la respuesta del admin (que pasa por toE164() y queda '+573...') caía en una
// conversación distinta a la del resto del hilo ('573...') y el panel la mostraba como un
// chat fantasma de un solo mensaje -- ver el encabezado de la migración 284. Un BSUID
// ("CO.1025109683878541") no empieza por '+' y sale intacto.
function normWaPhone(phone: string): string {
  return (phone ?? '').replace(/^\+/, '');
}

function logWaMessage(
  phone: string,
  role: 'conductor' | 'pasajero',
  direction: 'in' | 'out',
  body: string,
  msgType = 'text',
  sentBy: WaSentBy = 'bot',
  sentByName: string | null = null,
  // Respuesta cruda de Meta al envío (migración 286). De acá salen el wamid --
  // que es lo único que permite casar después el acuse de entrega -- y si Meta
  // aceptó el mensaje o lo rechazó. Sin esto, "está en el log" solo significaba
  // "se lo pedimos a Meta", nunca "le llegó".
  respuestaMeta?: { ok: boolean; body?: string } | null,
): void {
  let wamid: string | null = null;
  let estado: string | null = null;
  let errorMeta: string | null = null;

  if (direction === 'out' && respuestaMeta) {
    if (respuestaMeta.ok) {
      estado = 'aceptado';
      try {
        const j = JSON.parse(respuestaMeta.body ?? '{}');
        wamid = (j?.messages?.[0]?.id as string) ?? null;
      } catch { /* sin wamid: el acuse no se podrá casar, pero el mensaje sí salió */ }
    } else {
      estado = 'fallido';
      errorMeta = (respuestaMeta.body ?? '').slice(0, 500);
    }
  }

  db().from('ag_wa_message_log').insert({
    wa_phone: normWaPhone(phone),
    role,
    direction,
    body: (body ?? '').slice(0, 4000),
    msg_type: msgType,
    sent_by: direction === 'out' ? sentBy : null,
    sent_by_name: direction === 'out' && sentBy === 'admin' ? sentByName : null,
    wamid,
    estado_entrega: estado,
    error_meta: errorMeta,
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
/**
 * WhatsApp marca la negrita con UN asterisco. La IA a veces escribe Markdown (**así**) y en
 * WhatsApp se ven los asteriscos literales (caso real 2026-10-02: "**Del conductor**"). Se
 * normaliza en el envío para que no dependa de que el modelo obedezca la instrucción.
 */
function negritaWhatsApp(t: string): string {
  return t.replace(/\*\*([^*\n]+?)\*\*/g, '*$1*').replace(/^#{1,6}\s+/gm, '');
}

async function sendText(to: string, text: string, sentBy: WaSentBy = 'bot', sentByName: string | null = null): Promise<{ ok: boolean; status?: number; body?: string }> {
  text = negritaWhatsApp(text);
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
    logWaMessage(to, 'pasajero', 'out', text, 'text', sentBy, sentByName, { ok: res.ok, body: bodyText });
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
/**
 * BUG REAL 2026-09-05: Meta rechaza con 400 cualquier variable de plantilla que traiga
 * saltos de linea, tabulaciones o 5+ espacios seguidos. Es la causa de que los avisos
 * largos al admin (el reporte diario "Conductores sin notificaciones", que lista un
 * conductor por linea) SIEMPRE cayeran al texto libre de respaldo -- y el texto libre
 * solo se entrega si la ventana de servicio de 24h esta abierta, asi que ese reporte
 * podia no llegar nunca. Se ve claro en ag_wa_message_log del 2026-09-05: el unico
 * mensaje del dia con saltos de linea es el unico marcado [NO ENTREGADO 400].
 * Se aplana aca, dentro de sendTemplate, para que valga para TODAS las plantillas.
 * El respaldo en texto libre conserva el formato original (ahi si se permiten saltos).
 */
function tplParam(text: string): string {
  const plano = (text ?? '')
    .replace(/[\r\n]+/g, ' · ')
    .replace(/\t/g, ' ')
    .replace(/ {4,}/g, '   ')
    .trim();
  // Meta limita cada variable de cuerpo a 1024 caracteres; se corta antes por seguridad.
  return plano.length > 900 ? plano.slice(0, 897) + '...' : plano;
}

async function sendTemplate(to: string, templateName: string, langCode: string, bodyParams: string[], paramNames?: string[], sentBy: WaSentBy = 'bot'): Promise<{ ok: boolean; status?: number; body?: string }> {
  bodyParams = bodyParams.map(tplParam);
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
    logWaMessage(to, 'pasajero', 'out', `${marcaTpl}[plantilla ${templateName}] ${bodyParams.join(' | ')}`, 'template', sentBy, null, { ok: res.ok, body: bodyText });
    return { ok: res.ok, status: res.status, body: bodyText };
  } catch (e) {
    console.error('[WA] sendTemplate fetch error:', e);
    return { ok: false, body: String(e) };
  }
}

type WaResult = { ok: boolean; status?: number; body?: string };

/**
 * Aviso al admin, con el título REAL de lo que pasó.
 *
 * BUG DE FONDO (2026-09-05): todos los avisos al admin salían por la plantilla
 * `trip_error_alert`, cuyo ENCABEZADO es fijo y dice literalmente
 * "Movi - Error en el flujo de viaje". Se revisó el histórico: 101 mensajes salieron
 * por esa plantilla y **solo 7 eran errores de verdad**. Los 40 más frecuentes eran
 * registros nuevos. O sea que el admin recibía cada buena noticia rotulada como falla,
 * y cuando llegaba una falla real no se distinguía de las demás -- exactamente el
 * problema que llevó a ignorar la alerta de capacidad.
 *
 * `movi_aviso_admin` tiene el título como VARIABLE de encabezado, así que cada aviso
 * llega con su nombre real ("Nuevo registro", "Chat nuevo", "Monitoreo de capacidad")
 * y eso es lo que se ve en la notificación del celular sin abrir el chat.
 *
 * Cadena de respaldo, en orden: plantilla nueva → plantilla vieja (fea pero llega,
 * mientras Meta aprueba la nueva) → texto libre (solo entrega dentro de la ventana de
 * 24h, por eso va de último). No hace falta tocar nada cuando la nueva se apruebe: el
 * primer intento deja de fallar solo.
 */
async function sendAdminTemplate(to: string, titulo: string, detalle: string, sentBy: WaSentBy = 'alerta'): Promise<WaResult> {
  try {
    const res = await fetch(`https://graph.facebook.com/v20.0/${PHONE_NUMBER_ID}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${WA_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        ...recipientField(to),
        type: 'template',
        template: {
          name: 'movi_aviso_admin',
          language: { code: 'es_CO' },
          components: [
            { type: 'header', parameters: [{ type: 'text', parameter_name: 'titulo', text: titulo }] },
            { type: 'body',   parameters: [{ type: 'text', parameter_name: 'detalle', text: detalle }] },
          ],
        },
      }),
    });
    const bodyText = await res.text();
    if (!res.ok) console.error('[WA] sendAdminTemplate Meta error:', res.status, bodyText);
    const marca = res.ok ? '' : `[NO ENTREGADO ${res.status}] `;
    logWaMessage(to, 'pasajero', 'out', `${marca}[plantilla movi_aviso_admin] ${titulo} | ${detalle}`, 'template', sentBy, null, { ok: res.ok, body: bodyText });
    return { ok: res.ok, status: res.status, body: bodyText };
  } catch (e) {
    console.error('[WA] sendAdminTemplate fetch error:', e);
    return { ok: false, body: String(e) };
  }
}

async function sendAdminAlert(to: string, titulo: string, detalle: string, textoRespaldo?: string): Promise<WaResult> {
  // El encabezado de Meta no admite saltos de línea y es corto; el cuerpo sí aguanta más.
  const t = tplParam(titulo).slice(0, 55) || 'Aviso';
  const d = tplParam(detalle) || '(sin detalle)';

  // Los tres van marcados como 'alerta': es un aviso interno al número del admin, no
  // una conversación con un cliente. Antes se guardaban igual que cualquier mensaje y
  // eran 367 filas -- el "hilo" más largo de toda la bandeja, tapando lo que sí
  // importaba. La migración 284 los deja fuera de la bandeja sin dejar de guardarlos.
  const nueva = await sendAdminTemplate(toE164(to), t, d, 'alerta');
  if (nueva.ok) return nueva;

  const vieja = await sendTemplate(toE164(to), 'trip_error_alert', 'es_CO', [t, d], ['contexto', 'detalle'], 'alerta');
  if (vieja.ok) return vieja;

  return await sendText(toE164(to), textoRespaldo ?? `*${titulo}*\n\n${detalle}`, 'alerta');
}

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
  // Videos del número de conductores (migración 293): en la bandeja se ve el caption con una
  // marca, para que el asesor sepa que ahí salió un video y no solo un texto.
  if (type === 'video') return { text: `[video] ${((payload.video as Record<string, unknown>)?.caption as string) ?? ''}`.trim(), type };
  if (type === 'location') {
    const loc = payload.location as Record<string, unknown>;
    return { text: `[ubicación] ${(loc?.name as string) ?? ''} ${(loc?.address as string) ?? ''}`.trim(), type };
  }
  // Plantillas: nombre + variables, para que la bandeja muestre qué salió y para poder buscar en el
  // log (el aviso de solicitud a conductores se deduplica por el id corto que va en las variables).
  if (type === 'template') {
    const tpl = payload.template as Record<string, unknown>;
    const comps = (tpl?.components as Array<Record<string, unknown>> | undefined) ?? [];
    const vars = comps.flatMap(c => ((c.parameters as Array<Record<string, unknown>> | undefined) ?? []).map(p => String(p.text ?? '')));
    return { text: `[plantilla ${tpl?.name ?? '?'}] ${vars.join(' | ')}`.trim(), type };
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
      logWaMessage(to as string, 'pasajero', 'out', summary.text, summary.type, 'bot', null, { ok: res.ok, body: bodyText });
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
/**
 * SOLO coordenadas. Nada de `name` ni `address`, a propósito.
 *
 * CASO REAL (2026-09-08, reportado por el usuario y reproducido con un mensaje de
 * prueba): mandábamos `name: "Tu conductor"` y `address: "Va en camino a recogerte ·
 * llega en ~3 min"`. Al tocar el mapa, la app **busca ese texto** en vez de ir a las
 * coordenadas — y como "Tu conductor" no es ningún lugar del mundo, Google responde
 * *"No se encontró ningún resultado"*. Al pasajero, que está esperando en la calle,
 * eso le dice que el sistema no sabe dónde está su conductor. Pura desconfianza.
 *
 * Las coordenadas siempre estuvieron bien; el texto que las acompañaba secuestraba
 * la búsqueda. Sin `name` ni `address` no hay nada que buscar y el mapa abre el
 * punto exacto.
 *
 * La etiqueta útil ("va en camino · llega en ~3 min") NO se pierde: va como texto
 * aparte, justo antes del mapa. Un mensaje de ubicación de WhatsApp no admite pie
 * de foto, así que ese texto es el único lugar donde puede vivir sin romper el
 * enlace al mapa.
 *
 * La firma no acepta `name`/`address` a propósito: si volvieran a ser parámetros,
 * el próximo sitio que mande una ubicación los llenaría otra vez y el fallo vuelve
 * en silencio. Son cinco los sitios que mandan ubicación en este archivo.
 */
async function sendLocation(to: string, lat: number, lng: number): Promise<WaResult> {
  return sendGraph({ to, type: 'location', location: { latitude: lat, longitude: lng } });
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
// ─── Llamada al conductor: primero hay que saber a CUÁL ──────────────────────
// Un pasajero de WhatsApp puede tener varios viajes vivos a la vez (botón "🚗 Otro
// vehículo", ver migración 222). La conversación lleva un solo cursor
// (`session.trip_request_id`), que apunta al viaje del que se está hablando ahora --
// así que "llamar" a secas le llegaba SIEMPRE al conductor de ese viaje, y el
// conductor del otro quedaba incomunicado sin que nada lo avisara.
// Con dos o más viajes vivos se pregunta con botones, y el id del botón lleva el
// viaje exacto para no volver a depender del cursor.
async function viajesVivosDelPasajero(phone: string): Promise<Array<{ id: string; quien: string; conductor: string }>> {
  const supabase = db();
  const { data } = await supabase
    .from('ag_trip_requests')
    .select('id, driver_id, passenger_name, for_other, status')
    .eq('wa_phone', phone)
    // Un viaje en curso vive con status='accepted' todo el tiempo: lo que avanza es
    // `driver_stage` (heading_to_pickup -> ... -> completed). Verificado contra la base:
    // los únicos otros valores son 'searching', 'cancelled' y 'completed'.
    .eq('status', 'accepted')
    .not('driver_id', 'is', null)
    .order('created_at', { ascending: true });

  const salida = [];
  for (const t of (data ?? []) as Array<Record<string, unknown>>) {
    const { data: d } = await supabase.from('ag_drivers').select('ag_user_id').eq('id', t.driver_id as string).maybeSingle();
    const { data: u } = d?.ag_user_id
      ? await supabase.from('ag_users').select('full_name').eq('id', d.ag_user_id as string).maybeSingle()
      : { data: null };
    salida.push({
      id: String(t.id),
      // Para quién es el viaje: con varios en curso, "Juan" a secas no distingue nada.
      // Solo el primer nombre, de los dos: el botón de WhatsApp admite 20 caracteres y
      // "Wilmer Alejandro · Maria Fernanda" se cortaba a la mitad de una palabra.
      quien: t.for_other && t.passenger_name ? String(t.passenger_name).trim().split(' ')[0] : 'ti',
      conductor: String((u as { full_name?: string } | null)?.full_name ?? 'Tu conductor').split(' ')[0],
    });
  }
  return salida;
}

/**
 * A cuál de los viajes vivos le está escribiendo el pasajero.
 *
 * Con uno solo (el 99% de los casos) devuelve el del cursor y no cuesta nada extra.
 * Con varios, respeta lo que el pasajero eligió; si nunca eligió, o si el viaje elegido
 * ya terminó, vuelve al del cursor -- nunca deja el chat sin destino.
 */
async function destinoDelChat(phone: string, session: Record<string, unknown>): Promise<string | null> {
  const cursor = (session.trip_request_id as string | null) ?? null;
  const elegido = (session.chat_trip_id as string | null) ?? null;
  if (!elegido || elegido === cursor) return cursor;
  const vivos = await viajesVivosDelPasajero(phone);
  return vivos.some(v => v.id === elegido) ? elegido : cursor;
}

/**
 * Si hay más de un viaje vivo, agrega al acuse la línea de "le estás escribiendo a X" con
 * el botón para cambiar. Se manda aparte y solo cuando hace falta: preguntar en cada
 * mensaje sería insoportable, y con un solo viaje no hay nada que aclarar.
 */
async function avisarDestinoDelChat(phone: string, tripId: string | null): Promise<void> {
  const vivos = await viajesVivosDelPasajero(phone);
  if (vivos.length < 2 || !tripId) return;
  const actual = vivos.find(v => v.id === tripId);
  if (!actual) return;
  await sendButtons(phone,
    `Tienes ${vivos.length} viajes en curso. Le estás escribiendo a *${actual.conductor}* (va por ${actual.quien}).`,
    [{ id: 'chat_switch', title: '🔁 Cambiar' }],
  );
}

async function pedirLlamada(phone: string, session: Record<string, unknown>): Promise<void> {
  const vivos = await viajesVivosDelPasajero(phone);

  if (vivos.length === 0) {
    // Sin viajes con conductor asignado: puede pasar si el pasajero escribe "llamar"
    // mientras todavía se está buscando quién lo lleve.
    await sendText(phone, `Todavía no tienes un conductor asignado 😅\n\nApenas alguien acepte tu viaje te avisamos y podrás llamarlo.`);
    return;
  }
  if (vivos.length === 1) {
    await llamarAlConductorDelViaje(phone, vivos[0].id, session);
    return;
  }

  // Los botones de WhatsApp son máximo 3 y el título máximo 20 caracteres.
  await sendButtons(phone,
    `Tienes ${vivos.length} viajes en curso 🚗\n\n¿A cuál conductor quieres llamar?`,
    vivos.slice(0, 3).map(v => ({ id: `call_trip_${v.id}`, title: `${v.conductor} · ${v.quien}`.slice(0, 20) })),
  );
}

// Hace la llamada al conductor de UN viaje concreto. Recibe el id del viaje en vez de
// leerlo de la sesión, justamente para que el botón de "¿a cuál?" no dependa del cursor.
async function llamarAlConductorDelViaje(phone: string, tripId: string, session: Record<string, unknown>): Promise<void> {
  const driverNoun = svcCopy(session.service_type as string).driverNoun;
  const supabase = db();

  const { data: trip } = await supabase
    .from('ag_trip_requests').select('driver_id, wa_phone').eq('id', tripId).maybeSingle();

  // El viaje tiene que ser de ESTE teléfono: sin esta comprobación, alguien podría mandar
  // un id de viaje ajeno y hacer que el sistema llame al conductor de otra persona.
  if (!trip || String((trip as Record<string, unknown>).wa_phone ?? '') !== phone) {
    await sendText(phone, `No encontramos ese viaje 😔`);
    return;
  }

  const { data: driver } = trip.driver_id
    ? await supabase.from('ag_drivers').select('ag_user_id').eq('id', trip.driver_id as string).maybeSingle()
    : { data: null };
  const { data: driverUser } = driver?.ag_user_id
    ? await supabase.from('ag_users').select('phone').eq('id', driver.ag_user_id as string).maybeSingle()
    : { data: null };

  // La llamada enmascarada marca por PSTN de verdad (Telnyx) -- necesita un número real,
  // no sirve con un BSUID (pasajero con "username" de WhatsApp activado, sin número
  // visible). Se avisa claro en vez de intentar marcar un identificador que no es teléfono.
  if (isBsuid(phone)) {
    await sendText(phone, `No podemos hacer la llamada porque tu WhatsApp no comparte tu número 😔\n\nEscríbele por aquí en el chat, o desactiva el nombre de usuario en Ajustes de WhatsApp para poder llamarte.`);
    return;
  }
  if (!driverUser?.phone) {
    await sendText(phone, `No encontramos el número de tu ${driverNoun} 😔`);
    return;
  }

  // Tope de 3 llamadas por viaje, contando las del pasajero Y las del conductor (ambos
  // escriben en ag_masked_calls). No es "una sola" a propósito: si el conductor no
  // contesta la primera -- va manejando, tiene el celular guardado -- el pasajero se
  // queda sin recurso y cancela, que es justo lo que ya pasó el 2026-08-30.
  const { count: yaHechas } = await supabase
    .from('ag_masked_calls').select('id', { count: 'exact', head: true })
    .eq('trip_request_id', tripId).eq('ok', true);

  if ((yaHechas ?? 0) >= 3) {
    await sendText(phone, `Ya usaste las 3 llamadas de este viaje 📞\n\nEscríbele por aquí: le llega al instante a su celular.`);
    return;
  }

  const result = await startMaskedCall(toE164(phone), toE164(driverUser.phone as string));
  // Las fallidas también se registran: son la señal de que algo está roto (saldo agotado,
  // país no habilitado) y no tenerlas fue lo que dejó pasar meses sin que nadie notara
  // que la llamada nunca había funcionado.
  await supabase.from('ag_masked_calls').insert({
    trip_request_id: tripId, quien: 'passenger',
    ok: result.ok, error: result.ok ? null : String(result.error ?? '').slice(0, 500),
  });

  if (result.ok) {
    const quedan = 3 - (yaHechas ?? 0) - 1;
    await sendText(phone,
      `📞 Te estamos llamando... contesta y te conectamos con tu ${driverNoun}.` +
      (quedan > 0 ? `\n\n_Te quedan ${quedan} llamada${quedan === 1 ? '' : 's'} en este viaje._` : ''));
  } else {
    // El mensaje deja de ser "intenta de nuevo" a secas: si el problema es de
    // configuración o de saldo, reintentar no lo arregla y solo desespera más.
    // Tampoco se promete que el mensaje "le llega al instante": si el conductor tiene la
    // app en segundo plano puede no verlo, que es exactamente lo que pasó el 2026-09-08
    // (el mensaje de la pasajera quedó sin leer). Se ofrece la salida que sí controlamos.
    await sendText(phone,
      `No pude conectar la llamada 😔\n\n` +
      `Escríbele por aquí y le mando el aviso, aunque puede que tarde en verlo.\n\n` +
      `Si prefieres, escribe *cancelar* y te consigo otro conductor de una.`);
    await sendAdminAlert(SUPPORT_PHONE, 'Falló una llamada',
      `Viaje ${tripId.slice(0, 8)} · ${String(result.error ?? 'sin detalle').slice(0, 300)}`,
      `⚠️ Falló la llamada enmascarada en el viaje ${tripId.slice(0, 8)}: ${String(result.error ?? '').slice(0, 200)}`);
  }
}

async function startMaskedCall(from: string, to: string): Promise<{ ok: boolean; error?: string }> {
  if (!TELNYX_API_KEY || !TELNYX_APPLICATION_ID || !TELNYX_MASKING_PHONE) {
    console.error('[WA] startMaskedCall: Telnyx no configurado');
    return { ok: false, error: 'not_configured' };
  }
  try {
    // 180 s = 3 minutos. Antes eran 600 (10 minutos), un techo que no correspondía a
    // nada: una llamada real de "¿dónde estás?" dura menos de un minuto. Con Colombia
    // habilitada en Telnyx cada minuto cuesta, y son DOS piernas de llamada a la vez
    // (al pasajero y al conductor), así que el minuto de conversación se paga doble.
    const texml = `<Response><Dial callerId="${TELNYX_MASKING_PHONE}" timeLimit="180">${to}</Dial></Response>`;
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
  // PRIMERO nuestra propia tabla (migración 301, barrios y conjuntos de OSM guardados en
  // PostGIS). Nominatim desde Supabase fallaba al instante (prueba real 2026-10-03: el bot
  // dijo "no lo pude identificar" en La Ínsula, que Nominatim sí conoce desde un PC). Si la
  // RPC falla o no encuentra nada, se cae a Nominatim como antes.
  try {
    const { data, error } = await db().rpc('ag_barrio_en', { p_lat: lat, p_lng: lng });
    if (error) throw error;
    const fila = (Array.isArray(data) ? data[0] : data) as { barrio?: string | null; conjunto?: string | null } | null;
    const barrio = fila?.barrio?.trim();
    const conjunto = fila?.conjunto?.trim();
    // "Conjunto Cerrado Manet, La Insula": el conjunto ubica la puerta, el barrio la zona.
    const partes = [conjunto, barrio].filter((s): s is string => !!s);
    if (partes.length) return partes.join(', ');
  } catch (e) {
    console.error('[Geo] ag_barrio_en (tabla de barrios) error:', e);
  }
  try {
    const r = await fetchWithTimeout(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1&accept-language=es`,
      { headers: { 'User-Agent': 'Movi-App/1.0 (movi@publihazclick.com)' } },
      // 2500 ms (antes 900). Medido 2026-10-03: Nominatim respondió en 0,46 / 0,92 / 0,94 /
      // 1,83 s para un punto de Cúcuta, así que con 900 ms se perdía el barrio la mayoría de
      // las veces y el pasajero veía "Barrio o sector: no lo pude identificar" (prueba real
      // del usuario ese día). Corre en paralelo con Mapbox, así que solo alarga la respuesta
      // cuando Nominatim está lento -- y el barrio es lo que el conductor necesita para
      // ubicar la zona (caso Luis Felipe, mismo día).
      2500
    );
    if (!r.ok) {
      // 429/403 = límite de uso de Nominatim; se registra para poder distinguirlo de "no hay barrio".
      console.error('[Geo] fetchNeighborhood (Nominatim) HTTP', r.status);
      return undefined;
    }
    const j = await r.json();
    const addr = j?.address as Record<string, string> | undefined;
    // OSM etiqueta el barrio con distintos tags según qué tan bien mapeada
    // esté la zona -- se prueban los 3 más comunes en ciudades colombianas,
    // del más específico al más general. Si no hay ninguno, la comuna
    // ("Comuna 6 - Norte", tag city_district) al menos dice el sector de la ciudad.
    return addr?.neighbourhood || addr?.suburb || addr?.quarter || addr?.city_district || undefined;
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
        // "San José de Cúcuta" es el nombre oficial de la ciudad, pero leído en la tarjeta
        // del conductor parece el BARRIO San José. Caso real 2026-10-03 (viaje 265e13d0):
        // el pasajero estaba en La Ínsula (Cenabastos), la tarjeta decía "Calle 1B 2-15,
        // San José de Cúcuta" y Luis Felipe aceptó creyendo que era el barrio San José,
        // cerca de él. Se deja solo "Cúcuta", que nadie confunde con un barrio.
        for (let i = 1; i < segments.length; i++) {
          segments[i] = segments[i].replace(/^San Jos[eé] de C[uú]cuta$/i, 'Cúcuta');
        }
        const [street, city] = segments;
        // Para este punto ya pasó tiempo de sobra (todo lo de arriba: fetch a
        // Mapbox + parsear) -- normalmente neighborhoodPromise ya está resuelta
        // y este await es instantáneo; si no, espera como mucho lo que le
        // quede de su propio timeout (2500 ms desde 2026-10-03, ver fetchNeighborhood).
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

/**
 * Dirección ESCRITA por el pasajero -> coordenadas + barrio de ese punto.
 *
 * Caso real 2026-10-03 (lo probó el usuario): escribió "torres de santa ines" y el resumen
 * mostró solo eso, sin barrio. Con una dirección escrita se muestra el texto literal del
 * pasajero (ver awaiting_origin: lo que él escribe es lo que reconoce), y el barrio solo se
 * buscaba en el camino del GPS (reverseGeocode). Ahora también se busca acá, con el mismo
 * fetchNeighborhood, y conBarrio() lo agrega al texto. Sirve doble: el conductor ubica la
 * zona, y el pasajero ve en qué barrio quedó el punto que encontró Google -- si dice otro
 * barrio, se da cuenta de que la búsqueda se equivocó ANTES de pedir.
 */
async function forwardGeocode(text: string, biasLat?: number, biasLng?: number): Promise<{ lat: number; lng: number; address: string; barrio?: string } | null> {
  const geo = await forwardGeocodeSinBarrio(text, biasLat, biasLng);
  if (!geo) return null;
  return { ...geo, barrio: await fetchNeighborhood(geo.lat, geo.lng) };
}

/** "torres de santa ines" + barrio "Santa Inés" -> sin cambio; con otro barrio -> "torres de santa ines, <barrio>". */
function conBarrio(literal: string, geo: { barrio?: string } | null | undefined): string {
  const b = geo?.barrio?.trim();
  if (!b || normalizarTexto(literal).includes(normalizarTexto(b))) return literal;
  return `${literal}, ${b}`;
}

async function forwardGeocodeSinBarrio(text: string, biasLat?: number, biasLng?: number): Promise<{ lat: number; lng: number; address: string } | null> {
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
    // Se olvida a cuál conductor le estaba escribiendo: si no, al pedir otro vehículo el
    // chat seguiría apuntando al viaje anterior, que es el mismo error al revés.
    chat_trip_id: null,
    driver_name: null, driver_price: null, driver_phone: null,
    driver_vehicle: null, driver_plate: null,
    matching_started_at: null, pending_dest_text: null,
    origin_barrio_hint: null, pending_location_kind: null,
    cotizar: false, precio_moto: null, programado_para: null,
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
// Con onlyOfferId trae ESA oferta puntual en vez de la siguiente de la cola. Se usa cuando el
// pasajero toca el boton de una oferta que ya no es la ultima que le llego: hay que responderle
// con el nombre y el precio del conductor que el escogio, no con los de la mas reciente.
// Ahi no se filtra por status='pending' a proposito: quien decide si la oferta todavia sirve es
// ag_wa_accept_offer, y un "esa oferta ya no esta disponible" es mejor que confirmarle un viaje
// con los datos de otro conductor.
async function fetchNextPendingOffer(tripId: string, onlyOfferId?: string): Promise<Record<string, unknown> | null> {
  const supabase = db();

  const base = supabase
    .from('ag_trip_offers')
    .select('id, driver_id, offered_price');

  const { data: offer } = onlyOfferId
    ? await base.eq('id', onlyOfferId).maybeSingle()
    : await base
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
/**
 * Manda al pasajero la nota de voz que grabó el conductor en la app.
 *
 * Meta no acepta una URL cualquiera para el audio: hay que SUBIRLE el archivo primero y
 * mandar el id que devuelve. Por eso el bucket puede quedarse privado -- si en cambio se le
 * pasara un enlace público, las grabaciones de voz de la gente quedarían accesibles a
 * cualquiera que adivine la dirección.
 *
 * Devuelve false en vez de reventar: una nota de voz que no se pudo entregar tiene que
 * avisarle al pasajero, no dejar la conversación colgada.
 */
async function enviarNotaDeVozAWhatsApp(phone: string, mediaPath: string, driverName: string): Promise<boolean> {
  try {
    const supabase = db();
    const { data: archivo, error } = await supabase.storage.from('movi-chat-audio').download(mediaPath);
    if (error || !archivo) { console.error('[WA] nota de voz: no se pudo bajar del bucket', error?.message); return false; }

    // Subir a Meta para obtener el id del medio.
    const form = new FormData();
    form.append('messaging_product', 'whatsapp');
    form.append('type', 'audio/ogg');
    form.append('file', archivo, 'nota.ogg');

    const subida = await fetch(`https://graph.facebook.com/v20.0/${PHONE_NUMBER_ID}/media`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${WA_TOKEN}` },
      body: form,
    });
    if (!subida.ok) { console.error('[WA] nota de voz: Meta rechazo la subida', subida.status, await subida.text()); return false; }
    const { id: mediaId } = await subida.json();
    if (!mediaId) return false;

    // El audio de WhatsApp no admite pie de foto, así que el nombre del conductor va en un
    // mensaje corto aparte -- si no, al pasajero le llega una nota de voz sin saber de quién.
    await sendText(phone, `🎤 *${driverName}* te mandó una nota de voz:`);

    const envio = await fetch(`https://graph.facebook.com/v20.0/${PHONE_NUMBER_ID}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${WA_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', to: toE164(phone), type: 'audio', audio: { id: mediaId } }),
    });
    if (!envio.ok) { console.error('[WA] nota de voz: Meta rechazo el envio', envio.status, await envio.text()); return false; }
    return true;
  } catch (e) {
    console.error('[WA] nota de voz:', e);
    return false;
  }
}

/**
 * Transcribe una nota de voz guardada en el bucket. Es el respaldo de cuando Meta rechaza
 * el audio por formato: el mensaje llega igual, en texto, en vez de perderse.
 * Whisper acepta webm, ogg, mp4 y demás, así que no importa cómo lo haya grabado el celular.
 */
async function transcribirNotaDeVoz(mediaPath: string): Promise<string | null> {
  const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!apiKey) return null;
  try {
    const supabase = db();
    const { data: archivo } = await supabase.storage.from('movi-chat-audio').download(mediaPath);
    if (!archivo) return null;

    const form = new FormData();
    form.append('file', archivo, mediaPath.split('/').pop() ?? 'nota.webm');
    form.append('model', 'whisper-1');
    form.append('language', 'es');

    const r = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    });
    if (!r.ok) { console.error('[WA] transcribir nota de voz:', r.status, await r.text()); return null; }
    return ((await r.json())?.text as string)?.trim() || null;
  } catch (e) {
    console.error('[WA] transcribir nota de voz:', e);
    return null;
  }
}

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
  // Sin tildes: OpenStreetMap trae "La Insula" y el pasajero escribe "La Ínsula"; con
  // toLowerCase() solo no se reconocían como el mismo barrio y salían los dos seguidos.
  if (normalizarTexto(addr).includes(normalizarTexto(h))) return addr;
  // Coordenadas crudas de respaldo ("7.92600, -72.49633", ver reverseGeocode): partirlas por
  // la coma metía el barrio ENTRE latitud y longitud. El punto exacto ya va en el mapa del
  // conductor; como texto le sirve más el barrio solo.
  if (/^-?\d+\.\d+,\s*-?\d+\.\d+$/.test(addr.trim())) return h;
  const parts = addr.split(', ');
  if (parts.length >= 2) {
    // Justo después de la calle (parts[0]), antes de la zona/barrio
    // automático y la ciudad -- "calle, [barrio del pasajero], zona grande
    // automática, ciudad", sin repetir la palabra "barrio" (se veía raro
    // repetida cuando también hay zona automática -- pedido explícito).
    // Desde 2026-10-03 el bot pide barrio y número de vivienda SIEMPRE que llega un GPS,
    // así que el pasajero suele repetir el barrio que el mapa ya encontró ("La Ínsula, casa
    // 2-15" sobre "Avenida 2 1a-60, La Insula, Cúcuta"): se quita la zona automática que ya
    // está dentro de lo que él escribió, para no mostrarla dos veces.
    const calle = parts[0];
    const ciudad = parts[parts.length - 1];
    const zonas = parts.slice(1, -1).filter(z => !normalizarTexto(h).includes(normalizarTexto(z)));
    return (parts.length === 2 ? [calle, h, ciudad] : [calle, h, ...zonas, ciudad]).join(', ');
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
async function startSmartFlow(phone: string, parsed: ParsedRequest, cotizar = false): Promise<void> {
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

  // Carro/Moto: flujo rápido (2026-10-01) -- directo a la ubicación, sin "¿para quién?".
  if (!needsPackage) {
    await askOriginDirect(phone, svc, parsed.dest_text, cotizar);
    return;
  }

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

// ════════════════════════════════════════════════════════════════════════════
// FLUJO RÁPIDO DE PASAJEROS (2026-10-01, pedido urgente del usuario)
//
// Caso real que lo motivó (…833, 20:23): "¿qué precio tiene una carrera al aeropuerto
// Camilo Daza? estoy a cinco minutos". Recibió el precio SEIS minutos después, tras ~8
// preguntas: ¿para ti o para otro? (dos veces), ¿en qué barrio?, ¿dónde estás? (ya lo había
// dicho), confirmar recogida, confirmar destino... y además su frase "Te envío la ubicación y
// te recuerdo la dirección también" quedó pegada DENTRO de la dirección.
//
// Ahora, para Carro/Moto pedidos por uno mismo:
//   1. ¿Dónde te recojo? (botón de ubicación)           -- sin "¿para quién?" ni barrio
//   2. ¿A dónde vas?  (solo si no lo dijo ya)
//   3. RESUMEN: recogida + destino + precio sugerido    -- [Pedir $X] [Otro precio] [Corregir]
// Un solo paso de confirmación en vez de tres. La creación del viaje y el precio mínimo siguen
// siendo los de awaiting_price, sin duplicar nada (el resumen solo lo invoca).
//
// "Otra persona" y Domicilio siguen por su camino de siempre (responsabilidad, nombre y
// celular de quien viaja, descripción del paquete): ahí esos pasos sí son necesarios.
// ════════════════════════════════════════════════════════════════════════════

/** Paso 1 del flujo rápido: pedir la ubicación de recogida, sin preguntas previas. */
async function askOriginDirect(phone: string, svc: string, destText: string | null, cotizar = false): Promise<void> {
  await upsertSession(phone, {
    state: 'awaiting_origin', service_type: svc, is_for_self: true, cotizar, precio_moto: null,
    traveler_name: null, traveler_phone: null, origin_barrio_hint: null, pending_location_kind: null,
  });
  const cabeza = cotizar
    ? `💰 Te cotizo *sin compromiso*${destText ? ` el viaje a *${destText}*` : ''} 🙌\n\n`
    : destText
      ? `${SERVICE_LABELS[svc] ?? svc} a *${destText}* ✨\n\n`
      : `${SERVICE_LABELS[svc] ?? svc} 👍\n\n`;
  await sendLocationRequest(phone,
    `${cabeza}📍 *¿Dónde te recojo?* Toca el botón para compartir tu ubicación, o escríbeme la dirección.` +
    (destText && !cotizar ? `\n\nApenas la tenga te digo el precio, sin compromiso.` : '') +
    (cotizar ? '' : `\n\n_¿Es para otra persona? Escribe *otra persona*._`));
}

/** "Te envío la ubicación y te recuerdo la dirección también Urbanización Prados Norte Calle 21N..."
 *  -> "Urbanización Prados Norte Calle 21N...". Se corta todo lo que va ANTES de la primera palabra
 *  que arranca una dirección. Si no hay ninguna, se deja el texto como vino. */
function limpiarDireccion(t: string): string {
  const m = t.match(/\b(urbanizaci[oó]n|urb\.?|calle|cll?\.?|carrera|cra\.?|kr\.?|avenida|av\.?|diagonal|dg\.?|transversal|tv\.?|barrio|conjunto|edificio|manzana|mz\.?|anillo vial)\s/i);
  if (!m || !m.index) return t.trim();
  // Solo se corta si lo de adelante es conversación, no parte del lugar: "Hotel Tonchalá
  // Calle 10" debe quedar entero.
  const antes = t.slice(0, m.index);
  return /env[ií]o|direcci[oó]n|ubicaci[oó]n|estoy|recuerdo|queda|me encuentro|rec[oó]g|es en|vivo/i.test(antes)
    ? t.slice(m.index).trim() : t.trim();
}

/** ¿Pregunta el precio sin dar todavía una dirección? */
function preguntaPrecio(t: string): boolean {
  return /precio|cu[aá]nto (vale|cuesta|cobra|sale|me cobra|seria|ser[ií]a)|tarifa|valor de la carrera/i.test(t) && !/\d/.test(t);
}

/** Pedido "para otra persona" escrito en el paso de la ubicación. */
function esParaOtraPersona(t: string): boolean {
  const n = t.toLowerCase();
  return /otra persona|para otr[oa]\b|no es para m[ií]|para (mi )?(mam[aá]|pap[aá]|hij[oa]|espos[oa]|novi[oa]|herman[oa]|amig[oa]|abuel[oa]|t[ií][oa]|prim[oa]|señora|señor)/.test(n);
}

/** Advertencia de responsabilidad de "otra persona" (antes vivía dentro de awaiting_for_whom). */
async function presentLiabilityAck(phone: string): Promise<void> {
  await upsertSession(phone, { state: 'awaiting_liability_ack', is_for_self: false });
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
}

/**
 * Ya hay recogida (flujo rápido): se guarda SIN pedir confirmación aparte -- la recogida se
 * muestra en el resumen, y ahí se corrige si hace falta. Si ya se sabe el destino (lo dijo en
 * el primer mensaje, o venía de "Corregir recogida"), directo al resumen.
 * `desdeTexto`: la recogida vino escrita. Si en los siguientes 90 s llega una ubicación GPS,
 * es la misma recogida más precisa (…833 mandó texto y ubicación con 2 s de diferencia), no
 * el destino.
 */
async function originDirectNext(
  phone: string, addr: string, lat: number, lng: number,
  session: Record<string, unknown>, desdeTexto: boolean,
): Promise<void> {
  const marca = desdeTexto ? `origen_texto:${Date.now()}` : null;
  await upsertSession(phone, { origin_lat: lat, origin_lng: lng, origin_address: addr, pending_location_kind: marca });
  const s: Record<string, unknown> = { ...session, origin_lat: lat, origin_lng: lng, origin_address: addr, pending_location_kind: marca };

  // Destino ya conocido (coordenadas guardadas, p. ej. venía de "Corregir recogida").
  if (s.dest_lat != null && s.dest_lng != null && s.dest_name) {
    await presentTripSummary(phone, s.dest_name as string, s.dest_lat as number, s.dest_lng as number, s);
    return;
  }
  // Destino dicho en el primer mensaje ("al aeropuerto Camilo Daza").
  const pendingDest = s.pending_dest_text as string | null;
  if (pendingDest) {
    const geo = await forwardGeocode(pendingDest, lat, lng);
    if (geo && isInColombia(geo.lat, geo.lng)) {
      await presentTripSummary(phone, conBarrio(pendingDest, geo), geo.lat, geo.lng, s);
      return;
    }
    await upsertSession(phone, { pending_dest_text: null });
  }
  await upsertSession(phone, { state: 'awaiting_dest' });
  // Recogida por GPS: se le dice dirección y barrio por separado (pedido del usuario
  // 2026-10-03: "que le devolvamos la dirección en que lo está ubicando el mapa y el barrio
  // o sector"), así nota de un vistazo si el mapa lo puso en otro lado. Escrita: es su
  // propio texto, basta con repetírselo.
  // Ya respondió barrio y número (origin_barrio_hint): la dirección ya es la suya, no "el mapa".
  const recojo = (desdeTexto || s.origin_barrio_hint || s.recogida_confirmada)
    ? `📍 Te recojo en *${addr}*`
    : `📍 El mapa te ubica en:\n${lineasUbicacion(addr)}`;
  await sendText(phone, `${recojo}\n\n🏁 *¿A dónde vas?* Escríbeme la dirección o comparte la ubicación.`);
}

/** ¿Esta ubicación GPS es la misma recogida que acaba de escribir? (ver originDirectNext) */
function esRecogidaRecienEscrita(session: Record<string, unknown>): boolean {
  const k = session.pending_location_kind as string | null;
  if (!k?.startsWith('origen_texto:')) return false;
  return Date.now() - Number(k.split(':')[1]) < 90_000;
}

// ════════════════════════════════════════════════════════════════════════════
// RECOGIDA POR GPS -> PEDIR BARRIO Y NÚMERO DE VIVIENDA ANTES DE BUSCAR CONDUCTOR (2026-10-03)
//
// CASO REAL (viaje 265e13d0, 2026-10-03 9:46): el pasajero compartió su ubicación en
// La Ínsula (Cenabastos). OpenStreetMap no alcanzó a dar el barrio en sus 900 ms (ver
// fetchNeighborhood) y la tarjeta del conductor quedó "Calle 1B 2-15, San José de Cúcuta".
// Luis Felipe aceptó creyendo que era el barrio San José, cerca de él, y el viaje se canceló
// 7 minutos después. Medido en 30 días: 2 de 32 viajes por WhatsApp salieron sin barrio y
// LOS DOS se cancelaron con conductor ya asignado.
//
// Evolución el mismo día: primero se preguntaba solo cuando faltaba el barrio; luego también
// con calle sin número ("Avenida 2"); al final el usuario pidió preguntarlo SIEMPRE que llega
// un GPS, mostrando dónde lo ubica el mapa (dirección + barrio de la tabla ag_barrios_osm,
// migración 301). Nadie conoce su barrio y su número de casa mejor que el propio pasajero.
// ════════════════════════════════════════════════════════════════════════════

/**
 * "Calle 1B 2-15, La Ínsula, Cúcuta" ->
 *   🏠 *Dirección:* Calle 1B 2-15, Cúcuta
 *   🏘️ *Barrio o sector:* La Ínsula
 * reverseGeocode arma "calle, barrio, ciudad" y combineWithBarrioHint mete lo que escribió el
 * pasajero justo después de la calle, así que todo lo del medio es barrio/sector.
 */
function lineasUbicacion(addr: string): string {
  const p = addr.split(',').map(s => s.trim()).filter(Boolean);
  const calle = p.length >= 2 ? `${p[0]}, ${p[p.length - 1]}` : (p[0] ?? addr);
  const barrio = p.length >= 3 ? p.slice(1, -1).join(', ') : null;
  return `🏠 *Dirección:* ${calle}\n🏘️ *Barrio o sector:* ${barrio ?? '_no lo pude identificar_'}`;
}

/**
 * Nombre del lugar si la ubicación se ELIGIÓ de la lista del mapa; null si es la ubicación
 * actual. El webhook deja en `text` el `name` (o el `address`) del mensaje de ubicación, y
 * "Enviar tu ubicación actual" no trae ninguno de los dos.
 */
function lugarElegidoDe(msgType: string, text: string): string | null {
  if (msgType !== 'location') return null;
  // Cuando se elige una DIRECCIÓN (no un sitio con nombre) llega larga, p. ej. real del
  // 2026-10: "Av. 2 #32-37, Cúcuta, Norte de Santander, Colombia". Se quitan país y
  // departamento, que no ayudan a nadie a reconocer el punto.
  const t = (text ?? '').split(',').map(s => s.trim())
    .filter(s => s && !/^(colombia|norte de santander)$/i.test(s)).join(', ');
  return t.length >= 2 ? t.slice(0, 80) : null;
}

/** Botones del mensaje del rango (ver seguirConRecogida) y de sus recordatorios. */
const BOTONES_RECOGIDA = [
  { id: 'mejorar_dir', title: 'Mejorar dirección' },
  { id: 'barrio_ok', title: '✅ Continuar' },
];

/**
 * ¿Lo que escribió trae tipo de vía o "#"? Entonces es una dirección completa. Un número suelto
 * NO basta: "La Ínsula, casa 2-15" es barrio + casa, y debe sumarse a la calle del mapa.
 */
function esDireccionCompleta(t: string): boolean {
  return /\b(calle|cll?|carrera|cra|kra|kr|avenida|av|diagonal|dg|transversal|tv|manzana|mz|autopista|anillo vial)\b\.?/i.test(t)
    || /#\s*\d/.test(t);
}

/**
 * Dirección que escribió el pasajero al mejorar la del mapa: se usa SOLA, más la ciudad si no
 * la puso. Nada del mapa (decisión del usuario 2026-10-03, tras ver la mezcla en vivo):
 * - el barrio del mapa es el punto de barrio más cercano a < 800 m y en los límites puede ser
 *   el vecino; pegado al lado del que escribió el pasajero, el conductor ve dos barrios y no
 *   sabe a cuál creerle (el mismo tipo de confusión del caso Luis Felipe);
 * - el pasajero tocó "Mejorar dirección" justo porque la del mapa no le servía;
 * - el conductor no pierde nada: el punto GPS sigue guardado y su mapa lo lleva ahí. El texto
 *   es para encontrar la puerta, y para eso nada mejor que lo que escribe quien vive ahí.
 */
function direccionMejorada(addrMapa: string, escrita: string): string {
  const p = addrMapa.split(',').map(s => s.trim()).filter(Boolean);
  const esCoordenada = /^-?\d+\.\d+,\s*-?\d+\.\d+$/.test(addrMapa.trim());
  const ciudad = !esCoordenada && p.length >= 2 ? p[p.length - 1] : 'Cúcuta';
  return normalizarTexto(escrita).includes(normalizarTexto(ciudad)) ? escrita : `${escrita}, ${ciudad}`;
}

/**
 * ¿Alcanza para que el conductor encuentre la puerta? Al menos 3 palabras ("Torres de Santa
 * Inés apto 302") o una calle con número ("Calle 3 #4-15"). "casa 5", "aquí" o un barrio suelto
 * no alcanzan: como ya no se mezcla con el mapa, el texto tiene que valerse solo.
 */
function direccionSuficiente(t: string): boolean {
  const palabras = t.split(/[\s,]+/).filter(w => /[a-z0-9áéíóúñ]/i.test(w)).length;
  return palabras >= 3 || (esDireccionCompleta(t) && /\d/.test(t));
}

/**
 * Punto único para seguir después de tener la recogida, en el flujo rápido y en el clásico.
 * Si vino del GPS, no trae barrio y el pasajero no lo escribió antes, se le pregunta primero.
 * `desdeTexto`: la escribió el pasajero; su texto ya es lo que él reconoce, no se pregunta.
 */
async function seguirConRecogida(
  phone: string, addr: string, lat: number, lng: number,
  session: Record<string, unknown>, desdeTexto: boolean,
  lugarElegido: string | null = null,
): Promise<void> {
  // ── Punto ELEGIDO en el mapa, no la ubicación actual (2026-10-03) ─────────────
  // WhatsApp no manda la precisión del GPS (confirmado en la referencia del webhook de
  // Meta: solo latitude, longitude, name, address, url). Lo que sí delata es CÓMO se
  // compartió: "Enviar tu ubicación actual" llega sin nombre ni dirección; tocar un lugar
  // de la lista ("Cenabastos", "Éxito San Mateo") llega CON nombre. Es fácil tocar el
  // primer resultado sin querer y que el conductor vaya a otro sitio, así que se confirma.
  if (lugarElegido) {
    // El nombre del lugar le sirve al conductor más que la calle del mapa.
    // - Sitio con nombre ("Cenabastos")      -> "Cenabastos, Calle 1B 2-15, La Insula, Cúcuta"
    // - Dirección elegida ("Av. 2 #32-37, Cúcuta") -> su calle + el barrio/ciudad del mapa,
    //   sin repetir la calle: "Av. 2 #32-37, <barrio>, Cúcuta".
    const lugarCalle = lugarElegido.split(',')[0].trim();
    const restoMapa = addr.split(',').slice(1).map(s => s.trim()).filter(Boolean);
    const addrLugar = normalizarTexto(addr).includes(normalizarTexto(lugarCalle))
      ? addr
      : lugarElegido.includes(',')
        ? [lugarCalle, ...restoMapa].join(', ')
        : `${lugarElegido}, ${addr}`;
    await upsertSession(phone, { state: 'awaiting_lugar_elegido', origin_lat: lat, origin_lng: lng, origin_address: addrLugar });
    const forName = travelerLabel(session);
    await sendButtons(phone,
      `📍 ¿${forName ? `Recojo a *${forName}*` : 'Te recojo'} en *${lugarElegido}*?\n\n` +
      `_Ojo: ese es un lugar que elegiste en el mapa, no ${forName ? 'su' : 'tu'} ubicación actual._`,
      [
        { id: 'lugar_si', title: 'Sí, ahí' },
        { id: 'lugar_actual', title: 'Mi ubicación actual' },
      ]);
    return;
  }
  // Pedido del usuario 2026-10-03: con GPS se pide barrio y número de vivienda SIEMPRE (antes
  // solo si el mapa no daba barrio o número), mostrando dónde lo ubica el mapa. El conductor
  // recibe lo que escribe el pasajero, que es lo más preciso que hay.
  if (!desdeTexto && !session.origin_barrio_hint && !session.recogida_confirmada) {
    await upsertSession(phone, { state: 'awaiting_barrio_recogida', origin_lat: lat, origin_lng: lng, origin_address: addr });
    const forName = travelerLabel(session);
    const who = forName ? `está *${forName}*` : 'estás';
    // Texto pedido por el usuario 2026-10-03: "rango" a propósito -- el GPS que llega por
    // WhatsApp es aproximado (no trae precisión), y se pide también el número de vivienda.
    // Se le muestra DÓNDE lo está ubicando el mapa (pedido del usuario el mismo día): al ver
    // una dirección aproximada, la persona quiere escribir la exacta. Ya no confunde como en
    // el caso de Luis Felipe porque "San José de Cúcuta" ahora sale "Cúcuta" (reverseGeocode).
    // Las coordenadas crudas de respaldo ("7.92600, -72.49633") no se muestran: no le dicen
    // nada a nadie.
    const esCoordenada = /^-?\d+\.\d+,\s*-?\d+\.\d+$/.test(addr.trim());
    // Botones (2026-10-03, pedido del usuario): [Mejorar dirección] -> el bot le pide la
    // dirección COMPLETA y la escribe; [✅ Continuar] -> sigue con la del mapa. El segundo es
    // obligatorio: el texto es opcional ("Si prefieres…") y sin él no había cómo seguir -- un
    // "ok" quedaba guardado como barrio y le llegaba al conductor ("Avenida 2 1a-60, ok, La
    // Insula"). Escribir directo, sin tocar nada, también sirve (ver awaiting_barrio_recogida).
    // "Mejorar dirección" va sin emoji: el título de un botón tiene tope de 20 caracteres.
    await sendButtons(phone,
      // "aproximado" y no "a 50 metros" (decisión del usuario 2026-10-03): WhatsApp no manda
      // la precisión del GPS, y un número fijo haría que quien quedó a 200 m no corrija.
      `📍 ¡Listo, ya tengo un rango *aproximado* de ${forName ? 'su' : 'tu'} ubicación!\n\n` +
      (esCoordenada ? '' : `El mapa ${forName ? 'lo' : 'te'} ubica en:\n${lineasUbicacion(addr)}\n\n`) +
      `Si prefieres darnos la ubicación más precisa para el conductor, toca *Mejorar dirección* ` +
      `y escríbeme ${forName ? 'su' : 'tu'} dirección completa. Si así está bien, toca *Continuar*.`,
      BOTONES_RECOGIDA,
    );
    return;
  }
  const rapido = session.is_for_self !== false && !isDeliveryService(session.service_type as string);
  if (rapido) {
    await originDirectNext(phone, addr, lat, lng, session, desdeTexto);
    return;
  }
  await presentOriginConfirm(phone, addr, lat, lng, session);
}

// ════════════════════════════════════════════════════════════════════════════
// VIAJES PARA OTRO MOMENTO -> RECORDATORIO (2026-10-01, migración 297)
//
// No se programa el viaje (decisión del usuario: comprometer a un conductor con horas de
// anticipación es riesgoso con la flota de hoy). Se RECUERDA: 30 min antes de la hora, el bot
// le manda al pasajero su resumen con [Pedir], y se pide en ese momento.
// ════════════════════════════════════════════════════════════════════════════

const BOGOTA_OFFSET_MS = -5 * 3600e3; // Colombia no tiene horario de verano.
const DIAS = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];

/**
 * "es para mañana a las 9", "el viernes 6:30 pm", "a las 9 de la noche", "pasado mañana".
 * Devuelve la hora del viaje (UTC) o null si el mensaje no habla de otro momento. Sin hora
 * explícita se asume 7:00 am de ese día (y se le dice, para que la corrija si no es).
 * OJO: "de la mañana" es AM, no el día de mañana.
 */
function leerProgramacion(texto: string): { viajeAt: Date; conHora: boolean } | null {
  const t = texto.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const sinFranja = t.replace(/de la manana/g, ' AMX ');
  const ahoraLocal = new Date(Date.now() + BOGOTA_OFFSET_MS); // "reloj de Bogotá" en campos UTC

  let dias: number | null = null;
  if (/pasado manana/.test(sinFranja)) dias = 2;
  else if (/\bmanana\b/.test(sinFranja)) dias = 1;
  else if (/\bhoy\b|esta noche|esta tarde/.test(sinFranja)) dias = 0;
  else {
    // Con artículo obligatorio: "Santo Domingo" o "Domingo Savio" son lugares, no el domingo.
    const d = DIAS.findIndex(n => new RegExp(`\\b(el|este|el proximo|para el|pal)\\s+${n}\\b`).test(sinFranja));
    if (d >= 0) { dias = (d - ahoraLocal.getUTCDay() + 7) % 7 || 7; }
  }

  const h = sinFranja.match(/\b(?:a las|para las|tipo|como a las|a eso de las|sobre las)\s*(\d{1,2})(?:[:.h](\d{2}))?\s*(am|a\.?\s?m\.?|pm|p\.?\s?m\.?|AMX|de la tarde|de la noche)?/i)
         ?? sinFranja.match(/\b(\d{1,2})(?:[:.](\d{2}))?\s*(am|a\.\s?m\.|pm|p\.\s?m\.)/i);
  if (dias === null && !h) return null;

  let hora = 7, min = 0;
  if (h) {
    hora = Number(h[1]); min = h[2] ? Number(h[2]) : 0;
    const franja = (h[3] ?? '').toLowerCase().replace(/[\s.]/g, '');
    if (hora > 23 || min > 59) return null;
    if (/pm|tarde|noche/.test(franja) && hora < 12) hora += 12;
    else if (/am|amx/.test(franja) && hora === 12) hora = 0;
    else if (!franja && hora >= 1 && hora <= 6) hora += 12; // "a las 3" casi siempre es de la tarde
    if (/de la noche|esta noche|esta tarde/.test(sinFranja) && hora < 12) hora += 12;
  }

  const local = new Date(Date.UTC(ahoraLocal.getUTCFullYear(), ahoraLocal.getUTCMonth(), ahoraLocal.getUTCDate() + (dias ?? 0), hora, min));
  let viajeAt = new Date(local.getTime() - BOGOTA_OFFSET_MS);
  // Dijo solo la hora y esa hora ya pasó hoy: es mañana ("a las 9am" dicho a las 8:30 pm).
  if (dias === null && viajeAt.getTime() < Date.now()) viajeAt = new Date(viajeAt.getTime() + 864e5);
  // Solo cuenta si es de verdad "otro momento": al menos 45 min en el futuro. "Mándamelo a las
  // 9" cuando son las 8:50 es para ya, y se sigue con el flujo normal.
  if (viajeAt.getTime() - Date.now() < 45 * 60e3) return null;
  return { viajeAt, conHora: !!h };
}

/** "mañana viernes a las 9:00 am" / "hoy a las 8:30 pm" (hora de Bogotá). */
function describirHora(d: Date): string {
  const l = new Date(d.getTime() + BOGOTA_OFFSET_MS);
  const hoy = new Date(Date.now() + BOGOTA_OFFSET_MS);
  const diff = Math.round((Date.UTC(l.getUTCFullYear(), l.getUTCMonth(), l.getUTCDate()) - Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate())) / 864e5);
  const dia = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'][l.getUTCDay()];
  const cuando = diff === 0 ? 'hoy' : diff === 1 ? `mañana ${dia}` : `el ${dia}`;
  const h = l.getUTCHours(), m = l.getUTCMinutes();
  return `${cuando} a las ${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
}

/**
 * Ya hay recogida y destino y el viaje es para otro momento: se guarda el recordatorio y se le
 * confirma. WhatsApp solo deja escribirle dentro de las 24 h de su último mensaje (que es
 * ahora), así que un recordatorio que caiga después NO se crea: se le dice de frente.
 */
async function crearRecordatorio(phone: string, session: Record<string, unknown>, viajeAt: Date, conHora: boolean, precio?: number): Promise<void> {
  const recordarAt = new Date(Math.max(viajeAt.getTime() - 30 * 60e3, Date.now() + 2 * 60e3));
  const svc = (session.service_type as string) ?? 'carro';
  const vehiculo = svc === 'moto' ? 'la moto' : 'el carro';
  await resetSession(phone);

  if (recordarAt.getTime() - Date.now() > 23 * 3600e3) {
    await sendText(phone,
      `Para ${describirHora(viajeAt)} escríbeme ese mismo día y te consigo ${vehiculo} en minutos 🙌\n\n` +
      `_Por WhatsApp solo te puedo escribir yo dentro de las 24 horas siguientes a tu último mensaje, por eso no te puedo recordar con tanta anticipación._`);
    return;
  }

  const { error } = await db().from('ag_wa_recordatorios').insert({
    wa_phone: phone, viaje_at: viajeAt.toISOString(), recordar_at: recordarAt.toISOString(), service_type: svc,
    origin_lat: session.origin_lat, origin_lng: session.origin_lng, origin_address: session.origin_address,
    dest_name: session.dest_name, dest_lat: session.dest_lat, dest_lng: session.dest_lng,
  });
  if (error) {
    console.error('[WA] crearRecordatorio error:', error);
    await sendText(phone, `No pude guardar el recordatorio 😔 Escríbeme un rato antes de la hora y te lo pido en minutos.`);
    return;
  }
  await sendText(phone,
    `✅ Listo. *${describirHora(recordarAt).replace(/^./, c => c.toUpperCase())}* te escribo por acá para pedirte ${vehiculo} con un toque.\n\n` +
    `📍 ${session.origin_address}\n🏁 ${session.dest_name}\n` +
    (precio ? `💰 Hoy sale en unos *$${precio.toLocaleString('es-CO')}* (puede variar un poco según la hora).\n` : '') +
    (conHora ? '' : `\n_Lo anoté para las 7:00 am. Si es a otra hora, dime "a las ..."._\n`) +
    `\n_Si se te adelanta el plan, escríbeme y te lo pido ya._`);
}

/** Habló de otro momento a mitad de la conversación (ver el pre-chequeo en handleConversation). */
async function manejarProgramado(phone: string, session: Record<string, unknown>, state: string, text: string, prog: { viajeAt: Date; conHora: boolean }): Promise<void> {
  // Estaba buscando conductor: esa búsqueda se cancela, el viaje no es para ya (…833).
  if ((state === 'matching' || state === 'stale_search_confirm') && session.trip_request_id) {
    await db().from('ag_trip_requests').update({
      status: 'cancelled', cancelled_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      cancel_reason: 'El pasajero aclaró que el viaje es para otro momento (WhatsApp)',
    }).eq('id', session.trip_request_id as string).eq('status', 'searching');
  }
  // Ya le habíamos dejado un recordatorio hace poco ("lo anoté para las 7:00 am, si es a otra
  // hora dime") y ahora dice la hora: se corrige ese, no se arranca un pedido nuevo.
  if (state === 'idle' || state === 'awaiting_service') {
    const { data: previo } = await db().from('ag_wa_recordatorios').select('id')
      .eq('wa_phone', phone).eq('estado', 'pendiente')
      .gte('created_at', new Date(Date.now() - 30 * 60e3).toISOString())
      .order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (previo) {
      const recordarAt = new Date(Math.max(prog.viajeAt.getTime() - 30 * 60e3, Date.now() + 2 * 60e3));
      await db().from('ag_wa_recordatorios').update({ viaje_at: prog.viajeAt.toISOString(), recordar_at: recordarAt.toISOString() }).eq('id', previo.id);
      await sendText(phone, `✅ Corregido: te escribo *${describirHora(recordarAt)}* para pedírtelo con un toque.`);
      return;
    }
  }
  const conRuta = session.origin_lat != null && session.dest_lat != null && session.dest_name;
  if (conRuta) {
    await crearRecordatorio(phone, session, prog.viajeAt, prog.conHora, session.offered_price as number | undefined);
    return;
  }
  await upsertSession(phone, { programado_para: prog.viajeAt.toISOString() });
  const anotado = `⏰ Anotado para *${describirHora(prog.viajeAt)}*.`;
  if (state === 'idle' || state === 'awaiting_service') {
    const parsed = text.length >= 8 ? await parseFreeTextRequest(text) : null;
    await sendText(phone, `${anotado} Te ayudo a dejarlo listo y te escribo 30 minutos antes para pedirlo con un toque.`);
    await askOriginDirect(phone, parsed?.service_type === 'moto' ? 'moto' : 'carro', parsed?.dest_text ?? null);
    await upsertSession(phone, { programado_para: prog.viajeAt.toISOString(), pending_dest_text: parsed?.dest_text ?? null });
    return;
  }
  if (state === 'awaiting_dest') {
    await sendText(phone, `${anotado}\n\n🏁 ¿A dónde vas? Escríbeme la dirección o comparte la ubicación.`);
    return;
  }
  // La ubicación ya está; solo falta el barrio (ver seguirConRecogida).
  if (state === 'awaiting_barrio_recogida') {
    await sendButtons(phone, `${anotado}\n\n📍 ¿Te recojo donde te ubicó el mapa? Toca *Continuar*, o *Mejorar dirección* para escribirla completa.`, BOTONES_RECOGIDA);
    return;
  }
  await sendLocationRequest(phone, `${anotado}\n\n📍 ¿Dónde te recojo? Toca el botón o escríbeme la dirección.`);
}

/** Evento del cron (migración 297): ya es la hora, se le manda su resumen con [Pedir]. */
async function enviarRecordatorioViaje(phone: string, recordatorioId: string): Promise<void> {
  const { data: r } = await db().from('ag_wa_recordatorios').select('*').eq('id', recordatorioId).maybeSingle();
  if (!r) return;
  // ¿Todavía se le puede escribir? Su último mensaje tiene que ser de hace menos de 24 h.
  const { data: ult } = await db().from('ag_wa_message_log').select('created_at')
    .eq('wa_phone', phone).eq('role', 'pasajero').eq('direction', 'in')
    .order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (!ult || Date.now() - new Date(ult.created_at as string).getTime() > 23.8 * 3600e3) {
    await db().from('ag_wa_recordatorios').update({ estado: 'ventana_cerrada' }).eq('id', recordatorioId);
    return;
  }
  const session: Record<string, unknown> = {
    wa_phone: phone, state: 'awaiting_summary', service_type: r.service_type, is_for_self: true, cotizar: false,
    origin_lat: r.origin_lat, origin_lng: r.origin_lng, origin_address: r.origin_address,
  };
  await resetSession(phone);
  await upsertSession(phone, session);
  await presentTripSummary(phone, r.dest_name as string, r.dest_lat as number, r.dest_lng as number, session,
    undefined, `⏰ *¡Hola! Como quedamos*, ya casi es la hora de tu viaje.`);
}

// ════════════════════════════════════════════════════════════════════════════
// CONDUCTOR QUE ACEPTA Y NO ARRANCA (2026-10-02, migración 298)
// Caso real …833: JORGE GARCÍA aceptó a las 09:02 y no se movió en 16 min; el pasajero se fue a
// la autopista a buscar carro. Ahora, a los 5 min sin arrancar, el bot le pregunta al pasajero.
// ════════════════════════════════════════════════════════════════════════════

async function responderConductorQuieto(phone: string, contactName: string, session: Record<string, unknown>, btnId: string): Promise<void> {
  const otro = btnId.startsWith('quieto_otro_');
  const tripId = btnId.replace(/^quieto_(otro|esperar)_/, '');

  const { data: trip } = await db().from('ag_trip_requests')
    .select('status, driver_id, driver_stage, offered_price').eq('id', tripId).maybeSingle();
  if (!trip || trip.status !== 'accepted') {
    await sendText(phone, `Ese viaje ya no está activo 🙂 Si necesitas un carro, escríbeme a dónde vas.`);
    return;
  }

  if (!otro) {
    await sendText(phone, `Listo, seguimos esperando ⏳ Si en unos minutos no arranca, te vuelvo a preguntar.`);
    return;
  }

  // El conductor arrancó justo antes de que tocara el botón: mejor no cancelarle.
  if (trip.driver_stage) {
    await sendText(phone, `¡Buenas noticias! Tu conductor acaba de arrancar hacia ti 🚗 Te aviso cuando llegue.`);
    return;
  }

  // 1) Cancelar el viaje del conductor quieto (el trigger de cancelación devuelve su comisión).
  const { data: cancelado } = await db().from('ag_trip_requests').update({
    status: 'cancelled', cancelled_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    cancel_reason: 'El conductor aceptó y no arrancó en 5+ min; el pasajero pidió otro (WhatsApp)',
  }).eq('id', tripId).eq('status', 'accepted').select('driver_id').maybeSingle();
  if (!cancelado) { await sendText(phone, `Ese viaje ya no está activo 🙂`); return; }

  // 2) Avisarle al conductor (push), igual que cuando el pasajero cancela.
  if (cancelado.driver_id) {
    const { data: driver } = await db().from('ag_drivers').select('ag_user_id').eq('id', cancelado.driver_id as string).maybeSingle();
    const { data: driverUser } = driver?.ag_user_id
      ? await db().from('ag_users').select('auth_user_id').eq('id', driver.ag_user_id as string).maybeSingle()
      : { data: null };
    if (driverUser?.auth_user_id) {
      fetch(`${SUPABASE_URL}/functions/v1/ag-send-push`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SERVICE_ROLE_KEY}` },
        body: JSON.stringify({
          user_ids: [driverUser.auth_user_id], title: '❌ El pasajero buscó otro conductor',
          body: 'Aceptaste el viaje pero no arrancaste hacia la recogida.', url: '/anda-gana', tag: `trip-${tripId}`, urgent: true,
        }),
      }).catch((e) => console.error('[WA] push conductor quieto error:', e));
    }
  }

  // 3) Relanzar el MISMO pedido (mismo recorrido y precio) con el flujo de siempre.
  const precio = (session.offered_price as number) ?? (trip.offered_price as number) ?? MIN_PRICE;
  await upsertSession(phone, {
    state: 'awaiting_price', trip_request_id: null, active_offer_id: null, offered_price: precio,
    driver_name: null, driver_price: null, driver_phone: null, driver_vehicle: null, driver_plate: null, chat_trip_id: null,
  });
  await sendText(phone, `Listo 👍 Cancelé ese viaje. Te busco otro conductor ya mismo.`);
  await handleConversation(phone, contactName, 'text', 'ok', undefined, undefined, undefined,
    { ...session, state: 'awaiting_price', trip_request_id: null, offered_price: precio });
}

// ════════════════════════════════════════════════════════════════════════════
// CAMBIO DE DESTINO ESCRITO (2026-10-02, caso real …833)
// Pidió "un taxi para la Urbanización Prados Norte..." (su casa: era la RECOGIDA), el bot la
// tomó como destino, y cuando aclaró "Es para el aeropuerto Camilo Daza" mientras se buscaba
// conductor, solo recibió "Te leo 👍". El conductor salió con destino a 200 m de la recogida.
// ════════════════════════════════════════════════════════════════════════════

/** El pasajero desiste molesto o porque ya resolvió por su cuenta (ver el pre-chequeo en handleConversation). */
function seVaMolesto(texto: string): boolean {
  const t = normalizarTexto(texto).replace(/[¡!¿?.,]/g, ' ').replace(/\s+/g, ' ').trim();
  return /\b(dejelo|dejalo|dejemos|olvidelo|olvidalo|olvidese) (asi|eso|ya)\b|^(dejelo|dejalo|olvidelo|olvidalo)$/.test(t)
      || /\bya no (lo |la )?(necesito|quiero|hace falta|me sirve)\b/.test(t)
      || /\bya (consegui|me fui|me voy en|tome|cogi|agarre|me recogieron|resolvi)\b/.test(t)
      || /\b(pesimo|malisimo|mal) servicio\b|\bque mal servicio\b|\bno sirven\b/.test(t);
}

/** "es para el aeropuerto Camilo Daza", "voy para Unicentro", "el destino es ...". Devuelve el lugar. */
function leerCambioDestino(texto: string): string | null {
  const m = texto.trim().match(/\b(?:es para|voy para|voy a|vamos para|vamos a|el destino es|mi destino es|me lleva(?:s)? a|ll[eé]v[ae]me a|ll[eé]v[ae]me al)\s+(?:el |la |los |las |al )?(.{3,80}?)[.!¡¿?]*$/i);
  if (!m) return null;
  const lugar = m[1].trim();
  // Lo que no es un lugar: "voy para allá", "es para mañana", "es para mí", "es para ya".
  if (/^(all[aá]|ac[aá]|ya|mañana|manana|hoy|m[ií]|mi |otra persona|que|donde|el centro de)$/i.test(lugar)) return null;
  if (/^(ma[ñn]ana|hoy|las? \d|un |una )/i.test(lugar)) return null;
  return lugar;
}

/**
 * Aplica el cambio de destino a un viaje en curso (buscando o ya aceptado). Solo si el lugar
 * se encuentra de verdad en el mapa y no está pegado a la recogida; si no, devuelve false y el
 * mensaje sigue su curso normal (chat con el conductor / "sigo buscando").
 */
async function aplicarCambioDestino(phone: string, session: Record<string, unknown>, tripId: string, lugar: string): Promise<boolean> {
  const oLat = session.origin_lat as number, oLng = session.origin_lng as number;
  const geo = await forwardGeocode(lugar, oLat, oLng);
  if (!geo || !isInColombia(geo.lat, geo.lng)) return false;
  const route = await getRouteDistanceDuration(oLat, oLng, geo.lat, geo.lng);
  if (route.distKm < 0.3) return false;

  const { data: trip } = await db().from('ag_trip_requests')
    .update({ dest_name: conBarrio(lugar, geo), dest_lat: geo.lat, dest_lng: geo.lng, distance_km: route.distKm, updated_at: new Date().toISOString() })
    .eq('id', tripId).in('status', ['searching', 'accepted'])
    .select('driver_id, status').maybeSingle();
  if (!trip) return false;
  await upsertSession(phone, { dest_name: lugar, dest_lat: geo.lat, dest_lng: geo.lng });

  if (trip.driver_id && session.ag_user_id) {
    // Al chat del viaje: el conductor lo ve en su app y le suena (trigger ag_chat_push_trigger).
    await db().from('ag_chat_messages').insert({
      request_id: tripId, sender_ag_user_id: session.ag_user_id,
      message: `📍 CAMBIO DE DESTINO: voy para ${lugar} (${route.distKm.toFixed(1)} km desde la recogida).`,
    });
    await sendText(phone,
      `✅ Cambié el destino a *${lugar}* (${route.distKm.toFixed(1)} km) y se lo mandé a tu conductor.\n\n` +
      `_El precio que acordaron era para el destino anterior: si cambia, cuádrenlo entre ustedes._`);
  } else {
    await sendText(phone, `✅ Cambié el destino a *${lugar}* (${route.distKm.toFixed(1)} km). Sigo buscando tu conductor.`);
  }
  return true;
}

/** Paso 3 del flujo rápido: TODO en un mensaje, con el precio, y una sola confirmación. */
async function presentTripSummary(
  phone: string, destAddr: string, dLat: number, dLng: number,
  session: Record<string, unknown>, precomputedRoute?: { distKm: number; durationMin: number },
  encabezado?: string, cercaOk = false,
): Promise<void> {
  const oLat = session.origin_lat as number;
  const oLng = session.origin_lng as number;
  const svc = (session.service_type as string) ?? 'carro';
  const route = precomputedRoute ?? await getRouteDistanceDuration(oLat, oLng, dLat, dLng);
  const distText = route.distKm > 0 ? ` (${route.distKm.toFixed(1)} km)` : '';

  // Destino a menos de 500 m de la recogida: casi siempre es la MISMA dirección leída al revés
  // ("un taxi para la Urbanización X" = que vengan a X). Se pregunta antes de mostrar el precio.
  if (!cercaOk && route.distKm < 0.5) {
    await upsertSession(phone, { state: 'awaiting_dest_cerca', dest_name: destAddr, dest_lat: dLat, dest_lng: dLng });
    await sendButtons(phone,
      `📍 *${destAddr}* queda a solo ${Math.round(route.distKm * 1000)} m de donde estás.\n\n¿Esa dirección es *donde te recojo* o *a donde vas*?`,
      [
        { id: 'cerca_origen',  title: '📍 Donde me recogen' },
        { id: 'cerca_destino', title: '🏁 A donde voy' },
      ]);
    return;
  }

  // Viaje para otro momento: en vez de pedirlo, se deja el recordatorio.
  if (session.programado_para) {
    const precio = await suggestPrice(route.distKm, svc, oLat, oLng, route.durationMin);
    await crearRecordatorio(phone, { ...session, dest_name: destAddr, dest_lat: dLat, dest_lng: dLng },
      new Date(session.programado_para as string), true, precio);
    return;
  }

  // Cotizar: los dos precios del mismo recorrido, y el pasajero escoge con un toque.
  if (session.cotizar) {
    const [carro, moto] = await Promise.all([
      suggestPrice(route.distKm, 'carro', oLat, oLng, route.durationMin),
      suggestPrice(route.distKm, 'moto', oLat, oLng, route.durationMin),
    ]);
    await upsertSession(phone, {
      state: 'awaiting_summary', service_type: 'carro',
      dest_name: destAddr, dest_lat: dLat, dest_lng: dLng,
      offered_price: carro, precio_moto: moto, pending_dest_text: null,
    });
    await sendButtons(phone,
      `💰 *Tu cotización* _(sin compromiso)_\n` +
      `📍 *Recogida:* ${session.origin_address}\n` +
      `🏁 *Destino:* ${destAddr}${distText}\n\n` +
      `🚗 Carro: *$${carro.toLocaleString('es-CO')}*\n` +
      `🏍️ Moto: *$${moto.toLocaleString('es-CO')}*\n\n` +
      `Si te sirve, toca el que quieras y te lo pido ya.`,
      [
        { id: 'sum_ok_carro', title: `🚗 Carro $${carro.toLocaleString('es-CO')}` },
        { id: 'sum_ok_moto',  title: `🏍️ Moto $${moto.toLocaleString('es-CO')}` },
        { id: 'sum_edit',     title: '✏️ Corregir' },
      ]);
    return;
  }

  const suggested = await suggestPrice(route.distKm, svc, oLat, oLng, route.durationMin);
  const vehiculo = svc === 'moto' ? 'la moto' : 'el carro';

  await upsertSession(phone, {
    state: 'awaiting_summary',
    dest_name: destAddr, dest_lat: dLat, dest_lng: dLng,
    offered_price: suggested, pending_dest_text: null,
  });
  await sendButtons(phone,
    (encabezado ? `${encabezado}\n\n` : '') +
    `${SERVICE_LABELS[svc] ?? svc}\n` +
    `📍 *Recogida:* ${session.origin_address}\n` +
    `🏁 *Destino:* ${destAddr}${distText}\n\n` +
    `💰 Precio sugerido: *$${suggested.toLocaleString('es-CO')}* _(sin compromiso)_\n\n` +
    `¿Te pido ${vehiculo}?`,
    [
      { id: 'sum_ok',    title: `✅ Pedir $${suggested.toLocaleString('es-CO')}` },
      { id: 'sum_price', title: '💰 Ofrecer otro' },
      { id: 'sum_edit',  title: '✏️ Corregir' },
    ]);
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
//
// Desde 2026-10-01 es una LISTA y no 3 botones: se sumó "💰 Cotizar un viaje" (pedido del
// usuario) y WhatsApp no admite más de 3 botones. El título de cada fila llega como texto
// igual que antes ("🚗 Carro" contiene "carro"), así que awaiting_service no cambia.
async function sendServiceButtons(phone: string, bodyText: string): Promise<void> {
  await sendGraph({ to: phone, type: 'interactive', interactive: {
    type: 'list',
    body: { text: bodyText },
    action: {
      button: 'Ver opciones',
      sections: [{ title: 'Servicios', rows: [
        { id: 'svc_cotizar',   title: '💰 Cotizar un viaje', description: 'Precio de carro y moto, sin compromiso' },
        { id: 'svc_carro',     title: '🚗 Carro' },
        { id: 'svc_moto',      title: '🏍️ Moto' },
        { id: 'svc_domicilio', title: '📦 Domicilio' },
      ] }],
    },
  } });
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
/**
 * El nombre de perfil de WhatsApp lo escribe cada quien y muchas veces no es un
 * nombre. Casos reales vistos en el soporte a conductores: ".", "A OTRO NIVEL",
 * "🌲 CARLOS CACERES 🍀", "mayrakatherinepelaezrinco", "Y2DYAZMH" -- todos salieron
 * tal cual en el saludo ("¡Hola, .!", "¡Qué tal, mayrakatherinepelaezrinco!"), que
 * se ve descuidado justo en el primer mensaje. Si no parece un nombre de persona,
 * es mejor saludar sin nombre que saludar mal.
 */
function cleanDisplayName(raw?: string | null): string | null {
  if (!raw) return null;
  // Fuera emojis, símbolos y espacios de más; queda solo texto legible.
  const limpio = raw
    .replace(/[\p{Extended_Pictographic}\p{Emoji_Presentation}]/gu, ' ')
    .replace(/[^\p{L}\p{M}\s'-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!limpio) return null;
  const primero = limpio.split(' ')[0];
  if (primero.length < 3 || primero.length > 15) return null;
  // Un token largo sin espacios y todo en minúscula suele ser un usuario o correo
  // ("mayrakatherinepelaezrinco"), no un nombre escrito por una persona.
  if (!limpio.includes(' ') && primero === primero.toLowerCase() && primero.length > 12) return null;
  // Nombre propio: primera en mayúscula, resto en minúscula (arregla "CARLOS").
  return primero.charAt(0).toUpperCase() + primero.slice(1).toLowerCase();
}

function greetingOpener(realName?: string | null): string {
  const h = bogotaHour();
  const period = h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches';
  const limpio = cleanDisplayName(realName);
  const who = limpio ? `, ${limpio}` : '';
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
    const primero = n ? n.split(/\s+/)[0] : '';
    // "Usuario" es el nombre de relleno con que se crean las cuentas sin nombre: 39 cuentas lo
    // tenían el 2026-10-01 y el bot saludaba "¡Hola Usuario!". Ese y cualquier cosa que no parezca
    // un nombre (números, una letra) se tratan como "sin nombre".
    if (!primero || primero.length < 2 || /\d/.test(primero) ||
        /^(usuario|pasajero|conductor|cliente|sin|nombre|user|test|prueba)$/i.test(primero)) return null;
    // Capitalizado natural: venían cuentas con "javier" o "CARLOS".
    return primero.charAt(0).toUpperCase() + primero.slice(1).toLowerCase();
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
  // El número va también en texto plano, no solo como link: si el mensaje se
  // reenvía o se lee en un equipo donde wa.me no abre, el link no sirve de nada
  // y la persona igual tiene que poder guardar o marcar el número.
  return `¡Qué bueno que quieras unirte a Movi! 🚗🏍️\n\n` +
    `Este número es solo para pedir viajes -- para todo lo de registro como conductor ` +
    `(requisitos, documentos, comisión, bonos) escríbenos al *300 964 5697*:\n` +
    `https://wa.me/${DRIVER_SUPPORT_PHONE}\n\n` +
    `Ahí te ayudamos con todo el proceso.`;
}

// Pregunta por la descarga de la app -- pedido explícito del usuario 2026-09-05,
// después de ver que 4 de 16 conductores preguntaron esto y 3 dijeron "no la
// encuentro". El bot contestaba "búscala en Play Store" y llegó a inventarse una
// app inexistente ("MoviSur"). Se resuelve con un detector fijo (sin IA, sin
// búsqueda web) que garantiza que el link salga SIEMPRE, en los dos números.
/** "¿Cómo se usa / cómo funciona / cómo se trabaja con la app?" (ver handleSupportConversation). */
function preguntaComoFunciona(t: string): boolean {
  const n = t.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/[¿?¡!.,]/g, ' ').replace(/\s+/g, ' ').trim();
  return /\bcomo\b.{0,25}\b(se usa|se utiliza|utilizo|uso la|usar la|usarla|utilizarla|funciona|se trabaja|trabajo con|trabajar con|se maneja|manejo la|recibo (los )?viajes|me llegan (los )?viajes)\b/.test(n)
      || /\b(como|cual) es el (funcionamiento|procedimiento|proceso) (de|para) (la app|trabajar|la aplicacion)\b/.test(n)
      // Sin el "cómo" (o mal escrito: "con se utiliza la aplicación para trabajar", caso real …848).
      || /\bse (usa|utiliza|maneja)\b.{0,20}\b(app|aplicacion|aplicativo|plataforma)\b/.test(n);
}

function isAppDownloadInquiry(t: string): boolean {
  const n = t.toLowerCase()
    .normalize('NFD').replace(/\p{M}/gu, '')
    .replace(/[¿?¡!.,]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Frases que por sí solas ya no significan otra cosa en este contexto.
  const solas = [
    'como descargo', 'donde descargo', 'como la descargo', 'donde la descargo',
    'como se descarga', 'donde se descarga', 'como bajo la', 'donde bajo la',
    'no la encuentro', 'no la veo', 'no la consigo',
    'cual es el logo', 'cual es el icono',
    'playstore', 'play store', 'app store', 'appstore', 'tienda de aplicaciones',
  ];
  if (solas.some(w => n.includes(w))) return true;

  // Si no, se exige que nombre la app Y una acción de conseguirla. Esto evita
  // capturar pedidos reales de servicio -- "necesito descargar un trasteo" es un
  // flete, no una pregunta por la app.
  const menciona = ['app', 'aplicacion', 'aplicativo', 'aplicasion', 'movi'].some(w => n.includes(w));
  // "bajar" va como PALABRA, no como pedazo: "para tra-BAJAR" calzaba y "¿cómo se utiliza la
  // aplicación para trabajar?" recibía el link de descarga (caso real 2026-10-02, …848).
  const accion = ['descarg', 'instal', 'encuentr', 'consig', 'link', 'enlace', 'logo', 'busco', 'buscar']
    .some(w => n.includes(w)) || /\b(bajar|bajo|bajarla|bajarme)\b/.test(n);
  return menciona && accion;
}

function appDownloadReply(): string {
  return `📲 Este es el link oficial para descargar Movi:\n${APP_DOWNLOAD_LINK}\n\n` +
    `En Play Store aparece como *Movi - Transporte Urbano*. Es la misma app para pedir viajes y para trabajar como conductor.\n\n` +
    `_Por ahora solo está disponible para Android._`;
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
/**
 * Estado del viaje para un pasajero que está esperando: dónde viene el conductor y
 * cuánto falta.
 *
 * POR QUÉ EXISTE (caso real 2026-09-05): Yolima esperó 15 minutos sin saber nada. Escribió
 * "?" tres veces y el bot le contestó "✅ Le avisamos a tu conductor" -- un acuse de recibo
 * que confirma que no pasa nada, justo lo peor en el momento de la ansiedad. Nunca supo que
 * podía llamarlo sin ver su número (se menciona una sola vez, enterrado en el mensaje de
 * aceptación, y nadie lee instrucciones cuando está estresado).
 *
 * El ETA es una estimación por línea recta a 25 km/h (velocidad urbana real de Cúcuta con
 * semáforos). NO es la ruta de Mapbox a propósito: esto corre en el camino caliente de un
 * mensaje entrante y no vale la pena gastar una llamada externa -- se prefiere un número
 * aproximado y honesto ("~5 min") a hacer esperar al pasajero.
 *
 * Devuelve null cuando no hay con qué calcular; el llamador decide qué decir entonces.
 */
/**
 * Distancia y tiempo estimado desde donde va el conductor hasta el punto de recogida.
 *
 * Línea recta a 25 km/h (velocidad urbana real de Cúcuta con semáforos), NO ruta de Mapbox:
 * esto corre tanto en el camino caliente de un mensaje entrante como en el cron que sale
 * cada 4 minutos para cada viaje activo. Una llamada externa ahí sería cara y lenta, y para
 * "¿cuánto falta?" un número aproximado y honesto vale más que uno exacto que tarda.
 *
 * Devuelve null cuando ya está prácticamente encima: dar minutos ahí suena falso.
 */
function etaAlPunto(dLat: number, dLng: number, oLat: number, oLng: number): { km: number; min: number; texto: string } | null {
  const km = haversineKm(dLat, dLng, oLat, oLng);
  if (!isFinite(km) || km < 0.3) return null;
  const min = Math.max(1, Math.round(km / 25 * 60));
  const dist = km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
  return { km, min, texto: `a ${dist} — unos ${min} min` };
}

/**
 * Minutos que puede tener la última posición del conductor antes de que dar un ETA
 * sobre ella sea mentir.
 *
 * CASO REAL (2026-09-08, viaje ab5093bc): el GPS del conductor reportó por última vez
 * a las 22:10:02 y su app pasó a segundo plano (va en moto, pantalla apagada). El punto
 * quedó congelado. Con ese punto muerto le dijimos a la pasajera cuatro veces
 * -- 22:12, 22:16, 22:20 y 22:24 -- "va en camino · llega en ~3 min", y a las 22:18
 * "está a 1.4 km — unos 3 min" con una posición de ocho minutos antes. Ella esperó
 * 13 minutos en la calle a las 10 de la noche creyendo que estaba a la vuelta.
 *
 * `driverStatusLine` YA pedía `updated_at` en el select y no lo miraba nunca.
 */
const UBICACION_FRESCA_SEG = 4 * 60;

async function driverStatusLine(tripId: string): Promise<{ texto: string; lat: number; lng: number } | null> {
  try {
    const supabase = db();
    const { data: trip } = await supabase
      .from('ag_trip_requests')
      .select('driver_id, origin_lat, origin_lng, driver_stage')
      .eq('id', tripId)
      .maybeSingle();
    if (!trip?.driver_id) return null;

    const { data: loc } = await supabase
      .from('ag_driver_locations')
      .select('lat, lng, updated_at')
      .eq('driver_id', trip.driver_id as string)
      .maybeSingle();
    if (!loc?.lat || !loc?.lng) return null;

    const oLat = trip.origin_lat as number | null;
    const oLng = trip.origin_lng as number | null;
    if (oLat == null || oLng == null) return null;

    // Si la posición está vieja, NO se da ETA: se dice la verdad. Un "llega en 3 min"
    // calculado sobre un punto de hace 10 minutos es peor que no decir nada, porque
    // la persona se queda quieta esperando en vez de decidir. Ver UBICACION_FRESCA_SEG.
    const edadSeg = loc.updated_at
      ? Math.max(0, Math.round((Date.now() - new Date(loc.updated_at as string).getTime()) / 1000))
      : null;
    if (edadSeg == null || edadSeg > UBICACION_FRESCA_SEG) {
      const hace = edadSeg == null ? null : Math.max(1, Math.round(edadSeg / 60));
      return {
        texto: hace
          ? `⚠️ No tengo su ubicación en este momento — la última que recibí es de hace *${hace} min*.\n\nPuede que tenga la app en segundo plano y siga en camino, pero no te lo puedo asegurar.`
          : '⚠️ No tengo su ubicación en este momento.',
        lat: loc.lat as number,
        lng: loc.lng as number,
      };
    }

    const eta = etaAlPunto(loc.lat as number, loc.lng as number, oLat, oLng);
    // Sin ETA significa que ya está prácticamente encima (ver etaAlPunto).
    return {
      texto: eta
        ? `Tu conductor está *${eta.texto}* 🚗`
        : 'Tu conductor ya está llegando al punto de recogida 📍',
      lat: loc.lat as number,
      lng: loc.lng as number,
    };
  } catch (e) {
    console.error('[WA] driverStatusLine error:', e);
    return null;
  }
}

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
  // ID del boton pulsado, cuando el mensaje vino de un boton interactivo. Sirve para saber
  // SOBRE CUAL oferta esta respondiendo el pasajero cuando tiene varias en el chat.
  msgBtnId?: string,
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

  // Respuesta a "¿a cuál conductor llamo?" -- se atiende ANTES de la máquina de estados,
  // y a propósito. Un pasajero puede tener varios viajes a la vez (botón "🚗 Otro
  // vehículo"), y la conversación lleva un solo cursor: para cuando toca el botón, el
  // estado puede haber cambiado o apuntar a otro viaje. El id del botón trae el viaje
  // exacto, así que no depende del cursor para nada.
  // Respuesta a "¿Te busco otro conductor?" (migración 298). El id trae el viaje exacto.
  if (msgBtnId && (msgBtnId.startsWith('quieto_otro_') || msgBtnId.startsWith('quieto_esperar_'))) {
    await responderConductorQuieto(phone, contactName, session, msgBtnId);
    return;
  }

  if (msgBtnId && msgBtnId.startsWith('call_trip_')) {
    await llamarAlConductorDelViaje(phone, msgBtnId.replace('call_trip_', ''), session);
    return;
  }

  // "Cambiar" de conductor en el chat, y la elección. Igual que la llamada, se atiende
  // antes de la máquina de estados: el id del botón trae el viaje exacto, así que no
  // depende del cursor de la conversación, que es justo lo que fallaba.
  if (msgBtnId === 'chat_switch') {
    const vivos = await viajesVivosDelPasajero(phone);
    if (vivos.length < 2) {
      await sendText(phone, `Solo tienes un viaje en curso 🙂`);
      return;
    }
    await sendButtons(phone, `¿A cuál conductor le quieres escribir?`,
      vivos.slice(0, 3).map(v => ({ id: `chat_to_${v.id}`, title: `${v.conductor} · ${v.quien}`.slice(0, 20) })));
    return;
  }

  if (msgBtnId && msgBtnId.startsWith('chat_to_')) {
    const elegido = msgBtnId.replace('chat_to_', '');
    const vivos = await viajesVivosDelPasajero(phone);
    const v = vivos.find(x => x.id === elegido);
    if (!v) { await sendText(phone, `Ese viaje ya no está en curso 😅`); return; }
    await upsertSession(phone, { chat_trip_id: elegido });
    await sendText(phone, `Listo ✅ Lo que escribas ahora le llega a *${v.conductor}* (va por ${v.quien}).`);
    return;
  }

  // Cancelar en cualquier estado -- awaiting_rating queda afuera a propósito:
  // ahí el viaje YA terminó, no hay nada que cancelar, y "cancelar" en ese
  // punto se reprocesa como mensaje nuevo (ver bloque awaiting_rating) en vez
  // de mostrar el falso "Solicitud cancelada" de un viaje ya completado.
  // 'trip_cancel' es el botón que acompaña al estado del viaje mientras el pasajero
  // espera: su título ("❌ Cancelar viaje") no calza con isCancel(), que exige match
  // exacto de la palabra sola. Se reconoce por id, que es lo estable.
  if ((msgBtnId === 'trip_cancel' || isCancel(text)) && state !== 'idle' && state !== 'awaiting_rating') {
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
  // En el menú no hay "respuesta anterior" que esperar (p. ej. justo después de cancelar):
  // un saludo ahí se atiende como saludo, desde cero.
  if (isGreeting(text) && state === 'awaiting_service') state = 'idle';
  if (isGreeting(text) && state !== 'idle') {
    await sendText(phone, `¡Hola de nuevo! 👋 Sigo aquí, esperando tu respuesta anterior.\n\nEscribe *cancelar* si prefieres empezar de nuevo.`);
    return;
  }

  // Se va molesto ("Déjelo así", "olvídelo", "ya conseguí") -- 2026-10-02, caso real …833: tras
  // dos viajes fallidos al aeropuerto escribió "Déjelo así" y el bot le respondió con el saludo de
  // bienvenida "¡Hola! Soy Leidy… ¿A dónde vas?", como si nada hubiera pasado. Ahora: se cancela
  // lo que esté buscando y se le pide disculpas, sin menú. No aplica con conductor ya asignado
  // (in_trip): ahí "déjelo así" puede ser una respuesta al conductor y la cancelación es explícita.
  if (msgType === 'text' && seVaMolesto(text) && ['idle', 'awaiting_service', 'awaiting_origin', 'awaiting_barrio_recogida', 'awaiting_lugar_elegido', 'awaiting_dest',
       'awaiting_summary', 'awaiting_dest_cerca', 'awaiting_price', 'matching', 'stale_search_confirm',
       'stale_raise_offer_amount'].includes(state)) {
    let aplica = !['idle', 'awaiting_service'].includes(state);
    if (!aplica) {
      // En reposo solo si viene de un viaje que acaba de fallar; si no, es otra conversación.
      const { data: reciente } = await db().from('ag_trip_requests').select('id')
        .in('wa_phone', [phone, toE164(phone)]).eq('status', 'cancelled')
        .gte('created_at', new Date(Date.now() - 3 * 3600e3).toISOString()).limit(1).maybeSingle();
      aplica = !!reciente;
    }
    if (aplica) {
      // Disculpa solo si de verdad le fallamos (estaba esperando conductor o un viaje se cayó);
      // si solo estaba cotizando o armando el pedido, no hubo falla que disculpar.
      const leFallamos = ['idle', 'awaiting_service', 'matching', 'stale_search_confirm', 'stale_raise_offer_amount'].includes(state);
      if (session.trip_request_id) {
        await db().from('ag_trip_requests').update({
          status: 'cancelled', cancelled_at: new Date().toISOString(), updated_at: new Date().toISOString(),
          cancel_reason: `El pasajero desistió: "${text.slice(0, 80)}" (WhatsApp)`,
        }).eq('id', session.trip_request_id as string).eq('status', 'searching');
      }
      await resetSession(phone);
      await sendText(phone, leFallamos
        ? `Entiendo, y te pido disculpas 🙏 Esta vez no estuvimos a la altura.\n\n` +
          `Ya no te estoy buscando conductor. Si en otro momento necesitas un carro, escríbeme por aquí y te lo pido en un minuto.`
        : `Listo, sin problema 🙂 Si en otro momento necesitas un carro, escríbeme por aquí y te lo pido en un minuto.`);
      return;
    }
  }

  // "Es para mañana a las 9" en cualquier punto ANTES de tener conductor (2026-10-01). Caso real
  // …833: lo dijo tres veces mientras se buscaba conductor, el bot solo respondía "Buscando…" y
  // un conductor salió a recogerlo esa misma noche. Ver manejarProgramado / migración 297.
  if (msgType === 'text' && ['idle', 'awaiting_service', 'awaiting_origin', 'awaiting_barrio_recogida', 'awaiting_dest', 'awaiting_summary',
       'awaiting_price', 'matching', 'stale_search_confirm'].includes(state)) {
    const prog = leerProgramacion(text);
    if (prog) { await manejarProgramado(phone, session, state, text, prog); return; }
  }

  // ── IDLE / WELCOME ──────────────────────────────────────────────────────────
  if (state === 'idle') {
    // Preguntas de "quiero trabajar/ser conductor" se revisan ANTES de intentar
    // interpretar el mensaje como pedido de viaje -- ver isDriverJobInquiry.
    if (isDriverJobInquiry(text)) {
      await sendText(phone, driverJobInquiryReply());
      return;
    }
    // Pregunta por la descarga -- se responde con el link oficial, siempre.
    if (isAppDownloadInquiry(text)) {
      await sendText(phone, appDownloadReply());
      return;
    }
    // Si ya escribió/dictó una solicitud completa desde el primer mensaje
    // ("hola necesito un carro para el aeropuerto"), no obligarlo a repetirla.
    if (text.length >= 8) {
      const parsed = await parseFreeTextRequest(text);
      if (parsed?.service_type) {
        // "¿Qué precio tiene una carrera al aeropuerto?" es una cotización: carro y moto,
        // sin compromiso (2026-10-01, caso real …833).
        await startSmartFlow(phone, parsed, /precio|cu[aá]nto|cotiz|tarifa|valor/i.test(text));
        return;
      }
      // Solo dijo a dónde va ("al aeropuerto"): cotización de carro y moto con ese destino.
      if (parsed?.dest_text) {
        await upsertSession(phone, { pending_dest_text: parsed.dest_text });
        await askOriginDirect(phone, 'carro', parsed.dest_text, true);
        await upsertSession(phone, { pending_dest_text: parsed.dest_text });
        return;
      }
    }
    // No se usa el nombre de perfil de WhatsApp para saludar -- muchos
    // pasajeros tienen apodos o nombres que no son el suyo real como nombre
    // de contacto, y se veía poco profesional/impreciso (pedido explícito del
    // usuario 2026-08-10). Sí se usa el nombre REAL de la cuenta si ya existe.
    const realName = await lookupRealFirstName(phone);
    // Recortado 2026-10-01: la primera pregunta ahora es la que de verdad importa (a dónde va),
    // y el menú queda como alternativa. Si responde con un destino, arranca la cotización.
    await presentServiceMenu(phone,
      `${greetingOpener(realName)} Soy *Leidy* de *Movi* 🚗\n\n` +
      `*¿A dónde vas?* Escríbeme el destino y te digo el precio, o mira las opciones 👇`,
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
    // Pregunta por la descarga -- se responde con el link oficial, siempre.
    if (isAppDownloadInquiry(text)) {
      await sendText(phone, appDownloadReply());
      return;
    }
    // "💰 Cotizar un viaje" (2026-10-01): mismo camino que pedir, pero el resumen trae carro y
    // moto y no se pide nada hasta que toque uno. Va antes del mapa de abajo porque el título
    // no contiene ningún servicio.
    if (msgBtnId === 'svc_cotizar' || /cotiz|^precio|cu[aá]nto (vale|cuesta|cobra)/i.test(text)) {
      // Si escribió la pregunta completa ("cuánto vale un carro al centro comercial Ventura"),
      // el destino se toma de una vez en vez de volver a preguntarlo (encontrado probando 2026-10-02).
      const parsed = !msgBtnId && text.length >= 12 ? await parseFreeTextRequest(text) : null;
      await askOriginDirect(phone, parsed?.service_type === 'moto' ? 'moto' : 'carro', parsed?.dest_text ?? null, true);
      if (parsed?.dest_text) await upsertSession(phone, { pending_dest_text: parsed.dest_text });
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
          await startSmartFlow(phone, parsed, /precio|cu[aá]nto|cotiz|tarifa|valor/i.test(text));
          return;
        }
        // Respondió el "¿A dónde vas?" del saludo con solo el destino: cotización.
        if (parsed?.dest_text) {
          await askOriginDirect(phone, 'carro', parsed.dest_text, true);
          await upsertSession(phone, { pending_dest_text: parsed.dest_text });
          return;
        }
      }
      await sendServiceButtons(phone, `Creo que no te entendí bien 🤔 ¿A dónde vas? Escríbeme el destino, o elige una opción 👇`);
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
      // Flujo rápido (2026-10-01): directo a la ubicación. Antes aquí se preguntaba "¿para ti
      // o para otra persona?" (pedido del usuario 2026-08-11); sigue existiendo, pero solo si
      // el pasajero escribe "otra persona" en el paso de la ubicación (ver awaiting_origin).
      await askOriginDirect(phone, svc, null);
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
      await presentLiabilityAck(phone);
    } else if (resolution === 'self') {
      // Sesiones que quedaron en este paso de antes del flujo rápido: igual van directo
      // a la ubicación, sin la pregunta del barrio.
      await askOriginDirect(phone, (session.service_type as string) ?? 'carro', session.pending_dest_text as string | null);
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
    // Flujo rápido = Carro/Moto pedido por uno mismo (ver askOriginDirect).
    const rapido = session.is_for_self !== false && !isDeliveryService(session.service_type as string);

    if (rapido && msgType !== 'location') {
      // "Es para otra persona" -> el camino de siempre (responsabilidad, nombre, celular).
      if (esParaOtraPersona(text)) { await presentLiabilityAck(phone); return; }
      // "¿Cuánto vale?" antes de dar la dirección: se le dice cuándo lo va a saber, sin
      // regañarlo ni repetir la pregunta en seco.
      if (preguntaPrecio(text)) {
        await sendLocationRequest(phone, `Te digo el precio exacto apenas sepa dónde te recojo 👇\n\nToca el botón para compartir tu ubicación, o escríbeme la dirección.`);
        return;
      }
    }

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
      // Solo la dirección, sin la conversación de antes ("Te envío la ubicación y te
      // recuerdo la dirección también Urbanización..." quedaba pegado dentro de la recogida).
      const textoDir = limpiarDireccion(text);
      const geo = await forwardGeocode(textoDir, bias?.lat, bias?.lng);
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
      lat = geo.lat; lng = geo.lng; addr = conBarrio(textoDir, geo);
    } else {
      await sendText(phone, `Por favor envía tu ubicación (📎 → Ubicación) o escribe la dirección completa (calle, barrio y ciudad).`);
      return;
    }

    // Complementa (nunca reemplaza) con el barrio que el pasajero ya escribió
    // a mano en awaiting_barrio -- ver combineWithBarrioHint().
    addr = combineWithBarrioHint(addr, session.origin_barrio_hint as string | undefined);
    // Flujo rápido -> originDirectNext, clásico -> presentOriginConfirm; si el GPS no dio
    // barrio, antes se le pregunta (ver seguirConRecogida, caso Luis Felipe 2026-10-03).
    // En una ubicación, `text` es el nombre/dirección del lugar elegido (ver el webhook):
    // si viene, no compartió su ubicación actual y seguirConRecogida lo confirma.
    await seguirConRecogida(phone, addr, lat, lng, session, msgType !== 'location', lugarElegidoDe(msgType, text));
    return;
  }

  // ── AWAITING_BARRIO_RECOGIDA ────────────────────────────────────────────────
  // El GPS de la recogida llegó sin barrio (ver seguirConRecogida). La recogida ya está
  // guardada en la sesión; solo falta el barrio para que el conductor no adivine la zona.
  if (state === 'awaiting_barrio_recogida') {
    const oLat = session.origin_lat as number | null;
    const oLng = session.origin_lng as number | null;
    const oAddr = session.origin_address as string | null;
    // Mandó otra ubicación: es una recogida nueva, se procesa desde cero.
    if (msgType === 'location' && msgLat != null && msgLng != null) {
      if (!isInColombia(msgLat, msgLng)) {
        await sendText(phone, `📍 Esa ubicación no parece estar en Colombia. Comparte tu ubicación actual o escríbeme tu dirección completa.`);
        return;
      }
      const nueva = precomputedAddr ?? await reverseGeocode(msgLat, msgLng);
      await seguirConRecogida(phone, nueva, msgLat, msgLng, session, false, lugarElegidoDe(msgType, text));
      return;
    }
    if (oLat == null || oLng == null || !oAddr) {
      // La sesión perdió la recogida (no debería pasar): se vuelve a pedir, sin inventar.
      await upsertSession(phone, { state: 'awaiting_origin' });
      await sendLocationRequest(phone, `📍 *¿Dónde te recojo?* Toca el botón para compartir tu ubicación, o escríbeme la dirección.`);
      return;
    }
    const rapido = session.is_for_self !== false && !isDeliveryService(session.service_type as string);
    if (rapido && msgType === 'text' && esParaOtraPersona(text)) { await presentLiabilityAck(phone); return; }
    const forName = travelerLabel(session);
    const pedirDireccion = () => sendText(phone,
      `✏️ Escríbeme ${forName ? `la dirección completa de *${forName}*` : 'tu dirección completa'}: calle o avenida con número, ` +
      `barrio y número de casa o apartamento.\n\n` +
      `_(ej: "Avenida 2 #1A-60, La Ínsula, casa 5")_ -- así el conductor llega justo a la puerta.`);
    // [Mejorar dirección] (o lo escribe): se le pide la dirección completa y se queda en este
    // mismo paso; lo siguiente que escriba se toma como su dirección.
    const nConf = normalizarTexto(text).replace(/[.!¡,👍✅🙏✏️]+/gu, ' ').replace(/\s+/g, ' ').trim();
    if (msgBtnId === 'mejorar_dir' || /^(mejorar( la)? direccion|mejorar|editar|corregir|cambiar( la)? direccion)$/.test(nConf)) {
      await pedirDireccion();
      return;
    }
    if (msgType === 'text' && preguntaPrecio(text)) {
      await sendButtons(phone, `Te digo el precio apenas confirmes dónde te recojo 🙌`, BOTONES_RECOGIDA);
      return;
    }
    // [✅ Continuar] o un "sí / ok / listo" escrito: sigue con la dirección del mapa tal
    // cual. Antes estas respuestas se guardaban como si fueran el barrio.
    const confirma = msgBtnId === 'barrio_ok' || /^continuar$/.test(nConf) || isYes(text) ||
      /^(si|ok|okay|listo|correcto|exacto|perfecto|dale|de una|confirmo|confirmar|asi|asi esta bien|esta bien|si asi esta bien|si esta bien|ahi|ahi es|ahi estoy|ese es|esa es)$/.test(nConf) ||
      // Con cortesía: "sí señor", "ok gracias", "sí claro", "listo por favor".
      /^(si|ok|okay|listo|dale|claro|bueno) (senor|senora|gracias|claro|por favor|correcto|perfecto|asi es|de una|listo|esta bien)$/.test(nConf);
    if (confirma) {
      // recogida_confirmada no se guarda: solo evita que seguirConRecogida vuelva a preguntar.
      await seguirConRecogida(phone, oAddr, oLat, oLng, { ...session, recogida_confirmada: true }, false);
      return;
    }
    const escrita = text.trim().replace(/^(barrio|sector)\s+/i, '').trim().slice(0, 140);
    if (msgType !== 'text' || escrita.length < 2) {
      await sendButtons(phone,
        `Toca *Mejorar dirección* para escribirme ${forName ? 'su' : 'tu'} dirección completa, o *Continuar* para seguir con la ubicación del mapa.`,
        BOTONES_RECOGIDA);
      return;
    }
    // Muy poco ("casa 5", "aquí", un barrio suelto): se le pide completa, con los botones por
    // si prefiere seguir con la del mapa.
    if (!direccionSuficiente(escrita)) {
      await sendButtons(phone,
        `Necesito un poco más para que el conductor encuentre la puerta 🙏\n\n` +
        `Escríbeme ${forName ? 'su' : 'tu'} dirección completa: calle o avenida con número, barrio y casa o apartamento ` +
        `_(ej: "Avenida 2 #1A-60, La Ínsula, casa 5")_, o toca *Continuar* para seguir con la ubicación del mapa.`,
        BOTONES_RECOGIDA);
      return;
    }
    // Su dirección SOLA (ver direccionMejorada); el punto GPS no cambia.
    const addrNueva = direccionMejorada(oAddr, escrita);
    await upsertSession(phone, { origin_barrio_hint: escrita, origin_address: addrNueva });
    // Con origin_barrio_hint puesto, seguirConRecogida ya no vuelve a preguntar.
    await seguirConRecogida(phone, addrNueva, oLat, oLng,
      { ...session, origin_barrio_hint: escrita, origin_address: addrNueva }, false);
    return;
  }

  // ── AWAITING_LUGAR_ELEGIDO ──────────────────────────────────────────────────
  // La recogida llegó como un lugar elegido en el mapa, no como la ubicación actual (ver
  // seguirConRecogida). La recogida ya está guardada; solo falta que confirme.
  if (state === 'awaiting_lugar_elegido') {
    const oLat = session.origin_lat as number | null;
    const oLng = session.origin_lng as number | null;
    const oAddr = session.origin_address as string | null;
    // Mandó otra ubicación: se procesa como recogida nueva (si es la actual, ya no pregunta).
    if (msgType === 'location' && msgLat != null && msgLng != null) {
      if (!isInColombia(msgLat, msgLng)) {
        await sendText(phone, `📍 Esa ubicación no parece estar en Colombia. Comparte tu ubicación actual o escríbeme la dirección.`);
        return;
      }
      const nueva = precomputedAddr ?? await reverseGeocode(msgLat, msgLng);
      await seguirConRecogida(phone, nueva, msgLat, msgLng, { ...session, origin_barrio_hint: null }, false, lugarElegidoDe(msgType, text));
      return;
    }
    if (oLat == null || oLng == null || !oAddr) {
      await upsertSession(phone, { state: 'awaiting_origin' });
      await sendLocationRequest(phone, `📍 *¿Dónde te recojo?* Toca el botón para compartir tu ubicación, o escríbeme la dirección.`);
      return;
    }
    const n = normalizarTexto(text);
    const confirma = msgBtnId === 'lugar_si' || isYes(text) || /^(si|ahi|alli|ese|correcto|exacto|listo|dale)\b/.test(n);
    const otra = msgBtnId === 'lugar_actual' || isNo(text) || /actual|donde estoy|otra|no es|cambiar/.test(n);
    if (confirma && !otra) {
      // El nombre del lugar ya ubica la zona: no se pregunta el barrio encima (desdeTexto).
      await seguirConRecogida(phone, oAddr, oLat, oLng, session, true);
      return;
    }
    if (otra) {
      await upsertSession(phone, { state: 'awaiting_origin', origin_lat: null, origin_lng: null, origin_address: null });
      await sendLocationRequest(phone,
        `👍 Toca el botón y elige *"Enviar tu ubicación actual"* (la primera opción, arriba de la lista).\n\n` +
        `Si el GPS está lento, escríbeme la dirección o un punto de referencia.`);
      return;
    }
    // Escribió una dirección: esa es la recogida (lo que él escribe es lo que reconoce).
    if (msgType === 'text' && text.trim().length > 4) {
      await upsertSession(phone, { state: 'awaiting_origin', origin_lat: null, origin_lng: null, origin_address: null });
      await handleConversation(phone, contactName, 'text', text, undefined, undefined, undefined,
        { ...session, state: 'awaiting_origin', origin_lat: null, origin_lng: null, origin_address: null });
      return;
    }
    await sendButtons(phone, `¿Te recojo en *${oAddr.split(',')[0]}*?`, [
      { id: 'lugar_si', title: 'Sí, ahí' },
      { id: 'lugar_actual', title: 'Mi ubicación actual' },
    ]);
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
          await presentDestConfirm(phone, conBarrio(pendingDest, geo), geo.lat, geo.lng, session);
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
        await presentDestConfirm(phone, conBarrio(pendingDest, geo), geo.lat, geo.lng, session);
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
    const rapido = session.is_for_self !== false && !isDeliveryService(session.service_type as string);

    // Escribió la recogida y segundos después mandó la ubicación GPS: es la MISMA recogida, más
    // precisa -- no el destino (ver originDirectNext). Caso real …833, con 2 s de diferencia.
    if (rapido && msgType === 'location' && msgLat != null && msgLng != null && esRecogidaRecienEscrita(session)) {
      // Si acaba de ESCRIBIR la recogida, se queda su texto ("Urb. Prados Norte Calle 21N #5-118
      // apto 101" le sirve más al conductor que "Avenida 19 16l-42 n" del mapa) y del GPS solo
      // se toma el punto exacto.
      const addrGps = esRecogidaRecienEscrita(session) && session.origin_address
        ? session.origin_address as string
        : (precomputedAddr ?? await reverseGeocode(msgLat, msgLng));
      await originDirectNext(phone, addrGps, msgLat, msgLng, session, false);
      return;
    }

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
      lat = geo.lat; lng = geo.lng; addr = conBarrio(text.trim(), geo);
    } else {
      await sendText(phone, `Escribe la dirección de destino o envía la ubicación con el clip 📎.`);
      return;
    }

    // precomputedRoute solo aplica al camino de ubicación compartida (msgType==='location')
    // -- para una dirección escrita el destino recién se resuelve arriba (forwardGeocode), no
    // había forma de haberlo precalculado antes de llegar aquí.
    const routeForConfirm = msgType === 'location' ? precomputedRoute : undefined;
    if (rapido && lat != null && lng != null) {
      await presentTripSummary(phone, addr, lat, lng, session, routeForConfirm);
      return;
    }
    await presentDestConfirm(phone, addr, lat ?? null, lng ?? null, session, routeForConfirm);
    return;
  }

  // ── AWAITING_DEST_CERCA ─────────────────────────────────────────────────────
  // El "destino" quedó a menos de 500 m (ver presentTripSummary): ¿es la recogida o el destino?
  if (state === 'awaiting_dest_cerca') {
    const n = normalizarTexto(text);
    const esRecogida = msgBtnId === 'cerca_origen' || /recog|donde estoy|aqui|ahi estoy|mi casa|es donde/.test(n);
    const esDestino  = msgBtnId === 'cerca_destino' || /a donde voy|destino|voy para alla|si,? (es )?(el|mi) destino/.test(n);
    if (esRecogida) {
      // Esa dirección escrita pasa a ser la recogida (más precisa que el GPS para el conductor).
      await upsertSession(phone, {
        state: 'awaiting_dest',
        origin_lat: session.dest_lat, origin_lng: session.dest_lng, origin_address: session.dest_name,
        dest_name: null, dest_lat: null, dest_lng: null, pending_location_kind: null,
      });
      await sendText(phone, `Listo, te recojo en *${session.dest_name}* 📍\n\n🏁 *¿A dónde vas?* Escríbeme el destino o comparte la ubicación.`);
      return;
    }
    if (esDestino) {
      await presentTripSummary(phone, session.dest_name as string, session.dest_lat as number, session.dest_lng as number,
        session, undefined, undefined, true);
      return;
    }
    // Escribió otra dirección: es el destino de verdad.
    if (text.length > 4) {
      const geo = await forwardGeocode(text, session.origin_lat as number, session.origin_lng as number);
      if (geo && isInColombia(geo.lat, geo.lng)) {
        await presentTripSummary(phone, conBarrio(text.trim(), geo), geo.lat, geo.lng, session);
        return;
      }
    }
    await sendButtons(phone, `¿*${session.dest_name}* es donde te recojo o a donde vas?`, [
      { id: 'cerca_origen',  title: '📍 Donde me recogen' },
      { id: 'cerca_destino', title: '🏁 A donde voy' },
    ]);
    return;
  }

  // ── AWAITING_SUMMARY (flujo rápido) ─────────────────────────────────────────
  // Una sola confirmación: recogida + destino + precio. "Pedir" y "otro precio" se resuelven
  // re-entrando a awaiting_price, que es el único lugar que crea el viaje y exige el mínimo.
  if (state === 'awaiting_summary') {
    const n = text.toLowerCase().trim();
    const comoPrecio = (t: string) => handleConversation(phone, contactName, 'text', t,
      undefined, undefined, undefined, { ...session, state: 'awaiting_price' });

    // GPS justo después de una recogida escrita: corrige la recogida y vuelve a resumir.
    if (msgType === 'location' && msgLat != null && msgLng != null) {
      // Si acaba de ESCRIBIR la recogida, se queda su texto ("Urb. Prados Norte Calle 21N #5-118
      // apto 101" le sirve más al conductor que "Avenida 19 16l-42 n" del mapa) y del GPS solo
      // se toma el punto exacto.
      if (esRecogidaRecienEscrita(session) && session.origin_address) {
        await originDirectNext(phone, session.origin_address as string, msgLat, msgLng, session, false);
        return;
      }
      // Recogida nueva por GPS: si no trae barrio, se pregunta (ver seguirConRecogida).
      // Se limpia el barrio anterior: era de la recogida que se está reemplazando.
      const addrGps = precomputedAddr ?? await reverseGeocode(msgLat, msgLng);
      await seguirConRecogida(phone, addrGps, msgLat, msgLng, { ...session, origin_barrio_hint: null }, false, lugarElegidoDe(msgType, text));
      return;
    }
    // Cotización: escoge carro o moto, y desde ahí es un pedido normal al precio cotizado.
    const eligeMoto  = msgBtnId === 'sum_ok_moto'  || (session.cotizar === true && /\bmoto\b/.test(n));
    const eligeCarro = msgBtnId === 'sum_ok_carro' || (session.cotizar === true && /\bcarro\b/.test(n));
    if (eligeMoto || eligeCarro) {
      const svcElegido = eligeMoto ? 'moto' : 'carro';
      const precio = eligeMoto ? ((session.precio_moto as number) ?? MIN_PRICE) : ((session.offered_price as number) ?? MIN_PRICE);
      await upsertSession(phone, { state: 'awaiting_price', service_type: svcElegido, offered_price: precio, cotizar: false });
      await handleConversation(phone, contactName, 'text', 'ok', undefined, undefined, undefined,
        { ...session, state: 'awaiting_price', service_type: svcElegido, offered_price: precio, cotizar: false });
      return;
    }
    if (msgBtnId === 'sum_ok' || isYes(text) || /^(pedir|p[ií]delo|dale|listo|ok|okay|de una|va|h[aá]gale)\b/.test(n)) {
      await upsertSession(phone, { state: 'awaiting_price' });
      await comoPrecio('ok');
      return;
    }
    // Escribió un monto directo ("8000", "8 mil"): se toma como su oferta.
    if (/\d/.test(n) && /^\D{0,15}\d[\d.\s]*(mil|k|pesos)?\D{0,10}$/.test(n)) {
      await upsertSession(phone, { state: 'awaiting_price' });
      await comoPrecio(text);
      return;
    }
    if (msgBtnId === 'sum_price' || /otro precio|ofrecer|ofrezco|menos|m[aá]s barato|rebaja/.test(n)) {
      const suggested = (session.offered_price as number) ?? MIN_PRICE;
      const recommendedMin = Math.max(MIN_PRICE, Math.ceil(suggested * 0.7523 / 500) * 500);
      await upsertSession(phone, { state: 'awaiting_price' });
      await sendText(phone, `💰 ¿Cuánto ofreces? Escribe el monto (mínimo *$${recommendedMin.toLocaleString('es-CO')}*).`);
      return;
    }
    if (msgBtnId === 'sum_edit' || /corregir|cambiar|editar|no es|est[aá] mal/.test(n)) {
      await sendButtons(phone, `¿Qué corrijo?`, [
        { id: 'sum_edit_origin', title: '📍 La recogida' },
        { id: 'sum_edit_dest',   title: '🏁 El destino' },
      ]);
      return;
    }
    if (msgBtnId === 'sum_edit_origin') {
      // El destino se conserva: al tener la nueva recogida, vuelve directo al resumen.
      await upsertSession(phone, { state: 'awaiting_origin', origin_lat: null, origin_lng: null, origin_address: null, pending_location_kind: null });
      await sendLocationRequest(phone, `📍 ¿Dónde te recojo? Toca el botón para compartir tu ubicación, o escríbeme la dirección exacta.`);
      return;
    }
    if (msgBtnId === 'sum_edit_dest') {
      await upsertSession(phone, { state: 'awaiting_dest', dest_name: null, dest_lat: null, dest_lng: null, pending_location_kind: null });
      await sendText(phone, `🏁 ¿A dónde vas? Escríbeme la dirección o comparte la ubicación.`);
      return;
    }
    // No se entendió: se le vuelve a mostrar SU resumen (el de cotizar o el normal).
    if (session.dest_lat != null && session.dest_lng != null && session.origin_lat != null) {
      await presentTripSummary(phone, session.dest_name as string, session.dest_lat as number, session.dest_lng as number, session);
      return;
    }
    await resetSession(phone);
    await presentServiceMenu(phone, `Empecemos de nuevo 🙂 ¿Qué necesitas?`);
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
      // Recortado 2026-10-01 ("muy enredado y muy demorado", quejas de pasajeros): el párrafo de
      // 4 líneas de "conciencia y solidaridad" se cambió por el mínimo, que es lo que importa.
      await sendText(phone,
        `Destino confirmado ✅\n\n` +
        `💰 Precio sugerido: *$${suggested.toLocaleString('es-CO')}*\n\n` +
        `Escribe *ok* para pedirlo a ese precio, o escribe tu oferta (mínimo $${recommendedMin.toLocaleString('es-CO')}${delivery ? '' : ', por respeto al conductor'}).`
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

    const delivery = isDeliveryService(session.service_type as string);
    const forName = travelerLabel(session);
    // Recortado 2026-10-01 (quejas de "muy enredado"): antes repetía recogida, destino y oferta
    // que acababa de confirmar, más 3 líneas de instrucciones. Ahora una línea y lo que puede hacer.
    // (No se promete un tiempo: la búsqueda se renueva en ventanas de 4 min por conductor y un
    // caso real del 2026-09-02 duró 23 minutos -- ver la nota histórica en git.)
    await sendText(phone,
      (delivery
        ? `🔍 *Buscando tu mensajero* por $${price.toLocaleString('es-CO')}…`
        : forName
          ? `🔍 *Buscando conductor para ${forName}* por $${price.toLocaleString('es-CO')}…`
          : `🔍 *Buscando tu conductor* por $${price.toLocaleString('es-CO')}…`) +
      `\n\nTe aviso apenas alguien acepte. Si cambias de idea, escribe *cancelar*.`
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

    // Antes respondía "⏳ Buscando conductores... (12 min restantes)" a CUALQUIER cosa, sin
    // acusar recibo de lo que dijo (…833 escribió tres veces "es para mañana" y recibió eso
    // mismo tres veces). "Para mañana" ya lo atiende el pre-chequeo de manejarProgramado; aquí
    // queda el resto: se reconoce el mensaje y se dice qué puede hacer.
    // "Es para el aeropuerto Camilo Daza" mientras se busca: se corrige el destino del viaje.
    const lugarNuevo = msgType === 'text' ? leerCambioDestino(text) : null;
    if (lugarNuevo && session.trip_request_id && await aplicarCambioDestino(phone, session, session.trip_request_id as string, lugarNuevo)) return;

    const waitingNoun = isDeliveryService(session.service_type as string) ? 'tu mensajero' : 'tu conductor';
    await sendText(phone,
      `Te leo 👍 Sigo buscando ${waitingNoun} y te aviso apenas alguien acepte.\n\n` +
      `_Si es para otro momento dime "para mañana a las ..." · Si ya no lo necesitas escribe *cancelar*._`);
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
    // Cual oferta esta respondiendo el pasajero.
    //
    // Si toco un boton, el ID del boton dice EXACTAMENTE de cual oferta habla ese mensaje
    // (accept_offer_<uuid> / reject_offer_<uuid>, ver presentOffer). Eso manda por encima de
    // session.active_offer_id, que solo guarda la ULTIMA oferta que llego: con dos conductores
    // ofertando, el pasajero que subia en el chat y tocaba "Aceptar" en la oferta de arriba
    // terminaba aceptando la de abajo, a otro precio y con otro conductor. Detectado el
    // 2026-09-02 sobre un caso real con dos ofertas ($25.000 y $19.000).
    //
    // Si respondio escribiendo ("si", "acepto", una nota de voz), no hay boton de donde sacar
    // el ID y ahi si toca creerle a la sesion: lo natural es que se refiera a la ultima que le
    // llego, que es la que el mensaje anterior le pregunto.
    const btnOfferId = msgBtnId && /^(accept|reject)_offer_/.test(msgBtnId)
      ? msgBtnId.replace(/^(accept|reject)_offer_/, '')
      : null;
    const offerId  = btnOfferId ?? (session.active_offer_id as string);

    const tripId   = session.trip_request_id as string;

    // Si toco el boton de una oferta que ya no es la ultima, la sesion todavia tiene el nombre,
    // el precio y el vehiculo del conductor mas reciente. Sin esto le confirmariamos el viaje
    // con los datos del conductor equivocado ("Listo, Pedro va para alla" cuando escogio a
    // Maria). Se recargan los datos de la oferta que el realmente escogio.
    // Va DESPUES de declarar tripId a proposito: es una const, y usarla antes revienta la
    // funcion entera con un ReferenceError en vez de solo fallar este caso.
    if (btnOfferId && btnOfferId !== session.active_offer_id) {
      const picked = await fetchNextPendingOffer(tripId, btnOfferId);
      if (picked) {
        session = {
          ...session,
          active_offer_id: picked.offer_id,
          driver_name:     picked.driver_name,
          driver_price:    picked.driver_price,
          driver_phone:    picked.driver_phone,
          driver_vehicle:  picked.driver_vehicle,
          driver_plate:    picked.driver_plate,
        };
        await upsertSession(phone, {
          active_offer_id: picked.offer_id,
          driver_name:     picked.driver_name,
          driver_price:    picked.driver_price,
          driver_phone:    picked.driver_phone,
          driver_vehicle:  picked.driver_vehicle,
          driver_plate:    picked.driver_plate,
        });
      }
    }

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
        if (oLat && oLng) await sendLocation(phone, oLat, oLng);
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
    // El botón 'trip_call' entra por acá igual que la palabra escrita: su título es
    // "📞 Llamarlo" y empieza por emoji, así que el regex de texto no lo agarraría.
    // Nadie lee instrucciones cuando está esperando y angustiado -- por eso "llamar"
    // dejó de ser solo una palabra mágica mencionada una vez.
    if (msgBtnId === 'trip_call' || /^llam/i.test(text.trim())) {
      await pedirLlamada(phone, session);
      return;
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
            // La etiqueta va como texto: dentro del mapa rompía el enlace (ver sendLocation).
            await sendText(phone, `📍 Tu ${driverNoun}: ${label}.`);
            await sendLocation(phone, loc.lat as number, loc.lng as number);
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
      // Con varios viajes vivos, el cursor de la conversación no basta para saber a quién
      // le está escribiendo: apunta siempre al último pedido, así que el conductor del
      // primero quedaba incomunicado. `chat_trip_id` (migración 278) recuerda la elección
      // del pasajero; si no ha elegido, o si el viaje elegido ya terminó, se cae al cursor.
      const tripId         = await destinoDelChat(phone, session);
      const senderAgUserId = session.ag_user_id as string | null;
      // Cambio de destino con el conductor ya asignado ("es para el aeropuerto"): se actualiza
      // el viaje (su app navega al lugar correcto) y le llega como mensaje destacado.
      const lugarNuevo = leerCambioDestino(text);
      if (tripId && lugarNuevo && await aplicarCambioDestino(phone, session, tripId, lugarNuevo)) return;
      if (tripId && senderAgUserId) {
        const supabase = db();
        const { data: trip } = await supabase
          .from('ag_trip_requests')
          // driver_stage se trae para saber si el conductor todavía viene en camino:
          // solo en ese caso vale la pena responder con posición, ETA y botones.
          .select('driver_id, driver_stage')
          .eq('id', tripId)
          .maybeSingle();

        if (trip?.driver_id) {
          await supabase.from('ag_chat_messages').insert({
            request_id: tripId,
            sender_ag_user_id: senderAgUserId,
            message: text,
          });

          // El push al conductor lo dispara ahora el trigger ag_chat_push_trigger
          // (migración 276) sobre el INSERT de arriba. Antes se mandaba desde aquí, y ese
          // era el problema: existía SOLO en esta rama, así que un pasajero escribiendo
          // desde la app no le hacía sonar nada al conductor. En la base de datos cubre
          // los dos caminos y no se puede volver a olvidar. Se quitó también la consulta
          // del conductor que solo servía para armar ese push.

          // Si tiene más de un viaje vivo, se le dice a cuál conductor le acaba de escribir
          // y se le da el botón para cambiar. Solo en ese caso: con un viaje no hay nada
          // que aclarar y el aviso sería ruido.
          await avisarDestinoDelChat(phone, tripId);

          // Antes acá solo iba "✅ Le avisamos a tu conductor." -- un acuse de recibo que,
          // para alguien que lleva rato esperando, confirma que no pasa nada. Mientras el
          // conductor viene en camino se le contesta con lo que de verdad necesita: dónde
          // está, cuánto falta, y las dos salidas a un toque. Ver driverStatusLine().
          const estado = trip.driver_stage === 'heading_to_pickup' || !trip.driver_stage
            ? await driverStatusLine(tripId)
            : null;
          // "Le avisamos" afirmaba algo que no sabemos: que el mensaje le llegó y lo vio.
          // En el caso real del 2026-09-08 el mensaje de la pasajera quedó con read_at
          // en NULL -- el conductor NUNCA lo leyó -- y aun así le dijimos "✅ Le avisamos".
          // Ella se quedó tranquila esperando por una certeza que no teníamos. Lo que sí
          // podemos afirmar es que lo mandamos.
          if (estado) {
            await sendButtons(phone,
              `📨 Le mandé tu mensaje.\n\n${estado.texto}`,
              [
                { id: 'trip_call',   title: '📞 Llamarlo' },
                { id: 'trip_cancel', title: '❌ Cancelar viaje' },
              ],
            );
            // El mapa va aparte: WhatsApp no permite adjuntar ubicación a un mensaje con
            // botones, y verlo moverse es justo lo que calma la espera.
            // Sin etiqueta: el mensaje de arriba ya dice dónde viene y cuánto falta.
            await sendLocation(phone, estado.lat, estado.lng);
          } else {
            await sendText(phone, `📨 Le mandé tu mensaje a tu ${driverNoun}.`);
          }
          return;
        }
      }
    }

    // Botones en vez de instrucciones escritas: "escribe *llamar*" obliga a leer y a
    // acordarse justo cuando la persona está esperando y de mal humor. El texto se deja
    // igual como respaldo por si el cliente de WhatsApp no pinta los botones.
    const cuerpoEnCurso = delivery ? `Tu envío está en curso 📦` : `Tu viaje está en curso 🚗`;
    const btns = await sendButtons(phone, cuerpoEnCurso, [
      { id: 'trip_call',   title: '📞 Llamarlo' },
      { id: 'trip_cancel', title: '❌ Cancelar' },
    ]);
    if (!btns.ok) {
      await sendText(phone, `${cuerpoEnCurso}\n\nEscribe *llamar* para hablar con tu ${driverNoun}, o *cancelar* si tienes algún problema.`);
    }
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
// ════════════════════════════════════════════════════════════════════════════
// SOLICITUDES DE VIAJE TAMBIÉN POR WHATSAPP A CONDUCTORES CON VENTANA ABIERTA (2026-10-03)
//
// Medido ese día: el push sale del servidor en <0,5 s, pero Android lo entrega tarde o nunca a
// quien tiene la app cerrada o el celular en reposo (2 de cada 3 avisos de 30 días no se vieron;
// mediana de 15 s cuando sí). WhatsApp casi nunca se duerme. Decisión del usuario: mandar cada
// solicitud ADEMÁS por WhatsApp, pero SOLO a los conductores que le escribieron al número de
// conductores en las últimas 24 h -- dentro de esa ventana el texto libre es gratis y no hay
// plantilla que pueda clasificarse como marketing.
//
// AMPLIADO 2026-10-04 (pedido del usuario: "que todos los conductores sean avisados de cada viaje
// según el tipo de vehículo, todos"): 43 de 102 conductores no tenían token de push (nunca activaron
// las notificaciones) y por eso NUNCA se enteraban de nada. Ahora a los que NO tienen la ventana de
// 24 h abierta les llega la plantilla UTILITY PLANTILLA_SOLICITUD (de pago, ~US$0,001 c/u en Colombia).
// Solo sale si Meta la tiene APROBADA y como UTILITY; si la pasara a MARKETING no se manda.
//
// Cuidados, porque es el mismo número que atiende a los conductores y su calidad importa:
//  - mismas reglas del push (vehículo, estado, notify_new_requests) -- ag_notify_drivers_on_trip_request
//  - ventana de 23,5 h (margen sobre las 24 h de Meta)
//  - nunca el mismo viaje dos veces al mismo conductor; máximo 12 avisos por conductor en 24 h
//  - nada a quien ya tiene un viaje aceptado en curso; se re-verifica que siga en 'searching'
//  - "NO MÁS" lo apaga (ag_wa_support_sessions.alertas_viaje_off, migración 302), sin tocar el push
// ════════════════════════════════════════════════════════════════════════════
const MARCA_ALERTA_VIAJE = '🚗 *Nueva solicitud de viaje';
const PLANTILLA_SOLICITUD = 'movi_solicitud_viaje_conductor';
// Desde Play Store se toca "Abrir" y se entra a la app (los enlaces web abren el navegador).
const ENLACE_ABRIR_MOVI = 'https://play.google.com/store/apps/details?id=com.publihazclick.movi';
const MARCA_DESCONECTADO = '📴 Quedaste desconectado de Movi';
const MARCA_TE_CONECTAS = '🚗 ¿Te conectas hoy?';

async function alertaSolicitudConductores(tripId: string, simular = false): Promise<{ enviados: number; candidatos: number; destino?: string[] }> {
  const sb = db();
  const { data: trip } = await sb.from('ag_trip_requests')
    .select('id, status, vehicle_type, origin_name, dest_name, offered_price, distance_km')
    .eq('id', tripId).maybeSingle();
  // simular: para probar la selección con un viaje viejo sin escribirle a nadie.
  if (!trip || (trip.status !== 'searching' && !simular)) return { enviados: 0, candidatos: 0 };

  const vt = trip.vehicle_type as string;
  const paraTodos = ['domicilio', 'fletes', 'ciudad'].includes(vt);
  const { data: conductores } = await sb.from('ag_drivers')
    .select('id, vehicle_type, notify_new_requests, status, ag_users!inner(phone)')
    .in('status', ['approved', 'quick', 'pending']);
  const elegibles = (conductores ?? []).filter((d: Record<string, unknown>) => {
    const tipo = d.vehicle_type === 'moto' ? 'moto' : 'carro';
    return (paraTodos || tipo === vt) && d.notify_new_requests !== false;
  }) as unknown as Array<{ id: string; ag_users: { phone: string } | Array<{ phone: string }> }>;
  if (!elegibles.length) return { enviados: 0, candidatos: 0 };

  const porTel = new Map<string, string>();   // wa_phone (sin '+') -> driver_id
  for (const d of elegibles) {
    // ag_users llega como objeto (relación muchos-a-uno), pero se acepta también arreglo por si acaso.
    const u = Array.isArray(d.ag_users) ? d.ag_users[0] : d.ag_users;
    const tel = normWaPhone(u?.phone ?? '');
    if (/^\d{11,15}$/.test(tel)) porTel.set(tel, d.id);
  }
  const tels = [...porTel.keys()];
  if (!tels.length) return { enviados: 0, candidatos: 0 };

  // Ventana: último mensaje DEL conductor al número de conductores en las últimas 23,5 h.
  const desde = new Date(Date.now() - 23.5 * 3600e3).toISOString();
  const [{ data: entrantes }, { data: apagados }, { data: ocupados }, { data: recientes }] = await Promise.all([
    sb.from('ag_wa_message_log').select('wa_phone').eq('role', 'conductor').eq('direction', 'in')
      .gte('created_at', desde).in('wa_phone', tels),
    sb.from('ag_wa_support_sessions').select('wa_phone').eq('alertas_viaje_off', true).in('wa_phone', tels),
    sb.from('ag_trip_requests').select('driver_id').eq('status', 'accepted').in('driver_id', [...porTel.values()]),
    sb.from('ag_wa_message_log').select('wa_phone, body').eq('role', 'conductor').eq('direction', 'out')
      .like('body', `${MARCA_ALERTA_VIAJE}%`).gte('created_at', new Date(Date.now() - 24 * 3600e3).toISOString()).in('wa_phone', tels),
  ]);
  // Los avisos por plantilla también cuentan para el tope diario y para no repetir el mismo viaje.
  const { data: recientesTpl } = await sb.from('ag_wa_message_log').select('wa_phone, body').eq('role', 'conductor').eq('direction', 'out')
    .like('body', `[plantilla ${PLANTILLA_SOLICITUD}]%`).gte('created_at', new Date(Date.now() - 24 * 3600e3).toISOString()).in('wa_phone', tels);
  const conVentana = new Set((entrantes ?? []).map((r: { wa_phone: string }) => r.wa_phone));
  const sinAlertas = new Set((apagados ?? []).map((r: { wa_phone: string }) => r.wa_phone));
  const enViaje = new Set((ocupados ?? []).map((r: { driver_id: string }) => r.driver_id));
  const cuenta = new Map<string, number>();
  const yaAvisados = new Set<string>();
  for (const r of [...(recientes ?? []), ...(recientesTpl ?? [])] as Array<{ wa_phone: string; body: string }>) {
    cuenta.set(r.wa_phone, (cuenta.get(r.wa_phone) ?? 0) + 1);
    // El mensaje lleva los primeros 8 caracteres del id ("solicitud 265e13d0"), no el id entero.
    if (r.body.includes(tripId.slice(0, 8))) yaAvisados.add(r.wa_phone);
  }
  const avisables = tels.filter(t => !sinAlertas.has(t) && !enViaje.has(porTel.get(t)!)
    && !yaAvisados.has(t) && (cuenta.get(t) ?? 0) < 12);
  const destino = avisables.filter(t => conVentana.has(t));            // texto libre, gratis
  const destinoTpl = avisables.filter(t => !conVentana.has(t));        // plantilla de pago
  if (simular) return { enviados: 0, candidatos: avisables.length, destino: [...destino.map(t => t.slice(-4)), ...destinoTpl.map(t => 'tpl' + t.slice(-4))] };
  if (!avisables.length) return { enviados: 0, candidatos: 0 };

  // Última verificación justo antes de mandar: si alguien ya la tomó, no se avisa a nadie.
  const { data: sigue } = await sb.from('ag_trip_requests').select('status').eq('id', tripId).maybeSingle();
  if (sigue?.status !== 'searching') return { enviados: 0, candidatos: destino.length };

  const precio = '$' + Number(trip.offered_price ?? 0).toLocaleString('es-CO');
  const km = Number(trip.distance_km ?? 0).toFixed(1).replace('.', ',');
  const texto =
    `${MARCA_ALERTA_VIAJE} · ${precio}*\n\n` +
    `📍 ${trip.origin_name ?? 'Recogida'}\n` +
    `🏁 ${trip.dest_name ?? 'Destino'}\n` +
    `📏 ${km} km\n\n` +
    // Play Store y no publihazclick.com: la app no atiende enlaces web (no hay App Links), así que
    // ese enlace abría el NAVEGADOR. Desde Play Store el conductor toca "Abrir" y entra a la app,
    // donde la solicitud ya le aparece en la lista. El "id" corto sirve para no repetir el aviso.
    `Ábrela en la app Movi para ofertar 👉 ${ENLACE_ABRIR_MOVI}\n` +
    `_(solicitud ${tripId.slice(0, 8)})_\n\n` +
    `_Te llega por aquí porque nos escribiste hoy. Si no quieres estos avisos, responde *NO MÁS*._`;
  const res = await Promise.all(destino.map(t => sendSupportText(t, texto, 'sistema')));

  let resTpl: WaResult[] = [];
  if (destinoTpl.length) {
    const info = await fetch(`https://graph.facebook.com/v22.0/${WABA_ID}/message_templates?name=${PLANTILLA_SOLICITUD}&fields=name,status,category,language`, {
      headers: { Authorization: `Bearer ${WA_TOKEN}` },
    }).then(r => r.json()).catch(() => ({})) as { data?: Array<{ status: string; category: string; language: string }> };
    const tpl = info?.data?.[0];
    if (tpl?.status === 'APPROVED' && tpl.category === 'UTILITY') {
      const vars = [precio, trip.origin_name ?? 'Recogida', trip.dest_name ?? 'Destino', km, tripId.slice(0, 8)].map(v => tplParam(String(v)));
      resTpl = await Promise.all(destinoTpl.map(t => sendSupportGraph({
        to: t, type: 'template',
        template: { name: PLANTILLA_SOLICITUD, language: { code: tpl.language }, components: [{ type: 'body', parameters: vars.map(v => ({ type: 'text', text: v })) }] },
      }, 'sistema')));
    } else {
      console.warn('[WA] aviso de solicitud por plantilla NO enviado: plantilla', tpl?.status ?? 'inexistente', tpl?.category ?? '');
    }
  }
  return { enviados: res.filter(r => r.ok).length + resTpl.filter(r => r.ok).length, candidatos: avisables.length };
}

/**
 * "NO MÁS" a un aviso de solicitud por WhatsApp: apaga SOLO esos avisos (el push sigue igual).
 * Solo se toma así si en las últimas 24 h le mandamos un aviso de solicitud: "no más" en otra
 * conversación sigue al bot normal.
 */
async function manejarBajaAlertasViaje(phone: string, msgText: string): Promise<boolean> {
  const t = normalizarTexto(msgText).replace(/[.!¡¿?]/g, '').trim();
  if (!/^(no mas|no mas avisos|no quiero (mas )?avisos|parar|stop|no mas solicitudes|ya no mas)$/.test(t)) return false;
  const wa = normWaPhone(phone);
  // Se revisa en código y no con un filtro .or() de PostgREST: los textos llevan emojis, espacios y
  // un "*" (que en ese filtro es comodín), y armar la consulta con ellos es frágil.
  const { data: salientes } = await db().from('ag_wa_message_log').select('body')
    .eq('wa_phone', wa).eq('direction', 'out')
    .gte('created_at', new Date(Date.now() - 24 * 3600e3).toISOString())
    .order('created_at', { ascending: false }).limit(100);
  const marcas = [MARCA_ALERTA_VIAJE, MARCA_DESCONECTADO, MARCA_TE_CONECTAS];
  const huboAviso = (salientes ?? []).some((r: { body: string }) => marcas.some(m => (r.body ?? '').startsWith(m)));
  if (!huboAviso) return false;
  await db().from('ag_wa_support_sessions').upsert(
    { wa_phone: wa, alertas_viaje_off: true, alertas_viaje_off_at: new Date().toISOString() },
    { onConflict: 'wa_phone' },
  );
  await sendSupportText(phone, 'Listo 👍 Ya no te mando avisos de viajes por aquí. Te siguen llegando en la app Movi como notificación.', 'bot');
  return true;
}

/**
 * Recordatorio por WhatsApp al conductor desconectado (migración 304, ag_recordar_conectarse).
 * Solo a quien tiene la ventana de 24 h abierta en el número de conductores (gratis) y no dijo
 * "NO MÁS". El push del mismo recordatorio lo manda la base por ag-send-push.
 */
async function recordatorioConectarse(motivo: string, telefonos: string[]): Promise<number> {
  const tels = [...new Set(telefonos.map(normWaPhone).filter(t => /^\d{11,15}$/.test(t)))];
  if (!tels.length) return 0;
  const desde = new Date(Date.now() - 23.5 * 3600e3).toISOString();
  const [{ data: entrantes }, { data: apagados }] = await Promise.all([
    db().from('ag_wa_message_log').select('wa_phone').eq('role', 'conductor').eq('direction', 'in')
      .gte('created_at', desde).in('wa_phone', tels),
    db().from('ag_wa_support_sessions').select('wa_phone').eq('alertas_viaje_off', true).in('wa_phone', tels),
  ]);
  const conVentana = new Set((entrantes ?? []).map((r: { wa_phone: string }) => r.wa_phone));
  const sinAvisos = new Set((apagados ?? []).map((r: { wa_phone: string }) => r.wa_phone));
  const destino = tels.filter(t => conVentana.has(t) && !sinAvisos.has(t));
  if (!destino.length) return 0;
  const texto = motivo === 'desconexion'
    ? `${MARCA_DESCONECTADO} (la app se cerró en tu celular), así que ya no te llegan las solicitudes.\n\n` +
      `Abre Movi y quedas en línea de una 👉 ${ENLACE_ABRIR_MOVI}\n\n` +
      `_Si no quieres estos avisos, responde *NO MÁS*._`
    : `${MARCA_TE_CONECTAS} Hay pasajeros pidiendo viajes en Movi.\n\n` +
      `Abre la app y quedas en línea de una 👉 ${ENLACE_ABRIR_MOVI}\n\n` +
      `_Si no quieres estos avisos, responde *NO MÁS*._`;
  const res = await Promise.all(destino.map(t => sendSupportText(t, texto, 'sistema')));
  return res.filter(r => r.ok).length;
}

// ─── Ayuda automática a quien no logra recargar saldo (pedido del usuario 2026-10-04) ──────────
// "Una automatización que le escriba de manera automática a una persona que queda rechazada la
// recarga para saber en qué paso se están quedando o en qué paso tienen dificultad". Contexto: desde
// el 29-ago ninguna recarga se aprobaba (25 intentos) y no sabíamos por qué.
//
// Cómo arranca: el cron movi-alertar-recargas-fallidas (migración 306/307) llama el evento interno
// 'ayuda_recarga' cuando un intento lleva 20 min sin aprobarse. Por el número de CONDUCTORES:
//   - con la ventana de 24 h abierta -> la lista de opciones directo (gratis);
//   - sin ventana -> la plantilla UTILITY PLANTILLA_AYUDA_RECARGA (un botón que abre la lista).
// Cada opción tiene su respuesta concreta; la elección queda en ag_wallet_payments.ayuda_paso y se le
// avisa al admin. "Me cobraron y no veo el saldo", "Otro problema" y "Sigue sin funcionar" pasan a un
// asesor (el bot se calla para no pisarlo). Los ids rec_* son estables; el texto se puede cambiar.
// MENSAJE DE SALDO (decisión del usuario 2026-10-04, después de hablar con conductores): ya NO se dice
// que el primer viaje no necesita saldo -- quien no ha recargado "no se toma en serio" estar pendiente de
// la app ni de los viajes. Se dice que hay que recargar mínimo $10.000 para aceptar viajes y que el primer
// viaje no descuenta nada. OJO: la LÓGICA no cambió (cc_accept_offer sigue dejando tomar el primer viaje
// sin saldo); esto es solo lo que se le DICE al conductor.
const MENSAJE_SALDO_INICIAL = 'Para aceptar viajes necesitas tener mínimo *$10.000* de saldo. En tu *primer viaje no se te descuenta nada*; el descuento empieza desde el *segundo viaje*.';
// Recarga por Nequi directo (desde 2026-10-04 la app ya no muestra ePayco).
const NEQUI_RECARGA = '313 445 3649';
const PASOS_RECARGA_NEQUI =
  `1. En la app toca tu *Saldo* → *Recargar*.\n` +
  `2. Envía el valor que quieras recargar (mínimo $10.000) al *Nequi ${NEQUI_RECARGA}*.\n` +
  `3. Mándanos por aquí la *captura del comprobante* y te cargamos el saldo completo, sin comisión, en pocos minutos.`;
// ─── Comprobante de recarga por Nequi (2026-10-04) ────────────────────────────
// El botón "Enviar comprobante por WhatsApp" de la app manda: "Hola, hice una recarga por Nequi para mi
// saldo de Movi. Te envío el comprobante 👇". Antes el bot veía "recarga" y contestaba CÓMO recargar + el
// video de ePayco (que ya no existe), y a la foto del comprobante le decía "solo puedo leer texto; si son
// documentos súbelos en la app". Ninguna de las dos cosas tenía sentido para alguien que ya pagó.
// Ahora: al texto se le pide la captura; a la captura se le confirma el recibo, se avisa al admin para que
// revise su Nequi y cargue el saldo desde el panel, y la conversación queda escalada (el bot no pisa al asesor).
// Sin columnas nuevas: el "estado" se lee del propio registro de mensajes (marcas al inicio del texto).
const MARCA_PIDE_COMPROBANTE = '🧾 ¡Gracias';
const MARCA_COMPROBANTE_RECIBIDO = '🧾 ¡Recibí tu comprobante';
const TEXTO_DICE_PAGO_NEQUI = /hice\s+(una|la)\s+recarga|te\s+env[ií]o\s+el\s+comprobante|comprobante\s+(de|del)\s+(pago|nequi|la\s+recarga)|ya\s+(pagu[eé]|transfer[ií]|consign[eé]|envi[eé]\s+la\s+plata)/i;

async function manejarComprobanteNequi(phone: string, msgType: string, msgText: string, mediaId?: string): Promise<boolean> {
  const esArchivo = msgType === 'image' || msgType === 'document';
  const dicePago = TEXTO_DICE_PAGO_NEQUI.test(msgText);
  if (!esArchivo && !dicePago) return false;

  const wa = normWaPhone(phone);
  const hace = (min: number) => new Date(Date.now() - min * 60e3).toISOString();
  const { data: recientes } = await db().from('ag_wa_message_log').select('direction, body, created_at')
    .eq('wa_phone', wa).eq('role', 'conductor').gte('created_at', hace(180))
    .order('created_at', { ascending: false }).limit(40);
  const filas = (recientes ?? []) as Array<{ direction: string; body: string | null; created_at: string }>;
  const dijoQuePago = filas.some(r => r.direction === 'in' && TEXTO_DICE_PAGO_NEQUI.test(r.body ?? ''));
  const lePedimos = filas.some(r => r.direction === 'out' && (r.body ?? '').startsWith(MARCA_PIDE_COMPROBANTE));

  // Solo el texto ("hice una recarga por Nequi... te envío el comprobante"): pedir la captura.
  if (!esArchivo) {
    await sendSupportText(phone,
      `${MARCA_PIDE_COMPROBANTE} por tu recarga! 🙌\n\n` +
      `Envíame por aquí la *captura del comprobante* de Nequi (un pantallazo o foto). ` +
      `Apenas llegue, un asesor verifica el pago y te carga el saldo completo en pocos minutos.`);
    return true;
  }

  // Un archivo sin contexto de recarga (p. ej. una foto de documentos) sigue el camino de siempre.
  if (!dicePago && !dijoQuePago && !lePedimos) return false;

  // Varias fotos seguidas: un solo acuse y un solo aviso al admin cada 10 minutos.
  const yaAcusado = filas.some(r => r.direction === 'out' && (r.body ?? '').startsWith(MARCA_COMPROBANTE_RECIBIDO)
    && new Date(r.created_at).getTime() > Date.now() - 10 * 60e3);
  if (yaAcusado) return true;

  await sendSupportText(phone,
    `${MARCA_COMPROBANTE_RECIBIDO}! ✅\n\n` +
    `Ya lo estamos verificando y en pocos minutos te cargamos el saldo completo, sin descuentos. ` +
    `Te avisamos por aquí apenas quede listo.`);

  const nombre = (await lookupRealFirstName(phone)) ?? 'Un conductor';
  // Foto + lectura con IA (2026-10-04, pedido del usuario: "envíame la foto y si te respondo que cayó,
  // carga el saldo solo"). Si algo falla, el aviso sale igual, solo que sin foto o sin lectura.
  const comp = mediaId ? await procesarFotoComprobante(mediaId, wa) : null;
  const partes = [`${nombre} (+${wa}) mandó un comprobante de recarga por Nequi.`];
  if (comp?.lectura?.monto) partes.push(`Monto leído: $${Number(comp.lectura.monto).toLocaleString('es-CO')}`);
  if (comp?.lectura?.referencia) partes.push(`Referencia: ${comp.lectura.referencia}`);
  if (comp?.lectura?.destinatario) partes.push(`Para: ${comp.lectura.destinatario}`);
  if (comp?.lectura && comp.lectura.es_comprobante_pago === false) partes.push('⚠️ La IA no ve que sea un comprobante de pago');
  if (comp?.url) partes.push(`Foto: ${comp.url}`);
  partes.push(`Revisa tu Nequi y RESPONDE ESTE MENSAJE con "cayó" y el número de aprobación (ej: "sí cayó, aprobación 12345678") y le cargo el saldo yo. Si el monto es otro, escríbelo (ej: "cayó 20.000 aprobación 12345678"). Si no llegó, responde "no cayó".`);
  await sendAdminAlert(SUPPORT_PHONE, MARCA_ALERTA_COMPROBANTE, partes.join(' · '));
  // Queda en manos del asesor: el bot no le contesta encima mientras tanto.
  await upsertSupportSession(phone, { escalated: true, escalated_at: new Date().toISOString() });
  return true;
}

const MARCA_ALERTA_COMPROBANTE = '💸 Comprobante de recarga Nequi';

interface LecturaComprobante { es_comprobante_pago?: boolean; monto?: number | null; referencia?: string | null; destinatario?: string | null; fecha?: string | null }

/** Baja la foto de Meta, la guarda privada en movi-driver-docs (link firmado de 7 días) y la lee con IA. */
async function procesarFotoComprobante(mediaId: string, wa: string): Promise<{ url: string | null; lectura: LecturaComprobante | null }> {
  let url: string | null = null;
  let lectura: LecturaComprobante | null = null;
  try {
    const meta = await fetch(`https://graph.facebook.com/v20.0/${mediaId}`, { headers: { Authorization: `Bearer ${WA_TOKEN}` } }).then(r => r.ok ? r.json() : null);
    if (!meta?.url) return { url, lectura };
    const resp = await fetch(meta.url as string, { headers: { Authorization: `Bearer ${WA_TOKEN}` } });
    if (!resp.ok) return { url, lectura };
    const tipo = (meta.mime_type as string) || resp.headers.get('content-type') || 'image/jpeg';
    const bytes = new Uint8Array(await resp.arrayBuffer());

    try {
      const ext = tipo.includes('png') ? 'png' : tipo.includes('pdf') ? 'pdf' : 'jpg';
      const ruta = `comprobantes-nequi/${wa}/${Date.now()}.${ext}`;
      const up = await db().storage.from('movi-driver-docs').upload(ruta, bytes, { contentType: tipo, upsert: false });
      if (!up.error) {
        const firmado = await db().storage.from('movi-driver-docs').createSignedUrl(ruta, 7 * 24 * 3600);
        url = firmado.data?.signedUrl ?? null;
      } else console.error('[WA] comprobante upload:', up.error);
    } catch (e) { console.error('[WA] comprobante storage:', e); }

    const apiKey = Deno.env.get('OPENAI_API_KEY');
    if (apiKey && tipo.startsWith('image/')) {
      let bin = '';
      for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      const r = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'gpt-4o-mini', temperature: 0, response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: 'Lees capturas de comprobantes de pago colombianos (Nequi, Bancolombia, Daviplata). Responde SOLO un JSON con: es_comprobante_pago (boolean), monto (número entero en pesos sin puntos, o null), referencia (string con el número de referencia/aprobación/comprobante, o null), destinatario (nombre o número a quien se envió, o null), fecha (string tal como aparece, o null). No inventes: si no se ve, null.' },
            { role: 'user', content: [{ type: 'image_url', image_url: { url: `data:${tipo};base64,${btoa(bin)}` } }] },
          ],
        }),
      });
      if (r.ok) {
        const j = await r.json();
        lectura = JSON.parse(j?.choices?.[0]?.message?.content ?? '{}') as LecturaComprobante;
      } else console.error('[WA] comprobante IA:', r.status, await r.text());
    }
  } catch (e) { console.error('[WA] procesarFotoComprobante:', e); }
  return { url, lectura };
}

/**
 * El admin responde al aviso de comprobante: "sí cayó, aprobación 12345678" -> se carga el saldo solo.
 * Se ubica el aviso por el mensaje citado (wamid en ag_wa_message_log); si no citó, se toma el único
 * aviso de comprobante pendiente de las últimas 48 h. El número de aprobación va en ag_wallet_payments
 * como invoice 'NEQUI-<aprobación>' (columna única): la misma aprobación no puede cargar saldo dos veces.
 */
async function manejarAprobacionNequi(msgText: string, quotedId?: string): Promise<boolean> {
  const t = msgText.trim();
  // Sin \b alrededor de palabras con tilde: en JS \b no cuenta "ó" como letra ("cayó" fallaba).
  const dijoNo = /(^|[^a-záéíóúñü])no\s+(cay[oó]|lleg[oó]|ha\s+(llegado|ca[ií]do)|aparece|est[aá])(?![a-záéíóúñü])|(^|[^a-záéíóúñü])falso(?![a-záéíóúñü])|rechaz/i.test(t);
  const dijoSi = !dijoNo && /(^|[^a-záéíóúñü])(s[ií]|cay[oó]|lleg[oó]|aprob[a-záéíóúñü]*|confirm[a-záéíóúñü]*|listo|ok|c[aá]rg[a-záéíóúñü]*)(?![a-záéíóúñü])/i.test(t);
  if (!dijoNo && !dijoSi) return false;

  const db_ = db();
  const admin = normWaPhone(SUPPORT_PHONE);
  type Fila = { id: string; body: string | null; created_at: string; wamid: string | null };
  let aviso: Fila | null = null;
  if (quotedId) {
    const { data } = await db_.from('ag_wa_message_log').select('id, body, created_at, wamid')
      .eq('wamid', quotedId).maybeSingle();
    if (data && (data.body ?? '').includes(MARCA_ALERTA_COMPROBANTE)) aviso = data as Fila;
    else if (data) return false; // citó otro mensaje: que lo maneje lo de siempre
  }
  if (!aviso) {
    const { data } = await db_.from('ag_wa_message_log').select('id, body, created_at, wamid')
      .eq('wa_phone', admin).eq('direction', 'out').like('body', `%${MARCA_ALERTA_COMPROBANTE}%`)
      .gte('created_at', new Date(Date.now() - 48 * 3600e3).toISOString())
      .order('created_at', { ascending: false }).limit(10);
    const pendientes: Fila[] = [];
    for (const f of (data ?? []) as Fila[]) {
      const tel = (f.body ?? '').match(/\+(57\d{10})/)?.[1];
      if (!tel) continue;
      const { data: hecho } = await db_.from('ag_wa_message_log').select('id').eq('wa_phone', admin).eq('direction', 'out')
        .like('body', `%[comprobante +${tel}]%`).gte('created_at', f.created_at).limit(1);
      if (!hecho?.length && !pendientes.some(x => (x.body ?? '').includes(tel))) pendientes.push(f);
    }
    if (!pendientes.length) return false;
    if (pendientes.length > 1) {
      await sendText(SUPPORT_PHONE, `Tengo ${pendientes.length} comprobantes de Nequi pendientes 🧾 Responde *citando* el aviso del conductor que quieres aprobar (mantén presionado el aviso → Responder).`, 'alerta');
      return true;
    }
    aviso = pendientes[0];
  }

  const body = aviso.body ?? '';
  const tel = body.match(/\+(57\d{10})/)?.[1];
  if (!tel) { await sendText(SUPPORT_PHONE, 'No encontré el celular del conductor en ese aviso 🤔 Cárgale el saldo desde el panel.', 'alerta'); return true; }
  const montoLeido = Number((body.match(/Monto leído: \$([\d.]+)/)?.[1] ?? '').replace(/\./g, '')) || null;

  const { data: u } = await db_.from('ag_users').select('id, full_name').eq('phone', `+${tel}`).maybeSingle();
  const { data: d } = u ? await db_.from('ag_drivers').select('id, wallet_balance').eq('ag_user_id', u.id).maybeSingle() : { data: null };
  const nombre = (u?.full_name as string | undefined)?.split(' ')[0] ?? `+${tel}`;
  if (!d) { await sendText(SUPPORT_PHONE, `No encontré la cuenta de conductor de +${tel} 🤔 Revísalo en el panel.`, 'alerta'); return true; }

  if (dijoNo) {
    await sendSupportText(tel, `Hola, revisamos y *no nos aparece el pago* de tu recarga por Nequi 😕\n\nRevisa que lo hayas enviado al Nequi *${NEQUI_RECARGA}* y mándanos de nuevo el comprobante por aquí. Si ya lo enviaste bien, escríbenos y lo revisamos contigo.`, 'sistema');
    await sendText(SUPPORT_PHONE, `❌ Listo, le avisé a ${nombre} que no apareció el pago. No le cargué nada. [comprobante +${tel}]`, 'alerta');
    return true;
  }

  // Monto: el que escribió el admin (con puntos o con $), si no, el que leyó la IA.
  const montoEscrito = t.match(/\$\s?(\d{1,3}(?:[.,]\d{3})+|\d{4,7})\b/)?.[1] ?? t.match(/\b(\d{1,3}(?:[.,]\d{3})+)\b/)?.[1] ?? null;
  const monto = montoEscrito ? Number(montoEscrito.replace(/[.,]/g, '')) : montoLeido;
  // Aprobación: la secuencia de dígitos más larga que no sea el monto.
  const sinMonto = montoEscrito ? t.replace(montoEscrito, ' ') : t;
  const aprobacion = (sinMonto.match(/[A-Za-z]{0,3}\d{4,}/g) ?? []).sort((a, b) => b.length - a.length)[0] ?? null;

  if (!monto || monto < 1000 || monto > 1_000_000) {
    await sendText(SUPPORT_PHONE, `¿Cuánto le cargo a ${nombre}? No pude leer el monto en el comprobante. Responde citando el aviso, por ejemplo: "cayó 20.000 aprobación 12345678".`, 'alerta');
    return true;
  }
  if (!aprobacion) {
    await sendText(SUPPORT_PHONE, `Me falta el *número de aprobación* para cargarle $${monto.toLocaleString('es-CO')} a ${nombre} (así no se carga dos veces el mismo pago). Responde citando el aviso, por ejemplo: "sí cayó, aprobación 12345678".`, 'alerta');
    return true;
  }

  const factura = `NEQUI-${aprobacion.toUpperCase()}`;
  const { data: pago, error: errPago } = await db_.from('ag_wallet_payments').insert({
    driver_id: d.id, amount: monto, status: 'approved', invoice: factura,
    epayco_ref: aprobacion, epayco_medio: 'nequi', epayco_estado: 'Aprobada por el admin (WhatsApp)',
    approved_at: new Date().toISOString(),
  }).select('id').single();
  if (errPago) {
    const repetida = String((errPago as { code?: string }).code) === '23505';
    await sendText(SUPPORT_PHONE, repetida
      ? `⚠️ La aprobación *${aprobacion}* ya se usó para cargar saldo antes. No cargué nada. Si es otro pago, revisa el número.`
      : `No pude registrar el pago (${(errPago as { message?: string }).message ?? 'error'}). Cárgale el saldo desde el panel.`, 'alerta');
    return true;
  }
  const { error: errCarga } = await db_.rpc('ag_recharge_driver_wallet', { p_driver_id: d.id, p_amount: monto });
  if (errCarga) {
    await db_.from('ag_wallet_payments').update({ status: 'failed', epayco_motivo: `No se pudo cargar: ${errCarga.message}` }).eq('id', pago.id);
    await sendText(SUPPORT_PHONE, `No pude cargar el saldo (${errCarga.message}). Cárgaselo desde el panel.`, 'alerta');
    return true;
  }
  const nuevo = Number(d.wallet_balance ?? 0) + monto;
  await sendSupportText(tel, `✅ ¡Listo! Te cargamos *$${monto.toLocaleString('es-CO')}* a tu saldo de Movi. Tu saldo ahora es *$${nuevo.toLocaleString('es-CO')}*.\n\n${LEAD_PONTE_EN_LINEA}`, 'sistema');
  // Primera recarga de alguien que venía del embudo: ahora sí, el "gana invitando".
  if (Number(d.wallet_balance ?? 0) < 10000 && await getLead(tel)) await leadInvitaYGana(tel);
  await upsertSupportSession(tel, { escalated: false, escalated_at: null });
  await sendText(SUPPORT_PHONE, `✅ Cargué *$${monto.toLocaleString('es-CO')}* a ${nombre} (aprobación ${aprobacion}). Saldo nuevo: $${nuevo.toLocaleString('es-CO')}. Ya le avisé. [comprobante +${tel}]`, 'alerta');
  return true;
}

const PLANTILLA_AYUDA_RECARGA = 'movi_recarga_no_completada';
const BOTON_PLANTILLA_AYUDA_RECARGA = 'Contarte qué pasó';
// "no pude recargar", "no puedo recargar el saldo", "no me deja recargar", "problema con la recarga".
// Corto a propósito (máx. 120 caracteres): un mensaje largo es una pregunta que debe ver el asesor/IA.
const ESCRIBIO_NO_PUDO_RECARGAR = /^(?=.{0,120}$).*\b(no\s+(pude|puedo|logr[eéo]|me\s+deja|me\s+dej[oó])\s+(hacer\s+(la\s+)?)?recarg|problema\w*\s+(con|para|en)\s+(la\s+|mi\s+)?recarg)/i;

const PASOS_RECARGA: Record<string, { titulo: string; desc: string }> = {
  rec_p_no_abre:  { titulo: 'No abrió el pago',          desc: 'Toqué pagar y no se abrió la página de pago' },
  rec_p_banco:    { titulo: 'El banco o Nequi rechazó',  desc: 'Llegué a pagar y me salió rechazado' },
  rec_p_medio:    { titulo: 'No sé cómo pagar',          desc: 'No sé qué medio elegir o cómo hacerlo' },
  rec_p_comision: { titulo: 'No entiendo el cobro',      desc: 'Me cobra más de lo que me llega' },
  rec_p_cobrado:  { titulo: 'Pagué y no veo saldo',      desc: 'Me descontaron la plata pero no me llegó' },
  rec_p_otro:     { titulo: 'Otro problema',             desc: 'Prefiero contarlo o que me escriba alguien' },
};

const BOTONES_RESULTADO_RECARGA = [
  { id: 'rec_ok', title: '✅ Ya pude recargar' },
  { id: 'rec_sigue', title: '❌ Sigue sin funcionar' },
];

/**
 * Lo que el conductor necesita saber de SU saldo antes de pelear con la recarga (2026-10-04, caso
 * real José …528: intentó recargar 3 veces y ni siquiera lo necesitaba). Mismas reglas que acepta la
 * app (submitDriverOffer) y la base (ag_on_offer_accepted): sin viajes -> la primera carrera es
 * gratis; desde el segundo viaje -> basta la comisión de ese viaje en el saldo (sin mínimo fijo).
 */
async function notaSaldoConductor(tel: string): Promise<string> {
  try {
    const { data: u } = await db().from('ag_users').select('id').eq('phone', toE164(tel)).maybeSingle();
    if (!u?.id) return '';
    const { data: d } = await db().from('ag_drivers').select('status, wallet_balance, metric_trips_completed').eq('ag_user_id', u.id).maybeSingle();
    if (!d) return '';
    // Regla de saldo del 2026-10-04 (igual para todos los estados): primer viaje gratis; desde el
    // segundo, alcanza con tener en el saldo la comisión de ese viaje (12% del precio).
    if (!(Number(d.metric_trips_completed) > 0)) {
      return `💡 *Dato importante:* ${MENSAJE_SALDO_INICIAL}\n\n`;
    }
    return `💡 *Dato importante:* para aceptar un viaje solo necesitas tener en tu saldo la *comisión de ese viaje* (12% del precio; por ejemplo $1.200 en un viaje de $10.000). Hoy tienes $${Number(d.wallet_balance ?? 0).toLocaleString('es-CO')}.\n\n`;
  } catch (e) { console.error('[WA] notaSaldoConductor:', e); }
  return '';
}

async function enviarListaAyudaRecarga(tel: string, nombre: string | null, intro?: string): Promise<WaResult> {
  const saludo = intro ?? `Vimos que tu recarga de saldo en Movi no se completó y queremos ayudarte a terminarla.`;
  const nota = await notaSaldoConductor(tel);
  return sendSupportGraph({
    to: tel, type: 'interactive',
    interactive: {
      type: 'list',
      body: { text: `${saludo}\n\n${nota}¿En qué paso tuviste problema?` },
      action: {
        button: 'Elegir paso',
        sections: [{ title: 'Recarga de saldo', rows: Object.entries(PASOS_RECARGA).map(([id, p]) => ({ id, title: p.titulo.slice(0, 24), description: p.desc.slice(0, 72) })) }],
      },
    },
  }, 'sistema');
}

/** Guarda lo que eligió en su último intento sin aprobar y le avisa al admin. */
async function registrarPasoRecarga(tel: string, paso: string, etiqueta: string): Promise<void> {
  try {
    const { data: u } = await db().from('ag_users').select('id, full_name, phone').eq('phone', toE164(tel)).maybeSingle();
    let detalle = `${u?.full_name ?? 'Conductor'} (${toE164(tel)}) respondió: "${etiqueta}".`;
    if (u?.id) {
      const { data: d } = await db().from('ag_drivers').select('id').eq('ag_user_id', u.id).maybeSingle();
      if (d?.id) {
        const { data: pago } = await db().from('ag_wallet_payments')
          .select('id, amount, epayco_estado, epayco_motivo, epayco_medio')
          .eq('driver_id', d.id).neq('status', 'approved')
          .order('created_at', { ascending: false }).limit(1).maybeSingle();
        if (pago?.id) {
          await db().from('ag_wallet_payments').update({ ayuda_paso: paso, ayuda_at: new Date().toISOString() }).eq('id', pago.id);
          detalle += ` Recarga de $${Number(pago.amount).toLocaleString('es-CO')}. ePayco: ${pago.epayco_estado ?? 'sin respuesta'}` +
            `${pago.epayco_motivo ? ` (${pago.epayco_motivo})` : ''}${pago.epayco_medio ? `, medio ${pago.epayco_medio}` : ''}.`;
        }
      }
    }
    detalle += ` Escríbele: wa.me/${normWaPhone(toE164(tel))}`;
    await sendAdminAlert(SUPPORT_PHONE, '💳 Respuesta sobre recarga', detalle);
    await db().from('ag_admin_notifications').insert({ type: 'admin_info', title: '💳 Respuesta sobre recarga', body: detalle });
  } catch (e) { console.error('[WA] registrarPasoRecarga:', e); }
}

/** Atiende los botones de la ayuda de recarga. Devuelve true si el mensaje era de este flujo. */
async function manejarAyudaRecarga(tel: string, msgText: string, btnId?: string): Promise<boolean> {
  // El conductor nos escribe desde el botón "¿No pudiste recargar?" de la app (mensaje ya escrito
  // "Hola, no pude recargar mi saldo en Movi") o con sus palabras parecidas: lista de una vez.
  if (!btnId && ESCRIBIO_NO_PUDO_RECARGAR.test(msgText)) {
    await registrarPasoRecarga(tel, 'escribio', 'Nos escribió: no pudo recargar');
    await enviarListaAyudaRecarga(tel, await lookupRealFirstName(tel), 'Claro que sí, te ayudamos con la recarga 🙌');
    return true;
  }
  const id = btnId ?? (msgText.trim() === BOTON_PLANTILLA_AYUDA_RECARGA ? 'rec_inicio' : '');
  if (!id.startsWith('rec_')) return false;

  if (id === 'rec_inicio') {
    await enviarListaAyudaRecarga(tel, null, 'Gracias por responder 🙌');
    return true;
  }

  if (id === 'rec_ok') {
    await registrarPasoRecarga(tel, 'resuelto', 'Ya pude recargar');
    await sendSupportText(tel, `¡Excelente! 🙌 Gracias por contarnos. Si vuelves a tener problemas con una recarga, escríbenos por aquí y te ayudamos.`);
    return true;
  }

  if (id === 'rec_sigue' || id === 'rec_p_otro' || id === 'rec_p_cobrado') {
    const etiqueta = id === 'rec_sigue' ? 'Sigue sin funcionar' : PASOS_RECARGA[id].titulo;
    await registrarPasoRecarga(tel, id === 'rec_sigue' ? 'sigue_sin_funcionar' : id.replace('rec_p_', ''), etiqueta);
    const texto = id === 'rec_p_cobrado'
      ? `Tranquilo, lo revisamos 🙏 Envíanos por aquí una *captura del comprobante* de Nequi y un asesor te acredita el saldo apenas lo confirme.`
      : `Cuéntanos con tus palabras qué pasó o envíanos una *captura de pantalla* del error. Ya le avisamos a un asesor y te escribe por aquí 🙏`;
    await sendSupportText(tel, texto);
    // Que el bot no le responda encima al asesor (mismo mecanismo que el resto de escaladas).
    await upsertSupportSession(tel, { escalated: true, escalated_at: new Date().toISOString() });
    return true;
  }

  const respuestas: Record<string, string> = {
    // Desde 2026-10-04 la app solo muestra la recarga por Nequi: todas estas respuestas llevan a ese camino.
    rec_p_no_abre:
      `Ahora la recarga es más fácil, directo por Nequi 👇\n\n${PASOS_RECARGA_NEQUI}\n\n¿Pudiste recargar?`,
    rec_p_banco:
      `Ahora no necesitas pasar por el banco: recarga directo por Nequi 👇\n\n${PASOS_RECARGA_NEQUI}\n\n¿Pudiste recargar?`,
    rec_p_medio:
      `Así se recarga 👇\n\n${PASOS_RECARGA_NEQUI}\n\n¿Pudiste recargar?`,
    rec_p_comision:
      `Ahora la recarga por Nequi es *sin comisión*: si envías $10.000, te llegan $10.000 completos 🙌\n\n${PASOS_RECARGA_NEQUI}\n\n¿Pudiste recargar?`,
  };
  const texto = respuestas[id];
  if (!texto) return false;
  await registrarPasoRecarga(tel, id.replace('rec_p_', ''), PASOS_RECARGA[id].titulo);
  await sendSupportButtons(tel, texto, BOTONES_RESULTADO_RECARGA, 'bot');
  return true;
}

/** Primer mensaje de la ayuda (lo dispara el cron). Gratis con ventana; si no, plantilla UTILITY. */
async function iniciarAyudaRecarga(tel: string): Promise<{ ok: boolean; via: string }> {
  const t = normWaPhone(toE164(tel));
  if (!/^\d{11,15}$/.test(t)) return { ok: false, via: 'telefono_invalido' };
  const desde = new Date(Date.now() - 23.5 * 3600e3).toISOString();
  const { data: entrante } = await db().from('ag_wa_message_log').select('id')
    .eq('wa_phone', t).eq('role', 'conductor').eq('direction', 'in').gte('created_at', desde).limit(1).maybeSingle();
  // Decisión del usuario (2026-10-04): lo principal es que el conductor nos escriba desde el botón de
  // la app. Esto es solo el RESPALDO: se le escribe únicamente si tiene la ventana de 24 h abierta
  // (gratis); sin ventana no se le manda nada (la plantilla PLANTILLA_AYUDA_RECARGA queda sin usar).
  if (!entrante) return { ok: false, via: 'sin_ventana' };
  // Si ya nos escribió por el botón (o ya le llegó la lista) en las últimas 3 h, no repetir.
  const { data: yaLista } = await db().from('ag_wa_message_log').select('id')
    .eq('wa_phone', t).eq('role', 'conductor').eq('direction', 'out')
    .ilike('body', '%En qué paso tuviste problema%')
    .gte('created_at', new Date(Date.now() - 3 * 3600e3).toISOString()).limit(1).maybeSingle();
  if (yaLista) return { ok: false, via: 'ya_atendido' };
  const r = await enviarListaAyudaRecarga(t, await lookupRealFirstName(t));
  return { ok: r.ok, via: 'lista' };
}

async function handleInternalEvent(payload: Record<string, unknown>) {
  const event   = payload._internal_event as string;
  const phone   = payload.wa_phone as string;

  if (!phone || !event) return;

  // Recordatorio a un lead de conductor que se quedó callado (cron
  // ag_wa_lead_followups, migración 285). El cron ya validó la ventana de 24h, el
  // escalón que toca y que la persona no haya pedido que no le escribamos -- acá
  // solo se redacta y se manda por el número de conductores.
  // Envío programado del embudo (cron movi-envios-programados, migración 287). La
  // ventana de 24h y a quién le toca ya los decidió ag_wa_leads_para_embudo; acá solo
  // se redacta según si ya lo habíamos contactado o si le llegó el mensaje erróneo.
  if (event === 'lead_embudo_programado') {
    await leadEmbudoProgramado(
      phone,
      (payload.wa_name as string | null) ?? null,
      payload.ya_contactado === true,
      payload.recibio_error === true,
    );
    return;
  }

  // Conductor que lleva 30 min registrado sin vehículo (migración 300, 2026-10-02). Se le escribe
  // por el número de CONDUCTORES para ayudarlo a terminar -- solo si ese número tiene ventana de
  // 24 h abierta con él (escribió hace poco, como los leads de la pauta). Si no, nada: Meta
  // descartaría el mensaje en silencio y al admin ya le llegó el aviso de siempre.
  if (event === 'registro_sin_vehiculo') {
    const { data: ult } = await db().from('ag_wa_message_log').select('created_at')
      .eq('wa_phone', phone).eq('role', 'conductor').eq('direction', 'in')
      .order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (!ult || Date.now() - new Date(ult.created_at as string).getTime() > 23 * 3600e3) return;
    const nombre = await lookupRealFirstName(phone);
    await sendSupportText(phone,
      `¡Hola! 👋 Soy ${LEAD_ASESORA}, del equipo de conductores de Movi.\n\n` +
      `Vi que empezaste tu registro pero te falta un paso: los *Datos del vehículo* 🏍️🚗 Es menos de un minuto.\n\n` +
      `Abre la app, entra a *"Quiero ser conductor"* y completa tu moto o carro. Recuerda que tu primer viaje lo puedes hacer *sin subir papeles*.\n\n` +
      `¿Te trabaste en algo? Escríbeme y te ayudo.`);
    return;
  }

  // Conductor que aceptó y no arranca (cron movi-conductor-quieto, migración 298). Se le pregunta
  // al pasajero si quiere otro; él decide. Solo si su conversación sigue en ESE viaje.
  if (event === 'conductor_quieto') {
    const tripId = payload.trip_id as string;
    const session = await getSession(phone);
    if (!session || session.trip_request_id !== tripId || session.state !== 'in_trip') return;
    const conductor = (payload.conductor as string) || 'Tu conductor';
    await sendButtons(phone,
      `😕 *${conductor}* aceptó hace ${payload.minutos ?? 5} minutos pero todavía no ha arrancado hacia ti.\n\n` +
      `¿Te busco otro conductor ya? Lo pido al mismo precio y por el mismo recorrido.`,
      [
        { id: `quieto_otro_${tripId}`,    title: '🔄 Buscar otro' },
        { id: `quieto_esperar_${tripId}`, title: '⏳ Seguir esperando' },
      ]);
    return;
  }

  if (event === 'recordatorio_viaje') {
    await enviarRecordatorioViaje(phone, payload.recordatorio_id as string);
    return;
  }

  if (event === 'lead_followup') {
    await leadFollowup(
      phone,
      (payload.wa_name as string | null) ?? null,
      (payload.paso as string) ?? 'saludado',
      (payload.vehiculo as string | null) ?? null,
      Number(payload.numero_nudge ?? 1),
    );
    return;
  }

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
    if (lat != null && lng != null) await sendLocation(phone, lat, lng);
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
    const mediaPath   = payload.media_path as string | null;

    // Nota de voz del conductor. Va antes del texto porque, cuando hay audio, el texto
    // suele ser solo la etiqueta ("🎤 Nota de voz") y lo que importa es escucharlo.
    if (mediaPath && payload.media_type === 'audio') {
      const ok = await enviarNotaDeVozAWhatsApp(phone, mediaPath, driverName);
      if (ok) return;

      // WhatsApp solo acepta ogg/opus, y Chrome de Android suele grabar en webm: en ese
      // caso Meta rechaza el audio. En vez de perder el mensaje, se transcribe y se manda
      // como texto -- exactamente lo que ya se hace al revés con las notas de voz del
      // pasajero, y que en la práctica funciona mejor que el audio.
      const texto = await transcribirNotaDeVoz(mediaPath);
      if (texto) {
        await sendText(phone, `🎤 *${driverName}* (nota de voz):\n${texto}`);
        return;
      }
      if (!message) {
        await sendText(phone, `💬 *${driverName}* te mandó una nota de voz, pero no pudimos entregarla 😔\n\nEscríbele por aquí y te responde.`);
        return;
      }
    }

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
    let label = stage === 'heading_to_pickup'
      ? (delivery ? 'Va en camino a recoger tu paquete' : forNameLive ? `Va en camino a recoger a ${forNameLive}` : 'Va en camino a recogerte')
      : stage === 'arrived_at_pickup'
        ? 'Llegó al punto de recogida'
        : 'Va en camino';

    // "¿Cuánto falta?" es la pregunta que el mapa solo NO responde -- el pasajero ve un
    // punto pero no sabe si son 2 minutos o 15. El ETA va dentro de la etiqueta del mapa
    // en vez de en un mensaje aparte: aparece justo donde la persona está mirando y no
    // gasta un mensaje más. Solo mientras viene en camino; si ya llegó, sobra.
    // Las coordenadas del punto de recogida vienen en el payload del cron (migración 270)
    // para no consultar la base una vez por pasajero cada 4 minutos.
    // El ETA solo sale si la posición es RECIENTE. La migración 281 manda `loc_age_sec`
    // justo para esto: antes se recalculaba el ETA sobre el último punto conocido sin
    // mirar de cuándo era, y con un GPS muerto salía "llega en ~3 min" cada 4 minutos,
    // siempre el mismo, siempre falso (ver UBICACION_FRESCA_SEG).
    const edadSeg = payload.loc_age_sec as number | null;
    const fresca = edadSeg == null || edadSeg <= UBICACION_FRESCA_SEG;

    if ((stage === 'heading_to_pickup' || !stage) && fresca) {
      const oLat = payload.origin_lat as number | null;
      const oLng = payload.origin_lng as number | null;
      if (oLat != null && oLng != null) {
        const eta = etaAlPunto(lat, lng, oLat, oLng);
        if (eta) label += ` · llega en ~${eta.min} min`;
      }
    } else if (!fresca) {
      label += ` · última ubicación hace ${Math.max(1, Math.round((edadSeg as number) / 60))} min`;
    }

    // Mensaje de ubicación nativo de WhatsApp -- se ve como un mapa real
    // dentro del chat, no como un link de texto que hay que tocar y esperar
    // a que abra otra app.
    //
    // La etiqueta ("va en camino · llega en ~3 min") va como texto ANTES del mapa.
    // Metida dentro del mensaje de ubicación rompía el enlace: al tocar, la app
    // buscaba ese texto y respondía "no se encontró ningún resultado" (ver sendLocation).
    await sendText(phone, `📍 Tu ${delivery ? 'mensajero' : 'conductor'}: ${label}.`);
    await sendLocation(phone, lat, lng);
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

async function sendSupportGraph(payload: Record<string, unknown>, sentBy: WaSentBy = 'bot', sentByName: string | null = null): Promise<WaResult> {
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
      logWaMessage(to as string, 'conductor', 'out', summary.text, summary.type, sentBy, sentByName, { ok: res.ok, body: bodyText });
    }
    return { ok: res.ok, status: res.status, body: bodyText };
  } catch (e) {
    console.error('[WA-Support] sendGraph fetch error:', e);
    return { ok: false, body: String(e) };
  }
}

async function sendSupportText(to: string, text: string, sentBy: WaSentBy = 'bot', sentByName: string | null = null): Promise<WaResult> {
  return sendSupportGraph({ to, type: 'text', text: { preview_url: false, body: negritaWhatsApp(text) } }, sentBy, sentByName);
}

// ─── Videos del número de conductores (pedido del usuario, 2026-09-30) ────────
// El usuario grabó 4 videos y pidió que el bot los mande en el momento en que sirven,
// sin costo adicional. Por qué no cuesta nada:
//  · Todos se mandan como RESPUESTA a un mensaje del conductor, o sea dentro de la
//    ventana de 24h, donde WhatsApp no cobra (solo cobra plantillas).
//  · Se mandan por media id, no por link: el archivo se sube una vez a Meta y listo.
//    Por link, Meta lo descargaría de nuestro lado en cada envío.
// El archivo original vive en ag_wa_videos.contenido (migración 293, ahí está el porqué
// de no usar Storage ni la carpeta public/). Meta borra lo subido a los 30 días, así que
// el id se renueva solo cuando pasa de 25: sin cron, lo renueva el primer envío que lo
// necesite. Un video fallido NUNCA frena la conversación: el texto ya salió antes.
type VideoClave = 'como_funciona' | 'recargas' | 'por_que_movi' | 'invitados';
const VIDEO_MEDIA_TTL_MS  = 25 * 24 * 60 * 60 * 1000;
// Mismo video a la misma persona, como mucho uno por semana: reenviarle un video de
// 2-3 minutos que ya vio es la forma más rápida de que bloquee el número.
const VIDEO_NO_REPETIR_MS = 7 * 24 * 60 * 60 * 1000;

/** PostgREST devuelve bytea como texto hex con prefijo "\x". */
function hexABytes(hex: string): Uint8Array {
  const h = hex.startsWith('\\x') ? hex.slice(2) : hex;
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(h.substr(i * 2, 2), 16);
  return out;
}

/** Id vigente del video en Meta, subiéndolo de nuevo si no hay o está por vencer. null = no mandar. */
async function getVideoMediaId(clave: VideoClave): Promise<{ mediaId: string; caption: string } | null> {
  const { data: v } = await db().from('ag_wa_videos')
    .select('activo, caption, mime, media_id, media_subido_at')
    .eq('clave', clave).maybeSingle();
  // `activo` = false apaga un video sin tocar código (así arranca "por_que_movi", ver migración 293).
  if (!v || !v.activo) return null;
  if (v.media_id && v.media_subido_at && Date.now() - new Date(v.media_subido_at as string).getTime() < VIDEO_MEDIA_TTL_MS) {
    return { mediaId: v.media_id as string, caption: v.caption as string };
  }

  // El archivo (hasta ~7 MB) solo se lee cuando hay que subirlo, no en cada envío.
  const { data: arch } = await db().from('ag_wa_videos').select('contenido').eq('clave', clave).single();
  if (!arch?.contenido) { console.error('[WA-Video] sin archivo guardado para', clave); return null; }
  const mime = (v.mime as string) || 'video/mp4';
  const form = new FormData();
  form.append('messaging_product', 'whatsapp');
  form.append('type', mime);
  form.append('file', new Blob([hexABytes(arch.contenido as string).buffer as ArrayBuffer], { type: mime }), `${clave}.mp4`);
  const res = await fetch(`https://graph.facebook.com/v20.0/${SUPPORT_PHONE_NUMBER_ID}/media`, {
    method: 'POST', headers: { Authorization: `Bearer ${WA_TOKEN}` }, body: form,
  });
  const j = await res.json().catch(() => ({})) as Record<string, unknown>;
  if (!res.ok || !j.id) { console.error('[WA-Video] subida a Meta falló:', clave, res.status, JSON.stringify(j)); return null; }

  const ahora = new Date().toISOString();
  await db().from('ag_wa_videos').update({ media_id: j.id, media_subido_at: ahora, updated_at: ahora }).eq('clave', clave);
  return { mediaId: j.id as string, caption: v.caption as string };
}

/**
 * Manda un video al conductor, salvo que ya se lo hayamos mandado esta semana.
 * Siempre va DESPUÉS del texto que lo acompaña: si la subida a Meta tarda unos
 * segundos (una vez cada 25 días), la persona ya tiene su respuesta mientras tanto.
 */
async function sendSupportVideo(phone: string, clave: VideoClave, motivo: string): Promise<boolean> {
  try {
    const desde = new Date(Date.now() - VIDEO_NO_REPETIR_MS).toISOString();
    const { data: previo } = await db().from('ag_wa_video_envios')
      .select('id').eq('wa_phone', phone).eq('clave', clave).eq('ok', true).gte('enviado_at', desde).limit(1);
    if (previo && previo.length > 0) return false;

    const v = await getVideoMediaId(clave);
    if (!v) return false;

    const r = await sendSupportGraph({ to: phone, type: 'video', video: { id: v.mediaId, caption: v.caption } });
    // Si Meta rechaza el id (lo borró antes de tiempo, o cambió algo del lado de ellos), se
    // olvida para que el próximo envío lo vuelva a subir en vez de fallar para siempre.
    if (!r.ok) await db().from('ag_wa_videos').update({ media_id: null }).eq('clave', clave);
    await db().from('ag_wa_video_envios').insert({
      wa_phone: phone, clave, motivo, ok: r.ok, detalle: r.ok ? null : (r.body ?? '').slice(0, 500),
    });
    return r.ok;
  } catch (e) {
    console.error('[WA-Video] error mandando', clave, e);
    return false;
  }
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
/** Aviso a quien pide el código con el número OCULTO en WhatsApp. (El botón "Recibir por SMS" se quitó de la app el 2026-10-03; antes era el
 *  nombre real del botón en la pantalla del código de la app, anda-gana.component.ts.)
 *  Desde 2026-10-02 la primera opción es escribir el número: el código se le manda con la
 *  plantilla de autenticación al WhatsApp de ESE número (ver enviarCodigoPorPlantilla). Caso
 *  real …199: pidió 4 veces y el SMS nunca le llegó. */
// El prefijo "Tu WhatsApp tiene el número oculto" NO se cambia: se busca con LIKE en el log
// (handleOtpCodeRequest y yaSeLeDijo). Desde 2026-10-03 el código sale solo al WhatsApp del
// número que escribió en la app (ag-otp-send), así que lo primero es decirle dónde buscarlo.
const MSG_CODIGO_NUMERO_OCULTO =
  'Tu WhatsApp tiene el número oculto (nombre de usuario), y por seguridad no puedo mandarte el código a este chat 🔒\n\n' +
  '📲 Si ya escribiste tu número en la app y tocaste *Continuar*, *el código ya te llegó* al WhatsApp de ese número: busca el mensaje de Movi con el botón *"Copiar código"*.\n\n' +
  '👉 Si no lo ves, *escríbeme el número de celular que estás registrando* (10 dígitos) y te lo mando otra vez.';

// ─── Plantilla de autenticación (código con botón "Copiar código") ───────────
// Meta exige una plantilla aprobada de categoría AUTHENTICATION para mandarle un código a un
// número que no nos ha escrito (el número que se está registrando, distinto del chat con el
// número oculto). Solo le llega al dueño de ese número, igual que un SMS: no abre nada nuevo.
const PLANTILLA_OTP = 'movi_codigo_verificacion';
const WABA_ID = '1384359483647396';

/** Crea la plantilla (una vez) o devuelve su estado si ya existe. Solo por la acción admin. */
async function crearPlantillaOtp(): Promise<unknown> {
  const existe = await fetch(`https://graph.facebook.com/v20.0/${WABA_ID}/message_templates?name=${PLANTILLA_OTP}&fields=name,status,category,language,rejected_reason`, {
    headers: { Authorization: `Bearer ${WA_TOKEN}` },
  }).then(r => r.json()).catch(e => ({ error: String(e) }));
  if (Array.isArray((existe as Record<string, unknown>)?.data) && ((existe as Record<string, unknown[]>).data).length > 0) {
    return { ya_existia: true, ...(existe as Record<string, unknown>) };
  }
  const r = await fetch(`https://graph.facebook.com/v20.0/${WABA_ID}/message_templates`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${WA_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: PLANTILLA_OTP, language: 'es', category: 'AUTHENTICATION',
      components: [
        { type: 'BODY', add_security_recommendation: true },
        { type: 'FOOTER', code_expiration_minutes: 10 },
        { type: 'BUTTONS', buttons: [{ type: 'OTP', otp_type: 'COPY_CODE', text: 'Copiar código' }] },
      ],
    }),
  });
  return { creada: r.ok, status: r.status, respuesta: await r.json().catch(() => null) };
}

/** Manda el código con la plantilla al WhatsApp del número (formato 57XXXXXXXXXX). */
async function enviarCodigoPorPlantilla(numero57: string, code: string, desdeSoporte: boolean): Promise<WaResult> {
  const payload = {
    to: numero57, type: 'template',
    template: {
      name: PLANTILLA_OTP, language: { code: 'es' },
      components: [
        { type: 'body', parameters: [{ type: 'text', text: code }] },
        { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: code }] },
      ],
    },
  };
  return desdeSoporte ? sendSupportGraph(payload) : sendGraph(payload);
}

/**
 * SMS de respaldo para el código automático (2026-10-03). ag-otp-send manda el código con la
 * plantilla apenas la persona toca "Continuar" en la app; si Meta lo acepta pero después avisa
 * que NO lo pudo entregar (lo típico: ese número no tiene WhatsApp), llega acá como acuse
 * "failed" y se pide el SMS a ag-otp-send. Una sola vez por envío: la marca "[sms enviado]" en
 * la fila del log, puesta con un update condicionado, evita duplicados si Meta repite el acuse.
 */
async function otpRespaldoSms(wamid: string, motivo: string | null): Promise<void> {
  try {
    const { data: fila } = await db().from('ag_wa_message_log').select('id, wa_phone, body, created_at')
      .eq('wamid', wamid).like('body', '[plantilla movi_codigo_verificacion]%').maybeSingle();
    if (!fila || (fila.body as string).includes('[sms enviado]')) return;
    // Decisión del usuario 2026-10-03: solo WhatsApp. Error 131026 = ese número no tiene
    // WhatsApp -> NO se manda SMS; la app (que consulta el estado del código) le pide un número
    // con WhatsApp. El SMS queda solo para cuando WhatsApp falla por otra razón.
    if (/131026/.test(motivo ?? '')) return;
    // Solo si el código todavía sirve (vence a los 10 min); después ya no ayuda a nadie.
    if (Date.now() - new Date(fila.created_at as string).getTime() > 10 * 60e3) return;
    const { data: marcada } = await db().from('ag_wa_message_log')
      .update({ body: `${fila.body} [sms enviado]` })
      .eq('id', fila.id as number).not('body', 'like', '%[sms enviado]%').select('id');
    if (!marcada?.length) return;   // otro acuse ya lo hizo
    const url = Deno.env.get('SUPABASE_URL')!;
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const r = await fetch(`${url}/functions/v1/ag-otp-send`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, apikey: key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: `+${fila.wa_phone}`, canal: 'sms' }),
    });
    console.log('[WA][otp] plantilla no entregada (', motivo, ') -> SMS de respaldo:', r.status, (await r.text()).slice(0, 200));
  } catch (e) {
    console.error('[WA][otp] error en el SMS de respaldo:', e);
  }
}

/**
 * ¿Ya le dimos esta misma respuesta en los últimos 15 min? Para no repetirle lo mismo a quien
 * sigue sin poder entrar (…9199 recibió el aviso de número oculto 6 veces; …3603 dijo "me has
 * dicho eso cuatro veces hoy"). A la segunda, en vez de repetir, pasa a un asesor.
 */
async function yaSeLeDijo(phone: string, prefijo: string): Promise<boolean> {
  const { data } = await db().from('ag_wa_message_log').select('id')
    .eq('wa_phone', normWaPhone(phone)).eq('direction', 'out').like('body', `${prefijo}%`)
    .gte('created_at', new Date(Date.now() - 15 * 60e3).toISOString()).limit(1).maybeSingle();
  return !!data;
}

async function handleOtpCodeRequest(
  fromPhone: string,
  msgText: string,
  isSupportNumber: boolean,
): Promise<boolean> {
  const t = normalizarTexto(msgText);
  if (!t) return false;

  // Número oculto que, después del aviso de arriba, nos escribe su celular ("Mi wsp es
  // 3115979824"). Caso real …471: el bot le respondió sobre contraseñas. Por seguridad el código
  // NO se manda a este chat (no hay forma de comprobar que es el dueño de ese número); se le
  // repite la salida real en vez de dejarlo sin respuesta. Solo si en los últimos 30 min se le
  // dio el aviso, para no secuestrar otra conversación donde alguien dé un número.
  // Celular escrito: colombiano (3XXXXXXXXX) o, desde 2026-10-03, venezolano (0414…, 414…).
  const limpioNum = msgText.replace(/[\s.()-]/g, '');
  const escritoCo = limpioNum.match(/(?:^|\D)(3\d{9})(?:\D|$)/);
  const escritoVe = escritoCo ? null : limpioNum.match(/(?:^|\D)0?(4(?:1[246]|2[246])\d{7})(?:\D|$)/);
  if (isBsuid(fromPhone) && (escritoCo || escritoVe)) {
    const { data: avisoReciente } = await db().from('ag_wa_message_log').select('id')
      .eq('wa_phone', fromPhone).eq('direction', 'out')
      .like('body', 'Tu WhatsApp tiene el número oculto%')
      .gte('created_at', new Date(Date.now() - 30 * 60e3).toISOString())
      .limit(1).maybeSingle();
    if (avisoReciente) {
      const responderOculto = async (texto: string) => {
        if (isSupportNumber) await sendSupportText(fromPhone, texto);
        else                 await sendText(fromPhone, texto);
      };
      // `diez` es como la persona reconoce su número (3001234567 / 04141234567).
      const diez = escritoCo ? escritoCo[1] : `0${escritoVe![1]}`;
      const telE164 = escritoCo ? `+57${escritoCo[1]}` : `+58${escritoVe![1]}`;

      // Mismo candado que el camino normal: solo si ESE número tiene un registro en curso
      // pedido desde la app en los últimos 30 min. Y tope de intentos, para que nadie use esto
      // para llenarle de mensajes el WhatsApp a otra persona.
      const desde30 = new Date(Date.now() - 30 * 60e3).toISOString();
      const desde10 = new Date(Date.now() - 10 * 60e3).toISOString();
      const [{ data: enCurso }, { count: recientes }] = await Promise.all([
        db().from('ag_otp_codes').select('id').eq('phone', telE164).gte('created_at', desde30).limit(1).maybeSingle(),
        db().from('ag_otp_codes').select('id', { count: 'exact', head: true }).eq('phone', telE164).gte('created_at', desde10),
      ]);
      if (!enCurso) {
        await responderOculto(`No me llega una solicitud desde la app para el *${diez}* 🤔\n\n` +
          `Primero escribe ese número en la app y toca *Continuar*; después escríbeme otra vez el número por acá.`);
        return true;
      }
      if ((recientes ?? 0) >= 5) {
        await responderOculto(`Ya te mandé varios códigos a ese número 🙏 Espera unos minutos y vuelve a intentar desde la app.`);
        return true;
      }

      const code = String(Math.floor(100000 + Math.random() * 900000));
      await db().from('ag_otp_codes').insert({
        phone: telE164, code_hash: await sha256Hex(code), expires_at: new Date(Date.now() + 10 * 60e3).toISOString(),
      });
      const envio = await enviarCodigoPorPlantilla(telE164.slice(1), code, isSupportNumber);
      if (envio.ok) {
        await responderOculto(`✅ Te mandé el código al WhatsApp del *${diez}*.\n\nÁbrelo, toca *"Copiar código"* y pégalo en la app. Vence en 10 minutos.`);
      } else {
        // La plantilla aún no está aprobada por Meta, o falló: la salida de siempre.
        console.error('[WA][otp] plantilla de código falló:', envio.status, envio.body);
        await responderOculto(`No pude mandarte el código al WhatsApp de ese número 😔\n\n` +
          `👉 Vuelve a la app y pide el código otra vez: si WhatsApp no lo entrega en 30 segundos, la app te lo manda por SMS automáticamente.`);
      }
      return true;
    }
  }

  // Escribió el código EN EL CHAT en vez de en la app (caso real 2026-10-01, …213: recibió
  // "397158", lo devolvió por acá y el bot le contestó "Ya te conecto con un asesor"). Solo si
  // son exactamente 6 dígitos y le mandamos un código en los últimos 20 min -- así un pasajero
  // que escribe un precio ("100000") nunca cae acá.
  if (/^\d{6}$/.test(t.replace(/\s/g, ''))) {
    const { data: otpReciente } = await db().from('ag_wa_message_log').select('id')
      .eq('wa_phone', fromPhone).eq('direction', 'out')
      .like('body', '🔐 Tu código de verificación%')
      .gte('created_at', new Date(Date.now() - 20 * 60e3).toISOString())
      .limit(1).maybeSingle();
    if (otpReciente) {
      const texto = `Ese código escríbelo *en la app de Movi*, no aquí 🙂\n\n` +
        `Vuelve a la app, pégalo en la casilla del código y listo. Si ya se venció (dura 10 minutos), pídelo otra vez desde la app.`;
      if (isSupportNumber) await sendSupportText(fromPhone, texto);
      else                 await sendText(fromPhone, texto);
      return true;
    }
  }

  // Dos niveles de detección, a propósito:
  //  - EXPLÍCITA: la frase que la app deja preescrita en el chat. Se atiende siempre.
  //  - GENÉRICA: alguien que lo pide con sus propias palabras ("no me llega el codigo del
  //    registro"). Solo se atiende si de verdad hay un registro en curso para ese número --
  //    si no, se deja pasar al bot normal para no secuestrar una conversación cualquiera.
  const explicita = t.includes('codigo de verificacion');
  // "No me quiere llegar el código" / "no me quiero llegar el conigo" (caso real …848,
  // 2026-10-02): la persona dice que el código no le llega y el bot le daba consejos genéricos
  // ("revisa tu señal"). Si el número tiene un registro en curso, se le manda el código acá
  // mismo -- es su propio WhatsApp, tan seguro como el botón de la app.
  const noLeLlega = /(codigo|conigo|codgo|cogido|clave|sms|mensaje)/.test(t)
                 && /no (me )?(quiere |quiero |ha |han |esta |le )?(llega|llego|llegar|lleg|sale|salio|entra)/.test(t);
  const generica  = noLeLlega || /(codigo|clave)/.test(t)
                 && /(verific|registr|ingres|entrar|acced|acces|activar|sms|no me lleg|no lleg|nunca lleg)/.test(t);
  // Cualquier mención del código (2026-10-03, caso real …3603: "Necesito el codigo a este wsp
  // business" no calzaba con nada y el bot le contestó otra cosa, aunque SÍ tenía una solicitud
  // pendiente). Solo se atiende si hay solicitud pendiente para ese número (ver más abajo); si
  // no, sigue al bot normal como antes.
  const mencionaCodigo = /(codigo|conigo|codgo|cogido|clave)/.test(t);
  if (!explicita && !generica && !mencionaCodigo) return false;
  // "Ya me llegó el código, gracias" menciona el código pero no lo pide: no mandar otro.
  if (!explicita && !generica && /(ya (me )?(llego|lleg|entre|pude|funciono|sirvio)|gracias|listo)/.test(t)) return false;

  // El log lo hacen sendText()/sendSupportGraph() por dentro. Antes se llamaba
  // logWaMessage() otra vez acá, así que cada código de verificación aparecía DOS
  // veces en ag_wa_message_log -- el mensaje salía una sola vez (verificado por los
  // timestamps: las dos filas caen con 3-13 ms de diferencia), pero el log hacía
  // pensar que al conductor le llegaba duplicado. Mismo tipo de engaño que el
  // "[NO ENTREGADO]" que se arregló el 2026-09-02: el log tiene que reflejar lo que
  // de verdad pasó, o las revisiones posteriores salen mal.
  const responder = async (texto: string) => {
    if (isSupportNumber) await sendSupportText(fromPhone, texto);
    else                 await sendText(fromPhone, texto);
  };

  // Un BSUID no es un número de teléfono (ver isBsuid/toE164), así que no hay forma de
  // comprobar que quien escribe es el dueño del número que se está registrando -- y sin esa
  // comprobación no se manda ningún código. Falla cerrado, a propósito.
  //
  // Texto reescrito 2026-10-01 (caso real …471): "WhatsApp no me está compartiendo tu número"
  // sonaba a falla y "escríbeme desde el mismo número" no tenía sentido -- SÍ escribía desde su
  // número, solo que lo tiene OCULTO (nombre de usuario de WhatsApp). Ahora se dice eso, en
  // palabras normales, con las dos salidas reales.
  // Quien sigue sin poder entrar después de una respuesta no recibe la misma otra vez: pasa a
  // un asesor (una sola escalada por conversación en el número de conductores, ver
  // escalateSupportConversation).
  const pasarAAsesor = async () => {
    if (isSupportNumber) {
      await escalateSupportConversation(fromPhone, 'Contacto', `[no le llega el código] ${msgText.slice(0, 200)}`);
      return;
    }
    await responder('Veo que sigues sin poder entrar 😔 Ya le avisé a un asesor y te escribe por acá en un momento.');
    await sendAdminAlert(SUPPORT_PHONE, '🔐 A un pasajero no le llega el código', `${fromPhone}: "${msgText.slice(0, 150)}"`);
  };

  if (isBsuid(fromPhone)) {
    // También con sus palabras ("no me llega el código"), no solo con el mensaje de la app.
    if (!explicita && !noLeLlega) return false;
    if (await yaSeLeDijo(fromPhone, 'Tu WhatsApp tiene el número oculto')) { await pasarAAsesor(); return true; }
    await responder(MSG_CODIGO_NUMERO_OCULTO);
    return true;
  }

  const phone = toE164(fromPhone);

  // SEGUNDA CAPA de la regla "por ahora Movi solo opera en Colombia" (2026-09-10). La primera
  // esta en ag-otp-send, pero es floja a proposito: no puede distinguir un celular de Guadalajara
  // (332...) o de Rosario (341...) de uno colombiano, porque la app ya les puso '+57' encima y
  // borro el codigo de pais real. ACA si se ve -- quien escribe llega con su numero de WhatsApp
  // verdadero (5213329201647, 5491132508643) -- asi que este es el unico punto donde el caso se
  // puede diagnosticar bien.
  //
  // Sin esto respondian "No encuentro un registro en curso para este numero", que es literalmente
  // cierto pero manda a la persona a repetir para siempre algo que nunca le va a funcionar. Los
  // dos casos reales del 2026-09-10 (Mexico y Argentina) salieron justo asi.
  // Desde 2026-10-03 también Venezuela (+58): la app y ag-otp-send ya aceptan sus celulares.
  if (!phone.startsWith('+57') && !phone.startsWith('+58')) {
    if (!explicita) return false;
    await responder(
      'Por ahora Movi funciona con celulares de Colombia 🇨🇴 y Venezuela 🇻🇪\n\n' +
      'Vi que escribes desde un número de otro país, y por eso no puedo enviarte el código: ' +
      'en la app escribe un celular colombiano o venezolano.\n\n' +
      '¡Gracias por el interés! Cuando lleguemos a tu país te esperamos 🙌',
    );
    return true;
  }

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
    // "No me llega el código" también recibe el paso a paso (no consejos genéricos de señal).
    if (!explicita && !noLeLlega) return false;
    if (await yaSeLeDijo(fromPhone, 'Todavía no me llega tu solicitud')) { await pasarAAsesor(); return true; }
    // Texto 2026-10-02: el botón se llama ahora "Recibir código por WhatsApp", y el orden se
    // dice paso a paso -- los casos reales (…459, …936) mandaron este mensaje ANTES de poner su
    // número en la app (probablemente un borrador guardado de un intento anterior).
    await responder(
      'Todavía no me llega tu solicitud desde la app 🤔\n\n' +
      '1️⃣ Abre la app Movi y escribe *este mismo número* de celular.\n' +
      '2️⃣ Toca *Continuar*.\n' +
      '3️⃣ En la pantalla del código toca *"Recibir código por WhatsApp"*.\n\n' +
      'Ahí te llega el código al instante. Por seguridad solo se le envía al dueño del número.',
    );
    return true;
  }

  const code      = String(Math.floor(100000 + Math.random() * 900000));
  const hash      = await sha256Hex(code);
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

  // CAMBIO 2026-10-02: ya NO se borran los códigos vigentes antes de emitir uno nuevo. Antes,
  // pedirlo dos veces anulaba el primero y quien escribía ese primer código recibía "Código
  // incorrecto" (…224, …619). ag-otp-verify ahora acepta cualquiera vigente; acá solo se limpian
  // los vencidos.
  await db().from('ag_otp_codes').delete().eq('phone', phone).eq('used', false).lt('expires_at', new Date().toISOString());
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

═══ DÓNDE SE DESCARGA LA APP (PREGUNTA MUY FRECUENTE) ═══
- El link oficial y ÚNICO es: ${APP_DOWNLOAD_LINK}
- SIEMPRE que alguien pregunte cómo descargar, dónde bajarla, que no la encuentra, cuál es el logo, o cómo saber cuál es la de verdad -- MANDA EL LINK COMPLETO, tal cual, en el mensaje. Nunca digas solo "búscala en Play Store": hay muchas apps llamadas "Movi" y la gente termina instalando la equivocada o rindiéndose (pasó de verdad con varios conductores).
- En Play Store aparece como *Movi - Transporte Urbano*, del desarrollador TECNOMULTIMEDIA. Es una sola app: la misma sirve para pasajero y para conductor.
- Por ahora solo hay versión de Android. Si alguien pregunta por iPhone/iOS, dilo claro: todavía no hay versión para iPhone.

═══ DÓNDE OPERA MOVI ═══
- Movi funciona en TODA Colombia. Si preguntan por una ciudad concreta, la respuesta es sí.
- Nunca listes ciudades específicas ni prometas cuántos pasajeros o conductores hay en una ciudad -- eso no lo sabes.

═══ CÓMO REGISTRARSE COMO CONDUCTOR ═══
- Se hace desde la app Movi (no desde WhatsApp): entrar a "Quiero ser conductor" y completar 4 pasos -- Datos personales, Documentos de identidad, Licencia, Vehículo. Llenar el formulario toma unos 5 minutos.
- *El PRIMER viaje se puede hacer SIN haber enviado la documentación* -- se puede empezar a trabajar de una. Pero para hacer el SEGUNDO viaje sí hay que haber enviado los documentos. Dilo cuando pregunten cuánto se demora en empezar: se empieza ya, no hay que esperar la revisión para el primer viaje.
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
- Comisión de Movi: 12% fijo. Se CALCULA sobre el valor de cada viaje, pero se DESCUENTA del saldo prepagado de la billetera del conductor, automáticamente. NUNCA digas que se descuenta "del valor de la carrera", "del pago del viaje" ni "de lo que te paga el pasajero": el conductor recibe el 100% de lo que le paga el pasajero, y la comisión sale aparte de su billetera. (Error real del 2026-10-01: el bot le dijo a un lead que se descontaba del valor de cada carrera.)
- El conductor debe tener saldo en su billetera para recibir y aceptar viajes. Para aceptar viajes hay que tener mínimo *$10.000 COP* de saldo. Se guía UN paso a la vez, nunca todo junto: primero descargar la app, después registrarse ("Quiero ser conductor"), después recargar mínimo $10.000, y por último ponerse "En línea". En el PRIMER viaje no se le descuenta nada del saldo; el descuento del 12% empieza desde el SEGUNDO viaje. NUNCA digas que se puede trabajar o aceptar el primer viaje sin saldo o sin recargar (decisión del dueño 2026-10-04). Se recarga por *Nequi, sin comisión*: en la app toca Saldo → Recargar, envía el valor (mínimo $10.000) al Nequi 313 445 3649 y manda la captura del comprobante por este WhatsApp; un asesor carga el saldo completo en pocos minutos. Ya NO se recarga por ePayco, PSE, tarjeta, DaviPlata ni efectivo (si alguien escribe "EPC" o "epayco", explícale que ahora es por Nequi).
- *¿Cuánto se puede ganar?* Sé honesto: depende del tiempo que el conductor tenga disponible y de cuántos servicios acepte -- eso no lo define Movi, lo define él. Lo que sí puedes decirle con certeza es cómo se reparte cada viaje: él cobra el 100% del valor directo del pasajero y Movi solo descuenta el 12% de su billetera. NUNCA inventes un ingreso mensual, diario ni por hora, ni des rangos "estimados": no los sabes.
- *Precio sugerido de un viaje en carro:* arranca en $4.000 y suma alrededor de $1.300 por kilómetro. En la práctica, un viaje típico de ciudad de unos 5 km sale en unos $10.500 (o sea alrededor de $2.000 por kilómetro), y entre más largo el viaje, menos pesa el cobro base. En horas de alta demanda el sugerido sube automáticamente. Es solo un SUGERIDO: el pasajero puede ofrecer otro precio y el conductor puede aceptar o contraofertar.
- *Precio sugerido de un viaje en MOTO (es DISTINTO al de carro, nunca uses el de carro para moto):* arranca en $2.500 y suma alrededor de $960 por kilómetro (mínimo $3.000). Un viaje típico de unos 5 km en moto sale en unos $7.500, o sea alrededor de $1.500 por kilómetro. (Error real del 2026-10-02: a un motero se le respondió con la tarifa de carro.)
- *¿A cómo paga Movi el kilómetro?* (redacción pedida por el dueño, 2026-10-02 -- puedes variar las palabras, NUNCA las cifras): "En un viaje típico de ciudad el kilómetro sale aproximadamente a *$2.000* en carro (y a unos *$1.500* en moto). El valor exacto depende del largo del viaje: entre más kilómetros, el kilómetro sale un poco más económico, porque el cobro de arranque pesa menos. Aun así, Movi sigue siendo *la app más rentable para el conductor*: el pasajero te paga directo a ti y Movi solo descuenta el 12% de tu billetera." Si pregunta solo por moto, da solo la cifra de moto; si pregunta solo por carro, solo la de carro. Si compara con otra app (inDriver, Uber, DiDi), no hables mal de ninguna ni des cifras de ellas: di lo de Movi.
- Si un pasajero cancela DESPUÉS de que el conductor ya aceptó (y ya se cobró la comisión): si el pasajero nunca llegó a abordar el vehículo, la comisión se devuelve automáticamente al saldo del conductor; si el pasajero ya iba a bordo cuando se canceló, el viaje se considera hecho y no hay devolución. Esto no depende de quién cancela, depende de si hubo servicio real (validado con el GPS real del conductor, no solo con un botón).
- Bonos en efectivo por hitos de viajes completados de por vida (no se resetean cada mes). SIEMPRE que hables de los bonos deja claro que el monto de cada bono VA AUMENTANDO a medida que el conductor completa más servicios: al llegar a 10 viajes, $2.000; a 25 viajes, $3.500; a 50 viajes, $6.000; a 100 viajes, $24.000; y de ahí en adelante, $24.000 más cada 100 viajes (200, 300...). No digas que sigue subiendo después de los 100: desde ahí el bono es de $24.000 cada 100.

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
Si preguntan CÓMO SE USA la app, cómo funciona, cómo se trabaja o cómo se reciben viajes -- aunque esté mal escrito o sea muy corto ("como como se utiliza", "y cómo es eso", "cómo se trabaja ahí") -- SIEMPRE "answer" con el paso a paso de "CÓMO FUNCIONA UN VIAJE" de arriba (En línea con GPS, llegan solicitudes, aceptar o contraofertar, recoger, el pasajero paga directo, Movi descuenta el 12% de la billetera; antes de empezar hay que recargar mínimo $10.000 y el primer viaje no descuenta nada). NUNCA escales esto: tienes toda la información. (Error real 2026-10-02: se escaló "Como como se utiliza".)

Frases de cortesía o saludo ("qué pena la hora", "disculpe la hora", "buenas noches", "perdón la molestia") NO son pedidos de viaje: responde con calidez ("¡Tranquilo, aquí estoy a cualquier hora! ¿En qué te ayudo?"). Solo mándalo al número de pasajeros si de verdad pide un viaje o un domicilio. (Error real 2026-10-02: a "Que pena la hora" se le respondió que este número no es para pedir viajes.)

Si preguntan si Movi es confiable, si vale la pena, cuánto se puede ganar en general, o algo similar (no es un reclamo, es duda genuina antes de animarse) -- respóndeles tú mismo, con confianza y calidez, usando lo de arriba: comisión fija transparente del 12%, bonos por hitos de viajes, programa de invitados con 2% de por vida, pasajeros y conductores se califican mutuamente, verificación de identidad en el registro, llamada enmascarada y SOS en cada viaje. Esto NO es motivo para escalar.

═══ SI ESCRIBEN PIDIENDO UN SERVICIO (NO SON CONDUCTORES) ═══
Este número es SOLO soporte a conductores. Si alguien escribe pidiendo un viaje, una carrera, un domicilio, un flete o mandar un paquete -- no es un conductor con una duda, es un cliente que se equivocó de número. NO escales: respóndele tú mismo, con amabilidad, que para pedir viajes o servicios debe escribir al *316 630 2106*, y dale el link directo https://wa.me/573166302106 para que solo tenga que tocarlo. Es una respuesta ("answer"), no una escalada.

═══ QUÉ HACER CUANDO NO SABES ALGO ═══
No toda pregunta de un conductor es sobre la política interna de Movi -- muchas son preguntas generales de trámites/documentos en Colombia que SÍ tienen una respuesta real buscable (ej. "¿qué es el RUNT?", "¿dónde saco la tecnomecánica en Bucaramanga?", "¿cuánto cuesta el SOAT de una moto?", "¿qué pasa si me para un agente de tránsito sin tecnomecánica?"). Para esas, NO escales -- se resuelven con una búsqueda.

Si la pregunta es vaga pero claramente relacionada con seguridad durante un viaje (ej. "¿qué pasa si un pasajero me hace algo?", "¿y si me pasa algo en la calle?") respóndela con la sección SEGURIDAD Y CALIDAD de arriba (botón de SOS, llamada enmascarada) -- no es motivo para escalar, es una pregunta informativa aunque suene alarmante.

Elige exactamente una acción:
- "answer": para todo lo que puedas responder con confianza usando la información de arriba (política y funcionamiento real de Movi).
- "search": para preguntas informativas/factuales que NO son política interna de Movi pero sí tienen una respuesta real y objetiva que se puede buscar (trámites, requisitos legales de tránsito en Colombia, definiciones, precios de mercado, etc.). *NUNCA uses "search" para nada sobre Movi* -- ni la app, ni dónde descargarla, ni en qué ciudades opera, ni sus precios, comisiones o condiciones. Todo eso está arriba. En internet hay OTRAS empresas llamadas "Movi" y buscar termina dando respuestas falsas (pasó de verdad: el bot llegó a mandar a un conductor a instalar una app inexistente y a prometer ciudades que no le constaban). Si es sobre Movi y no está arriba, es "escalate", nunca "search".
- "escalate": SOLO si la persona pide explícitamente hablar con un humano/asesor; es un reclamo o problema puntual de SU cuenta (ej. "me cobraron mal", "un pasajero me trató mal", "perdí un objeto"); reporta una emergencia o situación de seguridad real; o la pregunta no tiene ninguna relación con ser conductor ni con trámites/vehículos. No escales solo porque la pregunta venga informal o mal escrita -- primero intenta "answer" o "search".

Responde SOLO un objeto JSON con estas claves:
- "action": "answer" | "search" | "escalate".
- "answer": tu respuesta en texto plano para WhatsApp (string), SOLO si action="answer". null en los otros dos casos.
- "search_query": SOLO si action="search", una consulta de búsqueda corta y clara en español para encontrar la respuesta (string). null en los otros dos casos.`;

interface FaqDecision { action: 'answer' | 'search' | 'escalate'; answer: string | null; searchQuery: string | null; }

/**
 * Lo que el admin le ha enseñado al bot, listo para pegar al prompt (migración 271).
 *
 * Se inyecta como una sección más de la base de conocimiento, con instrucción explícita de
 * que MANDA sobre lo demás: si el dueño de la operación ya respondió algo, esa es la verdad,
 * no lo que el modelo deduzca. Devuelve '' cuando no hay nada aprendido todavía, así el
 * prompt queda exactamente igual que antes.
 */
async function bloqueAprendido(canal: 'conductor' | 'pasajero'): Promise<string> {
  try {
    const { data, error } = await db().rpc('ag_wa_faq_activas', { p_canal: canal });
    if (error || !Array.isArray(data) || !data.length) return '';
    const lineas = data
      .map((f: Record<string, unknown>) => `P: ${f.pregunta}\nR: ${f.respuesta}`)
      .join('\n\n');
    return `\n\n═══ RESPUESTAS QUE YA DIO EL DUEÑO DE MOVI (MÁXIMA PRIORIDAD) ═══\n` +
      `Estas las respondió personalmente el dueño de la operación ante preguntas reales. ` +
      `Si la pregunta de ahora es igual o muy parecida a alguna de estas, responde con eso ` +
      `("answer"), aunque no aparezca en las secciones de arriba -- son la fuente más ` +
      `confiable que tienes. Si se contradice con algo de arriba, MANDA esto.\n\n${lineas}`;
  } catch (e) {
    console.error('[WA-Support] bloqueAprendido error:', e);
    return '';
  }
}

async function answerDriverFaq(question: string): Promise<FaqDecision> {
  const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!apiKey) return { action: 'escalate', answer: null, searchQuery: null };
  const aprendido = await bloqueAprendido('conductor');
  try {
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        response_format: { type: 'json_object' },
        temperature: 0.3,
        messages: [
          { role: 'system', content: DRIVER_FAQ_SYSTEM_PROMPT + aprendido },
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
        input: `Eres el asistente de soporte de conductores de Movi (app de viajes/domicilios en Colombia), respondiendo por WhatsApp. Un conductor preguntó: "${originalQuestion}"\n\nBusca en internet lo necesario para responderle con información real y actualizada de Colombia.\n\nREGLA ABSOLUTA: esta búsqueda es SOLO para temas generales de Colombia (trámites, SOAT, tecnomecánica, RUNT, normas de tránsito, precios de mercado). NUNCA respondas nada sobre la empresa Movi, su app, dónde descargarla, en qué ciudades opera, sus precios, comisiones o condiciones: en internet hay otras empresas con nombres parecidos ("Movi", "MoviSur", etc.) y confundirlas hace que le demos información FALSA a un conductor real. Si la pregunta resulta ser sobre Movi, responde exactamente y solo: "NO_APLICA". Responde en español de Colombia, corto y directo (máximo 5-6 líneas, es un chat de WhatsApp, no un artículo). No repitas la pregunta ni digas "según mi búsqueda", solo da la respuesta como si ya la supieras. IMPORTANTE: texto plano sin formato Markdown -- nunca uses enlaces tipo [texto](url) ni asteriscos de encabezado; si necesitas citar una fuente, solo el nombre (ej. "según la Policía Nacional"), nunca la URL completa.\n\nConsulta sugerida: ${searchQuery}`,
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
    // El modelo detectó que la pregunta era sobre Movi -- devolver null hace que
    // el caller escale a un humano en vez de soltar una respuesta inventada sobre
    // otra empresa con nombre parecido.
    if (/NO_APLICA/i.test(text)) return null;
    // Red de seguridad por si el modelo igual mete un link Markdown -- en
    // WhatsApp se ve como "[texto](url?utm_source=openai)" literal, feo y
    // roto (no es clickeable). Se deja solo el texto de la cita.
    return text.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
  } catch (e) { console.error('[WA-Support] searchWebAnswer error:', e); return null; }
}

// BUG REAL 2026-09-05: las 6 escaladas que hubo entre el 29 de agosto y el 4 de
// septiembre NUNCA le llegaron al asesor. El aviso se mandaba con sendText(), o sea
// texto libre, y Meta solo entrega texto libre si el destinatario le escribió al bot
// en las últimas 24h -- responde 200 OK igual y lo descarta en silencio. Se cruzaron
// las fechas: en las 6 la ventana estaba cerrada. Seis conductores quedaron esperando
// a un asesor que jamás supo que existían.
// Ahora va por sendAdminAlert(), que arranca con una plantilla aprobada (no depende
// de la ventana de 24h, ver movi_trip_error_alerts) y solo cae al texto libre si
// ninguna plantilla pasa. El pedido del usuario es recibirlas a cualquier hora.
/**
 * Aviso al admin cuando alguien INICIA una conversación -- pedido explícito del
 * usuario 2026-09-05: "quiero ir de inmediato a contestar en el chat de
 * publihazclick".
 *
 * Una vez por conversación, no por mensaje: en la última semana entraron 421
 * mensajes de pasajeros y 54 de conductores, y un aviso por cada uno se vuelve
 * ruido que se deja de mirar a los dos días. El corte de 24h lo lleva la base
 * (ag_wa_claim_conversation_alert, migración 267) con un reclamo atómico, porque
 * dos mensajes seguidos entran como dos invocaciones simultáneas de esta función.
 *
 * Va por la plantilla aprobada, no por texto libre: el admin puede llevar días sin
 * escribirle al bot y fuera de la ventana de 24h Meta descarta el texto en silencio
 * -- que es justo lo que dejó 6 escaladas sin llegar. El usuario lo quiere "a
 * cualquier hora".
 *
 * Best-effort de punta a punta: si algo falla acá, el conductor o pasajero igual
 * recibe su respuesta normal. Nunca debe tumbar la conversación.
 */
// ─── Número OCULTO en WhatsApp (migración 309, 2026-10-04) ──────────────────────────────────────
// Pedido del usuario: que todo aviso a su WhatsApp traiga el celular de la persona. Quien activa el
// "nombre de usuario" de WhatsApp llega con un BSUID ("CO.1749…") y Meta NO da su número: la única
// forma de tenerlo es pedírselo. Se le pide una vez cada 24 h hasta que lo dé (después de responderle
// lo que preguntó, nunca antes), se guarda en ag_wa_celular_oculto y se le avisa al admin.

/** Lo que se muestra en los avisos: el número, el que dio por el chat, o "número oculto" dicho claro. */
async function telefonoParaAdmin(phone: string): Promise<string> {
  if (!isBsuid(phone)) return toE164(phone);
  const { data } = await db().from('ag_wa_celular_oculto').select('celular').eq('bsuid', phone).maybeSingle();
  return data?.celular
    ? `${data.celular} (lo dio por el chat; su WhatsApp tiene el número oculto)`
    : `número oculto en WhatsApp (${phone}) — ya le pedí su celular`;
}

/** "300 123 4567", "+57 300…", "57300…", Venezuela "+58 412…" -> E.164; null si no es solo un celular. */
function celularEscrito(texto: string): string | null {
  const t = texto.trim();
  if (!/^[\s+\d().-]{10,22}$/.test(t)) return null;
  const d = t.replace(/\D/g, '');
  if (/^3\d{9}$/.test(d)) return `+57${d}`;
  if (/^573\d{9}$/.test(d)) return `+${d}`;
  if (/^584(1[246]|2[246])\d{7}$/.test(d)) return `+${d}`;
  return null;
}

async function capturarCelularOculto(fromPhone: string, msgText: string, isSupportNumber: boolean, waName: string): Promise<boolean> {
  if (!isBsuid(fromPhone)) return false;
  const celular = celularEscrito(msgText);
  if (!celular) return false;
  // Solo si se lo pedimos (así un número suelto, p. ej. el de otra persona, no se toma por el suyo).
  const { data: fila } = await db().from('ag_wa_celular_oculto').select('pedido_at').eq('bsuid', fromPhone).maybeSingle();
  if (!fila?.pedido_at) return false;
  await db().from('ag_wa_celular_oculto').update({ celular, dado_at: new Date().toISOString() }).eq('bsuid', fromPhone);
  const texto = `¡Gracias! 🙌 Guardé tu número ${celular.replace(/^\+57/, '')}. Si hace falta te llamamos ahí.`;
  if (isSupportNumber) await sendSupportText(fromPhone, texto); else await sendText(fromPhone, texto);
  const nombre = (await lookupRealFirstName(fromPhone)) || cleanDisplayName(waName) || 'Sin nombre';
  const detalle = `${nombre} (${isSupportNumber ? 'chat de CONDUCTORES' : 'chat de PASAJEROS'}) tiene el número oculto en WhatsApp ` +
    `(${fromPhone}) y nos dio su celular: ${celular}. Llámalo o escríbele: wa.me/${celular.replace('+', '')}`;
  await sendAdminAlert(SUPPORT_PHONE, '📱 Celular de un usuario con número oculto', detalle);
  await db().from('ag_admin_notifications').insert({ type: 'admin_info', title: '📱 Celular de un usuario con número oculto', body: detalle });
  return true;
}

async function pedirCelularSiOculto(fromPhone: string, isSupportNumber: boolean): Promise<void> {
  try {
    if (!isBsuid(fromPhone)) return;
    const { data: fila } = await db().from('ag_wa_celular_oculto').select('celular, pedido_at').eq('bsuid', fromPhone).maybeSingle();
    if (fila?.celular) return;
    if (fila?.pedido_at && Date.now() - new Date(fila.pedido_at as string).getTime() < 24 * 3600e3) return;
    await db().from('ag_wa_celular_oculto').upsert({ bsuid: fromPhone, pedido_at: new Date().toISOString() }, { onConflict: 'bsuid' });
    const texto = `📱 Una cosa más: tu WhatsApp tiene el número *oculto* y no lo podemos ver. ` +
      `Escríbeme tu número de celular (ej: 300 123 4567) para poder llamarte si hace falta` +
      `${isSupportNumber ? '' : ' (por ejemplo, el conductor cuando llegue por ti)'}.`;
    if (isSupportNumber) await sendSupportText(fromPhone, texto, 'sistema'); else await sendText(fromPhone, texto, 'sistema');
  } catch (e) { console.error('[WA] pedirCelularSiOculto:', e); }
}

async function notifyAdminNewConversation(
  phone: string,
  role: 'conductor' | 'pasajero',
  waProfileName: string,
  firstMessage: string,
): Promise<void> {
  try {
    const { data: claimed, error } = await db().rpc('ag_wa_claim_conversation_alert', {
      p_phone: phone, p_role: role,
    });
    if (error) { console.error('[WA] claim conversation alert:', error); return; }
    if (!claimed) return; // ya se avisó por esta conversación en las últimas 24h

    const { data: info } = await db().rpc('ag_wa_contact_summary', { p_phone: phone });
    const c = (info ?? {}) as Record<string, unknown>;

    const nombre = (c.nombre as string) || cleanDisplayName(waProfileName) || 'Sin nombre registrado';
    const partes: string[] = [nombre, await telefonoParaAdmin(phone)];

    if (c.encontrado) {
      if (c.es_conductor) {
        const estado = c.estado === 'quick' ? 'sin documentos aún'
          : c.estado === 'approved' ? 'aprobado'
          : c.estado === 'pending_docs' ? 'le faltan documentos'
          : String(c.estado ?? 'estado desconocido');
        partes.push(`conductor ${estado}`);
        if (c.vehiculo) partes.push(`${c.vehiculo}${c.placa ? ` ${c.placa}` : ''}`);
      } else {
        const v = Number(c.viajes ?? 0);
        partes.push(v > 0 ? `pasajero con ${v} viaje${v === 1 ? '' : 's'}` : 'pasajero sin viajes aún');
      }
      if (c.ciudad) partes.push(String(c.ciudad));
    } else {
      partes.push('NO está registrado en Movi');
    }

    const texto = (firstMessage ?? '').trim();
    if (texto) partes.push(`dijo: "${texto.slice(0, 120)}"`);
    partes.push('respóndele en publihazclick.com/admin/anda-gana');

    const contexto = role === 'conductor'
      ? '💬 Chat nuevo — soporte a CONDUCTORES'
      : '💬 Chat nuevo — soporte a PASAJEROS';

    // tplParam() aplana los saltos de línea (Meta rechaza con 400 las variables que
    // los traigan), así que el detalle se arma con separadores en una sola línea.
    await sendAdminAlert(SUPPORT_PHONE, contexto, partes.join(' · '),
      `${contexto}\n\n${partes.join('\n')}`);
  } catch (e) {
    console.error('[WA] notifyAdminNewConversation error:', e);
  }
}

/** Saca el id del mensaje (wamid) de la respuesta cruda de Meta. */
function wamidDe(res: WaResult): string | null {
  try {
    const j = JSON.parse(res.body ?? '{}');
    return (j?.messages?.[0]?.id as string) ?? null;
  } catch { return null; }
}

async function escalateSupportConversation(phone: string, name: string, lastMessage: string): Promise<void> {
  // UNA escalada por conversación (2026-10-02, caso real …199): un lead con el código trabado
  // escribió "?", "🤔" y su nombre, y cada mensaje volvió a decir "Ya te conecto con un asesor",
  // le mandó otro aviso al admin y dejó otra pregunta "pendiente" de basura. Si ya se escaló en
  // las últimas 2 h: nada de eso se repite; como mucho, un recordatorio corto cada 15 min.
  const previa = await getSupportSession(phone);
  const escaladaAt = previa?.escalated && previa.escalated_at ? new Date(previa.escalated_at as string).getTime() : 0;
  if (escaladaAt && Date.now() - escaladaAt < 2 * 3600e3) {
    const { data: ultOut } = await db().from('ag_wa_message_log').select('created_at')
      .eq('wa_phone', phone).eq('role', 'conductor').eq('direction', 'out')
      .order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (!ultOut || Date.now() - new Date(ultOut.created_at as string).getTime() > 15 * 60e3) {
      await sendSupportText(phone, `Sigo pendiente 🙏 Ya le avisé al equipo y te escriben por acá apenas puedan.`);
    }
    return;
  }

  const detalle = `${name} (${phone}): "${lastMessage}" — RESPONDE ESTE MENSAJE con la respuesta y se la mando yo, además la aprendo para la próxima.`;
  await Promise.all([
    upsertSupportSession(phone, { escalated: true, escalated_at: new Date().toISOString() }),
    sendSupportText(phone, 'Ya te conecto con un asesor de Movi 🙌 En un momento te escribe por acá mismo.'),
    (async () => {
      const res = await sendAdminAlert(SUPPORT_PHONE, '🧑‍✈️ Un conductor espera respuesta', detalle,
        `🧑‍✈️ *Movi Conductores* — conversación escalada\n\n${name} (${phone})\n"${lastMessage}"\n\nResponde ESTE mensaje con la respuesta: se la mando yo y la aprendo para la próxima.`);

      // Queda pendiente de enseñanza. El wamid del aviso es lo que permite saber después
      // a CUÁL pregunta está contestando el admin, aunque le lleguen varias seguidas:
      // si responde citando ese mensaje, WhatsApp nos devuelve ese mismo id (migración 271).
      try {
        await db().from('ag_wa_faq_aprendido').insert({
          canal:          'conductor',
          pregunta:       lastMessage,
          preguntada_por: phone,
          wamid_aviso:    wamidDe(res),
        });
      } catch (e) { console.error('[WA] no se pudo registrar la pregunta pendiente:', e); }
    })(),
  ]);
}

/**
 * El admin le enseña una respuesta al bot.
 *
 * Corre ANTES del flujo normal, y solo para el número del admin. Devuelve true si consumió
 * el mensaje.
 *
 * CUÁNDO SE TOMA COMO ENSEÑANZA -- el guard importa, porque el admin también usa este mismo
 * número como pasajero de prueba y sería inaceptable tragarse un "quiero un carro":
 *   1. Si CITÓ el aviso de la escalada -> es enseñanza, sin ninguna duda.
 *   2. Si no citó, solo si hay una pregunta pendiente de las últimas 24h Y su sesión de
 *      WhatsApp está en 'idle' (no está en medio de pedir un viaje).
 * Además siempre se confirma qué se guardó y se ofrece deshacer, para que un error del
 * punto 2 se pueda revertir en un toque.
 */
async function maybeHandleAdminTeaching(text: string, quotedId?: string): Promise<boolean> {
  const t = (text ?? '').trim();
  if (!t) return false;

  // Deshacer lo último aprendido: útil justo cuando el bot guardó en la pregunta equivocada.
  const undo = /^(deshacer|borrar|no|mal)$/i.test(t);
  if (undo) {
    const { data: ult } = await db()
      .from('ag_wa_faq_aprendido')
      .select('id, pregunta')
      .eq('estado', 'activa')
      .order('respondida_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!ult) return false;
    await db().rpc('ag_wa_faq_archivar', { p_id: ult.id });
    await sendText(SUPPORT_PHONE, `🗑️ Listo, olvidé lo último que aprendí:\n"${ult.pregunta}"`);
    return true;
  }

  const { data: pend } = await db()
    .from('ag_wa_faq_aprendido')
    .select('id, pregunta')
    .eq('estado', 'pendiente')
    .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
    .order('created_at', { ascending: false })
    .limit(6);
  if (!pend?.length) return false;

  // Sin cita, se exige que no esté en medio de un flujo de viaje.
  if (!quotedId) {
    const ses = await getSession(SUPPORT_PHONE);
    const estado = (ses?.state as string) ?? 'idle';
    if (estado !== 'idle') return false;

    // ── DAÑO REAL 2026-09-30, y por eso este guard existe ──────────────────
    // Con la pauta de Facebook corriendo llegaron 10 leads en una noche y cada uno
    // dejó su pregunta pendiente. `ag_wa_faq_responder` sin cita elige "la más
    // reciente" y le manda el texto a ESA persona. El admin escribió al número de
    // conductores para probar otra cosa ("Hola quiero más información") y el bot lo
    // tomó como la respuesta a un lead: se lo reenvió tal cual a DOS conductores
    // reales (573132326337 y 573104472245) y lo guardó como respuesta aprendida a
    // "¡Hola! Quiero más información" -- o sea, dejó al bot listo para contestarle
    // a los siguientes leads con su propia pregunta.
    //
    // Con UNA sola pregunta pendiente adivinar es razonable. Con varias no lo es:
    // el bot no puede saber a cuál le está contestando, y el costo de equivocarse
    // es escribirle una incoherencia a un cliente real que estamos pagando por
    // atraer. Se pide la cita y no se adivina.
    if (pend.length > 1) {
      await sendText(SUPPORT_PHONE,
        `Tengo *${pend.length} preguntas* esperando respuesta ahora mismo, así que no sé a cuál le estás contestando 🤔\n\n` +
        `*Responde citando* el aviso de la que quieras contestar (deslízalo a la derecha y escribe encima). ` +
        `Así se la mando a la persona correcta.\n\n` +
        `_No mandé nada por si acaso._`);
      return true;
    }

    // Si lo que escribió es prácticamente la misma pregunta, no es una respuesta --
    // es él escribiéndole al bot. Fue exactamente el caso del 2026-09-30.
    const preguntaPend = normalizarTexto((pend[0].pregunta as string) ?? '').replace(/[¡!¿?.,]/g, '').trim();
    const escrito      = normalizarTexto(t).replace(/[¡!¿?.,]/g, '').trim();
    if (preguntaPend && (preguntaPend === escrito || preguntaPend.includes(escrito) || escrito.includes(preguntaPend))) {
      return false;
    }
  }

  const { data: fila } = await db().rpc('ag_wa_faq_responder', { p_respuesta: t, p_wamid: quotedId ?? null });
  const f = Array.isArray(fila) ? fila[0] : fila;
  if (!f) return false;

  // Mandarle la respuesta a quien la estaba esperando, por el número que corresponde.
  if (f.preguntada_por) {
    const paraConductor = f.canal === 'conductor';
    const cuerpo = `${t}\n\n_Movi_`;
    if (paraConductor) await sendSupportText(f.preguntada_por, cuerpo);
    else               await sendText(f.preguntada_por, cuerpo);
    // Se cierra la escalada para que el bot vuelva a atenderlo con normalidad.
    if (paraConductor) await upsertSupportSession(f.preguntada_por, { escalated: false, escalated_at: null });
  }

  await sendText(SUPPORT_PHONE,
    `✅ Se la mandé y la aprendí.\n\n*Pregunta:* ${f.pregunta}\n\n` +
    `De ahora en adelante la respondo yo sin molestarte.\n_Si me equivoqué de pregunta, responde *deshacer*._`);
  return true;
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

// ════════════════════════════════════════════════════════════════════════════
// ─── CAPTACIÓN DE CONDUCTORES (pauta de Facebook Ads) ────────────────────────
//
// POR QUÉ EXISTE ESTE BLOQUE. El 2026-09-30 arrancó una pauta en Facebook para
// atraer conductores de moto y carro. Llegaron 9 leads en una noche y a los 9 el
// bot les contestó "Ya te conecto con un asesor" -- o sea, escaló y se calló.
// Esperaron entre 2 h 26 min y 3 h 50 min a que una persona les escribiera, y lo
// que recibieron fue un saludo genérico con el link de la app.
//
// La causa era sutil: el menú instantáneo de handleSupportConversation solo actúa
// con saludos de <=20 caracteres que calcen exacto contra una lista cerrada. El
// texto que Meta deja preescrito en el botón del anuncio -- "¡Hola! Quiero más
// información" (30 caracteres) -- no calzaba, así que iba a la IA, que sin una
// pregunta concreta devolvía "escalate". El mensaje más frecuente y más valioso
// del negocio caía justo en el único hueco del flujo.
//
// QUÉ HACE. Atiende al lead en segundos, lo califica (moto/carro y año del
// vehículo), le da el discurso que le corresponde, lo lleva a descargar y
// registrarse, y lo empuja si se queda callado (cron ag_wa_lead_followups,
// migración 285). Solo pasa a un humano si de verdad hace falta.
//
// REGLAS QUE NO SE NEGOCIAN:
//  · NUNCA inventar un ingreso (mensual, diario, por hora, ni "estimados"). No se
//    sabe y prometerlo es lo que quema la reputación de una app de transporte.
//    Lo que sí se puede afirmar es cómo se reparte cada viaje.
//  · Si preguntan si es un bot, se dice que sí. Katherine es el nombre del canal
//    de atención, no una persona que se vaya a sostener a costa de mentirle a un
//    conductor que va a notar que le contestan en 2 segundos a las 3 de la mañana.
//  · Un vehículo más viejo que el límite NO se puede registrar. Se dice de frente
//    en vez de dejar que lo descubra después de llenar 4 pasos.
// ════════════════════════════════════════════════════════════════════════════

const LEAD_ASESORA = 'Katherine';

// Años mínimos reales, calculados del mismo límite que usa la app (23 años para
// carro, 17 para moto -- platform_settings). Se dice el AÑO, no "máximo 23 años":
// nadie va a hacer la resta por su cuenta.
function leadAnioMinimo(vehiculo: 'moto' | 'carro'): number {
  return new Date().getFullYear() - (vehiculo === 'moto' ? 17 : 23);
}

async function sendSupportButtons(to: string, bodyText: string, buttons: { id: string; title: string }[], sentBy: WaSentBy = 'bot'): Promise<WaResult> {
  const interactive: Record<string, unknown> = {
    type: 'button',
    body: { text: bodyText },
    action: { buttons: buttons.slice(0, 3).map(b => ({ type: 'reply', reply: { id: b.id, title: b.title.slice(0, 20) } })) },
  };
  return sendSupportGraph({ to, type: 'interactive', interactive }, sentBy);
}

type LeadRow = {
  wa_phone: string;
  paso: string;
  vehiculo: string | null;
  modelo_ok: boolean | null;
  no_insistir: boolean;
  nudges_enviados: number;
  nombre_dado: string | null;
  ultimo_out_at: string | null;
};

async function getLead(phone: string): Promise<LeadRow | null> {
  const { data } = await db()
    .from('ag_driver_leads')
    .select('wa_phone, paso, vehiculo, modelo_ok, no_insistir, nudges_enviados, nombre_dado, ultimo_out_at')
    .eq('wa_phone', phone)
    .maybeSingle();
  return (data as LeadRow | null) ?? null;
}

/**
 * Guarda el avance del lead. `ultimo_in_at` se mueve en CADA mensaje entrante,
 * porque es lo que reinicia el reloj de los recordatorios y lo que mide la ventana
 * de 24h -- si no se moviera, alguien que está conversando activamente recibiría
 * un "¿sigues ahí?" en medio de la charla.
 *
 * `nudges_enviados` vuelve a 0 cuando la persona contesta: los tres toques son por
 * cada silencio, no tres en toda su vida.
 */
async function upsertLead(phone: string, patch: Record<string, unknown>): Promise<void> {
  const { error } = await db().from('ag_driver_leads').upsert(
    { wa_phone: phone, ...patch, updated_at: new Date().toISOString() },
    { onConflict: 'wa_phone' },
  );
  if (error) console.error('[WA-Lead] upsertLead error:', error);
}

/**
 * ¿Este mensaje es un lead de la pauta pidiendo información?
 *
 * Los dos primeros son los textos EXACTOS que Meta deja preescritos en el botón
 * del anuncio -- son el 100% de los leads reales medidos (7 y 2 de 9). El resto
 * cubre a quien escribe con sus propias palabras. Se exige que el mensaje sea
 * corto (<=90) para no confundir una pregunta concreta y larga con un saludo de
 * interés: esa pregunta la responde mejor la IA del FAQ, que tiene todo el detalle.
 */
function esLeadInteresado(texto: string): boolean {
  const t = normalizarTexto(texto).replace(/[¡!¿?.,]/g, '').trim();
  if (!t || t.length > 90) return false;
  if (/(quiero|necesito|me gustaria|megustaria|deseo).{0,20}(mas )?informacion/.test(t)) return true;
  // Sin tilde a propósito: normalizarTexto() ya las quitó antes de llegar acá.
  if (/mas informacion sobre esto/.test(t)) return true;
  // "Me interesa" a secas (2026-10-01): llegó pegado a un "Buenos días" y, sin esto, se escaló a
  // un humano que nadie atendió. En el número de conductores eso es interés en manejar.
  if (/^(me interesa|estoy interesad[oa]|interesad[oa]|me interesa el trabajo|me interesa la oferta)$/.test(t)) return true;
  // "Más información" a secas (2026-10-01): sin el "quiero" no calzaba y se escalaba a un humano.
  if (/^(hola )?(mas |mayor )?(informacion|info)( por favor| porfa| porfavor)?$/.test(t)) return true;
  return /(quiero|deseo|me interesa|como puedo|quisiera).{0,30}(ser|trabajar|manejar|conducir|afiliar|vincular|unirme|inscribir|registrar)/.test(t)
      || /(informacion|info).{0,25}(para|de|como).{0,15}(conductor|trabajar|manejar)/.test(t)
      || /(quiero|me interesa) (trabajar|manejar|conducir)/.test(t);
}

/** Pide explícitamente que no le escribamos más. Se respeta y no se discute. */
function pideNoInsistir(texto: string): boolean {
  const t = normalizarTexto(texto);
  // "no estoy interesado" agregado 2026-10-01: un lead lo escribió dos veces después del último
  // recordatorio, el bot le contestó "Ya te conecto con un asesor" y siguió mandándole recordatorios.
  return /(no me escrib|no escrib|dejen de escrib|no me interesa|ya no me interesa|no estoy interesad|no estoy interesao|no gracias|no por ahora|ya no quiero|borren mi numero|eliminen mi numero|no quiero nada|stop)/.test(t);
}

/** Pregunta directa de si está hablando con una máquina. Se contesta la verdad. */
/**
 * BUG REAL, encontrado auditando las 54 conversaciones del número de conductores
 * (2026-09-30): sin \b, "es" e "ia" son subcadenas sueltas que aparecen dentro de
 * cientos de palabras normales del español. Un conductor real escribió contándonos
 * dónde iba en su registro -- "...me faltan los datos personal*ES* mios de la
 * licenc*IA*" -- y el bot le respondió "soy el asistente automático 🤖" en vez de
 * ayudarle, porque "es" (de "personales") y "ia" (de "licencia") calzaron dentro
 * de la misma ventana de 20 caracteres. Con \b alrededor de cada palabra, "es" y
 * "ia" solo matchean cuando son palabras sueltas de verdad, no pedazos de otras.
 * Probado contra 15 mensajes reales de conductores que NO preguntaban si era un
 * bot y 10 que sí -- los 25 casos correctos con el arreglo (antes, 1 de los 15
 * fallaba).
 */
function preguntaSiEsBot(texto: string): boolean {
  const t = normalizarTexto(texto);
  return /\b(eres|es|sos|hablo con)\b.{0,20}\b(un |una )?(bot|robot|maquina|inteligencia artificial|ia|chatbot|contestador)\b/.test(t)
      || /\b(eres|sos)\b.{0,12}\b(una )?(persona|humano|humana|real)\b/.test(t)
      || /(con quien hablo|quien me habla|eres real)/.test(t);
}

/** Pide hablar con una persona. */
function pideHumano(texto: string): boolean {
  const t = normalizarTexto(texto);
  // Hacen falta las DOS mitades: "el asesor me dijo que sí" menciona un asesor pero
  // no está pidiendo uno. Las raíces van sin terminación a propósito (atend- cubre
  // atender/atienda/atiendan; pued- cubre puedo/puede/pueden).
  return /(asesor|humano|una persona|con alguien|agente|operador|representante)/.test(t)
      && /(hablar|habla con|comunicar|pasame|pasar|quiero|necesito|pued|atend|atienda|contacto)/.test(t);
}

/**
 * Es un pasajero que se equivocó de número, no un aspirante a conductor.
 *
 * Pasa de verdad y el FAQ ya tiene una regla para redirigirlo al 316 630 2106. El
 * problema es que "quiero un carro" (pidiendo un viaje) también calza con leeVehiculo()
 * como si estuviera diciendo QUÉ MANEJA -- y terminaría recibiendo un discurso para
 * conductores. Este chequeo va primero y le devuelve el mensaje al FAQ, que sabe
 * redirigirlo bien.
 */
function pidiendoServicio(texto: string): boolean {
  const t = normalizarTexto(texto);
  return /\b(un viaje|una carrera|un domicilio|un flete|una mudanza|un servicio|me recojan|me recoja|que me lleve|llevarme|mandar un paquete|enviar un paquete|pedir un)\b/.test(t)
      || /\b(necesito|quiero|puedo pedir|como pido)\b.{0,15}\b(viaje|carrera|domicilio|flete|taxi|transporte)\b/.test(t);
}

/** Interpreta "moto", "tengo carro", "una motico" cuando contesta escribiendo. */
function leeVehiculo(texto: string): 'moto' | 'carro' | 'ninguno' | null {
  const t = normalizarTexto(texto);
  if (/\b(no tengo|todavia no|aun no|ninguno|no cuento con|estoy buscando)\b/.test(t)) return 'ninguno';
  if (/\b(moto|motico|motocicleta|scooter|motorizado)\b/.test(t)) return 'moto';
  if (/\b(carro|auto|automovil|taxi|camioneta|vehiculo|cuatro ruedas)\b/.test(t)) return 'carro';
  return null;
}

/** Interpreta la respuesta al año del vehículo, venga por botón o escrita. */
function leeModelo(texto: string, vehiculo: 'moto' | 'carro'): boolean | null | 'no_se' {
  const t = normalizarTexto(texto);
  const anio = texto.match(/\b(19[89]\d|20[0-4]\d)\b/);
  if (anio) return Number(anio[1]) >= leadAnioMinimo(vehiculo);
  if (/\b(no se|no estoy segur|no sabria|ni idea|no recuerdo)\b/.test(t)) return 'no_se';
  if (/\b(es mas vieja|es mas viejo|mas vieja|mas viejo|antigua|antiguo|vieja|viejo|no)\b/.test(t)) return false;
  if (/\b(si|sip|claro|correcto|nueva|nuevo|reciente|obvio|afirmativo)\b/.test(t)) return true;
  return null;
}

const LEAD_BTN_VEHICULO = [
  { id: 'lead_moto',    title: '🏍️ Moto' },
  { id: 'lead_carro',   title: '🚗 Carro' },
  { id: 'lead_ninguno', title: 'Aún no tengo' },
];

const LEAD_BTN_MODELO = [
  { id: 'lead_modelo_si',   title: 'Sí' },
  { id: 'lead_modelo_no',   title: 'Es más viejo' },
  { id: 'lead_modelo_nose', title: 'No estoy seguro' },
];

// Solo "Ya la descargué" (2026-10-04, pedido del usuario): en el paso de descargar, el botón
// "Tengo una duda" distraía del único paso que importa ahí. Las dudas igual se pueden escribir.
const LEAD_BTN_CIERRE = [
  { id: 'lead_descargo', title: 'Ya la descargué' },
];

/**
 * Primer contacto: se presenta y hace UNA sola pregunta.
 *
 * SIN NOMBRE, a propósito (corrección del usuario, 2026-09-30). El `name` que llega del webhook
 * es el *nombre de perfil de WhatsApp*: lo que cada quien escribió como su nombre visible, que
 * no verifica nadie. Medido sobre los 22 nombres reales guardados en ag_wa_sessions: 12 traen
 * emojis o símbolos, 2 traen números ("edinsonhiguera1988"), y 4 son nombres de negocio o
 * frases ("MODA LANDAZURY", "Spa Belleza Eterna", "Todo Lo Puedo En Cristo"). Con el recorte a
 * la primera palabra eso produce saludos como "¡Hola MODA!", "¡Hola Spa!" o
 * "¡Hola Distinguished!" en el PRIMER mensaje a alguien que estamos pagando por atraer.
 *
 * El número de pasajeros ya tenía esta regla desde el 2026-08-10 y acá se repitió el error.
 * Se sigue GUARDANDO el nombre de perfil en la ficha del lead: como pista para el asesor en la
 * bandeja es útil, y ahí un apodo no hace daño porque nadie se lo dice a la persona.
 */
async function leadSaludar(phone: string, name: string, primerMensaje: string, esDePauta: boolean): Promise<void> {
  // Solo el nombre REAL de la cuenta, si por casualidad ya existe (raro en un lead nuevo).
  const nombre = await lookupRealFirstName(phone);

  await upsertLead(phone, {
    // Se guarda el nombre de perfil CRUDO, no el "limpio": en la bandeja el asesor prefiere ver
    // "MODA LANDAZURY" tal cual (le dice algo) antes que un "MODA" recortado que parece un
    // nombre de pila y no lo es. Acá no se le dice a nadie, así que no hace daño.
    wa_name: (name && name !== 'Usuario') ? name.slice(0, 80) : null,
    origen: esDePauta ? 'pauta' : 'organico',
    primer_mensaje: primerMensaje.slice(0, 500),
    // 'nombre' = se le preguntó cómo se llama y falta su respuesta.
    paso: 'nombre',
    ultimo_in_at: new Date().toISOString(),
    ultimo_out_at: new Date().toISOString(),
    nudges_enviados: 0,
  });

  // Si ya sabemos quién es, no hay nada que preguntar: directo al primer paso (la descarga).
  if (nombre) {
    await leadPrimerPaso(phone, nombre, `¡Hola! 👋 Soy ${LEAD_ASESORA}, del equipo de conductores de Movi.`);
    return;
  }

  // Saludo CORTO a propósito (pedido del usuario 2026-09-30): una sola pregunta, de una
  // palabra, para que la conversación arranque fluida en vez de con un muro de texto. El
  // nombre se pregunta en vez de adivinarlo -- ver la nota de arriba sobre por qué el nombre
  // de perfil de WhatsApp no sirve.
  await sendSupportText(phone,
    `¡Hola! 👋 Soy ${LEAD_ASESORA}, del equipo de conductores de Movi.\n\n` +
    `¿Con quién tengo el gusto? 😊`);
}

/**
 * Lee el nombre de una respuesta libre a "¿con quién tengo el gusto?".
 *
 * Falla cerrado: ante la duda devuelve null y la conversación sigue SIN nombre, que es
 * exactamente el estado de hoy. Nunca hay que insistir ni trabar el embudo por esto -- alguien
 * que viene de un anuncio quiere información, no un interrogatorio.
 */
function leeNombreDado(texto: string): string | null {
  let t = (texto ?? '').trim();
  if (!t || t.length > 40) return null;
  // Un número, un link o una pregunta no son un nombre.
  if (/\d|https?:|[?¿@]/.test(t)) return null;

  // "soy Carlos", "me llamo Carlos", "mi nombre es Carlos", "con Carlos"
  //
  // OJO con el ORDEN de la alternancia: en JavaScript gana la primera que calce, así que
  // "buenas" antes que "buenas tardes" dejaba el resto en "tardes" y el bot terminaba saludando
  // "¡Mucho gusto, Tardes!". Las variantes largas van primero. (Encontrado probando, no en
  // revisión a ojo.)
  t = t.replace(/^\s*(buenas tardes|buenas noches|buenos d[ií]as|buen d[ií]a|buenas|buenos|hola|hey)[\s,]*/i, '');
  t = t.replace(/^\s*(yo\s+)?(soy|me\s+llamo|mi\s+nombre\s+es|me\s+dicen|habla|con)\s+/i, '');

  const limpio = t.replace(/[^\p{L}\p{M}\s'-]/gu, ' ').replace(/\s+/g, ' ').trim();
  if (!limpio) return null;

  const palabras = limpio.split(' ').filter(w => w.length >= 2);
  if (palabras.length === 0 || palabras.length > 4) return null;

  const primera = palabras[0];
  if (primera.length < 3 || primera.length > 15) return null;

  // Palabras que la gente contesta y que NO son su nombre. Si cae acá, se sigue sin nombre.
  if (/^(gracias|claro|listo|bueno|buenas|buenos|vale|ok|si|no|nada|dias|dia|tardes|noches|quiero|necesito|informacion|info|trabajar|manejar|conductor|conductora|moto|carro|taxi|nombre|usuario|amigo|amiga|señor|senor|señora|senora|don|dona|joven|mucho|gusto|igualmente|dime|cuenta|cual|como|que|para|por|del|los|las|una|uno)$/i
        .test(primera.normalize('NFD').replace(/[̀-ͯ]/g, ''))) return null;

  // Capitalizado natural: "CARLOS" y "carlos" se ven mal en un saludo.
  return primera.charAt(0).toUpperCase() + primera.slice(1).toLowerCase();
}

// ─── El embudo, paso a paso (reorganizado 2026-10-01) ─────────────────────────
//
// Pedido del usuario: "lo necesario es ir guiando al usuario sin tantos bloques grandes de
// mensajes largos". Antes, al elegir el vehículo le caían en 13 segundos el discurso (3 viñetas
// + la pregunta del año), el mensaje del link (5 párrafos) y 2 videos, sin que tocara nada en el
// medio. Ahora cada mensaje es corto, pide UNA sola cosa y espera la respuesta:
//
//   1. Saludo                  -> "¿Con quién tengo el gusto?"                     paso 'nombre'
//   2. Dice su nombre          -> "Mucho gusto, X. El primer paso es descargar la
//                                  app 👇 link. Avísame cuando la tengas"  [Ya la descargué]  'pitch'
//   3. "Ya la descargué"       -> video de cómo funciona y cómo registrarse +
//                                  "¿con qué vas a trabajar?"  [Moto/Carro/Aún no tengo]     'descargo'
//   4. Moto / Carro            -> "¿Es modelo X o más nuevo?"  [Sí/Es más viejo/No sé]
//   5. Sí / No sé              -> "Entra a Quiero ser conductor; primer viaje sin papeles;
//                                  al terminar, En línea + GPS."
//
// Los pasos siguen siendo los mismos valores de `ag_driver_leads.paso`, así que no hace falta
// migración: 'pitch' = ya tiene el link y le siguen llegando los recordatorios de "¿alcanzaste a
// descargar?" (ag_wa_lead_followups); 'descargo' = ya avisó y no se le insiste (migración 294).
//
// Lo que se quitó del camino principal (12% de comisión, contraofertar, prueba social) NO se
// perdió: si preguntan, lo contesta el FAQ (DRIVER_FAQ_SYSTEM_PROMPT), que tiene todo el detalle.

/**
 * Va justo después de cada link de descarga del embudo. Texto pedido por el usuario, y recortado
 * por él mismo (2026-10-01): "déjalo hasta donde dice me avisas tan pronto la descargues para irte
 * guiando". El video igual sale cuando avisa (leadYaDescargo); solo no se anuncia aquí.
 *
 * El link de arriba SÍ es clickeable aunque el mensaje lleve botones: la doc de Meta de reply
 * buttons dice del body "URLs are automatically hyperlinked" (verificado 2026-10-01).
 */
const LEAD_AVISAME_DESCARGA = `Me avisas tan pronto la descargues para irte guiando.`;

/**
 * Paso 2: el link de descarga. Es lo PRIMERO que se le da después del nombre (pedido del
 * usuario 2026-10-01: "para iniciar la atención, el primer paso para ser conductor es descargar
 * la aplicación"), y no se le pide nada más en el mismo mensaje.
 *
 * `intro` es la primera línea: "¡Mucho gusto, X! 🙌", o un saludo completo cuando ya sabemos su
 * nombre real y nos saltamos la pregunta.
 */
async function leadPrimerPaso(phone: string, nombre: string | null, intro?: string): Promise<void> {
  // SIN el nombre que nos dio (corrección del usuario, 2026-10-01): la gente escribe más que su
  // nombre y leerlo falla -- "Hola hbla con Jefferson López" terminó en "¡Mucho gusto, Hbla!".
  // El nombre se sigue GUARDANDO (nombre_dado) para identificar al lead en la bandeja; solo no se
  // le repite. El nombre real de la cuenta (lookupRealFirstName) sí se usa, porque ese lo escribió
  // la persona en un campo de nombre al registrarse.
  const primera = intro ?? '¡Mucho gusto! 🙌';
  await sendSupportButtons(phone,
    `${primera}\n\n` +
    // Frase pedida textualmente por el usuario (2026-10-02) para retener la atención. Se le
    // advirtió que es una afirmación comparativa sin datos que la respalden hoy (ver el video
    // "por qué Movi", apagado por cifras que no cuadraban) y decidió dejarla así.
    `Lo primero que quiero que sepas es que *somos la app que mejor paga el kilómetro a los conductores* 💰\n\n` +
    `Para iniciar tu atención, el *primer paso para ser conductor es descargar la app* 👇\n` +
    `${APP_DOWNLOAD_LINK}\n\n` +
    LEAD_AVISAME_DESCARGA,
    LEAD_BTN_CIERRE);
  await upsertLead(phone, {
    ...(nombre ? { nombre_dado: nombre } : {}),
    paso: 'pitch',
    ultimo_out_at: new Date().toISOString(),
    nudges_enviados: 0,
  });
}

/**
 * Paso 3: avisó que ya la descargó. Se le cumple lo prometido (el video) y se le hace la
 * siguiente pregunta, que depende de lo que ya sabemos.
 *
 * La pregunta va ANTES del video y no después: el video pesa y a veces llega unos segundos más
 * tarde, y una pregunta que aparece arriba del video se lee en orden; una que llega después
 * puede quedar escondida.
 */
async function leadYaDescargo(phone: string, lead: LeadRow | null): Promise<void> {
  const v = (lead?.vehiculo === 'moto' || lead?.vehiculo === 'carro') ? lead.vehiculo : null;
  const intro = `¡Eso es! 🙌 Aquí abajo te dejo el video de *cómo funciona y cómo hacer el registro* 🎥`;

  if (!v) {
    await sendSupportButtons(phone, `${intro}\n\nMientras lo ves, dime: *¿con qué vas a trabajar?*`, LEAD_BTN_VEHICULO);
  } else if (lead?.modelo_ok == null) {
    await sendSupportButtons(phone, `${intro}\n\nMientras lo ves, dime: ${preguntaModelo(v)}`, LEAD_BTN_MODELO);
  } else {
    await sendSupportButtons(phone, `${intro}\n\n${LEAD_ENTRA_A_REGISTRARTE}`, LEAD_BTN_REGISTRO);
  }
  await upsertLead(phone, { paso: 'descargo', ultimo_out_at: new Date().toISOString(), nudges_enviados: 0 });
  // Desde 2026-10-01 este es EL momento del tutorial (ya no sale en el link): es lo que se le
  // prometió con "avísame cuando la descargues". Si saliera antes, el tope de 1 por semana de
  // sendSupportVideo lo bloquearía justo aquí.
  await sendSupportVideo(phone, 'como_funciona', 'lead_ya_descargo');
}

function preguntaModelo(v: 'moto' | 'carro'): string {
  return `*¿tu ${v} es modelo ${leadAnioMinimo(v)} o más ${v === 'moto' ? 'nueva' : 'nuevo'}?*`;
}

/**
 * Paso del registro (2026-10-04, pedido del usuario: "que la atención sea muy humanizada y fácil de
 * digerir"). Antes este mensaje mezclaba registrarse + "prende En línea", y la recarga no tenía paso
 * propio. Ahora: SOLO el registro, y se espera a que avise ("Ya me registré"). Después vienen, cada
 * uno en su turno, la recarga (leadYaRegistrado -> leadComoRecargar) y el "En línea" (al aprobarse la
 * recarga, en manejarAprobacionNequi).
 */
const LEAD_ENTRA_A_REGISTRARTE =
  `Ahora sigue el *registro* (toma unos 5 minutos) 📝\n\n` +
  `1. Abre la app Movi.\n` +
  `2. Toca *"Quiero ser conductor"*.\n` +
  `3. Llena tus datos y los de tu vehículo.\n\n` +
  `Tu primer viaje lo puedes hacer *sin subir papeles* 🙌\n\n` +
  `Avísame cuando termines 👇`;
const LEAD_BTN_REGISTRO = [
  { id: 'lead_registrado', title: 'Ya me registré' },
  { id: 'lead_duda',       title: 'Tengo una duda' },
];
const LEAD_BTN_RECARGA = [
  { id: 'lead_como_recargo', title: '¿Cómo recargo?' },
  { id: 'lead_duda',         title: 'Tengo una duda' },
];
const DIJO_YA_ME_REGISTRE = /ya\s+me\s+registr|ya\s+termin[eé]\s+(el\s+|mi\s+)?registro|ya\s+(estoy|qued[eé])\s+registrad|ya\s+llen[eé]\s+(los|mis)\s+datos/i;

/** "Ya me registré": se verifica de verdad (cuenta de conductor con este número) antes de seguir. */
async function leadYaRegistrado(phone: string, lead: LeadRow | null): Promise<void> {
  const { data: u } = await db().from('ag_users').select('id, full_name').eq('phone', toE164(phone)).maybeSingle();
  const { data: d } = u ? await db().from('ag_drivers').select('id, wallet_balance').eq('ag_user_id', u.id).maybeSingle() : { data: null };
  if (!d) {
    await sendSupportButtons(phone,
      `Todavía no me aparece tu registro 🤔\n\n` +
      `Revisa que hayas terminado todos los pasos de *"Quiero ser conductor"* y que te registraste con *este mismo número* de WhatsApp.\n\n` +
      `Cuando termines, toca el botón otra vez 👇`, LEAD_BTN_REGISTRO);
    return;
  }
  await upsertLead(phone, { paso: 'registrado', ultimo_out_at: new Date().toISOString(), nudges_enviados: 0 });
  const nombre = (u?.full_name as string | undefined)?.trim().split(/\s+/)[0] ?? lead?.nombre_dado ?? null;

  // Ya tiene saldo: directo a conectarse.
  if (Number(d.wallet_balance ?? 0) >= 10000) {
    await sendSupportText(phone,
      `¡Bienvenido a Movi! 🎉 Ya tienes saldo, así que estás listo.\n\n${LEAD_PONTE_EN_LINEA}`);
    await leadInvitaYGana(phone);
    return;
  }
  await sendSupportButtons(phone,
    `¡Bienvenido a Movi! 🎉 Ya casi estás listo para recibir viajes.\n\n` +
    `El último paso es *recargar tu saldo*: mínimo *$10.000*. Con eso ya puedes aceptar viajes.\n\n` +
    `Tranquilo: en tu *primer viaje no se te descuenta nada*. Desde el segundo viaje, Movi descuenta el 12% de cada viaje de ese saldo.`,
    LEAD_BTN_RECARGA);
}

/** Cómo recargar, en pasos cortos. La captura la atiende manejarComprobanteNequi. */
async function leadComoRecargar(phone: string): Promise<void> {
  await sendSupportText(phone,
    `Es muy fácil, por *Nequi* y *sin comisión* 💚\n\n` +
    `1. Envía *$10.000* (o más) al Nequi *${NEQUI_RECARGA}*.\n` +
    `2. Mándame *aquí mismo* la captura del comprobante 📸\n\n` +
    `Apenas la reciba, te cargamos el saldo completo en pocos minutos ✅`);
}

/** Último paso, cuando ya tiene saldo: el tropiezo #1 del primer día (En línea + GPS). */
const LEAD_PONTE_EN_LINEA =
  `Ahora abre la app y prende el botón verde *"En línea"* con el *GPS activo*. ` +
  `Así te empiezan a llegar los viajes 🚗💨\n\n` +
  `Déjala abierta o en segundo plano, y acepta los permisos de notificaciones para no perderte ninguno.`;

/**
 * Paso 4: eligió vehículo (por botón o escribiendo). Qué se responde depende de en qué paso
 * está, porque el vehículo puede llegar antes o después de la descarga:
 *  · ya descargó        -> pregunta del año (paso 4 normal).
 *  · tiene el link pero no ha avisado -> se anota y se le recuerda el paso pendiente.
 *  · todavía no tiene el link (leads de antes del cambio, o se adelantó) -> el link.
 */
async function leadElegirVehiculo(phone: string, v: 'moto' | 'carro' | 'ninguno', lead: LeadRow | null): Promise<void> {
  if (v === 'ninguno') { await leadSinVehiculo(phone); return; }
  // modelo_ok se reinicia: la respuesta del año era del vehículo anterior (p. ej. el carro que
  // "era más viejo"), no de este. Sin esto, quien cambia de vehículo se saltaba la pregunta.
  await upsertLead(phone, { vehiculo: v, modelo_ok: null, ultimo_out_at: new Date().toISOString() });
  if (lead) lead = { ...lead, vehiculo: v, modelo_ok: null };

  const paso = lead?.paso;
  if (paso === 'descargo' || paso === 'registrado') {
    const servicios = v === 'moto' ? 'pasajeros y domicilios 🏍️' : 'pasajeros, fletes y viajes entre ciudades 🚗';
    await sendSupportButtons(phone, `Con ${v} haces ${servicios}\n\nUna cosa: ${preguntaModelo(v)}`, LEAD_BTN_MODELO);
  } else if (paso === 'pitch') {
    await sendSupportButtons(phone,
      `Anotado ✅ Me avisas apenas tengas la app descargada y seguimos con el registro.`,
      LEAD_BTN_CIERRE);
  } else {
    await leadPrimerPaso(phone, lead?.nombre_dado ?? null, 'Anotado ✅');
  }
}

/** Paso 5: el año sirve (o no lo sabe). `noSabe` agrega una línea para tranquilizarlo. */
async function leadListoRegistro(phone: string, noSabe: boolean): Promise<void> {
  await sendSupportButtons(phone,
    (noSabe
      ? `Tranquilo, el año lo ves en la tarjeta de propiedad, y si no sirve la app te avisa.\n\n`
      : `¡Perfecto! ✅ `) +
    LEAD_ENTRA_A_REGISTRARTE, LEAD_BTN_REGISTRO);
  // El "gana invitando" ya no va aquí: se le da cuando ya puede trabajar (después de la recarga).
}

/**
 * Cierre del embudo: que comparta su link de invitado (pedido del usuario 2026-10-01).
 *
 * Por qué aquí y con este ángulo: medido ese día, la demanda de pasajeros cayó a ~2
 * solicitudes por semana y los 10 conductores nuevos de la pauta tenían 0 solicitudes vistas.
 * Invitar no es solo ganar el 2% -- cada pasajero que trae es un viaje más que le puede llegar
 * a ÉL. Es verdad y le da una razón propia para compartir. Ni una cifra de ingresos.
 */
async function leadInvitaYGana(phone: string): Promise<void> {
  await sendSupportText(phone,
    `💡 Y algo que muy pocos aprovechan: *ganas invitando*.\n\n` +
    `En la app toca *"Gana Invitando"*, copia tu link y compártelo con familia, amigos y grupos. ` +
    `Te queda el *2% de cada servicio* que haga quien entre con tu link, *de por vida* — sea pasajero o conductor.\n\n` +
    `Y cada pasajero que invitas es un viaje más que te puede llegar a ti 🙌`);
  // Mismo video que en "sin vehículo"; el tope es uno por semana POR video, así que no choca
  // con el tutorial que acaba de recibir.
  await sendSupportVideo(phone, 'invitados', 'lead_cierre_invitar');
}

/** El vehículo no cumple el año mínimo. Se dice de frente y se ofrece la salida real. */
async function leadModeloNoSirve(phone: string, vehiculo: 'moto' | 'carro'): Promise<void> {
  await sendSupportText(phone,
    `Te lo digo de frente 🙏 ${vehiculo === 'moto' ? 'Las motos' : 'Los carros'} se aceptan desde modelo ` +
    `*${leadAnioMinimo(vehiculo)}*; ${vehiculo === 'moto' ? 'más viejas el sistema no las' : 'más viejos el sistema no los'} deja registrar.\n\n` +
    `Pero puedes ganar *sin vehículo*: invitas gente con tu link y te queda el *2% de cada servicio* que hagan, de por vida. Aquí te explico 👇`);
  await upsertLead(phone, { paso: 'sin_vehiculo', vehiculo, modelo_ok: false, ultimo_out_at: new Date().toISOString(), nudges_enviados: 0 });
  // Video (2026-09-30): la salida real que le queda es ganar invitando; el video la hace concreta.
  await sendSupportVideo(phone, 'invitados', 'lead_modelo_no_sirve');
}

/** Todavía no tiene vehículo. Se es honesto y se le deja abierta la otra puerta. */
async function leadSinVehiculo(phone: string): Promise<void> {
  await sendSupportText(phone,
    `Gracias por decírmelo 🙏 Para manejar en Movi necesitas moto o carro (placa de Colombia o Venezuela). ` +
    `Cuando lo tengas, me escribes y seguimos.\n\n` +
    `Mientras tanto puedes ganar *sin vehículo*: invitas gente con tu link y te queda el *2% de cada servicio* que hagan, de por vida. Aquí te explico 👇`);
  await upsertLead(phone, { paso: 'sin_vehiculo', vehiculo: 'ninguno', ultimo_out_at: new Date().toISOString(), nudges_enviados: 0 });
  // Video (2026-09-30): mismo motivo que en leadModeloNoSirve().
  await sendSupportVideo(phone, 'invitados', 'lead_sin_vehiculo');
}

/**
 * Envío programado del embudo a un lead que quedó sin atender (migración 287).
 *
 * Tres versiones del mismo mensaje, y la diferencia importa:
 *  · `recibioError` -> anoche le llegaron mensajes cruzados: el saludo repetido (a uno
 *    de ellos cuatro veces) y además su propia frase devuelta como si fuera una
 *    respuesta de Movi. Se reconoce en una línea, SIN citar la frase.
 *
 *    OJO -- corrección del usuario, 2026-09-30, y tenía razón: la primera versión de
 *    este mensaje citaba "Hola quiero más información" para explicar el error. Esa
 *    frase la escribió LA PERSONA al tocar el botón del anuncio (es el texto que Meta
 *    deja preescrito); que Movi la devolviera fue el error. Citársela la haría leer
 *    "pero eso lo escribí yo" y confundiría más de lo que aclara. Se reconoce el
 *    desorden y punto: la persona vivió mensajes cruzados, no necesita el detalle
 *    técnico de cuál fue cuál.
 *  · `yaContactado` -> ya recibió el saludo manual anoche. Volver a decir "Soy
 *    Katherine, del equipo de conductores de Movi" sonaría a plantilla mal puesta,
 *    así que se retoma la conversación en vez de presentarse de cero.
 *  · ninguno de los dos -> primer contacto normal.
 */
async function leadEmbudoProgramado(phone: string, name: string | null, yaContactado: boolean, recibioError: boolean): Promise<void> {
  // Nunca el nombre de perfil de WhatsApp -- ver la nota larga en leadSaludar(). Solo el nombre
  // real de la cuenta si la persona ya se registró.
  const nombre = await lookupRealFirstName(phone);

  // Si ya sabemos su nombre real, no hay nada que preguntar: al primer paso (la descarga).
  if (nombre) {
    await leadPrimerPaso(phone, nombre,
      `¡Hola! 👋 Soy ${LEAD_ASESORA}, del equipo de conductores de Movi.` +
      (recibioError ? `\n\nDisculpa el desorden de anoche, se nos cruzaron unos mensajes 🙏` : ''));
    return;
  }

  // Saludo CORTO y una sola pregunta, para que la conversación arranque fluida (pedido del
  // usuario 2026-09-30). El nombre se pregunta, no se adivina: el de perfil de WhatsApp casi
  // nunca es el real -- ver la nota en leadSaludar().
  let cuerpo: string;
  if (recibioError) {
    cuerpo =
      `¡Hola! 👋 Te escribí anoche, soy ${LEAD_ASESORA} del equipo de conductores de Movi.\n\n` +
      `Disculpa el desorden de anoche: se nos cruzaron unos mensajes por un error nuestro 🙏\n\n` +
      `Retomemos bien. ¿Con quién tengo el gusto? 😊`;
  } else if (yaContactado) {
    cuerpo =
      `¡Hola! 👋 Te escribí anoche, soy ${LEAD_ASESORA} del equipo de conductores de Movi.\n\n` +
      `Retomo para no dejarte a medias 🙌 ¿Con quién tengo el gusto? 😊`;
  } else {
    cuerpo =
      `¡Hola! 👋 Soy ${LEAD_ASESORA}, del equipo de conductores de Movi.\n\n` +
      `Vi que preguntaste por trabajar con nosotros 🙌 ¿Con quién tengo el gusto? 😊`;
  }

  await sendSupportText(phone, cuerpo);
}

/**
 * Un lead que YA conocemos vuelve a escribir pidiendo información.
 *
 * HUECO REAL, detectado el 2026-09-30 probando en producción: el embudo atendía
 * bien el primer contacto y cada paso, pero si la persona volvía a escribir
 * "quiero más información" cuando su ficha ya estaba en un paso terminal, el
 * mensaje caía al flujo viejo -- que es exactamente el que escalaba a un humano y
 * dejaba al lead esperando horas. O sea: el mismo hueco que este bloque vino a
 * tapar, una vuelta más adelante. Se retoma desde donde quedó, nunca se escala.
 */
async function leadRetomar(phone: string, lead: LeadRow): Promise<void> {
  const v = (lead.vehiculo === 'moto' || lead.vehiculo === 'carro') ? lead.vehiculo : null;

  // Se retoma en el paso donde quedó, con el mismo mensaje corto de ese paso (2026-10-01) --
  // nunca un resumen largo de todo.
  if (lead.paso === 'vehiculo' && v) {
    await sendSupportButtons(phone, `¡Claro! Solo me falta un dato: ${preguntaModelo(v)}`, LEAD_BTN_MODELO);
    return;
  }

  if (lead.paso === 'descargo') {
    if (!v)                         await sendSupportButtons(phone, `¡Claro! 🙌 Para seguir, dime: *¿con qué vas a trabajar?*`, LEAD_BTN_VEHICULO);
    else if (lead.modelo_ok == null) await sendSupportButtons(phone, `¡Claro! 🙌 Para seguir, dime: ${preguntaModelo(v)}`, LEAD_BTN_MODELO);
    else                            await sendSupportText(phone, `¡Claro! 🙌 ¿En qué paso del registro vas? Dime y te ayudo.`);
    return;
  }

  // En 'sin_vehiculo' la pregunta del vehículo es pertinente y no redundante: si vuelve a
  // escribir es muy posible que ya consiguió vehículo, o que el que tenía no era el que pensaba.
  if (lead.paso === 'sin_vehiculo') {
    await sendSupportButtons(phone, `¡Claro que sí! 🙌 Dime: *¿con qué vas a trabajar?*`, LEAD_BTN_VEHICULO);
    return;
  }

  // 'nombre', 'saludado' o 'pitch': el primer paso es la descarga.
  await leadPrimerPaso(phone, lead.nombre_dado ?? null, '¡Claro que sí! 🙌');
}

/**
 * Los tres recordatorios. Cada uno dice algo DISTINTO: repetir el mismo mensaje
 * tres veces es lo que hace que la gente bloquee el número. El tercero avisa que
 * es el último, que es lo que haría cualquier vendedor decente.
 *
 * CAMBIO 2026-09-30: antes, los toques #2 y #3 mandaban el MISMO mensaje genérico
 * a todo el mundo sin importar en qué paso estuviera -- a alguien que nunca dijo
 * si maneja moto o carro le llegaba "te dejo el link" (un link que ni siquiera le
 * correspondía todavía), y a alguien que ya tiene el link en la mano le llegaba lo
 * mismo que a quien no ha contestado nada. Ahora los tres toques distinguen el
 * paso real, igual que ya hacía el primero.
 *
 * Con el link saliendo apenas dice su nombre (ver leadPrimerPaso, 2026-10-01), casi
 * todo el que llega a un recordatorio ya está en 'pitch' -- ahí es donde de verdad
 * importa qué se dice, porque es donde se pierde el 59% de los que sí califican
 * (medido el 2026-09-30). El segundo y tercer toque para 'pitch' atacan los
 * bloqueos reales vistos en las conversaciones (ocupado, no encuentra la app en la
 * tienda, se le olvidó) en vez de repetir el mismo argumento de venta.
 */
async function leadFollowup(phone: string, name: string | null, paso: string, vehiculo: string | null, numero: number): Promise<void> {
  // Nunca el nombre de perfil de WhatsApp -- ver la nota larga en leadSaludar().
  const nombre = await lookupRealFirstName(phone);
  const v = (vehiculo === 'moto' || vehiculo === 'carro') ? vehiculo : null;
  const suyo = v === 'moto' ? 'tu moto' : v === 'carro' ? 'tu carro' : 'tu vehículo';

  if (numero === 1) {
    if (paso === 'nombre') {
      await sendSupportText(phone, `¿Sigues por ahí? 😊 Dime tu nombre y seguimos.`);
    } else if (paso === 'saludado') {
      await sendSupportButtons(phone,
        `¿Sigues por ahí? 😊 Solo dime con qué te vas a mover y te explico lo tuyo en concreto.`,
        LEAD_BTN_VEHICULO);
    } else if (paso === 'vehiculo' && v) {
      await sendSupportButtons(phone,
        `Solo me falta ese dato para saber si podemos arrancar de una: ¿tu ${v} es modelo *${leadAnioMinimo(v)}* o más ${v === 'moto' ? 'nueva' : 'nuevo'}?`,
        LEAD_BTN_MODELO);
    } else {
      // 'pitch': ya tiene el link. Primer toque = suave, sin repetir el link todavía. Con el
      // botón para que avisar sea un toque (2026-10-01).
      await sendSupportButtons(phone,
        `¿Alcanzaste a descargar la app? 😊 Me avisas y te envío el video para seguir.`,
        LEAD_BTN_CIERRE);
    }
    return;
  }

  if (numero === 2) {
    if (paso === 'nombre') {
      await sendSupportText(phone,
        `${nombre ? '' : 'Va en serio: '}con solo tu nombre seguimos -- no hace falta nada más para explicarte lo tuyo. ¿Cómo te llamas? 😊`);
    } else if (paso === 'saludado') {
      await sendSupportButtons(phone,
        `¿Moto o carro? Es la única pregunta que me falta para mandarte el link de una vez.`,
        LEAD_BTN_VEHICULO);
    } else if (paso === 'vehiculo' && v) {
      await sendSupportButtons(phone,
        `¿${suyo} es modelo *${leadAnioMinimo(v)}* o más ${v === 'moto' ? 'nueva' : 'nuevo'}? Con eso te confirmo y sigues de una.`,
        LEAD_BTN_MODELO);
    } else {
      // 'pitch': el segundo toque ataca los bloqueos reales (ocupado, no la encuentra en la
      // tienda), no repite el argumento de venta -- eso ya se lo dijeron al entregarle el link.
      await sendSupportButtons(phone,
        `Si no la encuentras en Play Store, búscala exacto como *"Movi - Transporte Urbano"* 👇\n` +
        `${APP_DOWNLOAD_LINK}`,
        LEAD_BTN_CIERRE);
    }
    return;
  }

  // Tercero y último -- el único momento de verdad urgente de todo el embudo, y es honesto:
  // dentro de poco se cierra la ventana de 24h y Meta deja de entregar texto libre hasta que
  // la persona vuelva a escribir. Se dice así, sin adornos, con una sola acción concreta.
  // 'nombre' cae al else desde 2026-10-01: el siguiente paso tras el nombre ya es el link, así
  // que en el último mensaje se le da directo en vez de pedirle el nombre otra vez.
  if (paso === 'saludado' || (paso === 'vehiculo' && v)) {
    await sendSupportText(phone,
      `Último mensaje mío por hoy, te cuento: ` +
      `en un rato se me cierra la ventana para escribirte gratis por acá, y después tengo que ` +
      `esperar a que tú me vuelvas a escribir.\n\n` +
      `Si quieres seguir, contéstame con qué te vas a mover (moto o carro) y te mando el link ` +
      `de una, así sea rapidito. Si no, no hay problema -- este chat queda abierto para cuando quieras.`);
  } else {
    await sendSupportText(phone,
      `Último mensaje mío por hoy, te cuento: ` +
      `en un rato se me cierra la ventana para escribirte gratis por acá.\n\n` +
      `Te dejo el link una vez más por si te animas ahora:\n${APP_DOWNLOAD_LINK}\n\n` +
      `Y si necesitas algo de Movi más adelante, escríbeme a este mismo chat -- acá quedo.`);
  }
}

/**
 * Atiende al lead si el mensaje le corresponde a este flujo. Devuelve true cuando
 * consumió el mensaje, y false para que siga su curso normal (FAQ con IA, datos de
 * su cuenta, etc.) -- una duda concreta la responde mucho mejor el FAQ, que tiene
 * todo el detalle cargado, y duplicarlo acá sería pedir que se contradigan.
 */
async function maybeHandleDriverLead(phone: string, name: string, msgText: string, btnId?: string): Promise<boolean> {
  const lead = await getLead(phone);
  const ahora = new Date().toISOString();

  // ── Botones del embudo: siempre son de acá ───────────────────────────────
  if (btnId?.startsWith('lead_')) {
    if (btnId === 'lead_moto' || btnId === 'lead_carro' || btnId === 'lead_ninguno') {
      await leadElegirVehiculo(phone, btnId === 'lead_moto' ? 'moto' : btnId === 'lead_carro' ? 'carro' : 'ninguno', lead);
      return true;
    }

    const v = (lead?.vehiculo === 'moto' || lead?.vehiculo === 'carro') ? lead.vehiculo : 'carro';

    // Respuesta al año. Con el link ya entregado se le dice cómo registrarse (paso 5); un lead
    // viejo parado en paso 'vehiculo' (de antes del 2026-10-01) nunca recibió el link, así que
    // a ese se le da el primer paso.
    const yaTieneLink = lead?.paso === 'pitch' || lead?.paso === 'descargo' || lead?.paso === 'registrado';
    if (btnId === 'lead_modelo_si') {
      await upsertLead(phone, { modelo_ok: true });
      if (yaTieneLink) await leadListoRegistro(phone, false);
      else             await leadPrimerPaso(phone, lead?.nombre_dado ?? null, '¡Perfecto! ✅');
      return true;
    }
    if (btnId === 'lead_modelo_no') { await leadModeloNoSirve(phone, v); return true; }
    if (btnId === 'lead_modelo_nose') {
      if (yaTieneLink) await leadListoRegistro(phone, true);
      else             await leadPrimerPaso(phone, lead?.nombre_dado ?? null, 'Tranquilo, el año lo ves en la tarjeta de propiedad 🙌');
      return true;
    }
    if (btnId === 'lead_descargo')    { await leadYaDescargo(phone, lead); return true; }
    if (btnId === 'lead_registrado')  { await leadYaRegistrado(phone, lead); return true; }
    if (btnId === 'lead_como_recargo') { await leadComoRecargar(phone); return true; }
    if (btnId === 'lead_duda') {
      await sendSupportText(phone, `Claro, dime 🙂 Pregúntame lo que quieras sobre requisitos, documentos, pagos o cómo funciona un viaje.`);
      await upsertLead(phone, { ultimo_in_at: ahora, nudges_enviados: 0 });
      return true;
    }
    return false;
  }

  // "Ya me registré" escrito (no solo con el botón).
  if (lead && DIJO_YA_ME_REGISTRE.test(msgText)) { await leadYaRegistrado(phone, lead); return true; }

  // ── Alguien nuevo que llega interesado ───────────────────────────────────
  if (!lead) {
    const interesado = esLeadInteresado(msgText);

    // Un "hola" suelto de alguien DESCONOCIDO, mientras corre la pauta, casi
    // siempre es un lead: nadie escribe al número de conductores por deporte. Pero
    // solo se toma como lead si NO tiene cuenta en Movi -- un conductor que ya
    // trabaja y escribe "hola" buscando soporte no puede caer en un embudo de
    // captación que le pregunte qué vehículo tiene. Esa consulta es la que separa
    // un caso del otro, y por eso solo se hace cuando el mensaje es un saludo pelado.
    let saludoDeDesconocido = false;
    if (!interesado) {
      const pelado = normalizarTexto(msgText).replace(/[¡!¿?.,]/g, '').trim();
      const esSaludoPelado = pelado.length <= 22 &&
        /^(hola|ola|holaa+|buenas|buenos dias|buenas tardes|buenas noches|info|informacion|hey|hi|buen dia|que mas|quiero saber)$/.test(pelado);
      if (esSaludoPelado) saludoDeDesconocido = (await lookupAgUserBasic(phone)) === null;
    }

    if (!interesado && !saludoDeDesconocido) return false;

    // "de pauta" solo si llegó con el texto preescrito del anuncio; si lo escribió
    // con sus palabras es orgánico, y esa diferencia es la que deja medir la pauta.
    const t = normalizarTexto(msgText);
    const esDePauta = /quiero mas informacion|conseguir mas informacion sobre esto/.test(t);
    await leadSaludar(phone, name, msgText, esDePauta);
    return true;
  }

  // ── A partir de acá ya es un lead conocido ───────────────────────────────
  // El reloj de los recordatorios se reinicia con CUALQUIER mensaje suyo, incluso
  // si este flujo no lo va a consumir: si está conversando, no se le empuja.
  await upsertLead(phone, { ultimo_in_at: ahora, nudges_enviados: 0 });

  if (pideNoInsistir(msgText)) {
    await sendSupportText(phone,
      `Entendido, no te escribo más 🙏 Gracias por tomarte el tiempo de decírmelo.\n\n` +
      `Si algún día quieres manejar con Movi, este chat queda abierto.`);
    await upsertLead(phone, { no_insistir: true });
    return true;
  }

  if (preguntaSiEsBot(msgText)) {
    await sendSupportText(phone,
      `Buena pregunta, y te respondo de frente: soy el asistente automático de Movi 🤖 ` +
      `Firmo como ${LEAD_ASESORA} porque así se llama este canal de atención.\n\n` +
      `Resuelvo casi todo al instante a cualquier hora, y si necesitas a una persona del equipo ` +
      `me lo dices y te la paso. ¿Seguimos?`);
    return true;
  }

  if (pideHumano(msgText)) {
    await escalateSupportConversation(phone, name, msgText);
    await upsertLead(phone, { paso: 'humano' });
    return true;
  }

  // Un pasajero equivocado nunca debe recibir el discurso de conductor: se le
  // devuelve el mensaje al FAQ, que sabe mandarlo al número de viajes.
  if (pidiendoServicio(msgText)) return false;

  // Vuelve a pedir información. Se retoma el embudo donde quedó -- JAMÁS se deja
  // caer al flujo viejo, que escalaba a un humano y dejaba al lead esperando horas
  // (comprobado en producción el 2026-09-30: un lead en paso 'sin_vehiculo' que
  // reescribió "quiero más información" recibió "Ya te conecto con un asesor").
  // Si ya se registró, es un conductor de verdad y sus preguntas las contesta el
  // FAQ con sus datos reales, no el embudo de captación.
  if (esLeadInteresado(msgText) && lead.paso !== 'registrado' && lead.paso !== 'humano') {
    // Dos mensajes seguidos ("Buenos días" + "Me interesa", caso real 2026-10-01): si le
    // acabamos de preguntar el nombre hace menos de 2 minutos, el segundo no cambia nada --
    // la pregunta sigue en pie y se espera su respuesta en vez de saltársela.
    const recien = lead.ultimo_out_at && Date.now() - new Date(lead.ultimo_out_at).getTime() < 2 * 60e3;
    if (lead.paso === 'nombre' && recien) return true;
    await leadRetomar(phone, lead);
    return true;
  }

  // ── Respuestas escritas, según el paso (orden del embudo: ver leadPrimerPaso) ──
  const t = normalizarTexto(msgText);
  const corto = msgText.trim().length <= 40;
  const vTexto = leeVehiculo(msgText);
  // "Ya la descargué / ya la instalé / la bajé". Sin `\b` a propósito: raíces truncadas como
  // "descargu" no calzan con \b (lección de los regex de intents del bot). Y con guard de
  // negación: "no la he descargado" o "todavía no la instalo" contienen la raíz y NO son un aviso.
  const negacion = /\b(no|todavia|aun|ni)\b/.test(t);
  const dijoDescargo = !negacion && /descargu|descargad|instal|la baje|ya la tengo/.test(t);
  const conVehiculo = (l: LeadRow): LeadRow =>
    (vTexto === 'moto' || vTexto === 'carro') ? { ...l, vehiculo: vTexto } : l;

  // Paso 1 -> 2: le preguntamos el nombre y está contestando.
  if (lead.paso === 'nombre') {
    // Si en vez del nombre contesta directo con el vehículo ("moto"), no se le insiste: se
    // anota y se sigue al primer paso. Adelantarse es señal de que quiere ir al grano.
    if (vTexto) { await leadElegirVehiculo(phone, vTexto, lead); return true; }
    // Un nombre usable o nada. En los dos casos se avanza -- nunca se vuelve a preguntar.
    await leadPrimerPaso(phone, leeNombreDado(msgText));
    return true;
  }

  // Paso 2 -> 3: tiene el link y avisa que la descargó (escribiendo, sin tocar el botón).
  // 'saludado' es de leads de antes del 2026-10-01, que recibieron la pregunta del vehículo.
  if (lead.paso === 'pitch' || lead.paso === 'saludado') {
    if (dijoDescargo) {
      if (vTexto === 'moto' || vTexto === 'carro') await upsertLead(phone, { vehiculo: vTexto });
      await leadYaDescargo(phone, conVehiculo(lead));
      return true;
    }
    // En 'pitch' un "todavía no" / "aún no" habla de la descarga, no de que no tenga vehículo:
    // por eso ahí solo se toma moto o carro, nunca 'ninguno'.
    if (vTexto && (lead.paso === 'saludado' || (vTexto !== 'ninguno' && corto))) {
      await leadElegirVehiculo(phone, vTexto, lead);
      return true;
    }
    // "ya" / "listo" sueltos solo valen en 'pitch', que es justo cuando se le pidió avisar.
    if (lead.paso === 'pitch' && !negacion && /\b(ya|listo|hecho|la tengo)\b/.test(t)) {
      await leadYaDescargo(phone, lead);
      return true;
    }
    // Se presenta o saluda ("Hola hbla con Jefferson López") sin haber avisado la descarga. Caso
    // real 2026-10-01: al que ya tenía cuenta no se le preguntó el nombre, lo escribió igual, y
    // como no es una pregunta el FAQ lo escaló a un humano. Se le responde y se le recuerda el paso.
    // Saludo suelto ("Buenas tardes") con el link ya en la mano (caso real …957, 2026-10-02): antes
    // caía al menú genérico "Soy el asistente de conductores…" y la conversación parecía empezar de
    // cero con otra persona. Se le contesta como Katherine, en el paso donde va.
    if (lead.paso === 'pitch' && /^(hola|ola|buenas( tardes| noches)?|buenos dias|buen dia|hey|que mas|saludos)$/.test(t.replace(/[¡!¿?.,]/g, '').trim())) {
      await sendSupportButtons(phone,
        `¡Hola! 🙌 ¿Alcanzaste a descargar la app? Me avisas y te envío el video para seguir.\n\n` +
        `Si tienes alguna duda antes, pregúntame con confianza.`,
        LEAD_BTN_CIERRE);
      return true;
    }
    // "Pero deme primero información" se leía como el nombre "Pero" (caso real …346): si el mensaje
    // pide algo, no es un nombre -- va al FAQ, que sí explica cómo funciona.
    const pideAlgo = /\b(informaci[oó]n|info|deme|d[eé]me|quiero|necesito|explica|expl[ií]queme|c[oó]mo|cu[aá]nto|qu[eé]|cu[aá]l|documentos?|requisitos?)\b/i.test(msgText);
    if (lead.paso === 'pitch' && !/[?¿]/.test(msgText) && !pideAlgo && leeNombreDado(msgText)) {
      await sendSupportButtons(phone,
        `¡Mucho gusto! 🙌 Me avisas apenas tengas la app descargada y te envío el video para seguir.`,
        LEAD_BTN_CIERRE);
      return true;
    }
    return false; // Es una duda concreta -> la responde el FAQ, que sabe más.
  }

  // Paso 3 -> 4 -> 5: ya descargó; contesta el vehículo o el año escribiendo. Solo mensajes
  // cortos: una pregunta larga ("no me llega el código para el carro") es para el FAQ, y
  // leeModelo() leería ese "no" como "mi carro es más viejo".
  if (lead.paso === 'descargo' && corto) {
    const v = (lead.vehiculo === 'moto' || lead.vehiculo === 'carro') ? lead.vehiculo : null;
    if (!v && vTexto) { await leadElegirVehiculo(phone, vTexto, lead); return true; }
    if (v && lead.modelo_ok == null) {
      const m = leeModelo(msgText, v);
      if (m === true)    { await upsertLead(phone, { modelo_ok: true }); await leadListoRegistro(phone, false); return true; }
      if (m === false)   { await leadModeloNoSirve(phone, v); return true; }
      if (m === 'no_se') { await leadListoRegistro(phone, true); return true; }
    }
    return false;
  }

  // Lead viejo (de antes del 2026-09-30) parado en 'vehiculo': dijo el vehículo y falta el año.
  // Nunca recibió el link, así que al confirmar se le da el primer paso.
  if (lead.paso === 'vehiculo' && (lead.vehiculo === 'moto' || lead.vehiculo === 'carro')) {
    const m = leeModelo(msgText, lead.vehiculo);
    if (m === true)    { await upsertLead(phone, { modelo_ok: true }); await leadPrimerPaso(phone, lead.nombre_dado, '¡Perfecto! ✅'); return true; }
    if (m === false)   { await leadModeloNoSirve(phone, lead.vehiculo); return true; }
    if (m === 'no_se') { await leadPrimerPaso(phone, lead.nombre_dado, 'Tranquilo, el año lo ves en la tarjeta de propiedad 🙌'); return true; }
    return false;
  }

  return false;
}

// ─── Conversación completa del número de soporte ──────────────────────────────
/** Cómo se recarga la billetera. Medios confirmados por el usuario en su video de recargas. */
const RESPUESTA_COMO_RECARGAR =
  `Se recarga por *Nequi, sin comisión* 💚\n\n${PASOS_RECARGA_NEQUI}\n\n` +
  `Recuerda: en tu *primer viaje no se te descuenta nada*; el descuento empieza desde el segundo viaje.`;

async function handleSupportConversation(phone: string, name: string, msgText: string, btnId?: string): Promise<void> {
  // Foto, audio, sticker o archivo sin texto (2026-10-02, caso real …957): mandó una foto
  // (seguramente de sus documentos) y el bot la escaló a un asesor sin saber qué era. Por acá el
  // bot solo lee texto, y los documentos se suben en la app, así que se le dice eso.
  if (!btnId && !msgText.trim()) {
    await sendSupportText(phone,
      `Recibí tu archivo 📎 pero por este chat solo puedo leer texto.\n\n` +
      `Si son *documentos*, se suben directo en la app, en *"Quiero ser conductor"* (ahí los revisamos). ` +
      `Si tienes una pregunta, escríbemela y te respondo 🙂`);
    return;
  }

  // Captación primero: es el único camino que atiende bien al lead de la pauta, y
  // si no le corresponde el mensaje devuelve false y todo sigue exactamente igual
  // que antes (menú, datos de la cuenta, FAQ con IA, escalada).
  if (await maybeHandleDriverLead(phone, name, msgText, btnId)) return;

  const session = await getSupportSession(phone);

  // Ya escalada a un humano -- el bot se queda callado para no pisar al asesor,
  // salvo que ya pasó el TTL (ver ESCALATION_TTL_MS) y probablemente nadie
  // retomó la conversación.
  //
  // EXCEPCIÓN (2026-10-01): un lead que va en el embudo de captación y NO pidió una persona
  // (paso != 'humano'/'registrado') nunca se deja callado por una escalada. Caso real: "Buenos
  // días" + "Me interesa" llegaron en el mismo segundo, el segundo se escaló, nadie lo atendió,
  // y el bot ignoró 48 h sus mensajes -- "a mí no me sale ni una carrera" y luego "desinstalé eso
  // porque ustedes son puras mentiras". El usuario decidió que con los leads el bot cierra
  // completo y solo escala si piden humano (ver movi_captacion_conductores_pauta).
  if (session?.escalated) {
    const escalatedAt = session.escalated_at ? new Date(session.escalated_at as string).getTime() : 0;
    const lead = await getLead(phone);
    const leadEnEmbudo = !!lead && !['humano', 'registrado'].includes(lead.paso);
    if (!leadEnEmbudo && Date.now() - escalatedAt < ESCALATION_TTL_MS) return;
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
    // Mismo criterio que el número de pasajeros desde el 2026-08-10, que acá nunca se aplicó:
    // NO se saluda con el nombre de perfil de WhatsApp. Ese nombre es lo que cada quien escribió
    // como su nombre visible y no lo verifica nadie -- medido sobre los 22 nombres reales
    // guardados en ag_wa_sessions: 12 traen emojis o símbolos, 2 traen números
    // ("edinsonhiguera1988"), y 4 son nombres de negocio o frases ("MODA LANDAZURY",
    // "Spa Belleza Eterna", "Todo Lo Puedo En Cristo"). Saludar a un conductor como "Hola MODA"
    // o "Hola Spa" hace más daño que no decir ningún nombre.
    // Solo se usa el nombre REAL de la cuenta (el que la persona escribió al registrarse,
    // igual al de su cédula); si no tiene cuenta, se saluda sin nombre.
    const menuText =
      `${greetingOpener(null)} Soy el asistente de conductores de Movi.\n\n` +
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

  // "¿Cómo se usa / cómo funciona / cómo se trabaja?" -- respuesta fija, sin IA (2026-10-02, caso
  // real …848): "cómo se utiliza la aplicación para trabajar" recibió el link de descarga, y
  // "Como como se utiliza" se escaló a un asesor, teniendo toda la información. Va ANTES de la
  // descarga para que gane cuando la pregunta es de USO aunque nombre la "aplicación".
  if (preguntaComoFunciona(msgText)) {
    const reply =
      `Así se trabaja con Movi 🚗🏍️\n\n` +
      `1️⃣ Abre la app y prende el botón verde *"En línea"* con el GPS activo.\n` +
      `2️⃣ Te llegan las solicitudes cercanas con el precio que ofrece el pasajero.\n` +
      `3️⃣ La aceptas, o le haces una contraoferta.\n` +
      `4️⃣ Vas por el pasajero, lo llevas, y *él te paga directo a ti*.\n` +
      `5️⃣ Movi descuenta el 12% de tu billetera (en tu primer viaje no se te descuenta nada).\n\n` +
      `Si aún no te registras: descarga la app 👉 ${APP_DOWNLOAD_LINK} y entra a *"Quiero ser conductor"*.\n\n` +
      `Aquí abajo te dejo un video de 3 minutos donde lo ves todo 👇`;
    await sendSupportText(phone, reply);
    await logSupportInteraction(phone, msgText, 'como_funciona', reply);
    await sendSupportVideo(phone, 'como_funciona', 'faq_como_funciona');
    return;
  }

  // Descarga de la app -- respuesta fija ANTES de la IA. Era la pregunta que más
  // se repetía (4 de 16 conductores) y la que peor se respondía: el bot decía
  // "búscala en Play Store", el conductor contestaba "no la encuentro", y la
  // búsqueda web terminaba inventándose una app que no existe. Con el link fijo
  // no depende de que ningún modelo acierte.
  if (isAppDownloadInquiry(msgText)) {
    const reply = appDownloadReply();
    await sendSupportText(phone, reply);
    await logSupportInteraction(phone, msgText, 'app_download', reply);
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
  // "documentos" suelto ya NO cuenta (2026-10-02, caso real …957): "Que documentos" es preguntar
  // los REQUISITOS, no el estado de los suyos, y recibía "No encuentro ninguna solicitud". Solo
  // consulta su cuenta si habla de SUS documentos o de vencimientos/bloqueo; lo demás va al FAQ.
  const asksDocs     = /vencen|vence|vencimiento|vencid|bloque|no puedo conectar|no me deja conectar|por qu[eé] no puedo|mis documentos|mis papeles|estado de (mis|los) documentos/.test(lower);
  const asksBonus    = /bono|hito|cuantos viajes|cu[aá]ntos viajes|proximo bono|pr[oó]ximo bono/.test(lower);
  const asksReferral = /invit|referid|mi link|codigo de invitaci|c[oó]digo de invitaci|link de invitaci|gano.*(otro|amigo|persona)/.test(lower);
  const needsProfile = asksStatus || asksWallet || asksDocs || asksBonus || asksReferral;
  // Pregunta CÓMO recargar (no solo cuánto tiene): error real del 2026-10-01 -- "¿qué es EPC?
  // ¿cómo se recarga? yo lo que tengo es Nequi" recibió dos veces solo el saldo y "tarjeta o
  // PSE", sin decirle que Nequi sí sirve. Ahora se le explica la recarga completa.
  const comoRecarga = /c[oó]mo.{0,15}recarg|recarg.{0,20}(c[oó]mo|con qu|donde|d[oó]nde)|nequi|neki|daviplata|davi plata|epayco|\bepc\b|efectivo|pse|tarjeta|activar.{0,20}billetera/.test(lower);

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
      } else if (asksWallet && comoRecarga) {
        // Cómo recargar no depende de tener cuenta (encontrado probando 2026-10-01: a un lead
        // sin registro le salía "No encuentro ninguna solicitud" a "¿cómo se recarga? tengo Nequi").
        action = 'wallet:how_to_recharge';
        answerText = RESPUESTA_COMO_RECARGAR;
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
      answerText = comoRecarga
        ? `${RESPUESTA_COMO_RECARGAR}\n\nTu saldo actual es *${fmtCOP(profile.walletBalance)}*.`
        : `Tu saldo actual en la billetera es *${fmtCOP(profile.walletBalance)}* 💰\n\n` +
          `De ahí se descuenta el 12% de comisión de cada viaje (lo que te paga el pasajero es 100% tuyo). ` +
          `Recargas por *Nequi, sin comisión*, desde $10.000: envía el valor al Nequi ${NEQUI_RECARGA} y mándanos la captura por aquí.`;
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
            : 'No hay un próximo bono configurado por ahora.') +
          // Pedido del usuario (2026-10-01): dejar claro que los bonos crecen con los servicios.
          // Montos reales de ag_bonus_milestones (migración 182): suben hasta los 100 viajes y
          // desde ahí son fijos ($24.000 cada 100) -- por eso no se dice que "siempre" suben.
          `\n\n📈 Los bonos *van aumentando* a medida que haces más servicios: ` +
          `$2.000 a los 10, $3.500 a los 25, $6.000 a los 50 y $24.000 a los 100 — ` +
          `y desde ahí, $24.000 más cada 100 servicios.`;
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

    // Videos (2026-09-30), siempre DESPUÉS de la respuesta en texto. Solo cuando la pregunta
    // es justo lo que el video muestra -- "¿cuánto saldo tengo?" no pide un tutorial de
    // recargas, "¿cómo recargo?" sí. Raíces sin \b por la misma razón que los regex de arriba.
    const t = normalizarTexto(msgText);
    if (/recarg|como (pago|se paga|cancelo) la comision|como meto (plata|saldo)|como pongo saldo/.test(t)) {
      // Video de recargas PAUSADO (2026-10-04): muestra el proceso por ePayco, que ya no existe en la app
      // (ahora es solo Nequi) y dice "tu primer viaje no necesita saldo", que ya no se dice. El texto con
      // los pasos de Nequi ya salió arriba. Volver a activarlo cuando haya un video nuevo de Nequi.
    } else if (asksReferral) {
      await sendSupportVideo(phone, 'invitados', 'faq_invitados');
    } else if (/como funciona|como se usa|como (uso|manejo) la (app|aplicacion)|como (recibo|acepto|tomo) (los |un |una )?(viaje|servicio|solicitud|carrera)|como me pongo en linea|como me conecto/.test(t)) {
      await sendSupportVideo(phone, 'como_funciona', 'faq_como_funciona');
    }
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
    // FALSA ALARMA REAL 2026-09-05: este canal dejo de ser solo de errores. Desde la
    // migracion 249 tambien trae los eventos normales en vivo (nueva solicitud, oferta,
    // aceptada, conductor en camino...), los avisos del propio monitor de capacidad, los
    // reportes de push y el aviso de conductores sin notificaciones. TODOS se guardaban
    // como type='trip_error', y la señal 3 de ag_health_check cuenta exactamente esas
    // filas: >=5 en 15 min dispara "revisa Sentry". Resultado: un viaje normal con dos
    // ofertas (1 solicitud + 2 ofertas + aceptada + en camino = 5 filas) disparo la
    // alarma sin que hubiera pasado nada malo -- y peor, un pico de errores de verdad
    // habria quedado indistinguible del trafico normal.
    // Ahora se distingue con data.kind: 'error' lo manda unicamente reportTripError()
    // del frontend; todo lo demas es informativo y se guarda como type='admin_info'.
    if (event === 'error_alert') {
      const contexto = msgData.context ?? 'desconocido';
      const detalle  = msgData.message ?? '';
      const esError  = msgData.kind === 'error';
      // El título es lo que se ve en la notificación del celular sin abrir el chat,
      // así que tiene que decir QUÉ pasó. Solo los fallos reales llevan la marca de
      // error; todo lo demás llega con su nombre propio.
      const titulo = esError ? `⚠️ Error en ${contexto}` : contexto;
      const tplResult = await sendAdminAlert(targetPhone, titulo, detalle, esError
        ? `🔴 *Movi* — Error en el flujo de viaje\n\n📍 Contexto: ${contexto}\n⚠️ ${detalle}`
        : `🔔 *Movi* — ${contexto}\n\n${detalle}`);
      const waResult: WaResult = tplResult;
      try {
        const supabase = db();
        await supabase.from('ag_admin_notifications').insert({
          type:  esError ? 'trip_error' : 'admin_info',
          title: esError ? `Error en flujo de viaje: ${contexto}` : contexto,
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
          titulo,
          // sendAdminAlert() intenta en orden: movi_aviso_admin (encabezado con el
          // título real) -> trip_error_alert (dice "Error" pero llega) -> texto libre.
          // Este es el resultado del intento que finalmente respondió.
          ultimo_intento: { ok: waResult.ok, status: waResult.status, body: (waResult.body ?? '').slice(0, 500) },
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
      // Era el aviso MÁS frecuente al admin (40 de 101) y llegaba con el encabezado
      // "Error en el flujo de viaje". Un registro nuevo es justo lo contrario.
      const waResult = await sendAdminAlert(targetPhone, contexto, detalle,
        `🆕 *Movi* — ${contexto}\n\n${detalle}`);
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
      // `as` elige DESDE cuál de los dos números sale el mensaje. Los dos comparten
      // WABA pero tienen phone_number_id distintos, y para la persona son dos chats
      // separados: responderle a un conductor desde el número de pasajeros llegaría
      // a una conversación que él no reconoce. Lo usa la bandeja del panel admin
      // (ag-admin-action → send_wa_reply). Sin `as`, sale por el de pasajeros, que
      // es el comportamiento que ya tenían todos los llamadores anteriores.
      const comoConductor = (body as Record<string, unknown>).as === 'conductor';

      // Quién está mandando esto (migración 284). Esta misma rama la usan tres cosas
      // distintas y en la bandeja se veían todas iguales:
      //   · la bandeja del panel admin -> una persona escribiendo ('admin', con nombre)
      //   · los avisos de evento que dispara la app (viaje aceptado, conductor llegó…)
      //   · los avisos internos al número del admin (to:'admin')
      // Solo el panel declara `sent_by: 'admin'`; el resto queda como aviso automático,
      // que es lo que son. Nunca al revés: si el panel no lo declarara, una respuesta
      // escrita a mano se vería como si la hubiera dado la automatización.
      const declarado = (body as Record<string, unknown>).sent_by;
      const sentBy: WaSentBy =
        declarado === 'admin' ? 'admin' : (to === 'admin' ? 'alerta' : 'sistema');
      const sentByName = sentBy === 'admin'
        ? (((body as Record<string, unknown>).sent_by_name as string | undefined) ?? null)
        : null;

      const waResult = comoConductor
        ? await sendSupportText(toE164(targetPhone), text, sentBy, sentByName)
        : await sendText(toE164(targetPhone), text, sentBy, sentByName);
      return new Response(JSON.stringify({ sent: waResult.ok, status: waResult.status, error: waResult.ok ? null : (waResult.body ?? '').slice(0, 300) }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({ sent: false, error: 'no text' }), { status: 400 });
  }

  // Acción admin de SOLO LECTURA (2026-10-03, pregunta del usuario "¿cómo y cuándo me cobra Meta?
  // ¿tengo saldo o tarjeta?"): estado de la cuenta de WhatsApp, medio de pago (primary_funding_id:
  // si falta, Meta no deja mandar plantillas pagas) y gasto del mes por categoría. Solo con la
  // llave de servicio (la usan los crons desde el vault); no cambia nada en Meta.
  // La llave del vault puede venir en el formato viejo (JWT) y la del entorno en el nuevo, así
  // que no se comparan como texto: se le pregunta a la base si esa llave ve una tabla protegida
  // (ag_otp_codes tiene RLS sin políticas: con la llave pública devuelve [] y con la de servicio
  // devuelve filas). La usan las acciones admin de abajo.
  const esLlamadaDeServicio = async (): Promise<boolean> => {
    const llave = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    if (!llave) return false;
    const prueba = await fetch(`${Deno.env.get('SUPABASE_URL')}/rest/v1/ag_otp_codes?select=id&limit=1`, { headers: { apikey: llave, Authorization: `Bearer ${llave}` } })
      .then(r => r.ok ? r.json() : []).catch(() => []);
    return Array.isArray(prueba) && prueba.length > 0;
  };
  const noAutorizado = () => new Response(JSON.stringify({ error: 'No autorizado' }), { status: 401 });

  // Plantillas de Meta: crear o consultar (2026-10-03, aviso a quienes no pudieron registrarse).
  if (body._internal_event === 'admin_plantilla') {
    if (!(await esLlamadaDeServicio())) return noAutorizado();
    const nombre = String(body.nombre ?? '');
    if (!/^[a-z0-9_]{3,60}$/.test(nombre)) return new Response(JSON.stringify({ error: 'nombre inválido' }), { status: 400 });
    const consultar = () => fetch(`https://graph.facebook.com/v22.0/${WABA_ID}/message_templates?name=${nombre}&fields=name,status,category,language,rejected_reason,components`, {
      headers: { Authorization: `Bearer ${WA_TOKEN}` },
    }).then(r => r.json()).catch(e => ({ error: String(e) }));
    if (body.accion === 'crear') {
      const ya = await consultar() as { data?: unknown[] };
      if (Array.isArray(ya?.data) && ya.data.length) return new Response(JSON.stringify({ ya_existia: true, ...ya }), { headers: { 'Content-Type': 'application/json' } });
      const cuerpo: Record<string, unknown> = { type: 'BODY', text: String(body.cuerpo ?? '') };
      // Plantillas con variables ({{1}}, {{2}}...): Meta las rechaza sin un valor de ejemplo por variable.
      if (Array.isArray(body.ejemplos) && body.ejemplos.length) cuerpo.example = { body_text: [(body.ejemplos as unknown[]).map(String)] };
      const comps: unknown[] = [cuerpo];
      if (body.pie) comps.push({ type: 'FOOTER', text: String(body.pie) });
      // Botones de respuesta rápida (hasta 3), p. ej. la ayuda de recarga.
      if (Array.isArray(body.botones) && body.botones.length) {
        comps.push({ type: 'BUTTONS', buttons: (body.botones as unknown[]).slice(0, 3).map(t => ({ type: 'QUICK_REPLY', text: String(t).slice(0, 25) })) });
      }
      const r = await fetch(`https://graph.facebook.com/v22.0/${WABA_ID}/message_templates`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${WA_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: nombre, language: String(body.idioma ?? 'es'), category: String(body.categoria ?? 'UTILITY'), components: comps }),
      });
      return new Response(JSON.stringify({ creada: r.ok, status: r.status, respuesta: await r.json().catch(() => null) }), { headers: { 'Content-Type': 'application/json' } });
    }
    return new Response(JSON.stringify(await consultar()), { headers: { 'Content-Type': 'application/json' } });
  }

  // Enviar una plantilla SIN variables a una lista de números. Se niega si la plantilla no está
  // APROBADA o si Meta la clasificó en una categoría distinta de la esperada (así un aviso que
  // debía cobrarse como UTILITY nunca sale como MARKETING sin que nadie lo decida).
  if (body._internal_event === 'admin_enviar_plantilla') {
    if (!(await esLlamadaDeServicio())) return noAutorizado();
    const nombre = String(body.nombre ?? '');
    const esperada = String(body.categoria_esperada ?? 'UTILITY');
    const telefonos = (Array.isArray(body.telefonos) ? body.telefonos : []).map(String).filter(t => /^\d{11,15}$/.test(t));
    const info = await fetch(`https://graph.facebook.com/v22.0/${WABA_ID}/message_templates?name=${nombre}&fields=name,status,category,language`, {
      headers: { Authorization: `Bearer ${WA_TOKEN}` },
    }).then(r => r.json()).catch(() => ({})) as { data?: Array<{ status: string; category: string; language: string }> };
    const tpl = info?.data?.[0];
    if (!tpl || tpl.status !== 'APPROVED' || tpl.category !== esperada) {
      return new Response(JSON.stringify({ enviado: false, motivo: 'plantilla no aprobada o en otra categoría', plantilla: tpl ?? null }), { headers: { 'Content-Type': 'application/json' } });
    }
    const resultados: Array<{ tel: string; ok: boolean; error?: string }> = [];
    for (const tel of telefonos) {
      // como:'conductor' -> sale por el número de CONDUCTORES, para que la respuesta le llegue a
      // ese bot (p. ej. la ayuda de recarga). Sin eso, por el de pasajeros como siempre.
      const r = body.como === 'conductor'
        ? await sendSupportGraph({ to: tel, type: 'template', template: { name: nombre, language: { code: tpl.language } } }, 'sistema')
        : await sendGraph({ to: tel, type: 'template', template: { name: nombre, language: { code: tpl.language } } });
      resultados.push({ tel: tel.slice(-4), ok: r.ok, error: r.ok ? undefined : (r.body ?? '').slice(0, 160) });
      await new Promise(res => setTimeout(res, 250));   // sin ráfagas hacia Meta
    }
    return new Response(JSON.stringify({ enviado: true, categoria: tpl.category, total: telefonos.length, ok: resultados.filter(x => x.ok).length, resultados }), { headers: { 'Content-Type': 'application/json' } });
  }

  // Solicitud nueva -> aviso por WhatsApp a conductores con ventana abierta (lo llama el trigger
  // ag_notify_drivers_on_trip_request, migración 302). Solo con la llave de servicio: sin eso,
  // cualquiera podría hacer que le escribiéramos a los conductores.
  if (body._internal_event === 'alerta_solicitud_conductores') {
    if (!(await esLlamadaDeServicio())) return noAutorizado();
    const r = await alertaSolicitudConductores(String(body.trip_id ?? ''), body.simular === true)
      .catch(e => { console.error('[WA] alertaSolicitudConductores:', e); return { enviados: 0, candidatos: 0 }; });
    return new Response(JSON.stringify(r), { headers: { 'Content-Type': 'application/json' } });
  }

  // Recordatorio al conductor desconectado (lo llama ag_recordar_conectarse, migración 304).
  if (body._internal_event === 'recordatorio_conectarse') {
    if (!(await esLlamadaDeServicio())) return noAutorizado();
    const tels = Array.isArray(body.telefonos) ? (body.telefonos as unknown[]).map(String) : [];
    const n = await recordatorioConectarse(String(body.motivo ?? 'diario'), tels)
      .catch(e => { console.error('[WA] recordatorioConectarse:', e); return 0; });
    return new Response(JSON.stringify({ enviados: n }), { headers: { 'Content-Type': 'application/json' } });
  }

  // Recarga de saldo sin completar -> preguntarle al conductor en qué paso se quedó (migración 307).
  if (body._internal_event === 'ayuda_recarga') {
    if (!(await esLlamadaDeServicio())) return noAutorizado();
    const r = await iniciarAyudaRecarga(String(body.telefono ?? ''))
      .catch(e => { console.error('[WA] iniciarAyudaRecarga:', e); return { ok: false, via: 'error' }; });
    return new Response(JSON.stringify(r), { headers: { 'Content-Type': 'application/json' } });
  }

  if (body._internal_event === 'admin_estado_pago_waba') {
    if (!(await esLlamadaDeServicio())) return noAutorizado();
    const g = (path: string) => fetch(`https://graph.facebook.com/v22.0/${path}`, { headers: { Authorization: `Bearer ${WA_TOKEN}` } })
      .then(r => r.json()).catch(e => ({ error: String(e) }));
    const desde = Math.floor(new Date(new Date().getFullYear(), new Date().getMonth() - 2, 1).getTime() / 1000);
    const hasta = Math.floor(Date.now() / 1000);
    const [cuenta, gasto] = await Promise.all([
      g(`${WABA_ID}?fields=name,currency,timezone_id,account_review_status,business_verification_status,whatsapp_business_manager_messaging_limit`),
      g(`${WABA_ID}?fields=pricing_analytics.start(${desde}).end(${hasta}).granularity(MONTHLY).dimensions(["PRICING_CATEGORY"])`),
    ]);
    return new Response(JSON.stringify({ cuenta, gasto }), { headers: { 'Content-Type': 'application/json' } });
  }

  // Acción admin: crear (o consultar) la plantilla de autenticación del código (2026-10-02). Va
  // protegida con INFORME_KEY (secret del proyecto, el mismo de informe-conductores) y devuelve
  // la respuesta de Meta para poder ver si quedó aprobada.
  if (body._internal_event === 'admin_plantilla_otp') {
    const clave = Deno.env.get('INFORME_KEY') ?? '';
    if (!clave || body.key !== clave) return new Response(JSON.stringify({ error: 'No autorizado' }), { status: 401 });
    return new Response(JSON.stringify(await crearPlantillaOtp()), { headers: { 'Content-Type': 'application/json' } });
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

      // ── Acuses de entrega (migración 286) ────────────────────────────────
      // Meta manda esto al MISMO webhook por cada mensaje que sacamos: sent ->
      // delivered -> read, o failed con el motivo. Hasta hoy se caía por el piso
      // porque solo se miraba `value.messages`, así que era imposible responder
      // "¿le llegó o no?" -- que es justo lo que preguntó el usuario el 2026-09-30
      // sobre las respuestas que mandó desde la bandeja del panel.
      //
      // Los acuses NO vienen en orden garantizado y se repiten; la jerarquía y la
      // protección contra retrocesos están en ag_wa_aplicar_acuse, no acá.
      const statuses = value?.statuses as Array<Record<string, unknown>> | undefined;
      if (statuses?.length) {
        const mapa: Record<string, string> = { sent: 'enviado', delivered: 'entregado', read: 'leido', failed: 'fallido' };
        for (const st of statuses) {
          const estado = mapa[(st.status as string) ?? ''];
          const wamid  = st.id as string | undefined;
          if (!estado || !wamid) continue;
          const ts = st.timestamp ? new Date(Number(st.timestamp) * 1000).toISOString() : new Date().toISOString();
          let motivo: string | null = null;
          if (estado === 'fallido') {
            const errs = st.errors as Array<Record<string, unknown>> | undefined;
            const e = errs?.[0];
            motivo = e ? `${e.code ?? ''} ${e.title ?? ''} ${(e as Record<string, Record<string, unknown>>).error_data?.details ?? ''}`.trim() : 'sin detalle';
            console.error('[WA] mensaje NO entregado:', wamid, motivo);
          }
          await db().rpc('ag_wa_aplicar_acuse', {
            p_wamid: wamid, p_estado: estado, p_ts: ts, p_error: motivo,
          });
          // Código automático que no se pudo entregar (el número no tiene WhatsApp): SMS solo.
          if (estado === 'fallido') await otpRespaldoSms(wamid, motivo);
        }
        return new Response('ok', { status: 200 });
      }

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
        // Cómo se ve en el registro un mensaje que no es texto ("[foto]", "[reacción 👍]"...), y si
        // llegó algo que no sabemos leer (para no responderle como si hubiera mandado un archivo).
        let etiquetaLog = '';
        let sinContenido = false;
        let msgLat: number | undefined;
        let msgLng: number | undefined;
        // ID del boton pulsado (solo en mensajes interactivos). Ver mas abajo por que importa.
        let msgBtnId: string | undefined;
        // ID del mensaje CITADO, cuando alguien responde a un mensaje concreto en vez de
        // escribir suelto. Es la señal exacta que permite saber a cuál de varias preguntas
        // pendientes está contestando el admin cuando le enseña algo al bot (migración 271).
        const msgQuotedId = ((msg.context as Record<string, unknown>)?.id as string) ?? undefined;

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
          // Ademas del titulo, guardar el ID del boton. Los botones de oferta se mandan como
          // accept_offer_<uuid> / reject_offer_<uuid> (ver presentOffer), o sea que cada mensaje
          // sabe de que oferta habla. Antes solo se leia el titulo y ese ID se tiraba a la
          // basura: al tocar "Aceptar" se usaba session.active_offer_id, que guarda unicamente
          // la ULTIMA oferta recibida. Con dos conductores ofertando, el pasajero que subia en
          // el chat y aceptaba la oferta de arriba terminaba aceptando la de abajo, a otro
          // precio y con otro conductor. Detectado el 2026-09-02.
          msgBtnId = ((interactive?.button_reply as Record<string, unknown>)?.id as string)
            ?? ((interactive?.list_reply as Record<string, unknown>)?.id as string)
            ?? undefined;
          // Interactivo que NO es botón ni lista (2026-10-04). Llegaba vacío y el bot contestaba
          // "Recibí tu archivo": pasó como PRIMER mensaje de conductores nuevos (sin nada nuestro
          // antes), así que viene de afuera (p. ej. un anuncio). Si es un formulario (nfm_reply)
          // se leen sus respuestas; si no, se guarda el tipo y un trozo del contenido para saber
          // qué es, y se le responde como a un saludo en vez de hablarle de archivos.
          if (!msgText && !msgBtnId) {
            const sub = String(interactive?.type ?? 'desconocido');
            const nfm = interactive?.nfm_reply as Record<string, unknown> | undefined;
            let respuestas = '';
            try {
              const rj = nfm?.response_json ? JSON.parse(String(nfm.response_json)) as Record<string, unknown> : null;
              if (rj) respuestas = Object.entries(rj).filter(([k]) => k !== 'flow_token').map(([k, v]) => `${k}: ${String(v)}`).join(' · ');
            } catch { /* no era JSON */ }
            if (respuestas) {
              msgText = respuestas;
              etiquetaLog = `[formulario] ${respuestas}`;
            } else {
              etiquetaLog = `[interactivo:${sub}] ${JSON.stringify(interactive ?? {}).slice(0, 300)}`;
              sinContenido = true;
            }
          }
        } else if (['image', 'video', 'document', 'sticker'].includes(msgType)) {
          // Foto / video / documento / sticker: el texto que viene con el archivo (caption) se
          // leía como vacío. Ahora se usa como mensaje normal, y el registro dice qué llegó.
          const media = msg[msgType] as Record<string, unknown> | undefined;
          msgText = (media?.caption as string) ?? '';
          const nombres: Record<string, string> = { image: 'foto', video: 'video', document: 'documento', sticker: 'sticker' };
          etiquetaLog = `[${nombres[msgType]}${media?.filename ? `: ${String(media.filename)}` : ''}]${msgText ? ` ${msgText}` : ''}`;
        } else if (msgType === 'reaction') {
          // Reacción con emoji a un mensaje nuestro (👍, ❤️): no es una pregunta ni un archivo.
          const emoji = ((msg.reaction as Record<string, unknown>)?.emoji as string) ?? '';
          etiquetaLog = `[reacción ${emoji || '(quitada)'}]`;
        } else if (msgType === 'button') {
          // Botón de respuesta rápida de una PLANTILLA (2026-10-04, ayuda de recarga). Llega como
          // type 'button' -- distinto de los botones interactivos -- y antes se quedaba sin texto.
          const btn = msg.button as Record<string, unknown>;
          msgText = (btn?.text as string) ?? '';
          const payload = (btn?.payload as string) ?? '';
          msgBtnId = payload && payload !== msgText ? payload : undefined;
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

        // Código de la publicación de Facebook que trajo a esta persona (migración 274).
        // El link del post es wa.me/...?text=Hola%2C%20quiero%20un%20viaje%20%23g7, así que
        // el primer mensaje llega con "#g7" al final.
        //
        // SE QUITA DEL TEXTO ANTES DE TODO LO DEMÁS, a propósito: si el "#g7" siguiera en el
        // mensaje, el flujo de viaje intentaría interpretarlo como parte de una dirección y
        // podría romper el pedido de la persona. Capturar el origen NUNCA debe cambiar lo que
        // vive el pasajero.
        const mOrigen = msgText.match(/#g([a-z0-9]{1,12})\b/i);
        if (mOrigen) {
          msgText = msgText.replace(/#g[a-z0-9]{1,12}\b/i, '').replace(/\s{2,}/g, ' ').trim();
          // Fire-and-forget: solo se guarda el PRIMER código de cada teléfono (la RPC hace
          // ON CONFLICT DO NOTHING), y si falla no debe afectar la conversación.
          db().rpc('ag_registrar_origen', { p_phone: fromPhone, p_codigo: mOrigen[1] })
            .then(({ error }: { error: unknown }) => { if (error) console.error('[WA] origen:', error); });
        }

        logWaMessage(fromPhone, isSupportNumber ? 'conductor' : 'pasajero', 'in', etiquetaLog || msgText, msgType);

        // Aviso al admin si esta persona está iniciando conversación. Fire-and-forget
        // a propósito: no puede agregarle ni un milisegundo a la respuesta que espera
        // el conductor o el pasajero. Se excluye el propio número del admin -- no tiene
        // sentido avisarle de sí mismo cuando prueba el bot.
        if (toE164(fromPhone) !== toE164(SUPPORT_PHONE)) {
          notifyAdminNewConversation(
            fromPhone,
            isSupportNumber ? 'conductor' : 'pasajero',
            name,
            etiquetaLog || (msgType === 'text' ? msgText : `[${msgType}]`),
          ).catch(() => {});
        }

        // Una reacción con emoji no necesita respuesta (antes recibía "Recibí tu archivo").
        if (msgType === 'reaction') return new Response('ok', { status: 200 });
        // Algo que no sabemos leer y sin texto (p. ej. el interactivo que llega de un anuncio): se
        // atiende como un saludo -- el conductor recibe el menú / embudo, nunca "Recibí tu archivo".
        if (sinContenido && !msgText.trim()) msgText = 'hola';

        // El admin enseñándole una respuesta al bot (migración 271). Va antes que todo
        // lo demás, pero solo se activa si de verdad hay una pregunta pendiente y él no
        // está en medio de un flujo de viaje -- si no aplica, devuelve false y el mensaje
        // sigue su curso normal como cualquier otro.
        if (toE164(fromPhone) === toE164(SUPPORT_PHONE) && msgType === 'text') {
          // Respuesta al aviso de comprobante Nequi ("sí cayó, aprobación 12345678") -> carga el saldo.
          if (await manejarAprobacionNequi(msgText, msgQuotedId)) {
            return new Response('ok', { status: 200 });
          }
          if (await maybeHandleAdminTeaching(msgText, msgQuotedId)) {
            return new Response('ok', { status: 200 });
          }
        }

        // Número oculto: si ya le pedimos el celular y lo escribe, se guarda y se le avisa al admin.
        if (msgType === 'text' && await capturarCelularOculto(fromPhone, msgText, isSupportNumber, name)) {
          return new Response('ok', { status: 200 });
        }

        // Pedido de codigo de verificacion por WhatsApp -- corre ANTES del bot normal
        // (viajes o soporte) y corta el procesamiento si consumio el mensaje. Si el mensaje
        // no tiene nada que ver con un codigo devuelve false, y todo sigue igual que antes.
        if (await handleOtpCodeRequest(fromPhone, msgText, isSupportNumber)) {
          return new Response('ok', { status: 200 });
        }

        // "NO MÁS" a los avisos de solicitudes por WhatsApp (ver alertaSolicitudConductores).
        if (isSupportNumber && msgType === 'text' && await manejarBajaAlertasViaje(fromPhone, msgText)) {
          return new Response('ok', { status: 200 });
        }

        // Comprobante de recarga por Nequi (texto del botón de la app y/o la captura).
        const mediaIdComp = (['image', 'document'].includes(msgType) ? ((msg[msgType] as Record<string, unknown> | undefined)?.id as string | undefined) : undefined);
        if (isSupportNumber && await manejarComprobanteNequi(fromPhone, msgType, msgText, mediaIdComp)) {
          return new Response('ok', { status: 200 });
        }

        // Ayuda a quien no logra recargar saldo: solo reacciona a sus botones (ids rec_*).
        if (isSupportNumber && await manejarAyudaRecarga(fromPhone, msgText, msgBtnId)) {
          return new Response('ok', { status: 200 });
        }

        if (isSupportNumber) {
          // msgBtnId hacía falta acá: el embudo de captación se navega con botones
          // nativos, y sin el id solo llegaba el título ("🏍️ Moto"), que depende del
          // idioma y de los emojis. El id es estable.
          await handleSupportConversation(fromPhone, name, msgText, msgBtnId);
        } else {
          await handleConversation(fromPhone, name, msgType, msgText, msgLat, msgLng, precomputedAddr as string | undefined, precomputedSession, precomputedRoute, msgBtnId);
        }

        // DESPUÉS de su respuesta normal (para no interrumpir): pedirle el celular si lo tiene oculto.
        await pedirCelularSiOculto(fromPhone, isSupportNumber);

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
