import { Component, OnInit, signal, inject, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { SocialService } from '../../../../core/services/social.service';
import { ProfileService } from '../../../../core/services/profile.service';
import type { AdvertiserCard } from '../../../../core/models/social.model';

@Component({
  selector: 'app-social-directory',
  standalone: true,
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './directory.component.html',
})
export class SocialDirectoryComponent implements OnInit {
  private readonly socialService = inject(SocialService);
  private readonly profileService = inject(ProfileService);
  private readonly router = inject(Router);

  readonly profile = this.profileService.profile;

  advertisers = signal<AdvertiserCard[]>([]);
  loading = signal(true);
  actionLoading = signal<string | null>(null);
  toast = signal<{ msg: string; type: 'success' | 'error' } | null>(null);
  searchTerm = '';
  searchTimeout: ReturnType<typeof setTimeout> | null = null;

  ngOnInit(): void {
    this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    try {
      const list = await this.socialService.getDirectory(this.searchTerm);
      this.advertisers.set(list);
    } catch {
      this.showToast('Error al cargar el directorio', 'error');
    } finally {
      this.loading.set(false);
    }
  }

  onSearchChange(): void {
    if (this.searchTimeout) clearTimeout(this.searchTimeout);
    this.searchTimeout = setTimeout(() => this.load(), 400);
  }

  async sendRequest(advertiser: AdvertiserCard): Promise<void> {
    this.actionLoading.set(advertiser.id);
    try {
      await this.socialService.sendConnectionRequest(advertiser.id);
      this.advertisers.update(list =>
        list.map(a => a.id === advertiser.id ? { ...a, connection_status: 'pending', is_requester: true } : a)
      );
      this.showToast(`Solicitud enviada a ${advertiser.username}`, 'success');
    } catch {
      this.showToast('Error al enviar solicitud', 'error');
    } finally {
      this.actionLoading.set(null);
    }
  }

  async acceptRequest(advertiser: AdvertiserCard): Promise<void> {
    if (!advertiser.connection_id) return;
    this.actionLoading.set(advertiser.id);
    try {
      await this.socialService.respondToRequest(advertiser.connection_id, true);
      this.advertisers.update(list =>
        list.map(a => a.id === advertiser.id ? { ...a, connection_status: 'accepted' } : a)
      );
      this.showToast(`Conectado con ${advertiser.username}`, 'success');
    } catch {
      this.showToast('Error al aceptar solicitud', 'error');
    } finally {
      this.actionLoading.set(null);
    }
  }

  async openChat(advertiser: AdvertiserCard): Promise<void> {
    this.actionLoading.set(advertiser.id);
    try {
      const convId = await this.socialService.getOrCreateConversation(advertiser.id);
      this.router.navigate(['/social/messages', convId]);
    } catch {
      this.showToast('Error al abrir chat', 'error');
      this.actionLoading.set(null);
    }
  }

  private showToast(msg: string, type: 'success' | 'error'): void {
    this.toast.set({ msg, type });
    setTimeout(() => this.toast.set(null), 3000);
  }

  getInitials(name: string | null, username: string): string {
    return (name || username).slice(0, 2).toUpperCase();
  }
}
