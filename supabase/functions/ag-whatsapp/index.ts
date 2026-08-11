import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ─── Config ──────────────────────────────────────────────────────────────────
const WA_TOKEN            = Deno.env.get('META_WA_TOKEN')!;
const PHONE_NUMBER_ID     = Deno.env.get('META_WA_PHONE_NUMBER_ID')!;
const WEBHOOK_VERIFY_TOKEN = Deno.env.get('META_WA_WEBHOOK_VERIFY_TOKEN') ?? 'movi_webhook_2026';
const SUPABASE_URL        = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY    = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const MIN_PRICE    = 5000;
// Número de soporte de Movi (el mismo ya usado en la app para wa.me/573134453649)
const SUPPORT_PHONE = '573134453649';

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
    return { ok: res.ok, status: res.status, body: bodyText };
  } catch (e) {
    console.error('[WA] sendText fetch error:', e);
    return { ok: false, body: String(e) };
  }
}

// ─── Mensaje de plantilla aprobada (no depende de la ventana de 24h) ─────────
async function sendTemplate(to: string, templateName: string, langCode: string, bodyParams: string[]): Promise<{ ok: boolean; status?: number; body?: string }> {
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
            { type: 'body', parameters: bodyParams.map(t => ({ type: 'text', text: t })) },
          ],
        },
      }),
    });
    const bodyText = await res.text();
    if (!res.ok) console.error('[WA] sendTemplate Meta API error:', res.status, bodyText);
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
async function markReadWithTyping(messageId: string): Promise<void> {
  try {
    await fetch(`https://graph.facebook.com/v20.0/${PHONE_NUMBER_ID}/messages`, {
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
  const mapboxToken = Deno.env.get('MAPBOX_PUBLIC_TOKEN');
  if (mapboxToken) {
    try {
      const r = await fetchWithTimeout(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${mapboxToken}&language=es&types=address,poi`,
        {}, 3000
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
        // "Calle 1B 2 15, 540001 San José de Cúcuta, Norte de Santander,
        // Colombia" -> se recorta a los primeros 2-3 segmentos (calle +
        // ciudad) para no mandar el pais/codigo postal en cada mensaje.
        return best.name.split(',').slice(0, 3).join(',').trim();
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
        const item = j.results[0];
        const loc = item.geometry?.location;
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
      `https://nominatim.openstreetmap.org/search?q=${q}&format=json&countrycodes=co&limit=1`,
      { headers: { 'User-Agent': 'Movi-App/1.0 (movi@publihazclick.com)' } }
    );
    const results = await r.json();
    if (results?.length) {
      const item = results[0];
      return {
        lat: parseFloat(item.lat),
        lng: parseFloat(item.lon),
        address: item.display_name.split(',').slice(0, 3).join(',').trim(),
      };
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
async function currentSurgeMultiplier(): Promise<number> {
  try {
    const { data, error } = await db().rpc('ag_current_surge', { p_zone_id: null });
    if (error) { console.error('[Price] ag_current_surge error:', error); return 1; }
    return Number(data ?? 1);
  } catch (e) { console.error('[Price] ag_current_surge fetch error:', e); return 1; }
}

async function suggestPrice(distKm: number, service: string): Promise<number> {
  const surge = await currentSurgeMultiplier();
  if (service === 'domicilio') {
    return Math.max(MIN_PRICE, Math.round(distKm * 1500 * surge / 500) * 500);
  }
  if (service === 'moto') {
    const raw = Math.max(3000, 2500 + distKm * 700);
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
  const raw = Math.max(4500, 4000 + distKm * 1000);
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
    distance_km:   haversineKm(oLat, oLng, dLat, dLng),
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

  const action = copy.delivery ? 'quiere recoger tu paquete 📦' : 'quiere llevarte 🚗';
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

// ─── Confirmar origen (reusado por el flujo clásico y el flujo inteligente) ───
async function presentOriginConfirm(phone: string, addr: string, lat: number, lng: number): Promise<void> {
  // Guardar la sesión y enviar el mensaje son operaciones independientes (ninguna
  // necesita el resultado de la otra) -- en paralelo en vez de en serie ahorra
  // un round-trip completo, parte del mismo fix de lentitud de 2026-08-11.
  await Promise.all([
    upsertSession(phone, {
      state: 'awaiting_origin_confirm',
      origin_lat: lat, origin_lng: lng, origin_address: addr,
    }),
    sendButtons(phone, `📍 ¿Estás en *${addr}*?`, [
      { id: 'origin_yes', title: '✅ Sí, confirmar' },
      { id: 'origin_no', title: '✏️ Editar' },
    ]),
  ]);
}

// ─── Confirmar destino + precio sugerido (reusado por ambos flujos) ───────────
async function presentDestConfirm(phone: string, addr: string, lat: number | null, lng: number | null, session: Record<string, unknown>): Promise<void> {
  const oLat = session.origin_lat as number;
  const oLng = session.origin_lng as number;
  let distKm = 0;
  let suggested = MIN_PRICE;
  if (lat != null && lng != null && oLat && oLng) {
    distKm = haversineKm(oLat, oLng, lat, lng);
    suggested = await suggestPrice(distKm, session.service_type as string ?? 'carro');
  }

  const distText = distKm > 0 ? ` (${distKm.toFixed(1)} km)` : '';
  const question = isDeliveryService(session.service_type as string)
    ? `📍 ¿Ahí se debe entregar el paquete: *${addr}*?${distText}`
    : `📍 ¿Vas a *${addr}*?${distText}`;

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
        { id: 'dest_no', title: '✏️ Editar' },
      ]
    ),
  ]);
}

// ─── Servicios que aun no se pueden pedir por WhatsApp ────────────────────────
// "Ciudad a Ciudad" y "Flete" viven en tablas y flujos de precio totalmente
// distintos (cc_/fl_) que createWaTrip() no llena -- en vez de dejar la
// solicitud rota en silencio (nunca le llegaba nada al conductor), se avisa
// claro y se manda a la app, que si soporta esos dos completos.
const APK_LINK = 'https://hndhgtnjyjwrnzdcgcca.supabase.co/storage/v1/object/public/movi-apk/movi-conductor.apk';
async function sendUnsupportedServiceMessage(phone: string, svc: string): Promise<void> {
  await resetSession(phone);
  await sendText(phone,
    `${SERVICE_LABELS[svc] ?? svc} todavía no está disponible por este chat 😔\n\n` +
    `Por ahora ese servicio solo se puede pedir desde la app de Movi:\n${APK_LINK}\n\n` +
    `Escribe *hola* si quieres pedir un Carro, Moto o Domicilio por aquí.`
  );
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
        `Con la app puedes ver el mapa en vivo, pagar más fácil y pedir en un toque:\n` +
        `https://hndhgtnjyjwrnzdcgcca.supabase.co/storage/v1/object/public/movi-apk/movi-conductor.apk`
      );
    }
  } catch (e) { console.error('[WA] maybeOfferAppDownload error:', e); }
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
  return /^(cancelar|cancel|salir|exit)$/i.test(t.trim());
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
function isSos(t: string): boolean {
  return /^(sos|s\.o\.s\.?|ayuda|emergencia|auxilio|help)$/i.test(t.trim());
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

  const state = session.state ?? 'idle';
  const text  = msgText.trim();

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
    await presentServiceMenu(phone, assignedDriverId
      ? `Solicitud cancelada ❌\n\nLe avisamos a tu ${copy.driverNoun}${driverName ? ` (*${driverName}*)` : ''} que ya no necesitas el servicio.\n\n¿En qué más te ayudo?`
      : `Solicitud cancelada. ¿En qué te ayudo ahora?`);
    return;
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
    // usuario 2026-08-10).
    await presentServiceMenu(phone,
      `¡Hola! 👋 Soy *Leidy Guzmán,* servicio al cliente de *Movi.*\n¿En qué te ayudo hoy?\n\n` +
      `_¿Necesitas viaje urbano, domicilio, viaje de ciudad a ciudad o un flete? Selecciona la opción o escríbeme cuál._`,
      { contact_name: contactName }
    );
    return;
  }

  // ── AWAITING_SERVICE ────────────────────────────────────────────────────────
  if (state === 'awaiting_service') {
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
    const isForSelf  = !isForOther && (n.includes('para m') || n.includes('mi') || isYes(text));
    if (isForOther) {
      await upsertSession(phone, { state: 'awaiting_liability_ack' });
      await sendButtons(phone,
        `⚠️ *Importante antes de continuar*\n\n` +
        `Al pedir el servicio para otra persona, *eres totalmente responsable* de cualquier daño físico o material que esa persona pueda causarle al conductor.\n\n` +
        `Te recomendamos pedirlo solo para personas de tu entera confianza.\n\n` +
        `¿Entiendes y aceptas esto?`,
        [
          { id: 'ack_yes', title: 'Sí, acepto' },
          { id: 'ack_no', title: 'Cancelar' },
        ]
      );
    } else if (isForSelf) {
      await upsertSession(phone, { state: 'awaiting_origin' });
      await sendText(phone,
        `📍 *¿Dónde estás?*\n\n` +
        `Envía tu ubicación:\n` +
        `• Toca el clip 📎 → Ubicación → Tu ubicación actual\n\n` +
        `O escribe tu dirección completa.`
      );
    } else {
      await sendButtons(phone, `¿Es para ti o para otra persona?`, [
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
    if (n.includes('acepto') || n === 'si' || n === 'sí') {
      await upsertSession(phone, { state: 'awaiting_traveler_name', is_for_self: false });
      await sendText(phone, `¿Cómo se llama la persona que viaja?`);
    } else if (n.includes('cancelar') || n === 'no') {
      await upsertSession(phone, { state: 'awaiting_for_whom' });
      await sendButtons(phone, `Entendido. ¿Es para ti o para otra persona?`, [
        { id: 'for_self', title: 'Para mí' },
        { id: 'for_other', title: 'Otra persona' },
      ]);
    } else {
      await sendButtons(phone, `¿Entiendes y aceptas la responsabilidad por la otra persona?`, [
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
    await upsertSession(phone, { state: 'awaiting_traveler_same_location', traveler_name: text.trim() });
    await sendButtons(phone, `¿${text.trim()} está contigo ahora mismo (misma ubicación)?`, [
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
    if (n.includes('conmigo') || n === 'si' || n === 'sí') {
      await upsertSession(phone, { state: 'awaiting_origin' });
      await sendText(phone,
        `📍 *¿Dónde estás?*\n\n` +
        `Envía tu ubicación:\n` +
        `• Toca el clip 📎 → Ubicación → Tu ubicación actual\n\n` +
        `O escribe tu dirección completa.`
      );
    } else if (n.includes('otro lugar') || n === 'no') {
      await upsertSession(phone, { state: 'awaiting_origin' });
      await sendText(phone,
        `📍 *¿Dónde está ${travelerName}?* (punto de recogida)\n\n` +
        `Envía su ubicación (pídele que te la comparta y reenvíala aquí) o escribe la dirección.`
      );
    } else {
      await sendButtons(phone, `¿${travelerName} está contigo ahora mismo?`, [
        { id: 'same_loc_yes', title: 'Sí, está conmigo' },
        { id: 'same_loc_no', title: 'En otro lugar' },
      ]);
    }
    return;
  }

  // ── AWAITING_PACKAGE_DESC ───────────────────────────────────────────────────
  if (state === 'awaiting_package_desc') {
    await upsertSession(phone, { state: 'awaiting_origin', package_desc: text });
    await sendText(phone,
      `Anotado: _"${text}"_\n\n` +
      `📍 *¿Dónde estás?* (punto de recogida)\n\n` +
      `Envía tu ubicación o escribe la dirección.`
    );
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
        await sendText(phone, `📍 Esa ubicación no parece estar en Colombia.\n\nEnvía tu ubicación actual o escribe tu dirección.`);
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
        await sendText(phone, `No encontré esa dirección 🔍\n\nIntenta ser más específico o envía tu ubicación con el clip 📎.`);
        return;
      }
      if (!isInColombia(geo.lat, geo.lng)) {
        await sendText(phone, `📍 Esa dirección no está en Colombia. Escribe una dirección válida en Colombia.`);
        return;
      }
      lat = geo.lat; lng = geo.lng; addr = geo.address;
    } else {
      await sendText(phone, `Por favor envía tu ubicación (📎 → Ubicación) o escribe la dirección completa.`);
      return;
    }

    await presentOriginConfirm(phone, addr, lat, lng);
    return;
  }

  // ── AWAITING_ORIGIN_CONFIRM ─────────────────────────────────────────────────
  if (state === 'awaiting_origin_confirm') {
    if (isYes(text)) {
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
          await presentDestConfirm(phone, geo.address, geo.lat, geo.lng, session);
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
    } else if (isNo(text)) {
      await upsertSession(phone, { state: 'awaiting_origin', origin_lat: null, origin_lng: null, origin_address: null });
      await sendText(phone,
        `Entendido. 📍 Envía tu ubicación actual o escribe la dirección completa.`
      );
    } else {
      await sendText(phone, `Responde *si* para confirmar o *no* para cambiar la dirección.`);
    }
    return;
  }

  // ── AWAITING_TRAVELER_PHONE ──────────────────────────────────────────────────
  if (state === 'awaiting_traveler_phone') {
    const digits = text.replace(/\D/g, '');
    if (digits.length < 7) {
      await sendText(phone, `Ese número no parece válido. Escribe el celular de la persona que viaja (solo números).`);
      return;
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
        await presentDestConfirm(phone, geo.address, geo.lat, geo.lng, session);
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
      lat = geo.lat; lng = geo.lng; addr = geo.address;
    } else {
      await sendText(phone, `Escribe la dirección de destino o envía la ubicación con el clip 📎.`);
      return;
    }

    await presentDestConfirm(phone, addr, lat ?? null, lng ?? null, session);
    return;
  }

  // ── AWAITING_DEST_CONFIRM ───────────────────────────────────────────────────
  if (state === 'awaiting_dest_confirm') {
    if (isYes(text)) {
      const suggested = session.offered_price as number ?? MIN_PRICE;
      const delivery = isDeliveryService(session.service_type as string);
      await upsertSession(phone, { state: 'awaiting_price' });
      await sendText(phone,
        `Destino confirmado ✅\n\n` +
        (delivery ? `💰 *¿Cuánto ofreces por este envío?*\n\n` : `💰 *¿Cuánto ofreces por este viaje?*\n\n`) +
        `Precio sugerido: *$${suggested.toLocaleString('es-CO')}*\n\n` +
        `• Escribe un monto (ej: *12000*)\n` +
        `• O escribe *ok* para usar el precio sugerido`
      );
    } else if (isNo(text)) {
      await upsertSession(phone, { state: 'awaiting_dest', dest_name: null, dest_lat: null, dest_lng: null });
      await sendText(phone, `Entendido. ${destQuestionText(session)} Escribe la dirección o envía la ubicación de destino.`);
    } else {
      await sendText(phone, `Responde *si* para confirmar el destino o *no* para cambiarlo.`);
    }
    return;
  }

  // ── AWAITING_PRICE ──────────────────────────────────────────────────────────
  if (state === 'awaiting_price') {
    const suggested = session.offered_price as number ?? MIN_PRICE;
    let price = suggested;

    if (!isYes(text)) {
      const parsed = parseInt(text.replace(/\D/g, ''), 10);
      if (isNaN(parsed) || parsed < MIN_PRICE) {
        await sendText(phone,
          `El monto mínimo es $${MIN_PRICE.toLocaleString('es-CO')} 🚫\n\n` +
          `Escribe un monto válido o *ok* para usar $${suggested.toLocaleString('es-CO')}.`
        );
        return;
      }
      price = parsed;
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
    await sendText(phone,
      (delivery ? `🔍 Buscando mensajero disponible...\n\n` : `🔍 Buscando conductores cerca de ti...\n\n`) +
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
        await presentOffer(phone, { ...nextOffer, service_type: session.service_type });
        return;
      }
    }

    // Verificar timeout (5 minutos)
    const matchStart = session.matching_started_at ? new Date(session.matching_started_at as string) : new Date();
    const elapsedMin = (Date.now() - matchStart.getTime()) / 60000;
    if (elapsedMin > 5) {
      // Cancelar el viaje en DB si existe
      const tripId = session.trip_request_id as string;
      if (tripId) {
        const supabase = db();
        await supabase.from('ag_trip_requests')
          .update({
            status:        'cancelled',
            cancelled_at:  new Date().toISOString(),
            updated_at:    new Date().toISOString(),
            cancel_reason: 'Cancelado automáticamente — nadie aceptó en 5 minutos',
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

    const minLeft = Math.ceil(5 - elapsedMin);
    const waitingNoun = isDeliveryService(session.service_type as string) ? 'mensajero' : 'conductores';
    await sendText(phone, `⏳ Buscando ${waitingNoun}... (${minLeft} min restantes)\n\nEscribe *cancelar* para cancelar.`);
    return;
  }

  // ── AWAITING_OFFER_RESPONSE ──────────────────────────────────────────────────
  if (state === 'awaiting_offer_response') {
    const offerId  = session.active_offer_id as string;
    const tripId   = session.trip_request_id as string;

    if (isYes(text)) {
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
        if (oLat && oLng) await sendLocation(phone, oLat, oLng, 'Tu punto de recogida');
      }
    } else if (isNo(text)) {
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
        await presentOffer(phone, { ...nextOffer, service_type: session.service_type }, 'Oferta rechazada ❌\n\n');
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
      await sendText(phone,
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
        await sendText(phone, delivery
          ? `¡Listo! 📦 Ya le avisamos a tu mensajero que puede salir.`
          : `¡Buen viaje! 🚗 Esperamos que este viaje sea de tu agrado 😊`);
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
            const label = stage === 'heading_to_pickup'
              ? (delivery ? 'Va en camino a recoger tu paquete' : 'Va en camino a recogerte')
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
      await sendText(phone,
        `Sin problema 👍\n\n` +
        `En Movi no descansamos: estamos disponibles las 24 horas del día, todos los días, para viajes urbanos, domicilios, viajes de ciudad a ciudad o fletes.\n` +
        `Cuando quieras, escríbeme *hola* y te atiendo personalmente.`
      );
      await maybeOfferAppDownload(phone);
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
    await sendText(phone,
      `¡Gracias por calificar al conductor! ${'⭐'.repeat(stars)}\n\n` +
      `En Movi no descansamos: estamos disponibles las 24 horas del día, todos los días, para viajes urbanos, domicilios, viajes de ciudad a ciudad o fletes.\n` +
      `Cuando quieras, escríbeme *hola* y te atiendo personalmente.`
    );
    await maybeOfferAppDownload(phone);
    return;
  }

  // ── ESTADO DESCONOCIDO → reset ───────────────────────────────────────────────
  await resetSession(phone);
  await presentServiceMenu(phone, `Uy, no logré entender eso 🤔 ¿en qué te ayudo?`);
}

// ─── Manejar eventos internos (DB triggers) ───────────────────────────────────
async function handleInternalEvent(payload: Record<string, unknown>) {
  const event   = payload._internal_event as string;
  const phone   = payload.wa_phone as string;

  if (!phone || !event) return;

  if (event === 'offer_received') {
    const session = await getSession(phone);
    if (!session || session.state !== 'matching') return;

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
      service_type:   session.service_type,
    });
  }

  if (event === 'driver_arrived') {
    const session     = await getSession(phone);
    const delivery    = isDeliveryService(session?.service_type as string | undefined);
    const driverName  = payload.driver_name as string ?? (delivery ? 'Tu mensajero' : 'Tu conductor');
    const lat = payload.origin_lat as number | null;
    const lng = payload.origin_lng as number | null;
    // Marca/modelo/color + placa -- ya quedaron guardados en la sesión desde
    // que se presentó/aceptó la oferta (presentOffer), no hace falta pedirlos
    // de nuevo. Para que el pasajero pueda reconocer el vehículo en la calle
    // cuando el conductor llega, no solo cuando acepta la oferta (pedido
    // explícito del usuario 2026-08-11).
    const vehicleLine = [
      session?.driver_vehicle as string | undefined,
      session?.driver_plate ? `Placa ${session.driver_plate}` : null,
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
    let waResult = delivery
      ? await sendButtons(phone,
          `📍 *${driverName}* ya llegó al punto de recogida. Entrégale tu paquete cuando estés listo 📦\n\n` +
          (vehicleLine ? `${vehicleLine}\n\n` : '') +
          `¿Ya se lo entregaste?`,
          [{ id: 'board_confirm', title: '✅ Ya se lo entregué' }],
        )
      : await sendButtons(phone,
          `📍 *${driverName}* ya llegó y te está esperando. ¡Sal cuando estés listo! 🚗\n\n` +
          (vehicleLine ? `${vehicleLine}\n\n` : '') +
          `¿Ya subiste al vehículo?`,
          [{ id: 'board_confirm', title: '✅ Ya estoy a bordo' }],
        );
    if (!waResult.ok) {
      const tplResult = await sendTemplate(phone, 'conductor_llego', 'es_CO', [driverName]);
      if (!tplResult.ok) {
        await sendText(phone, delivery
          ? `📍 *${driverName}* ya llegó al punto de recogida. Entrégale tu paquete cuando estés listo 📦` + (vehicleLine ? `\n\n${vehicleLine}` : '')
          : `📍 *${driverName}* ya llegó y te está esperando. ¡Sal cuando estés listo! 🚗` + (vehicleLine ? `\n\n${vehicleLine}` : ''));
      }
    }
    if (lat != null && lng != null) await sendLocation(phone, lat, lng, 'Tu punto de recogida');
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
    const session    = await getSession(phone);
    const delivery   = isDeliveryService(session?.service_type as string | undefined);
    const driverName = payload.driver_name as string ?? (delivery ? 'Tu mensajero' : 'Tu conductor');
    await sendText(phone, delivery
      ? `🚀 *${driverName}* ya va en camino a entregar tu paquete.`
      : `🚀 ¡Vamos en camino! *${driverName}* ya arrancó hacia tu destino.`);
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
    const delivery     = isDeliveryService(session?.service_type as string | undefined);
    const amount       = payload.amount as number ?? 0;
    const tipAmount    = payload.tip_amount as number ?? 0;
    const distanceKm   = payload.distance_km as number ?? 0;
    const driverName   = payload.driver_name as string ?? (delivery ? 'tu mensajero' : 'tu conductor');
    const cop = (n: number) => `$${Number(n).toLocaleString('es-CO')}`;

    // Los viajes de WhatsApp negocian un precio único (no hay tarifa base +
    // distancia por separado como en la app) -- base_fare/distance_fare
    // siempre quedan vacíos aquí, así que el "desglose" real y honesto es
    // la distancia recorrida (sí se guarda, ver createWaTrip) más la propina
    // si hubo, no una tarifa inventada.
    const receiptLines = [
      distanceKm > 0 ? `📏 ${distanceKm.toFixed(1)} km recorridos` : null,
      tipAmount > 0  ? `🙌 Propina: ${cop(tipAmount)}` : null,
    ].filter(Boolean).join('\n');

    // No resetear todavía -- primero se pide la calificación del conductor,
    // manteniendo trip_request_id/ag_user_id en sesión para poder insertarla.
    await upsertSession(phone, { state: 'awaiting_rating' });

    // Plantilla aprobada "viaje_completado" para no depender de la ventana de
    // 24h -- si aun no esta aprobada o falla, cae al texto libre de siempre
    // (que ademas incluye la propina cuando aplica, cosa que la plantilla
    // rigida no puede mostrar condicionalmente). Es texto fijo aprobado por
    // Meta -- igual que conductor_llego, no se puede variar por servicio sin
    // aprobar una plantilla nueva.
    let waResult = await sendTemplate(phone, 'viaje_completado', 'es_CO', [
      distanceKm.toFixed(1), cop(amount), driverName,
    ]);
    if (!waResult.ok) {
      await sendText(phone,
        (delivery ? `🏁 Tu paquete fue entregado 💚\n\n` : `🏁 Llegaste — gracias por viajar con Movi 💚\n\n`) +
        (receiptLines ? `${receiptLines}\n` : '') +
        `💰 *Total: ${cop(amount)}*\n\n` +
        `⭐ ¿Cómo te fue con *${driverName}*? Responde del *1* al *5*.\n` +
        `_(o escribe *omitir* para saltar)_`
      );
    }
  }

  if (event === 'live_location') {
    const lat   = payload.lat as number | null;
    const lng   = payload.lng as number | null;
    const stage = payload.driver_stage as string ?? '';
    if (lat == null || lng == null) return;

    const session  = await getSession(phone);
    const delivery = isDeliveryService(session?.service_type as string | undefined);
    const label = stage === 'heading_to_pickup'
      ? (delivery ? 'Va en camino a recoger tu paquete' : 'Va en camino a recogerte')
      : stage === 'arrived_at_pickup'
        ? 'Llegó al punto de recogida'
        : 'Va en camino';

    // Mensaje de ubicación nativo de WhatsApp -- se ve como un mapa real
    // dentro del chat, no como un link de texto que hay que tocar y esperar
    // a que abra otra app.
    await sendLocation(phone, lat, lng, `Tu ${delivery ? 'mensajero' : 'conductor'}`, label);
  }
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
      let waResult = await sendTemplate(toE164(targetPhone), 'trip_error_alert', 'es_CO', [contexto, detalle]);
      if (!waResult.ok) {
        waResult = await sendText(toE164(targetPhone), `🔴 *Movi* — Error en el flujo de viaje\n\n📍 Contexto: ${contexto}\n⚠️ ${detalle}`);
      }
      try {
        const supabase = db();
        await supabase.from('ag_admin_notifications').insert({
          type:  'trip_error',
          title: `Error en flujo de viaje: ${contexto}`,
          body:  detalle,
        });
      } catch (e) { console.error('[WA] error_alert notification insert error:', e); }
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
        const msg         = messages[0] as Record<string, unknown>;
        const msgId       = msg.id as string | undefined;

        // Meta entrega los webhooks "al menos una vez", no "exactamente una
        // vez" -- si tardamos en responder o hay cualquier hipo de red, Meta
        // reintenta el MISMO mensaje. Sin esto, handleConversation() corría
        // dos veces y el saludo/menú de Movi le llegaba duplicado al usuario
        // (bug real 2026-08-09). Se registra el id del mensaje antes de
        // procesarlo; si el insert choca con la clave primaria, ya se procesó.
        if (msgId) {
          const { error: dupError } = await db()
            .from('ag_wa_processed_messages')
            .insert({ message_id: msgId });
          if (dupError) {
            // 23505 = unique_violation -- mensaje repetido, no reprocesar.
            if ((dupError as { code?: string }).code === '23505') {
              return new Response('ok', { status: 200 });
            }
            console.error('[WA] dedupe insert error:', dupError);
          }
        }

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

        // markReadWithTyping (Meta), el reverse-geocode de una ubicación
        // compartida (Mapbox) y la carga de la sesión (DB) van a hosts/servicios
        // distintos e independientes entre sí -- no hay riesgo de repetir la
        // condición de carrera de 2026-08-09 (esa era específica de 2 fetch()
        // concurrentes al MISMO host de Meta en arranque en frío) corriéndolos
        // en paralelo aquí. Antes iban en serie (markReadWithTyping, luego
        // getSession y reverseGeocode más abajo en handleConversation), sumando
        // 2 round-trips completos al tiempo total de respuesta -- causa real de
        // que "la carga de la ubicación" se sintiera lenta (bug real reportado
        // 2026-08-11, segunda vez). Los resultados se pasan precalculados a
        // handleConversation para que no vuelva a pedirlos.
        const rawLoc = msg.type === 'location' ? (msg.location as Record<string, unknown>) : null;
        const rawLat = rawLoc?.latitude as number | undefined;
        const rawLng = rawLoc?.longitude as number | undefined;
        const [, precomputedAddr, precomputedSession] = await Promise.all([
          msgId ? markReadWithTyping(msgId) : Promise.resolve(),
          (rawLat != null && rawLng != null) ? reverseGeocode(rawLat, rawLng) : Promise.resolve(undefined),
          getSession(fromPhone),
        ]);

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
            await sendText(fromPhone, `No pude escuchar tu audio 😔\n\n¿Puedes escribirlo o intentar de nuevo?`);
            return new Response('ok', { status: 200 });
          }
        }

        await handleConversation(fromPhone, name, msgType, msgText, msgLat, msgLng, precomputedAddr as string | undefined, precomputedSession);
      }
    } catch (e) {
      console.error('[WA] Webhook processing error:', e);
    }
    return new Response('ok', { status: 200 }); // Siempre 200 a Meta
  }

  return new Response('ok', { status: 200 });
});
