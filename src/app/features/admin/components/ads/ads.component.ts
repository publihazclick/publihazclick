import { Component, inject, signal, OnInit, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AdminPtcTaskService } from '../../../../core/services/admin-ptc-task.service';
import { AdminBannerService } from '../../../../core/services/admin-banner.service';
import { StorageService } from '../../../../core/services/storage.service';
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
  AdLocation,
  PtcAdType,
} from '../../../../core/models/admin.model';

interface LocationOption {
  value: AdLocation;
  label: string;
  icon: string;
}

@Component({
  selector: 'app-admin-ads',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './ads.component.html',
  styleUrl: './ads.component.scss',
})
export class AdminAdsComponent implements OnInit {
  private readonly ptcService = inject(AdminPtcTaskService);
  private readonly bannerService = inject(AdminBannerService);
  private readonly storageService = inject(StorageService);

  readonly Math = Math;

  // Estado principal
  readonly activeTab = signal<'ptc' | 'banner'>('ptc');
  readonly activeLocation = signal<AdLocation>('app');
  readonly ptcAds = signal<PtcTaskAdmin[]>([]);
  readonly bannerAds = signal<BannerAd[]>([]);
  readonly loading = signal<boolean>(true);
  readonly error = signal<string | null>(null);
  readonly successMessage = signal<string | null>(null);

  // Upload
  readonly uploadingPtc = signal<boolean>(false);
  readonly uploadingBanner = signal<boolean>(false);

  // Filtros
  readonly searchQuery = signal<string>('');
  readonly selectedStatus = signal<string>('all');
  readonly selectedPosition = signal<string>('all');

  // Paginación
  readonly currentPage = signal<number>(1);
  readonly pageSize = signal<number>(20);
  readonly totalCount = signal<number>(0);

  // Modal crear/editar
  readonly showModal = signal<boolean>(false);
  readonly modalMode = signal<'create-ptc' | 'edit-ptc' | 'create-banner' | 'edit-banner'>(
    'create-ptc'
  );
  readonly selectedPtc = signal<PtcTaskAdmin | null>(null);
  readonly selectedBanner = signal<BannerAd | null>(null);
  readonly saving = signal<boolean>(false);
  readonly modalError = signal<string | null>(null);

  // Modal eliminar
  readonly showDeleteConfirm = signal<boolean>(false);
  readonly itemToDelete = signal<{ id: string; title: string; type: 'ptc' | 'banner' } | null>(
    null
  );

  // Formularios
  ptcFormDataValue: Partial<CreatePtcTaskData> = {
    title: '',
    description: '',
    url: '',
    youtube_url: '',
    image_url: '',
    reward: 2000,
    duration: 60,
    daily_limit: 0,
    location: 'app',
    ad_type: 'mega',
  };
  get ptcFormData() {
    return this.ptcFormDataValue;
  }
  set ptcFormData(v: Partial<CreatePtcTaskData>) {
    this.ptcFormDataValue = v;
  }

  bannerFormDataValue: Partial<CreateBannerAdData> = {
    name: '',
    description: '',
    image_url: '',
    url: '',
    position: 'sidebar',
    impressions_limit: 0,
    clicks_limit: 0,
    reward: 0,
    location: 'app',
  };
  get bannerFormData() {
    return this.bannerFormDataValue;
  }
  set bannerFormData(v: Partial<CreateBannerAdData>) {
    this.bannerFormDataValue = v;
  }

  // Opciones de tipo de anuncio
  readonly adTypeOptions: { value: PtcAdType; label: string; reward: number; duration: number }[] =
    [
      { value: 'mega', label: 'Mega Anuncio', reward: 2000, duration: 60 },
      { value: 'standard_600', label: 'Standard 600', reward: 600, duration: 60 },
      { value: 'standard_400', label: 'Standard 400', reward: 400, duration: 60 },
      { value: 'mini', label: 'Mini Anuncio', reward: 83.33, duration: 60 },
    ];

  readonly ptcStatuses: { value: TaskStatus | 'all'; label: string }[] = [
    { value: 'all', label: 'Todos' },
    { value: 'active', label: 'Activos' },
    { value: 'pending', label: 'Pendientes' },
    { value: 'paused', label: 'Pausados' },
    { value: 'completed', label: 'Completados' },
    { value: 'rejected', label: 'Rechazados' },
  ];

  readonly bannerStatuses: { value: BannerStatus | 'all'; label: string }[] = [
    { value: 'all', label: 'Todos' },
    { value: 'active', label: 'Activos' },
    { value: 'pending', label: 'Pendientes' },
    { value: 'paused', label: 'Pausados' },
    { value: 'completed', label: 'Completados' },
    { value: 'rejected', label: 'Rechazados' },
  ];

  readonly bannerPositions: { value: BannerPosition; label: string }[] = [
    { value: 'header', label: 'Encabezado' },
    { value: 'sidebar', label: 'Barra lateral' },
    { value: 'footer', label: 'Pie de página' },
    { value: 'interstitial', label: 'Intersticial' },
  ];

  readonly locations: LocationOption[] = [
    { value: 'landing', label: 'Landing (Público)', icon: 'public' },
    { value: 'app', label: 'App (Después del login)', icon: 'lock' },
  ];

  readonly currencyFormatter = new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });

  readonly totalPages = () => Math.ceil(this.totalCount() / this.pageSize());

  readonly pendingCount = computed(() => {
    if (this.activeTab() === 'ptc') {
      return this.ptcAds().filter((a) => a.status === 'pending').length;
    }
    return this.bannerAds().filter((a) => a.status === 'pending').length;
  });

  ngOnInit(): void {
    this.loadData();
  }

  async loadData(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      if (this.activeTab() === 'ptc') {
        const filters: PtcTaskFilters = {};
        if (this.selectedStatus() !== 'all') filters.status = this.selectedStatus() as TaskStatus;
        if (this.searchQuery()) filters.search = this.searchQuery();
        if (this.activeLocation()) filters.location = this.activeLocation();

        const result = await this.ptcService.getPtcTasks(filters, {
          page: this.currentPage(),
          pageSize: this.pageSize(),
        });
        this.ptcAds.set(result.data);
        this.totalCount.set(result.total);
      } else {
        const filters: BannerAdFilters = {};
        if (this.selectedStatus() !== 'all') filters.status = this.selectedStatus() as BannerStatus;
        if (this.selectedPosition() !== 'all')
          filters.position = this.selectedPosition() as BannerPosition;
        if (this.searchQuery()) filters.search = this.searchQuery();
        if (this.activeLocation()) filters.location = this.activeLocation();

        const result = await this.bannerService.getBannerAds(filters, {
          page: this.currentPage(),
          pageSize: this.pageSize(),
        });
        this.bannerAds.set(result.data);
        this.totalCount.set(result.total);
      }
    } catch {
      this.error.set('Error al cargar los anuncios');
    } finally {
      this.loading.set(false);
    }
  }

  setTab(tab: 'ptc' | 'banner'): void {
    this.activeTab.set(tab);
    this.currentPage.set(1);
    this.searchQuery.set('');
    this.selectedStatus.set('all');
    this.loadData();
  }

  setLocation(location: AdLocation): void {
    this.activeLocation.set(location);
    this.currentPage.set(1);
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

  onAdTypeChange(adType: PtcAdType): void {
    const option = this.adTypeOptions.find((o) => o.value === adType);
    if (option) {
      this.ptcFormData = {
        ...this.ptcFormData,
        ad_type: adType,
        reward: option.reward,
        duration: option.duration,
      };
    }
  }

  // ── Modal crear/editar ──────────────────────────────────────────────────────

  openCreatePtcModal(): void {
    this.modalMode.set('create-ptc');
    this.selectedPtc.set(null);
    this.modalError.set(null);
    this.ptcFormData = {
      title: '',
      description: '',
      url: '',
      youtube_url: '',
      image_url: '',
      reward: 2000,
      duration: 60,
      daily_limit: 0,
      location: this.activeLocation(),
      ad_type: 'mega',
    };
    this.showModal.set(true);
  }

  openEditPtcModal(ptc: PtcTaskAdmin): void {
    this.modalMode.set('edit-ptc');
    this.selectedPtc.set(ptc);
    this.modalError.set(null);
    this.ptcFormData = {
      title: ptc.title,
      description: ptc.description,
      url: ptc.url,
      youtube_url: ptc.youtube_url || '',
      image_url: ptc.image_url || '',
      reward: ptc.reward,
      duration: ptc.duration,
      daily_limit: ptc.daily_limit,
      location: ptc.location || 'app',
      ad_type: ptc.ad_type || 'mini',
    };
    this.showModal.set(true);
  }

  openCreateBannerModal(): void {
    this.modalMode.set('create-banner');
    this.selectedBanner.set(null);
    this.modalError.set(null);
    this.bannerFormData = {
      name: '',
      description: '',
      image_url: '',
      url: '',
      position: 'sidebar',
      impressions_limit: 0,
      clicks_limit: 0,
      reward: 0,
      location: this.activeLocation(),
    };
    this.showModal.set(true);
  }

  openEditBannerModal(banner: BannerAd): void {
    this.modalMode.set('edit-banner');
    this.selectedBanner.set(banner);
    this.modalError.set(null);
    this.bannerFormData = {
      name: banner.name,
      description: banner.description || '',
      image_url: banner.image_url,
      url: banner.url,
      position: banner.position,
      impressions_limit: banner.impressions_limit,
      clicks_limit: banner.clicks_limit,
      reward: banner.reward,
      location: (banner as any).location || 'app',
    };
    this.showModal.set(true);
  }

  closeModal(): void {
    this.showModal.set(false);
    this.selectedPtc.set(null);
    this.selectedBanner.set(null);
    this.modalError.set(null);
  }

  // ── PTC CRUD ────────────────────────────────────────────────────────────────

  async savePtc(): Promise<void> {
    if (!this.ptcFormData.title || !this.ptcFormData.url) {
      this.modalError.set('El título y la URL son obligatorios');
      return;
    }
    this.saving.set(true);
    this.modalError.set(null);
    try {
      if (this.modalMode() === 'create-ptc') {
        await this.ptcService.createPtcTask(this.ptcFormData as CreatePtcTaskData);
        this.showToast('Anuncio PTC creado correctamente');
      } else {
        const ptc = this.selectedPtc();
        if (ptc) {
          await this.ptcService.updatePtcTask(ptc.id, this.ptcFormData as Partial<CreatePtcTaskData>);
          this.showToast('Anuncio PTC actualizado correctamente');
        }
      }
      await this.loadData();
      this.closeModal();
    } catch (err: any) {
      this.modalError.set(err.message || 'Error al guardar el anuncio');
    } finally {
      this.saving.set(false);
    }
  }

  async togglePtcStatus(ptc: PtcTaskAdmin): Promise<void> {
    const newStatus = ptc.status === 'active' ? 'paused' : 'active';
    await this.ptcService.setPtcTaskStatus(ptc.id, newStatus);
    this.showToast(newStatus === 'active' ? 'Anuncio activado' : 'Anuncio pausado');
    await this.loadData();
  }

  async approvePtc(ptc: PtcTaskAdmin): Promise<void> {
    await this.ptcService.activatePtcTask(ptc.id);
    this.showToast('Anuncio aprobado y activado');
    await this.loadData();
  }

  async rejectPtc(ptc: PtcTaskAdmin): Promise<void> {
    await this.ptcService.rejectPtcTask(ptc.id);
    this.showToast('Anuncio rechazado');
    await this.loadData();
  }

  openDeletePtcConfirm(ptc: PtcTaskAdmin): void {
    this.itemToDelete.set({ id: ptc.id, title: ptc.title, type: 'ptc' });
    this.showDeleteConfirm.set(true);
  }

  // ── Banner CRUD ─────────────────────────────────────────────────────────────

  async saveBanner(): Promise<void> {
    if (!this.bannerFormData.name || !this.bannerFormData.url) {
      this.modalError.set('El nombre y la URL son obligatorios');
      return;
    }
    this.saving.set(true);
    this.modalError.set(null);
    try {
      if (this.modalMode() === 'create-banner') {
        await this.bannerService.createBannerAd(this.bannerFormData as CreateBannerAdData);
        this.showToast('Banner creado correctamente');
      } else {
        const banner = this.selectedBanner();
        if (banner) {
          await this.bannerService.updateBannerAd(
            banner.id,
            this.bannerFormData as Partial<CreateBannerAdData>
          );
          this.showToast('Banner actualizado correctamente');
        }
      }
      await this.loadData();
      this.closeModal();
    } catch (err: any) {
      this.modalError.set(err.message || 'Error al guardar el banner');
    } finally {
      this.saving.set(false);
    }
  }

  async toggleBannerStatus(banner: BannerAd): Promise<void> {
    const newStatus = banner.status === 'active' ? 'paused' : 'active';
    await this.bannerService.setBannerStatus(banner.id, newStatus);
    this.showToast(newStatus === 'active' ? 'Banner activado' : 'Banner pausado');
    await this.loadData();
  }

  async approveBanner(banner: BannerAd): Promise<void> {
    await this.bannerService.activateBanner(banner.id);
    this.showToast('Banner aprobado y activado');
    await this.loadData();
  }

  async rejectBanner(banner: BannerAd): Promise<void> {
    await this.bannerService.rejectBanner(banner.id);
    this.showToast('Banner rechazado');
    await this.loadData();
  }

  openDeleteBannerConfirm(banner: BannerAd): void {
    this.itemToDelete.set({ id: banner.id, title: banner.name, type: 'banner' });
    this.showDeleteConfirm.set(true);
  }

  // ── Eliminar confirmación ───────────────────────────────────────────────────

  async confirmDelete(): Promise<void> {
    const item = this.itemToDelete();
    if (!item) return;
    this.saving.set(true);
    try {
      if (item.type === 'ptc') {
        await this.ptcService.deletePtcTask(item.id);
      } else {
        await this.bannerService.deleteBanner(item.id);
      }
      this.showToast('Eliminado correctamente');
      await this.loadData();
      this.closeDeleteConfirm();
    } catch {
      this.error.set('Error al eliminar');
    } finally {
      this.saving.set(false);
    }
  }

  closeDeleteConfirm(): void {
    this.showDeleteConfirm.set(false);
    this.itemToDelete.set(null);
  }

  // ── Uploads de imágenes ─────────────────────────────────────────────────────

  async onPtcImageSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    if (!input.files?.length) return;
    const file = input.files[0];

    if (!this.storageService.isValidImage(file)) {
      this.modalError.set('Solo se permiten imágenes JPEG, PNG, GIF, WebP o SVG.');
      return;
    }
    if (!this.storageService.isValidSize(file, 5)) {
      this.modalError.set('El archivo es muy grande. Máximo 5MB.');
      return;
    }

    this.uploadingPtc.set(true);
    this.modalError.set(null);
    const result = await this.storageService.uploadPtcAdImage(file);
    this.uploadingPtc.set(false);

    if (result.success && result.url) {
      this.ptcFormData = { ...this.ptcFormData, image_url: result.url };
    } else {
      this.modalError.set(result.error || 'Error al subir la imagen');
    }
    // Reset input
    input.value = '';
  }

  async onBannerImageSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    if (!input.files?.length) return;
    const file = input.files[0];

    if (!this.storageService.isValidImage(file)) {
      this.modalError.set('Solo se permiten imágenes JPEG, PNG, GIF, WebP o SVG.');
      return;
    }
    if (!this.storageService.isValidSize(file, 5)) {
      this.modalError.set('El archivo es muy grande. Máximo 5MB.');
      return;
    }

    this.uploadingBanner.set(true);
    this.modalError.set(null);
    const result = await this.storageService.uploadBannerImage(file);
    this.uploadingBanner.set(false);

    if (result.success && result.url) {
      this.bannerFormData = { ...this.bannerFormData, image_url: result.url };
    } else {
      this.modalError.set(result.error || 'Error al subir la imagen');
    }
    input.value = '';
  }

  // ── Paginación ──────────────────────────────────────────────────────────────

  prevPage(): void {
    if (this.currentPage() > 1) {
      this.currentPage.update((p) => p - 1);
      this.loadData();
    }
  }

  nextPage(): void {
    if (this.currentPage() < this.totalPages()) {
      this.currentPage.update((p) => p + 1);
      this.loadData();
    }
  }

  // ── Toast ───────────────────────────────────────────────────────────────────

  private toastTimeout: ReturnType<typeof setTimeout> | null = null;

  showToast(message: string): void {
    this.successMessage.set(message);
    if (this.toastTimeout) clearTimeout(this.toastTimeout);
    this.toastTimeout = setTimeout(() => this.successMessage.set(null), 3500);
  }

  // ── Formatting ──────────────────────────────────────────────────────────────

  formatCurrency(value: number): string {
    return this.currencyFormatter.format(value);
  }

  formatDate(dateString: string): string {
    return new Date(dateString).toLocaleDateString('es-CO', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  }

  getStatusClass(status: string): string {
    const classes: Record<string, string> = {
      active: 'bg-emerald-500/10 text-emerald-400',
      paused: 'bg-amber-500/10 text-amber-400',
      pending: 'bg-yellow-500/10 text-yellow-400',
      completed: 'bg-blue-500/10 text-blue-400',
      rejected: 'bg-rose-500/10 text-rose-400',
    };
    return classes[status] || 'bg-slate-500/10 text-slate-400';
  }

  getStatusLabel(status: string): string {
    const labels: Record<string, string> = {
      active: 'Activo',
      paused: 'Pausado',
      pending: 'Pendiente',
      completed: 'Completado',
      rejected: 'Rechazado',
    };
    return labels[status] || status;
  }

  getPositionLabel(position: BannerPosition): string {
    const labels: Record<BannerPosition, string> = {
      header: 'Encabezado',
      sidebar: 'Sidebar',
      footer: 'Pie',
      interstitial: 'Intersticial',
    };
    return labels[position] || position;
  }

  getAdTypeLabel(adType: string): string {
    const labels: Record<string, string> = {
      mega: 'Mega',
      standard_600: 'Std 600',
      standard_400: 'Std 400',
      mini: 'Mini',
    };
    return labels[adType] || adType;
  }
}
