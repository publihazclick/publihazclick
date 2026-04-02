import { Component, ChangeDetectionStrategy, signal } from '@angular/core';

@Component({
  selector: 'app-trading-wallet',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-col items-center justify-center min-h-[60vh] py-10 px-4 w-full">

      <!-- Icon -->
      <div class="relative mb-6">
        <div class="w-24 h-24 rounded-2xl bg-gradient-to-tr from-emerald-500/20 to-cyan-500/20 border border-emerald-500/30 flex items-center justify-center">
          <span class="material-symbols-outlined text-emerald-400" style="font-size:48px">account_balance_wallet</span>
        </div>
        <div class="absolute -top-2 -right-2 w-8 h-8 rounded-full bg-gradient-to-r from-emerald-500 to-cyan-400 flex items-center justify-center shadow-lg shadow-emerald-500/40">
          <span class="material-symbols-outlined text-black" style="font-size:16px">trending_up</span>
        </div>
      </div>

      <!-- Title -->
      <h1 class="text-2xl sm:text-3xl font-black text-white mb-2 text-center">
        Billetera Trading Bot AI
      </h1>
      <div class="flex items-center gap-2 mb-8">
        <span class="px-2 py-0.5 text-[10px] font-black bg-gradient-to-r from-emerald-500 to-cyan-500 text-black rounded uppercase">IA</span>
        <span class="text-sm text-slate-500">Ganancias por referidos</span>
      </div>

      <!-- Info Card -->
      <div class="max-w-2xl w-full bg-gradient-to-b from-card-dark to-black border border-emerald-500/20 rounded-2xl p-6 sm:p-8 shadow-xl shadow-emerald-500/5">
        <div class="flex items-start gap-4 mb-6">
          <div class="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center flex-shrink-0">
            <span class="material-symbols-outlined text-emerald-400" style="font-size:22px">info</span>
          </div>
          <p class="text-slate-300 text-sm sm:text-base leading-relaxed">
            Aquí verás reflejadas tus ganancias, las cuales podrás retirar cada vez que alguno de tus invitados adquiera un paquete de servicio en nuestro
            <span class="text-emerald-400 font-semibold">Bot de Trading Automático</span>, el cual funciona con
            <span class="text-cyan-400 font-semibold">inteligencia artificial las 24 horas del día</span> y genera una rentabilidad que va desde el
            <span class="text-emerald-400 font-bold">2.5%</span> hasta el
            <span class="text-emerald-400 font-bold">30% mensual</span> sobre el valor del paquete de trading adquirido.
          </p>
        </div>

        <div class="border-t border-emerald-500/10 pt-6">
          <div class="flex items-start gap-4">
            <div class="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center flex-shrink-0">
              <span class="material-symbols-outlined text-cyan-400" style="font-size:22px">payments</span>
            </div>
            <p class="text-slate-300 text-sm sm:text-base leading-relaxed">
              Tú recibes <span class="text-cyan-400 font-bold">mes a mes el 1%</span> sobre el valor del paquete de trading que haya adquirido tu invitado, siempre y cuando tu invitado tenga dicho paquete de servicio activo.
            </p>
          </div>
        </div>

        <!-- Balance placeholder -->
        <div class="mt-8 p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/10 text-center">
          <p class="text-xs text-slate-500 uppercase tracking-wider mb-1">Balance disponible</p>
          <p class="text-3xl font-black text-emerald-400">$0.00</p>
          <p class="text-xs text-slate-600 mt-1">USD</p>
        </div>
      </div>

    </div>
  `
})
export class TradingWalletComponent {}
