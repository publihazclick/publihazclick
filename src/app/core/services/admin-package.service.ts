import { Injectable, inject } from '@angular/core';
import { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseClient } from '../supabase.client';
import type {
  Package,
  CreatePackageData,
  UserPackage,
  AssignPackageData,
  PaginatedResponse,
  PaginationParams,
  UserAdmin
} from '../models/admin.model';

/**
 * Servicio para gestión de paquetes (admin)
 */
@Injectable({
  providedIn: 'root'
})
export class AdminPackageService {
  private readonly supabase: SupabaseClient;

  constructor() {
    this.supabase = getSupabaseClient();
  }

  // ============================================================================
  // GESTIÓN DE PAQUETES (Configuración)
  // ============================================================================

  /**
   * Obtener todos los paquetes disponibles
   */
  async getPackages(): Promise<Package[]> {
    try {
      const { data, error } = await this.supabase
        .from('packages')
        .select('*')
        .eq('is_active', true)
        .order('display_order', { ascending: true });

      if (error) throw error;

      return (data || []).map(p => ({
        id: p.id,
        name: p.name,
        description: p.description,
        package_type: p.package_type,
        price: p.price || 0,
        duration_days: p.duration_days,
        currency: p.currency || 'USD',
        features: p.features || [],
        min_ptc_visits: p.min_ptc_visits || 0,
        min_banner_views: p.min_banner_views || 0,
        included_ptc_ads: p.included_ptc_ads || 0,
        has_clickable_banner: p.has_clickable_banner || false,
        banner_clicks_limit: p.banner_clicks_limit || 0,
        banner_impressions_limit: p.banner_impressions_limit || 0,
        daily_ptc_limit: p.daily_ptc_limit || 0,
        max_ptc_ads: p.max_ptc_ads || 0,
        max_banner_ads: p.max_banner_ads || 0,
        max_campaigns: p.max_campaigns || 0,
        ptc_reward_bonus: p.ptc_reward_bonus || 0,
        banner_reward_bonus: p.banner_reward_bonus || 0,
        referral_bonus: p.referral_bonus || 0,
        is_active: p.is_active,
        display_order: p.display_order || 0,
        created_at: p.created_at,
        updated_at: p.updated_at
      }));
    } catch (error: any) {
      console.error('Error getting packages:', error);
      return [];
    }
  }

  /**
   * Obtener paquete por ID
   */
  async getPackageById(id: string): Promise<Package | null> {
    try {
      const { data, error } = await this.supabase
        .from('packages')
        .select('*')
        .eq('id', id)
        .single();

      if (error) throw error;
      if (!data) return null;

      return {
        id: data.id,
        name: data.name,
        description: data.description,
        package_type: data.package_type,
        price: data.price || 0,
        duration_days: data.duration_days,
        currency: data.currency || 'USD',
        features: data.features || [],
        min_ptc_visits: data.min_ptc_visits || 0,
        min_banner_views: data.min_banner_views || 0,
        included_ptc_ads: data.included_ptc_ads || 0,
        has_clickable_banner: data.has_clickable_banner || false,
        banner_clicks_limit: data.banner_clicks_limit || 0,
        banner_impressions_limit: data.banner_impressions_limit || 0,
        daily_ptc_limit: data.daily_ptc_limit || 0,
        max_ptc_ads: data.max_ptc_ads || 0,
        max_banner_ads: data.max_banner_ads || 0,
        max_campaigns: data.max_campaigns || 0,
        ptc_reward_bonus: data.ptc_reward_bonus || 0,
        banner_reward_bonus: data.banner_reward_bonus || 0,
        referral_bonus: data.referral_bonus || 0,
        is_active: data.is_active,
        display_order: data.display_order || 0,
        created_at: data.created_at,
        updated_at: data.updated_at
      };
    } catch (error: any) {
      console.error('Error getting package:', error);
      return null;
    }
  }

  /**
   * Crear nuevo paquete
   */
  async createPackage(data: CreatePackageData): Promise<{ id: string } | null> {
    try {
      const { data: result, error } = await this.supabase
        .from('packages')
        .insert({
          name: data.name,
          description: data.description,
          package_type: data.package_type,
          price: data.price,
          duration_days: data.duration_days,
          features: data.features || [],
          max_ptc_ads: data.max_ptc_ads || 5,
          max_banner_ads: data.max_banner_ads || 2,
          max_campaigns: data.max_campaigns || 3,
          ptc_reward_bonus: data.ptc_reward_bonus || 0,
          banner_reward_bonus: data.banner_reward_bonus || 0,
          referral_bonus: data.referral_bonus || 0
        })
        .select('id')
        .single();

      if (error) throw error;

      return result;
    } catch (error: any) {
      console.error('Error creating package:', error);
      return null;
    }
  }

  /**
   * Actualizar paquete
   */
  async updatePackage(
    id: string,
    data: Partial<CreatePackageData>
  ): Promise<boolean> {
    try {
      const { error } = await this.supabase
        .from('packages')
        .update({
          ...data,
          updated_at: new Date().toISOString()
        })
        .eq('id', id);

      if (error) throw error;

      return true;
    } catch (error: any) {
      console.error('Error updating package:', error);
      return false;
    }
  }

  /**
   * Eliminar paquete
   */
  async deletePackage(id: string): Promise<boolean> {
    try {
      const { error } = await this.supabase
        .from('packages')
        .delete()
        .eq('id', id);

      if (error) throw error;

      return true;
    } catch (error: any) {
      console.error('Error deleting package:', error);
      return false;
    }
  }

  // ============================================================================
  // GESTIÓN DE PAQUETES DE USUARIOS
  // ============================================================================

  /**
   * Obtener paquetes de usuarios con paginación
   */
  async getUserPackages(
    pagination: PaginationParams = { page: 1, pageSize: 20 },
    userId?: string
  ): Promise<PaginatedResponse<UserPackage>> {
    try {
      const { page, pageSize } = pagination;
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;

      let query = this.supabase
        .from('user_packages')
        .select(`
          *,
          profiles:user_id (username, email)
        `, { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(from, to);

      if (userId) {
        query = query.eq('user_id', userId);
      }

      const { data, error, count } = await query;

      if (error) throw error;

      const packages: UserPackage[] = (data || []).map(p => ({
        id: p.id,
        user_id: p.user_id,
        username: (p.profiles as any)?.username,
        email: (p.profiles as any)?.email,
        package_id: p.package_id,
        package_name: p.package_name,
        start_date: p.start_date,
        end_date: p.end_date,
        status: p.status,
        auto_renew: p.auto_renew,
        payment_method: p.payment_method,
        payment_id: p.payment_id,
        amount_paid: p.amount_paid,
        created_at: p.created_at
      }));

      return {
        data: packages,
        total: count || 0,
        page,
        pageSize,
        totalPages: Math.ceil((count || 0) / pageSize)
      };
    } catch (error: any) {
      console.error('Error getting user packages:', error);
      return {
        data: [],
        total: 0,
        page: pagination.page,
        pageSize: pagination.pageSize,
        totalPages: 0
      };
    }
  }

  /**
   * Obtener paquete activo de un usuario
   */
  async getUserActivePackage(userId: string): Promise<UserPackage | null> {
    try {
      const { data, error } = await this.supabase
        .from('user_packages')
        .select('*')
        .eq('user_id', userId)
        .eq('status', 'active')
        .gte('end_date', new Date().toISOString())
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (error) throw error;
      if (!data) return null;

      return {
        id: data.id,
        user_id: data.user_id,
        package_id: data.package_id,
        package_name: data.package_name,
        start_date: data.start_date,
        end_date: data.end_date,
        status: data.status,
        auto_renew: data.auto_renew,
        payment_method: data.payment_method,
        payment_id: data.payment_id,
        amount_paid: data.amount_paid,
        created_at: data.created_at
      };
    } catch (error: any) {
      console.error('Error getting user active package:', error);
      return null;
    }
  }

  /**
   * Buscar usuarios por nombre o email (para asignación de paquetes)
   */
  async searchUsers(query: string): Promise<Pick<UserAdmin, 'id' | 'username' | 'email' | 'role' | 'is_active'>[]> {
    try {
      if (!query || query.trim().length < 2) return [];

      const { data, error } = await this.supabase
        .from('profiles')
        .select('id, username, email, role, is_active')
        .or(`username.ilike.%${query}%,email.ilike.%${query}%`)
        .eq('is_active', true)
        .order('username', { ascending: true })
        .limit(10);

      if (error) throw error;
      return data || [];
    } catch (error: any) {
      console.error('Error searching users:', error);
      return [];
    }
  }

  /**
   * Asignar paquete a usuario y cambiar rol a advertiser.
   * Usa función RPC `activate_user_package` con SECURITY DEFINER (bypasa RLS).
   * Requiere migración 010_fix_assign_package.sql
   */
  async assignPackage(data: AssignPackageData): Promise<{ id: string } | null> {
    try {
      const { data: result, error } = await this.supabase.rpc('activate_user_package', {
        p_user_id: data.user_id,
        p_package_id: data.package_id
      });

      if (error) throw error;
      if (!result) throw new Error('No se pudo activar el paquete');

      return { id: data.package_id };
    } catch (error: any) {
      console.error('Error assigning package:', error);
      return null;
    }
  }

  /**
   * Cancelar paquete de usuario
   */
  async cancelUserPackage(userPackageId: string): Promise<boolean> {
    try {
      // Obtener el paquete de usuario
      const { data: userPackage, error: fetchError } = await this.supabase
        .from('user_packages')
        .select('user_id')
        .eq('id', userPackageId)
        .single();

      if (fetchError) throw fetchError;

      // Actualizar estado
      const { error } = await this.supabase
        .from('user_packages')
        .update({
          status: 'cancelled',
          updated_at: new Date().toISOString()
        })
        .eq('id', userPackageId);

      if (error) throw error;

      // Limpiar perfil del usuario
      await this.supabase
        .from('profiles')
        .update({
          current_package_id: null,
          package_expires_at: null
        })
        .eq('id', userPackage.user_id);

      return true;
    } catch (error: any) {
      console.error('Error cancelling user package:', error);
      return false;
    }
  }

  /**
   * Extender paquete de usuario
   */
  async extendUserPackage(
    userPackageId: string,
    days: number
  ): Promise<boolean> {
    try {
      // Obtener el paquete actual
      const { data: userPackage, error: fetchError } = await this.supabase
        .from('user_packages')
        .select('*')
        .eq('id', userPackageId)
        .single();

      if (fetchError) throw fetchError;

      // Calcular nueva fecha de fin
      const currentEnd = new Date(userPackage.end_date);
      currentEnd.setDate(currentEnd.getDate() + days);

      // Actualizar
      const { error } = await this.supabase
        .from('user_packages')
        .update({
          end_date: currentEnd.toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', userPackageId);

      if (error) throw error;

      // Actualizar perfil
      await this.supabase
        .from('profiles')
        .update({
          package_expires_at: currentEnd.toISOString()
        })
        .eq('id', userPackage.user_id);

      return true;
    } catch (error: any) {
      console.error('Error extending user package:', error);
      return false;
    }
  }
}
