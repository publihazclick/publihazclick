import { Component, ChangeDetectionStrategy, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { ProfileService } from '../../../../core/services/profile.service';
import { AiWalletService } from '../../../../core/services/ai-wallet.service';
import { AiVideoService } from '../../../../core/services/ai-video.service';

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
  private readonly aiVideo = inject(AiVideoService);
  readonly profile = this.profileService.profile;
  readonly walletBalance = this.walletService.balance;
  readonly walletLoaded = signal(false);
  readonly loadingProjects = signal(false);

  readonly sidebarOpen = signal(false);
  readonly showRetiroModal = signal(false);
  readonly showReferralModal = signal(false);
  readonly referralCopied = signal(false);

  get referralLink(): string {
    const code = this.profileService.profile()?.referral_code ?? '';
    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://www.publihazclick.com';
    return code ? `${origin}/ref/${code}?to=/herramientas-ia` : '';
  }

  copyReferralLink(): void {
    if (this.referralLink && typeof window !== 'undefined') {
      navigator.clipboard.writeText(this.referralLink);
      this.referralCopied.set(true);
      setTimeout(() => this.referralCopied.set(false), 2000);
    }
  }

  async ngOnInit(): Promise<void> {
    try { await this.walletService.loadWallet(); } catch {}
    this.walletLoaded.set(true);
    await this.loadRealStats();
  }

  private async loadRealStats(): Promise<void> {
    this.loadingProjects.set(true);
    try {
      const [counts, projects] = await Promise.all([
        this.aiVideo.getProjectCounts(),
        this.aiVideo.listProjects(8),
      ]);

      // Construir stats reales
      const totalConsumed = this.walletService.totalConsumed?.() ?? 0;
      const successful = projects.filter(p => p['status'] === 'completed').length;
      const rate = projects.length > 0 ? Math.round((successful / projects.length) * 100) : 0;

      this.stats.set([
        { icon: 'auto_awesome', value: String(counts.total), label: 'Proyectos Totales', change: '' },
        { icon: 'bolt', value: this.formatCOPShort(totalConsumed), label: 'Gastado en IA', change: '' },
        { icon: 'videocam', value: String(counts.byKind['video'] ?? 0), label: 'Videos creados', change: '' },
        { icon: 'trending_up', value: `${rate}%`, label: 'Tasa de éxito', change: '' },
      ]);

      // Construir recent projects a partir de ai_projects real
      const recent: RecentProject[] = projects.slice(0, 6).map((p): RecentProject => ({
        icon: this.projectIcon(p['kind'] as string),
        title: (p['title'] as string) || (p['prompt'] as string) || 'Sin título',
        type: this.projectTypeLabel(p['kind'] as string),
        status: ((p['status'] as string) === 'completed' ? 'completed'
               : (p['status'] as string) === 'failed' ? 'draft'
               : 'in_progress'),
        timeAgo: this.timeAgo(p['created_at'] as string),
      }));
      if (recent.length > 0) {
        this.recentProjects.set(recent);
      }
    } catch (e) {
      console.warn('[creator-dashboard] loadRealStats failed:', e);
    } finally {
      this.loadingProjects.set(false);
    }
  }

  private projectIcon(kind: string): string {
    const map: Record<string, string> = {
      video: 'videocam', image: 'image', script: 'description',
      audio: 'graphic_eq', niches: 'lightbulb', ideas: 'auto_awesome',
      photo_avatar: 'face',
    };
    return map[kind] ?? 'auto_awesome';
  }

  private projectTypeLabel(kind: string): string {
    const map: Record<string, string> = {
      video: 'Video', image: 'Imagen', script: 'Guión',
      audio: 'Audio', niches: 'Nichos', ideas: 'Ideas',
      photo_avatar: 'Avatar',
    };
    return map[kind] ?? kind;
  }

  private timeAgo(iso: string): string {
    if (!iso) return '';
    const diffMs = Date.now() - new Date(iso).getTime();
    const min = Math.floor(diffMs / 60000);
    if (min < 1) return 'Hace instantes';
    if (min < 60) return `Hace ${min} min`;
    const h = Math.floor(min / 60);
    if (h < 24) return `Hace ${h} h`;
    const d = Math.floor(h / 24);
    if (d === 1) return 'Hace 1 día';
    if (d < 7) return `Hace ${d} días`;
    return new Date(iso).toLocaleDateString('es-CO');
  }

  private formatCOPShort(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
    return String(n);
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
    { icon: 'account_balance_wallet', label: 'Billetera recargable', route: '/advertiser/ai/wallet' },
    { icon: 'credit_card', label: 'Ver Paquetes', route: '/advertiser/ai/wallet' },
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

  readonly recentProjects = signal<RecentProject[]>([]);

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
