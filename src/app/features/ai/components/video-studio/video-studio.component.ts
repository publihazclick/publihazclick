import { Component, ChangeDetectionStrategy, inject, signal, computed, OnInit, PLATFORM_ID, ViewChild } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ProfileService } from '../../../../core/services/profile.service';
import { AiWalletService } from '../../../../core/services/ai-wallet.service';
import { AiVideoService } from '../../../../core/services/ai-video.service';
import { getSupabaseClient } from '../../../../core/supabase.client';
import { environment } from '../../../../../environments/environment';
import { VideoPreviewComponent } from '../video-preview/video-preview.component';
import type { AiScene, AiScript } from '../../../../core/models/ai-video.model';

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
  preview_audio?: string | null;
}

type CreationMode = 'images' | 'avatar' | 'photo' | 'product';
type Platform = 'youtube' | 'tiktok' | 'instagram' | 'facebook' | 'shorts';
type WizardStep = 'mode' | 'platform' | 'avatar' | 'script' | 'config' | 'scenes' | 'generate';

@Component({
  selector: 'app-video-studio',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule, VideoPreviewComponent],
  templateUrl: './video-studio.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VideoStudioComponent implements OnInit {
  private readonly profileService = inject(ProfileService);
  private readonly walletService = inject(AiWalletService);
  private readonly aiVideo = inject(AiVideoService);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly supabase = getSupabaseClient();
  readonly currentProjectId = signal<string | null>(null);

  readonly profile = this.profileService.profile;
  readonly walletBalance = this.walletService.balance;
  readonly walletLoaded = signal(false);

  // Wizard
  readonly currentStep = signal<WizardStep>('mode');
  readonly steps: { id: WizardStep; label: string; icon: string }[] = [
    { id: 'mode', label: 'Modo', icon: 'category' },
    { id: 'platform', label: 'Plataforma', icon: 'devices' },
    { id: 'avatar', label: 'Avatar', icon: 'person' },
    { id: 'script', label: 'Guion', icon: 'description' },
    { id: 'config', label: 'Configurar', icon: 'tune' },
    { id: 'scenes', label: 'Escenas', icon: 'image' },
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

  // Images mode: script estructurado + escenas con imágenes/audio generados
  readonly currentScript = signal<AiScript | null>(null);
  readonly generatedScenes = signal<AiScene[]>([]);
  readonly imagesProgress = signal(0);
  readonly imagesStep = signal('');
  readonly recordingVideo = signal(false);
  readonly generatingImages = signal(false);
  readonly regeneratingIndex = signal<number | null>(null);
  readonly motionOptions: { id: string; label: string; icon: string }[] = [
    { id: 'zoom-in', label: 'Zoom in', icon: 'zoom_in' },
    { id: 'zoom-out', label: 'Zoom out', icon: 'zoom_out' },
    { id: 'pan-left', label: 'Pan izquierda', icon: 'arrow_back' },
    { id: 'pan-right', label: 'Pan derecha', icon: 'arrow_forward' },
    { id: 'static', label: 'Estático', icon: 'crop_square' },
  ];

  async ngOnInit(): Promise<void> {
    try { await this.walletService.loadWallet(); } catch {}
    this.walletLoaded.set(true);
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
      // Modo imágenes: paso extra 'scenes' para generar + ajustar movimiento
      return ['mode', 'platform', 'script', 'config', 'scenes', 'generate'];
    }
    return ['mode', 'platform', 'avatar', 'script', 'config', 'generate'];
  }

  nextStep(): void {
    const order = this.getStepOrder();
    const idx = order.indexOf(this.currentStep());
    if (idx >= order.length - 1) return;
    const next = order[idx + 1];
    this.currentStep.set(next);

    // Side effects al entrar a un paso
    if (next === 'avatar' && this.selectedMode() === 'avatar') this.loadAvatars();
    if (next === 'config') this.loadVoices();
    if (next === 'scenes') this.generateScenesImages();
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
      case 'scenes':
        return this.generatedScenes().some(s => !!s.image_url) && !this.generatingImages();
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

  readonly uploadingPhoto = signal(false);
  readonly photoUploadError = signal<string | null>(null);

  async onPhotoSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    // Preview local inmediato
    const reader = new FileReader();
    const dataUrlPromise = new Promise<string>((resolve, reject) => {
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error('No se pudo leer el archivo'));
    });
    reader.readAsDataURL(file);

    this.uploadingPhoto.set(true);
    this.photoUploadError.set(null);
    try {
      const dataUrl = await dataUrlPromise;
      this.userPhotoUrl.set(dataUrl);

      // Subir la foto a HeyGen para crear un talking_photo personalizado.
      // Cobra 'photo_avatar_heygen' en el edge function.
      const { data, error } = await this.supabase.functions.invoke('create-heygen-photo-avatar', {
        body: { image_base64: dataUrl },
      });

      if (error) {
        const errMsg = (error as { context?: { error?: string }; message?: string })?.message
          || (error as { context?: { error?: string }; message?: string })?.context?.error
          || 'Error al subir foto';
        throw new Error(errMsg);
      }
      if (!data?.talking_photo_id) {
        throw new Error(data?.error || 'HeyGen no devolvió talking_photo_id');
      }

      this.talkingPhotoId.set(data.talking_photo_id);
    } catch (e) {
      this.photoUploadError.set(e instanceof Error ? e.message : 'Error al subir foto');
      this.userPhotoUrl.set(null);
      this.talkingPhotoId.set(null);
    } finally {
      this.uploadingPhoto.set(false);
      input.value = '';
    }
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

  // ── Voice preview audio ─────────────────────────────────────────────────
  readonly playingVoiceId = signal<string | null>(null);
  private previewAudio: HTMLAudioElement | null = null;

  /**
   * Mapea el idioma textual de HeyGen ("Spanish", "English"…) al código BCP-47
   * que usa SpeechSynthesis. Español se prefiere es-MX (más neutro para LATAM).
   */
  private mapLangToBcp47(language: string | undefined): string {
    const l = (language ?? '').toLowerCase();
    if (l.includes('spanish') || l.includes('español')) return 'es-MX';
    if (l.includes('english') || l.includes('inglés')) return 'en-US';
    if (l.includes('portuguese') || l.includes('portugués')) return 'pt-BR';
    if (l.includes('french') || l.includes('francés')) return 'fr-FR';
    if (l.includes('german') || l.includes('alemán')) return 'de-DE';
    if (l.includes('italian') || l.includes('italiano')) return 'it-IT';
    if (l.includes('chinese') || l.includes('chino')) return 'zh-CN';
    if (l.includes('japanese') || l.includes('japonés')) return 'ja-JP';
    if (l.includes('korean') || l.includes('coreano')) return 'ko-KR';
    if (l.includes('arabic') || l.includes('árabe')) return 'ar-SA';
    if (l.includes('hindi')) return 'hi-IN';
    if (l.includes('dutch') || l.includes('holandés')) return 'nl-NL';
    if (l.includes('russian') || l.includes('ruso')) return 'ru-RU';
    if (l.includes('turkish') || l.includes('turco')) return 'tr-TR';
    if (l.includes('polish') || l.includes('polaco')) return 'pl-PL';
    if (l.includes('swedish') || l.includes('sueco')) return 'sv-SE';
    if (l.includes('indonesian') || l.includes('indonesio')) return 'id-ID';
    if (l.includes('vietnamese') || l.includes('vietnamita')) return 'vi-VN';
    if (l.includes('thai') || l.includes('tailandés')) return 'th-TH';
    if (l.includes('filipino')) return 'fil-PH';
    return 'es-MX';
  }

  /** Heurística para elegir una voz del sistema según género. */
  private pickBrowserVoice(lang: string, gender: string | undefined): SpeechSynthesisVoice | null {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null;
    const all = window.speechSynthesis.getVoices();
    if (!all.length) return null;

    const base = lang.split('-')[0].toLowerCase();
    const byLang = all.filter(v => v.lang.toLowerCase().startsWith(base));
    const pool = byLang.length ? byLang : all;

    const maleHints = /male|hombre|masculin|diego|jorge|miguel|carlos|pablo|antonio|pedro|juan|luis|david|jose|enrique|francisco|ricardo|daniel|alex/i;
    const femaleHints = /female|mujer|feminin|maria|sofia|lucia|paulina|ana|laura|elena|paula|carmen|pilar|monica|sara|teresa|isabel|valeria|camila|gabriela|helena/i;

    if (gender === 'male') {
      return pool.find(v => maleHints.test(v.name)) || pool.find(v => !femaleHints.test(v.name)) || pool[0];
    }
    if (gender === 'female') {
      return pool.find(v => femaleHints.test(v.name)) || pool.find(v => !maleHints.test(v.name)) || pool[0];
    }
    return pool[0];
  }

  playVoicePreview(voice: HeyGenVoice, event?: Event): void {
    event?.stopPropagation();
    if (!isPlatformBrowser(this.platformId)) return;

    // Si ya está sonando la misma voz, la detiene (toggle)
    if (this.playingVoiceId() === voice.voice_id) {
      this.stopVoicePreview();
      this.selectVoice(voice);
      return;
    }

    // Detener cualquier preview activo antes de empezar otro
    this.stopVoicePreview();

    const script = this.scriptContent().trim();

    // Preferencia 1: leer el guion del usuario con SpeechSynthesis del navegador
    if (script && typeof window !== 'undefined' && 'speechSynthesis' in window) {
      const utter = new SpeechSynthesisUtterance(script.slice(0, 600));
      const bcp47 = this.mapLangToBcp47(voice.language);
      utter.lang = bcp47;
      utter.rate = 1.0;
      utter.pitch = voice.gender === 'female' ? 1.1 : 0.95;

      const sysVoice = this.pickBrowserVoice(bcp47, voice.gender);
      if (sysVoice) utter.voice = sysVoice;

      utter.onend = () => {
        if (this.playingVoiceId() === voice.voice_id) this.playingVoiceId.set(null);
      };
      utter.onerror = () => {
        if (this.playingVoiceId() === voice.voice_id) this.playingVoiceId.set(null);
      };

      // En algunos navegadores getVoices() es async; cargamos si hace falta
      if (!window.speechSynthesis.getVoices().length) {
        window.speechSynthesis.onvoiceschanged = () => {
          const v = this.pickBrowserVoice(bcp47, voice.gender);
          if (v) utter.voice = v;
        };
      }

      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utter);
      this.playingVoiceId.set(voice.voice_id);
      this.selectVoice(voice);
      return;
    }

    // Preferencia 2: si no hay guion aún, usar el preview genérico de HeyGen
    if (voice.preview_audio) {
      const audio = new Audio(voice.preview_audio);
      audio.onended = () => {
        if (this.playingVoiceId() === voice.voice_id) {
          this.playingVoiceId.set(null);
          this.previewAudio = null;
        }
      };
      audio.onerror = () => {
        this.playingVoiceId.set(null);
        this.previewAudio = null;
      };
      audio.play().catch(() => {
        this.playingVoiceId.set(null);
        this.previewAudio = null;
      });
      this.previewAudio = audio;
      this.playingVoiceId.set(voice.voice_id);
    }
    this.selectVoice(voice);
  }

  stopVoicePreview(): void {
    if (this.previewAudio) {
      this.previewAudio.pause();
      this.previewAudio = null;
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    this.playingVoiceId.set(null);
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

  // ── Modo manual (fallback si la IA falla o se quiere escribir a mano) ───

  /** Estado visual del modo manual del título */
  readonly manualTitleActive = signal(false);
  /** Estado visual del modo manual del guión */
  readonly scriptSaved = signal<'none' | 'ai' | 'manual'>('none');
  readonly savingScript = signal(false);

  /**
   * Activa el modo título manual. Oculta sugerencias de IA, limpia el
   * error y deja el foco en el input para que el usuario escriba libremente.
   */
  useManualTitle(): void {
    this.suggestedTitles.set([]);
    this.manualTitleActive.set(true);
    this.scriptError.set(null);
    // Pequeño ayuda visual: si el input está vacío, mantener como está;
    // el usuario ya está en el input y puede escribir.
  }

  /**
   * Guarda el guión escrito manualmente en ai_projects como respaldo e
   * historial. También marca scriptSaved='manual' para feedback en UI.
   * Si scriptContent está vacío, avisa y no guarda.
   */
  async saveManualScript(): Promise<void> {
    const content = this.scriptContent().trim();
    if (!content) {
      this.scriptError.set('Escribe el guion antes de guardarlo.');
      return;
    }
    this.savingScript.set(true);
    this.scriptError.set(null);
    try {
      await this.aiVideo.saveProject({
        kind: 'script',
        title: this.videoTopic() || 'Guion manual',
        prompt: this.videoTopic() || undefined,
        provider: 'manual',
        data: {
          platform: this.selectedPlatform(),
          duration: this.duration(),
          content,
          chars: content.length,
        },
      });
      this.scriptSaved.set('manual');
    } catch (e) {
      console.error('Error guardando guion manual:', e);
      this.scriptError.set(e instanceof Error ? e.message : 'Error guardando el guión');
    } finally {
      this.savingScript.set(false);
    }
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
        this.currentScript.set(parsed.script as AiScript);
        this.scriptSaved.set('ai');
        // Guardar en historial ai_projects
        try {
          await this.aiVideo.saveProject({
            kind: 'script',
            title: this.videoTopic() || 'Guion IA',
            prompt: topic,
            provider: 'gemini',
            data: {
              platform,
              duration: durationSec,
              script: parsed.script,
              content: narration,
            },
          });
        } catch { /* historial es best-effort */ }
      } else {
        throw new Error('No se generaron escenas');
      }
    } catch (e: unknown) {
      console.error('Error generando guion:', e);
      const msg = e instanceof Error ? e.message : 'Error generando el guión';
      // Mensaje claro que invita a usar modo manual
      this.scriptError.set(
        `${msg}. Puedes escribir el guion manualmente abajo y continuar.`,
      );
      // NO borramos scriptContent si ya tenía algo escrito a mano — respeta el trabajo del usuario
    } finally {
      this.generatingScript.set(false);
    }
  }

  // ── Escenas sintéticas desde texto manual ───────────────────────────────

  /** Parte el guion plano en escenas para el modo 'images'. */
  private buildScenesFromScript(): AiScene[] {
    // Si ya tenemos un AiScript estructurado (venido de la IA), usarlo
    const existing = this.currentScript();
    if (existing?.scenes?.length) return existing.scenes;

    // Si no, partir el texto plano en párrafos
    const content = this.scriptContent().trim();
    if (!content) return [];
    const paragraphs = content.split(/\n{2,}|(?<=\.)\s+(?=[A-ZÁÉÍÓÚÑ])/)
      .map(p => p.trim())
      .filter(p => p.length > 0);

    const totalSec = this.parseDurationToSeconds();
    const perScene = Math.max(3, Math.round(totalSec / Math.max(1, paragraphs.length)));
    const topic = this.videoTopic() || 'escena';

    return paragraphs.map((narration, i) => ({
      scene: i + 1,
      duration_seconds: perScene,
      narration,
      visual_description: `${topic} — ${narration.slice(0, 120)}`,
      camera_direction: 'static',
      text_overlay: '',
    }));
  }

  /** Mapea la voz HeyGen seleccionada a un voice_id de Azure Neural TTS. */
  private mapHeygenVoiceToAzure(): string {
    const voice = this.selectedVoice();
    const lang = (voice?.language ?? 'Spanish').toLowerCase();
    const gender = voice?.gender ?? 'male';

    const table: Record<string, { male: string; female: string }> = {
      spanish: { male: 'es-CO-GonzaloNeural', female: 'es-CO-SalomeNeural' },
      english: { male: 'en-US-GuyNeural', female: 'en-US-JennyNeural' },
      portuguese: { male: 'pt-BR-AntonioNeural', female: 'pt-BR-FranciscaNeural' },
      french: { male: 'fr-FR-HenriNeural', female: 'fr-FR-DeniseNeural' },
      german: { male: 'de-DE-ConradNeural', female: 'de-DE-KatjaNeural' },
      italian: { male: 'it-IT-DiegoNeural', female: 'it-IT-ElsaNeural' },
      chinese: { male: 'zh-CN-YunxiNeural', female: 'zh-CN-XiaoxiaoNeural' },
      japanese: { male: 'ja-JP-KeitaNeural', female: 'ja-JP-NanamiNeural' },
      korean: { male: 'ko-KR-InJoonNeural', female: 'ko-KR-SunHiNeural' },
      arabic: { male: 'ar-SA-HamedNeural', female: 'ar-SA-ZariyahNeural' },
      hindi: { male: 'hi-IN-MadhurNeural', female: 'hi-IN-SwaraNeural' },
      dutch: { male: 'nl-NL-MaartenNeural', female: 'nl-NL-ColetteNeural' },
      russian: { male: 'ru-RU-DmitryNeural', female: 'ru-RU-SvetlanaNeural' },
      turkish: { male: 'tr-TR-AhmetNeural', female: 'tr-TR-EmelNeural' },
      polish: { male: 'pl-PL-MarekNeural', female: 'pl-PL-ZofiaNeural' },
      swedish: { male: 'sv-SE-MattiasNeural', female: 'sv-SE-SofieNeural' },
      indonesian: { male: 'id-ID-ArdiNeural', female: 'id-ID-GadisNeural' },
      vietnamese: { male: 'vi-VN-NamMinhNeural', female: 'vi-VN-HoaiMyNeural' },
      thai: { male: 'th-TH-NiwatNeural', female: 'th-TH-PremwadeeNeural' },
      filipino: { male: 'fil-PH-AngeloNeural', female: 'fil-PH-BlessicaNeural' },
    };

    const key = Object.keys(table).find(k => lang.includes(k)) ?? 'spanish';
    const slot = table[key];
    return gender === 'female' ? slot.female : slot.male;
  }

  /** Aspect ratio en formato "16:9" o "9:16" según plataforma. */
  getAspectRatioString(): string {
    const p = this.selectedPlatform();
    if (p === 'tiktok' || p === 'instagram' || p === 'shorts') return '9:16';
    return '16:9';
  }

  /**
   * Genera una imagen con Vertex y, si falla (p.ej. credenciales de Google no
   * configuradas en Supabase), reintenta automáticamente con Flux (Replicate).
   */
  private async generateSceneImageWithFallback(
    prompt: string,
    aspect: string,
  ): Promise<string> {
    // Vertex primero
    try {
      const r = await this.aiVideo.generateImage(prompt, aspect);
      return r.dataUrl;
    } catch (vertexErr) {
      console.warn('[video-studio] Vertex falló, probando Flux:', vertexErr);
    }
    // Flux como fallback
    try {
      const aspectFlux = aspect === '9:16' ? '9:16' : '16:9';
      const urls = await this.aiVideo.generateFluxImage(prompt, aspectFlux, 1);
      if (urls?.[0]) return urls[0];
    } catch (fluxErr) {
      throw fluxErr instanceof Error ? fluxErr : new Error('Error generando imagen');
    }
    throw new Error('No se pudo generar la imagen con ningún proveedor');
  }

  /**
   * Paso 'scenes': genera las imágenes secuencialmente a partir del guion.
   * Reporta errores reales al UI y actualiza la grilla a medida que cada
   * imagen termina (mejor UX que esperar el lote completo).
   */
  async generateScenesImages(): Promise<void> {
    if (this.generatedScenes().length && this.generatedScenes().every(s => !!s.image_url)) {
      return;
    }

    const scenes = this.buildScenesFromScript();
    if (!scenes.length) {
      this.videoError.set('No hay guion para generar imágenes. Escribe el guion primero.');
      return;
    }

    const maxScenes = 8;
    const workingScenes = scenes.slice(0, maxScenes).map(s => ({
      ...s,
      camera_direction: s.camera_direction || this.defaultMotionFor(s.scene - 1),
    }));

    // Arranca con las escenas vacías visibles (cada una muestra su propio spinner)
    this.generatedScenes.set(workingScenes);
    this.videoError.set(null);
    this.generatingImages.set(true);
    this.imagesProgress.set(0);
    this.imagesStep.set('Generando imágenes acorde al guion…');

    const aspect = this.getAspectRatioString();
    let successCount = 0;
    const failures: string[] = [];

    try {
      for (let i = 0; i < workingScenes.length; i++) {
        const s = workingScenes[i];
        this.imagesStep.set(`Escena ${i + 1} de ${workingScenes.length}…`);
        try {
          const prompt = this.enrichImagePrompt(s.visual_description, s.narration);
          const dataUrl = await this.generateSceneImageWithFallback(prompt, aspect);
          // Actualiza inmediatamente esta escena en el signal
          const next = [...this.generatedScenes()];
          next[i] = { ...next[i], image_url: dataUrl };
          this.generatedScenes.set(next);
          successCount++;
        } catch (err) {
          console.error(`Escena ${i + 1} falló:`, err);
          failures.push(err instanceof Error ? err.message : 'error');
        }
        this.imagesProgress.set(Math.round(((i + 1) / workingScenes.length) * 100));
      }

      if (successCount === 0) {
        this.videoError.set(
          `No se pudo generar ninguna imagen. Razón: ${failures[0] ?? 'desconocida'}. ` +
          `Verifica que las credenciales de Vertex AI y/o Replicate estén configuradas en Supabase.`,
        );
      } else if (failures.length) {
        this.videoError.set(
          `Se generaron ${successCount} de ${workingScenes.length} imágenes. ` +
          `Puedes regenerar las escenas vacías con el botón ↻.`,
        );
      }
    } finally {
      this.generatingImages.set(false);
      this.imagesStep.set('');
    }
  }

  /** Construye un prompt visual más rico combinando título del video + descripción de escena. */
  private enrichImagePrompt(visual: string, narration: string): string {
    const topic = this.videoTopic().trim();
    const base = visual || narration;
    const style = 'cinematic, high detail, professional photography, dramatic lighting, 4k';
    return topic ? `${topic} — ${base}. ${style}` : `${base}. ${style}`;
  }

  private defaultMotionFor(index: number): string {
    const variants = ['zoom-in', 'zoom-out', 'pan-left', 'pan-right'];
    return variants[index % variants.length];
  }

  /** Cambia el movimiento (Ken Burns) de una escena específica. */
  setSceneMotion(index: number, motion: string): void {
    const scenes = [...this.generatedScenes()];
    if (index < 0 || index >= scenes.length) return;
    scenes[index] = { ...scenes[index], camera_direction: motion };
    this.generatedScenes.set(scenes);
  }

  /** Regenera la imagen de una escena específica (con fallback Vertex → Flux). */
  async regenerateSceneImage(index: number): Promise<void> {
    const scenes = [...this.generatedScenes()];
    if (index < 0 || index >= scenes.length) return;
    const scene = scenes[index];
    this.regeneratingIndex.set(index);
    this.videoError.set(null);
    try {
      const aspect = this.getAspectRatioString();
      const dataUrl = await this.generateSceneImageWithFallback(
        this.enrichImagePrompt(scene.visual_description, scene.narration),
        aspect,
      );
      scenes[index] = { ...scene, image_url: dataUrl };
      this.generatedScenes.set(scenes);
    } catch (e) {
      this.videoError.set(e instanceof Error ? e.message : 'Error regenerando imagen');
    } finally {
      this.regeneratingIndex.set(null);
    }
  }

  /**
   * Paso 'generate' para modo images: genera narración TTS por escena y
   * prepara el preview reproducible. Las imágenes ya están listas del paso
   * anterior.
   */
  async generateImagesVideo(): Promise<void> {
    const scenes = this.generatedScenes();
    if (!scenes.length || !scenes.every(s => s.image_url)) {
      this.videoError.set('Primero genera las imágenes en el paso Escenas.');
      return;
    }

    this.videoError.set(null);
    this.generatingVideo.set(true);
    this.imagesProgress.set(0);
    this.imagesStep.set('Generando narración con IA…');

    try {
      const azureVoiceId = this.mapHeygenVoiceToAzure();
      const withAudio = await this.aiVideo.generateSceneAudios(scenes, azureVoiceId);
      this.generatedScenes.set(withAudio);
      this.imagesProgress.set(100);

      const pid = await this.aiVideo.saveProject({
        kind: 'video',
        title: this.videoTopic() || 'Video Imágenes en Movimiento',
        prompt: this.scriptContent().slice(0, 200),
        status: 'completed',
        provider: 'images+tts',
        data: {
          platform: this.selectedPlatform() ?? null,
          scenes_count: withAudio.length,
          voice_azure: azureVoiceId,
          mode: 'images',
        },
      });
      if (pid) this.currentProjectId.set(pid);
      await this.walletService.loadWallet();
    } catch (e) {
      this.videoError.set(e instanceof Error ? e.message : 'Error generando narración');
    } finally {
      this.generatingVideo.set(false);
      this.imagesStep.set('');
    }
  }

  /** Descarga el preview como .webm usando MediaRecorder sobre canvas + audio. */
  @ViewChild(VideoPreviewComponent) previewRef?: VideoPreviewComponent;

  async downloadImagesVideo(): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) return;
    const scenes = this.generatedScenes();
    if (!scenes.length) return;

    this.recordingVideo.set(true);
    try {
      const aspect = this.getAspectRatioString();
      const [w, h] = aspect.split(':').map(Number);
      const canvas = document.createElement('canvas');
      canvas.width = aspect === '9:16' ? 720 : 1280;
      canvas.height = aspect === '9:16' ? 1280 : 720;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas no soportado');

      const videoStream = canvas.captureStream(30);
      const audioCtx = new AudioContext();
      const dest = audioCtx.createMediaStreamDestination();
      const combined = new MediaStream([
        ...videoStream.getVideoTracks(),
        ...dest.stream.getAudioTracks(),
      ]);

      const chunks: Blob[] = [];
      const recorder = new MediaRecorder(combined, {
        mimeType: 'video/webm;codecs=vp9,opus',
      });
      recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };

      const done = new Promise<Blob>(resolve => {
        recorder.onstop = () => resolve(new Blob(chunks, { type: 'video/webm' }));
      });
      recorder.start();

      // Reproducir y dibujar cada escena
      for (const scene of scenes) {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        if (scene.image_url) {
          await new Promise<void>((resolve, reject) => {
            img.onload = () => resolve();
            img.onerror = () => reject(new Error('img load'));
            img.src = scene.image_url!;
          }).catch(() => null);
        }

        // Reproducir audio vía AudioContext para mezclar en el stream
        let source: AudioBufferSourceNode | null = null;
        if (scene.audio_url) {
          try {
            const res = await fetch(scene.audio_url);
            const ab = await res.arrayBuffer();
            const buf = await audioCtx.decodeAudioData(ab);
            source = audioCtx.createBufferSource();
            source.buffer = buf;
            source.connect(dest);
            source.start();
          } catch { /* audio opcional */ }
        }

        const durationMs = Math.max(scene.duration_seconds, 3) * 1000;
        const start = performance.now();
        await new Promise<void>(resolve => {
          const draw = () => {
            ctx.fillStyle = '#000';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            if (img.complete && img.naturalWidth) {
              const ratio = Math.max(canvas.width / img.naturalWidth, canvas.height / img.naturalHeight);
              const dw = img.naturalWidth * ratio;
              const dh = img.naturalHeight * ratio;
              ctx.drawImage(img, (canvas.width - dw) / 2, (canvas.height - dh) / 2, dw, dh);
            }
            const elapsed = performance.now() - start;
            if (elapsed < durationMs) requestAnimationFrame(draw);
            else resolve();
          };
          draw();
        });
        if (source) try { source.stop(); } catch { /* ignore */ }
      }

      recorder.stop();
      const blob = await done;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `video-${Date.now()}.webm`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      this.videoError.set(e instanceof Error ? e.message : 'Error al descargar video');
    } finally {
      this.recordingVideo.set(false);
    }
  }

  // ── Generate Video ──────────────────────────────────────────────────────

  async generateVideo(): Promise<void> {
    const voice = this.selectedVoice();
    if (!voice || !this.scriptContent().trim()) return;

    this.videoError.set(null);

    // Validación previa según el modo seleccionado para evitar el 400 del edge
    const mode = this.selectedMode();
    if (mode === 'avatar' && !this.selectedAvatar()) {
      this.videoError.set('Selecciona un avatar antes de generar el video.');
      return;
    }
    if ((mode === 'photo' || mode === 'product') && !this.talkingPhotoId()) {
      this.videoError.set('Sube una foto antes de generar el video.');
      return;
    }
    // Modo 'images': usa pipeline local (imágenes + TTS + reproductor)
    if (mode === 'images') {
      await this.generateImagesVideo();
      return;
    }

    this.generatingVideo.set(true);

    try {
      const characterType = mode === 'avatar' ? 'avatar' : 'talking_photo';
      const payload: Record<string, unknown> = {
        voice_id: voice.voice_id,
        script: this.scriptContent(),
        title: this.videoTopic() || 'Video PubliHazClick',
        dimension: this.getDimension(),
        character_type: characterType,
      };
      if (mode === 'avatar') payload['avatar_id'] = this.selectedAvatar()!.avatar_id;
      else payload['talking_photo_id'] = this.talkingPhotoId();

      // Llamamos vía fetch para poder leer el body del error (supabase.functions.invoke
      // descarta el JSON del error y no podemos mostrar el mensaje real al usuario).
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      const { data: { session } } = await this.supabase.auth.getSession();
      if (session) headers['Authorization'] = `Bearer ${session.access_token}`;

      const res = await fetch(
        `${environment.supabase.url}/functions/v1/generate-heygen-video`,
        { method: 'POST', headers, body: JSON.stringify(payload) },
      );

      const data = await res.json().catch(() => null) as
        | { video_id?: string; error?: string; status?: string; video_url?: string; thumbnail_url?: string }
        | null;

      if (!res.ok || !data?.video_id) {
        throw new Error(data?.error ?? `Error al generar video (${res.status})`);
      }

      const videoId = data.video_id;
      this.videoResult.set({
        video_id: videoId,
        status: data.status ?? 'processing',
        video_url: data.video_url,
        thumbnail_url: data.thumbnail_url,
      });
      // Crear proyecto "processing" en historial para que el usuario lo vea
      const projectId = await this.aiVideo.saveProject({
        kind: 'video',
        title: this.videoTopic() || 'Video Avatar HeyGen',
        prompt: this.scriptContent().slice(0, 200),
        status: 'processing',
        provider: 'heygen',
        external_id: videoId,
        data: {
          platform: this.selectedPlatform() ?? null,
          voice_id: this.selectedVoice()?.voice_id ?? null,
          avatar_id: this.selectedAvatar()?.avatar_id ?? null,
          talking_photo_id: this.talkingPhotoId() ?? null,
          mode: this.selectedMode(),
        },
      });
      if (projectId) this.currentProjectId.set(projectId);
      // Refrescar balance
      await this.walletService.loadWallet();
      this.pollVideoStatus(videoId);
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
          const pid = this.currentProjectId();
          if (pid) {
            await this.aiVideo.updateProjectStatus(pid, 'completed', {
              url: data.video_url,
              thumbnail: data.thumbnail_url ?? undefined,
            });
          }
          return;
        }
        if (data?.status === 'failed') {
          this.videoError.set('El video fallo al generarse. Intenta de nuevo.');
          this.checkingStatus.set(false);
          const pid = this.currentProjectId();
          if (pid) {
            await this.aiVideo.updateProjectStatus(pid, 'failed');
          }
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
