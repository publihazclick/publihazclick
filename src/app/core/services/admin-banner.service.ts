import { Injectable } from '@angular/core';
import { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseClient } from '../supabase.client';
import { sanitizePostgrestFilter } from '../utils/sanitize';
import type {
  BannerAd,
  BannerAdFilters,
  CreateBannerAdData,
  PaginatedResponse,
  PaginationParams,
  BannerStatus,
  AdLocation
} from '../models/admin.model';

/**
 * Servicio para gestión de anuncios tipo banner (admin)
 */
@Injectable({
  providedIn: 'root'
})
export class AdminBannerService {
  private readonly supabase: SupabaseClient;

  constructor() {
    this.supabase = getSupabaseClient();
  }

  /**
   * Obtener todos los banners con paginación y filtros
   */
  async getBannerAds(
    filters: BannerAdFilters = {},
    pagination: PaginationParams = { page: 1, pageSize: 20 }
  ): Promise<PaginatedResponse<BannerAd>> {
    try {
      const { page, pageSize } = pagination;
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;

      let query = this.supabase
        .from('banner_ads')
        .select(`
          *,
          profiles:advertiser_id (username)
        `, { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(from, to);

      if (filters.status) {
        query = query.eq('status', filters.status);
      }

      if (filters.position) {
        query = query.eq('position', filters.position);
      }

      if (filters.advertiserId) {
        query = query.eq('advertiser_id', filters.advertiserId);
      }

      if (filters.search) {
        const safeSearch = sanitizePostgrestFilter(filters.search);
        if (safeSearch) {
          query = query.or(`name.ilike.%${safeSearch}%,description.ilike.%${safeSearch}%`);
        }
      }

      if (filters.location) {
        query = query.eq('location', filters.location);
      }

      const { data, error, count } = await query;

      if (error) throw error;

      const banners: BannerAd[] = (data || []).map(b => ({
        id: b.id,
        advertiser_id: b.advertiser_id,
        advertiser_username: (b.profiles as any)?.username || 'Usuario',
        campaign_id: b.campaign_id,
        name: b.name,
        description: b.description,
        image_url: b.image_url,
        url: b.url,
        position: b.position,
        impressions_limit: b.impressions_limit || 0,
        clicks_limit: b.clicks_limit || 0,
        daily_impressions: b.daily_impressions || 0,
        daily_clicks: b.daily_clicks || 0,
        total_impressions: b.total_impressions || 0,
        total_clicks: b.total_clicks || 0,
        reward: b.reward || 0,
        ctr: b.ctr || 0,
        status: b.status,
        location: b.location,
        start_date: b.start_date,
        end_date: b.end_date,
        created_at: b.created_at,
        updated_at: b.updated_at
      }));

      return {
        data: banners,
        total: count || 0,
        page,
        pageSize,
        totalPages: Math.ceil((count || 0) / pageSize)
      };
    } catch (error: any) {
      // Failed to get banner ads
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
   * Obtener banner por ID
   */
  async getBannerAdById(id: string): Promise<BannerAd | null> {
    try {
      const { data, error } = await this.supabase
        .from('banner_ads')
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
        campaign_id: data.campaign_id,
        name: data.name,
        description: data.description,
        image_url: data.image_url,
        url: data.url,
        position: data.position,
        impressions_limit: data.impressions_limit || 0,
        clicks_limit: data.clicks_limit || 0,
        daily_impressions: data.daily_impressions || 0,
        daily_clicks: data.daily_clicks || 0,
        total_impressions: data.total_impressions || 0,
        total_clicks: data.total_clicks || 0,
        reward: data.reward || 0,
        ctr: data.ctr || 0,
        status: data.status,
        location: data.location,
        start_date: data.start_date,
        end_date: data.end_date,
        created_at: data.created_at,
        updated_at: data.updated_at
      };
    } catch (error: any) {
      // Failed to get banner ad
      return null;
    }
  }

  /**
   * Crear nuevo banner
   */
  async createBannerAd(data: CreateBannerAdData): Promise<{ id: string } | null> {
    try {
      const { data: result, error } = await this.supabase
        .from('banner_ads')
        .insert({
          name: data.name,
          description: data.description,
          image_url: data.image_url,
          url: data.url,
          position: data.position,
          impressions_limit: data.impressions_limit || 10000,
          clicks_limit: data.clicks_limit || 1000,
          reward: data.reward || 0,
          start_date: data.start_date,
          end_date: data.end_date,
          advertiser_id: data.advertiser_id,
          campaign_id: data.campaign_id,
          location: data.location,
          status: 'active'
        })
        .select('id')
        .single();

      if (error) throw error;

      return result;
    } catch (error: any) {
      // Failed to create banner ad
      return null;
    }
  }

  /**
   * Actualizar banner
   */
  async updateBannerAd(
    id: string,
    data: Partial<CreateBannerAdData>
  ): Promise<boolean> {
    const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (data.name !== undefined) payload['name'] = data.name;
    if (data.description !== undefined) payload['description'] = data.description;
    if (data.image_url !== undefined) payload['image_url'] = data.image_url;
    if (data.url !== undefined) payload['url'] = data.url;
    if (data.position !== undefined) payload['position'] = data.position;
    if (data.impressions_limit !== undefined) payload['impressions_limit'] = data.impressions_limit;
    if (data.clicks_limit !== undefined) payload['clicks_limit'] = data.clicks_limit;
    if (data.reward !== undefined) payload['reward'] = data.reward;
    if (data.location !== undefined) payload['location'] = data.location;
    if (data.start_date !== undefined) payload['start_date'] = data.start_date;
    if (data.end_date !== undefined) payload['end_date'] = data.end_date;

    const { error } = await this.supabase
      .from('banner_ads')
      .update(payload)
      .eq('id', id);

    if (error) throw error;

    return true;
  }

  /**
   * Cambiar estado del banner
   */
  async setBannerStatus(
    id: string,
    status: BannerStatus
  ): Promise<boolean> {
    try {
      const { error } = await this.supabase
        .from('banner_ads')
        .update({
          status,
          updated_at: new Date().toISOString()
        })
        .eq('id', id);

      if (error) throw error;

      return true;
    } catch (error: any) {
      // Failed to update banner status
      return false;
    }
  }

  /**
   * Activar banner
   */
  async activateBanner(id: string): Promise<boolean> {
    return this.setBannerStatus(id, 'active');
  }

  /**
   * Pausar banner
   */
  async pauseBanner(id: string): Promise<boolean> {
    return this.setBannerStatus(id, 'paused');
  }

  /**
   * Rechazar banner
   */
  async rejectBanner(id: string): Promise<boolean> {
    return this.setBannerStatus(id, 'rejected');
  }

  /**
   * Eliminar banner
   */
  async deleteBanner(id: string): Promise<boolean> {
    try {
      const { error } = await this.supabase
        .from('banner_ads')
        .delete()
        .eq('id', id);

      if (error) throw error;

      return true;
    } catch (error: any) {
      // Failed to delete banner ad
      return false;
    }
  }

  /**
   * Obtener banners activos para mostrar
   */
  async getActiveBanners(position?: string): Promise<BannerAd[]> {
    try {
      let query = this.supabase
        .from('banner_ads')
        .select('*')
        .eq('status', 'active')
        .gt('clicks_limit', 0);

      if (position) {
        query = query.eq('position', position);
      }

      const { data, error } = await query;

      if (error) throw error;

      return (data || []).map(b => ({
        id: b.id,
        advertiser_id: b.advertiser_id,
        campaign_id: b.campaign_id,
        name: b.name,
        description: b.description,
        image_url: b.image_url,
        url: b.url,
        position: b.position,
        impressions_limit: b.impressions_limit || 0,
        clicks_limit: b.clicks_limit || 0,
        daily_impressions: b.daily_impressions || 0,
        daily_clicks: b.daily_clicks || 0,
        total_impressions: b.total_impressions || 0,
        total_clicks: b.total_clicks || 0,
        reward: b.reward || 0,
        ctr: b.ctr || 0,
        status: b.status,
        location: b.location,
        start_date: b.start_date,
        end_date: b.end_date,
        created_at: b.created_at,
        updated_at: b.updated_at
      }));
    } catch (error: any) {
      // Failed to get active banners
      return [];
    }
  }

  /**
   * Obtener banners activos para mostrar por ubicación
   */
  async getActiveBannersByLocation(position?: string, location?: AdLocation): Promise<BannerAd[]> {
    try {
      let query = this.supabase
        .from('banner_ads')
        .select('*')
        .eq('status', 'active')
        .gt('clicks_limit', 0);

      if (position) {
        query = query.eq('position', position);
      }

      if (location) {
        query = query.eq('location', location);
      }

      const { data, error } = await query;

      if (error) throw error;

      return (data || []).map(b => ({
        id: b.id,
        advertiser_id: b.advertiser_id,
        campaign_id: b.campaign_id,
        name: b.name,
        description: b.description,
        image_url: b.image_url,
        url: b.url,
        position: b.position,
        impressions_limit: b.impressions_limit || 0,
        clicks_limit: b.clicks_limit || 0,
        daily_impressions: b.daily_impressions || 0,
        daily_clicks: b.daily_clicks || 0,
        total_impressions: b.total_impressions || 0,
        total_clicks: b.total_clicks || 0,
        reward: b.reward || 0,
        ctr: b.ctr || 0,
        status: b.status,
        location: b.location,
        start_date: b.start_date,
        end_date: b.end_date,
        created_at: b.created_at,
        updated_at: b.updated_at
      }));
    } catch (error: any) {
      // Failed to get active banners by location
      return [];
    }
  }

  /**
   * Registrar clic en banner
   */
  async registerClick(bannerId: string, userId?: string): Promise<void> {
    try {
      // Obtener banner
      const banner = await this.getBannerAdById(bannerId);
      if (!banner) return;

      // Incrementar contadores
      const newClicks = banner.total_clicks + 1;
      const newDailyClicks = banner.daily_clicks + 1;
      const ctr = banner.total_impressions > 0 
        ? (newClicks / banner.total_impressions) * 100 
        : 0;

      await this.supabase
        .from('banner_ads')
        .update({
          total_clicks: newClicks,
          daily_clicks: newDailyClicks,
          ctr: ctr,
          updated_at: new Date().toISOString()
        })
        .eq('id', bannerId);

      // Registrar clic
      await this.supabase
        .from('banner_ad_clicks')
        .insert({
          user_id: userId,
          banner_ad_id: bannerId,
          reward_earned: banner.reward
        });
    } catch (error: any) {
      // Failed to register banner click
    }
  }
}
