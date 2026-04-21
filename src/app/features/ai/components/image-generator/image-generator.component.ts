import { Component, ChangeDetectionStrategy, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { ProfileService } from '../../../../core/services/profile.service';
import { AiVideoService } from '../../../../core/services/ai-video.service';
import { AiWalletService } from '../../../../core/services/ai-wallet.service';

interface StyleOption {
  id: string;
  label: string;
  icon: string;
  preview: string;
}

interface AspectOption {
  id: string;
  label: string;
  ratio: string;
  width: number;
  height: number;
}

interface GeneratedImage {
  url: string;
  prompt: string;
  style: string;
  aspect: string;
  createdAt: Date;
}

@Component({
  selector: 'app-image-generator',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './image-generator.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ImageGeneratorComponent implements OnInit {
  private readonly profileService = inject(ProfileService);
  private readonly aiService = inject(AiVideoService);
  private readonly walletService = inject(AiWalletService);

  readonly profile = this.profileService.profile;
  readonly walletBalance = this.walletService.balance;
  readonly walletLoaded = signal(false);

  async ngOnInit(): Promise<void> {
    try { await this.walletService.loadWallet(); } catch {}
    this.walletLoaded.set(true);
  }

  // Form
  readonly prompt = signal('');
  readonly negativePrompt = signal('');
  readonly selectedStyle = signal('realistic');
  readonly selectedAspect = signal('1:1');
  readonly imageCount = signal(1);
  readonly enhancePrompt = signal(true);

  // State
  readonly isGenerating = signal(false);
  readonly generationProgress = signal(0);
  readonly error = signal<string | null>(null);
  readonly generatedImages = signal<GeneratedImage[]>([]);
  readonly selectedImage = signal<GeneratedImage | null>(null);
  readonly showHistory = signal(false);

  readonly canGenerate = computed(() =>
    this.prompt().trim().length >= 5 && !this.isGenerating()
  );

  readonly styles: StyleOption[] = [
    { id: 'realistic', label: 'Fotorrealista', icon: 'photo_camera', preview: 'linear-gradient(135deg, #1a1a2e, #16213e, #0f3460)' },
    { id: 'artistic', label: 'Artístico', icon: 'palette', preview: 'linear-gradient(135deg, #ff6b6b, #feca57, #48dbfb)' },
    { id: 'digital_art', label: 'Arte Digital', icon: 'brush', preview: 'linear-gradient(135deg, #a855f7, #ec4899, #6366f1)' },
    { id: 'illustration', label: 'Ilustración', icon: 'draw', preview: 'linear-gradient(135deg, #f97316, #eab308, #22c55e)' },
    { id: 'cartoon', label: 'Cartoon', icon: 'animation', preview: 'linear-gradient(135deg, #06b6d4, #8b5cf6, #ec4899)' },
    { id: 'watercolor', label: 'Acuarela', icon: 'water_drop', preview: 'linear-gradient(135deg, #93c5fd, #c4b5fd, #fbcfe8)' },
    { id: '3d_render', label: '3D Render', icon: 'view_in_ar', preview: 'linear-gradient(135deg, #334155, #475569, #64748b)' },
    { id: 'pixel_art', label: 'Pixel Art', icon: 'grid_view', preview: 'linear-gradient(135deg, #059669, #0d9488, #0891b2)' },
    { id: 'anime', label: 'Anime', icon: 'face', preview: 'linear-gradient(135deg, #e879f9, #f472b6, #fb923c)' },
    { id: 'cinematic', label: 'Cinemático', icon: 'movie', preview: 'linear-gradient(135deg, #0c0c0c, #1e1b4b, #312e81)' },
    { id: 'oil_painting', label: 'Óleo', icon: 'format_paint', preview: 'linear-gradient(135deg, #78350f, #92400e, #a16207)' },
    { id: 'minimalist', label: 'Minimalista', icon: 'crop_square', preview: 'linear-gradient(135deg, #f8fafc, #e2e8f0, #cbd5e1)' },
  ];

  readonly aspects: AspectOption[] = [
    { id: '1:1', label: 'Cuadrado', ratio: '1:1', width: 1024, height: 1024 },
    { id: '16:9', label: 'Paisaje', ratio: '16:9', width: 1344, height: 768 },
    { id: '9:16', label: 'Vertical', ratio: '9:16', width: 768, height: 1344 },
    { id: '4:3', label: 'Estándar', ratio: '4:3', width: 1152, height: 896 },
    { id: '3:2', label: 'Foto', ratio: '3:2', width: 1216, height: 832 },
    { id: '21:9', label: 'Ultra Wide', ratio: '21:9', width: 1536, height: 640 },
  ];

  readonly promptSuggestions = [
    'Un atardecer sobre montañas nevadas con lago cristalino',
    'Logo moderno minimalista para startup tecnológica',
    'Producto cosmético premium flotando con pétalos de rosa',
    'Ciudad futurista cyberpunk con luces de neón',
    'Retrato profesional corporativo fondo degradado',
    'Banner publicitario para tienda de moda online',
    'Ilustración infantil de un bosque mágico encantado',
    'Plato gourmet con fotografía profesional de comida',
  ];

  async generate(): Promise<void> {
    if (!this.canGenerate()) return;

    this.isGenerating.set(true);
    this.error.set(null);
    this.generationProgress.set(0);

    const style = this.styles.find(s => s.id === this.selectedStyle())!;
    const aspect = this.aspects.find(a => a.id === this.selectedAspect())!;
    const count = this.imageCount();

    // Build enhanced prompt
    let fullPrompt = this.prompt().trim();
    if (this.enhancePrompt()) {
      fullPrompt += `, ${style.label} style, high quality, detailed, professional`;
    }
    if (this.negativePrompt().trim()) {
      fullPrompt += `. Avoid: ${this.negativePrompt().trim()}`;
    }

    try {
      const newImages: GeneratedImage[] = [];

      for (let i = 0; i < count; i++) {
        this.generationProgress.set(Math.round(((i) / count) * 100));

        const result = await this.aiService.generateImage(
          fullPrompt,
          `${aspect.width}x${aspect.height}`
        );

        newImages.push({
          url: result.dataUrl,
          prompt: this.prompt().trim(),
          style: style.label,
          aspect: aspect.label,
          createdAt: new Date(),
        });

        // Persistir en historial ai_projects
        await this.aiService.saveProject({
          kind: 'image',
          title: `${style.label} — ${this.prompt().trim().slice(0, 60)}`,
          prompt: this.prompt().trim(),
          provider: 'vertex',
          url: result.dataUrl,
          thumbnail: result.dataUrl,
          data: {
            style: style.label,
            aspect: `${aspect.width}x${aspect.height}`,
            full_prompt: fullPrompt,
          },
        });
      }

      this.generationProgress.set(100);
      this.generatedImages.update(imgs => [...newImages, ...imgs]);
      if (newImages.length > 0) {
        this.selectedImage.set(newImages[0]);
      }
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'Error al generar la imagen. Intenta de nuevo.');
    } finally {
      this.isGenerating.set(false);
    }
  }

  useSuggestion(suggestion: string): void {
    this.prompt.set(suggestion);
  }

  selectImage(img: GeneratedImage): void {
    this.selectedImage.set(img);
  }

  closePreview(): void {
    this.selectedImage.set(null);
  }

  downloadImage(img: GeneratedImage): void {
    const link = document.createElement('a');
    link.href = img.url;
    link.download = `publistudio-${Date.now()}.png`;
    link.click();
  }

  clearError(): void {
    this.error.set(null);
  }

  getUserName(): string {
    const p = this.profile();
    return p?.full_name?.split(' ')[0] || p?.username || 'Usuario';
  }

  getAspectPreviewClass(id: string): string {
    const map: Record<string, string> = {
      '1:1': 'w-6 h-6',
      '16:9': 'w-8 h-5',
      '9:16': 'w-5 h-8',
      '4:3': 'w-7 h-5',
      '3:2': 'w-7 h-5',
      '21:9': 'w-9 h-4',
    };
    return map[id] ?? 'w-6 h-6';
  }
}
