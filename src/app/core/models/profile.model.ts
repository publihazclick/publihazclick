/**
 * Tipos de roles de usuario
 */
export type UserRole = 'dev' | 'admin' | 'guest' | 'advertiser';

/**
 * Interfaz de perfil de usuario
 */
export interface Profile {
  id: string;
  username: string;
  referral_code: string;
  referral_link: string;
  referred_by: string | null;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  role: UserRole;
  level: number;
  is_active: boolean;
  // Saldos
  balance: number; // Legacy - mantener para compatibilidad
  real_balance: number;
  demo_balance: number;
  pending_balance: number;
  total_earned: number;
  total_demo_earned: number;
  total_spent: number;
  total_donated: number;
  referral_earnings: number;
  // Referidos
  total_referrals_count: number;
  // Paquete
  has_active_package: boolean;
  current_package_id: string | null;
  package_started_at: string | null;
  package_expires_at: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Interfaz de referido
 */
export interface Referral {
  id: string;
  referrer_id: string;
  referred_id: string;
  referred_username: string;
  referred_level: number;
  earnings: number;
  created_at: string;
}

/**
 * Opciones para actualizar perfil
 */
export interface UpdateProfileOptions {
  username?: string;
  full_name?: string;
  avatar_url?: string;
}

/**
 * Opciones para crear usuario desde admin
 */
export interface CreateUserOptions {
  email: string;
  password: string;
  username?: string;
  role?: UserRole;
}

/**
 * Respuesta de validación de código de referido
 */
export interface ReferralValidationResult {
  valid: boolean;
  referrer_id?: string;
  referrer_username?: string;
  error?: string;
}
