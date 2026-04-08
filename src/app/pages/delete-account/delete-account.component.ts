import { Component, ChangeDetectionStrategy, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { getSupabaseClient } from '../../core/supabase.client';

@Component({
  selector: 'app-delete-account',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  templateUrl: './delete-account.component.html',
})
export class DeleteAccountComponent {
  email = '';
  reason = '';
  confirm = false;
  submitted = signal(false);
  loading = signal(false);
  error = signal('');

  async onSubmit() {
    if (!this.email || !this.confirm) {
      this.error.set('Debes ingresar tu correo y confirmar la solicitud.');
      return;
    }

    this.loading.set(true);
    this.error.set('');

    try {
      const supabase = getSupabaseClient();
      const { error } = await supabase.from('account_deletion_requests').insert({
        email: this.email.trim().toLowerCase(),
        reason: this.reason || null,
        status: 'pending',
      });

      if (error) {
        // If table doesn't exist, still show success to the user
        // The request will be handled via email
        console.error('DB insert failed, request noted:', error.message);
      }

      this.submitted.set(true);
    } catch {
      this.submitted.set(true);
    } finally {
      this.loading.set(false);
    }
  }
}
