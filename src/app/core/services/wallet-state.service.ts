import { Injectable, signal } from '@angular/core';

/**
 * Servicio para el estado de la billetera DEMO (landing page).
 * Los dashboards reales usan ProfileService directamente (profile.real_balance, etc.)
 */
@Injectable({
  providedIn: 'root'
})
export class WalletStateService {
  // Signals para el estado de la billetera DEMO
  readonly walletBalance = signal(0);
  readonly donatedAmount = signal(0);

  private readonly WALLET_KEY = 'ptc_wallet';
  private readonly DONATIONS_KEY = 'ptc_donations';

  constructor() {
    this.loadFromStorage();
  }

  loadFromStorage(): void {
    if (typeof window === 'undefined') return;
    try {
      const wallet = localStorage.getItem(this.WALLET_KEY);
      const donations = localStorage.getItem(this.DONATIONS_KEY);
      this.walletBalance.set(wallet ? parseFloat(wallet) : 0);
      this.donatedAmount.set(donations ? parseFloat(donations) : 0);
    } catch (e) {
      // Silent fail - non-critical localStorage operation
    }
  }

  updateWallet(amount: number): void {
    if (typeof window === 'undefined') return;
    try {
      const newValue = this.walletBalance() + amount;
      localStorage.setItem(this.WALLET_KEY, newValue.toString());
      this.walletBalance.set(newValue);
    } catch (e) {
      // Silent fail - non-critical localStorage operation
    }
  }

  updateDonations(amount: number): void {
    if (typeof window === 'undefined') return;
    try {
      const newValue = this.donatedAmount() + amount;
      localStorage.setItem(this.DONATIONS_KEY, newValue.toString());
      this.donatedAmount.set(newValue);
    } catch (e) {
      // Silent fail - non-critical localStorage operation
    }
  }

  reset(): void {
    if (typeof window === 'undefined') return;
    try {
      localStorage.removeItem(this.WALLET_KEY);
      localStorage.removeItem(this.DONATIONS_KEY);
      this.walletBalance.set(0);
      this.donatedAmount.set(0);
    } catch (e) {
      // Silent fail - non-critical localStorage operation
    }
  }
}
