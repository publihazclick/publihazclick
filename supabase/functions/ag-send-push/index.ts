// Edge Function: ag-send-push — envía push a user_id(s) de Movi
// Soporta dos canales: Web Push (VAPID) y FCM nativo (Firebase Cloud Messaging v1 API)
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import webpush from 'https://esm.sh/web-push@3.6.7?target=deno';

const SUPABASE_URL         = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const VAPID_PUBLIC_KEY     = Deno.env.get('VAPID_PUBLIC_KEY') ?? '';
const VAPID_PRIVATE_KEY    = Deno.env.get('VAPID_PRIVATE_KEY') ?? '';
const VAPID_SUBJECT        = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:publihazclick.com@gmail.com';
const FCM_PROJECT_ID       = Deno.env.get('FCM_PROJECT_ID') ?? '';
const FCM_SERVICE_ACCOUNT  = Deno.env.get('FCM_SERVICE_ACCOUNT') ?? ''; // JSON de service account (raw)

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type' };
function json(d: unknown, s = 200) { return new Response(JSON.stringify(d), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } }); }

// ── OAuth2 access token desde service account (FCM HTTP v1) ─────────────────
let cachedToken: { value: string; exp: number } | null = null;
async function getFcmAccessToken(): Promise<string | null> {
  if (!FCM_SERVICE_ACCOUNT) return null;
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.exp > now + 60) return cachedToken.value;

  const sa = JSON.parse(FCM_SERVICE_ACCOUNT);
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  };
  const b64 = (s: string) => btoa(s).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const unsigned = `${b64(JSON.stringify(header))}.${b64(JSON.stringify(payload))}`;

  // Import private key (PEM → PKCS8 → CryptoKey)
  const pem = sa.private_key.replace(/-----BEGIN PRIVATE KEY-----/, '').replace(/-----END PRIVATE KEY-----/, '').replace(/\s+/g, '');
  const pkcs8 = Uint8Array.from(atob(pem), c => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('pkcs8', pkcs8, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const sigBuf = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsigned));
  const sig = b64(String.fromCharCode(...new Uint8Array(sigBuf)));
  const jwt = `${unsigned}.${sig}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });
  if (!res.ok) { console.error('[fcm oauth]', await res.text()); return null; }
  const { access_token, expires_in } = await res.json();
  cachedToken = { value: access_token, exp: now + (expires_in ?? 3600) };
  return access_token;
}

let _lastFcmDebug: string | null = null;
// Bug real encontrado 2026-07-31: los tokens invalidos (UNREGISTERED/404, dispositivo
// reinstalo la app o el token roto) nunca se borraban de ag_push_subs -- el token de FCM SI
// rota con cada reinstalo/rebuild del APK, asi que en una sesion de pruebas con varios installs
// (como esta) se acumulan decenas de filas muertas por usuario, desperdiciando envios y
// arriesgando que el "debug" final oculte el error real de un token que si importaba. Ahora
// sendFcm devuelve si el fallo fue por token no registrado para que el caller lo borre.
async function sendFcm(token: string, title: string, body: string, data: Record<string, string>): Promise<'ok' | 'unregistered' | 'error'> {
  const access = await getFcmAccessToken();
  if (!access || !FCM_PROJECT_ID) { _lastFcmDebug = `no access token or project id (access=${!!access}, project=${FCM_PROJECT_ID})`; return 'error'; }
  // CAMBIO 2026-07-30 (pedido explicito del usuario): mensaje 100% "data" (sin bloque
  // `notification`) a proposito. Un FCM con `notification` deja que Android muestre la
  // notificacion automaticamente pero SOLO invoca el codigo de la app (onMessageReceived) si la
  // app esta en primer plano -- con la app minimizada o cerrada, Android jamas ejecuta nuestro
  // codigo, asi que era imposible mostrarle al conductor el modal visual de la solicitud (solo
  // sonaba la notificacion del sistema). Un mensaje solo-data SIEMPRE despierta
  // onMessageReceived() en el MoviFirebaseMessagingService nativo, sea cual sea el estado de la
  // app, permitiendo construir ahi una notificacion de pantalla completa (full-screen intent)
  // que abre el modal real -- ver android/app/src/main/java/.../MoviFirebaseMessagingService.kt.
  const res = await fetch(`https://fcm.googleapis.com/v1/projects/${FCM_PROJECT_ID}/messages:send`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${access}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: {
        token,
        data: { ...data, title, body },
        android: { priority: 'HIGH' },
      },
    }),
  });
  if (!res.ok) {
    const txt = await res.text();
    console.error('[fcm send]', res.status, txt);
    _lastFcmDebug = `${res.status}: ${txt.slice(0, 300)}`;
    // 404 UNREGISTERED (o 400 INVALID_ARGUMENT por token con formato invalido) = el token ya no
    // sirve y nunca va a servir de nuevo -- son los unicos casos seguros de borrar sin riesgo de
    // perder un token bueno por un error temporal (ej. 500/503 de FCM).
    const unregistered = res.status === 404 || (res.status === 400 && txt.includes('INVALID_ARGUMENT'));
    return unregistered ? 'unregistered' : 'error';
  }
  return 'ok';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const body = await req.json();
    const userIds: string[] = Array.isArray(body?.user_ids) ? body.user_ids : (body?.user_id ? [body.user_id] : []);
    if (userIds.length === 0) return json({ error: 'user_id(s) requerido' }, 400);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const { data: subs } = await supabase.from('ag_push_subs').select('id, user_id, provider, endpoint, p256dh, auth, fcm_token').in('user_id', userIds);
    if (!subs?.length) return json({ ok: true, sent: 0 });

    // ── Modo cancelar (2026-08-03): pedido explicito del usuario -- quitar de la bandeja la
    // notificacion de una solicitud que ya no esta disponible (cancelada por el pasajero, o
    // aceptada por otro conductor). No muestra nada nuevo: viaja solo con `cancel_tag` en el data
    // payload de FCM, y MoviFirebaseMessagingService.kt (nativo) reconoce ese campo y llama
    // NotificationManager.cancel() sobre el mismo tag con el que se mostro la notificacion
    // original, en vez de construir una notificacion. Solo aplica a FCM (no hay forma definida
    // de cerrar una notificacion Web Push ya mostrada sin un service worker propio para eso).
    if (body?.cancel_tag) {
      const cancelTag = String(body.cancel_tag);
      const fcmSubs = (subs as any[]).filter((s) => s.provider === 'fcm' && s.fcm_token);
      let sent = 0;
      for (const s of fcmSubs) {
        const result = await sendFcm(s.fcm_token, '', '', { cancel_tag: cancelTag });
        if (result === 'ok') {
          sent++;
        } else if (result === 'unregistered') {
          supabase.from('ag_push_subs').delete().eq('id', s.id).then(() => {});
        }
      }
      return json({ ok: true, sent, channels: { fcm: fcmSubs.length, webpush: 0 } });
    }

    const title = body?.title ?? 'Movi';
    const text  = body?.body ?? '';
    const url   = body?.url ?? '/anda-gana';
    const tag   = body?.tag ?? '';
    // trip_id/price/dist: pasados desde el trigger de la DB (migracion ag_notify_drivers_on_trip_request,
    // 2026-07-30) para que el cliente pueda mostrar el modal real de la solicitud sin tener que
    // adivinar/recargar toda la lista -- ver anda-gana.component.ts _showIncomingTripModal.
    const data: Record<string, string> = { url, tag, urgent: body?.urgent ? '1' : '0' };
    if (body?.trip_id) data.trip_id = String(body.trip_id);
    if (body?.price != null) data.price = String(body.price);
    if (body?.dist != null) data.dist = String(body.dist);
    if (body?.origin != null) data.origin = String(body.origin);
    if (body?.dest != null) data.dest = String(body.dest);

    let sent = 0;

    // ── FCM nativos ──
    const fcmSubs = subs.filter((s: any) => s.provider === 'fcm' && s.fcm_token);
    for (const s of fcmSubs as any[]) {
      const result = await sendFcm(s.fcm_token, title, text, data);
      if (result === 'ok') {
        sent++;
        supabase.from('ag_push_subs').update({ last_used_at: new Date().toISOString() }).eq('id', s.id).then(() => {});
      } else if (result === 'unregistered') {
        supabase.from('ag_push_subs').delete().eq('id', s.id).then(() => {});
      }
    }

    // ── Web Push ──
    const wpSubs = subs.filter((s: any) => (s.provider ?? 'webpush') === 'webpush' && s.endpoint);
    if (wpSubs.length && VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
      webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
      const payload = JSON.stringify({ title, body: text, url, tag, urgent: !!body?.urgent });
      for (const s of wpSubs as any[]) {
        try {
          await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } } as any, payload);
          sent++;
          supabase.from('ag_push_subs').update({ last_used_at: new Date().toISOString() }).eq('id', s.id).then(() => {});
        } catch (e: any) {
          if ((e?.statusCode ?? e?.status) === 410 || (e?.statusCode ?? e?.status) === 404) {
            await supabase.from('ag_push_subs').delete().eq('endpoint', s.endpoint);
          }
        }
      }
    }

    return json({ ok: true, sent, channels: { fcm: fcmSubs.length, webpush: wpSubs.length }, debug: _lastFcmDebug });
  } catch (err) {
    return json({ error: 'Error interno', detail: String(err) }, 500);
  }
});
