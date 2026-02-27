import { Injectable } from '@angular/core';
import { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseClient } from '../supabase.client';
import type {
  ActivityLog,
  ActivityLogFilters,
  PaginatedResponse,
  PaginationParams
} from '../models/admin.model';

/**
 * Servicio para gestión de logs del sistema (admin)
 */
@Injectable({
  providedIn: 'root'
})
export class AdminLogsService {
  private readonly supabase: SupabaseClient;

  constructor() {
    this.supabase = getSupabaseClient();
  }

  /**
   * Obtener logs de actividad con paginación y filtros
   */
  async getActivityLogs(
    filters: ActivityLogFilters = {},
    pagination: PaginationParams = { page: 1, pageSize: 50 }
  ): Promise<PaginatedResponse<ActivityLog>> {
    try {
      const { page, pageSize } = pagination;
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;

      let query = this.supabase
        .from('activity_logs')
        .select(`
          *,
          profiles:user_id (username, full_name)
        `, { count: 'exact' });

      if (filters.action) {
        query = query.eq('action', filters.action);
      }

      if (filters.entityType) {
        query = query.eq('entity_type', filters.entityType);
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

      const logs: ActivityLog[] = (data || []).map(log => ({
        id: log.id,
        user_id: log.user_id,
        username: (log.profiles as any)?.username || 'Sistema',
        full_name: (log.profiles as any)?.full_name,
        action: log.action,
        entity_type: log.entity_type,
        entity_id: log.entity_id,
        details: log.details || {},
        ip_address: log.ip_address,
        created_at: log.created_at
      }));

      return {
        data: logs,
        total: count || 0,
        page,
        pageSize,
        totalPages: Math.ceil((count || 0) / pageSize)
      };
    } catch (error: any) {
      // Failed to get activity logs
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
   * Obtener log por ID
   */
  async getActivityLogById(id: string): Promise<ActivityLog | null> {
    try {
      const { data, error } = await this.supabase
        .from('activity_logs')
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
        username: (data.profiles as any)?.username || 'Sistema',
        full_name: (data.profiles as any)?.full_name,
        action: data.action,
        entity_type: data.entity_type,
        entity_id: data.entity_id,
        details: data.details || {},
        ip_address: data.ip_address,
        created_at: data.created_at
      };
    } catch (error: any) {
      // Failed to get activity log
      return null;
    }
  }

  /**
   * Obtener tipos de acciones únicos (para filtros)
   */
  async getActionTypes(): Promise<string[]> {
    try {
      const { data, error } = await this.supabase
        .from('activity_logs')
        .select('action');

      if (error) throw error;

      const actions = [...new Set((data || []).map(l => l.action))];
      return actions.sort();
    } catch (error: any) {
      // Failed to get action types
      return [];
    }
  }

  /**
   * Obtener tipos de entidades únicos (para filtros)
   */
  async getEntityTypes(): Promise<ActivityLog['entity_type'][]> {
    try {
      const { data, error } = await this.supabase
        .from('activity_logs')
        .select('entity_type');

      if (error) throw error;

      const entities = [...new Set((data || []).map(l => l.entity_type))];
      return entities.sort() as ActivityLog['entity_type'][];
    } catch (error: any) {
      // Failed to get entity types
      return [];
    }
  }

  /**
   * Crear log de actividad manualmente
   */
  async createLog(
    action: string,
    entityType: ActivityLog['entity_type'],
    entityId: string | null,
    details: Record<string, unknown> = {}
  ): Promise<boolean> {
    try {
      const { data: { user } } = await this.supabase.auth.getUser();

      const { error } = await this.supabase
        .from('activity_logs')
        .insert({
          user_id: user?.id || null,
          action,
          entity_type: entityType,
          entity_id: entityId,
          details,
          ip_address: null,
          created_at: new Date().toISOString()
        });

      if (error) throw error;

      return true;
    } catch (error: any) {
      // Failed to create activity log
      return false;
    }
  }

  /**
   * Limpiar logs antiguos (mantener últimos N días)
   */
  async cleanOldLogs(daysToKeep: number): Promise<{ deleted: number } | null> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
      const cutoffStr = cutoffDate.toISOString();

      const { error, count } = await this.supabase
        .from('activity_logs')
        .delete({ count: 'exact' })
        .lt('created_at', cutoffStr);

      if (error) throw error;

      return { deleted: count || 0 };
    } catch (error: any) {
      // Failed to clean old logs
      return null;
    }
  }

  /**
   * Exportar logs a formato CSV
   */
  async exportLogs(
    filters: ActivityLogFilters = {}
  ): Promise<ActivityLog[]> {
    try {
      // Sin paginación para exportar todo
      let query = this.supabase
        .from('activity_logs')
        .select(`
          *,
          profiles:user_id (username, full_name)
        `);

      if (filters.action) {
        query = query.eq('action', filters.action);
      }

      if (filters.entityType) {
        query = query.eq('entity_type', filters.entityType);
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

      const { data, error } = await query
        .order('created_at', { ascending: false });

      if (error) throw error;

      return (data || []).map(log => ({
        id: log.id,
        user_id: log.user_id,
        username: (log.profiles as any)?.username || 'Sistema',
        full_name: (log.profiles as any)?.full_name,
        action: log.action,
        entity_type: log.entity_type,
        entity_id: log.entity_id,
        details: log.details || {},
        ip_address: log.ip_address,
        created_at: log.created_at
      }));
    } catch (error: any) {
      // Failed to export logs
      return [];
    }
  }
}
