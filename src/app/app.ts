import { Component, signal, inject, computed, OnInit } from '@angular/core';
import { RouterOutlet, Router, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';
import { HeaderComponent } from './components/header/header.component';
import { HeroComponent } from './components/hero/hero.component';
import { PricingComponent } from './components/pricing/pricing.component';
import { PtcAdsComponent } from './components/ptc-ads/ptc-ads.component';
import { VideoSectionComponent } from './components/video-section/video-section.component';
import { FooterComponent } from './components/footer/footer.component';
import { BannerSliderComponent, BannerSlide } from './components/banner-slider/banner-slider.component';
import { TiersComponent } from './components/tiers/tiers.component';
import { CurrencyService } from './core/services/currency.service';
import { AdminBannerService } from './core/services/admin-banner.service';
import type { BannerAd, AdLocation } from './core/models/admin.model';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    RouterOutlet,
    HeaderComponent,
    HeroComponent,
    BannerSliderComponent,
    TiersComponent,
    PricingComponent,
    PtcAdsComponent,
    VideoSectionComponent,
    FooterComponent
  ],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App implements OnInit {
  protected readonly title = signal('publihazclick');
  protected currencyService = inject(CurrencyService);
  private readonly bannerService = inject(AdminBannerService);
  
  // Signal para los banners dinámicos desde la BD
  readonly dynamicBanners = signal<BannerAd[]>([]);
  readonly loadingBanners = signal<boolean>(true);
  
  // Signal para saber si estamos en una ruta de autenticación
  readonly isAuthRoute = signal(false);
  
  // Signal para saber si estamos en una ruta de admin o dashboard
  readonly isAdminOrDashboardRoute = signal(false);
  
  // Computed banner slides que combina datos dinámicos de la BD con datos estáticos
  protected readonly bannerSlides = computed((): BannerSlide[] => {
    const dynamicBanners = this.dynamicBanners();
    
    // Si hay banners dinámicos en la BD, usarlos
    if (dynamicBanners && dynamicBanners.length > 0) {
      return dynamicBanners.map(banner => ({
        icon: 'campaign',
        title: banner.name,
        subtitle: banner.description || 'Banner promocional',
        description: banner.url || 'Haz clic para ver más',
        gradient: this.getGradientForBanner(banner.position)
      }));
    }
    
    // Datos estáticos por defecto (fallback)
    const walletBalance = this.currencyService.formatFromCOP(10000);
    const donations = this.currencyService.formatFromCOP(5000);
    
    return [
      {
        icon: 'account_balance_wallet',
        title: walletBalance,
        subtitle: 'Saldo Retirable',
        description: 'Conviértete en anunciante y activa tus retiros',
        gradient: 'from-cyan-500 to-blue-600'
      },
      {
        icon: 'volunteer_activism',
        title: donations,
        subtitle: 'Total Donaciones',
        description: 'Impacto social generado en la plataforma',
        gradient: 'from-purple-500 to-pink-600'
      },
      {
        icon: 'groups',
        title: '1,234+',
        subtitle: 'Creadores Activos',
        description: 'Únete a nuestra comunidad de influencers',
        gradient: 'from-green-500 to-emerald-600'
      },
      {
        icon: 'trending_up',
        title: '500K+',
        subtitle: 'Visitas Mensuales',
        description: 'Alcance masivo para tu marca',
        gradient: 'from-orange-500 to-red-600'
      }
    ];
  });
  
  private getGradientForBanner(position?: string): string {
    const gradients: Record<string, string> = {
      header: 'from-blue-500 to-indigo-600',
      sidebar: 'from-purple-500 to-pink-600',
      footer: 'from-green-500 to-teal-600',
      interstitial: 'from-orange-500 to-red-600'
    };
    return gradients[position || 'sidebar'] || 'from-cyan-500 to-blue-600';
  }
  
  private readonly router = inject(Router);
  
  constructor() {
    // Inicializar con la ruta actual
    this.updateAuthRoute(this.router.url);
    
    // Detectar cambios de ruta
    this.router.events.pipe(
      filter(event => event instanceof NavigationEnd)
    ).subscribe(event => {
      this.updateAuthRoute((event as NavigationEnd).url);
    });
  }
  
  ngOnInit(): void {
    this.loadDynamicBanners();
  }
  
  private async loadDynamicBanners(): Promise<void> {
    try {
      this.loadingBanners.set(true);
      // Cargar banners activos para la landing page
      const banners = await this.bannerService.getActiveBannersByLocation(undefined, 'landing' as AdLocation);
      this.dynamicBanners.set(banners);
    } catch (error) {
      console.error('Error loading dynamic banners:', error);
      // En caso de error, se usarán los datos estáticos
      this.dynamicBanners.set([]);
    } finally {
      this.loadingBanners.set(false);
    }
  }
  
  private updateAuthRoute(url: string): void {
    this.isAuthRoute.set(url.includes('/login') || url.includes('/register') || url.includes('/callback'));
    this.isAdminOrDashboardRoute.set(url.includes('/admin') || url.includes('/dashboard'));
  }
}
