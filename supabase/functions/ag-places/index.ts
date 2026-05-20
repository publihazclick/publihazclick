const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GOOGLE_KEY   = 'AIzaSyCASh_bSePE5LRR3oVjns25h344rFNZUeU';
const MAPBOX_TOKEN = 'pk.eyJ1IjoiYW5kYWdhbmEiLCJhIjoiY21uMGl2Z2p0MGl5MjJxcHpxbWJqbHk3ZCJ9.nkiJPIKUx4thRAXw_bum3w';
const MAX_KM       = 80; // radio máximo de resultados (80km cubre aeropuertos alejados del centro)

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

// Distancia haversine en km
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── Mapbox Geocoding v5 (motor principal — 1 sola llamada, coordenadas incluidas) ──
async function searchMapbox(query: string, lat?: number, lng?: number): Promise<any[]> {
  const q = encodeURIComponent(query);
  const params = new URLSearchParams({
    access_token: MAPBOX_TOKEN,
    country:      'CO',
    language:     'es',
    limit:        '6',
    types:        'poi,address,place,locality,neighborhood,district',
  });
  if (lat != null && lng != null) params.set('proximity', `${lng},${lat}`);

  const res  = await fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${q}.json?${params}`);
  const json = await res.json();
  const features: any[] = json.features ?? [];

  return features
    .map((f: any) => ({
      place_id:   f.id,
      text:       f.text,
      place_name: f.place_name,
      lat:        f.geometry.coordinates[1],
      lng:        f.geometry.coordinates[0],
    }))
    .filter((r: any) => {
      // Filtro por distancia real solo si tenemos GPS
      if (lat == null || lng == null) return true;
      return haversineKm(lat, lng, r.lat, r.lng) <= MAX_KM;
    });
}

// ── Google Places Autocomplete (fallback) ─────────────────────────
async function searchGoogle(query: string, lat?: number, lng?: number): Promise<any[]> {
  const params = new URLSearchParams({
    input:      query,
    key:        GOOGLE_KEY,
    components: 'country:co',
    language:   'es',
    types:      'geocode|establishment',
  });
  if (lat != null && lng != null) {
    params.set('location', `${lat},${lng}`);
    params.set('radius',   '80000'); // sesgo suave, no hard filter
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

    if (action === 'reverse') {
      const name = await reverseGeocode(lat, lng);
      return new Response(JSON.stringify({ name }), {
        headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

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

      // 1. Mapbox Geocoding v5 — coordenadas directas + filtro haversine real
      let suggestions = await searchMapbox(qCity, lat, lng);

      // 2. Mismo motor sin ciudad si no hay resultados
      if (!suggestions.length && city) {
        suggestions = await searchMapbox(qNorm, lat, lng);
      }

      // 3. Fallback Google Places (sin coordenadas, sin filtro de distancia)
      if (!suggestions.length) {
        suggestions = await searchGoogle(qCity, lat, lng);
      }

      if (!suggestions.length && city) {
        suggestions = await searchGoogle(qNorm, lat, lng);
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
