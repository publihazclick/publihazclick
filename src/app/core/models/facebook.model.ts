export type FbSubscriptionStatus = 'active' | 'inactive' | 'expired' | 'cancelled';
export type FbSessionStatus = 'connected' | 'disconnected' | 'pending' | 'banned' | 'limited';
export type FbGroupStatus = 'joined' | 'pending' | 'left' | 'blocked' | 'target';
export type FbCampaignType = 'group_join' | 'group_post' | 'group_message' | 'friend_message' | 'page_post' | 'page_message' | 'scheduled_post';
export type FbCampaignStatus = 'draft' | 'scheduled' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';
export type FbMediaType = 'none' | 'image' | 'video' | 'link' | 'album';
export type FbMsgMediaType = 'text' | 'image' | 'audio' | 'video' | 'file';

export interface FbSubscription {
  id: string;
  user_id: string;
  status: FbSubscriptionStatus;
  price: number;
  currency: string;
  started_at: string | null;
  expires_at: string | null;
  auto_renew: boolean;
  payment_method: string | null;
  payment_reference: string | null;
  created_at: string;
  updated_at: string;
}

export interface FbSession {
  id: string;
  user_id: string;
  account_name: string;
  profile_name: string | null;
  profile_url: string | null;
  status: FbSessionStatus;
  friends_count: number;
  groups_count: number;
  pages_count: number;
  last_connected_at: string | null;
  daily_actions_today: number;
  daily_actions_reset_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface FbGroup {
  id: string;
  user_id: string;
  group_fb_id: string | null;
  name: string;
  url: string | null;
  member_count: number;
  category: string | null;
  status: FbGroupStatus;
  is_posting_enabled: boolean;
  is_messaging_enabled: boolean;
  joined_at: string | null;
  last_posted_at: string | null;
  total_posts: number;
  total_messages_sent: number;
  created_at: string;
  updated_at: string;
}

export interface FbPage {
  id: string;
  user_id: string;
  page_fb_id: string | null;
  name: string;
  url: string | null;
  followers_count: number;
  category: string | null;
  is_active: boolean;
  last_posted_at: string | null;
  total_posts: number;
  total_messages_sent: number;
  created_at: string;
  updated_at: string;
}

export interface FbPostTemplate {
  id: string;
  user_id: string;
  name: string;
  content: string;
  media_urls: string[];
  media_type: FbMediaType;
  link_url: string | null;
  variables: string[];
  category: string;
  is_favorite: boolean;
  use_count: number;
  created_at: string;
  updated_at: string;
}

export interface FbMessageTemplate {
  id: string;
  user_id: string;
  name: string;
  content: string;
  media_url: string | null;
  media_type: FbMsgMediaType;
  variables: string[];
  category: string;
  is_favorite: boolean;
  use_count: number;
  created_at: string;
  updated_at: string;
}

export interface FbCampaign {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  campaign_type: FbCampaignType;
  status: FbCampaignStatus;
  post_template_id: string | null;
  message_template_id: string | null;
  target_group_ids: string[];
  target_page_ids: string[];
  target_keywords: string[];
  target_audience: string;
  min_delay_seconds: number;
  max_delay_seconds: number;
  daily_limit: number;
  hourly_limit: number;
  batch_size: number;
  batch_pause_minutes: number;
  warmup_enabled: boolean;
  warmup_start_count: number;
  warmup_increment: number;
  variation_enabled: boolean;
  human_typing_delay: boolean;
  random_breaks: boolean;
  scheduled_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  repeat_enabled: boolean;
  repeat_interval_hours: number | null;
  total_targets: number;
  completed_count: number;
  success_count: number;
  failed_count: number;
  skipped_count: number;
  created_at: string;
  updated_at: string;
  post_template?: FbPostTemplate;
  message_template?: FbMessageTemplate;
}

export interface FbScheduledPost {
  id: string;
  user_id: string;
  post_template_id: string | null;
  target_type: 'group' | 'page';
  target_id: string;
  target_name: string | null;
  scheduled_at: string;
  status: string;
  content: string | null;
  posted_at: string | null;
  error_message: string | null;
  repeat_enabled: boolean;
  repeat_interval_hours: number | null;
  created_at: string;
  updated_at: string;
}

export interface FbDashboardStats {
  totalGroups: number;
  totalPages: number;
  totalCampaigns: number;
  activeCampaigns: number;
  totalPostsSent: number;
  totalMessagesSent: number;
  totalGroupJoins: number;
  scheduledPosts: number;
  successRate: number;
  todayActions: number;
}

export interface FbAntiBlockConfig {
  min_delay_seconds: number;
  max_delay_seconds: number;
  daily_limit: number;
  hourly_limit: number;
  batch_size: number;
  batch_pause_minutes: number;
  warmup_enabled: boolean;
  warmup_start_count: number;
  warmup_increment: number;
  variation_enabled: boolean;
  human_typing_delay: boolean;
  random_breaks: boolean;
}

export const DEFAULT_FB_ANTI_BLOCK: FbAntiBlockConfig = {
  min_delay_seconds: 30,
  max_delay_seconds: 90,
  daily_limit: 25,
  hourly_limit: 8,
  batch_size: 5,
  batch_pause_minutes: 15,
  warmup_enabled: true,
  warmup_start_count: 5,
  warmup_increment: 3,
  variation_enabled: true,
  human_typing_delay: true,
  random_breaks: true,
};

export const FB_CAMPAIGN_TYPE_LABELS: Record<FbCampaignType, { label: string; icon: string; color: string }> = {
  group_join: { label: 'Unirse a Grupos', icon: 'group_add', color: 'text-green-400' },
  group_post: { label: 'Publicar en Grupos', icon: 'post_add', color: 'text-blue-400' },
  group_message: { label: 'Mensaje a Miembros', icon: 'chat', color: 'text-purple-400' },
  friend_message: { label: 'Mensaje a Amigos', icon: 'person', color: 'text-amber-400' },
  page_post: { label: 'Publicar en Paginas', icon: 'article', color: 'text-cyan-400' },
  page_message: { label: 'Mensaje a Seguidores', icon: 'send', color: 'text-pink-400' },
  scheduled_post: { label: 'Publicacion Programada', icon: 'schedule', color: 'text-indigo-400' },
};
