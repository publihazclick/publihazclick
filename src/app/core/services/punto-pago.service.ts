import { Injectable, inject } from '@angular/core';
import { from, Observable, map, catchError, of } from 'rxjs';
import { getSupabaseClient } from '../supabase.client';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */
export interface ReloadlyOperator {
  id: number;
  operatorId: number;
  name: string;
  denominationType: 'RANGE' | 'FIXED';
  supportsLocalAmounts: boolean;
  minAmount: number;
  maxAmount: number;
  localMinAmount: number;
  localMaxAmount: number;
  fixedAmounts: number[];
  localFixedAmounts: number[];
  commission: number;
  country: { isoName: string; name: string };
}

export interface TopupResult {
  transactionId: number;
  status: 'SUCCESSFUL' | 'PENDING' | 'FAILED';
  operatorName: string;
  requestedAmount: number;
  requestedAmountCurrencyCode: string;
  deliveredAmount: number;
  deliveredAmountCurrencyCode: string;
  customIdentifier: string;
  transactionDate: string;
  discount: number;
  discountCurrencyCode: string;
}

export interface PuntoPagoTransaction {
  id: string;
  user_id: string;
  category: string;
  provider_name: string;
  reference: string;
  amount: number;
  external_id: string | null;
  custom_identifier: string | null;
  status: 'pending' | 'completed' | 'failed' | 'refunded';
  created_at: string;
}

/* ------------------------------------------------------------------ */
/*  Service                                                            */
/* ------------------------------------------------------------------ */
@Injectable({ providedIn: 'root' })
export class PuntoPagoService {
  private sb = getSupabaseClient();

  private call(action: string, params: Record<string, unknown> = {}): Observable<any> {
    return from(
      this.sb.functions.invoke('reloadly-proxy', {
        body: { action, ...params },
      })
    ).pipe(
      map((res) => {
        if (res.error) throw new Error(res.error.message);
        return res.data;
      }),
      catchError((err) => {
        console.error(`PuntoPago [${action}] error:`, err);
        throw err;
      })
    );
  }

  /** Lista los operadores de celular disponibles en Colombia */
  getOperators(): Observable<ReloadlyOperator[]> {
    return this.call('get-operators');
  }

  /** Auto-detecta el operador a partir de un número de teléfono */
  detectOperator(phone: string): Observable<ReloadlyOperator> {
    return this.call('detect-operator', { phone });
  }

  /** Envía una recarga celular */
  sendTopup(operatorId: number, amount: number, phone: string): Observable<TopupResult> {
    return this.call('send-topup', { operatorId, amount, phone });
  }

  /** Consulta el estado de una transacción */
  checkStatus(transactionId: number): Observable<any> {
    return this.call('check-status', { transactionId });
  }

  /** Consulta el balance de la cuenta Reloadly */
  getBalance(): Observable<{ balance: number; currencyCode: string }> {
    return this.call('get-balance');
  }

  /** Obtiene promociones activas en Colombia */
  getPromotions(): Observable<any[]> {
    return this.call('get-promotions');
  }

  /** Obtiene historial de transacciones desde Supabase */
  getTransactions(limit = 50): Observable<PuntoPagoTransaction[]> {
    return from(
      this.sb
        .from('punto_pago_transactions')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit)
    ).pipe(
      map((res) => {
        if (res.error) throw new Error(res.error.message);
        return res.data ?? [];
      })
    );
  }
}
