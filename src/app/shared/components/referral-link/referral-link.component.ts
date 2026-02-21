import { Component, signal, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ProfileService } from '../../../core/services/profile.service';
import { Profile } from '../../../core/models/profile.model';

@Component({
  selector: 'app-referral-link',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './referral-link.component.html'
})
export class ReferralLinkComponent implements OnInit {
  private readonly profileService = inject(ProfileService);

  readonly profile = signal<Profile | null>(null);
  readonly referralLink = signal<string>('');
  readonly referralCode = signal<string>('');
  readonly copied = signal<boolean>(false);
  readonly copiedCode = signal<boolean>(false);
  readonly error = signal<string>('');

  async ngOnInit(): Promise<void> {
    await this.loadProfile();
  }

  private async loadProfile(): Promise<void> {
    try {
      console.log('Loading profile...');
      const profile = await this.profileService.getCurrentProfile();
      console.log('Profile loaded:', profile);
      
      if (profile) {
        this.profile.set(profile);
        this.referralCode.set(profile.referral_code || '');
        const origin = window.location.origin;
        const refCode = profile.referral_code || '';
        if (refCode) {
          this.referralLink.set(origin + '/register?ref=' + refCode);
        } else {
          this.error.set('No tienes un código de referido. Contacta al administrador.');
        }
      } else {
        // Intentar obtener más información del error
        const { data: { user } } = await this.profileService['supabase'].auth.getUser();
        console.log('Current user:', user);
        this.error.set('No se pudo cargar tu perfil. Asegúrate de estar logueado. User ID: ' + (user?.id || 'none'));
      }
    } catch (err: any) {
      console.error('Error loading profile:', err);
      this.error.set('Error al cargar el perfil: ' + err.message);
    }
  }

  copyLink(): void {
    const link = this.referralLink();
    if (link) {
      navigator.clipboard.writeText(link).then(() => {
        this.copied.set(true);
        setTimeout(() => this.copied.set(false), 2000);
      });
    }
  }

  copyCode(): void {
    const code = this.referralCode();
    if (code) {
      navigator.clipboard.writeText(code).then(() => {
        this.copiedCode.set(true);
        setTimeout(() => this.copiedCode.set(false), 2000);
      });
    }
  }

  goToReferrals(): void {
    window.location.href = '/dashboard/referrals';
  }

  formatMoney(amount: number): string {
    return amount.toLocaleString('es-CO', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    });
  }
}
