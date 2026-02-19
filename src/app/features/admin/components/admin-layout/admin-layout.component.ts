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
  
  // Estado del sidebar (mobile)
  protected readonly sidebarOpen = signal(false);
  // Estado colapsado del sidebar (tablet/desktop)
  protected readonly sidebarCollapsed = signal(false);

  constructor(private readonly authService: AuthService, private readonly router: Router) {}

  // Detectar si es dispositivo móvil
  protected isMobile(): boolean {
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
