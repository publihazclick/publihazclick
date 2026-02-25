import { Component, signal, ViewChild, OnInit, inject, PLATFORM_ID } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { AuthService } from '../../../../core/services/auth.service';
import { ProfileService } from '../../../../core/services/profile.service';
import { WalletStateService } from '../../../../core/services/wallet-state.service';
import { CurrencyService, Currency } from '../../../../core/services/currency.service';
import { UserReferralModalComponent } from '../user-referral-modal/user-referral-modal.component';
import { BannerSliderComponent } from '../../../../components/banner-slider/banner-slider.component';

@Component({
  selector: 'app-user-layout',
  standalone: true,
  imports: [CommonModule, RouterModule, UserReferralModalComponent, BannerSliderComponent],
  templateUrl: './user-layout.component.html',
  styleUrl: './user-layout.component.scss',
})
export class UserLayoutComponent implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly profileService = inject(ProfileService);
  readonly walletState = inject(WalletStateService);
  readonly currencyService = inject(CurrencyService);
  private readonly router = inject(Router);
  private readonly platformId = inject(PLATFORM_ID);

  isDarkMode = true;

  // Sidebar colapsado por defecto en móvil/tablet
  protected readonly sidebarCollapsed = signal(
    isPlatformBrowser(this.platformId) && window.innerWidth < 1024
  );
  protected readonly currencyMenuOpen = signal(false);
  protected readonly profileMenuOpen = signal(false);

  // Use shared service signal so settings page avatar updates reflect here immediately
  readonly profile = this.profileService.profile;
  readonly selectedCurrency = this.currencyService.selectedCurrency;
  readonly currencies = this.currencyService.currencies;

  // Stats para el sidebar
  dailyProgress = 65;
  dailyGoal = 10;
  dailyClicks = 7;

  @ViewChild('referralModal') referralModal!: UserReferralModalComponent;

  ngOnInit(): void {
    this.loadProfile();
  }

  private async loadProfile(): Promise<void> {
    try {
      await this.profileService.getCurrentProfile();
    } catch {
      // silencioso
    }
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

  openReferralModal(): void {
    this.referralModal?.open();
  }

  isSettingsRoute(): boolean {
    return this.router.url.includes('/settings');
  }
}
