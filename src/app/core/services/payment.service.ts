import { Injectable, inject } from '@angular/core';
import { getSupabaseClient } from '../supabase.client';
import { environment } from '../../../environments/environment';

export type PaymentStatus = 'pending' | 'approved' | 'declined' | 'voided' | 'error';

export interface PaymentRecord {
  id: string;
  user_id: string;
  package_id: string;
  package_name: string;
  amount_in_cents: number;
  currency: string;
  status: PaymentStatus;
  payment_method: string;
  gateway: string;
  gateway_transaction_id: string | null;
  gateway_reference: string | null;
  phone_number: string | null;
  error_message: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface CreateNequiPaymentResult {
  transaction_id: string;
  reference: string;
  status: string;
  amount_in_cents: number;
  amount_cop: number;
  message: string;
  reused?: boolean;
}

export interface PaymentStatusResult {
  transaction_id: string;
  status: PaymentStatus;
  package_name: string;
  amount_in_cents: number;
  final: boolean;
}

const FUNCTIONS_URL = `${environment.supabase.url}/functions/v1`;

@Injectable({ providedIn: 'root' })
export class PaymentService {
  private readonly supabase = getSupabaseClient();

  // ── Crear pago Nequi ───────────────────────────────────────────────────────

  async createNequiPayment(
    packageId: string,
    phoneNumber: string
  ): Promise<CreateNequiPaymentResult> {
    const { data: { session } } = await this.supabase.auth.getSession();
    if (!session) throw new Error('Sesión no encontrada');

    const res = await fetch(`${FUNCTIONS_URL}/create-nequi-payment`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ package_id: packageId, phone_number: phoneNumber }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? 'Error al crear el pago');
    return data as CreateNequiPaymentResult;
  }

  // ── Consultar estado de pago ───────────────────────────────────────────────

  async checkPaymentStatus(transactionId: string): Promise<PaymentStatusResult> {
    const { data: { session } } = await this.supabase.auth.getSession();
    if (!session) throw new Error('Sesión no encontrada');

    const res = await fetch(
      `${FUNCTIONS_URL}/check-payment-status?transaction_id=${encodeURIComponent(transactionId)}`,
      {
        headers: { Authorization: `Bearer ${session.access_token}` },
      }
    );

    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? 'Error al consultar el estado');
    return data as PaymentStatusResult;
  }

  // ── Historial de pagos del usuario ────────────────────────────────────────

  async getMyPayments(): Promise<PaymentRecord[]> {
    const { data, error } = await this.supabase
      .from('payments')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) throw error;
    return (data ?? []) as PaymentRecord[];
  }

  // ── Polling de pago (usa interval + promesa) ──────────────────────────────
  // Llama a checkPaymentStatus cada `intervalMs` hasta que el estado sea final
  // o hasta que pase `timeoutMs` milliseconds.

  pollPaymentStatus(
    transactionId: string,
    onUpdate: (result: PaymentStatusResult) => void,
    intervalMs = 4000,
    timeoutMs = 5 * 60 * 1000   // 5 minutos máximo
  ): { cancel: () => void } {
    let cancelled = false;
    const start = Date.now();

    const tick = async () => {
      if (cancelled) return;
      if (Date.now() - start > timeoutMs) {
        onUpdate({
          transaction_id: transactionId,
          status: 'error',
          package_name: '',
          amount_in_cents: 0,
          final: true,
        });
        return;
      }

      try {
        const result = await this.checkPaymentStatus(transactionId);
        onUpdate(result);
        if (!result.final && !cancelled) {
          setTimeout(tick, intervalMs);
        }
      } catch {
        if (!cancelled) setTimeout(tick, intervalMs);
      }
    };

    // Primer check después de 3 segundos (tiempo para que el usuario apruebe)
    setTimeout(tick, 3000);

    return { cancel: () => { cancelled = true; } };
  }

  // ── Utilidades ────────────────────────────────────────────────────────────

  formatCOP(amountInCents: number): string {
    const amount = amountInCents / 100;
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  }

  getStatusLabel(status: PaymentStatus): string {
    const labels: Record<PaymentStatus, string> = {
      pending:  'Pendiente',
      approved: 'Aprobado',
      declined: 'Rechazado',
      voided:   'Anulado',
      error:    'Error',
    };
    return labels[status] ?? status;
  }

  getStatusStyle(status: PaymentStatus): string {
    const styles: Record<PaymentStatus, string> = {
      pending:  'text-amber-400 bg-amber-500/10 border border-amber-500/20',
      approved: 'text-emerald-400 bg-emerald-500/10 border border-emerald-500/20',
      declined: 'text-rose-400 bg-rose-500/10 border border-rose-500/20',
      voided:   'text-slate-400 bg-slate-500/10 border border-slate-500/20',
      error:    'text-rose-400 bg-rose-500/10 border border-rose-500/20',
    };
    return styles[status] ?? 'text-slate-400 bg-slate-500/10 border border-slate-500/20';
  }
}
