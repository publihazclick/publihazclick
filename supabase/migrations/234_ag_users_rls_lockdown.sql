-- Cierra el ultimo hallazgo "menor" pendiente de la auditoria de seguridad 2026-08-25 (correo real
-- de Supabase Security Advisor): ag_users tenia DOS politicas SELECT wide-open --
-- ag_users_select_by_phone y ag_users_admin_read -- que exponian TODA la tabla (email, id_number,
-- selfie_url, id_front_url/id_back_url -- fotos de cedula --, passenger_wallet_balance, etc.) de
-- CUALQUIER usuario de Movi a cualquiera con la clave anonima, sin sesion.
--
-- Los 2 usos reales de esas politicas (auditados en anda-gana.service.ts, publihazclick):
-- 1) 4 fallbacks de "sesion aun no disponible" en registerQuickPassenger/registerQuickDriver
--    (buscar el perfil por telefono cuando auth.getUser() todavia no devuelve sesion tras
--    verificar el OTP) -- mismo caso ya resuelto para el flujo normal con la RPC SECURITY DEFINER
--    ag_upsert_user_by_phone (creada antes). Se agrega la hermana de solo lectura.
-- 2) resolveRefCode() -- resolver un codigo corto de invitacion (?r=<codigo>) a un UUID antes de
--    que la persona se registre.
-- 3) getPassengers() (paneles admin anda-gana-admin.component.ts / movi-admin.component.ts,
--    publihazclick) -- dependia de ag_users_admin_read por el mismo motivo ya documentado en
--    ag-admin-action/index.ts para ag_withdrawals/ag_drivers/etc: el admin nunca inicia sesion
--    real en el proyecto de Movi. Se agrega la accion 'list_passengers' a esa misma Edge Function
--    (ya trae su propio validador de admin/dev de publihazclick + service_role de Movi) en vez de
--    dejar la tabla abierta.

create or replace function public.ag_get_user_by_phone(p_phone text)
returns setof ag_users
language sql
security definer
set search_path = public
as $$
  select * from public.ag_users where phone = p_phone limit 1;
$$;

grant execute on function public.ag_get_user_by_phone(text) to anon, authenticated;

create or replace function public.ag_resolve_ref_code(p_code text)
returns uuid
language sql
security definer
set search_path = public
as $$
  select id from public.ag_users where ref_code = p_code limit 1;
$$;

grant execute on function public.ag_resolve_ref_code(text) to anon, authenticated;

drop policy if exists ag_users_admin_read on public.ag_users;
drop policy if exists ag_users_select_by_phone on public.ag_users;
