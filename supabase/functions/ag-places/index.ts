const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MAPBOX_TOKEN = 'pk.eyJ1IjoiYW5kYWdhbmEiLCJhIjoiY21uMGl2Z2p0MGl5MjJxcHpxbWJqbHk3ZCJ9.nkiJPIKUx4thRAXw_bum3w';

// Only route to Mapbox when the query has an explicit house-number indicator (#, No., or "numero")
// e.g. "Carrera 68H # 74B-32" → Mapbox, "Calle 72 bogota" → Nominatim
function isStreetAddress(q: string): boolean {
  return /#/.test(q) || /\bNo\.?\s*\d/i.test(q);
}

// Clean query for Mapbox: remove "#" and "BARRIO" keyword
function cleanForMapbox(q: string): string {
  return q
    .replace(/#\s*/g, ' ')
    .replace(/\bBARRIO\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

// Clean query for Nominatim: remove house number (# 74B-32) and "BARRIO" keyword
function cleanForNominatim(q: string): string {
  return q
    .replace(/#\s*[\dA-Za-z]+\s*[-–]\s*\d+/g, '')
    .replace(/\bNo\.?\s*[\dA-Za-z]+\s*[-–]\s*\d+/gi, '')
    .replace(/\bBARRIO\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

async function searchMapbox(query: string, lat?: number, lng?: number): Promise<any[]> {
  const cleaned = cleanForMapbox(query);
  const params = new URLSearchParams({
    access_token: MAPBOX_TOKEN,
    country: 'CO',
    language: 'es',
    limit: '6',
    types: 'address,neighborhood,place,poi',
  });
  if (lat && lng) params.set('proximity', `${lng},${lat}`);

  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(cleaned)}.json?${params}`;
  const res = await fetch(url);
  const json = await res.json();

  return (json.features ?? []).map((f: any) => ({
    place_id:   f.id,
    text:       f.text ?? f.place_name.split(',')[0],
    place_name: f.place_name,
    lat:        f.center[1],
    lng:        f.center[0],
  }));
}

async function searchNominatim(query: string, lat?: number, lng?: number): Promise<any[]> {
  const cleaned = cleanForNominatim(query);
  const params = new URLSearchParams({
    q:               cleaned,
    countrycodes:    'co',
    format:          'json',
    limit:           '6',
    'accept-language': 'es',
    addressdetails:  '0',
    dedupe:          '1',
  });
  if (lat && lng) {
    const d = 0.45;
    params.set('viewbox', `${lng - d},${lat - d},${lng + d},${lat + d}`);
    params.set('bounded', '0');
  }

  const res = await fetch(
    'https://nominatim.openstreetmap.org/search?' + params,
    { headers: { 'User-Agent': 'movi-app/1.0 (publihazclick.com)' } },
  );
  const raw: any[] = await res.json();

  return raw.map((r: any) => {
    const parts = r.display_name.split(',');
    const text = parts[0].trim();
    const city = parts.find((_: string, i: number) => i > 0 && i < parts.length - 2)?.trim() ?? '';
    return {
      place_id:   String(r.place_id),
      text,
      place_name: city ? `${text}, ${city}` : r.display_name.slice(0, 80),
      lat:        parseFloat(r.lat),
      lng:        parseFloat(r.lon),
    };
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const { action, query, lat, lng } = await req.json();

    if (action === 'search' || action === 'autocomplete') {
      // Route to the right engine based on query type
      const suggestions = isStreetAddress(query)
        ? await searchMapbox(query, lat, lng)
        : await searchNominatim(query, lat, lng);

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
