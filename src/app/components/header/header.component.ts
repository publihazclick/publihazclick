import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { CurrencyService, Currency } from '../../core/services/currency.service';
import { WalletStateService } from '../../core/services/wallet-state.service';
import { environment } from '../../../environments/environment';

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
export class HeaderComponent implements OnInit {
  protected readonly isMenuOpen = signal(false);
  protected readonly mobileMenuOpen = signal(false);
  protected readonly currencyMenuOpen = signal(false);
  protected readonly demoModalOpen = signal(false);

  protected readonly currencyService = inject(CurrencyService);
  protected readonly walletService = inject(WalletStateService);

  // Expose signals for template
  readonly selectedCurrency = this.currencyService.selectedCurrency;
  readonly currencies = this.currencyService.currencies;
  readonly loading = this.currencyService.loading;

  // Wallet y donations del servicio compartido
  readonly walletBalance = this.walletService.walletBalance;
  readonly donatedAmount = this.walletService.donatedAmount;

  ngOnInit(): void {
    // Los datos ya se cargan en el constructor del servicio
  }

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

  openDemoModal(): void {
    this.demoModalOpen.set(true);
  }

  closeDemoModal(): void {
    this.demoModalOpen.set(false);
  }

  openWhatsApp(): void {
    const message = encodeURIComponent(
      '¡Hola! Vi la demo en Publihazclick y me interesa ganar dinero viendo anuncios. ¿Me pueden enviar un link de referido para registrarme?'
    );
    window.open(
      `https://wa.me/${environment.whatsappNumber}?text=${message}`,
      '_blank'
    );
    this.closeDemoModal();
  }

  selectCurrency(currency: Currency): void {
    this.currencyService.selectCurrency(currency);
    this.currencyMenuOpen.set(false);
  }

  formatCurrency(amountInCOP: number): string {
    // Los valores del wallet están en COP, convertir a la divisa seleccionada
    return this.currencyService.formatFromCOP(amountInCOP, 2);
  }
}
