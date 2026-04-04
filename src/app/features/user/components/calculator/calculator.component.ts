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

interface PlatformTier {
  name: string;
  minReferrals: number;
  maxReferrals: number | null;
  ownClicksCOP: number;
  referralClicksCOP: number;
  monthlyEarningsCOP: number;
  color: string;
  bgGradient: string;
  icon: string;
  bgColorClass: string;
  category: 'basic' | 'superior' | 'superior-plus';
  dailyPtcLimit: number;
  referralBonusPct: number;
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

  // Valores base reales del sistema PTC
  // Promedio por click: ~400 COP (std_400)
  // Ganancias propias = dailyPtcLimit × 400 COP × 30 días
  // Ganancias por referido = referralBonusPct × ganancias_propias_referido × nRefs
  // (asumiendo cada referido gana lo mismo que un Novato: 5 clicks × 400 × 30 = 60,000)
  private readonly BASE_REF_EARNINGS = 60_000; // lo que gana un referido promedio/mes

  readonly PLATFORM_TIERS: PlatformTier[] = [
    {
      name: 'NOVATO',
      minReferrals: 1,
      maxReferrals: 4,
      ownClicksCOP: 60_000,       // 5 clicks × 400 × 30
      referralClicksCOP: 3_000,   // 5% × 60,000 × 1 ref
      monthlyEarningsCOP: 63_000,
      color: 'text-emerald-500',
      bgGradient: 'from-emerald-400 to-emerald-600',
      bgColorClass: 'bg-emerald-500',
      icon: 'diamond',
      category: 'basic',
      dailyPtcLimit: 5,
      referralBonusPct: 5,
    },
    {
      name: 'AFILIADO',
      minReferrals: 5,
      maxReferrals: 14,
      ownClicksCOP: 120_000,      // 10 clicks × 400 × 30
      referralClicksCOP: 30_000,  // 10% × 60,000 × 5 refs
      monthlyEarningsCOP: 150_000,
      color: 'text-pink-400',
      bgGradient: 'from-pink-400 to-pink-600',
      bgColorClass: 'bg-pink-400',
      icon: 'brightness_7',
      category: 'basic',
      dailyPtcLimit: 10,
      referralBonusPct: 10,
    },
    {
      name: 'PROMOTOR',
      minReferrals: 15,
      maxReferrals: 29,
      ownClicksCOP: 180_000,      // 15 clicks × 400 × 30
      referralClicksCOP: 135_000, // 15% × 60,000 × 15 refs
      monthlyEarningsCOP: 315_000,
      color: 'text-blue-400',
      bgGradient: 'from-blue-400 to-blue-600',
      bgColorClass: 'bg-blue-400',
      icon: 'auto_awesome',
      category: 'basic',
      dailyPtcLimit: 15,
      referralBonusPct: 15,
    },
    {
      name: 'INFLUENCER',
      minReferrals: 30,
      maxReferrals: 49,
      ownClicksCOP: 300_000,      // 25 clicks × 400 × 30
      referralClicksCOP: 360_000, // 20% × 60,000 × 30 refs
      monthlyEarningsCOP: 660_000,
      color: 'text-red-500',
      bgGradient: 'from-red-500 to-red-700',
      bgColorClass: 'bg-red-500',
      icon: 'local_fire_department',
      category: 'basic',
      dailyPtcLimit: 25,
      referralBonusPct: 20,
    },
    {
      name: 'EMBAJADOR',
      minReferrals: 50,
      maxReferrals: 99,
      ownClicksCOP: 600_000,      // 50 clicks × 400 × 30
      referralClicksCOP: 750_000, // 25% × 60,000 × 50 refs
      monthlyEarningsCOP: 1_350_000,
      color: 'text-green-500',
      bgGradient: 'from-green-500 to-green-700',
      bgColorClass: 'bg-green-500',
      icon: 'park',
      category: 'superior',
      dailyPtcLimit: 50,
      referralBonusPct: 25,
    },
    {
      name: 'LÍDER',
      minReferrals: 100,
      maxReferrals: 199,
      ownClicksCOP: 900_000,      // 75 clicks × 400 × 30
      referralClicksCOP: 1_800_000, // 30% × 60,000 × 100 refs
      monthlyEarningsCOP: 2_700_000,
      color: 'text-cyan-400',
      bgGradient: 'from-cyan-400 to-cyan-600',
      bgColorClass: 'bg-cyan-400',
      icon: 'diamond',
      category: 'superior',
      dailyPtcLimit: 75,
      referralBonusPct: 30,
    },
    {
      name: 'MAESTRO',
      minReferrals: 200,
      maxReferrals: 499,
      ownClicksCOP: 1_200_000,    // 100 clicks × 400 × 30
      referralClicksCOP: 4_200_000, // 35% × 60,000 × 200 refs
      monthlyEarningsCOP: 5_400_000,
      color: 'text-blue-400',
      bgGradient: 'from-blue-600 to-indigo-700',
      bgColorClass: 'bg-blue-600',
      icon: 'water_drop',
      category: 'superior',
      dailyPtcLimit: 100,
      referralBonusPct: 35,
    },
    {
      name: 'VIP',
      minReferrals: 500,
      maxReferrals: null,
      ownClicksCOP: 2_400_000,    // 200 clicks × 400 × 30
      referralClicksCOP: 15_000_000, // 50% × 60,000 × 500 refs
      monthlyEarningsCOP: 17_400_000,
      color: 'text-amber-400',
      bgGradient: 'from-amber-400 to-yellow-500',
      bgColorClass: 'bg-amber-400',
      icon: 'military_tech',
      category: 'superior',
      dailyPtcLimit: 200,
      referralBonusPct: 50,
    },
  ];

  readonly simulatedRefs = signal(5);

  readonly currentTier = computed<PlatformTier>(() => {
    const refs = this.simulatedRefs();
    for (let i = this.PLATFORM_TIERS.length - 1; i >= 0; i--) {
      if (refs >= this.PLATFORM_TIERS[i].minReferrals) return this.PLATFORM_TIERS[i];
    }
    return this.PLATFORM_TIERS[0];
  });

  // Ganancias propias: dailyPtcLimit × 400 COP promedio × 30 días
  readonly ownClicksEarningsCOP = computed(() => {
    const tier = this.currentTier();
    return tier.dailyPtcLimit * 400 * 30;
  });

  // Ganancias por referidos: referralBonusPct% × ganancias_base_referido × nRefs
  readonly referralEarningsCOP = computed(() => {
    const tier = this.currentTier();
    const refs = this.simulatedRefs();
    return Math.round(this.BASE_REF_EARNINGS * (tier.referralBonusPct / 100) * refs);
  });

  readonly totalMonthlyCOP = computed(() => this.ownClicksEarningsCOP() + this.referralEarningsCOP());

  readonly maxMonthlyInTiers = this.PLATFORM_TIERS[this.PLATFORM_TIERS.length - 1].monthlyEarningsCOP;

  tierBarWidth(tier: PlatformTier): number {
    return Math.round((tier.monthlyEarningsCOP / this.maxMonthlyInTiers) * 100);
  }

  readonly numbers = [1, 2, 3, 4, 5, 10, 15, 20, 30, 50, 75, 100, 150, 200, 300, 500];

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
    this.simulatedRefs.set(Math.max(1, Math.min(500, val)));
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
      if (refs && refs > 0) this.simulatedRefs.set(Math.min(refs, 500));
    } catch {}
  }

}
