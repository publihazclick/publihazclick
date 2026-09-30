-- ════════════════════════════════════════════════════════════════════════════
-- 293 · Videos del número de conductores (pedido del usuario, 2026-09-30)
--
-- QUÉ. El usuario grabó 4 videos (cómo funciona la app, recargas, por qué Movi
-- paga mejor, gana invitando) y pidió que el bot de conductores los mande en el
-- momento de la conversación en que sirven, SIN ningún costo adicional.
--
-- POR QUÉ ASÍ Y NO OTRA COSA:
--  · Mandar el video dentro de la ventana de 24h es gratis en WhatsApp (Meta solo
--    cobra plantillas). El bot solo los manda como respuesta a un mensaje del
--    conductor, así que siempre está dentro de la ventana.
--  · El video se sube UNA vez a Meta (/media) y se manda por su id. Así no hay un
--    link público que Meta descargue en cada envío -- eso sí consumiría
--    transferencia pagada. Meta borra lo subido a los 30 días; la función lo
--    vuelve a subir sola cuando el id pasa de 25 días (ver getVideoMediaId()).
--  · El archivo original vive en esta tabla (bytea) y no en Storage ni en la web:
--    en `public/` de la web se colaría dentro de la APK (webDir de Capacitor) y la
--    inflaría ~19 MB contra un baseline de ~8 MB. Son 4 archivos, ~19 MB en total.
--  · `activo` permite apagar un video sin tocar código (el de "por qué Movi paga
--    mejor" arranca apagado: dice $2.000/km y la fórmula real es otra, ver abajo).
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists public.ag_wa_videos (
  clave           text primary key,
  titulo          text not null,
  caption         text not null,
  activo          boolean not null default true,
  mime            text not null default 'video/mp4',
  contenido       bytea,
  media_id        text,
  media_subido_at timestamptz,
  updated_at      timestamptz not null default now()
);

comment on table public.ag_wa_videos is
  'Videos que el bot de conductores (ag-whatsapp) manda por WhatsApp. media_id = id en Meta, vence a los 30 días y la función lo renueva sola. Migración 293.';

-- Registro de envíos: evita mandarle el mismo video dos veces a la misma persona
-- en pocos días (repetir un video de 2 minutos es la forma más rápida de que
-- bloqueen el número) y deja medir cuántos se mandan y cuántos fallan.
create table if not exists public.ag_wa_video_envios (
  id          bigserial primary key,
  wa_phone    text not null,
  clave       text not null references public.ag_wa_videos(clave),
  motivo      text,
  ok          boolean not null,
  detalle     text,
  enviado_at  timestamptz not null default now()
);

create index if not exists ag_wa_video_envios_phone_clave_idx
  on public.ag_wa_video_envios (wa_phone, clave, enviado_at desc);

-- Solo la función (service role) toca estas tablas. RLS encendido y sin
-- políticas = nadie más puede leer ni escribir.
alter table public.ag_wa_videos        enable row level security;
alter table public.ag_wa_video_envios  enable row level security;

insert into public.ag_wa_videos (clave, titulo, caption, activo) values
  ('como_funciona', 'Cómo funciona la app (lado conductor)',
   'Así funciona Movi por dentro 👆 En 3 minutos: ponerte en línea, recibir una solicitud, aceptar o contraofertar, recoger al pasajero y cobrar.',
   true),
  ('recargas', 'Cómo recargar la billetera',
   'Así se recarga la billetera 👆 Desde $10.000, con tarjeta, PSE, Nequi, DaviPlata o en efectivo. Tu primer viaje no necesita saldo.',
   true),
  -- APAGADO a propósito: el audio dice "precio sugerido de $2.000 por kilómetro" y
  -- "no le permite bajarse más del 20%". La fórmula real (suggestPrice() en
  -- ag-whatsapp, igual a _calcPrice() en la app) es carro $4.000 + $1.000/km +
  -- $150/min y moto $2.500 + $800/km + $80/min, y el piso real es 75,23% del
  -- sugerido. El usuario decide si lo prende tal cual o lo regraba.
  ('por_que_movi', 'Por qué Movi paga mejor',
   'Por qué en Movi el kilómetro se paga mejor 👆',
   false),
  ('invitados', 'Gana invitando (2% vitalicio)',
   'Así sacas tu link de invitado 👆 Ganas el 2% de cada servicio que haga quien entre con él, de por vida.',
   true)
on conflict (clave) do nothing;
