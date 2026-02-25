import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { ProfileService } from '../../../../core/services/profile.service';
import { CurrencyService } from '../../../../core/services/currency.service';
import { getSupabaseClient } from '../../../../core/supabase.client';
import type { WithdrawalStatus } from '../../../../core/models/admin.model';

interface WithdrawalRecord {
  id: string;
  amount: number;
  status: WithdrawalStatus;
  created_at: string;
  details: { method?: string; account?: string } | null;
}

@Component({
  selector: 'app-user-wallet',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, RouterModule],
  templateUrl: './wallet.component.html',
})
export class UserWalletComponent implements OnInit {
  private readonly profileService = inject(ProfileService);
  readonly currencyService = inject(CurrencyService);
  private readonly supabase = getSupabaseClient();

  readonly profile = this.profileService.profile;
  readonly withdrawals = signal<WithdrawalRecord[]>([]);
  readonly loading = signal(true);

  async ngOnInit(): Promise<void> {
    await this.profileService.getCurrentProfile().catch(() => {});
    await this.loadWithdrawals();
    this.loading.set(false);
  }

  private async loadWithdrawals(): Promise<void> {
    const {
      data: { user },
    } = await this.supabase.auth.getUser();
    if (!user) return;

    const { data } = await this.supabase
      .from('withdrawal_requests')
      .select('id, amount, status, created_at, details')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(10);

    if (data) this.withdrawals.set(data as WithdrawalRecord[]);
  }

  formatCOP(amount: number): string {
    return this.currencyService.formatFromCOP(amount, 0);
  }

  getStatusStyle(status: WithdrawalStatus): string {
    switch (status) {
      case 'completed':
        return 'text-emerald-400 bg-emerald-500/10 border border-emerald-500/20';
      case 'approved':
        return 'text-blue-400 bg-blue-500/10 border border-blue-500/20';
      case 'pending':
        return 'text-amber-400 bg-amber-500/10 border border-amber-500/20';
      case 'rejected':
        return 'text-rose-400 bg-rose-500/10 border border-rose-500/20';
      default:
        return 'text-slate-400 bg-slate-500/10 border border-slate-500/20';
    }
  }

  getStatusLabel(status: WithdrawalStatus): string {
    const labels: Record<WithdrawalStatus, string> = {
      completed: 'Completado',
      approved: 'Aprobado',
      pending: 'Pendiente',
      rejected: 'Rechazado',
    };
    return labels[status] ?? status;
  }

  getStatusIcon(status: WithdrawalStatus): string {
    const icons: Record<WithdrawalStatus, string> = {
      completed: 'check_circle',
      approved: 'verified',
      pending: 'hourglass_empty',
      rejected: 'cancel',
    };
    return icons[status] ?? 'info';
  }

  formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString('es-CO', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  }
}
