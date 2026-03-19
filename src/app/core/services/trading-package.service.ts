import { Injectable } from '@angular/core';
import { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseClient } from '../supabase.client';

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

  // Catálogo hardcoded — siempre visible aunque la migración 039 no esté aplicada aún
  readonly defaultPackages: TradingBotPackage[] = [
    { id: '', name: 'JADE',            price_usd: 50,    monthly_return_pct: 2.0, description: null, is_active: true, display_order: 1, created_at: '' },
    { id: '', name: 'PERLA',           price_usd: 100,   monthly_return_pct: 2.5, description: null, is_active: true, display_order: 2, created_at: '' },
    { id: '', name: 'ZAFIRO',          price_usd: 200,   monthly_return_pct: 3.0, description: null, is_active: true, display_order: 3, created_at: '' },
    { id: '', name: 'RUBY',            price_usd: 500,   monthly_return_pct: 3.5, description: null, is_active: true, display_order: 4, created_at: '' },
    { id: '', name: 'ESMERALDA',       price_usd: 1000,  monthly_return_pct: 4.0, description: null, is_active: true, display_order: 5, created_at: '' },
    { id: '', name: 'DIAMANTE',        price_usd: 3000,  monthly_return_pct: 4.5, description: null, is_active: true, display_order: 6, created_at: '' },
    { id: '', name: 'DIAMANTE AZUL',   price_usd: 5000,  monthly_return_pct: 5.0, description: null, is_active: true, display_order: 7, created_at: '' },
    { id: '', name: 'DIAMANTE NEGRO',  price_usd: 7000,  monthly_return_pct: 5.5, description: null, is_active: true, display_order: 8, created_at: '' },
    { id: '', name: 'DIAMANTE CORONA', price_usd: 10000, monthly_return_pct: 6.0, description: null, is_active: true, display_order: 9, created_at: '' },
  ];

  async getTradingPackages(): Promise<TradingBotPackage[]> {
    try {
      const { data, error } = await this.supabase
        .from('trading_bot_packages')
        .select('*')
        .eq('is_active', true)
        .order('display_order', { ascending: true });
      // Si la tabla existe y tiene datos, usarlos; si no, devolver el catálogo hardcoded
      if (!error && data && data.length > 0) return data;
    } catch { /* tabla no existe aún */ }
    return this.defaultPackages;
  }

  async getAllUsers(page = 1, pageSize = 30): Promise<{ data: TradingUserResult[]; total: number }> {
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    const { data, error, count } = await this.supabase
      .from('profiles')
      .select('id, username, email, full_name, phone, role', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to);
    if (error) return { data: [], total: 0 };
    return { data: data || [], total: count ?? 0 };
  }

  async searchUsers(query: string): Promise<TradingUserResult[]> {
    const raw = query.trim();
    if (!raw) return [];
    // Only strip chars that break PostgREST filter structure; preserve dots so emails match
    const safeQ = raw.replace(/[,()'";\\]/g, '').trim();
    if (!safeQ) return [];
    const { data, error } = await this.supabase
      .from('profiles')
      .select('id, username, email, full_name, phone, role')
      .or(
        `full_name.ilike.%${safeQ}%,username.ilike.%${safeQ}%,email.ilike.%${safeQ}%,phone.ilike.%${safeQ}%`
      )
      .order('created_at', { ascending: false })
      .limit(50);
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
