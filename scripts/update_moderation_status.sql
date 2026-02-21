-- Script para actualizar la base de datos de Supabase
-- Ejecutar cada bloque por separado en el SQL Editor

-- ============================================
-- BLOQUE 1: Crear enum task_status
-- ============================================
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'task_status') THEN
        CREATE TYPE task_status AS ENUM ('pending', 'active', 'paused', 'completed', 'rejected');
    ELSE
        -- Agregar valores si no existen
        IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'pending' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'task_status')) THEN
            ALTER TYPE task_status ADD VALUE 'pending';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'rejected' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'task_status')) THEN
            ALTER TYPE task_status ADD VALUE 'rejected';
        END IF;
    END IF;
END
$$;

-- ============================================
-- BLOQUE 2: Crear enum banner_position
-- ============================================
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'banner_position') THEN
        CREATE TYPE banner_position AS ENUM ('header', 'sidebar', 'footer');
    END IF;
END
$$;

-- ============================================
-- BLOQUE 3: Crear enum banner_status
-- ============================================
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'banner_status') THEN
        CREATE TYPE banner_status AS ENUM ('pending', 'active', 'paused', 'completed', 'rejected');
    ELSE
        IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'pending' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'banner_status')) THEN
            ALTER TYPE banner_status ADD VALUE 'pending';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'rejected' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'banner_status')) THEN
            ALTER TYPE banner_status ADD VALUE 'rejected';
        END IF;
    END IF;
END
$$;

-- ============================================
-- BLOQUE 4: Crear enum task_type
-- ============================================
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'task_type') THEN
        CREATE TYPE task_type AS ENUM ('mega', 'standard_400', 'standard_600', 'mini');
    END IF;
END
$$;

-- ============================================
-- BLOQUE 5: Verificar enum task_status actual
-- ============================================
SELECT 'Valores de task_status:' as info;
SELECT enumlabel FROM pg_enum WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'task_status') ORDER BY enumsortorder;

-- ============================================
-- BLOQUE 6: Verificar enum banner_status actual
-- ============================================
SELECT 'Valores de banner_status:' as info;
SELECT enumlabel FROM pg_enum WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'banner_status') ORDER BY enumsortorder;

-- ============================================
-- Fin del script
-- ============================================
SELECT 'Script completado exitosamente' as resultado;
