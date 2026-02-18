-- =============================================================================
-- Script para crear perfil de ADMIN
-- Ejecutar en el SQL Editor de Supabase
-- =============================================================================

-- User ID: 4673932a-1044-47be-9f65-6191c360cff8

-- Ejecuta ESTA línea (código de referido de 8 caracteres):
INSERT INTO profiles (id, username, referral_code, email, role, is_active, level, balance, pending_balance, total_earned, total_spent, referral_earnings)
VALUES ('4673932a-1044-47be-9f65-6191c360cff8', 'publihazclick', upper(substring(md5(random()::text) from 1 for 8)), 'publihazclick.com@gmail.com', 'admin', TRUE, 1, 0, 0, 0, 0, 0);

-- Verificar:
SELECT id, username, referral_code, email, role, is_active FROM profiles WHERE email = 'publihazclick.com@gmail.com';
