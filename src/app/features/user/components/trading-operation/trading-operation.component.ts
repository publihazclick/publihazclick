import {
  Component,
  ChangeDetectionStrategy,
  OnInit,
  signal,
  inject,
} from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { TradingDemoComponent } from '../trading-bot/trading-demo.component';
import { TradingPackageService, UserTradingPackage } from '../../../../core/services/trading-package.service';

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
  selector: 'app-trading-operation',
  standalone: true,
  imports: [DecimalPipe, TradingDemoComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-col items-center py-6 px-4 w-full gap-8">

      <!-- Header de operación activa -->
      <div class="w-full max-w-5xl">
        <div class="flex items-center gap-3 mb-4">
          <div class="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-500/20 to-cyan-500/20 border border-emerald-500/30 flex items-center justify-center">
            <span class="material-symbols-outlined text-emerald-400" style="font-size:22px">smart_toy</span>
          </div>
          <div>
            <h2 class="text-base font-black text-white">Tu Operación · Trading Bot AI</h2>
            <p class="text-xs text-slate-500">Monitoreo en tiempo real de tus operaciones automáticas</p>
          </div>
          <span class="ml-auto flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20">
            <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
            <span class="text-[10px] font-black text-emerald-400 uppercase tracking-wider">En vivo</span>
          </span>
        </div>

        <!-- Paquetes activos del usuario -->
        @if (activePackages().length > 0) {
          <div class="flex flex-wrap gap-2 mb-4">
            @for (up of activePackages(); track up.id) {
              <div class="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                <span class="material-symbols-outlined text-emerald-400" style="font-size:14px">verified</span>
                <span class="text-xs font-black text-emerald-300">{{ up.package?.name }}</span>
                <span class="text-[10px] text-slate-500">\${{ up.package?.price_usd | number:'1.0-0' }} USD · {{ up.package?.monthly_return_pct }}%/mes</span>
              </div>
            }
          </div>
        }
      </div>

      <!-- Demo en vivo — usa el primer paquete activo como contexto -->
      <div class="w-full max-w-5xl">
        <app-trading-demo
          [packageName]="demoPackage.name"
          [packagePrice]="demoPackage.price"
          [monthlyReturn]="demoPackage.monthlyReturn"
          [isEmbedded]="true"
        />
      </div>

      <!-- Separador -->
      <div class="w-full max-w-5xl border-t border-white/5 pt-6">
        <div class="text-center mb-6">
          <h3 class="text-white font-black text-lg uppercase tracking-widest">
            Amplía tus <span class="text-primary">Ganancias</span>
          </h3>
          <p class="text-slate-500 text-xs mt-1">Activa más paquetes y multiplica tus rendimientos mensuales</p>
        </div>

        <!-- Grid de paquetes para comprar más -->
        <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
          @for (pkg of packages; track pkg.price) {
            <div class="relative rounded-xl p-3 border transition-all duration-300 hover:scale-105 hover:-translate-y-1 flex flex-col gap-2
              {{ pkg.bg }} {{ pkg.border }} {{ pkg.shadow }}">
              <div class="flex items-center justify-between">
                <span class="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full {{ pkg.badge }}">
                  {{ pkg.level }}
                </span>
              </div>
              <p class="text-white font-black text-sm leading-tight">{{ pkg.name }}</p>
              <div class="flex items-baseline gap-1">
                <p class="font-black text-lg {{ pkg.text }}">\${{ pkg.price | number:'1.0-0' }}</p>
                <span class="text-[10px] font-black text-slate-500 uppercase tracking-wider">USD</span>
              </div>
              <div class="flex items-center gap-1 bg-black/20 rounded-lg px-2 py-1">
                <span class="material-symbols-outlined text-emerald-400" style="font-size:13px">trending_up</span>
                <span class="text-emerald-400 font-black text-xs">{{ pkg.monthlyReturn }}%</span>
                <span class="text-slate-500 text-[10px]">/ mes</span>
              </div>
              <button
                (click)="selectedPackage.set(pkg)"
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

    <!-- MODAL DE PAGO -->
    @if (selectedPackage()) {
      <div class="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4"
        (click)="selectedPackage.set(null)">
        <div class="absolute inset-0 bg-black/80 backdrop-blur-sm"></div>
        <div class="relative z-10 w-full max-w-md rounded-t-2xl sm:rounded-2xl overflow-hidden shadow-2xl mx-auto max-h-[92vh] overflow-y-auto"
          (click)="$event.stopPropagation()">

          <div class="bg-gradient-to-br from-[#0a0a0a] via-[#111827] to-[#0a0a0a] border border-white/10 px-4 sm:px-6 pt-5 sm:pt-6 pb-4">
            <button (click)="selectedPackage.set(null)"
              class="absolute top-3 right-3 sm:top-4 sm:right-4 w-8 h-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 transition-all z-10">
              <span class="material-symbols-outlined" style="font-size:16px">close</span>
            </button>
            <div class="flex items-center gap-3 mb-4 pr-8">
              <div class="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-500/20 to-cyan-500/20 border border-emerald-500/30 flex items-center justify-center shrink-0">
                <span class="material-symbols-outlined text-emerald-400" style="font-size:18px">trending_up</span>
              </div>
              <div>
                <p class="text-[10px] text-slate-500 uppercase tracking-widest font-bold">Trading Bot AI</p>
                <h3 class="text-white font-black text-base sm:text-lg leading-tight">Paquete {{ selectedPackage()!.name }}</h3>
              </div>
            </div>
            <div class="flex items-center gap-3 bg-white/5 border border-white/10 rounded-xl px-4 py-3 mb-2">
              <div class="flex-1 min-w-0">
                <p class="text-slate-400 text-xs">Inversión</p>
                <p class="text-white font-black text-xl">\${{ selectedPackage()!.price | number:'1.0-0' }} <span class="text-xs font-bold text-slate-500">USD</span></p>
              </div>
              <div class="w-px h-8 bg-white/10 shrink-0"></div>
              <div class="flex-1 text-right">
                <p class="text-slate-400 text-xs">Rentabilidad</p>
                <p class="text-emerald-400 font-black text-xl">{{ selectedPackage()!.monthlyReturn }}% <span class="text-xs font-bold text-slate-500">/ mes</span></p>
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
                <div class="flex items-center gap-2">
                  <span class="material-symbols-outlined text-[#8B5CF6]" style="font-size:14px">call</span>
                  <span class="text-white font-black text-lg tracking-widest">313 445 3649</span>
                </div>
                <div class="flex items-center gap-2">
                  <span class="material-symbols-outlined text-slate-500" style="font-size:14px">person</span>
                  <span class="text-slate-300 font-bold text-sm">VICTOR VERA</span>
                </div>
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
                <div class="flex items-center gap-2">
                  <span class="material-symbols-outlined text-[#E63946]" style="font-size:14px">call</span>
                  <span class="text-white font-black text-lg tracking-widest">313 445 3649</span>
                </div>
                <div class="flex items-center gap-2">
                  <span class="material-symbols-outlined text-slate-500" style="font-size:14px">person</span>
                  <span class="text-slate-300 font-bold text-sm">VICTOR VERA</span>
                </div>
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
                  <p class="text-slate-400 text-xs leading-relaxed mb-3">
                    Una vez realizada la compra, envía tu comprobante vía WhatsApp al número:
                  </p>
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
export class TradingOperationComponent implements OnInit {
  private readonly svc = inject(TradingPackageService);

  readonly activePackages = signal<UserTradingPackage[]>([]);
  readonly selectedPackage = signal<TradingPackage | null>(null);

  // Default demo package — overridden by first active package
  demoPackage: TradingPackage = {
    name: 'JADE', price: 50, monthlyReturn: 2.0,
    bg: 'bg-emerald-500/5', border: 'border-emerald-500/30',
    text: 'text-emerald-400', shadow: '', badge: 'bg-emerald-500/20 text-emerald-400', level: 'Entrada'
  };

  async ngOnInit(): Promise<void> {
    const pkgs = await this.svc.getMyActivePackages();
    this.activePackages.set(pkgs);
    if (pkgs.length > 0 && pkgs[0].package) {
      const p = pkgs[0].package;
      this.demoPackage = {
        name: p.name,
        price: p.price_usd,
        monthlyReturn: p.monthly_return_pct,
        bg: 'bg-emerald-500/5', border: 'border-emerald-500/30',
        text: 'text-emerald-400', shadow: '', badge: 'bg-emerald-500/20 text-emerald-400', level: 'Activo'
      };
    }
  }

  packages: TradingPackage[] = [
    { name: 'JADE',            price: 50,    monthlyReturn: 2.0, level: 'Entrada',   bg: 'bg-emerald-500/5',  border: 'border-emerald-500/30', text: 'text-emerald-400', shadow: 'hover:shadow-lg hover:shadow-emerald-500/10', badge: 'bg-emerald-500/20 text-emerald-400' },
    { name: 'PERLA',           price: 100,   monthlyReturn: 2.5, level: 'Básico',    bg: 'bg-pink-500/5',     border: 'border-pink-500/30',    text: 'text-pink-400',    shadow: 'hover:shadow-lg hover:shadow-pink-500/10',    badge: 'bg-pink-500/20 text-pink-400'       },
    { name: 'ZAFIRO',          price: 200,   monthlyReturn: 3.0, level: 'Estándar',  bg: 'bg-blue-500/5',     border: 'border-blue-500/30',    text: 'text-blue-400',    shadow: 'hover:shadow-lg hover:shadow-blue-500/10',    badge: 'bg-blue-500/20 text-blue-400'       },
    { name: 'RUBY',            price: 500,   monthlyReturn: 3.5, level: 'Avanzado',  bg: 'bg-red-500/5',      border: 'border-red-500/30',     text: 'text-red-400',     shadow: 'hover:shadow-lg hover:shadow-red-500/10',     badge: 'bg-red-500/20 text-red-400'         },
    { name: 'ESMERALDA',       price: 1000,  monthlyReturn: 4.0, level: 'Premium',   bg: 'bg-teal-500/5',     border: 'border-teal-500/30',    text: 'text-teal-400',    shadow: 'hover:shadow-lg hover:shadow-teal-500/10',    badge: 'bg-teal-500/20 text-teal-400'       },
    { name: 'DIAMANTE',        price: 3000,  monthlyReturn: 4.5, level: 'Élite',     bg: 'bg-cyan-500/5',     border: 'border-cyan-500/30',    text: 'text-cyan-400',    shadow: 'hover:shadow-lg hover:shadow-cyan-500/15',    badge: 'bg-cyan-500/20 text-cyan-400'       },
    { name: 'DIAMANTE AZUL',   price: 5000,  monthlyReturn: 5.0, level: 'Élite+',    bg: 'bg-blue-400/5',     border: 'border-blue-400/30',    text: 'text-blue-300',    shadow: 'hover:shadow-lg hover:shadow-blue-400/20',    badge: 'bg-blue-400/20 text-blue-300'       },
    { name: 'DIAMANTE NEGRO',  price: 7000,  monthlyReturn: 5.5, level: 'VIP',       bg: 'bg-white/[0.03]',   border: 'border-white/20',       text: 'text-white',       shadow: 'hover:shadow-lg hover:shadow-white/10',       badge: 'bg-white/10 text-white'             },
    { name: 'DIAMANTE CORONA', price: 10000, monthlyReturn: 6.0, level: 'Black',     bg: 'bg-gradient-to-br from-yellow-500/10 to-white/5', border: 'border-yellow-400/50', text: 'text-yellow-300', shadow: 'hover:shadow-xl hover:shadow-yellow-400/30', badge: 'bg-yellow-400/20 text-yellow-300' },
  ];
}
