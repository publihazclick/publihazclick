import { Component, inject, signal, OnInit, ChangeDetectionStrategy, PLATFORM_ID, input } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { RouterModule } from '@angular/router';
import { environment } from '../../../environments/environment';

interface PromoPackage {
  id: string;
  name: string;
  label: string;
  price: number;
  icon: string;
  recommended: boolean;
  colorClass: string;
  borderClass: string;
  bgGradient: string;
  features: string[];
  ptcBonus: number;
  referralBonus: number;
  whatsappMsg: string;
}

@Component({
  selector: 'app-package-promo-modal',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, RouterModule],
  templateUrl: './package-promo-modal.component.html',
})
export class PackagePromoModalComponent implements OnInit {
  private readonly platformId = inject(PLATFORM_ID);

  /** Ruta del botón "Ver todos los paquetes". Por defecto /register (landing). */
  readonly packagesRoute = input('/register');

  readonly visible = signal(false);

  readonly promoPackages: PromoPackage[] = [
    {
      id: 'basic',
      name: 'Básico',
      label: 'Plan Básico',
      price: 25,
      icon: 'star',
      recommended: false,
      colorClass: 'text-slate-300',
      borderClass: 'border-white/10',
      bgGradient: 'from-white/5 to-transparent',
      features: [
        '120 vistas PTC garantizadas',
        '20.000 impresiones de banner',
        '9.000 vistas de post',
        '+5% en tus ganancias PTC',
        '+5% en comisiones de referidos',
      ],
      ptcBonus: 5,
      referralBonus: 5,
      whatsappMsg: `Hola! Me interesa el paquete *Básico ($25 USD)* de Publihazclick. ¿Me pueden dar más información y cómo adquirirlo?`,
    },
    {
      id: 'basic_plus',
      name: 'Básico Plus',
      label: 'Plan Recomendado',
      price: 50,
      icon: 'auto_awesome',
      recommended: true,
      colorClass: 'text-primary',
      borderClass: 'border-primary/40',
      bgGradient: 'from-primary/10 to-transparent',
      features: [
        '250 vistas PTC garantizadas',
        '40.000 impresiones de banner',
        '20.000 vistas de post',
        '+10% en tus ganancias PTC',
        '+10% en comisiones de referidos',
      ],
      ptcBonus: 10,
      referralBonus: 10,
      whatsappMsg: `Hola! Me interesa el paquete *Básico Plus ($50 USD)* de Publihazclick. ¿Me pueden dar más información y cómo adquirirlo?`,
    },
  ];

  ngOnInit(): void {
    if (isPlatformBrowser(this.platformId)) {
      this.visible.set(true);
    }
  }

  close(): void {
    this.visible.set(false);
  }

  getWhatsappLink(msg: string): string {
    return `https://wa.me/${environment.whatsappNumber}?text=${encodeURIComponent(msg)}`;
  }
}
