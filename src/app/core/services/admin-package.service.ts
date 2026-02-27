import { Injectable, inject } from '@angular/core';
import { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseClient } from '../supabase.client';
import { LoggerService } from './logger.service';
import { sanitizePostgrestFilter } from '../utils/sanitize';
import type {
  Package,
  CreatePackageData,
  UserPackage,
  AssignPackageData,
  PaginatedResponse,
  PaginationParams,
  UserAdmin,
  Payment,
  PaymentStatus
} from '../models/admin.model';

/**
 * Servicio para gestión de paquetes (admin)
 */
@Injectable({
  providedIn: 'root'
})
export class AdminPackageService {
  private readonly supabase: SupabaseClient;
  private readonly logger = inject(LoggerService);

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
        nequi_payment_link: p.nequi_payment_link || null,
        price_cop: p.price_cop ?? null,
        created_at: p.created_at,
        updated_at: p.updated_at
      }));
    } catch (error: any) {
      this.logger.error('Error getting packages');
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
        nequi_payment_link: data.nequi_payment_link || null,
        price_cop: data.price_cop ?? null,
        created_at: data.created_at,
        updated_at: data.updated_at
      };
    } catch (error: any) {
      this.logger.error('Error getting package');
      return null;
    }
  }

  // ============================================================================
  // GESTIÓN DE PAGOS
  // ============================================================================

  /**
   * Obtener pagos pendientes (para que el admin apruebe)
   */
  async getPendingPayments(
    pagination: PaginationParams = { page: 1, pageSize: 20 }
  ): Promise<PaginatedResponse<Payment>> {
    try {
      const { page, pageSize } = pagination;
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;

      const { data, error, count } = await this.supabase
        .from('payments')
        .select('*, profiles:user_id(username, email)', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(from, to);

      if (error) throw error;

      const payments: Payment[] = (data || []).map(p => ({
        id: p.id,
        user_id: p.user_id,
        username: (p.profiles as any)?.username,
        email: (p.profiles as any)?.email,
        package_id: p.package_id,
        package_name: p.package_name,
        amount_in_cents: p.amount_in_cents,
        currency: p.currency,
        status: p.status as PaymentStatus,
        payment_method: p.payment_method,
        gateway: p.gateway,
        gateway_transaction_id: p.gateway_transaction_id,
        gateway_reference: p.gateway_reference,
        phone_number: p.phone_number,
        error_message: p.error_message,
        dlocal_payment_id: p.dlocal_payment_id ?? null,
        metadata: p.metadata || {},
        created_at: p.created_at,
        updated_at: p.updated_at,
      }));

      return {
        data: payments,
        total: count || 0,
        page,
        pageSize,
        totalPages: Math.ceil((count || 0) / pageSize),
      };
    } catch (error: any) {
      this.logger.error('Error getting payments');
      return { data: [], total: 0, page: 1, pageSize: 20, totalPages: 0 };
    }
  }

  /**
   * Aprobar pago y activar paquete (llama a función RPC)
   */
  async approvePayment(paymentId: string): Promise<boolean> {
    try {
      const { data, error } = await this.supabase.rpc('approve_payment', {
        p_payment_id: paymentId,
      });
      if (error) throw error;
      return !!data;
    } catch (error: any) {
      this.logger.error('Error approving payment');
      return false;
    }
  }

  /**
   * Rechazar pago
   */
  async rejectPayment(paymentId: string, reason?: string): Promise<boolean> {
    try {
      const { data, error } = await this.supabase.rpc('reject_payment', {
        p_payment_id: paymentId,
        p_reason: reason ?? null,
      });
      if (error) throw error;
      return !!data;
    } catch (error: any) {
      this.logger.error('Error rejecting payment');
      return false;
    }
  }

  /**
   * Contar pagos pendientes (para badge en sidebar)
   */
  async getPendingPaymentsCount(): Promise<number> {
    try {
      const { count, error } = await this.supabase
        .from('payments')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending');
      if (error) throw error;
      return count ?? 0;
    } catch {
      return 0;
    }
  }

  /**
   * Verificar pago con Wompi y auto-aprobar si está confirmado.
   * Llama a la Edge Function verify-nequi-payment que consulta la API de Wompi.
   */
  async verifyAndSubmitPayment(data: {
    packageId: string;
    packageName: string;
    amountInCents: number;
    phoneNumber: string;
    transactionId: string;
  }): Promise<{ success: boolean; autoApproved: boolean; message: string }> {
    try {
      const { data: result, error } = await this.supabase.functions.invoke(
        'verify-nequi-payment',
        {
          body: {
            transactionId: data.transactionId,
            packageId: data.packageId,
            packageName: data.packageName,
            amountInCents: data.amountInCents,
            phoneNumber: data.phoneNumber,
          },
        }
      );
      if (error) throw error;
      return result as { success: boolean; autoApproved: boolean; message: string };
    } catch (error: any) {
      this.logger.error('Error verifying payment');
      return { success: false, autoApproved: false, message: 'Error al verificar el pago. Intenta de nuevo.' };
    }
  }

  /**
   * Guardar comprobante de pago del usuario (fallback sin verificación automática)
   */
  async submitPaymentProof(data: {
    packageId: string;
    packageName: string;
    amountInCents: number;
    phoneNumber: string;
    transactionId: string;
  }): Promise<boolean> {
    try {
      const { data: { user } } = await this.supabase.auth.getUser();
      if (!user) return false;

      const { error } = await this.supabase.from('payments').insert({
        user_id: user.id,
        package_id: data.packageId,
        package_name: data.packageName,
        amount_in_cents: data.amountInCents,
        currency: 'COP',
        status: 'pending',
        payment_method: 'nequi',
        gateway: 'nequi_link',
        gateway_transaction_id: data.transactionId,
        phone_number: data.phoneNumber,
        metadata: { submitted_by_user: true },
      });

      if (error) throw error;
      return true;
    } catch (error: any) {
      this.logger.error('Error submitting payment proof');
      return false;
    }
  }

  /**
   * Crear pago con dLocal Go (llama a Edge Function)
   */
  async createDlocalPayment(
    packageId: string, 
    paymentMethodId: string = 'CARD'
  ): Promise<{ url: string; payment_id?: string; status?: string }> {
    const { data: { session } } = await this.supabase.auth.getSession();
    if (!session) throw new Error('No autenticado');

    const { data, error } = await this.supabase.functions.invoke(
      'create-dlocal-payment',
      { 
        body: { 
          package_id: packageId,
          payment_method_id: paymentMethodId 
        } 
      }
    );

    if (error || !data?.url) {
      throw new Error(data?.error ?? 'Error al crear pago con dLocal');
    }
    return { 
      url: data.url,
      payment_id: data.payment_id,
      status: data.status
    };
  }

  /**
   * Obtener historial de pagos del usuario autenticado
   */
  async getMyPayments(): Promise<Payment[]> {
    try {
      const { data, error } = await this.supabase
        .from('payments')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(10);
      if (error) throw error;
      return (data || []) as Payment[];
    } catch {
      return [];
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
          currency: data.currency || 'USD',
          duration_days: data.duration_days,
          features: data.features || [],
          min_ptc_visits: data.min_ptc_visits || 0,
          min_banner_views: data.min_banner_views || 0,
          included_ptc_ads: data.included_ptc_ads || 0,
          has_clickable_banner: data.has_clickable_banner ?? true,
          banner_clicks_limit: data.banner_clicks_limit || 0,
          banner_impressions_limit: data.banner_impressions_limit || 0,
          daily_ptc_limit: data.daily_ptc_limit || 9,
          max_ptc_ads: data.max_ptc_ads || 1,
          max_banner_ads: data.max_banner_ads || 1,
          max_campaigns: data.max_campaigns || 1,
          ptc_reward_bonus: data.ptc_reward_bonus || 0,
          banner_reward_bonus: data.banner_reward_bonus || 0,
          referral_bonus: data.referral_bonus || 0,
          nequi_payment_link: data.nequi_payment_link || null,
          price_cop: data.price_cop ?? null
        })
        .select('id')
        .single();

      if (error) throw error;

      return result;
    } catch (error: any) {
      this.logger.error('Error creating package');
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
      this.logger.error('Error updating package');
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
      this.logger.error('Error deleting package');
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
      this.logger.error('Error getting user packages');
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
      this.logger.error('Error getting user active package');
      return null;
    }
  }

  /**
   * Buscar usuarios por nombre o email (para asignación de paquetes)
   */
  async searchUsers(query: string): Promise<Pick<UserAdmin, 'id' | 'username' | 'email' | 'role' | 'is_active'>[]> {
    try {
      if (!query || query.trim().length < 2) return [];

      const safeQuery = sanitizePostgrestFilter(query);
      if (!safeQuery) return [];

      const { data, error } = await this.supabase
        .from('profiles')
        .select('id, username, email, role, is_active')
        .or(`username.ilike.%${safeQuery}%,email.ilike.%${safeQuery}%`)
        .eq('is_active', true)
        .order('username', { ascending: true })
        .limit(10);

      if (error) throw error;
      return data || [];
    } catch (error: any) {
      this.logger.error('Error searching users');
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
      this.logger.error('Error assigning package');
      return null;
    }
  }

  /**
   * Revocar paquete de usuario desde admin:
   * ELIMINA el registro de user_packages y devuelve el rol a 'guest'.
   * Al eliminar el registro, el usuario puede recibir un nuevo paquete sin conflictos.
   */
  async revokeUserPackage(userPackageId: string): Promise<boolean> {
    try {
      const { data: userPackage, error: fetchError } = await this.supabase
        .from('user_packages')
        .select('user_id')
        .eq('id', userPackageId)
        .single();

      if (fetchError) throw fetchError;

      // Eliminar el registro para permitir re-asignación futura
      const { error: deleteError } = await this.supabase
        .from('user_packages')
        .delete()
        .eq('id', userPackageId);

      if (deleteError) throw deleteError;

      const { error: profileError } = await this.supabase
        .from('profiles')
        .update({
          has_active_package: false,
          current_package_id: null,
          package_expires_at: null,
          package_started_at: null,
          role: 'guest',
          updated_at: new Date().toISOString()
        })
        .eq('id', userPackage.user_id);

      if (profileError) throw profileError;

      return true;
    } catch (error: any) {
      this.logger.error('Error revoking user package');
      return false;
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
      this.logger.error('Error cancelling user package');
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
      this.logger.error('Error extending user package');
      return false;
    }
  }
}
