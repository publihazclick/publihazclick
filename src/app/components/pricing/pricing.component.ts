import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { AdminPackageService } from '../../core/services/admin-package.service';
import { CurrencyService } from '../../core/services/currency.service';
import { Package } from '../../core/models/admin.model';

@Component({
  selector: 'app-pricing',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './pricing.component.html',
  styleUrl: './pricing.component.scss'
})
export class PricingComponent implements OnInit {
  private packageService = inject(AdminPackageService);
  protected currencyService = inject(CurrencyService);
  
  packages = signal<Package[]>([]);
  loading = signal<boolean>(true);
  error = signal<string | null>(null);

  ngOnInit(): void {
    this.loadPackages();
  }

  async loadPackages(): Promise<void> {
    try {
      this.loading.set(true);
      this.error.set(null);
      
      const packagesData = await this.packageService.getPackages();
      
      // Ordenar por display_order
      const sortedPackages = packagesData
        .filter(p => p.is_active)
        .sort((a, b) => a.display_order - b.display_order);
      
      if (sortedPackages.length > 0) {
        this.packages.set(sortedPackages);
      } else {
        // Fallback: usar paquetes hardcodeados si la base de datos no tiene datos
        this.packages.set(this.getDefaultPackages());
      }
    } catch (err: any) {
      console.error('Error loading packages:', err);
      // En caso de error, usar paquetes por defecto
      this.packages.set(this.getDefaultPackages());
    } finally {
      this.loading.set(false);
    }
  }

  getDefaultPackages(): Package[] {
    return [
      {
        id: 'basic',
        name: 'Básico',
        description: 'Perfecto para comenzar tu estrategia de publicidad online.',
        package_type: 'basic',
        price: 25,
        duration_days: 30,
        currency: 'USD',
        features: [
          '20.000 vistas banner mensuales',
          '9.000 vistas post',
          '120 vistas PTC',
          'Reporte básico de métricas',
          'Segmentación por país',
          'Duración: 30 días'
        ],
        min_ptc_visits: 120,
        min_banner_views: 20000,
        included_ptc_ads: 5,
        has_clickable_banner: true,
        banner_clicks_limit: 9000,
        banner_impressions_limit: 20000,
        daily_ptc_limit: 10,
        max_ptc_ads: 5,
        max_banner_ads: 1,
        max_campaigns: 1,
        ptc_reward_bonus: 5,
        banner_reward_bonus: 0,
        referral_bonus: 5,
        is_active: true,
        display_order: 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      {
        id: 'basic_plus',
        name: 'Básico Plus',
        description: 'Plan recomendado para maximizar tu alcance publicitario.',
        package_type: 'premium',
        price: 50,
        duration_days: 30,
        currency: 'USD',
        features: [
          '40.000 vistas banner mensuales',
          '20.000 vistas post',
          '250 vistas PTC',
          'Reporte detallado de conversiones',
          'Segmentación avanzada',
          'Banner en rotación principal',
          'Duración: 30 días'
        ],
        min_ptc_visits: 250,
        min_banner_views: 40000,
        included_ptc_ads: 15,
        has_clickable_banner: true,
        banner_clicks_limit: 20000,
        banner_impressions_limit: 40000,
        daily_ptc_limit: 20,
        max_ptc_ads: 15,
        max_banner_ads: 3,
        max_campaigns: 3,
        ptc_reward_bonus: 10,
        banner_reward_bonus: 5,
        referral_bonus: 10,
        is_active: true,
        display_order: 2,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      {
        id: 'advanced',
        name: 'Avanzado',
        description: 'Para profesionales que buscan resultados avanzados.',
        package_type: 'enterprise',
        price: 100,
        duration_days: 30,
        currency: 'USD',
        features: [
          '80.000 vistas banner mensuales',
          '40.000 vistas post',
          '500 vistas PTC',
          'Analytics en tiempo real',
          'Segmentación premium por intereses',
          'Prioridad en ubicaciones',
          'A/B Testing de anuncios',
          'Soporte prioritario 24/7',
          'Duración: 30 días'
        ],
        min_ptc_visits: 500,
        min_banner_views: 80000,
        included_ptc_ads: 40,
        has_clickable_banner: true,
        banner_clicks_limit: 40000,
        banner_impressions_limit: 80000,
        daily_ptc_limit: 40,
        max_ptc_ads: 40,
        max_banner_ads: 10,
        max_campaigns: 10,
        ptc_reward_bonus: 25,
        banner_reward_bonus: 15,
        referral_bonus: 20,
        is_active: true,
        display_order: 3,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      {
        id: 'advanced_pro',
        name: 'Avanzado Pro',
        description: 'El paquete máximo con beneficios empresariales exclusivos.',
        package_type: 'custom',
        price: 150,
        duration_days: 30,
        currency: 'USD',
        features: [
          '120.000 vistas banner mensuales',
          '60.000 vistas post',
          '750 vistas PTC',
          'Dashboard empresarial completo',
          'Consultoría de marketing incluida',
          'Videos promocionales destacados',
          'Campañas personalizadas multicanal',
          'API de integración avanzada',
          'Gerente de cuenta dedicado',
          'Duración: 30 días'
        ],
        min_ptc_visits: 750,
        min_banner_views: 120000,
        included_ptc_ads: 100,
        has_clickable_banner: true,
        banner_clicks_limit: 60000,
        banner_impressions_limit: 120000,
        daily_ptc_limit: 60,
        max_ptc_ads: 999999,
        max_banner_ads: 999999,
        max_campaigns: 999999,
        ptc_reward_bonus: 50,
        banner_reward_bonus: 25,
        referral_bonus: 30,
        is_active: true,
        display_order: 4,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
    ];
  }

  getFeaturesList(features: string[] | string | null): string[] {
    if (!features) return [];
    if (Array.isArray(features)) return features;
    try {
      return JSON.parse(features as string);
    } catch {
      return [];
    }
  }

  getPriceDisplay(price: number, currency: string): string {
    if (price === 0) return 'GRATIS';
    // Usar el servicio de moneda para convertir y formatear
    return this.currencyService.format(price);
  }

  getPackageTypeLabel(type: string): string {
    const labels: Record<string, string> = {
      'basic': 'Plan Básico',
      'premium': 'Plan Básico Plus',
      'enterprise': 'Plan Avanzado',
      'custom': 'Plan Avanzado Pro'
    };
    return labels[type] || type;
  }

  isPopularPackage(packageType: string): boolean {
    return packageType === 'premium';
  }
}
