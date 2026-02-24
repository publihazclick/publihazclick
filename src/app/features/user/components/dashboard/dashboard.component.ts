import {
  Component,
  inject,
  signal,
  computed,
  OnInit,
  OnDestroy,
  ChangeDetectionStrategy,
  PendingTasks,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { AdminBannerService } from '../../../../core/services/admin-banner.service';
import { AdminPtcTaskService } from '../../../../core/services/admin-ptc-task.service';
import { ProfileService } from '../../../../core/services/profile.service';
import { CurrencyService } from '../../../../core/services/currency.service';
import { UserTrackingService } from '../../../../core/services/user-tracking.service';
import { WalletStateService } from '../../../../core/services/wallet-state.service';
import {
  PtcModalComponent,
  PtcAd,
} from '../../../../components/ptc-modal/ptc-modal.component';
import {
  BannerSliderComponent,
  BannerSlide,
} from '../../../../components/banner-slider/banner-slider.component';
import type { BannerAd, PtcAdType } from '../../../../core/models/admin.model';
import type { Profile } from '../../../../core/models/profile.model';

interface PtcAdCard {
  id: string;
  title: string;
  advertiserName: string;
  advertiserType: 'company' | 'person';
  imageUrl: string;
  youtubeVideoId: string;
  destinationUrl?: string;
  adType: PtcAdType;
  rewardCOP: number;
  dailyLimit: number;
  totalClicks: number;
  status: string;
}

@Component({
  selector: 'app-user-dashboard',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, RouterModule, PtcModalComponent, BannerSliderComponent],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
})
export class UserDashboardComponent implements OnInit, OnDestroy {
  private readonly bannerService = inject(AdminBannerService);
  private readonly pendingTasks = inject(PendingTasks);
  private readonly ptcService = inject(AdminPtcTaskService);
  private readonly profileService = inject(ProfileService);
  readonly currencyService = inject(CurrencyService);
  readonly userTracking = inject(UserTrackingService);
  readonly walletState = inject(WalletStateService);

  // Profile
  readonly profile = signal<Profile | null>(null);

  // Banners
  readonly dynamicBanners = signal<BannerAd[]>([]);
  readonly bannersLoading = signal(true);

  // Slides demo (fallback igual que la landing)
  private readonly staticBannerSlides: BannerSlide[] = [
    {
      icon: 'account_balance_wallet',
      title: this.currencyService.formatFromCOP(10000),
      subtitle: 'Saldo Retirable',
      description: 'Conviértete en anunciante y activa tus retiros',
      gradient: 'from-cyan-500 to-blue-600',
    },
    {
      icon: 'volunteer_activism',
      title: this.currencyService.formatFromCOP(5000),
      subtitle: 'Total Donaciones',
      description: 'Impacto social generado en la plataforma',
      gradient: 'from-purple-500 to-pink-600',
    },
    {
      icon: 'groups',
      title: '1,234+',
      subtitle: 'Creadores Activos',
      description: 'Únete a nuestra comunidad de influencers',
      gradient: 'from-green-500 to-emerald-600',
    },
    {
      icon: 'trending_up',
      title: '500K+',
      subtitle: 'Visitas Mensuales',
      description: 'Alcance masivo para tu marca',
      gradient: 'from-orange-500 to-red-600',
    },
  ];

  readonly bannerSlides = computed((): BannerSlide[] => {
    const db = this.dynamicBanners();
    if (db.length > 0) {
      return db.map((b) => ({
        icon: 'campaign',
        title: b.name,
        subtitle: b.description || 'Banner promocional',
        description: b.url || '',
        gradient: this.gradientForPosition(b.position),
      }));
    }
    return this.staticBannerSlides;
  });

  // PTC Ads
  readonly ptcAds = signal<PtcAdCard[]>([]);
  readonly ptcLoading = signal(true);

  // PTC Modal
  readonly isModalOpen = signal(false);
  readonly selectedAd = signal<PtcAd | null>(null);

  // Actividad reciente (static, se puede conectar a DB después)
  readonly recentActivity = [
    { type: 'click', description: 'Clickeaste un anuncio Mega', reward: 2000, time: 'Hace 5 min' },
    { type: 'referral', description: 'Tu referido hizo un click', reward: 200, time: 'Hace 1 hora' },
    { type: 'bonus', description: 'Bonus por meta diaria', reward: 1000, time: 'Hace 3 horas' },
  ];

  readonly referralTiers = [
    { level: 1, percentage: 10, active: true },
    { level: 2, percentage: 5, active: true },
    { level: 3, percentage: 3, active: false },
    { level: 4, percentage: 2, active: false },
    { level: 5, percentage: 1, active: false },
  ];

  private readonly adTypeRewards: Record<string, number> = {
    mega: 2000,
    standard_600: 600,
    standard_400: 400,
    mini: 83.33,
  };

  readonly Math = Math;

  // ─── Lifecycle ─────────────────────────────────────────────────────────────

  ngOnInit(): void {
    this.loadProfile();
    this.loadBanners();
    this.loadPtcAds();
  }

  ngOnDestroy(): void {}

  // ─── Profile ───────────────────────────────────────────────────────────────

  private async loadProfile(): Promise<void> {
    try {
      const profile = await this.profileService.getCurrentProfile();
      this.profile.set(profile);
    } catch (err) {
      console.error('Error loading profile:', err);
    }
  }

  // ─── Banners ───────────────────────────────────────────────────────────────

  private async loadBanners(): Promise<void> {
    const cleanup = this.pendingTasks.add();
    this.bannersLoading.set(true);
    try {
      // Solo banners configurados para la app (después del login)
      const banners = await this.bannerService.getActiveBannersByLocation(undefined, 'app');
      this.dynamicBanners.set(banners);
    } catch (err) {
      console.error('Error loading banners:', err);
      this.dynamicBanners.set([]);
    } finally {
      this.bannersLoading.set(false);
      cleanup();
    }
  }

  private gradientForPosition(position?: string): string {
    const map: Record<string, string> = {
      header: 'from-blue-500 to-indigo-600',
      sidebar: 'from-purple-500 to-pink-600',
      footer: 'from-green-500 to-teal-600',
      interstitial: 'from-orange-500 to-red-600',
    };
    return map[position || ''] ?? 'from-cyan-500 to-blue-600';
  }

  // ─── PTC Ads ───────────────────────────────────────────────────────────────

  private async loadPtcAds(): Promise<void> {
    this.ptcLoading.set(true);
    try {
      const result = await this.ptcService.getPtcTasks(
        { status: 'active' },
        { page: 1, pageSize: 16 }
      );
      const ads: PtcAdCard[] =
        result.data && result.data.length > 0
          ? result.data.map((task) => ({
              id: task.id,
              title: task.title,
              advertiserName: 'Anunciante',
              advertiserType: 'company' as const,
              imageUrl:
                task.image_url ||
                'https://images.unsplash.com/photo-1472851294608-062f824d29cc?w=400&h=300&fit=crop',
              youtubeVideoId: 'dQw4w9WgXcQ',
              destinationUrl: task.url || '',
              adType: (task.ad_type || 'mini') as PtcAdType,
              rewardCOP: this.adTypeRewards[task.ad_type || 'mini'] || task.reward || 0,
              dailyLimit: task.daily_limit || 0,
              totalClicks: task.total_clicks || 0,
              status: task.status,
            }))
          : this.getSampleAds();
      this.ptcAds.set(ads);
    } catch {
      this.ptcAds.set(this.getSampleAds());
    } finally {
      this.ptcLoading.set(false);
    }
  }

  getAdsByType(type: PtcAdType): PtcAdCard[] {
    return this.ptcAds().filter((a) => a.adType === type);
  }

  getRewardDisplay(rewardCOP: number): string {
    return this.currencyService.formatFromCOP(rewardCOP, 2);
  }

  isAdViewed(adId: string): boolean {
    return this.userTracking.hasViewedAd(adId);
  }

  openAdModal(ad: PtcAdCard): void {
    if (this.userTracking.hasViewedAd(ad.id)) return;
    this.selectedAd.set({
      id: ad.id,
      title: ad.title,
      advertiserName: ad.advertiserName,
      advertiserType: ad.advertiserType,
      imageUrl: ad.imageUrl,
      youtubeVideoId: ad.youtubeVideoId,
      destinationUrl: ad.destinationUrl ?? '',
      adType: ad.adType,
      rewardCOP: ad.rewardCOP,
      duration: 60,
    });
    this.isModalOpen.set(true);
  }

  closeModal(): void {
    this.isModalOpen.set(false);
    this.selectedAd.set(null);
  }

  onRewardClaimed(event: { walletAmount: number; donationAmount: number }): void {
    this.walletState.updateWallet(event.walletAmount);
    this.walletState.updateDonations(event.donationAmount);
    this.userTracking.recordAdView(this.selectedAd()?.id || '');
  }

  // ─── Formato ───────────────────────────────────────────────────────────────

  formatCurrency(value: number): string {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value ?? 0);
  }

  // ─── Sample ads (fallback) ─────────────────────────────────────────────────

  private getSampleAds(): PtcAdCard[] {
    return [
      {
        id: '1', title: 'Promo Fin de Semana', advertiserName: 'Mileniustore',
        advertiserType: 'company', imageUrl: 'https://images.unsplash.com/photo-1472851294608-062f824d29cc?w=400&h=300&fit=crop',
        youtubeVideoId: 'dQw4w9WgXcQ', destinationUrl: '', adType: 'mega', rewardCOP: 2000, dailyLimit: 100, totalClicks: 450, status: 'active',
      },
      {
        id: '2', title: 'Restaurante Los Parados', advertiserName: 'Los Parados',
        advertiserType: 'company', imageUrl: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=400&h=300&fit=crop',
        youtubeVideoId: 'jfKfPfyJRdk', destinationUrl: '', adType: 'mega', rewardCOP: 2000, dailyLimit: 120, totalClicks: 580, status: 'active',
      },
      {
        id: '3', title: 'Gran Venta de Electrónicos', advertiserName: 'TecnoWorld',
        advertiserType: 'company', imageUrl: 'https://images.unsplash.com/photo-1498049794561-7780e7231661?w=400&h=300&fit=crop',
        youtubeVideoId: '5qap5aO4i9A', destinationUrl: '', adType: 'mega', rewardCOP: 2000, dailyLimit: 80, totalClicks: 320, status: 'active',
      },
      {
        id: '4', title: 'Spa & Wellness Centro', advertiserName: 'Relax & Vida',
        advertiserType: 'company', imageUrl: 'https://images.unsplash.com/photo-1544161515-4ab6ce6db874?w=400&h=300&fit=crop',
        youtubeVideoId: 'DWcJFNfaw9c', destinationUrl: '', adType: 'mega', rewardCOP: 2000, dailyLimit: 60, totalClicks: 210, status: 'active',
      },
      {
        id: '5', title: 'Servicio de Delivery Express', advertiserName: 'Juan Pérez',
        advertiserType: 'person', imageUrl: 'https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?w=400&h=300&fit=crop',
        youtubeVideoId: 'fJ9rUzIMcZQ', destinationUrl: '', adType: 'standard_600', rewardCOP: 600, dailyLimit: 60, totalClicks: 180, status: 'active',
      },
      {
        id: '6', title: 'Clases de Guitarra Online', advertiserName: 'Carlos Música',
        advertiserType: 'person', imageUrl: 'https://images.unsplash.com/photo-1510915361894-db8b60106cb1?w=400&h=300&fit=crop',
        youtubeVideoId: 'hT_nvWreIhg', destinationUrl: '', adType: 'standard_600', rewardCOP: 600, dailyLimit: 40, totalClicks: 150, status: 'active',
      },
      {
        id: '7', title: 'Servicios de Limpieza', advertiserName: 'LimpioMax',
        advertiserType: 'company', imageUrl: 'https://images.unsplash.com/photo-1581578731548-c64695b97835?w=400&h=300&fit=crop',
        youtubeVideoId: 'kXYiU_JCYtU', destinationUrl: '', adType: 'standard_600', rewardCOP: 600, dailyLimit: 55, totalClicks: 220, status: 'active',
      },
      {
        id: '8', title: 'Nueva Colección de Ropa', advertiserName: 'Fashion Colombia',
        advertiserType: 'company', imageUrl: 'https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=400&h=300&fit=crop',
        youtubeVideoId: 'KG4otu6nO1I', destinationUrl: '', adType: 'standard_400', rewardCOP: 400, dailyLimit: 80, totalClicks: 320, status: 'active',
      },
      {
        id: '9', title: 'Zapatillas Importadas', advertiserName: 'ShoeStore',
        advertiserType: 'company', imageUrl: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=400&h=300&fit=crop',
        youtubeVideoId: 'VGg46O4GgiM', destinationUrl: '', adType: 'standard_400', rewardCOP: 400, dailyLimit: 70, totalClicks: 280, status: 'active',
      },
      {
        id: '10', title: 'Accesorios para Celulares', advertiserName: 'CelularAccesorios',
        advertiserType: 'company', imageUrl: 'https://images.unsplash.com/photo-1601784551446-20c9e07cdbdb?w=400&h=300&fit=crop',
        youtubeVideoId: '9bZkp7q19f0', destinationUrl: '', adType: 'standard_400', rewardCOP: 400, dailyLimit: 90, totalClicks: 410, status: 'active',
      },
      {
        id: '11', title: 'Cupón Descuento 20%', advertiserName: 'TechnoShop',
        advertiserType: 'company', imageUrl: 'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=400&h=300&fit=crop',
        youtubeVideoId: 'OPf0YbXqDm0', destinationUrl: '', adType: 'mini', rewardCOP: 83.33, dailyLimit: 50, totalClicks: 120, status: 'active',
      },
      {
        id: '12', title: 'Clases de Inglés Online', advertiserName: 'María García',
        advertiserType: 'person', imageUrl: 'https://images.unsplash.com/photo-1546410531-bb4caa6b424d?w=400&h=300&fit=crop',
        youtubeVideoId: 'jofNRWkoRGY', destinationUrl: '', adType: 'mini', rewardCOP: 83.33, dailyLimit: 30, totalClicks: 85, status: 'active',
      },
      {
        id: '13', title: 'Desayunos Sorpresa', advertiserName: 'SweetDelivery',
        advertiserType: 'company', imageUrl: 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=400&h=300&fit=crop',
        youtubeVideoId: '9bZkp7q19f0', destinationUrl: '', adType: 'mini', rewardCOP: 83.33, dailyLimit: 45, totalClicks: 180, status: 'active',
      },
      {
        id: '14', title: 'Reparación de Computadores', advertiserName: 'TechFix',
        advertiserType: 'company', imageUrl: 'https://images.unsplash.com/photo-1587614382346-4ec70e388b28?w=400&h=300&fit=crop',
        youtubeVideoId: 'kJQP7kiw5Fk', destinationUrl: '', adType: 'mini', rewardCOP: 83.33, dailyLimit: 25, totalClicks: 65, status: 'active',
      },
    ];
  }
}
