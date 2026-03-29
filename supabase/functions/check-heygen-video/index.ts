// =============================================================================
// Edge Function: check-heygen-video
// Consulta el estado de un video en HeyGen y devuelve la URL cuando está listo.
// Deploy con: --no-verify-jwt
// =============================================================================

const HEYGEN_API_KEY = Deno.env.get('HEYGEN_API_KEY') ?? '';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    if (!HEYGEN_API_KEY) return json({ error: 'HeyGen API key no configurada' }, 500);

    const body = await req.json().catch(() => null);
    const videoId = body?.video_id;
    if (!videoId) return json({ error: 'video_id requerido' }, 400);

    const res = await fetch(`https://api.heygen.com/v1/video_status.get?video_id=${videoId}`, {
      headers: { 'X-Api-Key': HEYGEN_API_KEY },
    });

    const data = await res.json();

    if (!res.ok || data.error) {
      return json({ error: data.error?.message ?? 'Error al consultar estado' }, 500);
    }

    const status = data.data?.status;
    const videoUrl = data.data?.video_url;
    const thumbnailUrl = data.data?.thumbnail_url;

    return json({
      video_id: videoId,
      status,
      video_url: videoUrl ?? null,
      thumbnail_url: thumbnailUrl ?? null,
    });

  } catch (err) {
    console.error('Error:', err);
    return json({ error: 'Error interno' }, 500);
  }
});
