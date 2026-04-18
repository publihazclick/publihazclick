import { Component, signal, computed, ViewChild, OnInit, OnDestroy, inject, PLATFORM_ID, effect } from '@angular/core';
import { CommonModule, isPlatformBrowser, DatePipe } from '@angular/common';
import { RouterModule, Router, NavigationStart } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../../../core/services/auth.service';
import { ProfileService } from '../../../../core/services/profile.service';
import { WalletStateService } from '../../../../core/services/wallet-state.service';
import { CurrencyService, Currency } from '../../../../core/services/currency.service';
import { TradingPackageService, UserTradingPackage } from '../../../../core/services/trading-package.service';
import { AdminPackageService } from '../../../../core/services/admin-package.service';
import { UserReferralModalComponent } from '../user-referral-modal/user-referral-modal.component';
import { BannerSliderComponent } from '../../../../components/banner-slider/banner-slider.component';
import { getSupabaseClient } from '../../../../core/supabase.client';

interface LayoutPaymentMethod {
  id: string;
  name: string;
  icon: string;
  category: string;
  countries: string[];
  fields: { key: string; label: string; placeholder: string; type: 'text' | 'email' | 'tel' }[];
}

interface LayoutSavedMethod {
  id: string;
  methodId: string;
  label: string;
  data: Record<string, string>;
}

const LAYOUT_PAYMENT_METHODS: LayoutPaymentMethod[] = [
  { id: 'nequi', name: 'Nequi', icon: 'smartphone', category: 'Colombia', countries: ['+57'], fields: [{ key: 'phone', label: 'Numero Nequi', placeholder: 'Ej: 3001234567', type: 'tel' }] },
  { id: 'daviplata', name: 'Daviplata', icon: 'phone_android', category: 'Colombia', countries: ['+57'], fields: [{ key: 'phone', label: 'Numero Daviplata', placeholder: 'Ej: 3001234567', type: 'tel' }] },
  { id: 'bancolombia', name: 'Bancolombia', icon: 'account_balance', category: 'Colombia', countries: ['+57'], fields: [{ key: 'account', label: 'Numero de cuenta', placeholder: 'Cuenta ahorros o corriente', type: 'text' }, { key: 'holder', label: 'Titular', placeholder: 'Nombre completo', type: 'text' }] },
  { id: 'transfiya', name: 'Transfiya', icon: 'swap_horiz', category: 'Colombia', countries: ['+57'], fields: [{ key: 'phone', label: 'Numero celular', placeholder: 'Ej: 3001234567', type: 'tel' }] },
  { id: 'pago_movil', name: 'Pago Movil', icon: 'smartphone', category: 'Venezuela', countries: ['+58'], fields: [{ key: 'phone', label: 'Telefono', placeholder: 'Ej: 04121234567', type: 'tel' }, { key: 'cedula', label: 'Cedula', placeholder: 'V12345678', type: 'text' }, { key: 'bank', label: 'Banco', placeholder: 'Banesco, Mercantil...', type: 'text' }] },
  { id: 'binance_ve', name: 'Binance P2P', icon: 'currency_exchange', category: 'Venezuela', countries: ['+58'], fields: [{ key: 'email', label: 'Email Binance', placeholder: 'tu@email.com', type: 'email' }] },
  { id: 'paypal', name: 'PayPal', icon: 'account_balance_wallet', category: 'Internacional', countries: [], fields: [{ key: 'email', label: 'Email PayPal', placeholder: 'tu@email.com', type: 'email' }] },
  { id: 'binance', name: 'Binance Pay', icon: 'currency_exchange', category: 'Crypto', countries: [], fields: [{ key: 'binance_id', label: 'Binance Pay ID / Email', placeholder: 'ID o email', type: 'text' }] },
  { id: 'usdt_trc20', name: 'USDT (TRC-20)', icon: 'token', category: 'Crypto', countries: [], fields: [{ key: 'wallet', label: 'Wallet TRC-20', placeholder: 'T...', type: 'text' }] },
];

@Component({
  selector: 'app-user-layout',
  standalone: true,
  imports: [CommonModule, RouterModule, DatePipe, FormsModule, UserReferralModalComponent, BannerSliderComponent],
  templateUrl: './user-layout.component.html',
  styleUrl: './user-layout.component.scss',
})
export class UserLayoutComponent implements OnInit, OnDestroy {
  private readonly authService = inject(AuthService);
  private readonly profileService = inject(ProfileService);
  readonly walletState = inject(WalletStateService);
  readonly currencyService = inject(CurrencyService);
  private readonly tradingPkgSvc = inject(TradingPackageService);
  private readonly packageService = inject(AdminPackageService);
  private readonly router = inject(Router);
  private readonly platformId = inject(PLATFORM_ID);

  readonly activeTrading = signal<UserTradingPackage[]>([]);
  readonly showPackagePromo = signal(false);

  isDarkMode = typeof window !== 'undefined'
    ? (localStorage.getItem('theme') ?? 'dark') === 'dark'
    : true;

  // Sidebar colapsado por defecto en móvil/tablet
  protected readonly sidebarCollapsed = signal(
    isPlatformBrowser(this.platformId) && window.innerWidth < 1024
  );
  protected readonly currencyMenuOpen = signal(false);
  protected readonly profileMenuOpen = signal(false);

  // Use shared service signal so settings page avatar updates reflect here immediately
  readonly profile = this.profileService.profile;
  readonly selectedCurrency = this.currencyService.selectedCurrency;
  readonly currencies = this.currencyService.currencies;

  // Stats para el sidebar
  dailyProgress = 65;
  dailyGoal = 10;
  dailyClicks = 7;

  // Notificaciones
  readonly notifications = signal<any[]>([]);
  readonly unreadCount = signal(0);
  readonly showNotifPanel = signal(false);

  // Toast de activación de cuenta
  readonly upgradeToast = signal(false);
  private initialRole: string | null = null;
  private roleWatchReady = false;

  @ViewChild('referralModal') referralModal!: UserReferralModalComponent;

  constructor() {
    // Detecta en tiempo real cuando el admin cambia el rol mientras el usuario está activo
    effect(() => {
      const role = this.profile()?.role ?? null;
      if (!this.roleWatchReady || role === null) return;
      if (role === this.initialRole) return;
      // El rol cambió → activar toast y redirigir
      this.onRoleUpgraded(role);
    });
  }

  ngOnInit(): void {
    if (isPlatformBrowser(this.platformId)) {
      // Aplicar tema guardado
      if (this.isDarkMode) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
      document.addEventListener('touchstart', this.handleTouchStart, { passive: true });
      document.addEventListener('touchend', this.handleTouchEnd, { passive: true });

      // Interceptar back button: si estamos en un módulo y el back intenta
      // salir a una ruta no-módulo, bloquear y quedarnos en el módulo.
      this.router.events.subscribe((e) => {
        if (e instanceof NavigationStart && e.navigationTrigger === 'popstate') {
          if (this.isModuleRoute()) {
            const moduleSegs = ['/cursos', '/trading-bot', '/trading-operation', '/ai',
              '/sms-masivos', '/automatic-whatsapp', '/punto-pago', '/dinamicas', '/xzoom-en-vivo',
              '/anda-gana'];
            const targetIsModule = moduleSegs.some(s => e.url.includes(s));
            if (!targetIsModule) {
              const stay = this.router.url;
              setTimeout(() => this.router.navigateByUrl(stay, { replaceUrl: true }));
            }
          }
        }
      });
    }
    this.loadProfile().then(() => {
      this.initialRole = this.profile()?.role ?? null;
      this.roleWatchReady = true;
      // Iniciar escucha Realtime solo en el browser
      const userId = this.profile()?.id;
      if (userId && isPlatformBrowser(this.platformId)) {
        this.profileService.startRealtimeProfileWatch(userId);
        // Sincronizar con DB en background sin bloquear la UI
        this.profileService.getCurrentProfile().catch(() => {});
        // Cargar paquetes de trading activos
        this.tradingPkgSvc.getMyActivePackages().then(pkgs => this.activeTrading.set(pkgs)).catch(() => {});
        // Mostrar promo solo si nunca compró paquete
        this.checkPackagePromo();
        // Cargar notificaciones
        this.loadNotifications();
      }
    });
  }

  ngOnDestroy(): void {
    this.profileService.stopRealtimeProfileWatch();
    if (isPlatformBrowser(this.platformId)) {
      document.removeEventListener('touchstart', this.handleTouchStart);
      document.removeEventListener('touchend', this.handleTouchEnd);
    }
  }

  private async loadProfile(): Promise<void> {
    try {
      // Si el perfil ya fue cargado (ej. desde el flujo de login), reutilizarlo
      // para evitar que un getUser() con timing incorrecto borre el balance.
      if (!this.profileService.profile()) {
        await this.profileService.getCurrentProfile();
      }
    } catch {
      // silencioso
    }
  }

  private onRoleUpgraded(newRole: string): void {
    this.upgradeToast.set(true);
    setTimeout(() => {
      this.upgradeToast.set(false);
      if (newRole === 'advertiser') {
        this.router.navigate(['/advertiser']);
      } else if (newRole === 'admin' || newRole === 'dev') {
        this.router.navigate(['/admin']);
      }
    }, 3500);
  }

  formatCOP(amount: number): string {
    return this.currencyService.formatFromCOP(amount, 0);
  }

  getDaysRemaining(): number {
    const expires = this.profile()?.package_expires_at;
    if (!expires) return 0;
    const diff = new Date(expires).getTime() - Date.now();
    return Math.max(0, Math.ceil(diff / 86400000));
  }

  toggleSidebarCollapse(): void {
    this.sidebarCollapsed.update((v) => !v);
  }

  private checkPackagePromo(): void {
    const p = this.profile();
    if (p && !p.has_active_package && !p.current_package_id) {
      this.showPackagePromo.set(true);
    }
  }

  dismissPackagePromo(): void {
    this.showPackagePromo.set(false);
  }

  goToPackages(): void {
    this.showPackagePromo.set(false);
    this.router.navigate(['/dashboard/packages']);
  }

  closeSidebarOnMobile(): void {
    if (isPlatformBrowser(this.platformId) && window.innerWidth < 1024) {
      this.sidebarCollapsed.set(true);
    }
  }

  private touchStartX = 0;

  private readonly handleTouchStart = (e: TouchEvent): void => {
    this.touchStartX = e.touches[0].clientX;
  };

  private readonly handleTouchEnd = (e: TouchEvent): void => {
    if (window.innerWidth >= 1024) return;
    const dx = e.changedTouches[0].clientX - this.touchStartX;
    if (dx > 60 && this.sidebarCollapsed()) this.sidebarCollapsed.set(false);
    if (dx < -60 && !this.sidebarCollapsed()) this.sidebarCollapsed.set(true);
  };

  toggleCurrencyMenu(): void {
    this.currencyMenuOpen.update((v) => !v);
  }

  toggleProfileMenu(): void {
    this.profileMenuOpen.update((v) => !v);
    if (this.profileMenuOpen()) this.currencyMenuOpen.set(false);
  }

  closeProfileMenu(): void {
    this.profileMenuOpen.set(false);
  }

  selectCurrency(currency: Currency): void {
    this.currencyService.selectCurrency(currency);
    this.currencyMenuOpen.set(false);
  }

  toggleCurrencyMenuAndClose(): void {
    this.profileMenuOpen.set(false);
    this.toggleCurrencyMenu();
  }

  toggleDarkMode(): void {
    this.isDarkMode = !this.isDarkMode;
    if (this.isDarkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }

  logout(): void {
    this.authService.logout().subscribe();
  }

  openReferralModal(): void {
    this.referralModal?.open();
  }

  isSettingsRoute(): boolean {
    return this.router.url.includes('/settings');
  }

  isTasksRoute(): boolean {
    return this.router.url.includes('/dashboard/ads');
  }

  isAndaGanaRoute(): boolean {
    return this.router.url.includes('/anda-gana');
  }

  isSmsRoute(): boolean {
    return this.router.url.includes('/sms-masivos');
  }

  isAutoWhatsappRoute(): boolean {
    return this.router.url.includes('/automatic-whatsapp');
  }

  isModuleRoute(): boolean {
    const u = this.router.url;
    return u.includes('/cursos') || u.includes('/trading-bot') || u.includes('/trading-operation') ||
      u.includes('/ai') || u.includes('/sms-masivos') || u.includes('/automatic-whatsapp') ||
      u.includes('/punto-pago') || u.includes('/dinamicas') || u.includes('/xzoom-en-vivo') ||
      u.includes('/anda-gana');
  }

  hideWalletAndCurrency(): boolean {
    return this.isAndaGanaRoute() || this.isSmsRoute() || this.isAutoWhatsappRoute();
  }

  // ── Notificaciones ──────────────────────────────────────────

  toggleNotifPanel(): void {
    this.showNotifPanel.update(v => !v);
    if (this.showNotifPanel()) {
      this.profileMenuOpen.set(false);
      this.currencyMenuOpen.set(false);
    }
  }

  async loadNotifications(): Promise<void> {
    try {
      const { getSupabaseClient } = await import('../../../../core/supabase.client');
      const supabase = getSupabaseClient();
      const userId = this.profile()?.id;
      if (!userId) return;

      const { data } = await supabase
        .from('user_notifications')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(20);

      this.notifications.set(data ?? []);
      this.unreadCount.set((data ?? []).filter((n: any) => !n.is_read).length);
    } catch {}
  }

  async markAsRead(notifId: string): Promise<void> {
    try {
      const { getSupabaseClient } = await import('../../../../core/supabase.client');
      await getSupabaseClient()
        .from('user_notifications')
        .update({ is_read: true })
        .eq('id', notifId);
      this.notifications.update(list =>
        list.map(n => n.id === notifId ? { ...n, is_read: true } : n)
      );
      this.unreadCount.update(c => Math.max(0, c - 1));
    } catch {}
  }

  async markAllRead(): Promise<void> {
    try {
      const userId = this.profile()?.id;
      if (!userId) return;
      const { getSupabaseClient } = await import('../../../../core/supabase.client');
      await getSupabaseClient()
        .from('user_notifications')
        .update({ is_read: true })
        .eq('user_id', userId)
        .eq('is_read', false);
      this.notifications.update(list => list.map(n => ({ ...n, is_read: true })));
      this.unreadCount.set(0);
    } catch {}
  }

  getNotifIcon(type: string): string {
    return type === 'warning' ? 'warning' : type === 'success' ? 'check_circle' : 'info';
  }

  getNotifColor(type: string): string {
    return type === 'warning' ? 'text-amber-400' : type === 'success' ? 'text-emerald-400' : 'text-blue-400';
  }

  // ══════════════════════════════════════════════════════════════
  // MODAL ACUMULADO RETIRO (global — se abre desde cualquier vista)
  // ══════════════════════════════════════════════════════════════

  readonly showRetiroModal = signal(false);
  readonly retiroModalStep = signal<'info' | 'select-method' | 'fields' | 'withdraw'>('info');
  readonly retiroSavedMethods = signal<LayoutSavedMethod[]>([]);
  readonly retiroHasAffiliate = signal(false);
  readonly retiroSelectedMethod = signal<LayoutPaymentMethod | null>(null);
  readonly retiroFieldValues = signal<Record<string, string>>({});
  readonly retiroSaving = signal(false);
  readonly retiroError = signal<string | null>(null);
  readonly retiroWithdrawAmount = signal(0);
  readonly retiroWithdrawMethod = signal<string | null>(null);
  readonly retiroWithdrawAccount = signal('');
  readonly retiroWithdrawStep = signal<'form' | 'confirm' | 'processing' | 'done'>('form');
  readonly retiroSuccessMsg = signal<string | null>(null);

  readonly MIN_WITHDRAWAL = 100_000;

  readonly retiroHasEnoughBalance = computed(() => (this.profile()?.real_balance ?? 0) >= this.MIN_WITHDRAWAL);
  readonly retiroHasSavedMethod = computed(() => this.retiroSavedMethods().length > 0);

  readonly retiroAvailableMethods = computed(() => {
    const cc = this.profile()?.country_code ?? '+57';
    return LAYOUT_PAYMENT_METHODS.filter(m => m.countries.length === 0 || m.countries.includes(cc));
  });

  readonly retiroCanSaveFields = computed(() => {
    const def = this.retiroSelectedMethod();
    const vals = this.retiroFieldValues();
    if (!def) return false;
    return def.fields.every(f => (vals[f.key] ?? '').trim().length >= 3);
  });

  async openRetiroModal(): Promise<void> {
    this.retiroError.set(null);
    this.retiroSuccessMsg.set(null);
    this.showRetiroModal.set(true);

    // Cargar datos
    const supabase = getSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const [methodsRes, affiliateRes] = await Promise.all([
      supabase.from('user_payment_methods').select('id, method_id, label, data').eq('user_id', user.id),
      supabase.from('profiles').select('id').eq('referred_by', user.id).eq('role', 'advertiser').limit(1),
    ]);

    this.retiroSavedMethods.set((methodsRes.data ?? []).map(m => ({
      id: m.id, methodId: m.method_id, label: m.label, data: m.data as Record<string, string>,
    })));
    this.retiroHasAffiliate.set((affiliateRes.data?.length ?? 0) > 0);

    // Decidir step inicial
    if (this.retiroHasSavedMethod() && this.retiroHasEnoughBalance() && this.retiroHasAffiliate()) {
      this.retiroModalStep.set('withdraw');
      this.retiroWithdrawStep.set('form');
      this.retiroWithdrawAmount.set(this.profile()?.real_balance ?? 0);
      const saved = this.retiroSavedMethods()[0];
      this.retiroWithdrawMethod.set(saved.methodId);
      this.retiroWithdrawAccount.set(saved.data['primary_value'] || Object.values(saved.data)[0] || '');
    } else {
      this.retiroModalStep.set('info');
    }
  }

  closeRetiroModal(): void {
    this.showRetiroModal.set(false);
  }

  retiroGoToSelectMethod(): void {
    this.retiroModalStep.set('select-method');
  }

  retiroSelectMethodDef(method: LayoutPaymentMethod): void {
    this.retiroSelectedMethod.set(method);
    const vals: Record<string, string> = {};
    method.fields.forEach(f => vals[f.key] = '');
    this.retiroFieldValues.set(vals);
    this.retiroModalStep.set('fields');
  }

  retiroUpdateField(key: string, value: string): void {
    this.retiroFieldValues.update(v => ({ ...v, [key]: value }));
  }

  async retiroSaveMethod(): Promise<void> {
    const def = this.retiroSelectedMethod();
    if (!def || !this.retiroCanSaveFields()) return;

    this.retiroSaving.set(true);
    this.retiroError.set(null);

    try {
      const supabase = getSupabaseClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('No autenticado');

      const vals = this.retiroFieldValues();
      const primaryValue = Object.values(vals)[0] ?? '';

      const { error } = await supabase.from('user_payment_methods').insert({
        user_id: user.id,
        method_id: def.id,
        label: def.name,
        icon: def.icon,
        category: def.category,
        data: { ...vals, primary_value: primaryValue },
        is_default: true,
      });

      if (error) throw error;

      // Recargar métodos
      const { data } = await supabase.from('user_payment_methods').select('id, method_id, label, data').eq('user_id', user.id);
      this.retiroSavedMethods.set((data ?? []).map(m => ({
        id: m.id, methodId: m.method_id, label: m.label, data: m.data as Record<string, string>,
      })));

      this.retiroSuccessMsg.set(`${def.name} guardado correctamente`);

      // Si tiene saldo suficiente, ir a retirar
      if (this.retiroHasEnoughBalance() && this.retiroHasAffiliate()) {
        this.retiroModalStep.set('withdraw');
        this.retiroWithdrawStep.set('form');
        this.retiroWithdrawAmount.set(this.profile()?.real_balance ?? 0);
        const saved = this.retiroSavedMethods()[0];
        this.retiroWithdrawMethod.set(saved.methodId);
        this.retiroWithdrawAccount.set(saved.data['primary_value'] || Object.values(saved.data)[0] || '');
      } else {
        this.retiroModalStep.set('info');
      }
    } catch (e: any) {
      this.retiroError.set(e.message || 'Error al guardar');
    } finally {
      this.retiroSaving.set(false);
    }
  }

  async retiroSubmitWithdrawal(): Promise<void> {
    this.retiroWithdrawStep.set('processing');
    try {
      const supabase = getSupabaseClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('No autenticado');

      const saved = this.retiroSavedMethods()[0];
      const { error } = await supabase.from('withdrawal_requests').insert({
        user_id: user.id,
        amount: this.retiroWithdrawAmount(),
        method: saved.methodId,
        details: { method: saved.label, account: saved.data['primary_value'] || Object.values(saved.data)[0], ...saved.data },
        status: 'pending',
      });

      if (error) throw error;
      await new Promise(r => setTimeout(r, 2500));
      this.retiroWithdrawStep.set('done');
      this.profileService.getCurrentProfile().catch(() => {});
    } catch (e: any) {
      this.retiroError.set(e.message || 'Error al procesar');
      this.retiroWithdrawStep.set('form');
    }
  }

  retiroFinish(): void {
    this.showRetiroModal.set(false);
    this.retiroSuccessMsg.set(null);
  }

  getTierInfo(referrals: number, hasActivePackage: boolean): { name: string; color: string } | null {
    if (!hasActivePackage) return null;
    if (referrals >= 40) return { name: 'DIAMANTE CORONA', color: 'text-amber-400' };
    if (referrals >= 36) return { name: 'DIAMANTE NEGRO', color: 'text-gray-300' };
    if (referrals >= 31) return { name: 'DIAMANTE AZUL', color: 'text-blue-400' };
    if (referrals >= 26) return { name: 'DIAMANTE', color: 'text-cyan-400' };
    if (referrals >= 20) return { name: 'ESMERALDA', color: 'text-green-500' };
    if (referrals >= 10) return { name: 'RUBY', color: 'text-red-400' };
    if (referrals >= 6)  return { name: 'ZAFIRO', color: 'text-blue-300' };
    if (referrals >= 3)  return { name: 'PERLA', color: 'text-pink-400' };
    return { name: 'JADE', color: 'text-emerald-400' };
  }
}
