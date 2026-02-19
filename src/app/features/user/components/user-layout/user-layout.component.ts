import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { AuthService } from '../../../../core/services/auth.service';

@Component({
  selector: 'app-user-layout',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './user-layout.component.html',
  styleUrl: './user-layout.component.scss'
})
export class UserLayoutComponent {
  isDarkMode = true;
  userLevel = 5;
  protected readonly sidebarOpen = signal(false);

  // Stats para el sidebar
  dailyProgress = 65; // Porcentaje de clicks del día
  dailyGoal = 10;
  dailyClicks = 7;

  constructor(private readonly authService: AuthService, private readonly router: Router) {}

  toggleSidebar(): void {
    this.sidebarOpen.update(v => !v);
  }

  toggleDarkMode(): void {
    this.isDarkMode = !this.isDarkMode;
    document.documentElement.classList.toggle('dark');
  }

  logout(): void {
    this.authService.logout().subscribe();
  }
}
