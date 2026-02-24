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
  title: string;
  advertiserName: string;
  advertiserType: 'company' | 'person';
  imageUrl: string;
  youtubeVideoId: string;
  destinationUrl: string;
  adType: PtcAdType;
  rewardCOP: number;
  dailyLimit: number;
  totalClicks: number;
  status: string;
}

function extractYoutubeId(url: string | null | undefined): string {
  if (!url) return '';
  const match = url.match(
    /(?:youtube\.com\/(?:[^/\n\s]+\/\S+\/|(?:v|e(?:mbed)?)\/|\S*?[?&]v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})/
  );
  return match?.[1] ?? '';
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
            title: task.title,
            advertiserName: task.advertiser_username || 'Anunciante',
            advertiserType: 'company',
            imageUrl: task.image_url || '',
            youtubeVideoId: extractYoutubeId(task.youtube_url),
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

  openAdModal(ad: PtcAdCard): void {
    if (this.userTracking.hasViewedAd(ad.id)) return;
    const ptcAd: PtcAd = {
      id: ad.id,
      title: ad.title,
      advertiserName: ad.advertiserName,
      advertiserType: ad.advertiserType,
      imageUrl: ad.imageUrl,
      youtubeVideoId: ad.youtubeVideoId,
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
