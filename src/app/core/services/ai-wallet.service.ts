import { Injectable, inject, signal, computed } from '@angular/core';
import { getSupabaseClient } from '../supabase.client';
import { environment } from '../../../environments/environment';

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

export interface EpaycoCheckoutParams {
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
}

/** Montos de recarga válidos en COP */
export const RECHARGE_AMOUNTS = [10_000, 20_000, 50_000, 100_000, 200_000];

@Injectable({ providedIn: 'root' })
export class AiWalletService {
  private readonly supabase = getSupabaseClient();

  readonly wallet = signal<AiWallet | null>(null);
  readonly transactions = signal<AiWalletTransaction[]>([]);
  readonly payments = signal<AiWalletPayment[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  readonly balance = computed(() => this.wallet()?.balance ?? 0);

  /** Cargar billetera del usuario autenticado */
  async loadWallet(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const { data: { user } } = await this.supabase.auth.getUser();
      if (!user) throw new Error('No autenticado');

      // Asegurar billetera existe
      await this.supabase.rpc('ai_ensure_wallet', { p_user_id: user.id });

      const { data, error } = await this.supabase
        .from('ai_wallets')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (error) throw error;
      this.wallet.set(data as AiWallet);
    } catch (e: unknown) {
      this.error.set(e instanceof Error ? e.message : 'Error al cargar billetera');
    } finally {
      this.loading.set(false);
    }
  }

  /** Cargar historial de transacciones */
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
    } catch {
      // silencioso
    }
  }

  /** Cargar historial de pagos/recargas */
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
    } catch {
      // silencioso
    }
  }

  /** Crear pago de recarga y obtener parámetros de checkout ePayco */
  async createRechargePayment(amount: number): Promise<EpaycoCheckoutParams> {
    const { data: { session } } = await this.supabase.auth.getSession();
    if (!session) throw new Error('No autenticado');

    const response = await fetch(
      `${environment.supabase.url}/functions/v1/create-ai-wallet-recharge`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ amount }),
      }
    );

    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? 'Error al crear recarga');
    return data as EpaycoCheckoutParams;
  }
}
