import { Injectable } from '@angular/core';
import { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseClient } from '../supabase.client';
import { sanitizePostgrestFilter } from '../utils/sanitize';
import type {
  PtcTaskAdmin,
  PtcTaskFilters,
  CreatePtcTaskData,
  PaginatedResponse,
  PaginationParams,
  AdLocation
} from '../models/admin.model';

/**
 * Interface para anuncios de ejemplo compartidos (landing + advertiser gallery)
 */
export interface SampleAdCard {
  id: string;
  title: string;
  description: string;
  advertiserName: string;
  advertiserType: 'company' | 'person';
  imageUrl: string;
  videoUrl: string;
  adType: 'mega' | 'standard_400' | 'standard_600' | 'mini';
  rewardCOP: number;
  dailyLimit: number;
  totalClicks: number;
  status: string;
}

/**
 * 16 anuncios de ejemplo usados en la landing y galería del anunciante
 */
export const SAMPLE_PTC_ADS: SampleAdCard[] = [
  // Mega Anuncios (2000 COP)
  {
    id: '1',
    title: 'Promo Fin de Semana - Tienda Online',
    description: 'Ofertas exclusivas este fin de semana',
    advertiserName: 'Mileniustore',
    advertiserType: 'company',
    imageUrl: 'https://images.unsplash.com/photo-1472851294608-062f824d29cc?w=400&h=300&fit=crop',
    videoUrl: 'dQw4w9WgXcQ',
    adType: 'mega',
    rewardCOP: 2000,
    dailyLimit: 100,
    totalClicks: 450,
    status: 'active'
  },
  {
    id: '5',
    title: 'Restaurante Los Parados',
    description: 'Los mejores platos típicos',
    advertiserName: 'Restaurante Los Parados',
    advertiserType: 'company',
    imageUrl: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=400&h=300&fit=crop',
    videoUrl: 'jfKfPfyJRdk',
    adType: 'mega',
    rewardCOP: 2000,
    dailyLimit: 120,
    totalClicks: 580,
    status: 'active'
  },
  {
    id: '7',
    title: 'Gran Venta de Electrónicos',
    description: 'Hasta 50% de descuento',
    advertiserName: 'TecnoWorld',
    advertiserType: 'company',
    imageUrl: 'https://images.unsplash.com/photo-1498049794561-7780e7231661?w=400&h=300&fit=crop',
    videoUrl: '5qap5aO4i9A',
    adType: 'mega',
    rewardCOP: 2000,
    dailyLimit: 80,
    totalClicks: 320,
    status: 'active'
  },
  {
    id: '8',
    title: 'Spa & Wellness Centro',
    description: 'Relájate con nuestros servicios',
    advertiserName: 'Relax & Vida',
    advertiserType: 'company',
    imageUrl: 'https://images.unsplash.com/photo-1544161515-4ab6ce6db874?w=400&h=300&fit=crop',
    videoUrl: 'DWcJFNfaw9c',
    adType: 'mega',
    rewardCOP: 2000,
    dailyLimit: 60,
    totalClicks: 210,
    status: 'active'
  },
  // Standard 400 (400 COP)
  {
    id: '2',
    title: 'Nueva Colección de Ropa',
    description: 'Moda colombiana al mejor precio',
    advertiserName: 'Fashion Colombia',
    advertiserType: 'company',
    imageUrl: 'https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=400&h=300&fit=crop',
    videoUrl: 'KG4otu6nO1I',
    adType: 'standard_400',
    rewardCOP: 400,
    dailyLimit: 80,
    totalClicks: 320,
    status: 'active'
  },
  {
    id: '9',
    title: 'Zapatillas Importadas',
    description: 'Las mejores marcas importadas',
    advertiserName: 'ShoeStore',
    advertiserType: 'company',
    imageUrl: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=400&h=300&fit=crop',
    videoUrl: 'VGg46O4GgiM',
    adType: 'standard_400',
    rewardCOP: 400,
    dailyLimit: 70,
    totalClicks: 280,
    status: 'active'
  },
  {
    id: '10',
    title: 'Accesorios para Celulares',
    description: 'Protege y personaliza tu celular',
    advertiserName: 'CelularAccesories',
    advertiserType: 'company',
    imageUrl: 'https://images.unsplash.com/photo-1601784551446-20c9e07cdbdb?w=400&h=300&fit=crop',
    videoUrl: '9bZkp7q19f0',
    adType: 'standard_400',
    rewardCOP: 400,
    dailyLimit: 90,
    totalClicks: 410,
    status: 'active'
  },
  {
    id: '11',
    title: 'Muebles para el Hogar',
    description: 'Renueva tu hogar con estilo',
    advertiserName: 'HogarExpress',
    advertiserType: 'company',
    imageUrl: 'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=400&h=300&fit=crop',
    videoUrl: 'jNQXAC9IVRw',
    adType: 'standard_400',
    rewardCOP: 400,
    dailyLimit: 50,
    totalClicks: 190,
    status: 'active'
  },
  // Standard 600 (600 COP)
  {
    id: '3',
    title: 'Servicio de Delivery Express',
    description: 'Entrega rápida a domicilio',
    advertiserName: 'Juan Pérez',
    advertiserType: 'person',
    imageUrl: 'https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?w=400&h=300&fit=crop',
    videoUrl: 'fJ9rUzIMcZQ',
    adType: 'standard_600',
    rewardCOP: 600,
    dailyLimit: 60,
    totalClicks: 180,
    status: 'active'
  },
  {
    id: '12',
    title: 'Clases de Guitarra Online',
    description: 'Aprende a tocar guitarra desde casa',
    advertiserName: 'MusicaVirtual',
    advertiserType: 'company',
    imageUrl: 'https://images.unsplash.com/photo-1510915361894-db8b60106cb1?w=400&h=300&fit=crop',
    videoUrl: 'hT_nvWreIhg',
    adType: 'standard_600',
    rewardCOP: 600,
    dailyLimit: 40,
    totalClicks: 150,
    status: 'active'
  },
  {
    id: '13',
    title: 'Servicios de Limpieza',
    description: 'Limpieza profesional garantizada',
    advertiserName: 'LimpiaHogar',
    advertiserType: 'company',
    imageUrl: 'https://images.unsplash.com/photo-1581578731548-c64695cc6952?w=400&h=300&fit=crop',
    videoUrl: 'kXYiU_JCYtU',
    adType: 'standard_600',
    rewardCOP: 600,
    dailyLimit: 55,
    totalClicks: 230,
    status: 'active'
  },
  {
    id: '14',
    title: 'Peluquería Canina a Domicilio',
    description: 'Cuidamos a tu mascota con amor',
    advertiserName: 'MascotasFelices',
    advertiserType: 'company',
    imageUrl: 'https://images.unsplash.com/photo-1516734212186-a967f81ad0d7?w=400&h=300&fit=crop',
    videoUrl: 'RgKAFKcjG3w',
    adType: 'standard_600',
    rewardCOP: 600,
    dailyLimit: 35,
    totalClicks: 95,
    status: 'active'
  },
  // Mini Anuncios (83.33 COP)
  {
    id: '4',
    title: 'Cupón Descuento 20%',
    description: 'Descuento exclusivo en tecnología',
    advertiserName: 'TechnoShop',
    advertiserType: 'company',
    imageUrl: 'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=400&h=300&fit=crop',
    videoUrl: 'OPf0YbXqDm0',
    adType: 'mini',
    rewardCOP: 83.33,
    dailyLimit: 50,
    totalClicks: 120,
    status: 'active'
  },
  {
    id: '6',
    title: 'Clases de Inglés Online',
    description: 'Aprende inglés fácil y rápido',
    advertiserName: 'María García',
    advertiserType: 'person',
    imageUrl: 'https://images.unsplash.com/photo-1546410531-bb4caa6b424d?w=400&h=300&fit=crop',
    videoUrl: 'jofNRWkoRGY',
    adType: 'mini',
    rewardCOP: 83.33,
    dailyLimit: 30,
    totalClicks: 85,
    status: 'active'
  },
  {
    id: '15',
    title: 'Desayunos Sorpresa',
    description: 'Sorprende a quien más quieres',
    advertiserName: 'SweetDelivery',
    advertiserType: 'company',
    imageUrl: 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=400&h=300&fit=crop',
    videoUrl: '9bZkp7q19f0',
    adType: 'mini',
    rewardCOP: 83.33,
    dailyLimit: 45,
    totalClicks: 180,
    status: 'active'
  },
  {
    id: '16',
    title: 'Reparación de Computadores',
    description: 'Servicio técnico profesional',
    advertiserName: 'TechFix',
    advertiserType: 'company',
    imageUrl: 'https://images.unsplash.com/photo-1587614382346-4ec70e388b28?w=400&h=300&fit=crop',
    videoUrl: 'kJQP7kiw5Fk',
    adType: 'mini',
    rewardCOP: 83.33,
    dailyLimit: 25,
    totalClicks: 65,
    status: 'active'
  }
];

/**
 * Servicio para gestión de anuncios PTC (admin)
 */
@Injectable({
  providedIn: 'root'
})
export class AdminPtcTaskService {
  private readonly supabase: SupabaseClient;

  constructor() {
    this.supabase = getSupabaseClient();
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
        const safeSearch = sanitizePostgrestFilter(filters.search);
        if (safeSearch) {
          query = query.or(`title.ilike.%${safeSearch}%,description.ilike.%${safeSearch}%`);
        }
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
        youtube_url: t.youtube_url || null,
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
      // Failed to get PTC tasks
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
        youtube_url: data.youtube_url || null,
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
      // Failed to get PTC task
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
          youtube_url: data.youtube_url || null,
          image_url: data.image_url,
          reward: data.reward,
          duration: data.duration,
          daily_limit: data.daily_limit,
          advertiser_id: data.advertiser_id,
          ad_type: data.ad_type,
          is_demo_only: data.is_demo_only,
          status: 'active',
          location: data.location,
          total_clicks: data.total_clicks || 0
        })
        .select('id')
        .single();

      if (error) throw error;

      return result;
    } catch (error: any) {
      // Failed to create PTC task
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
    // ptc_tasks no tiene columna updated_at — no incluirla en el update
    const payload: Record<string, unknown> = {};
    if (data.title !== undefined) payload['title'] = data.title;
    if (data.description !== undefined) payload['description'] = data.description;
    if (data.url !== undefined) payload['url'] = data.url;
    if (data.image_url !== undefined) payload['image_url'] = data.image_url;
    if (data.reward !== undefined) payload['reward'] = data.reward;
    if (data.duration !== undefined) payload['duration'] = data.duration;
    if (data.daily_limit !== undefined) payload['daily_limit'] = data.daily_limit;
    if (data.location !== undefined) payload['location'] = data.location;
    if (data.ad_type !== undefined) payload['ad_type'] = data.ad_type;
    if (data.is_demo_only !== undefined) payload['is_demo_only'] = data.is_demo_only;
    if (data.youtube_url !== undefined) payload['youtube_url'] = data.youtube_url || null;
    if (data.total_clicks !== undefined) payload['total_clicks'] = data.total_clicks;

    const { error } = await this.supabase
      .from('ptc_tasks')
      .update(payload)
      .eq('id', id);

    if (error) throw error;

    return true;
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
      // Failed to update PTC task status
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
      // Failed to delete PTC task
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
      // Failed to get task stats
      return null;
    }
  }
}
