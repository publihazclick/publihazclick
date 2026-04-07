// Edge Function: Generate TTS audio with ElevenLabs
const ELEVENLABS_API_KEY = Deno.env.get('ELEVENLABS_API_KEY') ?? '';
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    if (!ELEVENLABS_API_KEY) {
      return new Response(JSON.stringify({ error: 'ElevenLabs not configured' }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    const { text, voice_id, model_id, stability, similarity_boost } = await req.json();
    if (!text || !voice_id) {
      return new Response(JSON.stringify({ error: 'text and voice_id required' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    const resp = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice_id}`, {
      method: 'POST',
      headers: {
        'xi-api-key': ELEVENLABS_API_KEY,
        'Content-Type': 'application/json',
        'Accept': 'audio/mpeg',
      },
      body: JSON.stringify({
        text,
        model_id: model_id ?? 'eleven_multilingual_v2',
        voice_settings: {
          stability: stability ?? 0.5,
          similarity_boost: similarity_boost ?? 0.75,
        },
      }),
    });

    if (!resp.ok) {
      const err = await resp.text();
      throw new Error(`ElevenLabs TTS error: ${resp.status} - ${err}`);
    }

    // Return audio as base64 data URL
    const audioBuffer = await resp.arrayBuffer();
    const base64 = btoa(String.fromCharCode(...new Uint8Array(audioBuffer)));
    const dataUrl = `data:audio/mpeg;base64,${base64}`;

    return new Response(JSON.stringify({ audio_url: dataUrl, chars_used: text.length }), {
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });
  }
});
