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

  // Catálogo hardcoded — espejo exacto de los paquetes del módulo Trading Bot AI
  readonly defaultPackages: TradingBotPackage[] = [
    { id: '', name: 'Semilla',       price_usd: 100,   monthly_return_pct: 2.0, description: null, is_active: true, display_order:  1, created_at: '' },
    { id: '', name: 'Brote',         price_usd: 200,   monthly_return_pct: 2.1, description: null, is_active: true, display_order:  2, created_at: '' },
    { id: '', name: 'Iniciador',     price_usd: 500,   monthly_return_pct: 2.2, description: null, is_active: true, display_order:  3, created_at: '' },
    { id: '', name: 'Bronce I',      price_usd: 1000,  monthly_return_pct: 2.3, description: null, is_active: true, display_order:  4, created_at: '' },
    { id: '', name: 'Bronce II',     price_usd: 1500,  monthly_return_pct: 2.4, description: null, is_active: true, display_order:  5, created_at: '' },
    { id: '', name: 'Bronce III',    price_usd: 2000,  monthly_return_pct: 2.5, description: null, is_active: true, display_order:  6, created_at: '' },
    { id: '', name: 'Plata I',       price_usd: 2500,  monthly_return_pct: 2.6, description: null, is_active: true, display_order:  7, created_at: '' },
    { id: '', name: 'Plata II',      price_usd: 3000,  monthly_return_pct: 2.7, description: null, is_active: true, display_order:  8, created_at: '' },
    { id: '', name: 'Plata III',     price_usd: 3500,  monthly_return_pct: 2.8, description: null, is_active: true, display_order:  9, created_at: '' },
    { id: '', name: 'Oro I',         price_usd: 4000,  monthly_return_pct: 3.0, description: null, is_active: true, display_order: 10, created_at: '' },
    { id: '', name: 'Oro II',        price_usd: 4500,  monthly_return_pct: 3.1, description: null, is_active: true, display_order: 11, created_at: '' },
    { id: '', name: 'Oro III',       price_usd: 5000,  monthly_return_pct: 3.2, description: null, is_active: true, display_order: 12, created_at: '' },
    { id: '', name: 'Zafiro I',      price_usd: 5500,  monthly_return_pct: 3.3, description: null, is_active: true, display_order: 13, created_at: '' },
    { id: '', name: 'Zafiro II',     price_usd: 6000,  monthly_return_pct: 3.4, description: null, is_active: true, display_order: 14, created_at: '' },
    { id: '', name: 'Zafiro III',    price_usd: 6500,  monthly_return_pct: 3.5, description: null, is_active: true, display_order: 15, created_at: '' },
    { id: '', name: 'Esmeralda I',   price_usd: 7000,  monthly_return_pct: 3.6, description: null, is_active: true, display_order: 16, created_at: '' },
    { id: '', name: 'Esmeralda II',  price_usd: 7500,  monthly_return_pct: 3.7, description: null, is_active: true, display_order: 17, created_at: '' },
    { id: '', name: 'Esmeralda III', price_usd: 8000,  monthly_return_pct: 3.8, description: null, is_active: true, display_order: 18, created_at: '' },
    { id: '', name: 'Rubí I',        price_usd: 8500,  monthly_return_pct: 3.9, description: null, is_active: true, display_order: 19, created_at: '' },
    { id: '', name: 'Rubí II',       price_usd: 9000,  monthly_return_pct: 4.0, description: null, is_active: true, display_order: 20, created_at: '' },
    { id: '', name: 'Rubí III',      price_usd: 9500,  monthly_return_pct: 4.1, description: null, is_active: true, display_order: 21, created_at: '' },
    { id: '', name: 'Diamante I',    price_usd: 10000, monthly_return_pct: 4.2, description: null, is_active: true, display_order: 22, created_at: '' },
    { id: '', name: 'Diamante II',   price_usd: 10500, monthly_return_pct: 4.3, description: null, is_active: true, display_order: 23, created_at: '' },
    { id: '', name: 'Diamante III',  price_usd: 11000, monthly_return_pct: 4.4, description: null, is_active: true, display_order: 24, created_at: '' },
    { id: '', name: 'Platino I',     price_usd: 11500, monthly_return_pct: 4.5, description: null, is_active: true, display_order: 25, created_at: '' },
    { id: '', name: 'Platino II',    price_usd: 12000, monthly_return_pct: 4.6, description: null, is_active: true, display_order: 26, created_at: '' },
    { id: '', name: 'Platino III',   price_usd: 12500, monthly_return_pct: 4.7, description: null, is_active: true, display_order: 27, created_at: '' },
    { id: '', name: 'Élite I',       price_usd: 13000, monthly_return_pct: 4.8, description: null, is_active: true, display_order: 28, created_at: '' },
    { id: '', name: 'Élite II',      price_usd: 13500, monthly_return_pct: 4.9, description: null, is_active: true, display_order: 29, created_at: '' },
    { id: '', name: 'Élite III',     price_usd: 14000, monthly_return_pct: 5.0, description: null, is_active: true, display_order: 30, created_at: '' },
    { id: '', name: 'Máster I',      price_usd: 14500, monthly_return_pct: 5.1, description: null, is_active: true, display_order: 31, created_at: '' },
    { id: '', name: 'Máster II',     price_usd: 15000, monthly_return_pct: 5.2, description: null, is_active: true, display_order: 32, created_at: '' },
    { id: '', name: 'Máster III',    price_usd: 15500, monthly_return_pct: 5.3, description: null, is_active: true, display_order: 33, created_at: '' },
    { id: '', name: 'Leyenda I',     price_usd: 16000, monthly_return_pct: 5.4, description: null, is_active: true, display_order: 34, created_at: '' },
    { id: '', name: 'Leyenda II',    price_usd: 16500, monthly_return_pct: 5.5, description: null, is_active: true, display_order: 35, created_at: '' },
    { id: '', name: 'Leyenda III',   price_usd: 17000, monthly_return_pct: 5.6, description: null, is_active: true, display_order: 36, created_at: '' },
    { id: '', name: 'VIP I',         price_usd: 17500, monthly_return_pct: 5.7, description: null, is_active: true, display_order: 37, created_at: '' },
    { id: '', name: 'VIP II',        price_usd: 18000, monthly_return_pct: 5.8, description: null, is_active: true, display_order: 38, created_at: '' },
    { id: '', name: 'VIP III',       price_usd: 18500, monthly_return_pct: 5.9, description: null, is_active: true, display_order: 39, created_at: '' },
    { id: '', name: 'Black I',       price_usd: 19000, monthly_return_pct: 5.9, description: null, is_active: true, display_order: 40, created_at: '' },
    { id: '', name: 'Black II',      price_usd: 19500, monthly_return_pct: 6.0, description: null, is_active: true, display_order: 41, created_at: '' },
    { id: '', name: 'Ápex',          price_usd: 20000, monthly_return_pct: 6.0, description: null, is_active: true, display_order: 42, created_at: '' },
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

  async getMyPackageById(userPkgId: string): Promise<UserTradingPackage | null> {
    const { data: { user } } = await this.supabase.auth.getUser();
    if (!user) return null;
    const { data, error } = await this.supabase
      .from('user_trading_packages')
      .select('*, package:package_id(id, name, price_usd, monthly_return_pct, display_order)')
      .eq('id', userPkgId)
      .eq('user_id', user.id)
      .single();
    if (error) return null;
    return data;
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
