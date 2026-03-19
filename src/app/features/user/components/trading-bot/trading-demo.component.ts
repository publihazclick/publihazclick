import {
  Component, ChangeDetectionStrategy, EventEmitter, Output, Input,
  OnInit, OnDestroy, ChangeDetectorRef, inject,
} from '@angular/core';
import { DecimalPipe, NgClass } from '@angular/common';

interface Crypto {
  symbol: string; name: string; basePrice: number;
  price: number; change: number; icon: string;
  vol24h: number;
}
interface Candle {
  open: number; high: number; low: number; close: number;
  bull: boolean; volume: number;
}
interface Trade {
  id: number; symbol: string; side: 'BUY' | 'SELL';
  price: number; pnl: number; time: string;
}
interface OrderRow { price: number; qty: number; total: number; pct: number; }

@Component({
  selector: 'app-trading-demo',
  standalone: true,
  imports: [DecimalPipe, NgClass],
  changeDetection: ChangeDetectionStrategy.Default,
  styles: [`
    :host { display:contents; }
    .vol-bar { transition: height 0.4s ease; }
    .price-flash-up   { animation: flashUp   0.5s ease; }
    .price-flash-down { animation: flashDown 0.5s ease; }
    @keyframes flashUp   { 0%{color:#0ecb81} 100%{color:inherit} }
    @keyframes flashDown { 0%{color:#f6465d} 100%{color:inherit} }
    .scrollbar-hide::-webkit-scrollbar { display:none; }
    .scrollbar-hide { -ms-overflow-style:none; scrollbar-width:none; }
    .ticker-row { transition: background 0.3s; }
    .ticker-row:hover { background: rgba(255,255,255,0.04); }
  `],
  template: `
<div class="fixed inset-0 z-[60] flex items-center justify-center p-1 sm:p-3"
     (click)="closed.emit()">
  <div class="absolute inset-0 bg-black/92 backdrop-blur-lg"></div>

  <!-- Terminal window -->
  <div class="relative z-10 w-full max-w-[1200px] flex flex-col rounded-xl overflow-hidden border border-white/8 shadow-[0_32px_80px_rgba(0,0,0,0.8)]"
       style="background:#0b0d14; height:94vh; max-height:94vh;"
       (click)="$event.stopPropagation()">

    <!-- ═══ TOP BAR ═══════════════════════════════════════════════════════ -->
    <div class="flex items-center justify-between px-3 sm:px-4 py-2 shrink-0 border-b border-white/6"
         style="background:#0f1117;">
      <div class="flex items-center gap-2 sm:gap-3 min-w-0">
        <!-- Logo area -->
        <div class="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <div class="w-6 h-6 rounded bg-gradient-to-br from-primary to-cyan-500 flex items-center justify-center shadow-lg shadow-primary/30">
            <span class="material-symbols-outlined text-black" style="font-size:13px;font-weight:900">smart_toy</span>
          </div>
          <span class="text-white font-black text-xs sm:text-sm tracking-tight">Trading<span class="text-primary">Bot</span> AI</span>
        </div>
        <div class="w-px h-4 bg-white/10 shrink-0"></div>
        <!-- Bot status -->
        <div class="flex items-center gap-1 sm:gap-1.5 px-1.5 sm:px-2.5 py-1 rounded-full border border-emerald-500/30 bg-emerald-500/8">
          <div class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0"></div>
          <span class="text-emerald-400 font-black text-[9px] sm:text-[10px] uppercase tracking-widest">Activo</span>
        </div>
        <span class="px-1.5 sm:px-2 py-0.5 rounded text-[9px] sm:text-[10px] font-black border border-primary/40 bg-primary/8 text-primary uppercase tracking-wider shrink-0">DEMO</span>
      </div>

      <div class="flex items-center gap-2 sm:gap-4 shrink-0">
        <!-- Mobile: balance + pnl compact -->
        <div class="flex sm:hidden items-center gap-2">
          <div class="text-right">
            <p class="text-[8px] text-slate-600 uppercase">P&L</p>
            <p class="font-black text-[11px]" [ngClass]="totalPnl >= 0 ? 'text-[#0ecb81]' : 'text-[#f6465d]'">
              {{ totalPnl >= 0 ? '+' : '' }}\${{ totalPnl | number:'1.2-2' }}
            </p>
          </div>
          <div class="text-right">
            <p class="text-[8px] text-slate-600 uppercase">Win</p>
            <p class="text-[#0ecb81] font-black text-[11px]">{{ winRate }}%</p>
          </div>
        </div>
        <!-- Desktop stats -->
        <div class="hidden sm:flex items-center gap-4">
          <div class="text-right">
            <p class="text-[9px] text-slate-600 uppercase tracking-wider">Balance</p>
            <p class="text-white font-black text-sm">\${{ balance | number:'1.2-2' }}</p>
          </div>
          <div class="text-right">
            <p class="text-[9px] text-slate-600 uppercase tracking-wider">P&L Session</p>
            <p class="font-black text-sm" [ngClass]="totalPnl >= 0 ? 'text-[#0ecb81]' : 'text-[#f6465d]'">
              {{ totalPnl >= 0 ? '+' : '' }}\${{ totalPnl | number:'1.2-2' }}
            </p>
          </div>
          <div class="text-right">
            <p class="text-[9px] text-slate-600 uppercase tracking-wider">Win Rate</p>
            <p class="text-[#0ecb81] font-black text-sm">{{ winRate }}%</p>
          </div>
        </div>
        <button (click)="closed.emit()"
          class="w-7 h-7 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-slate-500 hover:text-white hover:bg-white/10 transition-all shrink-0">
          <span class="material-symbols-outlined" style="font-size:14px">close</span>
        </button>
      </div>
    </div>

    <!-- ═══ PACKAGE BANNER ════════════════════════════════════════════════ -->
    <div class="shrink-0 px-3 sm:px-4 py-2 sm:py-2.5 border-b border-white/6"
         style="background:linear-gradient(90deg,rgba(0,229,255,0.04) 0%,rgba(16,185,129,0.06) 50%,rgba(0,229,255,0.04) 100%);">
      <div class="flex items-center gap-1.5 mb-2">
        <span class="material-symbols-outlined text-primary" style="font-size:13px">info</span>
        <p class="text-slate-400 text-[10px] sm:text-[11px]">
          Paquete <span class="text-white font-black">{{ packageName }}</span>
        </p>
      </div>
      <div class="flex items-center gap-1.5 overflow-x-auto scrollbar-hide pb-0.5">
        <div class="flex items-center gap-1 px-2 py-1 rounded-lg border border-[#0ecb81]/30 bg-[#0ecb81]/6 shrink-0">
          <span class="material-symbols-outlined text-[#0ecb81]" style="font-size:11px">trending_up</span>
          <span class="text-[#0ecb81] font-black text-xs">{{ monthlyReturn }}%</span>
          <span class="text-slate-600 text-[9px]">/mes</span>
        </div>
        <div class="flex items-center gap-1 px-2 py-1 rounded-lg border border-primary/30 bg-primary/6 shrink-0">
          <span class="material-symbols-outlined text-primary" style="font-size:11px">payments</span>
          <span class="text-primary font-black text-xs">~\${{ estimatedMonthly | number:'1.0-0' }}</span>
          <span class="text-slate-600 text-[9px]">USD/mes</span>
        </div>
        <div class="flex items-center gap-1 px-2 py-1 rounded-lg border border-violet-500/30 bg-violet-500/6 shrink-0">
          <span class="material-symbols-outlined text-violet-400" style="font-size:11px">calendar_month</span>
          <span class="text-violet-400 font-black text-xs">~\${{ estimatedMonthly * 12 | number:'1.0-0' }}</span>
          <span class="text-slate-600 text-[9px]">USD/año</span>
        </div>
        <div class="flex items-center gap-1 px-2 py-1 rounded-lg border border-white/10 bg-white/4 shrink-0">
          <span class="material-symbols-outlined text-slate-400" style="font-size:11px">account_balance_wallet</span>
          <span class="text-white font-black text-xs">\${{ packagePrice | number:'1.0-0' }}</span>
          <span class="text-slate-600 text-[9px]">USD</span>
        </div>
      </div>
    </div>

    <!-- ═══ MAIN LAYOUT ═══════════════════════════════════════════════════ -->
    <div class="flex flex-1 overflow-hidden min-h-0">

      <!-- ── WATCHLIST ─────────────────────────────────────── -->
      <div class="hidden sm:flex w-[148px] border-r border-white/6 flex-col shrink-0 overflow-hidden"
           style="background:#0f1117;">
        <div class="px-2.5 py-2 border-b border-white/6">
          <p class="text-[9px] font-black text-slate-600 uppercase tracking-[0.15em]">Mercados</p>
        </div>
        <!-- Headers -->
        <div class="flex items-center justify-between px-2.5 py-1 border-b border-white/4">
          <span class="text-[8px] text-slate-700 uppercase tracking-wider">Par</span>
          <span class="text-[8px] text-slate-700 uppercase tracking-wider">24h%</span>
        </div>
        <div class="flex-1 overflow-y-auto scrollbar-hide">
          @for (c of cryptos; track c.symbol) {
            <button (click)="selectCrypto(c)"
              class="ticker-row w-full px-2.5 py-1.5 flex flex-col border-b border-white/4 text-left cursor-pointer"
              [style.borderLeft]="activeCrypto.symbol === c.symbol ? '2px solid #00e5ff' : '2px solid transparent'"
              [style.background]="activeCrypto.symbol === c.symbol ? 'rgba(0,229,255,0.05)' : ''">
              <div class="flex items-center justify-between w-full">
                <div class="flex items-center gap-1">
                  <span class="text-[11px]">{{ c.icon }}</span>
                  <span class="text-white font-black text-[10px]">{{ c.symbol }}</span>
                </div>
                <span class="text-[9px] font-bold"
                  [ngClass]="c.change >= 0 ? 'text-[#0ecb81]' : 'text-[#f6465d]'">
                  {{ c.change >= 0 ? '+' : '' }}{{ c.change | number:'1.2-2' }}%
                </span>
              </div>
              <span class="text-slate-600 text-[9px] font-mono mt-0.5">
                \${{ c.price | number:'1.2-4' }}
              </span>
            </button>
          }
        </div>
      </div>

      <!-- ── CENTER: Chart ──────────────────────────────────── -->
      <div class="flex-1 flex flex-col overflow-hidden min-w-0">

        <!-- Mobile crypto selector -->
        <div class="sm:hidden border-b border-white/6 overflow-x-auto scrollbar-hide shrink-0"
             style="background:#0f1117;">
          <div class="flex items-center gap-0 w-max">
            @for (c of cryptos; track c.symbol) {
              <button (click)="selectCrypto(c)"
                class="flex flex-col items-center px-3 py-2 border-r border-white/6 shrink-0 min-w-[64px] transition-all"
                [style.borderBottom]="activeCrypto.symbol === c.symbol ? '2px solid #00e5ff' : '2px solid transparent'"
                [style.background]="activeCrypto.symbol === c.symbol ? 'rgba(0,229,255,0.07)' : ''">
                <span class="text-sm leading-none mb-0.5">{{ c.icon }}</span>
                <span class="text-[9px] font-black text-white">{{ c.symbol }}</span>
                <span class="text-[8px] font-bold"
                  [ngClass]="c.change >= 0 ? 'text-[#0ecb81]' : 'text-[#f6465d]'">
                  {{ c.change >= 0 ? '+' : '' }}{{ c.change | number:'1.1-1' }}%
                </span>
              </button>
            }
          </div>
        </div>

        <!-- Pair header -->
        <div class="flex items-center gap-2 sm:gap-4 px-3 sm:px-4 py-2 sm:py-2.5 border-b border-white/6 shrink-0"
             style="background:#0f1117;">
          <div class="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <span class="text-lg sm:text-2xl leading-none">{{ activeCrypto.icon }}</span>
            <div>
              <div class="flex items-baseline gap-1 sm:gap-2">
                <span class="text-white font-black text-sm sm:text-base">{{ activeCrypto.symbol }}/USDT</span>
                <span class="hidden sm:inline text-[10px] text-slate-600">Perpetual</span>
              </div>
              <span class="hidden sm:block text-[10px] text-slate-600">{{ activeCrypto.name }}</span>
            </div>
          </div>

          <!-- Price big -->
          <div class="pl-2 sm:pl-3 border-l border-white/8 shrink-0">
            <p class="font-black text-sm sm:text-xl leading-none transition-colors duration-200"
              [ngClass]="priceDir === 'up' ? 'text-[#0ecb81]' : priceDir === 'down' ? 'text-[#f6465d]' : 'text-white'">
              \${{ activeCrypto.price | number:'1.2-4' }}
            </p>
            <p class="text-[9px] sm:text-[10px] mt-0.5"
              [ngClass]="activeCrypto.change >= 0 ? 'text-[#0ecb81]' : 'text-[#f6465d]'">
              {{ activeCrypto.change >= 0 ? '▲' : '▼' }} {{ activeCrypto.change | number:'1.2-2' }}%
            </p>
          </div>

          <!-- 24h stats - hidden on mobile -->
          <div class="hidden md:flex items-center gap-4 pl-3 border-l border-white/8">
            @for (s of pairStats; track s.label) {
              <div>
                <p class="text-[9px] text-slate-600 uppercase tracking-wider">{{ s.label }}</p>
                <p class="text-white text-[11px] font-bold font-mono">{{ s.value }}</p>
              </div>
            }
          </div>

          <!-- Bot signal badge -->
          <div class="ml-auto flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg border font-black text-[10px] sm:text-xs uppercase shrink-0"
            [ngClass]="botSignal === 'BUY'  ? 'bg-[#0ecb81]/10 border-[#0ecb81]/30 text-[#0ecb81]' :
                       botSignal === 'SELL' ? 'bg-[#f6465d]/10 border-[#f6465d]/30 text-[#f6465d]' :
                                              'bg-white/4 border-white/10 text-slate-500'">
            <div class="w-1.5 h-1.5 rounded-full animate-pulse shrink-0"
              [ngClass]="botSignal === 'BUY' ? 'bg-[#0ecb81]' : botSignal === 'SELL' ? 'bg-[#f6465d]' : 'bg-slate-600'"></div>
            <span class="hidden sm:inline">{{ botSignal === 'BUY' ? '▲ Comprando' : botSignal === 'SELL' ? '▼ Vendiendo' : '◉ Analizando' }}</span>
            <span class="sm:hidden">{{ botSignal === 'BUY' ? '▲ BUY' : botSignal === 'SELL' ? '▼ SELL' : '◉' }}</span>
          </div>
        </div>

        <!-- Chart toolbar -->
        <div class="flex items-center gap-3 px-4 py-1.5 border-b border-white/6 shrink-0"
             style="background:#0d0f18;">
          @for (tf of ['1m','5m','15m','1H','4H','1D']; track tf) {
            <button class="text-[10px] font-bold px-2 py-0.5 rounded transition-all"
              [ngClass]="tf === '4H' ? 'bg-primary/15 text-primary' : 'text-slate-600 hover:text-slate-400'">
              {{ tf }}
            </button>
          }
          <div class="w-px h-3 bg-white/8 mx-1"></div>
          <span class="text-[10px] text-slate-600 flex items-center gap-1">
            <span class="material-symbols-outlined" style="font-size:12px">show_chart</span> Velas
          </span>
          <div class="ml-auto flex items-center gap-2">
            <div class="w-2 h-2 rounded-full bg-[#0ecb81]/60"></div>
            <span class="text-[9px] text-slate-600">MA(7)</span>
            <div class="w-2 h-2 rounded-full bg-amber-400/60"></div>
            <span class="text-[9px] text-slate-600">MA(25)</span>
          </div>
        </div>

        <!-- SVG Chart -->
        <div class="flex-1 overflow-hidden" style="min-height:0; background:#0b0d14; padding:4px 2px 0;">
          <svg class="w-full h-full" [attr.viewBox]="'0 0 ' + svgW + ' ' + svgH"
               preserveAspectRatio="none" style="display:block;">

            <!-- Background grid -->
            @for (g of gridLines; track g.y) {
              <line [attr.x1]="0" [attr.y1]="g.y" [attr.x2]="svgW" [attr.y2]="g.y"
                    stroke="#ffffff05" stroke-width="1"/>
              <text [attr.x]="svgW - 4" [attr.y]="g.y - 2" fill="#ffffff22"
                    font-size="7" text-anchor="end" font-family="monospace">{{ g.label }}</text>
            }

            <!-- MA line (simple average) -->
            @if (maPath) {
              <path [attr.d]="maPath" fill="none" stroke="#0ecb8155" stroke-width="1.2"/>
            }

            <!-- Candle chart area (top 75%) -->
            @for (c of visibleCandles; track $index) {
              <!-- Wick -->
              <line [attr.x1]="cx($index)" [attr.y1]="py(c.high)"
                    [attr.x2]="cx($index)" [attr.y2]="py(c.low)"
                    [attr.stroke]="c.bull ? '#0ecb81' : '#f6465d'" stroke-width="1"/>
              <!-- Body -->
              <rect [attr.x]="cx($index) - cw/2"
                    [attr.y]="py(c.bull ? c.close : c.open)"
                    [attr.width]="cw"
                    [attr.height]="bodyH(c)"
                    [attr.fill]="c.bull ? '#0ecb81' : '#f6465d'"
                    [attr.fill-opacity]="$index === visibleCandles.length - 1 ? '1' : '0.88'"
                    rx="1"/>
            }

            <!-- Last price line -->
            <line [attr.x1]="0" [attr.y1]="py(activeCrypto.price)"
                  [attr.x2]="svgW - 60" [attr.y2]="py(activeCrypto.price)"
                  stroke="#00e5ff40" stroke-width="0.8" stroke-dasharray="4,3"/>
            <!-- Price label -->
            <rect [attr.x]="svgW - 58" [attr.y]="py(activeCrypto.price) - 7"
                  width="56" height="14" rx="3"
                  [attr.fill]="priceDir === 'down' ? '#f6465d' : '#0ecb81'"/>
            <text [attr.x]="svgW - 30" [attr.y]="py(activeCrypto.price) + 4"
                  text-anchor="middle" font-size="7" font-weight="900" fill="white" font-family="monospace">
              \${{ activeCrypto.price | number:'1.2-2' }}
            </text>

            <!-- Signal markers -->
            @for (s of chartSignals; track s.id) {
              <g>
                <polygon
                  [attr.points]="s.side === 'BUY'
                    ? cx(s.idx)+','+(py(s.price)+18)+' '+(cx(s.idx)-5)+','+(py(s.price)+26)+' '+(cx(s.idx)+5)+','+(py(s.price)+26)
                    : cx(s.idx)+','+(py(s.price)-18)+' '+(cx(s.idx)-5)+','+(py(s.price)-26)+' '+(cx(s.idx)+5)+','+(py(s.price)-26)"
                  [attr.fill]="s.side === 'BUY' ? '#0ecb81' : '#f6465d'"
                  opacity="0.9"/>
                <text [attr.x]="cx(s.idx)"
                      [attr.y]="s.side === 'BUY' ? py(s.price) + 36 : py(s.price) - 28"
                      text-anchor="middle" font-size="6" font-weight="900" font-family="sans-serif"
                      [attr.fill]="s.side === 'BUY' ? '#0ecb81' : '#f6465d'">
                  {{ s.side }}
                </text>
              </g>
            }

            <!-- Volume bars (bottom 20% of chart) -->
            @for (c of visibleCandles; track $index) {
              <rect [attr.x]="cx($index) - cw/2"
                    [attr.y]="svgH - volumeBarH(c.volume) - 2"
                    [attr.width]="cw"
                    [attr.height]="volumeBarH(c.volume)"
                    [attr.fill]="c.bull ? '#0ecb8130' : '#f6465d30'"
                    rx="1"/>
            }

            <!-- Volume label -->
            <text x="4" [attr.y]="svgH - 4" fill="#ffffff20" font-size="7" font-family="monospace">VOL</text>

          </svg>
        </div>

        <!-- Positions bar -->
        <div class="border-t border-white/6 shrink-0" style="background:#0f1117;">
          <div class="flex items-center gap-4 px-3 sm:px-4 py-1.5 border-b border-white/4">
            <span class="text-[10px] font-black text-slate-500 uppercase tracking-wider">Posiciones Abiertas</span>
            <span class="text-[9px] text-primary font-bold">{{ openPositions.length }} activa(s)</span>
          </div>
          <div class="flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2 overflow-x-auto scrollbar-hide">
            @if (openPositions.length === 0) {
              <span class="text-slate-700 text-[10px]">Esperando señal del bot…</span>
            }
            @for (p of openPositions; track p.id) {
              <div class="flex items-center gap-2 px-3 py-1.5 rounded-lg border shrink-0 text-[10px]"
                [ngClass]="p.side === 'BUY' ? 'border-[#0ecb81]/30 bg-[#0ecb81]/5' : 'border-[#f6465d]/30 bg-[#f6465d]/5'">
                <span class="font-black" [ngClass]="p.side === 'BUY' ? 'text-[#0ecb81]' : 'text-[#f6465d]'">
                  {{ p.side === 'BUY' ? '▲ LONG' : '▼ SHORT' }}
                </span>
                <span class="text-slate-400">{{ p.symbol }}</span>
                <span class="text-white font-bold font-mono">\${{ p.price | number:'1.2-2' }}</span>
                <span class="font-black" [ngClass]="p.upnl >= 0 ? 'text-[#0ecb81]' : 'text-[#f6465d]'">
                  {{ p.upnl >= 0 ? '+' : '' }}\${{ p.upnl | number:'1.2-2' }}
                </span>
              </div>
            }
          </div>
        </div>
      </div>

      <!-- ── RIGHT: Order book + trades ────────────────────── -->
      <div class="hidden sm:flex w-[160px] border-l border-white/6 flex-col overflow-hidden shrink-0"
           style="background:#0f1117;">

        <!-- Order book -->
        <div class="px-2.5 py-1.5 border-b border-white/6">
          <p class="text-[9px] font-black text-slate-600 uppercase tracking-[0.15em]">Order Book</p>
        </div>
        <!-- Asks (sell orders - red) -->
        <div class="flex-none">
          @for (o of asks; track o.price) {
            <div class="relative px-2.5 py-0.5 flex items-center justify-between overflow-hidden">
              <div class="absolute right-0 top-0 h-full bg-[#f6465d]/10"
                   [style.width.%]="o.pct"></div>
              <span class="text-[#f6465d] font-mono text-[9px] relative z-10">{{ o.price | number:'1.2-2' }}</span>
              <span class="text-slate-500 font-mono text-[9px] relative z-10">{{ o.qty | number:'1.3-3' }}</span>
            </div>
          }
        </div>

        <!-- Spread -->
        <div class="px-2.5 py-1 border-y border-white/6 flex items-center justify-between"
             style="background:#0d0f18;">
          <span class="text-white font-black text-[10px] font-mono">{{ activeCrypto.price | number:'1.2-2' }}</span>
          <span class="text-slate-600 text-[9px]">Spread</span>
        </div>

        <!-- Bids (buy orders - green) -->
        <div class="flex-none">
          @for (o of bids; track o.price) {
            <div class="relative px-2.5 py-0.5 flex items-center justify-between overflow-hidden">
              <div class="absolute right-0 top-0 h-full bg-[#0ecb81]/10"
                   [style.width.%]="o.pct"></div>
              <span class="text-[#0ecb81] font-mono text-[9px] relative z-10">{{ o.price | number:'1.2-2' }}</span>
              <span class="text-slate-500 font-mono text-[9px] relative z-10">{{ o.qty | number:'1.3-3' }}</span>
            </div>
          }
        </div>

        <!-- Trade history header -->
        <div class="px-2.5 py-1.5 border-y border-white/6 flex items-center justify-between mt-1">
          <p class="text-[9px] font-black text-slate-600 uppercase tracking-[0.15em]">Operaciones</p>
          <span class="text-[9px] text-primary font-bold">{{ trades.length }}</span>
        </div>

        <!-- Trades -->
        <div class="flex-1 overflow-y-auto scrollbar-hide">
          @for (t of trades; track t.id) {
            <div class="px-2.5 py-1.5 border-b border-white/4 flex flex-col gap-0.5">
              <div class="flex items-center justify-between">
                <span class="text-[9px] font-black"
                  [ngClass]="t.side === 'BUY' ? 'text-[#0ecb81]' : 'text-[#f6465d]'">
                  {{ t.side === 'BUY' ? '▲' : '▼' }} {{ t.symbol }}
                </span>
                <span class="text-[9px] font-black font-mono"
                  [ngClass]="t.pnl >= 0 ? 'text-[#0ecb81]' : 'text-[#f6465d]'">
                  {{ t.pnl >= 0 ? '+' : '' }}\${{ t.pnl | number:'1.2-2' }}
                </span>
              </div>
              <div class="flex items-center justify-between">
                <span class="text-slate-700 text-[8px] font-mono">\${{ t.price | number:'1.2-2' }}</span>
                <span class="text-slate-700 text-[8px]">{{ t.time }}</span>
              </div>
            </div>
          }
        </div>

        <!-- Win rate -->
        <div class="px-2.5 py-2.5 border-t border-white/6 space-y-1.5">
          <div class="flex justify-between text-[9px]">
            <span class="text-slate-600 font-bold uppercase tracking-wider">Win Rate</span>
            <span class="text-[#0ecb81] font-black">{{ winRate }}%</span>
          </div>
          <div class="h-1 bg-white/8 rounded-full overflow-hidden">
            <div class="h-full rounded-full transition-all duration-700"
                 style="background:linear-gradient(90deg,#0ecb81,#00e5ff)"
                 [style.width.%]="winRate"></div>
          </div>
          <div class="flex justify-between text-[8px] text-slate-700">
            <span>{{ wins }} gan.</span>
            <span>{{ losses }} perd.</span>
          </div>
        </div>

      </div>
    </div>
  </div>
</div>
  `,
})
export class TradingDemoComponent implements OnInit, OnDestroy {
  private readonly cdr = inject(ChangeDetectorRef);
  @Output() closed = new EventEmitter<void>();
  @Input() packageName   = '';
  @Input() packagePrice  = 0;
  @Input() monthlyReturn = 0;

  get estimatedMonthly(): number { return this.packagePrice * (this.monthlyReturn / 100); }

  /* ── Chart config ─────────────────────────────────────── */
  svgW = 700; svgH = 230; cw = 9; maxC = 52;
  visibleCandles: Candle[] = [];
  candles: Candle[] = [];
  gridLines: { y: number; label: string }[] = [];
  pairStats:  { label: string; value: string }[] = [];
  chartSignals: { id: number; idx: number; side: 'BUY'|'SELL'; price: number }[] = [];
  maPath = '';
  private sigId = 0;

  /* ── Financials ───────────────────────────────────────── */
  balance = 10000; totalPnl = 0; wins = 0; losses = 0; winRate = 0;
  trades: Trade[] = [];
  openPositions: { id: number; symbol: string; side: 'BUY'|'SELL'; price: number; upnl: number }[] = [];
  private tId = 0;

  /* ── Order book ───────────────────────────────────────── */
  asks: OrderRow[] = [];
  bids: OrderRow[] = [];

  /* ── State ────────────────────────────────────────────── */
  botSignal: 'BUY'|'SELL'|'IDLE' = 'IDLE';
  priceDir: 'up'|'down'|'flat' = 'flat';

  cryptos: Crypto[] = [
    { symbol:'BTC',  name:'Bitcoin',   basePrice:67420,      price:67420,      change: 0.82, icon:'₿',  vol24h:42800000000 },
    { symbol:'ETH',  name:'Ethereum',  basePrice:3512,       price:3512,       change: 1.24, icon:'Ξ',  vol24h:18200000000 },
    { symbol:'BNB',  name:'BNB',       basePrice:598,        price:598,        change: 0.56, icon:'◈',  vol24h: 2100000000 },
    { symbol:'SOL',  name:'Solana',    basePrice:172,        price:172,        change: 2.10, icon:'◎',  vol24h: 3400000000 },
    { symbol:'XRP',  name:'XRP',       basePrice:0.624,      price:0.624,      change:-0.32, icon:'✕',  vol24h: 1800000000 },
    { symbol:'ADA',  name:'Cardano',   basePrice:0.456,      price:0.456,      change:-0.80, icon:'₳',  vol24h:  620000000 },
    { symbol:'AVAX', name:'Avalanche', basePrice:38.4,       price:38.4,       change: 1.70, icon:'🔺', vol24h:  480000000 },
    { symbol:'DOGE', name:'Dogecoin',  basePrice:0.1632,     price:0.1632,     change: 3.40, icon:'Ð',  vol24h:  920000000 },
    { symbol:'DOT',  name:'Polkadot',  basePrice:7.82,       price:7.82,       change:-1.10, icon:'●',  vol24h:  310000000 },
    { symbol:'MATIC',name:'Polygon',   basePrice:0.892,      price:0.892,      change: 0.90, icon:'⬡',  vol24h:  410000000 },
    { symbol:'LINK', name:'Chainlink', basePrice:14.7,       price:14.7,       change: 1.50, icon:'🔗', vol24h:  540000000 },
    { symbol:'LTC',  name:'Litecoin',  basePrice:84.2,       price:84.2,       change: 0.40, icon:'Ł',  vol24h:  380000000 },
    { symbol:'UNI',  name:'Uniswap',   basePrice:9.34,       price:9.34,       change:-0.60, icon:'🦄', vol24h:  190000000 },
    { symbol:'ATOM', name:'Cosmos',    basePrice:8.95,       price:8.95,       change: 2.30, icon:'⚛',  vol24h:  210000000 },
    { symbol:'SHIB', name:'Shiba Inu', basePrice:0.00002431, price:0.00002431, change: 4.10, icon:'🐕', vol24h:  760000000 },
  ];

  activeCrypto = this.cryptos[0];
  private t1: ReturnType<typeof setInterval> | null = null;
  private t2: ReturnType<typeof setInterval> | null = null;

  ngOnInit(): void {
    this.buildCandles();
    this.refreshGrid();
    this.refreshPairStats();
    this.refreshOrderBook();
    this.t1 = setInterval(() => this.tick(),       4000);
    this.t2 = setInterval(() => this.flickerAll(),  800);
  }

  ngOnDestroy(): void {
    if (this.t1) clearInterval(this.t1);
    if (this.t2) clearInterval(this.t2);
  }

  selectCrypto(c: Crypto): void {
    this.activeCrypto = c;
    this.buildCandles();
    this.refreshGrid();
    this.refreshPairStats();
    this.refreshOrderBook();
    this.chartSignals = [];
    this.botSignal = 'IDLE';
  }

  /* ── Helpers SVG ──────────────────────────────────────── */
  cx(i: number): number { return i * (this.cw + 3.5) + this.cw / 2 + 3; }

  py(price: number): number {
    const prices = this.visibleCandles.flatMap(c => [c.high, c.low]);
    const lo = Math.min(...prices) * 0.9993;
    const hi = Math.max(...prices) * 1.0007;
    const chartArea = this.svgH * 0.78;
    return chartArea - ((price - lo) / (hi - lo)) * (chartArea - 16) + 8;
  }

  bodyH(c: Candle): number {
    return Math.max(1.5, Math.abs(this.py(c.open) - this.py(c.close)));
  }

  volumeBarH(vol: number): number {
    const vols = this.visibleCandles.map(c => c.volume);
    const maxV = Math.max(...vols);
    return (vol / maxV) * (this.svgH * 0.16);
  }

  /* ── Build candles ────────────────────────────────────── */
  private buildCandles(): void {
    this.candles = [];
    let p = this.activeCrypto.price;
    const vol = p * 0.009;
    const baseVol = this.activeCrypto.vol24h / 1440;
    for (let i = 0; i < this.maxC; i++) {
      const o = p;
      const drift = (Math.random() - 0.47) * vol;
      const c = o + drift;
      const hi = Math.max(o, c) + Math.random() * vol * 0.5;
      const lo = Math.min(o, c) - Math.random() * vol * 0.5;
      const v = baseVol * (0.6 + Math.random() * 0.8);
      this.candles.push({ open: o, high: hi, low: lo, close: c, bull: c >= o, volume: v });
      p = c;
    }
    this.visibleCandles = [...this.candles];
    this.buildMA();
  }

  private buildMA(): void {
    const period = 7;
    const pts: string[] = [];
    for (let i = period - 1; i < this.visibleCandles.length; i++) {
      const avg = this.visibleCandles.slice(i - period + 1, i + 1)
        .reduce((s, c) => s + c.close, 0) / period;
      const x = this.cx(i);
      const y = this.py(avg);
      pts.push(i === period - 1 ? `M${x},${y}` : `L${x},${y}`);
    }
    this.maPath = pts.join(' ');
  }

  /* ── Tick (4s) ─────────────────────────────────────────── */
  private tick(): void {
    const last = this.candles[this.candles.length - 1];
    const vol = this.activeCrypto.price * 0.01;
    const o = last.close;
    const drift = (Math.random() - 0.47) * vol;
    const c = o + drift;
    const hi = Math.max(o, c) + Math.random() * vol * 0.4;
    const lo = Math.min(o, c) - Math.random() * vol * 0.4;
    const v = (this.activeCrypto.vol24h / 1440) * (0.6 + Math.random() * 0.8);

    this.candles.push({ open: o, high: hi, low: lo, close: c, bull: c >= o, volume: v });
    if (this.candles.length > this.maxC * 2) this.candles = this.candles.slice(-this.maxC);
    this.visibleCandles = this.candles.slice(-this.maxC);

    // Update price
    const oldPrice = this.activeCrypto.price;
    const pct = ((c - this.activeCrypto.basePrice) / this.activeCrypto.basePrice) * 100;
    this.activeCrypto = { ...this.activeCrypto, price: c, change: parseFloat(pct.toFixed(2)) };
    const idx = this.cryptos.findIndex(x => x.symbol === this.activeCrypto.symbol);
    if (idx !== -1) this.cryptos[idx] = this.activeCrypto;

    this.priceDir = c >= oldPrice ? 'up' : 'down';
    setTimeout(() => { this.priceDir = 'flat'; this.cdr.detectChanges(); }, 600);

    const side: 'BUY'|'SELL' = c >= o ? 'BUY' : 'SELL';
    this.botSignal = side;
    setTimeout(() => { this.botSignal = 'IDLE'; this.cdr.detectChanges(); }, 1400);

    this.chartSignals.push({ id: ++this.sigId, idx: this.visibleCandles.length - 1, side, price: c });
    if (this.chartSignals.length > 8) this.chartSignals.shift();

    this.executeTrade(side, c);
    this.buildMA();
    this.refreshGrid();
    this.refreshPairStats();
    this.refreshOrderBook();
    this.updatePositions(c);
    this.cdr.detectChanges();
  }

  private flickerAll(): void {
    this.cryptos = this.cryptos.map(c => {
      if (c.symbol === this.activeCrypto.symbol) return c;
      const d = (Math.random() - 0.5) * 0.0016;
      const p = c.price * (1 + d);
      const ch = ((p - c.basePrice) / c.basePrice) * 100;
      return { ...c, price: p, change: parseFloat(ch.toFixed(2)) };
    });
    this.cdr.detectChanges();
  }

  private executeTrade(side: 'BUY'|'SELL', price: number): void {
    const win = side === 'BUY' ? Math.random() > 0.28 : Math.random() > 0.44;
    const pnl = win
      ? parseFloat((Math.random() * 24 + 2).toFixed(2))
      : -(parseFloat((Math.random() * 10 + 1).toFixed(2)));

    const now = new Date();
    const h = now.getHours().toString().padStart(2, '0');
    const m = now.getMinutes().toString().padStart(2, '0');
    const s = now.getSeconds().toString().padStart(2, '0');

    this.trades.unshift({ id: ++this.tId, symbol: this.activeCrypto.symbol, side, price, pnl, time: `${h}:${m}:${s}` });
    if (this.trades.length > 50) this.trades.pop();

    this.totalPnl = parseFloat((this.totalPnl + pnl).toFixed(2));
    this.balance   = parseFloat((this.balance + pnl).toFixed(2));
    if (pnl >= 0) this.wins++; else this.losses++;
    const tot = this.wins + this.losses;
    this.winRate = tot > 0 ? Math.round((this.wins / tot) * 100) : 0;

    // Add open position (close previous)
    if (this.openPositions.length > 2) this.openPositions.pop();
    this.openPositions.unshift({ id: this.tId, symbol: this.activeCrypto.symbol, side, price, upnl: pnl });
  }

  private updatePositions(currentPrice: number): void {
    this.openPositions = this.openPositions.map(p => ({
      ...p,
      upnl: parseFloat(((currentPrice - p.price) * (p.side === 'BUY' ? 1 : -1) * 0.01 + p.upnl * 0.5).toFixed(2)),
    }));
  }

  private refreshGrid(): void {
    if (!this.visibleCandles.length) return;
    const prices = this.visibleCandles.flatMap(c => [c.high, c.low]);
    const lo = Math.min(...prices); const hi = Math.max(...prices);
    const step = (hi - lo) / 4;
    this.gridLines = [0, 1, 2, 3, 4].map(i => {
      const p = lo + step * i;
      return { y: this.py(p), label: p >= 1 ? p.toFixed(2) : p.toFixed(6) };
    });
  }

  private refreshPairStats(): void {
    if (!this.visibleCandles.length) return;
    const vc = this.visibleCandles;
    const hi = Math.max(...vc.map(c => c.high));
    const lo = Math.min(...vc.map(c => c.low));
    const vol = vc.reduce((s, c) => s + c.volume, 0);
    const fmt = (n: number) => n >= 1 ? n.toFixed(2) : n.toFixed(6);
    this.pairStats = [
      { label: '24h Máx', value: '$' + fmt(hi) },
      { label: '24h Mín', value: '$' + fmt(lo) },
      { label: '24h Vol', value: '$' + (vol / 1e6).toFixed(1) + 'M' },
      { label: 'Operac.', value: this.trades.length.toString() },
    ];
  }

  private refreshOrderBook(): void {
    const p = this.activeCrypto.price;
    const spread = p * 0.0003;
    const maxQty = 2.5;
    this.asks = Array.from({ length: 7 }, (_, i) => {
      const price = p + spread * (i + 1);
      const qty = parseFloat((Math.random() * maxQty + 0.1).toFixed(3));
      return { price, qty, total: price * qty, pct: Math.random() * 80 + 10 };
    }).reverse();
    this.bids = Array.from({ length: 7 }, (_, i) => {
      const price = p - spread * (i + 1);
      const qty = parseFloat((Math.random() * maxQty + 0.1).toFixed(3));
      return { price, qty, total: price * qty, pct: Math.random() * 80 + 10 };
    });
  }
}
