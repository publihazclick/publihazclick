import { Component, ChangeDetectionStrategy, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { getSupabaseClient } from '../../../../core/supabase.client';

interface CommissionSetting {
  id: string;
  label: string;
  percentage: number;
  is_active: boolean;
  updated_at: string;
}

interface CommissionRecord {
  id: string;
  referrer_id: string;
  referred_id: string;
  module: string;
  source_amount: number;
  percentage: number;
  commission: number;
  description: string;
  created_at: string;
  referrer?: { username: string };
  referred?: { username: string };
}

@Component({
  selector: 'app-admin-commissions',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  templateUrl: './commissions.component.html',
})
export class AdminCommissionsComponent implements OnInit {
  private readonly supabase = getSupabaseClient();

  readonly settings = signal<CommissionSetting[]>([]);
  readonly records = signal<CommissionRecord[]>([]);
  readonly loading = signal(true);
  readonly saving = signal<string | null>(null);
  readonly successMsg = signal<string | null>(null);
  readonly totalCommissions = signal(0);

  async ngOnInit(): Promise<void> {
    await Promise.all([this.loadSettings(), this.loadRecords()]);
    this.loading.set(false);
  }

  private async loadSettings(): Promise<void> {
    const { data } = await this.supabase
      .from('referral_commission_settings')
      .select('*')
      .order('id');
    if (data) this.settings.set(data);
  }

  private async loadRecords(): Promise<void> {
    const { data } = await this.supabase
      .from('referral_commissions')
      .select('*, referrer:profiles!referrer_id(username), referred:profiles!referred_id(username)')
      .order('created_at', { ascending: false })
      .limit(50);
    if (data) {
      this.records.set(data as CommissionRecord[]);
      this.totalCommissions.set(data.reduce((sum, r) => sum + Number(r.commission), 0));
    }
  }

  async updatePercentage(setting: CommissionSetting, newValue: number): Promise<void> {
    if (newValue < 0 || newValue > 100) return;
    this.saving.set(setting.id);

    const { error } = await this.supabase
      .from('referral_commission_settings')
      .update({ percentage: newValue, updated_at: new Date().toISOString() })
      .eq('id', setting.id);

    if (!error) {
      this.settings.update(list =>
        list.map(s => s.id === setting.id ? { ...s, percentage: newValue } : s)
      );
      this.successMsg.set(`${setting.label}: ${newValue}%`);
      setTimeout(() => this.successMsg.set(null), 2000);
    }
    this.saving.set(null);
  }

  async toggleActive(setting: CommissionSetting): Promise<void> {
    const newVal = !setting.is_active;
    await this.supabase
      .from('referral_commission_settings')
      .update({ is_active: newVal, updated_at: new Date().toISOString() })
      .eq('id', setting.id);

    this.settings.update(list =>
      list.map(s => s.id === setting.id ? { ...s, is_active: newVal } : s)
    );
  }

  async runTradingCommissions(): Promise<void> {
    this.saving.set('trading_run');
    const { data, error } = await this.supabase.rpc('process_trading_bot_referral_commissions');
    if (!error && data) {
      this.successMsg.set(`Trading Bot: ${data.commissions_credited} comisiones acreditadas de ${data.total_checked} bots activos`);
      await this.loadRecords();
    }
    this.saving.set(null);
    setTimeout(() => this.successMsg.set(null), 4000);
  }

  formatCOP(amount: number): string {
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(amount);
  }

  formatDate(d: string): string {
    return new Date(d).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  getModuleIcon(module: string): string {
    const icons: Record<string, string> = {
      cursos: 'school', movi: 'directions_car', trading_bot: 'smart_toy',
      herramientas_ia: 'psychology', sms_masivos: 'sms',
    };
    return icons[module] ?? 'paid';
  }

  getModuleColor(module: string): string {
    const colors: Record<string, string> = {
      cursos: 'text-violet-400', movi: 'text-emerald-400', trading_bot: 'text-amber-400',
      herramientas_ia: 'text-blue-400', sms_masivos: 'text-pink-400',
    };
    return colors[module] ?? 'text-slate-400';
  }
}
