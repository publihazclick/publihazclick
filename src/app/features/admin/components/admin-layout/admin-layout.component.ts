import { Component } from '@angular/core';
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

  isDarkMode = true;
  serverLoad = 42;

  constructor(private readonly authService: AuthService, private readonly router: Router) {}

  toggleDarkMode(): void {
    this.isDarkMode = !this.isDarkMode;
    document.documentElement.classList.toggle('dark');
  }

  logout(): void {
    this.authService.logout().subscribe();
  }
}
