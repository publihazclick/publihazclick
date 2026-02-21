-- ============================================================================
-- Script para agregar columna 'location' a las tablas de anuncios
-- ============================================================================
-- Este script agrega la columna 'location' para distinguir entre anuncios
-- de la landing page (landing) y anuncios de la app después del login (app)
-- ============================================================================

-- Agregar columna location a la tabla banner_ads
ALTER TABLE public.banner_ads 
ADD COLUMN IF NOT EXISTS location TEXT DEFAULT 'app' 
CHECK (location IN ('landing', 'app'));

-- Agregar índice para mejorar el rendimiento de búsquedas por ubicación
CREATE INDEX IF NOT EXISTS idx_banner_ads_location 
ON public.banner_ads(location);

-- Agregar columna location a la tabla ptc_tasks
ALTER TABLE public.ptc_tasks 
ADD COLUMN IF NOT EXISTS location TEXT DEFAULT 'app' 
CHECK (location IN ('landing', 'app'));

-- Agregar índice para mejorar el rendimiento de búsquedas por ubicación
CREATE INDEX IF NOT EXISTS idx_ptc_tasks_location 
ON public.ptc_tasks(location);

-- ============================================================================
-- Actualizar registros existentes:
-- - Los anuncios existentes se asignarán por defecto a 'app'
-- ============================================================================

-- Verificar que las columnas se crearon correctamente
SELECT 
    column_name, 
    data_type, 
    column_default,
    is_nullable
FROM information_schema.columns 
WHERE table_name IN ('banner_ads', 'ptc_tasks') 
AND column_name = 'location';
