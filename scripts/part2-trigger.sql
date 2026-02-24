-- Script PARTE 2: Crear el trigger
-- Ejecuta esto después de la parte 1

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
