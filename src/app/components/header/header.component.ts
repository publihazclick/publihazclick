import { Component, inject, signal, OnInit, DestroyRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, Router, NavigationEnd } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { filter } from 'rxjs/operators';
import { CurrencyService, Currency } from '../../core/services/currency.service';
import { WalletStateService } from '../../core/services/wallet-state.service';
import { AuthService } from '../../core/services/auth.service';
import { environment } from '../../../environments/environment';

interface NavItem {
  label: string;
  href: string;
}

/** Rutas de landings de módulos donde NO se muestra el botón de login/registro */
const MODULE_LANDING_ROUTES = [
  '/trading-bot',
  '/herramientas-ia',
  '/cursos',
  '/sms-masivos',
];

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
  protected readonly isModuleLanding = signal(false);

  protected readonly currencyService = inject(CurrencyService);
  protected readonly walletService = inject(WalletStateService);
  protected readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  // Expose signals for template
  readonly selectedCurrency = this.currencyService.selectedCurrency;
  readonly currencies = this.currencyService.currencies;
  readonly loading = this.currencyService.loading;

  // Wallet y donations del servicio compartido
  readonly walletBalance = this.walletService.walletBalance;
  readonly donatedAmount = this.walletService.donatedAmount;

  ngOnInit(): void {
    // Detectar ruta actual al inicio
    this.checkModuleLanding(this.router.url);

    // Escuchar cambios de ruta
    this.router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe((event) => {
      this.checkModuleLanding((event as NavigationEnd).urlAfterRedirects);
    });
  }

  private checkModuleLanding(url: string): void {
    const path = url.split('?')[0].split('#')[0];
    this.isModuleLanding.set(MODULE_LANDING_ROUTES.includes(path));
  }

  protected readonly navItems: NavItem[] = [
    { label: 'Inicio', href: '/' },
    { label: 'Qué es Publihazclik', href: '#features' },
    { label: 'Pagos y Testimonios', href: '#testimonials' },
    { label: 'Marcas', href: '#brands' },
    { label: 'Youtube', href: '#youtube' }
  ];

  async goToTestimonials(): Promise<void> {
    if (this.router.url !== '/') {
      await this.router.navigate(['/']);
      // Esperar a que el DOM se renderice tras la navegación
      setTimeout(() => this.scrollToSection(), 300);
    } else {
      this.scrollToSection();
    }
    this.mobileMenuOpen.set(false);
  }

  private scrollToSection(): void {
    const el = document.getElementById('pagos-testimonios');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

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
