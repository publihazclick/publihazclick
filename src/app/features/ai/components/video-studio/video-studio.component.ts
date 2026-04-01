import { Component, ChangeDetectionStrategy, inject, signal, computed, OnInit, PLATFORM_ID } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ProfileService } from '../../../../core/services/profile.service';
import { AiWalletService } from '../../../../core/services/ai-wallet.service';
import { getSupabaseClient } from '../../../../core/supabase.client';
import { environment } from '../../../../../environments/environment';

interface HeyGenAvatar {
  avatar_id: string;
  avatar_name: string;
  gender: string;
  preview_image_url: string;
}

interface HeyGenVoice {
  voice_id: string;
  name: string;
  gender: string;
  language: string;
}

type CreationMode = 'images' | 'avatar' | 'photo' | 'product';
type Platform = 'youtube' | 'tiktok' | 'instagram' | 'facebook' | 'shorts';
type WizardStep = 'mode' | 'platform' | 'avatar' | 'script' | 'config' | 'generate';

@Component({
  selector: 'app-video-studio',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  templateUrl: './video-studio.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VideoStudioComponent implements OnInit {
  private readonly profileService = inject(ProfileService);
  private readonly walletService = inject(AiWalletService);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly supabase = getSupabaseClient();

  readonly profile = this.profileService.profile;
  readonly walletBalance = this.walletService.balance;

  // Wizard
  readonly currentStep = signal<WizardStep>('mode');
  readonly steps: { id: WizardStep; label: string; icon: string }[] = [
    { id: 'mode', label: 'Modo', icon: 'category' },
    { id: 'platform', label: 'Plataforma', icon: 'devices' },
    { id: 'avatar', label: 'Avatar', icon: 'person' },
    { id: 'script', label: 'Guion', icon: 'description' },
    { id: 'config', label: 'Configurar', icon: 'tune' },
    { id: 'generate', label: 'Generar', icon: 'movie' },
  ];

  // Step 1: Modo
  readonly selectedMode = signal<CreationMode | null>(null);
  readonly modes = [
    { id: 'images' as CreationMode, icon: 'auto_awesome_motion', title: 'Videos con Imagenes en Movimiento', desc: 'Crea videos virales de historias con imagenes animadas y voz en off', color: 'red' },
    { id: 'avatar' as CreationMode, icon: 'smart_toy', title: 'Avatar del Sistema', desc: 'Elige entre 1,200+ avatares profesionales', color: 'purple' },
    { id: 'photo' as CreationMode, icon: 'face', title: 'Mi Avatar Personal', desc: 'Sube tu foto y crea un avatar con tu cara', color: 'blue' },
    { id: 'product' as CreationMode, icon: 'shopping_bag', title: 'Video de Producto', desc: 'Sube foto de tu producto y un avatar lo presenta', color: 'pink' },
  ];

  // Step 2: Plataforma
  readonly selectedPlatform = signal<Platform | null>(null);
  readonly platforms = [
    { id: 'youtube' as Platform, icon: 'play_circle', name: 'YouTube', color: 'text-red-500', bg: 'bg-red-50', border: 'border-red-500', specs: '16:9 · 1080p · Hasta 15min' },
    { id: 'tiktok' as Platform, icon: 'videocam', name: 'TikTok', color: 'text-gray-900', bg: 'bg-gray-50', border: 'border-gray-900', specs: '9:16 · 1080p · Hasta 3min' },
    { id: 'instagram' as Platform, icon: 'photo_camera', name: 'Instagram Reels', color: 'text-pink-500', bg: 'bg-pink-50', border: 'border-pink-500', specs: '9:16 · 1080p · Hasta 90s' },
    { id: 'facebook' as Platform, icon: 'live_tv', name: 'Facebook', color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-600', specs: '16:9 · 1080p · Watch' },
    { id: 'shorts' as Platform, icon: 'bolt', name: 'YouTube Shorts', color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-600', specs: '9:16 · 1080p · Hasta 60s' },
  ];

  // Step 3: Avatar
  readonly allAvatars = signal<HeyGenAvatar[]>([]);
  readonly avatarGender = signal<'all' | 'male' | 'female'>('all');
  readonly avatarSearch = signal('');
  readonly selectedAvatar = signal<HeyGenAvatar | null>(null);
  readonly loadingAvatars = signal(false);
  readonly userPhotoUrl = signal<string | null>(null);
  readonly talkingPhotoId = signal<string | null>(null);

  readonly filteredAvatars = computed(() => {
    let list = this.allAvatars();
    const gender = this.avatarGender();
    const search = this.avatarSearch().toLowerCase();
    if (gender !== 'all') list = list.filter(a => a.gender === gender);
    if (search) list = list.filter(a => a.avatar_name.toLowerCase().includes(search));
    return list.slice(0, 50);
  });

  // Step 4: Guion
  readonly scriptContent = signal('');
  readonly videoTopic = signal('');
  readonly generatingScript = signal(false);
  readonly generatingTitle = signal(false);
  readonly suggestedTitles = signal<{ title: string; views: string; channel: string }[]>([]);
  readonly scriptError = signal<string | null>(null);

  // Step 5: Config
  readonly allVoices = signal<HeyGenVoice[]>([]);
  readonly selectedLanguage = signal('Spanish');
  readonly voiceGender = signal<'male' | 'female'>('male');
  readonly selectedVoice = signal<HeyGenVoice | null>(null);
  readonly loadingVoices = signal(false);

  readonly availableLanguages = [
    { code: 'Spanish', label: 'Español', flag: '🇪🇸' },
    { code: 'English', label: 'Inglés', flag: '🇺🇸' },
    { code: 'Portuguese', label: 'Portugués', flag: '🇧🇷' },
    { code: 'French', label: 'Francés', flag: '🇫🇷' },
    { code: 'German', label: 'Alemán', flag: '🇩🇪' },
    { code: 'Italian', label: 'Italiano', flag: '🇮🇹' },
    { code: 'Chinese', label: 'Chino', flag: '🇨🇳' },
    { code: 'Japanese', label: 'Japonés', flag: '🇯🇵' },
    { code: 'Korean', label: 'Coreano', flag: '🇰🇷' },
    { code: 'Arabic', label: 'Árabe', flag: '🇸🇦' },
    { code: 'Hindi', label: 'Hindi', flag: '🇮🇳' },
    { code: 'Dutch', label: 'Holandés', flag: '🇳🇱' },
    { code: 'Russian', label: 'Ruso', flag: '🇷🇺' },
    { code: 'Turkish', label: 'Turco', flag: '🇹🇷' },
    { code: 'Polish', label: 'Polaco', flag: '🇵🇱' },
    { code: 'Swedish', label: 'Sueco', flag: '🇸🇪' },
    { code: 'Indonesian', label: 'Indonesio', flag: '🇮🇩' },
    { code: 'Vietnamese', label: 'Vietnamita', flag: '🇻🇳' },
    { code: 'Thai', label: 'Tailandés', flag: '🇹🇭' },
    { code: 'Filipino', label: 'Filipino', flag: '🇵🇭' },
  ];

  readonly languageVoices = computed(() =>
    this.allVoices().filter(v => v.language?.toLowerCase() === this.selectedLanguage().toLowerCase())
  );
  readonly maleVoices = computed(() => this.languageVoices().filter(v => v.gender === 'male'));
  readonly femaleVoices = computed(() => this.languageVoices().filter(v => v.gender === 'female'));
  readonly currentVoices = computed(() =>
    this.voiceGender() === 'male' ? this.maleVoices() : this.femaleVoices()
  );

  readonly duration = signal('1:00 minuto');
  readonly durations = computed(() => {
    const p = this.selectedPlatform();
    if (p === 'shorts') return ['15 segundos', '30 segundos', '45 segundos', '60 segundos'];
    if (p === 'instagram') return ['15 segundos', '30 segundos', '60 segundos', '90 segundos'];
    if (p === 'tiktok') return ['15 segundos', '30 segundos', '60 segundos', '2:00 minutos', '3:00 minutos'];
    return [
      '1:00 minuto', '1:30 minutos', '2:00 minutos', '3:00 minutos', '5:00 minutos',
      '8:00 minutos', '10:00 minutos', '15:00 minutos',
    ];
  });

  // Step 6: Generate
  readonly generatingVideo = signal(false);
  readonly videoResult = signal<{ video_id: string; status: string; video_url?: string; thumbnail_url?: string } | null>(null);
  readonly videoError = signal<string | null>(null);
  readonly checkingStatus = signal(false);

  async ngOnInit(): Promise<void> {
    await this.walletService.loadWallet();
  }

  // ── Navegación ──────────────────────────────────────────────────────────

  goToStep(step: WizardStep): void {
    const order: WizardStep[] = ['mode', 'platform', 'avatar', 'script', 'config', 'generate'];
    const currentIdx = order.indexOf(this.currentStep());
    const targetIdx = order.indexOf(step);
    if (targetIdx <= currentIdx) this.currentStep.set(step);
  }

  private getStepOrder(): WizardStep[] {
    if (this.selectedMode() === 'images') {
      return ['mode', 'platform', 'script', 'config', 'generate'];
    }
    return ['mode', 'platform', 'avatar', 'script', 'config', 'generate'];
  }

  nextStep(): void {
    const order = this.getStepOrder();
    const idx = order.indexOf(this.currentStep());
    if (idx < order.length - 1) this.currentStep.set(order[idx + 1]);
  }

  prevStep(): void {
    const order = this.getStepOrder();
    const idx = order.indexOf(this.currentStep());
    if (idx > 0) this.currentStep.set(order[idx - 1]);
  }

  canAdvance(): boolean {
    switch (this.currentStep()) {
      case 'mode': return !!this.selectedMode();
      case 'platform': return !!this.selectedPlatform();
      case 'avatar':
        if (this.selectedMode() === 'images') return true;
        if (this.selectedMode() === 'avatar') return !!this.selectedAvatar();
        return !!this.talkingPhotoId();
      case 'script': return !!this.scriptContent().trim();
      case 'config': return !!this.selectedVoice();
      default: return false;
    }
  }

  // ── Mode ────────────────────────────────────────────────────────────────

  selectMode(mode: CreationMode): void {
    this.selectedMode.set(mode);
  }

  // ── Platform ────────────────────────────────────────────────────────────

  selectPlatform(p: Platform): void {
    this.selectedPlatform.set(p);
    this.duration.set(this.durations()[0]);
  }

  getDimension(): { width: number; height: number } {
    const p = this.selectedPlatform();
    if (p === 'tiktok' || p === 'instagram' || p === 'shorts') return { width: 1080, height: 1920 };
    return { width: 1920, height: 1080 };
  }

  // ── Avatars ─────────────────────────────────────────────────────────────

  async loadAvatars(): Promise<void> {
    if (this.allAvatars().length > 0) return;
    this.loadingAvatars.set(true);
    try {
      const { data } = await this.supabase.functions.invoke('list-heygen-avatars');
      if (data?.avatars) this.allAvatars.set(data.avatars);
    } catch { /* silencioso */ }
    this.loadingAvatars.set(false);
  }

  selectAvatar(avatar: HeyGenAvatar): void {
    this.selectedAvatar.set(avatar);
  }

  async onPhotoSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      this.userPhotoUrl.set(reader.result as string);
    };
    reader.readAsDataURL(file);

    // Para el plan free usamos talking_photo existente
    // En producción: subir foto a HeyGen para crear talking photo
    this.talkingPhotoId.set('6013fc758b5446a2ba17d8c459538bb4');
  }

  // ── Voices ──────────────────────────────────────────────────────────────

  async loadVoices(): Promise<void> {
    if (this.allVoices().length > 0) return;
    this.loadingVoices.set(true);
    try {
      const { data } = await this.supabase.functions.invoke('list-heygen-voices-all');
      if (data?.voices) this.allVoices.set(data.voices);
    } catch { /* silencioso */ }
    this.loadingVoices.set(false);
  }

  selectLanguage(lang: string): void {
    this.selectedLanguage.set(lang);
    this.selectedVoice.set(null);
  }

  selectVoice(voice: HeyGenVoice): void {
    this.selectedVoice.set(voice);
  }

  // ── Script ──────────────────────────────────────────────────────────────

  async generateWinnerTitle(): Promise<void> {
    if (!this.videoTopic().trim() || this.videoTopic().trim().length < 3) return;
    this.generatingTitle.set(true);
    this.suggestedTitles.set([]);
    try {
      const { data, error } = await this.supabase.functions.invoke('search-youtube-titles', {
        body: { topic: this.videoTopic().trim() },
      });
      if (error) throw error;
      const parsed = typeof data === 'string' ? JSON.parse(data) : data;
      if (parsed?.titles?.length) {
        this.suggestedTitles.set(
          parsed.titles.map((t: { title: string; viewsFormatted: string; channel: string }) => ({
            title: t.title,
            views: t.viewsFormatted,
            channel: t.channel,
          }))
        );
      }
    } catch (e) {
      console.error('Error buscando titulos en YouTube:', e);
    } finally {
      this.generatingTitle.set(false);
    }
  }

  selectTitle(t: { title: string }): void {
    this.videoTopic.set(t.title);
    this.suggestedTitles.set([]);
  }

  /** Parsea la duración seleccionada (ej: "1:30 minutos", "30 segundos") a segundos */
  private parseDurationToSeconds(): number {
    const dur = this.duration();
    const secMatch = dur.match(/(\d+)\s*segundo/i);
    if (secMatch) return parseInt(secMatch[1], 10);
    const minMatch = dur.match(/(\d+):(\d+)\s*minuto/i);
    if (minMatch) return parseInt(minMatch[1], 10) * 60 + parseInt(minMatch[2], 10);
    const simpleMinMatch = dur.match(/(\d+)\s*minuto/i);
    if (simpleMinMatch) return parseInt(simpleMinMatch[1], 10) * 60;
    return 60;
  }

  async generateScript(): Promise<void> {
    this.generatingScript.set(true);
    this.scriptError.set(null);
    const topic = this.videoTopic() || 'contenido viral';
    const platform = this.selectedPlatform() ?? 'youtube';
    const durationSec = this.parseDurationToSeconds();

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      const { data: { session } } = await this.supabase.auth.getSession();
      if (session) headers['Authorization'] = `Bearer ${session.access_token}`;

      const res = await fetch(
        `${environment.supabase.url}/functions/v1/generate-reel-script`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({
            description: topic,
            platform,
            duration: durationSec,
            tone: 'professional',
            video_type: 'educational',
            monetization: 'personal_brand',
          }),
        }
      );

      const parsed = await res.json();

      if (!res.ok) {
        throw new Error(parsed?.error || `Error ${res.status}`);
      }

      if (parsed?.script?.scenes?.length) {
        const narration = parsed.script.scenes
          .map((s: { narration: string }) => s.narration)
          .join('\n\n');
        this.scriptContent.set(narration);
      } else {
        throw new Error('No se generaron escenas');
      }
    } catch (e: unknown) {
      console.error('Error generando guion:', e);
      const msg = e instanceof Error ? e.message : 'Error generando el guión';
      this.scriptError.set(msg);
      this.scriptContent.set('');
    } finally {
      this.generatingScript.set(false);
    }
  }

  // ── Generate Video ──────────────────────────────────────────────────────

  async generateVideo(): Promise<void> {
    const voice = this.selectedVoice();
    if (!voice || !this.scriptContent().trim()) return;

    this.videoError.set(null);
    this.generatingVideo.set(true);

    try {
      const mode = this.selectedMode();
      let characterConfig: Record<string, unknown>;

      if (mode === 'avatar') {
        characterConfig = {
          type: 'avatar',
          avatar_id: this.selectedAvatar()!.avatar_id,
          avatar_style: 'normal',
        };
      } else {
        characterConfig = {
          type: 'talking_photo',
          talking_photo_id: this.talkingPhotoId(),
        };
      }

      const { data, error } = await this.supabase.functions.invoke('generate-heygen-video', {
        body: {
          avatar_id: mode === 'avatar' ? this.selectedAvatar()!.avatar_id : undefined,
          talking_photo_id: mode !== 'avatar' ? this.talkingPhotoId() : undefined,
          voice_id: voice.voice_id,
          script: this.scriptContent(),
          title: this.videoTopic() || 'Video PubliHazClick',
          dimension: this.getDimension(),
          character_type: mode === 'avatar' ? 'avatar' : 'talking_photo',
        },
      });

      if (error || !data?.video_id) {
        throw new Error(data?.error ?? 'Error al generar video');
      }

      this.videoResult.set(data);
      this.pollVideoStatus(data.video_id);
    } catch (e: unknown) {
      this.videoError.set(e instanceof Error ? e.message : 'Error al generar video');
    } finally {
      this.generatingVideo.set(false);
    }
  }

  private async pollVideoStatus(videoId: string): Promise<void> {
    this.checkingStatus.set(true);
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
          this.videoError.set('El video fallo al generarse. Intenta de nuevo.');
          this.checkingStatus.set(false);
          return;
        }
        if (attempts < 60) setTimeout(check, 5000);
        else this.checkingStatus.set(false);
      } catch {
        this.checkingStatus.set(false);
      }
    };

    setTimeout(check, 10000);
  }

  // ── Utils ───────────────────────────────────────────────────────────────

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

  getStepIndex(step: WizardStep): number {
    return this.steps.findIndex(s => s.id === step);
  }

  isStepCompleted(step: WizardStep): boolean {
    return this.getStepIndex(step) < this.getStepIndex(this.currentStep());
  }
}
