-- Tabla para mensajes WhatsApp entrantes de usuarios Movi
create table if not exists ag_whatsapp_messages (
  id               uuid primary key default gen_random_uuid(),
  from_number      text not null,
  message_text     text,
  wa_message_id    text unique,
  direction        text not null check (direction in ('inbound','outbound')),
  event_type       text,
  trip_id          uuid references ag_trips(id) on delete set null,
  user_id          uuid references auth.users(id) on delete set null,
  created_at       timestamptz default now()
);

alter table ag_whatsapp_messages enable row level security;

-- Solo admins y service_role pueden leer
create policy "admin_read_wa_messages" on ag_whatsapp_messages
  for select using (
    exists (
      select 1 from profiles where id = auth.uid() and role in ('admin','dev')
    )
  );
