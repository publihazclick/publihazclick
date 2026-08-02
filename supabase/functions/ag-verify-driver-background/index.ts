// Edge Function: ag-verify-driver-background
// Verifica antecedentes judiciales + licencia de conducción (RUNT) via Verifik.co cuando un
// conductor se registra. Complementa (no reemplaza) a ag-verify-driver-docs (GPT-4o Vision)
// -- son dos sistemas independientes que escriben en tablas distintas.
//
// Pedido explicito del usuario 2026-08-02: si la verificacion falla (expediente judicial real
// o licencia invalida/inexistente), el conductor queda RECHAZADO de forma automatica, sin
// revision humana (ver ag_apply_background_check en la migracion 180 -- ese rechazo aplica sin
// importar el status actual, incluso si ag-verify-driver-docs ya habia aprobado).
//
// Ambos endpoints (antecedentes judiciales y licencia RUNT) fueron CONFIRMADOS 2026-08-02
// leyendo la documentacion real de Verifik directo en su "Cartero" (su Postman-like) en modo
// Sandbox -- ninguno es una suposicion.
//
// Antecedentes judiciales: GET /co/rama/juzgado/expedientes?documentType=CC&documentNumber=...&city=...
//   200 + data.filingNumber presente => SI tiene expediente judicial (posible antecedente).
//   404                              => NO tiene expediente (limpio) -- el "buen" resultado
//                                        es literalmente un 404, no un 200.
//   409/5xx/error de red             => ambiguo, no se usa para decidir (fail-open).
//
// Licencia RUNT: GET /co/runt/conductor?documentType=CC&documentNumber=...
//   OJO -- logica INVERTIDA respecto al endpoint anterior:
//   200 + al menos una licencia con status "ACTIVA" y no vencida => licencia valida.
//   404                                                          => NO existe registro de
//                                                                    licencia para ese documento
//                                                                    (nunca la sacó, o el
//                                                                    numero no corresponde) --
//                                                                    aqui el "malo" es el 404.
//   409/5xx/error de red                                         => ambiguo, fail-open.
//
// Auth de ambos: header "Authorization: Bearer <token>" (con el prefijo "Bearer " explicito).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL         = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const VERIFIK_API_TOKEN    = Deno.env.get('VERIFIK_API_TOKEN') ?? '';

const VERIFIK_BASE = 'https://api.verifik.co/v2';
const JUDICIAL_PATH = '/co/rama/juzgado/expedientes';
const LICENSE_PATH  = '/co/runt/conductor';

// Ciudades/circuitos judiciales aceptados por el endpoint de antecedentes, segun su propia
// documentacion. Se normaliza (mayusculas, sin tildes) para comparar contra la ciudad
// registrada del conductor y solo se envia el parametro "city" cuando hay una coincidencia
// exacta -- si no coincide con ninguna, se omite el parametro en vez de forzar un valor
// incorrecto. (El endpoint de licencia RUNT no usa este parametro.)
const JUDICIAL_CITIES: Record<string, string> = {
  'BOGOTA': 'BOGOTÁ', 'VILLAVICENCIO': 'VILLAVICENCIO', 'TUNJA': 'TUNJA', 'QUIBDO': 'QUIBDO',
  'CALIFORNIA': 'CALIFORNIA', 'POPAYAN': 'POPAYÁN', 'PASTO': 'PASTO', 'PALMIRA': 'PALMIRA',
  'NEIVA': 'NEIVA', 'MEDELLIN': 'MEDELLÍN', 'MANIZALES': 'MANIZALES', 'IBAGUE': 'IBAGUE',
  'FLORENCIA': 'FLORENCIA', 'BUGA': 'BUGA', 'BUCARAMANGA': 'BUCARAMANGA',
  'BARRANQUILLA': 'BARRANQUILLA', 'ARMENIA': 'ARMENIA',
};
function normalizeCity(city: string | null | undefined): string | null {
  if (!city) return null;
  // NFD separa letra + tilde en dos code points; ̀-ͯ son los diacriticos
  // combinables (incluye la tilde), se eliminan para poder comparar "BOGOTÁ" == "bogota".
  const key = city.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim();
  return JUDICIAL_CITIES[key] ?? null;
}

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
function json(d: unknown, s = 200) { return new Response(JSON.stringify(d), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } }); }

type CheckResult = { ok: boolean; confident: boolean; status: number; raw: any };

/** hasRecord=true solo cuando Verifik confirmo un expediente real (200 + filingNumber).
 * confident=true solo en 200-con-expediente o 404 (los dos casos documentados) -- cualquier
 * otro status (409, 5xx, error de red) deja confident=false (fail-open). */
async function checkJudicialRecords(documentNumber: string, city: string | null): Promise<CheckResult> {
  const params = new URLSearchParams({ documentType: 'CC', documentNumber });
  if (city) params.set('city', city);
  const url = `${VERIFIK_BASE}${JUDICIAL_PATH}?${params.toString()}`;

  const res = await fetch(url, {
    method: 'GET',
    headers: { Accept: 'application/json', Authorization: `Bearer ${VERIFIK_API_TOKEN}` },
  });
  const data = await res.json().catch(() => null);

  if (res.status === 200 && data?.data?.filingNumber) {
    return { ok: false, confident: true, status: res.status, raw: data }; // ok=false -> SI tiene expediente (falla)
  }
  if (res.status === 404) {
    return { ok: true, confident: true, status: res.status, raw: data }; // limpio
  }
  return { ok: false, confident: false, status: res.status, raw: data };
}

/** Convierte fecha DD/MM/YYYY (formato usado por RUNT) a Date. Devuelve null si no matchea. */
function parseRuntDate(s: unknown): Date | null {
  if (typeof s !== 'string') return null;
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  return isNaN(d.getTime()) ? null : d;
}

/** ok=true solo cuando hay al menos una licencia con status "ACTIVA" y fecha de vencimiento
 * futura (o sin fecha parseable, para no rechazar por un formato inesperado). 404 = sin
 * registro de licencia = ok=false (a diferencia del endpoint judicial, aqui el 404 es el
 * resultado MALO). confident=true solo en 200 o 404. */
async function checkLicense(documentNumber: string): Promise<CheckResult> {
  const params = new URLSearchParams({ documentType: 'CC', documentNumber });
  const url = `${VERIFIK_BASE}${LICENSE_PATH}?${params.toString()}`;

  const res = await fetch(url, {
    method: 'GET',
    headers: { Accept: 'application/json', Authorization: `Bearer ${VERIFIK_API_TOKEN}` },
  });
  const data = await res.json().catch(() => null);

  if (res.status === 404) {
    return { ok: false, confident: true, status: res.status, raw: data }; // sin licencia registrada
  }
  if (res.status === 200 && data?.data) {
    const licenses = Array.isArray(data.data.licenses) ? data.data.licenses : [];
    const today = new Date();
    const hasActiveLicense = licenses.some((lic: any) => {
      if (lic?.status !== 'ACTIVA') return false;
      const due = parseRuntDate(lic?.dueDate);
      return due === null || due > today; // sin fecha parseable => no descartar por eso
    });
    return { ok: hasActiveLicense, confident: true, status: res.status, raw: data };
  }
  return { ok: false, confident: false, status: res.status, raw: data };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return json({ error: 'No autorizado' }, 401);

    const body = await req.json().catch(() => null);
    const driverId = body?.driver_id;
    if (!driverId) return json({ error: 'driver_id requerido' }, 400);

    // Sin token real todavia (cuenta Verifik en Sandbox, sin creditos comprados) --
    // no bloquear el registro mientras tanto, solo omitir la verificacion.
    if (!VERIFIK_API_TOKEN) {
      return json({ ok: true, skipped: true, reason: 'VERIFIK_API_TOKEN no configurado todavía' });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    const { data: drv, error } = await supabase
      .from('ag_drivers')
      .select('id, status, id_number, city')
      .eq('id', driverId)
      .maybeSingle();

    if (error || !drv) return json({ error: 'Conductor no encontrado' }, 404);
    if (!drv.id_number) return json({ ok: true, skipped: true, reason: 'Sin número de documento registrado' });

    const city = normalizeCity((drv as any).city);
    const [judicial, license] = await Promise.all([
      checkJudicialRecords(drv.id_number, city).catch(e => ({ ok: false, confident: false, status: 0, raw: { error: String(e) } } as CheckResult)),
      checkLicense(drv.id_number).catch(e => ({ ok: false, confident: false, status: 0, raw: { error: String(e) } } as CheckResult)),
    ]);

    const reasons: string[] = [];
    if (judicial.confident && !judicial.ok) reasons.push('Registra expediente judicial ante la Rama Judicial de Colombia');
    if (license.confident && !license.ok) reasons.push('No tiene una licencia de conducción activa y vigente registrada en el RUNT');

    const anyConfident = judicial.confident || license.confident;
    if (!anyConfident) {
      // Ninguna de las dos consultas se pudo interpretar con confianza -- se guarda el
      // intento pero NO se toca ag_drivers.
      await supabase.rpc('ag_apply_background_check', {
        p_driver_id: driverId,
        p_passed: true,
        p_reason: `Verificación no concluyente (judicial=${judicial.status}, licencia=${license.status}) -- requiere revisión manual`,
        p_police: judicial.raw,
        p_license: license.raw,
      });
      return json({ ok: true, inconclusive: true, judicial_status: judicial.status, license_status: license.status });
    }

    // Rechaza solo por los checks que SI se pudieron confirmar; el que quedo ambiguo no cuenta.
    const passed = reasons.length === 0;
    await supabase.rpc('ag_apply_background_check', {
      p_driver_id: driverId,
      p_passed: passed,
      p_reason: passed ? null : reasons.join('; '),
      p_police: judicial.raw,
      p_license: license.raw,
    });

    return json({ ok: true, passed, reasons });
  } catch (err) {
    console.error('ag-verify-driver-background:', err);
    return json({ error: 'Error interno', detail: String(err) }, 500);
  }
});
