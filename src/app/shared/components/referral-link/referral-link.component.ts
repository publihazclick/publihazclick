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
      
      // Intentar obtener el perfil directamente de la tabla profiles
      const { data: { user } } = await this.profileService['supabase'].auth.getUser();
      console.log('Current user from auth:', user);
      
      if (!user) {
        // Si no hay usuario en auth, intentar usar el admin por defecto
        this.loadDefaultReferral();
        return;
      }
      
      // Buscar el perfil en la tabla profiles
      const { data: profile, error } = await this.profileService['supabase']
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();
      
      console.log('Profile from DB:', profile, 'Error:', error);
      
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
        // Si no hay perfil, intentar con el admin por defecto
        this.loadDefaultReferral();
      }
    } catch (err: any) {
      console.error('Error loading profile:', err);
      // En caso de error, cargar el admin por defecto
      this.loadDefaultReferral();
    }
  }

  private async loadDefaultReferral(): Promise<void> {
    // Cargar el código del admin desde la base de datos
    try {
      // Usar una consulta más simple
      const { data, error } = await this.profileService['supabase']
        .from('profiles')
        .select('id, username, referral_code')
        .order('created_at', { ascending: true })
        .limit(1);
      
      console.log('Admin profiles query result:', data, error);
      
      if (data && data.length > 0) {
        const adminProfile = data[0];
        if (adminProfile.referral_code) {
          this.referralCode.set(adminProfile.referral_code);
          const origin = window.location.origin;
          this.referralLink.set(origin + '/register?ref=' + adminProfile.referral_code);
          console.log('Loaded admin referral code:', adminProfile.referral_code);
        } else {
          this.error.set('El admin no tiene un código de referido configurado.');
        }
      } else {
        this.error.set('No hay perfiles disponibles.');
      }
    } catch (err) {
      console.error('Error loading default referral:', err);
      this.error.set('Error al cargar el código de referido.');
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
