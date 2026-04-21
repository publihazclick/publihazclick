import { Component, ChangeDetectionStrategy, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ProfileService } from '../../../../core/services/profile.service';
import { AiWalletService } from '../../../../core/services/ai-wallet.service';
import { AiVideoService } from '../../../../core/services/ai-video.service';
import { getSupabaseClient } from '../../../../core/supabase.client';
import { environment } from '../../../../../environments/environment';
import type { AiPlatform } from '../../../../core/models/ai-video.model';

interface Niche {
  name: string;
  description: string;
  audience?: string;
  viralScore?: number;
  monetization?: string;
}

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
  private readonly aiVideo = inject(AiVideoService);
  private readonly supabase = getSupabaseClient();
  private readonly router = inject(Router);
  readonly errorMsg = signal<string | null>(null);

  readonly profile = this.profileService.profile;
  readonly walletBalance = this.walletService.balance;
  readonly walletLoaded = signal(false);

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
  readonly generatedNiches = signal<Niche[]>([]);
  readonly selectedNiche = signal<Niche | null>(null);
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

  selectNiche(niche: Niche): void {
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
    this.errorMsg.set(null);
    try {
      const { data: { session } } = await this.supabase.auth.getSession();
      if (!session) throw new Error('Sesión no encontrada');
      const res = await fetch(`${environment.supabase.url}/functions/v1/generate-niches`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          platform: this.selectedPlatform(),
          monetization: this.selectedMonetization(),
          count: 8,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Error al generar nichos');
      const niches: Niche[] = Array.isArray(data.niches) ? data.niches : [];
      if (niches.length === 0) throw new Error('La IA no devolvió nichos válidos');
      this.generatedNiches.set(niches);
      await this.aiVideo.saveProject({
        kind: 'niches',
        title: `Nichos ${this.selectedPlatform()} / ${this.selectedMonetization()}`,
        provider: 'openai',
        cost_cop: data.charged ?? 0,
        data: { platform: this.selectedPlatform(), monetization: this.selectedMonetization(), niches },
      });
      await this.walletService.loadWallet();
    } catch (e) {
      this.errorMsg.set(e instanceof Error ? e.message : 'Error al generar nichos');
    } finally {
      this.generatingNiche.set(false);
    }
  }

  async generateScript(): Promise<void> {
    this.generatingScript.set(true);
    this.errorMsg.set(null);
    try {
      const niche = this.selectedNiche();
      const topic = niche
        ? `${niche.name}: ${niche.description ?? ''}`.trim()
        : `${this.selectedVideoType()} para ${this.selectedPlatform()}`;
      const platform = this.selectedPlatform() || 'instagram';

      // Usamos generate-reel-script (Gemini) — más estable y económico.
      // El servicio ya hace el chargeAction('script_gemini') internamente.
      const result = await this.aiVideo.generateScript(topic, platform as AiPlatform, {
        video_type: this.selectedVideoType() ?? undefined,
        monetization: this.selectedMonetization() ?? undefined,
        duration: 30,
      });

      const scriptText = JSON.stringify(result, null, 2);
      this.generatedScript.set(scriptText);
      await this.aiVideo.saveProject({
        kind: 'script',
        title: `Guion ${platform} — ${niche?.name ?? topic}`,
        prompt: topic,
        provider: 'gemini',
        data: { script: result, platform },
      });
      await this.walletService.loadWallet();
    } catch (e) {
      this.errorMsg.set(e instanceof Error ? e.message : 'Error al generar guión');
    } finally {
      this.generatingScript.set(false);
    }
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
    try { await this.walletService.loadWallet(); } catch {}
    this.walletLoaded.set(true);
  }
}
