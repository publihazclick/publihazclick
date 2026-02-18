import { Component, Input, signal, computed, effect } from '@angular/core';
import { CommonModule } from '@angular/common';

export interface BannerSlide {
  icon: string;
  title: string;
  subtitle: string;
  description: string;
  gradient: string;
}

@Component({
  selector: 'app-banner-slider',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './banner-slider.component.html',
  styleUrl: './banner-slider.component.scss'
})
export class BannerSliderComponent {
  @Input() slides: BannerSlide[] = [];
  @Input() autoPlayInterval = 4000;

  protected readonly currentSlide = signal(0);
  protected readonly autoPlayTimer = signal<any>(null);

  protected readonly sliderTransform = computed(() => {
    return `translateX(-${this.currentSlide() * 100}%)`;
  });

  constructor() {
    effect(() => {
      if (this.slides.length > 0) {
        this.startAutoPlay();
      }
    });
  }

  protected nextSlide(): void {
    if (this.slides.length === 0) return;
    this.currentSlide.update(v => (v + 1) % this.slides.length);
  }

  protected prevSlide(): void {
    if (this.slides.length === 0) return;
    this.currentSlide.update(v => (v - 1 + this.slides.length) % this.slides.length);
  }

  protected goToSlide(index: number): void {
    this.currentSlide.set(index);
    this.resetAutoPlay();
  }

  private startAutoPlay(): void {
    const timer = this.autoPlayTimer();
    if (timer || this.slides.length === 0) return;
    
    const interval = setInterval(() => {
      this.nextSlide();
    }, this.autoPlayInterval);
    
    this.autoPlayTimer.set(interval);
  }

  private resetAutoPlay(): void {
    const timer = this.autoPlayTimer();
    if (timer) {
      clearInterval(timer);
    }
    this.startAutoPlay();
  }
}
