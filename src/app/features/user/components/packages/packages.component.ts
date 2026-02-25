import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ProfileService } from '../../../../core/services/profile.service';
import { AdminPackageService } from '../../../../core/services/admin-package.service';
import { CurrencyService } from '../../../../core/services/currency.service';
import type { Package } from '../../../../core/models/admin.model';
import type { Profile } from '../../../../core/models/profile.model';
import { environment } from '../../../../../environments/environment';

@Component({
  selector: 'app-user-packages',
  standalone: true,
  imports: [CommonModule],
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

  getWhatsAppUrl(pkg: Package): string {
    const message = encodeURIComponent(
      `Hola! Me interesa adquirir el paquete *${pkg.name}* en Publihazclik. ¿Me pueden dar más información?`
    );
    return `https://wa.me/${environment.whatsappNumber}?text=${message}`;
  }

  getDaysRemaining(): number {
    const expires = this.profile()?.package_expires_at;
    if (!expires) return 0;
    const diff = new Date(expires).getTime() - Date.now();
    return Math.max(0, Math.ceil(diff / 86400000));
  }

  formatPrice(price: number, sourceCurrency: string): string {
    const targetCode = this.currencyService.selectedCurrency().code;
    // Monedas sin centavos: 0 decimales; resto: 2
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

  /** Porcentaje de tiempo consumido del paquete (0–100) */
  getProgressPct(): number {
    const started = this.profile()?.package_started_at;
    const expires = this.profile()?.package_expires_at;
    if (!started || !expires) return 0;
    const total = new Date(expires).getTime() - new Date(started).getTime();
    const elapsed = Date.now() - new Date(started).getTime();
    return Math.min(100, Math.max(0, Math.round((elapsed / total) * 100)));
  }

  /** Color de fondo del glow según tipo de paquete */
  getBgGlowColor(type: string): string {
    const map: Record<string, string> = {
      basic: '#3b82f6',
      premium: '#00E5FF',
      enterprise: '#f59e0b',
      custom: '#8b5cf6',
    };
    return map[type] ?? '#ffffff';
  }

  /** Clase de fondo del ícono badge */
  getBadgeBg(type: string): string {
    const map: Record<string, string> = {
      basic: 'bg-blue-500/15 border-blue-500/30',
      premium: 'bg-primary/15 border-primary/30',
      enterprise: 'bg-amber-500/15 border-amber-500/30',
      custom: 'bg-violet-500/15 border-violet-500/30',
    };
    return map[type] ?? 'bg-white/10 border-white/20';
  }

  /** Color de la barra de progreso */
  getProgressBarColor(type: string): string {
    const map: Record<string, string> = {
      basic: 'bg-blue-400',
      premium: 'bg-primary',
      enterprise: 'bg-amber-400',
      custom: 'bg-violet-400',
    };
    return map[type] ?? 'bg-white';
  }
}
