import { Injectable, inject } from '@angular/core';
import { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseClient } from '../supabase.client';
import type {
  DashboardStats,
  DailyActivity,
  ChartData,
  PendingItem,
  ActivityLog
} from '../models/admin.model';

/**
 * Servicio para el dashboard de administración
 * Proporciona estadísticas y datos agregados
 */
@Injectable({
  providedIn: 'root'
})
export class AdminDashboardService {
  private readonly supabase: SupabaseClient;

  constructor() {
    this.supabase = getSupabaseClient();
  }

  /**
   * Obtener estadísticas del dashboard
   */
  async getDashboardStats(): Promise<DashboardStats> {
    try {
      const today = new Date().toISOString().split('T')[0];

      // Total de usuarios
      const { count: totalUsers } = await this.supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true });

      // Usuarios activos
      const { count: activeUsers } = await this.supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true })
        .eq('is_active', true);

      // Nuevos usuarios hoy
      const { count: newUsersToday } = await this.supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', today);

      // Total de anuncios PTC
      const { count: totalAds } = await this.supabase
        .from('ptc_tasks')
        .select('*', { count: 'exact', head: true });

      // Anuncios activos
      const { count: activeAds } = await this.supabase
        .from('ptc_tasks')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'active');

      // Anuncios pendientes (campanas en draft)
      const { count: pendingAds } = await this.supabase
        .from('campaigns')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'draft');

      // Total de ingresos (suma de total_spent de todos los usuarios)
      const { data: revenueData } = await this.supabase
        .from('profiles')
        .select('total_spent');

      const totalRevenue = revenueData?.reduce((sum, p) => sum + (p.total_spent || 0), 0) || 0;

      // Ingresos de hoy (campanas creadas hoy)
      const { data: todayRevenueData } = await this.supabase
        .from('campaigns')
        .select('spent')
        .gte('created_at', today);

      const todayRevenue = todayRevenueData?.reduce((sum, c) => sum + (c.spent || 0), 0) || 0;

      // Retiros pendientes
      const { count: pendingWithdrawals } = await this.supabase
        .from('withdrawal_requests')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending');

      // Total de retiros completados
      const { count: totalWithdrawals } = await this.supabase
        .from('withdrawal_requests')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'completed');

      return {
        totalUsers: totalUsers || 0,
        activeUsers: activeUsers || 0,
        newUsersToday: newUsersToday || 0,
        totalAds: totalAds || 0,
        activeAds: activeAds || 0,
        pendingAds: pendingAds || 0,
        totalRevenue: totalRevenue || 0,
        todayRevenue: todayRevenue || 0,
        pendingWithdrawals: pendingWithdrawals || 0,
        totalWithdrawals: totalWithdrawals || 0
      };
    } catch (error: any) {
      console.error('Error getting dashboard stats:', error);
      return {
        totalUsers: 0,
        activeUsers: 0,
        newUsersToday: 0,
        totalAds: 0,
        activeAds: 0,
        pendingAds: 0,
        totalRevenue: 0,
        todayRevenue: 0,
        pendingWithdrawals: 0,
        totalWithdrawals: 0
      };
    }
  }

  /**
   * Obtener datos para gráficos (últimos 7 días)
   */
  async getActivityChartData(): Promise<ChartData> {
    try {
      const days = 7;
      const labels: string[] = [];
      const userData: number[] = [];
      const clickData: number[] = [];
      const revenueData: number[] = [];

      const dayNames = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

      for (let i = days - 1; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const dateStr = date.toISOString().split('T')[0];
        labels.push(dayNames[date.getDay()]);

        // Usuarios registrados ese día
        const { count: users } = await this.supabase
          .from('profiles')
          .select('*', { count: 'exact', head: true })
          .gte('created_at', dateStr)
          .lt('created_at', dateStr + 'T23:59:59');

        userData.push(users || 0);

        // Clicks ese día
        const { count: clicks } = await this.supabase
          .from('ptc_clicks')
          .select('*', { count: 'exact', head: true })
          .gte('created_at', dateStr)
          .lt('created_at', dateStr + 'T23:59:59');

        clickData.push(clicks || 0);

        // Ingresos ese día
        const { data: dayRevenue } = await this.supabase
          .from('campaigns')
          .select('spent')
          .gte('created_at', dateStr)
          .lt('created_at', dateStr + 'T23:59:59');

        revenueData.push(dayRevenue?.reduce((sum, c) => sum + (c.spent || 0), 0) || 0);
      }

      return {
        labels,
        datasets: [
          { label: 'Nuevos Usuarios', data: userData, color: '#00E5FF' },
          { label: 'Clicks', data: clickData, color: '#FF007F' },
          { label: 'Ingresos', data: revenueData, color: '#10B981' }
        ]
      };
    } catch (error: any) {
      console.error('Error getting chart data:', error);
      return {
        labels: [],
        datasets: []
      };
    }
  }

  /**
   * Obtener items pendientes de moderación
   */
  async getPendingItems(): Promise<PendingItem[]> {
    try {
      // Campañas en estado draft
      const { data: campaigns, error } = await this.supabase
        .from('campaigns')
        .select(`
          id,
          name,
          description,
          advertiser_id,
          created_at,
          profiles:advertiser_id (username)
        `)
        .eq('status', 'draft')
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) throw error;

      return (campaigns || []).map(c => ({
        id: c.id,
        type: 'campaign' as const,
        title: c.name,
        description: c.description || '',
        advertiser_id: c.advertiser_id,
        advertiser_username: (c.profiles as any)?.username || 'Usuario',
        submitted_at: c.created_at
      }));
    } catch (error: any) {
      console.error('Error getting pending items:', error);
      return [];
    }
  }

  /**
   * Obtener actividad reciente del sistema
   */
  async getRecentActivity(limit = 10): Promise<ActivityLog[]> {
    try {
      const { data, error } = await this.supabase
        .from('activity_logs')
        .select(`
          id,
          user_id,
          action,
          entity_type,
          entity_id,
          details,
          ip_address,
          created_at,
          profiles:user_id (username, full_name)
        `)
        .order('created_at', { ascending: false })
        .limit(limit);

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
      console.error('Error getting recent activity:', error);
      return [];
    }
  }

  /**
   * Registrar actividad en el log
   */
  async logActivity(
    action: string,
    entityType: ActivityLog['entity_type'],
    entityId: string | null,
    details: Record<string, unknown> = {}
  ): Promise<void> {
    try {
      const { data: { user } } = await this.supabase.auth.getUser();

      await this.supabase
        .from('activity_logs')
        .insert({
          user_id: user?.id || null,
          action,
          entity_type: entityType,
          entity_id: entityId,
          details,
          ip_address: null // Se podría obtener del servidor
        });
    } catch (error: any) {
      console.error('Error logging activity:', error);
    }
  }
}
