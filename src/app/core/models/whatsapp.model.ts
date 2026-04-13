// ============================================
// WhatsApp Automatic Messaging System - Models
// ============================================

export type WaSubscriptionStatus = 'active' | 'expired' | 'cancelled';
export type WaSessionStatus = 'connected' | 'disconnected' | 'qr_pending' | 'banned';
export type WaMessageType = 'text' | 'image' | 'audio' | 'pdf' | 'video';
export type WaTemplateCategory = 'general' | 'marketing' | 'informativo' | 'recordatorio' | 'bienvenida';
export type WaCampaignStatus = 'draft' | 'scheduled' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';
export type WaCampaignTargetType = 'all' | 'group' | 'custom';
export type WaCampaignMessageStatus = 'pending' | 'sending' | 'sent' | 'delivered' | 'failed' | 'replied';

export interface WaSubscription {
  id: string;
  user_id: string;
  status: WaSubscriptionStatus;
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

export interface WaSession {
  id: string;
  user_id: string;
  phone_number: string | null;
  session_name: string;
  status: WaSessionStatus;
  last_connected_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface WaContact {
  id: string;
  user_id: string;
  phone: string;
  name: string | null;
  email: string | null;
  notes: string | null;
  tags: string[];
  is_valid: boolean;
  is_blocked: boolean;
  last_messaged_at: string | null;
  total_messages_sent: number;
  created_at: string;
  updated_at: string;
  groups?: WaContactGroup[];
}

export interface WaContactGroup {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  color: string;
  contacts_count: number;
  created_at: string;
  updated_at: string;
}

export interface WaTemplate {
  id: string;
  user_id: string;
  name: string;
  category: WaTemplateCategory;
  message_type: WaMessageType;
  content: string;
  media_url: string | null;
  media_filename: string | null;
  variables: string[];
  is_favorite: boolean;
  use_count: number;
  created_at: string;
  updated_at: string;
}

export interface WaCampaign {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  template_id: string | null;
  status: WaCampaignStatus;
  target_type: WaCampaignTargetType;
  target_group_id: string | null;
  target_contact_ids: string[];
  min_delay_seconds: number;
  max_delay_seconds: number;
  daily_limit: number;
  hourly_limit: number;
  batch_size: number;
  batch_pause_seconds: number;
  warmup_enabled: boolean;
  warmup_start_count: number;
  warmup_increment: number;
  variation_enabled: boolean;
  scheduled_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  total_contacts: number;
  sent_count: number;
  delivered_count: number;
  failed_count: number;
  reply_count: number;
  created_at: string;
  updated_at: string;
  template?: WaTemplate;
  target_group?: WaContactGroup;
}

export interface WaCampaignMessage {
  id: string;
  campaign_id: string;
  contact_id: string;
  status: WaCampaignMessageStatus;
  content: string | null;
  error_message: string | null;
  sent_at: string | null;
  delivered_at: string | null;
  created_at: string;
  contact?: WaContact;
}

export interface WaSendingLog {
  id: string;
  user_id: string;
  campaign_id: string | null;
  action: string;
  details: Record<string, unknown>;
  created_at: string;
}

export interface WaDashboardStats {
  totalContacts: number;
  totalGroups: number;
  totalCampaigns: number;
  totalTemplates: number;
  totalSent: number;
  totalDelivered: number;
  totalFailed: number;
  totalReplies: number;
  deliveryRate: number;
  replyRate: number;
  activeCampaigns: number;
  todaySent: number;
}

export interface WaAntiBlockConfig {
  min_delay_seconds: number;
  max_delay_seconds: number;
  daily_limit: number;
  hourly_limit: number;
  batch_size: number;
  batch_pause_seconds: number;
  warmup_enabled: boolean;
  warmup_start_count: number;
  warmup_increment: number;
  variation_enabled: boolean;
}

export const DEFAULT_ANTI_BLOCK_CONFIG: WaAntiBlockConfig = {
  min_delay_seconds: 15,
  max_delay_seconds: 45,
  daily_limit: 80,
  hourly_limit: 20,
  batch_size: 8,
  batch_pause_seconds: 180,
  warmup_enabled: true,
  warmup_start_count: 15,
  warmup_increment: 5,
  variation_enabled: true,
};
