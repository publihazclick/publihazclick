import { Component, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReferralLinkComponent } from '../../../../shared/components/referral-link';

@Component({
  selector: 'app-admin-referral-modal',
  standalone: true,
  imports: [CommonModule, ReferralLinkComponent],
  template: `
    @if (isOpen()) {
      <div class="fixed inset-0 z-50 flex items-center justify-center p-4">
        <!-- Backdrop -->
        <div
          class="absolute inset-0 bg-black/70 backdrop-blur-sm transition-opacity"
          (click)="close()"
        ></div>

        <!-- Modal -->
        <div class="relative bg-card-dark border border-white/10 rounded-2xl w-full max-w-md shadow-2xl transform transition-all">
          <!-- Header -->
          <div class="flex items-center justify-between p-4 lg:p-6 border-b border-white/10">
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 bg-gradient-to-tr from-accent to-pink-600 rounded-xl flex items-center justify-center shadow-lg shadow-accent/20">
                <span class="material-symbols-outlined text-xl text-white">card_giftcard</span>
              </div>
              <div>
                <h2 class="text-lg font-bold text-white">Recomienda y Gana</h2>
                <p class="text-xs text-slate-400">Invita y gana comisiones</p>
              </div>
            </div>
            <button
              (click)="close()"
              class="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition-all"
            >
              <span class="material-symbols-outlined">close</span>
            </button>
          </div>

          <!-- Content -->
          <div class="p-4 lg:p-6">
            <app-referral-link></app-referral-link>
          </div>
        </div>
      </div>
    }
  `
})
export class AdminReferralModalComponent {
  readonly isOpen = signal<boolean>(false);

  open(): void {
    this.isOpen.set(true);
    document.body.style.overflow = 'hidden';
  }

  close(): void {
    this.isOpen.set(false);
    document.body.style.overflow = '';
  }
}
