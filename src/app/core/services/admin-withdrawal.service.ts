import { Injectable } from '@angular/core';
import { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseClient } from '../supabase.client';
import type {
  WithdrawalAdmin,
  WithdrawalFilters,
  PaginatedResponse,
  PaginationParams
} from '../models/admin.model';

/**
 * Servicio para gestión de retiros (admin)
 */
@Injectable({
  providedIn: 'root'
})
export class AdminWithdrawalService {
  private readonly supabase: SupabaseClient;

  constructor() {
    this.supabase = getSupabaseClient();
  }

  /**
   * Obtener todas las solicitudes de retiro con paginación y filtros
   */
  async getWithdrawals(
    filters: WithdrawalFilters = {},
    pagination: PaginationParams = { page: 1, pageSize: 20 }
  ): Promise<PaginatedResponse<WithdrawalAdmin>> {
    try {
      const { page, pageSize } = pagination;
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;

      let query = this.supabase
        .from('withdrawal_requests')
        .select(`
          *,
          profiles:user_id (username, full_name)
        `, { count: 'exact' });

      if (filters.status) {
        query = query.eq('status', filters.status);
      }

      if (filters.userId) {
        query = query.eq('user_id', filters.userId);
      }

      if (filters.dateFrom) {
        query = query.gte('created_at', filters.dateFrom);
      }

      if (filters.dateTo) {
        query = query.lte('created_at', filters.dateTo + 'T23:59:59');
      }

      const { data, error, count } = await query
        .order('created_at', { ascending: false })
        .range(from, to);

      if (error) throw error;

      const withdrawals: WithdrawalAdmin[] = (data || []).map(w => ({
        id: w.id,
        user_id: w.user_id,
        username: (w.profiles as any)?.username || 'Usuario',
        full_name: (w.profiles as any)?.full_name,
        amount: w.amount || 0,
        method: w.method,
        details: w.details || {},
        status: w.status,
        processed_at: w.processed_at,
        processed_by: w.processed_by,
        rejection_reason: w.rejection_reason,
        created_at: w.created_at
      }));

      return {
        data: withdrawals,
        total: count || 0,
        page,
        pageSize,
        totalPages: Math.ceil((count || 0) / pageSize)
      };
    } catch (error: any) {
      // Failed to get withdrawals
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
   * Obtener retiro por ID
   */
  async getWithdrawalById(id: string): Promise<WithdrawalAdmin | null> {
    try {
      const { data, error } = await this.supabase
        .from('withdrawal_requests')
        .select(`
          *,
          profiles:user_id (username, full_name)
        `)
        .eq('id', id)
        .single();

      if (error) throw error;
      if (!data) return null;

      return {
        id: data.id,
        user_id: data.user_id,
        username: (data.profiles as any)?.username || 'Usuario',
        full_name: (data.profiles as any)?.full_name,
        amount: data.amount || 0,
        method: data.method,
        details: data.details || {},
        status: data.status,
        processed_at: data.processed_at,
        processed_by: data.processed_by,
        rejection_reason: data.rejection_reason,
        created_at: data.created_at
      };
    } catch (error: any) {
      // Failed to get withdrawal
      return null;
    }
  }

  /**
   * Aprobar retiro
   */
  async approveWithdrawal(id: string): Promise<boolean> {
    try {
      const { data: { user } } = await this.supabase.auth.getUser();

      const { error } = await this.supabase
        .from('withdrawal_requests')
        .update({
          status: 'approved',
          processed_at: new Date().toISOString(),
          processed_by: user?.id
        })
        .eq('id', id);

      if (error) throw error;

      return true;
    } catch (error: any) {
      // Failed to approve withdrawal
      return false;
    }
  }

  /**
   * Completar retiro
   */
  async completeWithdrawal(id: string): Promise<boolean> {
    try {
      const { data: { user } } = await this.supabase.auth.getUser();

      const { error } = await this.supabase
        .from('withdrawal_requests')
        .update({
          status: 'completed',
          processed_at: new Date().toISOString(),
          processed_by: user?.id
        })
        .eq('id', id);

      if (error) throw error;

      return true;
    } catch (error: any) {
      // Failed to complete withdrawal
      return false;
    }
  }

  /**
   * Rechazar retiro
   */
  async rejectWithdrawal(id: string, reason: string): Promise<boolean> {
    try {
      const { data: { user } } = await this.supabase.auth.getUser();

      const { error } = await this.supabase
        .from('withdrawal_requests')
        .update({
          status: 'rejected',
          processed_at: new Date().toISOString(),
          processed_by: user?.id,
          rejection_reason: reason
        })
        .eq('id', id);

      if (error) throw error;

      return true;
    } catch (error: any) {
      // Failed to reject withdrawal
      return false;
    }
  }

  /**
   * Obtener estadísticas de retiros
   */
  async getWithdrawalStats(): Promise<{
    pending: number;
    pendingAmount: number;
    approved: number;
    approvedAmount: number;
    rejected: number;
    rejectedAmount: number;
    completed: number;
    completedAmount: number;
  }> {
    try {
      const { data, error } = await this.supabase
        .from('withdrawal_requests')
        .select('status, amount');

      if (error) throw error;

      const stats = {
        pending: 0,
        pendingAmount: 0,
        approved: 0,
        approvedAmount: 0,
        rejected: 0,
        rejectedAmount: 0,
        completed: 0,
        completedAmount: 0
      };

      (data || []).forEach(w => {
        const amount = w.amount || 0;
        switch (w.status) {
          case 'pending':
            stats.pending++;
            stats.pendingAmount += amount;
            break;
          case 'approved':
            stats.approved++;
            stats.approvedAmount += amount;
            break;
          case 'rejected':
            stats.rejected++;
            stats.rejectedAmount += amount;
            break;
          case 'completed':
            stats.completed++;
            stats.completedAmount += amount;
            break;
        }
      });

      return stats;
    } catch (error: any) {
      // Failed to get withdrawal stats
      return {
        pending: 0,
        pendingAmount: 0,
        approved: 0,
        approvedAmount: 0,
        rejected: 0,
        rejectedAmount: 0,
        completed: 0,
        completedAmount: 0
      };
    }
  }
}
