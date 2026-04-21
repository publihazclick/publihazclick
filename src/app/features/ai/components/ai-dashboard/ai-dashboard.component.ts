import { Component, ChangeDetectionStrategy, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { RouterModule, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ProfileService } from '../../../../core/services/profile.service';
import { CurrencyService } from '../../../../core/services/currency.service';
import { AiWalletService } from '../../../../core/services/ai-wallet.service';
import { AiVideoService } from '../../../../core/services/ai-video.service';

interface DemoVideo {
  id: string;
  title: string;
  shortDesc: string;
  description: string;
  badge: string;
  icon: string;
  embedUrl: SafeResourceUrl;
}

@Component({
  selector: 'app-ai-dashboard',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  templateUrl: './ai-dashboard.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AiDashboardComponent implements OnInit {
  private readonly profileService = inject(ProfileService);
  readonly currencyService = inject(CurrencyService);
  private readonly walletService = inject(AiWalletService);
  private readonly aiVideo = inject(AiVideoService);
  private readonly router = inject(Router);
  private readonly sanitizer = inject(DomSanitizer);

  readonly profile = this.profileService.profile;
  readonly billingCycle = signal<'monthly' | 'annual'>('monthly');
  readonly walletBalance = this.walletService.balance;
  readonly walletLoaded = signal(false);
  readonly activeDemo = signal(0);
  readonly recentProjects = signal<Array<Record<string, unknown>>>([]);
  readonly loadingProjects = signal(false);

  /**
   * Videos demo embebidos en el dashboard. Para reemplazar un video:
   * cambia la URL en el campo 'url' y el componente la sanitiza automáticamente.
   * Acepta YouTube (embed), Vimeo (player), o cualquier URL de iframe.
   */
  readonly demoVideos: DemoVideo[] = [
    {
      id: 'avatar',
      title: 'Avatar IA Hiperrealista',
      shortDesc: 'Avatares que hablan con tu guión',
      description: 'Crea un avatar profesional que habla tu guión en cualquier idioma. Sin cámaras ni estudio.',
      badge: 'Avatar IA',
      icon: 'face',
      embedUrl: this.sanitizer.bypassSecurityTrustResourceUrl(
        'https://www.youtube.com/embed/3xNHjd43Umg?rel=0&modestbranding=1',
      ),
    },
    {
      id: 'video',
      title: 'Video Profesional en Segundos',
      shortDesc: 'De texto a video con un click',
      description: 'Escribe una idea → la IA genera guión, imágenes, voz y edita el video completo.',
      badge: 'Video IA',
      icon: 'movie',
      embedUrl: this.sanitizer.bypassSecurityTrustResourceUrl(
        'https://www.youtube.com/embed/n1EqV2ONYQU?rel=0&modestbranding=1',
      ),
    },
    {
      id: 'image',
      title: 'Los Resultados Más Realistas',
      shortDesc: 'Videos e imágenes imposibles de distinguir',
      description: 'Genera contenido visual de calidad profesional para redes sociales, anuncios y campañas.',
      badge: 'Visual IA',
      icon: 'image',
      embedUrl: this.sanitizer.bypassSecurityTrustResourceUrl(
        'https://www.youtube.com/embed/Dr974k2RCLk?rel=0&modestbranding=1',
      ),
    },
    {
      id: 'voice',
      title: 'Voces Ultra Realistas',
      shortDesc: 'Narración profesional sin locutor',
      description: 'Voces naturales en 30+ idiomas. Ideales para videos, podcasts y presentaciones.',
      badge: 'Voz IA',
      icon: 'record_voice_over',
      embedUrl: this.sanitizer.bypassSecurityTrustResourceUrl(
        'https://www.youtube.com/embed/Vs6vJwmJL0Y?rel=0&modestbranding=1',
      ),
    },
  ];

  async ngOnInit(): Promise<void> {
    try {
      await this.walletService.loadWallet();
    } catch {}
    this.walletLoaded.set(true);
    this.loadingProjects.set(true);
    try {
      const projects = await this.aiVideo.listProjects(6);
      this.recentProjects.set(projects);
    } catch { /* silent */ }
    this.loadingProjects.set(false);
  }

  getProjectIcon(kind: string): string {
    const map: Record<string, string> = {
      video: 'videocam', image: 'image', script: 'description',
      audio: 'graphic_eq', niches: 'lightbulb', ideas: 'auto_awesome',
      photo_avatar: 'face',
    };
    return map[kind] ?? 'auto_awesome';
  }

  getProjectTypeLabel(kind: string): string {
    const map: Record<string, string> = {
      video: 'Video', image: 'Imagen', script: 'Guión',
      audio: 'Audio', niches: 'Nichos', ideas: 'Ideas',
      photo_avatar: 'Avatar personal',
    };
    return map[kind] ?? kind;
  }

  getProjectTimeAgo(iso: unknown): string {
    if (!iso || typeof iso !== 'string') return '';
    const diffMs = Date.now() - new Date(iso).getTime();
    const min = Math.floor(diffMs / 60000);
    if (min < 1) return 'Ahora';
    if (min < 60) return `${min}min`;
    const h = Math.floor(min / 60);
    if (h < 24) return `${h}h`;
    const d = Math.floor(h / 24);
    return d === 1 ? '1d' : `${d}d`;
  }

  formatCOP(amount: number): string {
    return this.currencyService.formatFromCOP(amount, 0);
  }

  navigateTo(path: string): void {
    this.router.navigate([path]);
  }
}
