import {
  Component,
  ChangeDetectionStrategy,
  OnInit,
  signal,
  inject,
} from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
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

      <!-- Header del paquete activo -->
      <div class="w-full max-w-5xl">
        <div class="flex items-center gap-3 mb-2">
          <div class="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-500/20 to-cyan-500/20 border border-emerald-500/30 flex items-center justify-center">
            <span class="material-symbols-outlined text-emerald-400" style="font-size:22px">smart_toy</span>
          </div>
          <div>
            <h2 class="text-base font-black text-white">
              @if (currentPkg()) {
                Operación · {{ currentPkg()!.package?.name }}
              } @else {
                Trading Bot AI · Operación
              }
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
          <div class="flex items-center gap-4 px-4 py-3 rounded-xl bg-emerald-500/5 border border-emerald-500/20 mt-3">
            <span class="material-symbols-outlined text-emerald-400" style="font-size:20px">verified</span>
            <div class="flex-1 min-w-0">
              <p class="text-sm font-black text-emerald-300">{{ currentPkg()!.package?.name }}</p>
              <p class="text-[10px] text-slate-500">Activado el {{ currentPkg()!.activated_at | date:'d MMM yyyy' }}</p>
            </div>
            <div class="text-right">
              <p class="text-white font-black text-base">\${{ currentPkg()!.package?.price_usd | number:'1.0-0' }} <span class="text-xs text-slate-500">USD</span></p>
              <p class="text-emerald-400 font-black text-sm">{{ currentPkg()!.package?.monthly_return_pct }}% <span class="text-[10px] text-slate-500">/ mes</span></p>
            </div>
            <div class="text-right border-l border-white/10 pl-4 ml-2">
              <p class="text-[10px] text-slate-500">Ganancia est. / mes</p>
              <p class="text-cyan-400 font-black text-base">
                \${{ ((currentPkg()!.package?.price_usd ?? 0) * (currentPkg()!.package?.monthly_return_pct ?? 0) / 100) | number:'1.0-0' }}
                <span class="text-[10px] text-slate-500">USD</span>
              </p>
            </div>
          </div>
        }
      </div>

      <!-- Demo en vivo con los datos del paquete específico -->
      <div class="w-full max-w-5xl">
        <app-trading-demo
          [packageName]="demoPackage().name"
          [packagePrice]="demoPackage().price"
          [monthlyReturn]="demoPackage().monthlyReturn"
          [isEmbedded]="true"
        />
      </div>

      <!-- Sección: adquirir más paquetes -->
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
  private readonly route = inject(ActivatedRoute);

  readonly currentPkg = signal<UserTradingPackage | null>(null);
  readonly selectedPackage = signal<TradingPackage | null>(null);

  readonly demoPackage = signal<TradingPackage>({
    name: 'Semilla', price: 100, monthlyReturn: 2.0,
    bg: 'bg-emerald-500/5', border: 'border-emerald-500/30',
    text: 'text-emerald-400', shadow: '', badge: 'bg-emerald-500/20 text-emerald-400', level: 'Activo'
  });

  async ngOnInit(): Promise<void> {
    const packageId = this.route.snapshot.paramMap.get('packageId');
    if (packageId) {
      const pkg = await this.svc.getMyPackageById(packageId);
      if (pkg?.package) {
        this.currentPkg.set(pkg);
        this.demoPackage.set({
          name: pkg.package.name,
          price: pkg.package.price_usd,
          monthlyReturn: pkg.package.monthly_return_pct,
          bg: 'bg-emerald-500/5', border: 'border-emerald-500/30',
          text: 'text-emerald-400', shadow: '', badge: 'bg-emerald-500/20 text-emerald-400', level: 'Activo'
        });
      }
    } else {
      // Sin ID: cargar el primer paquete activo (compatibilidad con ruta sin param)
      const pkgs = await this.svc.getMyActivePackages();
      if (pkgs.length > 0 && pkgs[0].package) {
        this.currentPkg.set(pkgs[0]);
        const p = pkgs[0].package;
        this.demoPackage.set({
          name: p.name, price: p.price_usd, monthlyReturn: p.monthly_return_pct,
          bg: 'bg-emerald-500/5', border: 'border-emerald-500/30',
          text: 'text-emerald-400', shadow: '', badge: 'bg-emerald-500/20 text-emerald-400', level: 'Activo'
        });
      }
    }
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
