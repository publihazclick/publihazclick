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
      const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];

      const [
        { count: totalUsers },
        { count: activeUsers },
        { count: newUsersToday },
        { count: totalAds },
        { count: activeAds },
        { count: pendingAds },
        { count: totalClicks },
        { count: todayClicks },
        { count: pendingWithdrawals },
        { count: approvedWithdrawals },
        { count: rejectedWithdrawals },
        { count: completedWithdrawals },
        { data: pendingWdAmounts },
        { data: approvedWdAmounts },
        { data: completedWdAmounts },
        { data: revenueData },
        { data: todayRevenueData },
        { data: paidOutData },
        { data: donatedData },
      ] = await Promise.all([
        this.supabase.from('profiles').select('*', { count: 'exact', head: true }),
        this.supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('is_active', true),
        this.supabase.from('profiles').select('*', { count: 'exact', head: true }).gte('created_at', today).lt('created_at', tomorrow),
        this.supabase.from('ptc_tasks').select('*', { count: 'exact', head: true }),
        this.supabase.from('ptc_tasks').select('*', { count: 'exact', head: true }).eq('status', 'active'),
        this.supabase.from('campaigns').select('*', { count: 'exact', head: true }).eq('status', 'draft'),
        this.supabase.from('ptc_clicks').select('*', { count: 'exact', head: true }),
        this.supabase.from('ptc_clicks').select('*', { count: 'exact', head: true }).gte('completed_at', today).lt('completed_at', tomorrow),
        this.supabase.from('withdrawal_requests').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
        this.supabase.from('withdrawal_requests').select('*', { count: 'exact', head: true }).eq('status', 'approved'),
        this.supabase.from('withdrawal_requests').select('*', { count: 'exact', head: true }).eq('status', 'rejected'),
        this.supabase.from('withdrawal_requests').select('*', { count: 'exact', head: true }).eq('status', 'completed'),
        this.supabase.from('withdrawal_requests').select('amount').eq('status', 'pending'),
        this.supabase.from('withdrawal_requests').select('amount').eq('status', 'approved'),
        this.supabase.from('withdrawal_requests').select('amount').eq('status', 'completed'),
        this.supabase.from('profiles').select('total_earned'),
        this.supabase.from('ptc_clicks').select('reward_earned').gte('completed_at', today).lt('completed_at', tomorrow),
        this.supabase.from('ptc_clicks').select('reward_earned'),
        this.supabase.from('profiles').select('total_donated'),
      ]);

      const totalWdCount = (pendingWithdrawals || 0) + (approvedWithdrawals || 0) + (rejectedWithdrawals || 0) + (completedWithdrawals || 0);

      return {
        totalUsers: totalUsers || 0,
        activeUsers: activeUsers || 0,
        newUsersToday: newUsersToday || 0,
        totalAds: totalAds || 0,
        activeAds: activeAds || 0,
        pendingAds: pendingAds || 0,
        totalRevenue: revenueData?.reduce((s, p) => s + (p.total_earned || 0), 0) || 0,
        todayRevenue: todayRevenueData?.reduce((s, c) => s + (c.reward_earned || 0), 0) || 0,
        totalPaidOut: paidOutData?.reduce((s, c) => s + (c.reward_earned || 0), 0) || 0,
        totalClicks: totalClicks || 0,
        todayClicks: todayClicks || 0,
        pendingWithdrawals: pendingWithdrawals || 0,
        approvedWithdrawals: approvedWithdrawals || 0,
        rejectedWithdrawals: rejectedWithdrawals || 0,
        completedWithdrawals: completedWithdrawals || 0,
        totalWithdrawals: totalWdCount,
        pendingWithdrawalsAmount: pendingWdAmounts?.reduce((s, w) => s + (w.amount || 0), 0) || 0,
        approvedWithdrawalsAmount: approvedWdAmounts?.reduce((s, w) => s + (w.amount || 0), 0) || 0,
        completedWithdrawalsAmount: completedWdAmounts?.reduce((s, w) => s + (w.amount || 0), 0) || 0,
        totalDonated: donatedData?.reduce((s, p) => s + (p.total_donated || 0), 0) || 0,
      };
    } catch (error: any) {
      console.error('Error getting dashboard stats:', error);
      return {
        totalUsers: 0, activeUsers: 0, newUsersToday: 0,
        totalAds: 0, activeAds: 0, pendingAds: 0,
        totalRevenue: 0, todayRevenue: 0, totalPaidOut: 0,
        totalClicks: 0, todayClicks: 0,
        pendingWithdrawals: 0, approvedWithdrawals: 0, rejectedWithdrawals: 0,
        completedWithdrawals: 0, totalWithdrawals: 0,
        pendingWithdrawalsAmount: 0, approvedWithdrawalsAmount: 0, completedWithdrawalsAmount: 0,
        totalDonated: 0,
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
        const nextDateStr = new Date(date.getTime() + 86400000).toISOString().split('T')[0];
        const { count: users } = await this.supabase
          .from('profiles')
          .select('*', { count: 'exact', head: true })
          .gte('created_at', dateStr)
          .lt('created_at', nextDateStr);

        userData.push(users || 0);

        // Clicks ese día
        const { count: clicks } = await this.supabase
          .from('ptc_clicks')
          .select('*', { count: 'exact', head: true })
          .gte('completed_at', dateStr)
          .lt('completed_at', nextDateStr);

        clickData.push(clicks || 0);

        // Ingresos ese día (suma de rewards pagados)
        const { data: dayRevenue } = await this.supabase
          .from('ptc_clicks')
          .select('reward_earned')
          .gte('completed_at', dateStr)
          .lt('completed_at', nextDateStr);

        revenueData.push(dayRevenue?.reduce((sum, c) => sum + (c.reward_earned || 0), 0) || 0);
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
