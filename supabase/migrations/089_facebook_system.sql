-- ============================================
-- Facebook Automatic System
-- $20/month subscription-based automation
-- ============================================

-- 1. Subscriptions
CREATE TABLE IF NOT EXISTS fb_subscriptions (
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
CREATE INDEX idx_fb_subscriptions_user ON fb_subscriptions(user_id);

-- 2. Facebook Sessions (connected accounts)
CREATE TABLE IF NOT EXISTS fb_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  account_name text NOT NULL DEFAULT 'Mi cuenta',
  profile_name text,
  profile_url text,
  status text NOT NULL DEFAULT 'disconnected' CHECK (status IN ('connected','disconnected','pending','banned','limited')),
  friends_count integer NOT NULL DEFAULT 0,
  groups_count integer NOT NULL DEFAULT 0,
  pages_count integer NOT NULL DEFAULT 0,
  last_connected_at timestamptz,
  daily_actions_today integer NOT NULL DEFAULT 0,
  daily_actions_reset_at timestamptz DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_fb_sessions_user ON fb_sessions(user_id);

-- 3. Facebook Groups
CREATE TABLE IF NOT EXISTS fb_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  group_fb_id text,
  name text NOT NULL,
  url text,
  member_count integer DEFAULT 0,
  category text,
  status text NOT NULL DEFAULT 'joined' CHECK (status IN ('joined','pending','left','blocked','target')),
  is_posting_enabled boolean NOT NULL DEFAULT true,
  is_messaging_enabled boolean NOT NULL DEFAULT true,
  joined_at timestamptz,
  last_posted_at timestamptz,
  total_posts integer NOT NULL DEFAULT 0,
  total_messages_sent integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, group_fb_id)
);
CREATE INDEX idx_fb_groups_user ON fb_groups(user_id);

-- 4. Facebook Pages (managed by user)
CREATE TABLE IF NOT EXISTS fb_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  page_fb_id text,
  name text NOT NULL,
  url text,
  followers_count integer DEFAULT 0,
  category text,
  is_active boolean NOT NULL DEFAULT true,
  last_posted_at timestamptz,
  total_posts integer NOT NULL DEFAULT 0,
  total_messages_sent integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_fb_pages_user ON fb_pages(user_id);

-- 5. Post Templates
CREATE TABLE IF NOT EXISTS fb_post_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name text NOT NULL,
  content text NOT NULL,
  media_urls text[] DEFAULT '{}',
  media_type text DEFAULT 'none' CHECK (media_type IN ('none','image','video','link','album')),
  link_url text,
  variables text[] DEFAULT '{}',
  category text NOT NULL DEFAULT 'general',
  is_favorite boolean NOT NULL DEFAULT false,
  use_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_fb_post_templates_user ON fb_post_templates(user_id);

-- 6. Message Templates
CREATE TABLE IF NOT EXISTS fb_message_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name text NOT NULL,
  content text NOT NULL,
  media_url text,
  media_type text DEFAULT 'text' CHECK (media_type IN ('text','image','audio','video','file')),
  variables text[] DEFAULT '{}',
  category text NOT NULL DEFAULT 'general',
  is_favorite boolean NOT NULL DEFAULT false,
  use_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_fb_message_templates_user ON fb_message_templates(user_id);

-- 7. Campaigns
CREATE TABLE IF NOT EXISTS fb_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  campaign_type text NOT NULL CHECK (campaign_type IN (
    'group_join',       -- Auto-join groups by keyword
    'group_post',       -- Post to groups
    'group_message',    -- DM group members
    'friend_message',   -- Message friends
    'page_post',        -- Post to managed pages
    'page_message',     -- Message page followers
    'scheduled_post'    -- Scheduled posts
  )),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','scheduled','running','paused','completed','failed','cancelled')),

  -- Template references
  post_template_id uuid REFERENCES fb_post_templates(id) ON DELETE SET NULL,
  message_template_id uuid REFERENCES fb_message_templates(id) ON DELETE SET NULL,

  -- Targeting
  target_group_ids uuid[] DEFAULT '{}',
  target_page_ids uuid[] DEFAULT '{}',
  target_keywords text[] DEFAULT '{}',
  target_audience text DEFAULT 'all' CHECK (target_audience IN ('all','selected','keyword')),

  -- Anti-blocking settings
  min_delay_seconds integer NOT NULL DEFAULT 30,
  max_delay_seconds integer NOT NULL DEFAULT 90,
  daily_limit integer NOT NULL DEFAULT 25,
  hourly_limit integer NOT NULL DEFAULT 8,
  batch_size integer NOT NULL DEFAULT 5,
  batch_pause_minutes integer NOT NULL DEFAULT 15,
  warmup_enabled boolean NOT NULL DEFAULT true,
  warmup_start_count integer NOT NULL DEFAULT 5,
  warmup_increment integer NOT NULL DEFAULT 3,
  variation_enabled boolean NOT NULL DEFAULT true,
  human_typing_delay boolean NOT NULL DEFAULT true,
  random_breaks boolean NOT NULL DEFAULT true,

  -- Schedule
  scheduled_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  repeat_enabled boolean NOT NULL DEFAULT false,
  repeat_interval_hours integer DEFAULT 24,

  -- Stats
  total_targets integer NOT NULL DEFAULT 0,
  completed_count integer NOT NULL DEFAULT 0,
  success_count integer NOT NULL DEFAULT 0,
  failed_count integer NOT NULL DEFAULT 0,
  skipped_count integer NOT NULL DEFAULT 0,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_fb_campaigns_user ON fb_campaigns(user_id);
CREATE INDEX idx_fb_campaigns_status ON fb_campaigns(status);

-- 8. Campaign Actions (individual tasks within a campaign)
CREATE TABLE IF NOT EXISTS fb_campaign_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES fb_campaigns(id) ON DELETE CASCADE,
  action_type text NOT NULL,
  target_name text,
  target_url text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','running','success','failed','skipped')),
  content text,
  error_message text,
  executed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_fb_campaign_actions_campaign ON fb_campaign_actions(campaign_id);

-- 9. Scheduled Posts
CREATE TABLE IF NOT EXISTS fb_scheduled_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  post_template_id uuid REFERENCES fb_post_templates(id) ON DELETE SET NULL,
  target_type text NOT NULL CHECK (target_type IN ('group','page')),
  target_id uuid NOT NULL,
  target_name text,
  scheduled_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','posted','failed','cancelled')),
  content text,
  posted_at timestamptz,
  error_message text,
  repeat_enabled boolean NOT NULL DEFAULT false,
  repeat_interval_hours integer DEFAULT 24,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_fb_scheduled_posts_user ON fb_scheduled_posts(user_id);
CREATE INDEX idx_fb_scheduled_posts_date ON fb_scheduled_posts(scheduled_at);

-- 10. Activity Logs
CREATE TABLE IF NOT EXISTS fb_activity_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  campaign_id uuid REFERENCES fb_campaigns(id) ON DELETE SET NULL,
  action text NOT NULL,
  details jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_fb_activity_logs_user ON fb_activity_logs(user_id);

-- ============================================
-- Row Level Security
-- ============================================
ALTER TABLE fb_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE fb_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE fb_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE fb_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE fb_post_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE fb_message_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE fb_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE fb_campaign_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE fb_scheduled_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE fb_activity_logs ENABLE ROW LEVEL SECURITY;

-- All tables: users see own data only
CREATE POLICY fb_sub_sel ON fb_subscriptions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY fb_sub_ins ON fb_subscriptions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY fb_sub_upd ON fb_subscriptions FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY fb_sess_sel ON fb_sessions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY fb_sess_ins ON fb_sessions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY fb_sess_upd ON fb_sessions FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY fb_sess_del ON fb_sessions FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY fb_grp_sel ON fb_groups FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY fb_grp_ins ON fb_groups FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY fb_grp_upd ON fb_groups FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY fb_grp_del ON fb_groups FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY fb_pg_sel ON fb_pages FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY fb_pg_ins ON fb_pages FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY fb_pg_upd ON fb_pages FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY fb_pg_del ON fb_pages FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY fb_pt_sel ON fb_post_templates FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY fb_pt_ins ON fb_post_templates FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY fb_pt_upd ON fb_post_templates FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY fb_pt_del ON fb_post_templates FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY fb_mt_sel ON fb_message_templates FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY fb_mt_ins ON fb_message_templates FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY fb_mt_upd ON fb_message_templates FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY fb_mt_del ON fb_message_templates FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY fb_camp_sel ON fb_campaigns FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY fb_camp_ins ON fb_campaigns FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY fb_camp_upd ON fb_campaigns FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY fb_camp_del ON fb_campaigns FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY fb_ca_sel ON fb_campaign_actions FOR SELECT
  USING (EXISTS (SELECT 1 FROM fb_campaigns c WHERE c.id = campaign_id AND c.user_id = auth.uid()));
CREATE POLICY fb_ca_ins ON fb_campaign_actions FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM fb_campaigns c WHERE c.id = campaign_id AND c.user_id = auth.uid()));

CREATE POLICY fb_sp_sel ON fb_scheduled_posts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY fb_sp_ins ON fb_scheduled_posts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY fb_sp_upd ON fb_scheduled_posts FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY fb_sp_del ON fb_scheduled_posts FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY fb_log_sel ON fb_activity_logs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY fb_log_ins ON fb_activity_logs FOR INSERT WITH CHECK (auth.uid() = user_id);

-- ============================================
-- Triggers
-- ============================================
CREATE TRIGGER trg_fb_subscriptions_upd BEFORE UPDATE ON fb_subscriptions FOR EACH ROW EXECUTE FUNCTION wa_updated_at();
CREATE TRIGGER trg_fb_sessions_upd BEFORE UPDATE ON fb_sessions FOR EACH ROW EXECUTE FUNCTION wa_updated_at();
CREATE TRIGGER trg_fb_groups_upd BEFORE UPDATE ON fb_groups FOR EACH ROW EXECUTE FUNCTION wa_updated_at();
CREATE TRIGGER trg_fb_pages_upd BEFORE UPDATE ON fb_pages FOR EACH ROW EXECUTE FUNCTION wa_updated_at();
CREATE TRIGGER trg_fb_post_templates_upd BEFORE UPDATE ON fb_post_templates FOR EACH ROW EXECUTE FUNCTION wa_updated_at();
CREATE TRIGGER trg_fb_message_templates_upd BEFORE UPDATE ON fb_message_templates FOR EACH ROW EXECUTE FUNCTION wa_updated_at();
CREATE TRIGGER trg_fb_campaigns_upd BEFORE UPDATE ON fb_campaigns FOR EACH ROW EXECUTE FUNCTION wa_updated_at();
CREATE TRIGGER trg_fb_scheduled_posts_upd BEFORE UPDATE ON fb_scheduled_posts FOR EACH ROW EXECUTE FUNCTION wa_updated_at();

-- Campaign stats auto-update
CREATE OR REPLACE FUNCTION update_fb_campaign_stats() RETURNS trigger AS $$
BEGIN
  UPDATE fb_campaigns SET
    completed_count = (SELECT count(*) FROM fb_campaign_actions WHERE campaign_id = NEW.campaign_id AND status IN ('success','failed','skipped')),
    success_count = (SELECT count(*) FROM fb_campaign_actions WHERE campaign_id = NEW.campaign_id AND status = 'success'),
    failed_count = (SELECT count(*) FROM fb_campaign_actions WHERE campaign_id = NEW.campaign_id AND status = 'failed'),
    skipped_count = (SELECT count(*) FROM fb_campaign_actions WHERE campaign_id = NEW.campaign_id AND status = 'skipped'),
    updated_at = now()
  WHERE id = NEW.campaign_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_fb_campaign_stats
  AFTER UPDATE OF status ON fb_campaign_actions
  FOR EACH ROW EXECUTE FUNCTION update_fb_campaign_stats();
