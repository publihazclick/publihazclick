import { Component, ChangeDetectionStrategy, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ProfileService } from '../../../../core/services/profile.service';
import { AiWalletService } from '../../../../core/services/ai-wallet.service';

interface Platform {
  id: string;
  icon: string;
  name: string;
  resolution: string;
  aspect: string;
  detail: string;
}

interface MonetizationType {
  id: string;
  name: string;
  detail: string;
}

@Component({
  selector: 'app-video-generator',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  templateUrl: './video-generator.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VideoGeneratorComponent {
  private readonly profileService = inject(ProfileService);
  private readonly walletService = inject(AiWalletService);
  private readonly router = inject(Router);

  readonly profile = this.profileService.profile;
  readonly walletBalance = this.walletService.balance;

  readonly currentStep = signal(0);

  readonly steps = [
    { icon: 'attach_money', label: 'Objetivo de Monetización' },
    { icon: 'smart_display', label: 'Tipo de Video' },
    { icon: 'target', label: 'Generador de Nicho' },
    { icon: 'description', label: 'Generador de Guion' },
  ];

  readonly platforms: Platform[] = [
    { id: 'youtube', icon: 'play_circle', name: 'YouTube', resolution: '1080p', aspect: '16:9', detail: 'Videos largos' },
    { id: 'tiktok', icon: 'videocam', name: 'TikTok', resolution: '1080p', aspect: '9:16', detail: 'Max 3min' },
    { id: 'instagram', icon: 'photo_camera', name: 'Instagram', resolution: '1080p', aspect: '9:16', detail: 'Reels 90s' },
    { id: 'facebook', icon: 'live_tv', name: 'Facebook', resolution: '1080p', aspect: '16:9', detail: 'Watch' },
    { id: 'shorts', icon: 'dashboard', name: 'Shorts', resolution: '1080p', aspect: '9:16', detail: 'Max 60s' },
  ];

  readonly monetizationTypes: MonetizationType[] = [
    { id: 'anuncios', name: 'Anuncios', detail: 'AdSense, CPM' },
    { id: 'afiliados', name: 'Afiliados', detail: 'Comisiones' },
    { id: 'producto', name: 'Producto Propio', detail: 'Venta directa' },
    { id: 'dropshipping', name: 'Dropshipping', detail: 'Sin inventario' },
    { id: 'marca', name: 'Marca Personal', detail: 'Influencer' },
    { id: 'faceless', name: 'Canal Oscuro (Faceless)', detail: 'Automatizado' },
  ];

  readonly selectedPlatform = signal<string | null>(null);
  readonly selectedMonetization = signal<string | null>(null);

  // Step 2 - Tipo de Video
  readonly videoTypes = [
    { id: 'tutorial', name: 'Tutorial', detail: 'Paso a paso' },
    { id: 'review', name: 'Review', detail: 'Análisis de producto' },
    { id: 'vlog', name: 'Vlog', detail: 'Día a día' },
    { id: 'educativo', name: 'Educativo', detail: 'Enseñanza' },
    { id: 'entretenimiento', name: 'Entretenimiento', detail: 'Viral / Fun' },
    { id: 'storytelling', name: 'Storytelling', detail: 'Narrativa' },
  ];
  readonly selectedVideoType = signal<string | null>(null);

  // Step 3 - Nicho
  nicheInput = '';
  readonly generatedNiches = signal<string[]>([]);
  readonly selectedNiche = signal<string | null>(null);
  readonly generatingNiche = signal(false);

  // Step 4 - Guion
  readonly generatedScript = signal<string | null>(null);
  readonly generatingScript = signal(false);

  selectPlatform(id: string): void {
    this.selectedPlatform.set(id);
    if (id === 'youtube') {
      this.router.navigate(['/advertiser/ai/youtube-studio']);
    }
  }

  selectMonetization(id: string): void {
    this.selectedMonetization.set(id);
  }

  selectVideoType(id: string): void {
    this.selectedVideoType.set(id);
  }

  selectNiche(niche: string): void {
    this.selectedNiche.set(niche);
  }

  nextStep(): void {
    if (this.currentStep() < this.steps.length - 1) {
      this.currentStep.update(s => s + 1);
    }
  }

  prevStep(): void {
    if (this.currentStep() > 0) {
      this.currentStep.update(s => s - 1);
    }
  }

  goToStep(index: number): void {
    if (index <= this.currentStep()) {
      this.currentStep.set(index);
    }
  }

  canAdvance(): boolean {
    switch (this.currentStep()) {
      case 0: return !!this.selectedPlatform() && !!this.selectedMonetization();
      case 1: return !!this.selectedVideoType();
      case 2: return !!this.selectedNiche();
      case 3: return !!this.generatedScript();
      default: return false;
    }
  }

  async generateNiches(): Promise<void> {
    this.generatingNiche.set(true);
    // Simulación - aquí se conectaría con la IA
    setTimeout(() => {
      const platform = this.selectedPlatform() ?? '';
      const type = this.selectedVideoType() ?? '';
      this.generatedNiches.set([
        `${type} de cocina saludable para ${platform}`,
        `${type} de fitness en casa`,
        `${type} de tecnología y gadgets`,
        `${type} de finanzas personales`,
        `${type} de productividad y hábitos`,
      ]);
      this.generatingNiche.set(false);
    }, 1500);
  }

  async generateScript(): Promise<void> {
    this.generatingScript.set(true);
    // Simulación - aquí se conectaría con la IA
    setTimeout(() => {
      this.generatedScript.set(`# Guion generado\n\n**Plataforma:** ${this.selectedPlatform()}\n**Nicho:** ${this.selectedNiche()}\n**Tipo:** ${this.selectedVideoType()}\n\n## Introducción\nHook de apertura que captura la atención...\n\n## Desarrollo\nContenido principal del video...\n\n## Cierre\nCall to action y despedida...`);
      this.generatingScript.set(false);
    }, 2000);
  }

  getPlatformIconColor(id: string): string {
    const map: Record<string, string> = {
      youtube: 'text-red-500', tiktok: 'text-gray-900', instagram: 'text-pink-500',
      facebook: 'text-blue-500', shorts: 'text-red-600',
    };
    return map[id] ?? 'text-gray-500';
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

  async ngOnInit(): Promise<void> {
    await this.walletService.loadWallet();
  }
}
