-- Script completo para configurar la tabla de perfiles y el trigger
-- Ejecuta este script en el SQL Editor de Supabase
-- IMPORTANTE: Este script maneja el caso donde ya existe un trigger

-- ============================================
-- 1. Verificar si la tabla profiles existe
-- ============================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'profiles') THEN
    -- Crear la tabla profiles si no existe
    CREATE TABLE public.profiles (
      id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
      email TEXT,
      username TEXT UNIQUE,
      referral_code TEXT UNIQUE,
      referral_link TEXT,
      referred_by UUID REFERENCES public.profiles(id),
      full_name TEXT,
      avatar_url TEXT,
      role TEXT DEFAULT 'guest' CHECK (role IN ('dev', 'admin', 'guest', 'advertiser')),
      level INTEGER DEFAULT 1,
      is_active BOOLEAN DEFAULT true,
      balance DECIMAL(15,2) DEFAULT 0,
      real_balance DECIMAL(15,2) DEFAULT 0,
      demo_balance DECIMAL(15,2) DEFAULT 0,
      pending_balance DECIMAL(15,2) DEFAULT 0,
      total_earned DECIMAL(15,2) DEFAULT 0,
      total_demo_earned DECIMAL(15,2) DEFAULT 0,
      total_spent DECIMAL(15,2) DEFAULT 0,
      total_donated DECIMAL(15,2) DEFAULT 0,
      referral_earnings DECIMAL(15,2) DEFAULT 0,
      total_referrals_count INTEGER DEFAULT 0,
      has_active_package BOOLEAN DEFAULT false,
      current_package_id UUID,
      package_started_at TIMESTAMPTZ,
      package_expires_at TIMESTAMPTZ,
      phone TEXT,
      country TEXT,
      country_code TEXT,
      department TEXT,
      city TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
    
    -- Habilitar RLS
    ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
    
    -- Políticas RLS
    CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
    CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);
    CREATE POLICY "Admins can view all profiles" ON public.profiles FOR SELECT USING (
      EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'dev'))
    );
    CREATE POLICY "Admins can update all profiles" ON public.profiles FOR UPDATE USING (
      EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'dev'))
    );
    CREATE POLICY "Service role can do anything" ON public.profiles FOR ALL USING (auth.role() = 'service_role');
    
    RAISE NOTICE 'Tabla profiles creada exitosamente';
  ELSE
    RAISE NOTICE 'La tabla profiles ya existe';
  END IF;
END $$;

-- ============================================
-- 2. Crear/actualizar la función del trigger
-- ============================================

-- Usar CREATE OR REPLACE FUNCTION (esto actualiza la función sin eliminar el trigger)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (
    id,
    email,
    username,
    full_name,
    role,
    level,
    is_active,
    balance,
    real_balance,
    demo_balance,
    pending_balance,
    total_earned,
    total_demo_earned,
    total_spent,
    total_donated,
    referral_earnings,
    total_referrals_count,
    has_active_package,
    created_at,
    updated_at
  )
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'username', 'user_' || LEFT(NEW.id::TEXT, 8)),
    NEW.raw_user_meta_data->>'full_name',
    COALESCE(NEW.raw_user_meta_data->>'role', 'guest')::TEXT,
    1,
    true,
    0,
    0,
    COALESCE((NEW.raw_user_meta_data->>'demo_balance')::DECIMAL(15,2), 100),
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    false,
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO NOTHING;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 3. Verificar resultado
-- ============================================
DO $$
BEGIN
  -- Verificar que la función existe
  IF EXISTS (
    SELECT 1 FROM pg_proc 
    WHERE proname = 'handle_new_user'
  ) THEN
    RAISE NOTICE '✓ Función handle_new_user creada/actualizada exitosamente';
  ELSE
    RAISE WARNING '✗ Función no encontrada';
  END IF;

  -- Verificar que el trigger existe
  IF EXISTS (
    SELECT 1 FROM information_schema.triggers 
    WHERE trigger_name = 'on_auth_user_created' 
    AND event_object_table = 'users'
    AND event_object_schema = 'auth'
  ) THEN
    RAISE NOTICE '✓ Trigger on_auth_user_created activo';
  ELSE
    -- Crear trigger si no existe
    CREATE TRIGGER on_auth_user_created
      AFTER INSERT ON auth.users
      FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
    RAISE NOTICE '✓ Trigger on_auth_user_created creado';
  END IF;
END $$;

-- Verificar autenticación
SELECT 'Configuración completada' AS status;
