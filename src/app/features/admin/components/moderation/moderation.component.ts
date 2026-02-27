import { Component, inject, signal, OnInit, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AdminPtcTaskService } from '../../../../core/services/admin-ptc-task.service';
import { AdminBannerService } from '../../../../core/services/admin-banner.service';
import type { PtcTaskAdmin, BannerAd } from '../../../../core/models/admin.model';
import type { TaskStatus, BannerStatus, PtcAdType } from '../../../../core/models/admin.model';

type AdType = 'ptc' | 'banner';

interface ModerationItem {
  id: string;
  type: AdType;
  title: string;
  description: string;
  url: string;
  imageUrl: string;
  reward: number;
  advertiserId: string;
  advertiserUsername: string;
  status: string;
  adType?: string;
  createdAt: string;
}

@Component({
  selector: 'app-admin-moderation',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './moderation.component.html',
  styleUrl: './moderation.component.scss'
})
export class AdminModerationComponent implements OnInit {
  private readonly ptcService = inject(AdminPtcTaskService);
  private readonly bannerService = inject(AdminBannerService);

  // Estado
  readonly loading = signal<boolean>(true);
  readonly error = signal<string | null>(null);
  readonly activeTab = signal<'pending' | 'rejected' | 'all'>('pending');
  readonly items = signal<ModerationItem[]>([]);
  readonly selectedItem = signal<ModerationItem | null>(null);
  readonly processingAction = signal<boolean>(false);

  // Filtros
  readonly searchQuery = signal<string>('');

  // Computed
  readonly pendingCount = computed(() => 
    this.items().filter(i => i.status === 'pending').length
  );

  readonly rejectedCount = computed(() => 
    this.items().filter(i => i.status === 'rejected').length
  );

  // Formato de moneda
  readonly currencyFormatter = new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  });

  // Formato de fecha
  readonly dateFormatter = new Intl.DateTimeFormat('es-CO', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  ngOnInit(): void {
    this.loadPendingItems();
  }

  async loadPendingItems(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    try {
      const statusFilter = this.activeTab() === 'all' ? undefined : this.activeTab() as TaskStatus;
      const bannerStatusFilter = this.activeTab() === 'all' ? undefined : this.activeTab() as BannerStatus;

      const [ptcResult, bannerResult] = await Promise.all([
        this.ptcService.getPtcTasks({ status: statusFilter }, { page: 1, pageSize: 50 }),
        this.bannerService.getBannerAds({ status: bannerStatusFilter }, { page: 1, pageSize: 50 })
      ]);

      const ptcItems: ModerationItem[] = (ptcResult.data || []).map((ptc: PtcTaskAdmin) => ({
        id: ptc.id,
        type: 'ptc' as AdType,
        title: ptc.title,
        description: ptc.description,
        url: ptc.url,
        imageUrl: ptc.image_url || '',
        reward: ptc.reward,
        advertiserId: ptc.advertiser_id,
        advertiserUsername: ptc.advertiser_username || 'Anónimo',
        status: ptc.status,
        adType: ptc.ad_type,
        createdAt: ptc.created_at
      }));

      const bannerItems: ModerationItem[] = (bannerResult.data || []).map((banner: BannerAd) => ({
        id: banner.id,
        type: 'banner' as AdType,
        title: banner.name,
        description: banner.description || '',
        url: banner.url,
        imageUrl: banner.image_url || '',
        reward: banner.reward || 0,
        advertiserId: banner.advertiser_id,
        advertiserUsername: banner.advertiser_username || 'Anónimo',
        status: banner.status,
        adType: banner.position,
        createdAt: banner.created_at
      }));

      // Filtrar por búsqueda
      let allItems = [...ptcItems, ...bannerItems];
      const search = this.searchQuery().toLowerCase();
      if (search) {
        allItems = allItems.filter(item => 
          item.title.toLowerCase().includes(search) ||
          item.advertiserUsername.toLowerCase().includes(search)
        );
      }

      this.items.set(allItems);
    } catch (err: unknown) {
      // Failed to load moderation items
      this.error.set('Error al cargar los elementos para moderación');
    } finally {
      this.loading.set(false);
    }
  }

  setActiveTab(tab: 'pending' | 'rejected' | 'all'): void {
    this.activeTab.set(tab);
    this.loadPendingItems();
  }

  selectItem(item: ModerationItem): void {
    this.selectedItem.set(item);
  }

  closeModal(): void {
    this.selectedItem.set(null);
  }

  async approveItem(item: ModerationItem): Promise<void> {
    this.processingAction.set(true);

    try {
      let success = false;
      if (item.type === 'ptc') {
        success = await this.ptcService.activatePtcTask(item.id);
      } else {
        success = await this.bannerService.activateBanner(item.id);
      }

      if (success) {
        // Actualizar la lista
        await this.loadPendingItems();
        this.closeModal();
      } else {
        this.error.set('Error al aprobar el anuncio');
      }
    } catch (err: unknown) {
      // Failed to approve item
      this.error.set('Error al aprobar el anuncio');
    } finally {
      this.processingAction.set(false);
    }
  }

  async rejectItem(item: ModerationItem): Promise<void> {
    this.processingAction.set(true);

    try {
      let success = false;
      if (item.type === 'ptc') {
        success = await this.ptcService.rejectPtcTask(item.id);
      } else {
        success = await this.bannerService.rejectBanner(item.id);
      }

      if (success) {
        // Actualizar la lista
        await this.loadPendingItems();
        this.closeModal();
      } else {
        this.error.set('Error al rechazar el anuncio');
      }
    } catch (err: unknown) {
      // Failed to reject item
      this.error.set('Error al rechazar el anuncio');
    } finally {
      this.processingAction.set(false);
    }
  }

  async deleteItem(item: ModerationItem): Promise<void> {
    if (!confirm('¿Estás seguro de eliminar este anuncio? Esta acción no se puede deshacer.')) {
      return;
    }

    this.processingAction.set(true);

    try {
      let success = false;
      if (item.type === 'ptc') {
        success = await this.ptcService.deletePtcTask(item.id);
      } else {
        success = await this.bannerService.deleteBanner(item.id);
      }

      if (success) {
        await this.loadPendingItems();
        this.closeModal();
      } else {
        this.error.set('Error al eliminar el anuncio');
      }
    } catch (err: unknown) {
      // Failed to delete item
      this.error.set('Error al eliminar el anuncio');
    } finally {
      this.processingAction.set(false);
    }
  }

  getStatusClass(status: string): string {
    const classes: Record<string, string> = {
      pending: 'bg-yellow-100 text-yellow-800 border-yellow-200',
      active: 'bg-green-100 text-green-800 border-green-200',
      paused: 'bg-gray-100 text-gray-800 border-gray-200',
      completed: 'bg-blue-100 text-blue-800 border-blue-200',
      rejected: 'bg-red-100 text-red-800 border-red-200'
    };
    return classes[status] || 'bg-gray-100 text-gray-800';
  }

  getStatusLabel(status: string): string {
    const labels: Record<string, string> = {
      pending: 'Pendiente',
      active: 'Activo',
      paused: 'Pausado',
      completed: 'Completado',
      rejected: 'Rechazado'
    };
    return labels[status] || status;
  }

  getAdTypeLabel(adType: string | undefined): string {
    if (!adType) return 'Estándar';
    const labels: Record<string, string> = {
      mega: 'Mega Anuncio',
      standard_400: 'Anuncio 400',
      standard_600: 'Anuncio 600',
      mini: 'Mini Anuncio',
      sidebar: 'Banner Lateral',
      header: 'Banner Encabezado',
      footer: 'Banner Pie'
    };
    return labels[adType] || adType;
  }

  formatDate(dateString: string): string {
    return this.dateFormatter.format(new Date(dateString));
  }
}
