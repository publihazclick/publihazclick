import {
  Component,
  ChangeDetectionStrategy,
  signal,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DecimalPipe } from '@angular/common';
import {
  TradingPackageService,
  TradingBotPackage,
  UserTradingPackage,
  TradingUserResult,
} from '../../../../core/services/trading-package.service';

@Component({
  selector: 'app-trading-config',
  standalone: true,
  imports: [CommonModule, FormsModule, DecimalPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="space-y-6">

      <!-- Header -->
      <div class="flex items-center gap-4">
        <div class="w-12 h-12 rounded-xl bg-gradient-to-tr from-emerald-500/20 to-cyan-500/20 border border-emerald-500/30 flex items-center justify-center">
          <span class="material-symbols-outlined text-emerald-400" style="font-size:26px">settings_suggest</span>
        </div>
        <div>
          <h2 class="text-xl font-black text-white">Configurar Paquetes Trading Bot AI</h2>
          <p class="text-xs text-slate-500">Activa o desactiva paquetes de Trading para usuarios</p>
        </div>
      </div>

      <!-- Búsqueda de usuario -->
      <div class="bg-[#111] border border-white/10 rounded-2xl p-5">
        <h3 class="text-sm font-black text-white uppercase tracking-widest mb-4">Buscar Usuario</h3>
        <div class="flex gap-3">
          <div class="flex-1 relative">
            <span class="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" style="font-size:18px">search</span>
            <input
              type="text"
              [(ngModel)]="searchQuery"
              (input)="onSearchInput()"
              placeholder="Buscar por celular, usuario o correo..."
              class="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-primary/40 transition-all"
            />
          </div>
          <button
            (click)="searchUsers()"
            [disabled]="searching()"
            class="px-5 py-3 rounded-xl bg-primary/10 border border-primary/30 text-primary text-sm font-black hover:bg-primary/20 transition-all disabled:opacity-40"
          >
            @if (searching()) {
              <span class="material-symbols-outlined animate-spin" style="font-size:18px">autorenew</span>
            } @else {
              Buscar
            }
          </button>
        </div>

        <!-- Resultados de búsqueda -->
        @if (userResults().length > 0) {
          <div class="mt-4 space-y-2">
            @for (u of userResults(); track u.id) {
              <button
                (click)="selectUser(u)"
                class="w-full flex items-center gap-3 px-4 py-3 rounded-xl border transition-all text-left"
                [class]="selectedUser()?.id === u.id
                  ? 'bg-primary/10 border-primary/30 text-white'
                  : 'bg-white/3 border-white/10 text-slate-300 hover:bg-white/5 hover:border-white/20'"
              >
                <div class="w-9 h-9 rounded-xl bg-gradient-to-tr from-primary/20 to-cyan-500/20 border border-primary/20 flex items-center justify-center flex-shrink-0">
                  <span class="material-symbols-outlined text-primary" style="font-size:18px">person</span>
                </div>
                <div class="flex-1 min-w-0">
                  <p class="text-sm font-black truncate">{{ u.full_name || u.username }}</p>
                  <p class="text-xs text-slate-500 truncate">{{ u.email }}{{ u.phone ? ' · ' + u.phone : '' }}</p>
                </div>
                <span class="text-[10px] font-black uppercase px-2 py-0.5 rounded-lg flex-shrink-0"
                  [class]="u.role === 'admin' || u.role === 'dev' ? 'bg-primary/20 text-primary' : 'bg-white/10 text-slate-400'">
                  {{ u.role }}
                </span>
              </button>
            }
          </div>
        } @else if (searched() && userResults().length === 0) {
          <p class="mt-4 text-center text-slate-500 text-sm py-4">No se encontraron usuarios</p>
        }
      </div>

      <!-- Panel del usuario seleccionado -->
      @if (selectedUser()) {
        <div class="bg-[#111] border border-white/10 rounded-2xl p-5 space-y-5">

          <!-- Info del usuario -->
          <div class="flex items-center gap-3 pb-4 border-b border-white/5">
            <div class="w-12 h-12 rounded-xl bg-gradient-to-tr from-primary/20 to-blue-600/20 border border-primary/20 flex items-center justify-center">
              <span class="material-symbols-outlined text-primary" style="font-size:28px">person</span>
            </div>
            <div class="flex-1 min-w-0">
              <p class="font-black text-white">{{ selectedUser()!.full_name || selectedUser()!.username }}</p>
              <p class="text-xs text-slate-500">{{ selectedUser()!.email }}</p>
              @if (selectedUser()!.phone) {
                <p class="text-xs text-slate-600">{{ selectedUser()!.phone }}</p>
              }
            </div>
          </div>

          <!-- Paquetes activos del usuario -->
          <div>
            <h4 class="text-xs font-black uppercase tracking-widest text-slate-500 mb-3">Paquetes Trading Activos</h4>
            @if (loadingUserPkgs()) {
              <div class="flex items-center gap-2 text-slate-500 text-sm py-2">
                <span class="material-symbols-outlined animate-spin" style="font-size:16px">autorenew</span> Cargando...
              </div>
            } @else if (userPackages().length === 0) {
              <p class="text-slate-600 text-sm py-2">Este usuario no tiene paquetes de Trading activos.</p>
            } @else {
              <div class="space-y-2">
                @for (up of userPackages(); track up.id) {
                  <div class="flex items-center gap-3 px-4 py-3 rounded-xl border"
                    [class]="up.is_active ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-white/3 border-white/10 opacity-60'">
                    <div class="flex-1 min-w-0">
                      <div class="flex items-center gap-2">
                        <span class="text-sm font-black text-white">{{ up.package?.name || 'Paquete' }}</span>
                        <span class="text-[10px] font-black px-1.5 py-0.5 rounded"
                          [class]="up.is_active ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'">
                          {{ up.is_active ? 'ACTIVO' : 'INACTIVO' }}
                        </span>
                      </div>
                      <p class="text-xs text-slate-500">
                        \${{ up.package?.price_usd | number:'1.0-0' }} USD ·
                        {{ up.package?.monthly_return_pct }}% / mes ·
                        Activado {{ up.activated_at | date:'d MMM yyyy' }}
                      </p>
                      @if (up.notes) {
                        <p class="text-xs text-slate-600 mt-0.5">{{ up.notes }}</p>
                      }
                    </div>
                    <button
                      (click)="toggleUserPackage(up)"
                      [disabled]="togglingId() === up.id"
                      class="px-3 py-1.5 rounded-lg text-xs font-black border transition-all disabled:opacity-40"
                      [class]="up.is_active
                        ? 'bg-rose-500/10 border-rose-500/20 text-rose-400 hover:bg-rose-500/20'
                        : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20'"
                    >
                      @if (togglingId() === up.id) {
                        <span class="material-symbols-outlined animate-spin" style="font-size:14px">autorenew</span>
                      } @else {
                        {{ up.is_active ? 'Desactivar' : 'Activar' }}
                      }
                    </button>
                  </div>
                }
              </div>
            }
          </div>

          <!-- Asignar nuevo paquete -->
          <div class="pt-4 border-t border-white/5">
            <h4 class="text-xs font-black uppercase tracking-widest text-slate-500 mb-3">Asignar Nuevo Paquete</h4>
            <div class="space-y-3">
              <!-- Select paquete -->
              <div>
                <label class="text-xs text-slate-400 mb-1 block">Paquete</label>
                @if (loadingCatalog()) {
                  <p class="text-slate-500 text-xs">Cargando catálogo...</p>
                } @else {
                  <div class="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-64 overflow-y-auto pr-1">
                    @for (pkg of catalog(); track pkg.id) {
                      <button
                        (click)="selectedCatalogPkg.set(pkg)"
                        class="text-left px-3 py-2 rounded-xl border text-xs transition-all"
                        [class]="selectedCatalogPkg()?.id === pkg.id
                          ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                          : 'bg-white/3 border-white/10 text-slate-400 hover:border-white/20 hover:text-white'"
                      >
                        <p class="font-black">{{ pkg.name }}</p>
                        <p class="text-[10px] text-slate-500">\${{ pkg.price_usd | number:'1.0-0' }} · {{ pkg.monthly_return_pct }}%/mes</p>
                      </button>
                    }
                  </div>
                }
              </div>

              <!-- Notas opcionales -->
              <div>
                <label class="text-xs text-slate-400 mb-1 block">Nota interna (opcional)</label>
                <input
                  type="text"
                  [(ngModel)]="activationNote"
                  placeholder="Ej: Comprobante WhatsApp #12345"
                  class="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-primary/40 transition-all"
                />
              </div>

              <!-- Botón asignar -->
              <button
                (click)="assignPackage()"
                [disabled]="!selectedCatalogPkg() || assigning()"
                class="w-full py-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-sm font-black hover:bg-emerald-500/20 transition-all disabled:opacity-40 flex items-center justify-center gap-2"
              >
                @if (assigning()) {
                  <span class="material-symbols-outlined animate-spin" style="font-size:18px">autorenew</span>
                  Activando...
                } @else {
                  <span class="material-symbols-outlined" style="font-size:18px">add_circle</span>
                  Activar Paquete{{ selectedCatalogPkg() ? ' · ' + selectedCatalogPkg()!.name : '' }}
                }
              </button>

              <!-- Feedback -->
              @if (feedback()) {
                <div class="flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-bold"
                  [class]="feedbackType() === 'ok' ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400' : 'bg-rose-500/10 border border-rose-500/20 text-rose-400'">
                  <span class="material-symbols-outlined" style="font-size:18px">{{ feedbackType() === 'ok' ? 'check_circle' : 'error' }}</span>
                  {{ feedback() }}
                </div>
              }
            </div>
          </div>
        </div>
      }
    </div>
  `,
})
export class TradingConfigComponent {
  private readonly svc = inject(TradingPackageService);

  searchQuery = '';
  activationNote = '';

  readonly searching = signal(false);
  readonly searched = signal(false);
  readonly userResults = signal<TradingUserResult[]>([]);
  readonly selectedUser = signal<TradingUserResult | null>(null);

  readonly loadingUserPkgs = signal(false);
  readonly userPackages = signal<UserTradingPackage[]>([]);
  readonly togglingId = signal<string | null>(null);

  readonly loadingCatalog = signal(true);
  readonly catalog = signal<TradingBotPackage[]>([]);
  readonly selectedCatalogPkg = signal<TradingBotPackage | null>(null);
  readonly assigning = signal(false);
  readonly feedback = signal<string | null>(null);
  readonly feedbackType = signal<'ok' | 'err'>('ok');

  constructor() {
    this.svc.getTradingPackages().then(pkgs => {
      this.catalog.set(pkgs);
      this.loadingCatalog.set(false);
    });
  }

  onSearchInput(): void {
    this.searched.set(false);
    this.userResults.set([]);
  }

  async searchUsers(): Promise<void> {
    if (this.searching()) return;
    this.searching.set(true);
    const results = await this.svc.searchUsers(this.searchQuery);
    this.userResults.set(results);
    this.searched.set(true);
    this.searching.set(false);
  }

  async selectUser(u: TradingUserResult): Promise<void> {
    this.selectedUser.set(u);
    this.userPackages.set([]);
    this.selectedCatalogPkg.set(null);
    this.feedback.set(null);
    this.activationNote = '';
    this.loadingUserPkgs.set(true);
    const pkgs = await this.svc.getUserTradingPackages(u.id);
    this.userPackages.set(pkgs);
    this.loadingUserPkgs.set(false);
  }

  async toggleUserPackage(up: UserTradingPackage): Promise<void> {
    this.togglingId.set(up.id);
    const ok = await this.svc.togglePackage(up.id, !up.is_active);
    if (ok) {
      this.userPackages.update(list =>
        list.map(p => p.id === up.id ? { ...p, is_active: !p.is_active } : p)
      );
    }
    this.togglingId.set(null);
  }

  async assignPackage(): Promise<void> {
    const user = this.selectedUser();
    const pkg = this.selectedCatalogPkg();
    if (!user || !pkg || this.assigning()) return;
    this.assigning.set(true);
    this.feedback.set(null);
    const result = await this.svc.activatePackage(user.id, pkg.id, this.activationNote || undefined);
    if (result) {
      this.userPackages.update(list => [result, ...list]);
      this.selectedCatalogPkg.set(null);
      this.activationNote = '';
      this.feedback.set(`✓ Paquete ${pkg.name} activado correctamente`);
      this.feedbackType.set('ok');
    } else {
      this.feedback.set('Error al activar el paquete. Verifica que la migración esté aplicada.');
      this.feedbackType.set('err');
    }
    this.assigning.set(false);
    setTimeout(() => this.feedback.set(null), 5000);
  }
}
