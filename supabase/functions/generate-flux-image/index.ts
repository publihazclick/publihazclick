// Edge Function: Generate photorealistic images with Flux Pro via Replicate
const REPLICATE_API_TOKEN = Deno.env.get('REPLICATE_API_TOKEN') ?? '';
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    if (!REPLICATE_API_TOKEN) {
      return new Response(JSON.stringify({ error: 'Replicate not configured' }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    const { prompt, aspect_ratio, num_outputs, negative_prompt } = await req.json();
    if (!prompt) {
      return new Response(JSON.stringify({ error: 'prompt required' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    // Use Flux Schnell (rápido + barato) en el endpoint de modelo oficial de Replicate.
    // El endpoint /v1/predictions requiere un `version` hash; para modelos oficiales
    // usamos /v1/models/{owner}/{model}/predictions que solo necesita el `input`.
    const resp = await fetch('https://api.replicate.com/v1/models/black-forest-labs/flux-schnell/predictions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${REPLICATE_API_TOKEN}`,
        'Content-Type': 'application/json',
        'Prefer': 'wait=60',
      },
      body: JSON.stringify({
        input: {
          prompt,
          aspect_ratio: aspect_ratio ?? '16:9',
          num_outputs: Math.min(num_outputs ?? 1, 4),
          output_format: 'webp',
          output_quality: 90,
          ...(negative_prompt ? { negative_prompt } : {}),
        },
      }),
    });

    if (!resp.ok) {
      const err = await resp.text();
      console.error('[flux] replicate error:', resp.status, err);
      throw new Error(`Replicate Flux error: ${resp.status} - ${err.substring(0, 300)}`);
    }

    const prediction = await resp.json();

    // Si Replicate ya terminó durante el Prefer:wait, devolvemos inmediato
    if (prediction.status === 'succeeded') {
      const output = Array.isArray(prediction.output) ? prediction.output : [prediction.output];
      return new Response(JSON.stringify({ status: 'completed', images: output }), {
        headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }
    if (prediction.status === 'failed') {
      throw new Error(prediction.error ?? 'Image generation failed');
    }

    // Fallback: polling por si no terminó dentro del wait
    const predictionUrl = prediction.urls?.get ?? `https://api.replicate.com/v1/predictions/${prediction.id}`;
    for (let i = 0; i < 25; i++) {
      await new Promise(r => setTimeout(r, 1500));
      const pollResp = await fetch(predictionUrl, {
        headers: { 'Authorization': `Bearer ${REPLICATE_API_TOKEN}` },
      });
      const pollData = await pollResp.json();

      if (pollData.status === 'succeeded') {
        const output = Array.isArray(pollData.output) ? pollData.output : [pollData.output];
        return new Response(JSON.stringify({ status: 'completed', images: output }), {
          headers: { ...cors, 'Content-Type': 'application/json' },
        });
      }
      if (pollData.status === 'failed' || pollData.status === 'canceled') {
        throw new Error(pollData.error ?? 'Image generation failed');
      }
    }

    return new Response(JSON.stringify({
      status: 'processing',
      prediction_id: predictionId,
    }), { headers: { ...cors, 'Content-Type': 'application/json' } });

  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });
  }
});
