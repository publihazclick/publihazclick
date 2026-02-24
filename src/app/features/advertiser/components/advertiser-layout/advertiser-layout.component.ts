import { Component, signal, ViewChild, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { AuthService } from '../../../../core/services/auth.service';
import { ProfileService } from '../../../../core/services/profile.service';
import { WalletStateService } from '../../../../core/services/wallet-state.service';
import { CurrencyService, Currency } from '../../../../core/services/currency.service';
import { UserReferralModalComponent } from '../../../user/components/user-referral-modal/user-referral-modal.component';

@Component({
  selector: 'app-advertiser-layout',
  standalone: true,
  imports: [CommonModule, RouterModule, UserReferralModalComponent],
  templateUrl: './advertiser-layout.component.html',
})
export class AdvertiserLayoutComponent implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly profileService = inject(ProfileService);
  readonly walletState = inject(WalletStateService);
  readonly currencyService = inject(CurrencyService);

  isDarkMode = true;

  protected readonly sidebarCollapsed = signal(false);
  protected readonly currencyMenuOpen = signal(false);
  protected readonly profileMenuOpen = signal(false);

  readonly profile = this.profileService.profile;
  readonly selectedCurrency = this.currencyService.selectedCurrency;
  readonly currencies = this.currencyService.currencies;

  @ViewChild('referralModal') referralModal!: UserReferralModalComponent;

  ngOnInit(): void {
    this.profileService.getCurrentProfile().catch(() => {});
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
}
