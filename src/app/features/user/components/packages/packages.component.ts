import { Component, inject, signal, computed, OnInit, PLATFORM_ID } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { ProfileService } from '../../../../core/services/profile.service';
import { AdminPackageService } from '../../../../core/services/admin-package.service';
import { CurrencyService } from '../../../../core/services/currency.service';
import type { Package } from '../../../../core/models/admin.model';
import type { Profile } from '../../../../core/models/profile.model';

// Estado del flujo de pago Nequi / ePayco
type PayStep =
  | 'idle' | 'select'
  | 'redirect' | 'confirm' | 'submitting' | 'approved' | 'sent' | 'error'
  | 'epayco-loading' | 'epayco-opening'
  | 'active-warning';

const COP_FORMATTER = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

@Component({
  selector: 'app-user-packages',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './packages.component.html',
  styleUrl: './packages.component.scss'
})
export class UserPackagesComponent implements OnInit {
  private readonly profileService  = inject(ProfileService);
  private readonly packageService  = inject(AdminPackageService);
  private readonly currencyService = inject(CurrencyService);
  private readonly route           = inject(ActivatedRoute);
  private readonly platformId      = inject(PLATFORM_ID);

  readonly packages = signal<Package[]>([]);
  readonly profile = signal<Profile | null>(null);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  readonly currentPackage = computed(() =>
    this.packages().find(p => p.id === this.profile()?.current_package_id) ?? null
  );
  readonly hasActivePackage = computed(() => this.profile()?.has_active_package ?? false);

  // ── Flujo de pago Nequi ───────────────────────────────────────────────────
  readonly selectedPackage = signal<Package | null>(null);
  readonly payStep = signal<PayStep>('idle');
  readonly payError = signal<string | null>(null);
  readonly verifyMessage = signal<string>('');

  // Paquete activo: flujo de advertencia antes de comprar otro
  readonly pendingPaymentMethod = signal<'epayco' | 'nequi' | null>(null);

  // Datos del comprobante
  proofPhone = '';
  proofTransactionId = '';

  async ngOnInit(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const [profile, packages] = await Promise.all([
        this.profileService.getCurrentProfile(),
        this.packageService.getPackages()
      ]);
      this.profile.set(profile);
      this.packages.set(packages);

      // Detectar retorno de ePayco
      if (isPlatformBrowser(this.platformId)) {
        const epaycoResult = this.route.snapshot.queryParamMap.get('epayco');
        if (epaycoResult === 'result') {
          this.payStep.set('epayco-opening');
        }
      }
    } catch {
      this.error.set('No se pudieron cargar los paquetes. Intenta de nuevo.');
    } finally {
      this.loading.set(false);
    }
  }

  // ── Pago Nequi ────────────────────────────────────────────────────────────

  /** Abre el modal en paso de selección de paquete */
  openPaymentModal(): void {
    this.selectedPackage.set(null);
    this.proofPhone = '';
    this.proofTransactionId = '';
    this.payError.set(null);
    this.verifyMessage.set('');
    this.payStep.set('select');
  }

  /** Abre el modal directamente en el paso de pago para un paquete */
  openNequiPayment(pkg: Package): void {
    if (!pkg.nequi_payment_link) return;
    this.selectedPackage.set(pkg);
    this.proofPhone = '';
    this.proofTransactionId = '';
    this.payError.set(null);
    this.verifyMessage.set('');
    this.payStep.set('redirect');
  }

  /** Selecciona un paquete e inicia flujo Nequi */
  selectAndPay(pkg: Package): void {
    if (this.hasActivePackage() && !this.isCurrentPackage(pkg)) {
      this.selectedPackage.set(pkg);
      this.pendingPaymentMethod.set('nequi');
      this.payStep.set('active-warning');
      return;
    }
    this.openNequiPayment(pkg);
  }

  /** Continúa la compra tras la advertencia de paquete activo */
  async continueAfterWarning(): Promise<void> {
    const pkg = this.selectedPackage();
    const method = this.pendingPaymentMethod();
    if (!pkg) return;
    this.pendingPaymentMethod.set(null);

    if (method === 'nequi') {
      this.openNequiPayment(pkg);
    } else {
      // Ir directo al checkout de ePayco sin pasar por el check de paquete activo
      if (!isPlatformBrowser(this.platformId)) return;
      this.payError.set(null);
      this.payStep.set('epayco-loading');
      try {
        const params = await this.packageService.createEpaycoPayment(pkg.id);
        this.payStep.set('epayco-opening');
        await this.openEpaycoCheckout(params);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Error al iniciar pago con ePayco';
        this.payError.set(msg);
        this.payStep.set('error');
      }
    }
  }

  goToNequiLink(): void {
    const link = this.selectedPackage()?.nequi_payment_link;
    if (!link) return;
    window.open(link, '_blank', 'noopener,noreferrer');
    this.payStep.set('confirm');
  }

  closePaymentModal(): void {
    // Si fue aprobado o viene de ePayco, recargar el perfil
    if (this.payStep() === 'approved' || this.payStep() === 'epayco-opening') {
      this.reloadProfile();
    }
    this.payStep.set('idle');
    this.selectedPackage.set(null);
    this.payError.set(null);
    this.verifyMessage.set('');
    this.proofPhone = '';
    this.proofTransactionId = '';
  }

  async submitProof(): Promise<void> {
    const pkg = this.selectedPackage();
    if (!pkg) return;

    const phone = this.proofPhone.replace(/\D/g, '');
    if (!/^3\d{9}$/.test(phone)) {
      this.payError.set('Ingresa tu número Nequi (10 dígitos, empieza por 3).');
      return;
    }
    if (!this.proofTransactionId.trim()) {
      this.payError.set('Ingresa el número de transacción que recibes en Nequi.');
      return;
    }

    this.payStep.set('submitting');
    this.payError.set(null);

    // Usar price_cop del plan si está disponible, sino calcular con tasa de referencia
    const copAmount = pkg.price_cop ?? Math.round(pkg.price * 4200);
    const amountInCents = copAmount * 100;

    const ok = await this.packageService.submitPaymentProof({
      packageId: pkg.id,
      packageName: pkg.name,
      amountInCents,
      phoneNumber: phone,
      transactionId: this.proofTransactionId.trim(),
    });

    if (!ok) {
      this.payError.set('Error al enviar el comprobante. Intenta de nuevo.');
      this.payStep.set('confirm');
      return;
    }

    this.verifyMessage.set('Comprobante enviado. Un administrador revisará tu pago.');
    this.payStep.set('sent');
  }

  private async reloadProfile(): Promise<void> {
    try {
      const profile = await this.profileService.getCurrentProfile();
      this.profile.set(profile);
      const packages = await this.packageService.getPackages();
      this.packages.set(packages);
    } catch { /* silencioso */ }
  }

  // ── Pago ePayco ───────────────────────────────────────────────────────────

  async startEpaycoCheckout(pkg: Package): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) return;

    if (this.hasActivePackage() && !this.isCurrentPackage(pkg) && this.pendingPaymentMethod() !== 'epayco') {
      this.selectedPackage.set(pkg);
      this.pendingPaymentMethod.set('epayco');
      this.payStep.set('active-warning');
      return;
    }

    this.pendingPaymentMethod.set(null);
    this.selectedPackage.set(pkg);
    this.payError.set(null);
    this.payStep.set('epayco-loading');

    try {
      const params = await this.packageService.createEpaycoPayment(pkg.id);
      this.payStep.set('epayco-opening');
      await this.openEpaycoCheckout(params);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al iniciar pago con ePayco';
      this.payError.set(msg);
      this.payStep.set('error');
    }
  }

  private loadEpaycoScript(): Promise<void> {
    return new Promise((resolve, reject) => {
      if ((window as unknown as Record<string, unknown>)['ePayco']) {
        resolve();
        return;
      }
      const script = document.createElement('script');
      script.src = 'https://checkout.epayco.co/checkout.js';
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('No se pudo cargar el script de ePayco'));
      document.head.appendChild(script);
    });
  }

  private async openEpaycoCheckout(params: Awaited<ReturnType<AdminPackageService['createEpaycoPayment']>>): Promise<void> {
    await this.loadEpaycoScript();

    const epayco = (window as unknown as Record<string, unknown>)['ePayco'] as {
      checkout: { configure: (cfg: unknown) => { open: (params: unknown) => void } };
    };

    const handler = epayco.checkout.configure({
      key:  params.publicKey,
      test: params.test,
    });

    handler.open({
      name:         params.name,
      description:  params.description,
      invoice:      params.invoice,
      currency:     params.currency,
      amount:       params.amount,
      tax_base:     params.tax_base,
      tax:          params.tax,
      country:      params.country,
      lang:         params.lang,
      external:     'true',           // redirect (similar a dLocal)
      confirmation: params.confirmation,
      response:     params.response,
      email_billing: params.email_billing,
      name_billing:  params.name_billing,
      extra1:        params.extra1,
      extra2:        params.extra2,
      extra3:        params.extra3,
    });
  }

  // ── Utilidades ────────────────────────────────────────────────────────────

  /** Precio COP directo del paquete (price_cop), sin calcular */
  getPriceCOP(pkg: Package | null): string {
    if (!pkg) return '';
    if (pkg.price_cop) return COP_FORMATTER.format(pkg.price_cop);
    return COP_FORMATTER.format(Math.round(pkg.price * 4200));
  }

  /** Precio USD directo del paquete (price en USD) */
  getPriceUSD(pkg: Package | null): string {
    if (!pkg) return '';
    return new Intl.NumberFormat('en-US', {
      style: 'currency', currency: 'USD',
      minimumFractionDigits: 0, maximumFractionDigits: 0
    }).format(pkg.price);
  }

  getDaysRemaining(): number {
    const expires = this.profile()?.package_expires_at;
    if (!expires) return 0;
    const diff = new Date(expires).getTime() - Date.now();
    return Math.max(0, Math.ceil(diff / 86400000));
  }

  formatPrice(price: number, sourceCurrency: string): string {
    const targetCode = this.currencyService.selectedCurrency().code;
    const decimals = ['COP', 'CLP', 'ARS', 'VES'].includes(targetCode) ? 0 : 2;
    if (sourceCurrency.toUpperCase() === 'COP') {
      return this.currencyService.formatFromCOP(price, decimals);
    }
    return this.currencyService.formatFromUSD(price, decimals);
  }

  formatExpiry(dateStr: string | null): string {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString('es-CO', {
      day: '2-digit', month: 'long', year: 'numeric'
    });
  }

  getTypeLabel(type: string): string {
    const map: Record<string, string> = {
      basic: 'Básico', premium: 'Premium', enterprise: 'Empresarial', custom: 'Personalizado'
    };
    return map[type] ?? type;
  }

  getTypeColorClass(type: string): string {
    const map: Record<string, string> = {
      basic:      'bg-blue-500/10 text-blue-400',
      premium:    'bg-primary/10 text-primary',
      enterprise: 'bg-amber-500/10 text-amber-400',
      custom:     'bg-violet-500/10 text-violet-400'
    };
    return map[type] ?? 'bg-white/10 text-slate-300';
  }

  getTypeAccentClass(type: string): string {
    const map: Record<string, string> = {
      basic:      'border-blue-500/30',
      premium:    'border-primary/30',
      enterprise: 'border-amber-500/30',
      custom:     'border-violet-500/30'
    };
    return map[type] ?? 'border-white/10';
  }

  getTypeIconColor(type: string): string {
    const map: Record<string, string> = {
      basic:      'text-blue-400',
      premium:    'text-primary',
      enterprise: 'text-amber-400',
      custom:     'text-violet-400'
    };
    return map[type] ?? 'text-slate-400';
  }

  isCurrentPackage(pkg: Package): boolean {
    return this.hasActivePackage() && this.profile()?.current_package_id === pkg.id;
  }

  getProgressPct(): number {
    const started = this.profile()?.package_started_at;
    const expires = this.profile()?.package_expires_at;
    if (!started || !expires) return 0;
    const total = new Date(expires).getTime() - new Date(started).getTime();
    const elapsed = Date.now() - new Date(started).getTime();
    return Math.min(100, Math.max(0, Math.round((elapsed / total) * 100)));
  }

  getBgGlowColor(type: string): string {
    const map: Record<string, string> = {
      basic: '#3b82f6', premium: '#00E5FF',
      enterprise: '#f59e0b', custom: '#8b5cf6',
    };
    return map[type] ?? '#ffffff';
  }

  getBadgeBg(type: string): string {
    const map: Record<string, string> = {
      basic: 'bg-blue-500/15 border-blue-500/30',
      premium: 'bg-primary/15 border-primary/30',
      enterprise: 'bg-amber-500/15 border-amber-500/30',
      custom: 'bg-violet-500/15 border-violet-500/30',
    };
    return map[type] ?? 'bg-white/10 border-white/20';
  }

  getProgressBarColor(type: string): string {
    const map: Record<string, string> = {
      basic: 'bg-blue-400', premium: 'bg-primary',
      enterprise: 'bg-amber-400', custom: 'bg-violet-400',
    };
    return map[type] ?? 'bg-white';
  }
}
