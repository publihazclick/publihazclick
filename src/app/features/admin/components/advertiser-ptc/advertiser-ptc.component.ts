import {
  Component,
  signal,
  computed,
  OnInit,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { getSupabaseClient } from '../../../../core/supabase.client';

interface AdvertiserRow {
  user_id: string;
  username: string;
  full_name: string | null;
  report_date: string;
  std400_count: number;
  mini_count: number;
  std600_count: number;
  mega_count: number;
  completed_count: number;
  earned_cop: number;
}

interface DayDetail {
  report_date: string;
  std400_count: number;
  mini_count: number;
  std600_count: number;
  mega_count: number;
  completed_count: number;
  earned_cop: number;
  assigned_count: number;
  lost_count: number;
}

interface AdvertiserDetail {
  profile: {
    id: string;
    username: string;
    full_name: string | null;
    email: string;
    role: string;
    has_active_package: boolean;
  };
  days: DayDetail[];
}

@Component({
  selector: 'app-admin-advertiser-ptc',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './advertiser-ptc.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminAdvertiserPtcComponent implements OnInit {
  private readonly supabase = getSupabaseClient();

  // Filtros
  readonly dateFrom = signal(this.defaultFrom());
  readonly dateTo = signal(this.today());
  readonly searchQuery = signal('');

  // Data
  readonly rows = signal<AdvertiserRow[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly successToast = signal<string | null>(null);

  // Modal detalle
  readonly detail = signal<AdvertiserDetail | null>(null);
  readonly detailLoading = signal(false);

  // Asignación manual
  readonly assigningUserId = signal<string | null>(null);

  readonly Math = Math;

  private readonly currencyFmt = new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });

  readonly filteredRows = computed(() => {
    const q = this.searchQuery().toLowerCase();
    return this.rows().filter(
      (r) =>
        !q ||
        r.username.toLowerCase().includes(q) ||
        (r.full_name?.toLowerCase().includes(q) ?? false)
    );
  });

  readonly groupedByUser = computed(() => {
    const map = new Map<
      string,
      {
        user_id: string;
        username: string;
        full_name: string | null;
        total_completed: number;
        total_earned: number;
        days_active: number;
      }
    >();
    for (const r of this.filteredRows()) {
      const existing = map.get(r.user_id);
      if (existing) {
        existing.total_completed += r.completed_count;
        existing.total_earned += r.earned_cop;
        existing.days_active++;
      } else {
        map.set(r.user_id, {
          user_id: r.user_id,
          username: r.username,
          full_name: r.full_name,
          total_completed: r.completed_count,
          total_earned: r.earned_cop,
          days_active: 1,
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => b.total_earned - a.total_earned);
  });

  readonly totalCompleted = computed(() =>
    this.filteredRows().reduce((s, r) => s + r.completed_count, 0)
  );

  readonly totalEarned = computed(() =>
    this.filteredRows().reduce((s, r) => s + r.earned_cop, 0)
  );

  readonly uniqueAdvertisers = computed(
    () => new Set(this.filteredRows().map((r) => r.user_id)).size
  );

  readonly DAILY_MAX = 13;

  readonly totalLost = computed(() => {
    const days = this.filteredRows().length;
    return Math.max(0, days * this.DAILY_MAX - this.totalCompleted());
  });

  readonly viewMode = signal<'fecha' | 'anunciante'>('fecha');

  ngOnInit(): void {
    this.loadReport();
  }

  // ── Carga directa (sin RPC) ──────────────────────────────────────────────

  async loadReport(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      // Query ptc_clicks con JOIN a ptc_tasks y profiles
      // El filtro de rol se hace post-query ya que Supabase JS
      // no soporta .in() en columnas de tablas embebidas de forma fiable
      const { data: clicks, error } = await this.supabase
        .from('ptc_clicks')
        .select(
          'user_id, reward_earned, completed_at, ptc_tasks!inner(ad_type), profiles!inner(username, full_name, role)'
        )
        .gte('completed_at', this.dateFrom() + 'T00:00:00-05:00')
        .lte('completed_at', this.dateTo() + 'T23:59:59-05:00');

      if (error) throw error;

      // Agrupar por user_id + fecha
      const groupMap = new Map<string, AdvertiserRow>();

      const validRoles = new Set(['advertiser', 'admin', 'dev']);
      for (const c of clicks ?? []) {
        const profile = c.profiles as any;
        const task = c.ptc_tasks as any;
        if (!profile || !task) continue;
        if (!validRoles.has(profile.role)) continue;

        // Calcular fecha Colombia (UTC-5)
        const utcDate = new Date(c.completed_at);
        const colDate = new Date(utcDate.getTime() - 5 * 60 * 60 * 1000);
        const dateStr = colDate.toISOString().split('T')[0];

        const key = `${c.user_id}|${dateStr}`;
        let row = groupMap.get(key);
        if (!row) {
          row = {
            user_id: c.user_id,
            username: profile.username,
            full_name: profile.full_name,
            report_date: dateStr,
            std400_count: 0,
            mini_count: 0,
            std600_count: 0,
            mega_count: 0,
            completed_count: 0,
            earned_cop: 0,
          };
          groupMap.set(key, row);
        }

        row.completed_count++;
        row.earned_cop += Number(c.reward_earned ?? 0);
        const adType = task.ad_type as string;
        if (adType === 'standard_400') row.std400_count++;
        else if (adType === 'mini' || adType === 'mini_referral') row.mini_count++;
        else if (adType === 'standard_600') row.std600_count++;
        else if (adType === 'mega') row.mega_count++;
      }

      // Ordenar por fecha desc, luego username
      const rows = Array.from(groupMap.values()).sort((a, b) => {
        const d = b.report_date.localeCompare(a.report_date);
        return d !== 0 ? d : a.username.localeCompare(b.username);
      });

      this.rows.set(rows);
    } catch (err: unknown) {
      this.error.set(err instanceof Error ? err.message : 'Error al cargar el reporte');
    } finally {
      this.loading.set(false);
    }
  }

  // ── Detalle por usuario ──────────────────────────────────────────────────

  async openDetail(userId: string): Promise<void> {
    this.detailLoading.set(true);
    this.detail.set(null);
    try {
      // Info del perfil
      const { data: profile, error: pErr } = await this.supabase
        .from('profiles')
        .select('id, username, full_name, email, role, has_active_package')
        .eq('id', userId)
        .single();

      if (pErr) throw pErr;

      // Clicks del usuario en el rango
      const { data: clicks, error: cErr } = await this.supabase
        .from('ptc_clicks')
        .select('reward_earned, completed_at, ptc_tasks!inner(ad_type)')
        .eq('user_id', userId)
        .gte('completed_at', this.dateFrom() + 'T00:00:00-05:00')
        .lte('completed_at', this.dateTo() + 'T23:59:59-05:00');

      if (cErr) throw cErr;

      // Asignaciones del usuario en el rango
      const { data: assignments } = await this.supabase
        .from('daily_task_assignments')
        .select('assignment_date')
        .eq('user_id', userId)
        .gte('assignment_date', this.dateFrom())
        .lte('assignment_date', this.dateTo());

      const assignmentsByDate = new Set(
        (assignments ?? []).map((a: any) => a.assignment_date)
      );

      // Agrupar clicks por fecha
      const dayMap = new Map<string, DayDetail>();
      for (const c of clicks ?? []) {
        const task = c.ptc_tasks as any;
        if (!task) continue;

        const utcDate = new Date(c.completed_at);
        const colDate = new Date(utcDate.getTime() - 5 * 60 * 60 * 1000);
        const dateStr = colDate.toISOString().split('T')[0];

        let day = dayMap.get(dateStr);
        if (!day) {
          // Si hay asignaciones manuales para ese día, usarlas; si no, máximo teórico
          const assignedCount = assignmentsByDate.has(dateStr) ? 0 : this.DAILY_MAX;
          day = {
            report_date: dateStr,
            std400_count: 0,
            mini_count: 0,
            std600_count: 0,
            mega_count: 0,
            completed_count: 0,
            earned_cop: 0,
            assigned_count: assignedCount,
            lost_count: 0,
          };
          dayMap.set(dateStr, day);
        }

        day.completed_count++;
        day.earned_cop += Number(c.reward_earned ?? 0);
        const adType = task.ad_type as string;
        if (adType === 'standard_400') day.std400_count++;
        else if (adType === 'mini' || adType === 'mini_referral') day.mini_count++;
        else if (adType === 'standard_600') day.std600_count++;
        else if (adType === 'mega') day.mega_count++;
      }

      // Contar asignaciones por fecha para las que tienen registros
      if (assignments?.length) {
        const countByDate = new Map<string, number>();
        for (const a of assignments) {
          const d = (a as any).assignment_date;
          countByDate.set(d, (countByDate.get(d) ?? 0) + 1);
        }
        for (const [dateStr, count] of countByDate) {
          const day = dayMap.get(dateStr);
          if (day) {
            day.assigned_count = count;
          }
        }
      }

      // Calcular perdidos
      for (const day of dayMap.values()) {
        if (day.assigned_count === 0) day.assigned_count = this.DAILY_MAX;
        day.lost_count = Math.max(0, day.assigned_count - day.completed_count);
      }

      const days = Array.from(dayMap.values()).sort((a, b) =>
        b.report_date.localeCompare(a.report_date)
      );

      this.detail.set({ profile: profile as any, days });
    } catch (err: unknown) {
      this.error.set(err instanceof Error ? err.message : 'Error al cargar detalle');
    } finally {
      this.detailLoading.set(false);
    }
  }

  closeDetail(): void {
    this.detail.set(null);
  }

  // ── Asignación manual ────────────────────────────────────────────────────

  async assignTasksForUser(userId: string, date?: string): Promise<void> {
    this.assigningUserId.set(userId);
    const assignDate = date ?? this.today();
    try {
      // Obtener anuncios activos
      const { data: tasks, error: tErr } = await this.supabase
        .from('ptc_tasks')
        .select('id, ad_type, created_at')
        .eq('status', 'active')
        .eq('location', 'app')
        .or('is_demo_only.is.null,is_demo_only.eq.false')
        .order('created_at', { ascending: true });

      if (tErr) throw tErr;

      const limits: Record<string, number> = {
        standard_400: 5,
        mini: 4,
        standard_600: 3,
        mega: 1,
      };
      const rewards: Record<string, number> = {
        standard_400: 400,
        mini: 83.33,
        standard_600: 600,
        mega: 2000,
      };

      // Contar por tipo para respetar límites
      const typeCounts: Record<string, number> = {};
      const toInsert: Array<{
        user_id: string;
        task_id: string;
        assignment_date: string;
        ad_type: string;
        reward: number;
        is_completed: boolean;
      }> = [];

      for (const t of tasks ?? []) {
        const type = (t.ad_type as string) ?? 'mini';
        typeCounts[type] = (typeCounts[type] ?? 0) + 1;
        if (typeCounts[type] <= (limits[type] ?? 5)) {
          toInsert.push({
            user_id: userId,
            task_id: t.id,
            assignment_date: assignDate,
            ad_type: type,
            reward: rewards[type] ?? 83.33,
            is_completed: false,
          });
        }
      }

      if (toInsert.length === 0) {
        this.showToast('No hay anuncios activos para asignar');
        return;
      }

      const { error: iErr } = await this.supabase
        .from('daily_task_assignments')
        .upsert(toInsert, { onConflict: 'user_id,task_id,assignment_date', ignoreDuplicates: true });

      if (iErr) throw iErr;

      this.showToast(`${toInsert.length} anuncios asignados para el ${this.formatDate(assignDate)}`);
      await this.loadReport();
    } catch (err: unknown) {
      this.error.set(err instanceof Error ? err.message : 'Error al asignar tareas');
    } finally {
      this.assigningUserId.set(null);
    }
  }

  // ── Utilidades ───────────────────────────────────────────────────────────

  onDateChange(): void {
    this.loadReport();
  }

  formatCurrency(v: number): string {
    return this.currencyFmt.format(v ?? 0);
  }

  formatDate(d: string): string {
    return new Date(d + 'T12:00:00').toLocaleDateString('es-CO', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  }

  getLostCount(row: AdvertiserRow): number {
    return Math.max(0, this.DAILY_MAX - row.completed_count);
  }

  getLostPct(completed: number): number {
    return Math.round((completed / this.DAILY_MAX) * 100);
  }

  sumDaysCompleted(days: DayDetail[]): number {
    return days.reduce((s, x) => s + x.completed_count, 0);
  }

  sumDaysLost(days: DayDetail[]): number {
    return days.reduce((s, x) => s + x.lost_count, 0);
  }

  sumDaysEarned(days: DayDetail[]): number {
    return days.reduce((s, x) => s + x.earned_cop, 0);
  }

  private today(): string {
    return new Date().toISOString().split('T')[0];
  }

  private defaultFrom(): string {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().split('T')[0];
  }

  private showToast(msg: string): void {
    this.successToast.set(msg);
    setTimeout(() => this.successToast.set(null), 5000);
  }
}
