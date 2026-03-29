import { Component, signal, OnInit, OnDestroy, inject, PLATFORM_ID } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { AuthService } from '../../../../core/services/auth.service';
import { ProfileService } from '../../../../core/services/profile.service';
import { CurrencyService, Currency } from '../../../../core/services/currency.service';
import { TradingPackageService, UserTradingPackage } from '../../../../core/services/trading-package.service';
import { BannerSliderComponent } from '../../../../components/banner-slider/banner-slider.component';

@Component({
  selector: 'app-advertiser-layout',
  standalone: true,
  imports: [CommonModule, RouterModule, BannerSliderComponent],
  templateUrl: './advertiser-layout.component.html',
})
export class AdvertiserLayoutComponent implements OnInit, OnDestroy {
  private readonly authService = inject(AuthService);
  private readonly profileService = inject(ProfileService);
  private readonly tradingPkgSvc = inject(TradingPackageService);
  private readonly router = inject(Router);
  readonly currencyService = inject(CurrencyService);
  private readonly platformId = inject(PLATFORM_ID);

  readonly activeTrading = signal<UserTradingPackage[]>([]);

  isDarkMode = true;

  protected readonly sidebarCollapsed = signal(
    isPlatformBrowser(this.platformId) && window.innerWidth < 1024
  );
  protected readonly currencyMenuOpen = signal(false);
  protected readonly profileMenuOpen = signal(false);

  readonly profile = this.profileService.profile;
  readonly selectedCurrency = this.currencyService.selectedCurrency;
  readonly currencies = this.currencyService.currencies;

  async ngOnInit(): Promise<void> {
    if (isPlatformBrowser(this.platformId)) {
      document.addEventListener('touchstart', this.handleTouchStart, { passive: true });
      document.addEventListener('touchend', this.handleTouchEnd, { passive: true });
    }
    // Si el perfil ya fue cargado (ej. desde el flujo de login), reutilizarlo
    // para evitar que un getUser() con timing incorrecto borre el balance.
    let p = this.profileService.profile();
    if (!p) {
      p = await this.profileService.getCurrentProfile();
    }
    // Iniciar Realtime watch para que el balance se actualice en tiempo real
    const userId = p?.id;
    if (userId && isPlatformBrowser(this.platformId)) {
      this.profileService.startRealtimeProfileWatch(userId);
      // Sincronizar con DB en background sin bloquear la UI
      this.profileService.getCurrentProfile().catch(() => {});
      // Cargar paquetes de trading activos
      this.tradingPkgSvc.getMyActivePackages().then(pkgs => this.activeTrading.set(pkgs)).catch(() => {});
    }
  }

  ngOnDestroy(): void {
    this.profileService.stopRealtimeProfileWatch();
    if (isPlatformBrowser(this.platformId)) {
      document.removeEventListener('touchstart', this.handleTouchStart);
      document.removeEventListener('touchend', this.handleTouchEnd);
    }
  }

  formatCOP(amount: number): string {
    return this.currencyService.formatFromCOP(amount, 0);
  }

  toggleSidebarCollapse(): void {
    this.sidebarCollapsed.update((v) => !v);
  }

  private touchStartX = 0;

  private readonly handleTouchStart = (e: TouchEvent): void => {
    this.touchStartX = e.touches[0].clientX;
  };

  private readonly handleTouchEnd = (e: TouchEvent): void => {
    if (window.innerWidth >= 1024) return;
    const dx = e.changedTouches[0].clientX - this.touchStartX;
    if (dx > 60 && this.sidebarCollapsed()) this.sidebarCollapsed.set(false);
    if (dx < -60 && !this.sidebarCollapsed()) this.sidebarCollapsed.set(true);
  };

  toggleCurrencyMenu(): void {
    this.currencyMenuOpen.update((v) => !v);
  }

  toggleProfileMenu(): void {
    this.profileMenuOpen.update((v) => !v);
    if (this.profileMenuOpen()) this.currencyMenuOpen.set(false);
  }

  closeProfileMenu(): void {
    this.profileMenuOpen.set(false);
  }

  selectCurrency(currency: Currency): void {
    this.currencyService.selectCurrency(currency);
    this.currencyMenuOpen.set(false);
  }

  toggleCurrencyMenuAndClose(): void {
    this.profileMenuOpen.set(false);
    this.toggleCurrencyMenu();
  }

  toggleDarkMode(): void {
    this.isDarkMode = !this.isDarkMode;
    document.documentElement.classList.toggle('dark');
  }

  logout(): void {
    this.authService.logout().subscribe();
  }

  isSettingsRoute(): boolean {
    return this.router.url.includes('/settings');
  }

  isAndaGanaRoute(): boolean {
    return this.router.url.includes('/anda-gana');
  }

  isAiRoute(): boolean {
    return this.router.url.includes('/advertiser/ai');
  }
}
