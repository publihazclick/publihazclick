-- ============================================================
-- 016_social_network.sql
-- Red social para anunciantes: conexiones, mensajes, perfiles
-- ============================================================

-- Perfil extendido de negocio (datos adicionales del anunciante)
CREATE TABLE IF NOT EXISTS social_business_profiles (
  user_id       UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  business_name TEXT,
  description   TEXT,
  category      TEXT,
  website       TEXT,
  whatsapp      TEXT,
  location      TEXT,
  banner_url    TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Conexiones entre anunciantes (solicitud de amistad)
CREATE TABLE IF NOT EXISTS social_connections (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  receiver_id  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status       TEXT NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending', 'accepted', 'rejected', 'blocked')),
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (requester_id, receiver_id)
);

-- Conversaciones directas (1 a 1)
CREATE TABLE IF NOT EXISTS social_conversations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_1   UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  participant_2   UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  last_message_at TIMESTAMPTZ DEFAULT NOW(),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (participant_1, participant_2)
);

-- Mensajes de chat
CREATE TABLE IF NOT EXISTS social_messages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES social_conversations(id) ON DELETE CASCADE,
  sender_id       UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  content         TEXT NOT NULL,
  type            TEXT NOT NULL DEFAULT 'text' CHECK (type IN ('text', 'image', 'file')),
  read_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_social_connections_requester ON social_connections(requester_id);
CREATE INDEX IF NOT EXISTS idx_social_connections_receiver  ON social_connections(receiver_id);
CREATE INDEX IF NOT EXISTS idx_social_conversations_p1      ON social_conversations(participant_1);
CREATE INDEX IF NOT EXISTS idx_social_conversations_p2      ON social_conversations(participant_2);
CREATE INDEX IF NOT EXISTS idx_social_messages_conv         ON social_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_social_messages_sender       ON social_messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_social_messages_created      ON social_messages(created_at DESC);

-- ============================================================
-- RLS Policies
-- ============================================================

ALTER TABLE social_business_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_connections        ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_conversations      ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_messages           ENABLE ROW LEVEL SECURITY;

-- social_business_profiles: cualquier advertiser/admin puede leer, solo el dueño edita
CREATE POLICY "social_bp_select" ON social_business_profiles
  FOR SELECT USING (true);

CREATE POLICY "social_bp_insert" ON social_business_profiles
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "social_bp_update" ON social_business_profiles
  FOR UPDATE USING (auth.uid() = user_id);

-- social_connections
CREATE POLICY "social_conn_select" ON social_connections
  FOR SELECT USING (
    auth.uid() = requester_id OR auth.uid() = receiver_id
  );

CREATE POLICY "social_conn_insert" ON social_connections
  FOR INSERT WITH CHECK (auth.uid() = requester_id);

CREATE POLICY "social_conn_update" ON social_connections
  FOR UPDATE USING (
    auth.uid() = receiver_id OR auth.uid() = requester_id
  );

CREATE POLICY "social_conn_delete" ON social_connections
  FOR DELETE USING (
    auth.uid() = requester_id OR auth.uid() = receiver_id
  );

-- social_conversations: solo participantes
CREATE POLICY "social_conv_select" ON social_conversations
  FOR SELECT USING (
    auth.uid() = participant_1 OR auth.uid() = participant_2
  );

CREATE POLICY "social_conv_insert" ON social_conversations
  FOR INSERT WITH CHECK (
    auth.uid() = participant_1 OR auth.uid() = participant_2
  );

-- social_messages: solo participantes de la conversación
CREATE POLICY "social_msg_select" ON social_messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM social_conversations c
      WHERE c.id = conversation_id
        AND (c.participant_1 = auth.uid() OR c.participant_2 = auth.uid())
    )
  );

CREATE POLICY "social_msg_insert" ON social_messages
  FOR INSERT WITH CHECK (
    auth.uid() = sender_id AND
    EXISTS (
      SELECT 1 FROM social_conversations c
      WHERE c.id = conversation_id
        AND (c.participant_1 = auth.uid() OR c.participant_2 = auth.uid())
    )
  );

-- Trigger: actualizar updated_at en social_connections
CREATE OR REPLACE FUNCTION update_social_connection_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_social_connections_updated
  BEFORE UPDATE ON social_connections
  FOR EACH ROW EXECUTE FUNCTION update_social_connection_timestamp();

-- Trigger: actualizar last_message_at en la conversación al insertar mensaje
CREATE OR REPLACE FUNCTION update_conversation_last_message()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE social_conversations
  SET last_message_at = NEW.created_at
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_update_last_message
  AFTER INSERT ON social_messages
  FOR EACH ROW EXECUTE FUNCTION update_conversation_last_message();
