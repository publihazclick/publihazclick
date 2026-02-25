import {
  Component,
  inject,
  signal,
  computed,
  OnInit,
  OnDestroy,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { ProfileService } from '../../../../core/services/profile.service';
import { CurrencyService } from '../../../../core/services/currency.service';
import { WalletStateService } from '../../../../core/services/wallet-state.service';
import { BannerSliderComponent } from '../../../../components/banner-slider/banner-slider.component';
import type { Profile } from '../../../../core/models/profile.model';

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
  // Derived Tailwind bg class for icon containers (first color stop of gradient)
  bgColorClass: string;
}

@Component({
  selector: 'app-user-dashboard',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, RouterModule, BannerSliderComponent],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
})
export class UserDashboardComponent implements OnInit, OnDestroy {
  private readonly profileService = inject(ProfileService);
  readonly currencyService = inject(CurrencyService);
  readonly walletState = inject(WalletStateService);

  readonly profile = signal<Profile | null>(null);

  // ─── Platform Tiers (mirrors tiers.component.ts) ────────────────────────────

  readonly PLATFORM_TIERS: PlatformTier[] = [
    {
      name: 'JADE',
      minReferrals: 0,
      maxReferrals: 2,
      ownClicksCOP: 70_000,
      referralClicksCOP: 28_000,
      monthlyEarningsCOP: 98_000,
      color: 'text-emerald-500',
      bgGradient: 'from-emerald-400 to-emerald-600',
      bgColorClass: 'bg-emerald-500',
      icon: 'diamond',
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
    },
    {
      name: 'ZAFIRO',
      minReferrals: 6,
      maxReferrals: 9,
      ownClicksCOP: 70_000,
      referralClicksCOP: 576_000,
      monthlyEarningsCOP: 646_000,
      color: 'text-blue-400',
      bgGradient: 'from-blue-400 to-blue-600',
      bgColorClass: 'bg-blue-400',
      icon: 'auto_awesome',
    },
    {
      name: 'RUBY',
      minReferrals: 10,
      maxReferrals: 19,
      ownClicksCOP: 70_000,
      referralClicksCOP: 1_558_000,
      monthlyEarningsCOP: 1_628_000,
      color: 'text-red-500',
      bgGradient: 'from-red-500 to-red-700',
      bgColorClass: 'bg-red-500',
      icon: 'local_fire_department',
    },
    {
      name: 'ESMERALDA',
      minReferrals: 20,
      maxReferrals: 25,
      ownClicksCOP: 70_000,
      referralClicksCOP: 2_125_000,
      monthlyEarningsCOP: 2_195_000,
      color: 'text-green-500',
      bgGradient: 'from-green-500 to-green-700',
      bgColorClass: 'bg-green-500',
      icon: 'park',
    },
    {
      name: 'DIAMANTE',
      minReferrals: 26,
      maxReferrals: 30,
      ownClicksCOP: 70_000,
      referralClicksCOP: 2_550_000,
      monthlyEarningsCOP: 2_620_000,
      color: 'text-cyan-400',
      bgGradient: 'from-cyan-400 to-cyan-600',
      bgColorClass: 'bg-cyan-400',
      icon: 'diamond',
    },
    {
      name: 'DIAMANTE AZUL',
      minReferrals: 31,
      maxReferrals: 35,
      ownClicksCOP: 70_000,
      referralClicksCOP: 2_975_000,
      monthlyEarningsCOP: 3_045_000,
      color: 'text-blue-400',
      bgGradient: 'from-blue-600 to-indigo-700',
      bgColorClass: 'bg-blue-600',
      icon: 'water_drop',
    },
    {
      name: 'DIAMANTE NEGRO',
      minReferrals: 36,
      maxReferrals: 39,
      ownClicksCOP: 70_000,
      referralClicksCOP: 3_315_000,
      monthlyEarningsCOP: 3_385_000,
      color: 'text-gray-300',
      bgGradient: 'from-gray-600 to-gray-800',
      bgColorClass: 'bg-gray-600',
      icon: 'dark_mode',
    },
    {
      name: 'DIAMANTE CORONA',
      minReferrals: 40,
      maxReferrals: null,
      ownClicksCOP: 70_000,
      referralClicksCOP: 3_400_000,
      monthlyEarningsCOP: 3_470_000,
      color: 'text-amber-400',
      bgGradient: 'from-amber-400 to-yellow-500',
      bgColorClass: 'bg-amber-400',
      icon: 'military_tech',
    },
  ];

  // ─── Earnings Calculator ────────────────────────────────────────────────────

  readonly simulatedRefs = signal(5);

  /** Resolve which tier the current slider value falls into. */
  readonly currentTier = computed<PlatformTier>(() => {
    const refs = this.simulatedRefs();
    // Walk tiers in descending order to find the highest qualifying tier
    for (let i = this.PLATFORM_TIERS.length - 1; i >= 0; i--) {
      if (refs >= this.PLATFORM_TIERS[i].minReferrals) {
        return this.PLATFORM_TIERS[i];
      }
    }
    return this.PLATFORM_TIERS[0];
  });

  /** Total monthly earnings (COP) for the current simulated tier. */
  readonly totalMonthlyCOP = computed(() => this.currentTier().monthlyEarningsCOP);

  /** Referral-only portion (COP). */
  readonly referralEarningsCOP = computed(() => this.currentTier().referralClicksCOP);

  /** Own clicks portion (COP) — constant $70,000 across all tiers. */
  readonly ownClicksEarningsCOP = computed(() => this.currentTier().ownClicksCOP);

  /** Bar widths as percentages relative to the maximum tier monthly. */
  readonly maxMonthlyInTiers = this.PLATFORM_TIERS[this.PLATFORM_TIERS.length - 1].monthlyEarningsCOP;

  tierBarWidth(tier: PlatformTier): number {
    return Math.round((tier.monthlyEarningsCOP / this.maxMonthlyInTiers) * 100);
  }

  /** Progress within slider — used to colorise the range track. */
  readonly sliderPct = computed(() => Math.round((this.simulatedRefs() / 50) * 100));

  /** Actual monthly earnings for the profile's real referral count. */
  readonly actualTier = computed<PlatformTier>(() => {
    const refs = this.profile()?.total_referrals_count ?? 0;
    for (let i = this.PLATFORM_TIERS.length - 1; i >= 0; i--) {
      if (refs >= this.PLATFORM_TIERS[i].minReferrals) {
        return this.PLATFORM_TIERS[i];
      }
    }
    return this.PLATFORM_TIERS[0];
  });

  readonly actualMonthlyCOP = computed(() => this.actualTier().monthlyEarningsCOP);

  // ─── Next tier progress ──────────────────────────────────────────────────────

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

  // ─── Referral network visual ─────────────────────────────────────────────────

  readonly recentActivity = [
    { type: 'referral', description: 'Nuevo referido se unió',     reward: 500,  time: 'Hace 5 min' },
    { type: 'bonus',    description: 'Bonus de bienvenida',         reward: 1000, time: 'Hoy'        },
    { type: 'referral', description: 'Tu referido generó comisión', reward: 200,  time: 'Ayer'       },
  ];

  readonly Math = Math;

  // ─── Lifecycle ──────────────────────────────────────────────────────────────

  ngOnInit(): void {
    this.loadProfile();
  }

  ngOnDestroy(): void {}

  // ─── Methods ────────────────────────────────────────────────────────────────

  private async loadProfile(): Promise<void> {
    try {
      const p = await this.profileService.getCurrentProfile();
      this.profile.set(p);
      const refs = p?.total_referrals_count;
      if (refs && refs > 0) this.simulatedRefs.set(Math.min(refs, 50));
    } catch {}
  }

  setSimulatedRefs(event: Event): void {
    const val = Number((event.target as HTMLInputElement).value);
    this.simulatedRefs.set(Math.max(1, Math.min(50, val)));
  }

  /** Returns the preset buttons displayed under the slider. */
  readonly sliderPresets = [3, 6, 10, 20, 40];
}
