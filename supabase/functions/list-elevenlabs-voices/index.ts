// Edge Function: List ElevenLabs voices (Spanish optimized)
const ELEVENLABS_API_KEY = Deno.env.get('ELEVENLABS_API_KEY') ?? '';
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    if (!ELEVENLABS_API_KEY) {
      return new Response(JSON.stringify({ error: 'ElevenLabs not configured' }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    const resp = await fetch('https://api.elevenlabs.io/v1/voices', {
      headers: { 'xi-api-key': ELEVENLABS_API_KEY },
    });

    if (!resp.ok) throw new Error(`ElevenLabs API error: ${resp.status}`);
    const data = await resp.json();

    // Filter and format voices, prioritize Spanish
    const voices = (data.voices ?? []).map((v: any) => ({
      voice_id: v.voice_id,
      name: v.name,
      category: v.category, // premade, cloned, generated
      labels: v.labels ?? {},
      preview_url: v.preview_url,
      language: v.labels?.language ?? v.labels?.accent ?? 'unknown',
    }));

    // Sort: Spanish first, then by name
    voices.sort((a: any, b: any) => {
      const aEs = (a.language ?? '').toLowerCase().includes('spanish') ? 0 : 1;
      const bEs = (b.language ?? '').toLowerCase().includes('spanish') ? 0 : 1;
      if (aEs !== bEs) return aEs - bEs;
      return a.name.localeCompare(b.name);
    });

    return new Response(JSON.stringify({ voices }), {
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });
  }
});
