-- =============================================================================
-- Migration 080: Sistema de precios por acción IA con cobro automático
-- Tabla de precios editables por admin + función de cobro atómico
-- =============================================================================

-- ── 1. Tabla de precios por acción IA ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS ai_action_pricing (
  id            text        PRIMARY KEY, -- identificador único de la acción
  label         text        NOT NULL,    -- nombre legible
  category      text        NOT NULL,    -- 'script', 'image', 'voice', 'video', 'tools'
  price_cop     integer     NOT NULL,    -- precio que paga el usuario (COP)
  cost_cop      integer     NOT NULL DEFAULT 0, -- costo real para la plataforma (COP)
  is_active     boolean     NOT NULL DEFAULT true,
  description   text,
  updated_at    timestamptz DEFAULT now()
);

ALTER TABLE ai_action_pricing ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anyone_reads_ai_pricing" ON ai_action_pricing;
CREATE POLICY "anyone_reads_ai_pricing" ON ai_action_pricing FOR SELECT USING (true);

DROP POLICY IF EXISTS "service_manages_ai_pricing" ON ai_action_pricing;
CREATE POLICY "service_manages_ai_pricing" ON ai_action_pricing FOR ALL USING (true) WITH CHECK (true);

-- Insertar precios por defecto
INSERT INTO ai_action_pricing (id, label, category, price_cop, cost_cop, description) VALUES
  -- Guiones
  ('script_gemini',       'Guión con Gemini',           'script',  500,    8,     'Guión generado con Google Gemini (gratis para la plataforma)'),
  ('script_openai',       'Guión con GPT-4o',           'script',  500,    8,     'Guión creativo superior con OpenAI GPT-4o'),
  ('title_search',        'Búsqueda títulos virales',   'script',  200,    0,     'Buscar títulos virales en YouTube (gratis)'),

  -- Imágenes
  ('image_vertex',        'Imagen Vertex AI',           'image',   500,    154,   'Imagen generada con Google Vertex AI Imagen 3'),
  ('image_flux',          'Imagen Flux Pro',            'image',   800,    193,   'Imagen fotorrealista con Flux Pro (Replicate)'),
  ('face_swap',           'Face Swap',                  'tools',   1000,   19,    'Poner tu cara en un avatar profesional'),

  -- Voces
  ('tts_edge',            'Voz Edge TTS',               'voice',   200,    0,     'Narración con Microsoft Edge TTS (gratis)'),
  ('tts_elevenlabs',      'Voz ElevenLabs',             'voice',   2500,   693,   'Voz ultra-realista por escena con ElevenLabs'),
  ('voice_clone',         'Clonar mi voz',              'voice',   5000,   0,     'Clonar tu voz con solo 30 segundos de audio'),

  -- Videos
  ('video_heygen',        'Video Avatar HeyGen (1 min)','video',   20000,  6160,  'Video con avatar profesional hablando (1 minuto)'),
  ('video_runway_5s',     'Video Runway (5 seg)',       'video',   3500,   963,   'Video cinematográfico desde foto de producto (5 segundos)'),
  ('video_runway_10s',    'Video Runway (10 seg)',      'video',   7000,   1926,  'Video cinematográfico desde foto de producto (10 segundos)'),

  -- Chatbot
  ('chat_message',        'Mensaje PubliBot',           'tools',   100,    2,     'Mensaje al asistente de marketing IA')
ON CONFLICT (id) DO NOTHING;

-- ── 2. Función: cobrar acción IA del wallet ───────────────────────────────
-- Verifica saldo, cobra, registra transacción. Retorna ok o error.
CREATE OR REPLACE FUNCTION charge_ai_action(
  p_user_id   uuid,
  p_action_id text,
  p_metadata  jsonb DEFAULT '{}'
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_price     integer;
  v_cost      integer;
  v_label     text;
  v_active    boolean;
  v_balance   integer;
  v_wallet_id uuid;
BEGIN
  -- 1. Obtener precio de la acción
  SELECT price_cop, cost_cop, label, is_active
  INTO v_price, v_cost, v_label, v_active
  FROM ai_action_pricing WHERE id = p_action_id;

  IF v_price IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Acción no encontrada: ' || p_action_id);
  END IF;

  IF NOT COALESCE(v_active, false) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Esta acción no está disponible temporalmente');
  END IF;

  -- 2. Asegurar que existe la billetera
  PERFORM ai_ensure_wallet(p_user_id);

  -- 3. Verificar saldo suficiente
  SELECT id, balance INTO v_wallet_id, v_balance
  FROM ai_wallets WHERE user_id = p_user_id;

  IF v_balance < v_price THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'Saldo insuficiente. Necesitas ' || v_price || ' COP. Tienes ' || v_balance || ' COP.',
      'required', v_price,
      'balance', v_balance,
      'need_recharge', true
    );
  END IF;

  -- 4. Descontar del wallet
  UPDATE ai_wallets
  SET balance = balance - v_price,
      total_consumed = total_consumed + v_price,
      updated_at = now()
  WHERE user_id = p_user_id;

  -- 5. Registrar transacción
  INSERT INTO ai_wallet_transactions (wallet_id, user_id, type, amount, balance_after, description, metadata)
  VALUES (
    v_wallet_id,
    p_user_id,
    'consumption',
    -v_price,
    v_balance - v_price,
    v_label,
    jsonb_build_object('action_id', p_action_id, 'price_cop', v_price, 'cost_cop', v_cost, 'margin_cop', v_price - v_cost) || p_metadata
  );

  RETURN jsonb_build_object(
    'ok', true,
    'charged', v_price,
    'balance_after', v_balance - v_price,
    'action', v_label,
    'margin', v_price - v_cost
  );
END;
$$;

-- ── 3. Función: obtener todos los precios (para frontend) ─────────────────
CREATE OR REPLACE FUNCTION get_ai_pricing()
RETURNS SETOF ai_action_pricing LANGUAGE sql SECURITY DEFINER AS $$
  SELECT * FROM ai_action_pricing WHERE is_active = true ORDER BY category, price_cop;
$$;
