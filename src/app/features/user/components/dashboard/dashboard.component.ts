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
import { PackagePromoModalComponent } from '../../../../components/package-promo-modal/package-promo-modal.component';


interface PlatformTier {
  name: string;
  minReferrals: number;
  maxReferrals: number | null;
  ownClicksCOP: number;
  referralClicksCOP: number;   // al mínimo de invitados del rango (para la barra comparativa)
  monthlyEarningsCOP: number;  // al mínimo de invitados del rango (para la barra comparativa)
  color: string;
  bgGradient: string;
  icon: string;
  bgColorClass: string;
  category: 'basic' | 'superior' | 'superior-plus';
  commissionPerStd400?: number;  // COP por std_400 visto por invitado
  miniSlotsPerInvitee?: number;  // slots mini_referral por invitado activo por día
  requiredPackage?: string;      // tipo de paquete mínimo requerido
}

@Component({
  selector: 'app-user-dashboard',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, RouterModule, PackagePromoModalComponent],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
})
export class UserDashboardComponent implements OnInit, OnDestroy {
  private readonly profileService = inject(ProfileService);
  readonly currencyService = inject(CurrencyService);
  readonly walletState = inject(WalletStateService);

  readonly profile = this.profileService.profile;

  // ─── Platform Tiers (mirrors tiers.component.ts) ────────────────────────────

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
      maxReferrals: 29,
      ownClicksCOP: 180_000,
      referralClicksCOP: 2_465_000,    // 29×5×400×30 + 29×5×100×30 + 29×10000
      monthlyEarningsCOP: 2_645_000,   // 180000 + 2465000
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
      minReferrals: 30,
      maxReferrals: 34,
      ownClicksCOP: 180_000,
      referralClicksCOP: 2_890_000,    // 34×5×400×30 + 34×5×100×30 + 34×10000
      monthlyEarningsCOP: 3_070_000,   // 180000 + 2890000
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
      minReferrals: 35,
      maxReferrals: 39,
      ownClicksCOP: 180_000,
      referralClicksCOP: 3_315_000,    // 39×5×400×30 + 39×5×100×30 + 39×10000
      monthlyEarningsCOP: 3_495_000,   // 180000 + 3315000
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
      minReferrals: 40,
      maxReferrals: 44,
      ownClicksCOP: 180_000,
      referralClicksCOP: 3_740_000,    // 44×5×400×30 + 44×5×100×30 + 44×10000
      monthlyEarningsCOP: 3_920_000,   // 180000 + 3740000
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
      minReferrals: 45,
      maxReferrals: null,
      ownClicksCOP: 180_000,
      referralClicksCOP: 3_825_000,    // 45×5×400×30 + 45×5×100×30 + 45×10000
      monthlyEarningsCOP: 4_005_000,   // 180000 + 3825000
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

  /** Own clicks — depende del nivel (básico: 70.000, superior: 180.000 COP). */
  readonly ownClicksEarningsCOP = computed(() => this.currentTier().ownClicksCOP);

  /** Comisión por cada std_400 que ve un invitado (básica dinámica). */
  readonly std400CommissionCOP = computed(() => {
    const tier = this.currentTier();
    if (!tier.commissionPerStd400) return 0;
    return this.simulatedRefs() * 5 * tier.commissionPerStd400 * 30;
  });

  /** Mini anuncios por invitar (básica dinámica). */
  readonly miniReferralCOP = computed(() => {
    const tier = this.currentTier();
    if (!tier.miniSlotsPerInvitee) return 0;
    return this.simulatedRefs() * tier.miniSlotsPerInvitee * 100 * 30;
  });

  /** Bonus activación: 5 mega ads × 2.000 COP por cada invitado que activa. */
  readonly activationBonusCOP = computed(() => {
    const tier = this.currentTier();
    if (!tier.commissionPerStd400 && tier.category !== 'basic') return 0;
    return this.simulatedRefs() * 10_000;
  });

  /** Total por invitados (dinámico si tiene commissionPerStd400; estático si no). */
  readonly referralEarningsCOP = computed(() => {
    const tier = this.currentTier();
    if (tier.commissionPerStd400) {
      return this.std400CommissionCOP() + this.miniReferralCOP() + this.activationBonusCOP();
    }
    return tier.referralClicksCOP;
  });

  /** Total mensual = propios + invitados. */
  readonly totalMonthlyCOP = computed(() => this.ownClicksEarningsCOP() + this.referralEarningsCOP());

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

  readonly actualMonthlyCOP = computed(() => {
    const tier = this.actualTier();
    const refs = this.profile()?.total_referrals_count ?? 0;
    if (tier.commissionPerStd400) {
      const commission = refs * 5 * tier.commissionPerStd400 * 30;
      const mini = refs * (tier.miniSlotsPerInvitee ?? 0) * 100 * 30;
      const activation = refs * 10_000;
      return tier.ownClicksCOP + commission + mini + activation;
    }
    return tier.monthlyEarningsCOP;
  });

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
      const refs = p?.total_referrals_count;
      if (refs && refs > 0) this.simulatedRefs.set(Math.min(refs, 50));
    } catch {}
  }

  setSimulatedRefs(event: Event): void {
    const val = Number((event.target as HTMLInputElement).value);
    this.simulatedRefs.set(Math.max(1, Math.min(50, val)));
  }

  /** Returns the preset buttons displayed under the slider. */
  readonly sliderPresets = [3, 10, 20, 30, 45];
}
