import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AdminPtcTaskService } from '../../../../core/services/admin-ptc-task.service';
import { AdminBannerService } from '../../../../core/services/admin-banner.service';
import type {
  PtcTaskAdmin,
  CreatePtcTaskData,
  BannerAd,
  CreateBannerAdData,
  TaskStatus,
  BannerStatus,
  BannerPosition,
  PtcTaskFilters,
  BannerAdFilters,
  AdLocation
} from '../../../../core/models/admin.model';

@Component({
  selector: 'app-admin-ads',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './ads.component.html',
  styleUrl: './ads.component.scss'
})
export class AdminAdsComponent implements OnInit {
  // Servicios
  private readonly ptcService = inject(AdminPtcTaskService);
  private readonly bannerService = inject(AdminBannerService);

  // Estado
  readonly activeLocation = signal<'landing' | 'app'>('landing');
  readonly activeTab = signal<'ptc' | 'banner'>('ptc');
  readonly ptcAds = signal<PtcTaskAdmin[]>([]);
  readonly bannerAds = signal<BannerAd[]>([]);
  readonly loading = signal<boolean>(true);
  readonly error = signal<string | null>(null);

  // Filters
  readonly searchQuery = signal<string>('');
  readonly selectedStatus = signal<string>('all');
  readonly selectedPosition = signal<string>('all');

  // Pagination
  readonly currentPage = signal<number>(1);
  readonly pageSize = signal<number>(20);
  readonly totalCount = signal<number>(0);

  // Modal
  readonly showModal = signal<boolean>(false);
  readonly modalMode = signal<'create-ptc' | 'edit-ptc' | 'create-banner' | 'edit-banner'>('create-ptc');
  readonly selectedPtc = signal<PtcTaskAdmin | null>(null);
  readonly selectedBanner = signal<BannerAd | null>(null);

  // Form data
  readonly ptcFormData = signal<Partial<CreatePtcTaskData>>({
    title: '',
    description: '',
    url: '',
    image_url: '',
    reward: 50,
    duration: 15,
    daily_limit: 1000
  });

  readonly bannerFormData = signal<Partial<CreateBannerAdData>>({
    name: '',
    description: '',
    image_url: '',
    url: '',
    position: 'sidebar',
    impressions_limit: 10000,
    clicks_limit: 1000,
    reward: 0,
    location: 'landing'
  });

  readonly saving = signal<boolean>(false);

  // Options
  readonly ptcStatuses: { value: TaskStatus | 'all'; label: string }[] = [
    { value: 'all', label: 'Todos' },
    { value: 'active', label: 'Activos' },
    { value: 'paused', label: 'Pausados' },
    { value: 'completed', label: 'Completados' }
  ];

  readonly bannerStatuses: { value: BannerStatus | 'all'; label: string }[] = [
    { value: 'all', label: 'Todos' },
    { value: 'active', label: 'Activos' },
    { value: 'paused', label: 'Pausados' },
    { value: 'completed', label: 'Completados' },
    { value: 'rejected', label: 'Rechazados' }
  ];

  readonly bannerPositions: { value: BannerPosition; label: string }[] = [
    { value: 'header', label: 'Encabezado' },
    { value: 'sidebar', label: 'Barra lateral' },
    { value: 'footer', label: 'Pie de página' },
    { value: 'interstitial', label: 'Intersticial' }
  ];

  readonly currencyFormatter = new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  });

  readonly totalPages = () => Math.ceil(this.totalCount() / this.pageSize());

  ngOnInit(): void {
    this.loadData();
  }

  async loadData(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    try {
      const locationFilter = this.activeLocation();
      
      if (this.activeTab() === 'ptc') {
        const filters: PtcTaskFilters = { location: locationFilter };
        if (this.selectedStatus() !== 'all') {
          filters.status = this.selectedStatus() as TaskStatus;
        }
        if (this.searchQuery()) {
          filters.search = this.searchQuery();
        }

        const result = await this.ptcService.getPtcTasks(filters, {
          page: this.currentPage(),
          pageSize: this.pageSize()
        });
        this.ptcAds.set(result.data);
        this.totalCount.set(result.total);
      } else {
        const filters: BannerAdFilters = { location: locationFilter };
        if (this.selectedStatus() !== 'all') {
          filters.status = this.selectedStatus() as BannerStatus;
        }
        if (this.selectedPosition() !== 'all') {
          filters.position = this.selectedPosition() as BannerPosition;
        }
        if (this.searchQuery()) {
          filters.search = this.searchQuery();
        }

        const result = await this.bannerService.getBannerAds(filters, {
          page: this.currentPage(),
          pageSize: this.pageSize()
        });
        this.bannerAds.set(result.data);
        this.totalCount.set(result.total);
      }
    } catch (err: any) {
      console.error('Error loading ads:', err);
      this.error.set('Error al cargar los anuncios');
    } finally {
      this.loading.set(false);
    }
  }

  setLocation(location: 'landing' | 'app'): void {
    this.activeLocation.set(location);
    this.activeTab.set('ptc');
    this.currentPage.set(1);
    this.searchQuery.set('');
    this.selectedStatus.set('all');
    this.loadData();
  }

  setTab(tab: 'ptc' | 'banner'): void {
    this.activeTab.set(tab);
    this.currentPage.set(1);
    this.searchQuery.set('');
    this.selectedStatus.set('all');
    this.loadData();
  }

  onSearch(query: string): void {
    this.searchQuery.set(query);
    this.currentPage.set(1);
    this.loadData();
  }

  onStatusChange(status: string): void {
    this.selectedStatus.set(status);
    this.currentPage.set(1);
    this.loadData();
  }

  onPositionChange(position: string): void {
    this.selectedPosition.set(position);
    this.currentPage.set(1);
    this.loadData();
  }

  // Modal actions
  openCreatePtcModal(): void {
    this.modalMode.set('create-ptc');
    this.selectedPtc.set(null);
    this.ptcFormData.set({
      title: '',
      description: '',
      url: '',
      image_url: '',
      reward: 50,
      duration: 15,
      daily_limit: 1000
    });
    this.showModal.set(true);
  }

  openEditPtcModal(ptc: PtcTaskAdmin): void {
    this.modalMode.set('edit-ptc');
    this.selectedPtc.set(ptc);
    this.ptcFormData.set({
      title: ptc.title,
      description: ptc.description,
      url: ptc.url,
      image_url: ptc.image_url || '',
      reward: ptc.reward,
      duration: ptc.duration,
      daily_limit: ptc.daily_limit
    });
    this.showModal.set(true);
  }

  openCreateBannerModal(): void {
    this.modalMode.set('create-banner');
    this.selectedBanner.set(null);
    this.bannerFormData.set({
      name: '',
      description: '',
      image_url: '',
      url: '',
      position: 'sidebar',
      impressions_limit: 10000,
      clicks_limit: 1000,
      reward: 0,
      location: this.activeLocation()
    });
    this.showModal.set(true);
  }

  openEditBannerModal(banner: BannerAd): void {
    this.modalMode.set('edit-banner');
    this.selectedBanner.set(banner);
    this.bannerFormData.set({
      name: banner.name,
      description: banner.description || '',
      image_url: banner.image_url,
      url: banner.url,
      position: banner.position,
      impressions_limit: banner.impressions_limit,
      clicks_limit: banner.clicks_limit,
      reward: banner.reward,
      location: banner.location || 'app'
    });
    this.showModal.set(true);
  }

  closeModal(): void {
    this.showModal.set(false);
    this.selectedPtc.set(null);
    this.selectedBanner.set(null);
  }

  // PTC CRUD
  async savePtc(): Promise<void> {
    this.saving.set(true);
    try {
      if (this.modalMode() === 'create-ptc') {
        await this.ptcService.createPtcTask(this.ptcFormData() as CreatePtcTaskData);
      } else {
        const ptc = this.selectedPtc();
        if (ptc) {
          await this.ptcService.updatePtcTask(ptc.id, this.ptcFormData() as Partial<CreatePtcTaskData>);
        }
      }
      await this.loadData();
      this.closeModal();
    } catch (err: any) {
      console.error('Error saving PTC:', err);
      this.error.set(err.message || 'Error al guardar el anuncio');
    } finally {
      this.saving.set(false);
    }
  }

  async togglePtcStatus(ptc: PtcTaskAdmin): Promise<void> {
    const newStatus = ptc.status === 'active' ? 'paused' : 'active';
    await this.ptcService.setPtcTaskStatus(ptc.id, newStatus);
    await this.loadData();
  }

  async deletePtc(ptc: PtcTaskAdmin): Promise<void> {
    if (!confirm(`¿Estás seguro de eliminar "${ptc.title}"?`)) return;
    await this.ptcService.deletePtcTask(ptc.id);
    await this.loadData();
  }

  // Banner CRUD
  async saveBanner(): Promise<void> {
    this.saving.set(true);
    try {
      if (this.modalMode() === 'create-banner') {
        await this.bannerService.createBannerAd(this.bannerFormData() as CreateBannerAdData);
      } else {
        const banner = this.selectedBanner();
        if (banner) {
          await this.bannerService.updateBannerAd(banner.id, this.bannerFormData() as Partial<CreateBannerAdData>);
        }
      }
      await this.loadData();
      this.closeModal();
    } catch (err: any) {
      console.error('Error saving banner:', err);
      this.error.set(err.message || 'Error al guardar el banner');
    } finally {
      this.saving.set(false);
    }
  }

  async toggleBannerStatus(banner: BannerAd): Promise<void> {
    const newStatus = banner.status === 'active' ? 'paused' : 'active';
    await this.bannerService.setBannerStatus(banner.id, newStatus);
    await this.loadData();
  }

  async deleteBanner(banner: BannerAd): Promise<void> {
    if (!confirm(`¿Estás seguro de eliminar "${banner.name}"?`)) return;
    await this.bannerService.deleteBanner(banner.id);
    await this.loadData();
  }

  // Pagination
  goToPage(page: number): void {
    if (page >= 1 && page <= this.totalPages()) {
      this.currentPage.set(page);
      this.loadData();
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

  getStatusClass(status: string): string {
    const classes: Record<string, string> = {
      active: 'bg-emerald-500/10 text-emerald-500',
      paused: 'bg-amber-500/10 text-amber-500',
      completed: 'bg-blue-500/10 text-blue-500',
      rejected: 'bg-rose-500/10 text-rose-500'
    };
    return classes[status] || 'bg-slate-500/10 text-slate-500';
  }

  getPositionLabel(position: BannerPosition): string {
    const labels: Record<BannerPosition, string> = {
      header: 'Encabezado',
      sidebar: 'Sidebar',
      footer: 'Pie',
      interstitial: 'Intersticial'
    };
    return labels[position] || position;
  }
}
