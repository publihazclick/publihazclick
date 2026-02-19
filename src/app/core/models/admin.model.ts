/**
 * Modelos para el panel de administración
 */

import type { UserRole } from './profile.model';

// ============================================================================
// Enums y tipos
// ============================================================================

export type TaskStatus = 'active' | 'paused' | 'completed';
export type CampaignStatus = 'draft' | 'active' | 'paused' | 'completed';
export type WithdrawalStatus = 'pending' | 'approved' | 'rejected' | 'completed';
export type PackageType = 'basic' | 'premium' | 'enterprise' | 'custom';
export type UserPackageStatus = 'active' | 'expired' | 'cancelled';
export type BannerPosition = 'header' | 'sidebar' | 'footer' | 'interstitial';
export type BannerStatus = 'active' | 'paused' | 'completed' | 'rejected';

// ============================================================================
// Estadísticas del Dashboard
// ============================================================================

export interface DashboardStats {
  totalUsers: number;
  activeUsers: number;
  newUsersToday: number;
  totalAds: number;
  activeAds: number;
  pendingAds: number;
  totalRevenue: number;
  todayRevenue: number;
  pendingWithdrawals: number;
  totalWithdrawals: number;
}

export interface DailyActivity {
  date: string;
  userCount: number;
  adClicks: number;
  revenue: number;
}

export interface ChartData {
  labels: string[];
  datasets: {
    label: string;
    data: number[];
    color?: string;
  }[];
}

// ============================================================================
// Filtros y Paginación
// ============================================================================

export interface UserFilters {
  search?: string;
  role?: UserRole;
  isActive?: boolean;
  dateFrom?: string;
  dateTo?: string;
}

export interface PaginationParams {
  page: number;
  pageSize: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// ============================================================================
// Anuncios PTC para Admin
// ============================================================================

export interface PtcTaskAdmin {
  id: string;
  title: string;
  description: string;
  url: string;
  image_url: string | null;
  reward: number;
  duration: number;
  daily_limit: number;
  total_clicks: number;
  today_clicks?: number;
  status: TaskStatus;
  advertiser_id: string;
  advertiser_username?: string;
  created_at: string;
  updated_at?: string;
}

export interface PtcTaskFilters {
  status?: TaskStatus;
  advertiserId?: string;
  search?: string;
}

export interface CreatePtcTaskData {
  title: string;
  description: string;
  url: string;
  image_url?: string;
  reward: number;
  duration: number;
  daily_limit: number;
  advertiser_id?: string;
}

// ============================================================================
// Campañas para Admin
// ============================================================================

export interface CampaignAdmin {
  id: string;
  advertiser_id: string;
  advertiser_username?: string;
  name: string;
  description: string;
  campaign_type: 'banner' | 'ptc' | 'mixed';
  budget: number;
  daily_budget: number;
  spent: number;
  today_spent?: number;
  bid_per_click: number;
  status: CampaignStatus;
  start_date: string | null;
  end_date: string | null;
  total_clicks: number;
  total_impressions: number;
  ctr?: number;
  created_at: string;
  updated_at: string;
}

export interface CampaignFilters {
  status?: CampaignStatus;
  advertiserId?: string;
  search?: string;
}

export interface CreateCampaignData {
  name: string;
  description: string;
  campaign_type: 'banner' | 'ptc' | 'mixed';
  budget: number;
  daily_budget: number;
  bid_per_click: number;
  start_date?: string;
  end_date?: string;
  advertiser_id?: string;
}

// ============================================================================
// Retiros para Admin
// ============================================================================

export interface WithdrawalAdmin {
  id: string;
  user_id: string;
  username?: string;
  full_name?: string;
  amount: number;
  method: 'nequi' | 'daviplata' | 'bank_transfer' | 'crypto';
  details: WithdrawalDetails;
  status: WithdrawalStatus;
  processed_at: string | null;
  processed_by?: string;
  rejection_reason?: string;
  created_at: string;
}

export interface WithdrawalDetails {
  phone?: string;
  bank_name?: string;
  account_number?: string;
  account_type?: string;
  wallet_address?: string;
  crypto_currency?: string;
}

export interface WithdrawalFilters {
  status?: WithdrawalStatus;
  userId?: string;
  dateFrom?: string;
  dateTo?: string;
}

// ============================================================================
// Logs de Actividad
// ============================================================================

export interface ActivityLog {
  id: string;
  user_id: string | null;
  username?: string;
  full_name?: string;
  action: string;
  entity_type: 'user' | 'campaign' | 'ptc_task' | 'withdrawal' | 'system' | 'settings';
  entity_id: string | null;
  details: Record<string, unknown>;
  ip_address: string | null;
  created_at: string;
}

export interface ActivityLogFilters {
  action?: string;
  entityType?: ActivityLog['entity_type'];
  userId?: string;
  dateFrom?: string;
  dateTo?: string;
}

// ============================================================================
// Configuración de la Plataforma
// ============================================================================

export interface PlatformSettings {
  minWithdrawalAmount: number;
  maxWithdrawalAmount: number;
  referralCommissionPercent: number;
  ptcBaseReward: number;
  bannerAdBasePrice: number;
  maintenanceMode: boolean;
  allowNewRegistrations: boolean;
}

export interface PlatformSettingsDb {
  id: number;
  key: string;
  value: unknown;
  updated_at: string;
  updated_by?: string;
}

// ============================================================================
// Reportes
// ============================================================================

export interface RevenueReport {
  period: string;
  totalRevenue: number;
  adRevenue: number;
  subscriptionRevenue: number;
  withdrawalFees: number;
  otherRevenue: number;
}

export interface UserActivityReport {
  period: string;
  newUsers: number;
  activeUsers: number;
  totalClicks: number;
  totalEarnings: number;
}

export interface WithdrawalReport {
  period: string;
  totalRequests: number;
  approvedAmount: number;
  rejectedAmount: number;
  pendingAmount: number;
  byMethod: Record<string, number>;
}

// ============================================================================
// Usuario para Admin (extensión de Profile)
// ============================================================================

export interface UserAdmin {
  id: string;
  username: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  role: UserRole;
  level: number;
  is_active: boolean;
  balance: number;
  pending_balance: number;
  total_earned: number;
  total_spent: number;
  referral_earnings: number;
  referral_code: string;
  referred_by: string | null;
  referrer_username?: string;
  created_at: string;
  updated_at: string;
  last_sign_in_at?: string;
  total_clicks?: number;
  total_referrals?: number;
}

export interface CreateUserAdminData {
  email: string;
  password: string;
  username?: string;
  full_name?: string;
  role?: UserRole;
  is_active?: boolean;
  balance?: number;
}

export interface UpdateUserAdminData {
  username?: string;
  full_name?: string;
  role?: UserRole;
  is_active?: boolean;
  balance?: number;
}

export interface UpdateBalanceData {
  amount: number;
  reason: string;
  operation: 'add' | 'subtract' | 'set';
}

// ============================================================================
// Elementos Pendientes de Moderación
// ============================================================================

export interface PendingItem {
  id: string;
  type: 'campaign' | 'ptc_task';
  title: string;
  description: string;
  advertiser_id: string;
  advertiser_username?: string;
  submitted_at: string;
  preview_url?: string;
  image_url?: string;
}

export interface ModerationAction {
  action: 'approve' | 'reject';
  reason?: string;
}

// ============================================================================
// Respuestas API
// ============================================================================

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface StatsResponse {
  stats: DashboardStats;
  chartData: ChartData;
  pendingItems: PendingItem[];
  recentActivity: ActivityLog[];
}

// ============================================================================
// Paquetes
// ============================================================================

export interface Package {
  id: string;
  name: string;
  description: string | null;
  package_type: PackageType;
  price: number;
  duration_days: number;
  features: string[];
  max_ptc_ads: number;
  max_banner_ads: number;
  max_campaigns: number;
  ptc_reward_bonus: number;
  banner_reward_bonus: number;
  referral_bonus: number;
  is_active: boolean;
  display_order: number;
  created_at: string;
  updated_at: string;
}

export interface CreatePackageData {
  name: string;
  description?: string;
  package_type: PackageType;
  price: number;
  duration_days: number;
  features?: string[];
  max_ptc_ads?: number;
  max_banner_ads?: number;
  max_campaigns?: number;
  ptc_reward_bonus?: number;
  banner_reward_bonus?: number;
  referral_bonus?: number;
}

export interface UserPackage {
  id: string;
  user_id: string;
  username?: string;
  email?: string;
  package_id: string;
  package_name: string;
  start_date: string;
  end_date: string;
  status: UserPackageStatus;
  auto_renew: boolean;
  payment_method: string | null;
  payment_id: string | null;
  amount_paid: number | null;
  created_at: string;
}

export interface AssignPackageData {
  user_id: string;
  package_id: string;
  duration_days?: number;
  payment_method?: string;
  payment_id?: string;
  amount_paid?: number;
}

// ============================================================================
// Banner Ads
// ============================================================================

export interface BannerAd {
  id: string;
  advertiser_id: string;
  advertiser_username?: string;
  campaign_id: string | null;
  name: string;
  description: string | null;
  image_url: string;
  url: string;
  position: BannerPosition;
  impressions_limit: number;
  clicks_limit: number;
  daily_impressions: number;
  daily_clicks: number;
  total_impressions: number;
  total_clicks: number;
  reward: number;
  ctr: number;
  status: BannerStatus;
  start_date: string | null;
  end_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface BannerAdFilters {
  status?: BannerStatus;
  position?: BannerPosition;
  advertiserId?: string;
  search?: string;
}

export interface CreateBannerAdData {
  name: string;
  description?: string;
  image_url: string;
  url: string;
  position: BannerPosition;
  impressions_limit?: number;
  clicks_limit?: number;
  reward?: number;
  start_date?: string;
  end_date?: string;
  advertiser_id?: string;
  campaign_id?: string;
}
