import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  inject,
  signal,
  computed,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ProfileService } from '../../../../core/services/profile.service';
import { CurrencyService } from '../../../../core/services/currency.service';
import { getSupabaseClient } from '../../../../core/supabase.client';
import type { WithdrawalStatus } from '../../../../core/models/admin.model';

interface WithdrawalRecord {
  id: string;
  amount: number;
  status: WithdrawalStatus;
  created_at: string;
  details: { method?: string; account?: string } | null;
}

interface PaymentMethodDef {
  id: string;
  name: string;
  icon: string;
  category: string;
  countries: string[]; // country codes where this method is available, empty = all
  fields: PaymentField[];
}

interface PaymentField {
  key: string;
  label: string;
  placeholder: string;
  type: 'text' | 'email' | 'tel';
}

interface SavedPaymentMethod {
  id: string;
  methodId: string;
  label: string;
  icon: string;
  category: string;
  data: Record<string, string>;
  isDefault: boolean;
  createdAt: string;
}

// Tipo para el método de retiro seleccionado con placeholder derivado
interface SelectedMethodWithPlaceholder extends PaymentMethodDef {
  placeholder: string;
}

type WithdrawStep = 'select-method' | 'amount' | 'form' | 'confirm' | 'processing' | 'done';
type MethodModalStep = 'method' | 'fields';

// Map country_code to a readable category label
const COUNTRY_CATEGORIES: Record<string, { id: string; name: string; flag: string }> = {
  '+57': { id: 'colombia', name: 'Colombia', flag: '🇨🇴' },
  '+58': { id: 'venezuela', name: 'Venezuela', flag: '🇻🇪' },
  '+52': { id: 'mexico', name: 'Mexico', flag: '🇲🇽' },
  '+54': { id: 'argentina', name: 'Argentina', flag: '🇦🇷' },
  '+55': { id: 'brasil', name: 'Brasil', flag: '🇧🇷' },
  '+51': { id: 'peru', name: 'Peru', flag: '🇵🇪' },
  '+56': { id: 'chile', name: 'Chile', flag: '🇨🇱' },
  '+593': { id: 'ecuador', name: 'Ecuador', flag: '🇪🇨' },
  '+591': { id: 'bolivia', name: 'Bolivia', flag: '🇧🇴' },
  '+595': { id: 'paraguay', name: 'Paraguay', flag: '🇵🇾' },
  '+598': { id: 'uruguay', name: 'Uruguay', flag: '🇺🇾' },
  '+507': { id: 'panama', name: 'Panama', flag: '🇵🇦' },
  '+506': { id: 'costa_rica', name: 'Costa Rica', flag: '🇨🇷' },
  '+502': { id: 'guatemala', name: 'Guatemala', flag: '🇬🇹' },
  '+503': { id: 'el_salvador', name: 'El Salvador', flag: '🇸🇻' },
  '+504': { id: 'honduras', name: 'Honduras', flag: '🇭🇳' },
  '+505': { id: 'nicaragua', name: 'Nicaragua', flag: '🇳🇮' },
  '+509': { id: 'haiti', name: 'Haiti', flag: '🇭🇹' },
  '+1': { id: 'usa', name: 'Estados Unidos', flag: '🇺🇸' },
};

// All available payment methods with country restrictions
const ALL_PAYMENT_METHODS: PaymentMethodDef[] = [
  // ── Colombia ──
  { id: 'nequi', name: 'Nequi', icon: 'smartphone', category: 'colombia', countries: ['+57'], fields: [
    { key: 'phone', label: 'Numero Nequi', placeholder: 'Ej: 3001234567', type: 'tel' },
  ]},
  { id: 'daviplata', name: 'Daviplata', icon: 'phone_android', category: 'colombia', countries: ['+57'], fields: [
    { key: 'phone', label: 'Numero Daviplata', placeholder: 'Ej: 3001234567', type: 'tel' },
  ]},
  { id: 'bancolombia', name: 'Bancolombia', icon: 'account_balance', category: 'colombia', countries: ['+57'], fields: [
    { key: 'account', label: 'Numero de cuenta', placeholder: 'Cuenta de ahorros o corriente', type: 'text' },
    { key: 'holder', label: 'Titular de la cuenta', placeholder: 'Nombre completo', type: 'text' },
  ]},
  { id: 'transfiya', name: 'Transfiya', icon: 'swap_horiz', category: 'colombia', countries: ['+57'], fields: [
    { key: 'phone', label: 'Numero celular', placeholder: 'Ej: 3001234567', type: 'tel' },
  ]},

  // ── Venezuela ──
  { id: 'pago_movil', name: 'Pago Movil', icon: 'smartphone', category: 'venezuela', countries: ['+58'], fields: [
    { key: 'phone', label: 'Numero de telefono', placeholder: 'Ej: 04121234567', type: 'tel' },
    { key: 'cedula', label: 'Cedula (V/E + numero)', placeholder: 'Ej: V12345678', type: 'text' },
    { key: 'bank', label: 'Banco', placeholder: 'Ej: Banesco, Mercantil...', type: 'text' },
  ]},
  { id: 'binance_ve', name: 'Binance P2P (Bs)', icon: 'currency_exchange', category: 'venezuela', countries: ['+58'], fields: [
    { key: 'email', label: 'Email Binance', placeholder: 'tu@email.com', type: 'email' },
  ]},
  { id: 'zelle_ve', name: 'Zelle', icon: 'bolt', category: 'venezuela', countries: ['+58'], fields: [
    { key: 'email', label: 'Email o telefono Zelle', placeholder: 'Email o numero registrado', type: 'text' },
  ]},

  // ── Mexico ──
  { id: 'oxxo', name: 'OXXO / SPEI', icon: 'store', category: 'mexico', countries: ['+52'], fields: [
    { key: 'clabe', label: 'CLABE interbancaria', placeholder: '18 digitos', type: 'text' },
    { key: 'holder', label: 'Titular de la cuenta', placeholder: 'Nombre completo', type: 'text' },
  ]},
  { id: 'mercadopago_mx', name: 'Mercado Pago', icon: 'account_balance_wallet', category: 'mexico', countries: ['+52'], fields: [
    { key: 'email', label: 'Email Mercado Pago', placeholder: 'tu@email.com', type: 'email' },
  ]},

  // ── Argentina ──
  { id: 'mercadopago_ar', name: 'Mercado Pago', icon: 'account_balance_wallet', category: 'argentina', countries: ['+54'], fields: [
    { key: 'cvu', label: 'CVU / Alias', placeholder: 'CVU o alias de Mercado Pago', type: 'text' },
  ]},
  { id: 'transferencia_ar', name: 'Transferencia bancaria', icon: 'account_balance', category: 'argentina', countries: ['+54'], fields: [
    { key: 'cbu', label: 'CBU / CVU', placeholder: '22 digitos', type: 'text' },
    { key: 'holder', label: 'Titular', placeholder: 'Nombre completo', type: 'text' },
  ]},

  // ── Peru ──
  { id: 'yape', name: 'Yape', icon: 'smartphone', category: 'peru', countries: ['+51'], fields: [
    { key: 'phone', label: 'Numero Yape', placeholder: 'Ej: 999888777', type: 'tel' },
  ]},
  { id: 'plin', name: 'Plin', icon: 'phone_android', category: 'peru', countries: ['+51'], fields: [
    { key: 'phone', label: 'Numero Plin', placeholder: 'Ej: 999888777', type: 'tel' },
  ]},

  // ── Chile ──
  { id: 'transferencia_cl', name: 'Transferencia bancaria', icon: 'account_balance', category: 'chile', countries: ['+56'], fields: [
    { key: 'rut', label: 'RUT', placeholder: 'Ej: 12.345.678-9', type: 'text' },
    { key: 'account', label: 'Numero de cuenta', placeholder: 'Cuenta corriente o vista', type: 'text' },
    { key: 'bank', label: 'Banco', placeholder: 'Ej: BancoEstado, Santander...', type: 'text' },
  ]},

  // ── Ecuador ──
  { id: 'transferencia_ec', name: 'Transferencia bancaria', icon: 'account_balance', category: 'ecuador', countries: ['+593'], fields: [
    { key: 'account', label: 'Numero de cuenta', placeholder: 'Cuenta de ahorros o corriente', type: 'text' },
    { key: 'bank', label: 'Banco', placeholder: 'Ej: Pichincha, Guayaquil...', type: 'text' },
    { key: 'holder', label: 'Titular', placeholder: 'Nombre completo', type: 'text' },
  ]},

  // ── Global (available to everyone) ──
  { id: 'paypal', name: 'PayPal', icon: 'account_balance_wallet', category: 'global', countries: [], fields: [
    { key: 'email', label: 'Email PayPal', placeholder: 'tu@email.com', type: 'email' },
  ]},
  { id: 'wise', name: 'Wise (TransferWise)', icon: 'currency_exchange', category: 'global', countries: [], fields: [
    { key: 'email', label: 'Email Wise', placeholder: 'tu@email.com', type: 'email' },
    { key: 'currency', label: 'Moneda preferida', placeholder: 'Ej: USD, EUR, GBP', type: 'text' },
  ]},
  { id: 'skrill', name: 'Skrill', icon: 'payment', category: 'global', countries: [], fields: [
    { key: 'email', label: 'Email Skrill', placeholder: 'tu@email.com', type: 'email' },
  ]},
  { id: 'zelle', name: 'Zelle', icon: 'bolt', category: 'global', countries: [], fields: [
    { key: 'email', label: 'Email o telefono Zelle', placeholder: 'Email o numero registrado', type: 'text' },
  ]},
  { id: 'airtm', name: 'AirTM', icon: 'language', category: 'global', countries: [], fields: [
    { key: 'email', label: 'Email AirTM', placeholder: 'tu@email.com', type: 'email' },
  ]},
  { id: 'bank_international', name: 'Transferencia bancaria internacional', icon: 'assured_workload', category: 'global', countries: [], fields: [
    { key: 'bank', label: 'Nombre del banco', placeholder: 'Ej: Bank of America', type: 'text' },
    { key: 'account', label: 'Numero de cuenta / IBAN', placeholder: 'IBAN o numero de cuenta', type: 'text' },
    { key: 'swift', label: 'Codigo SWIFT/BIC', placeholder: 'Ej: BOFAUS3N', type: 'text' },
    { key: 'holder', label: 'Titular de la cuenta', placeholder: 'Nombre completo', type: 'text' },
    { key: 'country', label: 'Pais del banco', placeholder: 'Ej: Estados Unidos', type: 'text' },
  ]},

  // ── Crypto (available to everyone) ──
  { id: 'binance', name: 'Binance Pay', icon: 'currency_exchange', category: 'crypto', countries: [], fields: [
    { key: 'binance_id', label: 'Binance Pay ID / Email', placeholder: 'ID de pago o email Binance', type: 'text' },
  ]},
  { id: 'usdt_trc20', name: 'USDT (TRC-20)', icon: 'token', category: 'crypto', countries: [], fields: [
    { key: 'wallet', label: 'Direccion wallet TRC-20', placeholder: 'T...', type: 'text' },
  ]},
  { id: 'usdt_erc20', name: 'USDT (ERC-20)', icon: 'token', category: 'crypto', countries: [], fields: [
    { key: 'wallet', label: 'Direccion wallet ERC-20', placeholder: '0x...', type: 'text' },
  ]},
  { id: 'bitcoin', name: 'Bitcoin (BTC)', icon: 'currency_bitcoin', category: 'crypto', countries: [], fields: [
    { key: 'wallet', label: 'Direccion Bitcoin', placeholder: 'bc1... o 1... o 3...', type: 'text' },
  ]},
];

@Component({
  selector: 'app-user-wallet',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, RouterModule, FormsModule],
  templateUrl: './wallet.component.html',
})
export class UserWalletComponent implements OnInit {
  private readonly profileService = inject(ProfileService);
  readonly currencyService = inject(CurrencyService);
  private readonly supabase = getSupabaseClient();

  readonly profile = this.profileService.profile;
  readonly withdrawals = signal<WithdrawalRecord[]>([]);
  readonly loading = signal(true);
  readonly hasActiveAffiliate = signal(false);

  readonly MIN_WITHDRAWAL = 80_000;

  // ── Country-based method sections ──
  readonly userCountryCode = computed(() => this.profile()?.country_code ?? '+57');
  readonly userCountryName = computed(() => this.profile()?.country ?? 'Colombia');

  readonly userCountryCategory = computed(() => {
    const cc = this.userCountryCode();
    return COUNTRY_CATEGORIES[cc] ?? { id: 'other', name: this.userCountryName(), flag: '🌍' };
  });

  readonly methodSections = computed(() => {
    const cc = this.userCountryCode();
    const countryInfo = this.userCountryCategory();

    // Local methods for user's country
    const localMethods = ALL_PAYMENT_METHODS.filter(
      m => m.countries.length > 0 && m.countries.includes(cc)
    );

    // Global methods (countries = [])
    const globalMethods = ALL_PAYMENT_METHODS.filter(
      m => m.countries.length === 0 && m.category === 'global'
    );
    const cryptoMethods = ALL_PAYMENT_METHODS.filter(
      m => m.countries.length === 0 && m.category === 'crypto'
    );

    const sections: { id: string; name: string; icon: string; flag?: string; methods: PaymentMethodDef[] }[] = [];

    if (localMethods.length > 0) {
      sections.push({
        id: countryInfo.id,
        name: countryInfo.name,
        icon: 'flag',
        flag: countryInfo.flag,
        methods: localMethods,
      });
    }

    sections.push({
      id: 'global',
      name: 'Internacional',
      icon: 'public',
      methods: globalMethods,
    });

    sections.push({
      id: 'crypto',
      name: 'Criptomonedas',
      icon: 'currency_bitcoin',
      methods: cryptoMethods,
    });

    return sections;
  });

  // ── Saved payment methods (Supabase) ──
  readonly savedMethods = signal<SavedPaymentMethod[]>([]);
  readonly savingMethod = signal(false);

  // ── Add method modal state ──
  readonly showMethodModal = signal(false);
  readonly methodModalStep = signal<MethodModalStep>('method');
  readonly selectedMethodDef = signal<PaymentMethodDef | null>(null);
  readonly methodFieldValues = signal<Record<string, string>>({});
  readonly methodSaveError = signal<string | null>(null);

  readonly canSaveMethod = computed(() => {
    const def = this.selectedMethodDef();
    const vals = this.methodFieldValues();
    if (!def) return false;
    return def.fields.every(f => (vals[f.key] ?? '').trim().length >= 3);
  });

  // ── Withdrawal modal state ──
  readonly showWithdrawModal = signal(false);
  readonly withdrawStep = signal<WithdrawStep>('select-method');
  readonly withdrawAmount = signal(0);
  readonly selectedSavedMethod = signal<SavedPaymentMethod | null>(null);
  readonly withdrawError = signal<string | null>(null);
  readonly successMsg = signal<string | null>(null);

  // ── Nuevo sistema de retiro: métodos disponibles por país ──
  readonly withdrawMethods = computed(() => {
    const sections = this.methodSections();
    const allMethods: PaymentMethodDef[] = [];
    sections.forEach(section => {
      allMethods.push(...section.methods);
    });
    return allMethods;
  });
  
  readonly withdrawMethod = signal<string | null>(null);
  readonly withdrawAccount = signal('');
  
  readonly selectedMethodData = computed((): SelectedMethodWithPlaceholder | null => {
    const methodId = this.withdrawMethod();
    if (!methodId) return null;
    const method = this.withdrawMethods().find(m => m.id === methodId) ?? null;
    if (!method) return null;
    
    // Derivar placeholder del primer field
    const firstField = method.fields[0];
    return {
      ...method,
      placeholder: firstField?.placeholder ?? 'Numero de cuenta'
    };
  });

  readonly canSubmitWithdraw = computed(() => {
    const amount = this.withdrawAmount();
    const balance = this.profile()?.real_balance ?? 0;
    const method = this.withdrawMethod();
    const account = this.withdrawAccount();
    return (
      !!method &&
      account.trim().length >= 3 &&
      amount >= this.MIN_WITHDRAWAL &&
      amount <= balance
    );
  });

  get canWithdraw(): boolean {
    return (
      (this.profile()?.real_balance ?? 0) >= this.MIN_WITHDRAWAL &&
      this.hasActiveAffiliate() &&
      this.savedMethods().length > 0
    );
  }

  get hasEnoughBalance(): boolean {
    return (this.profile()?.real_balance ?? 0) >= this.MIN_WITHDRAWAL;
  }

  get hasSavedMethod(): boolean {
    return this.savedMethods().length > 0;
  }

  async ngOnInit(): Promise<void> {
    await this.profileService.getCurrentProfile().catch(() => {});
    await Promise.all([this.loadSavedMethods(), this.loadWithdrawals(), this.checkActiveAffiliate()]);
    this.loading.set(false);
  }

  private async loadSavedMethods(): Promise<void> {
    const { data: { user } } = await this.supabase.auth.getUser();
    if (!user) return;

    const { data } = await this.supabase
      .from('user_payment_methods')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (data) {
      this.savedMethods.set(data.map(m => ({
        id: m.id,
        methodId: m.method_id,
        label: m.label,
        icon: m.icon,
        category: m.category,
        data: m.data as Record<string, string>,
        isDefault: m.is_default,
        createdAt: m.created_at,
      })));
    }
  }

  private async loadWithdrawals(): Promise<void> {
    const { data: { user } } = await this.supabase.auth.getUser();
    if (!user) return;

    const { data } = await this.supabase
      .from('withdrawal_requests')
      .select('id, amount, status, created_at, details')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(10);

    if (data) this.withdrawals.set(data as WithdrawalRecord[]);
  }

  private async checkActiveAffiliate(): Promise<void> {
    const { data: { user } } = await this.supabase.auth.getUser();
    if (!user) return;

    const { data } = await this.supabase
      .from('profiles')
      .select('id')
      .eq('referred_by', user.id)
      .eq('role', 'advertiser')
      .limit(1);

    this.hasActiveAffiliate.set((data?.length ?? 0) > 0);
  }

  formatCOP(amount: number): string {
    return this.currencyService.formatFromCOP(amount, 0);
  }

  getStatusStyle(status: WithdrawalStatus): string {
    switch (status) {
      case 'completed':
        return 'text-emerald-400 bg-emerald-500/10 border border-emerald-500/20';
      case 'approved':
        return 'text-blue-400 bg-blue-500/10 border border-blue-500/20';
      case 'pending':
        return 'text-amber-400 bg-amber-500/10 border border-amber-500/20';
      case 'rejected':
        return 'text-rose-400 bg-rose-500/10 border border-rose-500/20';
      default:
        return 'text-slate-400 bg-slate-500/10 border border-slate-500/20';
    }
  }

  getStatusLabel(status: WithdrawalStatus): string {
    const labels: Record<WithdrawalStatus, string> = {
      completed: 'Completado',
      approved: 'Aprobado',
      pending: 'Pendiente',
      rejected: 'Rechazado',
    };
    return labels[status] ?? status;
  }

  getStatusIcon(status: WithdrawalStatus): string {
    const icons: Record<WithdrawalStatus, string> = {
      completed: 'check_circle',
      approved: 'verified',
      pending: 'hourglass_empty',
      rejected: 'cancel',
    };
    return icons[status] ?? 'info';
  }

  formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString('es-CO', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  }

  getCategoryIcon(cat: string): string {
    if (cat === 'global') return 'public';
    if (cat === 'crypto') return 'currency_bitcoin';
    return 'flag';
  }

  getCategoryName(cat: string): string {
    if (cat === 'global') return 'Internacional';
    if (cat === 'crypto') return 'Criptomonedas';
    // Find country category
    for (const info of Object.values(COUNTRY_CATEGORIES)) {
      if (info.id === cat) return info.name;
    }
    return cat;
  }

  getMethodSummary(m: SavedPaymentMethod): string {
    const vals = Object.values(m.data).filter(v => v && v !== m.data['primary_value']);
    return m.data['primary_value'] || vals[0] || '';
  }

  // ── Add payment method modal ──

  openMethodModal(): void {
    this.methodModalStep.set('method');
    this.selectedMethodDef.set(null);
    this.methodFieldValues.set({});
    this.methodSaveError.set(null);
    this.showMethodModal.set(true);
  }

  closeMethodModal(): void {
    this.showMethodModal.set(false);
  }

  selectMethodDef(def: PaymentMethodDef): void {
    this.selectedMethodDef.set(def);
    const vals: Record<string, string> = {};
    def.fields.forEach(f => vals[f.key] = '');
    this.methodFieldValues.set(vals);
    this.methodModalStep.set('fields');
  }

  updateFieldValue(key: string, value: string): void {
    this.methodFieldValues.update(v => ({ ...v, [key]: value }));
  }

  goBackMethodModal(): void {
    const step = this.methodModalStep();
    if (step === 'fields') this.methodModalStep.set('method');
    else this.closeMethodModal();
  }

  async savePaymentMethod(): Promise<void> {
    const def = this.selectedMethodDef();
    const vals = this.methodFieldValues();
    if (!def || !this.canSaveMethod()) return;

    // Check duplicates locally
    const primaryVal = Object.values(vals)[0] ?? '';
    const exists = this.savedMethods().some(
      m => m.methodId === def.id && this.getMethodSummary(m) === primaryVal
    );
    if (exists) {
      this.methodSaveError.set('Este metodo de pago ya esta registrado');
      return;
    }

    this.savingMethod.set(true);
    this.methodSaveError.set(null);

    try {
      const { data: { user } } = await this.supabase.auth.getUser();
      if (!user) throw new Error('No autenticado');

      const { error } = await this.supabase.from('user_payment_methods').insert({
        user_id: user.id,
        method_id: def.id,
        label: def.name,
        icon: def.icon,
        category: def.category,
        data: { ...vals, primary_value: primaryVal },
        is_default: this.savedMethods().length === 0,
      });

      if (error) {
        if (error.code === '23505') {
          this.methodSaveError.set('Este metodo de pago ya esta registrado');
        } else {
          throw error;
        }
        return;
      }

      await this.loadSavedMethods();
      this.closeMethodModal();
      this.successMsg.set(`${def.name} agregado correctamente`);
      setTimeout(() => this.successMsg.set(null), 3000);
    } catch (err: any) {
      this.methodSaveError.set(err.message || 'Error al guardar el metodo de pago');
    } finally {
      this.savingMethod.set(false);
    }
  }

  async deletePaymentMethod(id: string): Promise<void> {
    const { error } = await this.supabase
      .from('user_payment_methods')
      .delete()
      .eq('id', id);

    if (!error) {
      this.savedMethods.update(list => list.filter(m => m.id !== id));
    }
  }

  // ── Withdrawal modal ──

  openWithdrawModal(): void {
    this.withdrawStep.set('select-method');
    this.withdrawAmount.set(this.profile()?.real_balance ?? 0);
    this.selectedSavedMethod.set(null);
    this.withdrawError.set(null);
    this.showWithdrawModal.set(true);
  }

  closeWithdrawModal(): void {
    this.showWithdrawModal.set(false);
  }

  selectWithdrawMethod(m: SavedPaymentMethod): void {
    this.selectedSavedMethod.set(m);
    this.withdrawStep.set('amount');
  }

  goToConfirm(): void {
    if (!this.canSubmitWithdraw()) return;
    this.withdrawStep.set('confirm');
  }

  async submitWithdrawal(): Promise<void> {
    this.withdrawStep.set('processing');
    this.withdrawError.set(null);

    try {
      const { data: { user } } = await this.supabase.auth.getUser();
      if (!user) throw new Error('No autenticado');

      const method = this.selectedSavedMethod()!;
      const { error } = await this.supabase.from('withdrawal_requests').insert({
        user_id: user.id,
        amount: this.withdrawAmount(),
        method: method.methodId,
        details: {
          method: method.label,
          account: this.getMethodSummary(method),
          category: method.category,
          ...method.data,
        },
        status: 'pending',
      });

      if (error) throw error;

      await new Promise(resolve => setTimeout(resolve, 3000));

      this.withdrawStep.set('done');
      await this.loadWithdrawals();
      this.profileService.getCurrentProfile().catch(() => {});
    } catch (err: any) {
      this.withdrawError.set(err.message || 'Error al procesar el retiro');
      this.withdrawStep.set('select-method');
    }
  }

  finishWithdrawal(): void {
    this.showWithdrawModal.set(false);
    this.successMsg.set('Solicitud de retiro enviada correctamente');
    setTimeout(() => this.successMsg.set(null), 4000);
  }
}
