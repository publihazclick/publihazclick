-- SURGE PRICING + ZONAS DE OPERACIÓN
CREATE TABLE IF NOT EXISTS public.ag_zones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  city TEXT NOT NULL,
  country TEXT NOT NULL DEFAULT 'CO',
  center_lat DOUBLE PRECISION NOT NULL,
  center_lng DOUBLE PRECISION NOT NULL,
  radius_km DOUBLE PRECISION NOT NULL DEFAULT 25,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  per_km_cop INTEGER NOT NULL DEFAULT 1500,
  min_trip_cop INTEGER NOT NULL DEFAULT 5000,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.ag_zones ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ag_zones_select_all" ON public.ag_zones;
CREATE POLICY "ag_zones_select_all" ON public.ag_zones FOR SELECT USING (TRUE);
DROP POLICY IF EXISTS "ag_zones_manage_admin" ON public.ag_zones;
CREATE POLICY "ag_zones_manage_admin" ON public.ag_zones FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','dev')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','dev')));

-- Seed: ciudades principales COL
INSERT INTO public.ag_zones (name, city, center_lat, center_lng, radius_km) VALUES
  ('Medellín', 'medellin', 6.2442, -75.5812, 30),
  ('Bogotá', 'bogota', 4.7110, -74.0721, 40),
  ('Cali', 'cali', 3.4516, -76.5320, 25),
  ('Barranquilla', 'barranquilla', 10.9685, -74.7813, 25),
  ('Cartagena', 'cartagena', 10.3932, -75.4832, 20)
ON CONFLICT DO NOTHING;

-- Surge pricing por zona y franja horaria (opcional; si no hay match, multiplier=1.0)
CREATE TABLE IF NOT EXISTS public.ag_surge_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  zone_id UUID REFERENCES public.ag_zones(id) ON DELETE CASCADE,
  label TEXT,
  day_of_week INT[] DEFAULT NULL, -- 0=dom,...,6=sab; null=cualquier día
  hour_start INT NOT NULL CHECK (hour_start >= 0 AND hour_start <= 23),
  hour_end INT NOT NULL CHECK (hour_end >= 0 AND hour_end <= 23),
  multiplier NUMERIC(4,2) NOT NULL DEFAULT 1.00 CHECK (multiplier >= 0.5 AND multiplier <= 3.0),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.ag_surge_rules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ag_surge_select_all" ON public.ag_surge_rules;
CREATE POLICY "ag_surge_select_all" ON public.ag_surge_rules FOR SELECT USING (TRUE);
DROP POLICY IF EXISTS "ag_surge_manage_admin" ON public.ag_surge_rules;
CREATE POLICY "ag_surge_manage_admin" ON public.ag_surge_rules FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','dev')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','dev')));

-- Seed: horas pico típicas (lun-vie 7-9am y 5-7pm = x1.3)
INSERT INTO public.ag_surge_rules (label, day_of_week, hour_start, hour_end, multiplier)
SELECT 'Hora pico mañana', ARRAY[1,2,3,4,5], 7, 9, 1.30
WHERE NOT EXISTS (SELECT 1 FROM public.ag_surge_rules WHERE label = 'Hora pico mañana');
INSERT INTO public.ag_surge_rules (label, day_of_week, hour_start, hour_end, multiplier)
SELECT 'Hora pico tarde', ARRAY[1,2,3,4,5], 17, 19, 1.30
WHERE NOT EXISTS (SELECT 1 FROM public.ag_surge_rules WHERE label = 'Hora pico tarde');
INSERT INTO public.ag_surge_rules (label, day_of_week, hour_start, hour_end, multiplier)
SELECT 'Viernes/sábado noche', ARRAY[5,6], 22, 23, 1.40
WHERE NOT EXISTS (SELECT 1 FROM public.ag_surge_rules WHERE label = 'Viernes/sábado noche');

-- RPC: obtener surge activo ahora (para UI mostrar multiplicador)
CREATE OR REPLACE FUNCTION public.ag_current_surge(p_zone_id UUID DEFAULT NULL)
RETURNS NUMERIC LANGUAGE sql STABLE AS $$
  SELECT COALESCE(MAX(multiplier), 1.00)
  FROM public.ag_surge_rules
  WHERE is_active = TRUE
    AND (zone_id IS NULL OR zone_id = p_zone_id OR p_zone_id IS NULL)
    AND (day_of_week IS NULL OR EXTRACT(DOW FROM (now() AT TIME ZONE 'America/Bogota'))::int = ANY(day_of_week))
    AND EXTRACT(HOUR FROM (now() AT TIME ZONE 'America/Bogota'))::int BETWEEN hour_start AND hour_end;
$$;

-- RPC: detectar zona por coordenadas (simplemente la más cercana dentro del radio)
CREATE OR REPLACE FUNCTION public.ag_detect_zone(p_lat DOUBLE PRECISION, p_lng DOUBLE PRECISION)
RETURNS UUID LANGUAGE sql STABLE AS $$
  SELECT id FROM public.ag_zones
  WHERE is_active = TRUE
    AND (
      111.0 * sqrt(power(center_lat - p_lat, 2) + power((center_lng - p_lng) * cos(radians(center_lat)), 2))
    ) <= radius_km
  ORDER BY (
    111.0 * sqrt(power(center_lat - p_lat, 2) + power((center_lng - p_lng) * cos(radians(center_lat)), 2))
  ) ASC
  LIMIT 1;
$$;
