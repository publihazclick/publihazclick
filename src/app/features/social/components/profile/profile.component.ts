import { Component, inject, signal, computed, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router, ActivatedRoute } from '@angular/router';
import { SocialService } from '../../../../core/services/social.service';
import { ProfileService } from '../../../../core/services/profile.service';
import type { AdvertiserCard, SocialBusinessProfile } from '../../../../core/models/social.model';

@Component({
  selector: 'app-social-profile',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './profile.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SocialProfileComponent implements OnInit {
  private readonly socialService = inject(SocialService);
  private readonly profileService = inject(ProfileService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly card = signal<AdvertiserCard | null>(null);
  readonly business = signal<SocialBusinessProfile | null>(null);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly actionLoading = signal(false);
  readonly toast = signal<{ message: string; type: 'success' | 'error' } | null>(null);

  readonly isOwnProfile = computed(() => {
    const current = this.profileService.profile();
    return !!current && current.id === this.card()?.id;
  });

  ngOnInit(): void {
    const userId = this.route.snapshot.paramMap.get('userId');
    if (userId) this.loadProfile(userId);
    else this.error.set('Perfil no encontrado');
  }

  async loadProfile(userId: string): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const [card, biz] = await Promise.all([
        this.socialService.getUserProfile(userId),
        this.socialService.getBusinessProfile(userId),
      ]);
      if (!card) {
        this.error.set('Perfil no encontrado');
        return;
      }
      this.card.set(card);
      this.business.set(biz);
    } catch {
      this.error.set('Error al cargar el perfil');
    } finally {
      this.loading.set(false);
    }
  }

  async sendRequest(): Promise<void> {
    const c = this.card();
    if (!c) return;
    this.actionLoading.set(true);
    try {
      await this.socialService.sendConnectionRequest(c.id);
      this.card.update(prev => prev ? { ...prev, connection_status: 'pending', is_requester: true } : null);
      this.showToast('Solicitud de conexión enviada', 'success');
    } catch {
      this.showToast('Error al enviar la solicitud', 'error');
    } finally {
      this.actionLoading.set(false);
    }
  }

  async acceptRequest(): Promise<void> {
    const c = this.card();
    if (!c?.connection_id) return;
    this.actionLoading.set(true);
    try {
      await this.socialService.respondToRequest(c.connection_id, true);
      this.card.update(prev => prev ? { ...prev, connection_status: 'accepted' } : null);
      this.showToast('¡Conexión aceptada!', 'success');
    } catch {
      this.showToast('Error al aceptar la solicitud', 'error');
    } finally {
      this.actionLoading.set(false);
    }
  }

  async openChat(): Promise<void> {
    const c = this.card();
    if (!c) return;
    this.actionLoading.set(true);
    try {
      const convId = await this.socialService.getOrCreateConversation(c.id);
      this.router.navigate(['/social/messages', convId]);
    } catch {
      this.showToast('Error al abrir el chat', 'error');
      this.actionLoading.set(false);
    }
  }

  goBack(): void {
    history.back();
  }

  private showToast(message: string, type: 'success' | 'error'): void {
    this.toast.set({ message, type });
    setTimeout(() => this.toast.set(null), 3500);
  }

  getRoleLabel(role: string): string {
    return role === 'admin' ? 'Admin' : role === 'dev' ? 'Dev' : 'Anunciante';
  }

  getRoleBadgeClass(role: string): string {
    return role === 'admin'
      ? 'bg-blue-500/10 border-blue-500/20 text-blue-400'
      : role === 'dev'
      ? 'bg-violet-500/10 border-violet-500/20 text-violet-400'
      : 'bg-accent/10 border-accent/20 text-accent';
  }

  getGradientClasses(role: string): string {
    return role === 'admin'
      ? 'from-blue-700 to-blue-400'
      : role === 'dev'
      ? 'from-violet-700 to-violet-400'
      : 'from-accent to-primary';
  }

  getInitials(fullName: string | null, username: string): string {
    if (fullName?.trim()) {
      const parts = fullName.trim().split(' ');
      return parts.length >= 2
        ? (parts[0][0] + parts[1][0]).toUpperCase()
        : fullName.slice(0, 2).toUpperCase();
    }
    return username.slice(0, 2).toUpperCase();
  }

  formatDate(d: string): string {
    return new Date(d).toLocaleDateString('es-CO', { year: 'numeric', month: 'long' });
  }

  formatWebsite(url: string | null): string {
    if (!url) return '';
    return url.replace(/^https?:\/\//, '').replace(/\/$/, '');
  }

  formatWhatsapp(num: string | null): string {
    if (!num) return '';
    return num.startsWith('+') ? num : `+${num}`;
  }
}
