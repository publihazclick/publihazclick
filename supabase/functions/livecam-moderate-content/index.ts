// Edge Function: livecam-moderate-content
// Analiza contenido exclusivo subido (fotos/videos). Para videos, solo valida thumbnail.
// Flags: underage, violence, weapons, bestiality, illegal.
// Si flags críticos -> status=removed + is_active=false.

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

async function analyze(imageUrl: string): Promise<{ flags: string[]; safe: boolean; reason: string }> {
  if (!OPENAI_API_KEY) return { flags: [], safe: true, reason: 'ai_disabled' };
  const body = {
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: `Eres un moderador de contenido adulto. Analiza la imagen y detecta SOLO estas categorías prohibidas:
- underage (personas que parecen menores de 18)
- violence (violencia gráfica, sangre, armas apuntando)
- weapons (armas)
- bestiality (animales en contexto sexual)
- illegal (cualquier otra actividad ilegal)
El contenido adulto consentido entre adultos NO es un flag.
Responde SOLO JSON: {"flags": ["tag1"], "safe": bool, "reason": "brief"}. safe=true solo si flags vacío.` },
      { role: 'user', content: [
        { type: 'text', text: 'Analiza esta imagen.' },
        { type: 'image_url', image_url: { url: imageUrl, detail: 'low' } },
      ] },
    ],
    response_format: { type: 'json_object' },
    max_tokens: 200,
    temperature: 0,
  };
  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) return { flags: [], safe: true, reason: 'ai_error' };
  try {
    return JSON.parse((await r.json()).choices?.[0]?.message?.content ?? '{"flags":[],"safe":true}');
  } catch {
    return { flags: [], safe: true, reason: 'parse_error' };
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const body = await req.json();
    const contentId = body?.content_id as string;
    if (!contentId) return json({ error: 'content_id requerido' }, 400);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const { data: c } = await supabase.from('livecam_exclusive_content').select('id, media_url, thumbnail_url, content_type').eq('id', contentId).maybeSingle();
    if (!c) return json({ error: 'Contenido no encontrado' }, 404);

    const imgUrl = (c as any).thumbnail_url || (c as any).media_url;
    if (!imgUrl) return json({ error: 'Sin imagen a analizar' }, 400);

    // Firmar URL si es path de storage
    let publicUrl = imgUrl;
    if (!imgUrl.startsWith('http')) {
      const { data } = await supabase.storage.from('livecam-content').createSignedUrl(imgUrl, 600);
      if (data?.signedUrl) publicUrl = data.signedUrl;
    }

    const result = await analyze(publicUrl);
    const criticalFlags = ['underage', 'bestiality', 'illegal'];
    const hasCritical = result.flags.some(f => criticalFlags.includes(f));

    await supabase.from('livecam_exclusive_content').update({
      moderation_status: hasCritical ? 'removed' : (result.flags.length > 0 ? 'flagged' : 'auto_approved'),
      moderation_flags: result.flags,
      moderation_checked_at: new Date().toISOString(),
      is_active: hasCritical ? false : undefined,
    }).eq('id', contentId);

    return json({ ok: true, result });
  } catch (err) {
    console.error('moderate-content error:', err);
    return json({ error: 'Error interno', detail: String(err) }, 500);
  }
});
