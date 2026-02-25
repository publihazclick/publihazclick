import { Component, inject, signal, OnInit, ChangeDetectionStrategy, PLATFORM_ID, input } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AdminPackageService } from '../../core/services/admin-package.service';
import type { Package } from '../../core/models/admin.model';

type PayStep = 'idle' | 'redirect' | 'confirm' | 'submitting' | 'approved' | 'sent';

const COP_FORMATTER = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

@Component({
  selector: 'app-package-promo-modal',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, RouterModule, FormsModule],
  templateUrl: './package-promo-modal.component.html',
})
export class PackagePromoModalComponent implements OnInit {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly packageService = inject(AdminPackageService);

  /** Ruta del botón "Ver todos los paquetes". Por defecto /register (landing). */
  readonly packagesRoute = input('/register');

  readonly visible = signal(false);
  readonly packages = signal<Package[]>([]);

  // Payment flow
  readonly selectedPackage = signal<Package | null>(null);
  readonly payStep = signal<PayStep>('idle');
  readonly payError = signal<string | null>(null);
  readonly verifyMessage = signal<string>('');

  proofPhone = '';
  proofTransactionId = '';

  ngOnInit(): void {
    if (isPlatformBrowser(this.platformId)) {
      this.visible.set(true);
      this.loadPackages();
    }
  }

  private async loadPackages(): Promise<void> {
    try {
      const pkgs = await this.packageService.getPackages();
      this.packages.set(
        pkgs.filter(p => p.is_active).sort((a, b) => a.display_order - b.display_order).slice(0, 2)
      );
    } catch { /* silencioso */ }
  }

  close(): void {
    this.payStep.set('idle');
    this.selectedPackage.set(null);
    this.payError.set(null);
    this.verifyMessage.set('');
    this.proofPhone = '';
    this.proofTransactionId = '';
    this.visible.set(false);
  }

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

  backToPackages(): void {
    this.payStep.set('idle');
    this.selectedPackage.set(null);
    this.payError.set(null);
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

    const copAmount = pkg.price_cop ?? Math.round(pkg.price * 4200);
    const amountInCents = copAmount * 100;

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
    this.payStep.set(result.autoApproved ? 'approved' : 'sent');
  }

  getPriceCOP(pkg: Package | null): string {
    if (!pkg) return '';
    if (pkg.price_cop) return COP_FORMATTER.format(pkg.price_cop);
    return COP_FORMATTER.format(Math.round(pkg.price * 4200));
  }

  getPriceUSD(pkg: Package | null): string {
    if (!pkg) return '';
    return new Intl.NumberFormat('en-US', {
      style: 'currency', currency: 'USD',
      minimumFractionDigits: 0, maximumFractionDigits: 0,
    }).format(pkg.price);
  }

  isRecommended(pkg: Package): boolean {
    return pkg.package_type === 'premium';
  }

  getPackageIcon(type: string): string {
    const map: Record<string, string> = {
      basic: 'star', premium: 'auto_awesome', enterprise: 'diamond', custom: 'workspace_premium',
    };
    return map[type] ?? 'star';
  }

  getColorClass(type: string): string {
    return type === 'premium' ? 'text-primary' : 'text-slate-300';
  }

  getBorderClass(type: string): string {
    return type === 'premium' ? 'border-primary/40' : 'border-white/10';
  }

  getBgGradient(type: string): string {
    return type === 'premium' ? 'from-primary/10 to-transparent' : 'from-white/5 to-transparent';
  }

  getFeaturesList(features: string[] | string | null): string[] {
    if (!features) return [];
    if (Array.isArray(features)) return features;
    try { return JSON.parse(features as string); } catch { return []; }
  }
}
