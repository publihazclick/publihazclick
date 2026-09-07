-- Migración 277: marca de leído en el chat (2026-09-06)
--
-- El hueco: `chatUnread` es una señal en memoria del componente de Angular. El conductor
-- recibe tres mensajes, cierra la app sin abrir el chat, la vuelve a abrir -- y el globo
-- rojo aparece en cero. Los mensajes siguen ahí sin leer, pero nada lo indica. Peor aún:
-- si el conductor nunca tuvo la app abierta cuando llegó el mensaje, el contador nunca
-- llegó a subir, porque solo se incrementa desde la suscripción en tiempo real.
--
-- Con la columna, el "sin leer" es un hecho guardado y no un recuerdo de la sesión.
ALTER TABLE public.ag_chat_messages
  ADD COLUMN IF NOT EXISTS read_at timestamptz;

COMMENT ON COLUMN public.ag_chat_messages.read_at IS
  'Cuándo lo leyó el destinatario (el otro participante del viaje). NULL = sin leer.';

-- Índice pensado para la única consulta que se hace mucho: "¿cuántos sin leer tengo en
-- este viaje?". Parcial sobre los no leídos, que son siempre unos pocos, en vez de indexar
-- el historial completo.
CREATE INDEX IF NOT EXISTS ag_chat_messages_sin_leer_idx
  ON public.ag_chat_messages (request_id, sender_ag_user_id)
  WHERE read_at IS NULL;

-- Marca como leídos los mensajes que me escribió el OTRO en un viaje.
--
-- Va como función y no como un UPDATE suelto desde el cliente por dos motivos: deja la
-- regla "solo se marcan los mensajes ajenos, nunca los propios" en un solo lugar, y evita
-- que un error en la app marque como leído lo que no debe. La política de RLS de la tabla
-- ya limita el acceso a los participantes del viaje; esto además fija QUÉ se puede marcar.
CREATE OR REPLACE FUNCTION public.ag_chat_marcar_leido(p_request_id uuid, p_mi_ag_user_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_cuantos integer;
BEGIN
  -- El que llama tiene que ser de verdad ese usuario: sin esta comprobación, cualquiera
  -- podría marcar como leídos los mensajes de otra persona pasando su id.
  IF NOT EXISTS (
    SELECT 1 FROM public.ag_users u
     WHERE u.id = p_mi_ag_user_id AND u.auth_user_id = auth.uid()
  ) THEN
    RETURN 0;
  END IF;

  UPDATE public.ag_chat_messages
     SET read_at = now()
   WHERE request_id = p_request_id
     AND sender_ag_user_id <> p_mi_ag_user_id
     AND read_at IS NULL;

  GET DIAGNOSTICS v_cuantos = ROW_COUNT;
  RETURN v_cuantos;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.ag_chat_marcar_leido(uuid, uuid) TO authenticated;

COMMENT ON FUNCTION public.ag_chat_marcar_leido(uuid, uuid) IS
  'Marca como leídos los mensajes que el otro participante escribió en ese viaje. Devuelve cuántos marcó (migración 277).';
