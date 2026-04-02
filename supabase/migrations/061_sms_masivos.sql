-- ============================================================
-- SMS MASIVOS — Tablas para plataforma de mensajería masiva
-- ============================================================

-- Contactos SMS
CREATE TABLE IF NOT EXISTS sms_contacts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  full_name TEXT NOT NULL,
  phone_number TEXT NOT NULL,
  country_code TEXT NOT NULL DEFAULT '+57',
  tags TEXT[] DEFAULT '{}',
  notes TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, phone_number)
);

-- Grupos de contactos
CREATE TABLE IF NOT EXISTS sms_contact_groups (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Miembros de grupos (M:N)
CREATE TABLE IF NOT EXISTS sms_contact_group_members (
  group_id UUID REFERENCES sms_contact_groups(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES sms_contacts(id) ON DELETE CASCADE,
  PRIMARY KEY (group_id, contact_id)
);

-- Plantillas de mensaje
CREATE TABLE IF NOT EXISTS sms_templates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  body TEXT NOT NULL,
  variables TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Campañas SMS
CREATE TABLE IF NOT EXISTS sms_campaigns (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  message_body TEXT NOT NULL,
  template_id UUID REFERENCES sms_templates(id) ON DELETE SET NULL,
  status TEXT CHECK (status IN ('draft','scheduled','sending','completed','failed','cancelled')) DEFAULT 'draft',
  scheduled_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  total_recipients INT DEFAULT 0,
  sent_count INT DEFAULT 0,
  delivered_count INT DEFAULT 0,
  failed_count INT DEFAULT 0,
  cost_per_sms NUMERIC(10,4) DEFAULT 0,
  total_cost NUMERIC(10,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Destinatarios de campaña (log por mensaje)
CREATE TABLE IF NOT EXISTS sms_campaign_recipients (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id UUID REFERENCES sms_campaigns(id) ON DELETE CASCADE NOT NULL,
  contact_id UUID REFERENCES sms_contacts(id) ON DELETE SET NULL,
  phone_number TEXT NOT NULL,
  contact_name TEXT,
  status TEXT CHECK (status IN ('pending','sent','delivered','failed','rejected')) DEFAULT 'pending',
  provider_message_id TEXT,
  error_message TEXT,
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  cost NUMERIC(10,4) DEFAULT 0
);

-- ============================================================
-- RLS
-- ============================================================

ALTER TABLE sms_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE sms_contact_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE sms_contact_group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE sms_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE sms_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE sms_campaign_recipients ENABLE ROW LEVEL SECURITY;

-- Contactos: cada usuario gestiona los suyos
CREATE POLICY "sms_contacts_own" ON sms_contacts FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Grupos: cada usuario gestiona los suyos
CREATE POLICY "sms_groups_own" ON sms_contact_groups FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Miembros de grupo: acceso si el grupo pertenece al usuario
CREATE POLICY "sms_group_members_own" ON sms_contact_group_members FOR ALL
  USING (EXISTS (SELECT 1 FROM sms_contact_groups WHERE id = group_id AND user_id = auth.uid()));

-- Plantillas: cada usuario gestiona las suyas
CREATE POLICY "sms_templates_own" ON sms_templates FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Campañas: cada usuario gestiona las suyas
CREATE POLICY "sms_campaigns_own" ON sms_campaigns FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Destinatarios: acceso si la campaña pertenece al usuario
CREATE POLICY "sms_recipients_own" ON sms_campaign_recipients FOR ALL
  USING (EXISTS (SELECT 1 FROM sms_campaigns WHERE id = campaign_id AND user_id = auth.uid()));

-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_sms_contacts_user ON sms_contacts(user_id, phone_number);
CREATE INDEX IF NOT EXISTS idx_sms_campaigns_user_status ON sms_campaigns(user_id, status);
CREATE INDEX IF NOT EXISTS idx_sms_recipients_campaign ON sms_campaign_recipients(campaign_id, status);
