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

interface InvitadoItem {
  id: string;
  username: string;
  full_name: string | null;
  level: number;
  total_referrals_count: number;
  has_active_package: boolean;
  avatar_url: string | null;
  created_at: string;
  referred_by: string | null;
  invited_by_username?: string | null;
}

type Tab = 'nivel1' | 'nivel2';

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

  invitadosNivel1 = signal<InvitadoItem[]>([]);
  invitadosNivel2 = signal<InvitadoItem[]>([]);
  loading = signal(true);
  activeTab = signal<Tab>('nivel1');

  totalNivel1 = computed(() => this.invitadosNivel1().length);
  totalNivel2 = computed(() => this.invitadosNivel2().length);
  totalInvitados = computed(() => this.totalNivel1() + this.totalNivel2());

  invitadosConPaquete = computed(
    () =>
      this.invitadosNivel1().filter(a => a.has_active_package).length +
      this.invitadosNivel2().filter(a => a.has_active_package).length
  );

  invitadosActivos = computed(() =>
    this.activeTab() === 'nivel1' ? this.invitadosNivel1() : this.invitadosNivel2()
  );

  async ngOnInit(): Promise<void> {
    const {
      data: { user },
    } = await this.supabase.auth.getUser();

    if (!user) {
      this.loading.set(false);
      return;
    }

    await this.loadInvitados(user.id);
    this.loading.set(false);
  }

  setTab(tab: Tab): void {
    this.activeTab.set(tab);
  }

  private async loadInvitados(userId: string): Promise<void> {
    const { data, error } = await this.supabase.rpc('get_my_referral_network');

    if (error || !data) {
      await this.loadInvitadosFallback(userId);
      return;
    }

    const rows = data as Array<InvitadoItem & { referral_depth: number }>;

    const nivel1 = rows
      .filter(r => r.referral_depth === 1)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    const nivel2 = rows
      .filter(r => r.referral_depth === 2)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    this.invitadosNivel1.set(nivel1);
    this.invitadosNivel2.set(nivel2);
  }

  private async loadInvitadosFallback(userId: string): Promise<void> {
    const selectCols =
      'id, username, full_name, level, total_referrals_count, has_active_package, avatar_url, created_at, referred_by';

    const { data: nivel1 } = await this.supabase
      .from('profiles')
      .select(selectCols)
      .eq('referred_by', userId)
      .order('created_at', { ascending: false });

    if (!nivel1) return;
    this.invitadosNivel1.set(nivel1 as InvitadoItem[]);

    const nivel1Ids = nivel1.map(n => n.id);
    if (nivel1Ids.length === 0) return;

    const usernameById = new Map<string, string>();
    nivel1.forEach(n => usernameById.set(n.id, n.username));

    const { data: nivel2 } = await this.supabase
      .from('profiles')
      .select(selectCols)
      .in('referred_by', nivel1Ids)
      .order('created_at', { ascending: false });

    if (!nivel2) return;

    const enriched = (nivel2 as InvitadoItem[]).map(n => ({
      ...n,
      invited_by_username: n.referred_by ? usernameById.get(n.referred_by) ?? null : null,
    }));

    this.invitadosNivel2.set(enriched);
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
    return '$' + amount.toLocaleString('es-CO') + ' COP';
  }
}
