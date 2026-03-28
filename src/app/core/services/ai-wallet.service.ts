import { Injectable, signal, computed } from '@angular/core';
import { getSupabaseClient } from '../supabase.client';

export interface AiWallet {
  id: string;
  user_id: string;
  balance: number;
  total_recharged: number;
  total_consumed: number;
  created_at: string;
  updated_at: string;
}

export interface AiWalletTransaction {
  id: string;
  wallet_id: string;
  user_id: string;
  type: 'recharge' | 'consumption' | 'refund' | 'bonus';
  amount: number;
  balance_after: number;
  description: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface AiWalletPayment {
  id: string;
  user_id: string;
  amount: number;
  status: 'pending' | 'approved' | 'failed';
  invoice: string | null;
  epayco_ref: string | null;
  created_at: string;
  approved_at: string | null;
}

/** Montos de recarga en USD con equivalente en COP (tasa 1 USD = 3,700 COP) */
export const USD_TO_COP = 3_700;
export const RECHARGE_OPTIONS = [
  { usd: 25,   cop: 25 * 3_700 },
  { usd: 100,  cop: 100 * 3_700 },
  { usd: 200,  cop: 200 * 3_700 },
  { usd: 500,  cop: 500 * 3_700 },
  { usd: 1000, cop: 1000 * 3_700 },
];

@Injectable({ providedIn: 'root' })
export class AiWalletService {
  private readonly supabase = getSupabaseClient();

  readonly wallet = signal<AiWallet | null>(null);
  readonly transactions = signal<AiWalletTransaction[]>([]);
  readonly payments = signal<AiWalletPayment[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  readonly balance = computed(() => this.wallet()?.balance ?? 0);

  async loadWallet(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const { data: { user } } = await this.supabase.auth.getUser();
      if (!user) throw new Error('No autenticado');

      try { await this.supabase.rpc('ai_ensure_wallet', { p_user_id: user.id }); } catch { /* ignore */ }

      const { data, error } = await this.supabase
        .from('ai_wallets')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) throw error;
      this.wallet.set(data as AiWallet);
    } catch (e: unknown) {
      this.error.set(e instanceof Error ? e.message : 'Error al cargar billetera');
    } finally {
      this.loading.set(false);
    }
  }

  async loadTransactions(limit = 20): Promise<void> {
    try {
      const { data: { user } } = await this.supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await this.supabase
        .from('ai_wallet_transactions')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) throw error;
      this.transactions.set((data ?? []) as AiWalletTransaction[]);
    } catch { /* silencioso */ }
  }

  async loadPayments(limit = 10): Promise<void> {
    try {
      const { data: { user } } = await this.supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await this.supabase
        .from('ai_wallet_payments')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) throw error;
      this.payments.set((data ?? []) as AiWalletPayment[]);
    } catch { /* silencioso */ }
  }

  /**
   * Crear pago con ePayco — MISMO patrón que AdminPackageService.createEpaycoPayment()
   */
  async createEpaycoRecharge(amount: number): Promise<{
    publicKey: string;
    test: boolean;
    name: string;
    description: string;
    invoice: string;
    currency: string;
    amount: string;
    tax_base: string;
    tax: string;
    country: string;
    lang: string;
    email_billing: string;
    name_billing: string;
    extra1: string;
    extra2: string;
    extra3: string;
    confirmation: string;
    response: string;
    payment_db_id: string;
  }> {
    const { data: { session } } = await this.supabase.auth.getSession();
    if (!session) throw new Error('No autenticado');

    const { data, error } = await this.supabase.functions.invoke(
      'create-ai-wallet-recharge',
      { body: { amount } },
    );

    if (error || !data?.invoice) {
      throw new Error(data?.error ?? 'Error al preparar pago con ePayco');
    }
    return data;
  }
}
