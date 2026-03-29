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

    const res = await fetch('https://api.heygen.com/v2/voices', {
      headers: { 'X-Api-Key': HEYGEN_API_KEY },
    });

    const data = await res.json();
    if (!res.ok) return json({ error: 'Error al obtener voces' }, 500);

    const voices = (data.data?.voices ?? [])
      .filter((v: any) => v.language && v.name)
      .map((v: any) => ({
        voice_id: v.voice_id,
        name: v.name?.trim(),
        gender: v.gender,
        language: v.language,
      }));

    return json({ voices });
  } catch (err) {
    console.error('Error:', err);
    return json({ error: 'Error interno' }, 500);
  }
});
