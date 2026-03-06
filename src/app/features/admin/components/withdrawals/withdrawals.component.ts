import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AdminWithdrawalService } from '../../../../core/services/admin-withdrawal.service';
import { CurrencyService } from '../../../../core/services/currency.service';
import type { WithdrawalAdmin, WithdrawalFilters, WithdrawalStatus } from '../../../../core/models/admin.model';

@Component({
  selector: 'app-admin-withdrawals',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './withdrawals.component.html',
})
export class AdminWithdrawalsComponent implements OnInit {
  private readonly withdrawalService = inject(AdminWithdrawalService);
  readonly currencyService = inject(CurrencyService);
  
  // Para usar en el template
  readonly Math = Math;

  readonly withdrawals = signal<WithdrawalAdmin[]>([]);
  readonly loading = signal(true);
  
  // Filtros
  readonly statusFilter = signal<string>('');
  readonly searchQuery = signal('');
  
  // Paginación
  readonly page = signal(1);
  readonly pageSize = 20;
  readonly totalCount = signal(0);
  readonly totalPages = signal(0);

  // Modal de rechazo
  readonly showRejectModal = signal(false);
  readonly rejectingId = signal<string | null>(null);
  readonly rejectionReason = signal('');

  // Modal de detalles
  readonly showDetailModal = signal(false);
  readonly selectedWithdrawal = signal<WithdrawalAdmin | null>(null);

  // Notificación
  readonly notification = signal<{ type: 'success' | 'error'; message: string } | null>(null);

  ngOnInit(): void {
    this.loadWithdrawals();
  }

  async loadWithdrawals(): Promise<void> {
    this.loading.set(true);
    
    const filters: WithdrawalFilters = {};
    if (this.statusFilter()) {
      filters.status = this.statusFilter() as WithdrawalStatus;
    }
    
    const result = await this.withdrawalService.getWithdrawals(
      filters,
      { page: this.page(), pageSize: this.pageSize }
    );
    
    this.withdrawals.set(result.data);
    this.totalCount.set(result.total);
    this.totalPages.set(result.totalPages);
    this.loading.set(false);
  }

  async onStatusFilterChange(): Promise<void> {
    this.page.set(1);
    await this.loadWithdrawals();
  }

  async onSearch(): Promise<void> {
    this.page.set(1);
    await this.loadWithdrawals();
  }

  async goToPage(newPage: number): Promise<void> {
    if (newPage >= 1 && newPage <= this.totalPages()) {
      this.page.set(newPage);
      await this.loadWithdrawals();
    }
  }

  async approveWithdrawal(id: string): Promise<void> {
    const success = await this.withdrawalService.approveWithdrawal(id);
    if (success) {
      this.showNotification('success', 'Retiro aprobado exitosamente');
      await this.loadWithdrawals();
    } else {
      this.showNotification('error', 'Error al aprobar el retiro');
    }
  }

  async completeWithdrawal(id: string): Promise<void> {
    const success = await this.withdrawalService.completeWithdrawal(id);
    if (success) {
      this.showNotification('success', 'Retiro marcado como completado');
      await this.loadWithdrawals();
    } else {
      this.showNotification('error', 'Error al completar el retiro');
    }
  }

  openRejectModal(withdrawal: WithdrawalAdmin): void {
    this.rejectingId.set(withdrawal.id);
    this.rejectionReason.set('');
    this.showRejectModal.set(true);
  }

  closeRejectModal(): void {
    this.showRejectModal.set(false);
    this.rejectingId.set(null);
    this.rejectionReason.set('');
  }

  async confirmReject(): Promise<void> {
    const id = this.rejectingId();
    const reason = this.rejectionReason();
    
    if (!id || !reason.trim()) return;
    
    const success = await this.withdrawalService.rejectWithdrawal(id, reason);
    if (success) {
      this.showNotification('success', 'Retiro rechazado');
      await this.loadWithdrawals();
    } else {
      this.showNotification('error', 'Error al rechazar el retiro');
    }
    
    this.closeRejectModal();
  }

  viewDetails(withdrawal: WithdrawalAdmin): void {
    this.selectedWithdrawal.set(withdrawal);
    this.showDetailModal.set(true);
  }

  closeDetailModal(): void {
    this.showDetailModal.set(false);
    this.selectedWithdrawal.set(null);
  }

  private showNotification(type: 'success' | 'error', message: string): void {
    this.notification.set({ type, message });
    setTimeout(() => this.notification.set(null), 4000);
  }

  formatCOP(amount: number): string {
    return this.currencyService.formatLocalValue(amount);
  }

  formatDate(dateString: string): string {
    return new Date(dateString).toLocaleDateString('es-CO', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  getStatusLabel(status: string): string {
    const labels: Record<string, string> = {
      pending: 'Pendiente',
      approved: 'Aprobado',
      completed: 'Completado',
      rejected: 'Rechazado'
    };
    return labels[status] || status;
  }

  getStatusClass(status: string): string {
    const classes: Record<string, string> = {
      pending: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
      approved: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
      completed: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
      rejected: 'bg-rose-500/10 text-rose-400 border-rose-500/20'
    };
    return classes[status] || 'bg-slate-500/10 text-slate-400';
  }
}
