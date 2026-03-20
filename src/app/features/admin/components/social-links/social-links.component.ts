import { Component, inject, signal, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SocialLinksService, SocialLinks } from '../../../../core/services/social-links.service';

@Component({
  selector: 'app-admin-social-links',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  templateUrl: './social-links.component.html',
})
export class AdminSocialLinksComponent implements OnInit {
  private readonly socialService = inject(SocialLinksService);

  readonly saving = signal(false);
  readonly saved  = signal(false);
  readonly error  = signal<string | null>(null);

  // Copia editable del formulario
  form: SocialLinks = {
    facebook:  '',
    instagram: '',
    tiktok:    '',
    whatsapp:  '',
    youtube:   '',
    telegram:  '',
  };

  ngOnInit(): void {
    // Cargar los valores actuales (el servicio ya los cargó en el constructor)
    const current = this.socialService.links();
    this.form = { ...current };
    // Si el servicio aún no terminó de cargar, suscribirse al signal
    if (!current.facebook && !current.instagram) {
      // Forzar re-carga y copiar cuando llegue
      this.socialService.load().then(() => {
        this.form = { ...this.socialService.links() };
      });
    }
  }

  onChange(): void {
    this.error.set(null);
    this.saved.set(false);
  }

  async save(): Promise<void> {
    this.error.set(null);
    this.saved.set(false);
    this.saving.set(true);
    try {
      await this.socialService.save({ ...this.form });
      this.saved.set(true);
      setTimeout(() => this.saved.set(false), 3000);
    } catch (err: any) {
      this.error.set(err.message || 'Error al guardar');
    } finally {
      this.saving.set(false);
    }
  }
}
