import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { AdminPtcTaskService } from '../../core/services/admin-ptc-task.service';
import { CurrencyService } from '../../core/services/currency.service';
import { UserTrackingService } from '../../core/services/user-tracking.service';
import { WalletStateService } from '../../core/services/wallet-state.service';
import { PtcModalComponent, PtcAd } from '../ptc-modal/ptc-modal.component';
import { PtcAdType, AdLocation } from '../../core/models/admin.model';

function extractYoutubeId(url: string | null | undefined): string {
  if (!url) return '';
  const match = url.match(
    /(?:youtube\.com\/(?:[^/\n\s]+\/\S+\/|(?:v|e(?:mbed)?)\/|\S*?[?&]v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})/
  );
  return match?.[1] ?? '';
}

interface PtcAdCard {
  id: string;
  title: string;
  description: string;
  advertiserName: string;
  advertiserType: 'company' | 'person';
  imageUrl: string;
  youtubeVideoId: string;
  destinationUrl?: string;
  adType: PtcAdType;
  rewardCOP: number;
  dailyLimit: number;
  totalClicks: number;
  status: string;
}

@Component({
  selector: 'app-ptc-ads',
  standalone: true,
  imports: [CommonModule, RouterModule, PtcModalComponent],
  templateUrl: './ptc-ads.component.html',
  styleUrl: './ptc-ads.component.scss'
})
export class PtcAdsComponent implements OnInit {
  private ptcService = inject(AdminPtcTaskService);
  protected currencyService = inject(CurrencyService);
  protected userTracking = inject(UserTrackingService);
  protected walletService = inject(WalletStateService);
  
  ads = signal<PtcAdCard[]>([]);
  loading = signal<boolean>(true);
  error = signal<string | null>(null);
  
  // Modal state
  isModalOpen = signal(false);
  selectedAd = signal<PtcAd | null>(null);
  
  // Estado de anuncios vistos
  viewedAds = signal<Set<string>>(new Set());

  // Categorías expandidas
  expandedCategories = signal<Set<string>>(new Set());

  isExpanded(type: string): boolean {
    return this.expandedCategories().has(type);
  }

  toggleExpanded(type: string): void {
    this.expandedCategories.update(set => {
      const next = new Set(set);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }

  getCardNgClass(index: number, type: string): Record<string, boolean> {
    if (this.isExpanded(type) || index < 2) return {};
    if (index < 4) return { hidden: true, 'md:block': true };
    return { hidden: true };
  }

  ngOnInit(): void {
    this.loadPtcAds();
  }

  async loadPtcAds(): Promise<void> {
    try {
      this.loading.set(true);
      this.error.set(null);

      // Solo cargar anuncios configurados para la landing
      const result = await this.ptcService.getPtcTasks(
        { status: 'active', location: 'landing' },
        { page: 1, pageSize: 16 }
      );

      if (result.data && result.data.length > 0) {
        const mappedAds: PtcAdCard[] = result.data.map(task => {
          // Usar el tipo de anuncio para obtener la recompensa correcta
          const adType = task.ad_type || 'mini';
          const rewardCOP = this.adTypeRewards[adType] || task.reward || 0;
          return {
            id: task.id,
            title: task.title,
            description: task.description || '',
            advertiserName: task.advertiser_username || task.title,
            advertiserType: 'company' as const,
            imageUrl: task.image_url || 'https://via.placeholder.com/300x200?text=Anuncio',
            youtubeVideoId: extractYoutubeId(task.youtube_url),
            destinationUrl: task.url || '',
            adType: adType,
            rewardCOP: rewardCOP,
            dailyLimit: task.daily_limit || 0,
            totalClicks: task.total_clicks || 0,
            status: task.status
          };
        });
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
      // Mega Anuncios (2000 COP)
      {
        id: '1',
        title: 'Promo Fin de Semana - Tienda Online',
        description: 'Ofertas exclusivas este fin de semana',
        advertiserName: 'Mileniustore',
        advertiserType: 'company',
        imageUrl: 'https://images.unsplash.com/photo-1472851294608-062f824d29cc?w=400&h=300&fit=crop',
        youtubeVideoId: 'dQw4w9WgXcQ',
        adType: 'mega',
        rewardCOP: 2000,
        dailyLimit: 100,
        totalClicks: 450,
        status: 'active'
      },
      {
        id: '5',
        title: 'Restaurante Los Parados',
        description: 'Los mejores platos típicos',
        advertiserName: 'Restaurante Los Parados',
        advertiserType: 'company',
        imageUrl: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=400&h=300&fit=crop',
        youtubeVideoId: 'jfKfPfyJRdk',
        adType: 'mega',
        rewardCOP: 2000,
        dailyLimit: 120,
        totalClicks: 580,
        status: 'active'
      },
      {
        id: '7',
        title: 'Gran Venta de Electrónicos',
        description: 'Hasta 50% de descuento',
        advertiserName: 'TecnoWorld',
        advertiserType: 'company',
        imageUrl: 'https://images.unsplash.com/photo-1498049794561-7780e7231661?w=400&h=300&fit=crop',
        youtubeVideoId: '5qap5aO4i9A',
        adType: 'mega',
        rewardCOP: 2000,
        dailyLimit: 80,
        totalClicks: 320,
        status: 'active'
      },
      {
        id: '8',
        title: 'Spa & Wellness Centro',
        description: 'Relájate con nuestros servicios',
        advertiserName: 'Relax & Vida',
        advertiserType: 'company',
        imageUrl: 'https://images.unsplash.com/photo-1544161515-4ab6ce6db874?w=400&h=300&fit=crop',
        youtubeVideoId: 'DWcJFNfaw9c',
        adType: 'mega',
        rewardCOP: 2000,
        dailyLimit: 60,
        totalClicks: 210,
        status: 'active'
      },
      // Standard 400 (400 COP)
      {
        id: '2',
        title: 'Nueva Colección de Ropa',
        description: 'Moda colombiana al mejor precio',
        advertiserName: 'Fashion Colombia',
        advertiserType: 'company',
        imageUrl: 'https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=400&h=300&fit=crop',
        youtubeVideoId: 'KG4otu6nO1I',
        adType: 'standard_400',
        rewardCOP: 400,
        dailyLimit: 80,
        totalClicks: 320,
        status: 'active'
      },
      {
        id: '9',
        title: 'Zapatillas Importadas',
        description: 'Las mejores marcas importadas',
        advertiserName: 'ShoeStore',
        advertiserType: 'company',
        imageUrl: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=400&h=300&fit=crop',
        youtubeVideoId: 'VGg46O4GgiM',
        adType: 'standard_400',
        rewardCOP: 400,
        dailyLimit: 70,
        totalClicks: 280,
        status: 'active'
      },
      {
        id: '10',
        title: 'Accesorios para Celulares',
        description: 'Protege y personaliza tu celular',
        advertiserName: 'CelularAccesories',
        advertiserType: 'company',
        imageUrl: 'https://images.unsplash.com/photo-1601784551446-20c9e07cdbdb?w=400&h=300&fit=crop',
        youtubeVideoId: '9bZkp7q19f0',
        adType: 'standard_400',
        rewardCOP: 400,
        dailyLimit: 90,
        totalClicks: 410,
        status: 'active'
      },
      {
        id: '11',
        title: 'Muebles para el Hogar',
        description: 'Renueva tu hogar con estilo',
        advertiserName: 'HogarExpress',
        advertiserType: 'company',
        imageUrl: 'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=400&h=300&fit=crop',
        youtubeVideoId: 'jNQXAC9IVRw',
        adType: 'standard_400',
        rewardCOP: 400,
        dailyLimit: 50,
        totalClicks: 190,
        status: 'active'
      },
      // Standard 600 (600 COP)
      {
        id: '3',
        title: 'Servicio de Delivery Express',
        description: 'Entrega rápida a domicilio',
        advertiserName: 'Juan Pérez',
        advertiserType: 'person',
        imageUrl: 'https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?w=400&h=300&fit=crop',
        youtubeVideoId: 'fJ9rUzIMcZQ',
        adType: 'standard_600',
        rewardCOP: 600,
        dailyLimit: 60,
        totalClicks: 180,
        status: 'active'
      },
      {
        id: '12',
        title: 'Clases de Guitarra Online',
        description: 'Aprende guitarra desde casa',
        advertiserName: 'Carlos Música',
        advertiserType: 'person',
        imageUrl: 'https://images.unsplash.com/photo-1510915361894-db8b60106cb1?w=400&h=300&fit=crop',
        youtubeVideoId: 'hT_nvWreIhg',
        adType: 'standard_600',
        rewardCOP: 600,
        dailyLimit: 40,
        totalClicks: 150,
        status: 'active'
      },
      {
        id: '13',
        title: 'Servicios de Limpieza',
        description: 'Tu hogar siempre impecable',
        advertiserName: 'LimpioMax',
        advertiserType: 'company',
        imageUrl: 'https://images.unsplash.com/photo-1581578731548-c64695b97835?w=400&h=300&fit=crop',
        youtubeVideoId: 'kXYiU_JCYtU',
        adType: 'standard_600',
        rewardCOP: 600,
        dailyLimit: 55,
        totalClicks: 220,
        status: 'active'
      },
      {
        id: '14',
        title: 'Peluquería Canina a Domicilio',
        description: 'Cuidamos a tu mascota con amor',
        advertiserName: 'MascotasFelices',
        advertiserType: 'company',
        imageUrl: 'https://images.unsplash.com/photo-1516734212186-a967f81ad0d7?w=400&h=300&fit=crop',
        youtubeVideoId: 'RgKAFKcjG3w',
        adType: 'standard_600',
        rewardCOP: 600,
        dailyLimit: 35,
        totalClicks: 95,
        status: 'active'
      },
      // Mini Anuncios (83.33 COP)
      {
        id: '4',
        title: 'Cupón Descuento 20%',
        description: 'Descuento exclusivo en tecnología',
        advertiserName: 'TechnoShop',
        advertiserType: 'company',
        imageUrl: 'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=400&h=300&fit=crop',
        youtubeVideoId: 'OPf0YbXqDm0',
        adType: 'mini',
        rewardCOP: 83.33,
        dailyLimit: 50,
        totalClicks: 120,
        status: 'active'
      },
      {
        id: '6',
        title: 'Clases de Inglés Online',
        description: 'Aprende inglés fácil y rápido',
        advertiserName: 'María García',
        advertiserType: 'person',
        imageUrl: 'https://images.unsplash.com/photo-1546410531-bb4caa6b424d?w=400&h=300&fit=crop',
        youtubeVideoId: 'jofNRWkoRGY',
        adType: 'mini',
        rewardCOP: 83.33,
        dailyLimit: 30,
        totalClicks: 85,
        status: 'active'
      },
      {
        id: '15',
        title: 'Desayunos Sorpresa',
        description: 'Sorprende a quien más quieres',
        advertiserName: 'SweetDelivery',
        advertiserType: 'company',
        imageUrl: 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=400&h=300&fit=crop',
        youtubeVideoId: '9bZkp7q19f0',
        adType: 'mini',
        rewardCOP: 83.33,
        dailyLimit: 45,
        totalClicks: 180,
        status: 'active'
      },
      {
        id: '16',
        title: 'Reparación de Computadores',
        description: 'Servicio técnico profesional',
        advertiserName: 'TechFix',
        advertiserType: 'company',
        imageUrl: 'https://images.unsplash.com/photo-1587614382346-4ec70e388b28?w=400&h=300&fit=crop',
        youtubeVideoId: 'kJQP7kiw5Fk',
        adType: 'mini',
        rewardCOP: 83.33,
        dailyLimit: 25,
        totalClicks: 65,
        status: 'active'
      }
    ];
  }

  getAdTypeLabel(type: PtcAdType): string {
    const labels: Record<PtcAdType, string> = {
      'mega': 'Mega Anuncio',
      'standard_400': 'Anuncio 400',
      'standard_600': 'Anuncio 600',
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

  // Valores de recompensa por tipo de anuncio
  private readonly adTypeRewards: Record<string, number> = {
    'mega': 2000,
    'standard_600': 600,
    'standard_400': 400,
    'mini': 83.33
  };

  getRewardDisplay(rewardCOP: number): string {
    // Convert COP to selected currency with decimals using the currency service
    return this.currencyService.formatFromCOP(rewardCOP, 2);
  }

  getAdsByType(type: PtcAdType): PtcAdCard[] {
    return this.ads().filter(ad => ad.adType === type);
  }

  // Modal methods
  openAdModal(ad: PtcAdCard): void {
    // Verificar si ya fue visto
    if (this.userTracking.hasViewedAd(ad.id)) {
      // No abrir el modal si ya fue visto
      return;
    }
    
    // Pass the full COP reward to the modal
    const ptcAd: PtcAd = {
      id: ad.id,
      title: ad.title,
      description: ad.description,
      advertiserName: ad.advertiserName,
      advertiserType: ad.advertiserType,
      imageUrl: ad.imageUrl,
      youtubeVideoId: ad.youtubeVideoId,
      destinationUrl: ad.destinationUrl || '',
      adType: ad.adType,
      rewardCOP: ad.rewardCOP,
      duration: 60
    };
    this.selectedAd.set(ptcAd);
    this.isModalOpen.set(true);
  }

  closeModal(): void {
    this.isModalOpen.set(false);
    this.selectedAd.set(null);
  }

  // Verificar si un anuncio ya fue visto
  isAdViewed(adId: string): boolean {
    return this.userTracking.hasViewedAd(adId);
  }

  // Obtener todos los IDs de anuncios vistos
  getViewedAds(): Set<string> {
    const ads = this.ads();
    const viewed = new Set<string>();
    ads.forEach(ad => {
      if (this.userTracking.hasViewedAd(ad.id)) {
        viewed.add(ad.id);
      }
    });
    return viewed;
  }

  onRewardClaimed(event: { walletAmount: number; donationAmount: number }): void {
    // Usar el servicio de wallet para actualizar
    this.walletService.updateWallet(event.walletAmount);
    this.walletService.updateDonations(event.donationAmount);
    
    // Recargar los datos de sesión de anuncios
    this.userTracking.recordAdView(this.selectedAd()?.id || '');
    
    // Show success message (could add a toast here)
    console.log('Recompensa reclamada:', event);
  }
}
