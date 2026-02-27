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
      const { data: { user } } = await this.profileService['supabase'].auth.getUser();

      if (!user) {
        this.loadDefaultReferral();
        return;
      }

      const { data: profile, error } = await this.profileService['supabase']
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      if (profile) {
        this.profile.set(profile);
        this.referralCode.set(profile.referral_code || '');
        const origin = window.location.origin;
        const refCode = profile.referral_code || '';
        if (refCode) {
          this.referralLink.set(origin + '/ref/' + refCode);
        } else {
          this.error.set('No tienes un codigo de referido. Contacta al administrador.');
        }
      } else {
        this.loadDefaultReferral();
      }
    } catch {
      this.loadDefaultReferral();
    }
  }

  private async loadDefaultReferral(): Promise<void> {
    try {
      const { data: referralProfiles } = await this.profileService['supabase']
        .from('profiles')
        .select('id, username, referral_code, role')
        .not('referral_code', 'is', null)
        .limit(5);

      const { data: adminProfiles } = await this.profileService['supabase']
        .from('profiles')
        .select('id, username, referral_code, role')
        .ilike('role', 'admin')
        .limit(5);

      const profiles = referralProfiles || adminProfiles;

      if (profiles && profiles.length > 0) {
        const profileWithCode = profiles.find((p: any) => p.referral_code);

        if (profileWithCode) {
          this.referralCode.set(profileWithCode.referral_code);
          const origin = window.location.origin;
          this.referralLink.set(origin + '/ref/' + profileWithCode.referral_code);
        } else {
          const defaultCode = 'adm00001';
          this.referralCode.set(defaultCode);
          const origin = window.location.origin;
          this.referralLink.set(origin + '/ref/' + defaultCode);
        }
      } else {
        const defaultCode = 'adm00001';
        this.referralCode.set(defaultCode);
        const origin = window.location.origin;
        this.referralLink.set(origin + '/register?ref=' + defaultCode);
      }
    } catch {
      const defaultCode = 'adm00001';
      this.referralCode.set(defaultCode);
      const origin = window.location.origin;
      this.referralLink.set(origin + '/register?ref=' + defaultCode);
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
