import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AdminPackageService } from '../../../../core/services/admin-package.service';
import type {
  Package as PackageModel,
  CreatePackageData,
  UserPackage,
  PackageType
} from '../../../../core/models/admin.model';

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

  // Estado
  readonly packages = signal<PackageModel[]>([]);
  readonly userPackages = signal<UserPackage[]>([]);
  readonly loading = signal<boolean>(true);
  readonly error = signal<string | null>(null);
  readonly activeTab = signal<'packages' | 'user-packages'>('packages');

  // Pagination
  readonly currentPage = signal<number>(1);
  readonly pageSize = signal<number>(20);
  readonly totalCount = signal<number>(0);

  // Modal
  readonly showModal = signal<boolean>(false);
  readonly modalMode = signal<'create' | 'edit'>('create');
  readonly selectedPackage = signal<PackageModel | null>(null);

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
    included_ptc_ads: 5,
    has_clickable_banner: true,
    banner_clicks_limit: 500,
    banner_impressions_limit: 1000,
    daily_ptc_limit: 5,
    // Límites máximos
    max_ptc_ads: 5,
    max_banner_ads: 1,
    max_campaigns: 1,
    // Bonificaciones
    ptc_reward_bonus: 5,
    banner_reward_bonus: 0,
    referral_bonus: 5
  });

  readonly saving = signal<boolean>(false);

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

  setTab(tab: 'packages' | 'user-packages'): void {
    this.activeTab.set(tab);
    if (tab === 'user-packages') {
      this.loadUserPackages();
    }
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
      included_ptc_ads: 5,
      has_clickable_banner: true,
      banner_clicks_limit: 500,
      banner_impressions_limit: 1000,
      daily_ptc_limit: 5,
      // Límites máximos
      max_ptc_ads: 5,
      max_banner_ads: 1,
      max_campaigns: 1,
      // Bonificaciones
      ptc_reward_bonus: 5,
      banner_reward_bonus: 0,
      referral_bonus: 5
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
      referral_bonus: pkg.referral_bonus
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
}
