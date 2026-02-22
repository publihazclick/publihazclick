import { Injectable, signal } from '@angular/core';

/**
 * Servicio para compartir el estado de la billetera entre componentes
 */
@Injectable({
  providedIn: 'root'
})
export class WalletStateService {
  // Signals para el estado de la billetera
  readonly walletBalance = signal(0);
  readonly donatedAmount = signal(0);
  
  private readonly WALLET_KEY = 'ptc_wallet';
  private readonly DONATIONS_KEY = 'ptc_donations';
  
  constructor() {
    this.loadFromStorage();
  }
  
  /**
   * Carga los datos desde localStorage
   */
  loadFromStorage(): void {
    if (typeof window === 'undefined') return;
    
    try {
      const wallet = localStorage.getItem(this.WALLET_KEY);
      const donations = localStorage.getItem(this.DONATIONS_KEY);
      
      this.walletBalance.set(wallet ? parseFloat(wallet) : 0);
      this.donatedAmount.set(donations ? parseFloat(donations) : 0);
    } catch (e) {
      console.error('Error loading wallet data:', e);
    }
  }
  
  /**
   * Actualiza el balance de la billetera
   */
  updateWallet(amount: number): void {
    if (typeof window === 'undefined') return;
    
    try {
      const current = this.walletBalance();
      const newValue = current + amount;
      localStorage.setItem(this.WALLET_KEY, newValue.toString());
      this.walletBalance.set(newValue);
    } catch (e) {
      console.error('Error updating wallet:', e);
    }
  }
  
  /**
   * Actualiza el monto de donaciones
   */
  updateDonations(amount: number): void {
    if (typeof window === 'undefined') return;
    
    try {
      const current = this.donatedAmount();
      const newValue = current + amount;
      localStorage.setItem(this.DONATIONS_KEY, newValue.toString());
      this.donatedAmount.set(newValue);
    } catch (e) {
      console.error('Error updating donations:', e);
    }
  }
  
  /**
   * Resetea todos los valores
   */
  reset(): void {
    if (typeof window === 'undefined') return;
    
    try {
      localStorage.removeItem(this.WALLET_KEY);
      localStorage.removeItem(this.DONATIONS_KEY);
      this.walletBalance.set(0);
      this.donatedAmount.set(0);
    } catch (e) {
      console.error('Error resetting wallet:', e);
    }
  }
}
