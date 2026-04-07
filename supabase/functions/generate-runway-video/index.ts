// Edge Function: Generate video from image using Runway ML Gen-3 Alpha
const RUNWAY_API_KEY = Deno.env.get('RUNWAY_API_KEY') ?? '';
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    if (!RUNWAY_API_KEY) {
      return new Response(JSON.stringify({ error: 'Runway ML not configured' }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    const { image_url, prompt, duration, ratio } = await req.json();
    if (!prompt) {
      return new Response(JSON.stringify({ error: 'prompt required' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    const body: Record<string, unknown> = {
      promptText: prompt,
      model: 'gen3a_turbo',
      duration: duration ?? 5,
      ratio: ratio ?? '16:9',
    };

    // If image provided, use image-to-video mode
    if (image_url) {
      body.promptImage = image_url;
    }

    const resp = await fetch('https://api.dev.runwayml.com/v1/image_to_video', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RUNWAY_API_KEY}`,
        'Content-Type': 'application/json',
        'X-Runway-Version': '2024-11-06',
      },
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const err = await resp.text();
      throw new Error(`Runway API error: ${resp.status} - ${err}`);
    }

    const data = await resp.json();

    return new Response(JSON.stringify({
      task_id: data.id,
      status: data.status ?? 'PENDING',
      message: 'Video generation started',
    }), {
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });
  }
});
