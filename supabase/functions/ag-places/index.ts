const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MAPBOX_TOKEN = 'pk.eyJ1IjoiYW5kYWdhbmEiLCJhIjoiY21uMGl2Z2p0MGl5MjJxcHpxbWJqbHk3ZCJ9.nkiJPIKUx4thRAXw_bum3w';

// ── Ciudades colombianas para detección por GPS ────────────────────
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
];

function cityFromCoords(lat: number, lng: number): string {
  let nearest = '';
  let minDist = Infinity;
  for (const c of CO_CITIES) {
    const d = Math.abs(lat - c.lat) + Math.abs(lng - c.lng);
    if (d < minDist) { minDist = d; nearest = c.name; }
  }
  return minDist < 0.6 ? nearest : ''; // ~65 km de radio
}

function isStreetAddress(q: string): boolean {
  return /#/.test(q) || /\bNo\.?\s*\d/i.test(q);
}

function normalizeColombianSeparator(q: string): string {
  // 84/83 → 84-83   (separador alternativo de número de puerta)
  return q.replace(/(\d+[A-Za-z]?)\/(\d+)/g, '$1-$2');
}

function cleanForMapbox(q: string): string {
  return normalizeColombianSeparator(q)
    .replace(/#\s*/g, ' ')
    .replace(/\bBARRIO\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function cleanForNominatim(q: string): string {
  return normalizeColombianSeparator(q)
    .replace(/#\s*[\dA-Za-z]+\s*[-–]\s*\d+/g, '')
    .replace(/\bNo\.?\s*[\dA-Za-z]+\s*[-–]\s*\d+/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  // Nota: NO eliminamos "BARRIO" — ayuda a Nominatim a entender el tipo de lugar
}

function streetOnly(q: string): string {
  return normalizeColombianSeparator(q)
    .replace(/#\s*[\dA-Za-z]*\s*[-–]?\s*\d*/g, '')
    .replace(/\bNo\.?\s*[\dA-Za-z]*\s*[-–]?\s*\d*/gi, '')
    .replace(/\bBARRIO\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

// Agrega ciudad al final si no está ya en la query
function withCity(q: string, city: string): string {
  if (!city) return q;
  if (q.toLowerCase().includes(city.toLowerCase())) return q;
  return `${q} ${city}`;
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

    // ── Búsqueda ──────────────────────────────────────────────────
    if (action === 'search' || action === 'autocomplete') {
      const city = (lat && lng) ? cityFromCoords(lat, lng) : '';
      let suggestions: any[];

      if (isStreetAddress(query)) {
        // ── Dirección con número ───────────────────────────────────
        // 1. Mapbox con dirección completa normalizada + ciudad
        suggestions = await searchMapbox(withCity(query, city), lat, lng);

        // 2. Nominatim sin número de casa + ciudad
        if (suggestions.length === 0) {
          suggestions = await searchNominatim(withCity(query, city), lat, lng);
        }

        // 3. Mapbox solo con la calle + ciudad
        if (suggestions.length === 0) {
          const street = streetOnly(query);
          if (street.length > 3) {
            suggestions = await searchMapbox(withCity(street, city), lat, lng);
          }
        }

        // 4. Nominatim solo con la calle + ciudad
        if (suggestions.length === 0) {
          const street = streetOnly(query);
          if (street.length > 3) {
            suggestions = await searchNominatim(withCity(street, city), lat, lng);
          }
        }
      } else {
        // ── POI / barrio / nombre de lugar ─────────────────────────
        // 1. Nominatim con ciudad auto-detectada
        suggestions = await searchNominatim(withCity(query, city), lat, lng);

        // 2. Mapbox con ciudad
        if (suggestions.length === 0) {
          suggestions = await searchMapbox(withCity(query, city), lat, lng);
        }

        // 3. Nominatim sin ciudad (por si la ciudad añadida confunde)
        if (suggestions.length === 0 && city) {
          suggestions = await searchNominatim(query, lat, lng);
        }

        // 4. Mapbox sin ciudad
        if (suggestions.length === 0 && city) {
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
