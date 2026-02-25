import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AdminPackageService } from '../../../../core/services/admin-package.service';
import { AdminDashboardService } from '../../../../core/services/admin-dashboard.service';
import type {
  Package as PackageModel,
  CreatePackageData,
  UserPackage,
  PackageType,
  UserAdmin,
  Payment,
  PaymentStatus
} from '../../../../core/models/admin.model';

type SearchedUser = Pick<UserAdmin, 'id' | 'username' | 'email' | 'role' | 'is_active'>;

@Component({
  selector: 'app-admin-packages',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './packages.component.html',
  styleUrl: './packages.component.scss'
})
export class AdminPackagesComponent implements OnInit {
  // Servicios
  private readonly packageService = inject(AdminPackageService);
  private readonly dashboardService = inject(AdminDashboardService);

  // Estado
  readonly packages = signal<PackageModel[]>([]);
  readonly userPackages = signal<UserPackage[]>([]);
  readonly loading = signal<boolean>(true);
  readonly error = signal<string | null>(null);
  readonly successMessage = signal<string | null>(null);
  readonly activeTab = signal<'packages' | 'user-packages' | 'assign' | 'payments'>('packages');

  // Pagination
  readonly currentPage = signal<number>(1);
  readonly pageSize = signal<number>(20);
  readonly totalCount = signal<number>(0);

  // Modal crear/editar paquete
  readonly showModal = signal<boolean>(false);
  readonly modalMode = signal<'create' | 'edit'>('create');
  readonly selectedPackage = signal<PackageModel | null>(null);

  // Asignar paquete
  readonly userSearchQuery = signal<string>('');
  readonly searchResults = signal<SearchedUser[]>([]);
  readonly selectedUser = signal<SearchedUser | null>(null);
  readonly selectedAssignPackage = signal<PackageModel | null>(null);
  readonly assigning = signal<boolean>(false);
  readonly assignError = signal<string | null>(null);
  readonly searching = signal<boolean>(false);
  private searchTimeout: ReturnType<typeof setTimeout> | null = null;

  // Form data
  readonly formData = signal<Partial<CreatePackageData>>({
    name: '',
    description: '',
    package_type: 'basic',
    price: 25,
    currency: 'USD',
    duration_days: 30,
    features: [],
    // Límites mínimos
    min_ptc_visits: 50,
    min_banner_views: 100,
    included_ptc_ads: 1,
    has_clickable_banner: true,
    banner_clicks_limit: 500,
    banner_impressions_limit: 1000,
    daily_ptc_limit: 9,
    // Límites máximos
    max_ptc_ads: 1,
    max_banner_ads: 1,
    max_campaigns: 1,
    // Bonificaciones
    ptc_reward_bonus: 5,
    banner_reward_bonus: 0,
    referral_bonus: 5,
    nequi_payment_link: null,
    price_cop: null
  });

  readonly saving = signal<boolean>(false);

  // Pagos pendientes
  readonly payments = signal<Payment[]>([]);
  readonly pendingPaymentsCount = signal<number>(0);
  readonly processingPayment = signal<string | null>(null);
  readonly rejectTarget = signal<Payment | null>(null);
  readonly rejectReason = signal<string>('');

  // Revocar paquete
  readonly revokeTarget = signal<UserPackage | null>(null);
  readonly revoking = signal<boolean>(false);

  // Form for features
  readonly newFeature = signal<string>('');

  readonly packageTypes: { value: PackageType; label: string }[] = [
    { value: 'basic', label: 'Básico' },
    { value: 'premium', label: 'Premium' },
    { value: 'enterprise', label: 'Enterprise' },
    { value: 'custom', label: 'Personalizado' }
  ];

  readonly currencyFormatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });

  readonly totalPages = () => Math.ceil(this.totalCount() / this.pageSize());

  ngOnInit(): void {
    this.loadPackages();
    this.loadUserPackages();
    this.loadPayments();
  }

  async loadPackages(): Promise<void> {
    this.loading.set(true);
    try {
      const data = await this.packageService.getPackages();
      this.packages.set(data);
    } catch (err: any) {
      console.error('Error loading packages:', err);
      this.error.set('Error al cargar los paquetes');
    } finally {
      this.loading.set(false);
    }
  }

  async loadUserPackages(): Promise<void> {
    try {
      const result = await this.packageService.getUserPackages({
        page: this.currentPage(),
        pageSize: this.pageSize()
      });
      this.userPackages.set(result.data);
      this.totalCount.set(result.total);
    } catch (err: any) {
      console.error('Error loading user packages:', err);
    }
  }

  setTab(tab: 'packages' | 'user-packages' | 'assign' | 'payments'): void {
    this.activeTab.set(tab);
    if (tab === 'user-packages') this.loadUserPackages();
    if (tab === 'assign') this.resetAssignForm();
    if (tab === 'payments') this.loadPayments();
  }

  async loadPayments(): Promise<void> {
    try {
      const result = await this.packageService.getPendingPayments({ page: 1, pageSize: 50 });
      this.payments.set(result.data);
      this.pendingPaymentsCount.set(result.data.filter(p => p.status === 'pending').length);
    } catch (err: any) {
      console.error('Error loading payments:', err);
    }
  }

  async approvePayment(payment: Payment): Promise<void> {
    this.processingPayment.set(payment.id);
    try {
      const ok = await this.packageService.approvePayment(payment.id);
      if (!ok) throw new Error('No se pudo aprobar');
      this.showSuccessMessage(`Pago aprobado. Paquete "${payment.package_name}" activado para ${payment.username ?? 'el usuario'}.`);
      await this.loadPayments();
    } catch (err: any) {
      this.error.set(err.message || 'Error al aprobar el pago');
    } finally {
      this.processingPayment.set(null);
    }
  }

  openRejectModal(payment: Payment): void {
    this.rejectTarget.set(payment);
    this.rejectReason.set('');
  }

  closeRejectModal(): void {
    this.rejectTarget.set(null);
    this.rejectReason.set('');
  }

  async confirmRejectPayment(): Promise<void> {
    const target = this.rejectTarget();
    if (!target) return;
    this.processingPayment.set(target.id);
    try {
      await this.packageService.rejectPayment(target.id, this.rejectReason() || undefined);
      this.showSuccessMessage(`Pago rechazado para ${target.username ?? 'el usuario'}.`);
      this.closeRejectModal();
      await this.loadPayments();
    } catch (err: any) {
      this.error.set(err.message || 'Error al rechazar el pago');
    } finally {
      this.processingPayment.set(null);
    }
  }

  setNequiLink(value: string): void {
    this.formData.update(fd => ({ ...fd, nequi_payment_link: value || null }));
  }

  setPriceCOP(value: number | string | null): void {
    const num = value !== null && value !== '' ? Number(value) : null;
    this.formData.update(fd => ({ ...fd, price_cop: num && num > 0 ? num : null }));
  }

  getPaymentStatusLabel(status: PaymentStatus | string): string {
    const map: Record<string, string> = {
      pending: 'Pendiente', approved: 'Aprobado',
      declined: 'Rechazado', voided: 'Anulado', error: 'Error',
    };
    return map[status] ?? status;
  }

  getPaymentStatusClass(status: PaymentStatus | string): string {
    const map: Record<string, string> = {
      pending:  'bg-amber-500/10 text-amber-400 border-amber-500/20',
      approved: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
      declined: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
      voided:   'bg-slate-500/10 text-slate-400 border-slate-500/20',
      error:    'bg-rose-500/10 text-rose-400 border-rose-500/20',
    };
    return map[status] ?? 'bg-slate-500/10 text-slate-400 border-slate-500/20';
  }

  formatCOPCents(cents: number): string {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency', currency: 'COP',
      minimumFractionDigits: 0, maximumFractionDigits: 0,
    }).format(cents / 100);
  }

  // Modal actions
  openCreateModal(): void {
    this.modalMode.set('create');
    this.selectedPackage.set(null);
    this.formData.set({
      name: '',
      description: '',
      package_type: 'basic',
      price: 25,
      currency: 'USD',
      duration_days: 30,
      features: [],
      // Límites mínimos
      min_ptc_visits: 50,
      min_banner_views: 100,
      included_ptc_ads: 1,
      has_clickable_banner: true,
      banner_clicks_limit: 500,
      banner_impressions_limit: 1000,
      daily_ptc_limit: 9,
      // Límites máximos
      max_ptc_ads: 1,
      max_banner_ads: 1,
      max_campaigns: 1,
      // Bonificaciones
      ptc_reward_bonus: 5,
      banner_reward_bonus: 0,
      referral_bonus: 5,
      nequi_payment_link: null,
      price_cop: null
    });
    this.showModal.set(true);
  }

  openEditModal(pkg: PackageModel): void {
    this.modalMode.set('edit');
    this.selectedPackage.set(pkg);
    this.formData.set({
      name: pkg.name,
      description: pkg.description || '',
      package_type: pkg.package_type,
      price: pkg.price,
      currency: (pkg as any).currency || 'USD',
      duration_days: pkg.duration_days,
      features: [...pkg.features],
      // Límites mínimos
      min_ptc_visits: (pkg as any).min_ptc_visits || 0,
      min_banner_views: (pkg as any).min_banner_views || 0,
      included_ptc_ads: (pkg as any).included_ptc_ads || 0,
      has_clickable_banner: (pkg as any).has_clickable_banner ?? true,
      banner_clicks_limit: (pkg as any).banner_clicks_limit || 0,
      banner_impressions_limit: (pkg as any).banner_impressions_limit || 0,
      daily_ptc_limit: (pkg as any).daily_ptc_limit || 5,
      // Límites máximos
      max_ptc_ads: pkg.max_ptc_ads,
      max_banner_ads: pkg.max_banner_ads,
      max_campaigns: pkg.max_campaigns,
      // Bonificaciones
      ptc_reward_bonus: pkg.ptc_reward_bonus,
      banner_reward_bonus: pkg.banner_reward_bonus,
      referral_bonus: pkg.referral_bonus,
      nequi_payment_link: pkg.nequi_payment_link || null,
      price_cop: pkg.price_cop ?? null
    });
    this.showModal.set(true);
  }

  closeModal(): void {
    this.showModal.set(false);
    this.selectedPackage.set(null);
    this.newFeature.set('');
  }

  // Feature management
  addFeature(): void {
    const feature = this.newFeature().trim();
    if (feature) {
      const current = this.formData().features || [];
      this.formData.update(d => ({ ...d, features: [...current, feature] }));
      this.newFeature.set('');
    }
  }

  removeFeature(index: number): void {
    const current = this.formData().features || [];
    this.formData.update(d => ({
      ...d,
      features: current.filter((_, i) => i !== index)
    }));
  }

  // CRUD
  async savePackage(): Promise<void> {
    this.saving.set(true);
    try {
      if (this.modalMode() === 'create') {
        await this.packageService.createPackage(this.formData() as CreatePackageData);
      } else {
        const pkg = this.selectedPackage();
        if (pkg) {
          await this.packageService.updatePackage(pkg.id, this.formData() as Partial<CreatePackageData>);
        }
      }
      await this.loadPackages();
      this.closeModal();
    } catch (err: any) {
      console.error('Error saving package:', err);
      this.error.set(err.message || 'Error al guardar el paquete');
    } finally {
      this.saving.set(false);
    }
  }

  async deletePackage(pkg: PackageModel): Promise<void> {
    if (!confirm(`¿Estás seguro de eliminar el paquete "${pkg.name}"?`)) return;

    try {
      await this.packageService.deletePackage(pkg.id);
      await this.loadPackages();
    } catch (err: any) {
      console.error('Error deleting package:', err);
      this.error.set(err.message || 'Error al eliminar el paquete');
    }
  }

  // Pagination
  goToPage(page: number): void {
    if (page >= 1 && page <= this.totalPages()) {
      this.currentPage.set(page);
      this.loadUserPackages();
    }
  }

  // Formatting
  formatCurrency(value: number): string {
    return this.currencyFormatter.format(value);
  }

  formatDate(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleDateString('es-CO', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  }

  formatDateTime(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleString('es-CO', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  getPackageTypeLabel(type: PackageType): string {
    const labels: Record<PackageType, string> = {
      basic: 'Básico',
      premium: 'Premium',
      enterprise: 'Enterprise',
      custom: 'Personalizado'
    };
    return labels[type] || type;
  }

  getPackageTypeClass(type: PackageType): string {
    const classes: Record<PackageType, string> = {
      basic: 'bg-blue-500/10 text-blue-500',
      premium: 'bg-amber-500/10 text-amber-500',
      enterprise: 'bg-violet-500/10 text-violet-500',
      custom: 'bg-rose-500/10 text-rose-500'
    };
    return classes[type] || 'bg-slate-500/10 text-slate-500';
  }

  getStatusClass(status: string): string {
    const classes: Record<string, string> = {
      active: 'bg-emerald-500/10 text-emerald-500',
      expired: 'bg-rose-500/10 text-rose-500',
      cancelled: 'bg-slate-500/10 text-slate-500'
    };
    return classes[status] || 'bg-slate-500/10 text-slate-500';
  }

  // ─── Asignar Paquete ────────────────────────────────────────────────────

  onUserSearch(query: string): void {
    this.userSearchQuery.set(query);
    if (this.searchTimeout) clearTimeout(this.searchTimeout);

    if (query.trim().length < 2) {
      this.searchResults.set([]);
      this.searching.set(false);
      return;
    }

    this.searching.set(true);
    this.searchTimeout = setTimeout(async () => {
      const results = await this.packageService.searchUsers(query.trim());
      this.searchResults.set(results);
      this.searching.set(false);
    }, 400);
  }

  selectUser(user: SearchedUser): void {
    this.selectedUser.set(user);
    this.searchResults.set([]);
    this.userSearchQuery.set('');
  }

  clearSelectedUser(): void {
    this.selectedUser.set(null);
  }

  selectAssignPackage(pkg: PackageModel): void {
    this.selectedAssignPackage.set(pkg);
  }

  resetAssignForm(): void {
    this.selectedUser.set(null);
    this.selectedAssignPackage.set(null);
    this.userSearchQuery.set('');
    this.searchResults.set([]);
    this.assignError.set(null);
    this.assigning.set(false);
  }

  async confirmAssignPackage(): Promise<void> {
    const user = this.selectedUser();
    const pkg = this.selectedAssignPackage();
    if (!user || !pkg) return;

    this.assigning.set(true);
    this.assignError.set(null);

    try {
      const result = await this.packageService.assignPackage({
        user_id: user.id,
        package_id: pkg.id,
        payment_method: 'admin_manual',
        amount_paid: pkg.price
      });

      if (!result) {
        throw new Error('No se pudo asignar el paquete');
      }

      await this.dashboardService.logActivity('assign_package', 'user', user.id, {
        package_id: pkg.id,
        package_name: pkg.name,
        username: user.username,
        new_role: 'advertiser'
      });

      this.showSuccessMessage(
        `Paquete "${pkg.name}" asignado a ${user.username}. Rol actualizado a Anunciante.`
      );
      this.resetAssignForm();
      this.loadUserPackages();
    } catch (err: any) {
      console.error('Error assigning package:', err);
      this.assignError.set(err.message || 'Error al asignar el paquete');
    } finally {
      this.assigning.set(false);
    }
  }

  getRoleLabel(role: string): string {
    const labels: Record<string, string> = {
      dev: 'Desarrollador',
      admin: 'Administrador',
      advertiser: 'Anunciante',
      guest: 'Usuario'
    };
    return labels[role] || role;
  }

  getRoleBadgeClass(role: string): string {
    const classes: Record<string, string> = {
      dev: 'bg-violet-500/10 text-violet-400',
      admin: 'bg-rose-500/10 text-rose-400',
      advertiser: 'bg-amber-500/10 text-amber-400',
      guest: 'bg-blue-500/10 text-blue-400'
    };
    return classes[role] || 'bg-slate-500/10 text-slate-400';
  }

  // ─── Revocar Paquete ────────────────────────────────────────────────────

  openRevokeModal(up: UserPackage): void {
    this.revokeTarget.set(up);
  }

  closeRevokeModal(): void {
    this.revokeTarget.set(null);
  }

  async confirmRevoke(): Promise<void> {
    const target = this.revokeTarget();
    if (!target) return;

    this.revoking.set(true);
    try {
      const ok = await this.packageService.revokeUserPackage(target.id);
      if (!ok) throw new Error('No se pudo revocar el paquete');

      await this.dashboardService.logActivity('revoke_package', 'user', target.user_id, {
        package_id: target.package_id,
        package_name: target.package_name,
        username: target.username,
        new_role: 'guest'
      });

      this.showSuccessMessage(
        `Paquete "${target.package_name}" revocado. ${target.username ?? 'El usuario'} volvió a rol Usuario.`
      );
      this.closeRevokeModal();
      this.loadUserPackages();
    } catch (err: any) {
      console.error('Error revoking package:', err);
      this.error.set(err.message || 'Error al revocar el paquete');
      this.closeRevokeModal();
    } finally {
      this.revoking.set(false);
    }
  }

  private showSuccessMessage(message: string): void {
    this.successMessage.set(message);
    this.error.set(null);
    setTimeout(() => this.successMessage.set(null), 5000);
  }
}
