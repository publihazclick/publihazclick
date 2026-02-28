import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AdminPtcTaskService } from '../../../../core/services/admin-ptc-task.service';
import { AdminBannerService } from '../../../../core/services/admin-banner.service';
import { StorageService } from '../../../../core/services/storage.service';
import { CurrencyService } from '../../../../core/services/currency.service';
import { UserTrackingService } from '../../../../core/services/user-tracking.service';
import { ProfileService } from '../../../../core/services/profile.service';
import { SupabaseSessionService } from '../../../../core/services/supabase-session.service';
import { AuthService } from '../../../../core/services/auth.service';
import { PtcModalComponent, PtcAd } from '../../../../components/ptc-modal/ptc-modal.component';
import type { PtcAdType } from '../../../../core/models/admin.model';

interface PtcAdCard {
  id: string;
  companyName: string;
  description: string;
  advertiserType: 'company' | 'person';
  imageUrl: string;
  videoUrl: string;
  destinationUrl: string;
  adType: PtcAdType;
  rewardCOP: number;
  dailyLimit: number;
  totalClicks: number;
  status: string;
}

@Component({
  selector: 'app-user-ads',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule, PtcModalComponent],
  templateUrl: './ads.component.html',
})
export class UserAdsComponent implements OnInit {
  private readonly ptcService = inject(AdminPtcTaskService);
  private readonly bannerService = inject(AdminBannerService);
  private readonly storageService = inject(StorageService);
  protected readonly currencyService = inject(CurrencyService);
  protected readonly userTracking = inject(UserTrackingService);
  private readonly profileService = inject(ProfileService);
  private readonly sessionService = inject(SupabaseSessionService);
  private readonly authService = inject(AuthService);

  readonly profile = this.profileService.profile;
  readonly isAdvertiser = signal(false);

  readonly ads = signal<PtcAdCard[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly successToast = signal<string | null>(null);

  // Ad view modal
  readonly isModalOpen = signal(false);
  readonly selectedAd = signal<PtcAd | null>(null);

  // Create PTC modal
  readonly showPtcModal = signal(false);
  readonly savingPtc = signal(false);
  readonly uploadingPtc = signal(false);
  readonly ptcModalError = signal<string | null>(null);
  ptcFormData = { title: '', description: '', url: '', youtube_url: '', image_url: '' };

  // Create Banner modal
  readonly showBannerModal = signal(false);
  readonly savingBanner = signal(false);
  readonly uploadingBanner = signal(false);
  readonly bannerModalError = signal<string | null>(null);
  bannerFormData = { name: '', description: '', url: '', image_url: '' };

  private readonly adTypeRewards: Record<string, number> = {
    mega: 2000,
    standard_600: 600,
    standard_400: 400,
    mini: 83.33,
  };

  async ngOnInit(): Promise<void> {
    const role = this.profile()?.role;
    this.isAdvertiser.set(role === 'advertiser' || role === 'admin' || role === 'dev');
    if (this.isAdvertiser()) {
      await this.loadAds();
    } else {
      this.loading.set(false);
    }
  }

  async loadAds(): Promise<void> {
    try {
      this.loading.set(true);
      this.error.set(null);
      const result = await this.ptcService.getPtcTasks(
        { status: 'active', location: 'app' },
        { page: 1, pageSize: 50 }
      );
      this.ads.set(
        (result.data || []).map(task => ({
          id: task.id,
          companyName: task.title,
          description: task.description || '',
          advertiserType: 'company' as const,
          imageUrl: task.image_url || '',
          videoUrl: task.youtube_url || '',
          destinationUrl: task.url || '',
          adType: task.ad_type || 'mini',
          rewardCOP: this.adTypeRewards[task.ad_type || 'mini'] ?? task.reward ?? 0,
          dailyLimit: task.daily_limit || 0,
          totalClicks: task.total_clicks || 0,
          status: task.status,
        }))
      );
    } catch {
      this.error.set('Error al cargar los anuncios');
    } finally {
      this.loading.set(false);
    }
  }

  getAdsByType(type: PtcAdType): PtcAdCard[] {
    return this.ads().filter(ad => ad.adType === type);
  }

  getRewardDisplay(rewardCOP: number): string {
    return this.currencyService.formatFromCOP(rewardCOP, 2);
  }

  isAdViewed(adId: string): boolean {
    return this.userTracking.hasViewedAd(adId);
  }

  truncate(text: string, max: number): string {
    if (!text) return '';
    return text.length > max ? text.substring(0, max) + '...' : text;
  }

  openAdModal(ad: PtcAdCard): void {
    if (this.userTracking.hasViewedAd(ad.id)) return;
    this.selectedAd.set({
      id: ad.id,
      title: ad.companyName,
      description: ad.description,
      advertiserName: ad.companyName,
      advertiserType: ad.advertiserType,
      imageUrl: ad.imageUrl,
      videoUrl: ad.videoUrl,
      destinationUrl: ad.destinationUrl,
      adType: ad.adType,
      rewardCOP: ad.rewardCOP,
      duration: ad.adType === 'mini' ? 30 : 60,
    });
    this.isModalOpen.set(true);
  }

  closeModal(): void {
    this.isModalOpen.set(false);
    this.selectedAd.set(null);
  }

  onRewardClaimed(event: { walletAmount: number; donationAmount: number; taskId: string }): void {
    this.userTracking.recordAdView(event.taskId);
    this.creditRewardToDb(event.taskId);
  }

  private async creditRewardToDb(taskId: string): Promise<void> {
    try {
      const user = this.authService.getCurrentUser();
      if (!user) {
        this.error.set('No se pudo acreditar: sesión no encontrada. Inicia sesión de nuevo.');
        return;
      }

      const data = await this.sessionService.callRpc<{ success: boolean; error?: string }>(
        'record_ptc_click',
        { p_user_id: user.id, p_task_id: taskId }
      );

      if (data && !data.success) {
        console.warn('RPC record_ptc_click rejected:', data.error);
        this.error.set(data.error || 'No se pudo acreditar la recompensa');
      }
    } catch (err: any) {
      console.error('creditRewardToDb error:', err);
      this.error.set(err.message || 'Error de conexión al acreditar recompensa');
    } finally {
      this.profileService.getCurrentProfile().catch(() => {});
    }
  }

  // ── Crear Anuncio PTC ────────────────────────────────────────────────────

  openPtcModal(): void {
    this.ptcFormData = { title: '', description: '', url: '', youtube_url: '', image_url: '' };
    this.ptcModalError.set(null);
    this.showPtcModal.set(true);
  }

  closePtcModal(): void {
    this.showPtcModal.set(false);
    this.ptcModalError.set(null);
  }

  async onPtcImageSelected(event: Event): Promise<void> {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.uploadingPtc.set(true);
    try {
      const result = await this.storageService.uploadImage('ptc-ads', file, 'user-ads');
      if (result.success && result.url) {
        this.ptcFormData = { ...this.ptcFormData, image_url: result.url };
      }
    } finally {
      this.uploadingPtc.set(false);
    }
  }

  async savePtcAd(): Promise<void> {
    if (!this.ptcFormData.title || !this.ptcFormData.url) {
      this.ptcModalError.set('El nombre y la URL de destino son obligatorios');
      return;
    }
    const userId = this.profile()?.id;
    if (!userId) return;

    this.savingPtc.set(true);
    this.ptcModalError.set(null);
    try {
      const result = await this.ptcService.createPtcTask({
        title: this.ptcFormData.title,
        description: this.ptcFormData.description,
        url: this.ptcFormData.url,
        youtube_url: this.ptcFormData.youtube_url || null,
        image_url: this.ptcFormData.image_url,
        reward: 400,
        duration: 60,
        daily_limit: 9,
        ad_type: 'standard_400',
        location: 'app',
        advertiser_id: userId,
        is_demo_only: false,
        total_clicks: 0,
      } as any);
      if (!result) throw new Error('No se pudo crear el anuncio');
      this.closePtcModal();
      this.showToast('Anuncio enviado para revisión. El equipo lo activará pronto.');
    } catch (err: any) {
      this.ptcModalError.set(err.message || 'Error al crear el anuncio');
    } finally {
      this.savingPtc.set(false);
    }
  }

  // ── Crear Banner ─────────────────────────────────────────────────────────

  openBannerModal(): void {
    this.bannerFormData = { name: '', description: '', url: '', image_url: '' };
    this.bannerModalError.set(null);
    this.showBannerModal.set(true);
  }

  closeBannerModal(): void {
    this.showBannerModal.set(false);
    this.bannerModalError.set(null);
  }

  async onBannerImageSelected(event: Event): Promise<void> {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.uploadingBanner.set(true);
    try {
      const result = await this.storageService.uploadImage('banners', file, 'user-banners');
      if (result.success && result.url) {
        this.bannerFormData = { ...this.bannerFormData, image_url: result.url };
      }
    } finally {
      this.uploadingBanner.set(false);
    }
  }

  async saveBannerAd(): Promise<void> {
    if (!this.bannerFormData.name || !this.bannerFormData.url) {
      this.bannerModalError.set('El nombre y la URL de destino son obligatorios');
      return;
    }
    const userId = this.profile()?.id;
    if (!userId) return;

    this.savingBanner.set(true);
    this.bannerModalError.set(null);
    try {
      const result = await this.bannerService.createBannerAd({
        name: this.bannerFormData.name,
        description: this.bannerFormData.description,
        url: this.bannerFormData.url,
        image_url: this.bannerFormData.image_url,
        position: 'middle',
        reward: 0,
        location: 'app',
        advertiser_id: userId,
      } as any);
      if (!result) throw new Error('No se pudo crear el banner');
      this.closeBannerModal();
      this.showToast('Banner enviado para revisión. El equipo lo activará pronto.');
    } catch (err: any) {
      this.bannerModalError.set(err.message || 'Error al crear el banner');
    } finally {
      this.savingBanner.set(false);
    }
  }

  private showToast(msg: string): void {
    this.successToast.set(msg);
    setTimeout(() => this.successToast.set(null), 5000);
  }
}
