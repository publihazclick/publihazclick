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
  private readonly initialUrl = (typeof window !== 'undefined')
    ? window.location.pathname
    : this.router.url.split('?')[0].split('#')[0];

  readonly isAuthRoute = signal(false);
  readonly isAdminOrDashboardRoute = signal(false);
  readonly isLandingRoute = signal(this.initialUrl === '/' || this.initialUrl === '');
  readonly isAndaGanaRoute = signal(
    this.initialUrl.includes('/anda-gana') || this.initialUrl === '/movi' || this.initialUrl.startsWith('/movi/')
  );
  readonly isXzoomRoute = signal(this.initialUrl === '/xzoom' || this.initialUrl.startsWith('/xzoom/'));

  constructor() {
    this.updateAuthRoute(this.initialUrl);

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
    const path = url.split('?')[0].split('#')[0];
    // "/movi" es alias de "/anda-gana" (link de invitación con marca real, ver
    // movi_referral_link_branding_and_wa_message) -- debe ocultar el header/footer de
    // Publihazclick igual que "/anda-gana", si no el invitado ve el logo equivocado.
    // Se usa path (sin query) en vez de url para no atrapar "/movi-admin" por accidente.
    this.isAndaGanaRoute.set(
      url.includes('/anda-gana') || path === '/movi' || path.startsWith('/movi/')
    );
    // XZOOM EN VIVO: oculta header y footer globales para que sólo se vea el
    // contenido de la plataforma. Matches /xzoom, /xzoom/auth, /xzoom/h/:slug,
    // /xzoom/panel, /xzoom/invite/p/:code, etc.
    this.isXzoomRoute.set(path === '/xzoom' || path.startsWith('/xzoom/'));
  }
}
