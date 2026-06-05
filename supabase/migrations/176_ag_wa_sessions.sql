-- ════════════════════════════════════════════════════════════
-- 176: WhatsApp Channel para Movi
-- ════════════════════════════════════════════════════════════

-- 1. Sesiones de conversación WhatsApp
create table if not exists ag_wa_sessions (
  id                  uuid primary key default gen_random_uuid(),
  wa_phone            text unique not null,                     -- número WA del usuario (+57...)
  state               text not null default 'idle',             -- estado de la conversación
  service_type        text,                                     -- carro/moto/domicilio/ciudad/flete
  origin_lat          double precision,
  origin_lng          double precision,
  origin_address      text,
  dest_name           text,
  dest_lat            double precision,
  dest_lng            double precision,
  offered_price       integer,
  package_desc        text,                                     -- para domicilio/flete
  trip_request_id     uuid references ag_trip_requests(id) on delete set null,
  active_offer_id     uuid references ag_trip_offers(id) on delete set null,
  ag_user_id          uuid references ag_users(id) on delete set null,
  driver_name         text,                                     -- buffer para notif pendiente
  driver_price        integer,
  driver_phone        text,
  driver_vehicle      text,
  driver_plate        text,
  matching_started_at timestamptz,
  last_message_at     timestamptz default now(),
  expires_at          timestamptz default now() + interval '2 hours',
  created_at          timestamptz default now()
);

alter table ag_wa_sessions enable row level security;

-- 2. Agregar columnas a ag_trip_requests para trips de WhatsApp
alter table ag_trip_requests
  add column if not exists source   text default 'app',
  add column if not exists wa_phone text;

-- 3. RPC: crear o recuperar usuario WA (guest sin auth)
create or replace function ag_get_or_create_wa_user(
  p_phone text,
  p_name  text default 'Usuario Movi'
) returns uuid language plpgsql security definer as $$
declare
  v_id uuid;
begin
  select id into v_id from ag_users where phone = p_phone limit 1;
  if v_id is null then
    insert into ag_users (phone, full_name, is_wa_guest)
      values (p_phone, p_name, true)
      returning id into v_id;
  end if;
  return v_id;
end;
$$;

-- Agregar columna is_wa_guest si no existe
alter table ag_users add column if not exists is_wa_guest boolean default false;

-- 4. RPC: aceptar oferta para viajes WA (sin necesitar auth del pasajero)
create or replace function ag_wa_accept_offer(
  p_offer_id        uuid,
  p_trip_request_id uuid
) returns void language plpgsql security definer as $$
begin
  -- Marcar la oferta como aceptada
  update ag_trip_offers set status = 'accepted' where id = p_offer_id;
  -- Rechazar las demás ofertas del mismo viaje
  update ag_trip_offers
    set status = 'rejected'
    where trip_request_id = p_trip_request_id and id <> p_offer_id and status = 'pending';
  -- Marcar el viaje como aceptado
  update ag_trip_requests
    set status = 'accepted'
    where id = p_trip_request_id;
end;
$$;

-- 5. Trigger: cuando llega una oferta a un viaje WA → llamar edge function
create or replace function ag_wa_offer_trigger_fn()
returns trigger language plpgsql security definer as $$
declare
  v_source text;
  v_wa_phone text;
begin
  -- Verificar que el viaje sea de WhatsApp
  select source, wa_phone
    into v_source, v_wa_phone
    from ag_trip_requests
    where id = NEW.trip_request_id;

  if v_source <> 'whatsapp' or v_wa_phone is null then
    return NEW;
  end if;

  -- Notificar via pg_net (no bloqueante)
  perform net.http_post(
    url     := 'https://btkdmdhzouzvzgyuzgbh.supabase.co/functions/v1/ag-whatsapp'::text,
    body    := json_build_object(
      '_internal_event', 'offer_received',
      'wa_phone',        v_wa_phone,
      'offer_id',        NEW.id::text,
      'trip_request_id', NEW.trip_request_id::text,
      'driver_name',     NEW.driver_name,
      'driver_phone',    NEW.driver_phone,
      'driver_vehicle',  NEW.driver_vehicle,
      'driver_plate',    NEW.driver_plate,
      'driver_rating',   NEW.driver_rating,
      'offered_price',   NEW.offered_price
    )::text,
    headers := '{"Content-Type":"application/json"}'::jsonb
  );

  return NEW;
end;
$$;

drop trigger if exists ag_wa_offer_trigger on ag_trip_offers;
create trigger ag_wa_offer_trigger
  after insert on ag_trip_offers
  for each row execute function ag_wa_offer_trigger_fn();

-- 6. Trigger: cuando el conductor completa viaje WA → notificar al usuario
create or replace function ag_wa_trip_completed_fn()
returns trigger language plpgsql security definer as $$
begin
  if NEW.driver_stage = 'arrived_at_destination'
     and (OLD.driver_stage is null or OLD.driver_stage <> 'arrived_at_destination')
     and NEW.source = 'whatsapp'
     and NEW.wa_phone is not null
  then
    perform net.http_post(
      url     := 'https://btkdmdhzouzvzgyuzgbh.supabase.co/functions/v1/ag-whatsapp'::text,
      body    := json_build_object(
        '_internal_event', 'trip_completed',
        'wa_phone',        NEW.wa_phone,
        'trip_request_id', NEW.id::text,
        'amount',          coalesce(NEW.offered_price, 0)
      )::text,
      headers := '{"Content-Type":"application/json"}'::jsonb
    );
  end if;
  return NEW;
end;
$$;

drop trigger if exists ag_wa_trip_completed_trigger on ag_trip_requests;
create trigger ag_wa_trip_completed_trigger
  after update on ag_trip_requests
  for each row execute function ag_wa_trip_completed_fn();
