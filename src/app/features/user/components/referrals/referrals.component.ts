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
      .select('id, username, full_name, level, has_active_package, avatar_url, created_at')
      .eq('referred_by', userId);

    if (!error && data) {
      this.afiliados.set(data as AfiliadoItem[]);
    }
  }

  getLevelColor(level: number): string {
    if (level <= 2) return 'bg-slate-700 text-slate-200';
    if (level <= 4) return 'bg-blue-900 text-blue-200';
    if (level <= 6) return 'bg-cyan-900 text-cyan-200';
    if (level <= 8) return 'bg-amber-900 text-amber-200';
    return 'bg-purple-900 text-purple-200';
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
