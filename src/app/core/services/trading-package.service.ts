import { Injectable } from '@angular/core';
import { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseClient } from '../supabase.client';
import { sanitizePostgrestFilter } from '../utils/sanitize';

export interface TradingBotPackage {
  id: string;
  name: string;
  price_usd: number;
  monthly_return_pct: number;
  description: string | null;
  is_active: boolean;
  display_order: number;
  created_at: string;
}

export interface UserTradingPackage {
  id: string;
  user_id: string;
  package_id: string;
  activated_by: string | null;
  activated_at: string;
  is_active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
  package?: TradingBotPackage;
}

export interface TradingUserResult {
  id: string;
  username: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  role: string;
}

@Injectable({ providedIn: 'root' })
export class TradingPackageService {
  private readonly supabase: SupabaseClient;

  constructor() {
    this.supabase = getSupabaseClient();
  }

  async getTradingPackages(): Promise<TradingBotPackage[]> {
    const { data, error } = await this.supabase
      .from('trading_bot_packages')
      .select('*')
      .eq('is_active', true)
      .order('display_order', { ascending: true });
    if (error) return [];
    return data || [];
  }

  async searchUsers(query: string): Promise<TradingUserResult[]> {
    if (!query || query.trim().length < 2) return [];
    const safeQ = sanitizePostgrestFilter(query.trim());
    if (!safeQ) return [];
    const { data, error } = await this.supabase
      .from('profiles')
      .select('id, username, email, full_name, phone, role')
      .or(`username.ilike.%${safeQ}%,email.ilike.%${safeQ}%,phone.ilike.%${safeQ}%`)
      .limit(15);
    if (error) return [];
    return data || [];
  }

  async getUserTradingPackages(userId: string): Promise<UserTradingPackage[]> {
    const { data, error } = await this.supabase
      .from('user_trading_packages')
      .select('*, package:package_id(id, name, price_usd, monthly_return_pct, display_order)')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (error) return [];
    return data || [];
  }

  async activatePackage(
    userId: string,
    packageId: string,
    notes?: string
  ): Promise<UserTradingPackage | null> {
    const {
      data: { user },
    } = await this.supabase.auth.getUser();
    if (!user) return null;
    const { data, error } = await this.supabase
      .from('user_trading_packages')
      .insert({
        user_id: userId,
        package_id: packageId,
        activated_by: user.id,
        is_active: true,
        notes: notes || null,
      })
      .select('*, package:package_id(id, name, price_usd, monthly_return_pct, display_order)')
      .single();
    if (error) return null;
    return data;
  }

  async togglePackage(userPackageId: string, isActive: boolean): Promise<boolean> {
    const { error } = await this.supabase
      .from('user_trading_packages')
      .update({ is_active: isActive, updated_at: new Date().toISOString() })
      .eq('id', userPackageId);
    return !error;
  }

  async getMyActivePackages(): Promise<UserTradingPackage[]> {
    const {
      data: { user },
    } = await this.supabase.auth.getUser();
    if (!user) return [];
    const { data, error } = await this.supabase
      .from('user_trading_packages')
      .select('*, package:package_id(id, name, price_usd, monthly_return_pct, display_order)')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .order('created_at', { ascending: true });
    if (error) return [];
    return data || [];
  }
}
