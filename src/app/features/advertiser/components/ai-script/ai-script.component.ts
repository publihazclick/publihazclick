import {
  Component,
  inject,
  signal,
  computed,
  ChangeDetectionStrategy,
  PLATFORM_ID,
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { getSupabaseClient } from '../../../../core/supabase.client';
import { environment } from '../../../../../environments/environment';

// ─── Interfaces ──────────────────────────────────────────────────────────────

interface Scene {
  scene: number;
  duration_seconds: number;
  narration: string;
  visual_description: string;
  camera_direction: string;
  text_overlay: string;
}

interface ReelScript {
  title: string;
  hook: string;
  scenes: Scene[];
  total_duration: number;
  music_suggestion: string;
}

interface ImageResult {
  url: string;
  loaded: boolean;
  error: boolean;
}

interface AudioResult {
  blob: Blob | null;
  objectUrl: string | null;
  loaded: boolean;
  error: boolean;
}

interface PlatformOption {
  id: string;
  name: string;
  icon: string;
  specs: string;
  resolution: string;
  aspect: string;
}

interface MonetizationType {
  id: string;
  name: string;
  subtitle: string;
  icon: string;
}

interface VideoType {
  id: string;
  name: string;
  subtitle: string;
  icon: string;
}

interface NicheOption {
  id: string;
  name: string;
  icon: string;
}

type WizardStep =
  | 'monetization'
  | 'video-type'
  | 'niche'
  | 'script'
  | 'seo'
  | 'generate';

type GeneratePhase = 'idle' | 'script' | 'images' | 'audio' | 'done';

@Component({
  selector: 'app-ai-script',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  templateUrl: './ai-script.component.html',
  styleUrls: ['./ai-script.component.scss'],
})
export class AiScriptComponent {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly supabase = getSupabaseClient();

  // ─── Wizard Steps ────────────────────────────────────────────────────

  readonly wizardSteps: { key: WizardStep; label: string; icon: string }[] = [
    { key: 'monetization', label: 'Objetivo', icon: 'attach_money' },
    { key: 'video-type', label: 'Tipo de Video', icon: 'smart_display' },
    { key: 'niche', label: 'Nicho', icon: 'target' },
    { key: 'script', label: 'Guion', icon: 'description' },
    { key: 'seo', label: 'SEO', icon: 'tag' },
    { key: 'generate', label: 'Generar', icon: 'auto_awesome' },
  ];

  readonly currentWizardStep = signal<WizardStep>('monetization');

  // ─── Step 1: Monetization ────────────────────────────────────────────

  readonly platforms: PlatformOption[] = [
    { id: 'youtube', name: 'YouTube', icon: 'play_circle', specs: '1080p, 16:9, Videos largos', resolution: '1920x1080', aspect: '16:9' },
    { id: 'tiktok', name: 'TikTok', icon: 'slow_motion_video', specs: '1080p, 9:16, Max 3min', resolution: '1080x1920', aspect: '9:16' },
    { id: 'instagram', name: 'Instagram', icon: 'photo_camera', specs: '1080p, 9:16, Reels 90s', resolution: '1080x1920', aspect: '9:16' },
    { id: 'facebook', name: 'Facebook', icon: 'groups', specs: '1080p, 16:9, Watch', resolution: '1920x1080', aspect: '16:9' },
    { id: 'shorts', name: 'Shorts', icon: 'movie', specs: '1080p, 9:16, Max 60s', resolution: '1080x1920', aspect: '9:16' },
  ];

  readonly monetizationTypes: MonetizationType[] = [
    { id: 'ads', name: 'Anuncios', subtitle: 'AdSense, CPM', icon: 'attach_money' },
    { id: 'affiliates', name: 'Afiliados', subtitle: 'Comisiones', icon: 'handshake' },
    { id: 'own-product', name: 'Producto Propio', subtitle: 'Venta directa', icon: 'storefront' },
    { id: 'dropshipping', name: 'Dropshipping', subtitle: 'Sin inventario', icon: 'local_shipping' },
    { id: 'personal-brand', name: 'Marca Personal', subtitle: 'Influencer', icon: 'person_celebrate' },
    { id: 'faceless', name: 'Canal Oscuro', subtitle: 'Automatizado', icon: 'visibility_off' },
  ];

  readonly selectedPlatform = signal<string | null>(null);
  readonly selectedMonetization = signal<string | null>(null);

  // ─── Step 2: Video Type ──────────────────────────────────────────────

  readonly videoTypes: VideoType[] = [
    { id: 'tutorial', name: 'Tutorial', subtitle: 'Paso a paso educativo', icon: 'school' },
    { id: 'review', name: 'Review', subtitle: 'Analisis de productos', icon: 'rate_review' },
    { id: 'storytelling', name: 'Storytelling', subtitle: 'Narrativa envolvente', icon: 'auto_stories' },
    { id: 'listicle', name: 'Top / Lista', subtitle: 'Ranking o listados', icon: 'format_list_numbered' },
    { id: 'howto', name: 'How-to', subtitle: 'Como hacer algo', icon: 'build' },
    { id: 'motivation', name: 'Motivacional', subtitle: 'Inspirar y conectar', icon: 'emoji_events' },
    { id: 'news', name: 'Noticias', subtitle: 'Tendencias y actualidad', icon: 'newspaper' },
    { id: 'unboxing', name: 'Unboxing', subtitle: 'Abrir y mostrar productos', icon: 'inventory_2' },
  ];

  readonly selectedVideoType = signal<string | null>(null);

  // ─── Step 3: Niche ───────────────────────────────────────────────────

  readonly nicheOptions: NicheOption[] = [
    { id: 'tech', name: 'Tecnologia', icon: 'devices' },
    { id: 'fitness', name: 'Fitness', icon: 'fitness_center' },
    { id: 'cooking', name: 'Cocina', icon: 'restaurant' },
    { id: 'finance', name: 'Finanzas', icon: 'account_balance' },
    { id: 'beauty', name: 'Belleza', icon: 'spa' },
    { id: 'gaming', name: 'Gaming', icon: 'sports_esports' },
    { id: 'travel', name: 'Viajes', icon: 'flight' },
    { id: 'education', name: 'Educacion', icon: 'menu_book' },
    { id: 'fashion', name: 'Moda', icon: 'checkroom' },
    { id: 'health', name: 'Salud', icon: 'health_and_safety' },
    { id: 'business', name: 'Negocios', icon: 'business_center' },
    { id: 'entertainment', name: 'Entretenimiento', icon: 'theater_comedy' },
  ];

  readonly selectedNiche = signal<string | null>(null);
  readonly customNiche = signal('');

  // ─── Step 4: Script Details ──────────────────────────────────────────

  readonly description = signal('');
  readonly tone = signal('profesional');
  readonly audience = signal('');

  readonly toneOptions = [
    { value: 'profesional', label: 'Profesional', icon: 'business_center' },
    { value: 'divertido', label: 'Divertido', icon: 'sentiment_very_satisfied' },
    { value: 'emocional', label: 'Emocional', icon: 'favorite' },
    { value: 'urgente', label: 'Urgente', icon: 'bolt' },
    { value: 'educativo', label: 'Educativo', icon: 'school' },
  ];

  // ─── Step 5: SEO ─────────────────────────────────────────────────────

  readonly seoTitle = signal('');
  readonly seoTags = signal('');
  readonly seoDescription = signal('');

  // ─── Step 6: Generate Pipeline ───────────────────────────────────────

  readonly generatePhase = signal<GeneratePhase>('idle');

  // Aliases used by the template (pipeline progress indicator)
  readonly currentStep = computed(() => {
    const phase = this.generatePhase();
    return phase === 'idle' ? 'form' : phase;
  });

  readonly steps = [
    { key: 'form', label: 'Guión', icon: 'edit_note' },
    { key: 'script', label: 'Revisión', icon: 'description' },
    { key: 'images', label: 'Imágenes', icon: 'image' },
    { key: 'audio', label: 'Audio', icon: 'mic' },
    { key: 'done', label: 'Listo', icon: 'check_circle' },
  ];
  readonly loading = signal(false);
  readonly errorMsg = signal<string | null>(null);
  readonly successMsg = signal<string | null>(null);

  readonly script = signal<ReelScript | null>(null);
  readonly editingNarration = signal<number | null>(null);

  readonly imageProgress = signal(0);
  readonly imageResults = signal<ImageResult[]>([]);
  readonly generatingImages = signal(false);

  readonly audioProgress = signal(0);
  readonly audioResults = signal<AudioResult[]>([]);
  readonly generatingAudio = signal(false);

  // ─── Computed ────────────────────────────────────────────────────────

  readonly totalScenes = computed(() => this.script()?.scenes.length ?? 0);

  readonly allImagesReady = computed(() => {
    const results = this.imageResults();
    return results.length > 0 && results.every((r) => r.loaded || r.error);
  });

  readonly allAudioReady = computed(() => {
    const results = this.audioResults();
    return results.length > 0 && results.every((r) => r.loaded || r.error);
  });

  readonly canAdvanceStep = computed(() => {
    switch (this.currentWizardStep()) {
      case 'monetization':
        return !!this.selectedPlatform() && !!this.selectedMonetization();
      case 'video-type':
        return !!this.selectedVideoType();
      case 'niche':
        return !!this.selectedNiche() || this.customNiche().trim().length > 2;
      case 'script':
        return this.description().trim().length >= 10;
      case 'seo':
        return true; // SEO is optional
      case 'generate':
        return false;
      default:
        return false;
    }
  });

  readonly selectedPlatformData = computed(() =>
    this.platforms.find((p) => p.id === this.selectedPlatform())
  );

  readonly selectedVideoTypeData = computed(() =>
    this.videoTypes.find((v) => v.id === this.selectedVideoType())
  );

  readonly nicheLabel = computed(() => {
    const custom = this.customNiche().trim();
    if (custom) return custom;
    return this.nicheOptions.find((n) => n.id === this.selectedNiche())?.name ?? '';
  });

  // ─── Wizard Navigation ──────────────────────────────────────────────

  getStepIndex(step: string): number {
    // Check pipeline steps first, then wizard steps
    const pipelineIdx = this.steps.findIndex((s) => s.key === step);
    if (pipelineIdx >= 0) return pipelineIdx;
    return this.wizardSteps.findIndex((s) => s.key === step);
  }

  isStepCompleted(step: string): boolean {
    const currentIdx = this.steps.findIndex((s) => s.key === this.currentStep());
    const stepIdx = this.steps.findIndex((s) => s.key === step);
    if (stepIdx >= 0) return currentIdx > stepIdx;
    return this.getStepIndex(this.currentWizardStep()) > this.getStepIndex(step);
  }

  isStepActive(step: string): boolean {
    const pipelineIdx = this.steps.findIndex((s) => s.key === step);
    if (pipelineIdx >= 0) return this.currentStep() === step;
    return this.currentWizardStep() === step;
  }

  isStepAccessible(step: string): boolean {
    const targetIdx = this.getStepIndex(step);
    const currentIdx = this.getStepIndex(this.currentWizardStep());
    return targetIdx <= currentIdx;
  }

  goToStep(step: string) {
    if (this.isStepAccessible(step)) {
      this.currentWizardStep.set(step as WizardStep);
    }
  }

  nextStep() {
    const idx = this.getStepIndex(this.currentWizardStep());
    if (idx < this.wizardSteps.length - 1) {
      this.currentWizardStep.set(this.wizardSteps[idx + 1].key);
    }
  }

  prevStep() {
    const idx = this.getStepIndex(this.currentWizardStep());
    if (idx > 0) {
      this.currentWizardStep.set(this.wizardSteps[idx - 1].key);
    }
  }

  // ─── Build AI prompt from wizard selections ─────────────────────────

  private buildPromptContext(): string {
    const parts: string[] = [];

    const platform = this.selectedPlatformData();
    if (platform) {
      parts.push(`Plataforma: ${platform.name} (${platform.specs})`);
    }

    const monetization = this.monetizationTypes.find(
      (m) => m.id === this.selectedMonetization()
    );
    if (monetization) {
      parts.push(`Monetizacion: ${monetization.name} — ${monetization.subtitle}`);
    }

    const videoType = this.selectedVideoTypeData();
    if (videoType) {
      parts.push(`Tipo de video: ${videoType.name} — ${videoType.subtitle}`);
    }

    const niche = this.nicheLabel();
    if (niche) {
      parts.push(`Nicho: ${niche}`);
    }

    const desc = this.description().trim();
    if (desc) {
      parts.push(`Descripcion del producto/servicio: ${desc}`);
    }

    if (this.seoTitle().trim()) {
      parts.push(`Titulo SEO sugerido: ${this.seoTitle().trim()}`);
    }
    if (this.seoTags().trim()) {
      parts.push(`Tags SEO: ${this.seoTags().trim()}`);
    }

    return parts.join('\n');
  }

  // ─── Generate Script ────────────────────────────────────────────────

  async generateScript() {
    const desc = this.buildPromptContext();
    if (desc.length < 10) {
      this.showError('Completa los pasos anteriores primero.');
      return;
    }

    this.loading.set(true);
    this.errorMsg.set(null);
    this.script.set(null);
    this.generatePhase.set('script');

    try {
      const {
        data: { session },
      } = await this.supabase.auth.getSession();

      if (!session?.access_token) {
        this.showError('Sesion expirada. Recarga la pagina.');
        return;
      }

      const res = await fetch(
        `${environment.supabase.url}/functions/v1/generate-reel-script`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
            apikey: environment.supabase.anonKey,
          },
          body: JSON.stringify({
            description: desc,
            tone: this.tone(),
            audience: this.audience().trim() || undefined,
          }),
        }
      );

      const data = await res.json();

      if (!res.ok || !data.success) {
        this.showError(data.error || 'Error al generar el guion.');
        this.generatePhase.set('idle');
        return;
      }

      this.script.set(data.script);
      this.showSuccess('Guion generado exitosamente.');
    } catch {
      this.showError('Error de conexion. Intenta de nuevo.');
      this.generatePhase.set('idle');
    } finally {
      this.loading.set(false);
    }
  }

  updateNarration(index: number, value: string) {
    const s = this.script();
    if (!s) return;
    const scenes = [...s.scenes];
    scenes[index] = { ...scenes[index], narration: value };
    this.script.set({ ...s, scenes });
  }

  startEditNarration(index: number) {
    this.editingNarration.set(index);
  }

  stopEditNarration() {
    this.editingNarration.set(null);
  }

  // ─── Generate Images ────────────────────────────────────────────────

  getImageUrl(visualDescription: string): string {
    const platform = this.selectedPlatformData();
    const width = platform?.aspect === '9:16' ? 1080 : 1920;
    const height = platform?.aspect === '9:16' ? 1920 : 1080;
    const encoded = encodeURIComponent(visualDescription);
    return `https://image.pollinations.ai/prompt/${encoded}?model=flux&width=${width}&height=${height}&nologo=true`;
  }

  async startImageGeneration() {
    const s = this.script();
    if (!s) return;

    this.generatePhase.set('images');
    this.generatingImages.set(true);
    this.imageProgress.set(0);

    const results: ImageResult[] = s.scenes.map((scene) => ({
      url: this.getImageUrl(scene.visual_description),
      loaded: false,
      error: false,
    }));
    this.imageResults.set(results);

    for (let i = 0; i < results.length; i++) {
      this.imageProgress.set(i + 1);
      await this.loadImage(i);
    }

    this.generatingImages.set(false);
  }

  private loadImage(index: number): Promise<void> {
    return new Promise((resolve) => {
      if (!isPlatformBrowser(this.platformId)) {
        resolve();
        return;
      }

      const results = this.imageResults();
      const img = new Image();

      img.onload = () => {
        const updated = [...results];
        updated[index] = { ...updated[index], loaded: true, error: false };
        this.imageResults.set(updated);
        resolve();
      };

      img.onerror = () => {
        const updated = [...results];
        updated[index] = { ...updated[index], loaded: false, error: true };
        this.imageResults.set(updated);
        resolve();
      };

      img.src = results[index].url;
    });
  }

  async retryImage(index: number) {
    const s = this.script();
    if (!s) return;

    const results = [...this.imageResults()];
    const newUrl =
      this.getImageUrl(s.scenes[index].visual_description) + `&seed=${Date.now()}`;
    results[index] = { url: newUrl, loaded: false, error: false };
    this.imageResults.set(results);

    await this.loadImage(index);
  }

  // ─── Generate Audio ─────────────────────────────────────────────────

  async startAudioGeneration() {
    const s = this.script();
    if (!s) return;

    this.generatePhase.set('audio');
    this.generatingAudio.set(true);
    this.audioProgress.set(0);

    const results: AudioResult[] = s.scenes.map(() => ({
      blob: null,
      objectUrl: null,
      loaded: false,
      error: false,
    }));
    this.audioResults.set(results);

    const {
      data: { session },
    } = await this.supabase.auth.getSession();

    if (!session?.access_token) {
      this.showError('Sesion expirada. Recarga la pagina.');
      this.generatingAudio.set(false);
      return;
    }

    for (let i = 0; i < s.scenes.length; i++) {
      this.audioProgress.set(i + 1);
      await this.generateAudioForScene(i, s.scenes[i].narration, session.access_token);
    }

    this.generatingAudio.set(false);
  }

  private async generateAudioForScene(
    index: number,
    text: string,
    token: string
  ): Promise<void> {
    try {
      const res = await fetch(
        `${environment.supabase.url}/functions/v1/generate-tts-audio`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            apikey: environment.supabase.anonKey,
          },
          body: JSON.stringify({ text, voice: 'es-CO-GonzaloNeural' }),
        }
      );

      if (!res.ok) {
        throw new Error('TTS failed');
      }

      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);

      const results = [...this.audioResults()];
      results[index] = { blob, objectUrl, loaded: true, error: false };
      this.audioResults.set(results);
    } catch {
      const results = [...this.audioResults()];
      results[index] = { blob: null, objectUrl: null, loaded: false, error: true };
      this.audioResults.set(results);
    }
  }

  async retryAudio(index: number) {
    const s = this.script();
    if (!s) return;

    const results = [...this.audioResults()];
    results[index] = { blob: null, objectUrl: null, loaded: false, error: false };
    this.audioResults.set(results);

    const {
      data: { session },
    } = await this.supabase.auth.getSession();

    if (!session?.access_token) {
      this.showError('Sesion expirada.');
      return;
    }

    this.audioProgress.set(index + 1);
    await this.generateAudioForScene(
      index,
      s.scenes[index].narration,
      session.access_token
    );
  }

  // ─── Done ───────────────────────────────────────────────────────────

  finishPipeline() {
    this.generatePhase.set('done');
  }

  downloadImage(index: number) {
    if (!isPlatformBrowser(this.platformId)) return;
    const result = this.imageResults()[index];
    if (!result?.loaded) return;

    const link = document.createElement('a');
    link.href = result.url;
    link.download = `escena-${index + 1}.jpg`;
    link.target = '_blank';
    link.click();
  }

  downloadAudio(index: number) {
    if (!isPlatformBrowser(this.platformId)) return;
    const result = this.audioResults()[index];
    if (!result?.objectUrl) return;

    const link = document.createElement('a');
    link.href = result.objectUrl;
    link.download = `audio-escena-${index + 1}.mp3`;
    link.click();
  }

  copyScript() {
    const s = this.script();
    if (!s || !isPlatformBrowser(this.platformId)) return;

    const lines: string[] = [
      `GUION: ${s.title}`,
      `HOOK: ${s.hook}`,
      `DURACION TOTAL: ${s.total_duration}s`,
      `MUSICA: ${s.music_suggestion}`,
      '',
      '---',
      '',
    ];

    for (const scene of s.scenes) {
      lines.push(
        `ESCENA ${scene.scene} (${scene.duration_seconds}s) - ${scene.camera_direction}`
      );
      lines.push(`Narracion: ${scene.narration}`);
      lines.push(`Overlay: ${scene.text_overlay}`);
      lines.push(`Visual: ${scene.visual_description}`);
      lines.push('');
    }

    navigator.clipboard
      .writeText(lines.join('\n'))
      .then(() => this.showSuccess('Guion copiado al portapapeles.'))
      .catch(() => this.showError('No se pudo copiar.'));
  }

  startOver() {
    for (const a of this.audioResults()) {
      if (a.objectUrl) URL.revokeObjectURL(a.objectUrl);
    }

    this.currentWizardStep.set('monetization');
    this.generatePhase.set('idle');
    this.selectedPlatform.set(null);
    this.selectedMonetization.set(null);
    this.selectedVideoType.set(null);
    this.selectedNiche.set(null);
    this.customNiche.set('');
    this.description.set('');
    this.tone.set('profesional');
    this.audience.set('');
    this.seoTitle.set('');
    this.seoTags.set('');
    this.seoDescription.set('');
    this.script.set(null);
    this.imageResults.set([]);
    this.imageProgress.set(0);
    this.audioResults.set([]);
    this.audioProgress.set(0);
    this.editingNarration.set(null);
  }

  private showError(msg: string) {
    this.errorMsg.set(msg);
    setTimeout(() => this.errorMsg.set(null), 5000);
  }

  private showSuccess(msg: string) {
    this.successMsg.set(msg);
    setTimeout(() => this.successMsg.set(null), 3000);
  }
}
