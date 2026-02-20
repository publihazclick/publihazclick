import { Injectable, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

export interface Currency {
  code: string;
  symbol: string;
  name: string;
  flag?: string;
}

export interface ExchangeRates {
  [key: string]: number;
}

@Injectable({
  providedIn: 'root'
})
export class CurrencyService {
  private readonly API_KEY = 'e4d78312d37df5524ba2b005';
  private readonly BASE_URL = 'https://v6.exchangerate-api.com/v6';

  // Signal for the selected currency - Default to COP
  private _selectedCurrency = signal<Currency>({
    code: 'COP',
    symbol: '$',
    name: 'Peso Colombiano',
    flag: '🇨🇴'
  });

  // Signal for exchange rates
  private _rates = signal<ExchangeRates>({});
  
  // Signal for loading state
  private _loading = signal<boolean>(false);

  // Public signals
  readonly selectedCurrency = this._selectedCurrency.asReadonly();
  readonly rates = this._rates.asReadonly();
  readonly loading = this._loading.asReadonly();

  // Computed for current rate
  readonly currentRate = computed(() => {
    const currency = this._selectedCurrency();
    if (currency.code === 'USD') return 1;
    return this._rates()[currency.code] || 1;
  });

  readonly currencies: Currency[] = [
    { code: 'USD', symbol: '$', name: 'Dólar Americano', flag: '🇺🇸' },
    { code: 'COP', symbol: '$', name: 'Peso Colombiano', flag: '🇨🇴' },
    { code: 'MXN', symbol: '$', name: 'Peso Mexicano', flag: '🇲🇽' },
    { code: 'EUR', symbol: '€', name: 'Euro', flag: '🇪🇺' },
    { code: 'GBP', symbol: '£', name: 'Libra Esterlina', flag: '🇬🇧' },
    { code: 'ARS', symbol: '$', name: 'Peso Argentino', flag: '🇦🇷' },
    { code: 'CLP', symbol: '$', name: 'Peso Chileno', flag: '🇨🇱' },
    { code: 'PEN', symbol: 'S/', name: 'Sol Peruano', flag: '🇵🇪' },
    { code: 'BRL', symbol: 'R$', name: 'Real Brasileño', flag: '🇧🇷' },
    { code: 'VES', symbol: 'Bs', name: 'Bolívar Soberano', flag: '🇻🇪' }
  ];

  constructor(private http: HttpClient) {
    // Load saved currency from localStorage (only in browser)
    this.loadSavedCurrency();
    // Fetch initial rates
    this.fetchRates();
  }

  private loadSavedCurrency(): void {
    if (typeof window === 'undefined' || !localStorage) return;
    
    const saved = localStorage.getItem('selectedCurrency');
    if (saved) {
      try {
        const currency = JSON.parse(saved) as Currency;
        this._selectedCurrency.set(currency);
      } catch (e) {
        console.error('Error parsing saved currency:', e);
      }
    }
  }

  async fetchRates(): Promise<void> {
    this._loading.set(true);
    try {
      const url = `${this.BASE_URL}/${this.API_KEY}/latest/USD`;
      const response: any = await firstValueFrom(this.http.get(url));
      
      if (response && response.conversion_rates) {
        this._rates.set(response.conversion_rates);
      }
    } catch (error) {
      console.error('Error fetching exchange rates:', error);
      // Set fallback rates
      this._rates.set(this.getFallbackRates());
    } finally {
      this._loading.set(false);
    }
  }

  private getFallbackRates(): ExchangeRates {
    return {
      USD: 1,
      COP: 3850,
      MXN: 17.15,
      EUR: 0.92,
      GBP: 0.79,
      ARS: 875,
      CLP: 925,
      PEN: 3.72,
      BRL: 4.97,
      VES: 36.15
    };
  }

  selectCurrency(currency: Currency): void {
    this._selectedCurrency.set(currency);
    
    if (typeof window !== 'undefined' && localStorage) {
      localStorage.setItem('selectedCurrency', JSON.stringify(currency));
    }
  }

  // Convert USD amount to selected currency
  convert(amountInUSD: number): number {
    const rate = this.currentRate();
    return amountInUSD * rate;
  }

  // Format amount in selected currency
  format(amountInUSD: number, decimals: number = 0): string {
    const currency = this._selectedCurrency();
    const converted = this.convert(amountInUSD);

    switch (currency.code) {
      case 'COP':
      case 'CLP':
      case 'ARS':
        return `${currency.symbol}${Math.floor(converted).toLocaleString('es-CO')}`;
      case 'MXN':
      case 'PEN':
        return `${currency.symbol}${converted.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      case 'EUR':
      case 'GBP':
      case 'BRL':
        return `${currency.symbol}${converted.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      case 'VES':
        return `${currency.symbol}${converted.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      default:
        return `${currency.symbol}${converted.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
    }
  }

  // Get currency by code
  getCurrencyByCode(code: string): Currency | undefined {
    return this.currencies.find(c => c.code === code);
  }
}
