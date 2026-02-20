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

  // Computed property that reacts to currency changes
  protected readonly formattedTiers = computed(() => {
    return this.tiers.map(tier => ({
      ...tier,
      ownClicks: this.currencyService.formatFromCOP(tier.ownClicksCOP),
      referralClicks: tier.maxReferrals === null 
        ? `${this.currencyService.formatFromCOP(tier.referralClicksCOP)}+`
        : this.currencyService.formatFromCOP(tier.referralClicksCOP),
      monthlyEarnings: tier.maxReferrals === null 
        ? `${this.currencyService.formatFromCOP(tier.monthlyEarningsCOP)}+`
        : this.currencyService.formatFromCOP(tier.monthlyEarningsCOP)
    }));
  });

  protected readonly selectedTierFormatted = computed(() => {
    const tier = this.selectedTier();
    if (!tier) return null;
    return {
      ...tier,
      ownClicks: this.currencyService.formatFromCOP(tier.ownClicksCOP),
      referralClicks: tier.maxReferrals === null 
        ? `${this.currencyService.formatFromCOP(tier.referralClicksCOP)}+`
        : this.currencyService.formatFromCOP(tier.referralClicksCOP),
      monthlyEarnings: tier.maxReferrals === null 
        ? `${this.currencyService.formatFromCOP(tier.monthlyEarningsCOP)}+`
        : this.currencyService.formatFromCOP(tier.monthlyEarningsCOP)
    };
  });

  // Values in COP (Colombian Pesos) - the base currency of the site
  protected readonly tiers: Tier[] = [
    {
      name: 'JADE',
      minReferrals: 0,
      maxReferrals: 2,
      ownClicksCOP: 70000,
      referralClicksCOP: 28000,
      monthlyEarningsCOP: 98000,
      color: 'text-emerald-500',
      bgGradient: 'from-emerald-400 to-emerald-600',
      icon: 'diamond'
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
      icon: 'brightness_7'
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
      icon: 'auto_awesome'
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
      icon: 'local_fire_department'
    },
    {
      name: 'ESMERALDA',
      minReferrals: 20,
      maxReferrals: 25,
      ownClicksCOP: 70000,
      referralClicksCOP: 2125000,
      monthlyEarningsCOP: 2195000,
      color: 'text-green-500',
      bgGradient: 'from-green-500 to-green-700',
      icon: 'park'
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
      icon: 'diamond'
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
      icon: 'water_drop'
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
      icon: 'dark_mode'
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
      icon: 'military_tech'
    }
  ];

  selectTier(tier: Tier): void {
    this.selectedTier.set(tier);
  }

  closeTierDetail(): void {
    this.selectedTier.set(null);
  }
}
