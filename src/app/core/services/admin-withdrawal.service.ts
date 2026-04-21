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
        receipt_url: w.receipt_url ?? null,
        admin_notes: w.admin_notes ?? null,
        receipt_uploaded_at: w.receipt_uploaded_at ?? null,
        acknowledged_at: w.acknowledged_at ?? null,
        user_comment: w.user_comment ?? null,
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
        receipt_url: data.receipt_url ?? null,
        admin_notes: data.admin_notes ?? null,
        receipt_uploaded_at: data.receipt_uploaded_at ?? null,
        acknowledged_at: data.acknowledged_at ?? null,
        user_comment: data.user_comment ?? null,
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
   * Rechazar retiro. El saldo no se descuenta al enviar la solicitud,
   * por lo que rechazar solo marca el estado y guarda la razón.
   */
  async rejectWithdrawal(id: string, reason: string): Promise<boolean> {
    try {
      const { data: { user } } = await this.supabase.auth.getUser();

      const { data: withdrawal, error: fetchError } = await this.supabase
        .from('withdrawal_requests')
        .select('status')
        .eq('id', id)
        .single();

      if (fetchError) throw fetchError;
      if (!withdrawal) throw new Error('Retiro no encontrado');
      if (withdrawal.status === 'completed') throw new Error('No se puede rechazar un retiro ya pagado');
      if (withdrawal.status === 'rejected') throw new Error('El retiro ya fue rechazado');

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
    } catch {
      return false;
    }
  }

  /**
   * Marcar retiro como pagado: sube la imagen del comprobante al storage
   * y llama al RPC `mark_withdrawal_paid`, que descuenta el saldo, guarda el
   * receipt_url y envía la notificación al usuario.
   */
  async markWithdrawalPaid(
    id: string,
    receiptFile: File,
    adminNotes?: string
  ): Promise<{ ok: boolean; error?: string }> {
    try {
      if (!receiptFile) return { ok: false, error: 'Se requiere la imagen del comprobante' };

      const ext = receiptFile.name.split('.').pop()?.toLowerCase() || 'jpg';
      const path = `${id}/${Date.now()}.${ext}`;

      const { error: uploadError } = await this.supabase.storage
        .from('withdrawal-receipts')
        .upload(path, receiptFile, {
          cacheControl: '3600',
          upsert: false,
          contentType: receiptFile.type || 'image/jpeg',
        });

      if (uploadError) return { ok: false, error: uploadError.message };

      const { data: pub } = this.supabase.storage
        .from('withdrawal-receipts')
        .getPublicUrl(path);

      const receiptUrl = pub.publicUrl;

      const { error: rpcError } = await this.supabase.rpc('mark_withdrawal_paid', {
        p_withdrawal_id: id,
        p_receipt_url: receiptUrl,
        p_admin_notes: adminNotes ?? null,
      });

      if (rpcError) {
        // Rollback: borrar el archivo subido para no dejar basura
        await this.supabase.storage.from('withdrawal-receipts').remove([path]);
        return { ok: false, error: rpcError.message };
      }

      return { ok: true };
    } catch (err: any) {
      return { ok: false, error: err?.message ?? 'Error inesperado' };
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
