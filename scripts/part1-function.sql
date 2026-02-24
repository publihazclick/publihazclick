-- Script PARTE 1: Crear la función
-- Ejecuta esto primero

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS '
BEGIN
    INSERT INTO public.profiles (id, email, username, full_name, role)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>''username'', ''user_'' || LEFT(NEW.id::TEXT, 8)),
        NEW.raw_user_meta_data->>''full_name'',
        COALESCE(NEW.raw_user_meta_data->>''role'', ''guest'')
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
' LANGUAGE plpgsql SECURITY DEFINER;
