import { Injectable } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../../environments/environment';
import type {
  CampaignAdmin,
  CampaignFilters,
  CreateCampaignData,
  PaginatedResponse,
  PaginationParams
} from '../models/admin.model';

/**
 * Servicio para gestión de campañas (admin)
 */
@Injectable({
  providedIn: 'root'
})
export class AdminCampaignService {
  private readonly supabase: SupabaseClient;

  constructor() {
    this.supabase = createClient(
      environment.supabase.url,
      environment.supabase.anonKey
    );
  }

  /**
   * Obtener todas las campañas con paginación y filtros
   */
  async getCampaigns(
    filters: CampaignFilters = {},
    pagination: PaginationParams = { page: 1, pageSize: 20 }
  ): Promise<PaginatedResponse<CampaignAdmin>> {
    try {
      const { page, pageSize } = pagination;
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;

      let query = this.supabase
        .from('campaigns')
        .select(`
          id,
          advertiser_id,
          name,
          description,
          campaign_type,
          budget,
          daily_budget,
          bid_per_click,
          status,
          start_date,
          end_date,
          created_at,
          updated_at,
          profiles:advertiser_id (username),
          ptc_tasks (total_clicks, daily_limit),
          ptc_clicks:ptc_tasks (id)
        `, { count: 'exact' });

      if (filters.status) {
        query = query.eq('status', filters.status);
      }

      if (filters.advertiserId) {
        query = query.eq('advertiser_id', filters.advertiserId);
      }

      if (filters.search) {
        query = query.or(`name.ilike.%${filters.search}%,description.ilike.%${filters.search}%`);
      }

      const { data, error, count } = await query
        .order('created_at', { ascending: false })
        .range(from, to);

      if (error) throw error;

      const campaigns: CampaignAdmin[] = (data || []).map(c => ({
        id: c.id,
        advertiser_id: c.advertiser_id,
        advertiser_username: (c.profiles as any)?.username || 'Usuario',
        name: c.name,
        description: c.description || '',
        campaign_type: c.campaign_type,
        budget: c.budget || 0,
        daily_budget: c.daily_budget || 0,
        spent: 0, // Se calcularía
        bid_per_click: c.bid_per_click || 0,
        status: c.status,
        start_date: c.start_date,
        end_date: c.end_date,
        total_clicks: 0, // Se calcularía
        total_impressions: 0,
        ctr: 0,
        created_at: c.created_at,
        updated_at: c.updated_at
      }));

      return {
        data: campaigns,
        total: count || 0,
        page,
        pageSize,
        totalPages: Math.ceil((count || 0) / pageSize)
      };
    } catch (error: any) {
      console.error('Error getting campaigns:', error);
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
   * Obtener campaña por ID
   */
  async getCampaignById(id: string): Promise<CampaignAdmin | null> {
    try {
      const { data, error } = await this.supabase
        .from('campaigns')
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
        advertiser_id: data.advertiser_id,
        advertiser_username: (data.profiles as any)?.username || 'Usuario',
        name: data.name,
        description: data.description || '',
        campaign_type: data.campaign_type,
        budget: data.budget || 0,
        daily_budget: data.daily_budget || 0,
        spent: data.spent || 0,
        bid_per_click: data.bid_per_click || 0,
        status: data.status,
        start_date: data.start_date,
        end_date: data.end_date,
        total_clicks: data.total_clicks || 0,
        total_impressions: data.total_impressions || 0,
        ctr: data.ctr || 0,
        created_at: data.created_at,
        updated_at: data.updated_at
      };
    } catch (error: any) {
      console.error('Error getting campaign:', error);
      return null;
    }
  }

  /**
   * Crear nueva campaña
   */
  async createCampaign(data: CreateCampaignData): Promise<{ id: string } | null> {
    try {
      const { data: result, error } = await this.supabase
        .from('campaigns')
        .insert({
          name: data.name,
          description: data.description,
          campaign_type: data.campaign_type,
          budget: data.budget,
          daily_budget: data.daily_budget,
          bid_per_click: data.bid_per_click,
          start_date: data.start_date,
          end_date: data.end_date,
          advertiser_id: data.advertiser_id,
          status: 'draft'
        })
        .select('id')
        .single();

      if (error) throw error;

      return result;
    } catch (error: any) {
      console.error('Error creating campaign:', error);
      return null;
    }
  }

  /**
   * Actualizar campaña
   */
  async updateCampaign(
    id: string,
    data: Partial<CreateCampaignData>
  ): Promise<boolean> {
    try {
      const { error } = await this.supabase
        .from('campaigns')
        .update({
          ...data,
          updated_at: new Date().toISOString()
        })
        .eq('id', id);

      if (error) throw error;

      return true;
    } catch (error: any) {
      console.error('Error updating campaign:', error);
      return false;
    }
  }

  /**
   * Cambiar estado de la campaña
   */
  async setCampaignStatus(
    id: string,
    status: 'active' | 'paused' | 'completed'
  ): Promise<boolean> {
    try {
      const { error } = await this.supabase
        .from('campaigns')
        .update({
          status,
          updated_at: new Date().toISOString()
        })
        .eq('id', id);

      if (error) throw error;

      return true;
    } catch (error: any) {
      console.error('Error updating campaign status:', error);
      return false;
    }
  }

  /**
   * Aprobar campaña
   */
  async approveCampaign(id: string): Promise<boolean> {
    return this.setCampaignStatus(id, 'active');
  }

  /**
   * Rechazar campaña (volver a draft)
   */
  async rejectCampaign(id: string): Promise<boolean> {
    try {
      const { error } = await this.supabase
        .from('campaigns')
        .update({
          status: 'draft',
          updated_at: new Date().toISOString()
        })
        .eq('id', id);

      if (error) throw error;

      return true;
    } catch (error: any) {
      console.error('Error rejecting campaign:', error);
      return false;
    }
  }

  /**
   * Eliminar campaña
   */
  async deleteCampaign(id: string): Promise<boolean> {
    try {
      const { error } = await this.supabase
        .from('campaigns')
        .delete()
        .eq('id', id);

      if (error) throw error;

      return true;
    } catch (error: any) {
      console.error('Error deleting campaign:', error);
      return false;
    }
  }
}
