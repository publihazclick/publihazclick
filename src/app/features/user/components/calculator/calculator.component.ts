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
  commissionPerStd400?: number;
  miniSlotsPerInvitee?: number;
  requiredPackage?: string;
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
      name: 'JADE',
      minReferrals: 1,
      maxReferrals: 2,
      ownClicksCOP: 70_000,
      referralClicksCOP: 28_000,
      monthlyEarningsCOP: 98_000,
      color: 'text-emerald-500',
      bgGradient: 'from-emerald-400 to-emerald-600',
      bgColorClass: 'bg-emerald-500',
      icon: 'diamond',
      category: 'basic',
      commissionPerStd400: 100,
      miniSlotsPerInvitee: 1,
    },
    {
      name: 'PERLA',
      minReferrals: 3,
      maxReferrals: 5,
      ownClicksCOP: 70_000,
      referralClicksCOP: 138_000,
      monthlyEarningsCOP: 208_000,
      color: 'text-pink-400',
      bgGradient: 'from-pink-400 to-pink-600',
      bgColorClass: 'bg-pink-400',
      icon: 'brightness_7',
      category: 'basic',
      commissionPerStd400: 200,
      miniSlotsPerInvitee: 2,
    },
    {
      name: 'ZAFIRO',
      minReferrals: 6,
      maxReferrals: 9,
      ownClicksCOP: 70_000,
      referralClicksCOP: 384_000,
      monthlyEarningsCOP: 454_000,
      color: 'text-blue-400',
      bgGradient: 'from-blue-400 to-blue-600',
      bgColorClass: 'bg-blue-400',
      icon: 'auto_awesome',
      category: 'basic',
      commissionPerStd400: 300,
      miniSlotsPerInvitee: 3,
    },
    {
      name: 'RUBY',
      minReferrals: 10,
      maxReferrals: 19,
      ownClicksCOP: 70_000,
      referralClicksCOP: 820_000,
      monthlyEarningsCOP: 890_000,
      color: 'text-red-500',
      bgGradient: 'from-red-500 to-red-700',
      bgColorClass: 'bg-red-500',
      icon: 'local_fire_department',
      category: 'basic',
      commissionPerStd400: 400,
      miniSlotsPerInvitee: 4,
    },
    {
      name: 'ESMERALDA',
      minReferrals: 20,
      maxReferrals: 25,
      ownClicksCOP: 180_000,
      referralClicksCOP: 1_700_000,
      monthlyEarningsCOP: 1_880_000,
      color: 'text-green-500',
      bgGradient: 'from-green-500 to-green-700',
      bgColorClass: 'bg-green-500',
      icon: 'park',
      category: 'superior',
      commissionPerStd400: 400,
      miniSlotsPerInvitee: 5,
      requiredPackage: 'enterprise',
    },
    {
      name: 'DIAMANTE',
      minReferrals: 26,
      maxReferrals: 30,
      ownClicksCOP: 180_000,
      referralClicksCOP: 2_210_000,
      monthlyEarningsCOP: 2_390_000,
      color: 'text-cyan-400',
      bgGradient: 'from-cyan-400 to-cyan-600',
      bgColorClass: 'bg-cyan-400',
      icon: 'diamond',
      category: 'superior',
      commissionPerStd400: 400,
      miniSlotsPerInvitee: 5,
      requiredPackage: 'enterprise',
    },
    {
      name: 'DIAMANTE AZUL',
      minReferrals: 31,
      maxReferrals: 35,
      ownClicksCOP: 180_000,
      referralClicksCOP: 2_635_000,
      monthlyEarningsCOP: 2_815_000,
      color: 'text-blue-400',
      bgGradient: 'from-blue-600 to-indigo-700',
      bgColorClass: 'bg-blue-600',
      icon: 'water_drop',
      category: 'superior',
      commissionPerStd400: 400,
      miniSlotsPerInvitee: 5,
      requiredPackage: 'enterprise',
    },
    {
      name: 'DIAMANTE NEGRO',
      minReferrals: 36,
      maxReferrals: 39,
      ownClicksCOP: 180_000,
      referralClicksCOP: 3_060_000,
      monthlyEarningsCOP: 3_240_000,
      color: 'text-gray-300',
      bgGradient: 'from-gray-600 to-gray-800',
      bgColorClass: 'bg-gray-600',
      icon: 'dark_mode',
      category: 'superior',
      commissionPerStd400: 400,
      miniSlotsPerInvitee: 5,
      requiredPackage: 'enterprise',
    },
    {
      name: 'DIAMANTE CORONA',
      minReferrals: 40,
      maxReferrals: null,
      ownClicksCOP: 180_000,
      referralClicksCOP: 3_400_000,
      monthlyEarningsCOP: 3_580_000,
      color: 'text-amber-400',
      bgGradient: 'from-amber-400 to-yellow-500',
      bgColorClass: 'bg-amber-400',
      icon: 'military_tech',
      category: 'superior',
      commissionPerStd400: 400,
      miniSlotsPerInvitee: 5,
      requiredPackage: 'enterprise',
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

  readonly std400CommissionCOP = computed(() => {
    const tier = this.currentTier();
    if (!tier.commissionPerStd400) return 0;
    return this.simulatedRefs() * 5 * tier.commissionPerStd400 * 30;
  });

  readonly miniReferralCOP = computed(() => {
    const tier = this.currentTier();
    if (!tier.miniSlotsPerInvitee) return 0;
    return this.simulatedRefs() * tier.miniSlotsPerInvitee * 100 * 30;
  });

  readonly activationBonusCOP = computed(() => {
    const tier = this.currentTier();
    if (!tier.commissionPerStd400 && tier.category !== 'basic') return 0;
    return this.simulatedRefs() * 10_000;
  });

  readonly referralEarningsCOP = computed(() => {
    const tier = this.currentTier();
    if (tier.commissionPerStd400) {
      return this.std400CommissionCOP() + this.miniReferralCOP() + this.activationBonusCOP();
    }
    return tier.referralClicksCOP;
  });

  readonly totalMonthlyCOP = computed(() => this.ownClicksEarningsCOP() + this.referralEarningsCOP());

  readonly maxMonthlyInTiers = this.PLATFORM_TIERS[this.PLATFORM_TIERS.length - 1].monthlyEarningsCOP;

  tierBarWidth(tier: PlatformTier): number {
    return Math.round((tier.monthlyEarningsCOP / this.maxMonthlyInTiers) * 100);
  }

  readonly numbers = Array.from({ length: 40 }, (_, i) => i + 1);

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
    this.simulatedRefs.set(Math.max(1, Math.min(40, val)));
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
      if (refs && refs > 0) this.simulatedRefs.set(Math.min(refs, 40));
    } catch {}
  }

}
