import {
  Component,
  input,
  signal,
  computed,
  OnDestroy,
  PLATFORM_ID,
  inject,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import type { AiScene } from '../../../../core/models/ai-video.model';

@Component({
  selector: 'app-video-preview',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './video-preview.component.html',
  styleUrl: './video-preview.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VideoPreviewComponent implements OnDestroy {
  private readonly platformId = inject(PLATFORM_ID);

  // Signal inputs
  readonly scenes = input.required<AiScene[]>();
  readonly aspectRatio = input<string>('9:16');
  readonly watermark = input<boolean>(true);

  // State signals
  readonly currentSceneIndex = signal(0);
  readonly isPlaying = signal(false);
  readonly elapsedTime = signal(0);

  // Computed values
  readonly currentScene = computed(() => this.scenes()[this.currentSceneIndex()] ?? null);

  readonly totalDuration = computed(() =>
    this.scenes().reduce((sum, s) => sum + s.duration_seconds, 0),
  );

  readonly progressPercent = computed(() =>
    this.totalDuration() > 0 ? (this.elapsedTime() / this.totalDuration()) * 100 : 0,
  );

  readonly kenBurnsClass = computed(() => {
    const variants = ['kb-zoom-in', 'kb-zoom-out', 'kb-pan-left', 'kb-pan-right'];
    return variants[this.currentSceneIndex() % variants.length];
  });

  readonly aspectRatioStyle = computed(() => {
    const [w, h] = this.aspectRatio().split(':').map(Number);
    return `${w}/${h}`;
  });

  // Private playback members
  private audio: HTMLAudioElement | null = null;
  private sceneTimeout: ReturnType<typeof setTimeout> | null = null;
  private ticker: ReturnType<typeof setInterval> | null = null;

  // ─── Public API ────────────────────────────────────────────────────────────

  play(): void {
    if (!isPlatformBrowser(this.platformId)) return;

    this.isPlaying.set(true);
    this.playScene(this.currentSceneIndex());
    this._startTicker();
  }

  pause(): void {
    this.isPlaying.set(false);
    this._stopAudio();
    this._clearSceneTimeout();
    this._stopTicker();
  }

  togglePlay(): void {
    if (this.isPlaying()) {
      this.pause();
    } else {
      this.play();
    }
  }

  playScene(index: number): void {
    if (!isPlatformBrowser(this.platformId)) return;

    this._stopAudio();
    this._clearSceneTimeout();

    const scene = this.scenes()[index];
    if (!scene) {
      this.stop();
      return;
    }

    this.currentSceneIndex.set(index);

    if (scene.audio_url) {
      this.audio = new Audio(scene.audio_url);
      this.audio.play().catch(() => {
        // Audio playback may be blocked by browser policy; fail silently
      });
    }

    this.sceneTimeout = setTimeout(() => {
      this.nextScene();
    }, scene.duration_seconds * 1000);
  }

  nextScene(): void {
    const next = this.currentSceneIndex() + 1;
    if (next < this.scenes().length) {
      this.playScene(next);
    } else {
      this.stop();
    }
  }

  seekToScene(index: number): void {
    const clampedIndex = Math.max(0, Math.min(index, this.scenes().length - 1));

    // Calculate elapsed time up to the start of the target scene
    const elapsed = this.scenes()
      .slice(0, clampedIndex)
      .reduce((sum, s) => sum + s.duration_seconds, 0);

    this.elapsedTime.set(elapsed);

    if (this.isPlaying()) {
      this._stopAudio();
      this._clearSceneTimeout();
      this._stopTicker();
      this.currentSceneIndex.set(clampedIndex);
      this.playScene(clampedIndex);
      this._startTicker();
    } else {
      this.currentSceneIndex.set(clampedIndex);
    }
  }

  stop(): void {
    this.isPlaying.set(false);
    this._stopAudio();
    this._clearSceneTimeout();
    this._stopTicker();
    this.currentSceneIndex.set(0);
    this.elapsedTime.set(0);
  }

  ngOnDestroy(): void {
    this._stopAudio();
    this._clearSceneTimeout();
    this._stopTicker();
  }

  // ─── Private helpers ───────────────────────────────────────────────────────

  private _stopAudio(): void {
    if (this.audio) {
      this.audio.pause();
      this.audio.src = '';
      this.audio = null;
    }
  }

  private _clearSceneTimeout(): void {
    if (this.sceneTimeout !== null) {
      clearTimeout(this.sceneTimeout);
      this.sceneTimeout = null;
    }
  }

  private _startTicker(): void {
    this._stopTicker();
    this.ticker = setInterval(() => {
      const next = this.elapsedTime() + 0.1;
      this.elapsedTime.set(Math.min(next, this.totalDuration()));
    }, 100);
  }

  private _stopTicker(): void {
    if (this.ticker !== null) {
      clearInterval(this.ticker);
      this.ticker = null;
    }
  }
}
