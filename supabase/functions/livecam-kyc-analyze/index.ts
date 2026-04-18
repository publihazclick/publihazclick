// =============================================================================
// Edge Function: livecam-kyc-analyze
// Analiza documento de identidad + selfie de una modelo usando OpenAI Vision.
// Devuelve score, flags y recomendación. Admin revisa casos de manual_review.
// =============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL         = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const OPENAI_API_KEY       = Deno.env.get('OPENAI_API_KEY') ?? '';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
};
function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}

async function signedUrl(supabase: any, path: string): Promise<string | null> {
  if (!path) return null;
  const { data } = await supabase.storage.from('livecam-documents').createSignedUrl(path, 600);
  return data?.signedUrl ?? null;
}

interface KycReport {
  document_looks_genuine: boolean;
  estimated_age: number | null;
  is_over_18: boolean;
  selfie_matches_document: boolean;
  notes: string[];
  red_flags: string[];
  overall_score: number; // 0-100
  recommendation: 'auto_approve' | 'auto_reject' | 'manual_review';
}

async function analyzeWithOpenAI(docUrl: string, selfieUrl: string | null): Promise<KycReport | null> {
  if (!OPENAI_API_KEY) return null;
  const images: any[] = [{ type: 'image_url', image_url: { url: docUrl, detail: 'high' } }];
  if (selfieUrl) images.push({ type: 'image_url', image_url: { url: selfieUrl, detail: 'high' } });

  const system = `Eres un sistema KYC profesional de verificación de identidad.
Analiza: 1) documento de identidad, 2) selfie con documento (si se proporciona).
Determina si:
- El documento parece auténtico (no fotocopia, no editado obviamente)
- La persona del documento es mayor de 18 años (crítico; si hay duda, marca is_over_18=false)
- La cara del selfie coincide razonablemente con la foto del documento
- Hay red flags (rostro oculto, documento borroso, luces raras, foto de pantalla)

Devuelve SOLO JSON válido con estas keys exactas:
document_looks_genuine (bool), estimated_age (int o null), is_over_18 (bool),
selfie_matches_document (bool), notes (array strings),
red_flags (array strings), overall_score (0-100), recommendation (auto_approve|auto_reject|manual_review).

Recomendación auto_approve SOLO si: genuine=true, is_over_18=true, selfie_matches=true, red_flags vacío, score>=85.
Recomendación auto_reject si: is_over_18=false o red_flags incluye claros indicios de fraude.
Else manual_review.`;

  const body = {
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: [
        { type: 'text', text: selfieUrl ? 'Imagen 1: documento. Imagen 2: selfie con documento.' : 'Imagen: documento de identidad.' },
        ...images,
      ] },
    ],
    response_format: { type: 'json_object' },
    max_tokens: 600,
    temperature: 0,
  };

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) { console.error('[openai]', res.status, await res.text()); return null; }
  const out = await res.json();
  try {
    return JSON.parse(out.choices?.[0]?.message?.content ?? '{}') as KycReport;
  } catch (e) {
    console.error('parse error', e);
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const body = await req.json();
    const userId = body?.user_id as string;
    if (!userId) return json({ error: 'user_id requerido' }, 400);

    if (!OPENAI_API_KEY) return json({ error: 'OPENAI_API_KEY no configurada' }, 500);
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    const { data: profile } = await supabase.from('livecam_profiles').select('document_photo_url, selfie_photo_url, email').eq('id', userId).maybeSingle();
    if (!profile) return json({ error: 'Profile no encontrado' }, 404);

    const docUrl = await signedUrl(supabase, (profile as any).document_photo_url);
    const selfieUrl = await signedUrl(supabase, (profile as any).selfie_photo_url);
    if (!docUrl) return json({ error: 'Documento no subido' }, 400);

    const report = await analyzeWithOpenAI(docUrl, selfieUrl);
    if (!report) return json({ error: 'Fallo análisis AI' }, 502);

    const status = report.recommendation === 'auto_approve' ? 'auto_approved' :
                   report.recommendation === 'auto_reject' ? 'auto_rejected' : 'manual_review';

    await supabase.from('livecam_profiles').update({
      kyc_status: status,
      kyc_score: report.overall_score,
      kyc_ai_report: report,
      kyc_processed_at: new Date().toISOString(),
      is_age_verified: report.is_over_18,
    }).eq('id', userId);

    return json({ ok: true, status, report });
  } catch (err) {
    console.error('kyc-analyze error:', err);
    return json({ error: 'Error interno', detail: String(err) }, 500);
  }
});
