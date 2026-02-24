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
      const result = await this.bannerService.getActiveBannersByLocation(undefined, this.location);
      this.banners.set(result);
      if (result.length > 1) this.startAutoPlay();
    } catch {
      this.banners.set([]);
    } finally {
      this.loading.set(false);
    }
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
