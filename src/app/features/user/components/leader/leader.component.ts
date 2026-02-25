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

  getLevelLabel(level: number): string {
    if (level <= 2) return 'Bronce';
    if (level <= 4) return 'Plata';
    if (level <= 6) return 'Oro';
    if (level <= 8) return 'Platino';
    return 'Diamante';
  }

  getLevelColor(level: number): string {
    if (level <= 2) return 'bg-slate-700 text-slate-200';
    if (level <= 4) return 'bg-blue-900 text-blue-200';
    if (level <= 6) return 'bg-cyan-900 text-cyan-200';
    if (level <= 8) return 'bg-amber-900 text-amber-200';
    return 'bg-purple-900 text-purple-200';
  }

  formatDate(dateStr: string): string {
    const date = new Date(dateStr);
    return date.toLocaleDateString('es-CO', { year: 'numeric', month: 'long' });
  }
}
