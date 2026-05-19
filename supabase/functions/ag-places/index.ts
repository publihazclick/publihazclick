const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MAPBOX_TOKEN = 'pk.eyJ1IjoiYW5kYWdhbmEiLCJhIjoiY21uMGl2Z2p0MGl5MjJxcHpxbWJqbHk3ZCJ9.nkiJPIKUx4thRAXw_bum3w';

function isStreetAddress(q: string): boolean {
  return /#/.test(q) || /\bNo\.?\s*\d/i.test(q);
}

function cleanForMapbox(q: string): string {
  return q
    .replace(/#\s*/g, ' ')
    .replace(/\bBARRIO\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

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

async function reverseGeocode(lat: number, lng: number): Promise<string> {
  const params = new URLSearchParams({
    lat: String(lat), lon: String(lng),
    format: 'json', 'accept-language': 'es', zoom: '16',
  });
  const res = await fetch(
    'https://nominatim.openstreetmap.org/reverse?' + params,
    { headers: { 'User-Agent': 'movi-app/1.0 (publihazclick.com)' } },
  );
  const json = await res.json();
  if (json.error) return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  const parts = (json.display_name as string).split(',');
  // Toma los primeros 2-3 fragmentos para un nombre legible
  return parts.slice(0, 3).map((p: string) => p.trim()).join(', ');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const body = await req.json();
    const { action, query, lat, lng } = body;

    // ── Geocodificación inversa ────────────────────────────────────
    if (action === 'reverse') {
      const name = await reverseGeocode(lat, lng);
      return new Response(JSON.stringify({ name }), {
        headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    // ── Búsqueda con fallback doble ────────────────────────────────
    if (action === 'search' || action === 'autocomplete') {
      let suggestions: any[];

      if (isStreetAddress(query)) {
        // Dirección con número → Mapbox primero, Nominatim como fallback
        suggestions = await searchMapbox(query, lat, lng);
        if (suggestions.length === 0) {
          suggestions = await searchNominatim(query, lat, lng);
        }
      } else {
        // POI / nombre de lugar → Nominatim primero, Mapbox como fallback
        suggestions = await searchNominatim(query, lat, lng);
        if (suggestions.length === 0) {
          suggestions = await searchMapbox(query, lat, lng);
        }
      }

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
