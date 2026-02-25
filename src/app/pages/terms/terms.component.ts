import { Component, ChangeDetectionStrategy, signal } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-terms',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
  templateUrl: './terms.component.html',
})
export class TermsComponent {
  readonly currentYear = new Date().getFullYear();
  readonly lastUpdated = 'Enero 2025';

  readonly activeSection = signal('uso');

  readonly sections = [
    { id: 'uso', label: 'Uso del Servicio', icon: 'policy' },
    { id: 'registro', label: 'Registro y Cuenta', icon: 'manage_accounts' },
    { id: 'ptc', label: 'Sistema PTC', icon: 'ads_click' },
    { id: 'pagos', label: 'Pagos y Retiros', icon: 'payments' },
    { id: 'referidos', label: 'Programa de Referidos', icon: 'group_add' },
    { id: 'privacidad', label: 'Privacidad', icon: 'security' },
    { id: 'prohibiciones', label: 'Prohibiciones', icon: 'block' },
    { id: 'contacto', label: 'Contacto', icon: 'contact_support' },
  ];

  scrollTo(id: string): void {
    this.activeSection.set(id);
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}
