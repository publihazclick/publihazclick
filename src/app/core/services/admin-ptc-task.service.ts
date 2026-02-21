import { Injectable } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../../environments/environment';
import type {
  PtcTaskAdmin,
  PtcTaskFilters,
  CreatePtcTaskData,
  PaginatedResponse,
  PaginationParams,
  AdLocation
} from '../models/admin.model';

/**
 * Servicio para gestión de anuncios PTC (admin)
 */
@Injectable({
  providedIn: 'root'
})
export class AdminPtcTaskService {
  private readonly supabase: SupabaseClient;

  constructor() {
    this.supabase = createClient(
      environment.supabase.url,
      environment.supabase.anonKey
    );
  }

  /**
   * Obtener todos los anuncios PTC con paginación y filtros
   */
  async getPtcTasks(
    filters: PtcTaskFilters = {},
    pagination: PaginationParams = { page: 1, pageSize: 20 }
  ): Promise<PaginatedResponse<PtcTaskAdmin>> {
    try {
      const { page, pageSize } = pagination;
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;

      let query = this.supabase
        .from('ptc_tasks')
        .select(`
          *,
          profiles:advertiser_id (username)
        `, { count: 'exact' });

      if (filters.status) {
        query = query.eq('status', filters.status);
      }

      if (filters.location) {
        query = query.eq('location', filters.location);
      }

      if (filters.advertiserId) {
        query = query.eq('advertiser_id', filters.advertiserId);
      }

      if (filters.search) {
        query = query.or(`title.ilike.%${filters.search}%,description.ilike.%${filters.search}%`);
      }

      if (filters.location) {
        query = query.eq('location', filters.location);
      }

      const { data, error, count } = await query
        .order('created_at', { ascending: false })
        .range(from, to);

      if (error) throw error;

      const tasks: PtcTaskAdmin[] = (data || []).map(t => ({
        id: t.id,
        title: t.title,
        description: t.description || '',
        url: t.url,
        image_url: t.image_url,
        reward: t.reward || 0,
        duration: t.duration || 30,
        daily_limit: t.daily_limit || 0,
        total_clicks: t.total_clicks || 0,
        status: t.status,
        location: t.location,
        ad_type: t.ad_type,
        is_demo_only: t.is_demo_only,
        advertiser_id: t.advertiser_id,
        advertiser_username: (t.profiles as any)?.username || 'Usuario',
        created_at: t.created_at,
        updated_at: t.updated_at
      }));

      return {
        data: tasks,
        total: count || 0,
        page,
        pageSize,
        totalPages: Math.ceil((count || 0) / pageSize)
      };
    } catch (error: any) {
      console.error('Error getting PTC tasks:', error);
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
   * Obtener anuncio PTC por ID
   */
  async getPtcTaskById(id: string): Promise<PtcTaskAdmin | null> {
    try {
      const { data, error } = await this.supabase
        .from('ptc_tasks')
        .select(`
          *,
          profiles:advertiser_id (username)
        `)
        .eq('id', id)
        .single();

      if (error) throw error;
      if (!data) return null;

      return {
        id: data.id,
        title: data.title,
        description: data.description || '',
        url: data.url,
        image_url: data.image_url,
        reward: data.reward || 0,
        duration: data.duration || 30,
        daily_limit: data.daily_limit || 0,
        total_clicks: data.total_clicks || 0,
        status: data.status,
        location: data.location,
        ad_type: data.ad_type,
        is_demo_only: data.is_demo_only,
        advertiser_id: data.advertiser_id,
        advertiser_username: (data.profiles as any)?.username || 'Usuario',
        created_at: data.created_at,
        updated_at: data.updated_at
      };
    } catch (error: any) {
      console.error('Error getting PTC task:', error);
      return null;
    }
  }

  /**
   * Crear nuevo anuncio PTC
   */
  async createPtcTask(data: CreatePtcTaskData): Promise<{ id: string } | null> {
    try {
      const { data: result, error } = await this.supabase
        .from('ptc_tasks')
        .insert({
          title: data.title,
          description: data.description,
          url: data.url,
          image_url: data.image_url,
          reward: data.reward,
          duration: data.duration,
          daily_limit: data.daily_limit,
          advertiser_id: data.advertiser_id,
          status: 'active',
          location: data.location,
          total_clicks: 0
        })
        .select('id')
        .single();

      if (error) throw error;

      return result;
    } catch (error: any) {
      console.error('Error creating PTC task:', error);
      return null;
    }
  }

  /**
   * Actualizar anuncio PTC
   */
  async updatePtcTask(
    id: string,
    data: Partial<CreatePtcTaskData>
  ): Promise<boolean> {
    try {
      const { error } = await this.supabase
        .from('ptc_tasks')
        .update({
          ...data,
          updated_at: new Date().toISOString()
        })
        .eq('id', id);

      if (error) throw error;

      return true;
    } catch (error: any) {
      console.error('Error updating PTC task:', error);
      return false;
    }
  }

  /**
   * Cambiar estado del anuncio
   */
  async setPtcTaskStatus(
    id: string,
    status: 'pending' | 'active' | 'paused' | 'completed' | 'rejected'
  ): Promise<boolean> {
    try {
      const { error } = await this.supabase
        .from('ptc_tasks')
        .update({
          status,
          updated_at: new Date().toISOString()
        })
        .eq('id', id);

      if (error) throw error;

      return true;
    } catch (error: any) {
      console.error('Error updating PTC task status:', error);
      return false;
    }
  }

  /**
   * Aprobar/Anular para revisión (pendiente)
   */
  async pendingPtcTask(id: string): Promise<boolean> {
    return this.setPtcTaskStatus(id, 'pending');
  }

  /**
   * Rechazar anuncio
   */
  async rejectPtcTask(id: string): Promise<boolean> {
    return this.setPtcTaskStatus(id, 'rejected');
  }

  /**
   * Activar anuncio
   */
  async activatePtcTask(id: string): Promise<boolean> {
    return this.setPtcTaskStatus(id, 'active');
  }

  /**
   * Pausar anuncio
   */
  async pausePtcTask(id: string): Promise<boolean> {
    return this.setPtcTaskStatus(id, 'paused');
  }

  /**
   * Completar anuncio
   */
  async completePtcTask(id: string): Promise<boolean> {
    return this.setPtcTaskStatus(id, 'completed');
  }

  /**
   * Eliminar anuncio PTC
   */
  async deletePtcTask(id: string): Promise<boolean> {
    try {
      const { error } = await this.supabase
        .from('ptc_tasks')
        .delete()
        .eq('id', id);

      if (error) throw error;

      return true;
    } catch (error: any) {
      console.error('Error deleting PTC task:', error);
      return false;
    }
  }

  /**
   * Obtener estadísticas de clics por anuncio
   */
  async getTaskStats(id: string): Promise<{ total: number; today: number } | null> {
    try {
      const today = new Date().toISOString().split('T')[0];

      // Total de clics
      const { count: total } = await this.supabase
        .from('ptc_clicks')
        .select('*', { count: 'exact', head: true })
        .eq('task_id', id);

      // Clics de hoy
      const { count: todayClicks } = await this.supabase
        .from('ptc_clicks')
        .select('*', { count: 'exact', head: true })
        .eq('task_id', id)
        .gte('created_at', today);

      return {
        total: total || 0,
        today: todayClicks || 0
      };
    } catch (error: any) {
      console.error('Error getting task stats:', error);
      return null;
    }
  }
}
