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
export type PtcAdType = 'mega' | 'standard_400' | 'standard_600' | 'mini';
export type PackageBannerStatus = 'pending' | 'active' | 'completed' | 'rejected';
export type AdLocation = 'landing' | 'app';

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
  ad_type?: PtcAdType;
  is_demo_only?: boolean;
  location?: AdLocation;
  advertiser_id: string;
  advertiser_username?: string;
  created_at: string;
  updated_at?: string;
}

export interface PtcTaskFilters {
  status?: TaskStatus;
  advertiserId?: string;
  search?: string;
  location?: AdLocation;
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
  location?: AdLocation;
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
  phone?: string;
  country?: string;
  country_code?: string;
  department?: string;
  city?: string;
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
  phone?: string;
  country?: string;
  country_code?: string;
  department?: string;
  city?: string;
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
  currency: string;
  features: string[];
  // Límites del paquete
  min_ptc_visits: number;
  min_banner_views: number;
  included_ptc_ads: number;
  has_clickable_banner: boolean;
  banner_clicks_limit: number;
  banner_impressions_limit: number;
  daily_ptc_limit: number;
  // Límites máximos
  max_ptc_ads: number;
  max_banner_ads: number;
  max_campaigns: number;
  // Bonificaciones
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
  currency?: string;
  duration_days: number;
  features?: string[];
  // Límites mínimos del paquete
  min_ptc_visits?: number;
  min_banner_views?: number;
  included_ptc_ads?: number;
  has_clickable_banner?: boolean;
  banner_clicks_limit?: number;
  banner_impressions_limit?: number;
  daily_ptc_limit?: number;
  // Límites máximos
  max_ptc_ads?: number;
  max_banner_ads?: number;
  max_campaigns?: number;
  // Bonificaciones
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
  location?: AdLocation;
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
  location?: AdLocation;
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
  location?: AdLocation;
}

// ============================================================================
// Niveles de Usuario
// ============================================================================

export interface UserLevel {
  id: string;
  level: number;
  name: string;
  min_referrals: number;
  max_referrals: number | null;
  referral_bonus_percentage: number;
  ptc_reward_multiplier: number;
  daily_ptc_limit: number;
  description: string | null;
  icon_url: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateUserLevelData {
  level: number;
  name: string;
  min_referrals: number;
  max_referrals?: number;
  referral_bonus_percentage?: number;
  ptc_reward_multiplier?: number;
  daily_ptc_limit?: number;
  description?: string;
  icon_url?: string;
}

// ============================================================================
// Donaciones
// ============================================================================

export interface Donation {
  id: string;
  user_id: string | null;
  username?: string;
  amount: number;
  source: 'ptc_click' | 'referral' | 'banner_click' | 'bonus';
  source_id: string | null;
  description: string | null;
  created_at: string;
}

export interface DonationStats {
  total_donations: number;
  total_amount: number;
  by_source: Record<string, number>;
}

// ============================================================================
// Banners de Paquetes
// ============================================================================

export interface PackageBanner {
  id: string;
  user_id: string;
  username?: string;
  user_package_id: string;
  package_name?: string;
  name: string | null;
  image_url: string;
  target_url: string;
  clicks_limit: number;
  impressions_limit: number;
  total_clicks: number;
  total_impressions: number;
  status: PackageBannerStatus;
  submitted_at: string;
  approved_at: string | null;
  approved_by: string | null;
  approved_by_username?: string;
  rejection_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreatePackageBannerData {
  user_id: string;
  user_package_id: string;
  name?: string;
  image_url: string;
  target_url: string;
  clicks_limit: number;
  impressions_limit: number;
}

export interface ApprovePackageBannerData {
  action: 'approve' | 'reject';
  reason?: string;
}

// ============================================================================
// Anuncios PTC (actualizado con tipos)
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
  ad_type?: PtcAdType;
  is_demo_only?: boolean;
  advertiser_id: string;
  advertiser_username?: string;
  created_at: string;
  updated_at?: string;
}

export interface CreatePtcTaskData {
  title: string;
  description: string;
  url: string;
  image_url?: string;
  reward: number;
  duration: number;
  daily_limit: number;
  ad_type?: PtcAdType;
  is_demo_only?: boolean;
  advertiser_id?: string;
}

// ============================================================================
// Estadísticas Extendidas
// ============================================================================

export interface SystemStats {
  total_users: number;
  active_advertisers: number;
  free_users: number;
  active_ptc_tasks: number;
  active_banners: number;
  total_real_balance: number;
  total_demo_balance: number;
  total_donations: number;
  total_referral_relationships: number;
}

// ============================================================================
// Respuesta de Validación de Referido
// ============================================================================

export interface ReferralCodeValidation {
  valid: boolean;
  referrer_id?: string;
  referrer_username?: string;
  referrer_level?: number;
  error?: string;
}

// ============================================================================
// Paquetes Actualizados (Precios $25, $50, $100, $150)
// ============================================================================

export interface PackageExtended extends Package {
  min_ptc_visits: number;
  min_banner_views: number;
  included_ptc_ads: number;
  has_clickable_banner: boolean;
  banner_clicks_limit: number;
  banner_impressions_limit: number;
  daily_ptc_limit: number;
  currency: string;
}

// ============================================================================
// Sistema de Niveles
// ============================================================================

export interface UserLevel {
  id: string;
  level: number;
  name: string;
  min_referrals: number;
  max_referrals: number | null;
  referral_bonus_percentage: number;
  ptc_reward_multiplier: number;
  daily_ptc_limit: number;
  description: string | null;
  icon_url: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface UserLevelProgress {
  current_level: UserLevel;
  next_level: UserLevel | null;
  current_referrals: number;
  referrals_needed: number;
  progress_percentage: number;
}

// ============================================================================
// Donaciones
// ============================================================================

export interface Donation {
  id: string;
  user_id: string | null;
  username?: string;
  amount: number;
  source: 'ptc_click' | 'referral' | 'banner_click' | 'bonus';
  source_id: string | null;
  description: string | null;
  created_at: string;
}

export interface DonationStats {
  total_donated: number;
  total_by_source: Record<string, number>;
  current_month_donations: number;
}

// ============================================================================
// Banners de Paquetes (clickables incluidos en paquete)
// ============================================================================

export interface PackageBanner {
  id: string;
  user_id: string;
  username?: string;
  user_package_id: string;
  package_name?: string;
  name: string | null;
  image_url: string;
  target_url: string;
  clicks_limit: number;
  impressions_limit: number;
  total_clicks: number;
  total_impressions: number;
  status: PackageBannerStatus;
  submitted_at: string;
  approved_at: string | null;
  approved_by: string | null;
  rejection_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreatePackageBannerData {
  name?: string;
  image_url: string;
  target_url: string;
  user_package_id: string;
}

export interface ModeratePackageBannerData {
  action: 'approve' | 'reject';
  reason?: string;
}

// ============================================================================
// PTC Tasks Actualizados
// ============================================================================

export interface PtcTaskExtended extends PtcTaskAdmin {
  ad_type: PtcAdType;
  is_demo_only: boolean;
}

export interface CreatePtcTaskExtendedData extends CreatePtcTaskData {
  ad_type?: PtcAdType;
  is_demo_only?: boolean;
}

// ============================================================================
// Estadísticas del Sistema
// ============================================================================

export interface SystemStats {
  total_users: number;
  active_advertisers: number;
  free_users: number;
  active_ptc_tasks: number;
  active_banners: number;
  total_real_balance: number;
  total_demo_balance: number;
  total_donations: number;
  total_referral_relationships: number;
}
