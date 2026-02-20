import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { CurrencyService, Currency } from '../../core/services/currency.service';

interface NavItem {
  label: string;
  href: string;
}

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './header.component.html',
  styleUrl: './header.component.scss'
})
export class HeaderComponent {
  protected readonly isMenuOpen = signal(false);
  protected readonly mobileMenuOpen = signal(false);
  protected readonly currencyMenuOpen = signal(false);
  
  protected readonly currencyService = inject(CurrencyService);
  
  // Expose signals for template
  readonly selectedCurrency = this.currencyService.selectedCurrency;
  readonly currencies = this.currencyService.currencies;
  readonly loading = this.currencyService.loading;
  
  // Wallet and donation placeholders (will be functional later)
  protected readonly walletBalance = signal(0.00);
  protected readonly donatedAmount = signal(0.00);
  
  protected readonly navItems: NavItem[] = [
    { label: 'Inicio', href: '/' },
    { label: 'Qué es Publihazclik', href: '#features' },
    { label: 'Pagos y Testimonios', href: '#testimonials' },
    { label: 'Marcas', href: '#brands' },
    { label: 'Youtube', href: '#youtube' }
  ];

  toggleMenu(): void {
    this.isMenuOpen.update(v => !v);
  }

  toggleMobileMenu(): void {
    this.mobileMenuOpen.update(v => !v);
  }

  toggleCurrencyMenu(): void {
    this.currencyMenuOpen.update(v => !v);
  }

  selectCurrency(currency: Currency): void {
    this.currencyService.selectCurrency(currency);
    this.currencyMenuOpen.set(false);
  }

  formatCurrency(amount: number): string {
    return this.currencyService.format(amount);
  }
}
