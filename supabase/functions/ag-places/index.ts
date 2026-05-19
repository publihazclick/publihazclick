import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const { action, query, lat, lng, place_id } = await req.json();
    const KEY = Deno.env.get('GOOGLE_PLACES_KEY') ?? '';

    if (action === 'autocomplete') {
      const params = new URLSearchParams({
        input:      query,
        components: 'country:co',
        language:   'es',
        key:        KEY,
      });
      if (lat && lng) {
        params.set('location', `${lat},${lng}`);
        params.set('radius', '50000');
      }
      const res  = await fetch(`https://maps.googleapis.com/maps/api/place/autocomplete/json?${params}`);
      const json = await res.json();
      return new Response(JSON.stringify(json), {
        headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'details') {
      const params = new URLSearchParams({
        place_id,
        fields: 'geometry,name',
        key:    KEY,
      });
      const res  = await fetch(`https://maps.googleapis.com/maps/api/place/details/json?${params}`);
      const json = await res.json();
      return new Response(JSON.stringify(json), {
        headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'invalid action' }), { status: 400, headers: CORS });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: CORS });
  }
});
