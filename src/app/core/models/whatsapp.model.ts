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

export type WaMediaKind = 'image' | 'audio' | 'video' | 'pdf';

export interface WaMediaItem {
  kind: WaMediaKind;
  url: string;
  filename: string;
  mimetype: string;
}

export interface WaTemplate {
  id: string;
  user_id: string;
  name: string;
  category: WaTemplateCategory;
  message_type: WaMessageType;
  content: string;
  content_variants: string[];
  media_url: string | null;
  media_filename: string | null;
  media_items: WaMediaItem[];
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
  block_count: number;
  current_block: number;
  block_completed_at: string | null;
  schedule_start_time: string | null; // HH:mm o HH:mm:ss
  schedule_end_time: string | null;
  schedule_days: number[]; // 0=dom ... 6=sab, vacío = todos
  schedule_timezone: string;
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
  totalFailed: number;
  totalPending: number;
  totalSending: number;
  successRate: number;
  failureRate: number;
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

export type WaAntiBlockPreset = 'new_account' | 'normal' | 'veteran';

export const ANTI_BLOCK_PRESETS: Record<WaAntiBlockPreset, WaAntiBlockConfig> = {
  // Cuenta nueva (<30 días) o sesión recién conectada. Máxima seguridad.
  new_account: {
    min_delay_seconds: 90,
    max_delay_seconds: 240,
    daily_limit: 15,
    hourly_limit: 5,
    batch_size: 3,
    batch_pause_seconds: 900,
    warmup_enabled: true,
    warmup_start_count: 8,
    warmup_increment: 3,
    variation_enabled: true,
  },
  // Cuenta normal (1-3 meses enviando regularmente).
  normal: {
    min_delay_seconds: 60,
    max_delay_seconds: 180,
    daily_limit: 40,
    hourly_limit: 8,
    batch_size: 5,
    batch_pause_seconds: 600,
    warmup_enabled: false,
    warmup_start_count: 20,
    warmup_increment: 5,
    variation_enabled: true,
  },
  // Cuenta veterana (3+ meses, número comercial con historial).
  veteran: {
    min_delay_seconds: 45,
    max_delay_seconds: 120,
    daily_limit: 80,
    hourly_limit: 12,
    batch_size: 6,
    batch_pause_seconds: 420,
    warmup_enabled: false,
    warmup_start_count: 30,
    warmup_increment: 10,
    variation_enabled: true,
  },
};

// Default = new_account. Siempre empezar en el preset más seguro.
export const DEFAULT_ANTI_BLOCK_CONFIG: WaAntiBlockConfig = { ...ANTI_BLOCK_PRESETS.new_account };

// Acortadores de URL que WhatsApp marca como spam. Si aparecen en una
// plantilla, se bloquea el guardado y se pide al usuario usar el link
// completo.
const URL_SHORTENER_DOMAINS = [
  'bit.ly', 'tinyurl.com', 't.co', 'goo.gl', 'ow.ly', 'is.gd',
  'buff.ly', 'rebrand.ly', 'cutt.ly', 'shorturl.at', 'tiny.cc',
  'lnkd.in', 'fb.me', 'amzn.to', 'adf.ly', 'soo.gd', 't.me',
  'v.gd', 'tr.im', 'snipurl.com', 'bc.vc', 'shorte.st',
  'ity.im', 'q.gs', 'po.st', 'bl.ink', 's.id', 'yourls.org',
];

const SHORTENER_REGEX = new RegExp(
  '\\b(' + URL_SHORTENER_DOMAINS.map(d => d.replace(/\./g, '\\.')).join('|') + ')\\b',
  'i',
);

export function findShortenerInText(text: string): string | null {
  if (!text) return null;
  const match = SHORTENER_REGEX.exec(text);
  return match ? match[1] : null;
}
