// Edge Function: ag-verify-driver-background
// Verifica antecedentes judiciales + licencia de conducción (RUNT) via Verifik.co cuando un
// conductor se registra. Complementa (no reemplaza) a ag-verify-driver-docs (GPT-4o Vision)
// -- son dos sistemas independientes que escriben en tablas distintas.
//
// Pedido explicito del usuario 2026-08-02: si la verificacion falla (expediente judicial real
// o licencia invalida), el conductor queda RECHAZADO de forma automatica, sin revision humana
// (ver ag_apply_background_check en la migracion 180 -- ese rechazo aplica sin importar el
// status actual, incluso si ag-verify-driver-docs ya habia aprobado).
//
// Antecedentes judiciales -- endpoint y shape CONFIRMADOS 2026-08-02 leyendo la documentacion
// real de Verifik directo en su "Cartero" (su Postman-like) en modo Sandbox:
//   GET /co/rama/juzgado/expedientes?documentType=CC&documentNumber=...&city=...
//   Auth: header "Authorization: Bearer <token>" (con el prefijo "Bearer ", a diferencia de
//   otros ejemplos de Verifik vistos antes en fuentes de terceros que lo omitian).
//   200 + data.filingNumber presente => SI tiene expediente judicial (posible antecedente).
//   404                              => NO tiene expediente (limpio) -- el "buen" resultado
//                                        es literalmente un 404, no un 200.
//   409 o cualquier otro status      => resultado ambiguo, no se usa para decidir.
//
// Licencia RUNT -- SIN CONFIRMAR todavia (pendiente repetir el mismo proceso de verificacion
// en el Cartero para el endpoint de licencia). Mientras tanto queda deshabilitada a proposito
// (ver checkLicense) para no arriesgar un rechazo basado en una suposicion no verificada.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL         = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const VERIFIK_API_TOKEN    = Deno.env.get('VERIFIK_API_TOKEN') ?? '';

const VERIFIK_BASE = 'https://api.verifik.co/v2';
const JUDICIAL_PATH = '/co/rama/juzgado/expedientes';

// Ciudades/circuitos judiciales aceptados por el endpoint, segun su propia documentacion.
// Se normaliza (mayusculas, sin tildes) para comparar contra la ciudad registrada del
// conductor y solo se envia el parametro "city" cuando hay una coincidencia exacta --
// si no coincide con ninguna, se omite el parametro y la consulta corre sin filtro de ciudad
// en vez de adivinar/forzar un valor incorrecto.
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

/** hasRecord=true solo cuando Verifik confirmo un expediente real (200 + filingNumber).
 * confident=true solo en 200-con-expediente o 404 (los dos casos documentados) -- cualquier
 * otro status (409, 5xx, error de red) deja confident=false y por lo tanto NO rechaza a nadie
 * (fail-open, ver el uso mas abajo). */
async function checkJudicialRecords(documentNumber: string, city: string | null): Promise<{ hasRecord: boolean; confident: boolean; status: number; raw: any }> {
  const params = new URLSearchParams({ documentType: 'CC', documentNumber });
  if (city) params.set('city', city);
  const url = `${VERIFIK_BASE}${JUDICIAL_PATH}?${params.toString()}`;

  const res = await fetch(url, {
    method: 'GET',
    headers: { Accept: 'application/json', Authorization: `Bearer ${VERIFIK_API_TOKEN}` },
  });
  const data = await res.json().catch(() => null);

  if (res.status === 200 && data?.data?.filingNumber) {
    return { hasRecord: true, confident: true, status: res.status, raw: data };
  }
  if (res.status === 404) {
    return { hasRecord: false, confident: true, status: res.status, raw: data };
  }
  return { hasRecord: false, confident: false, status: res.status, raw: data };
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
    const judicial = await checkJudicialRecords(drv.id_number, city).catch(e => ({
      hasRecord: false, confident: false, status: 0, raw: { error: String(e) },
    }));

    if (!judicial.confident) {
      // Respuesta ambigua (409, error de red, etc.) -- se guarda el intento pero NO se
      // toca ag_drivers. Requiere revisión manual eventual, no un rechazo automático.
      await supabase.rpc('ag_apply_background_check', {
        p_driver_id: driverId,
        p_passed: true,
        p_reason: 'Verificación de antecedentes no concluyente (Verifik respondió ' + judicial.status + ') -- requiere revisión manual',
        p_police: judicial.raw,
        p_license: null,
      });
      return json({ ok: true, inconclusive: true, status: judicial.status });
    }

    const passed = !judicial.hasRecord;
    await supabase.rpc('ag_apply_background_check', {
      p_driver_id: driverId,
      p_passed: passed,
      p_reason: passed ? null : 'Registra expediente judicial ante la Rama Judicial de Colombia',
      p_police: judicial.raw,
      p_license: null,
    });

    return json({ ok: true, passed, has_judicial_record: judicial.hasRecord });
  } catch (err) {
    console.error('ag-verify-driver-background:', err);
    return json({ error: 'Error interno', detail: String(err) }, 500);
  }
});
