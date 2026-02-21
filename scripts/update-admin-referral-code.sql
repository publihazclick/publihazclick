-- Script para generar código de referido para el admin
-- Ejecutar en Supabase SQL Editor

-- Actualizar el código de referido del admin con un formato válido (máximo 8 caracteres)
UPDATE profiles 
SET referral_code = 'adm00001'
WHERE email = 'publihazclick.com@gmail.com' 
  AND role = 'admin';

-- Verificar el resultado
SELECT id, username, email, referral_code, role 
FROM profiles 
WHERE email = 'publihazclick.com@gmail.com';
