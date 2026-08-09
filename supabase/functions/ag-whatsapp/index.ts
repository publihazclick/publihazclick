import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ─── Config ──────────────────────────────────────────────────────────────────
const WA_TOKEN            = Deno.env.get('META_WA_TOKEN')!;
const PHONE_NUMBER_ID     = Deno.env.get('META_WA_PHONE_NUMBER_ID')!;
const WEBHOOK_VERIFY_TOKEN = Deno.env.get('META_WA_WEBHOOK_VERIFY_TOKEN') ?? 'movi_webhook_2026';
const SUPABASE_URL        = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY    = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const PRICE_PER_KM = 1500;
const MIN_PRICE    = 5000;
// Número de soporte de Movi (el mismo ya usado en la app para wa.me/573734453649)
const SUPPORT_PHONE = '573734453649';

const SERVICE_LABELS: Record<string, string> = {
  carro:     '🚗 Carro',
  moto:      '🏍️ Moto',
  domicilio: '📦 Domicilio',
  ciudad:    '🌆 Ciudad a Ciudad',
  flete:     '🚛 Flete',
};

// ─── Supabase client (service role) ──────────────────────────────────────────
function db() {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

// ─── WhatsApp API helpers ─────────────────────────────────────────────────────
async function sendText(to: string, text: string): Promise<void> {
  await fetch(`https://graph.facebook.com/v20.0/${PHONE_NUMBER_ID}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${WA_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'text',
      text: { preview_url: false, body: text },
    }),
  }).catch(e => console.error('[WA] sendText error:', e));
}

// ─── Normalizar número a E.164 ────────────────────────────────────────────────
function toE164(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (phone.startsWith('+')) return `+${digits}`;
  if (digits.length === 10) return `+57${digits}`;
  if (digits.length === 12 && digits.startsWith('57')) return `+${digits}`;
  return `+${digits}`;
}

// ─── Geocoding via Nominatim OSM ──────────────────────────────────────────────
async function reverseGeocode(lat: number, lng: number): Promise<string> {
  try {
    const r = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&accept-language=es`,
      { headers: { 'User-Agent': 'Movi-App/1.0 (movi@publihazclick.com)' } }
    );
    const j = await r.json();
    if (j?.display_name) {
      // Simplificar la dirección: calle + barrio + ciudad
      const a = j.address ?? {};
      const parts = [
        a.road ?? a.pedestrian ?? a.path,
        a.neighbourhood ?? a.suburb ?? a.quarter,
        a.city ?? a.town ?? a.municipality ?? a.county,
      ].filter(Boolean);
      return parts.length ? parts.join(', ') : j.display_name.split(',').slice(0, 3).join(',');
    }
  } catch (e) { console.error('[Geo] reverseGeocode error:', e); }
  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}

async function forwardGeocode(text: string): Promise<{ lat: number; lng: number; address: string } | null> {
  try {
    const q = encodeURIComponent(text + ', Colombia');
    const r = await fetch(
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
  } catch (e) { console.error('[Geo] forwardGeocode error:', e); }
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
function suggestPrice(distKm: number, service: string): number {
  let rate = PRICE_PER_KM;
  if (service === 'moto') rate = 1000;
  if (service === 'flete') rate = 2500;
  if (service === 'ciudad') rate = 1800;
  const raw = Math.round(distKm * rate / 500) * 500;
  return Math.max(raw, MIN_PRICE);
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

  const tripData: Record<string, unknown> = {
    passenger_user_id: userId,
    service_type:  serviceType,
    origin:        originAddr,
    origin_lat:    session.origin_lat,
    origin_lng:    session.origin_lng,
    dest_name:     session.dest_name,
    dest_lat:      session.dest_lat,
    dest_lng:      session.dest_lng,
    offered_price: session.offered_price,
    status:        'pending',
    source:        'whatsapp',
    wa_phone:      toE164(session.wa_phone as string),
    passenger_note: session.package_desc
      ? `[WA] ${serviceType === 'domicilio' ? 'Domicilio' : 'Flete'}: ${session.package_desc}`
      : '[Pedido vía WhatsApp]',
  };

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
  let driverRating = 0;

  const { data: driver } = await supabase
    .from('ag_drivers')
    .select('vehicle_brand, vehicle_model, plate, ag_user_id')
    .eq('id', offer.driver_id as string)
    .maybeSingle();

  if (driver) {
    driverVeh   = [driver.vehicle_brand, driver.vehicle_model].filter(Boolean).join(' ');
    driverPlate = driver.plate ?? '';

    const { data: user } = await supabase
      .from('ag_users')
      .select('full_name, phone')
      .eq('id', driver.ag_user_id as string)
      .maybeSingle();
    if (user) {
      driverName  = user.full_name ?? driverName;
      driverPhone = user.phone ?? '';
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
    driver_rating:  driverRating,
  };
}

// ─── Mostrar una oferta al pasajero por WhatsApp ──────────────────────────────
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

  const rating = o.driver_rating as number;
  await sendText(phone,
    `${prefix}🚗 ¡Conductor disponible!\n\n` +
    `👤 *${o.driver_name}*\n` +
    (rating > 0 ? `⭐ ${rating.toFixed(1)}\n` : '') +
    (o.driver_vehicle ? `🚗 ${o.driver_vehicle}\n` : '') +
    (o.driver_plate   ? `🔢 Placa: ${o.driver_plate}\n` : '') +
    `💰 Precio ofertado: *$${(o.driver_price as number).toLocaleString('es-CO')}*\n\n` +
    `¿Aceptas?\n*1* ✅ Aceptar\n*2* ❌ Buscar otro conductor`
  );
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
  await upsertSession(phone, {
    state: 'awaiting_origin_confirm',
    origin_lat: lat, origin_lng: lng, origin_address: addr,
  });
  await sendText(phone,
    `📍 ¿Estás en:\n*${addr}*?\n\nResponde:\n✅ *si* — correcto\n❌ *no* — cambiar dirección`
  );
}

// ─── Confirmar destino + precio sugerido (reusado por ambos flujos) ───────────
async function presentDestConfirm(phone: string, addr: string, lat: number | null, lng: number | null, session: Record<string, unknown>): Promise<void> {
  const oLat = session.origin_lat as number;
  const oLng = session.origin_lng as number;
  let distKm = 0;
  let suggested = MIN_PRICE;
  if (lat != null && lng != null && oLat && oLng) {
    distKm = haversineKm(oLat, oLng, lat, lng);
    suggested = suggestPrice(distKm, session.service_type as string ?? 'carro');
  }

  await upsertSession(phone, {
    state: 'awaiting_dest_confirm',
    dest_name: addr, dest_lat: lat ?? null, dest_lng: lng ?? null,
    offered_price: suggested, pending_dest_text: null,
  });

  const distText = distKm > 0 ? `📏 Distancia aprox: ${distKm.toFixed(1)} km\n` : '';
  await sendText(phone,
    `📍 ¿Vas a:\n*${addr}*?\n\n` + distText +
    `💰 Precio sugerido: *$${suggested.toLocaleString('es-CO')}*\n\n` +
    `Responde:\n✅ *si* — confirmar destino\n❌ *no* — cambiar destino`
  );
}

// ─── Arrancar el flujo a partir de una solicitud interpretada por IA ──────────
async function startSmartFlow(phone: string, parsed: ParsedRequest): Promise<void> {
  const svc = parsed.service_type as string;
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

  if (parsed.origin_text) {
    const geo = await forwardGeocode(parsed.origin_text);
    if (geo && isInColombia(geo.lat, geo.lng)) {
      await presentOriginConfirm(phone, geo.address, geo.lat, geo.lng);
      return;
    }
  }

  await upsertSession(phone, { state: 'awaiting_origin' });
  await sendText(phone,
    `${SERVICE_LABELS[svc]} detectado ✨\n\n📍 *¿Dónde estás?*\n\n` +
    `Envía tu ubicación:\n• Toca el clip 📎 → Ubicación → Tu ubicación actual\n\n` +
    `O escribe tu dirección completa.`
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
function menuText(): string {
  return `¡Hola! Soy *Movi* 🚗\n\n¿Qué servicio necesitas?\n\n` +
    `1️⃣ 🚗 Carro\n` +
    `2️⃣ 🏍️ Moto\n` +
    `3️⃣ 📦 Domicilio\n` +
    `4️⃣ 🌆 Ciudad a Ciudad\n` +
    `5️⃣ 🚛 Flete\n\n` +
    `Responde con el número de tu opción.\n` +
    `Escribe *cancelar* en cualquier momento para reiniciar.`;
}

// ─── Normalizar respuestas sí/no ──────────────────────────────────────────────
function isYes(t: string): boolean {
  return /^(si|sí|yes|ok|okay|1|✅|👍|dale|acepto|confirmo|listo|bueno|claro)$/i.test(t.trim());
}
function isNo(t: string): boolean {
  return /^(no|nope|2|❌|👎|cambiar|otro|incorrecta|mal)$/i.test(t.trim());
}
function isCancel(t: string): boolean {
  return /^(cancelar|cancel|salir|exit|menu|menú|inicio|start|hola|hi|hello|comenzar)$/i.test(t.trim());
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
) {
  // Recuperar o crear sesión
  let session = await getSession(phone) ?? { wa_phone: phone, state: 'idle' };

  // Sesión expirada → reset
  if (session.expires_at && new Date(session.expires_at) < new Date()) {
    await resetSession(phone);
    session = { wa_phone: phone, state: 'idle' };
  }

  const state = session.state ?? 'idle';
  const text  = msgText.trim();

  // SOS reconocible en cualquier estado de la conversación, sin depender de
  // tener la app abierta ni de haber navegado ningún menú.
  if (isSos(text)) {
    await triggerWaSos(phone, contactName, session);
    return;
  }

  // Cancelar en cualquier estado
  if (isCancel(text) && state !== 'idle') {
    await resetSession(phone);
    await sendText(phone, `Solicitud cancelada. ${menuText()}`);
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
    await upsertSession(phone, { state: 'awaiting_service', expires_at: new Date(Date.now() + 2*60*60*1000).toISOString() });
    await sendText(phone, menuText());
    return;
  }

  // ── AWAITING_SERVICE ────────────────────────────────────────────────────────
  if (state === 'awaiting_service') {
    const map: Record<string, string> = {
      '1': 'carro', '2': 'moto', '3': 'domicilio', '4': 'ciudad', '5': 'flete',
      'carro': 'carro', 'moto': 'moto', 'domicilio': 'domicilio',
      'ciudad': 'ciudad', 'flete': 'flete',
    };
    const svc = map[text.toLowerCase()];
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
      await sendText(phone, `No entendí tu respuesta 🤔\n\n${menuText()}`);
      return;
    }

    await upsertSession(phone, { state: 'awaiting_origin', service_type: svc });

    const needsPackage = svc === 'domicilio' || svc === 'flete';
    if (needsPackage) {
      const label = svc === 'domicilio' ? 'domicilio' : 'flete';
      await sendText(phone,
        `${SERVICE_LABELS[svc]} seleccionado.\n\n` +
        `Primero, descríbeme qué necesitas enviar/recoger:\n` +
        `_(ej: "Ropa, bolsa pequeña")_`
      );
      await upsertSession(phone, { state: 'awaiting_package_desc' });
    } else {
      await sendText(phone,
        `${SERVICE_LABELS[svc]} seleccionado 👍\n\n` +
        `📍 *¿Dónde estás?*\n\n` +
        `Envía tu ubicación:\n` +
        `• Toca el clip 📎 → Ubicación → Tu ubicación actual\n\n` +
        `O escribe tu dirección completa.`
      );
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
      addr = await reverseGeocode(lat, lng);
    } else if (text.length > 4) {
      const geo = await forwardGeocode(text);
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
      // Flujo inteligente: si ya sabíamos el destino desde el mensaje original
      // en lenguaje natural, saltar directo a confirmarlo en vez de preguntar.
      const pendingDest = session.pending_dest_text as string | null;
      if (pendingDest) {
        const geo = await forwardGeocode(pendingDest);
        if (geo && isInColombia(geo.lat, geo.lng)) {
          await presentDestConfirm(phone, geo.address, geo.lat, geo.lng, session);
          return;
        }
        await upsertSession(phone, { pending_dest_text: null });
      }

      await upsertSession(phone, { state: 'awaiting_dest' });
      await sendText(phone,
        `¡Perfecto! 🎯\n\n` +
        `📍 *¿A dónde vas?*\n\n` +
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

  // ── AWAITING_DEST ───────────────────────────────────────────────────────────
  if (state === 'awaiting_dest') {
    let lat: number | undefined;
    let lng: number | undefined;
    let addr = '';

    if (msgType === 'location' && msgLat != null && msgLng != null) {
      lat = msgLat; lng = msgLng;
      addr = await reverseGeocode(lat, lng);
    } else if (text.length > 4) {
      const geo = await forwardGeocode(text);
      if (geo) { lat = geo.lat; lng = geo.lng; addr = geo.address; }
      else { addr = text; } // Guardar tal como está si no geocodifica
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
      await upsertSession(phone, { state: 'awaiting_price' });
      await sendText(phone,
        `Destino confirmado ✅\n\n` +
        `💰 *¿Cuánto ofreces por este viaje?*\n\n` +
        `Precio sugerido: *$${suggested.toLocaleString('es-CO')}*\n\n` +
        `• Escribe un monto (ej: *12000*)\n` +
        `• O escribe *ok* para usar el precio sugerido\n\n` +
        `_Mínimo $${MIN_PRICE.toLocaleString('es-CO')}_`
      );
    } else if (isNo(text)) {
      await upsertSession(phone, { state: 'awaiting_dest', dest_name: null, dest_lat: null, dest_lng: null });
      await sendText(phone, `Entendido. ¿A dónde vas? Escribe la dirección o envía tu ubicación de destino.`);
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
    await sendText(phone,
      `✅ ¡Solicitud enviada!\n\n` +
      `${svc}\n` +
      `📍 Desde: ${session.origin_address}\n` +
      `📍 Hasta: ${session.dest_name}\n` +
      `💰 Tu oferta: *$${price.toLocaleString('es-CO')}*\n\n` +
      `🔍 Buscando conductores cerca de ti...\n\n` +
      `Te avisamos cuando alguien acepte. Máx 5 minutos.\n` +
      `Escribe *cancelar* si deseas cancelar la solicitud.`
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
        await sendText(phone, `Ya tienes un conductor asignado 🚗\nEscribe *cancelar* si necesitas cancelar el viaje.`);
        return;
      }

      // Chequeo oportunista: puede haber una oferta pendiente que llegó
      // mientras el pasajero estaba ocupado respondiendo otra (o que el
      // aviso push no alcanzó a llegar) — no debe perderse.
      const nextOffer = await fetchNextPendingOffer(tripId);
      if (nextOffer) {
        await presentOffer(phone, nextOffer);
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
          .update({ status: 'cancelled' })
          .eq('id', tripId);
      }
      await resetSession(phone);
      await sendText(phone,
        `😔 No encontramos conductores disponibles en este momento.\n\n` +
        `Puedes intentarlo de nuevo o en unos minutos.\n\n` + menuText()
      );
      return;
    }

    const minLeft = Math.ceil(5 - elapsedMin);
    await sendText(phone, `⏳ Buscando conductores... (${minLeft} min restantes)\n\nEscribe *cancelar* para cancelar.`);
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
          await sendText(phone, `Error al confirmar la oferta 😔\nIntenta escribir *1* de nuevo.`);
          return;
        }
        await upsertSession(phone, { state: 'in_trip' });
        const oLat = session.origin_lat as number;
        const oLng = session.origin_lng as number;
        const mapsLink = oLat && oLng
          ? `\n🗺️ Tu punto de recogida:\nhttps://maps.google.com/?q=${oLat},${oLng}`
          : '';
        await sendText(phone,
          `🎉 ¡Conductor confirmado!\n\n` +
          `👤 *${session.driver_name}*\n` +
          (session.driver_vehicle ? `🚗 ${session.driver_vehicle}\n` : '') +
          (session.driver_plate   ? `🔢 Placa: ${session.driver_plate}\n` : '') +
          (session.driver_phone   ? `📱 Llamar: ${toE164(session.driver_phone as string)}\n` : '') +
          `\n💰 Precio acordado: *$${(session.driver_price as number ?? 0).toLocaleString('es-CO')}*` +
          mapsLink +
          `\n\nEl conductor está en camino. 🚗\nTe avisamos cuando llegue al punto de recogida.`
        );
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
        await presentOffer(phone, nextOffer, 'Oferta rechazada ❌\n\n');
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
        `Oferta rechazada ❌\n\nSiguiendo la búsqueda...\nTe avisamos cuando haya un nuevo conductor disponible.`
      );
    } else {
      await sendText(phone,
        `Responde:\n*1* o *si* — aceptar al conductor ${session.driver_name}\n*2* o *no* — buscar otro conductor`
      );
    }
    return;
  }

  // ── IN_TRIP ──────────────────────────────────────────────────────────────────
  if (state === 'in_trip') {
    await sendText(phone, `Tu viaje está en curso 🚗\n\nEscribe *cancelar* si tienes algún problema.`);
    return;
  }

  // ── AWAITING_RATING ─────────────────────────────────────────────────────────
  if (state === 'awaiting_rating') {
    if (/^(omitir|saltar|no|skip)$/i.test(text)) {
      await resetSession(phone);
      await sendText(phone, `Sin problema 👍\n\n¿Necesitas otro servicio? Escribe *hola*.`);
      await maybeOfferAppDownload(phone);
      return;
    }

    const stars = parseInt(text, 10);
    if (!Number.isInteger(stars) || stars < 1 || stars > 5 || !/^\d+$/.test(text)) {
      await sendText(phone, `Por favor responde con un número del *1* al *5*, o escribe *omitir* para saltar.`);
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
    await sendText(phone, `¡Gracias por calificar! ${'⭐'.repeat(stars)}\n\n¿Necesitas otro servicio? Escribe *hola*.`);
    await maybeOfferAppDownload(phone);
    return;
  }

  // ── ESTADO DESCONOCIDO → reset ───────────────────────────────────────────────
  await resetSession(phone);
  await sendText(phone, menuText());
}

// ─── Manejar eventos internos (DB triggers) ───────────────────────────────────
async function handleInternalEvent(payload: Record<string, unknown>) {
  const event   = payload._internal_event as string;
  const phone   = payload.wa_phone as string;

  if (!phone || !event) return;

  if (event === 'offer_received') {
    const session = await getSession(phone);
    if (!session || session.state !== 'matching') return;

    const driverName  = payload.driver_name as string ?? 'Conductor';
    const driverPrice = payload.offered_price as number ?? 0;
    const driverPhone = payload.driver_phone as string ?? '';
    const driverVeh   = payload.driver_vehicle as string ?? '';
    const driverPlate = payload.driver_plate as string ?? '';
    const driverRating = payload.driver_rating as number ?? 0;
    const offerId     = payload.offer_id as string;

    await upsertSession(phone, {
      state: 'awaiting_offer_response',
      active_offer_id: offerId,
      driver_name:     driverName,
      driver_price:    driverPrice,
      driver_phone:    driverPhone,
      driver_vehicle:  driverVeh,
      driver_plate:    driverPlate,
    });

    await sendText(phone,
      `🚗 ¡Conductor disponible!\n\n` +
      `👤 *${driverName}*\n` +
      (driverRating > 0 ? `⭐ ${driverRating.toFixed(1)}\n` : '') +
      (driverVeh         ? `🚗 ${driverVeh}\n` : '') +
      (driverPlate       ? `🔢 Placa: ${driverPlate}\n` : '') +
      `💰 Precio ofertado: *$${driverPrice.toLocaleString('es-CO')}*\n\n` +
      `¿Aceptas?\n*1* ✅ Aceptar\n*2* ❌ Buscar otro conductor`
    );
  }

  if (event === 'trip_completed') {
    const amount = payload.amount as number ?? 0;
    // No resetear todavía -- primero se pide la calificación del conductor,
    // manteniendo trip_request_id/ag_user_id en sesión para poder insertarla.
    await upsertSession(phone, { state: 'awaiting_rating' });
    await sendText(phone,
      `🏁 *¡Viaje completado!*\n\n` +
      `💰 Total: $${Number(amount).toLocaleString('es-CO')}\n\n` +
      `Gracias por viajar con *Movi* 🚗💚\n\n` +
      `⭐ *¿Cómo calificarías a tu conductor?*\nResponde con un número del *1* al *5*.\n` +
      `_(o escribe *omitir* para saltar)_`
    );
  }

  if (event === 'live_location') {
    const lat   = payload.lat as number | null;
    const lng   = payload.lng as number | null;
    const stage = payload.driver_stage as string ?? '';
    if (lat == null || lng == null) return;

    const label = stage === 'heading_to_pickup'
      ? 'tu conductor va en camino a recogerte'
      : stage === 'arrived_at_pickup'
        ? 'tu conductor llegó al punto de recogida'
        : 'tu conductor va en camino';

    await sendText(phone,
      `📍 Ubicación en vivo — ${label}\nhttps://maps.google.com/?q=${lat},${lng}`
    );
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
        error_alert: d => `🔴 *Movi* — Error en el flujo de viaje\n\n📍 Contexto: ${d.context}\n⚠️ ${d.message}`,
      };
      text = eventMap[event as string]?.(msgData) ?? (msgData.message ?? '');
    }

    if (text) {
      await sendText(toE164(targetPhone), text);
      // Registro best-effort para trazabilidad, igual que hace triggerWaSos con SOS.
      if (event === 'error_alert') {
        try {
          const supabase = db();
          await supabase.from('ag_admin_notifications').insert({
            type:  'trip_error',
            title: `Error en flujo de viaje: ${msgData.context ?? 'desconocido'}`,
            body:  msgData.message ?? '',
          });
        } catch (e) { console.error('[WA] error_alert notification insert error:', e); }
      }
      return new Response(JSON.stringify({ sent: true }), {
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
        const fromPhone   = msg.from as string;
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

        await handleConversation(fromPhone, name, msgType, msgText, msgLat, msgLng);
      }
    } catch (e) {
      console.error('[WA] Webhook processing error:', e);
    }
    return new Response('ok', { status: 200 }); // Siempre 200 a Meta
  }

  return new Response('ok', { status: 200 });
});
