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
import { CurrencyService } from '../../core/services/currency.service';
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
  private readonly currency = inject(CurrencyService);
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

  // Onboarding form — precio en USD (se convierte a COP al guardar)
  readonly formDisplayName = signal('');
  readonly formPriceUsd = signal(5);
  readonly formBio = signal('');
  readonly formCategory = signal('');

  // Edit channel form — precio en USD
  readonly editDisplayName = signal('');
  readonly editBio = signal('');
  readonly editCategory = signal('');
  readonly editPriceUsd = signal(5);
  readonly editAvatarUrl = signal('');
  readonly editCoverUrl = signal('');
  readonly editPitchVideoUrl = signal('');
  readonly savingProfile = signal(false);
  readonly profileSaveMsg = signal<string | null>(null);

  // Copy-to-clipboard feedback: 'invite' o el sessionId cuyo botón mostró "Copiado"
  readonly copyFeedback = signal<string | null>(null);

  // Link de invitación absoluto basado en el slug del host
  readonly inviteLink = computed(() => {
    const h = this.host();
    if (!h) return '';
    const origin = typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : 'https://www.publihazclick.com';
    return `${origin}/xzoom/h/${h.slug}`;
  });

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
    return Math.floor(count * price * 0.88); // 88% al anfitrión (12% plataforma)
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

        // Precargar el form de edición con los datos actuales del host.
        // El precio se muestra en USD convertido desde COP.
        this.editDisplayName.set(host.display_name ?? '');
        this.editBio.set(host.bio ?? '');
        this.editCategory.set(host.category ?? '');
        const rate = this.currency.copRate || 3850;
        this.editPriceUsd.set(
          Math.round(((host.subscriber_price_cop ?? 20000) / rate) * 100) / 100,
        );
        this.editAvatarUrl.set(host.avatar_url ?? '');
        this.editCoverUrl.set(host.cover_url ?? '');
        this.editPitchVideoUrl.set(host.pitch_video_url ?? '');

        // Sin paywall: el host entra directo al dashboard tras crear su perfil
        this.view.set('host_dashboard');
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
    const priceUsd = this.formPriceUsd();
    if (!displayName || priceUsd < 1) {
      this.errorMsg.set('Completa el nombre y un precio mínimo de $1 USD');
      return;
    }
    const priceCop = this.currency.usdToCop(priceUsd);
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
      // Recargar todo el estado y caer en host_dashboard (sin paywall)
      await this.loadAll();
    } catch (err: any) {
      this.errorMsg.set(err?.message ?? 'Error creando perfil');
    } finally {
      this.loading.set(false);
    }
  }

  // ─────────────────────────────────────────────────────────────
  // SUSCRIBIRSE A OTRO ANFITRIÓN (como viewer autenticado)
  // ─────────────────────────────────────────────────────────────
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

    const isHost = this.host()?.id === hostId && this.host()?.user_id === this.userId();

    // ── PASO 1: Pedir permisos de cámara/micrófono ANTES de conectar ──
    // Esto asegura que el navegador muestre el prompt de permisos
    // inmediatamente al hacer clic en "Iniciar transmisión".
    if (isHost) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        });
        // Liberar el stream temporal; los tracks reales los crea LiveKit
        stream.getTracks().forEach(t => t.stop());
      } catch (e: any) {
        console.error('[xzoom] permiso de cámara/mic denegado:', e);
        this.errorMsg.set(this.friendlyMediaError('cámara y micrófono', e));
        this.loading.set(false);
        return;
      }
    }

    // ── PASO 2: Obtener token de LiveKit ──
    let tokenRes: any;
    try {
      tokenRes = await this.xzoom.getLivekitToken(hostId);
    } catch (err: any) {
      console.error('[xzoom] error obteniendo token:', err);
      this.errorMsg.set(err?.message ?? 'Error conectando al servidor de transmisión');
      this.loading.set(false);
      return;
    }

    // ── PASO 3: Conectar a la sala de LiveKit ──
    try {
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

      // ── PASO 4: Publicar cámara y micro (solo host) ──
      if (tokenRes.role === 'host') {
        try {
          const videoTrack = await createLocalVideoTrack({ resolution: { width: 1280, height: 720 } });
          await room.localParticipant.publishTrack(videoTrack);
          const localEl = videoTrack.attach();
          const lc = document.getElementById('xzoom-local-media');
          if (lc) lc.appendChild(localEl);
        } catch (e: any) {
          console.error('[xzoom] error publicando cámara:', e);
          this.errorMsg.set(this.friendlyMediaError('cámara', e));
          this.liveCameraOn.set(false);
        }

        try {
          const audioTrack = await createLocalAudioTrack();
          await room.localParticipant.publishTrack(audioTrack);
        } catch (e: any) {
          console.error('[xzoom] error publicando micrófono:', e);
          this.errorMsg.set(this.friendlyMediaError('micrófono', e));
          this.liveMicOn.set(false);
        }
      }
    } catch (err: any) {
      console.error('[xzoom] error uniéndose a sala:', err);
      this.errorMsg.set(this.friendlyMediaError('dispositivos', err));
    } finally {
      this.loading.set(false);
    }
  }

  /**
   * Traduce los errores comunes de getUserMedia / LiveKit a mensajes
   * accionables para el usuario.
   */
  private friendlyMediaError(device: string, err: any): string {
    const name = (err?.name ?? '').toString();
    const msg = (err?.message ?? '').toString().toLowerCase();

    if (
      name === 'NotAllowedError' ||
      name === 'PermissionDeniedError' ||
      msg.includes('permission') ||
      msg.includes('permiso') ||
      msg.includes('denied')
    ) {
      return (
        `🔒 Permiso de ${device} denegado. Para transmitir necesitas ` +
        `autorizar el acceso a tu cámara y micrófono: toca el ícono del ` +
        `candado 🔒 junto a la URL del navegador, activa "Cámara" y ` +
        `"Micrófono", recarga la página y vuelve a intentar.`
      );
    }
    if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
      return (
        `📷 No encontramos tu ${device}. Verifica que esté conectada y ` +
        `que ninguna otra aplicación la esté usando.`
      );
    }
    if (name === 'NotReadableError' || name === 'TrackStartError') {
      return (
        `⚠️ Tu ${device} está siendo usada por otra aplicación. Cierra ` +
        `Zoom, Meet, Teams u otra app que pueda tenerla ocupada y vuelve ` +
        `a intentar.`
      );
    }
    if (msg.includes('https') || msg.includes('secure')) {
      return `Necesitas HTTPS para usar cámara y micrófono. Abre la página con https://`;
    }
    return err?.message ?? `Error activando ${device}`;
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

  // ─────────────────────────────────────────────────────────────
  // COPIAR LINKS AL PORTAPAPELES
  // ─────────────────────────────────────────────────────────────
  async copyInviteLink(): Promise<void> {
    const link = this.inviteLink();
    if (!link) return;
    await this.copyToClipboard(link);
    this.flashCopyFeedback('invite');
  }

  async copySessionLink(sessionId: string): Promise<void> {
    const h = this.host();
    if (!h) return;
    const origin = typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : 'https://www.publihazclick.com';
    const link = `${origin}/xzoom/h/${h.slug}?session=${sessionId}`;
    await this.copyToClipboard(link);
    this.flashCopyFeedback(sessionId);
  }

  private async copyToClipboard(text: string): Promise<void> {
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return;
      }
    } catch {
      /* fallback below */
    }
    // Fallback para navegadores sin Clipboard API (iOS viejo, http, etc.)
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    } catch (e) {
      console.error('[xzoom] No se pudo copiar al portapapeles', e);
    }
  }

  private flashCopyFeedback(key: string): void {
    this.copyFeedback.set(key);
    setTimeout(() => {
      if (this.copyFeedback() === key) this.copyFeedback.set(null);
    }, 1800);
  }

  // ─────────────────────────────────────────────────────────────
  // GUARDAR CAMBIOS DEL CANAL
  // ─────────────────────────────────────────────────────────────
  async saveHostProfile(): Promise<void> {
    const h = this.host();
    if (!h) return;
    const displayName = this.editDisplayName().trim();
    const priceUsd = this.editPriceUsd();
    if (!displayName) {
      this.errorMsg.set('El nombre del canal es obligatorio');
      return;
    }
    if (!priceUsd || priceUsd < 1) {
      this.errorMsg.set('El precio mínimo es $1 USD');
      return;
    }
    const priceCop = this.currency.usdToCop(priceUsd);

    this.savingProfile.set(true);
    this.profileSaveMsg.set(null);
    this.errorMsg.set(null);
    try {
      const updated = await this.xzoom.updateHostProfile(h.id, {
        display_name: displayName,
        bio: this.editBio().trim() || null,
        category: this.editCategory().trim() || null,
        subscriber_price_cop: priceCop,
        avatar_url: this.editAvatarUrl().trim() || null,
        cover_url: this.editCoverUrl().trim() || null,
        pitch_video_url: this.editPitchVideoUrl().trim() || null,
      });
      this.host.set(updated);
      this.profileSaveMsg.set('Cambios guardados correctamente ✓');
      setTimeout(() => this.profileSaveMsg.set(null), 3000);
    } catch (err: any) {
      this.errorMsg.set(err?.message ?? 'No pudimos guardar los cambios');
    } finally {
      this.savingProfile.set(false);
    }
  }

  formatCOP(v: number | null | undefined): string {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0,
    }).format(v ?? 0);
  }

  /** Convierte un monto COP a USD y lo formatea como "$X.XX USD". */
  formatUSD(cop: number | null | undefined): string {
    const rate = this.currency.copRate || 3850;
    const usd = (cop ?? 0) / rate;
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(usd) + ' USD';
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
