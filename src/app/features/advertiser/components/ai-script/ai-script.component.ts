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

type PipelineStep = 'form' | 'script' | 'images' | 'audio' | 'done';

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

  // Form inputs
  readonly description = signal('');
  readonly tone = signal('profesional');
  readonly audience = signal('');

  // Pipeline state
  readonly currentStep = signal<PipelineStep>('form');
  readonly loading = signal(false);
  readonly errorMsg = signal<string | null>(null);
  readonly successMsg = signal<string | null>(null);

  // Step 1: Script
  readonly script = signal<ReelScript | null>(null);
  readonly editingNarration = signal<number | null>(null);

  // Step 2: Images
  readonly imageProgress = signal(0);
  readonly imageResults = signal<ImageResult[]>([]);
  readonly generatingImages = signal(false);

  // Step 3: Audio
  readonly audioProgress = signal(0);
  readonly audioResults = signal<AudioResult[]>([]);
  readonly generatingAudio = signal(false);

  // Computed
  readonly totalScenes = computed(() => this.script()?.scenes.length ?? 0);
  readonly allImagesReady = computed(() => {
    const results = this.imageResults();
    return results.length > 0 && results.every((r) => r.loaded || r.error);
  });
  readonly allAudioReady = computed(() => {
    const results = this.audioResults();
    return results.length > 0 && results.every((r) => r.loaded || r.error);
  });

  readonly steps: { key: PipelineStep; label: string; icon: string }[] = [
    { key: 'form', label: 'Descripción', icon: 'edit_note' },
    { key: 'script', label: 'Guión', icon: 'description' },
    { key: 'images', label: 'Imágenes', icon: 'image' },
    { key: 'audio', label: 'Audio', icon: 'mic' },
    { key: 'done', label: 'Resultado', icon: 'check_circle' },
  ];

  readonly toneOptions = [
    { value: 'profesional', label: 'Profesional', icon: 'business_center' },
    { value: 'divertido', label: 'Divertido', icon: 'sentiment_very_satisfied' },
    { value: 'emocional', label: 'Emocional', icon: 'favorite' },
    { value: 'urgente', label: 'Urgente', icon: 'bolt' },
    { value: 'educativo', label: 'Educativo', icon: 'school' },
  ];

  getStepIndex(step: PipelineStep): number {
    return this.steps.findIndex((s) => s.key === step);
  }

  isStepCompleted(step: PipelineStep): boolean {
    return this.getStepIndex(this.currentStep()) > this.getStepIndex(step);
  }

  isStepActive(step: PipelineStep): boolean {
    return this.currentStep() === step;
  }

  // ─── Step 1: Generate Script ──────────────────────────────────────────

  async generateScript() {
    const desc = this.description().trim();
    if (desc.length < 10) {
      this.showError('La descripción debe tener al menos 10 caracteres.');
      return;
    }

    this.loading.set(true);
    this.errorMsg.set(null);
    this.script.set(null);

    try {
      const {
        data: { session },
      } = await this.supabase.auth.getSession();

      if (!session?.access_token) {
        this.showError('Sesión expirada. Recarga la página.');
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
        this.showError(data.error || 'Error al generar el guión.');
        return;
      }

      this.script.set(data.script);
      this.currentStep.set('script');
      this.showSuccess('Guión generado exitosamente.');
    } catch {
      this.showError('Error de conexión. Intenta de nuevo.');
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

  // ─── Step 2: Generate Images ──────────────────────────────────────────

  getImageUrl(visualDescription: string): string {
    const encoded = encodeURIComponent(visualDescription);
    return `https://image.pollinations.ai/prompt/${encoded}?model=flux&width=1080&height=1920&nologo=true`;
  }

  async startImageGeneration() {
    const s = this.script();
    if (!s) return;

    this.currentStep.set('images');
    this.generatingImages.set(true);
    this.imageProgress.set(0);

    const results: ImageResult[] = s.scenes.map((scene) => ({
      url: this.getImageUrl(scene.visual_description),
      loaded: false,
      error: false,
    }));
    this.imageResults.set(results);

    // Load images sequentially to avoid rate limiting
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
    const newUrl = this.getImageUrl(s.scenes[index].visual_description) + `&seed=${Date.now()}`;
    results[index] = { url: newUrl, loaded: false, error: false };
    this.imageResults.set(results);

    await this.loadImage(index);
  }

  // ─── Step 3: Generate Audio ───────────────────────────────────────────

  async startAudioGeneration() {
    const s = this.script();
    if (!s) return;

    this.currentStep.set('audio');
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
      this.showError('Sesión expirada. Recarga la página.');
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
      this.showError('Sesión expirada.');
      return;
    }

    this.audioProgress.set(index + 1);
    await this.generateAudioForScene(index, s.scenes[index].narration, session.access_token);
  }

  // ─── Step 4: Done — Downloads ─────────────────────────────────────────

  finishPipeline() {
    this.currentStep.set('done');
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
      `GUIÓN: ${s.title}`,
      `HOOK: ${s.hook}`,
      `DURACIÓN TOTAL: ${s.total_duration}s`,
      `MÚSICA: ${s.music_suggestion}`,
      '',
      '---',
      '',
    ];

    for (const scene of s.scenes) {
      lines.push(`ESCENA ${scene.scene} (${scene.duration_seconds}s) — ${scene.camera_direction}`);
      lines.push(`Narración: ${scene.narration}`);
      lines.push(`Overlay: ${scene.text_overlay}`);
      lines.push(`Visual: ${scene.visual_description}`);
      lines.push('');
    }

    navigator.clipboard
      .writeText(lines.join('\n'))
      .then(() => this.showSuccess('Guión copiado al portapapeles.'))
      .catch(() => this.showError('No se pudo copiar.'));
  }

  startOver() {
    // Revoke audio object URLs
    for (const a of this.audioResults()) {
      if (a.objectUrl) URL.revokeObjectURL(a.objectUrl);
    }

    this.currentStep.set('form');
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
