-- Script para actualizar códigos de referido existentes usando el username
-- Esto convierte códigos como "victor12345-2026" a simplemente "victor" (primera parte del email)

-- 1. Primero, mostrar los usernames únicos que serían problematicos (duplicados)
-- Esto nos ayuda a identificar conflictos antes de ejecutar

-- 2. Actualizar referral_code para que sea igual al username
-- Solo actualiza aquellos que tienen un username válido y no están vacíos
UPDATE profiles
SET 
    referral_code = LOWER(username),
    referral_link = '/ref/' || LOWER(username)
WHERE 
    username IS NOT NULL 
    AND username != ''
    AND (referral_code IS NULL OR referral_code != LOWER(username));

-- 3. Verificar si hay usernames duplicados que podrían causar problemas
-- Si hay duplicados, algunos usuarios no se podrán registrar con ese código
-- SELECT username, COUNT(*) as count 
-- FROM profiles 
-- WHERE username IS NOT NULL AND username != ''
-- GROUP BY username 
-- HAVING COUNT(*) > 1;

-- 4. Opcional: Crear índice único en referral_code para prevenir duplicados futuros
-- CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_referral_code_unique 
-- ON profiles(referral_code) WHERE referral_code IS NOT NULL;
