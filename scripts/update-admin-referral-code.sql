-- Script para generar código de referido para el admin
-- Ejecutar en Supabase SQL Editor

-- Actualizar el código de referido del admin con un formato válido
UPDATE profiles 
SET referral_code = 'admin00001-2025'
WHERE email = 'publihazclick.com@gmail.com' 
  AND role = 'admin';

-- Verificar el resultado
SELECT id, username, email, referral_code, role 
FROM profiles 
WHERE email = 'publihazclick.com@gmail.com';
