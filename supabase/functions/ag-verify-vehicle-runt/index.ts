// Edge Function: ag-verify-vehicle-runt
//
// Pedido explicito del usuario 2026-08-21: muchos conductores no tienen SOAT/tecnomecanica en
// físico para fotografiar, solo pueden consultarlos en línea -- en vez de depender de que suban
// una foto/captura/PDF (ver el aviso agregado el mismo día en el formulario), esta función
// consulta el RUNT directo vía Verifik.co por placa + cédula del dueño del vehículo, y si SOAT
// y/o tecnomecánica salen vigentes, los marca como verificados sin necesitar ninguna foto.
//
// Investigado y confirmado 2026-08-21 leyendo la documentación real de Verifik (no adivinado):
//   GET https://api.verifik.co/v2/co/runt/vehiculo?documentType=CC&documentNumber=...&plate=...
//   Requiere documentType+documentNumber+plate -- el documento es el del DUEÑO del vehículo, que
//   no siempre es el conductor (carros financiados/familiares/alquilados) -- por eso el body
//   acepta owner_document_type/owner_document_number opcionales; si no vienen, se usa la cédula
//   del propio conductor (el caso más común, dueño = conductor).
//   200 => { soat: { valid, dueDate, expeditionDate, soatNumber }, techReview: { valid, dueDate,
//            expeditionDate, reviewNumber }, vehicleInformation: {...} }
//   404 => vehículo/combinación placa+documento no encontrada en RUNT (no es error, solo "no se
//          pudo verificar automático" -- cae al flujo manual existente).
//
// Dos modos:
//   1. Con vehicle_id: el vehículo ya existe en ag_driver_vehicles (conductor ya registrado, o
//      completando "Mis documentos") -- si SOAT/RTM salen vigentes, se escriben directo en
//      ag_vehicle_documents (status='approved', sin necesidad de foto).
//   2. Sin vehicle_id, con plate en el body: usado DURANTE el registro inicial, antes de que
//      exista ninguna fila de vehículo todavía -- solo se devuelve el resultado (fechas/números)
//      para que el frontend los guarde en el formulario y los persista él mismo al completar el
//      registro (ver registerDriver() en anda-gana.service.ts).
//
// Fail-open en todo: si el token no está configurado, si Verifik no encuentra el vehículo, o si
// la consulta falla por cualquier motivo, se devuelve found=false / skipped=true -- NUNCA se
// bloquea el registro ni la subida manual de documentos por esto, es un atajo opcional.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL         = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const VERIFIK_API_TOKEN    = Deno.env.get('VERIFIK_API_TOKEN') ?? '';

const VERIFIK_BASE = 'https://api.verifik.co/v2';
const VEHICLE_PATH = '/co/runt/vehiculo';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
function json(d: unknown, s = 200) { return new Response(JSON.stringify(d), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } }); }

/** Convierte fecha DD/MM/YYYY (formato RUNT/Verifik) a YYYY-MM-DD para guardar en Postgres. */
function toIsoDate(s: unknown): string | null {
  if (typeof s !== 'string') return null;
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

type DocResult = { valid: boolean; expires_at: string | null; number: string | null };

async function queryRunt(plate: string, documentType: string, documentNumber: string): Promise<
  { found: false } | { found: true; soat: DocResult; techReview: DocResult }
> {
  const params = new URLSearchParams({ documentType, documentNumber, plate });
  const url = `${VERIFIK_BASE}${VEHICLE_PATH}?${params.toString()}`;
  const res = await fetch(url, {
    method: 'GET',
    headers: { Accept: 'application/json', Authorization: `Bearer ${VERIFIK_API_TOKEN}` },
  });
  if (res.status === 404) return { found: false };
  if (!res.ok) throw new Error(`Verifik HTTP ${res.status}`);
  const data = await res.json();
  const d = data?.data ?? data; // por si la respuesta viene envuelta en "data" como el resto de endpoints de Verifik

  return {
    found: true,
    soat: {
      valid: !!d?.soat?.valid,
      expires_at: toIsoDate(d?.soat?.dueDate),
      number: d?.soat?.soatNumber ?? null,
    },
    techReview: {
      valid: !!d?.techReview?.valid,
      expires_at: toIsoDate(d?.techReview?.dueDate),
      number: d?.techReview?.reviewNumber ?? null,
    },
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return json({ error: 'No autorizado' }, 401);
    const jwt = authHeader.slice('Bearer '.length);

    const body = await req.json().catch(() => null);
    const driverId = body?.driver_id;
    let vehicleId = body?.vehicle_id ?? null;
    const bodyPlate = typeof body?.plate === 'string' ? body.plate.trim().toUpperCase() : null;
    if (!driverId) return json({ error: 'driver_id requerido' }, 400);

    if (!VERIFIK_API_TOKEN) {
      return json({ ok: true, skipped: true, reason: 'VERIFIK_API_TOKEN no configurado todavía' });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Mismo patron que ag-extract-doc-date: nunca confiar en driver_id tal cual llega del
    // cliente -- verificar que el dueño real de la sesion (el JWT) es el conductor dueño.
    const { data: { user }, error: authErr } = await supabase.auth.getUser(jwt);
    if (authErr || !user) return json({ error: 'Sesión inválida' }, 401);

    const { data: drv, error: drvErr } = await supabase
      .from('ag_drivers')
      .select('id, id_number, ag_users!inner(auth_user_id)')
      .eq('id', driverId)
      .maybeSingle();
    if (drvErr || !drv || (drv as any).ag_users?.auth_user_id !== user.id) {
      return json({ error: 'No autorizado para este conductor' }, 403);
    }

    let plate = bodyPlate;
    if (vehicleId) {
      const { data: veh, error: vehErr } = await supabase
        .from('ag_driver_vehicles').select('id, plate').eq('id', vehicleId).eq('driver_id', driverId).maybeSingle();
      if (vehErr || !veh) return json({ error: 'Vehículo no pertenece a este conductor' }, 403);
      plate = veh.plate;
    } else if (!plate) {
      // Ni vehicle_id ni plate vinieron en el body -- caso "Mis documentos": se resuelve solo
      // el vehículo actual del conductor (is_current=true), así el frontend no necesita saber
      // el vehicle_id de antemano.
      const { data: current } = await supabase
        .from('ag_driver_vehicles').select('id, plate').eq('driver_id', driverId).eq('is_current', true).maybeSingle();
      if (current) { vehicleId = current.id; plate = current.plate; }
    }
    if (!plate) return json({ error: 'No tienes un vehículo activo registrado' }, 400);

    // Por defecto se asume que el vehículo está a nombre del propio conductor (el caso más
    // común) -- el frontend solo manda owner_document_number cuando el conductor indicó
    // explícitamente que el vehículo NO está a su nombre.
    const ownerDocType   = typeof body?.owner_document_type === 'string' ? body.owner_document_type : 'CC';
    const ownerDocNumber = typeof body?.owner_document_number === 'string' && body.owner_document_number.trim()
      ? body.owner_document_number.trim()
      : drv.id_number;
    if (!ownerDocNumber) return json({ ok: true, skipped: true, reason: 'Sin número de documento del dueño del vehículo' });

    let result: Awaited<ReturnType<typeof queryRunt>>;
    try {
      result = await queryRunt(plate, ownerDocType, ownerDocNumber);
    } catch (e) {
      console.error('[ag-verify-vehicle-runt] Verifik error:', e);
      return json({ ok: true, found: false, reason: 'Consulta a RUNT falló, verificación no disponible por ahora' });
    }

    if (!result.found) {
      return json({ ok: true, found: false, reason: 'No se encontró el vehículo en el RUNT con esos datos' });
    }

    // Solo se escribe en la base de datos si ya existe una fila de vehículo real (vehicle_id) --
    // durante el registro inicial (sin vehicle_id todavía) el frontend guarda el resultado y lo
    // persiste él mismo al completar el registro.
    if (vehicleId) {
      if (result.soat.valid && result.soat.expires_at) {
        await supabase.from('ag_vehicle_documents').upsert({
          vehicle_id: vehicleId, driver_id: driverId, doc_type: 'soat',
          expires_at: result.soat.expires_at, number: result.soat.number,
          status: 'approved', rejection_reason: null,
        }, { onConflict: 'vehicle_id,doc_type' });
      }
      if (result.techReview.valid && result.techReview.expires_at) {
        await supabase.from('ag_vehicle_documents').upsert({
          vehicle_id: vehicleId, driver_id: driverId, doc_type: 'tecnomecanica',
          expires_at: result.techReview.expires_at, number: result.techReview.number,
          status: 'approved', rejection_reason: null,
        }, { onConflict: 'vehicle_id,doc_type' });
      }
    }

    return json({ ok: true, found: true, soat: result.soat, techReview: result.techReview });
  } catch (err) {
    console.error('ag-verify-vehicle-runt:', err);
    return json({ error: 'Error interno', detail: String(err) }, 500);
  }
});
