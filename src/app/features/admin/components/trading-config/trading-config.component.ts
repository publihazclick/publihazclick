import {
  Component,
  ChangeDetectionStrategy,
  signal,
  inject,
  OnInit,
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
        <div class="flex-1 min-w-0">
          <h2 class="text-xl font-black text-white">Configurar Paquetes Trading Bot AI</h2>
          <p class="text-xs text-slate-500">Activa o desactiva paquetes de Trading para cualquier usuario registrado</p>
        </div>
        <div class="flex-shrink-0 text-right">
          <p class="text-2xl font-black text-primary">{{ totalUsers() }}</p>
          <p class="text-[10px] text-slate-500 uppercase tracking-widest">usuarios</p>
        </div>
      </div>

      <!-- Panel principal: lista + detalle lado a lado en desktop -->
      <div class="flex flex-col lg:flex-row gap-5">

        <!-- ── Lista de usuarios ─────────────────────────────────── -->
        <div class="lg:w-[420px] flex-shrink-0 bg-[#111] border border-white/10 rounded-2xl flex flex-col overflow-hidden">

          <!-- Buscador -->
          <div class="p-4 border-b border-white/5">
            <div class="relative">
              <span class="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" style="font-size:18px">search</span>
              <input
                type="text"
                [(ngModel)]="searchQuery"
                (ngModelChange)="onSearchChange($event)"
                placeholder="Filtrar por celular, usuario o correo..."
                class="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-10 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-primary/40 transition-all"
              />
              @if (searchQuery) {
                <button (click)="clearSearch()"
                  class="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white transition-colors">
                  <span class="material-symbols-outlined" style="font-size:16px">close</span>
                </button>
              }
            </div>
          </div>

          <!-- Lista -->
          <div class="overflow-y-auto flex-1" style="max-height: 560px;">
            @if (loadingUsers()) {
              <div class="flex items-center justify-center gap-2 py-12 text-slate-500">
                <span class="material-symbols-outlined animate-spin" style="font-size:20px">autorenew</span>
                <span class="text-sm">Cargando usuarios...</span>
              </div>
            } @else if (displayedUsers().length === 0) {
              <div class="flex flex-col items-center justify-center py-12 text-slate-600">
                <span class="material-symbols-outlined mb-2" style="font-size:32px">person_search</span>
                <p class="text-sm">No se encontraron usuarios</p>
              </div>
            } @else {
              @for (u of displayedUsers(); track u.id) {
                <button
                  (click)="selectUser(u)"
                  class="w-full flex items-center gap-3 px-4 py-3 border-b border-white/[0.04] text-left transition-all"
                  [class]="selectedUser()?.id === u.id
                    ? 'bg-primary/10 border-l-2 border-l-primary'
                    : 'hover:bg-white/5'"
                >
                  <!-- Avatar inicial -->
                  <div class="w-9 h-9 rounded-xl flex-shrink-0 flex items-center justify-center font-black text-sm"
                    [class]="selectedUser()?.id === u.id
                      ? 'bg-primary/20 text-primary'
                      : 'bg-white/5 text-slate-400'">
                    {{ (u.full_name || u.username || '?').slice(0,1).toUpperCase() }}
                  </div>
                  <div class="flex-1 min-w-0">
                    <p class="text-sm font-bold text-white truncate">{{ u.full_name || u.username }}</p>
                    <p class="text-xs text-slate-500 truncate">{{ u.email }}</p>
                    @if (u.phone) {
                      <p class="text-[10px] text-slate-600 truncate">{{ u.phone }}</p>
                    }
                  </div>
                  <span class="text-[10px] font-black uppercase px-1.5 py-0.5 rounded flex-shrink-0"
                    [class]="u.role === 'admin' || u.role === 'dev'
                      ? 'bg-primary/20 text-primary'
                      : u.role === 'advertiser'
                        ? 'bg-accent/20 text-accent'
                        : 'bg-white/8 text-slate-500'">
                    {{ u.role }}
                  </span>
                </button>
              }

              <!-- Paginación (cuando no hay búsqueda activa) -->
              @if (!searchQuery && totalUsers() > pageSize) {
                <div class="flex items-center justify-between px-4 py-3 border-t border-white/5">
                  <button
                    (click)="prevPage()"
                    [disabled]="currentPage() === 1"
                    class="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold text-slate-400 hover:text-white hover:bg-white/5 disabled:opacity-30 transition-all"
                  >
                    <span class="material-symbols-outlined" style="font-size:16px">chevron_left</span>
                    Anterior
                  </button>
                  <span class="text-xs text-slate-500">
                    Pág. {{ currentPage() }} / {{ totalPagesCount }}
                  </span>
                  <button
                    (click)="nextPage()"
                    [disabled]="currentPage() >= totalPagesCount"
                    class="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold text-slate-400 hover:text-white hover:bg-white/5 disabled:opacity-30 transition-all"
                  >
                    Siguiente
                    <span class="material-symbols-outlined" style="font-size:16px">chevron_right</span>
                  </button>
                </div>
              }
            }
          </div>
        </div>

        <!-- ── Panel de detalle ──────────────────────────────────── -->
        <div class="flex-1 min-w-0">
          @if (!selectedUser()) {
            <div class="h-full min-h-64 flex flex-col items-center justify-center text-slate-600 border border-dashed border-white/10 rounded-2xl py-16">
              <span class="material-symbols-outlined mb-3" style="font-size:40px">person_pin</span>
              <p class="text-sm font-bold">Selecciona un usuario de la lista</p>
              <p class="text-xs mt-1">para ver y gestionar sus paquetes de Trading Bot AI</p>
            </div>
          } @else {
            <div class="bg-[#111] border border-white/10 rounded-2xl p-5 space-y-5">

              <!-- Info del usuario -->
              <div class="flex items-center gap-3 pb-4 border-b border-white/5">
                <div class="w-12 h-12 rounded-xl bg-gradient-to-tr from-primary/20 to-blue-600/20 border border-primary/20 flex items-center justify-center flex-shrink-0 text-xl font-black text-primary">
                  {{ (selectedUser()!.full_name || selectedUser()!.username || '?').slice(0,1).toUpperCase() }}
                </div>
                <div class="flex-1 min-w-0">
                  <p class="font-black text-white">{{ selectedUser()!.full_name || selectedUser()!.username }}</p>
                  <p class="text-xs text-slate-500 truncate">{{ selectedUser()!.email }}</p>
                  @if (selectedUser()!.phone) {
                    <p class="text-xs text-slate-600">{{ selectedUser()!.phone }}</p>
                  }
                </div>
                <span class="text-[10px] font-black uppercase px-2 py-0.5 rounded-lg flex-shrink-0"
                  [class]="selectedUser()!.role === 'admin' || selectedUser()!.role === 'dev'
                    ? 'bg-primary/20 text-primary'
                    : selectedUser()!.role === 'advertiser'
                      ? 'bg-accent/20 text-accent'
                      : 'bg-white/8 text-slate-500'">
                  {{ selectedUser()!.role }}
                </span>
              </div>

              <!-- Paquetes activos del usuario -->
              <div>
                <h4 class="text-xs font-black uppercase tracking-widest text-slate-500 mb-3">Paquetes Trading Asignados</h4>
                @if (loadingUserPkgs()) {
                  <div class="flex items-center gap-2 text-slate-500 text-sm py-2">
                    <span class="material-symbols-outlined animate-spin" style="font-size:16px">autorenew</span> Cargando...
                  </div>
                } @else if (userPackages().length === 0) {
                  <p class="text-slate-600 text-sm py-2 italic">Sin paquetes asignados.</p>
                } @else {
                  <div class="space-y-2">
                    @for (up of userPackages(); track up.id) {
                      <div class="flex items-center gap-3 px-4 py-3 rounded-xl border"
                        [class]="up.is_active ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-white/3 border-white/8 opacity-60'">
                        <div class="flex-1 min-w-0">
                          <div class="flex items-center gap-2 flex-wrap">
                            <span class="text-sm font-black text-white">{{ up.package?.name || 'Paquete' }}</span>
                            <span class="text-[10px] font-black px-1.5 py-0.5 rounded"
                              [class]="up.is_active ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'">
                              {{ up.is_active ? 'ACTIVO' : 'INACTIVO' }}
                            </span>
                          </div>
                          <p class="text-xs text-slate-500 mt-0.5">
                            \${{ up.package?.price_usd | number:'1.0-0' }} USD ·
                            {{ up.package?.monthly_return_pct }}% / mes ·
                            {{ up.activated_at | date:'d MMM yyyy' }}
                          </p>
                          @if (up.notes) {
                            <p class="text-[10px] text-slate-600 mt-0.5">{{ up.notes }}</p>
                          }
                        </div>
                        <button
                          (click)="toggleUserPackage(up)"
                          [disabled]="togglingId() === up.id"
                          class="px-3 py-1.5 rounded-lg text-xs font-black border transition-all disabled:opacity-40 flex-shrink-0"
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
                <h4 class="text-xs font-black uppercase tracking-widest text-slate-500 mb-4">
                  Asignar Paquete Trading Bot AI
                </h4>
                <div class="space-y-4">

                  <!-- SELECT desplegable con todos los paquetes -->
                  <div>
                    <label class="block text-xs text-slate-400 mb-1.5 font-bold uppercase tracking-wider">
                      Selecciona el paquete
                    </label>
                    @if (loadingCatalog()) {
                      <div class="flex items-center gap-2 text-slate-500 text-sm py-3">
                        <span class="material-symbols-outlined animate-spin" style="font-size:16px">autorenew</span>
                        Cargando paquetes...
                      </div>
                    } @else {
                      <select
                        [value]="selectedCatalogPkg()?.name ?? ''"
                        (change)="onSelectPkg($event)"
                        class="w-full bg-[#0d0d0d] border border-white/15 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-emerald-500/60 transition-all cursor-pointer"
                      >
                        <option value="" style="background:#0d0d0d">— Elige un paquete —</option>
                        @for (pkg of catalog(); track pkg.name) {
                          <option [value]="pkg.name" style="background:#0d0d0d">
                            {{ pkg.name }} — \${{ pkg.price_usd | number:'1.0-0' }} USD · {{ pkg.monthly_return_pct }}% / mes
                          </option>
                        }
                      </select>
                    }
                  </div>

                  <!-- Tarjeta de vista previa del paquete seleccionado -->
                  @if (selectedCatalogPkg()) {
                    <div class="rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-4 py-4">
                      <div class="flex items-center gap-3 mb-3">
                        <div class="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center flex-shrink-0">
                          <span class="material-symbols-outlined text-emerald-400" style="font-size:20px">trending_up</span>
                        </div>
                        <div>
                          <p class="text-[10px] text-slate-500 uppercase tracking-widest font-bold">Trading Bot AI</p>
                          <p class="text-white font-black text-base">{{ selectedCatalogPkg()!.name }}</p>
                        </div>
                        <div class="ml-auto text-right">
                          <p class="text-emerald-400 font-black text-lg">{{ selectedCatalogPkg()!.monthly_return_pct }}%</p>
                          <p class="text-[10px] text-slate-500">/ mes</p>
                        </div>
                      </div>
                      <div class="flex items-center gap-2 bg-black/20 rounded-lg px-3 py-2">
                        <span class="material-symbols-outlined text-slate-400" style="font-size:14px">payments</span>
                        <span class="text-xs text-slate-400">Inversión:</span>
                        <span class="text-white font-black text-sm ml-1">
                          \${{ selectedCatalogPkg()!.price_usd | number:'1.0-0' }} USD
                        </span>
                        <span class="mx-2 text-white/10">|</span>
                        <span class="text-xs text-slate-400">Ganancia estimada / mes:</span>
                        <span class="text-emerald-400 font-black text-sm ml-1">
                          \${{ (selectedCatalogPkg()!.price_usd * selectedCatalogPkg()!.monthly_return_pct / 100) | number:'1.0-0' }} USD
                        </span>
                      </div>
                    </div>
                  }

                  <!-- Nota interna -->
                  <div>
                    <label class="block text-xs text-slate-400 mb-1.5 font-bold uppercase tracking-wider">
                      Nota interna (opcional)
                    </label>
                    <input
                      type="text"
                      [(ngModel)]="activationNote"
                      placeholder="Ej: Comprobante WhatsApp enviado el 19/03/2026"
                      class="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-primary/40 transition-all"
                    />
                  </div>

                  <!-- Botón Activar -->
                  <button
                    (click)="assignPackage()"
                    [disabled]="!selectedCatalogPkg() || assigning()"
                    class="w-full py-3.5 rounded-xl text-sm font-black uppercase tracking-widest transition-all disabled:opacity-30 flex items-center justify-center gap-2"
                    [class]="selectedCatalogPkg()
                      ? 'bg-emerald-500 hover:bg-emerald-400 text-black shadow-lg shadow-emerald-500/25'
                      : 'bg-white/5 border border-white/10 text-slate-600'"
                  >
                    @if (assigning()) {
                      <span class="material-symbols-outlined animate-spin" style="font-size:18px">autorenew</span>
                      Activando...
                    } @else {
                      <span class="material-symbols-outlined" style="font-size:18px">bolt</span>
                      @if (selectedCatalogPkg()) {
                        Activar paquete {{ selectedCatalogPkg()!.name }} para {{ selectedUser()!.full_name || selectedUser()!.username }}
                      } @else {
                        Selecciona un paquete primero
                      }
                    }
                  </button>

                  <!-- Feedback -->
                  @if (feedback()) {
                    <div class="flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-bold"
                      [class]="feedbackType() === 'ok'
                        ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400'
                        : 'bg-rose-500/10 border border-rose-500/20 text-rose-400'">
                      <span class="material-symbols-outlined" style="font-size:18px">
                        {{ feedbackType() === 'ok' ? 'check_circle' : 'error' }}
                      </span>
                      {{ feedback() }}
                    </div>
                  }

                </div>
              </div>
            </div>
          }
        </div>

      </div>
    </div>
  `,
})
export class TradingConfigComponent implements OnInit {
  private readonly svc = inject(TradingPackageService);

  searchQuery = '';
  activationNote = '';

  readonly loadingUsers = signal(true);
  readonly allUsers = signal<TradingUserResult[]>([]);
  readonly displayedUsers = signal<TradingUserResult[]>([]);
  readonly totalUsers = signal(0);
  readonly currentPage = signal(1);
  readonly pageSize = 30;

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

  get totalPagesCount(): number {
    return Math.ceil(this.totalUsers() / this.pageSize);
  }

  async ngOnInit(): Promise<void> {
    await Promise.all([
      this.loadPage(1),
      this.svc.getTradingPackages().then(pkgs => {
        this.catalog.set(pkgs);
        this.loadingCatalog.set(false);
      }),
    ]);
  }

  private async loadPage(page: number): Promise<void> {
    this.loadingUsers.set(true);
    const { data, total } = await this.svc.getAllUsers(page, this.pageSize);
    this.allUsers.set(data);
    this.displayedUsers.set(data);
    this.totalUsers.set(total);
    this.currentPage.set(page);
    this.loadingUsers.set(false);
  }

  private searchTimeout: ReturnType<typeof setTimeout> | null = null;

  onSearchChange(q: string): void {
    if (this.searchTimeout) clearTimeout(this.searchTimeout);
    if (!q.trim()) {
      this.loadPage(1);
      return;
    }
    this.searchTimeout = setTimeout(async () => {
      this.loadingUsers.set(true);
      const results = await this.svc.searchUsers(q);
      this.displayedUsers.set(results);
      this.loadingUsers.set(false);
    }, 350);
  }

  clearSearch(): void {
    this.searchQuery = '';
    this.loadPage(1);
  }

  async prevPage(): Promise<void> {
    if (this.currentPage() <= 1) return;
    await this.loadPage(this.currentPage() - 1);
  }

  async nextPage(): Promise<void> {
    if (this.currentPage() >= this.totalPagesCount) return;
    await this.loadPage(this.currentPage() + 1);
  }

  onSelectPkg(event: Event): void {
    const name = (event.target as HTMLSelectElement).value;
    const pkg = this.catalog().find(p => p.name === name) ?? null;
    this.selectedCatalogPkg.set(pkg);
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
      this.feedback.set(`✓ Paquete ${pkg.name} activado para ${user.full_name || user.username}`);
      this.feedbackType.set('ok');
    } else {
      this.feedback.set('Error al activar. Verifica que la migración 039 esté aplicada en Supabase.');
      this.feedbackType.set('err');
    }
    this.assigning.set(false);
    setTimeout(() => this.feedback.set(null), 6000);
  }
}
