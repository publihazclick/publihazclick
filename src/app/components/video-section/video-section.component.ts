import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { CurrencyService } from '../../core/services/currency.service';
import { PlatformSettingsService } from '../../core/services/platform-settings.service';

@Component({
  selector: 'app-video-section',
  standalone: true,
  imports: [CommonModule],
  template: `
    <section class="pt-6 pb-10 md:pt-8 md:pb-14 bg-gray-50 px-4 md:px-6">
      <div class="max-w-7xl mx-auto px-4">
        <!-- Section Header -->
        <div class="text-center mb-10 md:mb-16">
          <h2 class="text-3xl md:text-5xl lg:text-7xl font-black mb-6 md:mb-8 tracking-tighter uppercase text-black">
            Algo <span class="text-cyan-500 italic">nunca</span> antes <span class="text-cyan-500 italic">visto</span>
          </h2>
          <p class="text-base md:text-lg text-gray-500 max-w-2xl mx-auto">
            Tan sólo te registras con <span class="text-black font-bold">{{ getBasicPlanPrice() }}</span> y potencialmente <span class="text-cyan-500 font-bold">ganarás más de {{ getEarnings() }}</span>
          </p>
        </div>

        <!-- Video -->
        <div class="max-w-5xl mx-auto mb-16 md:mb-20 relative group">
          <div class="absolute -inset-1 bg-gradient-to-r from-cyan-500/20 to-transparent rounded-2xl md:rounded-[2rem] blur opacity-25 group-hover:opacity-50 transition duration-1000"></div>
          <div class="relative bg-zinc-900 aspect-video rounded-2xl md:rounded-[2rem] border border-white/10 overflow-hidden flex items-center justify-center" style="background: linear-gradient(180deg, rgba(0,229,255,0.05) 0%, rgba(0,0,0,1) 100%);">
            @if (embedUrl()) {
              <iframe
                [src]="embedUrl()!"
                class="w-full h-full"
                frameborder="0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowfullscreen
              ></iframe>
            } @else {
              <div class="w-16 md:w-24 h-16 md:h-24 bg-white rounded-full flex items-center justify-center cursor-pointer hover:scale-110 transition-transform duration-300 shadow-2xl">
                <span class="material-symbols-outlined text-black text-4xl md:text-5xl translate-x-1">play_arrow</span>
              </div>
            }
          </div>
        </div>
      </div>
    </section>
  `,
  styles: []
})
export class VideoSectionComponent implements OnInit {
  protected currencyService = inject(CurrencyService);
  private readonly platformSettings = inject(PlatformSettingsService);
  private readonly sanitizer = inject(DomSanitizer);

  readonly embedUrl = signal<SafeResourceUrl | null>(null);

  async ngOnInit(): Promise<void> {
    try {
      const url = await this.platformSettings.getSetting('landing_video_url');
      const embed = this.toEmbedUrl(url?.trim() ?? '');
      if (embed) {
        this.embedUrl.set(this.sanitizer.bypassSecurityTrustResourceUrl(embed));
      }
    } catch {
      // Si falla, muestra el placeholder estático sin romper nada
    }
  }

  private toEmbedUrl(url: string): string | null {
    if (!url) return null;
    try {
      const watchMatch = url.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
      if (watchMatch) return `https://www.youtube.com/embed/${watchMatch[1]}`;
      const shortMatch = url.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/);
      if (shortMatch) return `https://www.youtube.com/embed/${shortMatch[1]}`;
      const embedMatch = url.match(/youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/);
      if (embedMatch) return `https://www.youtube.com/embed/${embedMatch[1]}`;
    } catch {
      // URL inválida
    }
    return null;
  }

  getBasicPlanPrice(): string {
    return this.currencyService.format(25);
  }

  getEarnings(): string {
    return this.currencyService.format(260);
  }
}
