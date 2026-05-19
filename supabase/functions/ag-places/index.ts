const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MAPBOX_TOKEN = 'pk.eyJ1IjoiYW5kYWdhbmEiLCJhIjoiY21uMGl2Z2p0MGl5MjJxcHpxbWJqbHk3ZCJ9.nkiJPIKUx4thRAXw_bum3w';

// ── Ciudades colombianas para detección por GPS ───────────────────
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
  let nearest = '';
  let minDist = Infinity;
  for (const c of CO_CITIES) {
    const d = Math.abs(lat - c.lat) + Math.abs(lng - c.lng);
    if (d < minDist) { minDist = d; nearest = c.name; }
  }
  return minDist < 0.7 ? nearest : '';
}

function isStreetAddress(q: string): boolean {
  return /#/.test(q) || /\bNo\.?\s*\d/i.test(q);
}

function normalizeQuery(q: string): string {
  return q
    .replace(/(\d+[A-Za-z]?)\/(\d+)/g, '$1-$2')   // 84/83 → 84-83
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function stripHouseNumber(q: string): string {
  return normalizeQuery(q)
    .replace(/#\s*[\dA-Za-z]+\s*[-–]?\s*\d*/g, '')
    .replace(/\bNo\.?\s*[\dA-Za-z]+\s*[-–]?\s*\d*/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function withCity(q: string, city: string): string {
  if (!city || q.toLowerCase().includes(city.toLowerCase())) return q;
  return `${q} ${city}`;
}

// ── Photon (motor principal) ──────────────────────────────────────
// Photon usa OSM con un motor de búsqueda mucho mejor que Nominatim.
async function searchPhoton(query: string, lat?: number, lng?: number): Promise<any[]> {
  const params = new URLSearchParams({ q: query, limit: '6', lang: 'es' });
  if (lat && lng) { params.set('lat', String(lat)); params.set('lon', String(lng)); }

  const res = await fetch(
    'https://photon.komoot.io/api/?' + params,
    { headers: { 'User-Agent': 'movi-app/1.0' } },
  );
  const json = await res.json();

  return (json.features ?? [])
    .filter((f: any) => {
      // Filtrar solo resultados de Colombia
      const country = (f.properties?.country ?? '').toLowerCase();
      return country.includes('colombia') || country.includes('col');
    })
    .map((f: any) => {
      const p = f.properties;
      const name = p.name ?? p.street ?? p.city ?? '';
      const city2 = p.city ?? p.county ?? '';
      const state = p.state ?? '';
      const placeName = [name, city2, state].filter(Boolean).join(', ').slice(0, 90);
      return {
        place_id:   `ph-${f.properties.osm_id ?? Math.random()}`,
        text:       name,
        place_name: placeName,
        lat:        f.geometry.coordinates[1],
        lng:        f.geometry.coordinates[0],
      };
    })
    .filter((r: any) => r.text);
}

// ── Mapbox (respaldo para direcciones con número) ─────────────────
async function searchMapbox(query: string, lat?: number, lng?: number): Promise<any[]> {
  const cleaned = normalizeQuery(query).replace(/#\s*/g, ' ').replace(/\bBARRIO\b/gi, '').trim();
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

// ── Geocodificación inversa ───────────────────────────────────────
async function reverseGeocode(lat: number, lng: number): Promise<string> {
  const params = new URLSearchParams({ lat: String(lat), lon: String(lng), lang: 'es' });
  const res = await fetch('https://photon.komoot.io/reverse?' + params, {
    headers: { 'User-Agent': 'movi-app/1.0' },
  });
  const json = await res.json();
  const f = json.features?.[0];
  if (!f) return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  const p = f.properties;
  return [p.name ?? p.street, p.housenumber, p.city].filter(Boolean).join(', ').slice(0, 90);
}

// ── Handler principal ─────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const { action, query, lat, lng } = await req.json();

    if (action === 'reverse') {
      const name = await reverseGeocode(lat, lng);
      return new Response(JSON.stringify({ name }), {
        headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'search' || action === 'autocomplete') {
      const city = (lat && lng) ? cityFromCoords(lat, lng) : '';
      const qNorm = normalizeQuery(query);
      const qCity = withCity(qNorm, city);
      let suggestions: any[];

      if (isStreetAddress(query)) {
        // ── Dirección con # ──────────────────────────────────────
        // 1. Photon con dirección completa + ciudad
        suggestions = await searchPhoton(qCity, lat, lng);
        // 2. Mapbox con dirección completa + ciudad
        if (!suggestions.length) suggestions = await searchMapbox(qCity, lat, lng);
        // 3. Photon con solo la calle + ciudad
        if (!suggestions.length) suggestions = await searchPhoton(withCity(stripHouseNumber(qNorm), city), lat, lng);
        // 4. Mapbox con solo la calle + ciudad
        if (!suggestions.length) suggestions = await searchMapbox(withCity(stripHouseNumber(qNorm), city), lat, lng);
      } else {
        // ── POI / barrio / nombre ────────────────────────────────
        // 1. Photon con ciudad
        suggestions = await searchPhoton(qCity, lat, lng);
        // 2. Mapbox con ciudad
        if (!suggestions.length) suggestions = await searchMapbox(qCity, lat, lng);
        // 3. Photon sin ciudad (por si confunde)
        if (!suggestions.length && city) suggestions = await searchPhoton(qNorm, lat, lng);
        // 4. Mapbox sin ciudad
        if (!suggestions.length && city) suggestions = await searchMapbox(qNorm, lat, lng);
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
