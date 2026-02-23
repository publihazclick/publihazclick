-- Script para aumentar el tamaño del campo referral_code y actualizar los códigos existentes

-- 1. Primero, aumentar el tamaño del campo referral_code a 50 caracteres
ALTER TABLE profiles ALTER COLUMN referral_code TYPE VARCHAR(50);

-- 2. También aumentar el tamaño del campo referral_link
ALTER TABLE profiles ALTER COLUMN referral_link TYPE VARCHAR(100);

-- 3. Ahora actualizar los códigos de referido para que sean igual al username
UPDATE profiles
SET 
    referral_code = LOWER(username),
    referral_link = '/ref/' || LOWER(username)
WHERE 
    username IS NOT NULL 
    AND username != ''
    AND (referral_code IS NULL OR referral_code != LOWER(username));

-- 4. Verificar el resultado
-- SELECT id, username, referral_code, referral_link FROM profiles LIMIT 10;
