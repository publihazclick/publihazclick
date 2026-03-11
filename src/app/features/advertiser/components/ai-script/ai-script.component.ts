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
  cta: string;
  music_suggestion: string;
  chapters?: { timestamp: string; title: string }[] | null;
  seo?: { title: string; hashtags: string[]; description: string } | null;
}

interface ImageResult {
  dataUrl: string | null;
  loaded: boolean;
  error: boolean;
}

interface AudioResult {
  blob: Blob | null;
  objectUrl: string | null;
  loaded: boolean;
  error: boolean;
}

interface VideoResult {
  operationName: string | null;
  videoUrl: string | null;
  status: 'idle' | 'pending' | 'completed' | 'failed';
  error: string | null;
}

interface PlatformOption {
  id: string;
  name: string;
  icon: string;
  specs: string;
  resolution: string;
  aspect: string;
  duration: number;       // segundos sugeridos
  format: 'short-form' | 'long-form';
  color: string;          // color de la marca
}

interface PlatformConfig {
  name: string;
  format: 'short-form' | 'long-form';
  duration: number;
  aspect: string;
  hashtag_count: number;
  seo_label: string;
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

type GeneratePhase = 'idle' | 'script' | 'images' | 'audio' | 'video' | 'done';

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
    {
      id: 'tiktok', name: 'TikTok', icon: 'music_note',
      specs: '9:16 · 45s · Hook 1s', resolution: '1080x1920', aspect: '9:16',
      duration: 45, format: 'short-form', color: '#010101',
    },
    {
      id: 'instagram', name: 'Instagram', icon: 'photo_camera',
      specs: '9:16 · 30s · Reels', resolution: '1080x1920', aspect: '9:16',
      duration: 30, format: 'short-form', color: '#E1306C',
    },
    {
      id: 'facebook', name: 'Facebook', icon: 'thumb_up',
      specs: '16:9 · 60s · Reels', resolution: '1920x1080', aspect: '16:9',
      duration: 60, format: 'short-form', color: '#1877F2',
    },
    {
      id: 'shorts', name: 'YouTube Shorts', icon: 'smart_display',
      specs: '9:16 · 60s · Loop', resolution: '1080x1920', aspect: '9:16',
      duration: 58, format: 'short-form', color: '#FF0000',
    },
    {
      id: 'youtube', name: 'YouTube', icon: 'play_circle',
      specs: '16:9 · 8 min · Largo', resolution: '1920x1080', aspect: '16:9',
      duration: 480, format: 'long-form', color: '#FF0000',
    },
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
    { key: 'video', label: 'Video', icon: 'smart_display' },
    { key: 'done', label: 'Listo', icon: 'check_circle' },
  ];
  readonly loading = signal(false);
  readonly errorMsg = signal<string | null>(null);
  readonly successMsg = signal<string | null>(null);

  readonly script = signal<ReelScript | null>(null);
  readonly platformConfig = signal<PlatformConfig | null>(null);
  readonly editingNarration = signal<number | null>(null);

  readonly imageProgress = signal(0);
  readonly imageResults = signal<ImageResult[]>([]);
  readonly generatingImages = signal(false);

  readonly audioProgress = signal(0);
  readonly audioResults = signal<AudioResult[]>([]);
  readonly generatingAudio = signal(false);

  readonly videoResult = signal<VideoResult>({
    operationName: null,
    videoUrl: null,
    status: 'idle',
    error: null,
  });
  readonly generatingVideo = signal(false);
  private videoPollingTimer: ReturnType<typeof setInterval> | null = null;

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
    const idx = this.wizardSteps.findIndex((s) => s.key === this.currentWizardStep());
    if (idx < this.wizardSteps.length - 1) {
      this.currentWizardStep.set(this.wizardSteps[idx + 1].key);
    }
  }

  prevStep() {
    const idx = this.wizardSteps.findIndex((s) => s.key === this.currentWizardStep());
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
    const desc = this.description().trim();
    if (desc.length < 10) {
      this.showError('Completa la descripción del producto/servicio primero.');
      return;
    }

    this.loading.set(true);
    this.errorMsg.set(null);
    this.script.set(null);
    this.platformConfig.set(null);
    this.generatePhase.set('script');

    try {
      const { data: { session } } = await this.supabase.auth.getSession();

      if (!session?.access_token) {
        this.showError('Sesion expirada. Recarga la pagina.');
        return;
      }

      // Contexto completo del wizard
      const platform = this.selectedPlatform() ?? 'shorts';
      const niche = this.customNiche().trim() || this.nicheLabel();
      const additionalContext = [
        this.seoTitle().trim() ? `Título sugerido: ${this.seoTitle().trim()}` : '',
        this.seoTags().trim() ? `Tags: ${this.seoTags().trim()}` : '',
        this.seoDescription().trim() ? `Descripción: ${this.seoDescription().trim()}` : '',
      ].filter(Boolean).join('\n');

      const fullDescription = additionalContext
        ? `${desc}\n\nContexto adicional:\n${additionalContext}`
        : desc;

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
            description: fullDescription,
            tone: this.tone(),
            audience: this.audience().trim() || undefined,
            platform,
            video_type: this.selectedVideoType() ?? undefined,
            niche: niche || undefined,
            monetization: this.selectedMonetization() ?? undefined,
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

      // Guardar config de plataforma devuelta
      if (data.platform_config) {
        this.platformConfig.set(data.platform_config);
      }

      // Auto-rellenar SEO con las sugerencias de la IA
      if (data.script.seo) {
        const seo = data.script.seo;
        if (!this.seoTitle().trim() && seo.title) {
          this.seoTitle.set(seo.title);
        }
        if (!this.seoTags().trim() && seo.hashtags?.length) {
          this.seoTags.set(seo.hashtags.map((h: string) => h.startsWith('#') ? h : `#${h}`).join(' '));
        }
        if (!this.seoDescription().trim() && seo.description) {
          this.seoDescription.set(seo.description);
        }
      }

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

  // ─── Generate Images (Vertex AI Imagen) ─────────────────────────────

  readonly isLongForm = computed(() =>
    this.selectedPlatformData()?.format === 'long-form'
  );

  readonly platformDurationLabel = computed(() => {
    const p = this.selectedPlatformData();
    if (!p) return '';
    if (p.duration >= 60) return `${Math.round(p.duration / 60)} min`;
    return `${p.duration}s`;
  });

  getAspectRatioForPlatform(): string {
    const cfg = this.platformConfig();
    if (cfg) return cfg.aspect;
    const platform = this.selectedPlatformData();
    if (!platform) return '9:16';
    return platform.aspect;
  }

  async startImageGeneration() {
    const s = this.script();
    if (!s) return;

    this.generatePhase.set('images');
    this.generatingImages.set(true);
    this.imageProgress.set(0);

    // Inicializar resultados vacíos
    const initial: ImageResult[] = s.scenes.map(() => ({
      dataUrl: null,
      loaded: false,
      error: false,
    }));
    this.imageResults.set(initial);

    const {
      data: { session },
    } = await this.supabase.auth.getSession();

    if (!session?.access_token) {
      this.showError('Sesión expirada. Recarga la página.');
      this.generatingImages.set(false);
      return;
    }

    const aspectRatio = this.getAspectRatioForPlatform();

    for (let i = 0; i < s.scenes.length; i++) {
      this.imageProgress.set(i + 1);
      await this.generateImageForScene(i, s.scenes[i].visual_description, session.access_token, aspectRatio);
    }

    this.generatingImages.set(false);
  }

  private async generateImageForScene(
    index: number,
    visualDescription: string,
    token: string,
    aspectRatio: string,
  ): Promise<void> {
    try {
      const res = await fetch(
        `${environment.supabase.url}/functions/v1/generate-vertex-image`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            apikey: environment.supabase.anonKey,
          },
          body: JSON.stringify({
            prompt: visualDescription,
            aspectRatio,
            sampleCount: 1,
          }),
        },
      );

      const data = await res.json();

      const results = [...this.imageResults()];
      if (res.ok && data.success && data.images?.[0]) {
        results[index] = { dataUrl: data.images[0].dataUrl, loaded: true, error: false };
      } else {
        results[index] = { dataUrl: null, loaded: false, error: true };
      }
      this.imageResults.set(results);
    } catch {
      const results = [...this.imageResults()];
      results[index] = { dataUrl: null, loaded: false, error: true };
      this.imageResults.set(results);
    }
  }

  async retryImage(index: number) {
    const s = this.script();
    if (!s) return;

    const results = [...this.imageResults()];
    results[index] = { dataUrl: null, loaded: false, error: false };
    this.imageResults.set(results);

    const {
      data: { session },
    } = await this.supabase.auth.getSession();

    if (!session?.access_token) {
      this.showError('Sesión expirada.');
      return;
    }

    this.imageProgress.set(index + 1);
    await this.generateImageForScene(
      index,
      s.scenes[index].visual_description,
      session.access_token,
      this.getAspectRatioForPlatform(),
    );
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

  // ─── Generate Video (Vertex AI Veo 2) ───────────────────────────────

  async startVideoGeneration() {
    const s = this.script();
    if (!s) return;

    this.generatePhase.set('video');
    this.generatingVideo.set(true);
    this.videoResult.set({ operationName: null, videoUrl: null, status: 'pending', error: null });

    const {
      data: { session },
    } = await this.supabase.auth.getSession();

    if (!session?.access_token) {
      this.showError('Sesión expirada.');
      this.generatingVideo.set(false);
      return;
    }

    try {
      // Construir prompt del video basado en el script
      const platform = this.selectedPlatformData();
      const aspectRatio = platform?.aspect === '9:16' ? '9:16' : '16:9';
      const videoPrompt = [
        s.hook,
        ...s.scenes.slice(0, 3).map((sc) => sc.visual_description),
      ]
        .filter(Boolean)
        .join('. ');

      const res = await fetch(
        `${environment.supabase.url}/functions/v1/generate-vertex-video`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
            apikey: environment.supabase.anonKey,
          },
          body: JSON.stringify({
            prompt: videoPrompt,
            aspectRatio,
            durationSeconds: 8,
          }),
        },
      );

      const data = await res.json();

      if (!res.ok || !data.success) {
        this.videoResult.set({
          operationName: null,
          videoUrl: null,
          status: 'failed',
          error: data.error || 'Error al iniciar generación de video.',
        });
        this.generatingVideo.set(false);
        return;
      }

      this.videoResult.update((v) => ({ ...v, operationName: data.operationName }));
      this.startVideoPolling(session.access_token);
    } catch {
      this.videoResult.set({
        operationName: null,
        videoUrl: null,
        status: 'failed',
        error: 'Error de conexión al iniciar el video.',
      });
      this.generatingVideo.set(false);
    }
  }

  private startVideoPolling(token: string) {
    this.videoPollingTimer = setInterval(async () => {
      await this.pollVideoStatus(token);
    }, 15000); // cada 15 segundos
  }

  private async pollVideoStatus(token: string) {
    const op = this.videoResult().operationName;
    if (!op) return;

    try {
      const res = await fetch(
        `${environment.supabase.url}/functions/v1/check-vertex-video`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            apikey: environment.supabase.anonKey,
          },
          body: JSON.stringify({ operationName: op }),
        },
      );

      const data = await res.json();

      if (!data.done) return; // sigue pendiente

      this.stopVideoPolling();
      this.generatingVideo.set(false);

      if (data.status === 'completed' && data.videoUrl) {
        this.videoResult.set({
          operationName: op,
          videoUrl: data.videoUrl,
          status: 'completed',
          error: null,
        });
        this.showSuccess('¡Video generado exitosamente!');
      } else {
        this.videoResult.set({
          operationName: op,
          videoUrl: null,
          status: 'failed',
          error: data.error || 'El video no pudo generarse.',
        });
      }
    } catch {
      // No detener el polling por un error temporal
    }
  }

  private stopVideoPolling() {
    if (this.videoPollingTimer) {
      clearInterval(this.videoPollingTimer);
      this.videoPollingTimer = null;
    }
  }

  skipVideoStep() {
    this.stopVideoPolling();
    this.generatePhase.set('done');
  }

  // ─── Done ───────────────────────────────────────────────────────────

  finishPipeline() {
    this.generatePhase.set('done');
  }

  downloadImage(index: number) {
    if (!isPlatformBrowser(this.platformId)) return;
    const result = this.imageResults()[index];
    if (!result?.loaded || !result.dataUrl) return;

    const link = document.createElement('a');
    link.href = result.dataUrl;
    link.download = `escena-${index + 1}.png`;
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
    this.stopVideoPolling();

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
    this.platformConfig.set(null);
    this.imageResults.set([]);
    this.imageProgress.set(0);
    this.audioResults.set([]);
    this.audioProgress.set(0);
    this.editingNarration.set(null);
    this.videoResult.set({ operationName: null, videoUrl: null, status: 'idle', error: null });
    this.generatingVideo.set(false);
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
