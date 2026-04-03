import { Component, ChangeDetectionStrategy, signal, inject, PLATFORM_ID } from '@angular/core';
import { DecimalPipe, isPlatformBrowser } from '@angular/common';
import { TradingDemoComponent } from './trading-demo.component';
import { ProfileService } from '../../../../core/services/profile.service';

interface TradingPackage {
  name: string;
  price: number;
  monthlyReturn: number;
  border: string;
  text: string;
  bg: string;
  shadow: string;
  badge: string;
  level: string;
}

@Component({
  selector: 'app-trading-bot',
  standalone: true,
  imports: [DecimalPipe, TradingDemoComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-col items-center py-10 px-4 w-full">

      <!-- Barra superior: Billetera (izquierda) + Menú (derecha) -->
      <div class="w-full max-w-6xl flex items-center justify-between mb-4">
        <!-- Billetera de Retiro -->
        <button
          (click)="showWallet.set(true)"
          class="flex items-center gap-3 px-5 py-3 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-black text-sm shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/40 transition-all">
          <span class="material-symbols-outlined" style="font-size:22px">savings</span>
          <div class="text-left">
            <p class="text-[10px] text-white/70 font-bold uppercase tracking-wider leading-none">Billetera de Retiro</p>
            <p class="text-lg font-black leading-tight">$0.00 <span class="text-xs font-bold text-white/60">USD</span></p>
          </div>
        </button>

        <!-- Menú hamburguesa -->
        <div class="relative">
          <button
            (click)="menuOpen.set(!menuOpen())"
            class="w-12 h-12 flex items-center justify-center bg-white/5 border border-white/10 rounded-2xl hover:bg-white/10 transition-colors">
            <span class="material-symbols-outlined text-emerald-400 text-2xl">
              {{ menuOpen() ? 'close' : 'menu' }}
            </span>
          </button>

          @if (menuOpen()) {
            <div class="fixed inset-0 z-30" (click)="menuOpen.set(false)"></div>
            <div class="absolute top-full right-0 mt-2 w-64 bg-[#0d0d0d] border border-white/10 rounded-2xl shadow-xl z-40 overflow-hidden">
              <button
                (click)="menuOpen.set(false)"
                class="w-full flex items-center gap-3 px-4 py-3 text-sm text-emerald-400 font-bold bg-emerald-500/10">
                <span class="material-symbols-outlined text-lg">trending_up</span>
                Paquetes de Trading
              </button>
              <button
                (click)="showWallet.set(true); menuOpen.set(false)"
                class="w-full flex items-center gap-3 px-4 py-3 text-sm text-slate-300 hover:bg-white/5 border-t border-white/5 transition-colors">
                <span class="material-symbols-outlined text-lg text-emerald-400">savings</span>
                Billetera de Retiro
              </button>
              <button
                class="w-full flex items-center gap-3 px-4 py-3 text-sm text-slate-300 hover:bg-white/5 border-t border-white/5 transition-colors">
                <span class="material-symbols-outlined text-lg text-cyan-400">bar_chart_4_bars</span>
                Mis Operaciones
              </button>
              <button
                class="w-full flex items-center gap-3 px-4 py-3 text-sm text-slate-300 hover:bg-white/5 border-t border-white/5 transition-colors">
                <span class="material-symbols-outlined text-lg text-amber-400">history</span>
                Historial
              </button>
              <button
                (click)="showReferral.set(true); menuOpen.set(false)"
                class="w-full flex items-center gap-3 px-4 py-3 text-sm text-slate-300 hover:bg-white/5 border-t border-white/5 transition-colors">
                <span class="material-symbols-outlined text-lg text-accent">card_giftcard</span>
                Recomienda y Gana
              </button>
              <button
                class="w-full flex items-center gap-3 px-4 py-3 text-sm text-slate-300 hover:bg-white/5 border-t border-white/5 transition-colors">
                <span class="material-symbols-outlined text-lg text-violet-400">support_agent</span>
                Soporte
              </button>
            </div>
          }
        </div>
      </div>

      <!-- Header -->
      <div class="relative mb-4">
        <div class="w-20 h-20 rounded-2xl bg-gradient-to-tr from-emerald-500/20 to-cyan-500/20 border border-emerald-500/30 flex items-center justify-center">
          <span class="material-symbols-outlined text-emerald-400" style="font-size:40px">trending_up</span>
        </div>
        <div class="absolute -top-2 -right-2 w-7 h-7 rounded-full bg-gradient-to-r from-primary to-cyan-400 flex items-center justify-center shadow-lg shadow-primary/40">
          <span class="material-symbols-outlined text-black" style="font-size:14px">smart_toy</span>
        </div>
      </div>

      <h2 class="text-3xl font-black text-white mb-2 text-center">Trading Bot <span class="text-primary">AI</span></h2>
      <p class="text-emerald-400 text-sm font-black text-center mb-2">Hola, {{ profileService.profile()?.full_name || profileService.profile()?.username || 'Usuario' }}</p>
      <p class="text-slate-300 text-sm text-center max-w-xl mb-3 leading-relaxed">
        Compra un paquete de servicio para trading automático monitoreado las 24/7 y genera ganancias
        estimadas mensualmente que van entre un <span class="text-emerald-400 font-black">2.5%</span> y un
        <span class="text-emerald-400 font-black">30% mensual</span>.
      </p>

      <div class="max-w-xl mb-6 px-4 py-3 rounded-xl border border-amber-500/30 bg-amber-500/5 text-center">
        <p class="text-amber-400 font-black text-xs uppercase tracking-wider mb-1 flex items-center justify-center gap-1">
          <span class="material-symbols-outlined" style="font-size:14px">verified_user</span>
          Transparencia ante todo
        </p>
        <p class="text-slate-300 text-xs leading-relaxed">
          Sabemos que algunos sistemas venden humo y te ofrecen más del 100%… pero luego pierdes tu dinero.
          <span class="text-white font-bold">Creemos firmemente en ofrecer resultados sostenibles en el tiempo. Nuestro enfoque prioriza la estabilidad y el crecimiento constante por encima de promesas poco realistas. No es casualidad: llevamos más de 9 años operando como empresa, construyendo resultados sólidos y relaciones de confianza a largo plazo.</span>
        </p>
      </div>

      <!-- Feature pills -->
      <div class="flex flex-wrap justify-center gap-2 mb-8">
        <span class="px-3 py-1 text-xs font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-full flex items-center gap-1">
          <span class="material-symbols-outlined" style="font-size:14px">auto_graph</span> Análisis 24/7
        </span>
        <span class="px-3 py-1 text-xs font-bold bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 rounded-full flex items-center gap-1">
          <span class="material-symbols-outlined" style="font-size:14px">bolt</span> Ejecución Automática
        </span>
        <span class="px-3 py-1 text-xs font-bold bg-violet-500/10 text-violet-400 border border-violet-500/20 rounded-full flex items-center gap-1">
          <span class="material-symbols-outlined" style="font-size:14px">shield_with_heart</span> Gestión de Riesgo
        </span>
      </div>

      <!-- Packages grid -->
      <div class="w-full max-w-6xl">
        <h3 class="text-white font-black text-lg mb-5 text-center uppercase tracking-widest">
          Paquetes de Trading Automático —
          <span class="text-primary">El Sistema que Todos los Meses te Permite Retirar tu Rentabilidad</span>
        </h3>

        <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
          @for (pkg of packages; track pkg.price) {
            <div class="relative rounded-xl p-3 border transition-all duration-300 hover:scale-105 hover:-translate-y-1 flex flex-col gap-2
              {{ pkg.bg }} {{ pkg.border }} {{ pkg.shadow }}">

              <!-- Level badge -->
              <div class="flex items-center justify-between">
                <span class="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full {{ pkg.badge }}">
                  {{ pkg.level }}
                </span>
              </div>

              <!-- Name -->
              <p class="text-white font-black text-sm leading-tight">{{ pkg.name }}</p>

              <!-- Price + USD -->
              <div class="flex items-baseline gap-1">
                <p class="font-black text-lg {{ pkg.text }}">
                  \${{ pkg.price | number:'1.0-0' }}
                </p>
                <span class="text-[10px] font-black text-slate-500 uppercase tracking-wider">USD</span>
              </div>

              <!-- Monthly return -->
              <div class="flex items-center gap-1 bg-black/20 rounded-lg px-2 py-1">
                <span class="material-symbols-outlined text-emerald-400" style="font-size:13px">trending_up</span>
                <span class="text-emerald-400 font-black text-xs">2.5% - 30%</span>
                <span class="text-slate-500 text-[10px]">/ mes</span>
              </div>

              <!-- Demo button -->
              <button
                (click)="demoPackage = pkg; showDemo = true; $event.stopPropagation()"
                class="w-full py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider border transition-all flex items-center justify-center gap-1 opacity-70 hover:opacity-100
                  border-primary/30 text-primary bg-primary/5 hover:bg-primary/10">
                <span class="material-symbols-outlined" style="font-size:12px">play_circle</span>
                Ver Demo
              </button>

              <!-- CTA Button -->
              <button
                (click)="openPaymentModal(pkg)"
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

    <!-- DEMO MODAL -->
    @if (showDemo && demoPackage) {
      <app-trading-demo
        [packageName]="demoPackage.name"
        [packagePrice]="demoPackage.price"
        [monthlyReturn]="demoPackage.monthlyReturn"
        (closed)="showDemo = false; demoPackage = null" />
    }

    <!-- ═══════════════════════════════════════════════════════
         MODAL BILLETERA
    ═══════════════════════════════════════════════════════ -->
    @if (showWallet()) {
      <div
        class="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4"
        (click)="showWallet.set(false)">

        <div class="absolute inset-0 bg-black/80 backdrop-blur-sm"></div>

        <div
          class="relative z-10 w-full max-w-lg rounded-t-2xl sm:rounded-2xl overflow-hidden shadow-2xl shadow-black/60 mx-auto max-h-[92vh] overflow-y-auto"
          (click)="$event.stopPropagation()">

          <!-- Header -->
          <div class="bg-gradient-to-br from-[#0a0a0a] via-[#111827] to-[#0a0a0a] border border-emerald-500/20 px-5 sm:px-6 pt-5 pb-4">
            <button
              (click)="showWallet.set(false)"
              class="absolute top-3 right-3 w-8 h-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 transition-all z-10">
              <span class="material-symbols-outlined" style="font-size:16px">close</span>
            </button>

            <div class="flex items-center gap-3 mb-2 pr-8">
              <div class="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-500/20 to-cyan-500/20 border border-emerald-500/30 flex items-center justify-center shrink-0">
                <span class="material-symbols-outlined text-emerald-400" style="font-size:22px">account_balance_wallet</span>
              </div>
              <div>
                <p class="text-[10px] text-slate-500 uppercase tracking-widest font-bold">Trading Bot AI</p>
                <h3 class="text-white font-black text-lg leading-tight">Billetera de Retiro</h3>
              </div>
            </div>
          </div>

          <!-- Body -->
          <div class="bg-[#0d0d0d] border-x border-emerald-500/10 px-5 sm:px-6 py-5 space-y-5">

            <div class="flex items-start gap-3">
              <div class="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                <span class="material-symbols-outlined text-emerald-400" style="font-size:18px">info</span>
              </div>
              <p class="text-slate-300 text-sm leading-relaxed">
                Aquí verás reflejadas tus ganancias, las cuales podrás retirar cada vez que alguno de tus invitados adquiera un paquete de servicio en nuestro
                <span class="text-emerald-400 font-semibold">Bot de Trading Automático</span>, el cual funciona con
                <span class="text-cyan-400 font-semibold">inteligencia artificial las 24 horas del día</span> y genera una rentabilidad que va desde el
                <span class="text-emerald-400 font-bold">2.5%</span> hasta el
                <span class="text-emerald-400 font-bold">30% mensual</span> sobre el valor del paquete de trading adquirido.
              </p>
            </div>

            <div class="border-t border-emerald-500/10 pt-4">
              <div class="flex items-start gap-3">
                <div class="w-9 h-9 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span class="material-symbols-outlined text-cyan-400" style="font-size:18px">payments</span>
                </div>
                <p class="text-slate-300 text-sm leading-relaxed">
                  Tú recibes <span class="text-cyan-400 font-bold">mes a mes el 1%</span> sobre el valor del paquete de trading que haya adquirido tu invitado, siempre y cuando tu invitado tenga dicho paquete de servicio activo.
                </p>
              </div>
            </div>

            <!-- Balance -->
            <div class="p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/10 text-center">
              <p class="text-xs text-slate-500 uppercase tracking-wider mb-1">Balance disponible</p>
              <p class="text-3xl font-black text-emerald-400">$0.00</p>
              <p class="text-xs text-slate-600 mt-1">USD</p>
            </div>
          </div>

          <!-- Footer -->
          <div class="bg-[#0d0d0d] border border-emerald-500/10 rounded-b-2xl px-5 sm:px-6 pb-5 pt-2">
            <button
              (click)="showWallet.set(false)"
              class="w-full py-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-black text-sm hover:bg-emerald-500/20 transition-all">
              Cerrar
            </button>
          </div>
        </div>
      </div>
    }

    <!-- ═══════════════════════════════════════════════════════
         MODAL DE PAGO
    ═══════════════════════════════════════════════════════ -->
    @if (selectedPackage()) {
      <div
        class="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4"
        (click)="closeModal()">

        <!-- Backdrop -->
        <div class="absolute inset-0 bg-black/80 backdrop-blur-sm"></div>

        <!-- Modal card -->
        <div
          class="relative z-10 w-full max-w-md rounded-t-2xl sm:rounded-2xl overflow-hidden shadow-2xl shadow-black/60 mx-auto max-h-[92vh] overflow-y-auto"
          (click)="$event.stopPropagation()">

          <!-- Header degradado -->
          <div class="bg-gradient-to-br from-[#0a0a0a] via-[#111827] to-[#0a0a0a] border border-white/10 px-4 sm:px-6 pt-5 sm:pt-6 pb-4">

            <!-- Cerrar -->
            <button
              (click)="closeModal()"
              class="absolute top-3 right-3 sm:top-4 sm:right-4 w-8 h-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 transition-all z-10">
              <span class="material-symbols-outlined" style="font-size:16px">close</span>
            </button>

            <!-- Título con ícono -->
            <div class="flex items-center gap-3 mb-4 pr-8">
              <div class="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-tr from-emerald-500/20 to-cyan-500/20 border border-emerald-500/30 flex items-center justify-center shrink-0">
                <span class="material-symbols-outlined text-emerald-400" style="font-size:18px">trending_up</span>
              </div>
              <div>
                <p class="text-[10px] sm:text-[11px] text-slate-500 uppercase tracking-widest font-bold">Trading Bot AI</p>
                <h3 class="text-white font-black text-base sm:text-lg leading-tight">
                  Paquete {{ selectedPackage()!.name }}
                </h3>
              </div>
            </div>

            <!-- Info del paquete seleccionado -->
            <div class="flex items-center gap-2 sm:gap-3 bg-white/5 border border-white/10 rounded-xl px-3 sm:px-4 py-3 mb-2">
              <div class="flex-1 min-w-0">
                <p class="text-slate-400 text-xs">Inversión</p>
                <p class="text-white font-black text-lg sm:text-xl truncate">
                  \${{ selectedPackage()!.price | number:'1.0-0' }}
                  <span class="text-xs font-bold text-slate-500">USD</span>
                </p>
              </div>
              <div class="w-px h-8 bg-white/10 shrink-0"></div>
              <div class="flex-1 text-right min-w-0">
                <p class="text-slate-400 text-xs">Rentabilidad</p>
                <p class="text-emerald-400 font-black text-lg sm:text-xl">2.5% - 30%
                  <span class="text-xs font-bold text-slate-500">/ mes</span>
                </p>
              </div>
            </div>
          </div>

          <!-- Cuerpo del modal -->
          <div class="bg-[#0d0d0d] border-x border-white/10 px-4 sm:px-6 py-4 sm:py-5 space-y-3 sm:space-y-4">

            <!-- Instrucción principal -->
            <p class="text-slate-300 text-xs sm:text-sm text-center leading-relaxed">
              Realiza tu pago a través de cualquiera de los siguientes métodos:
            </p>

            <!-- Método: Nequi -->
            <div class="rounded-xl border border-[#8B5CF6]/40 bg-[#8B5CF6]/5 px-3 sm:px-4 py-3 sm:py-4">
              <div class="flex items-center gap-2 sm:gap-3 mb-2 sm:mb-3">
                <div class="w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-[#8B5CF6]/20 border border-[#8B5CF6]/40 flex items-center justify-center shrink-0">
                  <span class="material-symbols-outlined text-[#8B5CF6]" style="font-size:16px">smartphone</span>
                </div>
                <span class="text-white font-black text-sm sm:text-base tracking-wide">Nequi</span>
              </div>
              <div class="space-y-1.5 pl-1">
                <div class="flex items-center gap-2">
                  <span class="material-symbols-outlined text-[#8B5CF6]" style="font-size:14px">call</span>
                  <span class="text-white font-black text-base sm:text-lg tracking-widest">313 445 3649</span>
                </div>
                <div class="flex items-center gap-2">
                  <span class="material-symbols-outlined text-slate-500" style="font-size:14px">person</span>
                  <span class="text-slate-300 font-bold text-xs sm:text-sm">VICTOR VERA</span>
                </div>
              </div>
            </div>

            <!-- Método: Daviplata -->
            <div class="rounded-xl border border-[#E63946]/40 bg-[#E63946]/5 px-3 sm:px-4 py-3 sm:py-4">
              <div class="flex items-center gap-2 sm:gap-3 mb-2 sm:mb-3">
                <div class="w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-[#E63946]/20 border border-[#E63946]/40 flex items-center justify-center shrink-0">
                  <span class="material-symbols-outlined text-[#E63946]" style="font-size:16px">account_balance_wallet</span>
                </div>
                <span class="text-white font-black text-sm sm:text-base tracking-wide">Daviplata</span>
              </div>
              <div class="space-y-1.5 pl-1">
                <div class="flex items-center gap-2">
                  <span class="material-symbols-outlined text-[#E63946]" style="font-size:14px">call</span>
                  <span class="text-white font-black text-base sm:text-lg tracking-widest">313 445 3649</span>
                </div>
                <div class="flex items-center gap-2">
                  <span class="material-symbols-outlined text-slate-500" style="font-size:14px">person</span>
                  <span class="text-slate-300 font-bold text-xs sm:text-sm">VICTOR VERA</span>
                </div>
              </div>
            </div>

          </div>

          <!-- Footer: WhatsApp -->
          <div class="bg-[#0d0d0d] border border-white/10 rounded-b-2xl px-4 sm:px-6 pb-5 sm:pb-6 pt-2">
            <div class="rounded-xl border border-[#25D366]/40 bg-[#25D366]/5 px-3 sm:px-4 py-3 sm:py-4">
              <div class="flex items-start gap-2 sm:gap-3">
                <div class="w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-[#25D366]/20 border border-[#25D366]/40 flex items-center justify-center shrink-0 mt-0.5">
                  <span class="material-symbols-outlined text-[#25D366]" style="font-size:16px">chat</span>
                </div>
                <div class="flex-1 min-w-0">
                  <p class="text-white font-black text-xs sm:text-sm mb-1">Envía tu comprobante de pago</p>
                  <p class="text-slate-400 text-xs leading-relaxed mb-3">
                    Una vez realizada la compra de alguno de nuestros servicios de <span class="text-white font-bold">Trading Bot AI</span>,
                    envía tu comprobante de pago vía WhatsApp al número:
                  </p>
                  <a
                    href="https://wa.me/573181800264"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="flex items-center justify-center gap-2 w-full py-3 rounded-lg bg-[#25D366] hover:bg-[#20bd5a] transition-all text-black font-black shadow-lg shadow-[#25D366]/20">
                    <span class="material-symbols-outlined shrink-0" style="font-size:20px">whatsapp</span>
                    <span class="text-base sm:text-lg tracking-widest">318 180 0264</span>
                  </a>
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>
    }

    <!-- Modal Recomienda y Gana -->
    @if (showReferral()) {
      <div class="fixed inset-0 z-[60] flex items-center justify-center p-4" (click)="showReferral.set(false)">
        <div class="absolute inset-0 bg-black/70 backdrop-blur-sm"></div>
        <div class="relative bg-[#0d0d0d] border border-white/10 rounded-2xl w-full max-w-md shadow-2xl p-6" (click)="$event.stopPropagation()">
          <button (click)="showReferral.set(false)" class="absolute top-3 right-3 w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-slate-400 hover:text-white">
            <span class="material-symbols-outlined" style="font-size:16px">close</span>
          </button>
          <div class="text-center mb-5">
            <div class="w-14 h-14 rounded-full bg-accent/20 flex items-center justify-center mx-auto mb-3">
              <span class="material-symbols-outlined text-accent" style="font-size:28px">card_giftcard</span>
            </div>
            <h3 class="text-white font-black text-lg">Recomienda y Gana</h3>
            <p class="text-slate-400 text-sm mt-1">Comparte tu link y gana comisiones por cada referido</p>
          </div>
          <div class="bg-white/5 border border-white/10 rounded-xl p-3 flex items-center gap-2">
            <input type="text" [value]="referralLink" readonly class="flex-1 bg-transparent text-white text-xs font-mono truncate outline-none" />
            <button (click)="copyReferralLink()"
              class="shrink-0 px-3 py-2 rounded-lg text-xs font-bold transition-all"
              [class]="referralCopied() ? 'bg-emerald-500 text-white' : 'bg-accent text-white hover:bg-accent/80'">
              {{ referralCopied() ? 'Copiado!' : 'Copiar' }}
            </button>
          </div>
        </div>
      </div>
    }
  `,
})
export class TradingBotComponent {
  readonly profileService = inject(ProfileService);
  private readonly platformId = inject(PLATFORM_ID);

  showDemo = false;
  demoPackage: TradingPackage | null = null;
  readonly selectedPackage = signal<TradingPackage | null>(null);
  readonly showWallet = signal(false);
  readonly menuOpen = signal(false);
  readonly showReferral = signal(false);
  readonly referralCopied = signal(false);

  get referralLink(): string {
    const code = this.profileService.profile()?.referral_code ?? '';
    const origin = isPlatformBrowser(this.platformId) ? window.location.origin : 'https://www.publihazclick.com';
    return code ? `${origin}/ref/${code}` : '';
  }

  copyReferralLink(): void {
    if (this.referralLink && isPlatformBrowser(this.platformId)) {
      navigator.clipboard.writeText(this.referralLink);
      this.referralCopied.set(true);
      setTimeout(() => this.referralCopied.set(false), 2000);
    }
  }

  openPaymentModal(pkg: TradingPackage): void {
    this.selectedPackage.set(pkg);
  }

  closeModal(): void {
    this.selectedPackage.set(null);
  }

  packages: TradingPackage[] = [
    { name: 'Semilla',      price: 100,   monthlyReturn: 2.0, level: 'Entrada',   bg: 'bg-emerald-500/5',  border: 'border-emerald-500/30', text: 'text-emerald-400', shadow: 'hover:shadow-lg hover:shadow-emerald-500/10', badge: 'bg-emerald-500/20 text-emerald-400' },
    { name: 'Brote',        price: 200,   monthlyReturn: 2.1, level: 'Entrada',   bg: 'bg-emerald-500/5',  border: 'border-emerald-500/30', text: 'text-emerald-400', shadow: 'hover:shadow-lg hover:shadow-emerald-500/10', badge: 'bg-emerald-500/20 text-emerald-400' },
    { name: 'Iniciador',    price: 500,   monthlyReturn: 2.2, level: 'Entrada',   bg: 'bg-emerald-500/5',  border: 'border-emerald-400/40', text: 'text-emerald-300', shadow: 'hover:shadow-lg hover:shadow-emerald-400/15', badge: 'bg-emerald-400/20 text-emerald-300' },
    { name: 'Bronce I',     price: 1000,  monthlyReturn: 2.3, level: 'Bronce',    bg: 'bg-amber-700/10',   border: 'border-amber-700/40',   text: 'text-amber-600',   shadow: 'hover:shadow-lg hover:shadow-amber-700/15',  badge: 'bg-amber-700/20 text-amber-600'   },
    { name: 'Bronce II',    price: 1500,  monthlyReturn: 2.4, level: 'Bronce',    bg: 'bg-amber-700/10',   border: 'border-amber-700/40',   text: 'text-amber-600',   shadow: 'hover:shadow-lg hover:shadow-amber-700/15',  badge: 'bg-amber-700/20 text-amber-600'   },
    { name: 'Bronce III',   price: 2000,  monthlyReturn: 2.5, level: 'Bronce',    bg: 'bg-amber-700/10',   border: 'border-amber-600/50',   text: 'text-amber-500',   shadow: 'hover:shadow-lg hover:shadow-amber-600/20',  badge: 'bg-amber-600/20 text-amber-500'   },
    { name: 'Plata I',      price: 2500,  monthlyReturn: 2.6, level: 'Plata',     bg: 'bg-slate-400/5',    border: 'border-slate-400/30',   text: 'text-slate-300',   shadow: 'hover:shadow-lg hover:shadow-slate-400/10',  badge: 'bg-slate-400/20 text-slate-300'   },
    { name: 'Plata II',     price: 3000,  monthlyReturn: 2.7, level: 'Plata',     bg: 'bg-slate-400/5',    border: 'border-slate-400/30',   text: 'text-slate-300',   shadow: 'hover:shadow-lg hover:shadow-slate-400/10',  badge: 'bg-slate-400/20 text-slate-300'   },
    { name: 'Plata III',    price: 3500,  monthlyReturn: 2.8, level: 'Plata',     bg: 'bg-slate-300/5',    border: 'border-slate-300/40',   text: 'text-slate-200',   shadow: 'hover:shadow-lg hover:shadow-slate-300/15',  badge: 'bg-slate-300/20 text-slate-200'   },
    { name: 'Oro I',        price: 4000,  monthlyReturn: 3.0, level: 'Oro',       bg: 'bg-yellow-500/5',   border: 'border-yellow-500/30',  text: 'text-yellow-400',  shadow: 'hover:shadow-lg hover:shadow-yellow-500/15', badge: 'bg-yellow-500/20 text-yellow-400' },
    { name: 'Oro II',       price: 4500,  monthlyReturn: 3.1, level: 'Oro',       bg: 'bg-yellow-500/5',   border: 'border-yellow-500/30',  text: 'text-yellow-400',  shadow: 'hover:shadow-lg hover:shadow-yellow-500/15', badge: 'bg-yellow-500/20 text-yellow-400' },
    { name: 'Oro III',      price: 5000,  monthlyReturn: 3.2, level: 'Oro',       bg: 'bg-yellow-400/5',   border: 'border-yellow-400/40',  text: 'text-yellow-300',  shadow: 'hover:shadow-lg hover:shadow-yellow-400/20', badge: 'bg-yellow-400/20 text-yellow-300' },
    { name: 'Zafiro I',     price: 5500,  monthlyReturn: 3.3, level: 'Zafiro',    bg: 'bg-blue-500/5',     border: 'border-blue-500/30',    text: 'text-blue-400',    shadow: 'hover:shadow-lg hover:shadow-blue-500/15',   badge: 'bg-blue-500/20 text-blue-400'     },
    { name: 'Zafiro II',    price: 6000,  monthlyReturn: 3.4, level: 'Zafiro',    bg: 'bg-blue-500/5',     border: 'border-blue-500/30',    text: 'text-blue-400',    shadow: 'hover:shadow-lg hover:shadow-blue-500/15',   badge: 'bg-blue-500/20 text-blue-400'     },
    { name: 'Zafiro III',   price: 6500,  monthlyReturn: 3.5, level: 'Zafiro',    bg: 'bg-blue-400/5',     border: 'border-blue-400/40',    text: 'text-blue-300',    shadow: 'hover:shadow-lg hover:shadow-blue-400/20',   badge: 'bg-blue-400/20 text-blue-300'     },
    { name: 'Esmeralda I',  price: 7000,  monthlyReturn: 3.6, level: 'Esmeralda', bg: 'bg-teal-500/5',     border: 'border-teal-500/30',    text: 'text-teal-400',    shadow: 'hover:shadow-lg hover:shadow-teal-500/15',   badge: 'bg-teal-500/20 text-teal-400'     },
    { name: 'Esmeralda II', price: 7500,  monthlyReturn: 3.7, level: 'Esmeralda', bg: 'bg-teal-500/5',     border: 'border-teal-500/30',    text: 'text-teal-400',    shadow: 'hover:shadow-lg hover:shadow-teal-500/15',   badge: 'bg-teal-500/20 text-teal-400'     },
    { name: 'Esmeralda III',price: 8000,  monthlyReturn: 3.8, level: 'Esmeralda', bg: 'bg-teal-400/5',     border: 'border-teal-400/40',    text: 'text-teal-300',    shadow: 'hover:shadow-lg hover:shadow-teal-400/20',   badge: 'bg-teal-400/20 text-teal-300'     },
    { name: 'Rubí I',       price: 8500,  monthlyReturn: 3.9, level: 'Rubí',      bg: 'bg-red-500/5',      border: 'border-red-500/30',     text: 'text-red-400',     shadow: 'hover:shadow-lg hover:shadow-red-500/15',    badge: 'bg-red-500/20 text-red-400'       },
    { name: 'Rubí II',      price: 9000,  monthlyReturn: 4.0, level: 'Rubí',      bg: 'bg-red-500/5',      border: 'border-red-500/30',     text: 'text-red-400',     shadow: 'hover:shadow-lg hover:shadow-red-500/15',    badge: 'bg-red-500/20 text-red-400'       },
    { name: 'Rubí III',     price: 9500,  monthlyReturn: 4.1, level: 'Rubí',      bg: 'bg-red-400/5',      border: 'border-red-400/40',     text: 'text-red-300',     shadow: 'hover:shadow-lg hover:shadow-red-400/20',    badge: 'bg-red-400/20 text-red-300'       },
    { name: 'Diamante I',   price: 10000, monthlyReturn: 4.2, level: 'Diamante',  bg: 'bg-cyan-500/5',     border: 'border-cyan-500/30',    text: 'text-cyan-400',    shadow: 'hover:shadow-lg hover:shadow-cyan-500/20',   badge: 'bg-cyan-500/20 text-cyan-400'     },
    { name: 'Diamante II',  price: 10500, monthlyReturn: 4.3, level: 'Diamante',  bg: 'bg-cyan-500/5',     border: 'border-cyan-500/30',    text: 'text-cyan-400',    shadow: 'hover:shadow-lg hover:shadow-cyan-500/20',   badge: 'bg-cyan-500/20 text-cyan-400'     },
    { name: 'Diamante III', price: 11000, monthlyReturn: 4.4, level: 'Diamante',  bg: 'bg-cyan-400/5',     border: 'border-cyan-400/40',    text: 'text-cyan-300',    shadow: 'hover:shadow-lg hover:shadow-cyan-400/25',   badge: 'bg-cyan-400/20 text-cyan-300'     },
    { name: 'Platino I',    price: 11500, monthlyReturn: 4.5, level: 'Platino',   bg: 'bg-violet-500/5',   border: 'border-violet-500/30',  text: 'text-violet-400',  shadow: 'hover:shadow-lg hover:shadow-violet-500/20', badge: 'bg-violet-500/20 text-violet-400' },
    { name: 'Platino II',   price: 12000, monthlyReturn: 4.6, level: 'Platino',   bg: 'bg-violet-500/5',   border: 'border-violet-500/30',  text: 'text-violet-400',  shadow: 'hover:shadow-lg hover:shadow-violet-500/20', badge: 'bg-violet-500/20 text-violet-400' },
    { name: 'Platino III',  price: 12500, monthlyReturn: 4.7, level: 'Platino',   bg: 'bg-violet-400/5',   border: 'border-violet-400/40',  text: 'text-violet-300',  shadow: 'hover:shadow-lg hover:shadow-violet-400/25', badge: 'bg-violet-400/20 text-violet-300' },
    { name: 'Élite I',      price: 13000, monthlyReturn: 4.8, level: 'Élite',     bg: 'bg-fuchsia-500/5',  border: 'border-fuchsia-500/30', text: 'text-fuchsia-400', shadow: 'hover:shadow-lg hover:shadow-fuchsia-500/20',badge: 'bg-fuchsia-500/20 text-fuchsia-400'},
    { name: 'Élite II',     price: 13500, monthlyReturn: 4.9, level: 'Élite',     bg: 'bg-fuchsia-500/5',  border: 'border-fuchsia-500/30', text: 'text-fuchsia-400', shadow: 'hover:shadow-lg hover:shadow-fuchsia-500/20',badge: 'bg-fuchsia-500/20 text-fuchsia-400'},
    { name: 'Élite III',    price: 14000, monthlyReturn: 5.0, level: 'Élite',     bg: 'bg-fuchsia-400/5',  border: 'border-fuchsia-400/40', text: 'text-fuchsia-300', shadow: 'hover:shadow-lg hover:shadow-fuchsia-400/25',badge: 'bg-fuchsia-400/20 text-fuchsia-300'},
    { name: 'Máster I',     price: 14500, monthlyReturn: 5.1, level: 'Máster',    bg: 'bg-indigo-500/5',   border: 'border-indigo-500/30',  text: 'text-indigo-400',  shadow: 'hover:shadow-lg hover:shadow-indigo-500/20', badge: 'bg-indigo-500/20 text-indigo-400' },
    { name: 'Máster II',    price: 15000, monthlyReturn: 5.2, level: 'Máster',    bg: 'bg-indigo-500/5',   border: 'border-indigo-500/30',  text: 'text-indigo-400',  shadow: 'hover:shadow-lg hover:shadow-indigo-500/20', badge: 'bg-indigo-500/20 text-indigo-400' },
    { name: 'Máster III',   price: 15500, monthlyReturn: 5.3, level: 'Máster',    bg: 'bg-indigo-400/5',   border: 'border-indigo-400/40',  text: 'text-indigo-300',  shadow: 'hover:shadow-lg hover:shadow-indigo-400/25', badge: 'bg-indigo-400/20 text-indigo-300' },
    { name: 'Leyenda I',    price: 16000, monthlyReturn: 5.4, level: 'Leyenda',   bg: 'bg-orange-500/5',   border: 'border-orange-500/30',  text: 'text-orange-400',  shadow: 'hover:shadow-lg hover:shadow-orange-500/20', badge: 'bg-orange-500/20 text-orange-400' },
    { name: 'Leyenda II',   price: 16500, monthlyReturn: 5.5, level: 'Leyenda',   bg: 'bg-orange-500/5',   border: 'border-orange-500/30',  text: 'text-orange-400',  shadow: 'hover:shadow-lg hover:shadow-orange-500/20', badge: 'bg-orange-500/20 text-orange-400' },
    { name: 'Leyenda III',  price: 17000, monthlyReturn: 5.6, level: 'Leyenda',   bg: 'bg-orange-400/5',   border: 'border-orange-400/40',  text: 'text-orange-300',  shadow: 'hover:shadow-lg hover:shadow-orange-400/25', badge: 'bg-orange-400/20 text-orange-300' },
    { name: 'VIP I',        price: 17500, monthlyReturn: 5.7, level: 'VIP',       bg: 'bg-rose-500/5',     border: 'border-rose-500/30',    text: 'text-rose-400',    shadow: 'hover:shadow-lg hover:shadow-rose-500/20',   badge: 'bg-rose-500/20 text-rose-400'     },
    { name: 'VIP II',       price: 18000, monthlyReturn: 5.8, level: 'VIP',       bg: 'bg-rose-500/5',     border: 'border-rose-500/30',    text: 'text-rose-400',    shadow: 'hover:shadow-lg hover:shadow-rose-500/20',   badge: 'bg-rose-500/20 text-rose-400'     },
    { name: 'VIP III',      price: 18500, monthlyReturn: 5.9, level: 'VIP',       bg: 'bg-rose-400/5',     border: 'border-rose-400/40',    text: 'text-rose-300',    shadow: 'hover:shadow-lg hover:shadow-rose-400/25',   badge: 'bg-rose-400/20 text-rose-300'     },
    { name: 'Black I',      price: 19000, monthlyReturn: 5.9, level: 'Black',     bg: 'bg-white/[0.03]',   border: 'border-white/20',       text: 'text-white',       shadow: 'hover:shadow-lg hover:shadow-white/10',      badge: 'bg-white/10 text-white'           },
    { name: 'Black II',     price: 19500, monthlyReturn: 6.0, level: 'Black',     bg: 'bg-white/[0.03]',   border: 'border-white/25',       text: 'text-white',       shadow: 'hover:shadow-lg hover:shadow-white/15',      badge: 'bg-white/15 text-white'           },
    { name: 'Ápex',         price: 20000, monthlyReturn: 6.0, level: 'Black',     bg: 'bg-gradient-to-br from-yellow-500/10 to-white/5', border: 'border-yellow-400/50', text: 'text-yellow-300', shadow: 'hover:shadow-xl hover:shadow-yellow-400/30', badge: 'bg-yellow-400/20 text-yellow-300' },
  ];
}
