import { Component, ChangeDetectionStrategy, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ProfileService } from '../../../../core/services/profile.service';
import { CurrencyService } from '../../../../core/services/currency.service';

@Component({
  selector: 'app-ai-dashboard',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  templateUrl: './ai-dashboard.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AiDashboardComponent {
  private readonly profileService = inject(ProfileService);
  readonly currencyService = inject(CurrencyService);
  private readonly router = inject(Router);

  readonly profile = this.profileService.profile;
  readonly billingCycle = signal<'monthly' | 'annual'>('monthly');

  formatCOP(amount: number): string {
    return this.currencyService.formatFromCOP(amount, 0);
  }

  navigateTo(path: string): void {
    this.router.navigate([path]);
  }
}
