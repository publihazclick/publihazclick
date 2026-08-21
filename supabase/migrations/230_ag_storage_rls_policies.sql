-- BUG REAL, CRITICO, encontrado 2026-08-21 (pedido explicito del usuario -- "no deja subir
-- documentos, error: new row violates row level security policy"): storage.objects tiene RLS
-- habilitado (relrowsecurity = true) pero CERO politicas en los 6 buckets de Movi
-- (ag-drivers, ag-passengers, movi-driver-docs, movi-lost-items, movi-passenger-profile,
-- movi-apk) -- RLS habilitado sin ninguna politica significa que TODO insert/select/update/delete
-- se rechaza para cualquier rol que no sea el dueño de la tabla o tenga BYPASSRLS (service_role).
--
-- Confirmado con datos reales: de los 2 conductores que existen en produccion, NINGUNO tiene un
-- solo documento subido con exito (todas las columnas *_url en ag_drivers son NULL). Esto lleva
-- roto desde que se separo el proyecto de Movi (2026-07-05) -- CADA intento de subir un documento,
-- en CUALQUIER parte de la app (registro de conductor, registro de pasajero, "Mis documentos",
-- foto de perfil, reporte de objeto perdido), fallaba en silencio. La mayoria de esos caminos
-- (uploadFile() en anda-gana.service.ts) atrapan el error y devuelven null sin avisar -- por eso
-- nadie lo habia notado hasta ahora, que "Mis documentos" (onUploadDoc, unico camino que SI
-- muestra el error crudo al usuario) lo hizo visible.
--
-- Por que los buckets "publicos" (ag-drivers, ag-passengers, etc.) parecian funcionar para LEER:
-- el flag "public" de un bucket hace que Supabase sirva los archivos via URL publica sin pasar
-- por RLS -- por eso las fotos que SI se subieron (via el service_role en algun momento, o antes
-- de que se rompiera) se veian bien. Pero cualquier escritura nueva (INSERT en storage.objects)
-- SI pasa por RLS sin importar si el bucket es publico o privado -- ahi es donde fallaba todo.
--
-- Fix: politica permisiva para authenticated en los buckets donde usuarios reales suben sus
-- propios archivos -- mismo patron ya usado en el resto de tablas ag_/cc_ de este proyecto
-- (control de acceso real vive en la logica de la app/rutas de Angular, no en RLS fino por fila,
-- ver movi_supabase_separacion). movi-apk se deja fuera a proposito (solo se sube manualmente,
-- vía CLI/dashboard con service_role, nunca desde la app).

CREATE POLICY "authenticated_full_access_movi_buckets"
ON storage.objects
FOR ALL
TO authenticated
USING (bucket_id IN ('ag-drivers', 'ag-passengers', 'movi-driver-docs', 'movi-lost-items', 'movi-passenger-profile'))
WITH CHECK (bucket_id IN ('ag-drivers', 'ag-passengers', 'movi-driver-docs', 'movi-lost-items', 'movi-passenger-profile'));

-- Los buckets públicos ya sirven lectura anónima vía URL sin pasar por RLS, pero createSignedUrl()
-- (usado en movi-driver-docs, que es privado) sí necesita que el llamador tenga SELECT real sobre
-- la fila -- la política ALL de arriba ya cubre esto para authenticated.
