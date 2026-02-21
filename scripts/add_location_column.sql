-- Script corregido para agregar columna location
-- Primero verificar y corregir si ya existe como tipo incorrecto

-- 1. Verificar el tipo actual de la columna location en banner_ads
-- Si existe como tipo incorrecto, eliminarla y recrearla
DO $$ 
BEGIN
    -- Intentar agregar si no existe
    ALTER TABLE public.banner_ads 
    ADD COLUMN IF NOT EXISTS location TEXT DEFAULT 'app';
EXCEPTION
    WHEN duplicate_column THEN
        NULL; -- La columna ya existe
END $$;

-- Agregar constraint si no existe
ALTER TABLE public.banner_ads 
DROP CONSTRAINT IF EXISTS banner_ads_location_check;
ALTER TABLE public.banner_ads 
ADD CONSTRAINT banner_ads_location_check 
CHECK (location IN ('landing', 'app'));

-- 2. Verificar y corregir ptc_tasks
DO $$ 
BEGIN
    -- Verificar si la columna existe y es del tipo correcto
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'ptc_tasks' 
        AND column_name = 'location' 
        AND data_type = 'text'
    ) THEN
        -- Eliminar si existe con tipo incorrecto
        ALTER TABLE public.ptc_tasks DROP COLUMN IF EXISTS location;
        -- Crear con tipo correcto
        ALTER TABLE public.ptc_tasks ADD COLUMN location TEXT DEFAULT 'app';
    END IF;
EXCEPTION
    WHEN duplicate_column THEN
        NULL;
END $$;

-- Agregar constraint
ALTER TABLE public.ptc_tasks 
DROP CONSTRAINT IF EXISTS ptc_tasks_location_check;
ALTER TABLE public.ptc_tasks 
ADD CONSTRAINT ptc_tasks_location_check 
CHECK (location IN ('landing', 'app'));

-- 3. Actualizar registros existentes si hay valores nulos
UPDATE public.banner_ads SET location = 'app' WHERE location IS NULL OR location = '';
UPDATE public.ptc_tasks SET location = 'app' WHERE location IS NULL OR location = '';

-- 4. Crear índices
DROP INDEX IF EXISTS idx_banner_ads_location;
DROP INDEX IF EXISTS idx_ptc_tasks_location;
CREATE INDEX idx_banner_ads_location ON public.banner_ads(location);
CREATE INDEX idx_ptc_tasks_location ON public.ptc_tasks(location);
