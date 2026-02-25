import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AdminPtcTaskService } from '../../../../core/services/admin-ptc-task.service';
import { CurrencyService } from '../../../../core/services/currency.service';
import { UserTrackingService } from '../../../../core/services/user-tracking.service';
import { WalletStateService } from '../../../../core/services/wallet-state.service';
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
  imports: [CommonModule, PtcModalComponent],
  templateUrl: './ads.component.html',
})
export class UserAdsComponent implements OnInit {
  private ptcService = inject(AdminPtcTaskService);
  protected currencyService = inject(CurrencyService);
  protected userTracking = inject(UserTrackingService);
  protected walletService = inject(WalletStateService);

  ads = signal<PtcAdCard[]>([]);
  loading = signal<boolean>(true);
  error = signal<string | null>(null);

  isModalOpen = signal(false);
  selectedAd = signal<PtcAd | null>(null);

  private readonly adTypeRewards: Record<string, number> = {
    mega: 2000,
    standard_600: 600,
    standard_400: 400,
    mini: 83.33,
  };

  ngOnInit(): void {
    // Vaciar caché directamente en localStorage para evitar race conditions
    if (typeof window !== 'undefined') {
      localStorage.removeItem('user_session_data');
      localStorage.removeItem('ptc_wallet');
      localStorage.removeItem('ptc_donations');
    }
    this.userTracking.resetSession();
    this.walletService.reset();
    this.loadAds();
  }

  async loadAds(): Promise<void> {
    try {
      this.loading.set(true);
      this.error.set(null);

      const result = await this.ptcService.getPtcTasks(
        { status: 'active', location: 'app' },
        { page: 1, pageSize: 50 }
      );

      if (result.data && result.data.length > 0) {
        const mapped: PtcAdCard[] = result.data.map((task) => {
          const adType = task.ad_type || 'mini';
          return {
            id: task.id,
            companyName: task.title,
            description: task.description || '',
            advertiserType: 'company' as const,
            imageUrl: task.image_url || '',
            videoUrl: task.youtube_url || '',
            destinationUrl: task.url || '',
            adType,
            rewardCOP: this.adTypeRewards[adType] ?? task.reward ?? 0,
            dailyLimit: task.daily_limit || 0,
            totalClicks: task.total_clicks || 0,
            status: task.status,
          };
        });
        this.ads.set(mapped);
      } else {
        this.ads.set([]);
      }
    } catch {
      this.error.set('Error al cargar los anuncios');
    } finally {
      this.loading.set(false);
    }
  }

  getAdsByType(type: PtcAdType): PtcAdCard[] {
    return this.ads().filter((ad) => ad.adType === type);
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
    const ptcAd: PtcAd = {
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
      duration: 60,
    };
    this.selectedAd.set(ptcAd);
    this.isModalOpen.set(true);
  }

  closeModal(): void {
    this.isModalOpen.set(false);
    this.selectedAd.set(null);
  }

  onRewardClaimed(event: { walletAmount: number; donationAmount: number }): void {
    this.walletService.updateWallet(event.walletAmount);
    this.walletService.updateDonations(event.donationAmount);
    this.userTracking.recordAdView(this.selectedAd()?.id || '');
  }
}
