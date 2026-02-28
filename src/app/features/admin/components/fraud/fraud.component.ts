import { Component, inject, signal, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { getSupabaseClient } from '../../../../core/supabase.client';
import type { FraudScore, FraudClickDetail, FraudAnalysisResult } from '../../../../core/models/admin.model';

@Component({
  selector: 'app-admin-fraud',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './fraud.component.html',
})
export class AdminFraudComponent implements OnInit {
  private readonly supabase = getSupabaseClient();

  readonly loading = signal(true);
  readonly analyzing = signal(false);
  readonly scores = signal<FraudScore[]>([]);
  readonly error = signal<string | null>(null);
  readonly successToast = signal<string | null>(null);

  // Drill-down
  readonly selectedUser = signal<FraudScore | null>(null);
  readonly userClicks = signal<FraudClickDetail[]>([]);
  readonly loadingClicks = signal(false);

  // Stats
  readonly totalAnalyzed = signal(0);
  readonly highRiskCount = signal(0);
  readonly criticalCount = signal(0);

  async ngOnInit(): Promise<void> {
    await this.loadScores();
  }

  async loadScores(): Promise<void> {
    try {
      this.loading.set(true);
      this.error.set(null);

      const { data, error } = await this.supabase
        .from('fraud_scores')
        .select(`
          *,
          profiles!inner(username, email)
        `)
        .order('score', { ascending: false });

      if (error) throw error;

      const mapped: FraudScore[] = (data || []).map((row: any) => ({
        ...row,
        username: row.profiles?.username || 'N/A',
        email: row.profiles?.email || 'N/A',
      }));

      this.scores.set(mapped);
      this.totalAnalyzed.set(mapped.length);
      this.highRiskCount.set(mapped.filter(s => s.risk_level === 'high').length);
      this.criticalCount.set(mapped.filter(s => s.risk_level === 'critical').length);
    } catch (err: any) {
      this.error.set(err.message || 'Error al cargar scores de fraude');
    } finally {
      this.loading.set(false);
    }
  }

  async runAnalysis(): Promise<void> {
    try {
      this.analyzing.set(true);
      this.error.set(null);

      const { data: { session } } = await this.supabase.auth.getSession();
      if (!session) {
        this.error.set('Sesión no encontrada');
        return;
      }

      const response = await fetch(
        `${(this.supabase as any).supabaseUrl}/functions/v1/fraud-check`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
            'apikey': (this.supabase as any).supabaseKey,
          },
          body: JSON.stringify({}),
        }
      );

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || `HTTP ${response.status}`);
      }

      const result: FraudAnalysisResult = await response.json();
      this.showToast(`Análisis completo: ${result.analyzed} usuarios analizados, ${result.flagged} alertas`);
      await this.loadScores();
    } catch (err: any) {
      this.error.set(err.message || 'Error al ejecutar análisis');
    } finally {
      this.analyzing.set(false);
    }
  }

  async selectUser(score: FraudScore): Promise<void> {
    this.selectedUser.set(score);
    this.loadingClicks.set(true);
    this.userClicks.set([]);

    try {
      const { data, error } = await this.supabase
        .from('ptc_clicks')
        .select(`
          id, task_id, reward_earned, ip_address, user_agent,
          session_fingerprint, click_duration_ms, completed_at,
          ptc_tasks(title)
        `)
        .eq('user_id', score.user_id)
        .order('completed_at', { ascending: false })
        .limit(50);

      if (error) throw error;

      const mapped: FraudClickDetail[] = (data || []).map((row: any) => ({
        id: row.id,
        task_id: row.task_id,
        task_title: row.ptc_tasks?.title || 'N/A',
        reward_earned: row.reward_earned,
        ip_address: row.ip_address,
        user_agent: row.user_agent,
        session_fingerprint: row.session_fingerprint,
        click_duration_ms: row.click_duration_ms,
        completed_at: row.completed_at,
      }));

      this.userClicks.set(mapped);
    } catch (err: any) {
      this.error.set(err.message || 'Error al cargar clicks del usuario');
    } finally {
      this.loadingClicks.set(false);
    }
  }

  closeDetail(): void {
    this.selectedUser.set(null);
    this.userClicks.set([]);
  }

  getRiskBadgeClass(level: string): string {
    switch (level) {
      case 'critical': return 'bg-rose-500/15 text-rose-400 border border-rose-500/20';
      case 'high': return 'bg-amber-500/15 text-amber-400 border border-amber-500/20';
      case 'medium': return 'bg-yellow-500/15 text-yellow-400 border border-yellow-500/20';
      default: return 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20';
    }
  }

  getRiskLabel(level: string): string {
    switch (level) {
      case 'critical': return 'Crítico';
      case 'high': return 'Alto';
      case 'medium': return 'Medio';
      default: return 'Bajo';
    }
  }

  getScoreBarColor(score: number): string {
    if (score >= 80) return 'bg-rose-500';
    if (score >= 60) return 'bg-amber-500';
    if (score >= 30) return 'bg-yellow-500';
    return 'bg-emerald-500';
  }

  formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleString('es-CO', { timeZone: 'America/Bogota' });
  }

  formatDuration(ms: number | null): string {
    if (ms == null) return '—';
    return `${(ms / 1000).toFixed(1)}s`;
  }

  truncateUa(ua: string | null): string {
    if (!ua) return '—';
    return ua.length > 50 ? ua.substring(0, 50) + '...' : ua;
  }

  truncateFp(fp: string | null): string {
    if (!fp) return '—';
    return fp.substring(0, 12) + '...';
  }

  private showToast(msg: string): void {
    this.successToast.set(msg);
    setTimeout(() => this.successToast.set(null), 5000);
  }
}
