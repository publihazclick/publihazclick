import { Component, ChangeDetectionStrategy, OnInit, inject, signal } from '@angular/core';
import { CommonModule, DatePipe, DecimalPipe } from '@angular/common';
import { getSupabaseClient } from '../../../../core/supabase.client';

interface TradingWithdrawalRow {
  id: string;
  user_id: string;
  amount: number;
  method: string;
  status: string;
  details: {
    type?: string;
    user_trading_package_id?: string;
    package_name?: string;
    price_usd?: number;
    amount_usd?: number;
    full_name?: string;
    account_number?: string;
    account_type?: string;
    bank?: string;
    days_active?: number;
  } | null;
  created_at: string;
  admin_notes?: string | null;
  paid_at?: string | null;
  user?: {
    username: string | null;
    email: string | null;
    full_name: string | null;
    phone: string | null;
  };
}

@Component({
  selector: 'app-admin-trading-withdrawals',
  standalone: true,
  imports: [CommonModule, DatePipe, DecimalPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="space-y-6">
      <div class="flex items-center gap-4">
        <div class="w-12 h-12 rounded-xl bg-gradient-to-tr from-emerald-500/20 to-cyan-500/20 border border-emerald-500/30 flex items-center justify-center">
          <span class="material-symbols-outlined text-emerald-400" style="font-size:26px">account_balance_wallet</span>
        </div>
        <div class="flex-1">
          <h2 class="text-xl font-black text-white">Solicitudes de Retiro · Trading Bot AI</h2>
          <p class="text-xs text-slate-500">Retiros de rentabilidad mensual solicitados por los usuarios</p>
        </div>
        <div class="flex gap-2">
          <button (click)="filter.set('pending'); load()"
            [class]="filter() === 'pending'
              ? 'px-3 py-1.5 rounded-lg text-xs font-black border border-amber-500/50 bg-amber-500/15 text-amber-400'
              : 'px-3 py-1.5 rounded-lg text-xs font-bold border border-white/10 bg-white/5 text-slate-400 hover:border-white/20'">
            Pendientes ({{ counts().pending }})
          </button>
          <button (click)="filter.set('paid'); load()"
            [class]="filter() === 'paid'
              ? 'px-3 py-1.5 rounded-lg text-xs font-black border border-emerald-500/50 bg-emerald-500/15 text-emerald-400'
              : 'px-3 py-1.5 rounded-lg text-xs font-bold border border-white/10 bg-white/5 text-slate-400 hover:border-white/20'">
            Pagados ({{ counts().paid }})
          </button>
          <button (click)="filter.set('all'); load()"
            [class]="filter() === 'all'
              ? 'px-3 py-1.5 rounded-lg text-xs font-black border border-cyan-500/50 bg-cyan-500/15 text-cyan-400'
              : 'px-3 py-1.5 rounded-lg text-xs font-bold border border-white/10 bg-white/5 text-slate-400 hover:border-white/20'">
            Todos ({{ counts().total }})
          </button>
        </div>
      </div>

      @if (loading()) {
        <p class="text-slate-500 text-sm text-center py-8">Cargando…</p>
      } @else if (rows().length === 0) {
        <div class="rounded-xl border border-white/5 bg-white/[0.02] px-6 py-10 text-center">
          <p class="text-slate-400 text-sm">No hay solicitudes de retiro que mostrar.</p>
        </div>
      } @else {
        <div class="space-y-3">
          @for (w of rows(); track w.id) {
            <div class="rounded-2xl border px-5 py-4"
              [class.border-amber-500/30]="w.status === 'pending'"
              [class.bg-amber-500/5]="w.status === 'pending'"
              [class.border-emerald-500/30]="w.status === 'paid'"
              [class.bg-emerald-500/5]="w.status === 'paid'"
              [class.border-white/10]="w.status !== 'pending' && w.status !== 'paid'"
              [class.bg-white/\[0.02\]]="w.status !== 'pending' && w.status !== 'paid'">
              <div class="flex flex-wrap items-start justify-between gap-3">
                <div class="flex-1 min-w-0">
                  <p class="text-white font-black text-base">
                    {{ w.user?.full_name || w.user?.username || 'Usuario' }}
                    <span class="text-slate-500 text-xs font-normal">· {{ w.user?.email }}</span>
                  </p>
                  <p class="text-[11px] text-slate-500 mt-0.5">
                    Paquete <strong class="text-white">{{ w.details?.package_name || '—' }}</strong>
                    · Capital \${{ w.details?.price_usd || 0 | number:'1.0-0' }} USD
                    · {{ w.details?.days_active || 0 }} día(s) activo
                  </p>
                </div>
                <div class="text-right">
                  <p class="text-[9px] uppercase tracking-widest font-black"
                    [class.text-amber-400]="w.status === 'pending'"
                    [class.text-emerald-400]="w.status === 'paid'"
                    [class.text-slate-500]="w.status !== 'pending' && w.status !== 'paid'">
                    {{ w.status }}
                  </p>
                  <p class="text-cyan-400 font-black text-xl">\${{ w.amount | number:'1.2-2' }} <span class="text-[10px] text-slate-500">USD</span></p>
                </div>
              </div>

              <div class="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
                <div class="rounded-lg bg-black/30 border border-white/5 px-3 py-2">
                  <p class="text-[9px] text-slate-500 uppercase tracking-widest font-bold">Titular</p>
                  <p class="text-white text-sm font-bold">{{ w.details?.full_name || '—' }}</p>
                </div>
                <div class="rounded-lg bg-black/30 border border-white/5 px-3 py-2">
                  <p class="text-[9px] text-slate-500 uppercase tracking-widest font-bold">Cuenta</p>
                  <p class="text-white text-sm font-mono">{{ w.details?.account_number || '—' }}</p>
                  <p class="text-slate-500 text-[10px]">{{ w.details?.account_type || '—' }} {{ w.details?.bank ? '· ' + w.details?.bank : '' }}</p>
                </div>
                <div class="rounded-lg bg-black/30 border border-white/5 px-3 py-2">
                  <p class="text-[9px] text-slate-500 uppercase tracking-widest font-bold">Contacto</p>
                  <p class="text-white text-sm">{{ w.user?.phone || '—' }}</p>
                  <p class="text-slate-500 text-[10px]">Solicitado: {{ w.created_at | date:'d MMM · HH:mm' }}</p>
                </div>
              </div>

              @if (w.status === 'pending') {
                <div class="mt-3 flex justify-end gap-2">
                  <button (click)="markPaid(w)" [disabled]="acting() === w.id"
                    class="px-4 py-2 rounded-lg text-xs font-black uppercase tracking-widest bg-emerald-500 hover:bg-emerald-400 text-black disabled:opacity-40">
                    {{ acting() === w.id ? 'Procesando…' : 'Marcar como pagado' }}
                  </button>
                  <button (click)="reject(w)" [disabled]="acting() === w.id"
                    class="px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-widest bg-white/5 hover:bg-white/10 border border-rose-500/30 text-rose-400 disabled:opacity-40">
                    Rechazar
                  </button>
                </div>
              } @else if (w.status === 'paid' && w.paid_at) {
                <p class="mt-2 text-[10px] text-emerald-400/80">✓ Pagado el {{ w.paid_at | date:'d MMM yyyy HH:mm' }}</p>
              }
            </div>
          }
        </div>
      }

      @if (feedback()) {
        <div class="fixed bottom-6 right-6 z-50 rounded-xl bg-[#0d0d0d] border border-white/10 px-4 py-3 shadow-2xl">
          <p class="text-sm font-bold" [class.text-emerald-400]="feedbackType() === 'ok'" [class.text-rose-400]="feedbackType() === 'err'">
            {{ feedback() }}
          </p>
        </div>
      }
    </div>
  `,
})
export class AdminTradingWithdrawalsComponent implements OnInit {
  private readonly supabase = getSupabaseClient();

  readonly loading = signal(true);
  readonly rows = signal<TradingWithdrawalRow[]>([]);
  readonly filter = signal<'pending' | 'paid' | 'all'>('pending');
  readonly counts = signal({ pending: 0, paid: 0, total: 0 });
  readonly acting = signal<string | null>(null);
  readonly feedback = signal<string | null>(null);
  readonly feedbackType = signal<'ok' | 'err'>('ok');

  async ngOnInit(): Promise<void> {
    await this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    let q = this.supabase
      .from('withdrawal_requests')
      .select('id, user_id, amount, method, status, details, created_at, admin_notes, paid_at, user:user_id(username, email, full_name, phone)')
      .eq('method', 'trading_profit')
      .order('created_at', { ascending: false })
      .limit(200);

    if (this.filter() === 'pending') q = q.eq('status', 'pending');
    if (this.filter() === 'paid')    q = q.eq('status', 'paid');

    const { data } = await q;
    this.rows.set((data as unknown as TradingWithdrawalRow[]) || []);
    await this.loadCounts();
    this.loading.set(false);
  }

  private async loadCounts(): Promise<void> {
    const [pending, paid, total] = await Promise.all([
      this.supabase.from('withdrawal_requests').select('id', { count: 'exact', head: true }).eq('method', 'trading_profit').eq('status', 'pending'),
      this.supabase.from('withdrawal_requests').select('id', { count: 'exact', head: true }).eq('method', 'trading_profit').eq('status', 'paid'),
      this.supabase.from('withdrawal_requests').select('id', { count: 'exact', head: true }).eq('method', 'trading_profit'),
    ]);
    this.counts.set({
      pending: pending.count ?? 0,
      paid:    paid.count ?? 0,
      total:   total.count ?? 0,
    });
  }

  async markPaid(w: TradingWithdrawalRow): Promise<void> {
    this.acting.set(w.id);
    const { error } = await this.supabase
      .from('withdrawal_requests')
      .update({ status: 'paid', paid_at: new Date().toISOString() })
      .eq('id', w.id);
    this.acting.set(null);
    if (error) {
      this.flash('Error al marcar como pagado: ' + error.message, 'err');
      return;
    }
    this.flash('✓ Marcado como pagado', 'ok');
    await this.load();
  }

  async reject(w: TradingWithdrawalRow): Promise<void> {
    if (!confirm(`¿Rechazar solicitud de $${w.amount} USD? Se devolverá el monto al balance del usuario.`)) return;
    this.acting.set(w.id);

    // Devolver el monto al balance del usuario si existe el paquete
    const pkgId = w.details?.user_trading_package_id;
    if (pkgId) {
      await this.supabase.rpc('admin_restore_trading_profit', {
        p_user_trading_package_id: pkgId,
        p_amount_usd: Number(w.amount),
        p_withdrawal_id: w.id,
      });
    }

    const { error } = await this.supabase
      .from('withdrawal_requests')
      .update({ status: 'rejected' })
      .eq('id', w.id);

    this.acting.set(null);
    if (error) {
      this.flash('Error al rechazar: ' + error.message, 'err');
      return;
    }
    this.flash('Solicitud rechazada y monto devuelto', 'ok');
    await this.load();
  }

  private flash(msg: string, type: 'ok' | 'err'): void {
    this.feedback.set(msg);
    this.feedbackType.set(type);
    setTimeout(() => this.feedback.set(null), 4000);
  }
}
