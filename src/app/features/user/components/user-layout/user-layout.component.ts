import { Component, signal, ViewChild, OnInit, OnDestroy, inject, PLATFORM_ID, effect } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { AuthService } from '../../../../core/services/auth.service';
import { ProfileService } from '../../../../core/services/profile.service';
import { WalletStateService } from '../../../../core/services/wallet-state.service';
import { CurrencyService, Currency } from '../../../../core/services/currency.service';
import { TradingPackageService, UserTradingPackage } from '../../../../core/services/trading-package.service';
import { UserReferralModalComponent } from '../user-referral-modal/user-referral-modal.component';
import { BannerSliderComponent } from '../../../../components/banner-slider/banner-slider.component';

@Component({
  selector: 'app-user-layout',
  standalone: true,
  imports: [CommonModule, RouterModule, UserReferralModalComponent, BannerSliderComponent],
  templateUrl: './user-layout.component.html',
  styleUrl: './user-layout.component.scss',
})
export class UserLayoutComponent implements OnInit, OnDestroy {
  private readonly authService = inject(AuthService);
  private readonly profileService = inject(ProfileService);
  readonly walletState = inject(WalletStateService);
  readonly currencyService = inject(CurrencyService);
  private readonly tradingPkgSvc = inject(TradingPackageService);
  private readonly router = inject(Router);
  private readonly platformId = inject(PLATFORM_ID);

  readonly activeTrading = signal<UserTradingPackage[]>([]);

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

  // Toast de activación de cuenta
  readonly upgradeToast = signal(false);
  private initialRole: string | null = null;
  private roleWatchReady = false;

  @ViewChild('referralModal') referralModal!: UserReferralModalComponent;

  constructor() {
    // Detecta en tiempo real cuando el admin cambia el rol mientras el usuario está activo
    effect(() => {
      const role = this.profile()?.role ?? null;
      if (!this.roleWatchReady || role === null) return;
      if (role === this.initialRole) return;
      // El rol cambió → activar toast y redirigir
      this.onRoleUpgraded(role);
    });
  }

  ngOnInit(): void {
    if (isPlatformBrowser(this.platformId)) {
      document.addEventListener('touchstart', this.handleTouchStart, { passive: true });
      document.addEventListener('touchend', this.handleTouchEnd, { passive: true });
    }
    this.loadProfile().then(() => {
      this.initialRole = this.profile()?.role ?? null;
      this.roleWatchReady = true;
      // Iniciar escucha Realtime solo en el browser
      const userId = this.profile()?.id;
      if (userId && isPlatformBrowser(this.platformId)) {
        this.profileService.startRealtimeProfileWatch(userId);
        // Sincronizar con DB en background sin bloquear la UI
        this.profileService.getCurrentProfile().catch(() => {});
        // Cargar paquetes de trading activos
        this.tradingPkgSvc.getMyActivePackages().then(pkgs => this.activeTrading.set(pkgs)).catch(() => {});
      }
    });
  }

  ngOnDestroy(): void {
    this.profileService.stopRealtimeProfileWatch();
    if (isPlatformBrowser(this.platformId)) {
      document.removeEventListener('touchstart', this.handleTouchStart);
      document.removeEventListener('touchend', this.handleTouchEnd);
    }
  }

  private async loadProfile(): Promise<void> {
    try {
      // Si el perfil ya fue cargado (ej. desde el flujo de login), reutilizarlo
      // para evitar que un getUser() con timing incorrecto borre el balance.
      if (!this.profileService.profile()) {
        await this.profileService.getCurrentProfile();
      }
    } catch {
      // silencioso
    }
  }

  private onRoleUpgraded(newRole: string): void {
    this.upgradeToast.set(true);
    setTimeout(() => {
      this.upgradeToast.set(false);
      if (newRole === 'advertiser') {
        this.router.navigate(['/advertiser']);
      } else if (newRole === 'admin' || newRole === 'dev') {
        this.router.navigate(['/admin']);
      }
    }, 3500);
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

  openReferralModal(): void {
    this.referralModal?.open();
  }

  isSettingsRoute(): boolean {
    return this.router.url.includes('/settings');
  }

  isAndaGanaRoute(): boolean {
    return this.router.url.includes('/anda-gana');
  }

  isSmsRoute(): boolean {
    return this.router.url.includes('/sms-masivos');
  }

  getTierInfo(referrals: number, hasActivePackage: boolean): { name: string; color: string } | null {
    if (!hasActivePackage) return null;
    if (referrals >= 40) return { name: 'DIAMANTE CORONA', color: 'text-amber-400' };
    if (referrals >= 36) return { name: 'DIAMANTE NEGRO', color: 'text-gray-300' };
    if (referrals >= 31) return { name: 'DIAMANTE AZUL', color: 'text-blue-400' };
    if (referrals >= 26) return { name: 'DIAMANTE', color: 'text-cyan-400' };
    if (referrals >= 20) return { name: 'ESMERALDA', color: 'text-green-500' };
    if (referrals >= 10) return { name: 'RUBY', color: 'text-red-400' };
    if (referrals >= 6)  return { name: 'ZAFIRO', color: 'text-blue-300' };
    if (referrals >= 3)  return { name: 'PERLA', color: 'text-pink-400' };
    return { name: 'JADE', color: 'text-emerald-400' };
  }
}
