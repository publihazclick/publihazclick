const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const { action, query, lat, lng } = await req.json();

    if (action === 'search' || action === 'autocomplete') {
      const params = new URLSearchParams({
        q:               query,
        countrycodes:    'co',
        format:          'json',
        limit:           '6',
        'accept-language': 'es',
        addressdetails:  '0',
        dedupe:          '1',
      });

      if (lat && lng) {
        // Bias results toward user location (~50 km viewbox) without hard-bounding
        const d = 0.45;
        params.set('viewbox', `${lng - d},${lat - d},${lng + d},${lat + d}`);
        params.set('bounded', '0');
      }

      const res = await fetch(
        'https://nominatim.openstreetmap.org/search?' + params,
        { headers: { 'User-Agent': 'movi-app/1.0 (publihazclick.com)' } },
      );
      const raw: any[] = await res.json();

      const suggestions = raw.map((r: any) => {
        const parts = r.display_name.split(',');
        const text = parts[0].trim();
        // Build a short place_name: "Name, City, Country"
        const city = parts.find((p: string, i: number) => i > 0 && i < parts.length - 2)?.trim() ?? '';
        const place_name = city ? `${text}, ${city}` : r.display_name.slice(0, 80);
        return {
          place_id:   String(r.place_id),
          text,
          place_name,
          lat:        parseFloat(r.lat),
          lng:        parseFloat(r.lon),
        };
      });

      return new Response(JSON.stringify({ suggestions }), {
        headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    return new Response(
      JSON.stringify({ error: 'invalid action' }),
      { status: 400, headers: CORS },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ error: String(e) }),
      { status: 500, headers: CORS },
    );
  }
});
