import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';

interface NavItem {
  label: string;
  href: string;
}

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './header.component.html',
  styleUrl: './header.component.scss'
})
export class HeaderComponent {
  protected readonly isMenuOpen = signal(false);
  
  protected readonly navItems: NavItem[] = [
    { label: 'Inicio', href: '#' },
    { label: 'Qué es Publihazclik', href: '#about' },
    { label: 'Pagos y Testimonios', href: '#testimonials' },
    { label: 'Marcas', href: '#brands' },
    { label: 'Youtube', href: '#youtube' },
  ];

  toggleMenu(): void {
    this.isMenuOpen.update(v => !v);
  }
}
