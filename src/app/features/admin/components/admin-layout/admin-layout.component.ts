import { Component, signal, Inject, PLATFORM_ID } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { AuthService } from '../../../../core/services/auth.service';

@Component({
  selector: 'app-admin-layout',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './admin-layout.component.html',
  styleUrl: './admin-layout.component.scss'
})
export class AdminLayoutComponent {
  isDarkMode = true;
  serverLoad = 42;
  
  // Estado del sidebar (mobile)
  protected readonly sidebarOpen = signal(false);
  // Estado colapsado del sidebar (tablet/desktop)
  protected readonly sidebarCollapsed = signal(false);
  // Estado de si es navegador (para SSR)
  protected readonly isBrowser = signal(false);

  constructor(
    private readonly authService: AuthService, 
    private readonly router: Router,
    @Inject(PLATFORM_ID) private readonly platformId: Object
  ) {
    this.isBrowser.set(isPlatformBrowser(this.platformId));
  }

  // Detectar si es dispositivo móvil
  protected isMobile(): boolean {
    if (!this.isBrowser()) {
      return false; // En SSR, asumir no móvil
    }
    return window.innerWidth < 768;
  }

  toggleSidebar(): void {
    this.sidebarOpen.update(v => !v);
  }

  toggleSidebarCollapse(): void {
    this.sidebarCollapsed.update(v => !v);
  }

  toggleDarkMode(): void {
    this.isDarkMode = !this.isDarkMode;
    document.documentElement.classList.toggle('dark');
  }

  logout(): void {
    this.authService.logout().subscribe();
  }
}
