-- Código de invitación corto y personalizado para reemplazar el UUID crudo en el link
-- de invitación de Movi (".../movi?ref=<uuid completo>" era demasiado largo/feo, pedido
-- explícito del usuario 2026-08-22). El link nuevo usa "?r=<código>" (ej. "carlos4821"),
-- basado en el primer nombre + un sufijo aleatorio para garantizar unicidad.
--
-- IMPORTANTE: referred_by sigue siendo un UUID (FK a ag_users.id) -- el código corto solo
-- se usa en el link público, el frontend lo resuelve al UUID real antes de guardarlo (ver
-- anda-gana.component.ts). Los links viejos con "?ref=<uuid>" se siguen aceptando también,
-- para no romper atribución de campañas ya compartidas (ver movi_cucuta_*).

ALTER TABLE ag_users ADD COLUMN IF NOT EXISTS ref_code text;

CREATE UNIQUE INDEX IF NOT EXISTS ag_users_ref_code_idx ON ag_users(ref_code) WHERE ref_code IS NOT NULL;

CREATE OR REPLACE FUNCTION ag_generate_ref_code(p_full_name text)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_base  text;
  v_code  text;
  v_tries int := 0;
BEGIN
  v_base := lower(regexp_replace(
    translate(coalesce(split_part(trim(p_full_name), ' ', 1), 'movi'),
      'áéíóúñÁÉÍÓÚÑ', 'aeiounAEIOUN'),
    '[^a-zA-Z0-9]', '', 'g'
  ));
  IF v_base = '' THEN v_base := 'movi'; END IF;
  v_base := left(v_base, 8);

  LOOP
    v_code := v_base || lpad((floor(random() * 100000))::int::text, 5, '0');
    EXIT WHEN NOT EXISTS (SELECT 1 FROM ag_users WHERE ref_code = v_code);
    v_tries := v_tries + 1;
    EXIT WHEN v_tries > 20;
  END LOOP;

  RETURN v_code;
END;
$$;

CREATE OR REPLACE FUNCTION ag_users_set_ref_code()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.ref_code IS NULL THEN
    NEW.ref_code := ag_generate_ref_code(NEW.full_name);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ag_users_ref_code ON ag_users;
CREATE TRIGGER trg_ag_users_ref_code
  BEFORE INSERT ON ag_users
  FOR EACH ROW
  EXECUTE FUNCTION ag_users_set_ref_code();

-- Backfill de usuarios existentes (uno por uno, no en una sola UPDATE masiva, para que
-- cada llamada a ag_generate_ref_code vea los códigos ya asignados a filas anteriores
-- del mismo backfill y no se puedan repetir entre sí).
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT id, full_name FROM ag_users WHERE ref_code IS NULL LOOP
    UPDATE ag_users SET ref_code = ag_generate_ref_code(r.full_name) WHERE id = r.id;
  END LOOP;
END;
$$;
