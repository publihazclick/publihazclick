import {
  Component,
  ChangeDetectionStrategy,
  computed,
  inject,
  OnDestroy,
  OnInit,
  PLATFORM_ID,
  signal,
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { AiVideoService } from '../../../../core/services/ai-video.service';
import { AiWalletService } from '../../../../core/services/ai-wallet.service';
import { ProfileService } from '../../../../core/services/profile.service';
import type {
  AiScene,
  AiScript,
  AiPlatform,
  AiVideoDuration,
  AiVoiceType,
  AiPlatformConfig,
  AiPlatformOption,
  AiVoiceOption,
} from '../../../../core/models/ai-video.model';
import { VideoPreviewComponent } from '../video-preview/video-preview.component';

type WizardStep = 'platform' | 'topic' | 'script' | 'voice' | 'images' | 'preview';
const STEPS: WizardStep[] = ['platform', 'topic', 'script', 'voice', 'images', 'preview'];

@Component({
  selector: 'app-video-create',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, VideoPreviewComponent],
  templateUrl: './video-create.component.html',
  styleUrl: './video-create.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VideoCreateComponent implements OnInit, OnDestroy {
  readonly aiVideoService = inject(AiVideoService);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly walletService = inject(AiWalletService);
  private readonly profileService = inject(ProfileService);

  readonly walletBalance = this.walletService.balance;
  readonly walletLoaded = signal(false);
  readonly profile = this.profileService.profile;

  async ngOnInit(): Promise<void> {
    try { await this.walletService.loadWallet(); } catch {}
    this.walletLoaded.set(true);
  }

  // --- Wizard state ---
  readonly currentStep = signal<WizardStep>('platform');
  readonly topic = signal('');
  readonly selectedPlatform = signal<AiPlatform | null>(null);
  readonly selectedDuration = signal<AiVideoDuration>(30);
  readonly selectedVideoType = signal('educational');
  readonly selectedTone = signal('professional');
  readonly selectedMonetization = signal('personal_brand');
  readonly selectedVoiceType = signal<AiVoiceType | null>(null);
  readonly script = signal<AiScript | null>(null);
  readonly platformConfig = signal<AiPlatformConfig | null>(null);
  readonly scenes = signal<AiScene[]>([]);
  readonly isGenerating = signal(false);
  readonly generationStep = signal('');
  readonly progress = signal(0);
  readonly error = signal<string | null>(null);
  readonly previewVoiceLoading = signal(false);
  readonly generatingTitle = signal(false);
  readonly suggestedTitles = signal<{ title: string; views: string; channel: string }[]>([]);

  // Track highest step reached to allow backwards navigation clicks
  private maxStepIndex = 0;

  // --- Computed ---
  readonly stepIndex = computed(() => STEPS.indexOf(this.currentStep()));

  readonly canProceed = computed(() => {
    switch (this.currentStep()) {
      case 'platform':
        return !!this.selectedPlatform();
      case 'topic':
        return this.topic().trim().length >= 10 && !!this.selectedDuration();
      case 'script':
        return !!this.script() && !this.isGenerating();
      case 'voice':
        return !!this.selectedVoiceType();
      case 'images':
        return this.scenes().some(s => !!s.image_url) && !this.isGenerating();
      case 'preview':
        return true;
      default:
        return false;
    }
  });

  // --- Static data ---
  readonly platforms: AiPlatformOption[] = [
    {
      id: 'tiktok',
      name: 'TikTok',
      icon: '🎵',
      description: 'Videos cortos virales',
      aspect: '9:16',
      durations: [15, 30, 60, 90, 180],
    },
    {
      id: 'instagram',
      name: 'Instagram Reels',
      icon: '📸',
      description: 'Reels para engagement',
      aspect: '9:16',
      durations: [15, 30, 60, 90],
    },
    {
      id: 'shorts',
      name: 'YouTube Shorts',
      icon: '🎬',
      description: 'Shorts de alto alcance',
      aspect: '9:16',
      durations: [15, 30, 60],
    },
    {
      id: 'facebook',
      name: 'Facebook Reels',
      icon: '📘',
      description: 'Reels para Facebook',
      aspect: '9:16',
      durations: [15, 30, 60, 90, 180],
    },
    {
      id: 'youtube',
      name: 'YouTube',
      icon: '▶️',
      description: 'Videos largos optimizados',
      aspect: '16:9',
      durations: [60, 90, 180],
    },
  ];

  readonly videoTypes = ['educational', 'tutorial', 'entertainment', 'promotional', 'storytelling'];
  readonly tones = ['professional', 'casual', 'humorous', 'inspirational', 'dramatic'];
  readonly monetizations = ['personal_brand', 'affiliate', 'ads', 'product', 'service'];

  // --- Navigation ---
  nextStep(): void {
    const idx = this.stepIndex();
    if (idx >= STEPS.length - 1) return;
    const next = STEPS[idx + 1];
    this.currentStep.set(next);
    if (idx + 1 > this.maxStepIndex) {
      this.maxStepIndex = idx + 1;
    }
    if (next === 'script') {
      this.generateScript();
    }
    if (next === 'images') {
      this.generateImages();
    }
  }

  prevStep(): void {
    const idx = this.stepIndex();
    if (idx <= 0) return;
    this.currentStep.set(STEPS[idx - 1]);
  }

  goToStep(step: WizardStep): void {
    const targetIdx = STEPS.indexOf(step);
    if (targetIdx <= this.maxStepIndex) {
      this.currentStep.set(step);
    }
  }

  // --- Generation ---
  async generateWinnerTitle(): Promise<void> {
    if (this.topic().trim().length < 10) return;

    this.generatingTitle.set(true);
    this.suggestedTitles.set([]);
    this.error.set(null);

    try {
      const titles = await this.aiVideoService.searchViralYouTubeTitles(this.topic());
      this.suggestedTitles.set(titles);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error buscando títulos virales';
      this.error.set(msg);
    } finally {
      this.generatingTitle.set(false);
    }
  }

  selectTitle(t: { title: string }): void {
    this.topic.set(t.title);
    this.suggestedTitles.set([]);
  }

  async generateScript(): Promise<void> {
    const platform = this.selectedPlatform();
    if (!platform) return;

    this.isGenerating.set(true);
    this.error.set(null);
    this.generationStep.set('Generando guión con IA...');
    this.progress.set(10);

    try {
      const result = await this.aiVideoService.generateScript(this.topic(), platform, {
        video_type: this.selectedVideoType(),
        tone: this.selectedTone(),
        monetization: this.selectedMonetization(),
        duration: this.selectedDuration(),
      });
      this.script.set(result.script);
      this.platformConfig.set(result.platform_config);
      this.scenes.set(result.script.scenes);
      this.progress.set(100);

      // Guardar en historial
      await this.aiVideoService.saveProject({
        kind: 'script',
        title: `${platform} — ${this.topic()}`,
        prompt: this.topic(),
        provider: 'gemini',
        data: {
          platform,
          duration: this.selectedDuration(),
          tone: this.selectedTone(),
          scenes_count: result.script.scenes.length,
        },
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error generando el guión';
      this.error.set(msg);
    } finally {
      this.isGenerating.set(false);
      this.generationStep.set('');
    }
  }

  async generateImages(): Promise<void> {
    const currentScenes = this.scenes();
    if (!currentScenes.length) return;

    const aspect = this.getAspectRatio();
    this.isGenerating.set(true);
    this.error.set(null);

    try {
      const updated = await this.aiVideoService.generateSceneImages(currentScenes, aspect);
      this.scenes.set(updated);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error generando imágenes';
      this.error.set(msg);
    } finally {
      this.isGenerating.set(false);
      this.generationStep.set('');
    }

    // Sync progress from service signal
    this.progress.set(this.aiVideoService.generationProgress());
  }

  async regenerateSceneImage(index: number): Promise<void> {
    const currentScenes = this.scenes();
    if (index < 0 || index >= currentScenes.length) return;

    const scene = currentScenes[index];
    const aspect = this.getAspectRatio();

    this.isGenerating.set(true);
    this.error.set(null);
    this.generationStep.set(`Regenerando imagen escena ${scene.scene}...`);

    try {
      const result = await this.aiVideoService.generateImage(scene.visual_description, aspect);
      const updated = currentScenes.map((s, i) =>
        i === index ? { ...s, image_url: result.dataUrl } : s
      );
      this.scenes.set(updated);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error regenerando imagen';
      this.error.set(msg);
    } finally {
      this.isGenerating.set(false);
      this.generationStep.set('');
    }
  }

  async previewVoice(): Promise<void> {
    const voiceType = this.selectedVoiceType();
    const scriptData = this.script();
    if (!voiceType || !scriptData?.scenes?.length) return;

    const voiceOption = this.aiVideoService
      .getVoiceOptions()
      .find(v => v.type === voiceType);
    if (!voiceOption) return;

    this.previewVoiceLoading.set(true);
    this.error.set(null);

    try {
      const firstNarration = scriptData.scenes[0].narration;
      const audioUrl = await this.aiVideoService.generateAudio(
        firstNarration,
        voiceOption.voice_id
      );

      if (isPlatformBrowser(this.platformId)) {
        const audio = new Audio(audioUrl);
        audio.play();
        // Revoke blob after playback ends
        audio.addEventListener('ended', () => {
          if (audioUrl.startsWith('blob:')) {
            URL.revokeObjectURL(audioUrl);
          }
        });
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error generando preview de voz';
      this.error.set(msg);
    } finally {
      this.previewVoiceLoading.set(false);
    }
  }

  // --- Helpers ---
  getVoiceOptions(): AiVoiceOption[] {
    return this.aiVideoService.getVoiceOptions();
  }

  getAspectRatio(): string {
    return this.platformConfig()?.aspect ?? '9:16';
  }

  getSelectedPlatformDurations(): AiVideoDuration[] {
    const id = this.selectedPlatform();
    return this.platforms.find(p => p.id === id)?.durations ?? [];
  }

  ngOnDestroy(): void {
    this.aiVideoService.cleanupBlobUrls(this.scenes());
  }
}
