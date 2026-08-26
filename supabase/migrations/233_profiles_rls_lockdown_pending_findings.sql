-- Cierra 2 de los 3 hallazgos "menores" pendientes de la auditoria de seguridad 2026-08-25
-- (correo real de Supabase Security Advisor): profiles tenia DOS politicas SELECT wide-open
-- (cualquiera, incluso sin sesion, podia leer TODA la tabla -- email, phone, balance,
-- pending_balance, total_earned, real_balance, referral_earnings de cualquier usuario, no solo el
-- propio) y ai_action_pricing/referral_commission_settings tenian una politica "service_manages_X"
-- que en realidad daba escritura a CUALQUIERA (roles:{public}), no solo a service_role como decia
-- el nombre.

-- 1) RPC para validar codigo de referido SIN exponer la tabla profiles completa a usuarios
-- anonimos. Reemplaza la logica que hoy vive duplicada en el cliente
-- (ProfileService.validateReferralCode, profile.service.ts) -- esa version consulta 'profiles'
-- directo con la clave anonima (select 'id, username, is_active, email' + busqueda ilike libre por
-- email/username/referral_code/referral_link), lo cual solo funcionaba sin romper nada porque la
-- tabla estaba wide-open. Ya existia un metodo hermano (validateReferralCodeWithDB) armado para
-- llamar exactamente esta funcion, pero la funcion nunca se habia creado en la base de datos --
-- quedo muerta. Misma logica que el metodo cliente (fallback admin 'adm00001' por email o
-- username='admin', luego referral_code, luego referral_link con soporte de URL completa),
-- corriendo con permisos elevados (SECURITY DEFINER) para no depender de acceso publico a la tabla.
create or replace function public.validate_referral_code(code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text := lower(trim(code));
  v_url_match text;
  v_id uuid;
  v_username text;
  v_is_active boolean;
begin
  if v_code = '' then
    return jsonb_build_object('valid', false, 'error', 'Código de referido requerido');
  end if;

  if v_code = 'adm00001' then
    select id, username, is_active into v_id, v_username, v_is_active
      from profiles where lower(email) like '%publihazclick.com@gmail.com%' limit 1;
    if v_id is null then
      select id, username, is_active into v_id, v_username, v_is_active
        from profiles where username = 'admin' limit 1;
    end if;
  end if;

  if v_id is null then
    v_url_match := substring(v_code from 'register[/:]([a-zA-Z0-9\-]+)');
    if v_url_match is not null then
      v_code := v_url_match;
    end if;

    select id, username, is_active into v_id, v_username, v_is_active
      from profiles where lower(referral_code) = v_code limit 1;

    if v_id is null then
      select id, username, is_active into v_id, v_username, v_is_active
        from profiles where referral_link ilike '%' || v_code || '%' limit 1;
    end if;
  end if;

  if v_id is null then
    return jsonb_build_object('valid', false, 'error', 'Código de referido inválido');
  end if;

  if not v_is_active then
    return jsonb_build_object('valid', false, 'error', 'El usuario referidor no está activo');
  end if;

  return jsonb_build_object('valid', true, 'referrer_id', v_id, 'referrer_username', v_username);
end;
$$;

grant execute on function public.validate_referral_code(text) to anon, authenticated;

-- 2) Vista de columnas seguras de profiles, para todo el resto de lecturas cross-usuario reales
-- del codigo (social.service.ts: directorio social, busqueda de vendedores en el marketplace;
-- recommend.component.ts y afines: lista de referidos propios) -- auditadas una por una, TODAS ya
-- seleccionan unicamente estas columnas hoy (nunca email/phone/balance de otro usuario), asi que
-- esta vista no les quita nada. Vista sin security_invoker: corre con los permisos de su dueño
-- (postgres, dueño de la tabla, bypasea RLS) para poder mostrar el subconjunto seguro de CUALQUIER
-- usuario -- la RLS de la tabla base (own/admin) sigue intacta para todo lo que no pase por aca.
create or replace view public.safe_profiles as
select
  id, username, full_name, avatar_url, role, level, is_active,
  country, city, department, created_at, total_referrals_count,
  has_active_package, referral_code, referral_link, referred_by
from public.profiles;

grant select on public.safe_profiles to anon, authenticated;

-- 3) Cierra las 2 politicas SELECT wide-open de profiles -- ya no hace falta ninguna de las dos
-- (referral validation ahora usa el RPC de arriba; las demas lecturas cross-usuario reales usan
-- safe_profiles). Las politicas own/admin que ya existian (id=auth.uid() / is_admin_or_dev)
-- siguen intactas.
drop policy if exists "Users can read all profiles" on public.profiles;
drop policy if exists "Allow public read profiles for referral validation" on public.profiles;

-- 4) ai_action_pricing / referral_commission_settings: la politica "service_manages_X" decia
-- serlo pero daba ALL a roles:{public} con qual/with_check=true -- cualquiera podia escribir estos
-- precios/porcentajes de comision sin autenticarse. service_role bypasea RLS de por si (no necesita
-- una politica explicita), asi que se reduce a admin -- el uso real de escritura en el codigo es
-- desde paneles admin.
drop policy if exists service_manages_ai_pricing on public.ai_action_pricing;
create policy admin_manages_ai_pricing on public.ai_action_pricing
  for all using (is_admin_or_dev(auth.uid())) with check (is_admin_or_dev(auth.uid()));

drop policy if exists service_manages_commission_settings on public.referral_commission_settings;
create policy admin_manages_commission_settings on public.referral_commission_settings
  for all using (is_admin_or_dev(auth.uid())) with check (is_admin_or_dev(auth.uid()));
