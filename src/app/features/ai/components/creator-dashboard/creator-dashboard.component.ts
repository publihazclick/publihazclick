import { Component, ChangeDetectionStrategy, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { ProfileService } from '../../../../core/services/profile.service';
import { AiWalletService } from '../../../../core/services/ai-wallet.service';

interface QuickAction {
  icon: string;
  iconBg: string;
  iconColor: string;
  title: string;
  description: string;
  route: string;
}

interface RecentProject {
  icon: string;
  title: string;
  type: string;
  status: 'in_progress' | 'completed' | 'draft';
  timeAgo: string;
}

interface Template {
  title: string;
  description: string;
}

@Component({
  selector: 'app-creator-dashboard',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './creator-dashboard.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CreatorDashboardComponent implements OnInit {
  private readonly profileService = inject(ProfileService);
  private readonly walletService = inject(AiWalletService);
  readonly profile = this.profileService.profile;
  readonly walletBalance = this.walletService.balance;

  readonly sidebarOpen = signal(false);

  async ngOnInit(): Promise<void> {
    await this.walletService.loadWallet();
  }

  readonly menuItems = [
    { icon: 'dashboard', label: 'Panel', route: '/advertiser/ai/creator', active: true },
    { icon: 'videocam', label: 'Video IA', route: '/advertiser/ai/video-studio', badge: 'Popular' },
    { icon: 'image', label: 'Imagen IA', route: '/advertiser/ai/image' },
    { icon: 'description', label: 'Documento IA', route: '', soon: true },
    { icon: 'chat', label: 'Chatbot IA', route: '', soon: true },
    { icon: 'language', label: 'Web IA', route: '', soon: true },
    { icon: 'mic', label: 'Voz IA', route: '', soon: true },
    { icon: 'music_note', label: 'Música IA', route: '', soon: true },
    { icon: 'storefront', label: 'Marketplace', route: '', soon: true },
    { icon: 'account_balance_wallet', label: 'Billetera IA', route: '/advertiser/ai/wallet' },
    { icon: 'credit_card', label: 'Ver Paquetes', route: '/advertiser/packages' },
  ];

  readonly stats = signal([
    { icon: 'auto_awesome', value: '0', label: 'Proyectos Totales', change: '' },
    { icon: 'bolt', value: '0', label: 'Créditos Usados', change: '' },
    { icon: 'schedule', value: '0h', label: 'Tiempo Ahorrado', change: '' },
    { icon: 'trending_up', value: '0%', label: 'Tasa de Éxito', change: '' },
  ]);

  readonly quickActions: QuickAction[] = [
    {
      icon: 'videocam',
      iconBg: 'bg-red-50',
      iconColor: 'text-red-500',
      title: 'Generador de Video IA',
      description: 'Crea videos impresionantes desde texto o imágenes',
      route: '/advertiser/ai/video-studio',
    },
    {
      icon: 'image',
      iconBg: 'bg-purple-50',
      iconColor: 'text-purple-500',
      title: 'Generador de Imagen IA',
      description: 'Genera imágenes increíbles con IA',
      route: '/advertiser/ai/image',
    },
    {
      icon: 'description',
      iconBg: 'bg-emerald-50',
      iconColor: 'text-emerald-500',
      title: 'Generador de Documentos IA',
      description: 'Crea documentos profesionales con IA',
      route: '',
    },
  ];

  readonly recentProjects: RecentProject[] = [
    { icon: 'videocam', title: 'Video Promocional', type: 'Video', status: 'in_progress', timeAgo: 'Hace 2 horas' },
    { icon: 'image', title: 'Banner para redes', type: 'Imagen', status: 'completed', timeAgo: 'Hace 5 horas' },
    { icon: 'chat', title: 'Chatbot de soporte', type: 'Chatbot', status: 'in_progress', timeAgo: 'Hace 1 día' },
    { icon: 'smart_toy', title: 'Email Automation', type: 'Automatización', status: 'completed', timeAgo: 'Hace 2 días' },
  ];

  readonly templates: Template[] = [
    { title: 'Video Reel Viral', description: 'Plantilla profesional para reels y TikToks virales' },
    { title: 'Banner Publicitario', description: 'Plantilla para banners de redes sociales' },
    { title: 'Documento SEO', description: 'Plantilla para artículos optimizados en SEO' },
  ];

  toggleSidebar(): void {
    this.sidebarOpen.update(v => !v);
  }

  getStatusLabel(status: string): string {
    return status === 'completed' ? 'Completado' : status === 'in_progress' ? 'En Progreso' : 'Borrador';
  }

  getStatusClass(status: string): string {
    return status === 'completed'
      ? 'bg-gray-900 text-white'
      : status === 'in_progress'
        ? 'bg-white border border-gray-200 text-gray-700'
        : 'bg-gray-100 text-gray-500';
  }

  getUserName(): string {
    const p = this.profile();
    return p?.full_name?.split(' ')[0] || p?.username || 'Usuario';
  }

  formatBalance(): string {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency', currency: 'COP',
      minimumFractionDigits: 0, maximumFractionDigits: 0,
    }).format(this.walletBalance());
  }
}
