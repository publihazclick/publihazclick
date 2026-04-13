import { Component, ChangeDetectionStrategy, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ProfileService } from '../../../../core/services/profile.service';
import { AiWalletService } from '../../../../core/services/ai-wallet.service';
import { getSupabaseClient } from '../../../../core/supabase.client';

interface HeyGenVoice {
  voice_id: string;
  name: string;
  gender: string;
  language: string;
}

@Component({
  selector: 'app-youtube-studio',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  templateUrl: './youtube-studio.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class YoutubeStudioComponent implements OnInit {
  private readonly profileService = inject(ProfileService);
  private readonly walletService = inject(AiWalletService);
  private readonly supabase = getSupabaseClient();

  readonly profile = this.profileService.profile;
  readonly walletBalance = this.walletService.balance;
  readonly walletLoaded = signal(false);

  // Tabs
  readonly activeTab = signal<'creacion' | 'analiticas' | 'seo' | 'miniaturas' | 'playlists'>('creacion');

  // Tipo de contenido
  readonly contentType = signal<'largo' | 'shorts'>('largo');

  // Monetización toggles
  readonly youtubeAds = signal(true);
  readonly affiliateMarketing = signal(false);
  readonly memberships = signal(false);
  readonly superChat = signal(false);

  // Formulario
  videoTopic = '';
  readonly duration = signal('1:00 minuto');
  videoFormat = '16:9 (Horizontal) - Recomendado';
  scriptContent = '';

  readonly durationsLargo = [
    '1:00 minuto', '1:30 minutos', '2:00 minutos', '2:30 minutos',
    '3:00 minutos', '3:30 minutos', '4:00 minutos', '4:30 minutos',
    '5:00 minutos', '5:30 minutos', '6:00 minutos', '6:30 minutos',
    '7:00 minutos', '7:30 minutos', '8:00 minutos', '8:30 minutos',
    '9:00 minutos', '9:30 minutos', '10:00 minutos', '10:30 minutos',
    '11:00 minutos', '11:30 minutos', '12:00 minutos', '12:30 minutos',
    '13:00 minutos', '13:30 minutos', '14:00 minutos', '14:30 minutos',
    '15:00 minutos',
  ];
  readonly durationsShorts = [
    '15 segundos', '20 segundos', '30 segundos', '45 segundos', '60 segundos',
  ];
  readonly durations = computed(() =>
    this.contentType() === 'largo' ? this.durationsLargo : this.durationsShorts
  );
  readonly formats = ['16:9 (Horizontal) - Recomendado', '9:16 (Vertical)', '1:1 (Cuadrado)'];

  // Estilo visual
  readonly visualStyles = ['Talking Head', 'B-Roll', 'Screencast', 'Animado', 'Documental', 'Vlog'];
  readonly selectedStyle = signal<string | null>(null);

  // Voces HeyGen reales
  readonly showVoicePanel = signal(false);
  readonly voiceGender = signal<'male' | 'female'>('male');
  readonly selectedVoice = signal<HeyGenVoice | null>(null);
  readonly allVoices = signal<HeyGenVoice[]>([]);
  readonly loadingVoices = signal(false);

  readonly maleVoices = computed(() => this.allVoices().filter(v => v.gender === 'male'));
  readonly femaleVoices = computed(() => this.allVoices().filter(v => v.gender === 'female'));
  readonly currentVoices = computed(() =>
    this.voiceGender() === 'male' ? this.maleVoices() : this.femaleVoices()
  );

  // Generación de video
  readonly generatingIdeas = signal(false);
  readonly generatingScript = signal(false);
  readonly generatingVideo = signal(false);
  readonly videoResult = signal<{ video_id: string; status: string; video_url?: string } | null>(null);
  readonly videoError = signal<string | null>(null);
  readonly checkingStatus = signal(false);

  async ngOnInit(): Promise<void> {
    try { await this.walletService.loadWallet(); } catch {}
    this.walletLoaded.set(true);
    await this.loadVoices();
  }

  async loadVoices(): Promise<void> {
    this.loadingVoices.set(true);
    try {
      const { data, error } = await this.supabase.functions.invoke('list-heygen-voices');
      if (!error && data?.voices) {
        this.allVoices.set(data.voices);
      }
    } catch { /* silencioso */ }
    this.loadingVoices.set(false);
  }

  selectContentType(type: 'largo' | 'shorts'): void {
    this.contentType.set(type);
    this.duration.set(type === 'largo' ? '1:00 minuto' : '15 segundos');
  }

  toggleAds(): void { this.youtubeAds.update(v => !v); }
  toggleAffiliate(): void { this.affiliateMarketing.update(v => !v); }
  toggleMemberships(): void { this.memberships.update(v => !v); }
  toggleSuperChat(): void { this.superChat.update(v => !v); }

  selectStyle(style: string): void { this.selectedStyle.set(style); }

  toggleVoicePanel(): void { this.showVoicePanel.update(v => !v); }

  selectVoice(voice: HeyGenVoice): void { this.selectedVoice.set(voice); }

  async generateIdeas(): Promise<void> {
    this.generatingIdeas.set(true);
    setTimeout(() => {
      this.videoTopic = this.videoTopic || 'Tutorial de cocina saludable para principiantes';
      this.generatingIdeas.set(false);
    }, 1500);
  }

  async generateScript(): Promise<void> {
    this.generatingScript.set(true);
    setTimeout(() => {
      this.scriptContent = `Hook: "¿Sabías que puedes preparar comidas saludables en menos de 15 minutos?"\n\nIntro: Presentación del tema y lo que aprenderán.\n\nDesarrollo:\n- Ingredientes necesarios\n- Paso 1: Preparación\n- Paso 2: Cocción\n- Paso 3: Emplatado\n\nCierre: Resumen + Call to action (suscribirse, comentar, compartir)`;
      this.generatingScript.set(false);
    }, 2000);
  }

  async generateNewScript(): Promise<void> {
    this.scriptContent = '';
    await this.generateScript();
  }

  async generateVideo(): Promise<void> {
    const voice = this.selectedVoice();
    if (!voice) {
      this.videoError.set('Selecciona una voz antes de generar el video');
      return;
    }
    if (!this.scriptContent.trim()) {
      this.videoError.set('Escribe o genera un guion antes de generar el video');
      return;
    }

    this.videoError.set(null);
    this.generatingVideo.set(true);

    try {
      // Determinar dimensiones según formato
      let dimension = { width: 1920, height: 1080 };
      if (this.videoFormat.includes('9:16')) dimension = { width: 1080, height: 1920 };
      if (this.videoFormat.includes('1:1')) dimension = { width: 1080, height: 1080 };

      const { data, error } = await this.supabase.functions.invoke('generate-heygen-video', {
        body: {
          avatar_id: 'Anna_public_3_20240108',  // Avatar por defecto
          voice_id: voice.voice_id,
          script: this.scriptContent,
          title: this.videoTopic || 'Video PubliHazClick',
          dimension,
        },
      });

      if (error || !data?.video_id) {
        throw new Error(data?.error ?? 'Error al generar video');
      }

      this.videoResult.set(data);
      // Iniciar polling del estado
      this.pollVideoStatus(data.video_id);
    } catch (e: unknown) {
      this.videoError.set(e instanceof Error ? e.message : 'Error al generar video');
    } finally {
      this.generatingVideo.set(false);
    }
  }

  private async pollVideoStatus(videoId: string): Promise<void> {
    this.checkingStatus.set(true);
    const maxAttempts = 60; // 5 minutos
    let attempts = 0;

    const check = async () => {
      attempts++;
      try {
        const { data } = await this.supabase.functions.invoke('check-heygen-video', {
          body: { video_id: videoId },
        });

        if (data?.status === 'completed' && data?.video_url) {
          this.videoResult.set(data);
          this.checkingStatus.set(false);
          return;
        }

        if (data?.status === 'failed') {
          this.videoError.set('El video falló al generarse. Intenta de nuevo.');
          this.checkingStatus.set(false);
          return;
        }

        if (attempts < maxAttempts) {
          setTimeout(check, 5000);
        } else {
          this.checkingStatus.set(false);
        }
      } catch {
        this.checkingStatus.set(false);
      }
    };

    setTimeout(check, 10000); // Primera verificación a los 10s
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
