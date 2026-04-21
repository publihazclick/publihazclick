import {
  Component,
  inject,
  signal,
  computed,
  OnInit,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { ProfileService } from '../../../../core/services/profile.service';
import { CurrencyService } from '../../../../core/services/currency.service';

interface MegaReward {
  adType: string;
  quantity: number;
  rewardCOP: number;
}

interface PlatformTier {
  name: string;
  minReferrals: number;
  maxReferrals: number | null;
  ownClicksCOP: number;
  monthlyEarningsCOP: number;
  color: string;
  bgGradient: string;
  icon: string;
  bgColorClass: string;
  category: 'basic' | 'superior' | 'superior-plus';
  requiredPackage?: string;
  /** Desglose de clicks propios para tiers 20+ refs */
  ownAdsPerDay?: number;
  ownAdPriceCOP?: number;
  ownAdRetiroCOP?: number;
  ownAdDonacionCOP?: number;
  ownMiniPerDay?: number;
  ownMiniPriceCOP?: number;
  /** V2: Mega recompensas por compra de invitado */
  megaRewards: MegaReward[];
  megaRewardTotalCOP: number;
}

@Component({
  selector: 'app-calculator',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, RouterModule],
  templateUrl: './calculator.component.html',
})
export class CalculatorComponent implements OnInit {
  private readonly profileService = inject(ProfileService);
  readonly currencyService = inject(CurrencyService);

  readonly profile = this.profileService.profile;

  readonly PLATFORM_TIERS: PlatformTier[] = [
    {
      name: 'JADE', minReferrals: 1, maxReferrals: 2,
      ownClicksCOP: 70_000,
      color: 'text-emerald-500', bgGradient: 'from-emerald-400 to-emerald-600',
      bgColorClass: 'bg-emerald-500', icon: 'diamond', category: 'basic',
      megaRewards: [{ adType: 'mega_2000', quantity: 14, rewardCOP: 2_000 }],
      megaRewardTotalCOP: 28_000,
      monthlyEarningsCOP: 0, // se calcula dinámicamente
    },
    {
      name: 'PERLA', minReferrals: 3, maxReferrals: 5,
      ownClicksCOP: 70_000,
      color: 'text-pink-400', bgGradient: 'from-pink-400 to-pink-600',
      bgColorClass: 'bg-pink-400', icon: 'brightness_7', category: 'basic',
      megaRewards: [
        { adType: 'mega_5000', quantity: 8, rewardCOP: 5_000 },
        { adType: 'mega_2000', quantity: 3, rewardCOP: 2_000 },
      ],
      megaRewardTotalCOP: 46_000,
      monthlyEarningsCOP: 0,
    },
    {
      name: 'ZAFIRO', minReferrals: 6, maxReferrals: 9,
      ownClicksCOP: 70_000,
      color: 'text-blue-400', bgGradient: 'from-blue-400 to-blue-600',
      bgColorClass: 'bg-blue-400', icon: 'auto_awesome', category: 'basic',
      megaRewards: [
        { adType: 'mega_10000', quantity: 6, rewardCOP: 10_000 },
        { adType: 'mega_2000', quantity: 2, rewardCOP: 2_000 },
      ],
      megaRewardTotalCOP: 64_000,
      monthlyEarningsCOP: 0,
    },
    {
      name: 'RUBY', minReferrals: 10, maxReferrals: 19,
      ownClicksCOP: 70_000,
      color: 'text-red-500', bgGradient: 'from-red-500 to-red-700',
      bgColorClass: 'bg-red-500', icon: 'local_fire_department', category: 'basic',
      megaRewards: [
        { adType: 'mega_20000', quantity: 4, rewardCOP: 20_000 },
        { adType: 'mega_2000', quantity: 1, rewardCOP: 2_000 },
      ],
      megaRewardTotalCOP: 82_000,
      monthlyEarningsCOP: 0,
    },
    {
      name: 'ESMERALDA', minReferrals: 20, maxReferrals: 25,
      ownClicksCOP: 180_000,
      color: 'text-green-500', bgGradient: 'from-green-500 to-green-700',
      bgColorClass: 'bg-green-500', icon: 'park', category: 'superior',
      requiredPackage: 'enterprise',
      ownAdsPerDay: 5, ownAdPriceCOP: 1_130, ownAdRetiroCOP: 1_120, ownAdDonacionCOP: 10,
      ownMiniPerDay: 4, ownMiniPriceCOP: 100,
      megaRewards: [
        { adType: 'mega_20000', quantity: 4, rewardCOP: 20_000 },
        { adType: 'mega_5000', quantity: 1, rewardCOP: 5_000 },
      ],
      megaRewardTotalCOP: 85_000,
      monthlyEarningsCOP: 0,
    },
    {
      name: 'DIAMANTE', minReferrals: 26, maxReferrals: 30,
      ownClicksCOP: 180_000,
      color: 'text-cyan-400', bgGradient: 'from-cyan-400 to-cyan-600',
      bgColorClass: 'bg-cyan-400', icon: 'diamond', category: 'superior',
      requiredPackage: 'enterprise',
      ownAdsPerDay: 5, ownAdPriceCOP: 1_130, ownAdRetiroCOP: 1_120, ownAdDonacionCOP: 10,
      ownMiniPerDay: 4, ownMiniPriceCOP: 100,
      megaRewards: [
        { adType: 'mega_20000', quantity: 4, rewardCOP: 20_000 },
        { adType: 'mega_5000', quantity: 1, rewardCOP: 5_000 },
      ],
      megaRewardTotalCOP: 85_000,
      monthlyEarningsCOP: 0,
    },
    {
      name: 'DIAMANTE AZUL', minReferrals: 31, maxReferrals: 35,
      ownClicksCOP: 180_000,
      color: 'text-blue-400', bgGradient: 'from-blue-600 to-indigo-700',
      bgColorClass: 'bg-blue-600', icon: 'water_drop', category: 'superior',
      requiredPackage: 'enterprise',
      ownAdsPerDay: 5, ownAdPriceCOP: 1_130, ownAdRetiroCOP: 1_120, ownAdDonacionCOP: 10,
      ownMiniPerDay: 4, ownMiniPriceCOP: 100,
      megaRewards: [
        { adType: 'mega_20000', quantity: 4, rewardCOP: 20_000 },
        { adType: 'mega_5000', quantity: 1, rewardCOP: 5_000 },
      ],
      megaRewardTotalCOP: 85_000,
      monthlyEarningsCOP: 0,
    },
    {
      name: 'DIAMANTE NEGRO', minReferrals: 36, maxReferrals: 39,
      ownClicksCOP: 180_000,
      color: 'text-gray-300', bgGradient: 'from-gray-600 to-gray-800',
      bgColorClass: 'bg-gray-600', icon: 'dark_mode', category: 'superior',
      requiredPackage: 'enterprise',
      ownAdsPerDay: 5, ownAdPriceCOP: 1_130, ownAdRetiroCOP: 1_120, ownAdDonacionCOP: 10,
      ownMiniPerDay: 4, ownMiniPriceCOP: 100,
      megaRewards: [
        { adType: 'mega_20000', quantity: 4, rewardCOP: 20_000 },
        { adType: 'mega_5000', quantity: 1, rewardCOP: 5_000 },
      ],
      megaRewardTotalCOP: 85_000,
      monthlyEarningsCOP: 0,
    },
    {
      name: 'DIAMANTE CORONA', minReferrals: 40, maxReferrals: null,
      ownClicksCOP: 180_000,
      color: 'text-amber-400', bgGradient: 'from-amber-400 to-yellow-500',
      bgColorClass: 'bg-amber-400', icon: 'military_tech', category: 'superior',
      requiredPackage: 'enterprise',
      ownAdsPerDay: 5, ownAdPriceCOP: 1_130, ownAdRetiroCOP: 1_120, ownAdDonacionCOP: 10,
      ownMiniPerDay: 4, ownMiniPriceCOP: 100,
      megaRewards: [
        { adType: 'mega_20000', quantity: 4, rewardCOP: 20_000 },
        { adType: 'mega_5000', quantity: 1, rewardCOP: 5_000 },
      ],
      megaRewardTotalCOP: 85_000,
      monthlyEarningsCOP: 0,
    },
  ];

  readonly simulatedRefs = signal(1);

  readonly currentTier = computed<PlatformTier>(() => {
    const refs = this.simulatedRefs();
    for (let i = this.PLATFORM_TIERS.length - 1; i >= 0; i--) {
      if (refs >= this.PLATFORM_TIERS[i].minReferrals) return this.PLATFORM_TIERS[i];
    }
    return this.PLATFORM_TIERS[0];
  });

  readonly ownClicksEarningsCOP = computed(() => this.currentTier().ownClicksCOP);

  readonly isSuperiorTier = computed(() => this.currentTier().category === 'superior');

  // ── Desglose diario de clicks propios ──

  readonly ownAdsDaily = computed(() => {
    const tier = this.currentTier();
    if (tier.ownAdPriceCOP) return tier.ownAdsPerDay! * tier.ownAdPriceCOP;
    return 5 * 400;
  });

  readonly ownAdsDailyRetiro = computed(() => {
    const tier = this.currentTier();
    if (tier.ownAdRetiroCOP) return tier.ownAdsPerDay! * tier.ownAdRetiroCOP;
    return 5 * 400;
  });

  readonly ownAdsDailyDonacion = computed(() => {
    const tier = this.currentTier();
    if (tier.ownAdDonacionCOP) return tier.ownAdsPerDay! * tier.ownAdDonacionCOP;
    return 0;
  });

  readonly ownAdsMonthlyRetiro = computed(() => this.ownAdsDailyRetiro() * 30);
  readonly ownAdsMonthlyDonacion = computed(() => this.ownAdsDailyDonacion() * 30);

  readonly ownMiniDaily = computed(() => {
    const tier = this.currentTier();
    if (tier.ownMiniPriceCOP) return tier.ownMiniPerDay! * tier.ownMiniPriceCOP;
    return 4 * 83.33;
  });

  readonly ownMiniMonthly = computed(() => Math.round(this.ownMiniDaily() * 30));

  readonly ownRetiroCOP = computed(() => this.ownAdsMonthlyRetiro() + this.ownMiniMonthly());
  readonly ownDonacionCOP = computed(() => this.ownAdsMonthlyDonacion());

  // ── Desglose de ganancias por referidos (V2: mega recompensas por compra) ──

  /** Total de mega recompensas por TODOS los invitados que compren/renueven */
  readonly referralEarningsCOP = computed(() => {
    const tier = this.currentTier();
    return this.simulatedRefs() * tier.megaRewardTotalCOP;
  });

  readonly totalMonthlyCOP = computed(() => this.ownClicksEarningsCOP() + this.referralEarningsCOP());

  readonly maxMonthlyInTiers = computed(() => {
    const lastTier = this.PLATFORM_TIERS[this.PLATFORM_TIERS.length - 1];
    return lastTier.ownClicksCOP + 100 * lastTier.megaRewardTotalCOP;
  });

  tierBarWidth(tier: PlatformTier): number {
    const tierTotal = tier.ownClicksCOP + tier.minReferrals * tier.megaRewardTotalCOP;
    return Math.round((tierTotal / this.maxMonthlyInTiers()) * 100);
  }

  tierMonthlyEstimate(tier: PlatformTier): number {
    return tier.ownClicksCOP + tier.minReferrals * tier.megaRewardTotalCOP;
  }

  readonly numbers = Array.from({ length: 100 }, (_, i) => i + 1);

  readonly nextTier = computed<PlatformTier | null>(() => {
    const current = this.currentTier();
    const idx = this.PLATFORM_TIERS.findIndex((t) => t.name === current.name);
    return idx < this.PLATFORM_TIERS.length - 1 ? this.PLATFORM_TIERS[idx + 1] : null;
  });

  readonly progressToNextTier = computed<number>(() => {
    const current = this.currentTier();
    const next = this.nextTier();
    if (!next) return 100;
    const refs = this.simulatedRefs();
    const span = next.minReferrals - current.minReferrals;
    const done = refs - current.minReferrals;
    return Math.round((done / span) * 100);
  });

  setSimulatedRefs(event: Event): void {
    const val = Number((event.target as HTMLSelectElement).value);
    this.simulatedRefs.set(Math.max(1, Math.min(100, val)));
  }

  ngOnInit(): void {
    this.loadProfile();
  }

  private async loadProfile(): Promise<void> {
    try {
      if (!this.profileService.profile()) {
        await this.profileService.getCurrentProfile();
      }
      const refs = this.profile()?.total_referrals_count;
      if (refs && refs > 0) this.simulatedRefs.set(Math.min(refs, 100));
    } catch {}
  }

}
