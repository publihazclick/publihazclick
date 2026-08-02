// Edge Function: ag-verify-driver-background
// Verifica antecedentes (Policía Nacional) + licencia de conducción (RUNT) via Verifik.co
// cuando un conductor se registra. Complementa (no reemplaza) a ag-verify-driver-docs
// (GPT-4o Vision) -- son dos sistemas independientes que escriben en tablas distintas.
//
// Pedido explicito del usuario 2026-08-02: si la verificacion falla (antecedentes reales o
// licencia invalida), el conductor queda RECHAZADO de forma automatica, sin revision humana
// (ver ag_apply_background_check en la migracion 180 -- ese rechazo aplica sin importar el
// status actual, incluso si ag-verify-driver-docs ya habia aprobado).
//
// IMPORTANTE -- pendiente de confirmar antes de pasar a produccion real:
// Verifik no publica el JSON exacto de respuesta en su documentacion publica. Los nombres
// de campo usados abajo (parsePoliceResponse/parseLicenseResponse) son la mejor lectura
// posible de su documentacion en prosa, pero DEBEN confirmarse haciendo una llamada real de
// prueba desde el "Cartero" (su Postman-like) en modo Sandbox antes de activar esto con
// conductores reales -- si el shape real no calza, el parser cae al lado seguro (ver abajo).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL         = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const VERIFIK_API_TOKEN    = Deno.env.get('VERIFIK_API_TOKEN') ?? '';

const VERIFIK_BASE = 'https://api.verifik.co/v2';
// Rutas confirmadas por documentacion/npm package de Verifik. La de RUNT es la menos
// segura de las dos (no se encontro el path final exacto en fuentes publicas) -- confirmar
// con Cartero antes de produccion.
const POLICE_PATH  = '/co/policia/consultar';
const RUNT_PATH     = '/co/runt';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
function json(d: unknown, s = 200) { return new Response(JSON.stringify(d), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } }); }

async function callVerifik(path: string, documentType: string, documentNumber: string): Promise<{ ok: boolean; status: number; data: any }> {
  const url = `${VERIFIK_BASE}${path}?documentType=${encodeURIComponent(documentType)}&documentNumber=${encodeURIComponent(documentNumber)}`;
  const res = await fetch(url, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json', Authorization: VERIFIK_API_TOKEN },
  });
  const data = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, data };
}

/** Lado seguro: si la respuesta no se puede interpretar con confianza, NO se rechaza al
 * conductor (fail-open) -- solo se rechaza cuando el campo de estado legal es explicitamente
 * negativo. Un error de red/parseo nunca debe bloquear a alguien inocente. */
function parsePoliceResponse(data: any): { hasRecord: boolean; confident: boolean } {
  if (!data) return { hasRecord: false, confident: false };
  const raw = JSON.stringify(data).toLowerCase();
  // Campos candidatos vistos en distintas paginas de documentacion de Verifik para este
  // tipo de consulta -- se revisan varios nombres posibles por la falta de spec exacta.
  const status = data.status ?? data.legalStatus ?? data.estado ?? data.result?.status ?? null;
  if (typeof status === 'string') {
    const s = status.toLowerCase();
    if (s.includes('sin') || s.includes('no registra') || s.includes('clean') || s.includes('none')) {
      return { hasRecord: false, confident: true };
    }
    if (s.includes('asuntos pendientes') || s.includes('pending') || s.includes('con antecedentes')) {
      return { hasRecord: true, confident: true };
    }
  }
  // Heurística de respaldo sobre el JSON completo si no se encontró un campo reconocible.
  if (raw.includes('sin antecedentes') || raw.includes('no registra')) return { hasRecord: false, confident: true };
  if (raw.includes('con antecedentes') || raw.includes('asuntos judiciales pendientes')) return { hasRecord: true, confident: true };
  return { hasRecord: false, confident: false };
}

function parseLicenseResponse(data: any): { valid: boolean; confident: boolean } {
  if (!data) return { valid: false, confident: false };
  const status = data.status ?? data.licenseStatus ?? data.estado ?? data.result?.status ?? null;
  if (typeof status === 'string') {
    const s = status.toLowerCase();
    if (s.includes('vigente') || s.includes('active') || s.includes('valid')) return { valid: true, confident: true };
    if (s.includes('vencid') || s.includes('suspend') || s.includes('cancelad') || s.includes('expired')) return { valid: false, confident: true };
  }
  return { valid: false, confident: false };
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
      .select('id, status, id_number')
      .eq('id', driverId)
      .maybeSingle();

    if (error || !drv) return json({ error: 'Conductor no encontrado' }, 404);
    if (!drv.id_number) return json({ ok: true, skipped: true, reason: 'Sin número de documento registrado' });

    const documentType = 'CC'; // Colombia -- ampliar a CE si Movi llega a aceptar extranjeros

    const [policeRes, licenseRes] = await Promise.all([
      callVerifik(POLICE_PATH, documentType, drv.id_number).catch(e => ({ ok: false, status: 0, data: { error: String(e) } })),
      callVerifik(RUNT_PATH, documentType, drv.id_number).catch(e => ({ ok: false, status: 0, data: { error: String(e) } })),
    ]);

    const police = parsePoliceResponse(policeRes.data);
    const license = parseLicenseResponse(licenseRes.data);

    // Solo se rechaza cuando AMBAS consultas respondieron con confianza Y alguna dio
    // resultado negativo. Cualquier duda (respuesta sin interpretar, error de red, timeout)
    // deja al conductor en su status actual -- no se auto-rechaza sobre una suposición.
    let passed = true;
    const reasons: string[] = [];
    if (police.confident && police.hasRecord) { passed = false; reasons.push('Antecedentes judiciales registrados ante la Policía Nacional'); }
    if (license.confident && !license.valid) { passed = false; reasons.push('Licencia de conducción no vigente según el RUNT'); }

    const bothInconclusive = !police.confident && !license.confident;
    if (bothInconclusive) {
      // No se pudo confirmar nada -- se guarda el intento pero no se toca ag_drivers.
      await supabase.rpc('ag_apply_background_check', {
        p_driver_id: driverId,
        p_passed: true,
        p_reason: 'Verificación no concluyente (respuesta de Verifik no interpretada) -- requiere revisión manual',
        p_police: policeRes.data,
        p_license: licenseRes.data,
      });
      return json({ ok: true, inconclusive: true, police_status: policeRes.status, license_status: licenseRes.status });
    }

    await supabase.rpc('ag_apply_background_check', {
      p_driver_id: driverId,
      p_passed: passed,
      p_reason: passed ? null : reasons.join('; '),
      p_police: policeRes.data,
      p_license: licenseRes.data,
    });

    return json({ ok: true, passed, reasons });
  } catch (err) {
    console.error('ag-verify-driver-background:', err);
    return json({ error: 'Error interno', detail: String(err) }, 500);
  }
});
