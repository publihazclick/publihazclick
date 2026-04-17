import { Component, signal, inject } from '@angular/core';
import { RouterOutlet, Router, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';
import { HeaderComponent } from './components/header/header.component';
import { HeroComponent } from './components/hero/hero.component';
import { PricingComponent } from './components/pricing/pricing.component';
import { PtcAdsComponent } from './components/ptc-ads/ptc-ads.component';
import { VideoSectionComponent } from './components/video-section/video-section.component';
import { FooterComponent } from './components/footer/footer.component';
import { BannerSliderComponent } from './components/banner-slider/banner-slider.component';
import { TiersComponent } from './components/tiers/tiers.component';
import { PaymentTestimonialsComponent } from './components/payment-testimonials/payment-testimonials.component';
import { CursosLandingComponent } from './features/cursos/components/landing/cursos-landing.component';
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
    PaymentTestimonialsComponent,
    CursosLandingComponent,
    FooterComponent,
  ],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  protected readonly title = signal('publihazclick');

  private readonly router = inject(Router);
  private readonly initialUrl = this.router.url.split('?')[0].split('#')[0];

  readonly isAuthRoute = signal(false);
  readonly isAdminOrDashboardRoute = signal(false);
  readonly isLandingRoute = signal(this.initialUrl === '/' || this.initialUrl === '');
  readonly isAndaGanaRoute = signal(this.initialUrl.includes('/anda-gana'));
  readonly isXzoomRoute = signal(this.initialUrl === '/xzoom' || this.initialUrl.startsWith('/xzoom/'));

  constructor() {
    this.updateAuthRoute(this.router.url);

    this.router.events.pipe(filter((event) => event instanceof NavigationEnd)).subscribe((event) => {
      this.updateAuthRoute((event as NavigationEnd).url);
    });
  }

  private updateAuthRoute(url: string): void {
    this.isAuthRoute.set(
      url.includes('/login') ||
        url.includes('/register') ||
        url.includes('/ref/') ||
        url.includes('/callback')
    );
    this.isAdminOrDashboardRoute.set(
      url.includes('/admin') || url.includes('/dashboard') || url.includes('/advertiser') || url.includes('/social') || url.includes('/ai')
    );
    this.isLandingRoute.set(url === '/' || url === '');
    this.isAndaGanaRoute.set(url.includes('/anda-gana'));
    // XZOOM EN VIVO: oculta header y footer globales para que sólo se vea el
    // contenido de la plataforma. Matches /xzoom, /xzoom/auth, /xzoom/h/:slug,
    // /xzoom/panel, /xzoom/invite/p/:code, etc.
    const path = url.split('?')[0].split('#')[0];
    this.isXzoomRoute.set(path === '/xzoom' || path.startsWith('/xzoom/'));
  }
}
