// Edge Function: Clone voice with ElevenLabs (Instant Voice Cloning)
const ELEVENLABS_API_KEY = Deno.env.get('ELEVENLABS_API_KEY') ?? '';
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    if (!ELEVENLABS_API_KEY) {
      return new Response(JSON.stringify({ error: 'ElevenLabs not configured' }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    const formData = await req.formData();
    const name = formData.get('name') as string;
    const audioFile = formData.get('audio') as File;
    const description = formData.get('description') as string ?? 'Cloned voice from PubliHazClick';

    if (!name || !audioFile) {
      return new Response(JSON.stringify({ error: 'name and audio file required' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    // Forward to ElevenLabs
    const cloneForm = new FormData();
    cloneForm.append('name', name);
    cloneForm.append('description', description);
    cloneForm.append('files', audioFile, audioFile.name);

    const resp = await fetch('https://api.elevenlabs.io/v1/voices/add', {
      method: 'POST',
      headers: { 'xi-api-key': ELEVENLABS_API_KEY },
      body: cloneForm,
    });

    if (!resp.ok) {
      const err = await resp.text();
      throw new Error(`Voice cloning error: ${resp.status} - ${err}`);
    }

    const data = await resp.json();

    return new Response(JSON.stringify({
      voice_id: data.voice_id,
      name: name,
      message: 'Voice cloned successfully',
    }), {
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });
  }
});
