import { Component, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { CurrencyService } from '../../core/services/currency.service';

interface Tier {
  name: string;
  minReferrals: number;
  maxReferrals: number | null;
  ownClicksCOP: number;
  referralClicksCOP: number;
  monthlyEarningsCOP: number;
  color: string;
  bgGradient: string;
  icon: string;
  category: 'basic' | 'superior' | 'superior-plus';
  stars?: number;           // 1-5 para superior-plus
  dcReferrals?: number;     // cuántos DC en tu red se requieren
  commissionLevels?: number; // hasta qué nivel profundo llega la comisión
  deepNetworkCOP?: number;  // ganancias extra de redes profundas
}

@Component({
  selector: 'app-tiers',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './tiers.component.html',
  styleUrl: './tiers.component.scss'
})
export class TiersComponent {
  protected currencyService = inject(CurrencyService);
  protected readonly selectedTier = signal<Tier | null>(null);

  protected readonly formattedTiers = computed(() => {
    return this.tiers.map(tier => ({
      ...tier,
      ownClicks: this.currencyService.formatFromCOP(tier.ownClicksCOP),
      referralClicks: tier.category === 'superior-plus' || tier.maxReferrals === null
        ? `${this.currencyService.formatFromCOP(tier.referralClicksCOP)}+`
        : this.currencyService.formatFromCOP(tier.referralClicksCOP),
      monthlyEarnings: tier.category === 'superior-plus' || tier.maxReferrals === null
        ? `${this.currencyService.formatFromCOP(tier.monthlyEarningsCOP)}+`
        : this.currencyService.formatFromCOP(tier.monthlyEarningsCOP),
      deepNetwork: tier.deepNetworkCOP
        ? `${this.currencyService.formatFromCOP(tier.deepNetworkCOP)}+`
        : null,
      directNetwork: this.currencyService.formatFromCOP(3400000)
    }));
  });

  protected readonly basicTiers = computed(() => this.formattedTiers().filter(t => t.category === 'basic'));
  protected readonly superiorTiers = computed(() => this.formattedTiers().filter(t => t.category === 'superior'));
  protected readonly superiorPlusTiers = computed(() => this.formattedTiers().filter(t => t.category === 'superior-plus'));

  protected readonly selectedTierFormatted = computed(() => {
    const tier = this.selectedTier();
    if (!tier) return null;
    return {
      ...tier,
      ownClicks: this.currencyService.formatFromCOP(tier.ownClicksCOP),
      referralClicks: tier.category === 'superior-plus' || tier.maxReferrals === null
        ? `${this.currencyService.formatFromCOP(tier.referralClicksCOP)}+`
        : this.currencyService.formatFromCOP(tier.referralClicksCOP),
      monthlyEarnings: tier.category === 'superior-plus' || tier.maxReferrals === null
        ? `${this.currencyService.formatFromCOP(tier.monthlyEarningsCOP)}+`
        : this.currencyService.formatFromCOP(tier.monthlyEarningsCOP),
      deepNetwork: tier.deepNetworkCOP
        ? `${this.currencyService.formatFromCOP(tier.deepNetworkCOP)}+`
        : null,
      directNetwork: this.currencyService.formatFromCOP(3400000)
    };
  });

  protected readonly starsArray = (n: number) => Array.from({ length: n });

  // Values in COP (Colombian Pesos) - the base currency of the site
  protected readonly tiers: Tier[] = [
    // ── CATEGORÍA BÁSICA ──
    {
      name: 'JADE',
      minReferrals: 0,
      maxReferrals: 2,
      ownClicksCOP: 70000,
      referralClicksCOP: 28000,
      monthlyEarningsCOP: 98000,
      color: 'text-emerald-500',
      bgGradient: 'from-emerald-400 to-emerald-600',
      icon: 'diamond',
      category: 'basic'
    },
    {
      name: 'PERLA',
      minReferrals: 3,
      maxReferrals: 5,
      ownClicksCOP: 70000,
      referralClicksCOP: 138000,
      monthlyEarningsCOP: 208000,
      color: 'text-pink-400',
      bgGradient: 'from-pink-400 to-pink-600',
      icon: 'brightness_7',
      category: 'basic'
    },
    {
      name: 'ZAFIRO',
      minReferrals: 6,
      maxReferrals: 9,
      ownClicksCOP: 70000,
      referralClicksCOP: 576000,
      monthlyEarningsCOP: 646000,
      color: 'text-blue-400',
      bgGradient: 'from-blue-400 to-blue-600',
      icon: 'auto_awesome',
      category: 'basic'
    },
    {
      name: 'RUBY',
      minReferrals: 10,
      maxReferrals: 19,
      ownClicksCOP: 70000,
      referralClicksCOP: 1558000,
      monthlyEarningsCOP: 1628000,
      color: 'text-red-500',
      bgGradient: 'from-red-500 to-red-700',
      icon: 'local_fire_department',
      category: 'basic'
    },
    // ── CATEGORÍA SUPERIOR ──
    {
      name: 'ESMERALDA',
      minReferrals: 20,
      maxReferrals: 25,
      ownClicksCOP: 70000,
      referralClicksCOP: 2125000,
      monthlyEarningsCOP: 2195000,
      color: 'text-green-500',
      bgGradient: 'from-green-500 to-green-700',
      icon: 'park',
      category: 'superior'
    },
    {
      name: 'DIAMANTE',
      minReferrals: 26,
      maxReferrals: 30,
      ownClicksCOP: 70000,
      referralClicksCOP: 2550000,
      monthlyEarningsCOP: 2620000,
      color: 'text-cyan-400',
      bgGradient: 'from-cyan-400 to-cyan-600',
      icon: 'diamond',
      category: 'superior'
    },
    {
      name: 'DIAMANTE AZUL',
      minReferrals: 31,
      maxReferrals: 35,
      ownClicksCOP: 70000,
      referralClicksCOP: 2975000,
      monthlyEarningsCOP: 3045000,
      color: 'text-blue-400',
      bgGradient: 'from-blue-600 to-indigo-700',
      icon: 'water_drop',
      category: 'superior'
    },
    {
      name: 'DIAMANTE NEGRO',
      minReferrals: 36,
      maxReferrals: 39,
      ownClicksCOP: 70000,
      referralClicksCOP: 3315000,
      monthlyEarningsCOP: 3385000,
      color: 'text-gray-300',
      bgGradient: 'from-gray-600 to-gray-800',
      icon: 'dark_mode',
      category: 'superior'
    },
    {
      name: 'DIAMANTE CORONA',
      minReferrals: 40,
      maxReferrals: null,
      ownClicksCOP: 70000,
      referralClicksCOP: 3400000,
      monthlyEarningsCOP: 3470000,
      color: 'text-amber-400',
      bgGradient: 'from-amber-400 to-yellow-500',
      icon: 'military_tech',
      category: 'superior'
    },
    // ── CATEGORÍA SUPERIOR PLUS ──
    // Desbloqueo: ser DC + tener N referidos que también son DC
    // Comisión extra por clicks de la red profunda (nivel 2 en adelante)
    {
      name: 'CORONA',
      minReferrals: 40,
      maxReferrals: null,
      ownClicksCOP: 70000,
      referralClicksCOP: 4700000,
      monthlyEarningsCOP: 4770000,
      deepNetworkCOP: 1300000,
      color: 'text-yellow-300',
      bgGradient: 'from-yellow-300 to-amber-500',
      icon: 'military_tech',
      category: 'superior-plus',
      stars: 1,
      dcReferrals: 1,
      commissionLevels: 2
    },
    {
      name: 'CORONA',
      minReferrals: 40,
      maxReferrals: null,
      ownClicksCOP: 70000,
      referralClicksCOP: 6500000,
      monthlyEarningsCOP: 6570000,
      deepNetworkCOP: 3100000,
      color: 'text-yellow-200',
      bgGradient: 'from-yellow-200 to-yellow-500',
      icon: 'military_tech',
      category: 'superior-plus',
      stars: 2,
      dcReferrals: 2,
      commissionLevels: 3
    },
    {
      name: 'CORONA',
      minReferrals: 40,
      maxReferrals: null,
      ownClicksCOP: 70000,
      referralClicksCOP: 9000000,
      monthlyEarningsCOP: 9070000,
      deepNetworkCOP: 5600000,
      color: 'text-amber-300',
      bgGradient: 'from-amber-300 to-orange-500',
      icon: 'military_tech',
      category: 'superior-plus',
      stars: 3,
      dcReferrals: 3,
      commissionLevels: 4
    },
    {
      name: 'CORONA',
      minReferrals: 40,
      maxReferrals: null,
      ownClicksCOP: 70000,
      referralClicksCOP: 12500000,
      monthlyEarningsCOP: 12570000,
      deepNetworkCOP: 9100000,
      color: 'text-orange-300',
      bgGradient: 'from-orange-300 to-red-500',
      icon: 'military_tech',
      category: 'superior-plus',
      stars: 4,
      dcReferrals: 4,
      commissionLevels: 5
    },
    {
      name: 'CORONA',
      minReferrals: 40,
      maxReferrals: null,
      ownClicksCOP: 70000,
      referralClicksCOP: 17000000,
      monthlyEarningsCOP: 17070000,
      deepNetworkCOP: 13600000,
      color: 'text-rose-300',
      bgGradient: 'from-rose-300 via-amber-400 to-yellow-300',
      icon: 'military_tech',
      category: 'superior-plus',
      stars: 5,
      dcReferrals: 5,
      commissionLevels: 6
    }
  ];

  selectTier(tier: Tier): void {
    this.selectedTier.set(tier);
  }

  closeTierDetail(): void {
    this.selectedTier.set(null);
  }
}
