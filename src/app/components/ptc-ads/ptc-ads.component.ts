import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { AdminPtcTaskService, SAMPLE_PTC_ADS } from '../../core/services/admin-ptc-task.service';
import { CurrencyService } from '../../core/services/currency.service';
import { UserTrackingService } from '../../core/services/user-tracking.service';
import { WalletStateService } from '../../core/services/wallet-state.service';
import { PtcModalComponent, PtcAd } from '../ptc-modal/ptc-modal.component';
import { PtcAdType, AdLocation } from '../../core/models/admin.model';


interface PtcAdCard {
  id: string;
  title: string;
  description: string;
  advertiserName: string;
  advertiserType: 'company' | 'person';
  imageUrl: string;
  videoUrl: string;
  destinationUrl?: string;
  adType: PtcAdType;
  rewardCOP: number;
  dailyLimit: number;
  totalClicks: number;
  status: string;
}

@Component({
  selector: 'app-ptc-ads',
  standalone: true,
  imports: [CommonModule, RouterModule, PtcModalComponent],
  templateUrl: './ptc-ads.component.html',
  styleUrl: './ptc-ads.component.scss'
})
export class PtcAdsComponent implements OnInit {
  private ptcService = inject(AdminPtcTaskService);
  protected currencyService = inject(CurrencyService);
  protected userTracking = inject(UserTrackingService);
  protected walletService = inject(WalletStateService);
  
  ads = signal<PtcAdCard[]>([]);
  loading = signal<boolean>(true);
  error = signal<string | null>(null);
  
  // Modal state
  isModalOpen = signal(false);
  selectedAd = signal<PtcAd | null>(null);
  
  // Estado de anuncios vistos
  viewedAds = signal<Set<string>>(new Set());

  // Categorías expandidas
  expandedCategories = signal<Set<string>>(new Set());

  isExpanded(type: string): boolean {
    return this.expandedCategories().has(type);
  }

  toggleExpanded(type: string): void {
    this.expandedCategories.update(set => {
      const next = new Set(set);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }

  getCardNgClass(index: number, type: string): Record<string, boolean> {
    if (this.isExpanded(type) || index < 2) return {};
    if (index < 4) return { hidden: true, 'md:block': true };
    return { hidden: true };
  }

  ngOnInit(): void {
    this.loadPtcAds();
  }

  async loadPtcAds(): Promise<void> {
    try {
      this.loading.set(true);
      this.error.set(null);

      // Solo cargar anuncios configurados para la landing
      const result = await this.ptcService.getPtcTasks(
        { status: 'active', location: 'landing' },
        { page: 1, pageSize: 100 }
      );

      if (result.data && result.data.length > 0) {
        const mappedAds: PtcAdCard[] = result.data.map(task => {
          // Usar el tipo de anuncio para obtener la recompensa correcta
          const adType = task.ad_type || 'mini';
          const rewardCOP = this.adTypeRewards[adType] || task.reward || 0;
          return {
            id: task.id,
            title: task.title,
            description: task.description || '',
            advertiserName: task.advertiser_username || task.title,
            advertiserType: 'company' as const,
            imageUrl: task.image_url || 'https://via.placeholder.com/300x200?text=Anuncio',
            videoUrl: task.youtube_url || '',
            destinationUrl: task.url || '',
            adType: adType,
            rewardCOP: rewardCOP,
            dailyLimit: task.daily_limit || 0,
            totalClicks: task.total_clicks || 0,
            status: task.status
          };
        });
        this.ads.set(mappedAds);
      } else {
        this.ads.set(this.getSampleAds());
      }
    } catch (err: any) {
      console.error('Error loading PTC ads:', err);
      this.ads.set(this.getSampleAds());
    } finally {
      this.loading.set(false);
    }
  }

  getSampleAds(): PtcAdCard[] {
    return SAMPLE_PTC_ADS as PtcAdCard[];
  }

  getAdTypeLabel(type: PtcAdType): string {
    const labels: Record<PtcAdType, string> = {
      'mega': 'Mega Anuncio',
      'standard_400': 'Anuncio 400',
      'standard_600': 'Anuncio 600',
      'mini': 'Mini Anuncio'
    };
    return labels[type] || type;
  }

  getAdTypeClass(type: PtcAdType): string {
    switch (type) {
      case 'mega':
        return 'bg-purple-500';
      case 'standard_400':
        return 'bg-blue-500';
      case 'standard_600':
        return 'bg-cyan-500';
      case 'mini':
        return 'bg-green-500';
      default:
        return 'bg-gray-500';
    }
  }

  // Valores de recompensa por tipo de anuncio
  private readonly adTypeRewards: Record<string, number> = {
    'mega': 2000,
    'standard_600': 600,
    'standard_400': 400,
    'mini': 83.33
  };

  getRewardDisplay(rewardCOP: number): string {
    // Convert COP to selected currency with decimals using the currency service
    return this.currencyService.formatFromCOP(rewardCOP, 2);
  }

  getAdsByType(type: PtcAdType): PtcAdCard[] {
    return this.ads().filter(ad => ad.adType === type);
  }

  // Modal methods
  openAdModal(ad: PtcAdCard): void {
    // Verificar si ya fue visto
    if (this.userTracking.hasViewedAd(ad.id)) {
      // No abrir el modal si ya fue visto
      return;
    }
    
    // Pass the full COP reward to the modal
    const ptcAd: PtcAd = {
      id: ad.id,
      title: ad.title,
      description: ad.description,
      advertiserName: ad.advertiserName,
      advertiserType: ad.advertiserType,
      imageUrl: ad.imageUrl,
      videoUrl: ad.videoUrl,
      destinationUrl: ad.destinationUrl || '',
      adType: ad.adType,
      rewardCOP: ad.rewardCOP,
      duration: ad.adType === 'mini' ? 30 : 60
    };
    this.selectedAd.set(ptcAd);
    this.isModalOpen.set(true);
  }

  closeModal(): void {
    this.isModalOpen.set(false);
    this.selectedAd.set(null);
  }

  // Verificar si un anuncio ya fue visto
  isAdViewed(adId: string): boolean {
    return this.userTracking.hasViewedAd(adId);
  }

  // Obtener todos los IDs de anuncios vistos
  getViewedAds(): Set<string> {
    const ads = this.ads();
    const viewed = new Set<string>();
    ads.forEach(ad => {
      if (this.userTracking.hasViewedAd(ad.id)) {
        viewed.add(ad.id);
      }
    });
    return viewed;
  }

  onRewardClaimed(event: { walletAmount: number; donationAmount: number }): void {
    // Usar el servicio de wallet para actualizar
    this.walletService.updateWallet(event.walletAmount);
    this.walletService.updateDonations(event.donationAmount);
    
    // Recargar los datos de sesión de anuncios
    this.userTracking.recordAdView(this.selectedAd()?.id || '');
    
    // Show success message (could add a toast here)
    console.log('Recompensa reclamada:', event);
  }
}
