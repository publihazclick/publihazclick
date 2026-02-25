import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  inject,
  signal,
  PLATFORM_ID,
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { RouterModule } from '@angular/router';
import { ProfileService } from '../../../../core/services/profile.service';
import { CurrencyService } from '../../../../core/services/currency.service';
import { getSupabaseClient } from '../../../../core/supabase.client';

interface InvitadoItem {
  id: string;
  username: string;
  has_active_package: boolean;
  created_at: string;
}

@Component({
  selector: 'app-advertiser-recommend',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, RouterModule],
  templateUrl: './recommend.component.html',
})
export class AdvertiserRecommendComponent implements OnInit {
  private readonly profileService = inject(ProfileService);
  readonly currencyService = inject(CurrencyService);
  private readonly supabase = getSupabaseClient();
  private readonly platformId = inject(PLATFORM_ID);

  readonly profile = this.profileService.profile;
  readonly invitados = signal<InvitadoItem[]>([]);
  readonly loading = signal(true);
  readonly copied = signal<'code' | 'link' | null>(null);

  async ngOnInit(): Promise<void> {
    await this.profileService.getCurrentProfile().catch(() => {});
    await this.loadInvitados();
    this.loading.set(false);
  }

  private async loadInvitados(): Promise<void> {
    const { data: { user } } = await this.supabase.auth.getUser();
    if (!user) return;
    const { data } = await this.supabase
      .from('profiles')
      .select('id, username, has_active_package, created_at')
      .eq('referred_by', user.id)
      .order('created_at', { ascending: false });
    if (data) this.invitados.set(data as InvitadoItem[]);
  }

  get totalInvitados(): number { return this.invitados().length; }
  get invitadosActivos(): number { return this.invitados().filter(a => a.has_active_package).length; }

  formatCOP(amount: number): string {
    return this.currencyService.formatFromCOP(amount, 0);
  }

  copyToClipboard(text: string, type: 'code' | 'link'): void {
    if (!isPlatformBrowser(this.platformId) || !text) return;
    navigator.clipboard.writeText(text).then(() => {
      this.copied.set(type);
      setTimeout(() => this.copied.set(null), 2000);
    });
  }

  getReferralUrl(): string {
    if (!isPlatformBrowser(this.platformId)) return '';
    const code = this.profile()?.referral_code ?? '';
    return `${window.location.origin}/ref/${code}`;
  }
}
