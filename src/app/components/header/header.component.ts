import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';

interface NavItem {
  label: string;
  href: string;
}

interface Currency {
  code: string;
  symbol: string;
  name: string;
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
  
  protected readonly selectedCurrency = signal<Currency>({
    code: 'USD',
    symbol: '$',
    name: 'Dólar'
  });
  
  protected readonly currencies: Currency[] = [
    { code: 'USD', symbol: '$', name: 'Dólar' },
    { code: 'COP', symbol: '$', name: 'Peso Colombiano' },
    { code: 'MXN', symbol: '$', name: 'Peso Mexicano' }
  ];
  
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
    this.selectedCurrency.set(currency);
    this.currencyMenuOpen.set(false);
  }

  formatCurrency(amount: number): string {
    const currency = this.selectedCurrency();
    if (currency.code === 'COP') {
      return '$' + Math.floor(amount).toLocaleString('es-CO');
    } else if (currency.code === 'MXN') {
      return '$' + amount.toLocaleString('es-MX', { minimumFractionDigits: 2 });
    }
    return '$' + amount.toLocaleString('en-US', { minimumFractionDigits: 2 });
  }
}
