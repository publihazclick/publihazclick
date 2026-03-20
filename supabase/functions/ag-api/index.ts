// Supabase Edge Function: Anda y Gana REST API
// Env vars: MAPBOX_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const url    = new URL(req.url);
  const action = url.searchParams.get('action') || '';

  const MAPBOX = Deno.env.get('MAPBOX_TOKEN') ?? '';
  const SUPA_URL = Deno.env.get('SUPABASE_URL') ?? '';
  const SUPA_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

  // ── GET /ag-api?action=places&q=...&lat=...&lng=... ──────────
  if (action === 'places' && req.method === 'GET') {
    const q   = url.searchParams.get('q') ?? '';
    const lat = url.searchParams.get('lat') ?? '';
    const lng = url.searchParams.get('lng') ?? '';
    if (!q.trim()) return json({ features: [] });

    let mapboxUrl = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json?access_token=${MAPBOX}&country=co&language=es&limit=6&types=address,place,locality,neighborhood,poi`;
    if (lat && lng) mapboxUrl += `&proximity=${lng},${lat}`;

    try {
      const resp = await fetch(mapboxUrl);
      const data = await resp.json();
      const features = (data.features || []).map((f: any) => ({
        id:      f.id,
        name:    f.text,
        address: f.place_name,
        lat:     f.center[1],
        lng:     f.center[0],
      }));
      return json({ features });
    } catch {
      return json({ features: [] });
    }
  }

  // ── POST /ag-api?action=route ────────────────────────────────
  if (action === 'route' && req.method === 'POST') {
    const { origin, dest } = await req.json();
    if (!origin || !dest) return json({ error: 'origin and dest required' }, 400);

    const coords = `${origin.lng},${origin.lat};${dest.lng},${dest.lat}`;
    const mapboxUrl = `https://api.mapbox.com/directions/v5/mapbox/driving/${coords}?access_token=${MAPBOX}&overview=full&geometries=geojson`;

    try {
      const resp = await fetch(mapboxUrl);
      const data = await resp.json();
      const route = data.routes?.[0];
      if (!route) return json({ error: 'No route found' }, 404);

      const distance_km   = Math.round((route.distance / 1000) * 10) / 10;
      const duration_min  = Math.round(route.duration / 60);
      const base_price    = Math.max(5000, Math.round(distance_km * 1500 / 1000) * 1000);
      const geometry      = route.geometry;

      return json({ distance_km, duration_min, suggested_price: base_price, geometry });
    } catch {
      return json({ error: 'Routing error' }, 500);
    }
  }

  // ── GET /ag-api?action=stats ─────────────────────────────────
  if (action === 'stats' && req.method === 'GET') {
    if (!SUPA_URL || !SUPA_KEY) return json({ error: 'Supabase not configured' }, 500);
    const supabase = createClient(SUPA_URL, SUPA_KEY);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const weekAgo = new Date(today); weekAgo.setDate(today.getDate() - 7);

    const [{ count: tripsToday }, { count: tripsWeek }, { count: totalDrivers }, { count: activeUsers }] = await Promise.all([
      supabase.from('ag_trips').select('*', { count: 'exact', head: true }).eq('status', 'completed').gte('trip_date', today.toISOString()),
      supabase.from('ag_trips').select('*', { count: 'exact', head: true }).eq('status', 'completed').gte('trip_date', weekAgo.toISOString()),
      supabase.from('ag_drivers').select('*', { count: 'exact', head: true }).eq('status', 'approved'),
      supabase.from('ag_users').select('*', { count: 'exact', head: true }),
    ]);

    const { data: revenueToday } = await supabase.from('ag_trips').select('total_amount').eq('status', 'completed').gte('trip_date', today.toISOString());
    const { data: revenueWeek  } = await supabase.from('ag_trips').select('total_amount').eq('status', 'completed').gte('trip_date', weekAgo.toISOString());

    return json({
      tripsToday:     tripsToday ?? 0,
      tripsWeek:      tripsWeek ?? 0,
      totalDrivers:   totalDrivers ?? 0,
      activeUsers:    activeUsers ?? 0,
      revenueToday:   (revenueToday || []).reduce((s: number, t: any) => s + Number(t.total_amount), 0),
      revenueWeek:    (revenueWeek  || []).reduce((s: number, t: any) => s + Number(t.total_amount), 0),
    });
  }

  return json({ error: 'Unknown action' }, 404);
});
