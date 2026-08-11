-- Migración 215: soporte para pedir un viaje por WhatsApp "para otra persona" (pedido
-- explícito del usuario 2026-08-11, feature tipo Uber/InDrive).
--
-- Columnas nuevas en ag_wa_sessions (estado de la conversación en curso) -- puramente
-- aditivas, todas nullable, cero riesgo a filas/lecturas existentes:
--   is_for_self:     true por defecto (el caso de siempre, "para mí") -- false cuando el
--                     pasajero pide el viaje para otra persona.
--   traveler_name:    nombre de la persona que viaja (cuando is_for_self=false).
--   traveler_phone:   celular de la persona que viaja (cuando is_for_self=false) -- se
--                     guarda para referencia del conductor/soporte, NO se usa para
--                     mandarle mensajes automáticos de WhatsApp (esa persona nunca le
--                     ha escrito a Movi, y la API de WhatsApp Business no deja mandar
--                     mensajes libres a números que no iniciaron conversación sin una
--                     plantilla aprobada por Meta -- queda para una fase futura).
--
-- ag_trip_requests NO necesita ninguna columna nueva: se reutilizan `passenger_name`
-- (ya existe, el conductor YA la lee con prioridad sobre el nombre de la cuenta, ver
-- anda-gana.component.ts ~línea 597-601) y `for_other` JSONB (agregada en la migración
-- 116, nunca usada en ningún lado del código hasta ahora).
ALTER TABLE public.ag_wa_sessions
  ADD COLUMN IF NOT EXISTS is_for_self   boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS traveler_name text,
  ADD COLUMN IF NOT EXISTS traveler_phone text;
