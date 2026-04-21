-- =============================================================================
-- Migración 132: tabla ai_projects — historial persistente de generaciones IA
-- =============================================================================
-- Cada imagen, video, script, audio que genere el usuario queda registrado
-- aquí para mostrarlo en el dashboard y permitirle volver a su trabajo.
--
-- kind identifica el tipo de generación:
--   image, video, script, audio, niches, ideas, photo_avatar
--
-- data JSONB guarda lo específico de cada kind (url, prompt, avatar, etc).
-- =============================================================================

CREATE TABLE IF NOT EXISTS ai_projects (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind        text NOT NULL CHECK (kind IN ('image','video','script','audio','niches','ideas','photo_avatar')),
  title       text,
  prompt      text,
  status      text NOT NULL DEFAULT 'completed' CHECK (status IN ('completed','processing','failed')),
  provider    text,          -- 'vertex','flux','heygen','runway','gemini','openai','elevenlabs','edge', etc
  cost_cop    integer NOT NULL DEFAULT 0,
  url         text,          -- URL pública del asset generado (si aplica)
  thumbnail   text,          -- URL thumbnail (imagen de preview)
  data        jsonb NOT NULL DEFAULT '{}'::jsonb,
  external_id text,          -- video_id HeyGen/Runway, etc
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_projects_user_created_idx
  ON ai_projects (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS ai_projects_kind_idx
  ON ai_projects (user_id, kind, created_at DESC);

CREATE INDEX IF NOT EXISTS ai_projects_external_id_idx
  ON ai_projects (external_id) WHERE external_id IS NOT NULL;

-- Trigger updated_at
CREATE OR REPLACE FUNCTION ai_projects_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ai_projects_updated ON ai_projects;
CREATE TRIGGER trg_ai_projects_updated
BEFORE UPDATE ON ai_projects
FOR EACH ROW EXECUTE FUNCTION ai_projects_set_updated_at();

-- RLS
ALTER TABLE ai_projects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ai_projects_select ON ai_projects;
CREATE POLICY ai_projects_select ON ai_projects
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS ai_projects_insert ON ai_projects;
CREATE POLICY ai_projects_insert ON ai_projects
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS ai_projects_update ON ai_projects;
CREATE POLICY ai_projects_update ON ai_projects
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS ai_projects_delete ON ai_projects;
CREATE POLICY ai_projects_delete ON ai_projects
  FOR DELETE USING (auth.uid() = user_id);
