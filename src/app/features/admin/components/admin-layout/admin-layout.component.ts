import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { AuthService } from '../../../../core/services/auth.service';

@Component({
  selector: 'app-admin-layout',
  standalone: true,
  imports: [CommonModule, RouterModule, LucideAngularModule],
  templateUrl: './admin-layout.component.html',
  styleUrl: './admin-layout.component.scss'
})
export class AdminLayoutComponent {
  // Iconos de Lucide
  readonly Dashboard = LucideAngularModule;
  readonly Users = LucideAngularModule;
  readonly Shield = LucideAngularModule;
  readonly Analytics = LucideAngularModule;
  readonly Settings = LucideAngularModule;
  readonly Terminal = LucideAngularModule;
  readonly LogOut = LucideAngularModule;
  readonly Bell = LucideAngularModule;
  readonly ShieldPerson = LucideAngularModule;
  readonly Menu = LucideAngularModule;
  readonly X = LucideAngularModule;
  readonly Sun = LucideAngularModule;
  readonly Moon = LucideAngularModule;
  readonly ChevronLeft = LucideAngularModule;
  readonly ChevronRight = LucideAngularModule;

  isDarkMode = true;
  serverLoad = 42;
  
  // Sidebar state - collapsed by default on mobile
  sidebarCollapsed = signal(false);
  mobileMenuOpen = signal(false);

  constructor(private readonly authService: AuthService, private readonly router: Router) {
    // Check if mobile to set initial state
    if (typeof window !== 'undefined') {
      this.checkMobile();
      window.addEventListener('resize', () => this.checkMobile());
    }
  }

  private checkMobile(): void {
    const isMobile = window.innerWidth < 768;
    if (isMobile) {
      this.sidebarCollapsed.set(true);
    }
  }

  toggleSidebar(): void {
    this.sidebarCollapsed.update(v => !v);
  }

  toggleMobileMenu(): void {
    this.mobileMenuOpen.update(v => !v);
  }

  toggleDarkMode(): void {
    this.isDarkMode = !this.isDarkMode;
    document.documentElement.classList.toggle('dark');
  }

  logout(): void {
    this.authService.logout().subscribe();
  }
}
