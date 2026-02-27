import { Component, inject, signal, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AdminBannerService } from '../../../../core/services/admin-banner.service';
import { ProfileService } from '../../../../core/services/profile.service';
import type { BannerAd, CreateBannerAdData } from '../../../../core/models/admin.model';

interface BannerFormData {
  name: string;
  description: string;
  image_url: string;
  url: string;
}

const EMPTY_FORM: BannerFormData = {
  name: '',
  description: '',
  image_url: '',
  url: ''
};

const MAX_AUTH_BANNERS = 4;

@Component({
  selector: 'app-admin-auth-banners',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './auth-banners.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AdminAuthBannersComponent implements OnInit {
  private readonly bannerService = inject(AdminBannerService);
  private readonly profileService = inject(ProfileService);

  readonly banners = signal<BannerAd[]>([]);
  readonly loading = signal<boolean>(true);
  readonly saving = signal<boolean>(false);
  readonly deleting = signal<string | null>(null);
  readonly successMessage = signal<string | null>(null);
  readonly errorMessage = signal<string | null>(null);

  readonly showModal = signal<boolean>(false);
  readonly modalMode = signal<'create' | 'edit'>('create');
  readonly selectedBanner = signal<BannerAd | null>(null);
  readonly formData = signal<BannerFormData>({ ...EMPTY_FORM });

  readonly maxBanners = MAX_AUTH_BANNERS;
  readonly profile = this.profileService.profile;

  ngOnInit(): void {
    this.profileService.getCurrentProfile();
    this.loadBanners();
  }

  async loadBanners(): Promise<void> {
    this.loading.set(true);
    try {
      const result = await this.bannerService.getActiveBannersByLocation('interstitial');
      this.banners.set(result);
    } catch (err: any) {
      // Failed to load auth banners
      this.showError('Error al cargar los banners de autenticación');
    } finally {
      this.loading.set(false);
    }
  }

  openCreateModal(): void {
    this.modalMode.set('create');
    this.selectedBanner.set(null);
    this.formData.set({ ...EMPTY_FORM });
    this.showModal.set(true);
  }

  openEditModal(banner: BannerAd): void {
    this.modalMode.set('edit');
    this.selectedBanner.set(banner);
    this.formData.set({
      name: banner.name,
      description: banner.description || '',
      image_url: banner.image_url || '',
      url: banner.url
    });
    this.showModal.set(true);
  }

  closeModal(): void {
    this.showModal.set(false);
    this.selectedBanner.set(null);
    this.formData.set({ ...EMPTY_FORM });
  }

  updateField<K extends keyof BannerFormData>(field: K, value: string): void {
    this.formData.update(d => ({ ...d, [field]: value }));
  }

  async saveBanner(): Promise<void> {
    const data = this.formData();
    if (!data.name.trim() || !data.url.trim()) {
      this.showError('El nombre y la URL son obligatorios');
      return;
    }

    this.saving.set(true);
    try {
      if (this.modalMode() === 'create') {
        const adminId = this.profile()?.id;
        const payload: CreateBannerAdData = {
          name: data.name.trim(),
          description: data.description.trim(),
          image_url: data.image_url.trim(),
          url: data.url.trim(),
          position: 'interstitial',
          location: 'landing',
          impressions_limit: 100000,
          clicks_limit: 100000,
          reward: 0,
          advertiser_id: adminId
        };
        const result = await this.bannerService.createBannerAd(payload);
        if (!result) throw new Error('No se pudo crear el banner');
        this.showSuccess('Banner creado correctamente');
      } else {
        const banner = this.selectedBanner();
        if (!banner) return;
        const success = await this.bannerService.updateBannerAd(banner.id, {
          name: data.name.trim(),
          description: data.description.trim(),
          image_url: data.image_url.trim(),
          url: data.url.trim()
        });
        if (!success) throw new Error('No se pudo actualizar el banner');
        this.showSuccess('Banner actualizado correctamente');
      }
      await this.loadBanners();
      this.closeModal();
    } catch (err: any) {
      // Failed to save banner
      this.showError(err.message || 'Error al guardar el banner');
    } finally {
      this.saving.set(false);
    }
  }

  async toggleStatus(banner: BannerAd): Promise<void> {
    try {
      const newStatus = banner.status === 'active' ? 'paused' : 'active';
      await this.bannerService.setBannerStatus(banner.id, newStatus);
      this.showSuccess(
        newStatus === 'active' ? 'Banner activado' : 'Banner pausado'
      );
      await this.loadBanners();
    } catch (err: any) {
      // Failed to toggle banner status
      this.showError('Error al cambiar el estado del banner');
    }
  }

  async deleteBanner(banner: BannerAd): Promise<void> {
    if (!confirm(`¿Estás seguro de eliminar el banner "${banner.name}"?`)) return;
    this.deleting.set(banner.id);
    try {
      const success = await this.bannerService.deleteBanner(banner.id);
      if (!success) throw new Error('No se pudo eliminar el banner');
      this.showSuccess('Banner eliminado correctamente');
      await this.loadBanners();
    } catch (err: any) {
      // Failed to delete banner
      this.showError(err.message || 'Error al eliminar el banner');
    } finally {
      this.deleting.set(null);
    }
  }

  canAddMore(): boolean {
    return this.banners().length < MAX_AUTH_BANNERS;
  }

  getStatusLabel(status: string): string {
    const map: Record<string, string> = {
      active: 'Activo',
      paused: 'Pausado',
      completed: 'Completado',
      rejected: 'Rechazado',
      pending: 'Pendiente'
    };
    return map[status] || status;
  }

  getStatusClass(status: string): string {
    const map: Record<string, string> = {
      active: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20',
      paused: 'bg-amber-500/10 text-amber-400 border border-amber-500/20',
      completed: 'bg-blue-500/10 text-blue-400 border border-blue-500/20',
      rejected: 'bg-rose-500/10 text-rose-400 border border-rose-500/20',
      pending: 'bg-slate-500/10 text-slate-400 border border-slate-500/20'
    };
    return map[status] || 'bg-slate-500/10 text-slate-400';
  }

  private showSuccess(message: string): void {
    this.successMessage.set(message);
    this.errorMessage.set(null);
    setTimeout(() => this.successMessage.set(null), 4000);
  }

  private showError(message: string): void {
    this.errorMessage.set(message);
    this.successMessage.set(null);
    setTimeout(() => this.errorMessage.set(null), 5000);
  }

  trackById(_index: number, banner: BannerAd): string {
    return banner.id;
  }
}
