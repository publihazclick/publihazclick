// Edge Function: Face swap using Replicate (put user's face on avatar)
const REPLICATE_API_TOKEN = Deno.env.get('REPLICATE_API_TOKEN') ?? '';
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    if (!REPLICATE_API_TOKEN) {
      return new Response(JSON.stringify({ error: 'Replicate not configured' }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    const { source_image, target_image } = await req.json();
    if (!source_image || !target_image) {
      return new Response(JSON.stringify({ error: 'source_image (user face) and target_image (avatar/template) required' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    // Use face-swap model on Replicate
    const resp = await fetch('https://api.replicate.com/v1/predictions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${REPLICATE_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        version: 'cdingram/face-swap:d1d6ea8c8be89d664a07a457526f7128109dee7030fdac424788d762d7f0bfec',
        input: {
          source_image,  // User's face photo
          target_image,  // Avatar/template to put face on
        },
      }),
    });

    if (!resp.ok) {
      const err = await resp.text();
      throw new Error(`Replicate error: ${resp.status} - ${err}`);
    }

    const prediction = await resp.json();

    // If completed immediately
    if (prediction.status === 'succeeded') {
      return new Response(JSON.stringify({
        status: 'completed',
        result_url: prediction.output,
      }), { headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    // Poll for result (max 60 seconds)
    const predictionId = prediction.id;
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 2000));

      const pollResp = await fetch(`https://api.replicate.com/v1/predictions/${predictionId}`, {
        headers: { 'Authorization': `Bearer ${REPLICATE_API_TOKEN}` },
      });
      const pollData = await pollResp.json();

      if (pollData.status === 'succeeded') {
        return new Response(JSON.stringify({
          status: 'completed',
          result_url: pollData.output,
        }), { headers: { ...cors, 'Content-Type': 'application/json' } });
      }

      if (pollData.status === 'failed') {
        throw new Error(pollData.error ?? 'Face swap failed');
      }
    }

    return new Response(JSON.stringify({
      status: 'processing',
      prediction_id: predictionId,
      message: 'Still processing, check back later',
    }), { headers: { ...cors, 'Content-Type': 'application/json' } });

  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });
  }
});
