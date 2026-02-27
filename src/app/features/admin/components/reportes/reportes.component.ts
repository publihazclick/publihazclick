import { Component, inject, signal, computed, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { getSupabaseClient } from '../../../../core/supabase.client';
import type { UserClickStats, UserReferralItem } from '../../../../core/models/admin.model';

interface UserReportRow {
  id: string;
  username: string;
  email: string;
  full_name: string | null;
  role: string;
  is_active: boolean;
  real_balance: number | null;
  demo_balance: number | null;
  total_donated: number | null;
  total_earned: number | null;
  referral_earnings: number | null;
  total_referrals_count: number | null;
  has_active_package: boolean;
  created_at: string;
}

interface UserDetailModal {
  user: UserReportRow;
  clicksByCategory: UserClickStats[];
  totalClicks: number;
  activeReferrals: number;
  referralsList: UserReferralItem[];
  loading: boolean;
}

@Component({
  selector: 'app-admin-reportes',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './reportes.component.html',
  styleUrl: './reportes.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminReportesComponent implements OnInit {
  readonly users = signal<UserReportRow[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly searchQuery = signal('');
  readonly selectedRole = signal<string>('all');
  readonly currentPage = signal(1);
  readonly pageSize = 20;
  readonly totalCount = signal(0);
  readonly detail = signal<UserDetailModal | null>(null);

  readonly Math = Math;

  private readonly currencyFmt = new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });

  readonly roles = [
    { value: 'all', label: 'Todos los roles' },
    { value: 'dev', label: 'Desarrollador' },
    { value: 'admin', label: 'Administrador' },
    { value: 'advertiser', label: 'Anunciante' },
    { value: 'guest', label: 'Usuario' },
  ];

  readonly adTypeLabels: Record<string, { label: string; color: string }> = {
    standard_400: { label: 'Estándar 400', color: 'text-cyan-400' },
    standard_600: { label: 'Estándar 600', color: 'text-blue-400' },
    mini: { label: 'Mini', color: 'text-amber-400' },
    mega: { label: 'Mega', color: 'text-violet-400' },
  };

  readonly totalPages = computed(() => Math.ceil(this.totalCount() / this.pageSize));

  readonly filteredUsers = computed(() => {
    const q = this.searchQuery().toLowerCase();
    const role = this.selectedRole();
    return this.users().filter(u => {
      const matchSearch = !q ||
        u.username.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        (u.full_name?.toLowerCase().includes(q) ?? false);
      const matchRole = role === 'all' || u.role === role;
      return matchSearch && matchRole;
    });
  });

  readonly totalRealBalance = computed(() =>
    this.filteredUsers().reduce((s, u) => s + (u.real_balance ?? 0), 0)
  );

  readonly totalDonated = computed(() =>
    this.filteredUsers().reduce((s, u) => s + (u.total_donated ?? 0), 0)
  );

  readonly activeAdvertisersCount = computed(() =>
    this.filteredUsers().filter(u => u.role === 'advertiser' && u.is_active).length
  );

  ngOnInit(): void {
    this.loadUsers();
  }

  async loadUsers(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const supabase = getSupabaseClient();
      const from = (this.currentPage() - 1) * this.pageSize;
      const to = from + this.pageSize - 1;

      let query = supabase
        .from('profiles')
        .select(
          'id, username, email, full_name, role, is_active, real_balance, demo_balance, total_donated, total_earned, referral_earnings, total_referrals_count, has_active_package, created_at',
          { count: 'exact' }
        )
        .order('real_balance', { ascending: false })
        .range(from, to);

      if (this.selectedRole() !== 'all') {
        query = query.eq('role', this.selectedRole());
      }

      const { data, error, count } = await query;
      if (error) throw error;

      this.users.set((data ?? []) as UserReportRow[]);
      this.totalCount.set(count ?? 0);
    } catch (err: unknown) {
      // Failed to load reports
      this.error.set('Error al cargar los reportes. Intenta de nuevo.');
    } finally {
      this.loading.set(false);
    }
  }

  async openDetail(user: UserReportRow): Promise<void> {
    this.detail.set({
      user,
      clicksByCategory: [],
      totalClicks: 0,
      activeReferrals: 0,
      referralsList: [],
      loading: true,
    });

    try {
      const supabase = getSupabaseClient();

      // Clicks por categoría
      const { data: clicks } = await supabase
        .from('ptc_clicks')
        .select('reward_earned, ptc_tasks!inner(ad_type)')
        .eq('user_id', user.id);

      const statsMap: Record<string, { count: number; total_reward: number }> = {};
      for (const c of (clicks ?? []) as any[]) {
        const adType: string = c.ptc_tasks?.ad_type ?? 'unknown';
        const reward: number = Number(c.reward_earned ?? 0);
        if (!statsMap[adType]) statsMap[adType] = { count: 0, total_reward: 0 };
        statsMap[adType].count++;
        statsMap[adType].total_reward += reward;
      }

      const clicksByCategory: UserClickStats[] = Object.entries(statsMap).map(([ad_type, v]) => ({
        ad_type,
        count: v.count,
        total_reward: v.total_reward,
      }));

      // Referidos desde la tabla referrals
      const { data: refs } = await supabase
        .from('referrals')
        .select('referred_id, profiles!referrals_referred_id_fkey(id, username, role, is_active, has_active_package)')
        .eq('referred_by', user.id);

      const referralsList: UserReferralItem[] = [];
      let activeReferrals = 0;

      for (const r of (refs ?? []) as any[]) {
        const p = r.profiles;
        if (!p) continue;
        const active = p.is_active && p.has_active_package;
        referralsList.push({
          id: p.id,
          username: p.username,
          role: p.role,
          is_active: p.is_active,
          has_active_package: p.has_active_package,
        });
        if (active) activeReferrals++;
      }

      this.detail.set({
        user,
        clicksByCategory,
        totalClicks: clicks?.length ?? 0,
        activeReferrals,
        referralsList,
        loading: false,
      });
    } catch (err) {
      // Failed to load report detail
      this.detail.update(d => (d ? { ...d, loading: false } : null));
    }
  }

  closeDetail(): void {
    this.detail.set(null);
  }

  onSearch(q: string): void {
    this.searchQuery.set(q);
    this.currentPage.set(1);
  }

  onRoleChange(role: string): void {
    this.selectedRole.set(role);
    this.currentPage.set(1);
    this.loadUsers();
  }

  goToPage(page: number): void {
    if (page >= 1 && page <= this.totalPages()) {
      this.currentPage.set(page);
      this.loadUsers();
    }
  }

  nextPage(): void {
    this.goToPage(this.currentPage() + 1);
  }

  prevPage(): void {
    this.goToPage(this.currentPage() - 1);
  }

  formatCurrency(v: number): string {
    return this.currencyFmt.format(v ?? 0);
  }

  formatDate(d: string): string {
    return new Date(d).toLocaleDateString('es-CO', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  }

  getRoleLabel(role: string): string {
    const labels: Record<string, string> = {
      dev: 'Dev',
      admin: 'Admin',
      advertiser: 'Anunciante',
      guest: 'Usuario',
    };
    return labels[role] || role;
  }

  getRoleBadgeClass(role: string): string {
    const classes: Record<string, string> = {
      dev: 'bg-violet-500/10 text-violet-400',
      admin: 'bg-rose-500/10 text-rose-400',
      advertiser: 'bg-amber-500/10 text-amber-400',
      guest: 'bg-blue-500/10 text-blue-400',
    };
    return classes[role] || 'bg-slate-500/10 text-slate-400';
  }

  getAdLabel(type: string): string {
    return this.adTypeLabels[type]?.label ?? type;
  }

  getAdColor(type: string): string {
    return this.adTypeLabels[type]?.color ?? 'text-slate-400';
  }
}
