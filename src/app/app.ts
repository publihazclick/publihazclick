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
    FooterComponent,
  ],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  protected readonly title = signal('publihazclick');

  readonly isAuthRoute = signal(false);
  readonly isAdminOrDashboardRoute = signal(false);

  private readonly router = inject(Router);

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
      url.includes('/admin') || url.includes('/dashboard') || url.includes('/advertiser')
    );
  }
}
