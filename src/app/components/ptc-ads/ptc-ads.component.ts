import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { AdminPtcTaskService } from '../../core/services/admin-ptc-task.service';
import { CurrencyService } from '../../core/services/currency.service';
import { PtcAdType } from '../../core/models/admin.model';

interface PtcAdCard {
  id: string;
  title: string;
  advertiserName: string;
  advertiserType: 'company' | 'person';
  imageUrl: string;
  adType: PtcAdType;
  rewardUSD: number;
  dailyLimit: number;
  totalClicks: number;
  status: string;
}

@Component({
  selector: 'app-ptc-ads',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './ptc-ads.component.html',
  styleUrl: './ptc-ads.component.scss'
})
export class PtcAdsComponent implements OnInit {
  private ptcService = inject(AdminPtcTaskService);
  protected currencyService = inject(CurrencyService);
  
  ads = signal<PtcAdCard[]>([]);
  loading = signal<boolean>(true);
  error = signal<string | null>(null);

  ngOnInit(): void {
    this.loadPtcAds();
  }

  async loadPtcAds(): Promise<void> {
    try {
      this.loading.set(true);
      this.error.set(null);
      
      const result = await this.ptcService.getPtcTasks(
        { status: 'active' },
        { page: 1, pageSize: 12 }
      );
      
      if (result.data && result.data.length > 0) {
        const mappedAds: PtcAdCard[] = result.data.map(task => ({
          id: task.id,
          title: task.title,
          advertiserName: 'Anunciante',
          advertiserType: 'company',
          imageUrl: task.image_url || 'https://via.placeholder.com/300x200?text=Anuncio',
          adType: task.ad_type || 'mini',
          rewardUSD: task.reward || 0,
          dailyLimit: task.daily_limit || 0,
          totalClicks: task.total_clicks || 0,
          status: task.status
        }));
        this.ads.set(mappedAds);
      } else {
        this.ads.set(this.getSampleAds());
      }
    } catch (err: any) {
      console.error('Error loading PTC ads:', err);
      this.ads.set(this.getSampleAds());
    } finally {
      this.loading.set(false);
    }
  }

  getSampleAds(): PtcAdCard[] {
    return [
      // Mega Anuncios - $2 USD
      {
        id: '1',
        title: 'Promo Fin de Semana - Tienda Online',
        advertiserName: 'Mileniustore',
        advertiserType: 'company',
        imageUrl: 'https://images.unsplash.com/photo-1472851294608-062f824d29cc?w=400&h=300&fit=crop',
        adType: 'mega',
        rewardUSD: 2,
        dailyLimit: 100,
        totalClicks: 450,
        status: 'active'
      },
      {
        id: '5',
        title: 'Restaurante Los Parados',
        advertiserName: 'Restaurante Los Parados',
        advertiserType: 'company',
        imageUrl: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=400&h=300&fit=crop',
        adType: 'mega',
        rewardUSD: 2,
        dailyLimit: 120,
        totalClicks: 580,
        status: 'active'
      },
      {
        id: '7',
        title: 'Gran Venta de Electrónicos',
        advertiserName: 'TecnoWorld',
        advertiserType: 'company',
        imageUrl: 'https://images.unsplash.com/photo-1498049794561-7780e7231661?w=400&h=300&fit=crop',
        adType: 'mega',
        rewardUSD: 2,
        dailyLimit: 80,
        totalClicks: 320,
        status: 'active'
      },
      {
        id: '8',
        title: 'Spa & Wellness Centro',
        advertiserName: 'Relax & Vida',
        advertiserType: 'company',
        imageUrl: 'https://images.unsplash.com/photo-1544161515-4ab6ce6db874?w=400&h=300&fit=crop',
        adType: 'mega',
        rewardUSD: 2,
        dailyLimit: 60,
        totalClicks: 210,
        status: 'active'
      },
      // Mega 400 - $1.50 USD
      {
        id: '2',
        title: 'Nueva Colección de Ropa',
        advertiserName: 'Fashion Colombia',
        advertiserType: 'company',
        imageUrl: 'https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=400&h=300&fit=crop',
        adType: 'standard_400',
        rewardUSD: 1.50,
        dailyLimit: 80,
        totalClicks: 320,
        status: 'active'
      },
      {
        id: '9',
        title: 'Zapatillas Importadas',
        advertiserName: 'ShoeStore',
        advertiserType: 'company',
        imageUrl: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=400&h=300&fit=crop',
        adType: 'standard_400',
        rewardUSD: 1.50,
        dailyLimit: 70,
        totalClicks: 280,
        status: 'active'
      },
      {
        id: '10',
        title: 'Accesorios para Celulares',
        advertiserName: 'CelularAccesories',
        advertiserType: 'company',
        imageUrl: 'https://images.unsplash.com/photo-1601784551446-20c9e07cdbdb?w=400&h=300&fit=crop',
        adType: 'standard_400',
        rewardUSD: 1.50,
        dailyLimit: 90,
        totalClicks: 410,
        status: 'active'
      },
      {
        id: '11',
        title: 'Muebles para el Hogar',
        advertiserName: 'HogarExpress',
        advertiserType: 'company',
        imageUrl: 'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=400&h=300&fit=crop',
        adType: 'standard_400',
        rewardUSD: 1.50,
        dailyLimit: 50,
        totalClicks: 190,
        status: 'active'
      },
      // Mega 600 - $1.80 USD
      {
        id: '3',
        title: 'Servicio de Delivery Express',
        advertiserName: 'Juan Pérez',
        advertiserType: 'person',
        imageUrl: 'https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?w=400&h=300&fit=crop',
        adType: 'standard_600',
        rewardUSD: 1.80,
        dailyLimit: 60,
        totalClicks: 180,
        status: 'active'
      },
      {
        id: '12',
        title: 'Clases de Guitarra Online',
        advertiserName: 'Carlos Música',
        advertiserType: 'person',
        imageUrl: 'https://images.unsplash.com/photo-1510915361894-db8b60106cb1?w=400&h=300&fit=crop',
        adType: 'standard_600',
        rewardUSD: 1.80,
        dailyLimit: 40,
        totalClicks: 150,
        status: 'active'
      },
      {
        id: '13',
        title: 'Servicios de Limpieza',
        advertiserName: 'LimpioMax',
        advertiserType: 'company',
        imageUrl: 'https://images.unsplash.com/photo-1581578731548-c64695b97835?w=400&h=300&fit=crop',
        adType: 'standard_600',
        rewardUSD: 1.80,
        dailyLimit: 55,
        totalClicks: 220,
        status: 'active'
      },
      {
        id: '14',
        title: 'Peluquería Canina a Domicilio',
        advertiserName: 'MascotasFelices',
        advertiserType: 'company',
        imageUrl: 'https://images.unsplash.com/photo-1516734212186-a967f81ad0d7?w=400&h=300&fit=crop',
        adType: 'standard_600',
        rewardUSD: 1.80,
        dailyLimit: 35,
        totalClicks: 95,
        status: 'active'
      },
      // Mini Anuncios - $0.60-$0.80 USD
      {
        id: '4',
        title: 'Cupón Descuento 20%',
        advertiserName: 'TechnoShop',
        advertiserType: 'company',
        imageUrl: 'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=400&h=300&fit=crop',
        adType: 'mini',
        rewardUSD: 0.80,
        dailyLimit: 50,
        totalClicks: 120,
        status: 'active'
      },
      {
        id: '6',
        title: 'Clases de Inglés Online',
        advertiserName: 'María García',
        advertiserType: 'person',
        imageUrl: 'https://images.unsplash.com/photo-1546410531-bb4caa6b424d?w=400&h=300&fit=crop',
        adType: 'mini',
        rewardUSD: 0.60,
        dailyLimit: 30,
        totalClicks: 85,
        status: 'active'
      },
      {
        id: '15',
        title: 'Desayunos Sorpresa',
        advertiserName: 'SweetDelivery',
        advertiserType: 'company',
        imageUrl: 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=400&h=300&fit=crop',
        adType: 'mini',
        rewardUSD: 0.70,
        dailyLimit: 45,
        totalClicks: 180,
        status: 'active'
      },
      {
        id: '16',
        title: 'Reparación de Computadores',
        advertiserName: 'TechFix',
        advertiserType: 'company',
        imageUrl: 'https://images.unsplash.com/photo-1587614382346-4ec70e388b28?w=400&h=300&fit=crop',
        adType: 'mini',
        rewardUSD: 0.80,
        dailyLimit: 25,
        totalClicks: 65,
        status: 'active'
      }
    ];
  }

  getAdTypeLabel(type: PtcAdType): string {
    const labels: Record<PtcAdType, string> = {
      'mega': 'Mega Anuncio',
      'standard_400': 'Mega 400',
      'standard_600': 'Mega 600',
      'mini': 'Mini Anuncio'
    };
    return labels[type] || type;
  }

  getAdTypeClass(type: PtcAdType): string {
    switch (type) {
      case 'mega':
        return 'bg-purple-500';
      case 'standard_400':
        return 'bg-blue-500';
      case 'standard_600':
        return 'bg-cyan-500';
      case 'mini':
        return 'bg-green-500';
      default:
        return 'bg-gray-500';
    }
  }

  getRewardDisplay(rewardUSD: number): string {
    return this.currencyService.format(rewardUSD);
  }

  getAdsByType(type: PtcAdType): PtcAdCard[] {
    return this.ads().filter(ad => ad.adType === type);
  }
}
