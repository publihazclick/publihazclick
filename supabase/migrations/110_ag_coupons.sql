-- CUPONES / PROMOCIONES para Movi
CREATE TABLE IF NOT EXISTS public.ag_coupons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT,
  discount_type TEXT NOT NULL CHECK (discount_type IN ('percent','fixed','first_trip')),
  discount_value INTEGER NOT NULL, -- % o pesos según type
  max_discount_cop INTEGER, -- techo en pesos si es percent
  min_trip_cop INTEGER DEFAULT 5000,
  max_uses INTEGER, -- global
  max_uses_per_user INTEGER DEFAULT 1,
  valid_from TIMESTAMPTZ NOT NULL DEFAULT now(),
  valid_until TIMESTAMPTZ,
  total_uses INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ag_coupons_code ON public.ag_coupons(code) WHERE is_active = TRUE;

ALTER TABLE public.ag_coupons ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ag_coupons_select_active" ON public.ag_coupons;
CREATE POLICY "ag_coupons_select_active" ON public.ag_coupons FOR SELECT USING (is_active = TRUE OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','dev')));
DROP POLICY IF EXISTS "ag_coupons_manage_admin" ON public.ag_coupons;
CREATE POLICY "ag_coupons_manage_admin" ON public.ag_coupons FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','dev')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','dev')));

-- Uso de cupones (tracking)
CREATE TABLE IF NOT EXISTS public.ag_coupon_uses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coupon_id UUID NOT NULL REFERENCES public.ag_coupons(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  trip_request_id UUID REFERENCES public.ag_trip_requests(id) ON DELETE SET NULL,
  discount_applied INTEGER NOT NULL,
  used_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ag_coupon_uses_user ON public.ag_coupon_uses(user_id);
CREATE INDEX IF NOT EXISTS idx_ag_coupon_uses_coupon ON public.ag_coupon_uses(coupon_id);

ALTER TABLE public.ag_coupon_uses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ag_coupon_uses_self_or_admin" ON public.ag_coupon_uses;
CREATE POLICY "ag_coupon_uses_self_or_admin" ON public.ag_coupon_uses FOR SELECT USING (
  auth.uid() = user_id OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','dev'))
);

-- RPC: validar cupón y calcular descuento
CREATE OR REPLACE FUNCTION public.ag_validate_coupon(p_user_id UUID, p_code TEXT, p_trip_price INTEGER)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v RECORD; v_used_count INT; v_user_used_count INT; v_discount INT;
  v_is_first_trip BOOLEAN;
BEGIN
  SELECT * INTO v FROM public.ag_coupons WHERE code = upper(p_code) AND is_active = TRUE;
  IF v IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'Cupón no existe o no está activo'); END IF;

  IF v.valid_until IS NOT NULL AND v.valid_until < now() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Cupón expirado');
  END IF;
  IF v.valid_from > now() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Cupón aún no válido');
  END IF;
  IF p_trip_price < COALESCE(v.min_trip_cop, 0) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Viaje mínimo de ' || v.min_trip_cop || ' COP');
  END IF;

  -- Límite global
  SELECT COUNT(*) INTO v_used_count FROM public.ag_coupon_uses WHERE coupon_id = v.id;
  IF v.max_uses IS NOT NULL AND v_used_count >= v.max_uses THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Cupón agotado');
  END IF;
  -- Límite por usuario
  SELECT COUNT(*) INTO v_user_used_count FROM public.ag_coupon_uses WHERE coupon_id = v.id AND user_id = p_user_id;
  IF v.max_uses_per_user IS NOT NULL AND v_user_used_count >= v.max_uses_per_user THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Ya usaste este cupón');
  END IF;

  -- first_trip: verificar que el user no tenga viajes completados previos
  IF v.discount_type = 'first_trip' THEN
    SELECT EXISTS (SELECT 1 FROM public.ag_trip_requests tr JOIN public.ag_users u ON u.id = tr.passenger_user_id WHERE u.auth_user_id = p_user_id AND tr.status = 'completed') INTO v_is_first_trip;
    IF v_is_first_trip THEN
      RETURN jsonb_build_object('ok', false, 'error', 'Este cupón es solo para el primer viaje');
    END IF;
  END IF;

  -- Calcular descuento
  IF v.discount_type = 'percent' THEN
    v_discount := FLOOR(p_trip_price * v.discount_value / 100.0);
    IF v.max_discount_cop IS NOT NULL AND v_discount > v.max_discount_cop THEN
      v_discount := v.max_discount_cop;
    END IF;
  ELSIF v.discount_type = 'fixed' OR v.discount_type = 'first_trip' THEN
    v_discount := v.discount_value;
    IF v_discount > p_trip_price THEN v_discount := p_trip_price; END IF;
  END IF;

  RETURN jsonb_build_object('ok', true, 'coupon_id', v.id, 'discount', v_discount, 'title', v.title, 'description', v.description);
END;
$$;

-- RPC: registrar uso (llamar DESPUÉS de crear el trip_request)
CREATE OR REPLACE FUNCTION public.ag_apply_coupon(p_user_id UUID, p_coupon_id UUID, p_trip_request_id UUID, p_discount INTEGER)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.ag_coupon_uses (coupon_id, user_id, trip_request_id, discount_applied)
  VALUES (p_coupon_id, p_user_id, p_trip_request_id, p_discount);
  UPDATE public.ag_coupons SET total_uses = total_uses + 1 WHERE id = p_coupon_id;
END;
$$;

-- Seed: cupón de bienvenida
INSERT INTO public.ag_coupons (code, title, description, discount_type, discount_value, max_discount_cop, max_uses_per_user, valid_until)
VALUES ('MOVI10', 'Bienvenido a Movi', '10% de descuento en tu primer viaje', 'first_trip', 3000, 3000, 1, now() + interval '1 year')
ON CONFLICT (code) DO NOTHING;
