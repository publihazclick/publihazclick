-- Script para crear/actualizar el perfil del admin si no existe
-- Ejecutar en Supabase SQL Editor

-- Primero, verificar si el usuario admin existe en auth.users
-- Obtenemos el ID del usuario con ese email
SELECT id, email, raw_user_meta_data 
FROM auth.users 
WHERE email = 'publihazclick.com@gmail.com';

-- Si existe, crear o actualizar el perfil
-- Este script hace un INSERT ignorando si ya existe (usando ON CONFLICT)
INSERT INTO profiles (id, username, referral_code, email, role, is_active, level, balance, pending_balance, total_earned, total_spent, referral_earnings)
SELECT 
  id,
  COALESCE(raw_user_meta_data->>'username', 'publihazclick'),
  'admin00001-2025',
  email,
  'admin',
  TRUE,
  1,
  0,
  0,
  0,
  0,
  0
FROM auth.users 
WHERE email = 'publihazclick.com@gmail.com'
ON CONFLICT (id) DO UPDATE SET
  referral_code = EXCLUDED.referral_code,
  username = COALESCE(EXCLUDED.username, profiles.username),
  role = 'admin';

-- Verificar el resultado
SELECT id, username, email, referral_code, role, is_active 
FROM profiles 
WHERE email = 'publihazclick.com@gmail.com';
