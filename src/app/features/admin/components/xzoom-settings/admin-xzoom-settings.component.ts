import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PlatformSettingsService } from '../../../../core/services/platform-settings.service';

const COMMISSION_KEY = 'xzoom_commission_rate';

@Component({
  selector: 'app-admin-xzoom-settings',
  standalone: true,
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="p-6 lg:p-8 max-w-3xl">
      <header class="mb-8">
        <div class="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-red-500/10 border border-red-500/30 mb-4">
          <span class="material-symbols-outlined text-red-400 text-base">live_tv</span>
          <span class="text-[11px] font-bold text-red-300 uppercase tracking-widest">XZOOM EN VIVO</span>
        </div>
        <h1 class="text-3xl lg:text-4xl font-black text-white mb-2">
          Comisión de la plataforma
        </h1>
        <p class="text-slate-400 text-sm lg:text-base leading-relaxed max-w-xl">
          Porcentaje que PubliHazClick retiene de cada suscripción mensual que
          un visitante paga a un anfitrión. El resto se acredita automáticamente
          al balance del anfitrión.
        </p>
      </header>

      @if (loading()) {
        <div class="p-8 text-slate-500 text-sm">Cargando configuración…</div>
      } @else {
        <section class="bg-card-dark border border-white/10 rounded-2xl p-6 lg:p-8 shadow-xl">
          <label class="block mb-6">
            <span class="block text-xs font-bold text-slate-300 uppercase tracking-wide mb-2">
              Comisión (%)
            </span>
            <div class="relative max-w-xs">
              <input
                type="number"
                min="0"
                max="99"
                step="0.1"
                [(ngModel)]="percentInput"
                class="w-full px-4 py-3 pr-12 bg-black/50 border border-white/15 rounded-xl text-white text-xl font-bold focus:outline-none focus:border-red-500 focus:ring-4 focus:ring-red-500/15 transition" />
              <span class="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold">%</span>
            </div>
            <p class="mt-2 text-xs text-slate-500">
              Usa un valor entre <strong>0</strong> y <strong>99</strong>. Por defecto: 12%.
            </p>
          </label>

          <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
            <div class="p-4 bg-black/40 border border-white/10 rounded-xl">
              <div class="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">
                Ejemplo $20.000
              </div>
              <div class="text-sm text-slate-300">
                Plataforma: <strong class="text-red-400">{{ formatCOP(exampleAt(20000).platform) }}</strong>
              </div>
              <div class="text-sm text-slate-300">
                Anfitrión: <strong class="text-green-400">{{ formatCOP(exampleAt(20000).host) }}</strong>
              </div>
            </div>
            <div class="p-4 bg-black/40 border border-white/10 rounded-xl">
              <div class="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">
                Ejemplo $50.000
              </div>
              <div class="text-sm text-slate-300">
                Plataforma: <strong class="text-red-400">{{ formatCOP(exampleAt(50000).platform) }}</strong>
              </div>
              <div class="text-sm text-slate-300">
                Anfitrión: <strong class="text-green-400">{{ formatCOP(exampleAt(50000).host) }}</strong>
              </div>
            </div>
            <div class="p-4 bg-black/40 border border-white/10 rounded-xl">
              <div class="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">
                Ejemplo $100.000
              </div>
              <div class="text-sm text-slate-300">
                Plataforma: <strong class="text-red-400">{{ formatCOP(exampleAt(100000).platform) }}</strong>
              </div>
              <div class="text-sm text-slate-300">
                Anfitrión: <strong class="text-green-400">{{ formatCOP(exampleAt(100000).host) }}</strong>
              </div>
            </div>
          </div>

          @if (errorMsg()) {
            <div class="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-300 text-sm flex items-start gap-2">
              <span class="material-symbols-outlined text-red-400 text-lg">error</span>
              {{ errorMsg() }}
            </div>
          }
          @if (successMsg()) {
            <div class="mb-4 p-3 bg-green-500/10 border border-green-500/30 rounded-xl text-green-300 text-sm flex items-start gap-2">
              <span class="material-symbols-outlined text-green-400 text-lg">check_circle</span>
              {{ successMsg() }}
            </div>
          }

          <button
            type="button"
            class="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-gradient-to-r from-red-500 to-rose-500 hover:from-red-600 hover:to-rose-600 text-white font-bold text-sm uppercase tracking-wide shadow-lg shadow-red-500/30 disabled:opacity-50 disabled:cursor-not-allowed transition"
            [disabled]="saving() || !canSave()"
            (click)="save()">
            @if (saving()) {
              Guardando…
            } @else {
              <span class="material-symbols-outlined text-lg">save</span>
              Guardar comisión
            }
          </button>

          <p class="mt-6 text-[11px] text-slate-500 leading-relaxed">
            <strong class="text-slate-400">Notas:</strong>
            El cambio se aplica a partir de la próxima suscripción. Las suscripciones
            ya creadas mantienen la comisión con la que se emitieron. La configuración
            es leída dinámicamente por las edge functions
            <code class="text-red-400">create-xzoom-viewer-subscription</code> y
            <code class="text-red-400">create-xzoom-public-subscription</code>.
          </p>
        </section>
      }
    </div>
  `,
})
export class AdminXzoomSettingsComponent implements OnInit {
  private readonly settings = inject(PlatformSettingsService);

  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly errorMsg = signal<string | null>(null);
  readonly successMsg = signal<string | null>(null);

  percentInput = 12;
  private loadedPercent = 12;

  readonly canSave = computed(() => {
    const n = Number(this.percentInput);
    if (isNaN(n) || n < 0 || n >= 99) return false;
    return Math.abs(n - this.loadedPercent) > 0.0001;
  });

  async ngOnInit(): Promise<void> {
    try {
      const raw = await this.settings.getSetting(COMMISSION_KEY);
      const parsed = parseFloat(raw || '0.12');
      const percent = isNaN(parsed) ? 12 : Math.round(parsed * 10000) / 100;
      this.percentInput = percent;
      this.loadedPercent = percent;
    } catch (err: any) {
      this.errorMsg.set(err?.message ?? 'Error cargando configuración');
    } finally {
      this.loading.set(false);
    }
  }

  exampleAt(base: number): { platform: number; host: number } {
    const rate = Math.max(0, Math.min(99, Number(this.percentInput) || 0)) / 100;
    const platform = Math.floor(base * rate);
    return { platform, host: base - platform };
  }

  async save(): Promise<void> {
    const n = Number(this.percentInput);
    if (isNaN(n) || n < 0 || n >= 99) {
      this.errorMsg.set('Ingresa un número entre 0 y 99.');
      return;
    }
    this.errorMsg.set(null);
    this.successMsg.set(null);
    this.saving.set(true);
    try {
      const decimal = (n / 100).toFixed(4);
      await this.settings.setSetting(COMMISSION_KEY, decimal);
      this.loadedPercent = n;
      this.successMsg.set(`Comisión actualizada a ${n}%.`);
    } catch (err: any) {
      this.errorMsg.set(err?.message ?? 'No pudimos guardar.');
    } finally {
      this.saving.set(false);
    }
  }

  formatCOP(v: number): string {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0,
    }).format(v);
  }
}
