const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GOOGLE_KEY   = 'AIzaSyCASh_bSePE5LRR3oVjns25h344rFNZUeU';
const MAPBOX_TOKEN = 'pk.eyJ1IjoiYW5kYWdhbmEiLCJhIjoiY21uMGl2Z2p0MGl5MjJxcHpxbWJqbHk3ZCJ9.nkiJPIKUx4thRAXw_bum3w';

const CO_CITIES = [
  { name: 'Bogotá',        lat:  4.711, lng: -74.072 },
  { name: 'Medellín',      lat:  6.244, lng: -75.574 },
  { name: 'Cali',          lat:  3.451, lng: -76.532 },
  { name: 'Barranquilla',  lat: 10.964, lng: -74.796 },
  { name: 'Cartagena',     lat: 10.391, lng: -75.479 },
  { name: 'Bucaramanga',   lat:  7.119, lng: -73.122 },
  { name: 'Cúcuta',        lat:  7.893, lng: -72.505 },
  { name: 'Pereira',       lat:  4.814, lng: -75.696 },
  { name: 'Manizales',     lat:  5.070, lng: -75.513 },
  { name: 'Ibagué',        lat:  4.438, lng: -75.232 },
  { name: 'Villavicencio', lat:  4.142, lng: -73.627 },
  { name: 'Neiva',         lat:  2.927, lng: -75.282 },
  { name: 'Pasto',         lat:  1.214, lng: -77.281 },
  { name: 'Montería',      lat:  8.757, lng: -75.881 },
  { name: 'Armenia',       lat:  4.534, lng: -75.681 },
  { name: 'Valledupar',    lat: 10.477, lng: -73.250 },
  { name: 'Santa Marta',   lat: 11.240, lng: -74.199 },
  { name: 'Soacha',        lat:  4.579, lng: -74.216 },
];

function cityFromCoords(lat: number, lng: number): string {
  let nearest = '', minDist = Infinity;
  for (const c of CO_CITIES) {
    const d = Math.abs(lat - c.lat) + Math.abs(lng - c.lng);
    if (d < minDist) { minDist = d; nearest = c.name; }
  }
  return minDist < 0.7 ? nearest : '';
}

function normalizeQuery(q: string): string {
  return q.replace(/(\d+[A-Za-z]?)\/(\d+)/g, '$1-$2').replace(/\s{2,}/g, ' ').trim();
}

function withCity(q: string, city: string): string {
  if (!city || q.toLowerCase().includes(city.toLowerCase())) return q;
  return `${q}, ${city}`;
}

// ── Google Places Autocomplete (motor principal) ──────────────────
async function searchGoogle(query: string, lat?: number, lng?: number): Promise<any[]> {
  const params = new URLSearchParams({
    input:      query,
    key:        GOOGLE_KEY,
    components: 'country:co',
    language:   'es',
    types:      'geocode',
  });
  if (lat != null && lng != null) {
    params.set('location', `${lat},${lng}`);
    params.set('radius',   '30000');
  }

  const res  = await fetch(`https://maps.googleapis.com/maps/api/place/autocomplete/json?${params}`);
  const json = await res.json();

  if (json.status !== 'OK' && json.status !== 'ZERO_RESULTS') {
    console.error('Google Places error:', json.status, json.error_message);
    return [];
  }

  return (json.predictions ?? []).slice(0, 5).map((p: any) => ({
    place_id:   p.place_id,
    text:       p.structured_formatting?.main_text ?? p.description.split(',')[0],
    place_name: p.description,
    lat:        null,
    lng:        null,
  }));
}

// ── Google Place Details (coordenadas al seleccionar) ─────────────
async function getGoogleDetails(placeId: string): Promise<{ lat: number; lng: number } | null> {
  const params = new URLSearchParams({
    place_id: placeId,
    key:      GOOGLE_KEY,
    fields:   'geometry',
    language: 'es',
  });
  const res  = await fetch(`https://maps.googleapis.com/maps/api/place/details/json?${params}`);
  const json = await res.json();
  const loc  = json.result?.geometry?.location;
  if (!loc) return null;
  return { lat: loc.lat, lng: loc.lng };
}

// ── Mapbox Search Box v1 (fallback) ──────────────────────────────
async function searchMapboxBox(query: string, lat?: number, lng?: number): Promise<any[]> {
  const sessionToken = crypto.randomUUID();
  const params = new URLSearchParams({
    q: query, access_token: MAPBOX_TOKEN, country: 'CO', language: 'es', limit: '5',
    session_token: sessionToken,
  });
  if (lat != null && lng != null) params.set('proximity', `${lng},${lat}`);

  const suggestRes  = await fetch(`https://api.mapbox.com/search/searchbox/v1/suggest?${params}`);
  const suggestJson = await suggestRes.json();
  const suggestions: any[] = (suggestJson.suggestions ?? []).slice(0, 4);
  if (!suggestions.length) return [];

  const results = await Promise.all(
    suggestions.map(async (s: any) => {
      try {
        const rp   = new URLSearchParams({ access_token: MAPBOX_TOKEN, session_token: sessionToken });
        const rRes  = await fetch(`https://api.mapbox.com/search/searchbox/v1/retrieve/${s.mapbox_id}?${rp}`);
        const rJson = await rRes.json();
        const feat  = rJson.features?.[0];
        if (!feat) return null;
        return {
          place_id:   s.mapbox_id,
          text:       s.name,
          place_name: s.full_address ?? s.place_formatted ?? s.name,
          lat:        feat.geometry.coordinates[1],
          lng:        feat.geometry.coordinates[0],
        };
      } catch { return null; }
    }),
  );
  return results.filter(Boolean) as any[];
}

// ── Geocodificación inversa ────────────────────────────────────────
async function reverseGeocode(lat: number, lng: number): Promise<string> {
  const params = new URLSearchParams({
    access_token: MAPBOX_TOKEN, language: 'es', limit: '1',
    types: 'address,neighborhood,place',
  });
  const res  = await fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?${params}`);
  const json = await res.json();
  const feat = json.features?.[0];
  if (feat) return feat.place_name ?? `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}

// ── Handler ───────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const { action, query, lat, lng, place_id } = await req.json();

    // Geocodificación inversa
    if (action === 'reverse') {
      const name = await reverseGeocode(lat, lng);
      return new Response(JSON.stringify({ name }), {
        headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    // Obtener coordenadas de un place_id de Google (se llama al seleccionar)
    if (action === 'details') {
      if (!place_id) return new Response(JSON.stringify({ error: 'place_id required' }), { status: 400, headers: CORS });
      const coords = await getGoogleDetails(place_id);
      if (!coords) return new Response(JSON.stringify({ error: 'not found' }), { status: 404, headers: CORS });
      return new Response(JSON.stringify(coords), {
        headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'search' || action === 'autocomplete') {
      const city  = (lat != null && lng != null) ? cityFromCoords(lat, lng) : '';
      const qNorm = normalizeQuery(query);
      const qCity = withCity(qNorm, city);

      // 1. Google Places (mejor cobertura colombiana)
      let suggestions = await searchGoogle(qCity, lat, lng);

      // 2. Fallback: Mapbox Search Box v1
      if (!suggestions.length) {
        suggestions = await searchMapboxBox(qCity, lat, lng);
      }

      // 3. Fallback sin ciudad
      if (!suggestions.length && city) {
        suggestions = await searchGoogle(qNorm, lat, lng);
      }

      // 4. Mapbox sin ciudad
      if (!suggestions.length && city) {
        suggestions = await searchMapboxBox(qNorm, lat, lng);
      }

      return new Response(JSON.stringify({ suggestions }), {
        headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'invalid action' }), { status: 400, headers: CORS });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: CORS });
  }
});
