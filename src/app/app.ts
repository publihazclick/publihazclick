import { Component, signal, inject } from '@angular/core';
import { RouterOutlet, Router, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';
import { HeaderComponent } from './components/header/header.component';
import { HeroComponent } from './components/hero/hero.component';
import { TestimonialsComponent } from './components/testimonials/testimonials.component';
import { BusinessModelsComponent } from './components/business-models/business-models.component';
import { HowItWorksComponent } from './components/how-it-works/how-it-works.component';
import { PricingComponent } from './components/pricing/pricing.component';
import { FeaturesComponent } from './components/features/features.component';
import { PtcAdsComponent } from './components/ptc-ads/ptc-ads.component';
import { VideoSectionComponent } from './components/video-section/video-section.component';
import { FooterComponent } from './components/footer/footer.component';
import { BannerSliderComponent, BannerSlide } from './components/banner-slider/banner-slider.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    RouterOutlet,
    HeaderComponent,
    HeroComponent,
    BannerSliderComponent,
    TestimonialsComponent,
    BusinessModelsComponent,
    HowItWorksComponent,
    PricingComponent,
    FeaturesComponent,
    PtcAdsComponent,
    VideoSectionComponent,
    FooterComponent
  ],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App {
  protected readonly title = signal('publihazclick');
  
  // Signal para saber si estamos en una ruta de autenticación
  readonly isAuthRoute = signal(false);
  
  // Banner slides data
  protected readonly bannerSlides: BannerSlide[] = [
    {
      icon: 'account_balance_wallet',
      title: 'COP: $10.000',
      subtitle: 'Saldo Retirable',
      description: 'Conviértete en anunciante y activa tus retiros',
      gradient: 'from-cyan-500 to-blue-600'
    },
    {
      icon: 'volunteer_activism',
      title: 'COP: $5.000',
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
  
  private readonly router = inject(Router);
  
  constructor() {
    // Inicializar con la ruta actual
    this.updateAuthRoute(this.router.url);
    
    // Detectar cambios de ruta
    this.router.events.pipe(
      filter(event => event instanceof NavigationEnd)
    ).subscribe((event: any) => {
      const url = event.urlAfterRedirects || event.url;
      this.updateAuthRoute(url);
    });
  }
  
  private updateAuthRoute(url: string): void {
    // Verificar si es una ruta de autenticación o admin
    this.isAuthRoute.set(
      url.includes('/login') || 
      url.includes('/register') || 
      url.includes('/auth/') ||
      url.includes('/admin')
    );
  }
}
