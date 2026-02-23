import { Injectable, signal, computed, inject, PLATFORM_ID } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { isPlatformBrowser } from '@angular/common';

export interface Currency {
  code: string;
  symbol: string;
  name: string;
  icon?: string;
}

export interface ExchangeRates {
  [key: string]: number;
}

export interface CachedRates {
  rates: ExchangeRates;
  lastFetched: string; // ISO date string
  lastFetchedHour: number; // Hour of the day (0-23)
}

@Injectable({
  providedIn: 'root'
})
export class CurrencyService {
  private readonly API_KEY = 'fca_live_9TcBlO4cZge82CUYl7cta0M7dkkcX7aiexyXwSPJ';
  private readonly BASE_URL = 'https://api.freecurrencyapi.com/v1/latest';
  private readonly CACHE_KEY = 'cachedExchangeRates';
  private readonly CACHE_HOURS_KEY = 'cachedExchangeRatesHour';
  
  private platformId = inject(PLATFORM_ID);

  // Signal for the selected currency - Default to COP
  private _selectedCurrency = signal<Currency>({
    code: 'COP',
    symbol: '$',
    name: 'Peso Colombiano',
    icon: 'attach_money'
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
    { code: 'USD', symbol: '$', name: 'Dólar Americano', icon: 'attach_money' },
    { code: 'COP', symbol: '$', name: 'Peso Colombiano', icon: 'attach_money' },
    { code: 'MXN', symbol: '$', name: 'Peso Mexicano', icon: 'attach_money' },
    { code: 'EUR', symbol: '€', name: 'Euro', icon: 'euro_symbol' },
    { code: 'GBP', symbol: '£', name: 'Libra Esterlina', icon: 'currency_exchange' },
    { code: 'ARS', symbol: '$', name: 'Peso Argentino', icon: 'attach_money' },
    { code: 'CLP', symbol: '$', name: 'Peso Chileno', icon: 'attach_money' },
    { code: 'PEN', symbol: 'S/', name: 'Sol Peruano', icon: 'attach_money' },
    { code: 'BRL', symbol: 'R$', name: 'Real Brasileño', icon: 'attach_money' },
    { code: 'VES', symbol: 'Bs', name: 'Bolívar Soberano', icon: 'attach_money' }
  ];

  constructor(private http: HttpClient) {
    // Load saved currency from localStorage (only in browser)
    this.loadSavedCurrency();
    // Check and fetch rates if needed
    this.initializeRates();
  }

  private loadSavedCurrency(): void {
    if (!isPlatformBrowser(this.platformId) || !localStorage) return;
    
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

  /**
   * Inicializa las tasas de cambio.
   * Si hay cache válido, lo usa.
   * Si no hay cache o está desactualizado, intenta obtener tasas nuevas.
   */
  private initializeRates(): void {
    if (!isPlatformBrowser(this.platformId)) {
      // En SSR, usar fallback
      this._rates.set(this.getFallbackRates());
      return;
    }

    const currentHour = new Date().getHours();
    const cachedRatesStr = localStorage.getItem(this.CACHE_KEY);

    // Verificar si hay cache válido
    if (cachedRatesStr) {
      try {
        const cached: CachedRates = JSON.parse(cachedRatesStr);
        const lastDate = new Date(cached.lastFetched);
        const today = new Date();
        const isSameDay = lastDate.toDateString() === today.toDateString();

        // Si hay cache de hoy, usarlo
        if (isSameDay) {
          this._rates.set(cached.rates);
          console.log('Usando tasas cacheadas del día:', cached.lastFetched);
          
          // También intentar actualizar si estamos en hora válida (6am o 6pm)
          const validHours = [6, 18];
          if (validHours.includes(currentHour) && cached.lastFetchedHour !== currentHour) {
            // Hay nueva actualización disponible, fetch en background
            this.fetchRates().catch(() => {});
          }
          return;
        }
      } catch (e) {
        console.error('Error parsing cached rates:', e);
      }
    }

    // No hay cache válido, intentar obtener tasas
    this.fetchRates().catch(() => {
      // Si falla, usar fallback
      this._rates.set(this.getFallbackRates());
    });
  }

  async fetchRates(): Promise<void> {
    this._loading.set(true);
    try {
      const url = `${this.BASE_URL}?apikey=${this.API_KEY}&base_currency=USD`;
      const response: any = await firstValueFrom(this.http.get(url));
      
      if (response && response.data) {
        this._rates.set(response.data);
        
        // Guardar en cache
        if (isPlatformBrowser(this.platformId)) {
          const currentHour = new Date().getHours();
          const cachedRates: CachedRates = {
            rates: response.data,
            lastFetched: new Date().toISOString(),
            lastFetchedHour: currentHour
          };
          localStorage.setItem(this.CACHE_KEY, JSON.stringify(cachedRates));
          localStorage.setItem(this.CACHE_HOURS_KEY, currentHour.toString());
          console.log('Tasas actualizadas y guardadas en cache a las:', currentHour);
        }
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
    
    if (isPlatformBrowser(this.platformId) && localStorage) {
      localStorage.setItem('selectedCurrency', JSON.stringify(currency));
    }
  }

  // Convert USD amount to selected currency
  convert(amountInUSD: number): number {
    const rate = this.currentRate();
    return amountInUSD * rate;
  }

  // Convert COP amount to selected currency
  convertFromCOP(amountInCOP: number): number {
    const currency = this._selectedCurrency();
    
    // If selected currency is COP, return as is
    if (currency.code === 'COP') {
      return amountInCOP;
    }
    
    // Otherwise convert from COP to the selected currency
    const rate = this.currentRate();
    // currentRate is USD to selected currency
    // So we need: amountInCOP / rateFromCOPtoUSD * rateToSelectedCurrency
    // Since base is USD: amountInUSD = amountInCOP / 3850 (approx)
    const copToUsdRate = this._rates()['COP'] || 3850;
    const amountInUSD = amountInCOP / copToUsdRate;
    return amountInUSD * rate;
  }

  // Format amount in COP to selected currency
  formatFromCOP(amountInCOP: number, decimals: number = 0): string {
    const converted = this.convertFromCOP(amountInCOP);
    return this.formatValue(converted, decimals);
  }

  // Format amount in USD to selected currency
  formatFromUSD(amountInUSD: number, decimals: number = 0): string {
    const converted = this.convert(amountInUSD);
    return this.formatValue(converted, decimals);
  }

  // Internal helper to format the converted value
  private formatValue(converted: number, decimals: number = 2): string {
    const currency = this._selectedCurrency();

    switch (currency.code) {
      case 'COP':
      case 'CLP':
      case 'ARS':
        return `${currency.symbol}${converted.toLocaleString('es-CO', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
      case 'MXN':
      case 'PEN':
        return `${currency.symbol}${converted.toLocaleString('es-MX', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
      case 'EUR':
      case 'GBP':
      case 'BRL':
        return `${currency.symbol}${converted.toLocaleString('de-DE', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
      case 'VES':
        return `${currency.symbol}${converted.toLocaleString('es-VE', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
      default:
        return `${currency.symbol}${converted.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
    }
  }

  // Format amount in selected currency (converts from USD)
  format(amountInUSD: number, decimals: number = 0): string {
    const converted = this.convert(amountInUSD);
    return this.formatValue(converted, decimals);
  }

  // Format amount that is already in local currency (no conversion)
  formatLocalValue(amountInLocalCurrency: number): string {
    const currency = this._selectedCurrency();
    const value = amountInLocalCurrency;

    switch (currency.code) {
      case 'COP':
      case 'CLP':
      case 'ARS':
        // Para valores con decimales como 88.33 COP
        return `${currency.symbol}${value.toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      case 'MXN':
      case 'PEN':
        return `${currency.symbol}${value.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      case 'EUR':
      case 'GBP':
      case 'BRL':
        return `${currency.symbol}${value.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      case 'VES':
        return `${currency.symbol}${value.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      default:
        return `${currency.symbol}${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
  }

  // Get currency by code
  getCurrencyByCode(code: string): Currency | undefined {
    return this.currencies.find(c => c.code === code);
  }

  // Force refresh rates (for manual refresh)
  async refreshRates(): Promise<void> {
    await this.fetchRates();
  }
}
