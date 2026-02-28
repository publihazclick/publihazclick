import { Component, inject, signal, OnInit, ChangeDetectionStrategy, PLATFORM_ID, input } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { RouterModule } from '@angular/router';
import { AdminPackageService } from '../../core/services/admin-package.service';
import type { Package } from '../../core/models/admin.model';

type PayStep = 'idle' | 'dlocal-loading' | 'error';

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
  imports: [CommonModule, RouterModule],
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
    this.visible.set(false);
  }

  /** Inicia pago con dLocal Go */
  async startDlocalCheckout(pkg: Package): Promise<void> {
    this.selectedPackage.set(pkg);
    this.payError.set(null);
    this.payStep.set('dlocal-loading');
    try {
      const { url } = await this.packageService.createDlocalPayment(pkg.id);
      window.location.href = url;
    } catch (e: any) {
      this.payError.set(e.message ?? 'Error al iniciar pago con dLocal');
      this.payStep.set('error');
    }
  }

  retryCheckout(): void {
    const pkg = this.selectedPackage();
    if (pkg) this.startDlocalCheckout(pkg);
  }

  backToPackages(): void {
    this.payStep.set('idle');
    this.selectedPackage.set(null);
    this.payError.set(null);
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
