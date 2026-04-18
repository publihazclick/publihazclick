// Edge Function: ag-verify-driver-docs
// Valida automáticamente los documentos subidos por un conductor usando GPT-4o Vision.
// Extrae datos de: cédula (anverso/reverso), selfie con cédula, licencia de conducción,
// SOAT, tarjeta de propiedad. Verifica consistencia cruzada y vigencia.
// Aprueba automáticamente si score >= 85 y sin flags críticos.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL         = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const OPENAI_API_KEY       = Deno.env.get('OPENAI_API_KEY') ?? '';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
function json(d: unknown, s = 200) { return new Response(JSON.stringify(d), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } }); }

type DriverDocs = {
  id_number: string | null;
  id_front_url: string | null;
  id_back_url: string | null;
  selfie_with_id_url: string | null;
  license_number: string | null;
  license_photo_url: string | null;
  license_back_url: string | null;
  license_expiry: string | null;
  license_category: string | null;
  soat_photo_url: string | null;
  soat_expiry: string | null;
  tecno_photo_url: string | null;
  tecno_expiry: string | null;
  property_card_front_url: string | null;
  property_card_back_url: string | null;
  vehicle_plate: string | null;
  vehicle_brand: string | null;
  vehicle_model: string | null;
  vehicle_year: number | null;
  vehicle_color: string | null;
};

async function callGptVision(docs: DriverDocs, declaredName: string | null): Promise<any> {
  // Construir el array de imágenes que existen
  const images: { role: string; url: string }[] = [];
  if (docs.id_front_url)         images.push({ role: 'Cédula — anverso',                    url: docs.id_front_url });
  if (docs.id_back_url)          images.push({ role: 'Cédula — reverso',                    url: docs.id_back_url });
  if (docs.selfie_with_id_url)   images.push({ role: 'Selfie del conductor con su cédula',  url: docs.selfie_with_id_url });
  if (docs.license_photo_url)    images.push({ role: 'Licencia de conducción — anverso',    url: docs.license_photo_url });
  if (docs.license_back_url)     images.push({ role: 'Licencia de conducción — reverso',    url: docs.license_back_url });
  if (docs.soat_photo_url)       images.push({ role: 'SOAT vigente',                        url: docs.soat_photo_url });
  if (docs.tecno_photo_url)      images.push({ role: 'Revisión técnico-mecánica',           url: docs.tecno_photo_url });
  if (docs.property_card_front_url) images.push({ role: 'Tarjeta de propiedad — anverso',   url: docs.property_card_front_url });
  if (docs.property_card_back_url)  images.push({ role: 'Tarjeta de propiedad — reverso',   url: docs.property_card_back_url });

  if (images.length < 4) {
    // No suficientes documentos para validar
    return { score: 0, decision: 'needs_review', flags: ['Documentos insuficientes: se requieren mínimo cédula anverso/reverso, selfie, licencia y SOAT'], extracted: {} };
  }

  const today = new Date().toISOString().split('T')[0];
  const prompt = `Eres un validador oficial de documentos de conductor en Colombia. Analiza estas imágenes y devuelve SOLO un JSON con esta estructura exacta:

{
  "extracted": {
    "id_number": "string|null - número de cédula detectado",
    "full_name": "string|null - nombre completo en la cédula",
    "license_number": "string|null - número de licencia",
    "license_category": "string|null - categoría B1, C1, etc.",
    "license_expiry": "YYYY-MM-DD|null - vencimiento de la licencia",
    "soat_expiry": "YYYY-MM-DD|null - vencimiento del SOAT",
    "tecno_expiry": "YYYY-MM-DD|null",
    "vehicle_plate": "string|null - placa del vehículo",
    "vehicle_brand": "string|null",
    "vehicle_model": "string|null",
    "vehicle_year": "number|null"
  },
  "checks": {
    "id_quality_ok": true/false - la cédula es legible y no es fotocopia ni screenshot,
    "license_quality_ok": true/false,
    "soat_quality_ok": true/false,
    "selfie_matches_id": true/false - el rostro de la selfie coincide con el de la cédula,
    "selfie_is_live": true/false - la selfie es una persona real, no foto de foto,
    "name_consistent": true/false - el nombre en la licencia coincide con el de la cédula,
    "id_number_consistent": true/false - el número de cédula aparece igual en todos los documentos,
    "license_not_expired": true/false - la licencia no está vencida (hoy es ${today}),
    "soat_not_expired": true/false,
    "tecno_not_expired": true/false,
    "license_category_allows_taxi": true/false - la categoría de licencia permite transporte público/servicio (C1, C2, C3 en Colombia),
    "plate_consistent": true/false - la placa coincide entre tarjeta propiedad y SOAT
  },
  "flags": ["lista de razones de alerta si hay problemas"],
  "score": 0-100 - calificación global de confianza en la aprobación
}

Reglas para el score:
- 100: todos los checks true, documentos limpios, vigencias largas, coincidencia perfecta
- 90-99: 1 check menor falso pero sin afectar legalidad
- 70-89: algún check crítico falso o documento vence en menos de 30 días — needs_review
- 40-69: múltiples flags, documentos borrosos, o inconsistencias — needs_review
- 0-39: documento vencido, rostros no coinciden, selfie no-live, placa inconsistente — rejected

Nombre declarado por el conductor: ${declaredName ?? '(no declarado)'}.

NO escribas nada fuera del JSON.`;

  const content: any[] = [{ type: 'text', text: prompt }];
  for (const img of images) {
    content.push({ type: 'text', text: `\n--- ${img.role} ---` });
    content.push({ type: 'image_url', image_url: { url: img.url, detail: 'high' } });
  }

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4o',
      response_format: { type: 'json_object' },
      messages: [{ role: 'user', content }],
      max_tokens: 1500,
      temperature: 0.1,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    console.error('[openai]', res.status, err);
    throw new Error(`OpenAI error ${res.status}`);
  }
  const data = await res.json();
  const raw = data.choices?.[0]?.message?.content ?? '{}';
  return { ...JSON.parse(raw), _usage: data.usage };
}

function decideFromResult(r: any): { score: number; decision: 'approved'|'needs_review'|'rejected'; flags: string[] } {
  const score = Math.max(0, Math.min(100, Number(r?.score ?? 0)));
  const flags = Array.isArray(r?.flags) ? r.flags.slice(0, 15) : [];
  const c = r?.checks ?? {};

  // Flags críticos que fuerzan rechazo independiente del score
  const critical: string[] = [];
  if (c.selfie_matches_id === false) critical.push('La selfie no coincide con el rostro de la cédula');
  if (c.selfie_is_live === false) critical.push('La selfie parece ser foto de otra foto / no es una persona real');
  if (c.name_consistent === false) critical.push('El nombre de la cédula no coincide con el de la licencia');
  if (c.id_number_consistent === false) critical.push('El número de cédula no coincide entre documentos');
  if (c.license_not_expired === false) critical.push('La licencia de conducción está vencida');
  if (c.soat_not_expired === false) critical.push('El SOAT está vencido');
  if (c.license_category_allows_taxi === false) critical.push('La categoría de la licencia no permite servicio público/transporte');

  const allFlags = [...critical, ...flags];
  let decision: 'approved'|'needs_review'|'rejected' = 'needs_review';
  if (critical.length > 0 || score < 40) decision = 'rejected';
  else if (score >= 85 && flags.length === 0) decision = 'approved';
  else decision = 'needs_review';

  return { score, decision, flags: allFlags };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  if (!OPENAI_API_KEY) return json({ error: 'OPENAI_API_KEY no configurado' }, 500);

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return json({ error: 'No autorizado' }, 401);

    const body = await req.json().catch(() => null);
    const driverId = body?.driver_id;
    if (!driverId) return json({ error: 'driver_id requerido' }, 400);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Cargar docs + nombre declarado
    const { data: drv, error } = await supabase
      .from('ag_drivers')
      .select(`
        id, ag_user_id, status,
        id_number, id_front_url, id_back_url, selfie_with_id_url,
        license_number, license_photo_url, license_back_url, license_expiry, license_category,
        soat_photo_url, soat_expiry,
        tecno_photo_url, tecno_expiry,
        property_card_front_url, property_card_back_url,
        vehicle_plate, vehicle_brand, vehicle_model, vehicle_year, vehicle_color
      `)
      .eq('id', driverId)
      .maybeSingle();

    if (error || !drv) return json({ error: 'Conductor no encontrado' }, 404);
    if (drv.status && drv.status !== 'pending') {
      return json({ ok: true, skipped: true, reason: `Estado actual: ${drv.status}` });
    }

    const { data: agUser } = await supabase.from('ag_users').select('full_name').eq('id', drv.ag_user_id).maybeSingle();
    const declaredName = (agUser as any)?.full_name ?? null;

    const result = await callGptVision(drv as DriverDocs, declaredName);
    const { score, decision, flags } = decideFromResult(result);

    // Guardar verificación + aplicar decisión
    await supabase.rpc('ag_apply_verification', {
      p_driver_id: driverId,
      p_score: score,
      p_decision: decision,
      p_extracted: result.extracted ?? {},
      p_flags: flags,
    });

    // Si aprobado, enviar push al conductor
    if (decision === 'approved' && drv.ag_user_id) {
      const { data: u } = await supabase.from('ag_users').select('auth_user_id').eq('id', drv.ag_user_id).maybeSingle();
      if ((u as any)?.auth_user_id) {
        supabase.functions.invoke('ag-send-push', {
          body: { user_id: (u as any).auth_user_id, title: '¡Cuenta aprobada!', body: 'Ya puedes ponerte en línea y recibir viajes.', url: '/anda-gana' },
        }).then(() => {}).catch(() => {});
      }
    }

    return json({ ok: true, score, decision, flags, extracted: result.extracted ?? {} });
  } catch (err) {
    console.error('ag-verify-driver-docs:', err);
    return json({ error: 'Error interno', detail: String(err) }, 500);
  }
});
