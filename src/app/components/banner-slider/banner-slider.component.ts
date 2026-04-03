import { Component, Input, signal, computed, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AdminBannerService } from '../../core/services/admin-banner.service';
import type { BannerAd, AdLocation } from '../../core/models/admin.model';

@Component({
  selector: 'app-banner-slider',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './banner-slider.component.html',
  styleUrl: './banner-slider.component.scss',
})
export class BannerSliderComponent implements OnInit, OnDestroy {
  @Input() location: AdLocation = 'landing';
  @Input() autoPlayInterval = 5000;

  private readonly bannerService = inject(AdminBannerService);

  readonly banners = signal<BannerAd[]>([]);
  readonly loading = signal(true);
  readonly currentIndex = signal(0);

  private timer: ReturnType<typeof setInterval> | null = null;

  readonly sliderTransform = computed(() => `translateX(-${this.currentIndex() * 100}%)`);

  ngOnInit(): void {
    this.loadBanners();
  }

  ngOnDestroy(): void {
    this.clearTimer();
  }

  private async loadBanners(): Promise<void> {
    try {
      const result = await this.bannerService.getActiveBannersByLocation(undefined, undefined);
      const unique = this.deduplicateAndShuffle(result);
      this.banners.set(unique);
      if (unique.length > 1) this.startAutoPlay();
    } catch {
      this.banners.set([]);
    } finally {
      this.loading.set(false);
    }
  }

  /** Remove duplicate images, then shuffle so same advertiser doesn't appear back-to-back */
  private deduplicateAndShuffle(banners: BannerAd[]): BannerAd[] {
    // 1. Keep only one banner per unique image_url
    const seen = new Set<string>();
    const unique: BannerAd[] = [];
    for (const b of banners) {
      if (!seen.has(b.image_url)) {
        seen.add(b.image_url);
        unique.push(b);
      }
    }

    // 2. Fisher-Yates shuffle
    for (let i = unique.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [unique[i], unique[j]] = [unique[j], unique[i]];
    }

    // 3. Spread same-name banners apart (avoid consecutive same advertiser)
    for (let i = 1; i < unique.length; i++) {
      if (unique[i].name === unique[i - 1].name) {
        // Find next different banner to swap with
        for (let j = i + 1; j < unique.length; j++) {
          if (unique[j].name !== unique[i - 1].name) {
            [unique[i], unique[j]] = [unique[j], unique[i]];
            break;
          }
        }
      }
    }

    return unique;
  }

  next(): void {
    const len = this.banners().length;
    if (!len) return;
    this.currentIndex.update((v) => (v + 1) % len);
  }

  prev(): void {
    const len = this.banners().length;
    if (!len) return;
    this.currentIndex.update((v) => (v - 1 + len) % len);
  }

  hasRealImage(banner: BannerAd): boolean {
    return !!banner.image_url && !banner.image_url.startsWith('gradient:');
  }

  goTo(index: number): void {
    this.currentIndex.set(index);
    this.resetAutoPlay();
  }

  private startAutoPlay(): void {
    this.timer = setInterval(() => this.next(), this.autoPlayInterval);
  }

  private clearTimer(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private resetAutoPlay(): void {
    this.clearTimer();
    if (this.banners().length > 1) this.startAutoPlay();
  }
}
