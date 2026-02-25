import { Component, OnInit, signal, inject, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { SocialService } from '../../../../core/services/social.service';
import type { SocialConnection } from '../../../../core/models/social.model';

@Component({
  selector: 'app-social-connections',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './connections.component.html',
})
export class SocialConnectionsComponent implements OnInit {
  private readonly socialService = inject(SocialService);
  private readonly router = inject(Router);

  activeTab = signal<'requests' | 'connections'>('requests');
  pendingRequests = signal<SocialConnection[]>([]);
  myConnections = signal<SocialConnection[]>([]);
  loading = signal(true);
  actionLoading = signal<string | null>(null);
  toast = signal<{ msg: string; type: 'success' | 'error' } | null>(null);

  ngOnInit(): void {
    this.loadAll();
  }

  async loadAll(): Promise<void> {
    this.loading.set(true);
    try {
      const [requests, connections] = await Promise.all([
        this.socialService.getPendingRequests(),
        this.socialService.getMyConnections(),
      ]);
      this.pendingRequests.set(requests);
      this.myConnections.set(connections);
    } catch {
      this.showToast('Error al cargar conexiones', 'error');
    } finally {
      this.loading.set(false);
    }
  }

  async accept(conn: SocialConnection): Promise<void> {
    this.actionLoading.set(conn.id);
    try {
      await this.socialService.respondToRequest(conn.id, true);
      this.pendingRequests.update(list => list.filter(c => c.id !== conn.id));
      await this.loadAll();
      this.showToast('Conexión aceptada', 'success');
    } catch {
      this.showToast('Error al aceptar solicitud', 'error');
    } finally {
      this.actionLoading.set(null);
    }
  }

  async reject(conn: SocialConnection): Promise<void> {
    this.actionLoading.set(conn.id);
    try {
      await this.socialService.respondToRequest(conn.id, false);
      this.pendingRequests.update(list => list.filter(c => c.id !== conn.id));
      this.showToast('Solicitud rechazada', 'success');
    } catch {
      this.showToast('Error al rechazar solicitud', 'error');
    } finally {
      this.actionLoading.set(null);
    }
  }

  async remove(conn: SocialConnection): Promise<void> {
    this.actionLoading.set(conn.id);
    try {
      await this.socialService.removeConnection(conn.id);
      this.myConnections.update(list => list.filter(c => c.id !== conn.id));
      this.showToast('Conexión eliminada', 'success');
    } catch {
      this.showToast('Error al eliminar conexión', 'error');
    } finally {
      this.actionLoading.set(null);
    }
  }

  async openChat(conn: SocialConnection): Promise<void> {
    if (!conn.other_user?.id) return;
    this.actionLoading.set(conn.id);
    try {
      const convId = await this.socialService.getOrCreateConversation(conn.other_user.id);
      this.router.navigate(['/social/messages', convId]);
    } catch {
      this.showToast('Error al abrir chat', 'error');
      this.actionLoading.set(null);
    }
  }

  setTab(tab: 'requests' | 'connections'): void {
    this.activeTab.set(tab);
  }

  private showToast(msg: string, type: 'success' | 'error'): void {
    this.toast.set({ msg, type });
    setTimeout(() => this.toast.set(null), 3000);
  }

  getInitials(name: string | null, username: string): string {
    return (name || username || '?').slice(0, 2).toUpperCase();
  }

  formatDate(date: string): string {
    return new Date(date).toLocaleDateString('es-CO', { day: 'numeric', month: 'short' });
  }
}
