-- Script para agregar foreign key a banner_ads
-- Ejecutar en Supabase SQL Editor

-- Primero verificar si la foreign key ya existe
SELECT
    tc.constraint_name, 
    tc.table_name, 
    kcu.column_name, 
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name 
FROM 
    information_schema.table_constraints AS tc 
    JOIN information_schema.key_column_usage AS kcu
      ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema = kcu.table_schema
    JOIN information_schema.constraint_column_usage AS ccu
      ON ccu.constraint_name = tc.constraint_name
      AND ccu.table_schema = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY' 
AND tc.table_name = 'banner_ads';

-- Agregar foreign key si no existe
-- Esto assuming que advertiser_id referencia a profiles.id
ALTER TABLE banner_ads
ADD CONSTRAINT banner_advertiser_id_fkey
FOREIGN KEY (advertiser_id)
REFERENCES profiles(id)
ON DELETE SET NULL;
