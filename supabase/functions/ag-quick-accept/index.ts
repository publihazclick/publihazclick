// Edge Function: ag-quick-accept -- acepta una solicitud de viaje SIN abrir la app, disparada
// desde el boton "Aceptar" de la notificacion nativa de Android (ver
// android/.../MoviFirebaseMessagingService.kt y AcceptTripReceiver.kt). Pedido explicito del
// usuario 2026-07-30: que el conductor pueda aceptar 100% desde la notificacion, sin ninguna
// redireccion visible a la app.
//
// Replica exactamente las mismas reglas de negocio que submitDriverOffer() en
// anda-gana.component.ts (saldo minimo, comision, estado del conductor) -- si esas reglas
// cambian ahi, hay que cambiarlas aca tambien. Se puso server-side (en vez de duplicar en
// Kotlin) para tener una sola fuente de verdad reusable desde nativo y desde la app.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type' };
function json(d: unknown, s = 200) { return new Response(JSON.stringify(d), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } }); }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ success: false, error: 'Method not allowed' }, 405);

  try {
    const body = await req.json();
    const tripId: string | undefined = body?.trip_id;
    const driverAuthUserId: string | undefined = body?.driver_auth_user_id;
    if (!tripId || !driverAuthUserId) return json({ success: false, error: 'trip_id y driver_auth_user_id son requeridos' }, 400);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    const { data: req_, error: reqErr } = await supabase
      .from('ag_trip_requests')
      .select('id, status, offered_price, passenger_user_id, ag_users!passenger_user_id(auth_user_id, full_name)')
      .eq('id', tripId)
      .maybeSingle();
    if (reqErr || !req_) return json({ success: false, error: 'Solicitud no encontrada' }, 404);
    if (req_.status !== 'searching') return json({ success: false, error: 'Esta solicitud ya no está disponible' }, 409);

    const { data: agUser } = await supabase.from('ag_users').select('id, full_name').eq('auth_user_id', driverAuthUserId).maybeSingle();
    if (!agUser) return json({ success: false, error: 'Conductor no encontrado' }, 404);

    const { data: driver } = await supabase
      .from('ag_drivers')
      .select('id, status, wallet_balance, metric_trips_completed')
      .eq('ag_user_id', agUser.id)
      .maybeSingle();
    if (!driver) return json({ success: false, error: 'Conductor no encontrado' }, 404);

    if (driver.status === 'pending_docs') return json({ success: false, error: 'Debes completar tu registro antes de aceptar más viajes' }, 403);
    if (driver.status === 'pending') return json({ success: false, error: 'Tu solicitud está siendo revisada' }, 403);

    const { data: pctRow } = await supabase.from('platform_settings').select('value').eq('key', 'ag_commission_pct').maybeSingle();
    const commissionPct = parseInt(pctRow?.value ?? '0', 10);
    const price = Number(req_.offered_price) || 0;
    const commission = Math.ceil(price * commissionPct / 100);
    const completedTrips = driver.metric_trips_completed ?? 0;
    const walletBalance = Number(driver.wallet_balance) || 0;

    if (driver.status === 'approved') {
      if (walletBalance < 20000) return json({ success: false, error: 'Necesitas mínimo $20.000 en tu billetera' }, 402);
      if (commissionPct > 0 && walletBalance < commission) return json({ success: false, error: 'Saldo insuficiente para cubrir la comisión' }, 402);
    } else if (driver.status === 'quick' && completedTrips >= 1) {
      if (walletBalance < commission) return json({ success: false, error: 'Saldo insuficiente para cubrir la comisión' }, 402);
    }

    const { error: insertErr } = await supabase
      .from('ag_trip_offers')
      .insert({ trip_request_id: tripId, driver_id: driver.id, offered_price: price });
    if (insertErr) return json({ success: false, error: insertErr.message }, 500);

    // Push al pasajero, igual que submitDriverOffer() -- best-effort, no bloquea la respuesta.
    const passAuthId = (req_.ag_users as any)?.auth_user_id;
    if (passAuthId) {
      const driverName = agUser.full_name ?? 'Un conductor';
      fetch(`${SUPABASE_URL}/functions/v1/ag-send-push`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` },
        body: JSON.stringify({
          user_ids: [passAuthId],
          title: `🚗 ${driverName} te hizo una oferta`,
          body: `Te ofrece ${price} COP. ¡Tienes 4 min para aceptar!`,
          tag: `offer-${tripId}`,
          urgent: true,
        }),
      }).catch(() => {});
    }

    return json({ success: true, price });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Error desconocido';
    return json({ success: false, error: message }, 500);
  }
});
