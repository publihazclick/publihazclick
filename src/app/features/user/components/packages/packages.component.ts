import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ProfileService } from '../../../../core/services/profile.service';
import { AdminPackageService } from '../../../../core/services/admin-package.service';
import { CurrencyService } from '../../../../core/services/currency.service';
import type { Package } from '../../../../core/models/admin.model';
import type { Profile } from '../../../../core/models/profile.model';

// Estado del flujo de pago Nequi
type PayStep = 'idle' | 'redirect' | 'confirm' | 'submitting' | 'approved' | 'sent' | 'error';

// Tasa COP/USD fija (Nequi links tienen monto fijo en COP)
const COP_RATE = 4200;

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
  private readonly profileService = inject(ProfileService);
  private readonly packageService = inject(AdminPackageService);
  private readonly currencyService = inject(CurrencyService);

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
    } catch {
      this.error.set('No se pudieron cargar los paquetes. Intenta de nuevo.');
    } finally {
      this.loading.set(false);
    }
  }

  // ── Pago Nequi ────────────────────────────────────────────────────────────

  openNequiPayment(pkg: Package): void {
    if (!pkg.nequi_payment_link) return;
    this.selectedPackage.set(pkg);
    this.proofPhone = '';
    this.proofTransactionId = '';
    this.payError.set(null);
    this.verifyMessage.set('');
    this.payStep.set('redirect');
  }

  goToNequiLink(): void {
    const link = this.selectedPackage()?.nequi_payment_link;
    if (!link) return;
    window.open(link, '_blank', 'noopener,noreferrer');
    this.payStep.set('confirm');
  }

  closePaymentModal(): void {
    // Si fue aprobado automáticamente, recargar el perfil para reflejar el paquete
    if (this.payStep() === 'approved') {
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

    const amountInCents = Math.round(pkg.price * COP_RATE) * 100;

    const result = await this.packageService.verifyAndSubmitPayment({
      packageId: pkg.id,
      packageName: pkg.name,
      amountInCents,
      phoneNumber: phone,
      transactionId: this.proofTransactionId.trim(),
    });

    if (!result.success) {
      this.payError.set(result.message);
      this.payStep.set('confirm');
      return;
    }

    this.verifyMessage.set(result.message);

    if (result.autoApproved) {
      // Pago verificado automáticamente por Wompi → paquete activo de inmediato
      this.payStep.set('approved');
    } else {
      // Comprobante enviado → revisión manual por el admin
      this.payStep.set('sent');
    }
  }

  private async reloadProfile(): Promise<void> {
    try {
      const profile = await this.profileService.getCurrentProfile();
      this.profile.set(profile);
      const packages = await this.packageService.getPackages();
      this.packages.set(packages);
    } catch { /* silencioso */ }
  }

  // ── Utilidades ────────────────────────────────────────────────────────────

  /** Precio en COP equivalente al precio USD del paquete */
  getPriceCOP(usdPrice: number): string {
    return COP_FORMATTER.format(Math.round(usdPrice * COP_RATE));
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
