const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

function isStreetAddress(q: string): boolean {
  return /#/.test(q) || /\bNo\.?\s*\d/i.test(q);
}

function normalizeQuery(q: string): string {
  return q.replace(/(\d+[A-Za-z]?)\/(\d+)/g, '$1-$2').replace(/\s{2,}/g, ' ').trim();
}

function stripHouseNumber(q: string): string {
  return normalizeQuery(q)
    .replace(/#\s*[\dA-Za-z]+\s*[-–]?\s*\d*/g, '')
    .replace(/\bNo\.?\s*[\dA-Za-z]+\s*[-–]?\s*\d*/gi, '')
    .replace(/\s{2,}/g, ' ').trim();
}

function withCity(q: string, city: string): string {
  if (!city || q.toLowerCase().includes(city.toLowerCase())) return q;
  return `${q} ${city}`;
}

// ── Mapbox Search Box v1 (API nueva con ML — mucho mejor cobertura) ──
async function searchMapboxBox(query: string, lat?: number, lng?: number): Promise<any[]> {
  const sessionToken = crypto.randomUUID();
  const params = new URLSearchParams({
    q: query,
    access_token: MAPBOX_TOKEN,
    country: 'CO',
    language: 'es',
    limit: '6',
    session_token: sessionToken,
  });
  if (lat && lng) params.set('proximity', `${lng},${lat}`);

  const suggestRes = await fetch(`https://api.mapbox.com/search/searchbox/v1/suggest?${params}`);
  const suggestJson = await suggestRes.json();
  const suggestions: any[] = (suggestJson.suggestions ?? []).slice(0, 4);
  if (!suggestions.length) return [];

  // Recuperar coordenadas para los primeros 4 resultados en paralelo
  const results = await Promise.all(
    suggestions.map(async (s: any) => {
      try {
        const rp = new URLSearchParams({ access_token: MAPBOX_TOKEN, session_token: sessionToken });
        const rRes = await fetch(`https://api.mapbox.com/search/searchbox/v1/retrieve/${s.mapbox_id}?${rp}`);
        const rJson = await rRes.json();
        const feat = rJson.features?.[0];
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

// ── Mapbox Geocoding v5 (respaldo) ────────────────────────────────
async function searchMapboxV5(query: string, lat?: number, lng?: number): Promise<any[]> {
  const cleaned = normalizeQuery(query).replace(/#\s*/g, ' ').replace(/\bBARRIO\b/gi, '').trim();
  const params = new URLSearchParams({
    access_token: MAPBOX_TOKEN, country: 'CO', language: 'es', limit: '5',
    types: 'address,neighborhood,place,poi',
  });
  if (lat && lng) params.set('proximity', `${lng},${lat}`);

  const res = await fetch(
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(cleaned)}.json?${params}`
  );
  const json = await res.json();
  return (json.features ?? []).map((f: any) => ({
    place_id: f.id, text: f.text ?? f.place_name.split(',')[0],
    place_name: f.place_name, lat: f.center[1], lng: f.center[0],
  }));
}

// ── Geocodificación inversa ────────────────────────────────────────
async function reverseGeocode(lat: number, lng: number): Promise<string> {
  // Usamos Mapbox reverse geocoding v5 (más confiable que Photon para esto)
  const params = new URLSearchParams({
    access_token: MAPBOX_TOKEN, language: 'es', limit: '1',
    types: 'address,neighborhood,place',
  });
  const res = await fetch(
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?${params}`
  );
  const json = await res.json();
  const feat = json.features?.[0];
  if (feat) return feat.place_name ?? `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}

// ── Handler ───────────────────────────────────────────────────────
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
        // Dirección con número
        suggestions = await searchMapboxBox(qCity, lat, lng);
        if (!suggestions.length) suggestions = await searchMapboxV5(qCity, lat, lng);
        if (!suggestions.length) suggestions = await searchMapboxBox(withCity(stripHouseNumber(qNorm), city), lat, lng);
        if (!suggestions.length) suggestions = await searchMapboxV5(withCity(stripHouseNumber(qNorm), city), lat, lng);
      } else {
        // POI / barrio / nombre
        suggestions = await searchMapboxBox(qCity, lat, lng);
        if (!suggestions.length) suggestions = await searchMapboxV5(qCity, lat, lng);
        if (!suggestions.length && city) suggestions = await searchMapboxBox(qNorm, lat, lng);
        if (!suggestions.length && city) suggestions = await searchMapboxV5(qNorm, lat, lng);
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
