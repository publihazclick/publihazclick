-- Migración 275: límite de llamadas enmascaradas por viaje (2026-09-06)
--
-- Por qué: el botón "Llamar" del bot de WhatsApp había fallado el 100% de las veces
-- que alguien lo usó (1 de 1, el 2026-08-30). La causa raíz resultó ser que el perfil
-- de voz de Telnyx solo permitía llamar a Estados Unidos y Canadá, así que TODA llamada
-- a un celular colombiano se rechazaba. Al habilitar Colombia la llamada empieza a
-- costar plata de verdad, y hasta hoy no había ningún tope: el `timeLimit` era de 10
-- minutos y no había límite de intentos. Un solo usuario insistiendo podía vaciar el
-- saldo de Telnyx sin que nada lo frenara ni lo registrara.
--
-- Decisión del usuario (2026-09-06): 3 llamadas por viaje, de 3 minutos cada una.
-- Se descartó "una sola llamada por viaje" por un motivo concreto: si el conductor no
-- contesta la primera (va manejando, tiene el celular guardado, se le fue la señal), el
-- pasajero se queda sin recurso y cancela -- que es exactamente lo que ya pasó.
--
-- Esta tabla hace las dos cosas a la vez: pone el tope y deja el registro. Antes no
-- existía forma de saber cuántas llamadas se pedían; el único dato que teníamos salió
-- de leer transcripciones de WhatsApp a mano.
CREATE TABLE IF NOT EXISTS public.ag_masked_calls (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_request_id  uuid NOT NULL,
  -- Quién la pidió: 'passenger' (desde WhatsApp o la app) o 'driver' (desde la app).
  -- El tope cuenta LOS DOS juntos: es un tope por viaje, no por persona.
  quien            text NOT NULL CHECK (quien IN ('passenger', 'driver')),
  -- Si Telnyx la aceptó. Las rechazadas también se guardan: son la señal de que algo
  -- está mal (saldo agotado, país no habilitado) y son justo lo que no supimos ver
  -- durante meses.
  ok               boolean NOT NULL DEFAULT false,
  error            text,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ag_masked_calls_trip_idx
  ON public.ag_masked_calls (trip_request_id, created_at DESC);

ALTER TABLE public.ag_masked_calls ENABLE ROW LEVEL SECURITY;

-- Sin políticas para los clientes: solo la service role (las edge functions) escribe y
-- lee aquí. Un pasajero no tiene por qué poder consultar ni alterar el contador que lo
-- limita.
COMMENT ON TABLE public.ag_masked_calls IS
  'Registro y tope de llamadas enmascaradas por viaje. Máximo 3 por viaje, 3 minutos cada una (migración 275).';
