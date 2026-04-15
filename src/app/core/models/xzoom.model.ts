export type XzoomSubscriptionStatus = 'inactive' | 'pending' | 'active' | 'cancelled' | 'expired';
export type XzoomSessionStatus = 'scheduled' | 'live' | 'ended' | 'cancelled';
export type XzoomRecordingStatus = 'pending' | 'processing' | 'ready' | 'failed' | 'disabled';

export interface XzoomHost {
  id: string;
  user_id: string;
  slug: string;
  display_name: string;
  bio: string | null;
  avatar_url: string | null;
  cover_url: string | null;
  category: string | null;
  subscriber_price_cop: number;
  currency: string;
  is_active: boolean;
  livekit_room_name: string;
  pitch_video_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface XzoomHostSubscription {
  id: string;
  host_id: string;
  user_id: string;
  status: XzoomSubscriptionStatus;
  price_usd: number;
  price_cop: number | null;
  currency: string;
  started_at: string | null;
  expires_at: string | null;
  auto_renew: boolean;
  payment_method: string;
  payment_reference: string | null;
  created_at: string;
  updated_at: string;
}

export interface XzoomViewerSubscription {
  id: string;
  viewer_user_id: string;
  host_id: string;
  status: XzoomSubscriptionStatus;
  price_cop: number;
  currency: string;
  commission_rate: number;
  platform_cop: number | null;
  host_earnings_cop: number | null;
  started_at: string | null;
  expires_at: string | null;
  auto_renew: boolean;
  payment_method: string;
  payment_reference: string | null;
  created_at: string;
  updated_at: string;
}

export interface XzoomScheduledSession {
  id: string;
  host_id: string;
  title: string;
  description: string | null;
  scheduled_at: string;
  duration_minutes: number;
  status: XzoomSessionStatus;
  created_at: string;
  updated_at: string;
}

export interface XzoomLiveSession {
  id: string;
  host_id: string;
  scheduled_session_id: string | null;
  livekit_room_name: string;
  started_at: string;
  ended_at: string | null;
  peak_viewers: number;
  total_unique_viewers: number;
  recording_status: XzoomRecordingStatus;
  recording_url: string | null;
  recording_size_bytes: number | null;
  recording_duration_seconds: number | null;
  created_at: string;
}

export interface XzoomLiveKitTokenResponse {
  token: string;
  url: string;
  room: string;
  role: 'host' | 'viewer';
  host: { id: string; display_name: string };
}

export interface EpaycoCheckoutParams {
  publicKey: string;
  test: boolean;
  name: string;
  description: string;
  invoice: string;
  currency: string;
  amount: string;
  tax_base: string;
  tax: string;
  country: string;
  lang: string;
  email_billing: string;
  name_billing: string;
  extra1: string;
  extra2: string;
  extra3: string;
  confirmation: string;
  response: string;
}
