import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { ProfileService } from '../../../../core/services/profile.service';
import { getSupabaseClient } from '../../../../core/supabase.client';

interface LeaderProfile {
  id: string;
  username: string;
  full_name: string | null;
  level: number;
  has_active_package: boolean;
  avatar_url: string | null;
  referral_code: string;
  total_referrals_count: number;
  created_at: string;
}

@Component({
  selector: 'app-user-leader',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './leader.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LeaderComponent implements OnInit {
  private profileService = inject(ProfileService);
  private supabase = getSupabaseClient();

  profile = this.profileService.profile;

  leader = signal<LeaderProfile | null>(null);
  loading = signal(true);
  notFound = signal(false);

  async ngOnInit(): Promise<void> {
    // Si el perfil aún no está cargado, cargarlo primero
    let currentProfile = this.profile();
    if (!currentProfile) {
      currentProfile = await this.profileService.getCurrentProfile();
    }
    const referredBy = currentProfile?.referred_by;

    if (!referredBy) {
      this.notFound.set(true);
      this.loading.set(false);
      return;
    }

    const { data, error } = await this.supabase
      .from('profiles')
      .select(
        'id, username, full_name, level, has_active_package, avatar_url, referral_code, total_referrals_count, created_at'
      )
      .eq('id', referredBy)
      .single();

    if (error || !data) {
      this.notFound.set(true);
    } else {
      this.leader.set(data as LeaderProfile);
    }

    this.loading.set(false);
  }

  getTierInfo(referrals: number): { name: string; color: string } {
    if (referrals >= 40) return { name: 'DIAMANTE CORONA', color: 'bg-amber-500/10 text-amber-400 border border-amber-500/30' };
    if (referrals >= 36) return { name: 'DIAMANTE NEGRO', color: 'bg-gray-500/10 text-gray-300 border border-gray-500/30' };
    if (referrals >= 31) return { name: 'DIAMANTE AZUL', color: 'bg-blue-500/10 text-blue-400 border border-blue-500/30' };
    if (referrals >= 26) return { name: 'DIAMANTE', color: 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/30' };
    if (referrals >= 20) return { name: 'ESMERALDA', color: 'bg-green-500/10 text-green-400 border border-green-500/30' };
    if (referrals >= 10) return { name: 'RUBY', color: 'bg-red-500/10 text-red-400 border border-red-500/30' };
    if (referrals >= 6)  return { name: 'ZAFIRO', color: 'bg-blue-900/30 text-blue-300 border border-blue-400/30' };
    if (referrals >= 3)  return { name: 'PERLA', color: 'bg-pink-500/10 text-pink-400 border border-pink-500/30' };
    return { name: 'JADE', color: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30' };
  }

  formatDate(dateStr: string): string {
    const date = new Date(dateStr);
    return date.toLocaleDateString('es-CO', { year: 'numeric', month: 'long' });
  }
}
