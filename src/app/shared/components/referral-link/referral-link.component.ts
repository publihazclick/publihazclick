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
      console.log('Loading default referral - querying profiles table...');
      
      // Primero verificar si hay datos en la tabla profiles
      const { data: allProfiles, error: countError } = await this.profileService['supabase']
        .from('profiles')
        .select('id, username, referral_code, role')
        .limit(10);
      
      console.log('All profiles query result:', allProfiles, countError);
      
      // Buscar perfil de admin específico
      const { data: adminProfiles, error: adminError } = await this.profileService['supabase']
        .from('profiles')
        .select('id, username, referral_code, role')
        .ilike('role', 'admin')
        .limit(5);
      
      console.log('Admin profiles query result:', adminProfiles, adminError);
      
      // Intentar cualquier perfil con referral_code
      const { data: referralProfiles, error: referralError } = await this.profileService['supabase']
        .from('profiles')
        .select('id, username, referral_code, role')
        .not('referral_code', 'is', null)
        .limit(5);
      
      console.log('Profiles with referral code:', referralProfiles, referralError);
      
      // Usar el primer perfil disponible con código de referido
      const profiles = referralProfiles || adminProfiles || allProfiles;
      
      if (profiles && profiles.length > 0) {
        // Buscar el primero con referral_code
        const profileWithCode = profiles.find(p => p.referral_code);
        
        if (profileWithCode) {
          this.referralCode.set(profileWithCode.referral_code);
          const origin = window.location.origin;
          this.referralLink.set(origin + '/register?ref=' + profileWithCode.referral_code);
          console.log('Loaded referral code:', profileWithCode.referral_code, 'from profile:', profileWithCode.username);
        } else {
          // Si ningún perfil tiene código, generar uno por defecto
          const defaultCode = 'adm00001';
          this.referralCode.set(defaultCode);
          const origin = window.location.origin;
          this.referralLink.set(origin + '/register?ref=' + defaultCode);
          console.log('Using default referral code:', defaultCode);
        }
      } else {
        // No hay perfiles - usar código por defecto
        const defaultCode = 'adm00001';
        this.referralCode.set(defaultCode);
        const origin = window.location.origin;
        this.referralLink.set(origin + '/register?ref=' + defaultCode);
        console.log('No profiles found, using default referral code:', defaultCode);
      }
    } catch (err) {
      console.error('Error loading default referral:', err);
      // En caso de error, usar código por defecto
      const defaultCode = 'adm00001';
      this.referralCode.set(defaultCode);
      const origin = window.location.origin;
      this.referralLink.set(origin + '/register?ref=' + defaultCode);
      console.log('Error occurred, using default referral code:', defaultCode);
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
