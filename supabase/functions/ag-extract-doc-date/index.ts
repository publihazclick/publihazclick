// Edge Function: ag-extract-doc-date
// Lee automáticamente la fecha de vencimiento de un documento (licencia, SOAT,
// tecnomecánica, seguro) recién subido por el conductor usando GPT-4o Vision, en vez de
// confiar en la fecha que el conductor escribe a mano en el formulario.
//
// Pedido explícito del usuario 2026-08-05: se dispara en cada subida a "Mis documentos"
// (no solo en el registro inicial), y si la IA logra leer la fecha, esa fecha SIEMPRE
// reemplaza lo que el conductor haya escrito -- si no coincide, gana la IA. Si la imagen
// no se puede leer con confianza, se conserva la fecha manual (fail-open, no bloquear
// la subida por un fallo de lectura).
//
// Distinto de ag-verify-driver-docs (que valida el paquete completo de documentos del
// registro inicial y escribe en ag_driver_verifications): esta función es más chica,
// corre por cada subida individual a ag_driver_documents, y escribe directo en
// ag_driver_documents.expires_at -- lo que alimenta el bloqueo de la migración 193.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL         = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const OPENAI_API_KEY       = Deno.env.get('OPENAI_API_KEY') ?? '';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
function json(d: unknown, s = 200) { return new Response(JSON.stringify(d), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } }); }

const DOC_LABELS: Record<string, string> = {
  license:       'licencia de conducción colombiana',
  soat:          'SOAT (Seguro Obligatorio de Accidentes de Tránsito) colombiano',
  tecnomecanica: 'certificado de Revisión Técnico-Mecánica y de Gases (RTM) colombiano',
  insurance:     'póliza de seguro de responsabilidad civil',
};

async function extractExpiry(fileUrl: string, docType: string): Promise<{ expiry_date: string | null; confidence: 'high' | 'medium' | 'low'; readable: boolean }> {
  const label = DOC_LABELS[docType] ?? 'documento';
  const today = new Date().toISOString().split('T')[0];
  const prompt = `Eres un lector de documentos oficiales de Colombia. La imagen adjunta debería ser un(a) ${label}. Hoy es ${today}.

Devuelve SOLO un JSON con esta estructura exacta, sin texto adicional:
{
  "readable": true/false - si la imagen es legible y corresponde al tipo de documento esperado,
  "expiry_date": "YYYY-MM-DD"|null - fecha de vencimiento/vigencia del documento tal como aparece en la imagen,
  "confidence": "high"|"medium"|"low" - qué tan seguro estás de la fecha extraída
}

Si la imagen está borrosa, no corresponde al documento esperado, o no tiene fecha de vencimiento visible, responde readable=false y expiry_date=null.`;

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4o',
      response_format: { type: 'json_object' },
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          { type: 'image_url', image_url: { url: fileUrl, detail: 'high' } },
        ],
      }],
      max_tokens: 300,
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
  const parsed = JSON.parse(raw);

  const dateOk = typeof parsed.expiry_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(parsed.expiry_date);
  return {
    readable: !!parsed.readable,
    expiry_date: dateOk ? parsed.expiry_date : null,
    confidence: ['high', 'medium', 'low'].includes(parsed.confidence) ? parsed.confidence : 'low',
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  if (!OPENAI_API_KEY) return json({ ok: true, skipped: true, reason: 'OPENAI_API_KEY no configurado' });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return json({ error: 'No autorizado' }, 401);
    const jwt = authHeader.slice('Bearer '.length);

    const body = await req.json().catch(() => null);
    const driverId  = body?.driver_id;
    const docType   = body?.doc_type;
    const fileUrl   = body?.file_url;
    const vehicleId = body?.vehicle_id ?? null;
    if (!driverId || !docType || !fileUrl) return json({ error: 'driver_id, doc_type y file_url son requeridos' }, 400);
    if (!DOC_LABELS[docType]) return json({ error: 'doc_type no soportado' }, 400);
    const VEHICLE_SCOPED = new Set(['soat', 'tecnomecanica', 'insurance', 'vehicle_front', 'vehicle_back']);
    if (VEHICLE_SCOPED.has(docType) && !vehicleId) return json({ error: 'vehicle_id requerido para este tipo de documento' }, 400);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Nunca confiar en driver_id tal cual llega del cliente -- verificar que el dueño real
    // de la sesión (el JWT) es el conductor dueño de ese driver_id, mismo patrón que
    // ag-change-phone.
    const { data: { user }, error: authErr } = await supabase.auth.getUser(jwt);
    if (authErr || !user) return json({ error: 'Sesión inválida' }, 401);

    const { data: drv, error: drvErr } = await supabase
      .from('ag_drivers')
      .select('id, ag_user_id, ag_users!inner(auth_user_id)')
      .eq('id', driverId)
      .maybeSingle();
    if (drvErr || !drv || (drv as any).ag_users?.auth_user_id !== user.id) {
      return json({ error: 'No autorizado para este conductor' }, 403);
    }

    if (vehicleId) {
      const { data: veh } = await supabase.from('ag_driver_vehicles').select('id').eq('id', vehicleId).eq('driver_id', driverId).maybeSingle();
      if (!veh) return json({ error: 'Vehículo no pertenece a este conductor' }, 403);
    }

    const result = await extractExpiry(fileUrl, docType);

    // Solo se escribe si la IA pudo leer el documento -- si no, se conserva lo que el
    // conductor haya escrito a mano (fail-open, no bloquear la subida por esto).
    // soat/tecnomecanica/insurance/vehicle_front/vehicle_back son por vehículo
    // (ag_vehicle_documents); license/cedula/etc. son por conductor (ag_driver_documents).
    if (result.readable && result.expiry_date) {
      if (VEHICLE_SCOPED.has(docType)) {
        await supabase.from('ag_vehicle_documents')
          .update({ expires_at: result.expiry_date })
          .eq('vehicle_id', vehicleId)
          .eq('doc_type', docType);
      } else {
        await supabase.from('ag_driver_documents')
          .update({ expires_at: result.expiry_date })
          .eq('driver_id', driverId)
          .eq('doc_type', docType);
      }
    }

    return json({ ok: true, ...result });
  } catch (err) {
    console.error('ag-extract-doc-date:', err);
    return json({ error: 'Error interno', detail: String(err) }, 500);
  }
});
