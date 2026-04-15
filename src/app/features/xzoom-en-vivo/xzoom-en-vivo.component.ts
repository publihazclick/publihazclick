import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { ProfileService } from '../../core/services/profile.service';
import { XzoomService } from '../../core/services/xzoom.service';
import type {
  XzoomHost,
  XzoomHostSubscription,
  XzoomViewerSubscription,
  XzoomScheduledSession,
  XzoomLiveSession,
} from '../../core/models/xzoom.model';
import {
  Room,
  RoomEvent,
  Track,
  RemoteParticipant,
  RemoteTrack,
  RemoteTrackPublication,
  LocalTrackPublication,
  createLocalVideoTrack,
  createLocalAudioTrack,
  createLocalScreenTracks,
} from 'livekit-client';

type View =
  | 'loading'
  | 'onboarding'
  | 'host_dashboard'
  | 'host_subscription_required'
  | 'viewer_dashboard'
  | 'live_room';

declare const ePayco: any;

@Component({
  selector: 'app-xzoom-en-vivo',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './xzoom-en-vivo.component.html',
  styleUrl: './xzoom-en-vivo.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class XzoomEnVivoComponent implements OnInit, OnDestroy {
  private readonly auth = inject(AuthService);
  private readonly profileService = inject(ProfileService);
  private readonly xzoom = inject(XzoomService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly view = signal<View>('loading');
  readonly errorMsg = signal<string | null>(null);
  readonly loading = signal(false);

  readonly userId = signal<string | null>(null);
  readonly username = signal<string>('');
  readonly userEmail = signal<string>('');

  readonly host = signal<XzoomHost | null>(null);
  readonly hostSubscription = signal<XzoomHostSubscription | null>(null);
  readonly scheduledSessions = signal<XzoomScheduledSession[]>([]);
  readonly recordings = signal<XzoomLiveSession[]>([]);
  readonly subscribers = signal<XzoomViewerSubscription[]>([]);
  readonly mySubscriptions = signal<XzoomViewerSubscription[]>([]);

  // Onboarding form
  readonly formDisplayName = signal('');
  readonly formPriceCop = signal(20000);
  readonly formBio = signal('');
  readonly formCategory = signal('');

  // Scheduling form
  readonly scheduleTitle = signal('');
  readonly scheduleDescription = signal('');
  readonly scheduleDate = signal('');
  readonly scheduleTime = signal('');
  readonly scheduleDuration = signal(60);

  // Live room state
  private liveRoom: Room | null = null;
  readonly liveRole = signal<'host' | 'viewer' | null>(null);
  readonly liveParticipantCount = signal(0);
  readonly liveScreenSharing = signal(false);
  readonly liveCameraOn = signal(true);
  readonly liveMicOn = signal(true);

  readonly hasActiveHostSub = computed(() => {
    const s = this.hostSubscription();
    return !!s && s.status === 'active' && !!s.expires_at && new Date(s.expires_at) > new Date();
  });

  readonly subscribersCount = computed(() =>
    this.subscribers().filter((s) => s.status === 'active').length,
  );

  readonly monthlyRevenueEstimate = computed(() => {
    const count = this.subscribersCount();
    const price = this.host()?.subscriber_price_cop ?? 0;
    return Math.floor(count * price * 0.85); // 85% al anfitrión
  });

  async ngOnInit(): Promise<void> {
    try {
      const user = this.auth.getCurrentUser();
      if (!user) {
        this.router.navigate(['/login']);
        return;
      }
      this.userId.set(user.id);
      this.userEmail.set(user.email ?? '');

      let profile = this.profileService.profile();
      if (!profile) {
        profile = await this.profileService.getProfileById(user.id);
      }
      this.username.set(profile?.username ?? 'Usuario');
      this.formDisplayName.set(profile?.username ?? '');

      await this.loadAll();

      // Si viene de ePayco con ?epayco=result, recargar
      this.route.queryParams.subscribe((params) => {
        if (params['epayco'] === 'result') {
          setTimeout(() => this.loadAll(), 1500);
        }
      });
    } catch (err: any) {
      this.errorMsg.set(err?.message ?? 'Error cargando XZOOM EN VIVO');
      this.view.set('viewer_dashboard');
    }
  }

  ngOnDestroy(): void {
    this.disconnectFromRoom();
  }

  private async loadAll(): Promise<void> {
    const uid = this.userId();
    if (!uid) return;
    this.loading.set(true);
    try {
      const host = await this.xzoom.getCurrentHostProfile(uid);
      this.host.set(host);

      if (host) {
        const [sub, sessions, recs, subs] = await Promise.all([
          this.xzoom.getHostSubscription(host.id),
          this.xzoom.listScheduledSessions(host.id),
          this.xzoom.listRecordings(host.id),
          this.xzoom.listMyHostSubscribers(host.id),
        ]);
        this.hostSubscription.set(sub);
        this.scheduledSessions.set(sessions);
        this.recordings.set(recs);
        this.subscribers.set(subs);

        if (this.hasActiveHostSub()) {
          this.view.set('host_dashboard');
        } else {
          this.view.set('host_subscription_required');
        }
      } else {
        // No es anfitrión — cargar sus suscripciones como viewer
        const mine = await this.xzoom.listMyViewerSubscriptions(uid);
        this.mySubscriptions.set(mine);
        this.view.set('onboarding');
      }
    } finally {
      this.loading.set(false);
    }
  }

  // ─────────────────────────────────────────────────────────────
  // ONBOARDING — crear perfil de anfitrión
  // ─────────────────────────────────────────────────────────────
  async submitOnboarding(): Promise<void> {
    const uid = this.userId();
    if (!uid) return;
    const displayName = this.formDisplayName().trim();
    const priceCop = this.formPriceCop();
    if (!displayName || priceCop < 1000) {
      this.errorMsg.set('Completa nombre y precio mínimo de 1.000 COP');
      return;
    }
    this.loading.set(true);
    this.errorMsg.set(null);
    try {
      const host = await this.xzoom.createHostProfile({
        userId: uid,
        displayName,
        username: this.username(),
        subscriberPriceCop: priceCop,
        bio: this.formBio() || undefined,
        category: this.formCategory() || undefined,
      });
      this.host.set(host);
      this.view.set('host_subscription_required');
    } catch (err: any) {
      this.errorMsg.set(err?.message ?? 'Error creando perfil');
    } finally {
      this.loading.set(false);
    }
  }

  // ─────────────────────────────────────────────────────────────
  // PAGAR SUSCRIPCIÓN DE ANFITRIÓN (ePayco checkout)
  // ─────────────────────────────────────────────────────────────
  async payHostSubscription(): Promise<void> {
    this.loading.set(true);
    this.errorMsg.set(null);
    try {
      // Precio en COP: aproximado $48 USD × $4100 = $196.800
      const copAmount = 200000;
      const params = await this.xzoom.createHostSubscriptionCheckout(copAmount);
      this.openEpaycoCheckout(params);
    } catch (err: any) {
      this.errorMsg.set(err?.message ?? 'Error iniciando pago');
    } finally {
      this.loading.set(false);
    }
  }

  async paySubscribeToHost(hostId: string): Promise<void> {
    this.loading.set(true);
    this.errorMsg.set(null);
    try {
      const params = await this.xzoom.createViewerSubscriptionCheckout(hostId);
      this.openEpaycoCheckout(params);
    } catch (err: any) {
      this.errorMsg.set(err?.message ?? 'Error iniciando pago');
    } finally {
      this.loading.set(false);
    }
  }

  private openEpaycoCheckout(params: any): void {
    if (typeof ePayco === 'undefined') {
      this.errorMsg.set('Checkout ePayco no cargado. Recarga la página.');
      return;
    }
    const handler = ePayco.checkout.configure({
      key: params.publicKey,
      test: params.test,
    });
    handler.open({
      name: params.name,
      description: params.description,
      invoice: params.invoice,
      currency: params.currency,
      amount: params.amount,
      tax_base: params.tax_base,
      tax: params.tax,
      country: params.country,
      lang: params.lang,
      external: 'false',
      email_billing: params.email_billing,
      name_billing: params.name_billing,
      extra1: params.extra1,
      extra2: params.extra2,
      extra3: params.extra3,
      confirmation: params.confirmation,
      response: params.response,
    });
  }

  // ─────────────────────────────────────────────────────────────
  // PROGRAMAR SESIÓN
  // ─────────────────────────────────────────────────────────────
  async createScheduledSession(): Promise<void> {
    const host = this.host();
    if (!host) return;
    const title = this.scheduleTitle().trim();
    const date = this.scheduleDate();
    const time = this.scheduleTime();
    if (!title || !date || !time) {
      this.errorMsg.set('Completa título, fecha y hora');
      return;
    }
    const scheduledAt = new Date(`${date}T${time}:00`);
    if (scheduledAt < new Date()) {
      this.errorMsg.set('La fecha no puede ser en el pasado');
      return;
    }
    this.loading.set(true);
    try {
      await this.xzoom.createScheduledSession({
        hostId: host.id,
        title,
        description: this.scheduleDescription() || undefined,
        scheduledAt,
        durationMinutes: this.scheduleDuration(),
      });
      this.scheduleTitle.set('');
      this.scheduleDescription.set('');
      this.scheduleDate.set('');
      this.scheduleTime.set('');
      const list = await this.xzoom.listScheduledSessions(host.id);
      this.scheduledSessions.set(list);
    } catch (err: any) {
      this.errorMsg.set(err?.message ?? 'Error creando sesión');
    } finally {
      this.loading.set(false);
    }
  }

  async cancelSession(id: string): Promise<void> {
    if (!confirm('¿Cancelar esta sesión?')) return;
    await this.xzoom.cancelScheduledSession(id);
    const host = this.host();
    if (host) {
      const list = await this.xzoom.listScheduledSessions(host.id);
      this.scheduledSessions.set(list);
    }
  }

  // ─────────────────────────────────────────────────────────────
  // GO LIVE / JOIN LIVE ROOM
  // ─────────────────────────────────────────────────────────────
  async goLive(): Promise<void> {
    const host = this.host();
    if (!host) return;
    await this.joinLiveRoom(host.id);
  }

  async joinLiveRoomAsViewer(hostId: string): Promise<void> {
    await this.joinLiveRoom(hostId);
  }

  private async joinLiveRoom(hostId: string): Promise<void> {
    this.loading.set(true);
    this.errorMsg.set(null);
    try {
      const tokenRes = await this.xzoom.getLivekitToken(hostId);
      const room = new Room({
        adaptiveStream: true,
        dynacast: true,
      });

      room.on(RoomEvent.ParticipantConnected, () => {
        this.liveParticipantCount.set(room.numParticipants);
      });
      room.on(RoomEvent.ParticipantDisconnected, () => {
        this.liveParticipantCount.set(room.numParticipants);
      });
      room.on(RoomEvent.TrackSubscribed, (track: RemoteTrack, _pub, participant: RemoteParticipant) => {
        if (track.kind === Track.Kind.Video || track.kind === Track.Kind.Audio) {
          const el = track.attach();
          const container = document.getElementById('xzoom-remote-media');
          if (container) container.appendChild(el);
        }
      });
      room.on(RoomEvent.Disconnected, () => {
        this.liveRole.set(null);
        this.view.set(this.host() ? 'host_dashboard' : 'viewer_dashboard');
      });

      await room.connect(tokenRes.url, tokenRes.token);
      this.liveRoom = room;
      this.liveRole.set(tokenRes.role);
      this.liveParticipantCount.set(room.numParticipants);
      this.view.set('live_room');

      if (tokenRes.role === 'host') {
        // Publicar cámara + micro como anfitrión
        const videoTrack = await createLocalVideoTrack();
        const audioTrack = await createLocalAudioTrack();
        await room.localParticipant.publishTrack(videoTrack);
        await room.localParticipant.publishTrack(audioTrack);
        const localEl = videoTrack.attach();
        const lc = document.getElementById('xzoom-local-media');
        if (lc) lc.appendChild(localEl);
      }
    } catch (err: any) {
      this.errorMsg.set(err?.message ?? 'Error uniéndose a la sala');
    } finally {
      this.loading.set(false);
    }
  }

  async toggleCamera(): Promise<void> {
    if (!this.liveRoom) return;
    const enabled = !this.liveCameraOn();
    await this.liveRoom.localParticipant.setCameraEnabled(enabled);
    this.liveCameraOn.set(enabled);
  }

  async toggleMic(): Promise<void> {
    if (!this.liveRoom) return;
    const enabled = !this.liveMicOn();
    await this.liveRoom.localParticipant.setMicrophoneEnabled(enabled);
    this.liveMicOn.set(enabled);
  }

  async toggleScreenShare(): Promise<void> {
    if (!this.liveRoom) return;
    const enabled = !this.liveScreenSharing();
    if (enabled) {
      try {
        const tracks = await createLocalScreenTracks({ audio: true });
        for (const t of tracks) {
          await this.liveRoom.localParticipant.publishTrack(t);
        }
        this.liveScreenSharing.set(true);
      } catch (e: any) {
        this.errorMsg.set('No se pudo compartir pantalla: ' + e?.message);
      }
    } else {
      await this.liveRoom.localParticipant.setScreenShareEnabled(false);
      this.liveScreenSharing.set(false);
    }
  }

  async leaveRoom(): Promise<void> {
    await this.disconnectFromRoom();
  }

  private async disconnectFromRoom(): Promise<void> {
    if (this.liveRoom) {
      await this.liveRoom.disconnect();
      this.liveRoom = null;
    }
    const lc = document.getElementById('xzoom-local-media');
    const rc = document.getElementById('xzoom-remote-media');
    if (lc) lc.innerHTML = '';
    if (rc) rc.innerHTML = '';
    this.liveRole.set(null);
    this.liveCameraOn.set(true);
    this.liveMicOn.set(true);
    this.liveScreenSharing.set(false);
  }

  formatCOP(v: number | null | undefined): string {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0,
    }).format(v ?? 0);
  }

  formatDate(iso: string | null): string {
    if (!iso) return '—';
    return new Date(iso).toLocaleString('es-CO', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
}
