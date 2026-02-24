-- Crear tabla de perfiles si no existe
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  username TEXT UNIQUE,
  full_name TEXT,
  role TEXT DEFAULT 'guest',
  is_active BOOLEAN DEFAULT true,
  phone TEXT,
  country TEXT,
  country_code TEXT,
  city TEXT,
  department TEXT,
  referral_code TEXT UNIQUE,
  referral_link TEXT,
  referred_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Habilitar RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Crear política de inserción para el trigger (el usuario puede insertar su propio perfil)
CREATE POLICY "Users can insert own profile"
  ON public.profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

-- Crear política de lectura para usuarios autenticados
CREATE POLICY "Users can read all profiles"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (true);

-- Crear política de actualización para usuarios autenticados
CREATE POLICY "Users can update own profile"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Crear política para el servicio de anon (necesario para el trigger)
CREATE POLICY "Service role can insert profiles"
  ON public.profiles
  FOR INSERT
  TO service_role
  WITH CHECK (true);

-- Crear política para el servicio de anon (necesario para el trigger)
CREATE POLICY "Service role can update profiles"
  ON public.profiles
  FOR UPDATE
  TO service_role
  WITH CHECK (true);
