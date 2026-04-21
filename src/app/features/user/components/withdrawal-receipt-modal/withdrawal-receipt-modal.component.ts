import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  Output,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { getSupabaseClient } from '../../../../core/supabase.client';
import { CurrencyService } from '../../../../core/services/currency.service';

export interface PendingWithdrawalAck {
  id: string;
  amount: number;
  method: string | null;
  receipt_url: string | null;
  admin_notes: string | null;
  receipt_uploaded_at: string | null;
  created_at: string;
}

@Component({
  selector: 'app-withdrawal-receipt-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './withdrawal-receipt-modal.component.html',
})
export class WithdrawalReceiptModalComponent {
  @Input({ required: true }) withdrawal!: PendingWithdrawalAck;
  @Output() acknowledged = new EventEmitter<void>();

  private readonly supabase = getSupabaseClient();
  readonly currencyService = inject(CurrencyService);

  readonly comment = signal('');
  readonly submitting = signal(false);
  readonly error = signal<string | null>(null);

  readonly MIN_LEN = 10;

  onCommentChange(value: string): void {
    this.comment.set(value);
    this.error.set(null);
  }

  get isValid(): boolean {
    return this.comment().trim().length >= this.MIN_LEN;
  }

  async submit(): Promise<void> {
    if (!this.isValid || this.submitting()) return;
    this.submitting.set(true);
    this.error.set(null);

    try {
      const { error } = await this.supabase.rpc('ack_withdrawal_receipt', {
        p_withdrawal_id: this.withdrawal.id,
        p_comment: this.comment().trim(),
      });
      if (error) throw error;
      this.acknowledged.emit();
    } catch (err: any) {
      this.error.set(err?.message ?? 'Error al enviar el comentario');
      this.submitting.set(false);
    }
  }

  formatCOP(amount: number): string {
    return this.currencyService.formatLocalValue(amount);
  }

  formatDate(dateStr: string | null): string {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleString('es-CO', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
}
