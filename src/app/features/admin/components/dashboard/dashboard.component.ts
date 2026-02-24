import { Component, inject, signal, OnInit, computed, Pipe, PipeTransform } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { AdminDashboardService } from '../../../../core/services/admin-dashboard.service';
import { AdminCampaignService } from '../../../../core/services/admin-campaign.service';
import type {
  DashboardStats,
  ChartData,
  PendingItem,
  ActivityLog
} from '../../../../core/models/admin.model';

// Pipe para obtener el máximo de un array de números
@Pipe({
  name: 'max',
  standalone: true
})
class MaxPipe implements PipeTransform {
  transform(values: number[]): number {
    if (!values || values.length === 0) return 0;
    return Math.max(...values);
  }
}

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink, MaxPipe],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss'
})
export class AdminDashboardComponent implements OnInit {
  // Servicios
  private readonly dashboardService = inject(AdminDashboardService);
  private readonly campaignService = inject(AdminCampaignService);

  // Signals para estado
  readonly stats = signal<DashboardStats | null>(null);
  readonly chartData = signal<ChartData | null>(null);
  readonly pendingItems = signal<PendingItem[]>([]);
  readonly recentActivity = signal<ActivityLog[]>([]);
  readonly loading = signal<boolean>(true);
  readonly error = signal<string | null>(null);

  // Computed para valores derivados
  readonly hasPendingAds = computed(() => this.pendingItems().length > 0);
  readonly pendingCount = computed(() => this.pendingItems().length);

  // Exponer Math para el template
  readonly Math = Math;

  // Formato de moneda
  readonly currencyFormatter = new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  });

  // Formato de números
  readonly numberFormatter = new Intl.NumberFormat('es-CO');

  ngOnInit(): void {
    this.loadDashboardData();
  }

  private async loadDashboardData(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    try {
      const [stats, chartData, pendingItems, recentActivity] = await Promise.all([
        this.dashboardService.getDashboardStats(),
        this.dashboardService.getActivityChartData(),
        this.dashboardService.getPendingItems(),
        this.dashboardService.getRecentActivity(5)
      ]);

      this.stats.set(stats);
      this.chartData.set(chartData);
      this.pendingItems.set(pendingItems);
      this.recentActivity.set(recentActivity);
    } catch (err: any) {
      console.error('Error loading dashboard data:', err);
      this.error.set('Error al cargar los datos del dashboard');
    } finally {
      this.loading.set(false);
    }
  }

  /**
   * Aprobar un anuncio pendiente
   */
  async approveAd(id: string): Promise<void> {
    const success = await this.campaignService.approveCampaign(id);
    if (success) {
      await this.dashboardService.logActivity('approve_ad', 'campaign', id, { action: 'approved' });
      await this.loadDashboardData();
    }
  }

  /**
   * Rechazar una campaña pendiente
   */
  async rejectAd(id: string): Promise<void> {
    const success = await this.campaignService.rejectCampaign(id);
    if (success) {
      await this.dashboardService.logActivity('reject_ad', 'campaign', id, { action: 'rejected' });
      await this.loadDashboardData();
    }
  }

  /**
   * Formatear número como moneda
   */
  formatCurrency(value: number | undefined): string {
    if (value === undefined || value === null) return '$0';
    return this.currencyFormatter.format(value);
  }

  /**
   * Formatear número con separadores
   */
  formatNumber(value: number | undefined): string {
    if (value === undefined || value === null) return '0';
    return this.numberFormatter.format(value);
  }

  /**
   * Obtener color para barra de gráfico
   */
  getBarColor(index: number): string {
    const colors = ['bg-cyan-500', 'bg-pink-500', 'bg-emerald-500', 'bg-amber-500', 'bg-violet-500'];
    return colors[index % colors.length];
  }

  /**
   * Calcular altura de barra de gráfico
   */
  getBarHeight(value: number, maxValue: number): string {
    if (maxValue === 0) return '0%';
    const percentage = (value / maxValue) * 100;
    return `${Math.max(percentage, 5)}%`; // Mínimo 5% para visibilidad
  }

  /**
   * Formatear fecha
   */
  formatDate(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleDateString('es-CO', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  /**
   * Obtener texto descriptivo de acción
   */
  getActionText(action: string): string {
    const actionTexts: Record<string, string> = {
      'approve_ad': 'Aprobó un anuncio',
      'reject_ad': 'Rechazó un anuncio',
      'create_user': 'Creó un usuario',
      'update_user': 'Actualizó un usuario',
      'delete_user': 'Eliminó un usuario',
      'approve_withdrawal': 'Aprobó un retiro',
      'reject_withdrawal': 'Rechazó un retiro',
      'login': 'Inició sesión',
      'logout': 'Cerró sesión'
    };
    return actionTexts[action] || action;
  }

  /**
   * Recargar datos
   */
  reloadData(): void {
    this.loadDashboardData();
  }
}
