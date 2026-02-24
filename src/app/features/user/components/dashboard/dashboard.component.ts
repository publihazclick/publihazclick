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
import type { Profile } from '../../../../core/models/profile.model';

@Component({
  selector: 'app-user-dashboard',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, RouterModule],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
})
export class UserDashboardComponent implements OnInit, OnDestroy {
  private readonly profileService = inject(ProfileService);
  readonly currencyService = inject(CurrencyService);
  readonly walletState = inject(WalletStateService);

  readonly profile = signal<Profile | null>(null);

  // ─── Earnings Calculator ────────────────────────────────────────────────────

  private readonly BASE_MONTHLY_COP = 10_000;
  private readonly SPREAD = 3;

  readonly simulatedRefs = signal(5);

  readonly referralTiers = [
    { level: 1, label: 'Nivel 1', pct: 10, colorClass: 'text-primary',     bgClass: 'bg-primary',     borderClass: 'border-primary/30',     icon: 'person'      },
    { level: 2, label: 'Nivel 2', pct: 5,  colorClass: 'text-blue-400',    bgClass: 'bg-blue-500',    borderClass: 'border-blue-500/30',    icon: 'group'       },
    { level: 3, label: 'Nivel 3', pct: 3,  colorClass: 'text-violet-400',  bgClass: 'bg-violet-500',  borderClass: 'border-violet-500/30',  icon: 'groups'      },
    { level: 4, label: 'Nivel 4', pct: 2,  colorClass: 'text-amber-400',   bgClass: 'bg-amber-500',   borderClass: 'border-amber-500/30',   icon: 'diversity_3' },
    { level: 5, label: 'Nivel 5', pct: 1,  colorClass: 'text-emerald-400', bgClass: 'bg-emerald-500', borderClass: 'border-emerald-500/30', icon: 'hub'         },
  ];

  readonly earningsTiers = computed(() => {
    const refs = this.simulatedRefs();
    return this.referralTiers.map((tier, i) => {
      const count = Math.min(refs * Math.pow(this.SPREAD, i), 50_000);
      const earning = count * this.BASE_MONTHLY_COP * (tier.pct / 100);
      return { ...tier, count: Math.round(count), earning };
    });
  });

  readonly totalMonthly = computed(() =>
    this.earningsTiers().reduce((sum, t) => sum + t.earning, 0)
  );

  readonly maxTierEarning = computed(() =>
    Math.max(...this.earningsTiers().map((t) => t.earning), 1)
  );

  readonly actualMonthly = computed(() => {
    const refs = this.profile()?.total_referrals_count ?? 0;
    return refs * this.BASE_MONTHLY_COP * 0.1;
  });

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
      if (refs && refs > 0) this.simulatedRefs.set(Math.min(refs, 100));
    } catch {}
  }

  setSimulatedRefs(event: Event): void {
    const val = Number((event.target as HTMLInputElement).value);
    this.simulatedRefs.set(Math.max(1, Math.min(100, val)));
  }

  barWidth(tierEarning: number): number {
    const max = this.maxTierEarning();
    return max > 0 ? Math.round((tierEarning / max) * 100) : 0;
  }

  formatCOP(value: number): string {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value ?? 0);
  }
}
