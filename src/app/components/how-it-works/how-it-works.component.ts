import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CurrencyService } from '../../core/services/currency.service';

@Component({
  selector: 'app-how-it-works',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './how-it-works.component.html',
  styleUrl: './how-it-works.component.scss'
})
export class HowItWorksComponent {
  protected currencyService = inject(CurrencyService);

  // Potential earnings: 1,000,000 COP = ~260 USD
  getEarningsDisplay(): string {
    return this.currencyService.format(260);
  }
}
