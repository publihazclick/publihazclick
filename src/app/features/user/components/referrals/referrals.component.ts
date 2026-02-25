import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ProfileService } from '../../../../core/services/profile.service';
import { getSupabaseClient } from '../../../../core/supabase.client';

interface AfiliadoItem {
  id: string;
  username: string;
  full_name: string | null;
  level: number;
  total_referrals_count: number;
  has_active_package: boolean;
  avatar_url: string | null;
  created_at: string;
}

@Component({
  selector: 'app-user-referrals',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  templateUrl: './referrals.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UserReferralsComponent implements OnInit {
  private profileService = inject(ProfileService);
  private supabase = getSupabaseClient();

  profile = this.profileService.profile;

  afiliados = signal<AfiliadoItem[]>([]);
  loading = signal(true);

  totalAfiliados = computed(() => this.afiliados().length);
  afiliadosConPaquete = computed(() => this.afiliados().filter(a => a.has_active_package).length);

  async ngOnInit(): Promise<void> {
    const {
      data: { user },
    } = await this.supabase.auth.getUser();

    if (!user) {
      this.loading.set(false);
      return;
    }

    await this.loadAfiliados(user.id);
    this.loading.set(false);
  }

  private async loadAfiliados(userId: string): Promise<void> {
    const { data, error } = await this.supabase
      .from('profiles')
      .select('id, username, full_name, level, total_referrals_count, has_active_package, avatar_url, created_at')
      .eq('referred_by', userId);

    if (!error && data) {
      this.afiliados.set(data as AfiliadoItem[]);
    }
  }

  getTierInfo(referrals: number): { name: string; color: string } {
    if (referrals >= 40) return { name: 'DIAMANTE CORONA', color: 'bg-amber-500/10 text-amber-400 border border-amber-500/30' };
    if (referrals >= 36) return { name: 'DIAMANTE NEGRO', color: 'bg-gray-500/10 text-gray-300 border border-gray-500/30' };
    if (referrals >= 31) return { name: 'DIAMANTE AZUL', color: 'bg-blue-500/10 text-blue-400 border border-blue-500/30' };
    if (referrals >= 26) return { name: 'DIAMANTE', color: 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/30' };
    if (referrals >= 20) return { name: 'ESMERALDA', color: 'bg-green-500/10 text-green-400 border border-green-500/30' };
    if (referrals >= 10) return { name: 'RUBY', color: 'bg-red-500/10 text-red-400 border border-red-500/30' };
    if (referrals >= 6)  return { name: 'ZAFIRO', color: 'bg-blue-900/30 text-blue-300 border border-blue-400/30' };
    if (referrals >= 3)  return { name: 'PERLA', color: 'bg-pink-500/10 text-pink-400 border border-pink-500/30' };
    return { name: 'JADE', color: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30' };
  }

  getTimeAgo(dateStr: string): string {
    const now = new Date();
    const date = new Date(dateStr);
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays < 1) return 'hoy';
    if (diffDays === 1) return 'hace 1 día';
    if (diffDays < 7) return `hace ${diffDays} días`;

    const diffWeeks = Math.floor(diffDays / 7);
    if (diffWeeks === 1) return 'hace 1 semana';
    if (diffWeeks < 4) return `hace ${diffWeeks} semanas`;

    const diffMonths = Math.floor(diffDays / 30);
    if (diffMonths === 1) return 'hace 1 mes';
    return `hace ${diffMonths} meses`;
  }

  copyToClipboard(text: string): void {
    if (text) {
      navigator.clipboard.writeText(text);
    }
  }

  formatCOP(amount: number): string {
    return 'COP ' + amount.toLocaleString('es-CO');
  }
}
