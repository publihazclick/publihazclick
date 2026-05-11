import { Component, ChangeDetectionStrategy, OnInit, inject, signal } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TradingPackageService, TradingBotPackage } from '../../../../core/services/trading-package.service';
import { getSupabaseClient } from '../../../../core/supabase.client';

type Form = {
  name: string;
  priceUsd: number | null;
  monthlyReturnPct: number | null;
  description: string;
  displayOrder: number | null;
  isActive: boolean;
};

@Component({
  selector: 'app-admin-trading-packages',
  standalone: true,
  imports: [CommonModule, FormsModule, DecimalPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="space-y-6">
      <div class="flex items-center gap-4">
        <div class="w-12 h-12 rounded-xl bg-gradient-to-tr from-cyan-500/20 to-emerald-500/20 border border-cyan-500/30 flex items-center justify-center">
          <span class="material-symbols-outlined text-cyan-400" style="font-size:26px">inventory_2</span>
        </div>
        <div class="flex-1">
          <h2 class="text-xl font-black text-white">Paquetes Trading Bot AI</h2>
          <p class="text-xs text-slate-500">Crear, editar o eliminar paquetes del catálogo</p>
        </div>
        <button (click)="openNew()"
          class="px-4 py-2.5 rounded-xl font-black text-sm uppercase tracking-widest bg-emerald-500 hover:bg-emerald-400 text-black flex items-center gap-2">
          <span class="material-symbols-outlined" style="font-size:18px">add</span>
          Nuevo paquete
        </button>
      </div>

      @if (loading()) {
        <p class="text-slate-500 text-sm text-center py-8">Cargando…</p>
      } @else {
        <div class="rounded-2xl border border-white/10 bg-[#0a0a0a] overflow-hidden">
          <div class="hidden md:grid grid-cols-[60px_1fr_120px_100px_120px_100px_140px] gap-2 px-4 py-2 bg-white/[0.04] border-b border-white/5 text-[9px] uppercase tracking-widest font-black text-slate-500">
            <span>Orden</span>
            <span>Nombre</span>
            <span class="text-right">Precio USD</span>
            <span class="text-right">% Mens.</span>
            <span class="text-right">Asignaciones</span>
            <span class="text-center">Activo</span>
            <span class="text-right">Acciones</span>
          </div>
          @for (p of packages(); track p.id) {
            <div class="grid grid-cols-[1fr_auto] md:grid-cols-[60px_1fr_120px_100px_120px_100px_140px] gap-2 px-4 py-2.5 text-sm border-b border-white/[0.03] hover:bg-white/[0.02]">
              <span class="text-slate-500 font-mono">{{ p.display_order }}</span>
              <span class="text-white font-bold">
                {{ p.name }}
                @if (p.description) {
                  <span class="block text-[10px] text-slate-600">{{ p.description }}</span>
                }
              </span>
              <span class="text-right text-white font-mono">\${{ p.price_usd | number:'1.2-2' }}</span>
              <span class="text-right text-emerald-400 font-mono">{{ p.monthly_return_pct | number:'1.1-1' }}%</span>
              <span class="text-right text-slate-400 font-mono text-xs">{{ assignments()[p.id] ?? 0 }}</span>
              <span class="text-center">
                @if (p.is_active) {
                  <span class="inline-block px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 text-[10px] font-black">SÍ</span>
                } @else {
                  <span class="inline-block px-2 py-0.5 rounded-full bg-white/5 text-slate-500 text-[10px] font-black">NO</span>
                }
              </span>
              <span class="text-right flex gap-1 justify-end">
                <button (click)="openEdit(p)"
                  class="px-2 py-1 rounded-lg text-[10px] font-bold border border-cyan-500/30 bg-cyan-500/10 text-cyan-400 hover:bg-cyan-500/20">
                  Editar
                </button>
                <button (click)="confirmDelete(p)"
                  class="px-2 py-1 rounded-lg text-[10px] font-bold border border-rose-500/30 bg-rose-500/10 text-rose-400 hover:bg-rose-500/20">
                  Eliminar
                </button>
              </span>
            </div>
          } @empty {
            <p class="text-slate-500 text-sm text-center py-8">No hay paquetes en el catálogo.</p>
          }
        </div>
      }

      <!-- Modal formulario -->
      @if (showForm()) {
        <div class="fixed inset-0 z-[70] flex items-end sm:items-center justify-center p-0 sm:p-4" (click)="closeForm()">
          <div class="absolute inset-0 bg-black/80 backdrop-blur-sm"></div>
          <div class="relative z-10 w-full max-w-lg rounded-t-2xl sm:rounded-2xl overflow-hidden shadow-2xl" (click)="$event.stopPropagation()">
            <div class="bg-gradient-to-br from-[#0a0a0a] via-[#0d1520] to-[#0a0a0a] border border-white/10 p-6 max-h-[85vh] overflow-y-auto">
              <div class="flex items-center gap-3 mb-5">
                <span class="material-symbols-outlined text-cyan-400">
                  {{ editingId() ? 'edit' : 'add_circle' }}
                </span>
                <h3 class="text-white font-black text-lg">
                  {{ editingId() ? 'Editar paquete' : 'Crear nuevo paquete' }}
                </h3>
              </div>

              <div class="space-y-3">
                <div>
                  <label class="block text-[10px] text-slate-400 uppercase tracking-widest mb-1 font-bold">Nombre</label>
                  <input type="text" [(ngModel)]="form.name"
                    placeholder="Ej. Diamante IV"
                    class="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-cyan-500/50" />
                </div>
                <div class="grid grid-cols-2 gap-3">
                  <div>
                    <label class="block text-[10px] text-slate-400 uppercase tracking-widest mb-1 font-bold">Precio USD</label>
                    <input type="number" min="1" step="1" [(ngModel)]="form.priceUsd"
                      class="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-cyan-500/50" />
                  </div>
                  <div>
                    <label class="block text-[10px] text-slate-400 uppercase tracking-widest mb-1 font-bold">% Mensual (ref.)</label>
                    <input type="number" min="0" max="30" step="0.1" [(ngModel)]="form.monthlyReturnPct"
                      class="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-cyan-500/50" />
                  </div>
                </div>
                <div>
                  <label class="block text-[10px] text-slate-400 uppercase tracking-widest mb-1 font-bold">Descripción (opcional)</label>
                  <input type="text" [(ngModel)]="form.description"
                    class="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-cyan-500/50" />
                </div>
                <div class="grid grid-cols-2 gap-3">
                  <div>
                    <label class="block text-[10px] text-slate-400 uppercase tracking-widest mb-1 font-bold">Orden</label>
                    <input type="number" min="1" step="1" [(ngModel)]="form.displayOrder"
                      class="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-cyan-500/50" />
                  </div>
                  <div>
                    <label class="block text-[10px] text-slate-400 uppercase tracking-widest mb-1 font-bold">Activo</label>
                    <div class="flex gap-2">
                      <button (click)="form.isActive = true"
                        [class]="form.isActive
                          ? 'flex-1 py-2.5 rounded-lg text-xs font-black border border-emerald-500/50 bg-emerald-500/15 text-emerald-400'
                          : 'flex-1 py-2.5 rounded-lg text-xs font-bold border border-white/10 bg-white/5 text-slate-400'">
                        Sí
                      </button>
                      <button (click)="form.isActive = false"
                        [class]="!form.isActive
                          ? 'flex-1 py-2.5 rounded-lg text-xs font-black border border-rose-500/50 bg-rose-500/15 text-rose-400'
                          : 'flex-1 py-2.5 rounded-lg text-xs font-bold border border-white/10 bg-white/5 text-slate-400'">
                        No
                      </button>
                    </div>
                  </div>
                </div>
                <p class="text-[10px] text-slate-600">Nota: El % que cobra el bot se define globalmente en <strong>Conf. Pat. Trdng</strong>. El % por paquete aquí es solo referencial.</p>
              </div>

              @if (feedback()) {
                <p class="mt-3 text-sm font-bold"
                  [class.text-emerald-400]="feedbackType() === 'ok'"
                  [class.text-rose-400]="feedbackType() === 'err'">
                  {{ feedback() }}
                </p>
              }

              <div class="mt-5 flex gap-2">
                <button (click)="closeForm()"
                  class="flex-1 py-2.5 rounded-lg text-sm font-bold uppercase tracking-widest bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10">
                  Cancelar
                </button>
                <button (click)="save()" [disabled]="saving() || !form.name?.trim() || !form.priceUsd"
                  class="flex-1 py-2.5 rounded-lg text-sm font-black uppercase tracking-widest bg-emerald-500 hover:bg-emerald-400 text-black disabled:opacity-40">
                  {{ saving() ? 'Guardando…' : (editingId() ? 'Guardar cambios' : 'Crear paquete') }}
                </button>
              </div>
            </div>
          </div>
        </div>
      }
    </div>
  `,
})
export class AdminTradingPackagesComponent implements OnInit {
  private readonly svc = inject(TradingPackageService);
  private readonly supabase = getSupabaseClient();

  readonly loading     = signal(true);
  readonly packages    = signal<TradingBotPackage[]>([]);
  readonly assignments = signal<Record<string, number>>({});
  readonly showForm    = signal(false);
  readonly editingId   = signal<string | null>(null);
  readonly saving      = signal(false);
  readonly feedback    = signal<string | null>(null);
  readonly feedbackType = signal<'ok' | 'err'>('ok');

  form: Form = this.emptyForm();

  async ngOnInit(): Promise<void> {
    await this.load();
  }

  private emptyForm(): Form {
    return { name: '', priceUsd: null, monthlyReturnPct: 2.0, description: '', displayOrder: null, isActive: true };
  }

  async load(): Promise<void> {
    this.loading.set(true);
    const pkgs = await this.svc.getAllTradingPackagesForAdmin();
    this.packages.set(pkgs);

    // Contar asignaciones activas por paquete (para decidir si se puede borrar)
    const counts: Record<string, number> = {};
    for (const p of pkgs) counts[p.id] = 0;

    const { data } = await this.supabase
      .from('user_trading_packages')
      .select('package_id')
      .eq('is_active', true);
    if (data) {
      for (const row of data as { package_id: string }[]) {
        counts[row.package_id] = (counts[row.package_id] ?? 0) + 1;
      }
    }
    this.assignments.set(counts);

    this.loading.set(false);
  }

  openNew(): void {
    this.editingId.set(null);
    this.form = this.emptyForm();
    this.feedback.set(null);
    this.showForm.set(true);
  }

  openEdit(p: TradingBotPackage): void {
    this.editingId.set(p.id);
    this.form = {
      name:             p.name,
      priceUsd:         Number(p.price_usd),
      monthlyReturnPct: Number(p.monthly_return_pct),
      description:      p.description ?? '',
      displayOrder:     p.display_order,
      isActive:         p.is_active,
    };
    this.feedback.set(null);
    this.showForm.set(true);
  }

  closeForm(): void {
    this.showForm.set(false);
    this.feedback.set(null);
  }

  async save(): Promise<void> {
    if (!this.form.name?.trim() || !this.form.priceUsd) return;
    this.saving.set(true);
    this.feedback.set(null);

    const editing = this.editingId();
    const input = {
      name:             this.form.name.trim(),
      priceUsd:         Number(this.form.priceUsd),
      monthlyReturnPct: this.form.monthlyReturnPct != null ? Number(this.form.monthlyReturnPct) : 2.0,
      description:      this.form.description?.trim() || null,
      displayOrder:     this.form.displayOrder != null ? Number(this.form.displayOrder) : 999,
      isActive:         !!this.form.isActive,
    };

    const result = editing
      ? await this.svc.adminUpdatePackage(editing, input)
      : await this.svc.adminCreatePackage(input);

    this.saving.set(false);

    if (!result.ok) {
      const reasons: Record<string, string> = {
        not_authenticated: 'Sesión no válida.',
        forbidden:         'Sin permisos de administrador.',
        invalid_name:      'Nombre inválido.',
        invalid_price:     'Precio inválido.',
        duplicate_name:    'Ya existe un paquete con ese nombre.',
        not_found:         'El paquete ya no existe.',
      };
      this.feedback.set(reasons[result.reason || ''] || result.reason || 'Error al guardar.');
      this.feedbackType.set('err');
      return;
    }

    this.feedback.set(editing ? '✓ Paquete actualizado' : '✓ Paquete creado');
    this.feedbackType.set('ok');
    await this.load();
    setTimeout(() => { this.closeForm(); }, 900);
  }

  async confirmDelete(p: TradingBotPackage): Promise<void> {
    const assigned = this.assignments()[p.id] ?? 0;
    const msg = assigned > 0
      ? `Este paquete tiene ${assigned} asignación(es) activa(s). No se puede eliminar mientras haya usuarios con él activo. Desactívalo en lugar de eliminarlo.`
      : `¿Eliminar el paquete "${p.name}" ($${p.price_usd} USD)? Esta acción no se puede deshacer.`;

    if (assigned > 0) { alert(msg); return; }
    if (!confirm(msg)) return;

    const result = await this.svc.adminDeletePackage(p.id);
    if (!result.ok) {
      const reasons: Record<string, string> = {
        not_authenticated:      'Sesión no válida.',
        forbidden:              'Sin permisos.',
        not_found:              'El paquete ya no existe.',
        has_active_assignments: `Tiene ${result.count ?? '?'} asignación(es) activa(s).`,
        has_assignments:        'El paquete tiene asignaciones (históricas) y no puede eliminarse.',
      };
      alert(reasons[result.reason || ''] || result.reason || 'Error al eliminar');
      return;
    }
    await this.load();
  }
}
