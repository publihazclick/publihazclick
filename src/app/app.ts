import { Component, signal, inject } from '@angular/core';
import { RouterOutlet, Router, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';
import { HeaderComponent } from './components/header/header.component';
import { HeroComponent } from './components/hero/hero.component';
import { TestimonialsComponent } from './components/testimonials/testimonials.component';
import { BusinessModelsComponent } from './components/business-models/business-models.component';
import { HowItWorksComponent } from './components/how-it-works/how-it-works.component';
import { PricingComponent } from './components/pricing/pricing.component';
import { FeaturesComponent } from './components/features/features.component';
import { RecentPostsComponent } from './components/recent-posts/recent-posts.component';
import { FooterComponent } from './components/footer/footer.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    RouterOutlet,
    HeaderComponent,
    HeroComponent,
    TestimonialsComponent,
    BusinessModelsComponent,
    HowItWorksComponent,
    PricingComponent,
    FeaturesComponent,
    RecentPostsComponent,
    FooterComponent
  ],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App {
  protected readonly title = signal('publihazclick');
  
  // Signal para saber si estamos en una ruta de autenticación
  readonly isAuthRoute = signal(false);
  
  private readonly router = inject(Router);
  
  constructor() {
    // Detectar cambios de ruta
    this.router.events.pipe(
      filter(event => event instanceof NavigationEnd)
    ).subscribe((event: any) => {
      const url = event.urlAfterRedirects || event.url;
      // Verificar si es una ruta de autenticación
      this.isAuthRoute.set(
        url.includes('/login') || 
        url.includes('/register') || 
        url.includes('/auth/')
      );
    });
  }
}
