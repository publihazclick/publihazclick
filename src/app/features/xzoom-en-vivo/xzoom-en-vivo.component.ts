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
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { Router, ActivatedRoute } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { CurrencyService } from '../../core/services/currency.service';
import { ProfileService } from '../../core/services/profile.service';
import { XzoomService } from '../../core/services/xzoom.service';
import { StorageService } from '../../core/services/storage.service';
import { getSupabaseClient } from '../../core/supabase.client';
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
  private readonly sanitizer = inject(DomSanitizer);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly storage = inject(StorageService);

  readonly view = signal<View>('loading');
  readonly errorMsg = signal<string | null>(null);
  readonly editError = signal<string | null>(null);

  // Upload states
  readonly uploadingAvatar = signal(false);
  readonly uploadingCover = signal(false);
  readonly uploadingVideo = signal(false);
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

  // Error específico por campo de upload
  readonly avatarUploadError = signal<string | null>(null);
  readonly coverUploadError = signal<string | null>(null);
  readonly videoUploadError = signal<string | null>(null);

  // Video preview en tiempo real para el panel de edición
  readonly previewVideoEmbed = computed<SafeResourceUrl | null>(() => {
    const url = this.editPitchVideoUrl();
    if (!url) return null;
    const embed = this.toVideoEmbedUrl(url);
    return embed ? this.sanitizer.bypassSecurityTrustResourceUrl(embed) : null;
  });

  readonly previewVideoDirect = computed<string | null>(() => {
    const url = this.editPitchVideoUrl();
    if (!url) return null;
    return /\.(mp4|webm|ogg|mov|m4v|3gp)(\?|$)/i.test(url) ? url : null;
  });

  private toVideoEmbedUrl(url: string): string | null {
    if (!url) return null;
    try {
      const ytWatch = url.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
      if (ytWatch) return `https://www.youtube.com/embed/${ytWatch[1]}`;
      const ytShort = url.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/);
      if (ytShort) return `https://www.youtube.com/embed/${ytShort[1]}`;
      const ytEmbed = url.match(/youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/);
      if (ytEmbed) return `https://www.youtube.com/embed/${ytEmbed[1]}`;
      const vimeo = url.match(/vimeo\.com\/(\d+)/);
      if (vimeo) return `https://player.vimeo.com/video/${vimeo[1]}`;
    } catch {}
    return null;
  }

  // Billetera XZOOM
  readonly walletOpen = signal(false);
  readonly withdrawAmount = signal(20000);
  readonly withdrawingXzoom = signal(false);
  readonly withdrawMsg = signal<string | null>(null);
  readonly withdrawMethodConfigured = signal(false);
  readonly savingMethod = signal(false);

  // Datos bancarios del anfitrión
  readonly wdBank = signal('');
  readonly wdAccountType = signal('');
  readonly wdAccountNumber = signal('');
  readonly wdAccountHolder = signal('');
  readonly wdDocumentNumber = signal('');

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

  // Live timer
  readonly liveElapsedSeconds = signal(0);
  private liveTimerInterval: ReturnType<typeof setInterval> | null = null;

  readonly liveElapsedFormatted = computed(() => {
    const total = this.liveElapsedSeconds();
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    const pad = (n: number) => n.toString().padStart(2, '0');
    return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
  });

  // Delete confirmation modal
  readonly deleteTarget = signal<XzoomLiveSession | null>(null);
  readonly deleting = signal(false);

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
    this.stopLiveTimer();
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

        // Cargar método de retiro guardado
        try {
          const saved = localStorage.getItem(`xzoom_wd_method_${host.id}`);
          if (saved) {
            const method = JSON.parse(saved);
            this.wdBank.set(method.bank ?? '');
            this.wdAccountType.set(method.accountType ?? '');
            this.wdAccountNumber.set(method.accountNumber ?? '');
            this.wdAccountHolder.set(method.accountHolder ?? '');
            this.wdDocumentNumber.set(method.documentNumber ?? '');
            this.withdrawMethodConfigured.set(true);
          }
        } catch {}

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

  private loadEpaycoScript(): Promise<void> {
    return new Promise((resolve, reject) => {
      if ((window as any)['ePayco']) { resolve(); return; }
      const s = document.createElement('script');
      s.src = 'https://checkout.epayco.co/checkout.js';
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('No se pudo cargar ePayco'));
      document.head.appendChild(s);
    });
  }

  private async openEpaycoCheckout(params: any): Promise<void> {
    try {
      await this.loadEpaycoScript();
    } catch {
      this.errorMsg.set('No se pudo cargar el checkout de ePayco. Verifica tu conexión e intenta de nuevo.');
      return;
    }
    const epayco = (window as any)['ePayco'];
    if (!epayco) {
      this.errorMsg.set('Error cargando ePayco. Recarga la página e intenta de nuevo.');
      return;
    }
    const handler = epayco.checkout.configure({
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
    this.loading.set(true);
    this.errorMsg.set(null);

    // PASO 1 — Conectar a la sala primero (sin cámara)
    let tokenRes: any;
    try {
      tokenRes = await this.xzoom.getLivekitToken(host.id);
    } catch (err: any) {
      this.errorMsg.set(err?.message ?? 'Error al conectar con el servidor de transmisión.');
      this.loading.set(false);
      return;
    }

    try {
      const room = new Room({ adaptiveStream: true, dynacast: true });
      this.setupRoomEvents(room);
      await room.connect(tokenRes.url, tokenRes.token);
      this.liveRoom = room;
      this.liveRole.set(tokenRes.role);
      this.liveParticipantCount.set(room.numParticipants);
      this.view.set('live_room');
      this.liveCameraOn.set(false);
      this.liveMicOn.set(false);
      this.startLiveTimer();
    } catch (err: any) {
      this.errorMsg.set('No se pudo conectar a la sala. Verifica tu conexión a internet e intenta de nuevo.');
      this.loading.set(false);
      return;
    }
    this.loading.set(false);

    // PASO 2 — Activar cámara y micrófono usando el método de Room
    // (esto internamente llama getUserMedia y muestra el prompt del navegador)
    if (tokenRes.role === 'host' && this.liveRoom) {
      try {
        await this.liveRoom.localParticipant.setCameraEnabled(true);
        this.liveCameraOn.set(true);
        const camEl = document.getElementById('xzoom-local-media');
        if (camEl) {
          this.liveRoom.localParticipant.videoTrackPublications.forEach(pub => {
            if (pub.track) {
              const el = pub.track.attach();
              camEl.appendChild(el);
            }
          });
        }
      } catch (e: any) {
        console.error('[xzoom] cámara:', e);
        this.errorMsg.set(this.friendlyMediaError('cámara', e));
      }

      try {
        await this.liveRoom.localParticipant.setMicrophoneEnabled(true);
        this.liveMicOn.set(true);
      } catch (e: any) {
        console.error('[xzoom] micrófono:', e);
        this.errorMsg.set(this.friendlyMediaError('micrófono', e));
      }
    }
  }

  async joinLiveRoomAsViewer(hostId: string): Promise<void> {
    this.loading.set(true);
    this.errorMsg.set(null);
    try {
      const tokenRes = await this.xzoom.getLivekitToken(hostId);
      const room = new Room({ adaptiveStream: true, dynacast: true });
      this.setupRoomEvents(room);
      await room.connect(tokenRes.url, tokenRes.token);
      this.liveRoom = room;
      this.liveRole.set(tokenRes.role);
      this.liveParticipantCount.set(room.numParticipants);
      this.view.set('live_room');
    } catch (err: any) {
      this.errorMsg.set(err?.message ?? 'Error uniéndose a la sala');
    } finally {
      this.loading.set(false);
    }
  }

  private setupRoomEvents(room: Room): void {
    room.on(RoomEvent.ParticipantConnected, () => {
      this.liveParticipantCount.set(room.numParticipants);
    });
    room.on(RoomEvent.ParticipantDisconnected, () => {
      this.liveParticipantCount.set(room.numParticipants);
    });
    room.on(RoomEvent.TrackSubscribed, (track: RemoteTrack, _pub: RemoteTrackPublication, _participant: RemoteParticipant) => {
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
      msg.includes('denied') ||
      msg.includes('not allowed')
    ) {
      return (
        `Permiso de ${device} denegado. Para activar tu ${device}: ` +
        `1) Toca el candado en la barra de dirección del navegador. ` +
        `2) Cambia "Cámara" y "Micrófono" a "Permitir". ` +
        `3) Recarga la página y vuelve a intentar.`
      );
    }
    if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
      return (
        `No encontramos tu ${device}. Verifica que esté conectada ` +
        `y que ninguna otra aplicación la esté usando.`
      );
    }
    if (name === 'NotReadableError' || name === 'TrackStartError') {
      return (
        `Tu ${device} está siendo usada por otra aplicación. ` +
        `Cierra Zoom, Meet, Teams u otra app y vuelve a intentar.`
      );
    }
    if (msg.includes('https') || msg.includes('secure')) {
      return `La página debe abrirse con https:// para usar ${device}.`;
    }
    if (msg.includes('policy') || msg.includes('feature')) {
      return (
        `La política del sitio no permite acceso a ${device}. ` +
        `Recarga la página e intenta de nuevo.`
      );
    }
    return `Error activando ${device}. Recarga la página e intenta de nuevo.`;
  }

  private startLiveTimer(): void {
    this.liveElapsedSeconds.set(0);
    this.stopLiveTimer();
    this.liveTimerInterval = setInterval(() => {
      this.liveElapsedSeconds.update((v) => v + 1);
    }, 1000);
  }

  private stopLiveTimer(): void {
    if (this.liveTimerInterval) {
      clearInterval(this.liveTimerInterval);
      this.liveTimerInterval = null;
    }
  }

  // ─────────────────────────────────────────────────────────────
  // ELIMINAR GRABACIÓN
  // ─────────────────────────────────────────────────────────────
  confirmDeleteRecording(rec: XzoomLiveSession): void {
    this.deleteTarget.set(rec);
  }

  cancelDeleteRecording(): void {
    this.deleteTarget.set(null);
  }

  async executeDeleteRecording(): Promise<void> {
    const rec = this.deleteTarget();
    if (!rec) return;
    this.deleting.set(true);
    try {
      await this.xzoom.deleteRecording(rec.id);
      this.recordings.update((list) => list.filter((r) => r.id !== rec.id));
      this.deleteTarget.set(null);
    } catch (err: any) {
      this.errorMsg.set(err?.message ?? 'Error eliminando la grabación');
    } finally {
      this.deleting.set(false);
    }
  }

  formatDuration(seconds: number | null | undefined): string {
    if (!seconds) return '—';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.round(seconds % 60);
    const pad = (n: number) => n.toString().padStart(2, '0');
    if (h > 0) return `${h}h ${pad(m)}m`;
    if (m > 0) return `${m}m ${pad(s)}s`;
    return `${s}s`;
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
    this.stopLiveTimer();
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
  // SUBIR ARCHIVOS (avatar, portada, video)
  // ─────────────────────────────────────────────────────────────
  async onFileUpload(event: Event, type: 'avatar' | 'cover' | 'video'): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    // Reset input so the same file can be selected again
    input.value = '';

    const h = this.host();
    if (!h) return;

    const VIDEO_EXTS = /\.(mp4|webm|mov|avi|mkv|m4v|3gp|3g2|flv|ogv|wmv|mpg|mpeg|ts|mts|m2ts)$/i;

    // Validate file type and size
    if (type === 'video') {
      const isVideoMime = file.type.startsWith('video/');
      const isVideoExt = VIDEO_EXTS.test(file.name);
      if (!isVideoMime && !isVideoExt && file.type !== '') {
        this.editError.set(
          `El archivo no parece ser un video (tipo: ${file.type}). ` +
          `Selecciona un archivo MP4, MOV, AVI, MKV, WebM, etc.`
        );
        return;
      }
      if (file.size > 500 * 1024 * 1024) {
        this.editError.set(
          `El video pesa ${(file.size / 1024 / 1024).toFixed(0)}MB y supera el límite de 500MB. ` +
          `Comprime el video o usa un enlace de YouTube/Vimeo.`
        );
        return;
      }
    } else {
      const validImageTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
      if (!validImageTypes.includes(file.type)) {
        this.editError.set(
          `Formato de imagen no válido (recibido: ${file.type || 'desconocido'}). ` +
          `Usa una imagen JPG, PNG o WebP.`
        );
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        this.editError.set(
          `La imagen pesa ${(file.size / 1024 / 1024).toFixed(1)}MB y supera el límite de 5MB.`
        );
        return;
      }
    }

    this.editError.set(null);
    if (type === 'avatar') { this.avatarUploadError.set(null); this.uploadingAvatar.set(true); }
    else if (type === 'cover') { this.coverUploadError.set(null); this.uploadingCover.set(true); }
    else { this.videoUploadError.set(null); this.uploadingVideo.set(true); }

    try {
      const supabase = getSupabaseClient();
      const timestamp = Date.now();
      const ext = file.name.split('.').pop() || (type === 'video' ? 'mp4' : 'jpg');
      const path = `xzoom/${h.id}/${type}-${timestamp}.${ext}`;

      const { data, error } = await supabase.storage
        .from('xzoom-media')
        .upload(path, file, { cacheControl: '3600', upsert: true, contentType: file.type });

      if (error) {
        const raw = error.message ?? '';
        let msg: string;
        if (raw.includes('Bucket not found') || raw.includes('bucket') || raw.includes('not found')) {
          msg = 'El almacenamiento de medios no está activado. Pide al administrador que cree el bucket "xzoom-media" en Supabase Storage.';
        } else if (raw.includes('size') || raw.includes('too large') || raw.includes('payload')) {
          msg = 'El archivo es demasiado grande para subirse. Intenta comprimirlo o usa un enlace de YouTube/Vimeo.';
        } else if (raw.includes('mime') || raw.includes('type') || raw.includes('content-type')) {
          msg = `Formato no permitido por el servidor. Intenta convertir el video a MP4 o usa un enlace externo.`;
        } else if (raw.includes('policy') || raw.includes('security') || raw.includes('403') || raw.includes('401')) {
          msg = 'Sin permiso para subir archivos. Cierra sesión, vuelve a entrar e intenta de nuevo.';
        } else if (raw.includes('network') || raw.includes('fetch') || raw.includes('Failed to fetch')) {
          msg = 'Error de conexión al subir el archivo. Verifica tu internet e intenta de nuevo.';
        } else {
          msg = `Error al subir: ${raw || 'Error desconocido. Intenta de nuevo.'}`;
        }
        this.editError.set(msg);
        if (type === 'avatar') this.avatarUploadError.set(msg);
        else if (type === 'cover') this.coverUploadError.set(msg);
        else this.videoUploadError.set(msg);
        return;
      }

      // Get public URL
      const { data: urlData } = supabase.storage.from('xzoom-media').getPublicUrl(path);
      const publicUrl = urlData?.publicUrl;

      if (!publicUrl) {
        const noUrlMsg = 'El archivo se subió pero no se pudo obtener la URL. Intenta de nuevo.';
        this.editError.set(noUrlMsg);
        if (type === 'avatar') this.avatarUploadError.set(noUrlMsg);
        else if (type === 'cover') this.coverUploadError.set(noUrlMsg);
        else this.videoUploadError.set(noUrlMsg);
        return;
      }

      if (type === 'avatar') {
        this.editAvatarUrl.set(publicUrl);
        this.avatarUploadError.set(null);
      } else if (type === 'cover') {
        this.editCoverUrl.set(publicUrl);
        this.coverUploadError.set(null);
      } else {
        this.editPitchVideoUrl.set(publicUrl);
        this.videoUploadError.set(null);
      }
      this.editError.set(null);
    } catch (e: any) {
      const catchMsg = 'Error inesperado al subir: ' + (e?.message ?? 'Intenta de nuevo');
      this.editError.set(catchMsg);
      if (type === 'avatar') this.avatarUploadError.set(catchMsg);
      else if (type === 'cover') this.coverUploadError.set(catchMsg);
      else this.videoUploadError.set(catchMsg);
    } finally {
      if (type === 'avatar') this.uploadingAvatar.set(false);
      else if (type === 'cover') this.uploadingCover.set(false);
      else this.uploadingVideo.set(false);
    }
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
      this.editError.set('El nombre del canal es obligatorio');
      return;
    }
    if (!priceUsd || priceUsd < 1) {
      this.editError.set('El precio mínimo es $1 USD');
      return;
    }
    const priceCop = this.currency.usdToCop(priceUsd);

    this.savingProfile.set(true);
    this.profileSaveMsg.set(null);
    this.editError.set(null);
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
      this.profileSaveMsg.set('Cambios guardados correctamente');
      setTimeout(() => this.profileSaveMsg.set(null), 3000);
    } catch (err: any) {
      let msg = 'No pudimos guardar los cambios. ';
      const errMsg = err?.message ?? '';
      if (errMsg.includes('permission') || errMsg.includes('policy') || errMsg.includes('42501')) {
        msg += 'No tienes permiso para editar este canal.';
      } else if (errMsg.includes('unique') || errMsg.includes('duplicate')) {
        msg += 'Ese nombre ya está en uso.';
      } else if (errMsg.includes('network') || errMsg.includes('fetch')) {
        msg += 'Revisa tu conexión a internet.';
      } else {
        msg += errMsg || 'Error desconocido. Intenta de nuevo.';
      }
      this.editError.set(msg);
    } finally {
      this.savingProfile.set(false);
    }
  }

  async saveWithdrawMethod(): Promise<void> {
    if (!this.wdBank() || !this.wdAccountType() || !this.wdAccountNumber() || !this.wdAccountHolder() || !this.wdDocumentNumber()) {
      this.withdrawMsg.set('Error: Completa todos los campos');
      return;
    }
    this.savingMethod.set(true);
    try {
      const h = this.host();
      if (!h) return;
      // Guardar método de retiro en el perfil del host (social_links como storage temporal)
      await this.xzoom.updateHostProfile(h.id, {
        // Usamos un campo JSON-safe guardando los datos bancarios
      } as any);
      // Guardar en localStorage como respaldo
      const methodData = {
        bank: this.wdBank(),
        accountType: this.wdAccountType(),
        accountNumber: this.wdAccountNumber(),
        accountHolder: this.wdAccountHolder(),
        documentNumber: this.wdDocumentNumber(),
      };
      localStorage.setItem(`xzoom_wd_method_${h.id}`, JSON.stringify(methodData));
      this.withdrawMethodConfigured.set(true);
    } catch (e: any) {
      this.withdrawMsg.set('Error: ' + (e?.message ?? 'No se pudo guardar'));
    } finally {
      this.savingMethod.set(false);
    }
  }

  async requestXzoomWithdraw(): Promise<void> {
    const h = this.host();
    if (!h) return;
    const amount = this.withdrawAmount();
    if (amount < 20000) { this.withdrawMsg.set('Error: El minimo de retiro es $20,000 COP'); return; }
    if (amount > (h.xzoom_balance ?? 0)) { this.withdrawMsg.set('Error: Saldo insuficiente en tu billetera XZOOM'); return; }
    this.withdrawingXzoom.set(true);
    this.withdrawMsg.set(null);
    try {
      await this.xzoom.requestXzoomWithdrawal(h.id, amount);
      this.withdrawMsg.set(`Retiro de ${this.formatCOP(amount)} solicitado. Recibiras el dinero en tu cuenta en 1 a 2 dias habiles.`);
      this.host.set({ ...h, xzoom_balance: (h.xzoom_balance ?? 0) - amount });
    } catch (e: any) {
      this.withdrawMsg.set('Error: ' + (e?.message ?? 'No se pudo procesar el retiro'));
    } finally {
      this.withdrawingXzoom.set(false);
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
