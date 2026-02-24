-- Script para verificar la tabla de perfiles y el trigger

-- 1. Verificar si la tabla profiles existe
SELECT 
    table_name, 
    table_type 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name = 'profiles';

-- 2. Verificar las columnas de la tabla profiles
SELECT 
    column_name, 
    data_type, 
    is_nullable 
FROM information_schema.columns 
WHERE table_schema = 'public' 
AND table_name = 'profiles'
ORDER BY ordinal_position;

-- 3. Verificar si el trigger existe
SELECT 
    trigger_name, 
    event_object_table, 
    action_statement 
FROM information_schema.triggers 
WHERE trigger_schema = 'public'
AND trigger_name LIKE '%user%';

-- 4. Verificar las políticas RLS en la tabla profiles
SELECT 
    policyname, 
    permissive, 
    roles, 
    cmd, 
    qual 
FROM pg_policies 
WHERE tablename = 'profiles';

-- 5. Verificar si RLS está habilitado
SELECT 
    relname, 
    relrowsecurity 
FROM pg_class 
WHERE relname = 'profiles';

-- 6. Ver la función del trigger
SELECT prosrc 
FROM pg_proc 
WHERE proname = 'handle_new_user';
