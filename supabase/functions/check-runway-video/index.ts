// Edge Function: Check Runway ML video generation status
const RUNWAY_API_KEY = Deno.env.get('RUNWAY_API_KEY') ?? '';
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    if (!RUNWAY_API_KEY) {
      return new Response(JSON.stringify({ error: 'Runway ML not configured' }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    const { task_id } = await req.json();
    if (!task_id) {
      return new Response(JSON.stringify({ error: 'task_id required' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    const resp = await fetch(`https://api.dev.runwayml.com/v1/tasks/${task_id}`, {
      headers: {
        'Authorization': `Bearer ${RUNWAY_API_KEY}`,
        'X-Runway-Version': '2024-11-06',
      },
    });

    if (!resp.ok) {
      const err = await resp.text();
      throw new Error(`Runway status error: ${resp.status} - ${err}`);
    }

    const data = await resp.json();

    return new Response(JSON.stringify({
      task_id: data.id,
      status: data.status, // PENDING, THROTTLED, RUNNING, SUCCEEDED, FAILED
      progress: data.progress ?? 0,
      video_url: data.output?.[0] ?? null,
      failure: data.failure ?? null,
    }), {
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });
  }
});
