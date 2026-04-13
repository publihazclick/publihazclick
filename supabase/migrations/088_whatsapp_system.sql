-- ============================================
-- WhatsApp Automatic Messaging System
-- $20/month subscription-based mass messaging
-- ============================================

-- 1. Subscriptions
CREATE TABLE IF NOT EXISTS wa_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'inactive' CHECK (status IN ('active','inactive','expired','cancelled')),
  price numeric(10,2) NOT NULL DEFAULT 20.00,
  currency text NOT NULL DEFAULT 'USD',
  started_at timestamptz,
  expires_at timestamptz,
  auto_renew boolean NOT NULL DEFAULT true,
  payment_method text,
  payment_reference text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_wa_subscriptions_user ON wa_subscriptions(user_id);
CREATE INDEX idx_wa_subscriptions_status ON wa_subscriptions(status);

-- 2. WhatsApp Sessions (QR-linked devices)
CREATE TABLE IF NOT EXISTS wa_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  phone_number text,
  session_name text NOT NULL DEFAULT 'Principal',
  status text NOT NULL DEFAULT 'disconnected' CHECK (status IN ('connected','disconnected','qr_pending','banned')),
  last_connected_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_wa_sessions_user ON wa_sessions(user_id);

-- 3. Contact Groups
CREATE TABLE IF NOT EXISTS wa_contact_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  color text NOT NULL DEFAULT '#22c55e',
  contacts_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_wa_contact_groups_user ON wa_contact_groups(user_id);

-- 4. Contacts
CREATE TABLE IF NOT EXISTS wa_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  phone text NOT NULL,
  name text,
  email text,
  notes text,
  tags text[] DEFAULT '{}',
  is_valid boolean DEFAULT true,
  is_blocked boolean DEFAULT false,
  last_messaged_at timestamptz,
  total_messages_sent integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, phone)
);

CREATE INDEX idx_wa_contacts_user ON wa_contacts(user_id);
CREATE INDEX idx_wa_contacts_phone ON wa_contacts(phone);

-- 5. Contact-Group junction
CREATE TABLE IF NOT EXISTS wa_contact_group_members (
  contact_id uuid NOT NULL REFERENCES wa_contacts(id) ON DELETE CASCADE,
  group_id uuid NOT NULL REFERENCES wa_contact_groups(id) ON DELETE CASCADE,
  PRIMARY KEY (contact_id, group_id)
);

-- 6. Message Templates
CREATE TABLE IF NOT EXISTS wa_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name text NOT NULL,
  category text NOT NULL DEFAULT 'general' CHECK (category IN ('general','marketing','informativo','recordatorio','bienvenida')),
  message_type text NOT NULL DEFAULT 'text' CHECK (message_type IN ('text','image','audio','pdf','video')),
  content text NOT NULL,
  media_url text,
  media_filename text,
  variables text[] DEFAULT '{}',
  is_favorite boolean NOT NULL DEFAULT false,
  use_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_wa_templates_user ON wa_templates(user_id);

-- 7. Campaigns
CREATE TABLE IF NOT EXISTS wa_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  template_id uuid REFERENCES wa_templates(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','scheduled','running','paused','completed','failed','cancelled')),

  -- Targeting
  target_type text NOT NULL DEFAULT 'all' CHECK (target_type IN ('all','group','custom')),
  target_group_id uuid REFERENCES wa_contact_groups(id) ON DELETE SET NULL,
  target_contact_ids uuid[] DEFAULT '{}',

  -- Anti-blocking settings
  min_delay_seconds integer NOT NULL DEFAULT 8,
  max_delay_seconds integer NOT NULL DEFAULT 25,
  daily_limit integer NOT NULL DEFAULT 200,
  hourly_limit integer NOT NULL DEFAULT 40,
  batch_size integer NOT NULL DEFAULT 10,
  batch_pause_seconds integer NOT NULL DEFAULT 60,
  warmup_enabled boolean NOT NULL DEFAULT false,
  warmup_start_count integer NOT NULL DEFAULT 20,
  warmup_increment integer NOT NULL DEFAULT 10,
  variation_enabled boolean NOT NULL DEFAULT true,

  -- Schedule
  scheduled_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,

  -- Stats
  total_contacts integer NOT NULL DEFAULT 0,
  sent_count integer NOT NULL DEFAULT 0,
  delivered_count integer NOT NULL DEFAULT 0,
  failed_count integer NOT NULL DEFAULT 0,
  reply_count integer NOT NULL DEFAULT 0,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_wa_campaigns_user ON wa_campaigns(user_id);
CREATE INDEX idx_wa_campaigns_status ON wa_campaigns(status);

-- 8. Campaign Messages (individual sends)
CREATE TABLE IF NOT EXISTS wa_campaign_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES wa_campaigns(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES wa_contacts(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sending','sent','delivered','failed','replied')),
  content text,
  error_message text,
  sent_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_wa_campaign_messages_campaign ON wa_campaign_messages(campaign_id);
CREATE INDEX idx_wa_campaign_messages_status ON wa_campaign_messages(status);

-- 9. Sending Logs (for analytics & anti-blocking)
CREATE TABLE IF NOT EXISTS wa_sending_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  campaign_id uuid REFERENCES wa_campaigns(id) ON DELETE SET NULL,
  action text NOT NULL,
  details jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_wa_sending_logs_user ON wa_sending_logs(user_id);
CREATE INDEX idx_wa_sending_logs_date ON wa_sending_logs(created_at);

-- ============================================
-- Row Level Security
-- ============================================

ALTER TABLE wa_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE wa_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE wa_contact_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE wa_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE wa_contact_group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE wa_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE wa_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE wa_campaign_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE wa_sending_logs ENABLE ROW LEVEL SECURITY;

-- Subscriptions: users see own
CREATE POLICY wa_subscriptions_select ON wa_subscriptions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY wa_subscriptions_insert ON wa_subscriptions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY wa_subscriptions_update ON wa_subscriptions FOR UPDATE USING (auth.uid() = user_id);

-- Sessions: users see own
CREATE POLICY wa_sessions_select ON wa_sessions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY wa_sessions_insert ON wa_sessions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY wa_sessions_update ON wa_sessions FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY wa_sessions_delete ON wa_sessions FOR DELETE USING (auth.uid() = user_id);

-- Contact Groups: users see own
CREATE POLICY wa_contact_groups_select ON wa_contact_groups FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY wa_contact_groups_insert ON wa_contact_groups FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY wa_contact_groups_update ON wa_contact_groups FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY wa_contact_groups_delete ON wa_contact_groups FOR DELETE USING (auth.uid() = user_id);

-- Contacts: users see own
CREATE POLICY wa_contacts_select ON wa_contacts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY wa_contacts_insert ON wa_contacts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY wa_contacts_update ON wa_contacts FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY wa_contacts_delete ON wa_contacts FOR DELETE USING (auth.uid() = user_id);

-- Contact Group Members: via contact ownership
CREATE POLICY wa_cgm_select ON wa_contact_group_members FOR SELECT
  USING (EXISTS (SELECT 1 FROM wa_contacts c WHERE c.id = contact_id AND c.user_id = auth.uid()));
CREATE POLICY wa_cgm_insert ON wa_contact_group_members FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM wa_contacts c WHERE c.id = contact_id AND c.user_id = auth.uid()));
CREATE POLICY wa_cgm_delete ON wa_contact_group_members FOR DELETE
  USING (EXISTS (SELECT 1 FROM wa_contacts c WHERE c.id = contact_id AND c.user_id = auth.uid()));

-- Templates: users see own
CREATE POLICY wa_templates_select ON wa_templates FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY wa_templates_insert ON wa_templates FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY wa_templates_update ON wa_templates FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY wa_templates_delete ON wa_templates FOR DELETE USING (auth.uid() = user_id);

-- Campaigns: users see own
CREATE POLICY wa_campaigns_select ON wa_campaigns FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY wa_campaigns_insert ON wa_campaigns FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY wa_campaigns_update ON wa_campaigns FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY wa_campaigns_delete ON wa_campaigns FOR DELETE USING (auth.uid() = user_id);

-- Campaign Messages: via campaign ownership
CREATE POLICY wa_cm_select ON wa_campaign_messages FOR SELECT
  USING (EXISTS (SELECT 1 FROM wa_campaigns c WHERE c.id = campaign_id AND c.user_id = auth.uid()));
CREATE POLICY wa_cm_insert ON wa_campaign_messages FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM wa_campaigns c WHERE c.id = campaign_id AND c.user_id = auth.uid()));
CREATE POLICY wa_cm_update ON wa_campaign_messages FOR UPDATE
  USING (EXISTS (SELECT 1 FROM wa_campaigns c WHERE c.id = campaign_id AND c.user_id = auth.uid()));

-- Sending Logs: users see own
CREATE POLICY wa_logs_select ON wa_sending_logs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY wa_logs_insert ON wa_sending_logs FOR INSERT WITH CHECK (auth.uid() = user_id);

-- ============================================
-- Functions
-- ============================================

-- Auto-update contacts_count on group membership changes
CREATE OR REPLACE FUNCTION update_wa_group_count() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE wa_contact_groups SET contacts_count = contacts_count + 1, updated_at = now() WHERE id = NEW.group_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE wa_contact_groups SET contacts_count = contacts_count - 1, updated_at = now() WHERE id = OLD.group_id;
    RETURN OLD;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_wa_group_count
  AFTER INSERT OR DELETE ON wa_contact_group_members
  FOR EACH ROW EXECUTE FUNCTION update_wa_group_count();

-- Update campaign stats on message status change
CREATE OR REPLACE FUNCTION update_wa_campaign_stats() RETURNS trigger AS $$
BEGIN
  UPDATE wa_campaigns SET
    sent_count = (SELECT count(*) FROM wa_campaign_messages WHERE campaign_id = NEW.campaign_id AND status IN ('sent','delivered','replied')),
    delivered_count = (SELECT count(*) FROM wa_campaign_messages WHERE campaign_id = NEW.campaign_id AND status IN ('delivered','replied')),
    failed_count = (SELECT count(*) FROM wa_campaign_messages WHERE campaign_id = NEW.campaign_id AND status = 'failed'),
    reply_count = (SELECT count(*) FROM wa_campaign_messages WHERE campaign_id = NEW.campaign_id AND status = 'replied'),
    updated_at = now()
  WHERE id = NEW.campaign_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_wa_campaign_stats
  AFTER UPDATE OF status ON wa_campaign_messages
  FOR EACH ROW EXECUTE FUNCTION update_wa_campaign_stats();

-- Update contact last_messaged_at
CREATE OR REPLACE FUNCTION update_wa_contact_messaged() RETURNS trigger AS $$
BEGIN
  IF NEW.status = 'sent' AND (OLD.status IS DISTINCT FROM 'sent') THEN
    UPDATE wa_contacts SET
      last_messaged_at = now(),
      total_messages_sent = total_messages_sent + 1,
      updated_at = now()
    WHERE id = NEW.contact_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_wa_contact_messaged
  AFTER UPDATE OF status ON wa_campaign_messages
  FOR EACH ROW EXECUTE FUNCTION update_wa_contact_messaged();

-- Updated_at trigger for all wa_ tables
CREATE OR REPLACE FUNCTION wa_updated_at() RETURNS trigger AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_wa_subscriptions_updated BEFORE UPDATE ON wa_subscriptions FOR EACH ROW EXECUTE FUNCTION wa_updated_at();
CREATE TRIGGER trg_wa_sessions_updated BEFORE UPDATE ON wa_sessions FOR EACH ROW EXECUTE FUNCTION wa_updated_at();
CREATE TRIGGER trg_wa_contacts_updated BEFORE UPDATE ON wa_contacts FOR EACH ROW EXECUTE FUNCTION wa_updated_at();
CREATE TRIGGER trg_wa_templates_updated BEFORE UPDATE ON wa_templates FOR EACH ROW EXECUTE FUNCTION wa_updated_at();
CREATE TRIGGER trg_wa_campaigns_updated BEFORE UPDATE ON wa_campaigns FOR EACH ROW EXECUTE FUNCTION wa_updated_at();
