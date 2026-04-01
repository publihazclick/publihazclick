import { Component, inject, signal, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { PlatformSettingsService } from '../../../../core/services/platform-settings.service';

@Component({
  selector: 'app-admin-video-landing',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  templateUrl: './video-landing.component.html',
})
export class AdminVideoLandingComponent implements OnInit {
  private readonly settings = inject(PlatformSettingsService);
  private readonly sanitizer = inject(DomSanitizer);

  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly saved = signal(false);
  readonly error = signal<string | null>(null);

  // Video de abajo (sección video-section)
  videoUrl = '';
  previewUrl = signal<SafeResourceUrl | null>(null);

  // Video hero (arriba de "Activar mi cuenta ahora")
  heroVideoUrl = '';
  heroPreviewUrl = signal<SafeResourceUrl | null>(null);
  readonly savingHero = signal(false);
  readonly savedHero = signal(false);
  readonly errorHero = signal<string | null>(null);

  async ngOnInit(): Promise<void> {
    try {
      const [landing, hero] = await Promise.all([
        this.settings.getSetting('landing_video_url'),
        this.settings.getSetting('hero_video_url'),
      ]);
      this.videoUrl = landing;
      this.heroVideoUrl = hero;
      this.updatePreview();
      this.updateHeroPreview();
    } finally {
      this.loading.set(false);
    }
  }

  onUrlChange(): void {
    this.error.set(null);
    this.saved.set(false);
    this.updatePreview();
  }

  onHeroUrlChange(): void {
    this.errorHero.set(null);
    this.savedHero.set(false);
    this.updateHeroPreview();
  }

  private updatePreview(): void {
    const embedUrl = this.toEmbedUrl(this.videoUrl.trim());
    this.previewUrl.set(embedUrl ? this.sanitizer.bypassSecurityTrustResourceUrl(embedUrl) : null);
  }

  private updateHeroPreview(): void {
    const embedUrl = this.toEmbedUrl(this.heroVideoUrl.trim());
    this.heroPreviewUrl.set(embedUrl ? this.sanitizer.bypassSecurityTrustResourceUrl(embedUrl) : null);
  }

  private toEmbedUrl(url: string): string | null {
    if (!url) return null;
    try {
      // https://www.youtube.com/watch?v=ID
      const watchMatch = url.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
      if (watchMatch) return `https://www.youtube.com/embed/${watchMatch[1]}`;
      // https://youtu.be/ID
      const shortMatch = url.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/);
      if (shortMatch) return `https://www.youtube.com/embed/${shortMatch[1]}`;
      // https://www.youtube.com/embed/ID (ya es embed)
      const embedMatch = url.match(/youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/);
      if (embedMatch) return `https://www.youtube.com/embed/${embedMatch[1]}`;
    } catch {
      // URL inválida
    }
    return null;
  }

  async save(): Promise<void> {
    this.error.set(null);
    this.saved.set(false);

    const url = this.videoUrl.trim();
    if (url && !this.toEmbedUrl(url)) {
      this.error.set('URL no válida. Usa un enlace de YouTube (youtube.com/watch?v=... o youtu.be/...)');
      return;
    }

    this.saving.set(true);
    try {
      await this.settings.setSetting('landing_video_url', url);
      this.saved.set(true);
      setTimeout(() => this.saved.set(false), 3000);
    } catch (err: any) {
      this.error.set(err.message || 'Error al guardar');
    } finally {
      this.saving.set(false);
    }
  }

  clear(): void {
    this.videoUrl = '';
    this.previewUrl.set(null);
    this.error.set(null);
    this.saved.set(false);
  }

  async saveHero(): Promise<void> {
    this.errorHero.set(null);
    this.savedHero.set(false);

    const url = this.heroVideoUrl.trim();
    if (url && !this.toEmbedUrl(url)) {
      this.errorHero.set('URL no válida. Usa un enlace de YouTube (youtube.com/watch?v=... o youtu.be/...)');
      return;
    }

    this.savingHero.set(true);
    try {
      await this.settings.setSetting('hero_video_url', url);
      this.savedHero.set(true);
      setTimeout(() => this.savedHero.set(false), 3000);
    } catch (err: any) {
      this.errorHero.set(err.message || 'Error al guardar');
    } finally {
      this.savingHero.set(false);
    }
  }

  clearHero(): void {
    this.heroVideoUrl = '';
    this.heroPreviewUrl.set(null);
    this.errorHero.set(null);
    this.savedHero.set(false);
  }
}
