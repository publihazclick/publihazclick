import { Component, ChangeDetectionStrategy, inject, signal, OnInit, PLATFORM_ID } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { RouterModule, ActivatedRoute } from '@angular/router';
import { AiWalletService, RECHARGE_OPTIONS } from '../../../../core/services/ai-wallet.service';

type PayStep = 'idle' | 'epayco-loading' | 'epayco-opening' | 'error' | 'success';

const COP = new Intl.NumberFormat('es-CO', {
  style: 'currency', currency: 'COP',
  minimumFractionDigits: 0, maximumFractionDigits: 0,
});

@Component({
  selector: 'app-ai-wallet',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './ai-wallet.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AiWalletComponent implements OnInit {
  private readonly walletService = inject(AiWalletService);
  private readonly route = inject(ActivatedRoute);
  private readonly platformId = inject(PLATFORM_ID);

  readonly wallet = this.walletService.wallet;
  readonly transactions = this.walletService.transactions;
  readonly payments = this.walletService.payments;
  readonly loading = this.walletService.loading;
  readonly balance = this.walletService.balance;

  readonly rechargeOptions = RECHARGE_OPTIONS;
  readonly selectedOption = signal(RECHARGE_OPTIONS[0]);
  readonly payStep = signal<PayStep>('idle');
  readonly payError = signal<string | null>(null);

  async ngOnInit(): Promise<void> {
    await Promise.all([
      this.walletService.loadWallet(),
      this.walletService.loadTransactions(),
      this.walletService.loadPayments(),
    ]);

    if (isPlatformBrowser(this.platformId)) {
      const epaycoResult = this.route.snapshot.queryParamMap.get('epayco');
      if (epaycoResult === 'result') {
        this.payStep.set('success');
        setTimeout(() => this.refreshData(), 3000);
      }
    }
  }

  selectOption(opt: typeof RECHARGE_OPTIONS[number]): void {
    this.selectedOption.set(opt);
  }

  // ── Pago ePayco — MISMO patrón que packages.component.ts ──────────────────

  async startEpaycoCheckout(): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) return;

    this.payError.set(null);
    this.payStep.set('epayco-loading');

    try {
      const params = await this.walletService.createEpaycoRecharge(this.selectedOption().cop);
      this.payStep.set('epayco-opening');
      await this.openEpaycoCheckout(params);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al iniciar pago con ePayco';
      this.payError.set(msg);
      this.payStep.set('error');
    }
  }

  private loadEpaycoScript(): Promise<void> {
    return new Promise((resolve, reject) => {
      if ((window as unknown as Record<string, unknown>)['ePayco']) {
        resolve();
        return;
      }
      const script = document.createElement('script');
      script.src = 'https://checkout.epayco.co/checkout.js';
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('No se pudo cargar el script de ePayco'));
      document.head.appendChild(script);
    });
  }

  private async openEpaycoCheckout(params: Awaited<ReturnType<AiWalletService['createEpaycoRecharge']>>): Promise<void> {
    await this.loadEpaycoScript();

    const epayco = (window as unknown as Record<string, unknown>)['ePayco'] as {
      checkout: { configure: (cfg: unknown) => { open: (params: unknown) => void } };
    };

    const handler = epayco.checkout.configure({
      key:  params.publicKey,
      test: params.test,
    });

    handler.open({
      name:         params.name,
      description:  params.description,
      invoice:      params.invoice,
      currency:     params.currency,
      amount:       params.amount,
      tax_base:     params.tax_base,
      tax:          params.tax,
      country:      params.country,
      lang:         params.lang,
      external:     'false',
      confirmation: params.confirmation,
      response:     params.response,
      email_billing: params.email_billing,
      name_billing:  params.name_billing,
      extra1:        params.extra1,
      extra2:        params.extra2,
      extra3:        params.extra3,
    });
  }

  // ── Utilidades ────────────────────────────────────────────────────────────

  closeModal(): void {
    if (this.payStep() === 'success') {
      this.refreshData();
    }
    this.payStep.set('idle');
    this.payError.set(null);
  }

  formatCOP(amount: number): string {
    return COP.format(amount);
  }

  getTransactionIcon(type: string): string {
    const map: Record<string, string> = {
      recharge: 'add_circle', consumption: 'remove_circle',
      refund: 'replay', bonus: 'card_giftcard',
    };
    return map[type] ?? 'swap_horiz';
  }

  getTransactionColor(type: string): string {
    return type === 'recharge' || type === 'refund' || type === 'bonus'
      ? 'text-emerald-500' : 'text-red-400';
  }

  getStatusBadge(status: string): string {
    const map: Record<string, string> = {
      pending: 'bg-amber-100 text-amber-700',
      approved: 'bg-emerald-100 text-emerald-700',
      failed: 'bg-red-100 text-red-700',
    };
    return map[status] ?? 'bg-gray-100 text-gray-700';
  }

  getStatusLabel(status: string): string {
    const map: Record<string, string> = {
      pending: 'Pendiente', approved: 'Aprobado', failed: 'Fallido',
    };
    return map[status] ?? status;
  }

  formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString('es-CO', {
      day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  }

  private async refreshData(): Promise<void> {
    await Promise.all([
      this.walletService.loadWallet(),
      this.walletService.loadTransactions(),
      this.walletService.loadPayments(),
    ]);
  }
}
