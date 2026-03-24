import {
  Component,
  ChangeDetectionStrategy,
  OnInit,
  OnDestroy,
  signal,
  computed,
  inject,
} from '@angular/core';
import { DecimalPipe, DatePipe } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { Subscription } from 'rxjs';
import { TradingDemoComponent } from '../trading-bot/trading-demo.component';
import { TradingPackageService, UserTradingPackage } from '../../../../core/services/trading-package.service';
import { PlatformSettingsService } from '../../../../core/services/platform-settings.service';
import { getSupabaseClient } from '../../../../core/supabase.client';

interface TradingPackage {
  name: string; price: number; monthlyReturn: number;
  border: string; text: string; bg: string; shadow: string; badge: string; level: string;
}

@Component({
  selector: 'app-trading-operation',
  standalone: true,
  imports: [DecimalPipe, DatePipe, TradingDemoComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-col items-center py-6 px-4 w-full gap-8">

      <!-- Header -->
      <div class="w-full max-w-5xl">
        <div class="flex items-center gap-3 mb-2">
          <div class="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-500/20 to-cyan-500/20 border border-emerald-500/30 flex items-center justify-center">
            <span class="material-symbols-outlined text-emerald-400" style="font-size:22px">smart_toy</span>
          </div>
          <div>
            <h2 class="text-base font-black text-white">
              @if (currentPkg()) { Operación · {{ currentPkg()!.package?.name }}
              } @else { Trading Bot AI · Operación }
            </h2>
            <p class="text-xs text-slate-500">Monitoreo en tiempo real de tus operaciones automáticas</p>
          </div>
          <span class="ml-auto flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20">
            <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
            <span class="text-[10px] font-black text-emerald-400 uppercase tracking-wider">En vivo</span>
          </span>
        </div>

        <!-- Tarjeta resumen del paquete -->
        @if (currentPkg()) {
          <div class="flex flex-wrap items-center gap-4 px-4 py-3 rounded-xl bg-emerald-500/5 border border-emerald-500/20 mt-3">
            <span class="material-symbols-outlined text-emerald-400" style="font-size:20px">verified</span>
            <div class="flex-1 min-w-0">
              <p class="text-sm font-black text-emerald-300">{{ currentPkg()!.package?.name }}</p>
              <p class="text-[10px] text-slate-500">Activado el {{ currentPkg()!.activated_at | date:'d MMM yyyy' }}</p>
            </div>
            <!-- Inversión: botón clickeable con mensaje 180 días -->
            <button (click)="showCapitalModal.set(true)" class="text-right cursor-pointer hover:opacity-80 transition-opacity group">
              <p class="text-white font-black text-base group-hover:text-cyan-300 transition-colors">
                \${{ currentPkg()!.package?.price_usd | number:'1.0-0' }} <span class="text-xs text-slate-500">USD</span>
              </p>
              <p class="text-emerald-400 font-black text-sm">2.5% - 30% <span class="text-[10px] text-slate-500">/ mes</span></p>
            </button>
            <!-- Rentabilidad: botón clickeable que abre formulario -->
            <button (click)="onEarningsClick()" class="text-right border-l border-white/10 pl-4 cursor-pointer hover:opacity-80 transition-opacity group">
              <p class="text-[10px] text-slate-500">Ganancia est. / mes</p>
              <p class="text-cyan-400 font-black text-base group-hover:text-cyan-300 transition-colors">
                \${{ earningsMin() | number:'1.2-2' }} - \${{ earningsMax() | number:'1.2-2' }}
                <span class="text-[10px] text-slate-500">USD</span>
              </p>
            </button>
          </div>

          <!-- Mensaje de elegibilidad (cuando no cumple los 30 días) -->
          @if (eligibilityMsg()) {
            <div class="mt-3 flex items-start gap-3 px-4 py-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
              <span class="material-symbols-outlined text-amber-400 shrink-0" style="font-size:20px">schedule</span>
              <div>
                <p class="text-amber-400 font-black text-sm mb-1">Retiro no disponible aún</p>
                <p class="text-slate-400 text-xs leading-relaxed">{{ eligibilityMsg() }}</p>
              </div>
              <button (click)="eligibilityMsg.set('')" class="ml-auto text-slate-500 hover:text-white shrink-0">
                <span class="material-symbols-outlined" style="font-size:16px">close</span>
              </button>
            </div>
          }

          <!-- Formulario de retiro -->
          @if (showWithdrawForm()) {
            <div class="mt-3 rounded-xl border border-cyan-500/30 bg-cyan-500/5 px-4 py-4">
              <div class="flex items-center justify-between mb-4">
                <p class="text-sm font-black text-cyan-400 uppercase tracking-widest flex items-center gap-1.5">
                  <span class="material-symbols-outlined" style="font-size:16px">payments</span>
                  Solicitar Retiro de Rentabilidad
                </p>
                <button (click)="closeWithdrawForm()" class="text-slate-500 hover:text-white">
                  <span class="material-symbols-outlined" style="font-size:18px">close</span>
                </button>
              </div>
              <p class="text-[10px] text-slate-500 mb-4">
                Rentabilidad estimada: <strong class="text-cyan-400">\${{ earningsMin() | number:'1.2-2' }} — \${{ earningsMax() | number:'1.2-2' }} USD</strong>
                (entre 2.5% y 30% sobre \${{ currentPkg()!.package?.price_usd | number:'1.0-0' }} USD)
              </p>
              <div class="space-y-3">
                <div>
                  <label class="block text-[10px] text-slate-400 uppercase tracking-widest mb-1 font-bold">Nombres y Apellidos</label>
                  <input type="text"
                    [value]="withdrawFullName()"
                    (input)="withdrawFullName.set($any($event.target).value)"
                    placeholder="Tu nombre completo"
                    class="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-cyan-500/50 focus:bg-white/8 transition-all" />
                </div>
                <div>
                  <label class="block text-[10px] text-slate-400 uppercase tracking-widest mb-1 font-bold">Número de Cuenta</label>
                  <input type="text"
                    [value]="withdrawAccountNumber()"
                    (input)="withdrawAccountNumber.set($any($event.target).value)"
                    placeholder="Número de cuenta bancaria"
                    class="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-cyan-500/50 focus:bg-white/8 transition-all" />
                </div>
                <div>
                  <label class="block text-[10px] text-slate-400 uppercase tracking-widest mb-1 font-bold">Tipo de Cuenta</label>
                  <div class="flex gap-3">
                    <button (click)="withdrawAccountType.set('ahorros')"
                      [class]="withdrawAccountType() === 'ahorros'
                        ? 'flex-1 py-2.5 rounded-lg text-sm font-black border border-cyan-500/50 bg-cyan-500/15 text-cyan-400'
                        : 'flex-1 py-2.5 rounded-lg text-sm font-bold border border-white/10 bg-white/5 text-slate-400 hover:border-white/20'">
                      Ahorros
                    </button>
                    <button (click)="withdrawAccountType.set('corriente')"
                      [class]="withdrawAccountType() === 'corriente'
                        ? 'flex-1 py-2.5 rounded-lg text-sm font-black border border-cyan-500/50 bg-cyan-500/15 text-cyan-400'
                        : 'flex-1 py-2.5 rounded-lg text-sm font-bold border border-white/10 bg-white/5 text-slate-400 hover:border-white/20'">
                      Corriente
                    </button>
                  </div>
                </div>
              </div>

              @if (!withdrawDone()) {
                <button
                  (click)="requestWithdrawal()"
                  [disabled]="withdrawing() || !withdrawFullName().trim() || !withdrawAccountNumber().trim()"
                  class="mt-4 w-full flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-black text-sm uppercase tracking-widest transition-all shadow-lg
                    bg-gradient-to-r from-cyan-500 to-emerald-500 text-black hover:from-cyan-400 hover:to-emerald-400 disabled:opacity-40 shadow-cyan-500/20">
                  @if (withdrawing()) {
                    <span class="material-symbols-outlined animate-spin" style="font-size:18px">autorenew</span>
                    Solicitando...
                  } @else {
                    <span class="material-symbols-outlined" style="font-size:18px">account_balance_wallet</span>
                    Enviar Solicitud
                  }
                </button>
              } @else {
                <div class="mt-4 flex items-center gap-2 px-4 py-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                  <span class="material-symbols-outlined text-emerald-400" style="font-size:18px">check_circle</span>
                  <span class="text-emerald-400 font-black text-sm">Solicitud enviada correctamente</span>
                </div>
              }

              @if (withdrawFeedback()) {
                <div class="mt-3 flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold"
                  [class]="withdrawFeedbackType() === 'ok'
                    ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400'
                    : 'bg-rose-500/10 border border-rose-500/20 text-rose-400'">
                  <span class="material-symbols-outlined" style="font-size:14px">
                    {{ withdrawFeedbackType() === 'ok' ? 'check_circle' : 'error' }}
                  </span>
                  {{ withdrawFeedback() }}
                </div>
              }
            </div>
          }

          <!-- Barra de progreso (30 días) -->
          @if (!canWithdraw()) {
            <div class="mt-4 rounded-xl border border-white/10 bg-white/[0.02] px-4 py-4">
              <div class="flex items-center gap-3">
                <span class="material-symbols-outlined text-slate-500" style="font-size:22px">schedule</span>
                <div class="flex-1">
                  <p class="text-xs font-black text-slate-400 uppercase tracking-widest">Retiro habilitado en</p>
                  <p class="text-white font-black text-lg">{{ 30 - daysActive() }} días</p>
                  <p class="text-[10px] text-slate-600 mt-0.5">
                    Disponible el {{ withdrawAvailableDate() | date:'d MMM yyyy' }}.
                  </p>
                </div>
              </div>
              <div class="mt-3">
                <div class="flex justify-between text-[9px] text-slate-600 mb-1">
                  <span>Día {{ daysActive() }}</span>
                  <span>Día 30</span>
                </div>
                <div class="h-1.5 bg-white/5 rounded-full overflow-hidden">
                  <div class="h-full rounded-full transition-all duration-700 bg-gradient-to-r from-emerald-500 to-cyan-500"
                    [style.width.%]="progressPct()"></div>
                </div>
              </div>
            </div>
          }
        }
      </div>

      <!-- Demo en vivo -->
      <div class="w-full max-w-5xl">
        <app-trading-demo
          [packageName]="demoPackage().name"
          [packagePrice]="demoPackage().price"
          [monthlyReturn]="demoPackage().monthlyReturn"
          [isEmbedded]="true"
          [isLive]="true"
        />
      </div>

      <!-- Adquirir más paquetes -->
      <div class="w-full max-w-5xl border-t border-white/5 pt-6">
        <div class="text-center mb-6">
          <h3 class="text-white font-black text-lg uppercase tracking-widest">
            Amplía tus <span class="text-primary">Ganancias</span>
          </h3>
          <p class="text-slate-500 text-xs mt-1">Activa más paquetes y multiplica tus rendimientos mensuales</p>
        </div>

        <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
          @for (pkg of packages; track pkg.price) {
            <div class="relative rounded-xl p-3 border transition-all duration-300 hover:scale-105 hover:-translate-y-1 flex flex-col gap-2
              {{ pkg.bg }} {{ pkg.border }} {{ pkg.shadow }}">
              <span class="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full self-start {{ pkg.badge }}">{{ pkg.level }}</span>
              <p class="text-white font-black text-sm leading-tight">{{ pkg.name }}</p>
              <div class="flex items-baseline gap-1">
                <p class="font-black text-lg {{ pkg.text }}">\${{ pkg.price | number:'1.0-0' }}</p>
                <span class="text-[10px] font-black text-slate-500 uppercase">USD</span>
              </div>
              <div class="flex items-center gap-1 bg-black/20 rounded-lg px-2 py-1">
                <span class="material-symbols-outlined text-emerald-400" style="font-size:13px">trending_up</span>
                <span class="text-emerald-400 font-black text-xs">2.5% - 30%</span>
                <span class="text-slate-500 text-[10px]">/ mes</span>
              </div>
              <button (click)="selectedPackage.set(pkg)"
                class="w-full py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider border transition-all flex items-center justify-center gap-1 opacity-80 hover:opacity-100
                  {{ pkg.border }} {{ pkg.text }} {{ pkg.bg }}">
                <span class="material-symbols-outlined" style="font-size:12px">shopping_cart</span>
                Adquirir
              </button>
            </div>
          }
        </div>
      </div>
    </div>

    <!-- MODAL 180 DÍAS (capital) -->
    @if (showCapitalModal()) {
      <div class="fixed inset-0 z-[70] flex items-end sm:items-center justify-center p-0 sm:p-4"
        (click)="showCapitalModal.set(false)">
        <div class="absolute inset-0 bg-black/80 backdrop-blur-sm"></div>
        <div class="relative z-10 w-full max-w-md rounded-t-2xl sm:rounded-2xl overflow-hidden shadow-2xl mx-auto"
          (click)="$event.stopPropagation()">
          <div class="bg-gradient-to-br from-[#0a0a0a] via-[#111827] to-[#0a0a0a] border border-white/10 p-6">
            <button (click)="showCapitalModal.set(false)"
              class="absolute top-3 right-3 w-8 h-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 transition-all">
              <span class="material-symbols-outlined" style="font-size:16px">close</span>
            </button>
            <div class="flex items-center gap-3 mb-4 pr-8">
              <div class="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-500/20 to-orange-500/20 border border-amber-500/30 flex items-center justify-center shrink-0">
                <span class="material-symbols-outlined text-amber-400" style="font-size:20px">info</span>
              </div>
              <div>
                <p class="text-[10px] text-slate-500 uppercase tracking-widest font-bold">Política de Capital</p>
                <h3 class="text-white font-black text-base">Retiro de Valor de tu compra de servicio</h3>
              </div>
            </div>
            <div class="bg-amber-500/8 border border-amber-500/20 rounded-xl px-4 py-4">
              <p class="text-slate-300 text-sm leading-relaxed">
                Recuerda que puedes retirar mes a mes las rentabilidades generadas en cada uno de tus paquetes,
                pero para solicitar el dinero de tu paquete adquirido deben pasar
                <strong class="text-amber-400">180 días calendario</strong> desde la fecha de adquisición de servicio,
                ya que hemos realizado una inversión muy costosa en la integración de tu bot,
                por lo tanto no nos es rentable la solicitud antes de 6 meses.
              </p>
            </div>
            <button (click)="showCapitalModal.set(false)"
              class="mt-4 w-full py-3 rounded-xl font-black text-sm uppercase tracking-widest bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10 transition-all">
              Entendido
            </button>
          </div>
        </div>
      </div>
    }

    <!-- MODAL DE PAGO -->
    @if (selectedPackage()) {
      <div class="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4"
        (click)="selectedPackage.set(null)">
        <div class="absolute inset-0 bg-black/80 backdrop-blur-sm"></div>
        <div class="relative z-10 w-full max-w-md rounded-t-2xl sm:rounded-2xl overflow-hidden shadow-2xl mx-auto max-h-[92vh] overflow-y-auto"
          (click)="$event.stopPropagation()">
          <div class="bg-gradient-to-br from-[#0a0a0a] via-[#111827] to-[#0a0a0a] border border-white/10 px-4 sm:px-6 pt-5 sm:pt-6 pb-4">
            <button (click)="selectedPackage.set(null)"
              class="absolute top-3 right-3 w-8 h-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 transition-all z-10">
              <span class="material-symbols-outlined" style="font-size:16px">close</span>
            </button>
            <div class="flex items-center gap-3 mb-4 pr-8">
              <div class="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-500/20 to-cyan-500/20 border border-emerald-500/30 flex items-center justify-center shrink-0">
                <span class="material-symbols-outlined text-emerald-400" style="font-size:18px">trending_up</span>
              </div>
              <div>
                <p class="text-[10px] text-slate-500 uppercase tracking-widest font-bold">Trading Bot AI</p>
                <h3 class="text-white font-black text-base sm:text-lg">Paquete {{ selectedPackage()!.name }}</h3>
              </div>
            </div>
            <div class="flex items-center gap-3 bg-white/5 border border-white/10 rounded-xl px-4 py-3">
              <div class="flex-1"><p class="text-slate-400 text-xs">Inversión</p>
                <p class="text-white font-black text-xl">\${{ selectedPackage()!.price | number:'1.0-0' }} <span class="text-xs font-bold text-slate-500">USD</span></p>
              </div>
              <div class="w-px h-8 bg-white/10 shrink-0"></div>
              <div class="flex-1 text-right"><p class="text-slate-400 text-xs">Rentabilidad</p>
                <p class="text-emerald-400 font-black text-xl">2.5% - 30% <span class="text-xs font-bold text-slate-500">/ mes</span></p>
              </div>
            </div>
          </div>
          <div class="bg-[#0d0d0d] border-x border-white/10 px-4 sm:px-6 py-4 space-y-3">
            <p class="text-slate-300 text-xs text-center">Realiza tu pago a través de cualquiera de los siguientes métodos:</p>
            <div class="rounded-xl border border-[#8B5CF6]/40 bg-[#8B5CF6]/5 px-4 py-3">
              <div class="flex items-center gap-3 mb-2">
                <div class="w-9 h-9 rounded-lg bg-[#8B5CF6]/20 border border-[#8B5CF6]/40 flex items-center justify-center shrink-0">
                  <span class="material-symbols-outlined text-[#8B5CF6]" style="font-size:16px">smartphone</span>
                </div>
                <span class="text-white font-black">Nequi</span>
              </div>
              <div class="space-y-1 pl-1">
                <div class="flex items-center gap-2"><span class="material-symbols-outlined text-[#8B5CF6]" style="font-size:14px">call</span>
                  <span class="text-white font-black text-lg tracking-widest">313 445 3649</span></div>
                <div class="flex items-center gap-2"><span class="material-symbols-outlined text-slate-500" style="font-size:14px">person</span>
                  <span class="text-slate-300 font-bold text-sm">VICTOR VERA</span></div>
              </div>
            </div>
            <div class="rounded-xl border border-[#E63946]/40 bg-[#E63946]/5 px-4 py-3">
              <div class="flex items-center gap-3 mb-2">
                <div class="w-9 h-9 rounded-lg bg-[#E63946]/20 border border-[#E63946]/40 flex items-center justify-center shrink-0">
                  <span class="material-symbols-outlined text-[#E63946]" style="font-size:16px">account_balance_wallet</span>
                </div>
                <span class="text-white font-black">Daviplata</span>
              </div>
              <div class="space-y-1 pl-1">
                <div class="flex items-center gap-2"><span class="material-symbols-outlined text-[#E63946]" style="font-size:14px">call</span>
                  <span class="text-white font-black text-lg tracking-widest">313 445 3649</span></div>
                <div class="flex items-center gap-2"><span class="material-symbols-outlined text-slate-500" style="font-size:14px">person</span>
                  <span class="text-slate-300 font-bold text-sm">VICTOR VERA</span></div>
              </div>
            </div>
          </div>
          <div class="bg-[#0d0d0d] border border-white/10 rounded-b-2xl px-4 sm:px-6 pb-5 pt-2">
            <div class="rounded-xl border border-[#25D366]/40 bg-[#25D366]/5 px-4 py-3">
              <div class="flex items-start gap-3">
                <div class="w-9 h-9 rounded-lg bg-[#25D366]/20 border border-[#25D366]/40 flex items-center justify-center shrink-0 mt-0.5">
                  <span class="material-symbols-outlined text-[#25D366]" style="font-size:16px">chat</span>
                </div>
                <div class="flex-1 min-w-0">
                  <p class="text-white font-black text-sm mb-1">Envía tu comprobante de pago</p>
                  <p class="text-slate-400 text-xs leading-relaxed mb-3">Una vez realizada la compra, envía tu comprobante vía WhatsApp al número:</p>
                  <a href="https://wa.me/573181800264" target="_blank" rel="noopener noreferrer"
                    class="flex items-center justify-center gap-2 w-full py-3 rounded-lg bg-[#25D366] hover:bg-[#20bd5a] transition-all text-black font-black shadow-lg shadow-[#25D366]/20">
                    <span class="material-symbols-outlined shrink-0" style="font-size:20px">whatsapp</span>
                    <span class="text-lg tracking-widest">318 180 0264</span>
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    }
  `,
})
export class TradingOperationComponent implements OnInit, OnDestroy {
  private readonly svc = inject(TradingPackageService);
  private readonly settingsSvc = inject(PlatformSettingsService);
  private readonly route = inject(ActivatedRoute);
  private readonly supabase = getSupabaseClient();
  private paramSub?: Subscription;

  // Rentabilidad mensual máxima fijada por el administrador (default 30%)
  readonly globalReturnPct = signal(30);

  readonly currentPkg      = signal<UserTradingPackage | null>(null);
  readonly selectedPackage = signal<TradingPackage | null>(null);
  readonly showCapitalModal = signal(false);
  readonly showWithdrawForm = signal(false);
  readonly eligibilityMsg   = signal('');
  readonly withdrawing      = signal(false);
  readonly withdrawDone     = signal(false);
  readonly withdrawFeedback      = signal<string | null>(null);
  readonly withdrawFeedbackType  = signal<'ok' | 'err'>('ok');
  readonly withdrawFullName      = signal('');
  readonly withdrawAccountNumber = signal('');
  readonly withdrawAccountType   = signal<'ahorros' | 'corriente'>('ahorros');

  // Fecha del último retiro aprobado para este paquete
  private lastWithdrawalDate = signal<Date | null>(null);

  readonly demoPackage = signal<TradingPackage>({
    name: 'Semilla', price: 100, monthlyReturn: 2.0,
    bg: 'bg-emerald-500/5', border: 'border-emerald-500/30',
    text: 'text-emerald-400', shadow: '', badge: 'bg-emerald-500/20 text-emerald-400', level: 'Activo'
  });

  readonly daysActive = computed(() => {
    const pkg = this.currentPkg();
    if (!pkg?.activated_at) return 0;
    const ms = Date.now() - new Date(pkg.activated_at).getTime();
    return Math.floor(ms / (1000 * 60 * 60 * 24));
  });

  readonly daysSinceLastWithdrawal = computed(() => {
    const d = this.lastWithdrawalDate();
    if (!d) return 999;
    const ms = Date.now() - d.getTime();
    return Math.floor(ms / (1000 * 60 * 60 * 24));
  });

  readonly canWithdraw = computed(() =>
    this.daysActive() >= 30 && this.daysSinceLastWithdrawal() >= 30
  );

  readonly progressPct = computed(() => Math.min(100, (this.daysActive() / 30) * 100));

  readonly earningsMin = computed(() => {
    const pkg = this.currentPkg();
    if (!pkg?.package) return 0;
    return pkg.package.price_usd * 0.025;
  });

  readonly earningsMax = computed(() => {
    const pkg = this.currentPkg();
    if (!pkg?.package) return 0;
    return pkg.package.price_usd * (this.globalReturnPct() / 100);
  });

  readonly withdrawAvailableDate = computed(() => {
    const pkg = this.currentPkg();
    if (!pkg?.activated_at) return null;
    const d = new Date(pkg.activated_at);
    d.setDate(d.getDate() + 30);
    return d;
  });

  ngOnInit(): void {
    // Cargar rentabilidad global fijada por el admin
    this.settingsSvc.getSetting('trading_monthly_return_pct').then(v => {
      const parsed = parseFloat(v);
      if (!isNaN(parsed) && parsed >= 2.5 && parsed <= 30) {
        this.globalReturnPct.set(parsed);
      }
    }).catch(() => {});

    this.paramSub = this.route.paramMap.subscribe(params => {
      const packageId = params.get('packageId');
      this.currentPkg.set(null);
      this.withdrawDone.set(false);
      this.withdrawFeedback.set(null);
      this.showWithdrawForm.set(false);
      this.eligibilityMsg.set('');
      this.lastWithdrawalDate.set(null);
      this.loadPackage(packageId);
    });
  }

  ngOnDestroy(): void {
    this.paramSub?.unsubscribe();
  }

  private async loadPackage(packageId: string | null): Promise<void> {
    if (packageId) {
      const pkg = await this.svc.getMyPackageById(packageId);
      if (pkg?.package) {
        this.currentPkg.set(pkg);
        this.demoPackage.set({
          name: pkg.package.name, price: pkg.package.price_usd,
          monthlyReturn: pkg.package.monthly_return_pct,
          bg: 'bg-emerald-500/5', border: 'border-emerald-500/30',
          text: 'text-emerald-400', shadow: '', badge: 'bg-emerald-500/20 text-emerald-400', level: 'Activo'
        });
        await this.loadLastWithdrawal(pkg.id);
      }
    } else {
      const pkgs = await this.svc.getMyActivePackages();
      if (pkgs.length > 0 && pkgs[0].package) {
        this.currentPkg.set(pkgs[0]);
        const p = pkgs[0].package;
        this.demoPackage.set({
          name: p.name, price: p.price_usd, monthlyReturn: p.monthly_return_pct,
          bg: 'bg-emerald-500/5', border: 'border-emerald-500/30',
          text: 'text-emerald-400', shadow: '', badge: 'bg-emerald-500/20 text-emerald-400', level: 'Activo'
        });
        await this.loadLastWithdrawal(pkgs[0].id);
      }
    }
  }

  private async loadLastWithdrawal(userPkgId: string): Promise<void> {
    const { data } = await this.supabase
      .from('withdrawal_requests')
      .select('created_at')
      .eq('method', 'trading_profit')
      .contains('details', { user_trading_package_id: userPkgId })
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (data?.created_at) {
      this.lastWithdrawalDate.set(new Date(data.created_at));
    }
  }

  onEarningsClick(): void {
    if (this.showWithdrawForm()) {
      this.closeWithdrawForm();
      return;
    }

    if (this.daysActive() < 30) {
      const available = this.withdrawAvailableDate();
      const dateStr = available
        ? available.toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' })
        : '';
      this.eligibilityMsg.set(
        `Debes esperar 30 días calendario desde la activación de tu paquete para solicitar el retiro de rentabilidad. ` +
        `Tu paquete lleva ${this.daysActive()} día(s) activo. Fecha disponible: ${dateStr}.`
      );
      return;
    }

    if (this.daysSinceLastWithdrawal() < 30) {
      const daysLeft = 30 - this.daysSinceLastWithdrawal();
      this.eligibilityMsg.set(
        `Ya realizaste una solicitud de retiro recientemente. Debes esperar 30 días calendario entre cada solicitud. ` +
        `Podrás hacer una nueva solicitud en ${daysLeft} día(s).`
      );
      return;
    }

    this.eligibilityMsg.set('');
    this.showWithdrawForm.set(true);
  }

  closeWithdrawForm(): void {
    this.showWithdrawForm.set(false);
    this.withdrawFeedback.set(null);
    this.withdrawFullName.set('');
    this.withdrawAccountNumber.set('');
    this.withdrawAccountType.set('ahorros');
  }

  async requestWithdrawal(): Promise<void> {
    const pkg = this.currentPkg();
    if (!pkg || this.withdrawing()) return;
    if (!this.withdrawFullName().trim() || !this.withdrawAccountNumber().trim()) return;

    this.withdrawing.set(true);
    this.withdrawFeedback.set(null);

    const { data: { user } } = await this.supabase.auth.getUser();
    if (!user) { this.withdrawing.set(false); return; }

    const minAmount = this.earningsMin();
    const maxAmount = this.earningsMax();
    const { error } = await this.supabase.from('withdrawal_requests').insert({
      user_id: user.id,
      amount: minAmount,
      method: 'trading_profit',
      details: {
        type: 'trading_profit',
        package_name: pkg.package?.name,
        package_id: pkg.package_id,
        user_trading_package_id: pkg.id,
        price_usd: pkg.package?.price_usd,
        earnings_min_usd: minAmount,
        earnings_max_usd: maxAmount,
        return_range: '2.5% - 30%',
        activated_at: pkg.activated_at,
        days_active: this.daysActive(),
        full_name: this.withdrawFullName().trim(),
        account_number: this.withdrawAccountNumber().trim(),
        account_type: this.withdrawAccountType(),
      },
    });

    if (error) {
      this.withdrawFeedback.set('Error al enviar la solicitud. Intenta de nuevo.');
      this.withdrawFeedbackType.set('err');
    } else {
      this.withdrawDone.set(true);
      this.lastWithdrawalDate.set(new Date());
      this.withdrawFeedback.set(
        `✓ Solicitud enviada. El administrador procesará tu retiro (entre $${minAmount.toFixed(2)} y $${maxAmount.toFixed(2)} USD).`
      );
      this.withdrawFeedbackType.set('ok');
    }
    this.withdrawing.set(false);
  }

  packages: TradingPackage[] = [
    { name: 'Semilla',       price: 100,   monthlyReturn: 2.0, level: 'Entrada',   bg: 'bg-emerald-500/5',  border: 'border-emerald-500/30', text: 'text-emerald-400', shadow: 'hover:shadow-lg hover:shadow-emerald-500/10', badge: 'bg-emerald-500/20 text-emerald-400' },
    { name: 'Brote',         price: 200,   monthlyReturn: 2.1, level: 'Entrada',   bg: 'bg-emerald-500/5',  border: 'border-emerald-500/30', text: 'text-emerald-400', shadow: 'hover:shadow-lg hover:shadow-emerald-500/10', badge: 'bg-emerald-500/20 text-emerald-400' },
    { name: 'Iniciador',     price: 500,   monthlyReturn: 2.2, level: 'Entrada',   bg: 'bg-emerald-500/5',  border: 'border-emerald-400/40', text: 'text-emerald-300', shadow: 'hover:shadow-lg hover:shadow-emerald-400/15', badge: 'bg-emerald-400/20 text-emerald-300' },
    { name: 'Bronce I',      price: 1000,  monthlyReturn: 2.3, level: 'Bronce',    bg: 'bg-amber-700/10',   border: 'border-amber-700/40',   text: 'text-amber-600',   shadow: 'hover:shadow-lg hover:shadow-amber-700/15',  badge: 'bg-amber-700/20 text-amber-600'   },
    { name: 'Bronce II',     price: 1500,  monthlyReturn: 2.4, level: 'Bronce',    bg: 'bg-amber-700/10',   border: 'border-amber-700/40',   text: 'text-amber-600',   shadow: 'hover:shadow-lg hover:shadow-amber-700/15',  badge: 'bg-amber-700/20 text-amber-600'   },
    { name: 'Bronce III',    price: 2000,  monthlyReturn: 2.5, level: 'Bronce',    bg: 'bg-amber-700/10',   border: 'border-amber-600/50',   text: 'text-amber-500',   shadow: 'hover:shadow-lg hover:shadow-amber-600/20',  badge: 'bg-amber-600/20 text-amber-500'   },
    { name: 'Plata I',       price: 2500,  monthlyReturn: 2.6, level: 'Plata',     bg: 'bg-slate-400/5',    border: 'border-slate-400/30',   text: 'text-slate-300',   shadow: 'hover:shadow-lg hover:shadow-slate-400/10',  badge: 'bg-slate-400/20 text-slate-300'   },
    { name: 'Plata II',      price: 3000,  monthlyReturn: 2.7, level: 'Plata',     bg: 'bg-slate-400/5',    border: 'border-slate-400/30',   text: 'text-slate-300',   shadow: 'hover:shadow-lg hover:shadow-slate-400/10',  badge: 'bg-slate-400/20 text-slate-300'   },
    { name: 'Plata III',     price: 3500,  monthlyReturn: 2.8, level: 'Plata',     bg: 'bg-slate-300/5',    border: 'border-slate-300/40',   text: 'text-slate-200',   shadow: 'hover:shadow-lg hover:shadow-slate-300/15',  badge: 'bg-slate-300/20 text-slate-200'   },
    { name: 'Oro I',         price: 4000,  monthlyReturn: 3.0, level: 'Oro',       bg: 'bg-yellow-500/5',   border: 'border-yellow-500/30',  text: 'text-yellow-400',  shadow: 'hover:shadow-lg hover:shadow-yellow-500/15', badge: 'bg-yellow-500/20 text-yellow-400' },
    { name: 'Oro II',        price: 4500,  monthlyReturn: 3.1, level: 'Oro',       bg: 'bg-yellow-500/5',   border: 'border-yellow-500/30',  text: 'text-yellow-400',  shadow: 'hover:shadow-lg hover:shadow-yellow-500/15', badge: 'bg-yellow-500/20 text-yellow-400' },
    { name: 'Oro III',       price: 5000,  monthlyReturn: 3.2, level: 'Oro',       bg: 'bg-yellow-400/5',   border: 'border-yellow-400/40',  text: 'text-yellow-300',  shadow: 'hover:shadow-lg hover:shadow-yellow-400/20', badge: 'bg-yellow-400/20 text-yellow-300' },
    { name: 'Zafiro I',      price: 5500,  monthlyReturn: 3.3, level: 'Zafiro',    bg: 'bg-blue-500/5',     border: 'border-blue-500/30',    text: 'text-blue-400',    shadow: 'hover:shadow-lg hover:shadow-blue-500/15',   badge: 'bg-blue-500/20 text-blue-400'     },
    { name: 'Zafiro II',     price: 6000,  monthlyReturn: 3.4, level: 'Zafiro',    bg: 'bg-blue-500/5',     border: 'border-blue-500/30',    text: 'text-blue-400',    shadow: 'hover:shadow-lg hover:shadow-blue-500/15',   badge: 'bg-blue-500/20 text-blue-400'     },
    { name: 'Zafiro III',    price: 6500,  monthlyReturn: 3.5, level: 'Zafiro',    bg: 'bg-blue-400/5',     border: 'border-blue-400/40',    text: 'text-blue-300',    shadow: 'hover:shadow-lg hover:shadow-blue-400/20',   badge: 'bg-blue-400/20 text-blue-300'     },
    { name: 'Esmeralda I',   price: 7000,  monthlyReturn: 3.6, level: 'Esmeralda', bg: 'bg-teal-500/5',     border: 'border-teal-500/30',    text: 'text-teal-400',    shadow: 'hover:shadow-lg hover:shadow-teal-500/15',   badge: 'bg-teal-500/20 text-teal-400'     },
    { name: 'Esmeralda II',  price: 7500,  monthlyReturn: 3.7, level: 'Esmeralda', bg: 'bg-teal-500/5',     border: 'border-teal-500/30',    text: 'text-teal-400',    shadow: 'hover:shadow-lg hover:shadow-teal-500/15',   badge: 'bg-teal-500/20 text-teal-400'     },
    { name: 'Esmeralda III', price: 8000,  monthlyReturn: 3.8, level: 'Esmeralda', bg: 'bg-teal-400/5',     border: 'border-teal-400/40',    text: 'text-teal-300',    shadow: 'hover:shadow-lg hover:shadow-teal-400/20',   badge: 'bg-teal-400/20 text-teal-300'     },
    { name: 'Rubí I',        price: 8500,  monthlyReturn: 3.9, level: 'Rubí',      bg: 'bg-red-500/5',      border: 'border-red-500/30',     text: 'text-red-400',     shadow: 'hover:shadow-lg hover:shadow-red-500/15',    badge: 'bg-red-500/20 text-red-400'       },
    { name: 'Rubí II',       price: 9000,  monthlyReturn: 4.0, level: 'Rubí',      bg: 'bg-red-500/5',      border: 'border-red-500/30',     text: 'text-red-400',     shadow: 'hover:shadow-lg hover:shadow-red-500/15',    badge: 'bg-red-500/20 text-red-400'       },
    { name: 'Rubí III',      price: 9500,  monthlyReturn: 4.1, level: 'Rubí',      bg: 'bg-red-400/5',      border: 'border-red-400/40',     text: 'text-red-300',     shadow: 'hover:shadow-lg hover:shadow-red-400/20',    badge: 'bg-red-400/20 text-red-300'       },
    { name: 'Diamante I',    price: 10000, monthlyReturn: 4.2, level: 'Diamante',  bg: 'bg-cyan-500/5',     border: 'border-cyan-500/30',    text: 'text-cyan-400',    shadow: 'hover:shadow-lg hover:shadow-cyan-500/20',   badge: 'bg-cyan-500/20 text-cyan-400'     },
    { name: 'Diamante II',   price: 10500, monthlyReturn: 4.3, level: 'Diamante',  bg: 'bg-cyan-500/5',     border: 'border-cyan-500/30',    text: 'text-cyan-400',    shadow: 'hover:shadow-lg hover:shadow-cyan-500/20',   badge: 'bg-cyan-500/20 text-cyan-400'     },
    { name: 'Diamante III',  price: 11000, monthlyReturn: 4.4, level: 'Diamante',  bg: 'bg-cyan-400/5',     border: 'border-cyan-400/40',    text: 'text-cyan-300',    shadow: 'hover:shadow-lg hover:shadow-cyan-400/25',   badge: 'bg-cyan-400/20 text-cyan-300'     },
    { name: 'Platino I',     price: 11500, monthlyReturn: 4.5, level: 'Platino',   bg: 'bg-violet-500/5',   border: 'border-violet-500/30',  text: 'text-violet-400',  shadow: 'hover:shadow-lg hover:shadow-violet-500/20', badge: 'bg-violet-500/20 text-violet-400' },
    { name: 'Platino II',    price: 12000, monthlyReturn: 4.6, level: 'Platino',   bg: 'bg-violet-500/5',   border: 'border-violet-500/30',  text: 'text-violet-400',  shadow: 'hover:shadow-lg hover:shadow-violet-500/20', badge: 'bg-violet-500/20 text-violet-400' },
    { name: 'Platino III',   price: 12500, monthlyReturn: 4.7, level: 'Platino',   bg: 'bg-violet-400/5',   border: 'border-violet-400/40',  text: 'text-violet-300',  shadow: 'hover:shadow-lg hover:shadow-violet-400/25', badge: 'bg-violet-400/20 text-violet-300' },
    { name: 'Élite I',       price: 13000, monthlyReturn: 4.8, level: 'Élite',     bg: 'bg-fuchsia-500/5',  border: 'border-fuchsia-500/30', text: 'text-fuchsia-400', shadow: 'hover:shadow-lg hover:shadow-fuchsia-500/20',badge: 'bg-fuchsia-500/20 text-fuchsia-400'},
    { name: 'Élite II',      price: 13500, monthlyReturn: 4.9, level: 'Élite',     bg: 'bg-fuchsia-500/5',  border: 'border-fuchsia-500/30', text: 'text-fuchsia-400', shadow: 'hover:shadow-lg hover:shadow-fuchsia-500/20',badge: 'bg-fuchsia-500/20 text-fuchsia-400'},
    { name: 'Élite III',     price: 14000, monthlyReturn: 5.0, level: 'Élite',     bg: 'bg-fuchsia-400/5',  border: 'border-fuchsia-400/40', text: 'text-fuchsia-300', shadow: 'hover:shadow-lg hover:shadow-fuchsia-400/25',badge: 'bg-fuchsia-400/20 text-fuchsia-300'},
    { name: 'Máster I',      price: 14500, monthlyReturn: 5.1, level: 'Máster',    bg: 'bg-indigo-500/5',   border: 'border-indigo-500/30',  text: 'text-indigo-400',  shadow: 'hover:shadow-lg hover:shadow-indigo-500/20', badge: 'bg-indigo-500/20 text-indigo-400' },
    { name: 'Máster II',     price: 15000, monthlyReturn: 5.2, level: 'Máster',    bg: 'bg-indigo-500/5',   border: 'border-indigo-500/30',  text: 'text-indigo-400',  shadow: 'hover:shadow-lg hover:shadow-indigo-500/20', badge: 'bg-indigo-500/20 text-indigo-400' },
    { name: 'Máster III',    price: 15500, monthlyReturn: 5.3, level: 'Máster',    bg: 'bg-indigo-400/5',   border: 'border-indigo-400/40',  text: 'text-indigo-300',  shadow: 'hover:shadow-lg hover:shadow-indigo-400/25', badge: 'bg-indigo-400/20 text-indigo-300' },
    { name: 'Leyenda I',     price: 16000, monthlyReturn: 5.4, level: 'Leyenda',   bg: 'bg-orange-500/5',   border: 'border-orange-500/30',  text: 'text-orange-400',  shadow: 'hover:shadow-lg hover:shadow-orange-500/20', badge: 'bg-orange-500/20 text-orange-400' },
    { name: 'Leyenda II',    price: 16500, monthlyReturn: 5.5, level: 'Leyenda',   bg: 'bg-orange-500/5',   border: 'border-orange-500/30',  text: 'text-orange-400',  shadow: 'hover:shadow-lg hover:shadow-orange-500/20', badge: 'bg-orange-500/20 text-orange-400' },
    { name: 'Leyenda III',   price: 17000, monthlyReturn: 5.6, level: 'Leyenda',   bg: 'bg-orange-400/5',   border: 'border-orange-400/40',  text: 'text-orange-300',  shadow: 'hover:shadow-lg hover:shadow-orange-400/25', badge: 'bg-orange-400/20 text-orange-300' },
    { name: 'VIP I',         price: 17500, monthlyReturn: 5.7, level: 'VIP',       bg: 'bg-rose-500/5',     border: 'border-rose-500/30',    text: 'text-rose-400',    shadow: 'hover:shadow-lg hover:shadow-rose-500/20',   badge: 'bg-rose-500/20 text-rose-400'     },
    { name: 'VIP II',        price: 18000, monthlyReturn: 5.8, level: 'VIP',       bg: 'bg-rose-500/5',     border: 'border-rose-500/30',    text: 'text-rose-400',    shadow: 'hover:shadow-lg hover:shadow-rose-500/20',   badge: 'bg-rose-500/20 text-rose-400'     },
    { name: 'VIP III',       price: 18500, monthlyReturn: 5.9, level: 'VIP',       bg: 'bg-rose-400/5',     border: 'border-rose-400/40',    text: 'text-rose-300',    shadow: 'hover:shadow-lg hover:shadow-rose-400/25',   badge: 'bg-rose-400/20 text-rose-300'     },
    { name: 'Black I',       price: 19000, monthlyReturn: 5.9, level: 'Black',     bg: 'bg-white/[0.03]',   border: 'border-white/20',       text: 'text-white',       shadow: 'hover:shadow-lg hover:shadow-white/10',      badge: 'bg-white/10 text-white'           },
    { name: 'Black II',      price: 19500, monthlyReturn: 6.0, level: 'Black',     bg: 'bg-white/[0.03]',   border: 'border-white/25',       text: 'text-white',       shadow: 'hover:shadow-lg hover:shadow-white/15',      badge: 'bg-white/15 text-white'           },
    { name: 'Ápex',          price: 20000, monthlyReturn: 6.0, level: 'Black',     bg: 'bg-gradient-to-br from-yellow-500/10 to-white/5', border: 'border-yellow-400/50', text: 'text-yellow-300', shadow: 'hover:shadow-xl hover:shadow-yellow-400/30', badge: 'bg-yellow-400/20 text-yellow-300' },
  ];
}
