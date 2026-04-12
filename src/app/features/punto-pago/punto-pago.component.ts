import { Component, ChangeDetectionStrategy, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

/* ------------------------------------------------------------------ */
/*  Interfaces                                                         */
/* ------------------------------------------------------------------ */
export interface ServiceProvider {
  id: string;
  name: string;
  logo?: string;
}

export interface ServiceCategory {
  id: string;
  name: string;
  description: string;
  icon: string;
  gradient: string;
  iconBg: string;
  providers: ServiceProvider[];
}

export interface Transaction {
  id: string;
  categoryId: string;
  categoryName: string;
  providerName: string;
  reference: string;
  amount: number;
  date: Date;
  status: 'completed' | 'pending' | 'failed';
}

export interface PackageCarrier {
  id: string;
  name: string;
  logo?: string;
  services: string[];
}

/* ------------------------------------------------------------------ */
/*  Data                                                               */
/* ------------------------------------------------------------------ */
const CATEGORIES: ServiceCategory[] = [
  {
    id: 'servicios',
    name: 'Servicios Públicos',
    description: 'Paga tus recibos de luz, agua, gas e internet',
    icon: 'receipt_long',
    gradient: 'from-blue-600 to-cyan-500',
    iconBg: 'bg-blue-100 text-blue-600',
    providers: [
      { id: 'enel', name: 'Enel - Codensa' },
      { id: 'celsia', name: 'Celsia' },
      { id: 'electricaribe', name: 'Air-e (Electricaribe)' },
      { id: 'epm-energia', name: 'EPM Energía' },
      { id: 'essa', name: 'ESSA' },
      { id: 'acueducto-bog', name: 'Acueducto de Bogotá' },
      { id: 'epm-agua', name: 'EPM Agua' },
      { id: 'triple-a', name: 'Triple A' },
      { id: 'vanti', name: 'Vanti Gas' },
      { id: 'gases-caribe', name: 'Gases del Caribe' },
      { id: 'surtigas', name: 'Surtigas' },
      { id: 'claro-hogar', name: 'Claro Hogar' },
      { id: 'movistar-hogar', name: 'Movistar Hogar' },
      { id: 'etb', name: 'ETB' },
      { id: 'tigo-une', name: 'Tigo-UNE' },
      { id: 'directv', name: 'DirecTV' },
    ],
  },
  {
    id: 'creditos',
    name: 'Créditos Bancarios',
    description: 'Paga las cuotas de tus créditos y obligaciones',
    icon: 'account_balance',
    gradient: 'from-violet-600 to-purple-500',
    iconBg: 'bg-violet-100 text-violet-600',
    providers: [
      { id: 'bancolombia', name: 'Bancolombia' },
      { id: 'davivienda', name: 'Davivienda' },
      { id: 'bbva', name: 'BBVA' },
      { id: 'bogota', name: 'Banco de Bogotá' },
      { id: 'popular', name: 'Banco Popular' },
      { id: 'occidente', name: 'Banco de Occidente' },
      { id: 'scotiabank', name: 'Scotiabank Colpatria' },
      { id: 'av-villas', name: 'AV Villas' },
      { id: 'agrario', name: 'Banco Agrario' },
      { id: 'caja-social', name: 'Banco Caja Social' },
      { id: 'itau', name: 'Banco Itaú' },
      { id: 'gnb-sudameris', name: 'GNB Sudameris' },
      { id: 'pichincha', name: 'Banco Pichincha' },
      { id: 'falabella', name: 'Banco Falabella' },
      { id: 'finandina', name: 'Banco Finandina' },
    ],
  },
  {
    id: 'corresponsal',
    name: 'Corresponsal Bancario',
    description: 'Depósitos, retiros y consultas de todos los bancos',
    icon: 'storefront',
    gradient: 'from-emerald-600 to-teal-500',
    iconBg: 'bg-emerald-100 text-emerald-600',
    providers: [
      { id: 'cb-bancolombia', name: 'Bancolombia' },
      { id: 'cb-davivienda', name: 'Davivienda' },
      { id: 'cb-bbva', name: 'BBVA' },
      { id: 'cb-bogota', name: 'Banco de Bogotá' },
      { id: 'cb-popular', name: 'Banco Popular' },
      { id: 'cb-agrario', name: 'Banco Agrario' },
      { id: 'cb-nequi', name: 'Nequi' },
      { id: 'cb-daviplata', name: 'Daviplata' },
      { id: 'cb-movii', name: 'MOVii' },
      { id: 'cb-dale', name: 'Dale!' },
    ],
  },
  {
    id: 'giros',
    name: 'Giros',
    description: 'Envía y recibe dinero a todo el país',
    icon: 'currency_exchange',
    gradient: 'from-amber-500 to-orange-500',
    iconBg: 'bg-amber-100 text-amber-600',
    providers: [
      { id: 'efecty', name: 'Efecty' },
      { id: 'supergiros', name: 'SuperGIROS' },
      { id: 'giros-western', name: 'Western Union' },
      { id: 'moneygram', name: 'MoneyGram' },
      { id: 'su-chance', name: 'SuChance' },
      { id: 'gana-gana', name: 'Gana Gana' },
    ],
  },
  {
    id: 'recargas',
    name: 'Recargas Celular',
    description: 'Recarga cualquier operador al instante',
    icon: 'smartphone',
    gradient: 'from-rose-500 to-pink-500',
    iconBg: 'bg-rose-100 text-rose-600',
    providers: [
      { id: 'claro', name: 'Claro' },
      { id: 'movistar', name: 'Movistar' },
      { id: 'tigo', name: 'Tigo' },
      { id: 'wom', name: 'WOM' },
      { id: 'virgin', name: 'Virgin Mobile' },
      { id: 'flash-mobile', name: 'Flash Mobile' },
      { id: 'exito-movil', name: 'Éxito Móvil' },
    ],
  },
  {
    id: 'apuestas',
    name: 'Recargas Apuestas',
    description: 'Recarga tu cuenta de apuestas deportivas',
    icon: 'sports_soccer',
    gradient: 'from-green-600 to-lime-500',
    iconBg: 'bg-green-100 text-green-600',
    providers: [
      { id: 'betplay', name: 'BetPlay' },
      { id: 'rushbet', name: 'Rushbet' },
      { id: 'codere', name: 'Codere' },
      { id: 'wplay', name: 'Wplay' },
      { id: 'luckia', name: 'Luckia' },
      { id: 'zamba', name: 'Zamba' },
      { id: 'sportium', name: 'Sportium' },
      { id: 'megapuesta', name: 'MegApuesta' },
      { id: 'rivalo', name: 'Rivalo' },
      { id: 'yajuego', name: 'YaJuego' },
    ],
  },
  {
    id: 'paqueteria',
    name: 'Paquetería',
    description: 'Envía, recibe y rastrea paquetes de cualquier transportadora',
    icon: 'local_shipping',
    gradient: 'from-sky-600 to-indigo-500',
    iconBg: 'bg-sky-100 text-sky-600',
    providers: [
      { id: 'servientrega', name: 'Servientrega' },
      { id: 'interrapidisimo', name: 'Interrapidísimo' },
      { id: 'coordinadora', name: 'Coordinadora' },
      { id: 'envia', name: 'Envía' },
      { id: 'tcc', name: 'TCC' },
      { id: 'deprisa', name: 'Deprisa' },
      { id: '472', name: '4-72' },
      { id: 'fedex', name: 'FedEx' },
      { id: 'dhl', name: 'DHL' },
      { id: 'saferbo', name: 'Saferbo' },
    ],
  },
];

const QUICK_AMOUNTS = [5000, 10000, 20000, 50000, 100000];

const CORRESPONSAL_OPERATIONS = [
  { id: 'deposito', name: 'Depósito', icon: 'savings', color: 'text-emerald-600 bg-emerald-100' },
  { id: 'retiro', name: 'Retiro', icon: 'money_off', color: 'text-rose-600 bg-rose-100' },
  { id: 'consulta', name: 'Consulta Saldo', icon: 'search', color: 'text-blue-600 bg-blue-100' },
  { id: 'transferencia', name: 'Transferencia', icon: 'swap_horiz', color: 'text-violet-600 bg-violet-100' },
];

const PAQUETERIA_OPERATIONS = [
  { id: 'enviar', name: 'Enviar Paquete', icon: 'outbox', color: 'text-indigo-600 bg-indigo-100' },
  { id: 'recibir', name: 'Recibir Paquete', icon: 'inbox', color: 'text-emerald-600 bg-emerald-100' },
  { id: 'rastrear', name: 'Rastrear Envío', icon: 'location_searching', color: 'text-amber-600 bg-amber-100' },
];

type View = 'home' | 'category' | 'payment' | 'confirm' | 'receipt' | 'history' | 'corresponsal-ops' | 'paqueteria-ops';

@Component({
  standalone: true,
  selector: 'app-punto-pago',
  templateUrl: './punto-pago.component.html',
  styleUrls: ['./punto-pago.component.scss'],
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PuntoPagoComponent {
  /* Signals */
  view = signal<View>('home');
  selectedCategory = signal<ServiceCategory | null>(null);
  selectedProvider = signal<ServiceProvider | null>(null);
  selectedCorresponsalOp = signal<string>('');
  selectedPaqueteriaOp = signal<string>('');
  searchTerm = signal('');
  paymentRef = signal('');
  paymentAmount = signal<number | null>(null);
  paymentPhone = signal('');
  processing = signal(false);
  transactions = signal<Transaction[]>([
    { id: 'TXN-001', categoryId: 'servicios', categoryName: 'Servicios Públicos', providerName: 'Enel - Codensa', reference: '4521789654', amount: 85400, date: new Date(2026, 3, 10), status: 'completed' },
    { id: 'TXN-002', categoryId: 'recargas', categoryName: 'Recargas Celular', providerName: 'Claro', reference: '3001234567', amount: 20000, date: new Date(2026, 3, 9), status: 'completed' },
    { id: 'TXN-003', categoryId: 'creditos', categoryName: 'Créditos Bancarios', providerName: 'Bancolombia', reference: '8876543210', amount: 350000, date: new Date(2026, 3, 8), status: 'pending' },
  ]);

  /* Computed */
  categories = signal(CATEGORIES);
  quickAmounts = QUICK_AMOUNTS;
  corresponsalOps = CORRESPONSAL_OPERATIONS;
  paqueteriaOps = PAQUETERIA_OPERATIONS;

  filteredProviders = computed(() => {
    const cat = this.selectedCategory();
    const term = this.searchTerm().toLowerCase();
    if (!cat) return [];
    if (!term) return cat.providers;
    return cat.providers.filter(p => p.name.toLowerCase().includes(term));
  });

  totalTransactions = computed(() => this.transactions().length);
  completedAmount = computed(() =>
    this.transactions()
      .filter(t => t.status === 'completed')
      .reduce((sum, t) => sum + t.amount, 0)
  );

  /* Navigation */
  goHome() {
    this.view.set('home');
    this.resetForm();
  }

  selectCategory(cat: ServiceCategory) {
    this.selectedCategory.set(cat);
    this.searchTerm.set('');
    if (cat.id === 'corresponsal') {
      this.view.set('corresponsal-ops');
    } else if (cat.id === 'paqueteria') {
      this.view.set('paqueteria-ops');
    } else {
      this.view.set('category');
    }
  }

  selectCorresponsalOp(opId: string) {
    this.selectedCorresponsalOp.set(opId);
    this.view.set('category');
  }

  selectPaqueteriaOp(opId: string) {
    this.selectedPaqueteriaOp.set(opId);
    this.view.set('category');
  }

  selectProvider(provider: ServiceProvider) {
    this.selectedProvider.set(provider);
    this.view.set('payment');
  }

  setQuickAmount(amount: number) {
    this.paymentAmount.set(amount);
  }

  goToConfirm() {
    if (!this.paymentRef() || !this.paymentAmount()) return;
    this.view.set('confirm');
  }

  processPayment() {
    this.processing.set(true);
    setTimeout(() => {
      const tx: Transaction = {
        id: 'TXN-' + String(Date.now()).slice(-6),
        categoryId: this.selectedCategory()!.id,
        categoryName: this.selectedCategory()!.name,
        providerName: this.selectedProvider()!.name,
        reference: this.paymentRef(),
        amount: this.paymentAmount()!,
        date: new Date(),
        status: 'completed',
      };
      this.transactions.update(list => [tx, ...list]);
      this.processing.set(false);
      this.view.set('receipt');
    }, 2200);
  }

  showHistory() {
    this.view.set('history');
  }

  getStatusLabel(status: string): string {
    const map: Record<string, string> = { completed: 'Exitoso', pending: 'Pendiente', failed: 'Fallido' };
    return map[status] ?? status;
  }

  getStatusColor(status: string): string {
    const map: Record<string, string> = {
      completed: 'bg-emerald-100 text-emerald-700',
      pending: 'bg-amber-100 text-amber-700',
      failed: 'bg-red-100 text-red-700',
    };
    return map[status] ?? '';
  }

  getCategoryIcon(catId: string): string {
    return CATEGORIES.find(c => c.id === catId)?.icon ?? 'receipt';
  }

  getCategoryGradient(catId: string): string {
    return CATEGORIES.find(c => c.id === catId)?.gradient ?? 'from-gray-500 to-gray-600';
  }

  getReferenceLabel(): string {
    const catId = this.selectedCategory()?.id;
    if (catId === 'recargas' || catId === 'apuestas') return 'Número de celular / cuenta';
    if (catId === 'giros') return 'Número de documento destinatario';
    if (catId === 'paqueteria') return 'Número de guía o documento';
    return 'Número de referencia / factura';
  }

  private resetForm() {
    this.selectedCategory.set(null);
    this.selectedProvider.set(null);
    this.selectedCorresponsalOp.set('');
    this.selectedPaqueteriaOp.set('');
    this.searchTerm.set('');
    this.paymentRef.set('');
    this.paymentAmount.set(null);
    this.paymentPhone.set('');
  }
}
