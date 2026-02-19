import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { AdminPackageService } from '../../core/services/admin-package.service';
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
        id: 'starter',
        name: 'Starter',
        description: 'Perfecto para empezar a ganar dinero con anuncios PTC.',
        package_type: 'basic',
        price: 25,
        duration_days: 30,
        currency: 'USD',
        features: ['Acceso a Mega Anuncios PTC', 'Banner clickeable', 'Sistema de referidos'],
        min_ptc_visits: 50,
        min_banner_views: 100,
        included_ptc_ads: 5,
        has_clickable_banner: true,
        banner_clicks_limit: 500,
        banner_impressions_limit: 1000,
        daily_ptc_limit: 5,
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
        id: 'growth',
        name: 'Growth',
        description: 'Maximiza tus ganancias con más beneficios y límites.',
        package_type: 'premium',
        price: 50,
        duration_days: 30,
        currency: 'USD',
        features: ['Acceso a Mega Anuncios y Standard', 'Más beneficios', 'Bonos aumentados'],
        min_ptc_visits: 150,
        min_banner_views: 300,
        included_ptc_ads: 15,
        has_clickable_banner: true,
        banner_clicks_limit: 1500,
        banner_impressions_limit: 3000,
        daily_ptc_limit: 10,
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
        id: 'business',
        name: 'Business',
        description: 'Para profesionales del marketing digital.',
        package_type: 'enterprise',
        price: 100,
        duration_days: 30,
        currency: 'USD',
        features: ['Acceso a todos los tipos de anuncios', 'Soporte prioritario', 'API de gestión'],
        min_ptc_visits: 400,
        min_banner_views: 800,
        included_ptc_ads: 40,
        has_clickable_banner: true,
        banner_clicks_limit: 4000,
        banner_impressions_limit: 8000,
        daily_ptc_limit: 25,
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
        id: 'enterprise-pro',
        name: 'Enterprise Pro',
        description: 'El paquete máximo con acceso ilimitado.',
        package_type: 'custom',
        price: 150,
        duration_days: 30,
        currency: 'USD',
        features: ['Acceso ilimitado', 'API', 'Asesoría dedicada', 'Soporte VIP'],
        min_ptc_visits: 1000,
        min_banner_views: 2000,
        included_ptc_ads: 100,
        has_clickable_banner: true,
        banner_clicks_limit: 10000,
        banner_impressions_limit: 20000,
        daily_ptc_limit: 50,
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
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: currency || 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(price);
  }

  getPackageTypeLabel(type: string): string {
    const labels: Record<string, string> = {
      'basic': 'Plan Básico',
      'premium': 'Plan Premium',
      'enterprise': 'Plan Enterprise',
      'custom': 'Plan Personalizado'
    };
    return labels[type] || type;
  }

  isPopularPackage(packageType: string): boolean {
    return packageType === 'premium';
  }
}
