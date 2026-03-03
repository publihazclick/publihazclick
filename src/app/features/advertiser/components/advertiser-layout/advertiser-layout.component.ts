import { Component, signal, OnInit, OnDestroy, inject, PLATFORM_ID } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { AuthService } from '../../../../core/services/auth.service';
import { ProfileService } from '../../../../core/services/profile.service';
import { CurrencyService, Currency } from '../../../../core/services/currency.service';
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
  private readonly router = inject(Router);
  readonly currencyService = inject(CurrencyService);
  private readonly platformId = inject(PLATFORM_ID);

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
    const p = await this.profileService.getCurrentProfile();
    // Iniciar Realtime watch para que el balance se actualice en tiempo real
    const userId = p?.id;
    if (userId && isPlatformBrowser(this.platformId)) {
      this.profileService.startRealtimeProfileWatch(userId);
    }
  }

  ngOnDestroy(): void {
    this.profileService.stopRealtimeProfileWatch();
  }

  formatCOP(amount: number): string {
    return this.currencyService.formatFromCOP(amount, 0);
  }

  toggleSidebarCollapse(): void {
    this.sidebarCollapsed.update((v) => !v);
  }

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
}
