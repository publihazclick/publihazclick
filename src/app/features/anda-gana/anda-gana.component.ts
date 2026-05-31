import { Component, ChangeDetectionStrategy, ChangeDetectorRef, signal, computed, inject, effect, untracked, OnInit, OnDestroy, PLATFORM_ID, ViewChild, ElementRef } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { isPlatformBrowser, SlicePipe, DatePipe, DecimalPipe } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { AndaGanaService, AgUser, AgTripOffer, AgTripRequest, AgPaymentMethod } from './anda-gana.service';
import { AgPhoneAuthService } from './ag-phone-auth.service';
import { RealtimeChannel } from '@supabase/supabase-js';
import { environment } from '../../../environments/environment';
import { getMoviClient } from './movi.client';
import { SplashScreen } from '@capacitor/splash-screen';

type AgScreen = 'splash' | 'loading' | 'home' | 'quick-register' | 'passenger-form' | 'driver-form' | 'passenger-home' | 'driver-home';
type GpsStatus = 'idle' | 'requesting' | 'granted' | 'denied';

@Component({
  selector: 'app-anda-gana',
  standalone: true,
  imports: [FormsModule, SlicePipe, DatePipe, DecimalPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [`
    @keyframes moviEntrance {
      0%   { opacity:0; transform: scale(0.75) translateY(50px); }
      65%  { opacity:1; transform: scale(1.06) translateY(-8px); }
      100% { opacity:1; transform: scale(1)    translateY(0px);  }
    }
    @keyframes moviFloat {
      0%,100% { transform: translateY(0px);   }
      50%     { transform: translateY(-18px);  }
    }
    @keyframes dotPulse {
      0%,80%,100% { transform:scale(0.5); opacity:0.3; }
      40%         { transform:scale(1);   opacity:1;   }
    }
    @keyframes modalFloat {
      0%,100% { transform: translateY(0px);  }
      50%     { transform: translateY(-5px); }
    }
    .modal-float { animation: modalFloat 3s ease-in-out infinite; }
    .movi-logo-wrap {
      animation: moviEntrance 0.85s cubic-bezier(0.34,1.56,0.64,1) forwards,
                 moviFloat    2.8s  ease-in-out 0.85s infinite;
    }
    .dot1 { animation: dotPulse 1.4s ease-in-out 0.0s infinite; }
    .dot2 { animation: dotPulse 1.4s ease-in-out 0.2s infinite; }
    .dot3 { animation: dotPulse 1.4s ease-in-out 0.4s infinite; }
    .qr-input::placeholder { color: #6B7280; }
    .qr-input { border-width: 1px !important; border-color: #D1D5DB !important; outline: none; }
    .qr-input:focus { border-width: 1.5px !important; border-color: #7C3AED !important; outline: none; }
  `],
  host: {
    '[style.background]': "screen() === 'splash' ? '#7C3AED' : screen() === 'driver-form' ? '#060b17' : '#FFFFFF'",
    '[style.min-height]': "'100dvh'",
    '[style.display]': "'block'",
    '[style.transition]': "'background 0.3s'",
  },
  template: `
<div class="min-h-screen w-full flex flex-col items-center py-6 px-4"
  [style.background]="screen() === 'splash' ? '#7C3AED' : screen() === 'driver-form' ? '#060b17' : '#FFFFFF'"
  [style.padding]="screen() === 'quick-register' ? '0' : ''"
  style="min-height:100dvh">

  <!-- ═══════════ TOAST DIRECCIÓN GUARDADA ═══════════ -->
  @if (addrSavedToast()) {
    <div class="fixed bottom-28 left-1/2 z-[9999] flex items-center gap-2 px-5 py-3 rounded-full shadow-xl text-white text-sm font-bold animate-bounce-in"
      style="transform:translateX(-50%);background:#16a34a;box-shadow:0 4px 20px rgba(22,163,74,0.5);pointer-events:none">
      <span class="material-symbols-outlined" style="font-size:20px">check_circle</span>
      Dirección guardada correctamente
    </div>
  }

  <!-- ═══════════ CONFIRMACIÓN FUERA DE LÍNEA ═══════════ -->
  @if (offlineConfirmOpen()) {
    <div class="fixed inset-0 z-[9998] flex items-end justify-center pb-6 px-4"
      style="background:rgba(0,0,0,0.55);backdrop-filter:blur(4px)"
      (click)="cancelGoOffline()">
      <div class="w-full max-w-sm rounded-3xl p-6 flex flex-col gap-4"
        style="background:#fff;box-shadow:0 24px 60px rgba(0,0,0,0.35)"
        (click)="$event.stopPropagation()">
        <!-- Ícono -->
        <div class="flex justify-center">
          <div class="w-16 h-16 rounded-full flex items-center justify-center"
            style="background:rgba(239,68,68,0.1)">
            <span class="material-symbols-outlined" style="font-size:36px;color:#dc2626;font-variation-settings:'FILL' 1">wifi_off</span>
          </div>
        </div>
        <!-- Título -->
        <div class="text-center">
          <p class="font-black text-slate-900" style="font-size:18px;line-height:1.2">¿Salir de línea?</p>
        </div>
        <!-- Descripción -->
        <div class="rounded-2xl p-4 flex flex-col gap-2" style="background:#F8FAFC;border:1px solid #E2E8F0">
          <div class="flex items-start gap-2">
            <span class="material-symbols-outlined flex-shrink-0" style="font-size:16px;color:#dc2626;margin-top:1px;font-variation-settings:'FILL' 1">cancel</span>
            <p class="text-slate-700 text-sm">Dejarás de recibir solicitudes de viaje.</p>
          </div>
          <div class="flex items-start gap-2">
            <span class="material-symbols-outlined flex-shrink-0" style="font-size:16px;color:#dc2626;margin-top:1px;font-variation-settings:'FILL' 1">cancel</span>
            <p class="text-slate-700 text-sm">No acumularás horas en línea ni estadísticas.</p>
          </div>
          <div class="flex items-start gap-2">
            <span class="material-symbols-outlined flex-shrink-0" style="font-size:16px;color:#dc2626;margin-top:1px;font-variation-settings:'FILL' 1">cancel</span>
            <p class="text-slate-700 text-sm">Los pasajeros no podrán verte en el mapa.</p>
          </div>
          <div class="flex items-start gap-2 mt-1">
            <span class="material-symbols-outlined flex-shrink-0" style="font-size:16px;color:#16a34a;margin-top:1px;font-variation-settings:'FILL' 1">check_circle</span>
            <p class="text-slate-700 text-sm">Puedes volver a conectarte cuando quieras.</p>
          </div>
        </div>
        <!-- Botones -->
        <div class="flex flex-col gap-2">
          <button (click)="confirmGoOffline()"
            class="w-full py-3.5 rounded-2xl font-black text-sm"
            style="background:linear-gradient(135deg,#dc2626,#b91c1c);color:#fff">
            Aceptar, salir de línea
          </button>
          <button (click)="cancelGoOffline()"
            class="w-full py-3.5 rounded-2xl font-black text-sm"
            style="background:linear-gradient(135deg,#10b981,#059669);color:#fff">
            Seguir en línea
          </button>
        </div>
      </div>
    </div>
  }

  <!-- ═══════════ ALERTA VIAJE ACEPTADO (inDrive style) ═══════════ -->
  @if (driverTripAlert()) {
    <div class="fixed inset-0 z-[9990] flex flex-col items-center justify-center px-4"
      style="background:rgba(0,0,0,0.82);backdrop-filter:blur(6px)">
      <div class="w-full max-w-sm rounded-3xl overflow-hidden"
        style="background:#fff;box-shadow:0 24px 60px rgba(0,0,0,0.45)">
        <!-- Header verde -->
        <div class="flex flex-col items-center gap-2 py-6 px-4"
          style="background:linear-gradient(135deg,#059669,#10b981)">
          <div class="w-16 h-16 rounded-full flex items-center justify-center"
            style="background:rgba(255,255,255,0.2)">
            <span class="material-symbols-outlined" style="font-size:38px;color:#fff;font-variation-settings:'FILL' 1">check_circle</span>
          </div>
          <p style="color:#fff;font-size:20px;font-weight:900;margin:0">¡Te aceptaron!</p>
          <p style="color:rgba(255,255,255,0.85);font-size:13px;margin:0">El pasajero aceptó tu oferta</p>
        </div>
        <!-- Detalles -->
        <div class="px-5 py-4 flex flex-col gap-3">
          <!-- Pasajero -->
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
              style="background:#f0fdf4;border:1px solid #bbf7d0">
              <span class="material-symbols-outlined text-emerald-600" style="font-size:20px;font-variation-settings:'FILL' 1">person</span>
            </div>
            <div>
              <p class="font-black text-slate-800" style="font-size:15px;margin:0">
                {{ driverTripAlert()!.ag_trip_requests?.ag_users?.full_name ?? 'Pasajero' }}
              </p>
              @if (driverTripAlert()!.ag_trip_requests?.ag_users?.phone) {
                <a [href]="'tel:' + driverTripAlert()!.ag_trip_requests.ag_users.phone"
                  class="text-emerald-600 font-bold" style="font-size:12px">
                  {{ driverTripAlert()!.ag_trip_requests.ag_users.phone }}
                </a>
              }
            </div>
          </div>
          <!-- Ruta -->
          <div class="rounded-2xl p-3 flex flex-col gap-2" style="background:#f8fafc;border:1px solid #e2e8f0">
            <div class="flex items-start gap-2">
              <span class="material-symbols-outlined text-blue-500 flex-shrink-0" style="font-size:16px;margin-top:1px">my_location</span>
              <p class="text-slate-700 text-xs font-semibold" style="margin:0;line-height:1.4">
                {{ driverTripAlert()!.ag_trip_requests?.origin_name ?? 'Punto de recogida' }}
              </p>
            </div>
            <div class="flex items-start gap-2">
              <span class="material-symbols-outlined text-red-500 flex-shrink-0" style="font-size:16px;margin-top:1px">location_on</span>
              <p class="text-slate-700 text-xs font-semibold" style="margin:0;line-height:1.4">
                {{ driverTripAlert()!.ag_trip_requests?.dest_name ?? 'Destino' }}
              </p>
            </div>
          </div>
          <!-- Precio -->
          <div class="flex items-center justify-between px-1">
            <span class="text-slate-500 text-sm">Tu oferta</span>
            <span class="font-black text-emerald-600" style="font-size:20px">
              {{ formatCOP(driverTripAlert()!.offered_price) }}
            </span>
          </div>
          <!-- Botones -->
          <button (click)="acceptTripAndGo(driverTripAlert()!)"
            class="w-full py-4 rounded-2xl text-white font-black flex items-center justify-center gap-2 active:scale-[0.98] transition-all"
            style="background:linear-gradient(135deg,#059669,#10b981);font-size:16px">
            <span class="material-symbols-outlined" style="font-size:22px">navigation</span>
            Ir a recoger pasajero
          </button>
          <button (click)="dismissTripAlert()"
            class="w-full py-3 rounded-2xl text-slate-500 font-bold text-sm active:opacity-70">
            Ver detalles después
          </button>
        </div>
      </div>
    </div>
  }

  <!-- ═══════════ AVISO CONDUCTOR: PASAJERO CANCELÓ ═══════════ -->
  @if (driverCancelAlert() !== null) {
    <div class="fixed inset-0 z-[9992] flex items-center justify-center px-5"
      style="background:rgba(0,0,0,0.75);backdrop-filter:blur(6px)">
      <div class="w-full max-w-sm rounded-3xl overflow-hidden"
        style="background:#1a1a2e;border:1.5px solid rgba(239,68,68,0.4);box-shadow:0 24px 60px rgba(0,0,0,0.6)">
        <!-- Header rojo -->
        <div class="flex flex-col items-center gap-3 py-7 px-5"
          style="background:linear-gradient(135deg,#dc2626,#ef4444)">
          <div class="w-16 h-16 rounded-full flex items-center justify-center"
            style="background:rgba(255,255,255,0.15)">
            <span class="material-symbols-outlined text-white" style="font-size:38px;font-variation-settings:'FILL' 1">cancel</span>
          </div>
          <p style="color:#fff;font-size:20px;font-weight:900;margin:0;text-align:center">El pasajero canceló el viaje</p>
        </div>
        <!-- Motivo -->
        <div class="px-6 py-5 flex flex-col gap-4">
          @if (driverCancelAlert()) {
            <div class="rounded-2xl px-4 py-4 flex items-start gap-3"
              style="background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.25)">
              <span class="material-symbols-outlined flex-shrink-0 mt-0.5" style="font-size:20px;color:#f87171">info</span>
              <div>
                <p style="color:rgba(255,255,255,0.5);font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;margin:0 0 4px">Motivo</p>
                <p style="color:#fff;font-weight:700;font-size:15px;margin:0;line-height:1.4">{{ driverCancelAlert() }}</p>
              </div>
            </div>
          } @else {
            <p style="color:rgba(255,255,255,0.5);font-size:13px;text-align:center;margin:0">El pasajero no indicó un motivo.</p>
          }
          <button (click)="driverCancelAlert.set(null)"
            class="w-full py-4 rounded-2xl text-white font-black flex items-center justify-center gap-2 active:scale-[0.98]"
            style="background:linear-gradient(135deg,#374151,#4b5563);font-size:15px">
            <span class="material-symbols-outlined" style="font-size:20px">check</span>
            Entendido
          </button>
        </div>
      </div>
    </div>
  }

  <!-- ═══════════ MODAL CONDUCTOR: ESPERANDO AL PASAJERO EN PICKUP ═══════════ -->
  @if (driverArrivalTrip() !== null && driverArrivalTimer() !== null) {
    <div class="fixed inset-0 z-[9900] flex items-end justify-center px-4"
      style="background:rgba(0,0,0,0.72);backdrop-filter:blur(4px);padding-bottom:max(1.5rem,env(safe-area-inset-bottom))">
      <div class="w-full max-w-lg rounded-2xl overflow-hidden"
        style="background:linear-gradient(180deg,#0a1628 0%,#0d1f3c 100%);border:1.5px solid rgba(124,58,237,0.45);box-shadow:0 24px 64px rgba(0,0,0,0.8)">

        <!-- Header púrpura -->
        <div style="background:linear-gradient(90deg,rgba(124,58,237,0.25) 0%,rgba(99,102,241,0.15) 100%);padding:12px 18px;display:flex;align-items:center;justify-content:space-between">
          <div style="display:flex;align-items:center;gap:8px">
            <span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:#a78bfa;animation:pulse 1s ease-in-out infinite;flex-shrink:0"></span>
            <span style="color:#a78bfa;font-size:11px;font-weight:900;letter-spacing:0.09em;text-transform:uppercase">Llegaste al punto de recogida</span>
          </div>
          <span style="color:rgba(255,255,255,0.35);font-size:10px;font-weight:700">Esperando al pasajero</span>
        </div>

        <!-- Cuerpo -->
        <div style="padding:16px 18px 20px;display:flex;flex-direction:column;gap:14px">

          <!-- Info pasajero -->
          <div style="display:flex;align-items:center;gap:12px">
            <div style="width:clamp(44px,13vw,50px);height:clamp(44px,13vw,50px);border-radius:14px;background:linear-gradient(135deg,#7c3aed,#6366f1);display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:20px;font-weight:900;color:#fff;border:2px solid rgba(124,58,237,0.4)">
              {{ (driverArrivalTrip()?.ag_trip_requests?.ag_users?.full_name ?? 'P')[0].toUpperCase() }}
            </div>
            <div style="flex:1;min-width:0">
              <p style="color:#fff;font-weight:900;font-size:15px;margin:0;line-height:1.2">{{ driverArrivalTrip()?.ag_trip_requests?.ag_users?.full_name ?? 'Tu pasajero' }}</p>
              <p style="color:rgba(255,255,255,0.45);font-size:12px;margin:4px 0 0;font-weight:600">Destino: {{ driverArrivalTrip()?.ag_trip_requests?.dest_name ?? '—' }}</p>
            </div>
          </div>

          <!-- Timer de espera -->
          <div style="background:rgba(124,58,237,0.1);border:1px solid rgba(124,58,237,0.3);border-radius:14px;padding:12px 16px;display:flex;align-items:center;gap:12px">
            <span class="material-symbols-outlined" style="font-size:26px;color:#a78bfa;font-variation-settings:'FILL' 1">timer</span>
            <div style="flex:1">
              <p style="color:rgba(255,255,255,0.5);font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;margin:0 0 3px">Tiempo de espera gratuito</p>
              <div style="display:flex;align-items:center;gap:10px">
                <span style="font-size:clamp(22px,7vw,28px);font-weight:900;line-height:1;transition:color 0.5s"
                  [style.color]="driverArrivalTimer()! < 60 ? '#f87171' : driverArrivalTimer()! < 120 ? '#fbbf24' : '#a78bfa'">
                  {{ padTime(driverArrivalTimer()!) }}
                </span>
                <div style="flex:1;height:5px;background:rgba(255,255,255,0.08);border-radius:999px;overflow:hidden">
                  <div style="height:100%;border-radius:999px;transition:width 1s linear,background 0.5s"
                    [style.width]="(driverArrivalTimer()! / 240 * 100) + '%'"
                    [style.background]="driverArrivalTimer()! < 60 ? '#ef4444' : driverArrivalTimer()! < 120 ? '#f59e0b' : '#a78bfa'">
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Botón Pasajero a Bordo -->
          <button (click)="driverPassengerBoarded()"
            style="width:100%;padding:16px;border-radius:16px;border:none;cursor:pointer;background:linear-gradient(135deg,#7c3aed,#6366f1);display:flex;align-items:center;justify-content:center;gap:10px;font-size:16px;font-weight:900;color:#fff;letter-spacing:0.01em;box-shadow:0 6px 24px rgba(124,58,237,0.5)">
            <span class="material-symbols-outlined" style="font-size:22px;font-variation-settings:'FILL' 1">person_check</span>
            Pasajero a Bordo — Iniciar Ruta
          </button>

        </div>
      </div>
    </div>
  }

  <!-- ═══════════ BANNER PASAJERO: BUSCANDO / OFERTAS (flotante top) ═══════════ -->
  @if (tripSent() && !tripAccepted()) {
    <div class="modal-float" style="position:fixed;top:max(12px,env(safe-area-inset-top));left:12px;right:12px;z-index:8100;pointer-events:none;max-height:88dvh;display:flex;flex-direction:column;gap:10px;overflow-y:auto">

      <!-- Tarjeta principal: estado + controles -->
      <div style="pointer-events:auto;background:linear-gradient(180deg,#0c1a2e 0%,#0f2540 100%);border-radius:20px;border:1.5px solid rgba(249,115,22,0.4);box-shadow:0 12px 48px rgba(0,0,0,0.75);overflow:hidden">

        <!-- Franja superior -->
        <div style="background:linear-gradient(90deg,rgba(249,115,22,0.18) 0%,rgba(234,88,12,0.10) 100%);padding:8px 16px;display:flex;align-items:center;justify-content:space-between">
          <div style="display:flex;align-items:center;gap:8px">
            <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#f97316;animation:pulse 1.2s ease-in-out infinite;flex-shrink:0"></span>
            @if (receivedOffers().length > 0) {
              <span style="color:#fb923c;font-size:12px;font-weight:900;letter-spacing:0.07em;text-transform:uppercase">¡{{ receivedOffers().length }} {{ receivedOffers().length === 1 ? 'oferta recibida' : 'ofertas recibidas' }}!</span>
            } @else {
              <span style="color:#fb923c;font-size:12px;font-weight:900;letter-spacing:0.07em;text-transform:uppercase">Buscando conductor...</span>
            }
          </div>
          <span style="color:rgba(255,255,255,0.55);font-size:18px;font-weight:900;font-variant-numeric:tabular-nums">{{ formatTime(waitingCountdown()) }}</span>
        </div>

        <!-- Cuerpo -->
        <div style="padding:10px 14px 14px;display:flex;flex-direction:column;gap:10px">

          <!-- Ruta destino -->
          <div style="background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.09);border-radius:12px;padding:9px 12px;display:flex;align-items:center;gap:8px">
            <span class="material-symbols-outlined" style="font-size:14px;color:#f87171;flex-shrink:0">location_on</span>
            <p style="color:rgba(255,255,255,0.85);font-size:12px;font-weight:700;margin:0;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">{{ tripDest()?.name }}</p>
            <p style="color:#f97316;font-size:14px;font-weight:900;margin:0;flex-shrink:0">{{ formatCOP(tripPrice()) }}</p>
          </div>

          <!-- Conductores viendo + avatares -->
          @if (waitingDriverCount() > 0 || waitingDriverColors().length > 0) {
            <div style="display:flex;align-items:center;gap:8px">
              <div style="display:flex;align-items:center;flex-shrink:0">
                @for (color of waitingDriverColors(); track $index) {
                  <div style="width:28px;height:28px;border-radius:50%;border:2px solid rgba(255,255,255,0.3);display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-left:-8px"
                    [style.background]="color">
                    <span class="material-symbols-outlined" style="font-size:13px;color:#fff">person</span>
                  </div>
                }
              </div>
              <p style="color:rgba(255,255,255,0.65);font-size:11px;font-weight:600;margin:0">
                <span style="color:#fb923c;font-weight:900">{{ waitingDriverCount() }}</span>
                {{ waitingDriverCount() === 1 ? ' conductor ve tu solicitud' : ' conductores ven tu solicitud' }}
              </p>
            </div>
          }

          <!-- Barra progreso -->
          <div style="width:100%;height:3px;border-radius:999px;background:rgba(255,255,255,0.1);overflow:hidden">
            <div style="height:100%;border-radius:999px;background:#f97316;transition:width 1s linear"
              [style.width]="waitingProgress() + '%'"></div>
          </div>

          <!-- Fila: ajustar precio + pago + cancelar -->
          <div style="display:flex;align-items:center;gap:8px">
            <button (click)="adjustTripPrice(-500)"
              style="min-width:44px;min-height:44px;border-radius:10px;border:1px solid rgba(255,255,255,0.15);background:rgba(255,255,255,0.07);color:#94a3b8;font-size:20px;font-weight:900;display:flex;align-items:center;justify-content:center;flex-shrink:0;cursor:pointer">−</button>
            <p style="color:#fff;font-size:16px;font-weight:900;margin:0;flex:1;text-align:center">{{ formatCOP(tripPrice()) }}</p>
            <button (click)="adjustTripPrice(500)"
              style="min-width:44px;min-height:44px;border-radius:10px;border:none;background:#f97316;color:#fff;font-size:20px;font-weight:900;display:flex;align-items:center;justify-content:center;flex-shrink:0;cursor:pointer">+</button>
            <button (click)="cancelTrip()"
              style="flex:1;padding:12px 0;border-radius:10px;border:1px solid rgba(239,68,68,0.4);background:rgba(239,68,68,0.1);color:#f87171;font-size:13px;font-weight:900;cursor:pointer">Cancelar</button>
          </div>

        </div>
      </div>

      <!-- Tarjetas de ofertas de conductores -->
      @for (offer of receivedOffers(); track offer.id) {
        <div style="pointer-events:auto;border-radius:20px;overflow:hidden;background:#fff;border:2px solid #16a34a;box-shadow:0 12px 40px rgba(22,163,74,0.22),0 4px 16px rgba(0,0,0,0.15)">

          <!-- Cabecera verde precio -->
          <div style="background:linear-gradient(135deg,#16a34a,#059669);padding:10px 14px;display:flex;align-items:center;justify-content:space-between">
            <div style="display:flex;align-items:center;gap:6px">
              <span class="material-symbols-outlined" style="font-size:17px;color:#fff;font-variation-settings:'FILL' 1">local_offer</span>
              <span style="color:#fff;font-size:11px;font-weight:900;text-transform:uppercase;letter-spacing:0.07em">Nueva oferta</span>
            </div>
            <div style="text-align:right">
              <p style="color:#fff;font-weight:900;font-size:clamp(18px,5vw,22px);margin:0;line-height:1">{{ formatCOP(offer.offered_price) }}</p>
              @if (offer.offered_price < tripPrice()) {
                <p style="color:#bbf7d0;font-size:10px;font-weight:700;margin:0">↓ Más barato que tu precio</p>
              } @else if (offer.offered_price > tripPrice()) {
                <p style="color:#fef08a;font-size:10px;font-weight:700;margin:0">↑ Más caro que tu precio</p>
              } @else {
                <p style="color:#dcfce7;font-size:10px;margin:0">Igual a tu precio</p>
              }
            </div>
          </div>

          <!-- Info conductor -->
          <div style="display:flex;align-items:center;gap:12px;padding:10px 14px;border-bottom:1px solid #f0fdf4">
            @if (offer.ag_drivers?.ag_users?.selfie_url) {
              <img [src]="offer.ag_drivers!.ag_users!.selfie_url"
                style="width:48px;height:48px;border-radius:12px;object-fit:cover;flex-shrink:0;border:2px solid #16a34a" />
            } @else {
              <div style="width:48px;height:48px;border-radius:12px;background:linear-gradient(135deg,#f97316,#ea580c);display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:20px;font-weight:900;color:#fff">
                {{ (offer.ag_drivers?.ag_users?.full_name ?? 'C')[0].toUpperCase() }}
              </div>
            }
            <div style="flex:1;min-width:0">
              <p style="font-weight:900;font-size:14px;color:#0f172a;margin:0;line-height:1.2">{{ offer.ag_drivers?.ag_users?.full_name ?? 'Conductor' }}</p>
              <div style="display:flex;align-items:center;gap:6px;margin-top:3px;flex-wrap:wrap">
                <span style="color:#fbbf24;font-size:13px">★</span>
                <span style="font-size:12px;font-weight:800;color:#0f172a">{{ offer.ag_drivers?.rating_avg ?? '—' }}</span>
                <span style="color:#94a3b8;font-size:11px">·</span>
                <span style="color:#475569;font-size:11px;font-weight:600">{{ offer.ag_drivers?.trips_completed ?? 0 }} viajes</span>
                @if (driverEtaMin()[offer.id]) {
                  <span style="background:rgba(8,145,178,0.1);color:#0369a1;font-size:10px;font-weight:900;padding:2px 6px;border-radius:999px">~{{ driverEtaMin()[offer.id] }} min</span>
                }
              </div>
            </div>
          </div>

          <!-- Botones -->
          <div style="padding:10px 14px;display:flex;flex-direction:column;gap:8px">
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
              <button (click)="rejectOfferCard(offer)"
                style="padding:11px 0;border-radius:14px;border:2px solid #fecaca;background:#fef2f2;color:#dc2626;font-size:13px;font-weight:900;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:5px">
                <span class="material-symbols-outlined" style="font-size:16px">close</span> Rechazar
              </button>
              <button (click)="acceptOfferCard(offer)" [disabled]="acceptingOfferId() === offer.id"
                style="padding:11px 0;border-radius:14px;border:none;background:linear-gradient(135deg,#16a34a,#15803d);color:#fff;font-size:13px;font-weight:900;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:5px;box-shadow:0 4px 16px rgba(22,163,74,0.35)"
                [style.opacity]="acceptingOfferId() === offer.id ? '0.6' : '1'">
                @if (acceptingOfferId() === offer.id) {
                  <span class="material-symbols-outlined animate-spin" style="font-size:16px">autorenew</span>
                } @else {
                  <span class="material-symbols-outlined" style="font-size:16px">check_circle</span>
                }
                Aceptar
              </button>
            </div>
          </div>

          <!-- Barra timer -->
          <div style="padding:0 14px 12px">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:5px">
              <span style="color:#94a3b8;font-size:10px;font-weight:600">Oferta válida por</span>
              <span style="font-size:11px;font-weight:900"
                [style.color]="offerRemainingPct(offer) < 25 ? '#dc2626' : offerRemainingPct(offer) < 50 ? '#d97706' : '#16a34a'">
                {{ offerRemainingStr(offer) }}
              </span>
            </div>
            <div style="width:100%;height:5px;border-radius:999px;background:#f0fdf4;overflow:hidden">
              <div style="height:100%;border-radius:999px;transition:width 1s linear"
                [style.width]="offerRemainingPct(offer) + '%'"
                [style.background]="offerRemainingPct(offer) < 25 ? '#dc2626' : offerRemainingPct(offer) < 50 ? '#f59e0b' : '#16a34a'">
              </div>
            </div>
          </div>

        </div>
      }

    </div>
  }

  <!-- ═══════════ BANNER NUEVA SOLICITUD (flotante top) ═══════════ -->
  @if (driverOnline() && !driverTripAlert() && driverRequests().length > 0) {
    <div class="modal-float" style="position:fixed;top:max(12px,env(safe-area-inset-top));left:12px;right:12px;z-index:8000;pointer-events:none">
      <div
        (touchstart)="onRequestSwipeStart($event)"
        (touchmove)="onRequestSwipeMove($event)"
        (touchend)="onRequestSwipeEnd(driverRequests()[0].id)"
        [style.transform]="'translateX(' + requestSwipeX() + 'px)'"
        [style.transition]="requestSwiping() ? 'none' : 'transform 0.3s ease'"
        [style.opacity]="1 - Math.min(0.7, Math.abs(requestSwipeX()) / 200)"
        style="pointer-events:auto;background:linear-gradient(180deg,#0c1a2e 0%,#0f2540 100%);border-radius:20px;border:1.5px solid rgba(0,229,255,0.3);box-shadow:0 12px 48px rgba(0,0,0,0.75),0 0 0 1px rgba(0,229,255,0.08);overflow:hidden">

        <!-- Franja de alerta superior -->
        <div style="background:linear-gradient(90deg,rgba(0,229,255,0.15) 0%,rgba(5,150,105,0.1) 100%);padding:8px 16px;display:flex;align-items:center;justify-content:space-between">
          <div style="display:flex;align-items:center;gap:8px">
            <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#00E5FF;animation:pulse 1.2s ease-in-out infinite;flex-shrink:0"></span>
            <span style="color:#00E5FF;font-size:12px;font-weight:900;letter-spacing:0.07em;text-transform:uppercase">¡Solicitud de viaje!</span>
          </div>
          <div style="display:flex;align-items:center;gap:8px">
            @if (driverRequests().length > 1) {
              <span style="background:rgba(0,229,255,0.18);border:1px solid rgba(0,229,255,0.4);color:#00E5FF;font-size:10px;font-weight:900;padding:2px 8px;border-radius:999px">{{ driverRequests().length }} disponibles</span>
            }
            <button (click)="openDismissConfirm(driverRequests()[0].id)"
              style="min-width:44px;min-height:44px;border-radius:50%;border:2px solid #ef4444;background:linear-gradient(135deg,#ef4444,#b91c1c);cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;box-shadow:0 0 12px rgba(239,68,68,0.6),0 2px 8px rgba(0,0,0,0.4)"
              title="Descartar esta solicitud">
              <span class="material-symbols-outlined" style="font-size:22px;color:#fff;font-variation-settings:'FILL' 1">close</span>
            </button>
          </div>
        </div>

        <!-- Cuerpo del banner -->
        <div style="padding:10px 16px 14px">

          <!-- Fila pasajero + precio -->
          <div style="display:flex;align-items:center;gap:12px;margin-bottom:10px">
            <div style="width:46px;height:46px;border-radius:50%;flex-shrink:0;border:2px solid rgba(0,229,255,0.4);overflow:hidden;background:linear-gradient(135deg,#0891b2,#0e7490);display:flex;align-items:center;justify-content:center">
              @if (driverRequests()[0].passenger_selfie_url ?? driverRequests()[0].ag_users?.selfie_url) {
                <img [src]="driverRequests()[0].passenger_selfie_url ?? driverRequests()[0].ag_users?.selfie_url"
                  style="width:100%;height:100%;object-fit:cover" alt="foto pasajero">
              } @else {
                <span style="font-weight:900;font-size:18px;color:#fff">{{ (driverRequests()[0].passenger_name ?? driverRequests()[0].ag_users?.full_name ?? 'P')[0].toUpperCase() }}</span>
              }
            </div>
            <div style="flex:1;min-width:0">
              <p style="color:#fff;font-weight:900;font-size:14px;margin:0;line-height:1.2">{{ driverRequests()[0].passenger_name ?? driverRequests()[0].ag_users?.full_name ?? 'Pasajero' }}</p>
              <div style="display:flex;align-items:center;gap:6px;margin-top:3px">
                @if (driverRequests()[0].ag_users?.passenger_rating_avg) {
                  <span style="color:#fbbf24;font-size:11px;font-weight:700">★ {{ driverRequests()[0].ag_users!.passenger_rating_avg! | number:'1.1-1' }}</span>
                }
                <span style="color:rgba(255,255,255,0.4);font-size:10px">{{ driverRequests()[0].ag_users?.total_trips_as_passenger ?? 0 }} viajes</span>
                <span style="color:rgba(255,255,255,0.25)">·</span>
                <span style="color:rgba(255,255,255,0.45);font-size:10px">{{ driverRequests()[0].distance_km }} km</span>
              </div>
            </div>
            <div style="text-align:right;flex-shrink:0">
              <p style="font-weight:900;font-size:clamp(18px,5vw,22px);margin:0;line-height:1"
                [style.color]="reqRemainingPct(driverRequests()[0]) < 25 ? '#f87171' : '#34d399'">
                {{ formatCOP(driverRequests()[0].offered_price) }}
              </p>
              <p style="color:rgba(255,255,255,0.35);font-size:10px;margin:0">precio cliente</p>
            </div>
          </div>

          <!-- Ruta origen → destino -->
          <div style="background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.09);border-radius:12px;padding:9px 12px;display:flex;flex-direction:column;gap:7px;margin-bottom:10px">
            <div style="display:flex;align-items:flex-start;gap:8px">
              <span class="material-symbols-outlined" style="font-size:14px;color:#38bdf8;flex-shrink:0;margin-top:1px">my_location</span>
              <p style="color:rgba(255,255,255,0.82);font-size:12px;font-weight:600;margin:0;line-height:1.35">{{ driverRequests()[0].origin_name ?? 'Punto de recogida' }}</p>
            </div>
            <div style="height:1px;background:rgba(255,255,255,0.07);margin-left:22px"></div>
            <div style="display:flex;align-items:flex-start;gap:8px">
              <span class="material-symbols-outlined" style="font-size:14px;color:#f87171;flex-shrink:0;margin-top:1px">location_on</span>
              <p style="color:rgba(255,255,255,0.82);font-size:12px;font-weight:600;margin:0;line-height:1.35">{{ driverRequests()[0].dest_name ?? 'Destino' }}</p>
            </div>
          </div>

          <!-- Botones Aceptar / Contra-oferta -->
          @if (offerSentFor().has(driverRequests()[0].id)) {
            <div style="display:flex;align-items:center;justify-content:center;gap:6px;padding:10px;border-radius:12px;background:rgba(16,185,129,0.12);border:1px solid rgba(16,185,129,0.3)">
              <span class="material-symbols-outlined" style="font-size:16px;color:#34d399;font-variation-settings:'FILL' 1">check_circle</span>
              <span style="color:#34d399;font-size:13px;font-weight:900">Oferta enviada — esperando al pasajero</span>
            </div>
          } @else {
            <div style="display:flex;gap:8px">
              <button (click)="acceptDirectly(driverRequests()[0])" [disabled]="sendingOffer()"
                style="flex:1;padding:10px 0;border-radius:12px;border:none;cursor:pointer;color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;box-shadow:0 4px 16px rgba(0,0,0,0.3);overflow:hidden;position:relative"
                [style.background]="reqBtnGradient(driverRequests()[0])"
                [style.opacity]="sendingOffer() ? '0.6' : '1'"
                [class.animate-pulse]="reqRemainingPct(driverRequests()[0]) < 15">
                <div style="display:flex;align-items:center;gap:5px;position:relative;z-index:1">
                  <span class="material-symbols-outlined" style="font-size:14px;font-variation-settings:'FILL' 1">check_circle</span>
                  <span style="font-weight:900;font-size:13px">Aceptar</span>
                </div>
                <span style="font-size:10px;font-weight:700;opacity:0.9;letter-spacing:0.03em;position:relative;z-index:1">{{ reqRemainingStr(driverRequests()[0]) }}</span>
              </button>
              <button (click)="toggleInlineCounter(driverRequests()[0])" [disabled]="sendingOffer()"
                style="flex:1;padding:11px 0;border-radius:12px;border:1px solid rgba(245,158,11,0.5);cursor:pointer;font-weight:900;font-size:13px;display:flex;align-items:center;justify-content:center;gap:5px;transition:opacity 0.2s;background:rgba(245,158,11,0.12);color:#fbbf24"
                [style.opacity]="sendingOffer() ? '0.6' : '1'">
                <span class="material-symbols-outlined" style="font-size:15px;font-variation-settings:'FILL' 1">swap_vert</span>
                Contra-oferta
              </button>
            </div>
            <!-- Inline counter-offer -->
            @if (inlineCounterOpen()) {
              <div style="display:flex;align-items:center;gap:8px;padding:8px 10px;border-radius:12px;background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.3);margin-top:4px">
                <span style="color:#94a3b8;font-size:11px;font-weight:700;white-space:nowrap">Tu oferta:</span>
                <span style="color:#fbbf24;font-size:15px;font-weight:900;flex:1;text-align:center">{{ formatCOP(inlineCounterValue()) }}</span>
                <button (click)="inlineCounterValue.set(inlineCounterValue() > 2500 ? inlineCounterValue() - 500 : 2000)"
                  style="min-width:44px;min-height:44px;border-radius:10px;border:none;cursor:pointer;background:rgba(255,255,255,0.1);color:#94a3b8;font-size:20px;font-weight:900;display:flex;align-items:center;justify-content:center;flex-shrink:0;line-height:1">−</button>
                <button (click)="inlineCounterValue.set(inlineCounterValue() + 500)"
                  style="min-width:44px;min-height:44px;border-radius:10px;border:none;cursor:pointer;background:#f97316;color:#fff;font-size:20px;font-weight:900;display:flex;align-items:center;justify-content:center;flex-shrink:0;line-height:1">+</button>
                <button (click)="submitInlineCounter(driverRequests()[0])" [disabled]="sendingOffer()"
                  style="padding:6px 12px;border-radius:8px;border:none;cursor:pointer;background:linear-gradient(135deg,#059669,#10b981);color:#fff;font-size:12px;font-weight:900;flex-shrink:0;opacity:1"
                  [style.opacity]="sendingOffer() ? '0.5' : '1'">Enviar</button>
              </div>
            }
          }

        </div>
      </div>
    </div>
  }

  <!-- ═══════════ CONFIRM DESCARTE SOLICITUD ═══════════ -->
  @if (dismissConfirmId()) {
    <div style="position:fixed;inset:0;z-index:9900;display:flex;align-items:center;justify-content:center;padding:24px;background:rgba(0,0,0,0.65);backdrop-filter:blur(4px)">
      <div style="background:linear-gradient(180deg,#0f172a 0%,#1e293b 100%);border-radius:24px;border:1.5px solid rgba(239,68,68,0.4);box-shadow:0 24px 64px rgba(0,0,0,0.8);padding:28px 24px;width:100%;max-width:340px;text-align:center">
        <div style="width:56px;height:56px;border-radius:50%;background:linear-gradient(135deg,#ef4444,#b91c1c);display:flex;align-items:center;justify-content:center;margin:0 auto 16px;box-shadow:0 0 24px rgba(239,68,68,0.5)">
          <span class="material-symbols-outlined" style="font-size:28px;color:#fff;font-variation-settings:'FILL' 1">delete</span>
        </div>
        <p style="color:#fff;font-weight:900;font-size:17px;margin:0 0 8px">¿Eliminar esta solicitud?</p>
        <p style="color:rgba(255,255,255,0.5);font-size:13px;margin:0 0 24px;line-height:1.5">Solo desaparece de tu vista.<br>El pasajero sigue activo para otros conductores.</p>
        <div style="display:flex;gap:12px">
          <button (click)="dismissConfirmId.set(null); requestSwipeX.set(0)"
            style="flex:1;padding:13px 0;border-radius:14px;border:1.5px solid rgba(255,255,255,0.15);background:rgba(255,255,255,0.07);color:#94a3b8;font-weight:900;font-size:15px;cursor:pointer">
            No
          </button>
          <button (click)="confirmDismissRequest()"
            style="flex:1;padding:13px 0;border-radius:14px;border:none;background:linear-gradient(135deg,#ef4444,#b91c1c);color:#fff;font-weight:900;font-size:15px;cursor:pointer;box-shadow:0 4px 16px rgba(239,68,68,0.4)">
            Sí, eliminar
          </button>
        </div>
      </div>
    </div>
  }

  <!-- ═══════════ BANNER PASAJERO: CONDUCTOR LLEGÓ (flotante top) ═══════════ -->
  @if (arrivedAtPickupTimer() !== null && tripAccepted()) {
    <div class="modal-float" style="position:fixed;top:max(12px,env(safe-area-inset-top));left:12px;right:12px;z-index:8500;pointer-events:none;max-height:90dvh;overflow-y:auto">
      <div style="pointer-events:auto;background:linear-gradient(180deg,#0a1628 0%,#0d1f3c 100%);border-radius:20px;border:1.5px solid rgba(52,211,153,0.4);box-shadow:0 12px 48px rgba(0,0,0,0.8),0 0 0 1px rgba(52,211,153,0.1);overflow:hidden">

        <!-- Franja superior verde -->
        <div style="background:linear-gradient(90deg,rgba(16,185,129,0.2) 0%,rgba(5,150,105,0.1) 100%);padding:9px 16px;display:flex;align-items:center;justify-content:space-between">
          <div style="display:flex;align-items:center;gap:8px">
            <span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:#34d399;animation:pulse 1s ease-in-out infinite;flex-shrink:0"></span>
            <span style="color:#34d399;font-size:11px;font-weight:900;letter-spacing:0.09em;text-transform:uppercase">¡Tu conductor llegó!</span>
          </div>
          <span style="color:rgba(255,255,255,0.35);font-size:10px;font-weight:700">Sal a recibirlo</span>
        </div>

        <!-- Cuerpo -->
        <div style="padding:12px 16px 16px;display:flex;flex-direction:column;gap:12px">

          <!-- Foto + nombre + rating + viajes -->
          <div style="display:flex;align-items:center;gap:12px">
            @if (tripAccepted()!.ag_drivers?.ag_users?.selfie_url) {
              <img [src]="tripAccepted()!.ag_drivers!.ag_users!.selfie_url"
                style="width:52px;height:52px;border-radius:14px;object-fit:cover;flex-shrink:0;border:2px solid rgba(52,211,153,0.4)" />
            } @else {
              <div style="width:52px;height:52px;border-radius:14px;background:linear-gradient(135deg,#059669,#0891b2);display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:22px;font-weight:900;color:#fff;border:2px solid rgba(52,211,153,0.35)">
                {{ (tripAccepted()!.ag_drivers?.ag_users?.full_name ?? 'C')[0].toUpperCase() }}
              </div>
            }
            <div style="flex:1;min-width:0">
              <p style="color:#fff;font-weight:900;font-size:15px;margin:0;line-height:1.2">{{ tripAccepted()!.ag_drivers?.ag_users?.full_name ?? 'Tu conductor' }}</p>
              <div style="display:flex;align-items:center;gap:8px;margin-top:4px;flex-wrap:wrap">
                @if (tripAccepted()!.ag_drivers?.rating_avg) {
                  <div style="display:flex;align-items:center;gap:3px">
                    <span style="color:#fbbf24;font-size:13px">★</span>
                    <span style="color:#fbbf24;font-size:12px;font-weight:800">{{ tripAccepted()!.ag_drivers!.rating_avg | number:'1.1-1' }}</span>
                  </div>
                }
                <span style="color:rgba(255,255,255,0.35);font-size:11px">·</span>
                <span style="color:rgba(255,255,255,0.5);font-size:11px;font-weight:600">{{ tripAccepted()!.ag_drivers?.trips_completed ?? 0 }} viajes</span>
                @if (tripAccepted()!.ag_drivers?.level) {
                  <span style="background:rgba(245,158,11,0.18);border:1px solid rgba(245,158,11,0.35);color:#fbbf24;font-size:9px;font-weight:900;padding:2px 7px;border-radius:999px;text-transform:capitalize">
                    {{ tripAccepted()!.ag_drivers!.level }}
                  </span>
                }
              </div>
            </div>
          </div>

          <!-- Placa + color + marca + tipo -->
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
            <div style="background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.09);border-radius:10px;padding:8px 12px">
              <p style="color:rgba(255,255,255,0.35);font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;margin:0 0 2px">Placa</p>
              <p style="color:#fff;font-weight:900;font-size:15px;margin:0;letter-spacing:0.05em">{{ tripAccepted()!.ag_drivers?.plate ?? tripAccepted()!.ag_drivers?.vehicle_plate ?? '—' }}</p>
            </div>
            <div style="background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.09);border-radius:10px;padding:8px 12px">
              <p style="color:rgba(255,255,255,0.35);font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;margin:0 0 2px">Color</p>
              <p style="color:#fff;font-weight:900;font-size:14px;margin:0;text-transform:capitalize">{{ tripAccepted()!.ag_drivers?.vehicle_color ?? '—' }}</p>
            </div>
            <div style="background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.09);border-radius:10px;padding:8px 12px">
              <p style="color:rgba(255,255,255,0.35);font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;margin:0 0 2px">Marca</p>
              <p style="color:#fff;font-weight:900;font-size:13px;margin:0;text-transform:capitalize">{{ tripAccepted()!.ag_drivers?.vehicle_brand ?? '—' }}</p>
            </div>
            <div style="background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.09);border-radius:10px;padding:8px 12px">
              <p style="color:rgba(255,255,255,0.35);font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;margin:0 0 2px">Tipo</p>
              <p style="color:#fff;font-weight:900;font-size:13px;margin:0">{{ tripAccepted()!.ag_drivers?.vehicle_type === 'moto' ? 'Moto' : tripAccepted()!.ag_drivers?.vehicle_type === 'camion' ? 'Camión' : 'Carro' }}</p>
            </div>
          </div>

          <!-- Destino + pago -->
          <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.09);border-radius:10px;padding:10px 12px;display:flex;align-items:center;gap:10px">
            <span class="material-symbols-outlined" style="font-size:18px;color:#f97316;flex-shrink:0">location_on</span>
            <div style="flex:1;min-width:0">
              <p style="color:rgba(255,255,255,0.35);font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;margin:0 0 2px">Destino</p>
              <p style="color:#fff;font-weight:700;font-size:13px;margin:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">{{ tripDest()?.name ?? '—' }}</p>
            </div>
            <div style="display:flex;align-items:center;gap:5px;border-radius:8px;padding:4px 8px;flex-shrink:0"
              [style.background]="paymentMethodMap[tripPayment()].bgSel"
              [style.border]="'1px solid ' + paymentMethodMap[tripPayment()].color">
              <span class="material-symbols-outlined" style="font-size:14px" [style.color]="paymentMethodMap[tripPayment()].color">{{ paymentMethodMap[tripPayment()].icon }}</span>
              <p style="font-size:10px;font-weight:900;margin:0" [style.color]="paymentMethodMap[tripPayment()].color">{{ paymentMethodMap[tripPayment()].label }}</p>
            </div>
          </div>

          <!-- Barra de etapas -->
          <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:10px 12px">
            <p style="color:rgba(255,255,255,0.4);font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;margin:0 0 8px">{{ stageLabel(currentTripStage()) }}</p>
            <div style="display:flex;align-items:center;gap:4px;margin-bottom:8px">
              @for (s of passengerTripStages; track s.key) {
                <div style="flex:1;height:3px;border-radius:999px;transition:background 0.4s"
                  [style.background]="isStagePassed(s.key, currentTripStage()) ? '#10b981' : 'rgba(255,255,255,0.1)'"></div>
              }
            </div>
            <div style="display:flex;justify-content:space-between">
              @for (s of passengerTripStages; track s.key) {
                <div style="display:flex;flex-direction:column;align-items:center;gap:2px;flex:1">
                  <span class="material-symbols-outlined" style="font-size:13px;transition:color 0.4s"
                    [style.color]="isStagePassed(s.key, currentTripStage()) ? '#34d399' : 'rgba(255,255,255,0.2)'">{{ s.icon }}</span>
                  <p style="font-size:10px;text-align:center;line-height:1.2;margin:0;transition:color 0.4s"
                    [style.color]="isStagePassed(s.key, currentTripStage()) ? '#6ee7b7' : 'rgba(255,255,255,0.2)'"
                    [style.font-weight]="currentTripStage() === s.key ? '900' : '600'">{{ s.label }}</p>
                </div>
              }
            </div>
          </div>

          <!-- Timer de espera -->
          <div style="background:rgba(52,211,153,0.07);border:1px solid rgba(52,211,153,0.2);border-radius:12px;padding:10px 14px;display:flex;align-items:center;gap:10px">
            <span class="material-symbols-outlined" style="font-size:22px;color:#34d399;font-variation-settings:'FILL' 1">timer</span>
            <div style="flex:1">
              <p style="color:rgba(255,255,255,0.55);font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;margin:0 0 1px">Tiempo de espera</p>
              <div style="display:flex;align-items:center;gap:8px">
                <span style="font-size:22px;font-weight:900;line-height:1;transition:color 0.5s"
                  [style.color]="arrivedAtPickupTimer()! < 60 ? '#f87171' : arrivedAtPickupTimer()! < 120 ? '#fbbf24' : '#34d399'">
                  {{ padTime(arrivedAtPickupTimer()!) }}
                </span>
                <div style="flex:1;height:4px;background:rgba(255,255,255,0.1);border-radius:999px;overflow:hidden">
                  <div style="height:100%;border-radius:999px;transition:width 1s linear,background 0.5s"
                    [style.width]="(arrivedAtPickupTimer()! / 240 * 100) + '%'"
                    [style.background]="arrivedAtPickupTimer()! < 60 ? '#ef4444' : arrivedAtPickupTimer()! < 120 ? '#f59e0b' : '#34d399'">
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Botones acción: Chat + Llamar + Cancelar -->
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px">
            <button (click)="openPassengerChat()"
              style="padding:11px 0;border-radius:12px;border:none;cursor:pointer;background:rgba(37,99,235,0.85);color:#fff;font-size:12px;font-weight:900;display:flex;flex-direction:column;align-items:center;gap:3px;position:relative">
              <span class="material-symbols-outlined" style="font-size:18px">chat</span>Chat
              @if (chatUnread() > 0) {
                <span style="position:absolute;top:5px;right:8px;width:15px;height:15px;background:#ef4444;border-radius:50%;font-size:9px;font-weight:900;color:#fff;display:flex;align-items:center;justify-content:center">{{ chatUnread() }}</span>
              }
            </button>
            <button (click)="callDriver()" [disabled]="callingDriver()"
              style="padding:11px 0;border-radius:12px;border:none;cursor:pointer;background:rgba(22,163,74,0.85);color:#fff;font-size:12px;font-weight:900;display:flex;flex-direction:column;align-items:center;gap:3px">
              <span class="material-symbols-outlined" style="font-size:18px">{{ callingDriver() ? 'hourglass_empty' : 'call' }}</span>Llamar
            </button>
            <button (click)="openCancelWithReason('passenger')"
              style="padding:11px 0;border-radius:12px;border:1px solid rgba(239,68,68,0.4);cursor:pointer;background:rgba(239,68,68,0.12);color:#f87171;font-size:12px;font-weight:900;display:flex;flex-direction:column;align-items:center;gap:3px">
              <span class="material-symbols-outlined" style="font-size:18px">cancel</span>Cancelar
            </button>
          </div>

          <!-- Botón A bordo -->
          <button (click)="passengerConfirmBoarding()"
            style="width:100%;padding:14px;border-radius:14px;border:none;cursor:pointer;background:linear-gradient(135deg,#059669,#10b981);display:flex;align-items:center;justify-content:center;gap:8px;font-size:15px;font-weight:900;color:#fff;letter-spacing:0.01em;box-shadow:0 4px 16px rgba(16,185,129,0.4)">
            <span class="material-symbols-outlined" style="font-size:20px;font-variation-settings:'FILL' 1">person_check</span>
            ¡Ya estoy a bordo!
          </button>

        </div>
      </div>
    </div>
  }

  <!-- ═══════════ CÁMARA DOCUMENTO ═══════════ -->
  @if (docCameraOpen()) {
    <div class="fixed inset-0 z-[9999]" style="touch-action:none;background:#000">

      <!--
        Video en el DOM → el browser decodifica los frames (no funciona offscreen en Chrome móvil).
        Canvas encima → dibuja el video + overlay oscuro + recuadro en cada requestAnimationFrame.
        Texto y botones encima del canvas (orden DOM).
      -->
      <video id="doc-cam-video" autoplay muted playsinline
        style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:0"></video>

      <canvas id="doc-cam-main"
        style="position:absolute;inset:0;display:block;width:100%;height:100%"></canvas>

      <!-- Texto instrucción -->
      <div style="position:absolute;top:11%;left:0;right:0;text-align:center;pointer-events:none;padding:0 20px">
        <p style="color:#fff;font-size:15px;font-weight:900;letter-spacing:0.01em;
          text-shadow:0 2px 8px rgba(0,0,0,1),0 0 20px rgba(0,0,0,0.9)">
          Encaja tu cédula dentro del recuadro
        </p>
      </div>

      <!-- Aviso iluminación -->
      <div style="position:absolute;bottom:27%;left:0;right:0;display:flex;justify-content:center;pointer-events:none">
        <div style="display:inline-flex;align-items:center;gap:6px;
          background:rgba(0,0,0,0.55);border:1px solid rgba(251,146,60,0.6);
          padding:6px 14px;border-radius:999px">
          <span class="material-symbols-outlined" style="font-size:13px;color:#fbbf24">light_mode</span>
          <span style="color:#fbbf24;font-size:12px;font-weight:700">Ubícate en un lugar bien iluminado</span>
        </div>
      </div>

      <!-- Botones -->
      <div style="position:absolute;bottom:0;left:0;right:0;
        display:flex;align-items:center;justify-content:space-between;padding:0 32px 52px">
        <button (click)="closeDocCamera()"
          style="width:48px;height:48px;border-radius:50%;display:flex;align-items:center;justify-content:center;
            background:rgba(0,0,0,0.6);border:2px solid rgba(255,255,255,0.45)">
          <span class="material-symbols-outlined" style="font-size:22px;color:#fff">close</span>
        </button>
        <button (click)="captureDocPhoto()" class="active:scale-90 transition-transform"
          style="width:80px;height:80px;border-radius:50%;border:5px solid #fff;
            background:rgba(255,255,255,0.15);display:flex;align-items:center;justify-content:center">
          <div style="width:58px;height:58px;border-radius:50%;background:#fff"></div>
        </button>
        <div style="width:48px"></div>
      </div>

      <canvas id="doc-cam-canvas" style="display:none"></canvas>
    </div>
  }

  <!-- reCAPTCHA invisible (Firebase Phone Auth) — registro completo -->
  <div id="ag-recaptcha-container"></div>
  <!-- reCAPTCHA invisible — registro rápido -->
  <div id="qr-recaptcha-container"></div>

  <!-- ═══════════ OTP OVERLAY ═══════════ -->
  @if (otpStep() !== 'idle') {
    <div style="position:fixed;inset:0;z-index:1000;display:flex;align-items:center;justify-content:center;padding:20px;background:rgba(0,0,0,0.7);backdrop-filter:blur(6px)">
      <div style="width:100%;max-width:360px;background:#0f1421;border:1px solid rgba(255,255,255,0.1);border-radius:24px;padding:28px 24px;display:flex;flex-direction:column;gap:20px">

        <!-- Ícono -->
        <div style="display:flex;flex-direction:column;align-items:center;gap:10px">
          <div style="width:60px;height:60px;border-radius:50%;background:rgba(124,58,237,0.15);border:2px solid rgba(124,58,237,0.4);display:flex;align-items:center;justify-content:center">
            <span class="material-symbols-outlined" style="font-size:28px;color:#a78bfa">sms</span>
          </div>
          <h3 style="color:#fff;font-weight:900;font-size:18px;margin:0">Verifica tu número</h3>
          <p style="color:#94a3b8;font-size:13px;text-align:center;margin:0;line-height:1.5">
            Enviamos un código de 6 dígitos al número<br>
            <span style="color:#fff;font-weight:700">{{ otpPhone() }}</span>
          </p>
        </div>

        @if (otpStep() === 'sending') {
          <!-- Enviando -->
          <div style="display:flex;align-items:center;justify-content:center;gap:10px;padding:16px">
            <span class="material-symbols-outlined animate-spin" style="font-size:22px;color:#7C3AED">autorenew</span>
            <span style="color:#94a3b8;font-size:14px">Enviando SMS...</span>
          </div>
        } @else {
          <!-- Input código -->
          <div style="display:flex;flex-direction:column;gap:6px">
            <label style="color:#94a3b8;font-size:11px;font-weight:700;letter-spacing:0.08em">CÓDIGO DE VERIFICACIÓN</label>
            <input
              [(ngModel)]="otpCodeDisplay"
              (ngModelChange)="otpCode.set($event)"
              name="otpCode"
              type="tel" inputmode="numeric" maxlength="6"
              placeholder="_ _ _ _ _ _"
              [disabled]="otpStep() === 'verifying'"
              style="background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.15);border-radius:14px;padding:14px 16px;color:#fff;font-size:24px;font-weight:900;letter-spacing:0.3em;text-align:center;width:100%;outline:none;box-sizing:border-box"/>
          </div>

          @if (otpError()) {
            <div style="background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.3);border-radius:12px;padding:10px 14px;color:#fca5a5;font-size:12px;text-align:center">
              {{ otpError() }}
            </div>
          }

          <!-- Botones -->
          <div style="display:flex;flex-direction:column;gap:10px">
            <button (click)="confirmOtp()" [disabled]="otpStep() === 'verifying' || otpCode().length < 6"
              style="width:100%;padding:14px;border-radius:14px;background:linear-gradient(135deg,#7C3AED,#2563EB);color:#fff;font-weight:900;font-size:15px;border:none;cursor:pointer;opacity:1;display:flex;align-items:center;justify-content:center;gap:8px"
              [style.opacity]="otpStep() === 'verifying' || otpCode().length < 6 ? '0.5' : '1'">
              @if (otpStep() === 'verifying') {
                <span class="material-symbols-outlined animate-spin" style="font-size:18px">autorenew</span> Verificando...
              } @else {
                <span class="material-symbols-outlined" style="font-size:18px">check_circle</span> Confirmar código
              }
            </button>
            <div style="display:flex;gap:8px">
              <button (click)="resendOtp()" [disabled]="otpStep() === 'verifying'"
                style="flex:1;padding:10px;border-radius:12px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);color:#94a3b8;font-size:12px;font-weight:700;cursor:pointer">
                Reenviar SMS
              </button>
              <button (click)="cancelOtp()"
                style="flex:1;padding:10px;border-radius:12px;background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.2);color:#f87171;font-size:12px;font-weight:700;cursor:pointer">
                Cancelar
              </button>
            </div>
          </div>
        }
      </div>
    </div>
  }

  <!-- ═══════════ SPLASH ═══════════ -->
  @if (screen() === 'splash') {
    <div style="position:fixed;top:0;left:0;right:0;bottom:0;z-index:999;display:flex;flex-direction:column;align-items:center;justify-content:center;background:linear-gradient(160deg,#7C3AED 0%,#4F46E5 50%,#2563EB 100%)">

      <!-- Círculos decorativos de fondo -->
      <div style="position:absolute;top:-80px;right:-80px;width:300px;height:300px;border-radius:50%;background:rgba(255,255,255,0.05)"></div>
      <div style="position:absolute;bottom:-100px;left:-60px;width:260px;height:260px;border-radius:50%;background:rgba(255,255,255,0.04)"></div>

      <!-- Logo animado -->
      <div class="movi-logo-wrap" style="display:flex;flex-direction:column;align-items:center">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 260" style="width:210px;height:273px;filter:drop-shadow(0 8px 32px rgba(0,0,0,0.35))">
          <!-- Camino sutil -->
          <path d="M 20 240 Q 70 190 100 160 Q 135 128 180 110" stroke="rgba(255,255,255,0.12)" stroke-width="26" fill="none" stroke-linecap="round"/>
          <path d="M 20 240 Q 70 190 100 160 Q 135 128 180 110" stroke="rgba(255,255,255,0.06)" stroke-width="42" fill="none" stroke-linecap="round"/>
          <!-- Sombra pin -->
          <ellipse cx="100" cy="162" rx="22" ry="6" fill="rgba(0,0,0,0.18)"/>
          <!-- Pin blanco -->
          <g transform="translate(100,95)">
            <path d="M0-58C-32-58-54-36-54-8C-54 24 0 66 0 66C0 66 54 24 54-8C54-36 32-58 0-58Z" fill="#FFFFFF"/>
            <circle cx="0" cy="-14" r="20" fill="#6D28D9"/>
            <circle cx="0" cy="-14" r="9"  fill="#FFFFFF"/>
          </g>
          <!-- MOVI -->
          <text x="100" y="186" font-family="'Segoe UI',Arial,sans-serif" font-size="60" font-weight="900" fill="#FFFFFF" text-anchor="middle" letter-spacing="5">MOVI</text>
          <!-- Taglines -->
          <text x="100" y="214" font-family="'Segoe UI',Arial,sans-serif" font-size="10.5" font-weight="400" fill="rgba(255,255,255,0.8)" text-anchor="middle">La aplicación de transporte</text>
          <text x="100" y="231" font-family="'Segoe UI',Arial,sans-serif" font-size="10.5" font-weight="700" fill="rgba(255,255,255,0.95)" text-anchor="middle">Más segura a nivel mundial</text>
        </svg>
      </div>

      <!-- Dots de carga -->
      <div style="display:flex;gap:10px;margin-top:48px">
        <div class="dot1" style="width:9px;height:9px;border-radius:50%;background:rgba(255,255,255,0.8)"></div>
        <div class="dot2" style="width:9px;height:9px;border-radius:50%;background:rgba(255,255,255,0.8)"></div>
        <div class="dot3" style="width:9px;height:9px;border-radius:50%;background:rgba(255,255,255,0.8)"></div>
      </div>
    </div>
  }

  <!-- ═══════════ PASAJERO DASHBOARD ═══════════ -->
  @if (screen() === 'passenger-home') {
    <div class="w-full max-w-lg flex flex-col gap-3">

      <!-- Header pasajero -->
      <div class="flex items-center justify-between px-1 pt-2 w-full">
        <div>
          <h1 class="text-slate-900 font-black text-lg leading-tight">¡Hola, {{ firstName() }}!</h1>
          <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-emerald-700 font-bold" style="font-size:11px;background:#D1FAE5;border:1px solid #A7F3D0">
            <span class="material-symbols-outlined" style="font-size:11px">check_circle</span> Modo Pasajero
          </span>
        </div>
        <!-- Botón hamburguesa -->
        <button (click)="agMenuOpen.set(true)"
            class="flex flex-col items-center justify-center gap-1 transition-all active:scale-90 rounded-xl"
            style="background:#F3F4F6;border:1px solid #E5E7EB;min-width:48px;min-height:48px;padding:8px 12px">
            <div class="flex flex-col items-center gap-1">
              <span class="block rounded-full bg-slate-700" style="width:18px;height:2px"></span>
              <span class="block rounded-full bg-slate-700" style="width:18px;height:2px"></span>
              <span class="block rounded-full bg-slate-700" style="width:14px;height:2px"></span>
            </div>
            <span class="text-slate-700 font-bold" style="font-size:10px;letter-spacing:0.06em">MENÚ</span>
          </button>
      </div>

      <!-- ══ Drawer menú Anda y Gana ══ -->
      @if (agMenuOpen()) {
        <!-- Overlay oscuro -->
        <div (click)="agMenuOpen.set(false)"
          class="fixed inset-0 z-50 transition-opacity"
          style="background:rgba(0,0,0,0.55);backdrop-filter:blur(2px)"></div>

        <!-- Panel lateral derecho -->
        <div class="fixed top-0 right-0 bottom-0 z-50 flex flex-col"
          style="width:min(280px,85vw);background:#0f1421;border-left:1px solid rgba(255,255,255,0.08);box-shadow:-8px 0 32px rgba(0,0,0,0.6)">

          <!-- Cabecera del menú -->
          <div class="flex items-center justify-between px-4 pt-[max(2.5rem,env(safe-area-inset-top))] pb-4"
            style="border-bottom:1px solid rgba(255,255,255,0.07)">
            <div class="flex items-center gap-2.5">
              <img src="movi-logo.svg" alt="Movi" class="w-8 h-8 rounded-xl" />
              <div>
                <p class="text-white font-black text-sm">Movi</p>
                <p class="text-slate-400 text-xs font-medium">{{ agProfile()?.full_name }}</p>
              </div>
            </div>
            <button (click)="agMenuOpen.set(false)"
              class="w-8 h-8 rounded-lg flex items-center justify-center transition-colors active:scale-90"
              style="background:rgba(255,255,255,0.06)">
              <span class="material-symbols-outlined text-slate-400" style="font-size:20px">close</span>
            </button>
          </div>

          <!-- Opciones -->
          <nav class="flex-1 overflow-y-auto py-3 px-3">

            <p class="text-slate-600 text-xs font-bold uppercase tracking-widest px-3 pb-2 pt-1">Principal</p>

            @for (item of agMenuItems; track item.label) {
              @if (item.divider) {
                <div class="my-2" style="border-top:1px solid rgba(255,255,255,0.06)"></div>
                @if (item.section) {
                  <p class="text-slate-600 text-xs font-bold uppercase tracking-widest px-3 pb-2 pt-1">{{ item.section }}</p>
                }
              } @else {
                <button (click)="openPassengerSection(item.action)"
                  class="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-left transition-all active:scale-[0.98] mb-0.5"
                  style="color:#cbd5e1"
                  onmouseover="this.style.background='rgba(249,115,22,0.08)'"
                  onmouseout="this.style.background='transparent'">
                  <span class="material-symbols-outlined flex-shrink-0"
                    style="font-size:20px;color:#f97316">{{ item.icon }}</span>
                  <span class="text-sm font-medium">{{ item.label }}</span>
                </button>
              }
            }
          </nav>

          <!-- Footer del menú -->
          <div class="px-5 py-5" style="border-top:1px solid rgba(255,255,255,0.07)">
            <p class="text-slate-600 text-xs text-center">Movi · v1.0</p>
          </div>
        </div>
      }

      <!-- ══ Card superior: dirección de recogida (viaje activo) o referidos/pago ══ -->
      @if (tripAccepted()) {
        <!-- Dirección del pasajero — reemplaza el banner mientras el conductor viene o durante el viaje -->
        <div class="w-full flex items-center gap-3"
          style="background:linear-gradient(135deg,#0f2027,#1a3a4a);border-radius:16px;padding:12px 16px;border:1px solid rgba(0,229,255,0.2)">
          <div class="flex items-center justify-center flex-shrink-0"
            style="width:38px;height:38px;border-radius:12px;background:rgba(0,229,255,0.12);border:1px solid rgba(0,229,255,0.25)">
            <span class="material-symbols-outlined" style="font-size:20px;color:#00e5ff;font-variation-settings:'FILL' 1">my_location</span>
          </div>
          <div class="flex-1 min-w-0">
            <p style="color:rgba(0,229,255,0.7);font-size:10px;font-weight:800;margin:0;letter-spacing:0.08em;text-transform:uppercase">Tu punto de recogida</p>
            <p class="truncate" style="color:#fff;font-size:13px;font-weight:700;margin:0;line-height:1.3">
              {{ currentAddress() || 'Tu ubicación actual' }}
            </p>
          </div>
        </div>
      } @else if (agProfile()) {
        <button (click)="openPassengerSection('referrals')"
          class="w-full flex items-center gap-3 active:scale-[0.98] transition-transform"
          style="background:linear-gradient(135deg,#7C3AED,#3B82F6);border-radius:16px;padding:14px 16px;border:none;cursor:pointer">
          <div class="flex items-center justify-center flex-shrink-0"
            style="width:40px;height:40px;border-radius:12px;background:rgba(255,255,255,0.15)">
            <span class="material-symbols-outlined" style="font-size:22px;color:rgba(255,255,255,0.9);font-variation-settings:'FILL' 1">redeem</span>
          </div>
          <div class="flex-1 min-w-0 text-left">
            <p style="color:#fff;font-weight:600;font-size:14px;margin:0;line-height:1.3">Gana por invitar</p>
            <p style="color:rgba(255,255,255,0.8);font-size:12px;margin:0;line-height:1.3">$0 ganados este mes</p>
          </div>
          <div class="flex items-center gap-1 flex-shrink-0">
            <span style="color:#fff;font-size:12px;font-weight:500">Invitar amigos</span>
            <span class="material-symbols-outlined" style="font-size:16px;color:#fff">arrow_forward</span>
          </div>
        </button>
      } @else {
        <button (click)="openPassengerSection('paymentmethods')"
          class="w-full flex items-center gap-3 active:scale-[0.98] transition-transform"
          style="background:linear-gradient(135deg,#7C3AED,#3B82F6);border-radius:16px;padding:14px 16px;border:none;cursor:pointer">
          <div class="flex items-center justify-center flex-shrink-0"
            style="width:40px;height:40px;border-radius:12px;background:rgba(255,255,255,0.15)">
            <span class="material-symbols-outlined" style="font-size:22px;color:rgba(255,255,255,0.9);font-variation-settings:'FILL' 1">credit_card</span>
          </div>
          <div class="flex-1 min-w-0 text-left">
            <p style="color:#fff;font-weight:600;font-size:14px;margin:0;line-height:1.3">Métodos de pago</p>
            <p style="color:rgba(255,255,255,0.8);font-size:12px;margin:0;line-height:1.3">Gestiona tus formas de pago</p>
          </div>
          <span class="material-symbols-outlined" style="font-size:16px;color:#fff">arrow_forward</span>
        </button>
      }


      @if (passengerSection() === null) {

      <!-- ══ Barra de dirección (encima del mapa) ══ -->
      @if (!passengerMapFullscreen() && gpsStatus() !== 'requesting' && !tripAccepted()) {
        <div class="w-full mb-2">
          @if (locationUpdating()) {
            <div class="flex items-center justify-center gap-1.5 mb-1.5">
              <div class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full"
                style="background:rgba(13,17,26,0.85);border:1px solid rgba(124,58,237,0.35)">
                <span class="material-symbols-outlined animate-spin text-purple-400" style="font-size:12px">autorenew</span>
                <span class="text-xs font-medium" style="color:rgba(255,255,255,0.75)">Actualizando zona...</span>
              </div>
            </div>
          }
          @if (!addressEditMode()) {
            <button (click)="openAddressEdit()"
              class="w-full flex items-center gap-3 bg-white rounded-2xl px-4 py-3 shadow-lg text-left transition-all active:scale-[0.98]"
              style="border:1px solid #e2e8f0">
              <span class="material-symbols-outlined text-orange-500 flex-shrink-0" style="font-size:20px">location_on</span>
              <div class="flex-1 min-w-0">
                @if (addressLoading()) {
                  <p class="text-slate-400 text-sm animate-pulse">Obteniendo dirección...</p>
                } @else if (currentAddress()) {
                  <p class="text-slate-800 text-sm font-semibold truncate">{{ currentAddress() }}</p>
                  <div class="flex items-center gap-2 mt-0.5 flex-wrap">
                    @if (currentNeighborhood()) {
                      <p class="text-orange-500 text-xs font-medium truncate">{{ currentNeighborhood() }}</p>
                    }
                    @if (gpsAccuracy() !== null) {
                      <span class="flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0"
                        [style.background]="gpsAccuracy()! <= 10 ? '#d1fae5' : gpsAccuracy()! <= 30 ? '#fef9c3' : '#fee2e2'"
                        [style.color]="gpsAccuracy()! <= 10 ? '#065f46' : gpsAccuracy()! <= 30 ? '#713f12' : '#991b1b'">
                        <span class="material-symbols-outlined" style="font-size:11px">my_location</span>
                        Precisión ±{{ gpsAccuracy() }}m
                      </span>
                    }
                  </div>
                } @else {
                  <p class="text-slate-500 text-sm">Toca para ingresar tu dirección</p>
                }
              </div>
              <span class="material-symbols-outlined text-slate-400 flex-shrink-0" style="font-size:16px">edit</span>
            </button>
          } @else {
            <div class="flex flex-col bg-white rounded-2xl shadow-lg overflow-hidden" style="border:1px solid #e2e8f0">
              <div class="flex items-center gap-3 px-4 py-3 border-b border-slate-200">
                <span class="material-symbols-outlined text-orange-500" style="font-size:20px">search</span>
                <input #addrInput
                  (input)="onAddressInput($any($event.target).value)"
                  (paste)="handlePaste($any($event), 'address')"
                  (keydown.escape)="closeAddressEdit()"
                  (keydown.enter)="saveManualAddress()"
                  placeholder="Escribe tu dirección exacta de recogida..."
                  autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" inputmode="text"
                  class="flex-1 text-slate-800 text-sm outline-none placeholder-slate-400 bg-transparent"/>
                <div class="flex items-center gap-1 flex-shrink-0">
                  <button (click)="clearAddressQuery()"
                    class="flex items-center justify-center w-8 h-8 rounded-full bg-slate-100 active:bg-slate-200">
                    <span class="material-symbols-outlined text-slate-500" style="font-size:18px">close</span>
                  </button>
                  <button (click)="saveManualAddress()"
                    class="flex items-center justify-center w-9 h-9 rounded-full shadow-md active:scale-95 transition-transform"
                    style="background:#16a34a;box-shadow:0 2px 8px rgba(22,163,74,0.5)">
                    <span class="material-symbols-outlined text-white" style="font-size:22px;font-variation-settings:'wght' 700">check</span>
                  </button>
                </div>
              </div>
              @if (addressSuggestions().length === 0 && !addressNoResults() && recentOrigins().length > 0) {
                <div class="flex flex-col divide-y divide-slate-100 max-h-48 overflow-y-auto">
                  <p class="px-4 pt-2 pb-1 text-slate-400 text-[10px] font-black uppercase tracking-widest">Recientes</p>
                  @for (r of recentOrigins(); track r.name) {
                    <button (click)="selectRecentOrigin(r)"
                      class="flex items-center gap-3 px-4 py-3 text-left hover:bg-orange-50 active:bg-orange-50 transition-colors">
                      <span class="material-symbols-outlined text-orange-300 flex-shrink-0" style="font-size:18px">history</span>
                      <p class="flex-1 text-slate-800 text-sm font-semibold truncate">{{ r.name }}</p>
                    </button>
                  }
                </div>
              }
              @if (addressSuggestions().length > 0) {
                <div class="flex flex-col divide-y divide-slate-100 max-h-48 overflow-y-auto">
                  @for (s of addressSuggestions(); track s.place_id) {
                    <button (click)="selectAddress(s)"
                      class="flex items-center gap-3 px-4 py-3 text-left hover:bg-orange-50 active:bg-orange-50 transition-colors">
                      <span class="material-symbols-outlined text-orange-400 flex-shrink-0" style="font-size:18px">place</span>
                      <div class="flex-1 min-w-0">
                        <p class="text-slate-800 text-sm font-semibold truncate">{{ s.text }}</p>
                        @if (s.place_name) {
                          <p class="text-slate-400 text-xs truncate">{{ s.place_name }}</p>
                        }
                      </div>
                    </button>
                  }
                </div>
              } @else if (addressNoResults()) {
                <p class="text-slate-400 text-xs text-center py-3">Sin resultados. Intenta con otra dirección.</p>
              }
            </div>
          }
          <!-- GPS denied badge -->
          @if (gpsStatus() === 'denied') {
            <div class="mt-1.5 flex justify-end">
              <button (click)="retryGps('ag-map-user')"
                class="flex items-center gap-1 px-3 py-1.5 rounded-xl text-orange-600 text-xs font-bold"
                style="background:#fff7ed;border:1px solid #fed7aa">
                <span class="material-symbols-outlined" style="font-size:13px">my_location</span> Reintentar GPS
              </button>
            </div>
          }
        </div>
      }

      <!-- Mapa con overlays flotantes -->
      <div [class]="passengerMapFullscreen() ? 'fixed z-[9850]' : 'relative rounded-2xl overflow-hidden'"
           [style]="passengerMapFullscreen() ? 'top:0;left:0;right:0;height:100dvh' : 'height:clamp(280px,50dvh,520px);border:1px solid rgba(255,255,255,0.08)'"
           style="overflow:hidden">

        <!-- GPS loading state -->
        @if (gpsStatus() === 'requesting') {
          <div class="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3" style="background:#0d111a">
            <span class="material-symbols-outlined text-orange-400 animate-pulse" style="font-size:38px">my_location</span>
            <p class="text-slate-400 text-sm font-bold">Obteniendo tu ubicación...</p>
            <p class="text-slate-600 text-xs">Acepta el permiso en tu dispositivo</p>
          </div>
        }

        <!-- Mapa -->
        <div id="ag-map-user" style="position:absolute;top:0;left:0;width:100%;height:100%"></div>

        <!-- ══ PASAJERO FULLSCREEN: banners flotantes cuando el viaje está en curso ══ -->
        @if (passengerMapFullscreen() && tripAccepted()) {
          <!-- Banner de etapa (arriba) -->
          <div class="absolute top-0 left-0 right-0 z-30 pointer-events-none"
            style="background:linear-gradient(180deg,rgba(15,20,40,0.97) 0%,rgba(15,20,40,0.9) 80%,transparent 100%);padding:env(safe-area-inset-top,14px) 16px 28px">
            <div class="flex items-center gap-3 pt-3">
              <div class="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0"
                style="background:rgba(249,115,22,0.25);border:2px solid rgba(249,115,22,0.5)">
                <span class="material-symbols-outlined text-orange-300" style="font-size:22px">
                  {{ currentTripStage() === 'on_route' ? 'route' :
                     currentTripStage() === 'arrived_at_destination' ? 'flag' :
                     currentTripStage() === 'picked_up' ? 'navigation' :
                     'directions_car' }}
                </span>
              </div>
              <div class="flex-1 min-w-0">
                <p class="text-white font-black text-sm leading-tight">
                  {{ currentTripStage() === 'on_route' ? '¡Vas en camino a tu destino!' :
                     currentTripStage() === 'arrived_at_destination' ? '¡Llegaste a tu destino!' :
                     currentTripStage() === 'picked_up' ? 'Pasajero recogido — iniciando ruta' :
                     'Conductor en camino...' }}
                </p>
                <p class="text-orange-300 text-xs mt-0.5">{{ tripAccepted()!.ag_drivers?.ag_users?.full_name ?? 'Tu conductor' }}</p>
              </div>
              <!-- Botón minimizar -->
              <button (click)="passengerMapFullscreen.set(false)"
                class="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 pointer-events-auto"
                style="background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.2)">
                <span class="material-symbols-outlined text-white" style="font-size:18px">close_fullscreen</span>
              </button>
            </div>
          </div>

          <!-- Tarjeta de viaje (abajo) -->
          <div class="absolute bottom-0 left-0 right-0 z-30 pointer-events-auto"
            style="background:linear-gradient(0deg,rgba(10,14,30,1) 0%,rgba(10,14,30,0.97) 85%,transparent 100%);padding:14px 16px calc(env(safe-area-inset-bottom,16px) + 10px)">

            <!-- Fila: conductor + costo a pagar -->
            <div class="flex items-center gap-3 mb-2">
              <div class="flex-1 min-w-0">
                <p class="font-black text-[10px] uppercase tracking-widest mb-0.5"
                  [style.color]="currentTripStage() === 'arrived_at_destination' ? '#34d399' : '#fb923c'">
                  {{ currentTripStage() === 'arrived_at_destination' ? '¡Llegaste! Paga al conductor' : currentTripStage() === 'on_route' ? 'En camino a tu destino' : 'Iniciando viaje...' }}
                </p>
                <div class="flex items-center gap-2 flex-wrap">
                  <p class="text-white font-black text-sm truncate">{{ tripAccepted()!.ag_drivers?.ag_users?.full_name ?? 'Tu conductor' }}</p>
                  @if (tripAccepted()!.ag_drivers?.plate ?? tripAccepted()!.ag_drivers?.vehicle_plate) {
                    <span class="px-1.5 py-0.5 rounded-lg text-[10px] font-black"
                      style="background:rgba(249,115,22,0.2);color:#fb923c;border:1px solid rgba(249,115,22,0.3)">
                      {{ tripAccepted()!.ag_drivers?.plate ?? tripAccepted()!.ag_drivers?.vehicle_plate }}
                    </span>
                  }
                  @if (tripAccepted()!.ag_drivers?.vehicle_color) {
                    <span class="text-slate-400 text-xs">{{ tripAccepted()!.ag_drivers?.vehicle_color }}</span>
                  }
                </div>
              </div>
              <!-- Precio destacado -->
              <div class="flex flex-col items-end flex-shrink-0 px-3 py-2 rounded-xl"
                style="background:rgba(52,211,153,0.1);border:1px solid rgba(52,211,153,0.25)">
                <p class="text-emerald-400 font-black leading-none" style="font-size:22px">{{ formatCOP(tripAccepted()!.offered_price) }}</p>
                <p class="text-emerald-600 font-bold" style="font-size:10px;margin-top:2px">A PAGAR</p>
              </div>
            </div>

            <!-- Destino -->
            <div class="flex items-center gap-2 rounded-xl px-3 py-2 mb-2"
              style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.09)">
              <span class="material-symbols-outlined text-orange-400 flex-shrink-0" style="font-size:15px">location_on</span>
              <p class="text-slate-300 text-xs font-semibold truncate">{{ tripDest()?.name ?? 'Destino' }}</p>
            </div>

            <!-- Barra de etapas compacta -->
            <div class="flex items-center gap-1 mb-2">
              @for (s of passengerTripStages; track s.key) {
                <div class="flex-1 h-1 rounded-full transition-colors duration-500"
                  [style.background]="isStagePassed(s.key, currentTripStage()) ? '#f97316' : 'rgba(255,255,255,0.12)'"></div>
              }
            </div>

            <!-- Botones: Chat + Llamar + Finalizar -->
            <div class="flex gap-2">
              <button (click)="openPassengerChat()"
                class="flex-1 py-3 rounded-2xl text-white text-xs font-black flex items-center justify-center gap-1.5 active:scale-[0.98]"
                style="background:linear-gradient(135deg,#2563eb,#3b82f6)">
                <span class="material-symbols-outlined" style="font-size:16px">chat</span>Chat
                @if (chatUnread() > 0) {
                  <span class="w-4 h-4 bg-red-500 text-[10px] font-bold text-white rounded-full flex items-center justify-center">{{ chatUnread() }}</span>
                }
              </button>
              <button (click)="callDriver()" [disabled]="callingDriver()"
                class="flex-1 py-3 rounded-2xl text-white text-xs font-black flex items-center justify-center gap-1.5 active:scale-[0.98] disabled:opacity-50"
                style="background:linear-gradient(135deg,#16a34a,#22c55e)">
                <span class="material-symbols-outlined" style="font-size:16px">{{ callingDriver() ? 'hourglass_empty' : 'call' }}</span>Llamar
              </button>
              <button (click)="finishTrip()"
                class="flex-1 py-3 rounded-2xl text-white text-xs font-black flex items-center justify-center gap-1.5 active:scale-[0.98]"
                style="background:linear-gradient(135deg,#16a34a,#15803d)">
                <span class="material-symbols-outlined" style="font-size:16px">check_circle</span>Finalizar
              </button>
            </div>
          </div>
        }

        <!-- Overlay pin-drop — aparece cuando el usuario toca "Marcar en el mapa" -->
        @if (tripPinDrop()) {
          <div class="absolute inset-0 z-40 flex flex-col items-center justify-center pointer-events-none">
            <!-- Mira central -->
            <div style="position:relative;width:40px;height:40px">
              <div style="position:absolute;inset:0;border:3px solid #f97316;border-radius:50%;animation:ping 1.2s cubic-bezier(0,0,0.2,1) infinite;opacity:0.5"></div>
              <div style="position:absolute;inset:6px;background:#f97316;border-radius:50%;border:2px solid #fff"></div>
            </div>
          </div>
          <!-- Instrucción + botón cancelar -->
          <div class="absolute bottom-4 left-4 right-4 z-40 flex flex-col items-center gap-2">
            <div class="px-4 py-2.5 rounded-2xl flex items-center gap-2 shadow-xl shadow-black/40"
              style="background:rgba(249,115,22,0.95);backdrop-filter:blur(6px)">
              <span class="material-symbols-outlined text-white" style="font-size:18px">touch_app</span>
              <p class="text-white text-sm font-black">Toca en el mapa para marcar el destino</p>
            </div>
            <button (click)="cancelPinDrop()"
              class="px-4 py-2 rounded-xl text-slate-700 text-xs font-bold active:scale-95 transition"
              style="background:rgba(255,255,255,0.9)">
              Cancelar
            </button>
          </div>
        }

        <!-- Alerta "conductor cerca" -->
        @if (driverNearbyAlert()) {
          <div class="absolute top-20 left-3 right-3 z-40 pointer-events-none">
            <div class="flex items-center gap-3 rounded-2xl px-4 py-3 shadow-2xl"
              style="background:linear-gradient(135deg,#f59e0b,#d97706);box-shadow:0 8px 32px rgba(245,158,11,0.5)">
              <span class="material-symbols-outlined text-white animate-bounce" style="font-size:24px;font-variation-settings:'FILL' 1">directions_car</span>
              <div>
                <p class="text-white font-black text-sm">¡Tu conductor está llegando!</p>
                <p class="text-amber-100 text-xs">Está a menos de 500 metros</p>
              </div>
            </div>
          </div>
        }

        <!-- Overlay ruta pasajero — aparece cuando el conductor acepta el viaje -->
        @if (tripAccepted()) {
          <div class="absolute top-3 left-3 right-3 z-30 pointer-events-none">
            <div class="flex items-center gap-3 rounded-2xl px-4 py-3 shadow-2xl shadow-black/60"
              style="background:rgba(10,22,40,0.95);backdrop-filter:blur(10px);border:1.5px solid rgba(16,185,129,0.4)">
              <span class="material-symbols-outlined text-emerald-400 animate-pulse" style="font-size:22px;font-variation-settings:'FILL' 1">directions_car</span>
              <div class="flex-1 min-w-0">
                <p class="text-white font-black text-sm truncate">
                  {{ tripAccepted()!.ag_drivers?.ag_users?.full_name ?? 'Tu conductor' }} en camino
                </p>
                @if (approachRouteInfo()) {
                  <p class="text-emerald-300 text-xs font-bold">
                    {{ approachRouteInfo()!.distKm }} km · {{ approachRouteInfo()!.durationMin }} min para llegar
                  </p>
                } @else {
                  <p class="text-slate-400 text-xs">Calculando ruta...</p>
                }
              </div>
              @if (approachRouteInfo()) {
                <div class="flex flex-col items-center justify-center flex-shrink-0 rounded-xl px-3 py-2"
                  style="background:rgba(16,185,129,0.15);border:1px solid rgba(16,185,129,0.35)">
                  <p class="text-emerald-300 font-black leading-none" style="font-size:22px">{{ approachRouteInfo()!.durationMin }}</p>
                  <p class="text-emerald-400 text-[10px] font-bold">min</p>
                </div>
              }
            </div>
          </div>
        }

        <!-- Panel de viaje (flotante abajo) -->
        @if (gpsStatus() !== 'requesting') {
          <div class="absolute bottom-0 left-0 right-0 z-20 rounded-t-3xl"
            [style.display]="(tripSent() && !tripAccepted()) || passengerMapFullscreen() || arrivedAtPickupTimer() !== null ? 'none' : ''"
            [style.maxHeight]="(tripSent() || tripAccepted()) ? 'min(62%,480px)' : ''"
            [style.overflowY]="(tripSent() || tripAccepted()) ? 'auto' : 'hidden'"
            style="background:#f1f5f9;border-top:1px solid #cbd5e1;overflow-x:hidden">

            <!-- Fila de servicios -->
            <div class="flex items-center gap-1 pt-3 pb-1"
              [style.pointerEvents]="tripIsActive() ? 'none' : 'auto'"
              [style.opacity]="tripIsActive() ? '0.4' : '1'">
              <button (click)="scrollIcons(-120)"
                class="flex-shrink-0 w-7 h-7 rounded-full bg-slate-200 flex items-center justify-center ml-2 active:scale-90 transition-all">
                <span class="material-symbols-outlined text-slate-500" style="font-size:16px">chevron_left</span>
              </button>
            <div id="ag-icons-scroll" class="flex gap-1 flex-1 overflow-x-auto" style="scrollbar-width:none">
              <button (click)="tripService.set('viaje'); setTripVehicle('carro')"
                class="flex flex-col items-center gap-1 px-3 py-2 rounded-2xl flex-shrink-0 transition-all"
                [class]="tripService()==='viaje' ? 'bg-orange-50 border border-orange-200' : 'hover:bg-slate-200'">
                <span class="material-symbols-outlined" style="font-size:26px"
                  [style.color]="tripService()==='viaje' ? '#f97316' : '#94a3b8'">directions_car</span>
                <span class="text-[10px] font-bold" [style.color]="tripService()==='viaje' ? '#f97316' : '#94a3b8'">Viaje</span>
              </button>
              <button (click)="tripService.set('moto'); setTripVehicle('moto')"
                class="flex flex-col items-center gap-1 px-3 py-2 rounded-2xl flex-shrink-0 transition-all"
                [class]="tripService()==='moto' ? 'bg-cyan-50 border border-cyan-200' : 'hover:bg-slate-200'">
                <span class="material-symbols-outlined" style="font-size:26px"
                  [style.color]="tripService()==='moto' ? '#06b6d4' : '#94a3b8'">two_wheeler</span>
                <span class="text-[10px] font-bold" [style.color]="tripService()==='moto' ? '#06b6d4' : '#94a3b8'">Moto</span>
              </button>
              <button (click)="tripService.set('domicilio'); setTripVehicle('moto')"
                class="flex flex-col items-center gap-1 px-3 py-2 rounded-2xl flex-shrink-0 transition-all"
                [class]="tripService()==='domicilio' ? 'bg-emerald-50 border border-emerald-200' : 'hover:bg-slate-200'">
                <span class="material-symbols-outlined" style="font-size:26px"
                  [style.color]="tripService()==='domicilio' ? '#10b981' : '#94a3b8'">delivery_dining</span>
                <span class="text-[10px] font-bold" [style.color]="tripService()==='domicilio' ? '#10b981' : '#94a3b8'">Domicilio</span>
              </button>
              <button (click)="tripService.set('fletes'); setTripVehicle('carro')"
                class="flex flex-col items-center gap-1 px-3 py-2 rounded-2xl flex-shrink-0 transition-all"
                [class]="tripService()==='fletes' ? 'bg-amber-50 border border-amber-200' : 'hover:bg-slate-200'">
                <span class="material-symbols-outlined" style="font-size:26px"
                  [style.color]="tripService()==='fletes' ? '#f59e0b' : '#94a3b8'">local_shipping</span>
                <span class="text-[10px] font-bold" [style.color]="tripService()==='fletes' ? '#f59e0b' : '#94a3b8'">Flete</span>
              </button>
              <button (click)="tripService.set('ciudad'); setTripVehicle('carro')"
                class="flex flex-col items-center gap-1 px-3 py-2 rounded-2xl flex-shrink-0 transition-all"
                [class]="tripService()==='ciudad' ? 'bg-purple-50 border border-purple-200' : 'hover:bg-slate-200'">
                <span class="material-symbols-outlined" style="font-size:26px"
                  [style.color]="tripService()==='ciudad' ? '#a855f7' : '#94a3b8'">commute</span>
                <span class="text-[10px] font-bold" [style.color]="tripService()==='ciudad' ? '#a855f7' : '#94a3b8'">Ciudad a ciudad</span>
              </button>
            </div>
              <button (click)="scrollIcons(120)"
                class="flex-shrink-0 w-7 h-7 rounded-full bg-slate-200 flex items-center justify-center mr-2 active:scale-90 transition-all">
                <span class="material-symbols-outlined text-slate-500" style="font-size:16px">chevron_right</span>
              </button>
            </div>

            <!-- Divider -->
            <div class="mx-4 h-px bg-slate-300 my-1"></div>

            <!-- Contenido del panel según estado -->
            @if (!tripDest()) {
              @if (!tripOpen()) {
                <!-- Punto de origen — clicable para modificar -->
                @if (currentAddress()) {
                  @if (!originEditOpen()) {
                    <button (click)="openOriginEdit()"
                      class="mx-4 mt-2 mb-1 w-[calc(100%-2rem)] flex items-center gap-2.5 px-3 py-2 rounded-xl text-left active:scale-[0.98] transition-all"
                      style="background:#fff7ed;border:1px solid #fed7aa">
                      <div class="w-2.5 h-2.5 rounded-full bg-orange-500 flex-shrink-0"></div>
                      <div class="flex-1 min-w-0">
                        <p class="text-orange-400 font-bold uppercase tracking-wider" style="font-size:9px">Saldrás desde aquí · Toca para cambiar</p>
                        <p class="text-slate-700 text-xs font-semibold truncate">{{ currentAddress() }}</p>
                      </div>
                      <span class="material-symbols-outlined text-orange-300 flex-shrink-0" style="font-size:16px">edit</span>
                    </button>
                  } @else {
                    <!-- Búsqueda inline de origen -->
                    <div class="mx-4 mt-2 mb-1 rounded-xl overflow-hidden"
                      style="background:#fff;border:1.5px solid #fb923c;box-shadow:0 4px 16px rgba(249,115,22,0.15)">
                      <div class="flex items-center gap-2.5 px-3 py-2.5" style="border-bottom:1px solid #f1f5f9">
                        <div class="w-2.5 h-2.5 rounded-full bg-orange-500 flex-shrink-0"></div>
                        <input id="origin-edit-input"
                          (input)="onAddressInput($any($event.target).value)"
                          (paste)="handlePaste($any($event), 'address')"
                          (keydown.escape)="originEditOpen.set(false)"
                          (keydown.enter)="saveManualAddress()"
                          placeholder="Escribe o pega tu punto de salida..."
                          autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" inputmode="text"
                          class="flex-1 text-slate-800 text-sm outline-none placeholder-slate-400 bg-transparent"/>
                        <div class="flex items-center gap-1 flex-shrink-0">
                          <button (click)="originEditOpen.set(false)">
                            <span class="material-symbols-outlined text-slate-400" style="font-size:20px">close</span>
                          </button>
                          <button (click)="saveManualAddress()"
                            class="flex items-center justify-center w-8 h-8 rounded-full shadow-md active:scale-95 transition-transform"
                            style="background:#16a34a;box-shadow:0 2px 8px rgba(22,163,74,0.4)">
                            <span class="material-symbols-outlined text-white" style="font-size:19px;font-variation-settings:'wght' 700">check</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  }
                }
                <button (click)="openTripSearch()"
                  class="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-200 transition-colors text-left">
                  <div class="w-10 h-10 rounded-xl bg-orange-50 border border-orange-200 flex items-center justify-center flex-shrink-0">
                    <span class="material-symbols-outlined text-orange-500" style="font-size:22px">search</span>
                  </div>
                  <div class="flex-1">
                    <p class="text-slate-800 font-black text-sm">¿A dónde vas y por cuánto?</p>
                    <p class="text-slate-400 text-xs mt-0.5">Toca para buscar tu destino</p>
                  </div>
                  <span class="material-symbols-outlined text-slate-300" style="font-size:20px">chevron_right</span>
                </button>
              } @else {
                <div class="flex flex-col">
                  <div class="flex items-center gap-3 px-4 py-3 border-b border-slate-200">
                    <span class="material-symbols-outlined text-orange-500 flex-shrink-0" style="font-size:20px">search</span>
                    <input #tripInput
                      (input)="onTripQueryInput($any($event.target).value)"
                      (paste)="handlePaste($any($event), 'trip')"
                      (keydown.escape)="closeTripSearch()"
                      placeholder="Busca o pega tu destino..."
                      autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" inputmode="text"
                      class="flex-1 bg-transparent text-slate-800 text-sm outline-none placeholder-slate-400"/>
                    <button (click)="pasteClipboard('trip')" title="Pegar dirección"
                      class="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center active:scale-90 transition"
                      style="background:#fff7ed;border:1px solid #fed7aa">
                      <span class="material-symbols-outlined text-orange-500" style="font-size:17px">content_paste</span>
                    </button>
                    <button (click)="closeTripSearch()">
                      <span class="material-symbols-outlined text-slate-400" style="font-size:20px">close</span>
                    </button>
                  </div>
                  <!-- Destinos recientes (cuando no hay query activo) -->
                  @if (tripSuggestions().length === 0 && !tripLoading() && !tripNoResults() && recentDests().length > 0) {
                    <div class="flex flex-col">
                      <p class="px-4 pt-3 pb-1 text-slate-400 text-[10px] font-black uppercase tracking-widest">Recientes</p>
                      @for (r of recentDests(); track r.name) {
                        <button (mousedown)="$event.preventDefault(); selectRecentDest(r)"
                          class="flex items-center gap-3 px-4 py-3 border-b border-slate-100 last:border-0 hover:bg-slate-50 active:bg-slate-100 text-left transition-colors">
                          <span class="material-symbols-outlined text-orange-400 flex-shrink-0" style="font-size:20px">history</span>
                          <p class="flex-1 text-sm font-semibold text-slate-700 truncate">{{ r.name }}</p>
                        </button>
                      }
                    </div>
                  }
                  <!-- Sugerencias Google Places -->
                  @if (tripSuggestions().length > 0) {
                    <div class="flex flex-col">
                      @for (s of tripSuggestions(); track s.id) {
                        <button (mousedown)="$event.preventDefault(); selectTripDest(s)"
                          class="flex items-center gap-3 px-4 py-3 border-b border-slate-100 last:border-0 hover:bg-slate-50 active:bg-slate-100 text-left transition-colors">
                          <span class="material-symbols-outlined text-slate-400 flex-shrink-0" style="font-size:20px">location_on</span>
                          <div class="flex-1 min-w-0">
                            <p class="text-sm font-semibold truncate" style="color:#1976D2">{{ s.text }}</p>
                            <p class="text-xs text-slate-500 truncate">{{ s.place_name }}</p>
                          </div>
                          @if (s.distanceKm != null) {
                            <span class="text-slate-500 text-sm flex-shrink-0">{{ s.distanceKm }} km</span>
                          }
                        </button>
                      }
                    </div>
                  } @else if (tripLoading() || tripNoResults()) {
                    @if (tripLoading()) {
                      <div class="flex justify-center py-4">
                        <div class="w-5 h-5 border-2 border-orange-500 border-t-transparent rounded-full animate-spin"></div>
                      </div>
                    } @else if (tripNoResults()) {
                      <p class="text-center text-slate-400 text-sm py-4">Sin resultados para "{{ tripQuery() }}"</p>
                    }
                  }
                </div>
              }

            } @else if (tripAccepted()) {
              <!-- ══ Viaje Aceptado ══ -->
              <div class="px-4 pt-4 pb-3 flex flex-col gap-3">
                <!-- Banner "Conductor llegó — sal ya" con countdown -->
                @if (arrivedAtPickupTimer() !== null) {
                  <div class="rounded-2xl flex items-center gap-3 px-4 py-3"
                    style="background:linear-gradient(135deg,#ecfdf5,#d1fae5);border:2px solid #6ee7b7;box-shadow:0 4px 16px rgba(16,185,129,0.2)">
                    <span class="material-symbols-outlined text-emerald-600" style="font-size:26px;font-variation-settings:'FILL' 1">directions_car</span>
                    <div class="flex-1">
                      <p class="text-emerald-800 font-black text-sm">¡Tu conductor llegó!</p>
                      <p class="text-emerald-700 text-xs">Sal a recibirlo — está esperando</p>
                    </div>
                    <div class="flex flex-col items-center">
                      <p class="text-emerald-700 font-black text-lg leading-none">
                        {{ padTime(arrivedAtPickupTimer()!) }}
                      </p>
                      <p class="text-emerald-600 text-[10px]">espera</p>
                    </div>
                  </div>
                }

                <!-- Datos del conductor -->
                <div class="rounded-2xl flex flex-col gap-3 px-4 py-4"
                  style="background:#fff;border:1px solid #e2e8f0">
                  <!-- Nombre + precio -->
                  <div class="flex items-center gap-3">
                    @if (tripAccepted()!.ag_drivers?.ag_users?.selfie_url) {
                      <img [src]="tripAccepted()!.ag_drivers!.ag_users!.selfie_url"
                        class="w-12 h-12 rounded-2xl object-cover flex-shrink-0"
                        style="border:2px solid #e2e8f0" />
                    } @else {
                      <div class="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0"
                        style="background:linear-gradient(135deg,#f97316,#fb923c)">
                        <span class="material-symbols-outlined text-white" style="font-size:24px">person</span>
                      </div>
                    }
                    <div class="flex-1 min-w-0">
                      <p class="text-slate-800 font-black text-sm truncate">
                        {{ tripAccepted()!.ag_drivers?.ag_users?.full_name ?? 'Tu conductor' }}
                      </p>
                      <p class="text-slate-500 text-xs">Tu conductor</p>
                    </div>
                    <p class="font-black text-lg text-emerald-600 flex-shrink-0">{{ formatCOP(tripAccepted()!.offered_price) }}</p>
                  </div>
                  <!-- Datos del vehículo -->
                  <div class="grid grid-cols-2 gap-2 pt-2" style="border-top:1px solid #f1f5f9">
                    <div class="flex flex-col gap-0.5 rounded-xl px-3 py-2" style="background:#f8fafc;border:1px solid #e2e8f0">
                      <p class="text-slate-400 text-[10px] uppercase font-bold tracking-wider">Placa</p>
                      <p class="text-slate-800 font-black text-sm">{{ tripAccepted()!.ag_drivers?.plate ?? tripAccepted()!.ag_drivers?.vehicle_plate ?? '—' }}</p>
                    </div>
                    <div class="flex flex-col gap-0.5 rounded-xl px-3 py-2" style="background:#f8fafc;border:1px solid #e2e8f0">
                      <p class="text-slate-400 text-[10px] uppercase font-bold tracking-wider">Color</p>
                      <p class="text-slate-800 font-black text-sm">{{ tripAccepted()!.ag_drivers?.vehicle_color ?? '—' }}</p>
                    </div>
                    <div class="flex flex-col gap-0.5 rounded-xl px-3 py-2" style="background:#f8fafc;border:1px solid #e2e8f0">
                      <p class="text-slate-400 text-[10px] uppercase font-bold tracking-wider">Marca</p>
                      <p class="text-slate-800 font-bold text-sm truncate">{{ tripAccepted()!.ag_drivers?.vehicle_brand ?? '—' }}</p>
                    </div>
                    <div class="flex flex-col gap-0.5 rounded-xl px-3 py-2" style="background:#f8fafc;border:1px solid #e2e8f0">
                      <p class="text-slate-400 text-[10px] uppercase font-bold tracking-wider">Tipo</p>
                      <p class="text-slate-800 font-bold text-sm">{{ tripAccepted()!.ag_drivers?.vehicle_type === 'moto' ? 'Moto' : tripAccepted()!.ag_drivers?.vehicle_type === 'camion' ? 'Camión' : 'Carro' }}</p>
                    </div>
                  </div>
                </div>
                <!-- Destino + pago -->
                <div class="rounded-xl px-3 py-3 flex items-center gap-3"
                  style="background:#f8fafc;border:1px solid #e2e8f0">
                  <span class="material-symbols-outlined text-slate-400 flex-shrink-0" style="font-size:18px">place</span>
                  <div class="flex-1 min-w-0">
                    <p class="text-slate-400 text-[10px] uppercase font-bold">Destino</p>
                    <p class="text-slate-800 text-sm font-semibold truncate">{{ tripDest()?.name }}</p>
                  </div>
                  <div class="flex-shrink-0 flex items-center gap-1.5 rounded-lg px-2.5 py-1.5"
                    [style.background]="paymentMethodMap[tripPayment()].bgSel"
                    [style.border]="'1px solid ' + paymentMethodMap[tripPayment()].color">
                    <span class="material-symbols-outlined" style="font-size:16px"
                      [style.color]="paymentMethodMap[tripPayment()].color">{{ paymentMethodMap[tripPayment()].icon }}</span>
                    <p class="text-xs font-black"
                      [style.color]="paymentMethodMap[tripPayment()].color">{{ paymentMethodMap[tripPayment()].label }}</p>
                  </div>
                </div>
                <!-- Aviso de pago digital -->
                @if (tripPayment() !== 'efectivo') {
                  <div class="rounded-xl px-3 py-2.5 flex items-start gap-2"
                    style="background:#fefce8;border:1px solid #fde68a">
                    <span class="material-symbols-outlined text-amber-600 flex-shrink-0 mt-0.5" style="font-size:16px">info</span>
                    <div>
                      <p class="text-amber-800 text-xs font-bold">Paga por {{ paymentMethodMap[tripPayment()].label }}</p>
                      <p class="text-amber-700 text-[10px]">Transfiere {{ formatCOP(tripAccepted()!.offered_price) }} al conductor. Usa el chat para coordinar los datos de pago.</p>
                    </div>
                  </div>
                }

                <!-- Barra de estados del viaje -->
                <div class="rounded-2xl p-3" style="background:#fff;border:1px solid #e2e8f0">
                  <p class="text-slate-500 text-[10px] uppercase font-bold tracking-wider mb-2">{{ stageLabel(currentTripStage()) }}</p>
                  <div class="flex items-center gap-1">
                    @for (s of passengerTripStages; track s.key; let idx = $index) {
                      <div class="flex-1 h-1.5 rounded-full"
                        [style.background]="isStagePassed(s.key, currentTripStage()) ? '#10b981' : '#e2e8f0'"></div>
                      @if (idx < passengerTripStages.length - 1) {
                        <div class="w-0.5"></div>
                      }
                    }
                  </div>
                  <div class="flex items-center justify-between mt-2 gap-1">
                    @for (s of passengerTripStages; track s.key) {
                      <div class="flex flex-col items-center gap-0.5 flex-1">
                        <span class="material-symbols-outlined"
                          style="font-size:14px"
                          [style.color]="isStagePassed(s.key, currentTripStage()) ? '#10b981' : '#cbd5e1'">
                          {{ s.icon }}
                        </span>
                        <p class="text-[9px] text-center leading-tight"
                          [style.color]="isStagePassed(s.key, currentTripStage()) ? '#065f46' : '#94a3b8'"
                          [class.font-bold]="currentTripStage() === s.key">{{ s.label }}</p>
                      </div>
                    }
                  </div>
                </div>

                <!-- Share trip -->
                <button (click)="sharePassengerTrip()" [disabled]="creatingShare()"
                  class="w-full py-2 rounded-xl text-white text-xs font-bold flex items-center justify-center gap-2 disabled:opacity-50"
                  style="background:linear-gradient(135deg,#8b5cf6,#7c3aed)">
                  <span class="material-symbols-outlined" style="font-size:15px">share_location</span>
                  @if (creatingShare()) { Generando... }
                  @else if (tripShareLink()) { Link copiado — toca para compartir de nuevo }
                  @else { Compartir viaje con familia }
                </button>

                <!-- Chat + Llamar + Finalizar / Cancelar -->
                <div class="flex flex-col gap-2">
                  <!-- Fila 1: Chat y Llamar -->
                  <div class="grid grid-cols-2 gap-2">
                    <button (click)="openPassengerChat()"
                      class="py-3 rounded-xl text-white text-sm font-black flex items-center justify-center gap-2 active:scale-[0.98] transition-all"
                      style="background:linear-gradient(135deg,#2563eb,#3b82f6)">
                      <span class="material-symbols-outlined" style="font-size:18px">chat</span>
                      Chat
                      @if (chatUnread() > 0) {
                        <span class="min-w-[18px] h-[18px] px-1 bg-red-500 text-[10px] font-bold text-white rounded-full flex items-center justify-center">{{ chatUnread() }}</span>
                      }
                    </button>
                    <button (click)="callDriver()" [disabled]="callingDriver()"
                      class="py-3 rounded-xl text-white text-sm font-black flex items-center justify-center gap-2 active:scale-[0.98] transition-all disabled:opacity-50"
                      style="background:linear-gradient(135deg,#16a34a,#22c55e)">
                      <span class="material-symbols-outlined" style="font-size:18px">{{ callingDriver() ? 'hourglass_empty' : 'call' }}</span>
                      {{ callingDriver() ? 'Llamando...' : 'Llamar' }}
                    </button>
                  </div>
                  <!-- Fila 2: Finalizar viaje -->
                  <button (click)="finishTrip()"
                    class="w-full py-3.5 rounded-xl text-white text-sm font-black flex items-center justify-center gap-2 active:scale-[0.98] transition-all"
                    style="background:linear-gradient(135deg,#16a34a,#15803d);box-shadow:0 4px 12px rgba(22,163,74,0.3)">
                    <span class="material-symbols-outlined" style="font-size:18px">check_circle</span>
                    Finalizar viaje
                  </button>
                  <!-- Fila 3: Cancelar -->
                  <button (click)="openCancelWithReason('passenger')"
                    class="w-full py-2.5 rounded-xl text-slate-500 text-sm font-bold flex items-center justify-center gap-1 active:scale-[0.98] transition-all"
                    style="background:#f1f5f9;border:1px solid #e2e8f0">
                    <span class="material-symbols-outlined" style="font-size:15px">cancel</span>
                    Cancelar viaje
                  </button>
                </div>
              </div>

            } @else if (!tripSent()) {
              <!-- ── Tarjeta de ruta: origen → destino ── -->
              <div class="mx-4 mt-3 mb-1 rounded-2xl overflow-hidden"
                style="background:#fff;border:1px solid #e2e8f0;box-shadow:0 2px 8px rgba(0,0,0,0.06)">

                <!-- Fila origen — clicable para cambiar -->
                @if (!originEditOpen()) {
                  <button (click)="openOriginEdit()"
                    class="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-orange-50 active:bg-orange-50 transition-colors"
                    style="border-bottom:1px solid #f1f5f9">
                    <div class="flex flex-col items-center gap-0 flex-shrink-0" style="width:20px">
                      <div class="w-3 h-3 rounded-full border-2 border-orange-400 bg-orange-100"></div>
                      <div class="w-px bg-slate-200" style="height:14px;margin:1px 0"></div>
                    </div>
                    <div class="flex-1 min-w-0">
                      <p class="font-bold uppercase tracking-wider text-orange-400" style="font-size:9px">Saldrás desde aquí · Toca para cambiar</p>
                      <p class="text-slate-700 text-xs font-semibold truncate">{{ currentAddress() || 'Tu ubicación actual' }}</p>
                    </div>
                    <span class="material-symbols-outlined text-orange-300 flex-shrink-0" style="font-size:15px">edit</span>
                  </button>
                } @else {
                  <!-- Búsqueda inline dentro de la tarjeta -->
                  <div style="border-bottom:1px solid #fed7aa;background:#fff7ed">
                    <div class="flex items-center gap-2.5 px-3 py-2.5">
                      <div class="w-3 h-3 rounded-full border-2 border-orange-500 bg-orange-100 flex-shrink-0"></div>
                      <input id="origin-edit-input"
                        (input)="onAddressInput($any($event.target).value)"
                        (keydown.escape)="originEditOpen.set(false)"
                        (keydown.enter)="saveManualAddress()"
                        placeholder="Escribe tu punto de salida..."
                        autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" inputmode="text"
                        class="flex-1 text-slate-800 text-xs outline-none placeholder-slate-500 bg-transparent"/>
                      <div class="flex items-center gap-1 flex-shrink-0">
                        <button (click)="originEditOpen.set(false)">
                          <span class="material-symbols-outlined text-slate-400" style="font-size:17px">close</span>
                        </button>
                        <button (click)="saveManualAddress()"
                          class="flex items-center justify-center w-7 h-7 rounded-full shadow-md active:scale-95 transition-transform"
                          style="background:#16a34a;box-shadow:0 2px 8px rgba(22,163,74,0.4)">
                          <span class="material-symbols-outlined text-white" style="font-size:17px;font-variation-settings:'wght' 700">check</span>
                        </button>
                      </div>
                    </div>
                  </div>
                }

                <!-- Fila destino -->
                <div class="flex items-center gap-3 px-3 py-2.5">
                  <div class="flex flex-col items-center flex-shrink-0" style="width:20px">
                    <div class="w-3 h-3 rounded-full border-2 border-slate-700 bg-slate-800"></div>
                  </div>
                  <div class="flex-1 min-w-0">
                    <p class="font-bold uppercase tracking-wider text-slate-400" style="font-size:9px">Tu destino · {{ tripDistKm() }} km</p>
                    <p class="text-slate-800 text-sm font-black truncate">{{ tripDest()!.name }}</p>
                  </div>
                  <button (click)="cancelTrip()"
                    class="flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center active:scale-90 transition-all"
                    style="background:#f1f5f9;border:1px solid #e2e8f0">
                    <span class="material-symbols-outlined text-slate-400" style="font-size:16px">close</span>
                  </button>
                </div>
              </div>

              <!-- ── Precio propuesto ─────────────────────────────── -->
              <div class="px-4 py-3 border-b border-slate-200">
                <p class="text-slate-500 text-[10px] uppercase font-bold tracking-wider mb-2.5">Tu precio propuesto</p>

                <!-- Monto + botones ±500 -->
                <div class="flex items-center gap-3 mb-3">
                  <button (click)="adjustTripPrice(-500)"
                    class="w-12 h-12 rounded-2xl border text-slate-700 font-black text-2xl flex items-center justify-center active:scale-95 transition-all flex-shrink-0"
                    style="background:#f1f5f9;border-color:#e2e8f0">−</button>
                  <div class="text-center flex-1">
                    <p class="text-slate-800 font-black leading-none" style="font-size:30px">{{ formatCOP(tripPrice()) }}</p>
                    @if (surgeMultiplier() > 1) {
                      <p class="text-orange-600 text-[10px] font-black mt-1">⚡ Alta demanda ×{{ surgeMultiplier() }}</p>
                    }
                    <button (click)="setTripPricePreset(0)"
                      class="mt-1.5 px-3 py-0.5 rounded-full text-[10px] font-black active:scale-95 transition-all"
                      style="background:#fff7ed;border:1px solid #fed7aa;color:#ea580c">Sugerido</button>
                  </div>
                  <button (click)="adjustTripPrice(500)"
                    class="w-12 h-12 rounded-2xl text-white font-black text-2xl flex items-center justify-center active:scale-95 transition-all flex-shrink-0"
                    style="background:#f97316">+</button>
                </div>

                <!-- Slider -->
                <input type="range"
                  [min]="2000"
                  [max]="tripSliderMax()"
                  step="500"
                  [value]="tripPrice()"
                  (input)="tripPrice.set(+$any($event.target).value)"
                  class="w-full mb-2 cursor-pointer"
                  style="accent-color:#f97316" />

                <!-- Hint -->
                <p class="text-slate-400 text-[10px] text-center">💡 Precio más alto = conductores más rápido</p>
              </div>

              <!-- Cupón -->
              <div class="px-4 pt-2 pb-1 border-b border-slate-200">
                <p class="text-slate-500 text-[10px] uppercase font-bold tracking-wider mb-2">Cupón (opcional)</p>
                @if (appliedCoupon(); as ac) {
                  <div class="flex items-center gap-2 p-2 bg-green-50 border border-green-200 rounded-lg">
                    <span class="material-symbols-outlined text-green-600" style="font-size:16px">local_activity</span>
                    <div class="flex-1 min-w-0">
                      <p class="text-xs font-black text-green-800 truncate">{{ ac.title }}</p>
                      <p class="text-[10px] text-green-600">−{{ formatCOP(ac.discount) }}</p>
                    </div>
                    <button (click)="removeCoupon()" class="w-6 h-6 rounded-md bg-red-100 flex items-center justify-center">
                      <span class="material-symbols-outlined text-red-600" style="font-size:14px">close</span>
                    </button>
                  </div>
                } @else {
                  <div class="flex gap-2">
                    <input [(ngModel)]="couponInput" placeholder="Código"
                      class="flex-1 px-3 py-2 rounded-lg text-sm text-slate-800 outline-none uppercase"
                      style="background:#f8fafc;border:1px solid #e2e8f0" />
                    <button (click)="applyCouponCode()" [disabled]="validatingCoupon()"
                      class="px-3 py-2 rounded-lg text-xs font-black uppercase disabled:opacity-50"
                      style="background:#ec4899;color:#fff">
                      {{ validatingCoupon() ? '...' : 'Aplicar' }}
                    </button>
                  </div>
                  @if (couponError()) { <p class="text-[10px] text-red-500 mt-1">{{ couponError() }}</p> }
                }
              </div>

              <!-- Categoría de viaje -->
              <div class="px-4 pt-2 pb-1">
                <div class="flex items-center justify-between mb-2">
                  <p class="text-slate-500 text-[10px] uppercase font-bold tracking-wider">Categoría</p>
                  @if (tripIsActive()) {
                    <span class="flex items-center gap-1 text-slate-400 text-[10px] font-semibold">
                      <span class="material-symbols-outlined" style="font-size:13px">lock</span>Bloqueado
                    </span>
                  }
                </div>
                <div class="flex gap-1.5 overflow-x-auto pb-1"
                  [style.pointerEvents]="tripIsActive() ? 'none' : 'auto'"
                  [style.opacity]="tripIsActive() ? '0.45' : '1'">
                  @for (cat of tripCategories; track cat.key) {
                    <button (click)="selectTripCategory(cat.key)"
                      class="flex-shrink-0 flex flex-col items-center gap-1 px-3 py-2 rounded-xl border transition-all active:scale-95"
                      [style.background]="selectedCategory() === cat.key ? cat.color + '22' : '#f8fafc'"
                      [style.borderColor]="selectedCategory() === cat.key ? cat.color : '#e2e8f0'">
                      <span class="material-symbols-outlined" style="font-size:20px"
                        [style.color]="selectedCategory() === cat.key ? cat.color : '#94a3b8'">{{ cat.icon }}</span>
                      <span class="text-[10px] font-black leading-tight"
                        [style.color]="selectedCategory() === cat.key ? cat.color : '#94a3b8'">{{ cat.label }}</span>
                      @if (cat.mult > 1) {
                        <span class="text-[9px] font-bold"
                          [style.color]="selectedCategory() === cat.key ? cat.color : '#94a3b8'">x{{ cat.mult }}</span>
                      }
                    </button>
                  }
                </div>
              </div>

              <!-- Accesibilidad -->
              <div class="px-4 pt-1 pb-1">
                <div class="flex gap-1.5 flex-wrap"
                  [style.pointerEvents]="tripIsActive() ? 'none' : 'auto'"
                  [style.opacity]="tripIsActive() ? '0.45' : '1'">
                  <button (click)="toggleAccessibility('pets')"
                    class="px-2.5 py-1 rounded-full text-[10px] font-bold border transition-all"
                    [style.background]="tripAccessibility().pets ? '#dcfce7' : '#f8fafc'"
                    [style.color]="tripAccessibility().pets ? '#15803d' : '#64748b'"
                    [style.borderColor]="tripAccessibility().pets ? '#86efac' : '#e2e8f0'">
                    🐾 Mascota
                  </button>
                  <button (click)="toggleAccessibility('luggage')"
                    class="px-2.5 py-1 rounded-full text-[10px] font-bold border transition-all"
                    [style.background]="tripAccessibility().luggage ? '#dcfce7' : '#f8fafc'"
                    [style.color]="tripAccessibility().luggage ? '#15803d' : '#64748b'"
                    [style.borderColor]="tripAccessibility().luggage ? '#86efac' : '#e2e8f0'">
                    🧳 Equipaje
                  </button>
                  <button (click)="toggleAccessibility('child_seat')"
                    class="px-2.5 py-1 rounded-full text-[10px] font-bold border transition-all"
                    [style.background]="tripAccessibility().child_seat ? '#dcfce7' : '#f8fafc'"
                    [style.color]="tripAccessibility().child_seat ? '#15803d' : '#64748b'"
                    [style.borderColor]="tripAccessibility().child_seat ? '#86efac' : '#e2e8f0'">
                    👶 Silla niño
                  </button>
                  <button (click)="toggleAccessibility('wheelchair')"
                    class="px-2.5 py-1 rounded-full text-[10px] font-bold border transition-all"
                    [style.background]="tripAccessibility().wheelchair ? '#dcfce7' : '#f8fafc'"
                    [style.color]="tripAccessibility().wheelchair ? '#15803d' : '#64748b'"
                    [style.borderColor]="tripAccessibility().wheelchair ? '#86efac' : '#e2e8f0'">
                    ♿ Silla ruedas
                  </button>
                </div>
              </div>

              <!-- Notas + viaje para otra persona -->
              <div class="px-4 pt-2 pb-1">
                <button (click)="forOtherEnabled.set(!forOtherEnabled())"
                  class="w-full text-left text-[11px] font-bold py-1 flex items-center gap-1"
                  [style.color]="forOtherEnabled() ? '#f97316' : '#64748b'">
                  <span class="material-symbols-outlined" style="font-size:14px">{{ forOtherEnabled() ? 'check_box' : 'check_box_outline_blank' }}</span>
                  Pedir para otra persona
                </button>
                @if (forOtherEnabled()) {
                  <div class="grid grid-cols-2 gap-1.5 mt-1">
                    <input type="text" [(ngModel)]="forOtherName" placeholder="Nombre"
                      class="px-2 py-1.5 rounded-lg text-xs" style="background:#f1f5f9;border:1px solid #e2e8f0;color:#1e293b" />
                    <input type="tel" [(ngModel)]="forOtherPhone" placeholder="Teléfono"
                      class="px-2 py-1.5 rounded-lg text-xs" style="background:#f1f5f9;border:1px solid #e2e8f0;color:#1e293b" />
                  </div>
                }
                <input type="text" [(ngModel)]="passengerTripNote" placeholder="Nota al conductor (opcional)"
                  maxlength="80"
                  class="w-full mt-1 px-2 py-1.5 rounded-lg text-xs"
                  style="background:#f1f5f9;border:1px solid #e2e8f0;color:#1e293b" />
              </div>

              <!-- Método de pago -->
              <div class="px-4 pt-2 pb-1">
                <p class="text-slate-500 text-[10px] uppercase font-bold tracking-wider mb-2">Método de pago</p>
                <div class="grid grid-cols-3 gap-1.5"
                  [style.pointerEvents]="tripIsActive() ? 'none' : 'auto'"
                  [style.opacity]="tripIsActive() ? '0.45' : '1'">
                  @for (pm of paymentMethods; track pm.value) {
                    <button (click)="tripPayment.set(pm.value)"
                      class="flex flex-col items-center gap-1 py-2 rounded-xl border transition-all active:scale-95"
                      [style.background]="tripPayment() === pm.value ? pm.bgSel : '#f8fafc'"
                      [style.borderColor]="tripPayment() === pm.value ? pm.color : '#e2e8f0'">
                      <span class="material-symbols-outlined" style="font-size:18px"
                        [style.color]="tripPayment() === pm.value ? pm.color : '#94a3b8'">{{ pm.icon }}</span>
                      <span class="text-[10px] font-bold leading-tight text-center"
                        [style.color]="tripPayment() === pm.value ? pm.color : '#94a3b8'">{{ pm.label }}</span>
                    </button>
                  }
                </div>
              </div>

              @if (tripGpsError()) {
                <div class="mx-4 mb-2 flex items-center gap-2 rounded-xl px-3 py-2"
                  style="background:#fff7ed;border:1px solid #fed7aa">
                  <span class="material-symbols-outlined text-orange-500" style="font-size:16px">my_location</span>
                  <p class="text-orange-700 text-xs font-semibold">
                    {{ gpsStatus() === 'denied' ? 'Activa el GPS para solicitar un viaje.' : 'Obteniendo tu ubicación... espera un momento o mueve el pin a tu posición.' }}
                  </p>
                </div>
              }
              @if (tripRequestError()) {
                <div class="mx-4 mb-2 flex items-center gap-2 rounded-xl px-3 py-2"
                  style="background:#fef2f2;border:1px solid #fca5a5">
                  <span class="material-symbols-outlined text-red-500" style="font-size:16px">error</span>
                  <p class="text-red-700 text-xs font-semibold">{{ tripRequestError() }}</p>
                </div>
              }
              <div class="px-4 py-3">
                <button (click)="findOffers()" [disabled]="tripSending()"
                  class="w-full py-3.5 rounded-xl font-black text-sm uppercase tracking-wider flex items-center justify-center gap-2 transition-all disabled:opacity-60 active:scale-[0.98] bg-orange-500 text-white">
                  @if (tripSending()) {
                    <span class="material-symbols-outlined animate-spin" style="font-size:18px">autorenew</span> Buscando...
                  } @else {
                    <span class="material-symbols-outlined" style="font-size:18px">local_taxi</span> Encontrar ofertas
                  }
                </button>
              </div>

            } @else {
              <!-- ══ Pantalla de espera estilo inDrive ══ -->

              <!-- Fila: conductores viendo + avatares -->
              <div class="flex items-center justify-between px-4 pt-3 pb-2.5" style="border-bottom:1px solid #e2e8f0">
                <p class="text-slate-800 text-sm font-semibold flex-1 leading-snug">
                  @if (receivedOffers().length > 0) {
                    <span class="text-emerald-600 font-black">{{ receivedOffers().length }}</span>
                    {{ receivedOffers().length === 1 ? ' oferta recibida' : ' ofertas recibidas' }}
                  } @else if (waitingDriverCount() === 0) {
                    Buscando conductores disponibles...
                  } @else {
                    <span class="text-orange-500 font-black">{{ waitingDriverCount() }}</span>
                    {{ waitingDriverCount() === 1 ? ' conductor está viendo' : ' conductores están viendo' }} tu solicitud
                  }
                </p>
                <div class="flex items-center flex-shrink-0 ml-2">
                  @for (color of waitingDriverColors(); track $index) {
                    <div class="w-8 h-8 rounded-full border-2 border-white flex items-center justify-center flex-shrink-0"
                      [style.background]="color" style="margin-left:-10px">
                      <span class="material-symbols-outlined text-white" style="font-size:15px">person</span>
                    </div>
                  }
                </div>
              </div>

              <!-- ══ Tarjetas de ofertas reales ══ -->
              @if (receivedOffers().length > 0) {
                <div style="position:fixed;left:12px;right:12px;bottom:80px;z-index:7600;display:flex;flex-direction:column;gap:10px;max-height:70dvh;overflow-y:auto;padding-bottom:4px">
                  @for (offer of receivedOffers(); track offer.id) {
                    <div class="rounded-3xl overflow-hidden"
                      style="background:#fff;border:2px solid #16a34a;box-shadow:0 12px 40px rgba(22,163,74,0.22),0 4px 16px rgba(0,0,0,0.12)">

                      <!-- Cabecera verde con precio -->
                      <div class="flex items-center justify-between px-4 py-3"
                        style="background:linear-gradient(135deg,#16a34a,#059669)">
                        <div class="flex items-center gap-1.5">
                          <span class="material-symbols-outlined text-white" style="font-size:18px;font-variation-settings:'FILL' 1">local_offer</span>
                          <span class="text-white text-xs font-black uppercase tracking-wider">Nueva oferta</span>
                        </div>
                        <div class="text-right">
                          <p class="text-white font-black" style="font-size:22px;line-height:1">{{ formatCOP(offer.offered_price) }}</p>
                          @if (offer.offered_price < tripPrice()) {
                            <p class="text-emerald-200 text-[10px] font-bold">↓ Más barato que tu precio</p>
                          } @else if (offer.offered_price > tripPrice()) {
                            <p class="text-yellow-200 text-[10px] font-bold">↑ Más caro que tu precio</p>
                          } @else {
                            <p class="text-emerald-100 text-[10px]">Igual a tu precio</p>
                          }
                        </div>
                      </div>

                      <!-- Info conductor -->
                      <div class="flex items-center gap-3 px-4 py-3" style="border-bottom:1px solid #f0fdf4">
                        <!-- Avatar -->
                        @if (offer.ag_drivers?.ag_users?.selfie_url) {
                          <img [src]="offer.ag_drivers!.ag_users!.selfie_url"
                            class="w-14 h-14 rounded-2xl object-cover flex-shrink-0"
                            style="border:2px solid #16a34a" />
                        } @else {
                          <div class="w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0 font-black text-xl text-white"
                            style="background:linear-gradient(135deg,#f97316,#ea580c);border:2px solid #fed7aa">
                            {{ (offer.ag_drivers?.ag_users?.full_name ?? 'C')[0].toUpperCase() }}
                          </div>
                        }
                        <div class="flex-1 min-w-0">
                          <div class="flex items-center gap-1.5 flex-wrap">
                            <p class="font-black text-base" style="color:#0f172a;line-height:1.2">
                              {{ offer.ag_drivers?.ag_users?.full_name ?? 'Conductor' }}
                            </p>
                            @if (offer.ag_drivers?.level) {
                              <span class="text-[9px] font-black uppercase px-1.5 py-0.5 rounded-md"
                                style="background:rgba(245,158,11,0.15);color:#92400e">{{ offer.ag_drivers!.level }}</span>
                            }
                          </div>
                          <!-- Rating + viajes -->
                          <div class="flex items-center gap-1 mt-1">
                            <span class="material-symbols-outlined text-amber-400" style="font-size:14px;font-variation-settings:'FILL' 1">star</span>
                            <span class="text-sm font-black" style="color:#0f172a">{{ offer.ag_drivers?.rating_avg ?? '—' }}</span>
                            <span class="text-slate-400 text-xs">·</span>
                            <span class="text-slate-600 text-xs font-semibold">{{ offer.ag_drivers?.trips_completed ?? 0 }} viajes</span>
                          </div>
                          <!-- Vehículo + ETA -->
                          <div class="flex items-center gap-2 mt-0.5 flex-wrap">
                            <span class="text-slate-500 text-xs">{{ offer.ag_drivers?.vehicle_brand }}</span>
                            @if (driverEtaMin()[offer.id]) {
                              <span class="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-black"
                                style="background:rgba(8,145,178,0.10);color:#0369a1">
                                <span class="material-symbols-outlined" style="font-size:11px">schedule</span>
                                ~{{ driverEtaMin()[offer.id] }} min de ti
                              </span>
                            }
                          </div>
                        </div>
                      </div>

                      <!-- Botones Rechazar / Contraofertar / Aceptar -->
                      <div class="flex flex-col gap-2 px-4 py-3">
                        <div class="grid grid-cols-2 gap-2">
                          <button (click)="rejectOfferCard(offer)"
                            class="py-3.5 rounded-2xl text-sm font-black flex items-center justify-center gap-2 active:scale-95 transition-all"
                            style="background:#fef2f2;border:2px solid #fecaca;color:#dc2626">
                            <span class="material-symbols-outlined" style="font-size:18px">close</span>
                            Rechazar
                          </button>
                          <button (click)="acceptOfferCard(offer)"
                            [disabled]="acceptingOfferId() === offer.id"
                            class="py-3.5 rounded-2xl text-white text-sm font-black flex items-center justify-center gap-2 active:scale-95 transition-all disabled:opacity-60"
                            style="background:linear-gradient(135deg,#16a34a,#15803d);box-shadow:0 4px 16px rgba(22,163,74,0.35)">
                            @if (acceptingOfferId() === offer.id) {
                              <span class="material-symbols-outlined animate-spin" style="font-size:18px">autorenew</span>
                            } @else {
                              <span class="material-symbols-outlined" style="font-size:18px">check_circle</span>
                            }
                            Aceptar
                          </button>
                        </div>
                      </div>

                      <!-- Barra timer 4 min -->
                      <div class="px-4 pb-4">
                        <div class="flex items-center justify-between mb-1.5">
                          <span class="text-slate-400 text-[10px] font-medium">Oferta válida por</span>
                          <span class="text-[11px] font-black"
                            [style.color]="offerRemainingPct(offer) < 25 ? '#dc2626' : offerRemainingPct(offer) < 50 ? '#d97706' : '#16a34a'">
                            {{ offerRemainingStr(offer) }}
                          </span>
                        </div>
                        <div class="w-full rounded-full overflow-hidden" style="height:6px;background:#f0fdf4">
                          <div class="h-full rounded-full"
                            style="transition:width 1s linear"
                            [style.width]="offerRemainingPct(offer) + '%'"
                            [style.background]="offerRemainingPct(offer) < 25 ? '#dc2626' : offerRemainingPct(offer) < 50 ? '#f59e0b' : '#16a34a'">
                          </div>
                        </div>
                      </div>

                      @if (offerAcceptError()) {
                        <div class="mx-4 mb-3 px-3 py-2 rounded-xl flex items-start gap-2"
                          style="background:rgba(220,38,38,0.08);border:1px solid rgba(220,38,38,0.25)">
                          <span class="material-symbols-outlined text-red-500 flex-shrink-0" style="font-size:15px">error</span>
                          <p class="text-red-600 text-xs leading-snug">{{ offerAcceptError() }}</p>
                        </div>
                      }
                    </div>
                  }
                </div>
              }

              <!-- Fila: pago + temporizador -->
              <div class="flex items-center gap-2 px-4 pt-3 pb-1">
                <p class="text-slate-700 text-sm font-semibold flex-1 leading-snug">
                  Mejor tarifa. Tu solicitud tiene prioridad
                </p>
                <div class="flex items-center gap-1.5 flex-shrink-0 px-2.5 py-1 rounded-full"
                  [style.background]="paymentMethodMap[tripPayment()].bgSel"
                  [style.border]="'1px solid ' + paymentMethodMap[tripPayment()].color">
                  <span class="material-symbols-outlined" style="font-size:13px"
                    [style.color]="paymentMethodMap[tripPayment()].color">{{ paymentMethodMap[tripPayment()].icon }}</span>
                  <span class="text-[10px] font-black"
                    [style.color]="paymentMethodMap[tripPayment()].color">{{ paymentMethodMap[tripPayment()].label }}</span>
                </div>
                <span class="font-black text-xl text-slate-800 flex-shrink-0 tabular-nums">{{ formatTime(waitingCountdown()) }}</span>
              </div>

              <!-- Barra de progreso -->
              <div class="mx-4 mb-3 rounded-full overflow-hidden" style="height:3px;background:#e2e8f0">
                <div class="h-full rounded-full bg-slate-800 transition-all duration-1000"
                  [style.width]="waitingProgress() + '%'"></div>
              </div>

              <!-- Ajuste de precio en espera -->
              <div class="px-4 py-2.5" style="border-top:1px solid #e2e8f0;border-bottom:1px solid #e2e8f0">
                <p class="text-slate-400 text-[10px] uppercase font-bold tracking-wider text-center mb-2">Ajustar precio</p>
                <div class="flex items-center gap-3">
                  <button (click)="adjustTripPrice(-500)"
                    class="w-10 h-10 rounded-xl border text-slate-700 font-black text-xl flex items-center justify-center active:scale-95 flex-shrink-0"
                    style="background:#f1f5f9;border-color:#e2e8f0">−</button>
                  <p class="font-black text-xl text-slate-800 flex-1 text-center">{{ formatCOP(tripPrice()) }}</p>
                  <button (click)="adjustTripPrice(500)"
                    class="w-10 h-10 rounded-xl text-white font-black text-xl flex items-center justify-center active:scale-95 flex-shrink-0"
                    style="background:#f97316">+</button>
                </div>
              </div>

              <!-- Toggle auto-aceptar -->
              <div class="flex items-center gap-3 px-4 py-3" style="border-bottom:1px solid #e2e8f0">
                <span class="material-symbols-outlined text-orange-500 flex-shrink-0" style="font-size:20px">near_me</span>
                <p class="text-slate-700 text-xs flex-1 leading-snug">
                  Aceptar automáticamente al conductor más cercano por {{ formatCOP(tripPrice()) }}
                </p>
                <button (click)="autoAccept.set(!autoAccept())"
                  class="flex-shrink-0 relative rounded-full transition-all duration-200"
                  style="width:44px;height:24px"
                  [style.background]="autoAccept() ? '#f97316' : '#cbd5e1'">
                  <div class="absolute top-0.5 rounded-full bg-white shadow transition-all duration-200"
                    style="width:20px;height:20px"
                    [style.left]="autoAccept() ? '22px' : '2px'"></div>
                </button>
              </div>

              <!-- Cancelar -->
              <div class="px-4 py-3">
                <button (click)="cancelTrip()"
                  class="w-full py-2.5 rounded-xl text-slate-500 text-xs font-bold active:scale-[0.98] transition-all"
                  style="background:#f1f5f9;border:1px solid #e2e8f0">
                  Cancelar solicitud
                </button>
              </div>
            }

          </div>
        }

      </div><!-- /map container -->
      } @else {
      <!-- ══ Sección pasajero ══ -->
      <div class="fixed inset-0 z-40 overflow-y-auto" style="background:#0d111a">
      <div class="flex flex-col gap-4 px-4 py-6 max-w-lg mx-auto">

        <!-- Botón volver -->
        <button (click)="passengerSection.set(null)"
          class="flex items-center gap-2 text-orange-400 font-bold text-sm active:scale-95 transition-all self-start">
          <span class="material-symbols-outlined" style="font-size:20px">arrow_back</span>
          Volver
        </button>

        <!-- ── HISTORIAL ── -->
        @if (passengerSection() === 'history') {
          <div class="flex flex-col gap-3">
            <h2 class="text-white font-black text-lg">Historial de solicitudes</h2>
            @if (passengerHistoryLoading()) {
              <div class="flex justify-center py-8">
                <span class="material-symbols-outlined text-orange-400 animate-spin" style="font-size:32px">autorenew</span>
              </div>
            } @else if (passengerHistory().length === 0) {
              <div class="flex flex-col items-center gap-3 py-10">
                <span class="material-symbols-outlined text-slate-600" style="font-size:48px">history</span>
                <p class="text-slate-400 text-sm">No tienes viajes registrados aún</p>
              </div>
            } @else {
              <div class="flex flex-col gap-2">
                @for (trip of passengerHistory(); track trip.id) {
                  <div class="rounded-2xl p-4 flex flex-col gap-2"
                    style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08)">
                    <div class="flex items-center justify-between">
                      <div class="flex items-center gap-2">
                        <span class="material-symbols-outlined text-orange-400 flex-shrink-0" style="font-size:18px">place</span>
                        <p class="text-white font-bold text-sm truncate max-w-[180px]">{{ trip.dest_name }}</p>
                      </div>
                      <span class="px-2 py-0.5 rounded-full text-[10px] font-black uppercase"
                        [style.background]="trip.status==='completed' ? 'rgba(16,185,129,0.15)' : trip.status==='cancelled' ? 'rgba(239,68,68,0.15)' : 'rgba(249,115,22,0.15)'"
                        [style.color]="trip.status==='completed' ? '#34d399' : trip.status==='cancelled' ? '#f87171' : '#fb923c'">
                        {{ trip.status === 'completed' ? 'Completado' : trip.status === 'cancelled' ? 'Cancelado' : 'En curso' }}
                      </span>
                    </div>
                    <div class="flex items-center gap-4 text-xs text-slate-400">
                      <span class="flex items-center gap-1">
                        <span class="material-symbols-outlined" style="font-size:14px">straighten</span>
                        {{ trip.distance_km }} km
                      </span>
                      <span class="flex items-center gap-1 text-emerald-400 font-bold">
                        <span class="material-symbols-outlined" style="font-size:14px">payments</span>
                        {{ formatCOP(trip.offered_price) }}
                      </span>
                      <span>{{ formatTripDate(trip.created_at) }}</span>
                    </div>
                    @if (trip.status === 'completed') {
                      <div class="grid grid-cols-2 gap-2 mt-1">
                        <button (click)="openPassengerTripDetail(trip)"
                          class="py-1.5 rounded-lg text-xs font-bold text-cyan-400"
                          style="background:rgba(8,145,178,0.1);border:1px solid rgba(8,145,178,0.3)">
                          Ver detalle
                        </button>
                        <button (click)="repeatPassengerTrip(trip.id)"
                          class="py-1.5 rounded-lg text-xs font-bold text-orange-400"
                          style="background:rgba(249,115,22,0.1);border:1px solid rgba(249,115,22,0.3)">
                          🔁 Repetir
                        </button>
                      </div>
                    }
                  </div>
                }
              </div>
            }
          </div>
        }

        <!-- ── NOTIFICACIONES ── -->
        @if (passengerSection() === 'notifications') {
          <div class="flex flex-col gap-4">
            <h2 class="text-white font-black text-lg">Notificaciones</h2>
            <div class="rounded-2xl overflow-hidden" style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08)">
              <div class="flex items-center justify-between px-4 py-4" style="border-bottom:1px solid rgba(255,255,255,0.06)">
                <div class="flex items-center gap-3">
                  <span class="material-symbols-outlined text-orange-400" style="font-size:20px">volume_up</span>
                  <div>
                    <p class="text-white font-bold text-sm">Sonido</p>
                    <p class="text-slate-400 text-xs">Alertas sonoras al recibir ofertas</p>
                  </div>
                </div>
                <button (click)="togglePassengerSound()"
                  class="relative rounded-full transition-all duration-200 flex-shrink-0"
                  style="width:44px;height:24px"
                  [style.background]="passengerNotifSettings().sound ? '#f97316' : 'rgba(255,255,255,0.1)'">
                  <div class="absolute top-0.5 rounded-full bg-white shadow transition-all duration-200"
                    style="width:20px;height:20px"
                    [style.left]="passengerNotifSettings().sound ? '22px' : '2px'"></div>
                </button>
              </div>
              <div class="flex items-center justify-between px-4 py-4" style="border-bottom:1px solid rgba(255,255,255,0.06)">
                <div class="flex items-center gap-3">
                  <span class="material-symbols-outlined text-orange-400" style="font-size:20px">vibration</span>
                  <div>
                    <p class="text-white font-bold text-sm">Vibración</p>
                    <p class="text-slate-400 text-xs">Vibrar al recibir nuevas ofertas</p>
                  </div>
                </div>
                <button (click)="togglePassengerVibration()"
                  class="relative rounded-full transition-all duration-200 flex-shrink-0"
                  style="width:44px;height:24px"
                  [style.background]="passengerNotifSettings().vibration ? '#f97316' : 'rgba(255,255,255,0.1)'">
                  <div class="absolute top-0.5 rounded-full bg-white shadow transition-all duration-200"
                    style="width:20px;height:20px"
                    [style.left]="passengerNotifSettings().vibration ? '22px' : '2px'"></div>
                </button>
              </div>
              <div class="flex items-center justify-between px-4 py-4">
                <div class="flex items-center gap-3">
                  <span class="material-symbols-outlined text-orange-400" style="font-size:20px">notifications_active</span>
                  <div>
                    <p class="text-white font-bold text-sm">Nuevas ofertas</p>
                    <p class="text-slate-400 text-xs">Notificar cuando un conductor responde</p>
                  </div>
                </div>
                <button (click)="togglePassengerNewOffers()"
                  class="relative rounded-full transition-all duration-200 flex-shrink-0"
                  style="width:44px;height:24px"
                  [style.background]="passengerNotifSettings().newOffers ? '#f97316' : 'rgba(255,255,255,0.1)'">
                  <div class="absolute top-0.5 rounded-full bg-white shadow transition-all duration-200"
                    style="width:20px;height:20px"
                    [style.left]="passengerNotifSettings().newOffers ? '22px' : '2px'"></div>
                </button>
              </div>
            </div>
          </div>
        }

        <!-- ── SEGURIDAD ── -->
        @if (passengerSection() === 'security') {
          <div class="flex flex-col gap-4">
            <h2 class="text-white font-black text-lg">Seguridad</h2>
            <!-- Notificaciones push -->
            @if (pushSupported()) {
              <div class="rounded-2xl p-4 flex items-center gap-3" style="background:rgba(59,130,246,0.08);border:1px solid rgba(59,130,246,0.2)">
                <span class="material-symbols-outlined text-blue-400" style="font-size:22px">notifications_active</span>
                <div class="flex-1 min-w-0">
                  <p class="text-white font-black text-sm">Notificaciones push</p>
                  <p class="text-slate-400 text-xs">Avisos cuando llegue el conductor o aceptes una oferta</p>
                </div>
                @if (pushEnabled()) {
                  <button (click)="disablePush()" class="px-3 py-1.5 rounded-lg text-xs text-slate-400" style="background:rgba(255,255,255,0.08)">Activadas</button>
                } @else {
                  <button (click)="enablePush()" class="px-3 py-1.5 rounded-lg text-xs font-bold text-white" style="background:#3b82f6">Activar</button>
                }
              </div>
            }
            <!-- Botón de pánico -->
            <div class="rounded-2xl p-4 flex flex-col gap-3" style="background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.2)">
              <div class="flex items-center gap-3">
                <span class="material-symbols-outlined text-red-400" style="font-size:22px">emergency</span>
                <div>
                  <p class="text-white font-black text-sm">Botón de pánico</p>
                  <p class="text-slate-400 text-xs">Llama a tu contacto de emergencia</p>
                </div>
              </div>
              <button (click)="triggerPanic()" [disabled]="panicSending()"
                class="w-full py-3 rounded-xl font-black text-sm transition-all active:scale-[0.98] disabled:opacity-60"
                [style.background]="panicActivated() ? 'rgba(34,197,94,0.3)' : 'linear-gradient(135deg,#dc2626,#b91c1c)'"
                style="color:#fff">
                @if (panicActivated()) { ✓ Alerta enviada — {{ panicContactsNotified() }} contactos notificados }
                @else if (panicSending()) { Enviando alerta... }
                @else { 🚨 Activar pánico }
              </button>
              @if (panicActivated() && panicMapsLink()) {
                <a [href]="panicMapsLink()" target="_blank" class="text-[11px] text-red-300 underline text-center">Ver ubicación compartida</a>
              }
            </div>
            <!-- Contactos de emergencia -->
            <div class="rounded-2xl p-4 flex flex-col gap-3" style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08)">
              <p class="text-white font-black text-sm">Contactos de emergencia</p>
              @for (c of passengerSecurityContacts(); track c.phone) {
                <div class="flex items-center justify-between gap-2">
                  <div class="flex items-center gap-2 flex-1 min-w-0">
                    <span class="material-symbols-outlined text-orange-400" style="font-size:16px">person</span>
                    <div class="min-w-0">
                      <p class="text-white text-xs font-bold truncate">{{ c.name }}</p>
                      <p class="text-slate-400 text-[10px]">{{ c.phone }}</p>
                    </div>
                  </div>
                  <button (click)="removePassengerContact(c.phone)"
                    class="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                    style="background:rgba(239,68,68,0.15)">
                    <span class="material-symbols-outlined text-red-400" style="font-size:14px">close</span>
                  </button>
                </div>
              }
              <div class="flex flex-col gap-2">
                <input [(ngModel)]="passengerNewContactName" placeholder="Nombre"
                  class="w-full px-3 py-2 rounded-xl text-sm text-white outline-none"
                  style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1)"/>
                <input [(ngModel)]="passengerNewContactPhone" placeholder="Teléfono" type="tel"
                  class="w-full px-3 py-2 rounded-xl text-sm text-white outline-none"
                  style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1)"/>
                <button (click)="addPassengerContact()"
                  class="w-full py-2.5 rounded-xl text-sm font-black transition-all active:scale-[0.98]"
                  style="background:linear-gradient(135deg,#f97316,#ea580c);color:#fff">
                  Agregar contacto
                </button>
              </div>
            </div>
            <!-- Compartir ubicación -->
            <div class="rounded-2xl p-4" style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08)">
              <div class="flex items-center gap-3">
                <span class="material-symbols-outlined text-orange-400" style="font-size:20px">share_location</span>
                <div>
                  <p class="text-white font-bold text-sm">Compartir ubicación</p>
                  <p class="text-slate-400 text-xs">Envía tu ubicación en tiempo real a tus contactos durante el viaje</p>
                </div>
              </div>
            </div>
          </div>
        }

        <!-- ── CONFIGURACIÓN ── -->
        @if (passengerSection() === 'settings') {
          <div class="flex flex-col gap-4">
            <h2 class="text-white font-black text-lg">Configuración</h2>
            <div class="rounded-2xl overflow-hidden" style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08)">
              <div class="flex items-center justify-between px-4 py-4" style="border-bottom:1px solid rgba(255,255,255,0.06)">
                <div class="flex items-center gap-3">
                  <span class="material-symbols-outlined text-orange-400" style="font-size:20px">phone_disabled</span>
                  <div>
                    <p class="text-white font-bold text-sm">Ocultar teléfono</p>
                    <p class="text-slate-400 text-xs">Los conductores no verán tu número</p>
                  </div>
                </div>
                <button (click)="togglePassengerHidePhone()"
                  class="relative rounded-full transition-all duration-200 flex-shrink-0"
                  style="width:44px;height:24px"
                  [style.background]="passengerSettings().hidePhone ? '#f97316' : 'rgba(255,255,255,0.1)'">
                  <div class="absolute top-0.5 rounded-full bg-white shadow transition-all duration-200"
                    style="width:20px;height:20px"
                    [style.left]="passengerSettings().hidePhone ? '22px' : '2px'"></div>
                </button>
              </div>
              <div class="flex items-center justify-between px-4 py-4">
                <div class="flex items-center gap-3">
                  <span class="material-symbols-outlined text-orange-400" style="font-size:20px">language</span>
                  <div>
                    <p class="text-white font-bold text-sm">Idioma</p>
                    <p class="text-slate-400 text-xs">Español (Colombia)</p>
                  </div>
                </div>
                <span class="text-slate-500 text-xs font-bold">ES</span>
              </div>
            </div>
            <div class="rounded-2xl p-4 flex flex-col gap-3" style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08)">
              <p class="text-slate-400 text-xs">Versión de la app</p>
              <p class="text-white font-bold text-sm">Movi v1.0.0</p>
              <button class="text-slate-300 text-xs text-left hover:text-white transition-colors underline underline-offset-2">Ver términos y condiciones</button>
              <button class="text-slate-300 text-xs text-left hover:text-white transition-colors underline underline-offset-2">Política de privacidad</button>
            </div>
            <button (click)="savePassengerSettings()"
              [disabled]="savingPassengerSettings()"
              class="w-full py-3 rounded-xl font-black text-sm transition-all active:scale-[0.98] disabled:opacity-40"
              style="background:linear-gradient(135deg,#f97316,#ea580c);color:#fff">
              @if (savingPassengerSettings()) { Guardando... } @else { Guardar cambios }
            </button>
          </div>
        }

        <!-- ── AYUDA ── -->
        @if (passengerSection() === 'support') {
          <div class="flex flex-col gap-4">
            <h2 class="text-white font-black text-lg">Ayuda y Soporte</h2>
            <!-- Contacto rápido -->
            <div class="rounded-2xl p-4 flex flex-col gap-3" style="background:rgba(249,115,22,0.08);border:1px solid rgba(249,115,22,0.2)">
              <p class="text-white font-black text-sm">Contactar soporte</p>
              <a href="https://wa.me/573181800264" target="_blank" rel="noopener"
                class="flex items-center gap-3 py-2.5 px-3 rounded-xl transition-all active:scale-[0.98]"
                style="background:rgba(37,211,102,0.15);border:1px solid rgba(37,211,102,0.25)">
                <span class="material-symbols-outlined text-green-400" style="font-size:20px">chat</span>
                <span class="text-green-300 font-bold text-sm">WhatsApp 24&#x2F;7</span>
              </a>
              <a href="mailto:soporte@andaygana.com"
                class="flex items-center gap-3 py-2.5 px-3 rounded-xl transition-all active:scale-[0.98]"
                style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1)">
                <span class="material-symbols-outlined text-orange-400" style="font-size:20px">mail</span>
                <span class="text-slate-300 font-bold text-sm">soporte&#64;andaygana.com</span>
              </a>
            </div>
            <!-- FAQ -->
            <p class="text-slate-400 text-xs font-bold uppercase tracking-widest">Preguntas frecuentes</p>
            <div class="flex flex-col gap-2">
              @for (faq of passengerFaqItems; track faq.q) {
                <div class="rounded-xl overflow-hidden" style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08)">
                  <button (click)="togglePassengerFaq(faq.q)"
                    class="w-full flex items-center justify-between px-4 py-3 text-left">
                    <p class="text-white font-bold text-sm flex-1 pr-2">{{ faq.q }}</p>
                    <span class="material-symbols-outlined text-orange-400 flex-shrink-0 transition-transform"
                      style="font-size:18px"
                      [style.transform]="openPassengerFaq() === faq.q ? 'rotate(180deg)' : 'rotate(0)'">expand_more</span>
                  </button>
                  @if (openPassengerFaq() === faq.q) {
                    <div class="px-4 pb-4 text-slate-400 text-sm leading-relaxed" style="border-top:1px solid rgba(255,255,255,0.06)">
                      <p class="pt-3">{{ faq.a }}</p>
                    </div>
                  }
                </div>
              }
            </div>
          </div>
        }

        <!-- ── RECOMIENDA Y GANA (Pasajero) ── -->
        @if (passengerSection() === 'referrals') {
          <div class="flex flex-col gap-4">
            <h2 class="text-white font-black text-lg flex items-center gap-2">
              <span class="material-symbols-outlined text-amber-400" style="font-size:24px">card_giftcard</span>
              Recomienda y Gana
            </h2>

            <!-- Billetera de retiro -->
            <div class="rounded-2xl p-4 flex flex-col gap-2"
              style="background:linear-gradient(135deg,#6C3AED,#2563EB);border:1px solid rgba(255,255,255,0.2)">
              <p class="text-white/70 text-xs font-bold uppercase tracking-widest">Billetera de retiro</p>
              <p class="text-white font-black text-2xl">{{ '$' + referralBalance().toLocaleString() }}</p>
              <div class="flex items-center gap-4 mt-1">
                <div class="flex items-center gap-1">
                  <span class="material-symbols-outlined text-emerald-300" style="font-size:14px">trending_up</span>
                  <span class="text-emerald-300 text-xs font-bold">Total ganado: {{ '$' + referralTotalEarned().toLocaleString() }}</span>
                </div>
                <div class="flex items-center gap-1">
                  <span class="material-symbols-outlined text-amber-300" style="font-size:14px">group</span>
                  <span class="text-amber-300 text-xs font-bold">{{ referralCount() }} invitados</span>
                </div>
              </div>
            </div>

            <div class="rounded-2xl p-4 flex flex-col gap-3"
              style="background:linear-gradient(135deg,rgba(108,58,237,0.15),rgba(37,99,235,0.15));border:1px solid rgba(108,58,237,0.3)">
              <p class="text-white font-black text-base">Gana el 2% por referido</p>
              <p class="text-slate-300 text-xs sm:text-sm leading-relaxed">
                Cada vez que alguien se registre en <span class="text-white font-bold">Movi</span> con tu link y use nuestro servicio,
                tú ganas el <span class="text-amber-400 font-black">2% del valor de cada servicio</span>.
                No importa si tus invitados son pasajeros o conductores.
              </p>
            </div>

            <!-- Link de referido -->
            <div class="rounded-2xl p-4 flex flex-col gap-3"
              style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.1)">
              <p class="text-slate-400 text-xs font-bold uppercase tracking-widest">Tu link de invitación</p>
              <div class="flex items-center gap-2">
                <div class="flex-1 rounded-xl px-3 py-2.5 text-xs text-white font-mono truncate"
                  style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1)">
                  {{ agReferralLink() }}
                </div>
                <button (click)="copyReferralLink()"
                  class="px-4 py-2.5 rounded-xl text-xs font-black text-black flex items-center gap-1 active:scale-95 transition-transform flex-shrink-0"
                  style="background:linear-gradient(135deg,#f59e0b,#d97706)">
                  <span class="material-symbols-outlined" style="font-size:16px">content_copy</span>
                  {{ referralCopied() ? '¡Copiado!' : 'Copiar' }}
                </button>
              </div>
            </div>

            <!-- Historial de comisiones -->
            @if (referralTransactions().length > 0) {
              <p class="text-slate-400 text-xs font-bold uppercase tracking-widest">Historial de comisiones</p>
              <div class="flex flex-col gap-2">
                @for (tx of referralTransactions(); track tx.id) {
                  <div class="flex items-center justify-between rounded-xl px-3 py-2.5"
                    style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.06)">
                    <div class="flex-1 min-w-0">
                      <p class="text-white text-xs font-bold truncate">{{ tx.description }}</p>
                      <p class="text-slate-500 text-[10px]">{{ tx.created_at?.slice(0,10) }}</p>
                    </div>
                    <span class="text-emerald-400 font-black text-sm flex-shrink-0 ml-2">{{ '+$' + tx.commission_amount?.toLocaleString() }}</span>
                  </div>
                }
              </div>
            }

            <!-- Cómo funciona -->
            <p class="text-slate-400 text-xs font-bold uppercase tracking-widest">¿Cómo funciona?</p>
            <div class="flex flex-col gap-2">
              <div class="flex items-start gap-3 rounded-xl p-3" style="background:rgba(255,255,255,0.04)">
                <div class="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0" style="background:rgba(108,58,237,0.2)">
                  <span class="text-purple-400 font-black text-xs">1</span>
                </div>
                <p class="text-slate-300 text-xs leading-relaxed">Comparte tu link con amigos, familiares o en redes sociales</p>
              </div>
              <div class="flex items-start gap-3 rounded-xl p-3" style="background:rgba(255,255,255,0.04)">
                <div class="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0" style="background:rgba(108,58,237,0.2)">
                  <span class="text-purple-400 font-black text-xs">2</span>
                </div>
                <p class="text-slate-300 text-xs leading-relaxed">Ellos se registran como pasajero o conductor usando tu link</p>
              </div>
              <div class="flex items-start gap-3 rounded-xl p-3" style="background:rgba(255,255,255,0.04)">
                <div class="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0" style="background:rgba(245,158,11,0.2)">
                  <span class="text-amber-400 font-black text-xs">3</span>
                </div>
                <p class="text-slate-300 text-xs leading-relaxed">Cada vez que usen Movi, tú ganas el <span class="text-amber-400 font-bold">2% del valor del servicio</span> en tu billetera de retiro</p>
              </div>
            </div>
          </div>
        }

        <!-- ── FAVORITOS ── -->
        @if (passengerSection() === 'favorites') {
          <div class="flex flex-col gap-3">
            <h2 class="text-white font-black text-lg">Direcciones favoritas</h2>
            <p class="text-slate-400 text-xs">Guarda tus lugares más visitados para pedir viajes rápido.</p>

            <div class="rounded-2xl p-4 flex flex-col gap-2"
              style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08)">
              <p class="text-white font-bold text-xs">Nueva favorita</p>
              <input type="text" [(ngModel)]="newFavLabel" placeholder="Etiqueta (Casa, Oficina...)"
                class="w-full px-3 py-2 rounded-lg text-white text-sm"
                style="background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.1)" />
              <input type="text" [(ngModel)]="newFavAddress" placeholder="Dirección completa"
                class="w-full px-3 py-2 rounded-lg text-white text-sm"
                style="background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.1)" />
              <button (click)="addPassengerFavorite()" [disabled]="addingFav() || !newFavLabel.trim() || !newFavAddress.trim()"
                class="w-full py-2 rounded-xl text-white font-black text-xs disabled:opacity-50"
                style="background:linear-gradient(135deg,#f97316,#ea580c)">
                @if (addingFav()) { Guardando... } @else { + Agregar }
              </button>
            </div>

            @if (passengerFavorites().length === 0) {
              <p class="text-slate-400 text-center py-4 text-sm">Aún no tienes favoritas.</p>
            } @else {
              @for (f of passengerFavorites(); track f.id) {
                <div class="rounded-2xl p-3 flex items-center gap-3"
                  style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08)">
                  <span class="material-symbols-outlined text-orange-400" style="font-size:24px">{{ f.icon || 'home' }}</span>
                  <div class="flex-1 min-w-0">
                    <p class="text-white font-bold text-sm truncate">{{ f.label }}</p>
                    <p class="text-slate-400 text-xs truncate">{{ f.address }}</p>
                  </div>
                  <button (click)="useFavoriteAsDestination(f)"
                    class="px-2 py-1 rounded-lg text-xs font-bold text-orange-400"
                    style="background:rgba(249,115,22,0.15);border:1px solid rgba(249,115,22,0.3)">Usar</button>
                  <button (click)="removePassengerFavorite(f.id)"
                    class="w-8 h-8 rounded-lg flex items-center justify-center"
                    style="background:rgba(239,68,68,0.15)">
                    <span class="material-symbols-outlined text-red-400" style="font-size:16px">delete</span>
                  </button>
                </div>
              }
            }
          </div>
        }

        <!-- ── MÉTODOS DE PAGO GUARDADOS ── -->
        @if (passengerSection() === 'paymentmethods') {
          <div class="flex flex-col gap-3">
            <h2 class="text-white font-black text-lg">Métodos de pago</h2>

            <div class="rounded-2xl p-4 flex flex-col gap-2"
              style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08)">
              <p class="text-white font-bold text-xs">Agregar método</p>
              <select [value]="newPmKind()" (change)="newPmKind.set($any($event.target).value)"
                class="w-full px-3 py-2 rounded-lg text-white text-sm"
                style="background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.1)">
                <option value="card">Tarjeta</option>
                <option value="nequi">Nequi</option>
                <option value="daviplata">Daviplata</option>
                <option value="bancolombia">Bancolombia</option>
                <option value="efectivo">Efectivo</option>
              </select>
              <input type="text" [(ngModel)]="newPmLabel" placeholder="Etiqueta (Ej: Visa principal)"
                class="w-full px-3 py-2 rounded-lg text-white text-sm"
                style="background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.1)" />
              @if (newPmKind() === 'card') {
                <div class="grid grid-cols-2 gap-2">
                  <input type="text" [(ngModel)]="newPmLast4" placeholder="Últimos 4" maxlength="4"
                    class="px-3 py-2 rounded-lg text-white text-sm"
                    style="background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.1)" />
                  <input type="text" [(ngModel)]="newPmBrand" placeholder="Marca (Visa, MC)"
                    class="px-3 py-2 rounded-lg text-white text-sm"
                    style="background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.1)" />
                </div>
              } @else if (newPmKind() === 'nequi' || newPmKind() === 'daviplata' || newPmKind() === 'bancolombia') {
                <input type="text" [(ngModel)]="newPmAccount" placeholder="Número de cuenta / celular"
                  class="w-full px-3 py-2 rounded-lg text-white text-sm"
                  style="background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.1)" />
              }
              <button (click)="addPaymentMethod()" [disabled]="addingPm() || !newPmLabel.trim()"
                class="w-full py-2 rounded-xl text-white font-black text-xs disabled:opacity-50"
                style="background:linear-gradient(135deg,#f97316,#ea580c)">
                @if (addingPm()) { Guardando... } @else { + Agregar método }
              </button>
            </div>

            @if (passengerPaymentMethods().length === 0) {
              <p class="text-slate-400 text-center py-4 text-sm">Aún no tienes métodos guardados.</p>
            } @else {
              @for (pm of passengerPaymentMethods(); track pm.id) {
                <div class="rounded-2xl p-3 flex items-center gap-3"
                  style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08)">
                  <span class="material-symbols-outlined text-orange-400" style="font-size:24px">
                    {{ pm.kind === 'card' ? 'credit_card' : pm.kind === 'efectivo' ? 'payments' : 'smartphone' }}
                  </span>
                  <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-2">
                      <p class="text-white font-bold text-sm truncate">{{ pm.label }}</p>
                      @if (pm.is_default) {
                        <span class="text-[10px] font-bold text-emerald-400">DEFAULT</span>
                      }
                    </div>
                    <p class="text-slate-400 text-xs truncate">
                      {{ pm.kind === 'card' ? (pm.brand + ' ••••' + pm.last4) : (pm.account || pm.kind) }}
                    </p>
                  </div>
                  @if (!pm.is_default) {
                    <button (click)="setDefaultPm(pm.id)"
                      class="px-2 py-1 rounded-lg text-xs font-bold text-emerald-400"
                      style="background:rgba(16,185,129,0.15);border:1px solid rgba(16,185,129,0.3)">Default</button>
                  }
                  <button (click)="deletePm(pm.id)"
                    class="w-8 h-8 rounded-lg flex items-center justify-center"
                    style="background:rgba(239,68,68,0.15)">
                    <span class="material-symbols-outlined text-red-400" style="font-size:16px">delete</span>
                  </button>
                </div>
              }
            }
          </div>
        }

        <!-- ── WALLET PASAJERO ── -->
        @if (passengerSection() === 'wallet') {
          <div class="flex flex-col gap-4">
            <div class="rounded-2xl p-5"
              style="background:linear-gradient(135deg,#f97316,#ea580c);border:1px solid rgba(255,255,255,0.1)">
              <p class="text-white/80 text-xs font-bold uppercase tracking-widest mb-2">Mi saldo</p>
              <p class="text-white font-black text-3xl">{{ '$' + passengerWalletBalance().toLocaleString('es-CO') }}</p>
            </div>

            <div class="rounded-2xl p-4 flex flex-col gap-2"
              style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08)">
              <p class="text-white font-bold text-sm">Recargar</p>
              <div class="grid grid-cols-3 gap-2">
                @for (p of rechargePresets; track p) {
                  <button (click)="pRechargeAmount.set(p)"
                    class="py-2 rounded-xl text-xs font-bold"
                    [style.background]="pRechargeAmount() === p ? 'rgba(249,115,22,0.25)' : 'rgba(255,255,255,0.05)'"
                    [style.color]="pRechargeAmount() === p ? '#fb923c' : 'white'">
                    {{ '$' + p.toLocaleString('es-CO') }}
                  </button>
                }
              </div>
              <button (click)="rechargePassengerWallet()" [disabled]="pRechargeLoading() || pRechargeAmount() < 5000"
                class="w-full py-3 rounded-xl text-white font-black text-sm disabled:opacity-50"
                style="background:linear-gradient(135deg,#f97316,#ea580c)">
                @if (pRechargeLoading()) { Procesando... } @else { Recargar {{ '$' + pRechargeAmount().toLocaleString('es-CO') }} }
              </button>
            </div>

            <div>
              <p class="text-white font-bold text-sm mb-2">Movimientos</p>
              @if (passengerWalletHistory().length === 0) {
                <p class="text-slate-400 text-xs text-center py-4">Aún no tienes movimientos.</p>
              } @else {
                @for (tx of passengerWalletHistory(); track tx.id) {
                  <div class="rounded-xl p-3 mb-2 flex items-center justify-between"
                    style="background:rgba(255,255,255,0.03)">
                    <div class="flex-1 min-w-0">
                      <p class="text-white text-xs font-bold">{{ tx.description ?? tx.kind }}</p>
                      <p class="text-slate-500 text-[10px]">{{ tx.created_at | date:'dd MMM HH:mm' }}</p>
                    </div>
                    <p class="font-black text-sm"
                      [class.text-emerald-400]="tx.amount > 0" [class.text-red-400]="tx.amount < 0">
                      {{ tx.amount > 0 ? '+' : '' }}{{ '$' + tx.amount.toLocaleString('es-CO') }}
                    </p>
                  </div>
                }
              }
            </div>
          </div>
        }

        <!-- ── PROGRAMAR VIAJE ── -->
        @if (passengerSection() === 'schedule') {
          <div class="flex flex-col gap-4">
            <h2 class="text-white font-black text-lg">Programar viaje</h2>

            <div class="rounded-2xl p-4 flex flex-col gap-3"
              style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08)">
              @if (!tripDest()) {
                <p class="text-amber-400 text-xs">⚠ Primero selecciona un destino en el mapa principal (toca "¿A dónde vas?")</p>
              } @else {
                <p class="text-slate-300 text-xs">
                  <span class="text-slate-500">Destino:</span> {{ tripDest()!.name }}
                </p>
              }
              <div class="grid grid-cols-2 gap-2">
                <input type="date" [(ngModel)]="schedDate"
                  class="px-3 py-2 rounded-lg text-white text-xs"
                  style="background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.1)" />
                <input type="time" [(ngModel)]="schedTime"
                  class="px-3 py-2 rounded-lg text-white text-xs"
                  style="background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.1)" />
              </div>
              <button (click)="createScheduledTripPassenger()" [disabled]="creatingSched() || !tripDest() || !schedDate || !schedTime"
                class="w-full py-3 rounded-xl text-white font-black text-sm disabled:opacity-50"
                style="background:linear-gradient(135deg,#f97316,#ea580c)">
                @if (creatingSched()) { Programando... } @else { Programar viaje }
              </button>
            </div>

            <div>
              <p class="text-white font-bold text-sm mb-2">Mis viajes programados</p>
              @if (passengerScheduled().length === 0) {
                <p class="text-slate-400 text-xs text-center py-4">No tienes viajes programados.</p>
              } @else {
                @for (s of passengerScheduled(); track s.id) {
                  <div class="rounded-xl p-3 mb-2 flex flex-col gap-2"
                    style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08)">
                    <div class="flex items-center justify-between">
                      <span class="text-white font-bold text-sm">{{ s.scheduled_for | date:'dd MMM HH:mm' }}</span>
                      <span class="text-emerald-400 font-black text-sm">{{ '$' + (s.suggested_price ?? 0).toLocaleString('es-CO') }}</span>
                    </div>
                    <p class="text-slate-400 text-xs truncate">→ {{ s.destination_address }}</p>
                    <button (click)="cancelScheduledTripPassenger(s.id)"
                      class="w-full py-1.5 rounded-lg text-xs font-bold text-red-400"
                      style="background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.3)">
                      Cancelar
                    </button>
                  </div>
                }
              }
            </div>
          </div>
        }

        <!-- ── OBJETOS OLVIDADOS (VISTA PASAJERO) ── -->
        @if (passengerSection() === 'lost') {
          <div class="flex flex-col gap-3">
            <h2 class="text-white font-black text-lg">Objetos olvidados</h2>
            <p class="text-slate-400 text-xs">Si dejaste algo en un vehículo, verás aquí los reportes del conductor.</p>
            @if (passengerLostItems().length === 0) {
              <p class="text-slate-500 text-center py-6 text-sm">Sin reportes.</p>
            } @else {
              @for (item of passengerLostItems(); track item.id) {
                <div class="rounded-2xl p-4 flex flex-col gap-2"
                  style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08)">
                  <div class="flex items-start gap-3">
                    @if (item.photo_url) {
                      <img [src]="item.photo_url" class="w-16 h-16 rounded-xl object-cover" />
                    }
                    <div class="flex-1 min-w-0">
                      <p class="text-white text-sm font-bold">{{ item.description }}</p>
                      <p class="text-slate-500 text-[10px] mt-1">{{ item.created_at | date:'dd MMM HH:mm' }}</p>
                    </div>
                    <span class="text-[10px] font-bold uppercase"
                      [class.text-yellow-400]="item.status === 'reported'"
                      [class.text-cyan-400]="item.status === 'contacted'"
                      [class.text-green-400]="item.status === 'returned'"
                      [class.text-slate-500]="item.status === 'closed'">
                      {{ item.status === 'reported' ? 'Reportado' : item.status === 'contacted' ? 'En contacto' : item.status === 'returned' ? 'Devuelto' : 'Cerrado' }}
                    </span>
                  </div>
                </div>
              }
            }
          </div>
        }

        <!-- ── REPORTAR PROBLEMA ── -->
        @if (passengerSection() === 'report') {
          <div class="flex flex-col gap-4">
            <h2 class="text-white font-black text-lg">Reportar problema</h2>

            <div class="rounded-2xl p-4 flex flex-col gap-3"
              style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08)">
              <select [value]="reportKind()" (change)="reportKind.set($any($event.target).value)"
                class="w-full px-3 py-2 rounded-lg text-white text-sm"
                style="background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.1)">
                <option value="driver">Conductor</option>
                <option value="vehicle">Vehículo</option>
                <option value="payment">Pago / cobro</option>
                <option value="incident">Incidente / emergencia</option>
                <option value="other">Otro</option>
              </select>
              <textarea [(ngModel)]="reportDescription" rows="4" maxlength="500"
                placeholder="Describe el problema con detalle"
                class="w-full px-3 py-2 rounded-lg text-white text-sm"
                style="background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.1)"></textarea>
              <button (click)="submitPassengerReport()" [disabled]="submittingReport() || !reportDescription.trim()"
                class="w-full py-3 rounded-xl text-white font-black text-sm disabled:opacity-50"
                style="background:linear-gradient(135deg,#ef4444,#dc2626)">
                @if (submittingReport()) { Enviando... } @else { Enviar reporte }
              </button>
            </div>

            @if (passengerReports().length > 0) {
              <div>
                <p class="text-white font-bold text-sm mb-2">Mis reportes anteriores</p>
                @for (r of passengerReports(); track r.id) {
                  <div class="rounded-xl p-3 mb-2"
                    style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08)">
                    <div class="flex items-center justify-between">
                      <span class="text-white text-xs font-bold uppercase">{{ r.type }}</span>
                      <span class="text-[10px] font-bold"
                        [class.text-yellow-400]="r.status === 'open'"
                        [class.text-cyan-400]="r.status === 'reviewing'"
                        [class.text-green-400]="r.status === 'resolved'"
                        [class.text-slate-500]="r.status === 'closed'">
                        {{ r.status }}
                      </span>
                    </div>
                    <p class="text-slate-300 text-xs mt-1">{{ r.description }}</p>
                    <p class="text-slate-500 text-[10px] mt-1">{{ r.created_at | date:'dd MMM HH:mm' }}</p>
                  </div>
                }
              </div>
            }
          </div>
        }

        <!-- ── LEALTAD / NIVEL ── -->
        @if (passengerSection() === 'loyalty') {
          <div class="flex flex-col gap-4">
            @if (passengerLoyalty(); as l) {
              <div class="rounded-2xl p-5 text-center"
                [style.background]="'linear-gradient(135deg,' + levelColor(l.level) + '33,' + levelColor(l.level) + '11)'"
                [style.border]="'1px solid ' + levelColor(l.level)">
                <span class="material-symbols-outlined" style="font-size:48px" [style.color]="levelColor(l.level)">workspace_premium</span>
                <p class="text-white font-black text-2xl mt-2 uppercase">{{ l.level }}</p>
                <p class="text-slate-300 text-sm mt-1">{{ l.total_trips }} viajes completados</p>
              </div>

              <div class="rounded-2xl p-4 text-center"
                style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08)">
                <p class="text-slate-400 text-xs uppercase font-bold tracking-widest">Mis puntos</p>
                <p class="text-orange-400 font-black text-3xl mt-1">{{ l.points }}</p>
                <p class="text-slate-500 text-xs mt-1">+10 puntos por cada viaje completado</p>
              </div>

              @if (tripsToNextLevel(l.level, l.total_trips); as next) {
                @if (next.remaining > 0) {
                  <div class="rounded-2xl p-4"
                    style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08)">
                    <p class="text-white text-sm font-bold mb-2">Próximo nivel: {{ next.next }}</p>
                    <p class="text-slate-400 text-xs">Te faltan <span class="text-orange-400 font-bold">{{ next.remaining }} viajes</span> para subir de nivel.</p>
                  </div>
                }
              }

              <div class="rounded-2xl p-4"
                style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08)">
                <p class="text-white text-sm font-bold mb-2">Beneficios por nivel</p>
                <ul class="text-slate-300 text-xs leading-relaxed space-y-1 list-disc list-inside">
                  <li><span class="text-slate-400">Bronce</span> — 15 viajes</li>
                  <li><span class="text-slate-300">Plata</span> — 50 viajes, descuento 5%</li>
                  <li><span class="text-yellow-400">Oro</span> — 100 viajes, descuento 10% + prioridad</li>
                  <li><span class="text-slate-200">Platino</span> — 200 viajes, descuento 15%</li>
                  <li><span class="text-cyan-300">Diamante</span> — 200+ viajes, descuento 20% + soporte VIP</li>
                </ul>
              </div>
            } @else {
              <p class="text-slate-400 text-center py-8">Cargando...</p>
            }
          </div>
        }

        <!-- ── CONDUCTORES BLOQUEADOS ── -->
        @if (passengerSection() === 'blockeddrivers') {
          <div class="flex flex-col gap-3">
            <h2 class="text-white font-black text-lg">Conductores bloqueados</h2>
            <p class="text-slate-400 text-xs">Estos conductores no verán tus próximas solicitudes de viaje.</p>

            @if (passengerBlockedDrivers().length === 0) {
              <p class="text-slate-500 text-center py-6 text-sm">No tienes conductores bloqueados.</p>
            } @else {
              @for (b of passengerBlockedDrivers(); track b.id) {
                <div class="rounded-2xl p-3 flex items-center gap-3"
                  style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08)">
                  <div class="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                    style="background:rgba(239,68,68,0.15)">
                    <span class="material-symbols-outlined text-red-400" style="font-size:20px">block</span>
                  </div>
                  <div class="flex-1 min-w-0">
                    <p class="text-white font-bold text-sm truncate">
                      {{ b.ag_drivers?.ag_users?.full_name ?? 'Conductor' }}
                    </p>
                    <p class="text-slate-400 text-xs truncate">
                      {{ b.ag_drivers?.vehicle_brand }} {{ b.ag_drivers?.vehicle_model }} · {{ b.ag_drivers?.plate }}
                    </p>
                    @if (b.reason) {
                      <p class="text-red-300 text-[10px] mt-0.5">Motivo: {{ b.reason }}</p>
                    }
                  </div>
                  <button (click)="unblockDriverAction(b.id)"
                    class="px-3 py-1.5 rounded-lg text-xs font-bold text-emerald-400"
                    style="background:rgba(16,185,129,0.15);border:1px solid rgba(16,185,129,0.3)">
                    Desbloquear
                  </button>
                </div>
              }
            }
          </div>
        }

        <!-- ── TUTORIAL PASAJERO ── -->
        @if (passengerSection() === 'tutorial') {
          <div class="flex flex-col gap-3">
            <h2 class="text-white font-black text-lg">Cómo usar Movi</h2>
            @for (step of passengerTutorialSteps; track step.title) {
              <div class="rounded-2xl p-4 flex items-start gap-3"
                style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08)">
                <span class="material-symbols-outlined text-orange-400 flex-shrink-0" style="font-size:24px">{{ step.icon }}</span>
                <div>
                  <p class="text-white font-bold text-sm">{{ step.title }}</p>
                  <p class="text-slate-400 text-xs leading-relaxed mt-1">{{ step.body }}</p>
                </div>
              </div>
            }
            <button (click)="completePassengerTutorial()" [disabled]="passengerTutorialDone()"
              class="w-full py-3 rounded-xl text-white font-black text-sm disabled:opacity-50"
              style="background:linear-gradient(135deg,#f97316,#ea580c)">
              @if (passengerTutorialDone()) { ✓ Completado } @else { He leído todo · Completar }
            </button>
          </div>
        }

        <!-- ── MI PERFIL ── -->
        @if (passengerSection() === 'profile') {
          <div class="flex flex-col gap-4">
            <h2 class="text-white font-black text-lg">Mi perfil</h2>

            <!-- Avatar + datos -->
            <div class="rounded-2xl p-5 flex flex-col items-center gap-4"
              style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08)">
              <!-- Foto -->
              <div style="width:88px;height:88px;border-radius:50%;overflow:hidden;border:3px solid rgba(249,115,22,0.5);background:rgba(249,115,22,0.1);display:flex;align-items:center;justify-content:center;flex-shrink:0">
                @if (agProfile()?.selfie_url) {
                  <img [src]="agProfile()!.selfie_url!" style="width:100%;height:100%;object-fit:cover" alt="foto" />
                } @else {
                  <span class="material-symbols-outlined" style="font-size:40px;color:rgba(249,115,22,0.6)">person</span>
                }
              </div>
              <!-- Nombre -->
              <div class="text-center">
                <p class="text-white font-black text-xl">{{ agProfile()?.full_name ?? '—' }}</p>
                @if (agProfile()?.phone) {
                  <p class="text-slate-400 text-sm mt-1">{{ agProfile()!.phone }}</p>
                }
                @if (agProfile()?.email) {
                  <p class="text-slate-500 text-xs mt-0.5">{{ agProfile()!.email }}</p>
                }
              </div>
            </div>

            <!-- Datos en lista -->
            <div class="rounded-2xl overflow-hidden" style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08)">
              <div class="flex items-center gap-3 px-4 py-3.5" style="border-bottom:1px solid rgba(255,255,255,0.06)">
                <span class="material-symbols-outlined text-orange-400 flex-shrink-0" style="font-size:18px">badge</span>
                <div class="flex-1 min-w-0">
                  <p class="text-slate-400 text-[10px] uppercase font-bold tracking-wider">Nombre</p>
                  <p class="text-white text-sm font-semibold truncate">{{ agProfile()?.full_name ?? '—' }}</p>
                </div>
              </div>
              <div class="flex items-center gap-3 px-4 py-3.5" style="border-bottom:1px solid rgba(255,255,255,0.06)">
                <span class="material-symbols-outlined text-orange-400 flex-shrink-0" style="font-size:18px">phone</span>
                <div class="flex-1 min-w-0">
                  <p class="text-slate-400 text-[10px] uppercase font-bold tracking-wider">Teléfono</p>
                  <p class="text-white text-sm font-semibold truncate">{{ agProfile()?.phone ?? '—' }}</p>
                </div>
              </div>
              <div class="flex items-center gap-3 px-4 py-3.5" style="border-bottom:1px solid rgba(255,255,255,0.06)">
                <span class="material-symbols-outlined text-orange-400 flex-shrink-0" style="font-size:18px">mail</span>
                <div class="flex-1 min-w-0">
                  <p class="text-slate-400 text-[10px] uppercase font-bold tracking-wider">Correo</p>
                  <p class="text-white text-sm font-semibold truncate">{{ agProfile()?.email ?? '—' }}</p>
                </div>
              </div>
              <div class="flex items-center gap-3 px-4 py-3.5">
                <span class="material-symbols-outlined text-orange-400 flex-shrink-0" style="font-size:18px">location_city</span>
                <div class="flex-1 min-w-0">
                  <p class="text-slate-400 text-[10px] uppercase font-bold tracking-wider">Ciudad</p>
                  <p class="text-white text-sm font-semibold truncate">{{ agProfile()?.city ?? 'No especificada' }}</p>
                </div>
              </div>
            </div>

            <!-- Nivel pasajero -->
            @if (agProfile()?.passenger_level) {
              <div class="rounded-2xl p-4 flex items-center gap-3"
                style="background:rgba(249,115,22,0.08);border:1px solid rgba(249,115,22,0.2)">
                <span class="material-symbols-outlined text-orange-400" style="font-size:24px;font-variation-settings:'FILL' 1">workspace_premium</span>
                <div class="flex-1">
                  <p class="text-white font-black text-sm uppercase">Nivel {{ agProfile()!.passenger_level }}</p>
                  <p class="text-orange-300 text-xs">{{ agProfile()!.loyalty_points ?? 0 }} puntos acumulados</p>
                </div>
              </div>
            }

            <!-- Botón editar -->
            <button (click)="openEditProfile()"
              class="w-full py-3.5 rounded-xl font-black text-sm flex items-center justify-center gap-2 active:scale-[0.98] transition-all"
              style="background:linear-gradient(135deg,#f97316,#ea580c);color:#fff">
              <span class="material-symbols-outlined" style="font-size:18px">edit</span>
              Editar perfil
            </button>
          </div>
        }

        <!-- ── CUENTA EMPRESA ── -->
        @if (passengerSection() === 'corporate') {
          <div class="flex flex-col gap-4">
            <h2 class="text-white font-black text-lg">Cuenta empresa</h2>
            <p class="text-slate-400 text-xs">Gestiona viajes corporativos con presupuesto mensual y facturación centralizada.</p>

            <div class="rounded-2xl p-4 flex flex-col gap-2"
              style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08)">
              <p class="text-white font-bold text-xs">Crear cuenta empresa</p>
              <input type="text" [(ngModel)]="newCorpName" placeholder="Nombre empresa"
                class="w-full px-3 py-2 rounded-lg text-white text-sm"
                style="background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.1)" />
              <input type="text" [(ngModel)]="newCorpNit" placeholder="NIT (opcional)"
                class="w-full px-3 py-2 rounded-lg text-white text-sm"
                style="background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.1)" />
              <input type="number" [(ngModel)]="newCorpBudget" placeholder="Presupuesto mensual (COP)"
                class="w-full px-3 py-2 rounded-lg text-white text-sm"
                style="background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.1)" />
              <button (click)="createCorporateAccount()" [disabled]="creatingCorp() || !newCorpName.trim()"
                class="w-full py-2 rounded-xl text-white font-black text-xs disabled:opacity-50"
                style="background:linear-gradient(135deg,#f97316,#ea580c)">
                @if (creatingCorp()) { Creando... } @else { + Crear cuenta }
              </button>
            </div>

            @if (passengerCorporateAccounts().length > 0) {
              @for (acc of passengerCorporateAccounts(); track acc.id) {
                <div class="rounded-2xl p-4"
                  style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08)">
                  <div class="flex items-center justify-between mb-1">
                    <p class="text-white font-bold text-sm">{{ acc.name }}</p>
                    <span class="text-[10px] font-bold uppercase text-cyan-400">{{ acc.role }}</span>
                  </div>
                  @if (acc.nit) { <p class="text-slate-500 text-xs">NIT: {{ acc.nit }}</p> }
                  <p class="text-slate-300 text-xs mt-1">
                    Presupuesto: <span class="text-emerald-400">{{ '$' + (acc.monthly_budget ?? 0).toLocaleString('es-CO') }}</span>
                    · Usado: {{ '$' + (acc.monthly_used ?? 0).toLocaleString('es-CO') }}
                  </p>
                </div>
              }
            }
          </div>
        }

      </div><!-- /inner flex -->
      </div><!-- /fullscreen overlay -->
      }

    </div>
  }

    <!-- ═══════════ CONDUCTOR DASHBOARD ═══════════ -->
  @if (screen() === 'driver-home') {
    <div class="w-full max-w-lg flex flex-col gap-5">

      <!-- Header conductor -->
      <div class="flex items-center justify-between px-1 pt-2">
        <div>
          <h1 class="font-black text-lg leading-tight" style="color:#0f172a">¡Hola, {{ firstName() }}!</h1>
          <div class="flex items-center gap-1.5 flex-wrap mt-0.5">
            <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold"
              style="background:rgba(34,211,238,0.12);border:1px solid rgba(34,211,238,0.25);color:#0891b2;font-size:11px">
              <span class="material-symbols-outlined" style="font-size:11px">directions_car</span> Modo Conductor
            </span>
          </div>
        </div>
        <button (click)="driverMenuOpen.set(true)"
          class="flex flex-col items-center justify-center gap-1 transition-all active:scale-90 rounded-xl"
          style="background:#F3F4F6;border:1px solid #E5E7EB;min-width:48px;min-height:48px;padding:8px 12px">
          <div class="flex flex-col items-center gap-1">
            <span class="block rounded-full bg-slate-600" style="width:18px;height:2px"></span>
            <span class="block rounded-full bg-slate-600" style="width:18px;height:2px"></span>
            <span class="block rounded-full bg-slate-600" style="width:14px;height:2px"></span>
          </div>
          <span class="text-slate-600 font-bold" style="font-size:10px;letter-spacing:0.06em">MENÚ</span>
        </button>
      </div>

      <!-- Drawer menú conductor -->
      @if (driverMenuOpen()) {
        <div (click)="driverMenuOpen.set(false)"
          class="fixed inset-0 z-50 transition-opacity"
          style="background:rgba(0,0,0,0.55);backdrop-filter:blur(2px)"></div>

        <div class="fixed top-0 right-0 bottom-0 z-50 flex flex-col"
          style="width:min(285px,85vw);background:#0b1220;border-left:1px solid rgba(8,145,178,0.15);box-shadow:-8px 0 32px rgba(0,0,0,0.6)">

          <!-- Cabecera -->
          <div class="flex items-center justify-between px-4 pt-[max(2.5rem,env(safe-area-inset-top))] pb-4"
            style="border-bottom:1px solid rgba(255,255,255,0.07)">
            <div class="flex items-center gap-2.5">
              <img src="movi-logo.svg" alt="Movi" class="w-9 h-9 rounded-xl" />
              <div>
                <p class="text-white font-black text-sm">Movi · Conductor</p>
                <p class="text-slate-400 text-xs font-medium">{{ agProfile()?.full_name }}</p>
              </div>
            </div>
            <button (click)="driverMenuOpen.set(false)"
              class="w-8 h-8 rounded-lg flex items-center justify-center active:scale-90"
              style="background:rgba(255,255,255,0.06)">
              <span class="material-symbols-outlined text-slate-400" style="font-size:20px">close</span>
            </button>
          </div>

          <!-- Estado en línea badge -->
          <button (click)="toggleOnline()" [disabled]="togglingOnline()"
            class="mx-4 mt-4 flex items-center gap-3 px-4 py-3 rounded-xl w-[calc(100%-2rem)] transition-all active:scale-[0.98] disabled:opacity-60"
            [style]="driverOnline() ? 'background:rgba(16,185,129,0.08);border:1px solid rgba(16,185,129,0.25)' : 'background:rgba(148,163,184,0.06);border:1px solid rgba(148,163,184,0.2)'">
            @if (togglingOnline()) {
              <span class="material-symbols-outlined animate-spin flex-shrink-0" style="font-size:16px;color:#94a3b8">autorenew</span>
            } @else {
              <div class="w-2.5 h-2.5 rounded-full flex-shrink-0"
                [style]="driverOnline() ? 'background:#34d399;box-shadow:0 0 6px #34d399' : 'background:#94a3b8'"></div>
            }
            <div class="flex-1 text-left">
              <p class="font-black text-xs" [style.color]="driverOnline() ? '#34d399' : '#94a3b8'">{{ driverOnline() ? 'En línea' : 'Fuera de línea' }}</p>
              <p class="text-slate-500 text-[10px]">{{ driverOnline() ? 'Disponible para viajes' : 'Toca para conectarte' }}</p>
            </div>
            <div class="w-10 h-5 rounded-full flex items-center px-0.5 transition-colors flex-shrink-0"
              [style]="driverOnline() ? 'background:linear-gradient(135deg,#10b981,#059669)' : 'background:#374151'">
              <div class="w-4 h-4 rounded-full bg-white transition-transform"
                [style.transform]="driverOnline() ? 'translateX(20px)' : 'translateX(0)'"></div>
            </div>
          </button>

          <!-- Estado notificaciones — visible siempre en el drawer -->
          @if (driverOnline()) {
            <div class="mx-4 mt-2 rounded-xl px-3 py-2 flex items-center gap-2 w-[calc(100%-2rem)]"
              [style]="pushDiagStatus() === 'ok' ? 'background:rgba(16,185,129,0.08);border:1px solid rgba(16,185,129,0.2)' : 'background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.2)'">
              <span class="material-symbols-outlined flex-shrink-0" style="font-size:16px"
                [style.color]="pushDiagStatus() === 'ok' ? '#34d399' : '#f87171'">
                {{ pushDiagStatus() === 'ok' ? 'notifications_active' : 'notifications_off' }}
              </span>
              <p class="text-xs flex-1"
                [style.color]="pushDiagStatus() === 'ok' ? '#34d399' : '#f87171'">
                {{ pushDiagLabel() }}
              </p>
              @if (pushDiagStatus() !== 'ok' && pushDiagStatus() !== 'checking') {
                <button (click)="fixPushNotifications()"
                  class="text-xs font-bold px-2 py-1 rounded-lg flex-shrink-0"
                  style="background:rgba(124,58,237,0.2);color:#a78bfa">
                  Activar
                </button>
              }
            </div>
          }

          <!-- Opciones -->
          <nav class="flex-1 overflow-y-auto py-3 px-3">
            @for (item of driverMenuItems; track item.label) {
              @if (item.divider) {
                <div class="my-2" style="border-top:1px solid rgba(255,255,255,0.06)"></div>
                @if (item.sectionLabel) {
                  <p class="text-slate-600 text-xs font-bold uppercase tracking-widest px-3 pb-2 pt-1">{{ item.sectionLabel }}</p>
                }
              } @else {
                <button (click)="openDriverSection(item.action)"
                  class="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-left transition-all active:scale-[0.98] mb-0.5"
                  [style.color]="item.danger ? '#f87171' : '#cbd5e1'"
                  onmouseover="this.style.background='rgba(8,145,178,0.08)'"
                  onmouseout="this.style.background='transparent'">
                  <span class="material-symbols-outlined flex-shrink-0" style="font-size:20px"
                    [style.color]="item.danger ? '#f87171' : '#22d3ee'">{{ item.icon }}</span>
                  <span class="text-sm font-medium">{{ item.label }}</span>
                </button>
              }
            }
          </nav>

          <!-- Footer -->
          <div class="px-5 py-5" style="border-top:1px solid rgba(255,255,255,0.07)">
            <p class="text-slate-600 text-xs text-center">Movi · Conductor v1.0</p>
          </div>
        </div>
      }

      <!-- ══ Tarjetas rápidas: Beneficios + Referidos ══ -->
      <div class="grid grid-cols-2 gap-2">
        <!-- Mis Beneficios -->
        <button (click)="openDriverSection('benefits')"
          class="flex flex-col items-start gap-1.5 active:scale-[0.98] transition-transform"
          style="background:linear-gradient(135deg,#d97706,#b45309);border-radius:12px;padding:10px 12px;border:none;cursor:pointer;position:relative;overflow:hidden">
          <div class="flex items-center justify-between w-full">
            <div class="flex items-center justify-center flex-shrink-0"
              style="width:28px;height:28px;border-radius:8px;background:rgba(255,255,255,0.18)">
              <span class="material-symbols-outlined" style="font-size:16px;color:#fff;font-variation-settings:'FILL' 1">workspace_premium</span>
            </div>
          </div>
          <div class="text-left">
            <p style="color:#fff;font-weight:700;font-size:12px;margin:0;line-height:1.3">Mis Beneficios</p>
            <p style="color:rgba(255,255,255,0.8);font-size:10px;margin:0;line-height:1.3">Ver beneficios</p>
          </div>
        </button>
        <!-- Gana por invitar -->
        <button (click)="openDriverSection('referrals')"
          class="flex flex-col items-start gap-1.5 active:scale-[0.98] transition-transform"
          style="background:linear-gradient(135deg,#7C3AED,#3B82F6);border-radius:12px;padding:10px 12px;border:none;cursor:pointer">
          <div class="flex items-center justify-center flex-shrink-0"
            style="width:28px;height:28px;border-radius:8px;background:rgba(255,255,255,0.15)">
            <span class="material-symbols-outlined" style="font-size:16px;color:rgba(255,255,255,0.9);font-variation-settings:'FILL' 1">redeem</span>
          </div>
          <div class="text-left">
            <p style="color:#fff;font-weight:700;font-size:12px;margin:0;line-height:1.3">Gana Invitando</p>
            <p style="color:rgba(255,255,255,0.8);font-size:10px;margin:0;line-height:1.3">Gana 2% por cada referido</p>
          </div>
        </button>
      </div>
      <!-- Banner resultado pago wallet -->
      @if (walletPaymentResult() === 'processing') {
        <div class="w-full flex items-center gap-2 px-4 py-3 rounded-2xl"
          style="background:linear-gradient(135deg,#1e3a5f,#1e40af);border:1px solid rgba(96,165,250,0.4)">
          <span class="material-symbols-outlined animate-spin" style="font-size:18px;color:#93c5fd">autorenew</span>
          <p style="color:#93c5fd;font-size:13px;font-weight:700;margin:0">Verificando tu pago...</p>
        </div>
      }
      @if (walletPaymentResult() === 'ok') {
        <div class="w-full flex items-center gap-2 px-4 py-3 rounded-2xl"
          style="background:linear-gradient(135deg,#052e16,#14532d);border:1px solid rgba(74,222,128,0.4)">
          <span class="material-symbols-outlined" style="font-size:18px;color:#4ade80;font-variation-settings:'FILL' 1">check_circle</span>
          <div>
            <p style="color:#4ade80;font-size:13px;font-weight:700;margin:0">¡Pago recibido!</p>
            <p style="color:rgba(74,222,128,0.7);font-size:11px;margin:0">Saldo actualizado en tu billetera</p>
          </div>
        </div>
      }
      <!-- ══ Tarjeta Wallet (saldo de recarga) — siempre visible, toggle panel ══ -->
      <button (click)="walletPanelOpen.set(!walletPanelOpen())"
        class="w-full flex items-center gap-3 active:scale-[0.98] transition-transform"
        [style]="walletPanelOpen()
          ? 'background:linear-gradient(135deg,#0f172a,#1e293b);border:1.5px solid rgba(34,211,238,0.5);border-radius:18px 18px 0 0;padding:14px 16px;cursor:pointer;position:relative;overflow:hidden'
          : 'background:linear-gradient(135deg,#0f172a,#1e293b);border:1.5px solid rgba(34,211,238,0.25);border-radius:18px;padding:14px 16px;cursor:pointer;position:relative;overflow:hidden'">
        <!-- glow -->
        <div style="position:absolute;top:-20px;right:-20px;width:100px;height:100px;border-radius:50%;background:rgba(34,211,238,0.08);pointer-events:none"></div>
        <div class="flex items-center justify-center flex-shrink-0"
          style="width:44px;height:44px;border-radius:12px;background:linear-gradient(135deg,rgba(34,211,238,0.2),rgba(6,182,212,0.12));border:1px solid rgba(34,211,238,0.3)">
          <span class="material-symbols-outlined" style="font-size:22px;color:#22d3ee;font-variation-settings:'FILL' 1">account_balance_wallet</span>
        </div>
        <div class="flex-1 min-w-0 text-left">
          <p style="color:rgba(148,163,184,0.9);font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;margin:0">Saldo de Recarga</p>
          <p style="color:#fff;font-size:20px;font-weight:900;margin:0;line-height:1.15;letter-spacing:-0.01em">{{ formatCOP(driverWalletBalance()) }}</p>
          <p style="color:rgba(34,211,238,0.7);font-size:10px;font-weight:600;margin:0;margin-top:1px">Se descuenta desde la 2ª carrera</p>
        </div>
        <div class="flex flex-col items-center gap-0.5 flex-shrink-0">
          @if (walletPanelOpen()) {
            <div class="flex items-center gap-1 px-2.5 py-1.5 rounded-xl"
              style="background:rgba(239,68,68,0.12);border:1px solid rgba(239,68,68,0.3)">
              <span class="material-symbols-outlined" style="font-size:15px;color:#f87171">expand_less</span>
              <span style="color:#f87171;font-size:11px;font-weight:800">Cerrar</span>
            </div>
          } @else {
            <div class="flex items-center gap-1 px-2.5 py-1.5 rounded-xl"
              style="background:linear-gradient(135deg,rgba(34,211,238,0.2),rgba(6,182,212,0.12));border:1px solid rgba(34,211,238,0.3)">
              <span class="material-symbols-outlined" style="font-size:14px;color:#22d3ee">add_circle</span>
              <span style="color:#22d3ee;font-size:11px;font-weight:800">Recargar</span>
            </div>
          }
        </div>
      </button>

      <!-- Panel de recarga inline (se abre debajo de la tarjeta) -->
      @if (walletPanelOpen()) {
        <div style="background:#FFFFFF;border:1.5px solid rgba(34,211,238,0.25);border-top:none;border-radius:0 0 18px 18px;padding:16px;display:flex;flex-direction:column;gap:12px;margin-top:-2px">
          <!-- Montos rápidos -->
          <div class="grid grid-cols-3 gap-2">
            @for (amt of rechargePresets; track amt) {
              <button (click)="rechargeAmount.set(amt)"
                class="py-2.5 rounded-xl text-xs font-black transition-all active:scale-95"
                [style]="rechargeAmount() === amt
                  ? 'background:linear-gradient(135deg,#0891b2,#0e7490);color:#fff'
                  : 'background:#F3F4F6;border:1px solid #E5E7EB;color:#374151'">
                {{ formatAmt(amt) }}
              </button>
            }
          </div>
          <!-- Monto personalizado -->
          <div class="flex items-center gap-2 rounded-xl px-3 py-2"
            style="background:#F9FAFB;border:1px solid #E2E8F0">
            <span class="text-slate-600 text-sm font-bold">$</span>
            <input type="number" [(ngModel)]="rechargeCustom"
              (input)="rechargeAmount.set(+rechargeCustom || 0)"
              placeholder="Otro monto..."
              class="flex-1 bg-transparent text-slate-900 text-sm outline-none placeholder-slate-400"/>
            <span class="text-slate-500 text-xs">COP</span>
          </div>
          @if (rechargeError()) {
            <div class="w-full rounded-2xl p-4 flex flex-col gap-2"
              style="background:linear-gradient(135deg,#450a0a,#7f1d1d);border:2px solid #ef4444">
              <div class="flex items-center gap-2">
                <span class="material-symbols-outlined" style="font-size:20px;color:#fca5a5;font-variation-settings:'FILL' 1">error</span>
                <p style="color:#fca5a5;font-size:13px;font-weight:900;margin:0">Error al iniciar el pago</p>
              </div>
              <p style="color:#fca5a5;font-size:12px;margin:0;word-break:break-all">{{ rechargeError() }}</p>
              <button (click)="rechargeError.set(null)"
                class="mt-1 self-start px-3 py-1 rounded-lg text-xs font-bold"
                style="background:rgba(239,68,68,0.25);color:#fca5a5;border:1px solid rgba(239,68,68,0.4)">
                Cerrar
              </button>
            </div>
          }
          <button (click)="startWalletRecharge()"
            [disabled]="rechargeAmount() < 5000 || rechargeLoading()"
            class="w-full py-3 rounded-xl font-black text-sm flex items-center justify-center gap-2 disabled:opacity-40 transition-all active:scale-[0.98]"
            style="background:linear-gradient(135deg,#0f6fde,#1d4ed8);color:#fff">
            @if (rechargeLoading()) {
              <span class="material-symbols-outlined animate-spin" style="font-size:16px">autorenew</span> Abriendo pago...
            } @else {
              <span class="material-symbols-outlined" style="font-size:16px">credit_card</span>
              Pagar {{ rechargeAmount() >= 5000 ? formatCOP(rechargeAmount()) : '' }}
            }
          </button>
          <p class="text-slate-400 text-[10px] text-center">Mínimo {{ formatCOP(5000) }} · Pago seguro con ePayco</p>
        </div>
      }

      <!-- ══ Gana por invitar conductor (full-width, hidden — kept for menu) ══ -->
      <button (click)="openDriverSection('referrals')" class="hidden"
        style="background:linear-gradient(135deg,#7C3AED,#3B82F6);border-radius:16px;padding:14px 16px;border:none;cursor:pointer">
        <div class="flex items-center justify-center flex-shrink-0"
          style="width:40px;height:40px;border-radius:12px;background:rgba(255,255,255,0.15)">
          <span class="material-symbols-outlined" style="font-size:22px;color:rgba(255,255,255,0.9);font-variation-settings:'FILL' 1">redeem</span>
        </div>
        <div class="flex-1 min-w-0 text-left">
          <p style="color:#fff;font-weight:600;font-size:14px;margin:0;line-height:1.3">Gana por invitar</p>
          <p style="color:rgba(255,255,255,0.8);font-size:12px;margin:0;line-height:1.3">Invita conductores y pasajeros</p>
        </div>
        <div class="flex items-center gap-1 flex-shrink-0">
          <span style="color:#fff;font-size:12px;font-weight:500">Invitar</span>
          <span class="material-symbols-outlined" style="font-size:16px;color:#fff">arrow_forward</span>
        </div>
      </button>

      @if (driverSection() === null) {

      @if (driverStatus() === 'quick') {
        <div class="rounded-2xl p-4 flex items-start gap-3"
          style="background:linear-gradient(135deg,rgba(124,58,237,0.10),rgba(59,130,246,0.07));border:1px solid rgba(124,58,237,0.25)">
          <span class="material-symbols-outlined flex-shrink-0" style="font-size:28px;color:#7C3AED">rocket_launch</span>
          <div>
            <p class="font-black text-sm" style="color:#0f172a">No necesitas saldo para tu primera carrera</p>
            <p class="text-slate-600 text-xs leading-relaxed mt-0.5">Acepta un viaje ahora mismo sin saldo ni aprobación. Después de tu primer viaje completa tu registro.</p>
          </div>
        </div>
      }
      @if (driverStatus() === 'pending_docs') {
        <div class="rounded-2xl p-4 flex flex-col gap-3"
          style="background:rgba(249,115,22,0.07);border:1px solid rgba(249,115,22,0.25)">
          <div class="flex items-start gap-3">
            <span class="material-symbols-outlined text-orange-500 flex-shrink-0" style="font-size:28px">assignment</span>
            <div>
              <p class="font-black text-sm" style="color:#0f172a">Completa tu registro</p>
              <p class="text-slate-600 text-xs leading-relaxed mt-0.5">¡Felicitaciones por tu primer viaje! Para seguir aceptando servicios envía tu documentación completa.</p>
            </div>
          </div>
          <button (click)="screen.set('driver-form')"
            class="w-full py-2.5 rounded-xl text-white text-xs font-black flex items-center justify-center gap-2 active:scale-[0.98] transition-all"
            style="background:linear-gradient(135deg,#f97316,#ea580c)">
            <span class="material-symbols-outlined" style="font-size:16px">edit_document</span>
            Enviar documentación
          </button>
        </div>
      }
      @if (driverStatus() === 'pending') {
        <div class="rounded-2xl p-5 text-center flex flex-col items-center gap-2"
          style="background:#FFFBEB;border:1px solid rgba(251,191,36,0.4)">
          <span class="material-symbols-outlined text-amber-500" style="font-size:36px">hourglass_top</span>
          <p class="font-bold text-sm" style="color:#0f172a">Tu solicitud está siendo revisada</p>
          <p class="text-slate-600 text-xs leading-relaxed">Nuestro equipo verificará tus documentos en las próximas 24–48 horas.</p>
        </div>
      }
      @if (driverStatus() === 'approved') {
        <!-- Viajes activos del conductor -->
        @if (driverActiveTrips().length > 0) {
          <div class="flex flex-col gap-2">
            <p class="text-slate-400 text-xs font-bold uppercase tracking-widest px-1">Viajes en curso</p>
            @for (trip of driverActiveTrips(); track trip.id) {
              <div class="rounded-2xl overflow-hidden" style="background:#FFFFFF;border:1px solid rgba(16,185,129,0.35);box-shadow:0 2px 8px rgba(0,0,0,0.06)">
                <div class="flex items-center gap-3 px-4 py-3">
                  <div class="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                    style="background:rgba(16,185,129,0.1);border:1px solid rgba(16,185,129,0.2)">
                    <span class="material-symbols-outlined text-emerald-500" style="font-size:18px">directions_car</span>
                  </div>
                  <div class="flex-1 min-w-0">
                    <p class="font-bold text-sm truncate" style="color:#0f172a">{{ trip.ag_trip_requests?.ag_users?.full_name ?? 'Pasajero' }}</p>
                    <p class="text-slate-600 text-xs truncate">→ {{ trip.ag_trip_requests?.dest_name }}</p>
                    <!-- Método de pago -->
                    <div class="flex items-center gap-2 mt-1">
                      <div class="flex items-center gap-1 px-2 py-0.5 rounded-full"
                        [style.background]="getPaymentInfo(trip.ag_trip_requests?.payment_method).bgDark"
                        [style.border]="'1px solid ' + getPaymentInfo(trip.ag_trip_requests?.payment_method).colorDark">
                        <span class="material-symbols-outlined" style="font-size:10px"
                          [style.color]="getPaymentInfo(trip.ag_trip_requests?.payment_method).colorDark">{{ getPaymentInfo(trip.ag_trip_requests?.payment_method).icon }}</span>
                        <span class="text-[9px] font-bold"
                          [style.color]="getPaymentInfo(trip.ag_trip_requests?.payment_method).colorDark">{{ getPaymentInfo(trip.ag_trip_requests?.payment_method).label }}</span>
                      </div>
                      @if (trip.ag_trip_requests?.ag_users?.phone) {
                        <a [href]="'tel:' + trip.ag_trip_requests.ag_users.phone" class="flex items-center gap-1 text-[9px] text-slate-500 hover:text-white transition-colors">
                          <span class="material-symbols-outlined" style="font-size:10px">call</span>
                          {{ trip.ag_trip_requests.ag_users.phone }}
                        </a>
                      }
                    </div>
                  </div>
                  <p class="text-emerald-400 font-black text-sm flex-shrink-0">{{ formatCOP(trip.offered_price) }}</p>
                </div>
                <!-- Estados del viaje -->
                <div class="px-4 pb-2 flex items-center gap-1">
                  @for (st of tripStages; track st.key) {
                    <div class="flex-1 flex flex-col items-center gap-0.5">
                      <div class="w-full h-1 rounded-full"
                        [style.background]="isStageReached(trip.ag_trip_requests?.driver_stage, st.key) ? '#10b981' : '#E2E8F0'"></div>
                      <span class="text-[10px] font-bold"
                        [style.color]="isStageReached(trip.ag_trip_requests?.driver_stage, st.key) ? '#059669' : '#94a3b8'">{{ st.label }}</span>
                    </div>
                  }
                </div>
                <!-- Botones contextuales según etapa del viaje (estilo inDrive) -->
                <div class="px-4 pb-3 flex flex-col gap-2">
                  <!-- Fila: Chat + Llamar siempre -->
                  <div class="flex gap-2">
                    <button (click)="openDriverChat(trip)"
                      class="flex-1 py-2.5 rounded-xl text-white text-xs font-black flex items-center justify-center gap-1 active:scale-[0.98]"
                      style="background:linear-gradient(135deg,#2563eb,#3b82f6)">
                      <span class="material-symbols-outlined" style="font-size:15px">chat</span>Chat
                    </button>
                    <button (click)="callPassengerFromTrip(trip)"
                      class="flex-1 py-2.5 rounded-xl text-white text-xs font-black flex items-center justify-center gap-1 active:scale-[0.98]"
                      style="background:linear-gradient(135deg,#16a34a,#22c55e)">
                      <span class="material-symbols-outlined" style="font-size:15px">call</span>Llamar
                    </button>
                  </div>
                  <!-- Etapa 1: sin etapa o heading_to_pickup → mostrando camino al pasajero -->
                  @if (!trip.ag_trip_requests?.driver_stage || trip.ag_trip_requests?.driver_stage === 'heading_to_pickup') {
                    <button (click)="startInAppNav(trip, true)"
                      class="w-full py-3 rounded-xl text-white text-sm font-black flex items-center justify-center gap-2 active:scale-[0.98]"
                      style="background:linear-gradient(135deg,#7c3aed,#6366f1)">
                      <span class="material-symbols-outlined" style="font-size:18px">navigation</span>Navegar al punto de recogida
                    </button>
                    <button (click)="advanceStage(trip, 'arrived_at_pickup')"
                      class="w-full py-3 rounded-xl text-white text-sm font-black flex items-center justify-center gap-2 active:scale-[0.98]"
                      style="background:linear-gradient(135deg,#0891b2,#06b6d4)">
                      <span class="material-symbols-outlined" style="font-size:18px">where_to_vote</span>Llegué al punto de recogida
                    </button>
                  }
                  <!-- Etapa 2: arrived_at_pickup → esperando al pasajero -->
                  @if (trip.ag_trip_requests?.driver_stage === 'arrived_at_pickup') {
                    <div class="flex items-center gap-2 px-3 py-2 rounded-xl"
                      style="background:#fef9c3;border:1px solid #fde047">
                      <span class="material-symbols-outlined text-yellow-600" style="font-size:16px">hourglass_top</span>
                      <span class="text-yellow-700 text-xs font-bold">Esperando al pasajero...</span>
                    </div>
                    <button (click)="advanceStage(trip, 'picked_up')"
                      class="w-full py-3 rounded-xl text-white text-sm font-black flex items-center justify-center gap-2 active:scale-[0.98]"
                      style="background:linear-gradient(135deg,#0891b2,#06b6d4)">
                      <span class="material-symbols-outlined" style="font-size:18px">person_check</span>Pasajero a bordo
                    </button>
                  }
                  <!-- Etapa 3: picked_up → iniciar ruta -->
                  @if (trip.ag_trip_requests?.driver_stage === 'picked_up') {
                    <button (click)="advanceStage(trip, 'on_route')"
                      class="w-full py-3 rounded-xl text-white text-sm font-black flex items-center justify-center gap-2 active:scale-[0.98]"
                      style="background:linear-gradient(135deg,#f59e0b,#f97316)">
                      <span class="material-symbols-outlined" style="font-size:18px">directions_car</span>Iniciar viaje
                    </button>
                  }
                  <!-- Etapa 4: on_route → navegando al destino -->
                  @if (trip.ag_trip_requests?.driver_stage === 'on_route') {
                    <button (click)="startInAppNav(trip, false)"
                      class="w-full py-3 rounded-xl text-white text-sm font-black flex items-center justify-center gap-2 active:scale-[0.98]"
                      style="background:linear-gradient(135deg,#f59e0b,#f97316)">
                      <span class="material-symbols-outlined" style="font-size:18px">navigation</span>Navegar al destino
                    </button>
                    <button (click)="finishDriverTrip(trip)"
                      class="w-full py-3 rounded-xl text-white text-sm font-black flex items-center justify-center gap-2 active:scale-[0.98]"
                      style="background:linear-gradient(135deg,#16a34a,#15803d)">
                      <span class="material-symbols-outlined" style="font-size:18px">check_circle</span>Finalizar viaje
                    </button>
                  }
                  <!-- Etapa final: arrived_at_destination -->
                  @if (trip.ag_trip_requests?.driver_stage === 'arrived_at_destination' || trip.ag_trip_requests?.driver_stage === 'completed') {
                    <button (click)="finishDriverTrip(trip)"
                      class="w-full py-3 rounded-xl text-white text-sm font-black flex items-center justify-center gap-2 active:scale-[0.98]"
                      style="background:linear-gradient(135deg,#16a34a,#15803d)">
                      <span class="material-symbols-outlined" style="font-size:18px">check_circle</span>Finalizar viaje
                    </button>
                  }
                </div>
              </div>
            }
          </div>
        }

      }
      @if (driverStatus() !== 'rejected') {
        <!-- Solicitudes en vivo: solo label + contador, el modal flotante muestra el detalle -->
        <div class="flex items-center justify-between px-1">
          <div class="flex items-center gap-2">
            <p class="text-slate-700 text-xs font-black uppercase tracking-widest">Solicitudes en vivo</p>
            @if (driverRequests().length > 0) {
              <span style="background:linear-gradient(135deg,#0891b2,#0e7490);color:#fff;font-size:10px;font-weight:900;padding:2px 7px;border-radius:999px">{{ driverRequests().length }}</span>
            }
          </div>
          <button (click)="refreshDriverRequests()"
            class="flex items-center gap-1 text-xs text-cyan-600 font-bold active:scale-95 transition-all">
            <span class="material-symbols-outlined" style="font-size:14px">refresh</span> Actualizar
          </button>
        </div>
      }
      @if (driverStatus() === 'rejected') {
        <div class="bg-rose-50 border border-rose-200 rounded-2xl p-5 flex flex-col gap-3">
          <div class="flex items-start gap-3">
            <span class="material-symbols-outlined text-rose-500 flex-shrink-0" style="font-size:28px">cancel</span>
            <div>
              <p class="font-bold text-sm" style="color:#0f172a">Tu solicitud fue rechazada</p>
              @if (driverRejectionReason()) {
                <p class="text-slate-600 text-xs leading-relaxed mt-1"><span class="text-rose-600 font-bold">Motivo:</span> {{ driverRejectionReason() }}</p>
              }
            </div>
          </div>
          <p class="text-slate-500 text-xs">Corrige los datos o documentos indicados y vuelve a enviar tu solicitud.</p>
          <button (click)="screen.set('driver-form')"
            class="w-full py-2.5 rounded-xl text-white text-xs font-black flex items-center justify-center gap-2 active:scale-[0.98] transition-all"
            style="background:linear-gradient(135deg,#ef4444,#b91c1c)">
            <span class="material-symbols-outlined" style="font-size:16px">refresh</span>
            Volver a aplicar
          </button>
        </div>
      }

      <!-- Mapa + dirección -->
      <div class="flex flex-col gap-2">

        @if (gpsStatus() !== 'requesting') {
          <div class="relative">
            @if (!addressEditMode()) {
              <button (click)="openAddressEdit()"
                class="w-full flex items-center gap-3 bg-white rounded-2xl px-4 py-3 shadow-lg shadow-black/20 text-left transition-all hover:shadow-xl active:scale-[0.98]">
                <span class="material-symbols-outlined text-cyan-500 flex-shrink-0" style="font-size:22px">location_on</span>
                <div class="flex-1 min-w-0">
                  @if (addressLoading()) {
                    <p class="text-slate-400 text-sm animate-pulse">Obteniendo dirección...</p>
                  } @else if (currentAddress()) {
                    <p class="text-slate-800 text-sm font-semibold truncate">{{ currentAddress() }}</p>
                    <div class="flex items-center gap-2 mt-0.5 flex-wrap">
                      @if (currentNeighborhood()) {
                        <p class="text-orange-500 text-xs font-medium truncate">{{ currentNeighborhood() }}</p>
                      } @else {
                        <p class="text-slate-400 text-xs">Toca para cambiar tu ubicación</p>
                      }
                      @if (gpsAccuracy() !== null) {
                        <span class="flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0"
                          [style.background]="gpsAccuracy()! <= 10 ? '#d1fae5' : gpsAccuracy()! <= 30 ? '#fef9c3' : '#fee2e2'"
                          [style.color]="gpsAccuracy()! <= 10 ? '#065f46' : gpsAccuracy()! <= 30 ? '#713f12' : '#991b1b'">
                          <span class="material-symbols-outlined" style="font-size:11px">my_location</span>
                          Precisión ±{{ gpsAccuracy() }}m
                        </span>
                      }
                    </div>
                  } @else {
                    <p class="text-slate-500 text-sm">Dirección no disponible</p>
                    <p class="text-slate-400 text-xs mt-0.5">Toca para buscar tu ubicación</p>
                  }
                </div>
                <span class="material-symbols-outlined text-slate-400 flex-shrink-0" style="font-size:18px">edit</span>
              </button>
            } @else {
              <div class="flex flex-col bg-white rounded-2xl shadow-xl shadow-black/20 overflow-hidden">
                <div class="flex items-center gap-3 px-4 py-3 border-b border-slate-200">
                  <span class="material-symbols-outlined text-cyan-500" style="font-size:20px">search</span>
                  <input #addrInput
                    (input)="onAddressInput($any($event.target).value)"
                    (paste)="handlePaste($any($event), 'address')"
                    (keydown.escape)="closeAddressEdit()"
                    (keydown.enter)="saveManualAddress()"
                    placeholder="Escribe tu dirección exacta de recogida..."
                    autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" inputmode="text"
                    class="flex-1 text-slate-800 text-sm outline-none placeholder-slate-400 bg-transparent"/>
                  <div class="flex items-center gap-1 flex-shrink-0">
                    <button (click)="clearAddressQuery()"
                      class="flex items-center justify-center w-8 h-8 rounded-full bg-slate-100 active:bg-slate-200">
                      <span class="material-symbols-outlined text-slate-500" style="font-size:18px">close</span>
                    </button>
                    <button (click)="saveManualAddress()"
                      class="flex items-center justify-center w-9 h-9 rounded-full shadow-md active:scale-95 transition-transform"
                      style="background:#16a34a;box-shadow:0 2px 8px rgba(22,163,74,0.5)">
                      <span class="material-symbols-outlined text-white" style="font-size:22px;font-variation-settings:'wght' 700">check</span>
                    </button>
                  </div>
                </div>
                @if (addressSuggestions().length === 0 && !addressNoResults() && recentOrigins().length > 0) {
                  <div class="flex flex-col divide-y divide-slate-100 max-h-48 overflow-y-auto">
                    <p class="px-4 pt-2 pb-1 text-slate-400 text-[10px] font-black uppercase tracking-widest">Recientes</p>
                    @for (r of recentOrigins(); track r.name) {
                      <button (click)="selectRecentOrigin(r)"
                        class="flex items-center gap-3 px-4 py-3 text-left hover:bg-orange-50 active:bg-orange-50 transition-colors">
                        <span class="material-symbols-outlined text-orange-300 flex-shrink-0" style="font-size:18px">history</span>
                        <p class="flex-1 text-slate-800 text-sm font-semibold truncate">{{ r.name }}</p>
                      </button>
                    }
                  </div>
                }
                @if (addressSuggestions().length > 0) {
                  <div class="flex flex-col divide-y divide-slate-100 max-h-48 overflow-y-auto">
                    @for (s of addressSuggestions(); track s.place_id) {
                      <button (click)="selectAddress(s)"
                        class="flex items-center gap-3 px-4 py-3 text-left hover:bg-orange-50 active:bg-orange-50 transition-colors">
                        <span class="material-symbols-outlined text-orange-400 flex-shrink-0" style="font-size:18px">place</span>
                        <div class="flex-1 min-w-0">
                          <p class="text-slate-800 text-sm font-semibold truncate">{{ s.text }}</p>
                          @if (s.place_name) {
                            <p class="text-slate-400 text-xs truncate">{{ s.place_name }}</p>
                          }
                        </div>
                      </button>
                    }
                  </div>
                } @else if (addressNoResults()) {
                  <p class="text-slate-400 text-xs text-center py-3">Sin resultados. Intenta con otra dirección.</p>
                }
              </div>
            }
          </div>
        }

        @if (gpsStatus() === 'requesting') {
          <div class="rounded-2xl bg-slate-50 border border-slate-200 h-60 flex flex-col items-center justify-center gap-3">
            <span class="material-symbols-outlined text-cyan-500 animate-pulse" style="font-size:38px">my_location</span>
            <p class="text-slate-700 text-sm font-bold">Obteniendo tu ubicación...</p>
            <p class="text-slate-500 text-xs">Acepta el permiso en tu dispositivo</p>
          </div>
        }

        <div [class]="driverMapFullscreen() ? 'fixed inset-0 z-[9850]' : 'relative'">
          <div id="ag-map-user"
            [style.height]="driverMapFullscreen() ? '100dvh' : navActive() ? 'clamp(320px,48dvh,420px)' : 'clamp(240px,38dvh,300px)'"
            [style.border-radius]="driverMapFullscreen() ? '0' : '16px'"
            [style.border]="driverMapFullscreen() ? 'none' : '1px solid #E2E8F0'"
            style="overflow:hidden;transition:height 0.35s ease"
            [style.display]="gpsStatus() === 'requesting' ? 'none' : 'block'"></div>

          <!-- ── Overlay de navegación conductor ── -->
          @if (navActive()) {
            <!-- Banner instrucción actual (arriba del mapa) -->
            <div class="absolute top-0 left-0 right-0 z-30 pointer-events-none"
              style="background:linear-gradient(180deg,rgba(10,40,90,0.97) 0%,rgba(10,40,90,0.92) 85%,transparent 100%);border-radius:16px 16px 0 0;padding:calc(env(safe-area-inset-top,0px) + 14px) 16px 24px">
              <div class="flex items-center gap-3">
                <div class="w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0"
                  style="background:rgba(37,99,235,0.3);border:2px solid rgba(37,99,235,0.6)">
                  <span class="material-symbols-outlined" style="font-size:clamp(22px,7vw,28px);color:#93c5fd">{{ navManeuverIcon() }}</span>
                </div>
                <div class="flex-1 min-w-0">
                  <p class="text-white font-black text-sm leading-tight" style="display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">
                    {{ navInstruction() }}
                  </p>
                  @if (navDistToNext()) {
                    <p class="font-black text-lg mt-0.5" style="color:#60a5fa">{{ navDistToNext() }}</p>
                  }
                </div>
              </div>
            </div>
            <!-- Barra inferior: ETA + km + fase + stop -->
            <div class="absolute bottom-0 left-0 right-0 z-30"
              style="background:linear-gradient(0deg,rgba(10,10,20,0.97) 0%,rgba(10,10,20,0.85) 80%,transparent 100%);border-radius:0 0 16px 16px;padding:18px 16px calc(env(safe-area-inset-bottom,0px) + 14px)">
              <div class="flex items-center gap-2">
                <!-- ETA -->
                <div class="flex flex-col items-center px-2.5 py-2 rounded-xl min-w-[48px]" style="background:rgba(255,255,255,0.06)">
                  <p class="text-white font-black text-lg leading-none">{{ navEtaMin() }}</p>
                  <p class="text-slate-400 text-[10px] font-bold">min</p>
                </div>
                <!-- km -->
                <div class="flex flex-col items-center px-2.5 py-2 rounded-xl min-w-[48px]" style="background:rgba(255,255,255,0.06)">
                  <p class="text-white font-black text-lg leading-none">{{ navTotalKm() }}</p>
                  <p class="text-slate-400 text-[10px] font-bold">km</p>
                </div>
                <!-- Fase -->
                <div class="flex-1 flex items-center gap-1.5 px-3 py-2 rounded-xl"
                  [style.background]="navPhase() === 'to_pickup' ? 'rgba(139,92,246,0.15)' : 'rgba(249,115,22,0.15)'">
                  <span class="material-symbols-outlined" style="font-size:16px"
                    [style.color]="navPhase() === 'to_pickup' ? '#a78bfa' : '#fb923c'">
                    {{ navPhase() === 'to_pickup' ? 'person_pin' : 'flag' }}
                  </span>
                  <p class="text-xs font-black"
                    [style.color]="navPhase() === 'to_pickup' ? '#a78bfa' : '#fb923c'">
                    {{ navPhase() === 'to_pickup' ? 'Al pasajero' : 'Al destino' }}
                  </p>
                </div>
                <!-- Voz -->
                <button (click)="navVoiceEnabled.set(!navVoiceEnabled())"
                  class="w-10 h-10 rounded-xl flex items-center justify-center active:scale-90 transition"
                  [style]="navVoiceEnabled() ? 'background:rgba(37,99,235,0.2);border:1px solid rgba(37,99,235,0.5)' : 'background:rgba(100,116,139,0.15);border:1px solid rgba(100,116,139,0.3)'">
                  <span class="material-symbols-outlined" style="font-size:20px"
                    [style.color]="navVoiceEnabled() ? '#60a5fa' : '#94a3b8'">
                    {{ navVoiceEnabled() ? 'volume_up' : 'volume_off' }}
                  </span>
                </button>
                <!-- Parar -->
                <button (click)="stopInAppNav()"
                  class="w-10 h-10 rounded-xl flex items-center justify-center active:scale-90 transition"
                  style="background:rgba(239,68,68,0.15);border:1px solid rgba(239,68,68,0.35)">
                  <span class="material-symbols-outlined text-red-400" style="font-size:20px">close</span>
                </button>
              </div>
            </div>
          }

          @if (driverData() && driverOnline() && !driverMapFullscreen()) {
            <button (click)="toggleHeatmap()" title="Zonas con demanda"
              class="absolute top-2 right-2 w-10 h-10 rounded-xl flex items-center justify-center active:scale-95 transition"
              [style]="heatmapVisible() ? 'background:linear-gradient(135deg,#f97316,#ef4444);color:#fff' : 'background:rgba(0,0,0,0.7);color:#fb923c'">
              <span class="material-symbols-outlined" style="font-size:22px">local_fire_department</span>
            </button>
          }

          <!-- ══ CONDUCTOR FULLSCREEN: tarjeta de viaje activo flotante ══ -->
          @if (driverMapFullscreen() && driverFullscreenTrip()) {
            <!-- Botón salir fullscreen (esquina superior izquierda) -->
            <button (click)="exitDriverFullscreen()"
              class="absolute z-40 flex items-center justify-center active:scale-90 transition"
              style="top:calc(env(safe-area-inset-top,0px) + 14px);left:14px;min-width:44px;min-height:44px;border-radius:12px;background:rgba(15,20,40,0.85);border:1px solid rgba(255,255,255,0.15)">
              <span class="material-symbols-outlined text-white" style="font-size:20px">close_fullscreen</span>
            </button>

            <!-- Tarjeta flotante inferior -->
            <div class="absolute bottom-0 left-0 right-0 z-40"
              style="background:linear-gradient(0deg,rgba(10,12,25,1) 0%,rgba(10,12,25,0.97) 80%,transparent 100%);padding:16px 16px calc(env(safe-area-inset-bottom,16px) + 12px)">

              <!-- Fase: to_pickup → dirección recogida / on_route → destino -->
              <div class="flex items-start gap-3 mb-3">
                <div class="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5"
                  [style.background]="navPhase() === 'to_pickup' ? 'linear-gradient(135deg,#7c3aed,#6d28d9)' : 'linear-gradient(135deg,#0891b2,#0e7490)'">
                  <span class="material-symbols-outlined text-white" style="font-size:20px;font-variation-settings:'FILL' 1">
                    {{ navPhase() === 'to_pickup' ? 'person_pin' : 'flag' }}
                  </span>
                </div>
                <div class="flex-1 min-w-0">
                  <p class="font-black text-[11px] uppercase tracking-widest mb-0.5"
                    [style.color]="navPhase() === 'to_pickup' ? '#a78bfa' : '#34d399'">
                    {{ navPhase() === 'to_pickup' ? 'Recogiendo a' : 'Llevando a' }}
                  </p>
                  <p class="text-white font-black text-sm truncate">
                    {{ driverFullscreenTrip()!.ag_trip_requests?.ag_users?.full_name ?? 'Pasajero' }}
                  </p>
                  <div class="flex items-start gap-1.5 mt-1">
                    <span class="material-symbols-outlined flex-shrink-0" style="font-size:12px;margin-top:1px"
                      [style.color]="navPhase() === 'to_pickup' ? '#38bdf8' : '#f87171'">
                      {{ navPhase() === 'to_pickup' ? 'my_location' : 'location_on' }}
                    </span>
                    <p class="text-slate-300 text-xs leading-tight">
                      {{ navPhase() === 'to_pickup'
                          ? (driverFullscreenTrip()!.ag_trip_requests?.origin_name ?? 'Punto de recogida')
                          : (driverFullscreenTrip()!.ag_trip_requests?.dest_name ?? 'Destino') }}
                    </p>
                  </div>
                </div>
                <div class="text-right flex-shrink-0">
                  <p class="text-emerald-400 font-black text-lg leading-none">{{ formatCOP(driverFullscreenTrip()!.offered_price) }}</p>
                  @if (navEtaMin() > 0) {
                    <p class="text-slate-400 text-[10px] mt-0.5">{{ navEtaMin() }} min · {{ navTotalKm() }} km</p>
                  }
                </div>
              </div>

              <!-- Fila de botones -->
              <div class="flex gap-2">
                <button (click)="openDriverChat(driverFullscreenTrip())"
                  class="flex-1 py-3 rounded-2xl text-white text-xs font-black flex items-center justify-center gap-1.5 active:scale-[0.98]"
                  style="background:rgba(37,99,235,0.85);border:1px solid rgba(59,130,246,0.4)">
                  <span class="material-symbols-outlined" style="font-size:16px">chat</span>Chat
                </button>
                <button (click)="callPassengerFromTrip(driverFullscreenTrip())"
                  class="flex-1 py-3 rounded-2xl text-white text-xs font-black flex items-center justify-center gap-1.5 active:scale-[0.98]"
                  style="background:rgba(22,163,74,0.85);border:1px solid rgba(34,197,94,0.4)">
                  <span class="material-symbols-outlined" style="font-size:16px">call</span>Llamar
                </button>
                @if (navPhase() === 'to_pickup') {
                  <button (click)="advanceStage(driverFullscreenTrip(), 'arrived_at_pickup')"
                    class="flex-1 py-3 rounded-2xl text-white text-xs font-black flex items-center justify-center gap-1.5 active:scale-[0.98]"
                    style="background:linear-gradient(135deg,#7c3aed,#6d28d9)">
                    <span class="material-symbols-outlined" style="font-size:16px;font-variation-settings:'FILL' 1">where_to_vote</span>Llegué
                  </button>
                } @else {
                  <button (click)="finishDriverTrip(driverFullscreenTrip())"
                    class="flex-1 py-3 rounded-2xl text-white text-xs font-black flex items-center justify-center gap-1.5 active:scale-[0.98]"
                    style="background:linear-gradient(135deg,#16a34a,#15803d)">
                    <span class="material-symbols-outlined" style="font-size:16px;font-variation-settings:'FILL' 1">check_circle</span>Finalizar
                  </button>
                }
              </div>
            </div>
          }
        </div>

        @if (gpsStatus() === 'denied') {
          <div class="flex items-center justify-between">
            <p class="text-slate-600 text-xs">Sin ubicación exacta</p>
            <button (click)="retryGps('ag-map-user')"
              class="text-xs text-cyan-400 font-bold flex items-center gap-1">
              <span class="material-symbols-outlined" style="font-size:13px">my_location</span> Reintentar
            </button>
          </div>
        }
      </div>

      } @else {
        <!-- ══ SECCIONES DEL MENÚ CONDUCTOR ══ -->
        <div class="flex flex-col gap-4">

          <!-- Back header (común a todas las secciones) -->
          <div class="flex items-center gap-3">
            <button (click)="driverSection.set(null)"
              class="w-9 h-9 rounded-xl flex items-center justify-center active:scale-90 transition-all"
              style="background:#F3F4F6;border:1px solid #E5E7EB">
              <span class="material-symbols-outlined text-slate-700" style="font-size:20px">arrow_back</span>
            </button>
            <h2 class="font-black text-lg" style="color:#0f172a">
              {{ driverSection() === 'profile' ? 'Mi Perfil' :
                 driverSection() === 'status' ? 'Estado' :
                 driverSection() === 'wallet' ? 'Mi Wallet · Recarga' :
                 driverSection() === 'earnings' ? 'Comisión/Referidos' :
                 driverSection() === 'trips' ? 'Mis Viajes' :
                 driverSection() === 'referrals' ? 'Recomienda y Gana' :
                 driverSection() === 'analytics' ? 'Analytics' :
                 driverSection() === 'performance' ? 'Rendimiento' :
                 driverSection() === 'quests' ? 'Metas y bonos' :
                 driverSection() === 'vehicles' ? 'Mis vehículos' :
                 driverSection() === 'blacklist' ? 'Pasajeros bloqueados' :
                 driverSection() === 'tutorial' ? 'Tutorial' :
                 driverSection() === 'preferences' ? 'Preferencias' :
                 driverSection() === 'autoaccept' ? 'Auto-aceptar' :
                 driverSection() === 'documents' ? 'Mis documentos' :
                 driverSection() === 'lost' ? 'Objetos olvidados' :
                 driverSection() === 'scheduled' ? 'Viajes programados' :
                 driverSection() === 'security' ? 'Seguridad' :
                 driverSection() === 'support' ? 'Soporte' :
                 driverSection() === 'notifications' ? 'Notificaciones' :
                 driverSection() === 'report' ? 'Reportar problema' :
                 driverSection() === 'settings' ? 'Configuración' :
                 driverSection() === 'benefits' ? 'Mis Beneficios' : '' }}
            </h2>
          </div>

          @if (loadingSection()) {
            <div class="flex items-center justify-center py-16">
              <span class="material-symbols-outlined text-cyan-400 animate-spin" style="font-size:36px">autorenew</span>
            </div>
          }

          <!-- ── MI PERFIL ── -->
          @if (!loadingSection() && driverSection() === 'profile') {
            <div class="flex flex-col items-center gap-4 pt-2">
              <!-- Avatar -->
              @if (driverData()?.selfie_url) {
                <img [src]="driverData()!.selfie_url" alt="Foto de perfil"
                  class="w-24 h-24 rounded-3xl object-cover"
                  style="border:3px solid #0891b2" />
              } @else {
                <div class="w-24 h-24 rounded-3xl flex items-center justify-center"
                  style="background:linear-gradient(135deg,#0891b2,#0e7490);font-size:36px;color:white;font-weight:900">
                  {{ firstName().charAt(0).toUpperCase() }}
                </div>
              }
              <div class="text-center">
                <p class="font-black text-xl" style="color:#0f172a">{{ agProfile()?.full_name }}</p>
                <p class="text-slate-600 text-sm">{{ agProfile()?.email }}</p>
                <p class="text-slate-600 text-sm">{{ agProfile()?.phone }}</p>
              </div>
              <!-- Editar perfil -->
              <button (click)="openEditProfile()"
                class="px-5 py-2.5 rounded-xl text-white font-bold text-sm flex items-center gap-2"
                style="background:linear-gradient(135deg,#0891b2,#0e7490)">
                <span class="material-symbols-outlined" style="font-size:16px">edit</span>
                Editar perfil
              </button>
              <!-- Verificación -->
              @if (driverStatus() === 'approved') {
                <div class="flex items-center gap-2 px-4 py-2 rounded-full"
                  style="background:rgba(16,185,129,0.1);border:1px solid rgba(16,185,129,0.2)">
                  <span class="material-symbols-outlined text-emerald-400" style="font-size:16px">verified</span>
                  <span class="text-emerald-400 text-xs font-black">Identidad verificada</span>
                </div>
              }
            </div>
            <!-- Nivel + horas online -->
            @if (driverOnline()) {
              <div class="rounded-2xl p-3 flex items-center justify-between"
                style="background:rgba(34,197,94,0.08);border:1px solid rgba(34,197,94,0.2)">
                <div class="flex items-center gap-2">
                  <span class="material-symbols-outlined text-emerald-400 animate-pulse" style="font-size:18px">schedule</span>
                  <div>
                    <p class="font-black text-sm" style="color:#0f172a">{{ onlineTodayFormatted() }}</p>
                    <p class="text-slate-600 text-[10px]">online hoy</p>
                  </div>
                </div>
                <div class="flex items-center gap-1.5 px-2 py-1 rounded-lg" [style.background]="driverLevelColor()">
                  <span class="material-symbols-outlined" style="font-size:14px">{{ driverLevelIcon() }}</span>
                  <span class="text-xs font-black uppercase">{{ driverData()?.level ?? 'bronce' }}</span>
                </div>
              </div>
            }
            <!-- Stats -->
            <div class="grid grid-cols-3 gap-3">
              <div class="rounded-2xl p-4 flex flex-col items-center gap-1"
                style="background:#F9FAFB;border:1px solid #E2E8F0">
                <span class="material-symbols-outlined text-amber-500" style="font-size:22px">star</span>
                <p class="font-black text-xl" style="color:#0f172a">{{ driverStats()?.avgRating ?? '–' }}</p>
                <p class="text-slate-500 text-[10px] text-center">Calificación</p>
              </div>
              <div class="rounded-2xl p-4 flex flex-col items-center gap-1"
                style="background:#F9FAFB;border:1px solid #E2E8F0">
                <span class="material-symbols-outlined text-cyan-600" style="font-size:22px">directions_car</span>
                <p class="font-black text-xl" style="color:#0f172a">{{ driverStats()?.completedTrips ?? 0 }}</p>
                <p class="text-slate-500 text-[10px] text-center">Viajes</p>
              </div>
              <div class="rounded-2xl p-4 flex flex-col items-center gap-1"
                style="background:#F9FAFB;border:1px solid #E2E8F0">
                <span class="material-symbols-outlined text-emerald-600" style="font-size:22px">account_balance_wallet</span>
                <p class="font-black text-lg" style="color:#0f172a">{{ formatCOP(driverWalletBalance()) }}</p>
                <p class="text-slate-500 text-[10px] text-center">Saldo</p>
              </div>
            </div>
            <!-- Vehículo -->
            <div class="rounded-2xl p-4 flex flex-col gap-3"
              style="background:#F9FAFB;border:1px solid #E2E8F0">
              <p class="text-slate-600 text-xs font-bold uppercase tracking-widest">Tu vehículo</p>
              <div class="grid grid-cols-2 gap-2">
                <div><p class="text-slate-500 text-[10px] uppercase">Placa</p><p class="font-black text-sm" style="color:#0f172a">{{ driverData()?.plate }}</p></div>
                <div><p class="text-slate-500 text-[10px] uppercase">Tipo</p><p class="text-slate-900 text-sm">{{ driverData()?.vehicle_type }}</p></div>
                <div><p class="text-slate-500 text-[10px] uppercase">Marca</p><p class="text-slate-900 text-sm">{{ driverData()?.vehicle_brand }} {{ driverData()?.vehicle_model }}</p></div>
                <div><p class="text-slate-500 text-[10px] uppercase">Color</p><p class="text-slate-900 text-sm">{{ driverData()?.vehicle_color }}</p></div>
              </div>
            </div>
          }

          <!-- ── ESTADO ── -->
          @if (!loadingSection() && driverSection() === 'status') {
            <div class="flex flex-col items-center gap-6 pt-4">
              <!-- Toggle grande -->
              <div class="flex flex-col items-center gap-3">
                <button (click)="toggleOnline()"
                  [disabled]="togglingOnline()"
                  class="w-32 h-32 rounded-full flex flex-col items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-60"
                  [style]="driverOnline() ? 'background:linear-gradient(135deg,#10b981,#059669);box-shadow:0 0 40px rgba(16,185,129,0.4)' : 'background:#F3F4F6;border:2px solid #E5E7EB'">
                  @if (togglingOnline()) {
                    <span class="material-symbols-outlined animate-spin" style="font-size:36px;color:#0f172a">autorenew</span>
                  } @else {
                    <span class="material-symbols-outlined" style="font-size:36px"
                      [style.color]="driverOnline() ? '#fff' : '#0f172a'">{{ driverOnline() ? 'wifi_tethering' : 'wifi_off' }}</span>
                  }
                  <span class="font-black text-sm" [style.color]="driverOnline() ? '#fff' : '#0f172a'">{{ driverOnline() ? 'En línea' : 'Fuera de línea' }}</span>
                </button>
                <p class="text-slate-500 text-xs text-center">Toca para {{ driverOnline() ? 'desconectarte' : 'conectarte' }}</p>
              </div>
              <div class="w-full rounded-2xl p-4 flex flex-col gap-2"
                [style]="driverOnline() ? 'background:rgba(16,185,129,0.06);border:1px solid rgba(16,185,129,0.2)' : 'background:#F9FAFB;border:1px solid #E2E8F0'">
                <p class="font-bold text-sm" [class]="driverOnline() ? 'text-emerald-600' : 'text-slate-700'">
                  {{ driverOnline() ? 'Estás recibiendo solicitudes' : 'No recibes solicitudes' }}
                </p>
                <p class="text-slate-600 text-xs">Puedes conectarte y desconectarte sin penalizaciones en cualquier momento.</p>
              </div>
              <!-- Diagnóstico de notificaciones -->
              <div class="w-full rounded-2xl p-3 flex flex-col gap-2" style="background:#fafafa;border:1px solid #e2e8f0">
                <p class="font-bold text-xs text-slate-700">Estado de notificaciones</p>
                <p class="text-xs" [style.color]="pushDiagStatus() === 'ok' ? '#10b981' : pushDiagStatus() === 'error' ? '#ef4444' : '#f59e0b'">
                  {{ pushDiagLabel() }}
                </p>
                @if (pushDiagStatus() !== 'ok') {
                  <button (click)="fixPushNotifications()"
                    class="w-full rounded-xl py-2 text-xs font-bold text-white"
                    style="background:linear-gradient(135deg,#7c3aed,#6d28d9)">
                    Activar notificaciones
                  </button>
                }
              </div>
            </div>
          }

          <!-- ── COMISIÓN/REFERIDOS ── -->
          @if (!loadingSection() && driverSection() === 'earnings') {
            <!-- Tarjeta billetera de comisiones -->
            <div class="rounded-2xl p-5 flex flex-col gap-3"
              style="background:linear-gradient(135deg,#6C3AED,#2563EB);border:1px solid rgba(255,255,255,0.15)">
              <p class="text-white/60 text-xs font-bold uppercase tracking-widest">Comisiones por referidos</p>
              <p class="text-white font-black text-4xl">{{ '$' + referralBalance().toLocaleString() }}</p>
              <p class="text-white/60 text-[10px]">Disponible para retirar</p>
              <div class="flex items-center gap-4 pt-1 border-t border-white/15">
                <div class="flex items-center gap-1.5">
                  <span class="material-symbols-outlined text-emerald-300" style="font-size:14px">trending_up</span>
                  <span class="text-emerald-300 text-xs font-bold">Total ganado: {{ '$' + referralTotalEarned().toLocaleString() }}</span>
                </div>
                <div class="flex items-center gap-1.5">
                  <span class="material-symbols-outlined text-amber-300" style="font-size:14px">group</span>
                  <span class="text-amber-300 text-xs font-bold">{{ referralCount() }} referidos</span>
                </div>
              </div>
            </div>

            <!-- Retirar comisiones -->
            <div class="rounded-2xl p-4 flex flex-col gap-3"
              style="background:#EEF2FF;border:1px solid rgba(108,58,237,0.25)">
              <div class="flex items-center gap-2">
                <span class="material-symbols-outlined text-purple-600" style="font-size:18px">account_balance</span>
                <p class="font-black text-sm" style="color:#0f172a">Retirar comisiones</p>
              </div>
              <p class="text-slate-600 text-[11px]">Mínimo 10.000 COP. Recibes en 1-3 días hábiles.</p>
              <input type="number" [(ngModel)]="refWdAmount" placeholder="Monto en COP" min="10000"
                class="w-full px-3 py-2 rounded-lg text-slate-900 text-sm outline-none"
                style="background:#FFFFFF;border:1px solid #C7D2FE" />
              <select [(ngModel)]="refWdMethod"
                class="w-full px-3 py-2 rounded-lg text-slate-900 text-sm outline-none"
                style="background:#FFFFFF;border:1px solid #C7D2FE">
                <option value="bank_ahorros">Bancolombia — Cuenta de Ahorros</option>
                <option value="bank_corriente">Bancolombia — Cuenta Corriente</option>
                <option value="nequi">Nequi</option>
                <option value="daviplata">Daviplata</option>
              </select>
              <input type="text" [(ngModel)]="refWdAccount" [placeholder]="refWdPlaceholder()"
                class="w-full px-3 py-2 rounded-lg text-slate-900 text-sm outline-none"
                style="background:#FFFFFF;border:1px solid #C7D2FE" />
              <button (click)="requestReferralWithdraw()" [disabled]="refWdLoading() || (refWdAmount ?? 0) < 10000"
                class="w-full py-2.5 rounded-xl font-black text-xs uppercase disabled:opacity-40"
                style="background:linear-gradient(135deg,#6C3AED,#2563EB);color:#fff">
                {{ refWdLoading() ? 'Procesando...' : 'Solicitar retiro' }}
              </button>
              @if (refWdMsg()) {
                <p class="text-xs text-center" [class]="refWdMsg()!.startsWith('Error') ? 'text-rose-400' : 'text-emerald-600'">{{ refWdMsg() }}</p>
              }
            </div>

            <!-- Historial de retiros de comisiones -->
            @if (referralWithdrawals().length > 0) {
              <div class="flex flex-col gap-2">
                <p class="text-slate-600 text-xs font-bold uppercase tracking-widest">Retiros recientes</p>
                @for (w of referralWithdrawals(); track w.id) {
                  <div class="flex items-center justify-between rounded-xl px-3 py-2.5"
                    style="background:#FFFFFF;border:1px solid #E2E8F0;box-shadow:0 1px 4px rgba(0,0,0,0.04)">
                    <div class="flex-1 min-w-0">
                      <p class="text-slate-900 text-xs font-bold">{{ formatCOP(w.amount) }} · {{ w.method }}</p>
                      <p class="text-slate-500 text-[10px]">{{ w.created_at | slice:0:10 }}</p>
                    </div>
                    <span class="px-2 py-0.5 rounded text-[9px] font-bold flex-shrink-0"
                      [class]="w.status === 'completed' ? 'bg-emerald-500/20 text-emerald-600' : w.status === 'pending' ? 'bg-amber-500/20 text-amber-600' : 'bg-red-500/20 text-red-500'">
                      {{ w.status === 'completed' ? 'Completado' : w.status === 'pending' ? 'Pendiente' : 'Rechazado' }}
                    </span>
                  </div>
                }
              </div>
            }
          }

          <!-- ── MIS VIAJES ── -->
          @if (!loadingSection() && driverSection() === 'trips') {
            @if (driverCompletedTrips().length === 0) {
              <div class="flex flex-col items-center gap-3 py-16"
                style="background:#F9FAFB;border:1px solid #E2E8F0;border-radius:16px">
                <span class="material-symbols-outlined text-slate-400" style="font-size:40px">directions_car</span>
                <p class="text-slate-600 text-sm">Aún no has completado viajes</p>
              </div>
            }
            @for (trip of driverCompletedTrips(); track trip.id) {
              <button (click)="openTripDetail(trip)"
                class="rounded-2xl p-4 flex flex-col gap-2 text-left w-full cursor-pointer transition-colors"
                style="background:#FFFFFF;border:1px solid #E2E8F0;box-shadow:0 1px 4px rgba(0,0,0,0.04)">
                <div class="flex items-center justify-between">
                  <p class="font-bold text-sm" style="color:#0f172a">{{ trip.ag_users?.full_name ?? 'Pasajero' }}</p>
                  <p class="text-emerald-600 font-black text-sm">{{ formatCOP(trip.ag_trip_offers?.offered_price ?? 0) }}</p>
                </div>
                <div class="flex items-center gap-2">
                  <span class="material-symbols-outlined text-slate-500" style="font-size:14px">place</span>
                  <p class="text-slate-600 text-xs truncate">→ {{ trip.dest_name }}</p>
                </div>
                <div class="flex items-center justify-between">
                  <p class="text-slate-500 text-[10px]">{{ trip.completed_at | slice:0:10 }}</p>
                  <span class="text-cyan-600 text-[10px] font-bold flex items-center gap-1">
                    Ver detalle <span class="material-symbols-outlined" style="font-size:12px">chevron_right</span>
                  </span>
                </div>
              </button>
            }
          }

          <!-- ── ANALYTICS ── -->
          @if (!loadingSection() && driverSection() === 'analytics') {
            <div class="flex flex-col gap-4">
              <div class="flex items-center gap-2 flex-wrap">
                @for (p of [7, 14, 30, 90]; track p) {
                  <button (click)="setAnalyticsPeriod(p)" class="px-3 py-1.5 rounded-lg text-xs font-bold"
                    [class]="analyticsPeriodDriver() === p ? 'bg-emerald-600 text-white' : 'text-slate-600'"
                    [style]="analyticsPeriodDriver() !== p ? 'background:#F3F4F6;border:1px solid #E5E7EB' : ''">{{ p }}d</button>
                }
              </div>
              @if (driverAnalytics(); as a) {
                <div class="grid grid-cols-2 gap-3">
                  <div class="rounded-2xl p-4" style="background:rgba(16,185,129,0.08);border:1px solid rgba(16,185,129,0.2)">
                    <p class="text-[10px] text-emerald-600 uppercase tracking-wide">Ganado</p>
                    <p class="text-2xl font-black text-emerald-700 mt-1">{{ formatCOP(a.total_earned) }}</p>
                  </div>
                  <div class="rounded-2xl p-4" style="background:#F9FAFB;border:1px solid #E2E8F0">
                    <p class="text-[10px] text-slate-500 uppercase">Viajes</p>
                    <p class="text-2xl font-black mt-1" style="color:#0f172a">{{ a.completed_trips }}</p>
                  </div>
                  <div class="rounded-2xl p-4" style="background:#FFF7F7;border:1px solid rgba(239,68,68,0.2)">
                    <p class="text-[10px] text-slate-500 uppercase">Cancelados</p>
                    <p class="text-2xl font-black text-rose-600 mt-1">{{ a.cancelled_trips }}</p>
                  </div>
                  <div class="rounded-2xl p-4" style="background:#F0F9FF;border:1px solid rgba(8,145,178,0.2)">
                    <p class="text-[10px] text-slate-500 uppercase">Horas online</p>
                    <p class="text-2xl font-black text-cyan-700 mt-1">{{ a.online_hours }}h</p>
                  </div>
                  <div class="rounded-2xl p-4" style="background:#FFFBEB;border:1px solid rgba(251,191,36,0.3)">
                    <p class="text-[10px] text-slate-500 uppercase">Rating</p>
                    <p class="text-2xl font-black text-amber-600 mt-1">{{ a.avg_rating }} <span class="text-xs text-slate-500">({{ a.ratings_count }})</span></p>
                  </div>
                  <div class="rounded-2xl p-4" style="background:rgba(168,85,247,0.07);border:1px solid rgba(168,85,247,0.2)">
                    <p class="text-[10px] text-purple-600 uppercase">Nivel</p>
                    <p class="text-xl font-black text-purple-700 mt-1 uppercase">{{ a.level }}</p>
                  </div>
                </div>
                @if (driverDailyEarnings().length > 0) {
                  <div class="rounded-2xl p-4" style="background:#F9FAFB;border:1px solid #E2E8F0">
                    <p class="text-[10px] text-slate-500 uppercase mb-2">Ganancias diarias</p>
                    <div class="flex items-end gap-1 h-24">
                      @for (d of driverDailyEarnings(); track d.day) {
                        <div class="flex-1 bg-emerald-500/70 rounded-t" [style.height.%]="dailyBarHeight(d.earnings)" [title]="d.day + ': ' + formatCOP(d.earnings)"></div>
                      }
                    </div>
                  </div>
                }
              }
            </div>
          }

          <!-- ── QUESTS ── -->
          @if (!loadingSection() && driverSection() === 'quests') {
            <div class="flex flex-col gap-3">
              <p class="text-slate-600 text-sm">Completa estas metas para ganar bonos extras.</p>
              @for (q of quests(); track q.id) {
                @let prog = questProgressFor(q.id);
                @let current = prog?.current_value ?? 0;
                @let target = q.target_value ?? 1;
                @let done = prog?.completed_at != null;
                <div class="rounded-2xl p-4" style="background:rgba(168,85,247,0.07);border:1px solid rgba(168,85,247,0.2)">
                  <div class="flex items-center gap-2 mb-1">
                    <span class="material-symbols-outlined text-purple-600" style="font-size:22px">emoji_events</span>
                    <p class="font-black text-sm flex-1" style="color:#0f172a">{{ q.title }}</p>
                    @if (done) {
                      <span class="px-2 py-0.5 rounded-full text-[10px] font-black" style="background:rgba(16,185,129,0.15);color:#059669">✓ Completada</span>
                    } @else {
                      <span class="text-amber-600 font-black text-sm">+{{ formatCOP(q.reward_cop) }}</span>
                    }
                  </div>
                  <p class="text-slate-600 text-xs mb-2">{{ q.description }}</p>
                  <div class="flex items-center gap-2 mb-1">
                    <div class="flex-1 h-1.5 rounded-full overflow-hidden" style="background:rgba(168,85,247,0.15)">
                      <div class="h-full rounded-full transition-all"
                        [style.width.%]="current / target * 100 > 100 ? 100 : current / target * 100"
                        [style.background]="done ? '#059669' : 'linear-gradient(90deg,#a855f7,#7c3aed)'"></div>
                    </div>
                    <span class="text-[10px] font-bold" style="color:#7c3aed">{{ current }}/{{ target }}</span>
                  </div>
                  <p class="text-[10px] text-slate-500">Expira: {{ q.valid_until | date:'shortDate' }} · {{ q.period }}</p>
                </div>
              }
              @if (quests().length === 0) {
                <p class="text-slate-500 text-center py-8">No hay metas activas</p>
              }
            </div>
          }

          <!-- ── MIS VEHÍCULOS ── -->
          @if (!loadingSection() && driverSection() === 'vehicles') {
            <div class="flex flex-col gap-3">
              @for (v of myVehicles(); track v.id) {
                <div class="rounded-2xl p-4" style="background:#FFFFFF;border:1px solid #E2E8F0;box-shadow:0 1px 4px rgba(0,0,0,0.04)">
                  <div class="flex items-center gap-3">
                    <span class="material-symbols-outlined text-cyan-600" style="font-size:24px">{{ v.vehicle_type === 'moto' ? 'two_wheeler' : 'directions_car' }}</span>
                    <div class="flex-1 min-w-0">
                      <p class="font-bold" style="color:#0f172a">{{ v.brand }} {{ v.model }}</p>
                      <p class="text-slate-600 text-xs">{{ v.plate }} · {{ v.color }} · {{ v.year }}</p>
                    </div>
                    @if (v.is_current) {
                      <span class="px-2 py-1 bg-emerald-500/20 text-emerald-400 text-[10px] font-black rounded-lg uppercase">Activo</span>
                    } @else {
                      <button (click)="switchVehicle(v.id)" class="px-2 py-1 bg-cyan-600 text-white text-[10px] font-bold rounded-lg">Usar</button>
                    }
                  </div>
                </div>
              }
              <button (click)="openAddVehicle()" class="py-3 rounded-xl text-white text-sm font-black"
                style="background:linear-gradient(135deg,#0891b2,#06b6d4)">+ Agregar vehículo</button>
              @if (addingVehicle()) {
                <div class="flex flex-col gap-2 rounded-2xl p-3" style="background:#F9FAFB;border:1px solid #E2E8F0">
                  <div class="grid grid-cols-2 gap-2">
                    <select [(ngModel)]="newVehicle.vehicle_type" class="px-3 py-2 rounded-lg text-slate-900 text-sm" style="background:#FFFFFF;border:1px solid #D1D5DB">
                      <option value="carro">Carro</option>
                      <option value="moto">Moto</option>
                      <option value="suv">SUV</option>
                      <option value="van">Van</option>
                      <option value="camion">Camión</option>
                    </select>
                    <input [(ngModel)]="newVehicle.plate" placeholder="Placa" class="px-3 py-2 rounded-lg text-slate-900 text-sm uppercase" style="background:#FFFFFF;border:1px solid #D1D5DB" />
                    <input [(ngModel)]="newVehicle.brand" placeholder="Marca" class="px-3 py-2 rounded-lg text-slate-900 text-sm" style="background:#FFFFFF;border:1px solid #D1D5DB" />
                    <input [(ngModel)]="newVehicle.model" placeholder="Modelo" class="px-3 py-2 rounded-lg text-slate-900 text-sm" style="background:#FFFFFF;border:1px solid #D1D5DB" />
                    <input [(ngModel)]="newVehicle.color" placeholder="Color" class="px-3 py-2 rounded-lg text-slate-900 text-sm" style="background:#FFFFFF;border:1px solid #D1D5DB" />
                    <input [(ngModel)]="newVehicle.year" type="number" placeholder="Año" class="px-3 py-2 rounded-lg text-slate-900 text-sm" style="background:#FFFFFF;border:1px solid #D1D5DB" />
                  </div>
                  <button (click)="saveNewVehicle()" class="py-2 bg-emerald-600 text-white text-xs font-bold rounded-lg">Guardar</button>
                </div>
              }
            </div>
          }

          <!-- ── BLACKLIST ── -->
          @if (!loadingSection() && driverSection() === 'blacklist') {
            <div class="flex flex-col gap-2">
              <p class="text-slate-600 text-sm">Pasajeros con los que prefieres no volver a viajar.</p>
              @for (b of blacklist(); track b.id) {
                <div class="flex items-center justify-between rounded-xl p-3" style="background:#FFF7F7;border:1px solid rgba(239,68,68,0.25)">
                  <div>
                    <p class="text-slate-900 text-xs font-semibold">{{ b.ag_users?.full_name ?? (b.passenger_user_id.slice(0, 8) + '...') }}</p>
                    @if (b.ag_users?.phone) { <p class="text-slate-500 text-[10px]">{{ b.ag_users.phone }}</p> }
                    @if (b.reason) { <p class="text-slate-600 text-[10px]">{{ b.reason }}</p> }
                  </div>
                  <button (click)="removeFromBlacklist(b.id)" class="text-emerald-600 text-xs">Desbloquear</button>
                </div>
              }
              @if (blacklist().length === 0) {
                <p class="text-slate-500 text-center py-8">Sin pasajeros bloqueados</p>
              }
            </div>
          }

          <!-- ── TUTORIAL ── -->
          @if (!loadingSection() && driverSection() === 'tutorial') {
            <div class="flex flex-col gap-4">
              @for (t of tutorialSteps; track t.title) {
                <div class="rounded-2xl p-4" style="background:#F0F9FF;border:1px solid rgba(8,145,178,0.2)">
                  <div class="flex items-center gap-2 mb-2">
                    <span class="material-symbols-outlined text-cyan-600" style="font-size:22px">{{ t.icon }}</span>
                    <p class="font-black" style="color:#0f172a">{{ t.title }}</p>
                  </div>
                  <p class="text-slate-700 text-sm">{{ t.body }}</p>
                </div>
              }
              @if (!tutorialDone()) {
                <button (click)="completeTutorial()" class="py-3 rounded-xl text-white text-sm font-black"
                  style="background:linear-gradient(135deg,#16a34a,#059669)">He leído todo · Completar</button>
              } @else {
                <p class="text-emerald-600 text-sm text-center">✓ Tutorial completado</p>
              }
            </div>
          }

          <!-- ── PREFERENCIAS ── -->
          @if (!loadingSection() && driverSection() === 'preferences') {
            <div class="flex flex-col gap-4">
              <!-- Distancia máxima -->
              <div class="rounded-2xl p-4 flex flex-col gap-3"
                style="background:#F9FAFB;border:1px solid #E2E8F0">
                <div class="flex items-center justify-between">
                  <p class="font-bold text-sm" style="color:#0f172a">Distancia máxima</p>
                  <p class="text-cyan-600 font-black text-sm">{{ driverPrefs().maxDistance }} km</p>
                </div>
                <input type="range" min="5" max="50" step="5"
                  [value]="driverPrefs().maxDistance"
                  (input)="setMaxDistance(+$any($event.target).value)"
                  class="w-full" style="accent-color:#0891b2"/>
                <div class="flex justify-between text-[10px] text-slate-500">
                  <span>5 km</span><span>25 km</span><span>50 km</span>
                </div>
              </div>
              <!-- Opciones extra -->
              <div class="rounded-2xl p-4 flex flex-col gap-3"
                style="background:#F9FAFB;border:1px solid #E2E8F0">
                <p class="text-slate-600 text-xs font-bold uppercase tracking-widest">Opciones extra</p>
                @for (opt of prefOptions; track opt.key) {
                  <div class="flex items-center justify-between py-1">
                    <div class="flex items-center gap-3">
                      <span class="material-symbols-outlined text-slate-500" style="font-size:18px">{{ opt.icon }}</span>
                      <p class="text-slate-800 text-sm">{{ opt.label }}</p>
                    </div>
                    <button (click)="togglePref(opt.key)"
                      class="w-12 h-6 rounded-full flex items-center px-0.5 transition-all"
                      [style]="getPrefValue(opt.key) ? 'background:#0891b2' : 'background:#D1D5DB'">
                      <div class="w-5 h-5 rounded-full bg-white transition-all"
                        [style]="getPrefValue(opt.key) ? 'margin-left:auto' : 'margin-left:0'"></div>
                    </button>
                  </div>
                }
              </div>
              <button (click)="savePreferences()"
                [disabled]="savingPrefs()"
                class="w-full py-3 rounded-xl text-white font-black text-sm flex items-center justify-center gap-2 disabled:opacity-50"
                style="background:linear-gradient(135deg,#0891b2,#0e7490)">
                @if (savingPrefs()) {
                  <span class="material-symbols-outlined animate-spin" style="font-size:16px">autorenew</span>
                } @else {
                  <span class="material-symbols-outlined" style="font-size:16px">save</span>
                }
                Guardar preferencias
              </button>
            </div>
          }

          <!-- ── SEGURIDAD ── -->
          @if (!loadingSection() && driverSection() === 'security') {
            <div class="flex flex-col gap-4">
              <!-- Pánico -->
              <button (click)="triggerPanic()"
                class="w-full py-6 rounded-2xl flex flex-col items-center gap-2 transition-all active:scale-[0.98]"
                [style]="panicActivated() ? 'background:rgba(239,68,68,0.2);border:2px solid #ef4444' : 'background:rgba(239,68,68,0.08);border:2px solid rgba(239,68,68,0.3)'">
                <span class="material-symbols-outlined text-rose-400" style="font-size:40px">emergency</span>
                <p class="text-rose-400 font-black text-base">{{ panicActivated() ? '¡Alerta enviada!' : 'Botón de pánico' }}</p>
                <p class="text-slate-500 text-xs">{{ panicActivated() ? 'Se notificó a tus contactos de emergencia' : 'Toca para alertar a tus contactos' }}</p>
              </button>
              <!-- Contactos de confianza -->
              <div class="rounded-2xl p-4 flex flex-col gap-3"
                style="background:#F9FAFB;border:1px solid #E2E8F0">
                <p class="text-slate-600 text-xs font-bold uppercase tracking-widest">Contactos de confianza</p>
                @for (c of emergencyContacts(); track c.phone) {
                  <div class="flex items-center gap-3">
                    <span class="material-symbols-outlined text-slate-500" style="font-size:18px">person</span>
                    <div class="flex-1">
                      <p class="text-slate-900 text-sm font-bold">{{ c.name }}</p>
                      <p class="text-slate-600 text-xs">{{ c.phone }}</p>
                    </div>
                    <button (click)="removeEmergencyContact(c.phone)"
                      class="text-slate-400 active:text-rose-500">
                      <span class="material-symbols-outlined" style="font-size:18px">delete</span>
                    </button>
                  </div>
                }
                <div class="flex gap-2">
                  <input [(ngModel)]="newContactName" placeholder="Nombre"
                    class="flex-1 rounded-xl px-3 py-2 text-slate-900 text-xs focus:outline-none"
                    style="background:#FFFFFF;border:1px solid #D1D5DB"/>
                  <input [(ngModel)]="newContactPhone" placeholder="Teléfono"
                    class="flex-1 rounded-xl px-3 py-2 text-slate-900 text-xs focus:outline-none"
                    style="background:#FFFFFF;border:1px solid #D1D5DB"/>
                  <button (click)="addEmergencyContact()"
                    class="px-3 rounded-xl text-white font-black text-xs"
                    style="background:#0891b2">
                    <span class="material-symbols-outlined" style="font-size:18px">add</span>
                  </button>
                </div>
              </div>
              <!-- Reportar incidente -->
              <div class="rounded-2xl p-4 flex flex-col gap-3"
                style="background:#FFF7F7;border:1px solid rgba(239,68,68,0.2)">
                <p class="text-slate-600 text-xs font-bold uppercase tracking-widest">Reportar incidente</p>
                <textarea [(ngModel)]="reportIncidentText" placeholder="Describe el incidente..." rows="3"
                  class="w-full rounded-xl px-3 py-2 text-slate-900 text-xs resize-none focus:outline-none"
                  style="background:#FFFFFF;border:1px solid #FCA5A5"></textarea>
                <button (click)="submitReport('incident')"
                  class="w-full py-2.5 rounded-xl text-white text-xs font-black"
                  style="background:linear-gradient(135deg,#dc2626,#b91c1c)">
                  Enviar reporte
                </button>
              </div>
            </div>
          }

          <!-- ── SOPORTE ── -->
          @if (!loadingSection() && driverSection() === 'support') {
            <div class="flex flex-col gap-4">
              <!-- Contacto directo -->
              <a href="https://wa.me/573181800264" target="_blank"
                class="w-full py-4 rounded-2xl flex items-center justify-center gap-3"
                style="background:linear-gradient(135deg,rgba(37,211,102,0.1),rgba(18,140,126,0.07));border:1px solid rgba(37,211,102,0.3)">
                <span class="material-symbols-outlined text-emerald-600" style="font-size:24px">chat</span>
                <div class="text-left">
                  <p class="font-black text-sm" style="color:#0f172a">Chat con soporte 24/7</p>
                  <p class="text-slate-600 text-xs">Respuesta en menos de 5 minutos</p>
                </div>
              </a>
              <!-- FAQ -->
              <p class="text-slate-600 text-xs font-bold uppercase tracking-widest px-1">Preguntas frecuentes</p>
              @for (faq of faqItems; track faq.q) {
                <div class="rounded-2xl overflow-hidden"
                  style="background:#FFFFFF;border:1px solid #E2E8F0;box-shadow:0 1px 4px rgba(0,0,0,0.04)">
                  <button (click)="toggleFaq(faq.q)"
                    class="w-full flex items-center justify-between px-4 py-3 text-left">
                    <p class="text-slate-900 text-sm font-bold">{{ faq.q }}</p>
                    <span class="material-symbols-outlined text-slate-500 flex-shrink-0" style="font-size:18px">
                      {{ openFaq() === faq.q ? 'expand_less' : 'expand_more' }}
                    </span>
                  </button>
                  @if (openFaq() === faq.q) {
                    <div class="px-4 pb-3 border-t border-slate-100">
                      <p class="text-slate-600 text-xs leading-relaxed pt-2">{{ faq.a }}</p>
                    </div>
                  }
                </div>
              }
              <!-- Reportar pasajero -->
              <div class="rounded-2xl p-4 flex flex-col gap-3"
                style="background:#FFFBEB;border:1px solid rgba(245,158,11,0.25)">
                <p class="text-slate-600 text-xs font-bold uppercase tracking-widest">Reportar problema con pasajero</p>
                <textarea [(ngModel)]="reportPassengerText" placeholder="Describe el problema..." rows="3"
                  class="w-full rounded-xl px-3 py-2 text-slate-900 text-xs resize-none focus:outline-none"
                  style="background:#FFFFFF;border:1px solid #FDE68A"></textarea>
                <button (click)="submitReport('passenger')"
                  class="w-full py-2.5 rounded-xl text-white text-xs font-black"
                  style="background:linear-gradient(135deg,#d97706,#b45309)">
                  Enviar reporte
                </button>
              </div>
            </div>
          }

          <!-- ── CONFIGURACIÓN ── -->
          @if (!loadingSection() && driverSection() === 'settings') {
            <div class="flex flex-col gap-4">
              <div class="rounded-2xl p-4 flex flex-col gap-4"
                style="background:#F9FAFB;border:1px solid #E2E8F0">
                <p class="text-slate-600 text-xs font-bold uppercase tracking-widest">Notificaciones</p>
                @for (opt of settingOptions; track opt.key) {
                  <div class="flex items-center justify-between">
                    <div class="flex items-center gap-3">
                      <span class="material-symbols-outlined text-slate-500" style="font-size:18px">{{ opt.icon }}</span>
                      <p class="text-slate-800 text-sm">{{ opt.label }}</p>
                    </div>
                    <button (click)="toggleSetting(opt.key)"
                      class="w-12 h-6 rounded-full flex items-center px-0.5 transition-all"
                      [style]="getSettingValue(opt.key) ? 'background:#0891b2' : 'background:#D1D5DB'">
                      <div class="w-5 h-5 rounded-full bg-white transition-all"
                        [style]="getSettingValue(opt.key) ? 'margin-left:auto' : 'margin-left:0'"></div>
                    </button>
                  </div>
                }
              </div>
              <div class="rounded-2xl p-4 flex flex-col gap-4"
                style="background:#F9FAFB;border:1px solid #E2E8F0">
                <p class="text-slate-600 text-xs font-bold uppercase tracking-widest">Privacidad</p>
                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-3">
                    <span class="material-symbols-outlined text-slate-500" style="font-size:18px">phone_locked</span>
                    <div>
                      <p class="text-slate-800 text-sm">Ocultar número</p>
                      <p class="text-slate-500 text-[10px]">El pasajero no verá tu número</p>
                    </div>
                  </div>
                  <button (click)="toggleSetting('hidePhone')"
                    class="w-12 h-6 rounded-full flex items-center px-0.5 transition-all"
                    [style]="driverSettings().hidePhone ? 'background:#0891b2' : 'background:#D1D5DB'">
                    <div class="w-5 h-5 rounded-full bg-white transition-all"
                      [style]="driverSettings().hidePhone ? 'margin-left:auto' : 'margin-left:0'"></div>
                  </button>
                </div>
              </div>
              <!-- T&C -->
              <button (click)="openTerms()"
                class="flex items-center gap-3 px-4 py-3 rounded-2xl w-full text-left"
                style="background:#FFFFFF;border:1px solid #E2E8F0;box-shadow:0 1px 4px rgba(0,0,0,0.04)">
                <span class="material-symbols-outlined text-slate-500" style="font-size:18px">description</span>
                <p class="text-slate-800 text-sm">Términos y condiciones</p>
                <span class="material-symbols-outlined text-slate-400 ml-auto" style="font-size:16px">chevron_right</span>
              </button>
              <button (click)="saveSettings()"
                [disabled]="savingSettings()"
                class="w-full py-3 rounded-xl text-white font-black text-sm flex items-center justify-center gap-2 disabled:opacity-50"
                style="background:linear-gradient(135deg,#0891b2,#0e7490)">
                @if (savingSettings()) {
                  <span class="material-symbols-outlined animate-spin" style="font-size:16px">autorenew</span>
                } @else {
                  <span class="material-symbols-outlined" style="font-size:16px">save</span>
                }
                Guardar configuración
              </button>
            </div>
          }

          <!-- ── RECOMIENDA Y GANA (Conductor) ── -->
          @if (!loadingSection() && driverSection() === 'referrals') {
            <div class="flex flex-col gap-4">

              <!-- Billetera de retiro -->
              <div class="rounded-2xl p-4 flex flex-col gap-2"
                style="background:linear-gradient(135deg,#6C3AED,#2563EB);border:1px solid rgba(255,255,255,0.2)">
                <p class="text-white/70 text-xs font-bold uppercase tracking-widest">Billetera de retiro</p>
                <p class="text-white font-black text-2xl">{{ '$' + referralBalance().toLocaleString() }}</p>
                <div class="flex items-center gap-4 mt-1">
                  <div class="flex items-center gap-1">
                    <span class="material-symbols-outlined text-emerald-300" style="font-size:14px">trending_up</span>
                    <span class="text-emerald-300 text-xs font-bold">Total: {{ '$' + referralTotalEarned().toLocaleString() }}</span>
                  </div>
                  <div class="flex items-center gap-1">
                    <span class="material-symbols-outlined text-amber-300" style="font-size:14px">group</span>
                    <span class="text-amber-300 text-xs font-bold">{{ referralCount() }} invitados</span>
                  </div>
                </div>
              </div>

              <div class="rounded-2xl p-4 flex flex-col gap-3"
                style="background:linear-gradient(135deg,rgba(108,58,237,0.10),rgba(37,99,235,0.08));border:1px solid rgba(108,58,237,0.25)">
                <p class="font-black text-base" style="color:#0f172a">Gana el 2% por referido</p>
                <p class="text-slate-700 text-xs sm:text-sm leading-relaxed">
                  Cada vez que alguien se registre en <span class="font-bold" style="color:#0f172a">Movi</span> con tu link y use nuestro servicio,
                  tú ganas el <span class="text-amber-600 font-black">2% del valor de cada servicio</span>.
                </p>
              </div>

              <!-- Link de referido -->
              <div class="rounded-2xl p-4 flex flex-col gap-3"
                style="background:#F9FAFB;border:1px solid #E2E8F0">
                <p class="text-slate-600 text-xs font-bold uppercase tracking-widest">Tu link de invitación</p>
                <div class="flex items-center gap-2">
                  <div class="flex-1 rounded-xl px-3 py-2.5 text-xs text-slate-900 font-mono truncate"
                    style="background:#FFFFFF;border:1px solid #D1D5DB">
                    {{ agReferralLink() }}
                  </div>
                  <button (click)="copyReferralLink()"
                    class="px-4 py-2.5 rounded-xl text-xs font-black text-black flex items-center gap-1 active:scale-95 transition-transform flex-shrink-0"
                    style="background:linear-gradient(135deg,#f59e0b,#d97706)">
                    <span class="material-symbols-outlined" style="font-size:16px">content_copy</span>
                    {{ referralCopied() ? '¡Copiado!' : 'Copiar' }}
                  </button>
                </div>
              </div>

              <!-- Historial de comisiones -->
              @if (referralTransactions().length > 0) {
                <p class="text-slate-600 text-xs font-bold uppercase tracking-widest">Historial de comisiones</p>
                <div class="flex flex-col gap-2">
                  @for (tx of referralTransactions(); track tx.id) {
                    <div class="flex items-center justify-between rounded-xl px-3 py-2.5"
                      style="background:#FFFFFF;border:1px solid #E2E8F0;box-shadow:0 1px 4px rgba(0,0,0,0.04)">
                      <div class="flex-1 min-w-0">
                        <p class="text-slate-900 text-xs font-bold truncate">{{ tx.description }}</p>
                        <p class="text-slate-500 text-[10px]">{{ tx.created_at?.slice(0,10) }}</p>
                      </div>
                      <span class="text-emerald-600 font-black text-sm flex-shrink-0 ml-2">{{ '+$' + tx.commission_amount?.toLocaleString() }}</span>
                    </div>
                  }
                </div>
              }

              <!-- Cómo funciona -->
              <p class="text-slate-600 text-xs font-bold uppercase tracking-widest">¿Cómo funciona?</p>
              <div class="flex flex-col gap-2">
                <div class="flex items-start gap-3 rounded-xl p-3" style="background:#F9FAFB;border:1px solid #E2E8F0">
                  <div class="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0" style="background:rgba(108,58,237,0.12)">
                    <span class="text-purple-700 font-black text-xs">1</span>
                  </div>
                  <p class="text-slate-700 text-xs leading-relaxed">Comparte tu link con amigos, familiares o en redes sociales</p>
                </div>
                <div class="flex items-start gap-3 rounded-xl p-3" style="background:#F9FAFB;border:1px solid #E2E8F0">
                  <div class="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0" style="background:rgba(108,58,237,0.12)">
                    <span class="text-purple-700 font-black text-xs">2</span>
                  </div>
                  <p class="text-slate-700 text-xs leading-relaxed">Ellos se registran como pasajero o conductor usando tu link</p>
                </div>
                <div class="flex items-start gap-3 rounded-xl p-3" style="background:#FFFBEB;border:1px solid rgba(245,158,11,0.2)">
                  <div class="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0" style="background:rgba(245,158,11,0.15)">
                    <span class="text-amber-600 font-black text-xs">3</span>
                  </div>
                  <p class="text-slate-700 text-xs leading-relaxed">Cada vez que usen Movi, tú ganas el <span class="text-amber-600 font-bold">2% del valor del servicio</span> en tu billetera de retiro</p>
                </div>
              </div>
            </div>
          }

          <!-- ── MIS BENEFICIOS ── -->
          @if (!loadingSection() && driverSection() === 'benefits') {
            <div class="flex flex-col gap-4">

              <!-- Comisión escalonada — tarjeta principal -->
              <div class="rounded-2xl overflow-hidden"
                style="background:#fff;border:1px solid #E2E8F0;box-shadow:0 2px 8px rgba(0,0,0,0.05)">
                <div class="px-5 pt-5 pb-3">
                  <p class="text-xs font-bold uppercase tracking-widest text-slate-500">Tu comisión este mes</p>
                  <div class="flex items-end gap-2 mt-1">
                    <span class="font-black" style="font-size:42px;color:#0f172a;line-height:1">{{ driverBenefits()?.commission_pct ?? driverCommissionPct() }}</span>
                    <span class="font-black text-lg text-slate-400 mb-1.5">%</span>
                    <span class="mb-1.5 px-2 py-0.5 rounded-full text-xs font-black"
                      [style.background]="driverBenefits()?.tier_label === 'Leyenda' ? 'rgba(234,179,8,0.12)' : driverBenefits()?.tier_label === 'Pro' ? 'rgba(8,145,178,0.10)' : driverBenefits()?.tier_label === 'Activo' ? 'rgba(16,185,129,0.10)' : 'rgba(148,163,184,0.12)'"
                      [style.color]="driverBenefits()?.tier_label === 'Leyenda' ? '#a16207' : driverBenefits()?.tier_label === 'Pro' ? '#0369a1' : driverBenefits()?.tier_label === 'Activo' ? '#047857' : '#64748b'">
                      {{ driverBenefits()?.tier_label ?? 'Nuevo' }}
                    </span>
                  </div>
                  <p class="text-slate-500 text-xs mt-1">Pagas solo el {{ driverBenefits()?.commission_pct ?? driverCommissionPct() }}% sobre el valor de cada servicio o viaje finalizado. Nada más.</p>
                </div>

                <!-- Barra de progreso hacia el siguiente nivel -->
                @if (driverBenefits()?.next_tier_trips > 0) {
                  <div class="px-5 pb-4">
                    <div class="flex items-center justify-between mb-1.5">
                      <span class="text-xs text-slate-500 font-medium">{{ driverBenefits()?.monthly_trips }} viajes este mes</span>
                      <span class="text-xs font-bold" style="color:#0f172a">Meta: {{ driverBenefits()?.next_tier_trips }} → {{ driverBenefits()?.next_tier_pct }}%</span>
                    </div>
                    <div class="w-full h-2.5 rounded-full overflow-hidden" style="background:#F1F5F9">
                      <div class="h-full rounded-full transition-all duration-500"
                        style="background:linear-gradient(90deg,#10b981,#0891b2)"
                        [style.width]="(((driverBenefits()?.monthly_trips ?? 0) / (driverBenefits()?.next_tier_trips ?? 1)) * 100 | number:'1.0-0') + '%'"></div>
                    </div>
                    <p class="text-[10px] text-slate-400 mt-1.5">Te faltan <span class="font-bold text-slate-600">{{ (driverBenefits()?.next_tier_trips ?? 0) - (driverBenefits()?.monthly_trips ?? 0) }} viajes</span> para bajar tu comisión a {{ driverBenefits()?.next_tier_pct }}%</p>
                  </div>
                } @else {
                  <div class="px-5 pb-4">
                    <div class="flex items-center gap-2 px-3 py-2 rounded-xl"
                      style="background:rgba(234,179,8,0.08);border:1px solid rgba(234,179,8,0.25)">
                      <span class="material-symbols-outlined text-amber-500" style="font-size:16px;font-variation-settings:'FILL' 1">emoji_events</span>
                      <span class="text-amber-700 text-xs font-bold">¡Nivel máximo! Tienes la comisión más baja posible.</span>
                    </div>
                  </div>
                }
              </div>

              <!-- Tabla completa de niveles -->
              <div class="rounded-2xl overflow-hidden" style="background:#fff;border:1px solid #E2E8F0">
                <div class="px-4 pt-4 pb-2">
                  <p class="font-black text-sm" style="color:#0f172a">Cómo funciona la escala</p>
                  <p class="text-slate-500 text-xs mt-0.5">Tu comisión baja según los viajes completados cada mes. Se reinicia el 1° de cada mes.</p>
                </div>
                <div class="divide-y divide-slate-100">
                  @for (tier of [
                    { label: 'Nuevo',   range: '0 – 30 viajes',   pct: 12, color: '#64748b', bg: 'rgba(148,163,184,0.08)', icon: 'directions_car' },
                    { label: 'Activo',  range: '31 – 70 viajes',  pct: 10, color: '#047857', bg: 'rgba(16,185,129,0.06)',  icon: 'trending_up' },
                    { label: 'Pro',     range: '71 – 120 viajes', pct: 8,  color: '#0369a1', bg: 'rgba(8,145,178,0.06)',   icon: 'star' },
                    { label: 'Leyenda', range: '121+ viajes',     pct: 6,  color: '#a16207', bg: 'rgba(234,179,8,0.08)',   icon: 'emoji_events' }
                  ]; track tier.label) {
                    <div class="flex items-center gap-3 px-4 py-3"
                      [style.background]="driverBenefits()?.tier_label === tier.label ? tier.bg : 'transparent'">
                      <span class="material-symbols-outlined flex-shrink-0" style="font-size:18px"
                        [style.color]="driverBenefits()?.tier_label === tier.label ? tier.color : '#94a3b8'">{{ tier.icon }}</span>
                      <div class="flex-1">
                        <p class="font-bold text-sm"
                          [style.color]="driverBenefits()?.tier_label === tier.label ? '#0f172a' : '#64748b'">{{ tier.label }}</p>
                        <p class="text-xs" style="color:#94a3b8">{{ tier.range }}</p>
                      </div>
                      <div class="text-right">
                        <span class="font-black text-base" [style.color]="tier.color">{{ tier.pct }}%</span>
                        @if (driverBenefits()?.tier_label === tier.label) {
                          <p class="text-[9px] font-bold uppercase tracking-wide" [style.color]="tier.color">Tu nivel</p>
                        }
                      </div>
                    </div>
                  }
                </div>
              </div>

              <!-- Beneficio de referidos -->
              <div class="rounded-2xl p-4 flex items-start gap-3"
                style="background:linear-gradient(135deg,rgba(108,58,237,0.07),rgba(37,99,235,0.05));border:1px solid rgba(108,58,237,0.18)">
                <div class="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                  style="background:rgba(108,58,237,0.12);border:1px solid rgba(108,58,237,0.25)">
                  <span class="material-symbols-outlined" style="font-size:20px;color:#7c3aed;font-variation-settings:'FILL' 1">group_add</span>
                </div>
                <div class="flex-1 min-w-0">
                  <p class="font-black text-sm" style="color:#0f172a">Gana el 2% por cada referido</p>
                  <p class="text-slate-600 text-xs mt-0.5 leading-relaxed">Cada conductor o pasajero que se registre con tu link y complete servicios, te genera el <span class="font-bold text-purple-700">2% de cada servicio</span>.</p>
                  <button (click)="openDriverSection('referrals')"
                    class="mt-2 inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-black active:scale-95 transition-all"
                    style="background:rgba(108,58,237,0.12);border:1px solid rgba(108,58,237,0.25);color:#7c3aed">
                    <span class="material-symbols-outlined" style="font-size:14px">share</span> Ver mi link de referido
                  </button>
                </div>
              </div>

              <!-- Resumen de métricas -->
              <div class="grid grid-cols-2 gap-3">
                <div class="rounded-2xl p-4 flex flex-col gap-1 items-center"
                  style="background:#F9FAFB;border:1px solid #E2E8F0;text-align:center">
                  <span class="material-symbols-outlined text-cyan-500" style="font-size:24px;font-variation-settings:'FILL' 1">route</span>
                  <p class="font-black text-lg" style="color:#0f172a">{{ driverBenefits()?.monthly_trips ?? 0 }}</p>
                  <p class="text-slate-500 text-[11px]">Viajes este mes</p>
                </div>
                <div class="rounded-2xl p-4 flex flex-col gap-1 items-center"
                  style="background:#F9FAFB;border:1px solid #E2E8F0;text-align:center">
                  <span class="material-symbols-outlined text-emerald-500" style="font-size:24px;font-variation-settings:'FILL' 1">check_circle</span>
                  <p class="font-black text-lg" style="color:#0f172a">{{ driverBenefits()?.total_trips ?? 0 }}</p>
                  <p class="text-slate-500 text-[11px]">Viajes totales</p>
                </div>
              </div>

            </div>
          }

          <!-- ── MIS DOCUMENTOS ── -->
          @if (!loadingSection() && driverSection() === 'documents') {
            <div class="flex flex-col gap-3">
              <p class="text-slate-600 text-xs leading-relaxed">
                Mantén tus documentos al día. Si se vencen, tu cuenta quedará suspendida hasta renovarlos. Sube imagen clara, legible y sin recortes.
              </p>

              @for (dt of docTypes; track dt.key) {
                <div class="rounded-2xl p-4 flex flex-col gap-3"
                  style="background:#FFFFFF;border:1px solid #E2E8F0;box-shadow:0 1px 4px rgba(0,0,0,0.04)">
                  <div class="flex items-center justify-between">
                    <div class="flex items-center gap-2">
                      <span class="material-symbols-outlined text-cyan-600" style="font-size:20px">{{ dt.icon }}</span>
                      <span class="font-black text-sm" style="color:#0f172a">{{ dt.label }}</span>
                    </div>
                    @if (getDocByType(dt.key); as doc) {
                      <span class="text-xs font-bold" [class]="docStatusColor(doc.status)">{{ docStatusLabel(doc.status) }}</span>
                    } @else {
                      <span class="text-xs font-bold text-slate-500">Sin subir</span>
                    }
                  </div>

                  @if (getDocByType(dt.key); as doc) {
                    <div class="flex items-center gap-3">
                      <a [href]="doc.file_url" target="_blank" rel="noopener"
                        class="w-16 h-16 rounded-xl flex-shrink-0 overflow-hidden flex items-center justify-center"
                        style="background:rgba(8,145,178,0.1);border:1px solid rgba(8,145,178,0.25)">
                        <span class="material-symbols-outlined text-cyan-600" style="font-size:24px">visibility</span>
                      </a>
                      <div class="flex-1 text-xs text-slate-700 space-y-1">
                        @if (doc.number) { <p><span class="text-slate-500">N°:</span> {{ doc.number }}</p> }
                        @if (doc.expires_at) {
                          <p>
                            <span class="text-slate-500">Vence:</span>
                            <span [class.text-yellow-400]="docIsExpiringSoon(doc)" [class.font-bold]="docIsExpiringSoon(doc)">
                              {{ doc.expires_at }}
                            </span>
                          </p>
                        }
                        @if (doc.status === 'rejected' && doc.rejection_reason) {
                          <p class="text-red-400">⚠ {{ doc.rejection_reason }}</p>
                        }
                      </div>
                    </div>
                  }

                  @if (dt.requiresExpiry) {
                    <input type="date" [value]="docExpiryInput[dt.key] || (getDocByType(dt.key)?.expires_at || '')"
                      (change)="onDocExpiryChange(dt.key, $any($event.target).value)"
                      class="w-full px-3 py-2 rounded-lg text-slate-900 text-xs focus:outline-none"
                      style="background:#FFFFFF;border:1px solid #D1D5DB" />
                  }
                  <input type="text" placeholder="Número (opcional)"
                    [value]="docNumberInput[dt.key] || (getDocByType(dt.key)?.number || '')"
                    (input)="onDocNumberChange(dt.key, $any($event.target).value)"
                    class="w-full px-3 py-2 rounded-lg text-slate-900 text-xs focus:outline-none"
                    style="background:#FFFFFF;border:1px solid #D1D5DB" />

                  <label class="w-full py-2.5 rounded-xl text-white font-bold text-xs flex items-center justify-center gap-2 cursor-pointer"
                    style="background:linear-gradient(135deg,#0891b2,#0e7490)"
                    [class.opacity-50]="uploadingDoc() === dt.key">
                    @if (uploadingDoc() === dt.key) {
                      <span class="material-symbols-outlined animate-spin" style="font-size:14px">autorenew</span>
                      Subiendo...
                    } @else {
                      <span class="material-symbols-outlined" style="font-size:14px">upload</span>
                      {{ getDocByType(dt.key) ? 'Reemplazar' : 'Subir archivo' }}
                    }
                    <input type="file" accept="image/*,application/pdf" class="hidden"
                      [disabled]="uploadingDoc() !== null"
                      (change)="onUploadDoc(dt.key, $event)" />
                  </label>
                </div>
              }
            </div>
          }

          <!-- ── RENDIMIENTO (aceptación / cancelación) ── -->
          @if (!loadingSection() && driverSection() === 'performance') {
            <div class="flex flex-col gap-4">

              <!-- Total ganado en viajes -->
              <div class="rounded-2xl p-5 flex flex-col gap-2"
                style="background:linear-gradient(135deg,rgba(16,185,129,0.12),rgba(5,150,105,0.08));border:1px solid rgba(16,185,129,0.2)">
                <p class="text-slate-600 text-xs uppercase font-bold tracking-widest">Total ganado en viajes</p>
                <p class="font-black text-4xl" style="color:#0f172a">{{ formatCOP(driverEarnings().total) }}</p>
                <p class="text-slate-500 text-xs">Acumulado de todas tus carreras completadas</p>
              </div>

              @if (driverMetrics(); as m) {
                <!-- KPIs principales -->
                <div class="grid grid-cols-1 gap-3">
                  <div class="rounded-2xl p-4" style="background:#F0FDF4;border:1px solid rgba(16,185,129,0.3)">
                    <p class="text-emerald-700 text-xs font-bold uppercase tracking-widest mb-1">Tasa de aceptación</p>
                    <p class="text-4xl font-black" [class]="metricColor(m.acceptance_rate, 'positive')">{{ m.acceptance_rate }}%</p>
                    <p class="text-slate-600 text-xs mt-1">{{ m.offers_made }} ofertas hechas de {{ m.offers_seen }} vistas</p>
                  </div>
                  <div class="rounded-2xl p-4" style="background:#FFF7F7;border:1px solid rgba(239,68,68,0.3)">
                    <p class="text-red-600 text-xs font-bold uppercase tracking-widest mb-1">Tasa de cancelación</p>
                    <p class="text-4xl font-black" [class]="metricColor(m.cancellation_rate, 'negative')">{{ m.cancellation_rate }}%</p>
                    <p class="text-slate-600 text-xs mt-1">{{ m.trips_cancelled }} cancelados de {{ m.trips_accepted }} aceptados</p>
                  </div>
                  <div class="rounded-2xl p-4" style="background:#F0F9FF;border:1px solid rgba(8,145,178,0.3)">
                    <p class="text-cyan-700 text-xs font-bold uppercase tracking-widest mb-1">Tasa de finalización</p>
                    <p class="text-4xl font-black" [class]="metricColor(m.completion_rate, 'positive')">{{ m.completion_rate }}%</p>
                    <p class="text-slate-600 text-xs mt-1">{{ m.trips_completed }} completados de {{ m.trips_accepted }}</p>
                  </div>
                </div>

                <!-- Guía -->
                <div class="rounded-2xl p-4" style="background:#FFFBEB;border:1px solid rgba(245,158,11,0.2)">
                  <p class="font-bold text-sm mb-2" style="color:#0f172a">💡 ¿Cómo mejorar?</p>
                  <ul class="text-slate-700 text-xs leading-relaxed space-y-1 list-disc list-inside">
                    <li>Acepta más viajes para subir tu <span class="text-emerald-600">tasa de aceptación</span>.</li>
                    <li>Evita cancelar viajes aceptados. Si algo pasa, contacta al pasajero por chat primero.</li>
                    <li>Una tasa superior al 90% te da prioridad en solicitudes y promos.</li>
                  </ul>
                </div>

                <p class="text-slate-500 text-xs text-center">Métricas desde {{ m.window_start | date:'dd MMM yyyy' }}</p>
              } @else {
                <p class="text-slate-500 text-center py-6 text-sm">Aún no tienes datos suficientes.</p>
              }
            </div>
          }

          <!-- ── AUTO-ACEPTAR ── -->
          @if (!loadingSection() && driverSection() === 'autoaccept') {
            <div class="flex flex-col gap-4">
              <p class="text-slate-600 text-xs leading-relaxed">
                Cuando está activado, Movi aceptará automáticamente viajes que cumplan tus condiciones mínimas mientras estás en línea.
              </p>

              <!-- Toggle -->
              <div class="rounded-2xl p-4 flex items-center justify-between"
                style="background:#F9FAFB;border:1px solid #E2E8F0">
                <div class="flex items-center gap-2">
                  <span class="material-symbols-outlined text-cyan-600" style="font-size:20px">auto_mode</span>
                  <span class="font-bold text-sm" style="color:#0f172a">Activar auto-aceptar</span>
                </div>
                <button (click)="toggleAutoAcceptEnabled()"
                  class="w-12 h-6 rounded-full transition-colors"
                  [style.background]="autoAcceptCfg().enabled ? '#10b981' : '#D1D5DB'">
                  <div class="w-5 h-5 rounded-full bg-white transition-transform"
                    [style.transform]="autoAcceptCfg().enabled ? 'translateX(26px)' : 'translateX(2px)'"></div>
                </button>
              </div>

              <!-- Min price -->
              <div class="rounded-2xl p-4" style="background:#F9FAFB;border:1px solid #E2E8F0">
                <div class="flex items-center justify-between mb-2">
                  <span class="font-bold text-sm" style="color:#0f172a">Precio mínimo</span>
                  <span class="text-cyan-600 font-black text-sm">{{ '$' + autoAcceptCfg().minPrice.toLocaleString('es-CO') }}</span>
                </div>
                <input type="range" min="5000" max="50000" step="1000"
                  [value]="autoAcceptCfg().minPrice"
                  (input)="setAutoAcceptMinPrice(+$any($event.target).value)"
                  class="w-full accent-cyan-600" />
                <p class="text-slate-500 text-xs mt-1">Solo aceptará viajes iguales o mayores a este precio</p>
              </div>

              <!-- Max distance -->
              <div class="rounded-2xl p-4" style="background:#F9FAFB;border:1px solid #E2E8F0">
                <div class="flex items-center justify-between mb-2">
                  <span class="font-bold text-sm" style="color:#0f172a">Distancia máxima al pasajero</span>
                  <span class="text-cyan-600 font-black text-sm">{{ autoAcceptCfg().maxDistance }} km</span>
                </div>
                <input type="range" min="1" max="20" step="1"
                  [value]="autoAcceptCfg().maxDistance"
                  (input)="setAutoAcceptMaxDistance(+$any($event.target).value)"
                  class="w-full accent-cyan-600" />
                <p class="text-slate-500 text-xs mt-1">Solo aceptará si estás dentro de este radio del punto de recogida</p>
              </div>

              <button (click)="saveAutoAccept()" [disabled]="savingAutoAccept()"
                class="w-full py-3 rounded-xl text-white font-black text-sm flex items-center justify-center gap-2 disabled:opacity-50"
                style="background:linear-gradient(135deg,#0891b2,#0e7490)">
                @if (savingAutoAccept()) {
                  <span class="material-symbols-outlined animate-spin" style="font-size:16px">autorenew</span>
                } @else {
                  <span class="material-symbols-outlined" style="font-size:16px">save</span>
                }
                Guardar configuración
              </button>
            </div>
          }

          <!-- ── OBJETOS OLVIDADOS ── -->
          @if (!loadingSection() && driverSection() === 'lost') {
            <div class="flex flex-col gap-3">
              <p class="text-slate-600 text-xs leading-relaxed">
                Reporta objetos que los pasajeros hayan olvidado en tu vehículo para que puedan recuperarlos.
              </p>

              <!-- Formulario nuevo -->
              @if (newLostTripId()) {
                <div class="rounded-2xl p-4 flex flex-col gap-3"
                  style="background:#F0FDF4;border:1px solid rgba(16,185,129,0.3)">
                  <p class="font-bold text-sm" style="color:#0f172a">Reportar objeto olvidado</p>
                  <textarea [(ngModel)]="newLostDesc" maxlength="300" rows="3"
                    placeholder="Ej: Billetera de cuero negra con documentos"
                    class="w-full px-3 py-2 rounded-lg text-slate-900 text-sm"
                    style="background:#FFFFFF;border:1px solid #D1FAE5"></textarea>
                  <label class="w-full py-2 rounded-lg font-bold text-xs flex items-center justify-center gap-2 cursor-pointer text-slate-700"
                    style="background:#F9FAFB;border:1px dashed #D1D5DB">
                    <span class="material-symbols-outlined" style="font-size:14px">camera_alt</span>
                    {{ newLostPhoto ? newLostPhoto.name : 'Agregar foto (opcional)' }}
                    <input type="file" accept="image/*" class="hidden" (change)="onLostPhotoChange($event)" />
                  </label>
                  <div class="flex gap-2">
                    <button (click)="newLostTripId.set(null)"
                      class="flex-1 py-2 rounded-xl text-slate-700 font-bold text-xs"
                      style="background:#F3F4F6;border:1px solid #E5E7EB">Cancelar</button>
                    <button (click)="submitLostItem()" [disabled]="submittingLost() || !newLostDesc.trim()"
                      class="flex-1 py-2 rounded-xl text-white font-black text-xs disabled:opacity-50"
                      style="background:linear-gradient(135deg,#10b981,#059669)">
                      @if (submittingLost()) { Enviando... } @else { Reportar }
                    </button>
                  </div>
                </div>
              }

              <!-- Botón disparador por viaje completado -->
              @if (!newLostTripId() && driverCompletedTrips().length > 0) {
                <div class="rounded-2xl p-3 flex flex-col gap-2"
                  style="background:#F9FAFB;border:1px solid #E2E8F0">
                  <p class="text-slate-800 text-xs font-bold">Reportar sobre un viaje reciente:</p>
                  @for (t of driverCompletedTrips().slice(0, 5); track t.id) {
                    <button (click)="openReportLost(t.ag_trip_requests?.id ?? t.trip_request_id)"
                      class="flex items-center justify-between py-2 px-3 rounded-lg text-left"
                      style="background:#FFFFFF;border:1px solid #E2E8F0">
                      <div class="flex-1 min-w-0">
                        <p class="text-slate-900 text-xs font-bold truncate">{{ t.ag_trip_requests?.ag_users?.full_name ?? 'Pasajero' }}</p>
                        <p class="text-slate-500 text-[10px] truncate">{{ t.ag_trip_requests?.dest_name ?? '-' }}</p>
                      </div>
                      <span class="material-symbols-outlined text-cyan-600" style="font-size:18px">add_circle</span>
                    </button>
                  }
                </div>
              }

              <!-- Lista de reportes -->
              @if (lostItems().length === 0) {
                <p class="text-slate-500 text-center py-6 text-sm">No has reportado objetos olvidados.</p>
              } @else {
                @for (item of lostItems(); track item.id) {
                  <div class="rounded-2xl p-4 flex flex-col gap-2"
                    style="background:#FFFFFF;border:1px solid #E2E8F0;box-shadow:0 1px 4px rgba(0,0,0,0.04)">
                    <div class="flex items-start gap-3">
                      @if (item.photo_url) {
                        <img [src]="item.photo_url" class="w-16 h-16 rounded-xl object-cover" />
                      }
                      <div class="flex-1 min-w-0">
                        <p class="text-slate-900 text-sm font-bold">{{ item.ag_users?.full_name ?? 'Pasajero' }}</p>
                        <p class="text-slate-700 text-xs mt-1">{{ item.description }}</p>
                        <p class="text-slate-500 text-[10px] mt-1">{{ item.created_at | date:'dd MMM HH:mm' }}</p>
                      </div>
                      <span class="text-[10px] font-bold uppercase"
                        [class.text-yellow-400]="item.status === 'reported'"
                        [class.text-cyan-400]="item.status === 'contacted'"
                        [class.text-green-400]="item.status === 'returned'"
                        [class.text-slate-500]="item.status === 'closed'">
                        {{ item.status === 'reported' ? 'Reportado' : item.status === 'contacted' ? 'En contacto' : item.status === 'returned' ? 'Devuelto' : 'Cerrado' }}
                      </span>
                    </div>
                    <div class="flex gap-2">
                      @if (item.ag_users?.phone) {
                        <a [href]="'tel:' + item.ag_users.phone"
                          class="flex-1 py-1.5 rounded-lg text-white text-xs font-bold text-center"
                          style="background:rgba(16,185,129,0.2);border:1px solid rgba(16,185,129,0.3)">
                          📞 Llamar
                        </a>
                      }
                      @if (item.status !== 'returned' && item.status !== 'closed') {
                        <button (click)="changeLostStatus(item.id, 'returned')"
                          class="flex-1 py-1.5 rounded-lg text-white text-xs font-bold"
                          style="background:rgba(8,145,178,0.2);border:1px solid rgba(8,145,178,0.3)">
                          Marcar devuelto
                        </button>
                      }
                      @if (item.status === 'reported') {
                        <button (click)="changeLostStatus(item.id, 'contacted')"
                          class="flex-1 py-1.5 rounded-lg text-white text-xs font-bold"
                          style="background:rgba(245,158,11,0.2);border:1px solid rgba(245,158,11,0.3)">
                          En contacto
                        </button>
                      }
                    </div>
                  </div>
                }
              }
            </div>
          }

          <!-- ── NOTIFICACIONES CONDUCTOR ── -->
          @if (!loadingSection() && driverSection() === 'notifications') {
            <div class="flex flex-col gap-3">
              <p class="text-slate-600 text-xs">Controla qué notificaciones recibes.</p>

              <div class="rounded-2xl p-4 flex items-center justify-between"
                style="background:#F9FAFB;border:1px solid #E2E8F0">
                <div>
                  <p class="font-bold text-sm" style="color:#0f172a">Nuevas solicitudes</p>
                  <p class="text-slate-500 text-xs">Alerta cuando haya pasajeros cercanos</p>
                </div>
                <button (click)="toggleDriverNotifyRequests()"
                  class="w-12 h-6 rounded-full transition-colors"
                  [style.background]="driverNotifySettings().newRequests ? '#10b981' : '#D1D5DB'">
                  <div class="w-5 h-5 rounded-full bg-white transition-transform"
                    [style.transform]="driverNotifySettings().newRequests ? 'translateX(26px)' : 'translateX(2px)'"></div>
                </button>
              </div>

              <div class="rounded-2xl p-4 flex items-center justify-between"
                style="background:#F9FAFB;border:1px solid #E2E8F0">
                <div>
                  <p class="font-bold text-sm" style="color:#0f172a">Actualizaciones de viaje</p>
                  <p class="text-slate-500 text-xs">Pasajero acepta oferta, cancela, etc.</p>
                </div>
                <button (click)="toggleDriverNotifyTripUpdates()"
                  class="w-12 h-6 rounded-full transition-colors"
                  [style.background]="driverNotifySettings().tripUpdates ? '#10b981' : '#D1D5DB'">
                  <div class="w-5 h-5 rounded-full bg-white transition-transform"
                    [style.transform]="driverNotifySettings().tripUpdates ? 'translateX(26px)' : 'translateX(2px)'"></div>
                </button>
              </div>

              <div class="rounded-2xl p-4 flex items-center justify-between"
                style="background:#F9FAFB;border:1px solid #E2E8F0">
                <div>
                  <p class="font-bold text-sm" style="color:#0f172a">Ganancias y pagos</p>
                  <p class="text-slate-500 text-xs">Retiros aprobados, propinas, bonos</p>
                </div>
                <button (click)="toggleDriverNotifyEarnings()"
                  class="w-12 h-6 rounded-full transition-colors"
                  [style.background]="driverNotifySettings().earnings ? '#10b981' : '#D1D5DB'">
                  <div class="w-5 h-5 rounded-full bg-white transition-transform"
                    [style.transform]="driverNotifySettings().earnings ? 'translateX(26px)' : 'translateX(2px)'"></div>
                </button>
              </div>

              <button (click)="saveDriverNotifySettings()" [disabled]="savingDriverNotify()"
                class="w-full py-3 rounded-xl text-white font-black text-sm flex items-center justify-center gap-2 disabled:opacity-50"
                style="background:linear-gradient(135deg,#0891b2,#0e7490)">
                @if (savingDriverNotify()) { Guardando... } @else { Guardar }
              </button>
            </div>
          }

          <!-- ── REPORTAR PROBLEMA CONDUCTOR ── -->
          @if (!loadingSection() && driverSection() === 'report') {
            <div class="flex flex-col gap-4">
              <div class="rounded-2xl p-4 flex flex-col gap-3"
                style="background:#F9FAFB;border:1px solid #E2E8F0">
                <select [value]="driverReportKind()" (change)="driverReportKind.set($any($event.target).value)"
                  class="w-full px-3 py-2 rounded-lg text-slate-900 text-sm"
                  style="background:#FFFFFF;border:1px solid #D1D5DB">
                  <option value="passenger">Pasajero problemático</option>
                  <option value="incident">Incidente en viaje</option>
                  <option value="app">Problema con la app</option>
                  <option value="vehicle">Problema con vehículo</option>
                  <option value="other">Otro</option>
                </select>
                <textarea [(ngModel)]="driverReportDesc" rows="4" maxlength="500"
                  placeholder="Describe el problema con detalle"
                  class="w-full px-3 py-2 rounded-lg text-slate-900 text-sm"
                  style="background:#FFFFFF;border:1px solid #D1D5DB"></textarea>
                <button (click)="submitDriverReport()" [disabled]="submittingDriverReport() || !driverReportDesc.trim()"
                  class="w-full py-3 rounded-xl text-white font-black text-sm disabled:opacity-50"
                  style="background:linear-gradient(135deg,#ef4444,#dc2626)">
                  @if (submittingDriverReport()) { Enviando... } @else { Enviar reporte }
                </button>
              </div>

              @if (driverReports().length > 0) {
                <div>
                  <p class="font-bold text-sm mb-2" style="color:#0f172a">Mis reportes</p>
                  @for (r of driverReports(); track r.id) {
                    <div class="rounded-xl p-3 mb-2"
                      style="background:#FFFFFF;border:1px solid #E2E8F0;box-shadow:0 1px 4px rgba(0,0,0,0.04)">
                      <div class="flex items-center justify-between">
                        <span class="text-slate-900 text-xs font-bold uppercase">{{ r.type }}</span>
                        <span class="text-[10px] font-bold"
                          [class.text-amber-600]="r.status === 'open'"
                          [class.text-cyan-600]="r.status === 'reviewing'"
                          [class.text-green-600]="r.status === 'resolved'"
                          [class.text-slate-500]="r.status === 'closed'">
                          {{ r.status === 'open' ? 'Abierto' : r.status === 'reviewing' ? 'En revisión' : r.status === 'resolved' ? 'Resuelto' : r.status === 'closed' ? 'Cerrado' : r.status }}
                        </span>
                      </div>
                      <p class="text-slate-700 text-xs mt-1">{{ r.description }}</p>
                      <p class="text-slate-500 text-[10px] mt-1">{{ r.created_at | date:'dd MMM HH:mm' }}</p>
                    </div>
                  }
                </div>
              }
            </div>
          }

          <!-- ── VIAJES PROGRAMADOS ── -->
          @if (!loadingSection() && driverSection() === 'scheduled') {
            <div class="flex flex-col gap-4">
              <!-- Aviso: notificaciones manuales -->
              <div class="flex items-start gap-2 rounded-xl p-3" style="background:rgba(245,158,11,0.1);border:1px solid rgba(245,158,11,0.3)">
                <span class="material-symbols-outlined text-amber-500 mt-0.5" style="font-size:18px">info</span>
                <p class="text-amber-700 text-xs leading-snug">Los viajes programados se almacenan pero las notificaciones automáticas aún no están activas. Los conductores asignados son contactados manualmente por el equipo.</p>
              </div>
              <!-- Mis reservas -->
              <div>
                <p class="font-black text-sm mb-2" style="color:#0f172a">Mis reservas</p>
                @if (myScheduledTrips().length === 0) {
                  <p class="text-slate-500 text-xs text-center py-4">No tienes viajes reservados.</p>
                } @else {
                  <div class="flex flex-col gap-2">
                    @for (st of myScheduledTrips(); track st.id) {
                      <div class="rounded-2xl p-4 flex flex-col gap-2"
                        style="background:#F0F9FF;border:1px solid rgba(8,145,178,0.3)">
                        <div class="flex items-center justify-between">
                          <div class="flex items-center gap-2">
                            <span class="material-symbols-outlined text-cyan-600" style="font-size:18px">event</span>
                            <span class="font-bold text-sm" style="color:#0f172a">{{ st.scheduled_for | date:'dd MMM HH:mm' }}</span>
                          </div>
                          <span class="text-emerald-600 font-black text-sm">{{ '$' + (st.estimated_price ?? 0).toLocaleString('es-CO') }}</span>
                        </div>
                        <div class="text-slate-700 text-xs space-y-1">
                          <p><span class="text-slate-500">Pasajero:</span> {{ st.ag_users?.full_name ?? 'N/A' }}</p>
                          <p><span class="text-slate-500">Origen:</span> {{ st.origin_name ?? '-' }}</p>
                          <p><span class="text-slate-500">Destino:</span> {{ st.dest_name ?? '-' }}</p>
                        </div>
                        <div class="flex gap-2">
                          @if (st.ag_users?.phone) {
                            <a [href]="'tel:' + st.ag_users.phone"
                              class="flex-1 py-1.5 rounded-lg text-white text-xs font-bold text-center"
                              style="background:rgba(16,185,129,0.2);border:1px solid rgba(16,185,129,0.3)">
                              📞 Llamar
                            </a>
                          }
                          <button (click)="releaseScheduled(st.id)"
                            class="flex-1 py-1.5 rounded-lg text-red-300 text-xs font-bold"
                            style="background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.3)">
                            Liberar
                          </button>
                        </div>
                      </div>
                    }
                  </div>
                }
              </div>

              <!-- Disponibles -->
              <div>
                <p class="font-black text-sm mb-2" style="color:#0f172a">Disponibles cerca</p>
                @if (availableScheduledTrips().length === 0) {
                  <p class="text-slate-500 text-xs text-center py-4">No hay viajes programados disponibles.</p>
                } @else {
                  <div class="flex flex-col gap-2">
                    @for (st of availableScheduledTrips(); track st.id) {
                      <div class="rounded-2xl p-4 flex flex-col gap-2"
                        style="background:#FFFFFF;border:1px solid #E2E8F0;box-shadow:0 1px 4px rgba(0,0,0,0.04)">
                        <div class="flex items-center justify-between">
                          <div class="flex items-center gap-2">
                            <span class="material-symbols-outlined text-amber-500" style="font-size:18px">schedule</span>
                            <span class="font-bold text-sm" style="color:#0f172a">{{ st.scheduled_for | date:'dd MMM HH:mm' }}</span>
                          </div>
                          <span class="text-emerald-600 font-black text-sm">{{ '$' + (st.estimated_price ?? 0).toLocaleString('es-CO') }}</span>
                        </div>
                        <div class="text-slate-700 text-xs space-y-1">
                          <p><span class="text-slate-500">Origen:</span> {{ st.origin_name ?? '-' }}</p>
                          <p><span class="text-slate-500">Destino:</span> {{ st.dest_name ?? '-' }}</p>
                        </div>
                        <button (click)="claimScheduled(st.id)" [disabled]="claimingScheduledId() === st.id"
                          class="w-full py-2 rounded-xl text-white font-black text-xs disabled:opacity-50"
                          style="background:linear-gradient(135deg,#0891b2,#0e7490)">
                          @if (claimingScheduledId() === st.id) { Reservando... } @else { Reservar este viaje }
                        </button>
                      </div>
                    }
                  </div>
                }
              </div>
            </div>
          }

        </div>
      }

    </div>

    <!-- ══ Modal: Detalle de viaje con desglose ══ -->
    @if (tripDetailOpen()) {
      <div (click)="closeTripDetail()" class="fixed inset-0 z-50"
        style="background:rgba(0,0,0,0.65);backdrop-filter:blur(3px)"></div>
      <div class="fixed bottom-0 left-0 right-0 z-50 rounded-t-3xl flex flex-col gap-4 px-5 pt-5 pb-8 max-h-[90vh] overflow-y-auto"
        style="background:#0f1421;border-top:1px solid rgba(255,255,255,0.1);box-shadow:0 -8px 40px rgba(0,0,0,0.5)">
        <div class="mx-auto w-10 h-1 rounded-full bg-white/20 mb-1"></div>
        <div class="flex items-center justify-between">
          <p class="text-white font-black text-base">Detalle del viaje</p>
          <button (click)="closeTripDetail()"
            class="w-8 h-8 rounded-lg flex items-center justify-center"
            style="background:rgba(255,255,255,0.06)">
            <span class="material-symbols-outlined text-slate-400" style="font-size:20px">close</span>
          </button>
        </div>

        @if (loadingTripDetail()) {
          <div class="flex items-center justify-center py-12">
            <span class="material-symbols-outlined text-cyan-400 animate-spin" style="font-size:32px">autorenew</span>
          </div>
        } @else if (tripDetail(); as d) {
          <div class="flex flex-col gap-3">
            <!-- Info general -->
            <div class="rounded-2xl p-4" style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08)">
              <div class="flex items-center justify-between mb-2">
                <p class="text-white font-bold text-sm">{{ d.passenger_name ?? 'Pasajero' }}</p>
                <p class="text-slate-500 text-xs">{{ d.completed_at | date:'dd MMM yyyy HH:mm' }}</p>
              </div>
              <p class="text-slate-300 text-xs">
                <span class="text-slate-500">Destino:</span> {{ d.dest_name ?? '-' }}
              </p>
              <p class="text-slate-300 text-xs">
                <span class="text-slate-500">Distancia:</span> {{ (d.distance_km ?? 0) | number:'1.2-2' }} km
              </p>
              <p class="text-slate-300 text-xs">
                <span class="text-slate-500">Vehículo:</span> {{ d.vehicle_type ?? '-' }}
              </p>
            </div>

            <!-- Desglose tarifa -->
            <div class="rounded-2xl p-4 flex flex-col gap-2" style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08)">
              <p class="text-cyan-400 font-bold text-xs uppercase tracking-widest mb-1">Desglose</p>

              <div class="flex items-center justify-between">
                <span class="text-slate-400 text-xs">Tarifa base</span>
                <span class="text-white text-xs font-bold">{{ '$' + (d.base_fare ?? 0).toLocaleString('es-CO') }}</span>
              </div>
              <div class="flex items-center justify-between">
                <span class="text-slate-400 text-xs">Distancia</span>
                <span class="text-white text-xs font-bold">{{ '$' + (d.distance_fare ?? 0).toLocaleString('es-CO') }}</span>
              </div>
              @if (d.surge_multiplier > 1) {
                <div class="flex items-center justify-between">
                  <span class="text-amber-400 text-xs">⚡ Alta demanda x{{ d.surge_multiplier }}</span>
                  <span class="text-amber-400 text-xs font-bold">{{ '+$' + (d.surge_amount ?? 0).toLocaleString('es-CO') }}</span>
                </div>
              }
              <div class="border-t border-white/10 my-1"></div>
              <div class="flex items-center justify-between">
                <span class="text-white text-sm font-bold">Total al pasajero</span>
                <span class="text-white text-sm font-black">{{ '$' + (d.final_price ?? d.offered_price ?? 0).toLocaleString('es-CO') }}</span>
              </div>
              <div class="flex items-center justify-between">
                <span class="text-red-400 text-xs">Comisión plataforma ({{ d.commission_pct ?? 0 }}%)</span>
                <span class="text-red-400 text-xs font-bold">{{ '-$' + (d.commission_amount ?? 0).toLocaleString('es-CO') }}</span>
              </div>
              <div class="border-t border-white/10 my-1"></div>
              <div class="flex items-center justify-between rounded-xl p-3"
                style="background:linear-gradient(135deg,rgba(16,185,129,0.15),rgba(16,185,129,0.05))">
                <span class="text-emerald-300 text-sm font-bold">Tu ganancia neta</span>
                <span class="text-emerald-300 text-lg font-black">{{ '$' + (d.driver_net ?? 0).toLocaleString('es-CO') }}</span>
              </div>
            </div>

            <button (click)="downloadReceipt()"
              class="w-full py-3 rounded-xl text-white font-black text-sm flex items-center justify-center gap-2"
              style="background:linear-gradient(135deg,#0891b2,#0e7490)">
              <span class="material-symbols-outlined" style="font-size:16px">download</span>
              Descargar recibo
            </button>
          </div>
        } @else {
          <p class="text-slate-500 text-center py-8 text-sm">No se pudo cargar el detalle.</p>
        }
      </div>
    }

    <!-- ══ Modal: Calificar pasajero (con tags) ══ -->
    @if (passengerRatingModal()) {
      <div class="fixed inset-0 z-50" style="background:rgba(0,0,0,0.75);backdrop-filter:blur(4px)"></div>
      <div class="fixed bottom-0 left-0 right-0 z-50 rounded-t-3xl flex flex-col gap-4 px-5 pt-5 pb-8 max-h-[90vh] overflow-y-auto"
        style="background:#0f1421;border-top:1px solid rgba(255,255,255,0.1);box-shadow:0 -8px 40px rgba(0,0,0,0.5)">
        <div class="mx-auto w-10 h-1 rounded-full bg-white/20 mb-1"></div>

        <div class="text-center">
          <p class="text-white font-black text-lg">Califica al pasajero</p>
          <p class="text-slate-400 text-xs mt-1">{{ pendingRatingTrip()?.passenger_name ?? 'Pasajero' }}</p>
        </div>

        <!-- Estrellas -->
        <div class="flex items-center justify-center gap-2">
          @for (i of [1,2,3,4,5]; track i) {
            <button (click)="passengerRatingStars.set(i)"
              class="w-12 h-12 flex items-center justify-center transition-transform"
              [class.scale-110]="passengerRatingStars() >= i">
              <span class="material-symbols-outlined" style="font-size:36px"
                [style.color]="passengerRatingStars() >= i ? '#fbbf24' : 'rgba(255,255,255,0.15)'">
                star
              </span>
            </button>
          }
        </div>

        <!-- Tags -->
        <div class="flex flex-wrap gap-2 justify-center">
          @for (tag of passengerRatingTagOptions; track tag.key) {
            <button (click)="togglePassengerRatingTag(tag.key)"
              class="px-3 py-1.5 rounded-full text-xs font-bold transition-colors"
              [style.background]="passengerRatingTags().has(tag.key) ? 'rgba(8,145,178,0.3)' : 'rgba(255,255,255,0.05)'"
              [style.border]="passengerRatingTags().has(tag.key) ? '1px solid rgba(8,145,178,0.6)' : '1px solid rgba(255,255,255,0.1)'"
              [style.color]="passengerRatingTags().has(tag.key) ? '#67e8f9' : 'rgba(255,255,255,0.7)'">
              {{ tag.label }}
            </button>
          }
        </div>

        <!-- Comentario -->
        <textarea [(ngModel)]="passengerRatingComment" maxlength="300" rows="2"
          placeholder="Comentario (opcional)"
          class="w-full px-3 py-2 rounded-lg text-white text-sm"
          style="background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.1)"></textarea>

        <div class="flex gap-2">
          <button (click)="skipPassengerRating()"
            class="flex-1 py-3 rounded-xl text-slate-300 font-bold text-sm"
            style="background:rgba(255,255,255,0.05)">Omitir</button>
          <button (click)="submitPassengerRating()"
            [disabled]="passengerRatingStars() === 0 || submittingPassengerRating()"
            class="flex-1 py-3 rounded-xl text-white font-black text-sm disabled:opacity-50"
            style="background:linear-gradient(135deg,#0891b2,#0e7490)">
            @if (submittingPassengerRating()) { Enviando... } @else { Enviar }
          </button>
        </div>
      </div>
    }

    <!-- ══ Modal: Chat pasajero↔conductor ══ -->
    @if (chatOpen()) {
      <div (click)="closePassengerChat()" class="fixed inset-0 z-50"
        style="background:rgba(0,0,0,0.65);backdrop-filter:blur(3px)"></div>
      <div class="fixed bottom-0 left-0 right-0 z-50 rounded-t-3xl flex flex-col gap-2 px-5 pt-5 pb-4"
        style="background:#0f1421;border-top:1px solid rgba(255,255,255,0.1);box-shadow:0 -8px 40px rgba(0,0,0,0.5);height:70vh">
        <div class="mx-auto w-10 h-1 rounded-full bg-white/20 mb-1"></div>
        <div class="flex items-center justify-between">
          <p class="text-white font-black text-base">Chat con conductor</p>
          <button (click)="closePassengerChat()"
            class="w-8 h-8 rounded-lg flex items-center justify-center"
            style="background:rgba(255,255,255,0.06)">
            <span class="material-symbols-outlined text-slate-400" style="font-size:20px">close</span>
          </button>
        </div>
        <div id="passenger-chat-messages" class="flex-1 overflow-y-auto flex flex-col gap-2 px-1 py-2">
          @if (chatMessages().length === 0) {
            <p class="text-slate-500 text-center py-8 text-sm">Envía un mensaje al conductor.</p>
          }
          @for (m of chatMessages(); track m.id) {
            <div class="max-w-[80%] rounded-2xl px-3 py-2"
              [class.self-end]="m.sender_ag_user_id === agProfile()?.id"
              [class.self-start]="m.sender_ag_user_id !== agProfile()?.id"
              [style.background]="m.sender_ag_user_id === agProfile()?.id ? 'rgba(249,115,22,0.2)' : 'rgba(255,255,255,0.05)'">
              <p class="text-white text-sm">{{ m.message }}</p>
              <p class="text-slate-500 text-[10px] mt-1">{{ m.created_at | date:'HH:mm' }}</p>
            </div>
          }
        </div>
        <div class="flex gap-2 pt-2 border-t border-white/10">
          <input type="text" [(ngModel)]="chatInput" (keyup.enter)="sendPassengerChat()"
            placeholder="Escribe un mensaje..."
            class="flex-1 px-3 py-2 rounded-xl text-white text-sm"
            style="background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.1)" />
          <button (click)="sendPassengerChat()" [disabled]="sendingChat() || !chatInput.trim()"
            class="px-4 py-2 rounded-xl text-white font-bold text-xs disabled:opacity-50"
            style="background:linear-gradient(135deg,#f97316,#ea580c)">
            <span class="material-symbols-outlined" style="font-size:18px">send</span>
          </button>
        </div>
      </div>
    }

    <!-- ══ Modal: Detalle viaje pasajero + recibo ══ -->
    @if (passengerTripDetailOpen()) {
      <div (click)="closePassengerTripDetail()" class="fixed inset-0 z-50"
        style="background:rgba(0,0,0,0.65);backdrop-filter:blur(3px)"></div>
      <div class="fixed bottom-0 left-0 right-0 z-50 rounded-t-3xl flex flex-col gap-4 px-5 pt-5 pb-8 max-h-[90vh] overflow-y-auto"
        style="background:#0f1421;border-top:1px solid rgba(255,255,255,0.1);box-shadow:0 -8px 40px rgba(0,0,0,0.5)">
        <div class="mx-auto w-10 h-1 rounded-full bg-white/20 mb-1"></div>
        <div class="flex items-center justify-between">
          <p class="text-white font-black text-base">Detalle del viaje</p>
          <button (click)="closePassengerTripDetail()"
            class="w-8 h-8 rounded-lg flex items-center justify-center"
            style="background:rgba(255,255,255,0.06)">
            <span class="material-symbols-outlined text-slate-400" style="font-size:20px">close</span>
          </button>
        </div>

        @if (loadingPassengerDetail()) {
          <div class="flex items-center justify-center py-12">
            <span class="material-symbols-outlined text-orange-400 animate-spin" style="font-size:32px">autorenew</span>
          </div>
        } @else if (passengerTripDetail(); as d) {
          <div class="flex flex-col gap-3">
            <div class="rounded-2xl p-4" style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08)">
              <p class="text-slate-500 text-xs">{{ d.completed_at | date:'dd MMM yyyy HH:mm' }}</p>
              <p class="text-white font-bold text-sm mt-1">{{ d.driver_name ?? 'Conductor' }}
                @if (d.driver_rating) {
                  <span class="text-yellow-400 text-xs ml-1">⭐ {{ d.driver_rating }} ({{ d.driver_rating_count }})</span>
                }
              </p>
              <p class="text-slate-400 text-xs">{{ d.driver_vehicle_brand }} {{ d.driver_vehicle_model }} · {{ d.driver_plate }}</p>
              <p class="text-slate-300 text-xs mt-2">→ {{ d.dest_name }}</p>
              <p class="text-slate-400 text-xs">{{ (d.distance_km ?? 0) | number:'1.2-2' }} km · {{ d.trip_category }}</p>
            </div>

            <div class="rounded-2xl p-4 flex flex-col gap-2" style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08)">
              <p class="text-orange-400 font-bold text-xs uppercase tracking-widest mb-1">Desglose</p>
              <div class="flex justify-between"><span class="text-slate-400 text-xs">Tarifa base</span><span class="text-white text-xs font-bold">{{ '$' + (d.base_fare ?? 0).toLocaleString('es-CO') }}</span></div>
              <div class="flex justify-between"><span class="text-slate-400 text-xs">Distancia</span><span class="text-white text-xs font-bold">{{ '$' + (d.distance_fare ?? 0).toLocaleString('es-CO') }}</span></div>
              @if (d.surge_multiplier > 1) {
                <div class="flex justify-between"><span class="text-amber-400 text-xs">⚡ Alta demanda x{{ d.surge_multiplier }}</span><span class="text-amber-400 text-xs font-bold">{{ '+$' + (d.surge_amount ?? 0).toLocaleString('es-CO') }}</span></div>
              }
              @if (d.tip_amount > 0) {
                <div class="flex justify-between"><span class="text-emerald-400 text-xs">Propina</span><span class="text-emerald-400 text-xs font-bold">{{ '+$' + d.tip_amount.toLocaleString('es-CO') }}</span></div>
              }
              <div class="border-t border-white/10 my-1"></div>
              <div class="flex justify-between rounded-xl p-3" style="background:linear-gradient(135deg,rgba(249,115,22,0.15),rgba(249,115,22,0.05))">
                <span class="text-orange-300 text-sm font-bold">Total pagado</span>
                <span class="text-orange-300 text-lg font-black">{{ '$' + ((d.final_price ?? d.offered_price ?? 0) + (d.tip_amount ?? 0)).toLocaleString('es-CO') }}</span>
              </div>
            </div>

            <div class="grid grid-cols-3 gap-2">
              <button (click)="downloadPassengerReceipt()"
                class="py-2 rounded-xl text-white text-xs font-bold flex items-center justify-center gap-1"
                style="background:linear-gradient(135deg,#0891b2,#0e7490)">
                <span class="material-symbols-outlined" style="font-size:14px">download</span> Recibo
              </button>
              @if (d.status === 'completed' && d.tip_amount === 0) {
                <button (click)="closePassengerTripDetail(); openTipModal(d.id)"
                  class="py-2 rounded-xl text-white text-xs font-bold flex items-center justify-center gap-1"
                  style="background:linear-gradient(135deg,#10b981,#059669)">
                  <span class="material-symbols-outlined" style="font-size:14px">volunteer_activism</span> Propina
                </button>
              }
              <button (click)="repeatPassengerTrip(d.id)"
                class="py-2 rounded-xl text-white text-xs font-bold flex items-center justify-center gap-1"
                style="background:linear-gradient(135deg,#f97316,#ea580c)">
                <span class="material-symbols-outlined" style="font-size:14px">replay</span> Repetir
              </button>
            </div>
          </div>
        } @else {
          <p class="text-slate-500 text-center py-8 text-sm">No se pudo cargar.</p>
        }
      </div>
    }

    <!-- ══ Modal: Propina ══ -->
    @if (tipModalOpen()) {
      <div (click)="tipModalOpen.set(false)" class="fixed inset-0 z-50"
        style="background:rgba(0,0,0,0.65);backdrop-filter:blur(3px)"></div>
      <div class="fixed bottom-0 left-0 right-0 z-50 rounded-t-3xl flex flex-col gap-4 px-5 pt-5 pb-8"
        style="background:#0f1421;border-top:1px solid rgba(255,255,255,0.1);box-shadow:0 -8px 40px rgba(0,0,0,0.5)">
        <div class="mx-auto w-10 h-1 rounded-full bg-white/20 mb-1"></div>
        <div class="text-center">
          <span class="material-symbols-outlined text-emerald-400" style="font-size:40px">volunteer_activism</span>
          <p class="text-white font-black text-lg mt-2">Dejar propina</p>
          <p class="text-slate-400 text-xs mt-1">100% va directo al conductor</p>
        </div>
        <div class="grid grid-cols-4 gap-2">
          @for (p of tipPresets; track p) {
            <button (click)="tipAmount.set(p)"
              class="py-3 rounded-xl font-bold text-sm"
              [style.background]="tipAmount() === p ? 'rgba(16,185,129,0.25)' : 'rgba(255,255,255,0.05)'"
              [style.color]="tipAmount() === p ? '#34d399' : 'white'">
              {{ '$' + (p/1000) + 'k' }}
            </button>
          }
        </div>
        <input type="number" [value]="tipAmount()" (input)="tipAmount.set(+$any($event.target).value)"
          placeholder="Monto personalizado"
          class="w-full px-3 py-2 rounded-lg text-white text-sm"
          style="background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.1)" />
        <div class="flex gap-2">
          <button (click)="tipModalOpen.set(false)"
            class="flex-1 py-3 rounded-xl text-slate-300 font-bold text-sm"
            style="background:rgba(255,255,255,0.05)">Cancelar</button>
          <button (click)="submitTip()" [disabled]="submittingTip() || tipAmount() <= 0"
            class="flex-1 py-3 rounded-xl text-white font-black text-sm disabled:opacity-50"
            style="background:linear-gradient(135deg,#10b981,#059669)">
            @if (submittingTip()) { Enviando... } @else { Enviar {{ '$' + tipAmount().toLocaleString('es-CO') }} }
          </button>
        </div>
      </div>
    }

    <!-- ══ Modal: Editar perfil pasajero ══ -->
    @if (editProfileOpen()) {
      <div (click)="editProfileOpen.set(false)" class="fixed inset-0 z-50"
        style="background:rgba(0,0,0,0.65);backdrop-filter:blur(3px)"></div>
      <div class="fixed bottom-0 left-0 right-0 z-50 rounded-t-3xl flex flex-col gap-3 px-5 pt-5 pb-8 max-h-[90vh] overflow-y-auto"
        style="background:#0f1421;border-top:1px solid rgba(255,255,255,0.1);box-shadow:0 -8px 40px rgba(0,0,0,0.5)">
        <div class="mx-auto w-10 h-1 rounded-full bg-white/20 mb-1"></div>
        <p class="text-white font-black text-base">Editar perfil</p>

        <label class="text-slate-400 text-xs">Nombre completo</label>
        <input type="text" [(ngModel)]="editProfileName"
          class="w-full px-3 py-2 rounded-lg text-white text-sm"
          style="background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.1)" />

        <label class="text-slate-400 text-xs">Teléfono</label>
        <input type="tel" [(ngModel)]="editProfilePhone"
          class="w-full px-3 py-2 rounded-lg text-white text-sm"
          style="background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.1)" />

        <label class="text-slate-400 text-xs">Ciudad</label>
        <input type="text" [(ngModel)]="editProfileCity"
          class="w-full px-3 py-2 rounded-lg text-white text-sm"
          style="background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.1)" />

        <!-- Foto de perfil -->
        <div style="display:flex;flex-direction:column;align-items:center;gap:10px">
          <div style="width:88px;height:88px;border-radius:50%;overflow:hidden;border:3px solid rgba(249,115,22,0.5);background:rgba(249,115,22,0.1);display:flex;align-items:center;justify-content:center;flex-shrink:0">
            @if (editProfilePreview) {
              <img [src]="editProfilePreview" style="width:100%;height:100%;object-fit:cover" alt="preview">
            } @else if (agProfile()?.selfie_url) {
              <img [src]="agProfile()!.selfie_url!" style="width:100%;height:100%;object-fit:cover" alt="foto">
            } @else {
              <span class="material-symbols-outlined" style="font-size:36px;color:rgba(249,115,22,0.6)">person</span>
            }
          </div>
          <label style="display:flex;align-items:center;gap:6px;padding:8px 18px;border-radius:10px;cursor:pointer;font-weight:700;font-size:12px;color:#fb923c;background:rgba(249,115,22,0.08);border:1px solid rgba(249,115,22,0.3)">
            <span class="material-symbols-outlined" style="font-size:15px">photo_camera</span>
            {{ editProfileFile ? 'Foto lista' : 'Cambiar foto' }}
            <input type="file" accept="image/*" class="hidden" (change)="onEditProfileFile($event)" />
          </label>
        </div>

        <div class="flex gap-2 mt-2">
          <button (click)="editProfileOpen.set(false)"
            class="flex-1 py-3 rounded-xl text-slate-300 font-bold text-sm"
            style="background:rgba(255,255,255,0.05)">Cancelar</button>
          <button (click)="saveEditProfile()" [disabled]="savingProfile()"
            class="flex-1 py-3 rounded-xl text-white font-black text-sm disabled:opacity-50"
            style="background:linear-gradient(135deg,#f97316,#ea580c)">
            @if (savingProfile()) { Guardando... } @else { Guardar }
          </button>
        </div>
      </div>
    }

  }

  <!-- ═══════════ HOME ═══════════ -->
  @if (screen() === 'home') {
    <div class="flex flex-col items-center w-full" style="max-width:390px;font-family:'Inter',sans-serif;background:#fff">

      <!-- Logo -->
      <div class="flex items-center justify-center" style="margin-top:60px;margin-bottom:8px">
        <span style="font-size:28px;font-weight:700;color:#000;letter-spacing:-0.5px;font-family:'Inter',sans-serif">MOVI</span>
      </div>

      <!-- Headline -->
      <div class="text-center pb-8" style="padding-left:24px;padding-right:24px;margin-top:40px">
        <h1 style="font-size:32px;font-weight:700;color:#000;line-height:38px;text-align:center;letter-spacing:-0.3px;margin:0;font-family:'Inter-Bold',sans-serif">Pide tu precio.<br>Tú mandas.</h1>
        <p style="font-size:16px;font-weight:400;color:#6B7280;margin-top:8px;text-align:center;line-height:24px">
          Viajes hasta <span style="font-weight:600;color:#000">30% más baratos</span> que otras apps
        </p>
      </div>

      <!-- Value props -->
      <div class="grid grid-cols-3 w-full" style="gap:12px;padding-left:24px;padding-right:24px;padding-bottom:32px">
        <div class="flex flex-col items-center" style="background:#F5F3FF;border-radius:16px;padding:16px 8px;gap:10px">
          <span class="material-symbols-outlined" style="font-size:20px;color:#7C3AED">sell</span>
          <span style="font-size:14px;font-weight:500;color:#7C3AED;text-align:center;line-height:20px;font-family:'Inter-Medium',sans-serif">Tú propones<br>el precio</span>
        </div>
        <div class="flex flex-col items-center" style="background:#ECFDF5;border-radius:16px;padding:16px 8px;gap:10px">
          <span class="material-symbols-outlined" style="font-size:20px;color:#059669">star</span>
          <span style="font-size:14px;font-weight:500;color:#059669;text-align:center;line-height:20px;font-family:'Inter-Medium',sans-serif">Rating 4.8★</span>
        </div>
        <div class="flex flex-col items-center" style="background:#FEF3C7;border-radius:16px;padding:16px 8px;gap:10px">
          <span class="material-symbols-outlined" style="font-size:20px;color:#D97706">bolt</span>
          <span style="font-size:14px;font-weight:500;color:#D97706;text-align:center;line-height:20px;font-family:'Inter-Medium',sans-serif">Disponible<br>24/7</span>
        </div>
      </div>

      <!-- CTAs -->
      <div class="flex flex-col w-full" style="gap:12px;padding-left:24px;padding-right:24px">
        <button (click)="startQuickRegister()"
          class="w-full text-white flex items-center justify-center gap-2 active:scale-[0.97] transition-transform"
          style="height:56px;background:#7C3AED;border-radius:16px;font-size:17px;font-weight:600;letter-spacing:-0.1px;font-family:'Inter',sans-serif">
          Pasajero
        </button>
        <button (click)="qrRole.set('conductor'); screen.set('quick-register'); qrStep.set(1)"
          class="w-full text-white flex items-center justify-center gap-3 active:scale-[0.97] transition-transform"
          style="height:56px;background:#000;border-radius:16px;font-size:17px;font-weight:600;letter-spacing:-0.1px;font-family:'Inter',sans-serif">
          <div class="flex items-center gap-1">
            <span class="material-symbols-outlined" style="font-size:18px;color:#fff;font-variation-settings:'FILL' 1">directions_car</span>
            <span class="material-symbols-outlined" style="font-size:18px;color:#fff;font-variation-settings:'FILL' 1">two_wheeler</span>
            <span class="material-symbols-outlined" style="font-size:18px;color:#fff;font-variation-settings:'FILL' 1">local_shipping</span>
          </div>
          Conductor
        </button>
      </div>

      <!-- Referral banner -->
      <div class="w-full" style="padding:20px 24px 40px">
        <div class="flex items-center" style="background:#FFFBEB;border:1px solid #FDE68A;border-radius:12px;padding:16px;gap:10px">
          <span class="material-symbols-outlined flex-shrink-0" style="font-size:20px;color:#D97706">redeem</span>
          <p style="font-size:13px;font-weight:500;color:#92400E;line-height:18px;margin:0">
            Invita amigos y gana <span style="font-weight:700">$5.000 en créditos</span> para tu próximo viaje
          </p>
        </div>
      </div>

    </div>
  }

  <!-- ═══════════ REGISTRO RÁPIDO (3 PASOS) ═══════════ -->
  @if (screen() === 'quick-register') {
    <div class="w-full flex flex-col items-center" style="min-height:100dvh;max-width:420px">

      <!-- ── PASO 1: Nombre + Teléfono ── -->
      @if (qrStep() === 1) {
        <div class="w-full flex flex-col gap-5 px-5 pt-6 pb-8">

          <!-- Header -->
          <div class="flex items-center gap-3">
            <button (click)="screen.set('home')"
              style="width:40px;height:40px;border-radius:50%;background:#F3F4F6;border:1px solid #E5E7EB;display:flex;align-items:center;justify-content:center;flex-shrink:0">
              <span class="material-symbols-outlined" style="font-size:18px;color:#374151">arrow_back</span>
            </button>
            <div>
              <h2 style="color:#111827;font-weight:900;font-size:20px;margin:0;line-height:1.1">{{ qrRole() === 'conductor' ? 'Crear Cuenta Conductor' : 'Crear Cuenta Pasajero' }}</h2>
              <p style="color:#6B7280;font-size:12px;margin:0">Paso 1 de 3 · Verifica tu número</p>
            </div>
          </div>

          <!-- Progreso -->
          <div style="display:flex;gap:4px">
            <div style="flex:1;height:3px;border-radius:99px;background:#7C3AED"></div>
            <div style="flex:1;height:3px;border-radius:99px;background:#E5E7EB"></div>
            <div style="flex:1;height:3px;border-radius:99px;background:#E5E7EB"></div>
          </div>

          <!-- Icono central -->
          <div style="display:flex;flex-direction:column;align-items:center;gap:8px;padding:12px 0">
            <div style="width:72px;height:72px;border-radius:24px;background:linear-gradient(135deg,#7C3AED,#3B82F6);display:flex;align-items:center;justify-content:center">
              <span class="material-symbols-outlined" style="font-size:36px;color:#fff">hail</span>
            </div>
            <p style="color:#6B7280;font-size:13px;text-align:center;margin:0">Ingresa tu número. Te enviamos un código<br>en 10 segundos.</p>
          </div>

          <!-- Formulario -->
          <div style="display:flex;flex-direction:column;gap:14px">
            <!-- Nombre -->
            <div style="display:flex;flex-direction:column;gap:5px">
              <label style="color:#374151;font-size:11px;font-weight:700;letter-spacing:0.08em">Nombre</label>
              <input
                [(ngModel)]="qrNameDisplay"
                (ngModelChange)="qrName.set($event)"
                name="qrName"
                type="text" autocomplete="given-name" placeholder="Tu nombre"
                class="qr-input"
                style="background:#F9FAFB;border-style:solid;border-radius:14px;padding:14px 16px;color:#111827;font-size:16px;font-weight:600;width:100%;box-sizing:border-box"
              />
            </div>

            <!-- Teléfono -->
            <div style="display:flex;flex-direction:column;gap:5px">
              <label style="color:#374151;font-size:11px;font-weight:700;letter-spacing:0.08em">Teléfono</label>
              <div style="display:flex;align-items:center;gap:8px">
                <div style="flex-shrink:0;padding:11px 12px;background:#F3F4F6;border:1px solid #E5E7EB;border-radius:12px;color:#374151;font-size:14px;font-weight:700;white-space:nowrap">
                  +57
                </div>
                <input
                  [(ngModel)]="qrPhoneDisplay"
                  (ngModelChange)="qrPhone.set($event.replace(/\D/g,'').slice(0,10))"
                  name="qrPhone"
                  type="tel" inputmode="numeric" maxlength="10" placeholder="300 123 4567"
                  class="qr-input"
                  style="flex:1;background:#F9FAFB;border-style:solid;border-radius:12px;padding:11px 14px;color:#111827;font-size:16px;font-weight:700;letter-spacing:0.03em;box-sizing:border-box"
                />
              </div>
            </div>

            @if (qrError()) {
              <div style="background:#FEF2F2;border:1px solid #FECACA;border-radius:12px;padding:10px 14px;color:#DC2626;font-size:12px;text-align:center">
                {{ qrError() }}
              </div>
            }
          </div>

          <!-- CTA -->
          <button (click)="qrSendOtp()" [disabled]="qrOtpSending() || qrPhone().length !== 10"
            style="width:100%;padding:16px;border-radius:16px;background:linear-gradient(135deg,#7C3AED,#3B82F6);color:#fff;font-family:'Inter-Semibold',sans-serif;font-size:16px;font-weight:600;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center"
            [style.opacity]="qrOtpSending() || qrPhone().length !== 10 ? '0.9' : '1'">
            @if (qrOtpSending()) {
              <span class="material-symbols-outlined animate-spin" style="font-size:18px;margin-right:8px">autorenew</span> Enviando SMS...
            } @else {
              Continuar
            }
          </button>

          <!-- Link conductor -->
          <p style="text-align:center;color:#6B7280;font-size:12px;margin-top:4px">
            ¿Eres conductor?
            <button (click)="screen.set('driver-form'); driverStep.set(1)"
              style="background:none;border:none;color:#7C3AED;font-weight:700;font-size:12px;cursor:pointer;padding:0;margin-left:2px">
              Regístrate aquí
            </button>
          </p>
        </div>
      }

      <!-- ── PASO 2: Verificar OTP ── -->
      @if (qrStep() === 2) {
        <div class="w-full flex flex-col gap-5 px-5 pt-6 pb-8">

          <!-- Header -->
          <div class="flex items-center gap-3">
            <button (click)="qrStep.set(1)"
              style="width:40px;height:40px;border-radius:50%;background:#F3F4F6;border:1px solid #E5E7EB;display:flex;align-items:center;justify-content:center;flex-shrink:0">
              <span class="material-symbols-outlined" style="font-size:18px;color:#374151">arrow_back</span>
            </button>
            <div>
              <h2 style="color:#111827;font-weight:900;font-size:20px;margin:0;line-height:1.1">Verificar número</h2>
              <p style="color:#6B7280;font-size:12px;margin:0">Paso 2 de 3 · Código SMS</p>
            </div>
          </div>

          <!-- Progreso -->
          <div style="display:flex;gap:4px">
            <div style="flex:1;height:3px;border-radius:99px;background:#7C3AED"></div>
            <div style="flex:1;height:3px;border-radius:99px;background:#7C3AED"></div>
            <div style="flex:1;height:3px;border-radius:99px;background:#E5E7EB"></div>
          </div>

          <!-- Info -->
          <div style="display:flex;flex-direction:column;align-items:center;gap:8px;padding:12px 0">
            <div style="width:72px;height:72px;border-radius:16px;background:linear-gradient(135deg,#7C3AED,#3B82F6);display:flex;align-items:center;justify-content:center">
              <span class="material-symbols-outlined" style="font-size:36px;color:#fff;font-variation-settings:'FILL' 1">sms</span>
            </div>
            <p style="color:#6B7280;font-size:13px;text-align:center;margin:0;line-height:1.6">
              Enviamos un código de 6 dígitos a<br>
              <span style="color:#111827;font-weight:700;font-size:15px">+57 {{ qrPhone() }}</span>
            </p>
          </div>

          <!-- Input código -->
          <div style="display:flex;flex-direction:column;gap:5px">
            <label style="color:#6B7280;font-size:13px;font-weight:500;text-align:center">Código de verificación</label>
            <input
              [(ngModel)]="qrOtpCodeDisplay"
              (ngModelChange)="qrOtpCode.set($event.replace(/\D/g,'').slice(0,6))"
              name="qrOtpCode"
              type="tel" inputmode="numeric" maxlength="6"
              placeholder="_ _ _ _ _ _"
              [disabled]="qrOtpVerifying()"
              class="qr-input"
              style="background:#F9FAFB;border-style:solid;border-radius:12px;height:52px;padding:0 16px;color:#111827;font-size:28px;font-weight:900;letter-spacing:0.4em;text-align:center;width:100%;box-sizing:border-box"
            />
          </div>

          @if (qrOtpError()) {
            <div style="background:#FEF2F2;border:1px solid #FECACA;border-radius:12px;padding:10px 14px;color:#DC2626;font-size:12px;text-align:center">
              {{ qrOtpError() }}
            </div>
          }

          <!-- Confirmar -->
          <button (click)="qrVerifyOtp()" [disabled]="qrOtpVerifying() || qrOtpCode().length < 6"
            style="width:100%;padding:16px;border-radius:16px;background:linear-gradient(135deg,#7C3AED,#3B82F6);color:#fff;font-weight:600;font-size:16px;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center"
            [style.opacity]="qrOtpVerifying() || qrOtpCode().length < 6 ? '0.9' : '1'">
            @if (qrOtpVerifying()) {
              <span class="material-symbols-outlined animate-spin" style="font-size:18px;margin-right:8px">autorenew</span> Verificando...
            } @else {
              Confirmar código
            }
          </button>

          <!-- Reenviar con countdown -->
          <div style="text-align:center">
            @if (qrResendCountdown() > 0) {
              <p style="color:#6B7280;font-size:13px;margin:0">
                Reenviar en <span style="color:#7C3AED;font-weight:700">{{ qrResendCountdown() }}s</span>
              </p>
            } @else {
              <button (click)="qrResendOtp()"
                style="background:none;border:none;color:#7C3AED;font-weight:700;font-size:13px;cursor:pointer;padding:0">
                ¿No llegó? Reenviar SMS
              </button>
            }
          </div>
        </div>
      }

      <!-- ── PASO 3: Origen, Destino y Precio ── -->
      @if (qrStep() === 3 && qrRole() === 'conductor') {
        <div class="w-full flex flex-col gap-5 px-5 pt-6 pb-8">

          <!-- Header -->
          <div class="flex items-center gap-3">
            <button (click)="qrStep.set(2)"
              style="width:40px;height:40px;border-radius:50%;background:#F3F4F6;border:1px solid #E5E7EB;display:flex;align-items:center;justify-content:center;flex-shrink:0">
              <span class="material-symbols-outlined" style="font-size:18px;color:#374151">arrow_back</span>
            </button>
            <div>
              <h2 style="color:#111827;font-weight:900;font-size:20px;margin:0;line-height:1.1">Crear Cuenta Conductor</h2>
              <p style="color:#6B7280;font-size:12px;margin:0">Paso 3 de 3 · Tipo de vehículo</p>
            </div>
          </div>

          <!-- Progreso -->
          <div style="display:flex;gap:4px">
            <div style="flex:1;height:3px;border-radius:99px;background:#7C3AED"></div>
            <div style="flex:1;height:3px;border-radius:99px;background:#7C3AED"></div>
            <div style="flex:1;height:3px;border-radius:99px;background:#7C3AED"></div>
          </div>

          <!-- Icono central -->
          <div style="display:flex;flex-direction:column;align-items:center;gap:8px;padding:12px 0">
            <div style="width:72px;height:72px;border-radius:16px;background:linear-gradient(135deg,#7C3AED,#3B82F6);display:flex;align-items:center;justify-content:center">
              <span class="material-symbols-outlined" style="font-size:36px;color:#fff;font-variation-settings:'FILL' 1">commute</span>
            </div>
            <p style="color:#6B7280;font-size:13px;text-align:center;margin:0;line-height:1.5">Elige el tipo de vehículo con el que<br>vas a prestar el servicio</p>
          </div>

          <!-- Selector de vehículo -->
          <div style="display:flex;flex-direction:column;gap:12px">

            <button (click)="qrVehicleType.set('carro')"
              style="width:100%;display:flex;align-items:center;gap:16px;padding:16px;border-radius:16px;border:1.5px solid;cursor:pointer;transition:all 0.15s;text-align:left"
              [style.borderColor]="qrVehicleType() === 'carro' ? '#7C3AED' : '#E5E7EB'"
              [style.background]="qrVehicleType() === 'carro' ? '#F5F3FF' : '#F9FAFB'">
              <div style="width:48px;height:48px;border-radius:12px;display:flex;align-items:center;justify-content:center;flex-shrink:0"
                [style.background]="qrVehicleType() === 'carro' ? '#7C3AED' : '#E5E7EB'">
                <span class="material-symbols-outlined" style="font-size:26px;font-variation-settings:'FILL' 1"
                  [style.color]="qrVehicleType() === 'carro' ? '#fff' : '#6B7280'">directions_car</span>
              </div>
              <div>
                <p style="margin:0;font-weight:600;font-size:15px" [style.color]="qrVehicleType() === 'carro' ? '#7C3AED' : '#111827'">Carro / Camioneta</p>
                <p style="margin:0;font-size:12px;color:#6B7280">Servicio de transporte urbano</p>
              </div>
              @if (qrVehicleType() === 'carro') {
                <span class="material-symbols-outlined" style="font-size:20px;color:#7C3AED;margin-left:auto;font-variation-settings:'FILL' 1">check_circle</span>
              }
            </button>

            <button (click)="qrVehicleType.set('moto')"
              style="width:100%;display:flex;align-items:center;gap:16px;padding:16px;border-radius:16px;border:1.5px solid;cursor:pointer;transition:all 0.15s;text-align:left"
              [style.borderColor]="qrVehicleType() === 'moto' ? '#7C3AED' : '#E5E7EB'"
              [style.background]="qrVehicleType() === 'moto' ? '#F5F3FF' : '#F9FAFB'">
              <div style="width:48px;height:48px;border-radius:12px;display:flex;align-items:center;justify-content:center;flex-shrink:0"
                [style.background]="qrVehicleType() === 'moto' ? '#7C3AED' : '#E5E7EB'">
                <span class="material-symbols-outlined" style="font-size:26px;font-variation-settings:'FILL' 1"
                  [style.color]="qrVehicleType() === 'moto' ? '#fff' : '#6B7280'">two_wheeler</span>
              </div>
              <div>
                <p style="margin:0;font-weight:600;font-size:15px" [style.color]="qrVehicleType() === 'moto' ? '#7C3AED' : '#111827'">Moto</p>
                <p style="margin:0;font-size:12px;color:#6B7280">Mensajería y domicilios rápidos</p>
              </div>
              @if (qrVehicleType() === 'moto') {
                <span class="material-symbols-outlined" style="font-size:20px;color:#7C3AED;margin-left:auto;font-variation-settings:'FILL' 1">check_circle</span>
              }
            </button>

            <button (click)="qrVehicleType.set('camion')"
              style="width:100%;display:flex;align-items:center;gap:16px;padding:16px;border-radius:16px;border:1.5px solid;cursor:pointer;transition:all 0.15s;text-align:left"
              [style.borderColor]="qrVehicleType() === 'camion' ? '#7C3AED' : '#E5E7EB'"
              [style.background]="qrVehicleType() === 'camion' ? '#F5F3FF' : '#F9FAFB'">
              <div style="width:48px;height:48px;border-radius:12px;display:flex;align-items:center;justify-content:center;flex-shrink:0"
                [style.background]="qrVehicleType() === 'camion' ? '#7C3AED' : '#E5E7EB'">
                <span class="material-symbols-outlined" style="font-size:26px;font-variation-settings:'FILL' 1"
                  [style.color]="qrVehicleType() === 'camion' ? '#fff' : '#6B7280'">local_shipping</span>
              </div>
              <div>
                <p style="margin:0;font-weight:600;font-size:15px" [style.color]="qrVehicleType() === 'camion' ? '#7C3AED' : '#111827'">Camión de Acarreos</p>
                <p style="margin:0;font-size:12px;color:#6B7280">Mudanzas y carga pesada</p>
              </div>
              @if (qrVehicleType() === 'camion') {
                <span class="material-symbols-outlined" style="font-size:20px;color:#7C3AED;margin-left:auto;font-variation-settings:'FILL' 1">check_circle</span>
              }
            </button>
          </div>

          <!-- Datos del vehículo -->
          <div style="display:flex;flex-direction:column;gap:10px">
            <p style="color:#374151;font-size:13px;font-weight:700;margin:0">Datos del vehículo</p>
            <div style="display:flex;flex-direction:column;gap:8px">
              <input [(ngModel)]="qrVehicleBrandVal" (ngModelChange)="qrVehicleBrand.set($event)"
                placeholder="Marca (ej: Yamaha, Toyota)"
                style="width:100%;padding:13px 14px;border-radius:12px;border:1.5px solid #D1D5DB;background:#F9FAFB;color:#111827;font-size:14px;outline:none;box-sizing:border-box"
                [style.borderColor]="qrVehicleBrand() ? '#7C3AED' : '#D1D5DB'" />
              <input [(ngModel)]="qrVehicleColorVal" (ngModelChange)="qrVehicleColor.set($event)"
                placeholder="Color (ej: Rojo, Negro)"
                style="width:100%;padding:13px 14px;border-radius:12px;border:1.5px solid #D1D5DB;background:#F9FAFB;color:#111827;font-size:14px;outline:none;box-sizing:border-box"
                [style.borderColor]="qrVehicleColor() ? '#7C3AED' : '#D1D5DB'" />
              <input [(ngModel)]="qrVehiclePlateVal" (ngModelChange)="qrVehiclePlate.set($event.toUpperCase())"
                placeholder="Placa (ej: ABC123)"
                style="width:100%;padding:13px 14px;border-radius:12px;border:1.5px solid #D1D5DB;background:#F9FAFB;color:#111827;font-size:14px;outline:none;box-sizing:border-box;text-transform:uppercase"
                [style.borderColor]="qrVehiclePlate() ? '#7C3AED' : '#D1D5DB'" />
            </div>
          </div>

          <!-- Error -->
          @if (qrOtpError()) {
            <div style="background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.3);border-radius:12px;padding:12px 14px;text-align:center">
              <p style="color:#f87171;font-size:13px;margin:0">{{ qrOtpError() }}</p>
            </div>
          }

          <!-- CTA -->
          <button (click)="qrSaveVehicleAndEnter()"
            [disabled]="!qrVehicleType() || !qrVehicleBrand() || !qrVehicleColor() || !qrVehiclePlate() || qrOtpVerifying()"
            style="width:100%;padding:16px;border-radius:16px;background:linear-gradient(135deg,#7C3AED,#3B82F6);color:#fff;font-family:'Inter-Semibold',sans-serif;font-size:16px;font-weight:600;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px"
            [style.opacity]="!qrVehicleType() || qrOtpVerifying() ? '0.9' : '1'">
            @if (qrOtpVerifying()) {
              <span class="material-symbols-outlined animate-spin" style="font-size:18px">autorenew</span> Creando perfil...
            } @else {
              Empezar a conducir
            }
          </button>

        </div>
      }

      @if (qrStep() === 3 && qrRole() === 'pasajero') {
        <div class="w-full flex flex-col gap-4 px-5 pt-6 pb-8">

          <!-- Header -->
          <div class="flex items-center gap-3">
            <button (click)="qrStep.set(2)"
              style="width:40px;height:40px;border-radius:50%;background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.12);display:flex;align-items:center;justify-content:center;flex-shrink:0">
              <span class="material-symbols-outlined" style="font-size:18px;color:#fff">arrow_back</span>
            </button>
            <div>
              <h2 style="color:#fff;font-weight:900;font-size:20px;margin:0;line-height:1.1">
                ¡Hola{{ qrName() ? ', ' + qrName().split(' ')[0] : '' }}! ¿A dónde vas?
              </h2>
              <p style="color:#64748b;font-size:12px;margin:0">Paso 3 de 3 · Tu viaje</p>
            </div>
          </div>

          <!-- Progreso -->
          <div style="display:flex;gap:4px">
            <div style="flex:1;height:3px;border-radius:99px;background:#7C3AED"></div>
            <div style="flex:1;height:3px;border-radius:99px;background:#7C3AED"></div>
            <div style="flex:1;height:3px;border-radius:99px;background:#7C3AED"></div>
          </div>

          <!-- Origen -->
          <div style="display:flex;flex-direction:column;gap:5px">
            <label style="color:#94a3b8;font-size:11px;font-weight:700;letter-spacing:0.08em">PUNTO DE ORIGEN</label>
            @if (qrOriginSelected()) {
              <div style="display:flex;align-items:center;gap:10px;background:rgba(34,197,94,0.08);border:1px solid rgba(34,197,94,0.3);border-radius:14px;padding:12px 14px">
                <span class="material-symbols-outlined" style="font-size:20px;color:#22c55e;flex-shrink:0">my_location</span>
                <p style="color:#fff;font-size:14px;font-weight:600;flex:1;margin:0;word-break:break-word">{{ qrOriginSelected()!.name }}</p>
                <button (click)="qrOriginSelected.set(null); qrOriginQuery.set('')"
                  style="background:none;border:none;color:#64748b;cursor:pointer;padding:0;flex-shrink:0">
                  <span class="material-symbols-outlined" style="font-size:18px">close</span>
                </button>
              </div>
            } @else {
              <div style="position:relative">
                <div style="display:flex;align-items:center;gap:10px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.12);border-radius:14px;padding:12px 14px">
                  <span class="material-symbols-outlined" style="font-size:20px;color:#22c55e;flex-shrink:0">my_location</span>
                  <input
                    [value]="qrOriginQuery()"
                    (input)="onQrOriginInput($any($event.target).value)"
                    type="text" placeholder="¿Desde dónde saldrás?"
                    style="flex:1;background:transparent;border:none;color:#fff;font-size:14px;font-weight:500;outline:none;min-width:0"
                  />
                </div>
                @if (qrOriginSuggestions().length > 0) {
                  <div style="position:absolute;top:calc(100% + 4px);left:0;right:0;background:#0f1421;border:1px solid rgba(255,255,255,0.1);border-radius:14px;overflow:hidden;z-index:50;max-height:200px;overflow-y:auto">
                    @for (s of qrOriginSuggestions(); track s.id) {
                      <button (mousedown)="$event.preventDefault(); qrSelectOrigin(s)"
                        style="width:100%;display:flex;align-items:flex-start;gap:10px;padding:12px 14px;border:none;background:transparent;cursor:pointer;text-align:left;border-bottom:1px solid rgba(255,255,255,0.05)">
                        <span class="material-symbols-outlined" style="font-size:16px;color:#22c55e;margin-top:2px;flex-shrink:0">location_on</span>
                        <div style="min-width:0">
                          <p style="color:#fff;font-size:13px;font-weight:600;margin:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">{{ s.text }}</p>
                          <p style="color:#64748b;font-size:11px;margin:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">{{ s.place_name }}</p>
                        </div>
                      </button>
                    }
                  </div>
                }
              </div>
            }
          </div>

          <!-- Destino -->
          <div style="display:flex;flex-direction:column;gap:5px">
            <label style="color:#94a3b8;font-size:11px;font-weight:700;letter-spacing:0.08em">DESTINO</label>
            @if (qrDestSelected()) {
              <div style="display:flex;align-items:center;gap:10px;background:rgba(124,58,237,0.08);border:1px solid rgba(124,58,237,0.3);border-radius:14px;padding:12px 14px">
                <span class="material-symbols-outlined" style="font-size:20px;color:#a78bfa;flex-shrink:0">location_on</span>
                <p style="color:#fff;font-size:14px;font-weight:600;flex:1;margin:0;word-break:break-word">{{ qrDestSelected()!.name }}</p>
                <button (click)="qrDestSelected.set(null); qrDestQuery.set('')"
                  style="background:none;border:none;color:#64748b;cursor:pointer;padding:0;flex-shrink:0">
                  <span class="material-symbols-outlined" style="font-size:18px">close</span>
                </button>
              </div>
            } @else {
              <div style="position:relative">
                <div style="display:flex;align-items:center;gap:10px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.12);border-radius:14px;padding:12px 14px">
                  <span class="material-symbols-outlined" style="font-size:20px;color:#a78bfa;flex-shrink:0">location_on</span>
                  <input
                    [value]="qrDestQuery()"
                    (input)="onQrDestInput($any($event.target).value)"
                    type="text" placeholder="¿A dónde vas?"
                    style="flex:1;background:transparent;border:none;color:#fff;font-size:14px;font-weight:500;outline:none;min-width:0"
                  />
                </div>
                @if (qrDestSuggestions().length > 0) {
                  <div style="position:absolute;top:calc(100% + 4px);left:0;right:0;background:#0f1421;border:1px solid rgba(255,255,255,0.1);border-radius:14px;overflow:hidden;z-index:50;max-height:200px;overflow-y:auto">
                    @for (s of qrDestSuggestions(); track s.id) {
                      <button (mousedown)="$event.preventDefault(); qrSelectDest(s)"
                        style="width:100%;display:flex;align-items:flex-start;gap:10px;padding:12px 14px;border:none;background:transparent;cursor:pointer;text-align:left;border-bottom:1px solid rgba(255,255,255,0.05)">
                        <span class="material-symbols-outlined" style="font-size:16px;color:#a78bfa;margin-top:2px;flex-shrink:0">location_on</span>
                        <div style="min-width:0">
                          <p style="color:#fff;font-size:13px;font-weight:600;margin:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">{{ s.text }}</p>
                          <p style="color:#64748b;font-size:11px;margin:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">{{ s.place_name }}</p>
                        </div>
                      </button>
                    }
                  </div>
                }
              </div>
            }
          </div>

          <!-- Tipo de vehículo -->
          <div style="display:flex;flex-direction:column;gap:5px">
            <label style="color:#94a3b8;font-size:11px;font-weight:700;letter-spacing:0.08em">TIPO DE VEHÍCULO</label>
            <div style="display:flex;gap:8px">
              <button (click)="qrVehicle.set('carro')"
                style="flex:1;padding:12px;border-radius:14px;display:flex;flex-direction:column;align-items:center;gap:4px;border:none;cursor:pointer;transition:all 0.15s"
                [style.background]="qrVehicle() === 'carro' ? 'rgba(124,58,237,0.2)' : 'rgba(255,255,255,0.05)'"
                [style.border]="qrVehicle() === 'carro' ? '1.5px solid rgba(124,58,237,0.5)' : '1.5px solid rgba(255,255,255,0.08)'">
                <span class="material-symbols-outlined" [style.color]="qrVehicle() === 'carro' ? '#a78bfa' : '#64748b'" style="font-size:24px">directions_car</span>
                <span style="font-size:12px;font-weight:700" [style.color]="qrVehicle() === 'carro' ? '#a78bfa' : '#64748b'">Carro</span>
              </button>
              <button (click)="qrVehicle.set('moto')"
                style="flex:1;padding:12px;border-radius:14px;display:flex;flex-direction:column;align-items:center;gap:4px;border:none;cursor:pointer;transition:all 0.15s"
                [style.background]="qrVehicle() === 'moto' ? 'rgba(124,58,237,0.2)' : 'rgba(255,255,255,0.05)'"
                [style.border]="qrVehicle() === 'moto' ? '1.5px solid rgba(124,58,237,0.5)' : '1.5px solid rgba(255,255,255,0.08)'">
                <span class="material-symbols-outlined" [style.color]="qrVehicle() === 'moto' ? '#a78bfa' : '#64748b'" style="font-size:24px">two_wheeler</span>
                <span style="font-size:12px;font-weight:700" [style.color]="qrVehicle() === 'moto' ? '#a78bfa' : '#64748b'">Moto</span>
              </button>
              <button (click)="qrVehicle.set('camion')"
                style="flex:1;padding:12px;border-radius:14px;display:flex;flex-direction:column;align-items:center;gap:4px;border:none;cursor:pointer;transition:all 0.15s"
                [style.background]="qrVehicle() === 'camion' ? 'rgba(124,58,237,0.2)' : 'rgba(255,255,255,0.05)'"
                [style.border]="qrVehicle() === 'camion' ? '1.5px solid rgba(124,58,237,0.5)' : '1.5px solid rgba(255,255,255,0.08)'">
                <span class="material-symbols-outlined" [style.color]="qrVehicle() === 'camion' ? '#a78bfa' : '#64748b'" style="font-size:24px">local_shipping</span>
                <span style="font-size:12px;font-weight:700" [style.color]="qrVehicle() === 'camion' ? '#a78bfa' : '#64748b'">Camión</span>
              </button>
            </div>
          </div>

          <!-- Precio propuesto -->
          <div style="display:flex;flex-direction:column;gap:5px">
            <label style="color:#94a3b8;font-size:11px;font-weight:700;letter-spacing:0.08em">TU PRECIO PROPUESTO</label>
            <div style="display:flex;align-items:center;gap:8px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.12);border-radius:14px;padding:10px 14px">
              <button (click)="qrPrice.set(qrPrice() > 2500 ? qrPrice() - 500 : 2000)"
                style="width:36px;height:36px;border-radius:10px;background:rgba(255,255,255,0.08);border:none;color:#fff;font-size:20px;font-weight:900;cursor:pointer;flex-shrink:0">−</button>
              <div style="flex:1;text-align:center">
                <span style="color:#fff;font-weight:900;font-size:22px">{{ '$' + qrPrice() }}</span>
              </div>
              <button (click)="qrPrice.set(qrPrice() + 500)"
                style="width:36px;height:36px;border-radius:10px;background:rgba(255,255,255,0.08);border:none;color:#fff;font-size:20px;font-weight:900;cursor:pointer;flex-shrink:0">+</button>
            </div>
            <p style="color:#475569;font-size:11px;text-align:center;margin:2px 0 0">El conductor puede aceptar o contraofertar</p>
          </div>

          <!-- Método de pago -->
          <div style="display:flex;flex-direction:column;gap:5px">
            <label style="color:#94a3b8;font-size:11px;font-weight:700;letter-spacing:0.08em">MÉTODO DE PAGO</label>
            <div style="display:flex;gap:6px;flex-wrap:wrap">
              @for (pm of [{k:'efectivo',l:'Efectivo',i:'payments'},{k:'nequi',l:'Nequi',i:'smartphone'},{k:'daviplata',l:'Daviplata',i:'smartphone'}]; track pm.k) {
                <button (click)="qrPayment.set($any(pm.k))"
                  style="flex:1;min-width:80px;padding:10px 8px;border-radius:12px;display:flex;flex-direction:column;align-items:center;gap:3px;border:none;cursor:pointer;transition:all 0.15s"
                  [style.background]="qrPayment() === pm.k ? 'rgba(124,58,237,0.2)' : 'rgba(255,255,255,0.05)'"
                  [style.border]="qrPayment() === pm.k ? '1.5px solid rgba(124,58,237,0.5)' : '1.5px solid rgba(255,255,255,0.08)'">
                  <span class="material-symbols-outlined" [style.color]="qrPayment() === pm.k ? '#a78bfa' : '#64748b'" style="font-size:18px">{{ pm.i }}</span>
                  <span style="font-size:11px;font-weight:700" [style.color]="qrPayment() === pm.k ? '#a78bfa' : '#64748b'">{{ pm.l }}</span>
                </button>
              }
            </div>
          </div>

          @if (qrError()) {
            <div style="background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.3);border-radius:12px;padding:10px 14px;color:#fca5a5;font-size:12px;text-align:center">
              {{ qrError() }}
            </div>
          }

          <!-- Buscar conductor -->
          <button (click)="qrSubmitTrip()" [disabled]="qrSubmitting() || !qrOriginSelected() || !qrDestSelected() || qrPrice() < 2000"
            style="width:100%;padding:16px;border-radius:16px;background:linear-gradient(135deg,#7C3AED,#2563EB);color:#fff;font-weight:900;font-size:16px;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;box-shadow:0 6px 24px rgba(124,58,237,0.4);margin-top:4px"
            [style.opacity]="qrSubmitting() || !qrOriginSelected() || !qrDestSelected() || qrPrice() < 2000 ? '0.5' : '1'">
            @if (qrSubmitting()) {
              <span class="material-symbols-outlined animate-spin" style="font-size:18px">autorenew</span> Buscando conductor...
            } @else {
              <span class="material-symbols-outlined" style="font-size:18px">search</span> Buscar conductor
            }
          </button>
        </div>
      }

    </div>
  }

  <!-- ═══════════ FORMULARIO PASAJERO ═══════════ -->
  @if (screen() === 'passenger-form') {
    <div class="w-full max-w-lg px-1">
      <!-- Header -->
      <div class="flex items-center gap-3 mb-5">
        <button (click)="screen.set('home')" class="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center flex-shrink-0 active:scale-90 transition-transform">
          <span class="material-symbols-outlined text-white" style="font-size:18px">arrow_back</span>
        </button>
        <div>
          <h2 class="text-white font-black text-lg sm:text-xl">Registro de Pasajero</h2>
          <p class="text-slate-500 text-xs">Completa todos los campos</p>
        </div>
      </div>

      <div class="rounded-2xl p-3 mb-4"
        style="background:rgba(59,130,246,0.08);border:1px solid rgba(59,130,246,0.2)">
        <p class="text-slate-300 text-xs leading-relaxed">
          <span class="material-symbols-outlined text-blue-400 align-middle" style="font-size:14px">verified_user</span>
          En <span class="text-white font-bold">Movi</span> verificamos cada registro para garantizar tu seguridad y la de los conductores. Escribe tus datos exactamente como figuran en tu documento de identidad. Así activamos tu cuenta más rápido.
        </p>
      </div>

      @if (passengerSuccess()) {
        <div class="flex flex-col items-center gap-4 py-16 text-center">
          <div class="w-16 h-16 rounded-2xl bg-emerald-500/10 border-2 border-emerald-500/30 flex items-center justify-center">
            <span class="material-symbols-outlined text-emerald-400" style="font-size:36px">check_circle</span>
          </div>
          <h3 class="text-white font-black text-xl">¡Cuenta creada!</h3>
          <p class="text-slate-400 text-sm">Tu cuenta de pasajero fue registrada exitosamente.</p>
          <button (click)="screen.set('home'); passengerSuccess.set(false)" class="mt-2 px-8 py-3 rounded-xl bg-orange-500 text-black font-black text-sm">Volver al inicio</button>
        </div>
      } @else {
        <form (ngSubmit)="submitPassenger()" novalidate autocomplete="off" class="flex flex-col gap-4">

          <!-- Datos personales -->
          <div class="rounded-2xl flex flex-col gap-4 px-4 py-4" style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07)">
            <h3 class="text-orange-400 font-black text-xs uppercase tracking-widest flex items-center gap-2">
              <span class="material-symbols-outlined" style="font-size:14px">person</span>Datos Personales
            </h3>
            <div class="flex flex-col gap-1">
              <label class="text-xs font-bold" style="color:rgba(255,255,255,0.45);letter-spacing:0.03em">Nombre completo *</label>
              <input [(ngModel)]="pf.fullName" name="pfFullName"
                placeholder="Ej: Juan Carlos Pérez"
                autocomplete="off" spellcheck="false" autocorrect="off" autocapitalize="words"
                class="bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm placeholder:text-slate-600 focus:outline-none focus:border-orange-500/50 transition-colors w-full"/>
            </div>
            <div class="flex flex-col gap-1">
              <label class="text-xs font-bold" style="color:rgba(255,255,255,0.45);letter-spacing:0.03em">Fecha de nacimiento *</label>
              <input [value]="pf.birthDate" (change)="pf.birthDate = $any($event.target).value"
                type="date"
                class="bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-orange-500/50 transition-colors w-full"/>
            </div>
            <!-- País → Departamento → Ciudad -->
            <div class="flex flex-col gap-1">
              <label class="text-xs font-bold" style="color:rgba(255,255,255,0.45);letter-spacing:0.03em">País *</label>
              <select (change)="pf.country = $any($event.target).value; pf.department = ''; pf.city = ''; cdr.markForCheck()"
                class="bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-orange-500/50 transition-colors w-full"
                style="background:rgba(30,30,40,0.95);color-scheme:dark">
                <option value="" style="background:#1e1e28">— Selecciona tu país —</option>
                @for (c of agCountries; track c) {
                  <option [value]="c" [selected]="pf.country === c" style="background:#1e1e28">{{ c }}</option>
                }
              </select>
            </div>
            <div class="flex flex-col gap-1">
              <label class="text-xs font-bold" style="color:rgba(255,255,255,0.45);letter-spacing:0.03em">Departamento / Estado *</label>
              @if (getDepts(pf.country).length > 0) {
                <select (change)="pf.department = $any($event.target).value; pf.city = ''; cdr.markForCheck()"
                  class="bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-orange-500/50 transition-colors w-full"
                  style="background:rgba(30,30,40,0.95);color-scheme:dark">
                  <option value="" style="background:#1e1e28">— Selecciona tu departamento —</option>
                  @for (d of getDepts(pf.country); track d) {
                    <option [value]="d" [selected]="pf.department === d" style="background:#1e1e28">{{ d }}</option>
                  }
                </select>
              } @else {
                <input [(ngModel)]="pf.department" name="pfDepartment"
                  placeholder="Tu departamento o estado"
                  autocomplete="off" spellcheck="false"
                  class="bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm placeholder:text-slate-600 focus:outline-none focus:border-orange-500/50 transition-colors w-full"/>
              }
            </div>
            <div class="flex flex-col gap-1">
              <label class="text-xs font-bold" style="color:rgba(255,255,255,0.45);letter-spacing:0.03em">Ciudad *</label>
              @if (getCities(pf.country, pf.department).length > 0) {
                <select (change)="pf.city = $any($event.target).value"
                  class="bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-orange-500/50 transition-colors w-full"
                  style="background:rgba(30,30,40,0.95);color-scheme:dark">
                  <option value="" style="background:#1e1e28">— Selecciona tu ciudad —</option>
                  @for (c of getCities(pf.country, pf.department); track c) {
                    <option [value]="c" [selected]="pf.city === c" style="background:#1e1e28">{{ c }}</option>
                  }
                </select>
              } @else {
                <input [(ngModel)]="pf.city" name="pfCity"
                  placeholder="Tu ciudad"
                  autocomplete="off" spellcheck="false"
                  class="bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm placeholder:text-slate-600 focus:outline-none focus:border-orange-500/50 transition-colors w-full"/>
              }
            </div>
            <div class="flex flex-col gap-1">
              <label class="text-xs font-bold" style="color:rgba(255,255,255,0.45);letter-spacing:0.03em">Número de cédula / documento *</label>
              <input [(ngModel)]="pf.idNumber" name="pfIdNumber"
                placeholder="Número de identificación"
                autocomplete="off" spellcheck="false" inputmode="numeric"
                class="bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm placeholder:text-slate-600 focus:outline-none focus:border-orange-500/50 transition-colors w-full"/>
            </div>
          </div>

          <!-- Contacto -->
          <div class="rounded-2xl flex flex-col gap-4 px-4 py-4" style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07)">
            <h3 class="text-orange-400 font-black text-xs uppercase tracking-widest flex items-center gap-2">
              <span class="material-symbols-outlined" style="font-size:14px">phone</span>Contacto y Acceso
            </h3>
            <div class="flex flex-col gap-1">
              <label class="text-xs font-bold" style="color:rgba(255,255,255,0.45);letter-spacing:0.03em">Número de teléfono *</label>
              <div class="flex gap-2">
                <input [(ngModel)]="pf.phone" name="pfPhone"
                  type="tel" placeholder="+57 300 000 0000"
                  autocomplete="off" inputmode="tel"
                  class="bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm placeholder:text-slate-600 focus:outline-none focus:border-orange-500/50 transition-colors w-full"/>
              </div>
            </div>
            <div class="flex flex-col gap-1">
              <label class="text-xs font-bold" style="color:rgba(255,255,255,0.45);letter-spacing:0.03em">Correo electrónico *</label>
              <input [(ngModel)]="pf.email" name="pfEmail"
                type="email" placeholder="correo@ejemplo.com"
                autocomplete="off" spellcheck="false" autocorrect="off" autocapitalize="off"
                class="bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm placeholder:text-slate-600 focus:outline-none focus:border-orange-500/50 transition-colors w-full"/>
            </div>
            <div class="flex flex-col gap-1">
              <label class="text-xs font-bold" style="color:rgba(255,255,255,0.45);letter-spacing:0.03em">Contraseña *</label>
              <input [(ngModel)]="pf.password" name="pfPassword"
                type="password" placeholder="Mínimo 8 caracteres"
                autocomplete="new-password"
                class="bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm placeholder:text-slate-600 focus:outline-none focus:border-orange-500/50 transition-colors w-full"/>
            </div>
          </div>

          <!-- Foto de Documento de Identidad -->
          <div class="rounded-2xl flex flex-col gap-4 px-4 py-4" style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07)">
            <h3 class="text-orange-400 font-black text-xs uppercase tracking-widest flex items-center gap-2">
              <span class="material-symbols-outlined" style="font-size:14px">badge</span>Foto de tu Documento de Identidad
            </h3>
            <!-- Aviso de privacidad y uso legal -->
            <div class="rounded-xl p-3 flex gap-2.5" style="background:rgba(16,185,129,0.06);border:1px solid rgba(16,185,129,0.2)">
              <span class="material-symbols-outlined text-emerald-400 flex-shrink-0" style="font-size:18px">lock</span>
              <p class="text-slate-300 text-[11px] leading-relaxed">
                <span class="text-emerald-400 font-black">Tus datos están seguros y son privados.</span>
                Solo Movi tiene acceso a tu documento. <span class="text-white">Únicamente si una autoridad competente lo solicita mediante proceso legal,</span> en el marco de una investigación por un delito cometido en contra de un conductor, estaríamos obligados a entregarlo.
              </p>
            </div>
            <!-- Botón para tomar foto del documento -->
            <button type="button" (click)="openDocCamera('selfie', false)"
              class="w-full flex items-center gap-3 rounded-2xl px-4 py-3 active:scale-95 transition-transform"
              style="background:rgba(251,146,60,0.08);border:1px solid rgba(251,146,60,0.3)">
              @if (pf.selfie) {
                <span class="material-symbols-outlined text-emerald-400 flex-shrink-0" style="font-size:28px">check_circle</span>
                <div class="text-left min-w-0">
                  <p class="text-emerald-400 text-sm font-black">Foto cargada</p>
                  <p class="text-slate-500 text-[10px] truncate">{{ pf.selfie }}</p>
                </div>
              } @else {
                <span class="material-symbols-outlined text-orange-400 flex-shrink-0" style="font-size:28px">photo_camera</span>
                <div class="text-left">
                  <p class="text-white text-sm font-bold">Tomar foto del documento</p>
                  <p class="text-slate-500 text-[10px]">Buena iluminación · texto legible</p>
                </div>
              }
            </button>
            <input id="doc-file-p-selfie" type="file" accept="image/*" capture="environment" class="hidden" (change)="onPassengerFileChange($event, 'selfie')"/>
          </div>

          <!-- Contacto de emergencia -->
          <div class="rounded-2xl flex flex-col gap-4 px-4 py-4" style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07)">
            <h3 class="text-orange-400 font-black text-xs uppercase tracking-widest flex items-center gap-2">
              <span class="material-symbols-outlined" style="font-size:14px">emergency</span>Contacto de Emergencia
            </h3>
            <div class="flex flex-col gap-1">
              <label class="text-xs font-bold" style="color:rgba(255,255,255,0.45);letter-spacing:0.03em">Nombre del contacto *</label>
              <input [(ngModel)]="pf.emergencyName" name="pfEmergencyName"
                placeholder="Nombre completo"
                autocomplete="off" spellcheck="false" autocorrect="off" autocapitalize="words"
                class="bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm placeholder:text-slate-600 focus:outline-none focus:border-orange-500/50 transition-colors w-full"/>
            </div>
            <div class="flex flex-col gap-1">
              <label class="text-xs font-bold" style="color:rgba(255,255,255,0.45);letter-spacing:0.03em">Teléfono del contacto *</label>
              <input [(ngModel)]="pf.emergencyPhone" name="pfEmergencyPhone"
                type="tel" placeholder="+57 300 000 0000"
                autocomplete="off" inputmode="tel"
                class="bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm placeholder:text-slate-600 focus:outline-none focus:border-orange-500/50 transition-colors w-full"/>
            </div>
          </div>

          <!-- Términos -->
          <label class="flex items-start gap-3 cursor-pointer px-1">
            <input [(ngModel)]="pf.terms" name="terms" type="checkbox" class="mt-1 accent-orange-500 flex-shrink-0"/>
            <span class="text-slate-400 text-xs leading-relaxed">Acepto los <span class="text-orange-400 font-bold">Términos y Condiciones</span> y la <span class="text-orange-400 font-bold">Política de Privacidad</span> de Movi. *</span>
          </label>

          @if (passengerError()) {
            <div class="bg-rose-500/10 border border-rose-500/20 rounded-xl px-4 py-3 text-rose-300 text-xs">{{ passengerError() }}</div>
          }

          <button type="submit" [disabled]="passengerLoading()"
            class="w-full py-4 rounded-2xl font-black text-sm sm:text-base uppercase tracking-wider bg-gradient-to-r from-orange-500 to-amber-500 text-black disabled:opacity-50 flex items-center justify-center gap-2 active:scale-[0.97] transition-transform">
            @if (passengerLoading()) {
              <span class="material-symbols-outlined animate-spin" style="font-size:18px">autorenew</span> Registrando...
            } @else {
              <span class="material-symbols-outlined" style="font-size:18px">check</span> Crear cuenta de pasajero
            }
          </button>
        </form>
      }
    </div>
  }

  <!-- ═══════════ FORMULARIO CONDUCTOR ═══════════ -->
  @if (screen() === 'driver-form') {
    <div class="w-full max-w-lg" style="padding-bottom:32px">

      <!-- Hero header -->
      <div style="background:linear-gradient(135deg,#0d1b3e 0%,#0a1628 60%,#060b17 100%);padding:24px 20px 20px;margin:-24px -16px 0;border-bottom:1px solid rgba(99,102,241,0.15)">
        <!-- Back + logo row -->
        <div class="flex items-center justify-between mb-5">
          <button (click)="driverStep() === 1 ? screen.set('home') : driverStep.set(driverStep() - 1)"
            class="flex items-center gap-2 active:opacity-70 transition-opacity">
            <div class="w-9 h-9 rounded-2xl flex items-center justify-center" style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1)">
              <span class="material-symbols-outlined text-white" style="font-size:18px">arrow_back</span>
            </div>
          </button>
          <div class="flex items-center gap-2 px-3 py-1.5 rounded-full" style="background:rgba(99,102,241,0.15);border:1px solid rgba(99,102,241,0.3)">
            <span class="material-symbols-outlined" style="font-size:14px;color:#818cf8">local_taxi</span>
            <span style="color:#818cf8;font-size:11px;font-weight:800;letter-spacing:0.08em">MOVI CONDUCTORES</span>
          </div>
        </div>

        <!-- Title -->
        <div class="mb-5">
          <h1 style="color:#fff;font-size:22px;font-weight:900;line-height:1.2;margin:0 0 6px">
            Activa tu cuenta<br><span style="background:linear-gradient(90deg,#6366f1,#8b5cf6);-webkit-background-clip:text;-webkit-text-fill-color:transparent">de conductor</span>
          </h1>
          <p style="color:rgba(255,255,255,0.4);font-size:13px;margin:0">Verificación segura · 4 pasos · ~5 minutos</p>
        </div>

        <!-- Step indicators -->
        <div class="flex items-center gap-2">
          @for (i of [1,2,3,4]; track i) {
            <div class="flex items-center gap-2 flex-1">
              <div class="flex items-center justify-center rounded-full flex-shrink-0 transition-all duration-300"
                style="width:28px;height:28px"
                [style.background]="driverStep() > i ? 'linear-gradient(135deg,#6366f1,#8b5cf6)' : driverStep() === i ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.04)'"
                [style.border]="driverStep() === i ? '2px solid #6366f1' : driverStep() > i ? 'none' : '1.5px solid rgba(255,255,255,0.1)'">
                @if (driverStep() > i) {
                  <span class="material-symbols-outlined text-white" style="font-size:14px;font-variation-settings:'wght' 700">check</span>
                } @else {
                  <span [style.color]="driverStep() === i ? '#a5b4fc' : 'rgba(255,255,255,0.2)'" style="font-size:11px;font-weight:900">{{ i }}</span>
                }
              </div>
              @if (i < 4) {
                <div class="h-px flex-1 rounded-full transition-all duration-500"
                  [style.background]="driverStep() > i ? 'linear-gradient(90deg,#6366f1,#8b5cf6)' : 'rgba(255,255,255,0.08)'"></div>
              }
            </div>
          }
        </div>
        <div class="flex justify-between mt-2" style="padding:0 2px">
          @for (label of ['Personal','Documentos','Licencia','Vehículo']; track label; let i = $index) {
            <span style="font-size:9px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;flex:1;text-align:center"
              [style.color]="driverStep() > i+1 ? '#818cf8' : driverStep() === i+1 ? '#a5b4fc' : 'rgba(255,255,255,0.2)'">
              {{ label }}
            </span>
          }
        </div>
      </div>

      <!-- Security notice -->
      <div class="mx-0 mt-4 mb-1 rounded-2xl flex items-start gap-3 px-4 py-3"
        style="background:linear-gradient(135deg,rgba(16,185,129,0.06),rgba(6,182,212,0.04));border:1px solid rgba(16,185,129,0.18)">
        <span class="material-symbols-outlined flex-shrink-0 mt-0.5" style="font-size:18px;color:#34d399">verified_user</span>
        <p style="color:rgba(255,255,255,0.5);font-size:11px;line-height:1.6;margin:0">
          Escribe <span style="color:#fff;font-weight:800">EXACTAMENTE</span> como aparece en tus documentos oficiales. Los datos se validan con fuentes gubernamentales — la precisión evita rechazos automáticos.
        </p>
      </div>

      @if (driverSuccess()) {
        <div class="flex flex-col items-center gap-5 py-12 text-center px-4">
          <div class="relative">
            <div class="w-24 h-24 rounded-3xl flex items-center justify-center" style="background:linear-gradient(135deg,rgba(99,102,241,0.2),rgba(139,92,246,0.15));border:2px solid rgba(99,102,241,0.4)">
              <span class="material-symbols-outlined" style="font-size:48px;color:#818cf8;font-variation-settings:'FILL' 1">check_circle</span>
            </div>
            <div class="absolute -top-1 -right-1 w-6 h-6 rounded-full flex items-center justify-center" style="background:linear-gradient(135deg,#6366f1,#8b5cf6)">
              <span class="material-symbols-outlined text-white" style="font-size:14px">star</span>
            </div>
          </div>
          <div>
            <h3 style="color:#fff;font-size:22px;font-weight:900;margin:0 0 8px">¡Solicitud enviada!</h3>
            <p style="color:rgba(255,255,255,0.45);font-size:14px;line-height:1.6;margin:0">Tu solicitud está en revisión.<br>Te notificaremos cuando sea aprobada (24–48 h).</p>
          </div>
          <div class="w-full rounded-2xl px-4 py-3 flex items-center gap-3" style="background:rgba(99,102,241,0.1);border:1px solid rgba(99,102,241,0.25)">
            <span class="material-symbols-outlined flex-shrink-0" style="font-size:20px;color:#818cf8">notifications_active</span>
            <p style="color:rgba(255,255,255,0.5);font-size:12px;margin:0">Recibirás una notificación push cuando tu cuenta sea activada.</p>
          </div>
          <button (click)="screen.set('home'); driverSuccess.set(false)"
            class="w-full py-4 rounded-2xl font-black text-sm flex items-center justify-center gap-2 active:scale-[0.97] transition-transform"
            style="background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;letter-spacing:0.03em">
            <span class="material-symbols-outlined" style="font-size:18px">home</span> Volver al inicio
          </button>
        </div>

      } @else {

        <!-- PASO 1: Datos Personales -->
        @if (driverStep() === 1) {
          <div class="flex flex-col gap-4 mt-4">
            <div class="rounded-2xl flex flex-col gap-4 px-4 py-4" style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07)">
              <div class="flex items-center gap-2.5">
                <div class="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0" style="background:rgba(99,102,241,0.15);border:1px solid rgba(99,102,241,0.3)">
                  <span class="material-symbols-outlined" style="font-size:16px;color:#818cf8">person</span>
                </div>
                <h3 style="color:#a5b4fc;font-size:11px;font-weight:900;letter-spacing:0.1em;text-transform:uppercase;margin:0">Datos Personales</h3>
              </div>
              <div class="flex flex-col gap-1">
                <label class="text-xs font-bold" style="color:rgba(255,255,255,0.45);letter-spacing:0.03em">Nombre completo *</label>
                <input [(ngModel)]="df.fullName" name="dfFullName"
                  placeholder="Nombre y apellidos"
                  autocomplete="off" spellcheck="false" autocorrect="off" autocapitalize="words"
                  class="w-full rounded-xl px-4 py-3 text-white text-sm focus:outline-none transition-all" style="background:rgba(255,255,255,0.05);border:1.5px solid rgba(255,255,255,0.1);color:#fff;font-size:14px" onfocus="this.style.borderColor='rgba(99,102,241,0.6)'" onblur="this.style.borderColor='rgba(255,255,255,0.1)'"/>
              </div>
              <div class="flex flex-col gap-1">
                <label class="text-xs font-bold" style="color:rgba(255,255,255,0.45);letter-spacing:0.03em">Fecha de nacimiento *</label>
                <input [value]="df.birthDate" (change)="df.birthDate = $any($event.target).value"
                  type="date"
                  class="w-full rounded-xl px-4 py-3 text-white text-sm focus:outline-none transition-all" style="background:rgba(255,255,255,0.05);border:1.5px solid rgba(255,255,255,0.1);color:#fff;font-size:14px;color-scheme:dark"/>
              </div>
              <!-- País → Departamento → Ciudad -->
              <div class="flex flex-col gap-1">
                <label class="text-xs font-bold" style="color:rgba(255,255,255,0.45);letter-spacing:0.03em">País *</label>
                <select (change)="df.country = $any($event.target).value; df.department = ''; df.city = ''; cdr.markForCheck()"
                  class="w-full rounded-xl px-4 py-3 text-white text-sm focus:outline-none transition-all" style="background:rgba(255,255,255,0.05);border:1.5px solid rgba(255,255,255,0.1);color:#fff;font-size:14px;color-scheme:dark">
                  <option value="" style="background:#1e1e28">— Selecciona tu país —</option>
                  @for (c of agCountries; track c) {
                    <option [value]="c" [selected]="df.country === c" style="background:#1e1e28">{{ c }}</option>
                  }
                </select>
              </div>
              <div class="flex flex-col gap-1">
                <label class="text-xs font-bold" style="color:rgba(255,255,255,0.45);letter-spacing:0.03em">Departamento / Estado *</label>
                @if (getDepts(df.country).length > 0) {
                  <select (change)="df.department = $any($event.target).value; df.city = ''; cdr.markForCheck()"
                    class="w-full rounded-xl px-4 py-3 text-white text-sm focus:outline-none transition-all" style="background:rgba(255,255,255,0.05);border:1.5px solid rgba(255,255,255,0.1);color:#fff;font-size:14px;color-scheme:dark"
                    style="background:rgba(30,30,40,0.95);color-scheme:dark">
                    <option value="" style="background:#1e1e28">— Selecciona tu departamento —</option>
                    @for (d of getDepts(df.country); track d) {
                      <option [value]="d" [selected]="df.department === d" style="background:#1e1e28">{{ d }}</option>
                    }
                  </select>
                } @else {
                  <input [(ngModel)]="df.department" name="dfDepartment"
                    placeholder="Tu departamento o estado"
                    autocomplete="off" spellcheck="false"
                    class="w-full rounded-xl px-4 py-3 text-white text-sm focus:outline-none transition-all" style="background:rgba(255,255,255,0.05);border:1.5px solid rgba(255,255,255,0.1);color:#fff;font-size:14px" onfocus="this.style.borderColor='rgba(99,102,241,0.6)'" onblur="this.style.borderColor='rgba(255,255,255,0.1)'"/>
                }
              </div>
              <div class="flex flex-col gap-1">
                <label class="text-xs font-bold" style="color:rgba(255,255,255,0.45);letter-spacing:0.03em">Ciudad *</label>
                @if (getCities(df.country, df.department).length > 0) {
                  <select (change)="df.city = $any($event.target).value"
                    class="w-full rounded-xl px-4 py-3 text-white text-sm focus:outline-none transition-all" style="background:rgba(255,255,255,0.05);border:1.5px solid rgba(255,255,255,0.1);color:#fff;font-size:14px;color-scheme:dark"
                    style="background:rgba(30,30,40,0.95);color-scheme:dark">
                    <option value="" style="background:#1e1e28">— Selecciona tu ciudad —</option>
                    @for (c of getCities(df.country, df.department); track c) {
                      <option [value]="c" [selected]="df.city === c" style="background:#1e1e28">{{ c }}</option>
                    }
                  </select>
                } @else {
                  <input [(ngModel)]="df.city" name="dfCity"
                    placeholder="Tu ciudad"
                    autocomplete="off" spellcheck="false"
                    class="w-full rounded-xl px-4 py-3 text-white text-sm focus:outline-none transition-all" style="background:rgba(255,255,255,0.05);border:1.5px solid rgba(255,255,255,0.1);color:#fff;font-size:14px" onfocus="this.style.borderColor='rgba(99,102,241,0.6)'" onblur="this.style.borderColor='rgba(255,255,255,0.1)'"/>
                }
              </div>
              <div class="flex flex-col gap-1">
                <label class="text-xs font-bold" style="color:rgba(255,255,255,0.45);letter-spacing:0.03em">Número de cédula *</label>
                <input [(ngModel)]="df.idNumber" name="dfIdNumber"
                  placeholder="Número de identificación"
                  autocomplete="off" spellcheck="false" inputmode="numeric"
                  class="w-full rounded-xl px-4 py-3 text-white text-sm focus:outline-none transition-all" style="background:rgba(255,255,255,0.05);border:1.5px solid rgba(255,255,255,0.1);color:#fff;font-size:14px" onfocus="this.style.borderColor='rgba(99,102,241,0.6)'" onblur="this.style.borderColor='rgba(255,255,255,0.1)'"/>
              </div>
              <div class="flex flex-col gap-1">
                <label class="text-xs font-bold" style="color:rgba(255,255,255,0.45);letter-spacing:0.03em">Teléfono *</label>
                <div class="flex gap-2">
                  <input [(ngModel)]="df.phone" name="dfPhone"
                    type="tel" placeholder="+57 300 000 0000"
                    autocomplete="off" inputmode="tel"
                    class="w-full rounded-xl px-4 py-3 text-white text-sm focus:outline-none transition-all" style="background:rgba(255,255,255,0.05);border:1.5px solid rgba(255,255,255,0.1);color:#fff;font-size:14px" onfocus="this.style.borderColor='rgba(99,102,241,0.6)'" onblur="this.style.borderColor='rgba(255,255,255,0.1)'"/>
                </div>
              </div>
              <div class="flex flex-col gap-1">
                <label class="text-xs font-bold" style="color:rgba(255,255,255,0.45);letter-spacing:0.03em">Correo electrónico *</label>
                <input [(ngModel)]="df.email" name="dfEmail"
                  type="email" placeholder="correo@ejemplo.com"
                  autocomplete="off" spellcheck="false" autocorrect="off" autocapitalize="off"
                  class="w-full rounded-xl px-4 py-3 text-white text-sm focus:outline-none transition-all" style="background:rgba(255,255,255,0.05);border:1.5px solid rgba(255,255,255,0.1);color:#fff;font-size:14px" onfocus="this.style.borderColor='rgba(99,102,241,0.6)'" onblur="this.style.borderColor='rgba(255,255,255,0.1)'"/>
              </div>
              <div class="flex flex-col gap-1">
                <label class="text-xs font-bold" style="color:rgba(255,255,255,0.45);letter-spacing:0.03em">Contraseña *</label>
                <input [(ngModel)]="df.password" name="dfPassword"
                  type="password" placeholder="Mínimo 8 caracteres"
                  autocomplete="new-password"
                  class="w-full rounded-xl px-4 py-3 text-white text-sm focus:outline-none transition-all" style="background:rgba(255,255,255,0.05);border:1.5px solid rgba(255,255,255,0.1);color:#fff;font-size:14px" onfocus="this.style.borderColor='rgba(99,102,241,0.6)'" onblur="this.style.borderColor='rgba(255,255,255,0.1)'"/>
              </div>
            </div>

            <div class="rounded-2xl flex flex-col gap-4 px-4 py-4" style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07)">
              <div class="flex items-center gap-2.5">
                <div class="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0" style="background:rgba(239,68,68,0.12);border:1px solid rgba(239,68,68,0.25)">
                  <span class="material-symbols-outlined" style="font-size:16px;color:#f87171">emergency</span>
                </div>
                <h3 style="color:#fca5a5;font-size:11px;font-weight:900;letter-spacing:0.1em;text-transform:uppercase;margin:0">Contacto de Emergencia</h3>
              </div>
              <div class="flex flex-col gap-1">
                <label class="text-xs font-bold" style="color:rgba(255,255,255,0.45);letter-spacing:0.03em">Nombre del contacto *</label>
                <input [(ngModel)]="df.emergencyName" name="dfEmergencyName"
                  placeholder="Nombre completo"
                  autocomplete="off" spellcheck="false" autocorrect="off" autocapitalize="words"
                  class="w-full rounded-xl px-4 py-3 text-white text-sm focus:outline-none transition-all" style="background:rgba(255,255,255,0.05);border:1.5px solid rgba(255,255,255,0.1);color:#fff;font-size:14px" onfocus="this.style.borderColor='rgba(99,102,241,0.6)'" onblur="this.style.borderColor='rgba(255,255,255,0.1)'"/>
              </div>
              <div class="flex flex-col gap-1">
                <label class="text-xs font-bold" style="color:rgba(255,255,255,0.45);letter-spacing:0.03em">Teléfono del contacto *</label>
                <input [(ngModel)]="df.emergencyPhone" name="dfEmergencyPhone"
                  type="tel" placeholder="+57 300 000 0000"
                  autocomplete="off" inputmode="tel"
                  class="w-full rounded-xl px-4 py-3 text-white text-sm focus:outline-none transition-all" style="background:rgba(255,255,255,0.05);border:1.5px solid rgba(255,255,255,0.1);color:#fff;font-size:14px" onfocus="this.style.borderColor='rgba(99,102,241,0.6)'" onblur="this.style.borderColor='rgba(255,255,255,0.1)'"/>
              </div>
            </div>

            @if (driverError()) {
              <div class="bg-rose-500/10 border border-rose-500/20 rounded-xl px-4 py-3 text-rose-300 text-xs">{{ driverError() }}</div>
            }
            <button (click)="nextDriverStep(1)"
              class="w-full py-4 rounded-2xl font-black text-sm flex items-center justify-center gap-2 active:scale-[0.97] transition-transform" style="background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;letter-spacing:0.05em">
              Continuar <span class="material-symbols-outlined" style="font-size:18px">arrow_forward</span>
            </button>
          </div>
        }

        <!-- PASO 2: Documentos de Identidad -->
        @if (driverStep() === 2) {
          <div class="flex flex-col gap-4 mt-4">
            <div class="rounded-2xl flex flex-col gap-4 px-4 py-4" style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07)">
              <div class="flex items-center gap-2.5">
                <div class="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0" style="background:rgba(99,102,241,0.15);border:1px solid rgba(99,102,241,0.3)">
                  <span class="material-symbols-outlined" style="font-size:16px;color:#818cf8">badge</span>
                </div>
                <h3 style="color:#a5b4fc;font-size:11px;font-weight:900;letter-spacing:0.1em;text-transform:uppercase;margin:0">Documentos de Identidad</h3>
              </div>
              <!-- Aviso de privacidad y uso legal -->
              <div class="rounded-xl p-3 flex gap-2.5" style="background:rgba(16,185,129,0.06);border:1px solid rgba(16,185,129,0.2)">
                <span class="material-symbols-outlined text-emerald-400 flex-shrink-0" style="font-size:18px">lock</span>
                <p class="text-slate-300 text-[11px] leading-relaxed">
                  <span class="text-emerald-400 font-black">Tus datos son privados y están cifrados.</span>
                  Solo Movi tiene acceso a tus documentos. <span class="text-white">Solo si una autoridad competente lo requiere mediante proceso legal,</span> en el marco de una investigación por un delito cometido en contra de un pasajero, estaríamos obligados a compartirlos.
                </p>
              </div>
              @for (f of idPhotoFields; track f.key) {
                <div class="flex flex-col gap-1">
                  <label class="text-xs font-bold" style="color:rgba(255,255,255,0.45);letter-spacing:0.03em">{{ f.label }} *</label>
                  <button type="button" (click)="openDocCamera(f.key, true)"
                    class="w-full flex items-center gap-3 rounded-xl px-4 py-3 active:scale-95 transition-transform"
                    style="background:rgba(6,182,212,0.06);border:1px solid rgba(6,182,212,0.25)">
                    @if (dfr[f.key]) {
                      <span class="material-symbols-outlined text-emerald-400 flex-shrink-0" style="font-size:26px">check_circle</span>
                      <div class="text-left min-w-0">
                        <p class="text-emerald-400 text-xs font-black">Foto cargada</p>
                        <p class="text-slate-500 text-[10px] truncate">{{ dfr[f.key] }}</p>
                      </div>
                    } @else {
                      <span class="material-symbols-outlined text-cyan-400 flex-shrink-0" style="font-size:26px">photo_camera</span>
                      <div class="text-left">
                        <p class="text-white text-xs font-bold">Tomar foto</p>
                        <p class="text-slate-500 text-[10px]">Buena iluminación · texto legible</p>
                      </div>
                    }
                  </button>
                  <input [id]="'doc-file-d-' + f.key" type="file" accept="image/*" capture="environment" class="hidden" (change)="onDriverFileChange($event, f.key)"/>
                </div>
              }
            </div>

            <div class="rounded-2xl flex flex-col gap-4 px-4 py-4" style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07)">
              <div class="flex items-center gap-2.5">
                <div class="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0" style="background:rgba(245,158,11,0.12);border:1px solid rgba(245,158,11,0.25)">
                  <span class="material-symbols-outlined" style="font-size:16px;color:#fbbf24">policy</span>
                </div>
                <h3 style="color:#fde68a;font-size:11px;font-weight:900;letter-spacing:0.1em;text-transform:uppercase;margin:0">Antecedentes Judiciales</h3>
              </div>
              <div class="flex flex-col gap-1.5">
                <label class="text-xs font-bold" style="color:rgba(255,255,255,0.45);letter-spacing:0.03em">Certificado de antecedentes judiciales *</label>
                <label class="flex items-center gap-3 rounded-xl px-4 py-3 cursor-pointer active:scale-95 transition-transform" style="background:rgba(255,255,255,0.04);border:1.5px dashed rgba(255,255,255,0.15)">
                  <span class="material-symbols-outlined flex-shrink-0" style="font-size:22px;color:rgba(255,255,255,0.3)">upload_file</span>
                  <span class="text-xs flex-1 truncate" style="color:rgba(255,255,255,0.4)">{{ df.criminalRecord || 'Toca para subir documento' }}</span>
                  @if (df.criminalRecord) { <span class="material-symbols-outlined" style="font-size:18px;color:#34d399">check_circle</span> }
                  <input type="file" accept="image/*,application/pdf" class="hidden" (change)="onDriverFileChange($event, 'criminalRecord')"/>
                </label>
                <p style="color:rgba(255,255,255,0.25);font-size:10px">Emitido en los últimos 30 días</p>
              </div>
            </div>

            @if (driverError()) {
              <div class="bg-rose-500/10 border border-rose-500/20 rounded-xl px-4 py-3 text-rose-300 text-xs">{{ driverError() }}</div>
            }
            <button (click)="nextDriverStep(2)"
              class="w-full py-4 rounded-2xl font-black text-sm flex items-center justify-center gap-2 active:scale-[0.97] transition-transform" style="background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;letter-spacing:0.05em">
              Continuar <span class="material-symbols-outlined" style="font-size:18px">arrow_forward</span>
            </button>
          </div>
        }

        <!-- PASO 3: Licencia de Conducción -->
        @if (driverStep() === 3) {
          <div class="flex flex-col gap-4 mt-4">
            <div class="rounded-2xl flex flex-col gap-4 px-4 py-4" style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07)">
              <div class="flex items-center gap-2.5">
                <div class="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0" style="background:rgba(99,102,241,0.15);border:1px solid rgba(99,102,241,0.3)">
                  <span class="material-symbols-outlined" style="font-size:16px;color:#818cf8">id_card</span>
                </div>
                <h3 style="color:#a5b4fc;font-size:11px;font-weight:900;letter-spacing:0.1em;text-transform:uppercase;margin:0">Licencia de Conducción</h3>
              </div>
              <div class="flex flex-col gap-1">
                <label class="text-xs font-bold" style="color:rgba(255,255,255,0.45);letter-spacing:0.03em">Número de licencia *</label>
                <input [(ngModel)]="df.licenseNumber" name="d_licenseNumber" placeholder="Número"
                  class="w-full rounded-xl px-4 py-3 text-white text-sm focus:outline-none transition-all" style="background:rgba(255,255,255,0.05);border:1.5px solid rgba(255,255,255,0.1);color:#fff;font-size:14px" onfocus="this.style.borderColor='rgba(99,102,241,0.6)'" onblur="this.style.borderColor='rgba(255,255,255,0.1)'"/>
              </div>
              <div class="flex flex-col gap-1">
                <label class="text-xs font-bold" style="color:rgba(255,255,255,0.45);letter-spacing:0.03em">Categoría *</label>
                <select [(ngModel)]="df.licenseCategory" name="d_licenseCategory"
                  class="w-full rounded-xl px-4 py-3 text-white text-sm focus:outline-none transition-all" style="background:rgba(255,255,255,0.05);border:1.5px solid rgba(255,255,255,0.1);color:#fff;font-size:14px;color-scheme:dark">
                  <option value="" class="bg-zinc-900">Seleccionar</option>
                  <option value="B1" class="bg-zinc-900">B1 — Automóvil</option>
                  <option value="B2" class="bg-zinc-900">B2 — Camioneta</option>
                  <option value="B3" class="bg-zinc-900">B3 — Microbús</option>
                  <option value="C1" class="bg-zinc-900">C1 — Motocicleta</option>
                  <option value="C2" class="bg-zinc-900">C2 — Mototriciclo</option>
                </select>
              </div>
              <div class="flex flex-col gap-1">
                <label class="text-xs font-bold" style="color:rgba(255,255,255,0.45);letter-spacing:0.03em">Fecha de vencimiento *</label>
                <input [(ngModel)]="df.licenseExpiry" name="d_licenseExpiry" type="date"
                  class="w-full rounded-xl px-4 py-3 text-white text-sm focus:outline-none transition-all" style="background:rgba(255,255,255,0.05);border:1.5px solid rgba(255,255,255,0.1);color:#fff;font-size:14px;color-scheme:dark"/>
              </div>
              <div class="flex flex-col gap-1">
                <label class="text-xs font-bold" style="color:rgba(255,255,255,0.45);letter-spacing:0.03em">Foto frontal de la licencia *</label>
                <label class="flex items-center gap-3 border border-dashed border-white/10 rounded-xl px-3 py-2.5 cursor-pointer hover:border-cyan-500/40 active:border-cyan-500/40 transition-colors">
                  <span class="material-symbols-outlined text-slate-500" style="font-size:20px">upload</span>
                  <span class="text-slate-500 text-xs flex-1 truncate">{{ df.licensePhoto || 'Toca para subir foto' }}</span>
                  @if (df.licensePhoto) { <span class="material-symbols-outlined text-emerald-400" style="font-size:16px">check_circle</span> }
                  <input type="file" accept="image/*" class="hidden" (change)="onDriverFileChange($event, 'licensePhoto')"/>
                </label>
              </div>
              <div class="flex flex-col gap-1">
                <label class="text-xs font-bold" style="color:rgba(255,255,255,0.45);letter-spacing:0.03em">Foto trasera de la licencia *</label>
                <label class="flex items-center gap-3 border border-dashed border-white/10 rounded-xl px-3 py-2.5 cursor-pointer hover:border-cyan-500/40 active:border-cyan-500/40 transition-colors">
                  <span class="material-symbols-outlined text-slate-500" style="font-size:20px">upload</span>
                  <span class="text-slate-500 text-xs flex-1 truncate">{{ df.licenseBack || 'Toca para subir foto' }}</span>
                  @if (df.licenseBack) { <span class="material-symbols-outlined text-emerald-400" style="font-size:16px">check_circle</span> }
                  <input type="file" accept="image/*" class="hidden" (change)="onDriverFileChange($event, 'licenseBack')"/>
                </label>
              </div>
            </div>

            @if (driverError()) {
              <div class="bg-rose-500/10 border border-rose-500/20 rounded-xl px-4 py-3 text-rose-300 text-xs">{{ driverError() }}</div>
            }
            <button (click)="nextDriverStep(3)"
              class="w-full py-4 rounded-2xl font-black text-sm flex items-center justify-center gap-2 active:scale-[0.97] transition-transform" style="background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;letter-spacing:0.05em">
              Continuar <span class="material-symbols-outlined" style="font-size:18px">arrow_forward</span>
            </button>
          </div>
        }

        <!-- PASO 4: Vehículo y Documentos -->
        @if (driverStep() === 4) {
          <div class="flex flex-col gap-4 mt-4">
            <div class="rounded-2xl flex flex-col gap-4 px-4 py-4" style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07)">
              <div class="flex items-center gap-2.5">
                <div class="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0" style="background:rgba(99,102,241,0.15);border:1px solid rgba(99,102,241,0.3)">
                  <span class="material-symbols-outlined" style="font-size:16px;color:#818cf8">directions_car</span>
                </div>
                <h3 style="color:#a5b4fc;font-size:11px;font-weight:900;letter-spacing:0.1em;text-transform:uppercase;margin:0">Datos del Vehículo</h3>
              </div>
              <div class="grid grid-cols-2 gap-2 sm:gap-3">
                <div class="flex flex-col gap-1">
                  <label class="text-xs font-bold" style="color:rgba(255,255,255,0.45);letter-spacing:0.03em">Placa *</label>
                  <input [(ngModel)]="df.plate" name="d_plate" placeholder="ABC123"
                    class="w-full rounded-xl px-4 py-3 text-white text-sm focus:outline-none transition-all uppercase" style="background:rgba(255,255,255,0.05);border:1.5px solid rgba(255,255,255,0.1);color:#fff;font-size:14px" onfocus="this.style.borderColor='rgba(99,102,241,0.6)'" onblur="this.style.borderColor='rgba(255,255,255,0.1)'"/>
                </div>
                <div class="flex flex-col gap-1">
                  <label class="text-xs font-bold" style="color:rgba(255,255,255,0.45);letter-spacing:0.03em">Tipo *</label>
                  <select [(ngModel)]="df.vehicleType" name="d_vehicleType"
                    class="w-full rounded-xl px-4 py-3 text-white text-sm focus:outline-none transition-all" style="background:rgba(255,255,255,0.05);border:1.5px solid rgba(255,255,255,0.1);color:#fff;font-size:14px;color-scheme:dark">
                    <option value="" class="bg-zinc-900">Seleccionar</option>
                    <option value="sedan" class="bg-zinc-900">Sedán</option>
                    <option value="suv" class="bg-zinc-900">SUV</option>
                    <option value="hatchback" class="bg-zinc-900">Hatchback</option>
                    <option value="moto" class="bg-zinc-900">Moto</option>
                    <option value="van" class="bg-zinc-900">Van</option>
                  </select>
                </div>
              </div>
              <div class="grid grid-cols-2 gap-2 sm:gap-3">
                <div class="flex flex-col gap-1">
                  <label class="text-xs font-bold" style="color:rgba(255,255,255,0.45);letter-spacing:0.03em">Marca *</label>
                  <input [(ngModel)]="df.vehicleBrand" name="d_vehicleBrand" placeholder="Toyota"
                    class="w-full rounded-xl px-4 py-3 text-white text-sm focus:outline-none transition-all" style="background:rgba(255,255,255,0.05);border:1.5px solid rgba(255,255,255,0.1);color:#fff;font-size:14px" onfocus="this.style.borderColor='rgba(99,102,241,0.6)'" onblur="this.style.borderColor='rgba(255,255,255,0.1)'"/>
                </div>
                <div class="flex flex-col gap-1">
                  <label class="text-xs font-bold" style="color:rgba(255,255,255,0.45);letter-spacing:0.03em">Modelo *</label>
                  <input [(ngModel)]="df.vehicleModel" name="d_vehicleModel" placeholder="Corolla"
                    class="w-full rounded-xl px-4 py-3 text-white text-sm focus:outline-none transition-all" style="background:rgba(255,255,255,0.05);border:1.5px solid rgba(255,255,255,0.1);color:#fff;font-size:14px" onfocus="this.style.borderColor='rgba(99,102,241,0.6)'" onblur="this.style.borderColor='rgba(255,255,255,0.1)'"/>
                </div>
              </div>
              <div class="grid grid-cols-2 gap-2 sm:gap-3">
                <div class="flex flex-col gap-1">
                  <label class="text-xs font-bold" style="color:rgba(255,255,255,0.45);letter-spacing:0.03em">Año *</label>
                  <input [(ngModel)]="df.vehicleYear" name="d_vehicleYear" type="number" placeholder="2020" min="2000"
                    class="w-full rounded-xl px-4 py-3 text-white text-sm focus:outline-none transition-all" style="background:rgba(255,255,255,0.05);border:1.5px solid rgba(255,255,255,0.1);color:#fff;font-size:14px" onfocus="this.style.borderColor='rgba(99,102,241,0.6)'" onblur="this.style.borderColor='rgba(255,255,255,0.1)'"/>
                </div>
                <div class="flex flex-col gap-1">
                  <label class="text-xs font-bold" style="color:rgba(255,255,255,0.45);letter-spacing:0.03em">Color *</label>
                  <input [(ngModel)]="df.vehicleColor" name="d_vehicleColor" placeholder="Blanco"
                    class="w-full rounded-xl px-4 py-3 text-white text-sm focus:outline-none transition-all" style="background:rgba(255,255,255,0.05);border:1.5px solid rgba(255,255,255,0.1);color:#fff;font-size:14px" onfocus="this.style.borderColor='rgba(99,102,241,0.6)'" onblur="this.style.borderColor='rgba(255,255,255,0.1)'"/>
                </div>
              </div>
              @for (f of vehiclePhotoFields; track f.key) {
                <div class="flex flex-col gap-1">
                  <label class="text-xs font-bold" style="color:rgba(255,255,255,0.45);letter-spacing:0.03em">{{ f.label }} *</label>
                  <label class="flex items-center gap-3 border border-dashed border-white/10 rounded-xl px-4 py-3 cursor-pointer hover:border-cyan-500/40 transition-colors">
                    <span class="material-symbols-outlined text-slate-500" style="font-size:22px">upload</span>
                    <span class="text-slate-500 text-xs flex-1">{{ dfr[f.key] || 'Toca para subir foto' }}</span>
                    @if (dfr[f.key]) { <span class="material-symbols-outlined text-emerald-400" style="font-size:18px">check_circle</span> }
                    <input type="file" accept="image/*" class="hidden" (change)="onDriverFileChange($event, f.key)"/>
                  </label>
                </div>
              }
            </div>

            <div class="rounded-2xl flex flex-col gap-4 px-4 py-4" style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07)">
              <div class="flex items-center gap-2.5">
                <div class="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0" style="background:rgba(99,102,241,0.15);border:1px solid rgba(99,102,241,0.3)">
                  <span class="material-symbols-outlined" style="font-size:16px;color:#818cf8">description</span>
                </div>
                <h3 style="color:#a5b4fc;font-size:11px;font-weight:900;letter-spacing:0.1em;text-transform:uppercase;margin:0">Documentos del Vehículo</h3>
              </div>
              @for (f of vehicleDocFields; track f.key) {
                <div class="flex flex-col gap-2">
                  <label class="text-xs font-bold" style="color:rgba(255,255,255,0.45);letter-spacing:0.03em">{{ f.label }} *</label>
                  @if (f.expiry) {
                    <input [(ngModel)]="dfr[f.expiry]" [name]="'d_' + f.expiry" type="date"
                      class="w-full rounded-xl px-4 py-3 text-white text-sm focus:outline-none transition-all" style="background:rgba(255,255,255,0.05);border:1.5px solid rgba(255,255,255,0.1);color:#fff;font-size:13px;color-scheme:dark"/>
                  }
                  <label class="flex items-center gap-3 border border-dashed border-white/10 rounded-xl px-3 py-2.5 cursor-pointer hover:border-cyan-500/40 active:border-cyan-500/40 transition-colors">
                    <span class="material-symbols-outlined text-slate-500" style="font-size:20px">upload</span>
                    <span class="text-slate-500 text-xs flex-1 truncate">{{ dfr[f.key] || 'Subir foto / documento' }}</span>
                    @if (dfr[f.key]) { <span class="material-symbols-outlined text-emerald-400" style="font-size:16px">check_circle</span> }
                    <input type="file" accept="image/*,application/pdf" class="hidden" (change)="onDriverFileChange($event, f.key)"/>
                  </label>
                </div>
              }
            </div>

            <!-- Términos -->
            <label class="flex items-start gap-3 cursor-pointer px-1">
              <input [(ngModel)]="df.terms" name="d_terms" type="checkbox" class="mt-1 accent-cyan-500 flex-shrink-0"/>
              <span class="text-slate-400 text-xs leading-relaxed">Acepto los <span class="text-cyan-400 font-bold">Términos y Condiciones</span>, confirmo que la información es verídica y entiendo que seré verificado antes de ser aprobado. *</span>
            </label>

            @if (driverError()) {
              <div class="bg-rose-500/10 border border-rose-500/20 rounded-xl px-4 py-3 text-rose-300 text-xs">{{ driverError() }}</div>
            }

            <button (click)="submitDriver()" [disabled]="driverLoading()"
              class="w-full py-4 rounded-2xl font-black text-sm flex items-center justify-center gap-2 active:scale-[0.97] transition-transform disabled:opacity-50" style="background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;letter-spacing:0.05em">
              @if (driverLoading()) {
                <span class="material-symbols-outlined animate-spin" style="font-size:18px">autorenew</span> Enviando...
              } @else {
                <span class="material-symbols-outlined" style="font-size:18px">send</span> Enviar solicitud
              }
            </button>
          </div>
        }
      }
    </div>
  }

  <!-- ═══════════ MODAL CALIFICACIÓN ═══════════ -->
  @if (ratingModal()) {
    <div class="fixed inset-0 z-50 flex items-end justify-center pb-0"
      style="background:rgba(0,0,0,0.6);backdrop-filter:blur(4px)">
      <div class="w-full max-w-lg rounded-t-3xl flex flex-col gap-5 p-6 pb-10"
        style="background:#0f1421;border-top:1px solid rgba(255,255,255,0.1)">

        @if (ratingSkipped()) {
          <!-- Confirmación de skip -->
          <div class="flex flex-col items-center gap-3 py-4 text-center">
            <span class="material-symbols-outlined text-emerald-400" style="font-size:48px">check_circle</span>
            <p class="text-white font-black text-lg">¡Viaje finalizado!</p>
            <p class="text-slate-500 text-sm">Gracias por usar Movi</p>
            <button (click)="closeRatingModal()"
              class="mt-2 px-8 py-3 rounded-xl text-white font-black text-sm"
              style="background:linear-gradient(135deg,#f97316,#fb923c)">
              Cerrar
            </button>
          </div>
        } @else {
          <!-- Handle -->
          <div class="flex justify-center -mt-2 mb-1">
            <div class="w-10 h-1 rounded-full" style="background:rgba(255,255,255,0.2)"></div>
          </div>

          <div class="flex flex-col items-center gap-1 text-center">
            <p class="text-slate-400 text-xs uppercase tracking-widest font-bold">Calificar (opcional)</p>
            <p class="text-white font-black text-xl">
              {{ ratingTarget()?.role === 'driver' ? '¿Cómo fue tu conductor?' : '¿Cómo fue el pasajero?' }}
            </p>
            <p class="text-slate-400 text-sm">{{ ratingTarget()?.name }}</p>
          </div>

          <!-- Estrellas -->
          <div class="flex justify-center gap-3">
            @for (s of [1,2,3,4,5]; track s) {
              <button (click)="ratingStars.set(s)" class="transition-transform active:scale-90"
                [style.transform]="ratingStars() >= s ? 'scale(1.15)' : 'scale(1)'">
                <span class="material-symbols-outlined"
                  style="font-size:40px"
                  [style.color]="ratingStars() >= s ? '#f59e0b' : 'rgba(255,255,255,0.15)'">
                  {{ ratingStars() >= s ? 'star' : 'star_border' }}
                </span>
              </button>
            }
          </div>

          <!-- Label estrellas -->
          @if (ratingStars() > 0) {
            <p class="text-center text-sm font-bold"
              [class]="ratingStars() >= 4 ? 'text-amber-400' : ratingStars() === 3 ? 'text-slate-300' : 'text-rose-400'">
              {{ ratingStars() === 1 ? 'Muy malo' : ratingStars() === 2 ? 'Malo' : ratingStars() === 3 ? 'Regular' : ratingStars() === 4 ? 'Bueno' : '¡Excelente!' }}
            </p>
          }

          <!-- Comentario -->
          <textarea [(ngModel)]="ratingCommentValue" placeholder="Comentario opcional..."
            rows="2"
            class="w-full rounded-2xl px-4 py-3 text-sm text-white placeholder-slate-600 resize-none focus:outline-none"
            style="background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1)"></textarea>

          <!-- Botones -->
          <div class="flex gap-3">
            <button (click)="skipRating()"
              class="flex-1 py-3 rounded-xl text-slate-400 text-sm font-bold transition-all active:scale-[0.98]"
              style="background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.08)">
              Omitir
            </button>
            <button (click)="submitRating()"
              [disabled]="ratingStars() === 0 || submittingRating()"
              class="flex-[2] py-3 rounded-xl text-white text-sm font-black transition-all active:scale-[0.98] disabled:opacity-40 flex items-center justify-center gap-2"
              style="background:linear-gradient(135deg,#f59e0b,#d97706)">
              @if (submittingRating()) {
                <span class="material-symbols-outlined animate-spin" style="font-size:16px">autorenew</span>
              } @else {
                <span class="material-symbols-outlined" style="font-size:16px">star</span>
              }
              Enviar calificación
            </button>
          </div>
        }
      </div>
    </div>
  }

  <!-- ═══════════ MODAL RECIBO DE VIAJE ═══════════ -->
  @if (tripReceiptModal() && tripReceiptData()) {
    <div class="fixed inset-0 z-[9995] flex items-end justify-center pb-0"
      style="background:rgba(0,0,0,0.7);backdrop-filter:blur(6px)">
      <div class="w-full max-w-md rounded-t-3xl overflow-hidden flex flex-col"
        style="background:#0f1421;border-top:2px solid rgba(16,185,129,0.4);max-height:92dvh">

        <!-- Handle + header -->
        <div class="flex flex-col items-center gap-2 px-5 pt-5 pb-4 flex-shrink-0"
          style="border-bottom:1px solid rgba(255,255,255,0.08)">
          <div class="w-10 h-1 rounded-full mb-1" style="background:rgba(255,255,255,0.18)"></div>
          <div class="w-14 h-14 rounded-2xl flex items-center justify-center"
            style="background:linear-gradient(135deg,#059669,#10b981)">
            <span class="material-symbols-outlined text-white" style="font-size:30px;font-variation-settings:'FILL' 1">receipt_long</span>
          </div>
          <p class="text-white font-black text-xl mt-1">Resumen del viaje</p>
          <p class="text-emerald-400 font-black text-3xl leading-none">
            {{ formatCOP(tripReceiptData()!.final_price ?? tripReceiptData()!.offered_price ?? 0) }}
          </p>
        </div>

        <!-- Detalles -->
        <div class="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-3">

          <!-- Origen → Destino -->
          <div class="rounded-2xl overflow-hidden" style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08)">
            <div class="flex items-start gap-3 px-4 py-3" style="border-bottom:1px solid rgba(255,255,255,0.06)">
              <span class="material-symbols-outlined text-blue-400 flex-shrink-0 mt-0.5" style="font-size:16px">my_location</span>
              <div>
                <p class="text-slate-400 text-[10px] uppercase font-bold tracking-wider">Origen</p>
                <p class="text-white text-xs font-semibold">{{ tripReceiptData()!.origin_name ?? 'Punto de recogida' }}</p>
              </div>
            </div>
            <div class="flex items-start gap-3 px-4 py-3">
              <span class="material-symbols-outlined text-emerald-400 flex-shrink-0 mt-0.5" style="font-size:16px">location_on</span>
              <div>
                <p class="text-slate-400 text-[10px] uppercase font-bold tracking-wider">Destino</p>
                <p class="text-white text-xs font-semibold">{{ tripReceiptData()!.dest_name ?? 'Destino' }}</p>
              </div>
            </div>
          </div>

          <!-- Desglose financiero (solo para conductor) -->
          @if (tripReceiptData()!._role === 'driver' || tripReceiptData()!.commission_pct) {
            <div class="rounded-2xl overflow-hidden" style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08)">
              <div class="flex items-center justify-between px-4 py-2.5" style="border-bottom:1px solid rgba(255,255,255,0.06)">
                <p class="text-slate-400 text-xs">Precio total</p>
                <p class="text-white font-bold text-xs">{{ formatCOP(tripReceiptData()!.final_price ?? 0) }}</p>
              </div>
              @if (tripReceiptData()!.commission_amount > 0) {
                <div class="flex items-center justify-between px-4 py-2.5" style="border-bottom:1px solid rgba(255,255,255,0.06)">
                  <p class="text-slate-400 text-xs">Comisión Movi ({{ tripReceiptData()!.commission_pct }}%)</p>
                  <p class="text-rose-400 font-bold text-xs">-{{ formatCOP(tripReceiptData()!.commission_amount) }}</p>
                </div>
              }
              <div class="flex items-center justify-between px-4 py-2.5">
                <p class="text-emerald-400 text-xs font-bold">Lo que recibes</p>
                <p class="text-emerald-400 font-black text-sm">{{ formatCOP(tripReceiptData()!.driver_net ?? tripReceiptData()!.final_price ?? 0) }}</p>
              </div>
            </div>
          }

          <!-- Fecha -->
          <div class="flex items-center justify-between px-4 py-3 rounded-2xl"
            style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08)">
            <span class="material-symbols-outlined text-slate-400 flex-shrink-0" style="font-size:16px">calendar_today</span>
            <p class="text-white text-xs flex-1 ml-2">{{ tripReceiptData()!.completed_at ? (tripReceiptData()!.completed_at | date:'d MMM yyyy, h:mm a') : 'Ahora' }}</p>
          </div>
        </div>

        <!-- CTA -->
        <div class="flex flex-col gap-3 px-5 pb-8 pt-4 flex-shrink-0"
          style="border-top:1px solid rgba(255,255,255,0.08)">
          @if (tripReceiptData()!._role === 'driver') {
            <button (click)="closeDriverReceiptAndRate()"
              class="w-full py-4 rounded-2xl text-white font-black text-sm active:scale-[0.98] transition-all flex items-center justify-center gap-2"
              style="background:linear-gradient(135deg,#f59e0b,#d97706)">
              <span class="material-symbols-outlined" style="font-size:18px">star</span>
              Calificar pasajero
            </button>
            <button (click)="tripReceiptModal.set(false); tripReceiptData.set(null); tripReceiptTrip.set(null)"
              class="w-full py-3 rounded-2xl text-slate-400 font-bold text-sm"
              style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08)">
              Omitir calificación
            </button>
          } @else {
            <button (click)="closeReceiptAndRate()"
              class="w-full py-4 rounded-2xl text-white font-black text-sm active:scale-[0.98] transition-all flex items-center justify-center gap-2"
              style="background:linear-gradient(135deg,#f59e0b,#d97706)">
              <span class="material-symbols-outlined" style="font-size:18px">star</span>
              Calificar conductor
            </button>
            <button (click)="closeReceiptModal()"
              class="w-full py-3 rounded-2xl text-slate-400 font-bold text-sm"
              style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08)">
              Cerrar
            </button>
          }
        </div>
      </div>
    </div>
  }

  <!-- ═══════════ MODAL CANCELAR CON MOTIVO ═══════════ -->
  @if (cancelReasonModal()) {
    <div class="fixed inset-0 z-[9996] flex items-end justify-center pb-0"
      style="background:rgba(0,0,0,0.7);backdrop-filter:blur(6px)">
      <div class="w-full max-w-md rounded-t-3xl flex flex-col gap-4 p-5 pb-9"
        style="background:#0f1421;border-top:2px solid rgba(239,68,68,0.4)">
        <!-- Handle -->
        <div class="flex justify-center -mt-1"><div class="w-10 h-1 rounded-full" style="background:rgba(255,255,255,0.18)"></div></div>

        <div class="flex items-center gap-3">
          <div class="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0"
            style="background:rgba(239,68,68,0.15);border:1px solid rgba(239,68,68,0.3)">
            <span class="material-symbols-outlined text-rose-400" style="font-size:24px">cancel</span>
          </div>
          <div>
            <p class="text-white font-black text-base">¿Por qué cancelas?</p>
            <p class="text-slate-500 text-xs">Selecciona el motivo</p>
          </div>
        </div>

        <!-- Opciones -->
        <div class="flex flex-col gap-2">
          @for (reason of (cancelReasonTarget() === 'passenger' ?
            ['Esperé demasiado', 'Me equivoqué en el destino', 'Ya no necesito el viaje', 'El conductor no llegó', 'Cambio de planes'] :
            ['El pasajero no llegó', 'Dirección incorrecta', 'Pasajero agresivo/irrespetuoso', 'Problema con el vehículo', 'Otro']); track reason) {
            <button (click)="cancelReasonSelected.set(reason)"
              class="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl text-left active:scale-[0.99] transition-all"
              [style.background]="cancelReasonSelected() === reason ? 'rgba(239,68,68,0.15)' : 'rgba(255,255,255,0.04)'"
              [style.border]="cancelReasonSelected() === reason ? '1.5px solid rgba(239,68,68,0.5)' : '1px solid rgba(255,255,255,0.08)'">
              <div class="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0"
                [style.background]="cancelReasonSelected() === reason ? '#ef4444' : 'rgba(255,255,255,0.1)'">
                @if (cancelReasonSelected() === reason) {
                  <span class="material-symbols-outlined text-white" style="font-size:12px;font-variation-settings:'FILL' 1">check</span>
                }
              </div>
              <p class="text-white text-sm font-semibold">{{ reason }}</p>
            </button>
          }
        </div>

        <!-- Botones -->
        <div class="flex gap-3 mt-1">
          <button (click)="cancelReasonModal.set(false)"
            class="flex-1 py-3.5 rounded-2xl text-slate-400 text-sm font-bold active:scale-[0.98]"
            style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08)">
            Volver
          </button>
          <button (click)="confirmCancelWithReason()"
            [disabled]="!cancelReasonSelected()"
            class="flex-[2] py-3.5 rounded-2xl text-white text-sm font-black active:scale-[0.98] disabled:opacity-40 flex items-center justify-center gap-2"
            style="background:linear-gradient(135deg,#ef4444,#dc2626)">
            <span class="material-symbols-outlined" style="font-size:16px">cancel</span>
            Confirmar cancelación
          </button>
        </div>
      </div>
    </div>
  }


  <!-- ═══ MODAL CHAT ═══ -->
  @if (showChatModal()) {
    <div class="fixed inset-0 z-[200] flex flex-col">
      <div class="absolute inset-0 bg-black/80" (click)="closeChatModal()"></div>
      <div class="relative flex flex-col w-full max-w-md mx-auto mt-auto sm:my-auto bg-[#0d0d0d] rounded-t-2xl sm:rounded-2xl border border-white/10 shadow-2xl overflow-hidden"
           style="max-height:80vh" (click)="$event.stopPropagation()">

        <!-- Header -->
        <div class="flex items-center justify-between px-4 py-3 border-b border-white/10 flex-shrink-0"
          style="background:linear-gradient(135deg,#2563eb,#3b82f6)">
          <div class="flex items-center gap-2">
            <span class="material-symbols-outlined text-white" style="font-size:20px">chat</span>
            <p class="text-white font-black text-sm">Chat del viaje</p>
          </div>
          <button (click)="closeChatModal()" class="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
            <span class="material-symbols-outlined text-white" style="font-size:18px">close</span>
          </button>
        </div>

        <!-- Mensajes -->
        <div id="driver-chat-messages" class="flex-1 overflow-y-auto p-4 space-y-2" style="min-height:200px">
          @if (chatMessages().length === 0) {
            <div class="flex flex-col items-center justify-center py-10 text-center">
              <span class="material-symbols-outlined text-slate-700" style="font-size:40px">chat_bubble_outline</span>
              <p class="text-slate-500 text-sm mt-2">Sin mensajes aún</p>
              <p class="text-slate-600 text-xs">Envía un mensaje para comunicarte</p>
            </div>
          } @else {
            @for (msg of chatMessages(); track msg.id) {
              <div class="flex" [class]="isMyChatMessage(msg) ? 'justify-end' : 'justify-start'">
                <div class="max-w-[75%] rounded-2xl px-3 py-2"
                  [class]="isMyChatMessage(msg) ? 'bg-blue-600 text-white rounded-br-sm' : 'bg-white/10 text-white rounded-bl-sm'">
                  <p class="text-sm leading-relaxed">{{ msg.message }}</p>
                  <p class="text-[9px] mt-0.5 opacity-60">{{ formatChatTime(msg.created_at) }}</p>
                </div>
              </div>
            }
          }
        </div>

        <!-- Input -->
        <div class="flex items-center gap-2 px-3 py-3 border-t border-white/10 flex-shrink-0" style="background:#111">
          <input [(ngModel)]="chatInput" name="chatInput"
            placeholder="Escribe un mensaje..."
            (keydown.enter)="sendChatMsg()"
            class="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm placeholder:text-slate-600 focus:outline-none focus:border-blue-500/50"/>
          <button (click)="sendChatMsg()" [disabled]="!chatInput.trim() || chatSending()"
            class="w-10 h-10 rounded-xl bg-blue-600 hover:bg-blue-500 flex items-center justify-center transition-all disabled:opacity-40">
            @if (chatSending()) {
              <span class="material-symbols-outlined text-white animate-spin" style="font-size:18px">sync</span>
            } @else {
              <span class="material-symbols-outlined text-white" style="font-size:18px">send</span>
            }
          </button>
        </div>
      </div>
    </div>
  }

</div>
  `,
})
export class AndaGanaComponent implements OnInit, OnDestroy {

  private readonly agService   = inject(AndaGanaService);
  private readonly phoneAuth   = inject(AgPhoneAuthService);
  private readonly platformId  = inject(PLATFORM_ID);
  private readonly route       = inject(ActivatedRoute);
  protected readonly cdr       = inject(ChangeDetectorRef);

  // Cada vez que el conductor está online en driver-home, recarga solicitudes automáticamente
  private readonly _autoLoadRequestsEffect = effect(() => {
    const isDriverHome = this.screen() === 'driver-home';
    const isOnline     = this.driverOnline();
    if (isDriverHome && isOnline) {
      untracked(() => {
        const vt = this.driverData()?.vehicle_type;
        this.agService.getSearchingRequests(
          vt === 'moto' ? 'moto' : vt ? 'carro' : undefined,
          undefined, undefined
        ).then(reqs => {
          this.driverRequests.set(reqs);
          this.cdr.markForCheck();
        }).catch(() => {});
      });
    }
  });
  private readonly supabase    = getMoviClient();
  private referredBy: string | null = null;

  screen     = signal<AgScreen>('splash');
  splashSize = signal(10);
  driverStep = signal<number>(1);

  // Perfil actual
  agProfile             = signal<AgUser | null>(null);
  driverData            = signal<any>(null);
  driverStatus          = signal<string>('');
  driverRejectionReason = signal<string | null>(null);

  // Referidos
  referralCopied     = signal(false);
  agReferralLink     = signal('');
  referralBalance    = signal(0);
  referralTotalEarned = signal(0);
  referralCount      = signal(0);
  referralTransactions = signal<any[]>([]);

  launchBannerDismissed   = signal(false);
  locationUpdating        = signal(false);  // micro-indicador "Actualizando zona..."

  // Mapa / GPS
  noDriversNearby = signal(false);
  gpsStatus      = signal<GpsStatus>('idle');
  gpsAccuracy    = signal<number | null>(null);
  currentAddress      = signal('');
  currentNeighborhood = signal('');
  addrSavedToast      = signal(false);
  addrInputHasText    = signal(false);   // solo para mostrar/ocultar botones (no re-renderiza todo)
  tripInputHasText    = signal(false);
  private _addrRaw    = '';              // valor crudo del input — no signal para no renderizar por cada tecla
  private _tripRaw    = '';
  addressLoading = signal(false);
  addressEditMode    = signal(false);
  addressQuery       = signal('');
  addressSuggestions = signal<any[]>([]);
  @ViewChild('addrInput') addrInputRef?: ElementRef<HTMLInputElement>;
  addressNoResults   = signal(false);  // true cuando la búsqueda terminó sin resultados
  originEditOpen     = signal(false);  // edición inline del punto de origen
  private _addressDebounceTimer: any = null;

  // Trip request
  tripOpen        = signal(false);
  tripQuery       = signal('');
  tripSuggestions = signal<any[]>([]);
  tripLoading     = signal(false);
  tripNoResults   = signal(false);
  tripDest        = signal<{ name: string; lat: number; lng: number } | null>(null);
  recentDests     = signal<{ name: string; lat: number; lng: number }[]>([]);
  recentOrigins   = signal<{ name: string; lat: number; lng: number }[]>([]);
  tripVehicle     = signal<'carro' | 'moto' | 'camion'>('carro');
  tripPrice       = signal(0);
  tripPayment     = signal<AgPaymentMethod>('efectivo');
  tripDistKm      = signal(0);
  tripSending     = signal(false);
  tripGpsError    = signal(false);
  tripRequestError = signal<string | null>(null);
  tripSent        = signal(false);
  tripPinDrop     = signal(false);
  // true mientras haya solicitud activa O viaje aceptado en curso
  readonly tripIsActive = computed(() =>
    this.tripSent() || !!this.currentTripRequestId() || !!this.tripAccepted(),
  );
  // Pantalla de espera estilo inDrive
  waitingDriverCount  = signal(0);
  waitingDriverColors = signal<string[]>([]);
  waitingCountdown    = signal(90);
  waitingProgress     = signal(0);
  autoAccept          = signal(false);
  // Offer system — passenger
  currentTripRequestId = signal<string | null>(null);
  receivedOffers       = signal<AgTripOffer[]>([]);
  acceptingOfferId     = signal<string | null>(null);
  tripAccepted         = signal<AgTripOffer | null>(null);
  offerAcceptError     = signal<string | null>(null);
  // Offer system — driver
  driverRequests       = signal<AgTripRequest[]>([]);
  driverRequestsOpen   = signal(false);
  makingOfferFor       = signal<AgTripRequest | null>(null);
  driverOfferPrice     = signal(0);
  sendingOffer         = signal(false);
  offerSentFor         = signal<Set<string>>(new Set());
  inlineCounterOpen    = signal(false);
  inlineCounterValue   = signal(0);
  // Commission + wallet — driver
  driverCommissionPct  = signal(0);
  driverWalletBalance  = signal(0);
  // Push diagnosis
  pushDiagStatus = signal<'checking'|'ok'|'error'|'denied'>('checking');
  pushDiagLabel  = signal('Verificando...');
  // Rating
  ratingModal      = signal(false);
  ratingStars      = signal(0);
  ratingCommentValue = '';
  submittingRating = signal(false);
  ratingSkipped    = signal(false);
  ratingTarget     = signal<{ userId: string; name: string; role: 'driver' | 'passenger' } | null>(null);
  ratingTripId     = signal<string | null>(null);
  // Driver active trips (accepted offers)
  driverActiveTrips  = signal<any[]>([]);
  driverTripAlert    = signal<any | null>(null); // full-screen inDrive-style alert when offer accepted
  driverCancelAlert  = signal<string | null>(null); // aviso al conductor cuando pasajero cancela
  driverBenefits     = signal<any | null>(null); // tier + founder + commission data
  // Driver menu sections
  driverSection      = signal<string | null>(null);
  loadingSection     = signal(false);
  driverOnline       = signal(false);
  togglingOnline     = signal(false);
  offlineConfirmOpen = signal(false);
  driverStats        = signal<{ avgRating: number; completedTrips: number } | null>(null);
  driverCompletedTrips = signal<any[]>([]);
  driverEarnings     = signal<{ total: number; walletHistory: any[] }>({ total: 0, walletHistory: [] });
  driverPrefs        = signal({ maxDistance: 20, acceptsPets: false, acceptsLuggage: true, acceptsChildSeat: false });
  driverSettings     = signal({ hidePhone: false, notifySound: true, notifyVibration: true });
  savingPrefs        = signal(false);
  savingSettings     = signal(false);
  // Wallet recharge via ePayco
  rechargeAmount     = signal(0);
  rechargeCustom     = '';
  rechargeLoading    = signal(false);
  rechargeError      = signal<string | null>(null);
  walletPaymentResult = signal<'processing' | 'ok' | null>(null);
  panicActivated     = signal(false);
  panicSending       = signal(false);
  panicContactsNotified = signal(0);
  panicMapsLink      = signal<string>('');
  pushSupported      = signal(false);
  pushEnabled        = signal(false);

  // Cupón
  couponInput        = '';
  appliedCoupon      = signal<{ couponId: string; discount: number; title: string; description?: string } | null>(null);
  validatingCoupon   = signal(false);
  couponError        = signal<string | null>(null);

  // Surge
  surgeMultiplier    = signal(1);
  surgeZoneId        = signal<string | null>(null);

  // ── Navegación en app (conductor + pasajero) ─────────────────
  navActive          = signal(false);
  navInstruction     = signal('Calculando ruta...');
  navDistToNext      = signal('');
  navEtaMin          = signal(0);
  navTotalKm         = signal(0);
  navPhase           = signal<'to_pickup' | 'to_dest'>('to_pickup');
  navManeuverIcon    = signal('straight');
  navVoiceEnabled    = signal(true);
  private _navSteps:      any[]    = [];
  private _navStepIdx:    number   = 0;
  private _navSpokenKeys: Set<string> = new Set();

  // ── Mapa fullscreen durante el viaje ─────────────────────────
  driverMapFullscreen    = signal(false);
  passengerMapFullscreen = signal(false);
  // Trip activo referencia para el conductor en fullscreen
  driverFullscreenTrip   = signal<any | null>(null);

  // ── inDrive parity features ───────────────────────────────────
  // 1. ETA en vivo mientras conductor se acerca
  acceptedDriverEta      = signal<number | null>(null);
  // Distancia y tiempo REALES de Mapbox para la ruta conductor→pasajero
  approachRouteInfo      = signal<{ distKm: number; durationMin: number } | null>(null);
  // 2. Timer "Conductor llegó — sal ya" (pasajero)
  arrivedAtPickupTimer        = signal<number | null>(null);
  private _arrivalTimerInterval: any = null;
  // 2b. Modal conductor esperando al pasajero en pickup
  driverArrivalTrip           = signal<any | null>(null);
  driverArrivalTimer          = signal<number | null>(null);
  private _driverArrivalTimerInterval: any = null;
  // 3. Recibo/resumen del viaje al finalizar
  tripReceiptModal       = signal(false);
  tripReceiptData        = signal<any | null>(null);
  tripReceiptTrip        = signal<any | null>(null); // driver trip ref for post-receipt rating
  // 4. Modal cancelación con motivo
  cancelReasonModal      = signal(false);
  cancelReasonTarget     = signal<'passenger' | 'driver'>('passenger');
  cancelReasonSelected   = signal('');
  // 5. Contraoferta del pasajero
  counterOfferModal      = signal(false);
  counterOfferTarget     = signal<AgTripOffer | null>(null);
  counterOfferValue      = signal(0);
  submittingCounter      = signal(false);

  // Llamadas enmascaradas
  callingDriver      = signal(false);

  // Driver analytics
  analyticsPeriodDriver = signal(30);
  driverAnalytics       = signal<any | null>(null);
  driverDailyEarnings   = signal<{ day: string; trips: number; earnings: number }[]>([]);

  // Quests + vehicles + blacklist + tutorial
  quests         = signal<any[]>([]);
  questProgress  = signal<any[]>([]);
  myVehicles     = signal<any[]>([]);
  blacklist   = signal<any[]>([]);
  addingVehicle = signal(false);
  newVehicle = { vehicle_type: 'carro', plate: '', brand: '', model: '', color: '', year: new Date().getFullYear() };

  readonly tutorialSteps = [
    { icon: 'directions_car', title: '1. Antes de salir', body: 'Revisa SOAT vigente, tecnomecánica, combustible y limpieza del vehículo. Los pasajeros califican todo.' },
    { icon: 'wifi_tethering', title: '2. Ponte en línea', body: 'Activa el botón verde de "En línea" cuando estés listo para trabajar. Necesitas GPS activado y permiso de ubicación.' },
    { icon: 'local_offer', title: '3. Recibes solicitudes', body: 'Verás solicitudes cercanas con precio sugerido. Puedes aceptar el precio del pasajero o hacer una contraoferta.' },
    { icon: 'navigation', title: '4. Navega con Google Maps', body: 'Usa el botón "Origen" para ir a recoger, y "Destino" para llegar al final del viaje. El pasajero verá tu ubicación en tiempo real.' },
    { icon: 'person_check', title: '5. Recoge al pasajero', body: 'Cuando el pasajero se suba, toca "Pasajero a bordo" para avanzar el estado.' },
    { icon: 'check_circle', title: '6. Finaliza y cobra', body: 'Al terminar el viaje, toca "Finalizar". Si el pago es efectivo, cobra antes de bajarlo. Si es digital, confirma con el pasajero por chat.' },
    { icon: 'star', title: '7. Califica al pasajero', body: 'Después de cada viaje, califica al pasajero. Esto nos ayuda a proteger a conductores como tú.' },
    { icon: 'emergency', title: '🚨 Botón de pánico', body: 'En caso de emergencia, usa el botón rojo. Enviaremos alerta a tus contactos con tu ubicación actual.' },
  ];

  // Driver withdrawals
  wdAmount: number | null = null;
  wdMethod: 'bank'|'nequi'|'daviplata'|'efectivo' = 'bank';
  wdAccount = '';
  wdLoading          = signal(false);
  wdMsg              = signal<string | null>(null);
  driverWithdrawals  = signal<any[]>([]);

  // Referral commission withdrawals
  refWdAmount: number | null = null;
  refWdMethod: 'bank_ahorros'|'bank_corriente'|'nequi'|'daviplata' = 'nequi';
  refWdAccount = '';
  refWdLoading       = signal(false);
  refWdMsg           = signal<string | null>(null);
  referralWithdrawals = signal<any[]>([]);

  // ── Documentos del conductor ─────────────────────────
  driverDocs         = signal<any[]>([]);
  readonly docTypes: Array<{ key: string; label: string; requiresExpiry: boolean; icon: string }> = [
    { key: 'license',        label: 'Licencia de conducción', requiresExpiry: true,  icon: 'badge' },
    { key: 'soat',           label: 'SOAT',                   requiresExpiry: true,  icon: 'health_and_safety' },
    { key: 'tecnomecanica',  label: 'Tecnomecánica',          requiresExpiry: true,  icon: 'build' },
    { key: 'cedula',         label: 'Cédula',                 requiresExpiry: false, icon: 'fingerprint' },
    { key: 'vehicle_front',  label: 'Vehículo — frente',      requiresExpiry: false, icon: 'directions_car' },
    { key: 'vehicle_back',   label: 'Vehículo — atrás',       requiresExpiry: false, icon: 'directions_car' },
    { key: 'insurance',      label: 'Seguro (opcional)',      requiresExpiry: true,  icon: 'verified_user' },
  ];
  uploadingDoc       = signal<string | null>(null);
  docExpiryInput: Record<string, string> = {};
  docNumberInput: Record<string, string> = {};

  // ── Métricas performance ─────────────────────────────
  driverMetrics      = signal<{
    acceptance_rate: number; cancellation_rate: number; completion_rate: number;
    offers_seen: number; offers_made: number;
    trips_accepted: number; trips_cancelled: number; trips_completed: number;
    window_start: string;
  } | null>(null);

  // ── Detalle de viaje ─────────────────────────────────
  tripDetailOpen     = signal(false);
  tripDetail         = signal<any | null>(null);
  loadingTripDetail  = signal(false);

  // ── Auto-aceptar ─────────────────────────────────────
  autoAcceptCfg      = signal({ enabled: false, minPrice: 5000, maxDistance: 5 });
  savingAutoAccept   = signal(false);

  // ── Objetos perdidos ─────────────────────────────────
  lostItems          = signal<any[]>([]);
  newLostDesc        = '';
  newLostTripId      = signal<string | null>(null);
  newLostPhoto: File | null = null;
  submittingLost     = signal(false);

  // ── Viajes programados ───────────────────────────────
  availableScheduledTrips = signal<any[]>([]);
  myScheduledTrips        = signal<any[]>([]);
  claimingScheduledId     = signal<string | null>(null);

  // ── Rating pasajero (post-viaje) ─────────────────────
  passengerRatingModal = signal(false);
  passengerRatingStars = signal(0);
  passengerRatingTags  = signal<Set<string>>(new Set());
  passengerRatingComment = '';
  submittingPassengerRating = signal(false);
  pendingRatingTrip    = signal<any | null>(null);
  readonly passengerRatingTagOptions = [
    { key: 'amable',    label: 'Amable' },
    { key: 'puntual',   label: 'Puntual' },
    { key: 'limpio',    label: 'Limpio' },
    { key: 'respetuoso', label: 'Respetuoso' },
    { key: 'buena_conversacion', label: 'Buena conversación' },
    { key: 'propina',   label: 'Dejó propina' },
    { key: 'grosero',   label: 'Grosero' },
    { key: 'impuntual', label: 'Impuntual' },
    { key: 'maltrato',  label: 'Maltrato' },
  ];

  wdPlaceholder(): string {
    const m = this.wdMethod;
    if (m === 'bank') return 'Ej: Bancolombia 1234567890';
    if (m === 'nequi' || m === 'daviplata') return '+57 300 1234567';
    return 'Opcional';
  }

  refWdPlaceholder(): string {
    const m = this.refWdMethod;
    if (m === 'bank_ahorros' || m === 'bank_corriente') return 'Número de cuenta Bancolombia';
    if (m === 'nequi' || m === 'daviplata') return '+57 300 1234567';
    return 'Número de cuenta';
  }

  async requestReferralWithdraw(): Promise<void> {
    const profile = this.agProfile();
    const amt = Number(this.refWdAmount);
    if (!profile || amt < 10000) return;
    this.refWdLoading.set(true);
    this.refWdMsg.set(null);
    try {
      await this.agService.requestReferralWithdrawal(profile.id, amt, this.refWdMethod, { account: this.refWdAccount.trim() });
      this.refWdMsg.set('Retiro solicitado. Recibirás en 1-3 días hábiles.');
      this.refWdAmount = null;
      const withdrawals = await this.agService.listReferralWithdrawals(profile.id);
      this.referralWithdrawals.set(withdrawals);
      await this.loadReferralData();
    } catch (e: any) {
      this.refWdMsg.set('Error: ' + (e?.message ?? 'Intenta de nuevo'));
    } finally {
      this.refWdLoading.set(false);
    }
  }

  // Driver analytics
  async setAnalyticsPeriod(days: number): Promise<void> {
    this.analyticsPeriodDriver.set(days);
    await this.loadDriverAnalytics();
  }

  async loadDriverAnalytics(): Promise<void> {
    const d = this.driverData();
    if (!d) return;
    const days = this.analyticsPeriodDriver();
    const [a, series] = await Promise.all([
      this.agService.getDriverAnalytics(d.id, days),
      this.agService.getDriverDailyEarnings(d.id, Math.min(days, 30)),
    ]);
    this.driverAnalytics.set(a);
    this.driverDailyEarnings.set(series);
  }

  dailyBarHeight(val: number): number {
    const max = Math.max(...this.driverDailyEarnings().map(d => d.earnings), 1);
    return Math.round((val / max) * 100);
  }

  // Quests
  async loadQuests(): Promise<void> {
    const d = this.driverData();
    const [quests, progress] = await Promise.all([
      this.agService.listQuests(),
      d ? this.agService.getQuestProgress(d.id) : Promise.resolve([]),
    ]);
    this.quests.set(quests);
    this.questProgress.set(progress);
  }

  questProgressFor(questId: string): any {
    return this.questProgress().find(p => p.quest_id === questId || p.ag_quests?.id === questId) ?? null;
  }

  // Vehicles
  async loadVehicles(): Promise<void> {
    const d = this.driverData();
    if (!d) return;
    this.myVehicles.set(await this.agService.listVehicles(d.id));
  }

  openAddVehicle(): void { this.addingVehicle.set(!this.addingVehicle()); }

  async saveNewVehicle(): Promise<void> {
    const d = this.driverData();
    if (!d || !this.newVehicle.plate.trim()) return;
    try {
      await this.agService.addVehicle(d.id, {
        vehicle_type: this.newVehicle.vehicle_type,
        brand: this.newVehicle.brand.trim(),
        model: this.newVehicle.model.trim(),
        year: Number(this.newVehicle.year),
        color: this.newVehicle.color.trim(),
        plate: this.newVehicle.plate.trim().toUpperCase(),
      });
      this.newVehicle = { vehicle_type: 'carro', plate: '', brand: '', model: '', color: '', year: new Date().getFullYear() };
      this.addingVehicle.set(false);
      await this.loadVehicles();
    } catch (e: any) { alert('Error: ' + (e?.message ?? 'No se pudo')); }
  }

  async switchVehicle(vehicleId: string): Promise<void> {
    const d = this.driverData();
    if (!d) return;
    await this.agService.setCurrentVehicle(d.id, vehicleId);
    await this.loadVehicles();
  }

  // Blacklist
  async loadBlacklist(): Promise<void> {
    const d = this.driverData();
    if (!d) return;
    this.blacklist.set(await this.agService.listBlacklist(d.id));
  }

  async removeFromBlacklist(id: string): Promise<void> {
    await this.agService.removeFromBlacklist(id);
    await this.loadBlacklist();
  }

  tutorialDone(): boolean {
    return !!((this.driverData() as any)?.tutorial_completed);
  }

  // Tutorial
  async completeTutorial(): Promise<void> {
    const d = this.driverData();
    if (!d) return;
    await this.agService.markTutorialCompleted(d.id);
    if ((d as any).tutorial_completed !== undefined) (d as any).tutorial_completed = true;
    alert('✓ Tutorial completado. ¡Ya puedes trabajar!');
  }

  async requestDriverWithdraw(): Promise<void> {
    const d = this.driverData();
    const amt = Number(this.wdAmount);
    if (!d || !amt || amt < 20000) { this.wdMsg.set('Error: mínimo 20.000 COP'); return; }
    this.wdLoading.set(true);
    this.wdMsg.set(null);
    try {
      await this.agService.requestDriverWithdrawal(d.id, amt, this.wdMethod, { account: this.wdAccount.trim() });
      this.wdMsg.set('Retiro solicitado. Recibirás en 1-3 días hábiles.');
      this.wdAmount = null;
      this.wdAccount = '';
      this.driverWithdrawals.set(await this.agService.listDriverWithdrawals(d.id));
      // Refrescar balance visible (ajustar localmente en memoria)
      (d as any).wallet_balance = ((d as any).wallet_balance ?? 0) - amt;
    } catch (e: any) {
      this.wdMsg.set('Error: ' + (e?.message ?? 'No se pudo'));
    } finally { this.wdLoading.set(false); }
  }
  emergencyContacts  = signal<{ name: string; phone: string }[]>([]);
  newContactName     = '';
  newContactPhone    = '';
  reportIncidentText = '';
  reportPassengerText = '';
  tripService     = signal<'viaje' | 'moto' | 'ciudad' | 'domicilio' | 'fletes'>('viaje');
  agMenuOpen      = signal(false);

  // ── Passenger menu sections ────────────────────────────────────
  passengerSection         = signal<string | null>(null);
  passengerHistory         = signal<any[]>([]);
  passengerHistoryLoading  = signal(false);
  passengerNotifSettings   = signal({ sound: true, vibration: true, newOffers: true });
  passengerSettings        = signal({ hidePhone: false, language: 'es' });
  passengerSecurityContacts = signal<{ name: string; phone: string }[]>([]);
  passengerNewContactName  = '';
  passengerNewContactPhone = '';
  savingPassengerSettings  = signal(false);
  openPassengerFaq         = signal<string | null>(null);

  // ── Passenger expanded features ──────────────────────────────────
  passengerFavorites    = signal<any[]>([]);
  newFavLabel           = '';
  newFavAddress         = '';
  addingFav             = signal(false);

  passengerPaymentMethods = signal<any[]>([]);
  newPmKind             = signal<'card'|'nequi'|'daviplata'|'bancolombia'|'efectivo'>('card');
  newPmLabel            = '';
  newPmLast4            = '';
  newPmBrand            = '';
  newPmAccount          = '';
  addingPm              = signal(false);

  passengerWalletBalance = signal(0);
  passengerWalletHistory = signal<any[]>([]);
  pRechargeAmount        = signal(0);
  pRechargeLoading       = signal(false);

  passengerScheduled     = signal<any[]>([]);
  schedDate              = '';
  schedTime              = '';
  creatingSched          = signal(false);

  passengerReports       = signal<any[]>([]);
  reportKind             = signal<'driver'|'incident'|'payment'|'vehicle'|'other'>('driver');
  reportDescription      = '';
  submittingReport       = signal(false);

  passengerLostItems     = signal<any[]>([]);

  passengerLoyalty       = signal<{ points: number; level: string; total_trips: number } | null>(null);

  passengerCorporateAccounts = signal<any[]>([]);
  newCorpName            = '';
  newCorpNit             = '';
  newCorpBudget          = 0;
  creatingCorp           = signal(false);

  // ── Chat modal (reutiliza chatMessages/chatInput existentes) ──
  chatOpen               = signal(false);
  sendingChat            = signal(false);

  // ── Tracking live del conductor ──
  driverLiveLocation     = signal<{ lat: number; lng: number; heading?: number } | null>(null);
  currentTripStage       = signal<string | null>(null);
  private _driverLocChannel: RealtimeChannel | null = null;
  private _tripStageChannel: RealtimeChannel | null = null;

  readonly passengerTripStages = [
    { key: 'heading_to_pickup', label: 'Yendo por ti', icon: 'directions_car' },
    { key: 'arrived_at_pickup', label: 'Conductor llegó', icon: 'pin_drop' },
    { key: 'picked_up', label: 'En camino', icon: 'navigation' },
    { key: 'on_route', label: 'En ruta', icon: 'route' },
    { key: 'arrived_at_destination', label: 'Llegaste', icon: 'flag' },
  ];

  // ── Categorías premium ──
  readonly tripCategories = [
    { key: 'economy', label: 'Economy',  mult: 1.0, icon: 'directions_car', color: '#0891b2',
      description: 'Viaje estándar al mejor precio' },
    { key: 'comfort', label: 'Comfort',  mult: 1.3, icon: 'airline_seat_recline_extra', color: '#8b5cf6',
      description: 'Autos más nuevos con AC y más espacio' },
    { key: 'xl',      label: 'XL',        mult: 1.5, icon: 'airport_shuttle', color: '#f97316',
      description: 'Hasta 6 pasajeros, ideal para grupos' },
    { key: 'premium', label: 'Premium',   mult: 1.7, icon: 'star', color: '#f59e0b',
      description: 'Vehículo ejecutivo y conductores top rated' },
  ];
  selectedCategory = signal<'economy'|'comfort'|'premium'|'xl'>('economy');

  // ── Accesibilidad ──
  tripAccessibility = signal({ pets: false, luggage: false, child_seat: false, wheelchair: false });

  // ── Viaje para otra persona ──
  forOtherEnabled = signal(false);
  forOtherName    = '';
  forOtherPhone   = '';

  // ── Editar perfil pasajero ──
  editProfileOpen   = signal(false);
  editProfileName   = '';
  editProfilePhone  = '';
  editProfileCity   = '';
  editProfileFile: File | null = null;
  editProfilePreview: string | null = null;
  savingProfile     = signal(false);

  // ── Propina ──
  tipModalOpen      = signal(false);
  tipAmount         = signal(0);
  tipTripId         = signal<string | null>(null);
  submittingTip     = signal(false);
  readonly tipPresets = [2000, 3000, 5000, 10000];

  // ── Recibo / detalle viaje pasajero ──
  passengerTripDetailOpen  = signal(false);
  passengerTripDetail      = signal<any | null>(null);
  loadingPassengerDetail   = signal(false);

  // ── Share trip ──
  tripShareLink            = signal<string | null>(null);
  creatingShare            = signal(false);

  // ── Driver public info (para mostrar rating en oferta) ──
  driverPublicInfoCache    = new Map<string, any>();

  // ── Waypoints pasajero ──
  passengerWaypoints       = signal<{ address: string; lat: number; lng: number }[]>([]);
  newWaypointAddress       = '';

  // ── Notas al conductor ──
  passengerTripNote        = '';

  readonly passengerFaqItems = [
    { q: '¿Cómo solicito un viaje?',       a: 'Toca el botón "¿A dónde vas?" en el mapa, busca tu destino y confirma el precio. Los conductores cercanos recibirán tu solicitud.' },
    { q: '¿Cómo se calcula el precio?',    a: 'El precio se calcula según la distancia del recorrido. Tú propones el precio y los conductores deciden si aceptan.' },
    { q: '¿Puedo cancelar un viaje?',       a: 'Sí, puedes cancelar antes de que un conductor sea asignado. Toca el botón "Cancelar solicitud" en el panel inferior.' },
    { q: '¿Cómo pago?',                    a: 'Puedes pagar en efectivo, Nequi, Daviplata, Bancolombia o tarjeta. Selecciona tu método antes de confirmar el viaje.' },
    { q: '¿Cómo califico al conductor?',   a: 'Al finalizar el viaje aparecerá una pantalla de calificación. Tu opinión ayuda a mantener la calidad del servicio.' },
  ];

  readonly paymentMethods: {
    value: AgPaymentMethod; label: string; icon: string;
    color: string; bgSel: string; colorDark: string; bgDark: string;
  }[] = [
    { value: 'efectivo',    label: 'Efectivo',    icon: 'payments',        color: '#16a34a', bgSel: '#f0fdf4', colorDark: '#4ade80', bgDark: 'rgba(74,222,128,0.08)' },
    { value: 'nequi',       label: 'Nequi',       icon: 'smartphone',      color: '#7c3aed', bgSel: '#faf5ff', colorDark: '#a78bfa', bgDark: 'rgba(167,139,250,0.08)' },
    { value: 'daviplata',   label: 'Daviplata',   icon: 'smartphone',      color: '#dc2626', bgSel: '#fff1f2', colorDark: '#f87171', bgDark: 'rgba(248,113,113,0.08)' },
    { value: 'bancolombia', label: 'Bancolombia', icon: 'account_balance',  color: '#b45309', bgSel: '#fffbeb', colorDark: '#fbbf24', bgDark: 'rgba(251,191,36,0.08)'  },
    { value: 'tarjeta',     label: 'Tarjeta',     icon: 'credit_card',     color: '#0369a1', bgSel: '#f0f9ff', colorDark: '#38bdf8', bgDark: 'rgba(56,189,248,0.08)'  },
  ];

  readonly paymentMethodMap = Object.fromEntries(
    this.paymentMethods.map(p => [p.value, p])
  ) as Record<AgPaymentMethod, typeof this.paymentMethods[0]>;

  /** Helper para obtener método de pago (evita error TS con any) */
  getPaymentInfo(method: unknown) {
    return this.paymentMethodMap[(method as AgPaymentMethod) ?? 'efectivo'] ?? this.paymentMethodMap['efectivo'];
  }

  readonly agMenuItems = [
    { icon: 'location_city',    label: 'Ciudad',                   action: 'service:viaje',    divider: false, section: '' },
    { icon: 'history',          label: 'Historial de solicitudes', action: 'history',           divider: false, section: '' },
    { icon: 'schedule',         label: 'Programar viaje',          action: 'schedule',          divider: false, section: '' },
    { icon: 'local_shipping',   label: 'Entregas',                 action: 'service:domicilio', divider: false, section: '' },
    { icon: 'directions_bus',   label: 'Ciudad a Ciudad',          action: 'service:ciudad',    divider: false, section: '' },
    { icon: 'airport_shuttle',  label: 'Flete',                    action: 'service:fletes',    divider: false, section: '' },
    { divider: true,  section: 'Mi cuenta', icon: '', label: '', action: '' },
    { icon: 'person',           label: 'Mi perfil',                action: 'profile',           divider: false, section: '' },
    { icon: 'star',             label: 'Mi nivel y puntos',        action: 'loyalty',           divider: false, section: '' },
    { icon: 'account_balance_wallet', label: 'Mi wallet',          action: 'wallet',            divider: false, section: '' },
    { icon: 'credit_card',      label: 'Métodos de pago',          action: 'paymentmethods',    divider: false, section: '' },
    { icon: 'favorite',         label: 'Direcciones favoritas',    action: 'favorites',         divider: false, section: '' },
    { divider: true,  section: 'Ganancias', icon: '', label: '', action: '' },
    { icon: 'card_giftcard',    label: 'Recomienda y Gana',        action: 'referrals',         divider: false, section: '' },
    { divider: true,  section: 'Extras', icon: '', label: '', action: '' },
    { icon: 'inventory_2',      label: 'Objetos olvidados',        action: 'lost',              divider: false, section: '' },
    { icon: 'flag',             label: 'Reportar problema',        action: 'report',            divider: false, section: '' },
    { icon: 'business',         label: 'Cuenta empresa',           action: 'corporate',         divider: false, section: '' },
    { divider: true,  section: 'Cuenta', icon: '', label: '', action: '' },
    { icon: 'notifications',    label: 'Notificaciones',           action: 'notifications',     divider: false, section: '' },
    { icon: 'shield',           label: 'Seguridad',                action: 'security',          divider: false, section: '' },
    { icon: 'block',            label: 'Conductores bloqueados',   action: 'blockeddrivers',    divider: false, section: '' },
    { icon: 'settings',         label: 'Configuración',            action: 'settings',          divider: false, section: '' },
    { icon: 'school',           label: 'Tutorial',                 action: 'tutorial',          divider: false, section: '' },
    { icon: 'help',             label: 'Ayuda',                    action: 'support',           divider: false, section: '' },
    { divider: true,  section: '', icon: '', label: '', action: '' },
    { icon: 'drive_eta',        label: 'Conductor',                action: 'driver',            divider: false, section: '' },
  ];

  readonly rechargePresets = [10000, 20000, 50000, 100000, 200000, 500000];

  readonly driverMenuItems = [
    { icon: 'person',          label: 'Mi Perfil',            action: 'profile',      sectionLabel: 'Principal',     danger: false, divider: false },
    { icon: 'wifi_tethering',  label: 'Estado / En Línea',    action: 'status',       sectionLabel: '',              danger: false, divider: false },
    { icon: 'account_balance_wallet', label: 'Mi Wallet · Recarga', action: 'wallet-panel', sectionLabel: '',           danger: false, divider: false },
    { icon: 'payments',        label: 'Comisión/Referidos',   action: 'earnings',     sectionLabel: '',              danger: false, divider: false },
    { icon: 'route',           label: 'Mis Viajes',           action: 'trips',        sectionLabel: '',              danger: false, divider: false },
    { icon: 'schedule',        label: 'Viajes programados',   action: 'scheduled',    sectionLabel: '',              danger: false, divider: false },
    { icon: 'analytics',       label: 'Analytics',            action: 'analytics',    sectionLabel: '',              danger: false, divider: false },
    { icon: 'insights',        label: 'Rendimiento',          action: 'performance',  sectionLabel: '',              danger: false, divider: false },
    { icon: 'emoji_events',    label: 'Metas y bonos',        action: 'quests',       sectionLabel: '',              danger: false, divider: false },
    { icon: '',                label: '',                     action: '',             sectionLabel: 'Ganancias',     danger: false, divider: true },
    { icon: 'workspace_premium', label: 'Mis Beneficios',    action: 'benefits',     sectionLabel: '',              danger: false, divider: false },
    { icon: 'card_giftcard',   label: 'Recomienda y Gana',    action: 'referrals',    sectionLabel: '',              danger: false, divider: false },
    { icon: '',                label: '',                     action: '',             sectionLabel: 'Configuración', danger: false, divider: true },
    { icon: 'description',     label: 'Mis documentos',       action: 'documents',    sectionLabel: '',              danger: false, divider: false },
    { icon: 'tune',            label: 'Preferencias',         action: 'preferences',  sectionLabel: '',              danger: false, divider: false },
    { icon: 'auto_mode',       label: 'Auto-aceptar',         action: 'autoaccept',   sectionLabel: '',              danger: false, divider: false },
    { icon: 'directions_car',  label: 'Mis vehículos',        action: 'vehicles',     sectionLabel: '',              danger: false, divider: false },
    { icon: 'shield',          label: 'Seguridad',            action: 'security',     sectionLabel: '',              danger: false, divider: false },
    { icon: 'block',           label: 'Pasajeros bloqueados', action: 'blacklist',    sectionLabel: '',              danger: false, divider: false },
    { icon: 'inventory_2',     label: 'Objetos olvidados',    action: 'lost',         sectionLabel: '',              danger: false, divider: false },
    { icon: 'notifications',   label: 'Notificaciones',       action: 'notifications', sectionLabel: '',             danger: false, divider: false },
    { icon: 'settings',        label: 'Configuración',        action: 'settings',     sectionLabel: '',              danger: false, divider: false },
    { icon: 'flag',            label: 'Reportar problema',    action: 'report',       sectionLabel: '',              danger: false, divider: false },
    { icon: 'support_agent',   label: 'Soporte',              action: 'support',      sectionLabel: '',              danger: false, divider: false },
    { icon: 'school',          label: 'Tutorial',             action: 'tutorial',     sectionLabel: '',              danger: false, divider: false },
  ];

  driverMenuOpen    = signal(false);
  walletPanelOpen   = signal(false);

  private _map:             any    = null;
  private _userMarker:      any    = null;
  private _vehicleMarkers:  any[]  = [];
  private _markerLastSeen = new Map<string, number>();
  private _staleMarkerTimer: ReturnType<typeof setInterval> | null = null;
  driverNearbyAlert = signal(false);
  private _driverNearbyShown = false;
  private _vehicleStates: Array<{
    path: [number, number][]; segIdx: number; t: number;
    speed: number; forward: boolean; marker: any; heading: number;
  }> = [];
  private _animFrame: number | null = null;
  private _lastTs:    number | null = null;
  private _waitingInterval: ReturnType<typeof setInterval> | null = null;
  private _offerChannel: RealtimeChannel | null = null;
  private _requestsChannel: RealtimeChannel | null = null;
  private _myOffersChannel: RealtimeChannel | null = null;
  private _tripBoardingChannel: RealtimeChannel | null = null;
  private _passengerLiveChannel: RealtimeChannel | null = null;
  private _mapboxPromise: Promise<void> | null = null;
  private _mbxSessionToken: string | null = null;

  // ── Geolocalización en tiempo real (pasajero) ──────────────────
  private _passengerWatchId:    number | null = null;   // ID del watchPosition pasajero
  private _locationThrottleTs:  number        = 0;      // timestamp último update (throttle 5s)
  private _lastNotifiedLat:     number        = 0;      // última lat que causó update de búsqueda
  private _lastNotifiedLng:     number        = 0;      // última lng que causó update de búsqueda

  /** Distancia Haversine simplificada en metros */
  private _distMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2
            + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180)
            * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }
  private _destMarker:      any = null;
  private _currentLat = 4.6097;
  private _currentLng = -74.0817;
  /** true solo cuando tenemos una lectura GPS con precisión real (<300m). Evita usar coords por defecto (Bogotá) como origen de viaje. */
  private _gpsRealFix    = false;
  private _cityFromGps   = '';   // ciudad detectada por GPS — filtra sugerencias de búsqueda
  private readonly MAPBOX_TOKEN = environment.andaGana.mapboxToken;
  private readonly SUPABASE_ANON = environment.supabase.anonKey;
  private readonly DEFAULT_LAT  = 4.6097;
  private readonly DEFAULT_LNG  = -74.0817;

  firstName() { return this.agProfile()?.full_name?.split(' ')[0] ?? ''; }

  // ── Lifecycle ────────────────────────────────���─────────────────
  async ngOnInit() {
    if (isPlatformBrowser(this.platformId)) {
      SplashScreen.hide({ fadeOutDuration: 0 }).catch(() => {});
    }

    // Capturar referido desde query param ?ref=
    this.referredBy = this.route.snapshot.queryParamMap.get('ref');

    // Retorno de ePayco tras pago de wallet
    if (this.route.snapshot.queryParamMap.get('wallet') === 'result') {
      this.walletPaymentResult.set('processing');
    }

    // Detectar soporte push y estado
    this.checkPushSupport();

    // En SSR no hay sesión de usuario: mostrar loading y dejar que el cliente evalúe
    if (!isPlatformBrowser(this.platformId)) {
      this.screen.set('loading');
      return;
    }

    // Cargar surge actual
    this.agService.currentSurge().then(s => this.surgeMultiplier.set(s)).catch(() => {});

    let profile = await this.agService.getMyAgProfile();

    // Si no hay sesión, intentar re-auth silenciosa con teléfono guardado (evita pedir SMS de nuevo)
    if (!profile) {
      const reauth = await this.phoneAuth.tryReAuth();
      if (reauth?.profile) {
        profile = reauth.profile;
      }
    }

    this.agProfile.set(profile);
    if (profile && isPlatformBrowser(this.platformId)) {
      this.agReferralLink.set(`${window.location.origin}/anda-gana?ref=${profile.id}`);
    }

    if (!profile) { this.screen.set('home'); return; }

    // Cargar datos de billetera de retiro
    this.loadReferralData();

    if (profile.role === 'passenger') {
      this.screen.set('passenger-home');
      this._startPassengerWatch();
      this.agService.cancelStaleTrips().catch(() => {});
      this._subscribeToDriverLocations();
      // Restaurar viaje activo tras crash/recarga de página
      this._restoreActiveTrip();
    } else {
      let mine = await this.agService.getMyDriverProfile();
      // Fallback: si RLS bloquea la consulta directa, buscar por teléfono guardado (service_role)
      if (!mine && isPlatformBrowser(this.platformId)) {
        const savedPhone = localStorage.getItem('movi-ag-phone');
        if (savedPhone) {
          const fallback = await this.agService.getDriverProfileByPhone(savedPhone);
          if (fallback?.driver) {
            mine = fallback.driver;
            if (fallback.profile && !this.agProfile()) {
              this.agProfile.set(fallback.profile);
            }
          }
        }
      }
      // Auto-upgrade: cualquier conductor pending pasa directo a quick (habilitado para primera carrera)
      if (mine && mine.status === 'pending') {
        await getMoviClient().from('ag_drivers').update({ status: 'quick' }).eq('id', mine.id);
        mine = { ...mine, status: 'quick' };
      }
      this.driverData.set(mine);
      this.driverStatus.set(mine?.status ?? 'quick');
      this.driverRejectionReason.set(mine?.rejection_reason ?? null);
      this.screen.set('driver-home');
      await this._initDriverHome(mine);
    }

    // Iniciar mapa después de que Angular renderice el DOM
    setTimeout(() => this.initGpsAndMap('ag-map-user'), 150);
  }

  private async _initDriverHome(mine: any) {
    if (!mine) return;
    const status: string = mine.status ?? 'quick';
    // Approved: siempre cargar (conductor está online por defecto). Quick/otros: siempre cargar.
    const shouldLoad = status !== 'rejected';
    if (shouldLoad) {
      // Poner online y cargar solicitudes ANTES de cualquier await para que no falle si algo lanza error
      this.driverOnline.set(true);
      this.agService.setDriverOnline(mine.id, true).catch(() => {});
      this._loadDriverRequests(mine.vehicle_type);
      // Cuando el conductor vuelve a la app desde background, refrescar solicitudes inmediatamente
      if (isPlatformBrowser(this.platformId) && !this._visibilityHandler) {
        this._visibilityHandler = () => {
          if (!document.hidden && this.driverOnline()) {
            this.refreshDriverRequests();
          }
        };
        document.addEventListener('visibilitychange', this._visibilityHandler);
      }
    }
    // Cargar comisión — y saldo desde mine directamente (evita falla RLS si hay registros duplicados)
    const pct = await this.agService.getCommissionPct().catch(() => 12);
    this.driverCommissionPct.set(pct);
    // Usar wallet_balance del objeto mine si está disponible; refrescar en background desde DB
    if (mine.wallet_balance != null) {
      this.driverWalletBalance.set(mine.wallet_balance);
    }
    this.agService.getDriverWalletBalance(mine.id).then(balance => {
      if (balance !== null) {
        this.driverWalletBalance.set(balance);
        this.cdr.markForCheck();
      }
    }).catch(() => {});
    if (this.walletPaymentResult() === 'processing') {
      this.walletPaymentResult.set('ok');
      this.cdr.markForCheck();
      setTimeout(() => { this.walletPaymentResult.set(null); this.cdr.markForCheck(); }, 6000);
    }
    // GPS, timer y push se inician aquí (después de los awaits de comisión/wallet)
    if (status !== 'rejected') {
      this.startGpsTracking(mine.id);
      this._startOnlineTimer();
      if (!this._onlineSessionId) {
        this.agService.startOnlineSession(mine.id).then(id => { this._onlineSessionId = id; }).catch(() => {});
      }
      // Registrar push — FCM nativo inmediato (no depende del GPS), web push con delay
      this._registerNativePush().catch(() => {});
      setTimeout(() => this._autoRegisterPush(), 500);
    }
    // Cargar viajes activos (ofertas aceptadas por el pasajero)
    const activeTrips = await this.agService.getDriverActiveTrips(mine.id).catch(() => []);
    if (activeTrips.length > 0) {
      this.driverActiveTrips.set(activeTrips);
      // Viaje aceptado recientemente (últimos 5 min) sin acción → mostrar modal
      const fiveMinAgo = Date.now() - 5 * 60 * 1000;
      const pendingTrip = (activeTrips as any[]).find((t: any) =>
        !t.ag_trip_requests?.driver_stage &&
        new Date(t.updated_at ?? 0).getTime() > fiveMinAgo
      );
      if (pendingTrip) {
        setTimeout(() => this._handleNewAcceptedOffer(pendingTrip), 800);
      } else {
        // Si recargó con viaje en heading_to_pickup → restaurar mapa
        const headingTrip = (activeTrips as any[]).find((t: any) =>
          t.ag_trip_requests?.driver_stage === 'heading_to_pickup'
        );
        if (headingTrip) {
          const req = headingTrip.ag_trip_requests ?? headingTrip;
          if (req?.origin_lat && req?.origin_lng) {
            this.driverFullscreenTrip.set(headingTrip);
            this.driverMapFullscreen.set(true);
            this._waitForMap(() => this.startInAppNav(headingTrip, true));
          }
        }
      }
    }
    // Cargar beneficios (tier, fundador, comisión escalonada)
    const benefits = await this.agService.getDriverBenefits(mine.id).catch(() => null);
    if (benefits) {
      this.driverBenefits.set(benefits);
      // Usar la tasa personal del conductor (no la tasa global de la plataforma)
      this.driverCommissionPct.set(benefits.commission_pct);
    }
    // Suscripción realtime: saber cuando el pasajero acepta la oferta
    this._subscribeToMyOffers(mine.id);
    this.cdr.markForCheck();
  }

  private _activeTripsInterval: ReturnType<typeof setInterval> | null = null;

  private _driverBroadcastChannel: any = null;

  private _subscribeToMyOffers(driverId: string): void {
    if (!isPlatformBrowser(this.platformId)) return;
    if (this._myOffersChannel) { this._myOffersChannel.unsubscribe(); this._myOffersChannel = null; }
    this._myOffersChannel = this.agService.subscribeToDriverOfferAccepted(driverId, (offer) => {
      if (!this.driverTripAlert()) this._handleNewAcceptedOffer(offer);
    });

    // Canal broadcast directo: el pasajero envía señal sin pasar por RLS
    if (this._driverBroadcastChannel) { try { this._driverBroadcastChannel.unsubscribe(); } catch {} }
    this._driverBroadcastChannel = this.agService.subscribeToDriverBroadcast(
      driverId,
      async (payload) => {
        if (this.driverTripAlert()) return;
        const trips = await this.agService.getDriverActiveTrips(driverId).catch(() => []);
        if (!trips.length) return;
        const match = trips.find((t: any) => (t.id === payload?.offerId || t.trip_request_id === payload?.tripRequestId) && !t.ag_trip_requests?.driver_stage) ?? trips.find((t: any) => !t.ag_trip_requests?.driver_stage);
        if (match && !this.driverTripAlert()) this._handleNewAcceptedOffer(match);
      },
      (payload) => {
        // Pasajero confirmó "Ya estoy a bordo" — activar ruta igual que si el conductor tocara "Pasajero a Bordo"
        const waitingTrip = this.driverArrivalTrip();
        if (!waitingTrip) return;
        const waitingId = waitingTrip.trip_request_id ?? waitingTrip.ag_trip_requests?.id;
        if (!payload?.tripRequestId || payload.tripRequestId === waitingId) {
          this.driverPassengerBoarded();
        }
      },
      async (payload) => {
        // Pasajero finalizó el viaje → conductor muestra recibo y rating
        const tripId = payload?.tripRequestId;
        const trip = this.driverActiveTrips().find((t: any) =>
          (t.trip_request_id ?? t.ag_trip_requests?.id) === tripId
        ) ?? this.driverActiveTrips()[0];
        if (!trip) return;
        const tripDetails = await this.agService.getTripDetails(tripId).catch(() => null);
        this.driverActiveTrips.update(list => list.filter(t => t.id !== trip.id));
        if (tripDetails) {
          this.tripReceiptData.set({ ...tripDetails, _role: 'driver' });
          this.tripReceiptTrip.set(trip);
          this.tripReceiptModal.set(true);
        } else {
          await this.promptRatePassenger(trip);
        }
        this.cdr.markForCheck();
      },
    );
    // Fallback: polling cada 2.5s para detectar viajes aceptados si el realtime falla (RLS, red, etc.)
    if (this._activeTripsInterval) clearInterval(this._activeTripsInterval);
    this._activeTripsInterval = setInterval(async () => {
      if (!this.driverData() || this.driverTripAlert()) return;
      try {
        const trips = await this.agService.getDriverActiveTrips(driverId);
        if (!trips.length) return;
        const knownIds = new Set(this.driverActiveTrips().map((t: any) => t.id));
        // Solo mostrar modal para trips verdaderamente nuevos (no conocidos)
        const newTrips = trips.filter((t: any) => !knownIds.has(t.id));
        newTrips.forEach((t: any) => this._handleNewAcceptedOffer(t));
      } catch {}
    }, 2500);
  }

  private _handleNewAcceptedOffer(offer: any): void {
    // Mostrar alerta inDrive full-screen
    this.driverTripAlert.set(offer);
    // Agregar a viajes activos si no está ya
    this.driverActiveTrips.update(list => list.some((t: any) => t.id === offer.id) ? list : [offer, ...list]);
    // Quitar la solicitud del listado en vivo
    const reqId = offer.trip_request_id ?? offer.ag_trip_requests?.id;
    if (reqId) this.driverRequests.update(list => list.filter(r => r.id !== reqId));
    this.cdr.markForCheck();
  }

  /** Limpia todo el estado del conductor cuando el pasajero cancela el viaje */
  private _handleTripCancelled(tripRequestId: string, cancelReason?: string): void {
    const active = this.driverActiveTrips().find((t: any) =>
      t.trip_request_id === tripRequestId || t.ag_trip_requests?.id === tripRequestId
    );
    if (!active) return;

    // Quitar de trips activos
    this.driverActiveTrips.update(list =>
      list.filter((t: any) => t.trip_request_id !== tripRequestId && t.ag_trip_requests?.id !== tripRequestId)
    );

    // Cerrar modal de aceptación si estaba abierto
    const tripAlert = this.driverTripAlert();
    if (tripAlert && (tripAlert.trip_request_id === tripRequestId || tripAlert.ag_trip_requests?.id === tripRequestId)) {
      this.driverTripAlert.set(null);
    }

    // Cerrar mapa fullscreen si estaba navegando
    const fs = this.driverFullscreenTrip();
    if (fs && (fs.trip_request_id === tripRequestId || fs.ag_trip_requests?.id === tripRequestId)) {
      this.stopInAppNav();
      this.driverMapFullscreen.set(false);
      this.driverFullscreenTrip.set(null);
      setTimeout(() => this._map?.resize(), 150);
    }

    // Cerrar modal de espera pickup del conductor si estaba activo
    this._clearDriverArrivalTimer();
    this.driverArrivalTrip.set(null);
    this.driverArrivalTimer.set(null);
    // Limpiar rutas y timers del mapa
    this._clearApproachRoute();
    this._clearNavRoute();
    // Asegurar estado inicial del conductor: sin fullscreen, sin nav, home visible
    this.driverMapFullscreen.set(false);
    this.driverFullscreenTrip.set(null);
    this.navActive.set(false);
    if (this.driverSection() !== null) this.driverSection.set(null);
    // Mostrar aviso con motivo
    this.driverCancelAlert.set(cancelReason ?? null);
    // Restaurar mapa a estado inicial (300px, tiles recargados)
    this._resetMapToInitialState();
  }

  /** Restaura el mapa al estado visual inicial destruyendo y recreando la instancia Mapbox */
  private _resetMapToInitialState(): void {
    this.cdr.markForCheck();
    // Destruir y recrear el mapa — garantiza tiles limpios en Android WebView
    setTimeout(() => this.retryGps('ag-map-user'), 300);
  }

  private _waitForMap(cb: () => void, maxAttempts = 30): void {
    if (this._map?.isStyleLoaded()) { setTimeout(cb, 150); return; }
    if (this._map) { this._map.once('idle', () => { setTimeout(cb, 150); }); return; }
    let attempts = 0;
    const iv = setInterval(() => {
      attempts++;
      if (this._map?.isStyleLoaded()) { clearInterval(iv); setTimeout(cb, 150); return; }
      if (this._map) { clearInterval(iv); this._map.once('idle', () => { setTimeout(cb, 150); }); return; }
      if (attempts >= maxAttempts) clearInterval(iv);
    }, 500);
  }

  private _locationChannel: RealtimeChannel | null = null;

  ngOnDestroy() {
    this._destroyMap();
    this._stopWaiting();
    this._unsubscribeOffers();
    this._unsubscribeChat();
    this.stopGpsTracking();
    this._stopPassengerWatch();
    this._unsubscribeLocations();
    this._stopTrackingAssignedDriver();
    this.stopDriverTracking(); // limpia _driverLocChannel + _tripStageChannel
    if (this._driverRefreshInterval) { clearInterval(this._driverRefreshInterval); this._driverRefreshInterval = null; }
    if (this._reqTimerInterval) { clearInterval(this._reqTimerInterval); this._reqTimerInterval = null; }
    if (this._cancelCheckInterval) { clearInterval(this._cancelCheckInterval); this._cancelCheckInterval = null; }
    if (this._onlineTimer) { clearInterval(this._onlineTimer); this._onlineTimer = null; }
    if (this._waitingInterval) { clearInterval(this._waitingInterval); this._waitingInterval = null; }
    if (this._activeTripsInterval) { clearInterval(this._activeTripsInterval); this._activeTripsInterval = null; }
    this._clearDriverArrivalTimer();
    if (this._requestsChannel) { this._requestsChannel.unsubscribe(); this._requestsChannel = null; }
    if (this._myOffersChannel) { this._myOffersChannel.unsubscribe(); this._myOffersChannel = null; }
    if (this._tripBoardingChannel) { this._tripBoardingChannel.unsubscribe(); this._tripBoardingChannel = null; }
    if (this._passengerLiveChannel) { this._passengerLiveChannel.unsubscribe(); this._passengerLiveChannel = null; }
    if (this._driverBroadcastChannel) { try { this._driverBroadcastChannel.unsubscribe(); } catch {} this._driverBroadcastChannel = null; }
    if (this._locationChannel) { this._locationChannel.unsubscribe(); this._locationChannel = null; }
    if (this._visibilityHandler) { document.removeEventListener('visibilitychange', this._visibilityHandler); this._visibilityHandler = null; }
  }

  /**
   * Inicia watchPosition continuo para pasajeros.
   * Rechaza lecturas con precisión > 50m (red/IP).
   * Solo actualiza la proximidad de búsqueda si el usuario se movió > 500 m.
   * Throttle de 5 s para no spamear el GPS.
   */
  private _startPassengerWatch(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    if (!navigator.geolocation) return;
    if (this._passengerWatchId !== null) return; // ya activo

    this._passengerWatchId = navigator.geolocation.watchPosition(
      (pos) => {
        // Ignorar solo lecturas de red/IP (>300m). ≤300m = GPS real aunque sea interior.
        if (pos.coords.accuracy > 300) return;

        const now = Date.now();
        // Throttle: ignorar actualizaciones más rápidas de 5 s (excepto el primer fix real)
        if (this._gpsRealFix && now - this._locationThrottleTs < 5000) return;
        this._locationThrottleTs = now;

        const { latitude: lat, longitude: lng } = pos.coords;

        // Solo actuar si el usuario se movió más de 20 m (una vez que ya tenemos fix real)
        if (this._gpsRealFix) {
          const moved = this._distMeters(
            this._lastNotifiedLat || this._currentLat,
            this._lastNotifiedLng || this._currentLng,
            lat, lng
          );
          if (moved < 20 && this._lastNotifiedLat !== 0) return;
        }

        // Actualizar posición global con cualquier lectura GPS real (≤300m)
        this._gpsRealFix      = true;
        this._currentLat      = lat;
        this._currentLng      = lng;
        this._lastNotifiedLat = lat;
        this._lastNotifiedLng = lng;
        this.gpsStatus.set('granted');

        // Centrar mapa en nueva posición si está visible (solo con buena precisión ≤50m)
        if (pos.coords.accuracy <= 50 && this._map && this.passengerSection() === null) {
          this._map.easeTo({ center: [lng, lat], duration: 800 });
          this._userMarker?.setLngLat([lng, lat]);
        }

        // Mostrar micro-indicador "Actualizando zona..." por 1 s
        this.locationUpdating.set(true);
        this.cdr.markForCheck();
        setTimeout(() => { this.locationUpdating.set(false); this.cdr.markForCheck(); }, 1000);

      },
      (err) => {
        // GPS desactivado/denegado — mantener última ubicación, no interrumpir
        if (err.code === 1 /* PERMISSION_DENIED */) {
          this.gpsStatus.set('denied');
          this.cdr.markForCheck();
        }
        // En cualquier error se mantiene _currentLat/_currentLng anteriores
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 30000 }
    );
  }

  /** Detiene el watchPosition del pasajero y libera recursos */
  private _stopPassengerWatch(): void {
    if (this._passengerWatchId !== null) {
      navigator.geolocation.clearWatch(this._passengerWatchId);
      this._passengerWatchId = null;
    }
  }

  /** Suscribirse a cambios en ubicación de conductores (para el mapa del pasajero) */
  private _subscribeToDriverLocations(): void {
    this._unsubscribeLocations();
    this._locationChannel = this.supabase
      .channel('driver-locations-realtime')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'ag_driver_locations',
      }, (payload: any) => {
        if (!this._map) return;
        const mapboxgl = (window as any).mapboxgl;
        if (!mapboxgl) return;

        const record = payload.new as { driver_id: string; lat: number; lng: number; heading: number } | undefined;
        if (!record) return;

        // Solo mostrar conductores dentro de 50km del pasajero (si GPS ya está disponible)
        if (this.gpsStatus() === 'granted' && record.lat && record.lng) {
          const distM = this._distMeters(this._currentLat, this._currentLng, record.lat, record.lng);
          if (distM > 50_000) {
            // Si ya tenía marcador, quitarlo
            const farIdx = this._vehicleMarkers.findIndex((m: any) => m._agDriverId === record.driver_id);
            if (farIdx >= 0) {
              try { this._vehicleMarkers[farIdx].remove(); } catch {}
              this._vehicleMarkers.splice(farIdx, 1);
              this._markerLastSeen.delete(record.driver_id);
            }
            return;
          }
        }

        this._markerLastSeen.set(record.driver_id, Date.now());

        // Buscar marcador existente o crear uno nuevo
        const existingIdx = this._vehicleMarkers.findIndex((m: any) => m._agDriverId === record.driver_id);
        if (existingIdx >= 0) {
          // Actualizar posición del marcador existente
          this._vehicleMarkers[existingIdx].setLngLat([record.lng, record.lat]);
        } else {
          // Crear nuevo marcador
          const el = this._carElement(record.heading ?? 0, '#10b981');
          const marker = new mapboxgl.Marker({ element: el, anchor: 'center' })
            .setLngLat([record.lng, record.lat])
            .addTo(this._map);
          (marker as any)._agDriverId = record.driver_id;
          this._vehicleMarkers.push(marker);
        }

        // Si fue DELETE, remover marcador
        if (payload.eventType === 'DELETE' && payload.old) {
          const delId = (payload.old as any).driver_id;
          const idx = this._vehicleMarkers.findIndex((m: any) => m._agDriverId === delId);
          if (idx >= 0) {
            try { this._vehicleMarkers[idx].remove(); } catch {}
            this._vehicleMarkers.splice(idx, 1);
            this._markerLastSeen.delete(delId);
          }
        }

        this.noDriversNearby.set(this._vehicleMarkers.length === 0);
        this.cdr.markForCheck();
      })
      .subscribe();

    // Limpiar marcadores stale cada 60s (sin actualización en 90s = conductor desconectado)
    if (this._staleMarkerTimer) clearInterval(this._staleMarkerTimer);
    this._staleMarkerTimer = setInterval(() => {
      const cutoff = Date.now() - 90_000;
      this._vehicleMarkers = this._vehicleMarkers.filter(m => {
        const id: string = (m as any)._agDriverId;
        const lastSeen = this._markerLastSeen.get(id) ?? 0;
        if (lastSeen < cutoff) {
          try { m.remove(); } catch {}
          this._markerLastSeen.delete(id);
          return false;
        }
        return true;
      });
      this.noDriversNearby.set(this._vehicleMarkers.length === 0);
      this.cdr.markForCheck();
    }, 60_000);
  }

  private _unsubscribeLocations(): void {
    if (this._locationChannel) {
      this._locationChannel.unsubscribe();
      this._locationChannel = null;
    }
    if (this._staleMarkerTimer) {
      clearInterval(this._staleMarkerTimer);
      this._staleMarkerTimer = null;
    }
  }

  // ── Mapbox loader (CDN con caché) ──────────────────────────────
  private loadMapbox(): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) return Promise.resolve();
    const w = window as any;
    if (w.mapboxgl) return Promise.resolve();
    if (this._mapboxPromise) return this._mapboxPromise;

    this._mapboxPromise = new Promise<void>((resolve, reject) => {
      // CSS
      if (!document.querySelector('link[href*="mapbox-gl.css"]')) {
        const link = document.createElement('link');
        link.rel  = 'stylesheet';
        link.href = 'https://api.mapbox.com/mapbox-gl-js/v2.15.0/mapbox-gl.css';
        document.head.appendChild(link);
      }
      // JS
      const script = document.createElement('script');
      script.src = 'https://api.mapbox.com/mapbox-gl-js/v2.15.0/mapbox-gl.js';
      script.onload = () => resolve();
      script.onerror = () => {
        this._mapboxPromise = null;
        reject(new Error('No se pudo cargar Mapbox'));
      };
      document.head.appendChild(script);
    });
    return this._mapboxPromise;
  }


  // Reverse geocoding directo vía Mapbox (sin Edge Function)
  private async _reverseGeocodeDirect(lat: number, lng: number): Promise<string> {
    const cached = this._getCachedAddress(lat, lng);
    if (cached) return cached.address;
    try {
      const params = new URLSearchParams({
        access_token: this.MAPBOX_TOKEN, language: 'es', limit: '1',
        types: 'address,neighborhood,locality,poi,place',
      });
      const res  = await fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?${params}`);
      const json = await res.json();
      const feat = json.features?.[0];
      if (!feat) return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
      const ctx       = feat.context ?? [];
      const ctxBarrio = ctx.find((c: any) => c.id?.startsWith('neighborhood.') || c.id?.startsWith('locality.') || c.id?.startsWith('district.'));
      const barrioText = ctxBarrio?.text ?? (feat.id?.startsWith('neighborhood.') || feat.id?.startsWith('locality.') ? feat.text : null);
      const ctxCity   = ctx.find((c: any) => c.id?.startsWith('place.'));
      const cityText  = ctxCity?.text ?? (feat.id?.startsWith('place.') ? feat.text : null);
      const isStreet  = feat.id?.startsWith('address.') || feat.id?.startsWith('poi.');
      const streetText = isStreet ? (feat.address ? `${feat.text} ${feat.address}` : feat.text) : null;
      const parts = [streetText, barrioText, cityText].filter(Boolean);
      if (parts.length > 0) return parts.join(', ');
      // Fallback limpiando código postal del place_name
      return (feat.place_name ?? `${lat.toFixed(5)}, ${lng.toFixed(5)}`)
        .split(',').filter((p: string) => !/^\s*\d{4,6}\s*$/.test(p)).join(',').trim();
    } catch { return `${lat.toFixed(5)}, ${lng.toFixed(5)}`; }
  }

  // ── GPS + mapa ─────────────────────────────────────────────────
  async initGpsAndMap(containerId: string) {
    if (!isPlatformBrowser(this.platformId)) return;

    this.gpsStatus.set('requesting');

    let lat = this.DEFAULT_LAT;
    let lng = this.DEFAULT_LNG;

    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
        let bestPos: GeolocationPosition | null = null;
        let resolved = false;

        const done = (p: GeolocationPosition) => {
          if (resolved) return;
          resolved = true;
          navigator.geolocation.clearWatch(watchId);
          clearTimeout(hardTimer);
          resolve(p);
        };

        const watchId = navigator.geolocation.watchPosition(
          (p) => {
            if (!bestPos || p.coords.accuracy < bestPos.coords.accuracy) {
              bestPos = p;
            }
            // Aceptar de inmediato con buena precisión (≤50m). Si no, esperar timeout con la mejor lectura.
            if (p.coords.accuracy <= 50) {
              done(p);
            }
          },
          (err) => {
            if (resolved) return;
            resolved = true;
            navigator.geolocation.clearWatch(watchId);
            clearTimeout(hardTimer);
            // Usar mejor lectura si tiene precisión GPS real (≤300m), aunque no sea perfecta
            if (bestPos && bestPos.coords.accuracy <= 300) resolve(bestPos);
            else reject(err);
          },
          { enableHighAccuracy: true, timeout: 30000, maximumAge: 5000 }
        );

        // Hard timeout de 30s: aceptar cualquier lectura GPS real (≤300m)
        const hardTimer = setTimeout(() => {
          if (resolved) return;
          resolved = true;
          navigator.geolocation.clearWatch(watchId);
          if (bestPos && bestPos.coords.accuracy <= 300) resolve(bestPos);
          else reject(new Error('GPS timeout'));
        }, 30000);
      });

      lat = pos.coords.latitude;
      lng = pos.coords.longitude;
      this._gpsRealFix = true;
      this.gpsStatus.set('granted');
      this.gpsAccuracy.set(Math.round(pos.coords.accuracy));
    } catch (e: any) {
      if (e?.code === 1 /* PERMISSION_DENIED */) {
        this.gpsStatus.set('denied');
      } else {
        // Timeout sin lectura precisa — mostrar mapa igualmente para no bloquear al usuario
        this.gpsStatus.set('granted');
      }
    }

    this._currentLat = lat;
    this._currentLng = lng;

    // Geocodificación inversa en paralelo con la carga del mapa
    this._reverseGeocode(lat, lng);

    await this.loadMapbox();
    await new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(() => r())));
    this._createMap(containerId, lat, lng);
  }

  retryGps(containerId: string) {
    this._destroyMap();
    this.currentAddress.set('');
    this.initGpsAndMap(containerId);
  }

  subscribeDriverNotification() {
    if (!('Notification' in window)) return;
    Notification.requestPermission().then(permission => {
      if (permission === 'granted') {
        const lat = this._currentLat;
        const lng = this._currentLng;
        const sb = getMoviClient();
        if (this._gpsRealFix && lat && lng) {
          sb.from('ag_driver_notifications').upsert({
            user_phone: this.agProfile()?.phone ?? '',
            lat, lng, radius_km: 2, active: true,
          }, { onConflict: 'user_phone' }).then(() => {});
        }
        new Notification('Movi', { body: 'Te notificaremos cuando haya un conductor cerca.', icon: '/favicon.ico' });
      }
    });
  }

  // ── Dirección ──────────────────────────────────────────────────
  openOriginEdit() {
    this.addressQuery.set('');
    this.addressSuggestions.set([]);
    this.originEditOpen.set(true);
    setTimeout(() => (document.getElementById('origin-edit-input') as HTMLInputElement | null)?.focus(), 60);
  }

  openAddressEdit() {
    this.addressQuery.set('');
    this.addressSuggestions.set([]);
    this.addressEditMode.set(true);
    this._loadRecentOrigins();
    // Focus input after render
    setTimeout(() => {
      const el = document.querySelector<HTMLInputElement>('[placeholder="Busca tu dirección o lugar..."]');
      el?.focus();
    }, 50);
  }

  closeAddressEdit() {
    this.addressEditMode.set(false);
    this.addressQuery.set('');
    this.addressSuggestions.set([]);
  }

  clearAddressQuery() {
    this._addrRaw = '';
    this.addressQuery.set('');
    this.addrInputHasText.set(false);
    this.addressSuggestions.set([]);
    ['[placeholder="Escribe tu dirección exacta de recogida..."]', '#origin-edit-input',
     '[placeholder="Escribe tu punto de salida..."]', '[placeholder="Escribe o pega tu punto de salida..."]'].forEach(sel => {
      const el = document.querySelector<HTMLInputElement>(sel);
      if (el) { el.value = ''; el.focus(); }
    });
    if (this.addrInputRef?.nativeElement) this.addrInputRef.nativeElement.value = '';
  }

  handlePaste(event: ClipboardEvent, type: 'address' | 'trip') {
    // El evento paste llega ANTES de que el browser inserte el texto en el input,
    // así que esperamos un tick para leer el valor final.
    setTimeout(() => {
      const val = (event.target as HTMLInputElement).value;
      if (type === 'address') this.onAddressInput(val);
      else this.onTripQueryInput(val);
    }, 0);
  }

  async pasteClipboard(type: 'address' | 'trip') {
    try {
      const text = (await navigator.clipboard.readText()).trim();
      if (!text) return;
      if (type === 'address') this.onAddressInput(text);
      else this.onTripQueryInput(text);
    } catch { /* permiso denegado o API no disponible */ }
  }

  onAddressInput(query: string) {
    // CERO signal updates aquí — cualquier set() dispara re-render que confunde el IME de Android
    this._addrRaw = query;
    clearTimeout(this._addressDebounceTimer);
    if (query.trim().length < 3) {
      if (this.addressSuggestions().length) {
        this._addressDebounceTimer = setTimeout(() => this.addressSuggestions.set([]), 0);
      }
      return;
    }
    this._addressDebounceTimer = setTimeout(() => {
      this.addressQuery.set(query);
      this._searchAddressSuggestions(query);
    }, 350);
  }

  saveManualAddress() {
    const q = (this._addrRaw || this.addressQuery()).trim();
    if (!q) return;
    this.currentAddress.set(q);
    this.addressQuery.set(q);
    this.currentNeighborhood.set('');
    this._saveLocationAddress(this._currentLat, this._currentLng, q, '');
    this.closeAddressEdit();
    this.originEditOpen.set(false);
    this.addrSavedToast.set(true);
    setTimeout(() => this.addrSavedToast.set(false), 2500);
    this.cdr.markForCheck();
  }

  private readonly _LOC_ADDR_KEY = 'movi_location_addr_cache';

  private _saveLocationAddress(lat: number, lng: number, address: string, neighborhood: string): void {
    if (!isPlatformBrowser(this.platformId) || !lat || !lng || !address) return;
    try {
      const raw = localStorage.getItem(this._LOC_ADDR_KEY);
      const list: { lat: number; lng: number; address: string; neighborhood: string }[] = raw ? JSON.parse(raw) : [];
      // Reemplazar si ya hay una guardada a menos de 80m, sino agregar al inicio
      const idx = list.findIndex(e => this._distKm(lat, lng, e.lat, e.lng) * 1000 < 80);
      if (idx >= 0) { list[idx] = { lat, lng, address, neighborhood }; }
      else { list.unshift({ lat, lng, address, neighborhood }); }
      localStorage.setItem(this._LOC_ADDR_KEY, JSON.stringify(list.slice(0, 30)));
    } catch {}
  }

  private _getCachedAddress(lat: number, lng: number): { address: string; neighborhood: string } | null {
    if (!isPlatformBrowser(this.platformId) || !lat || !lng) return null;
    try {
      const raw = localStorage.getItem(this._LOC_ADDR_KEY);
      if (!raw) return null;
      const list: { lat: number; lng: number; address: string; neighborhood: string }[] = JSON.parse(raw);
      const match = list.find(e => this._distKm(lat, lng, e.lat, e.lng) * 1000 < 80);
      return match ?? null;
    } catch { return null; }
  }

  private async _searchAddressSuggestions(query: string) {
    if (!isPlatformBrowser(this.platformId)) return;

    // Google Places + Nominatim en paralelo para mejor cobertura de barrios
    const [sdkOk, nomSugs] = await Promise.all([
      this._loadGoogleMapsSDK(),
      this._fetchNominatimSuggestions(query),
    ]);

    let googleSugs: { place_id: string; text: string; place_name: string }[] = [];
    if (sdkOk) {
      if (!this._autocompleteService) this._initGooglePlaces();
      googleSugs = await new Promise<typeof googleSugs>(resolve => {
        const request: any = {
          input: query,
          componentRestrictions: { country: 'co' },
          sessionToken: this._placesSessionToken,
        };
        if (this._gpsRealFix) {
          const gmaps = (window as any).google.maps;
          const d = 0.1;
          request.bounds = new gmaps.LatLngBounds(
            new gmaps.LatLng(this._currentLat - d, this._currentLng - d),
            new gmaps.LatLng(this._currentLat + d, this._currentLng + d)
          );
        }
        this._autocompleteService.getPlacePredictions(request, (preds: any[], status: string) => {
          if (status !== 'OK' || !preds?.length) { resolve([]); return; }
          const city = this._cityFromGps.toLowerCase();
          const local = city ? preds.filter(p => p.description?.toLowerCase().includes(city)) : preds;
          resolve((local.length > 0 ? local : preds).slice(0, 5).map((p: any) => ({
            place_id:   p.place_id,
            text:       p.structured_formatting?.main_text ?? p.description,
            place_name: p.structured_formatting?.secondary_text ?? '',
          })));
        });
      });
    }

    // Fusionar: Google primero, Nominatim llena los huecos (barrios que Google no conoce)
    const merged = [...googleSugs];
    for (const n of nomSugs) {
      if (merged.length >= 6) break;
      const key = n.text.toLowerCase().split(',')[0].trim();
      if (!merged.some(g => g.text.toLowerCase().includes(key) || key.includes(g.text.toLowerCase()))) {
        merged.push({ place_id: n.place_id, text: n.text, place_name: n.place_name });
      }
    }

    this.addressSuggestions.set(merged.slice(0, 6));
    this.addressNoResults.set(merged.length === 0);
    this.cdr.markForCheck();
  }

  /** Busca en Nominatim OSM — mejor cobertura de barrios colombianos */
  private async _fetchNominatimSuggestions(query: string): Promise<any[]> {
    try {
      const params = new URLSearchParams({
        q: query, format: 'json', countrycodes: 'co', limit: '6', addressdetails: '1',
      });
      if (this._gpsRealFix) {
        const d = 0.15;
        params.set('viewbox', `${this._currentLng - d},${this._currentLat + d},${this._currentLng + d},${this._currentLat - d}`);
        params.set('bounded', '1');
      }
      const res  = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
        headers: { 'Accept-Language': 'es' },
      });
      const data = await res.json();
      return (data ?? []).slice(0, 6).map((r: any) => {
        const addr = r.address ?? {};
        const barrio = addr.neighbourhood ?? addr.suburb ?? addr.quarter ?? addr.hamlet ?? null;
        const city   = addr.city ?? addr.town ?? addr.municipality ?? addr.village ?? null;
        const placeName = [barrio, city].filter(Boolean).join(', ') ||
          r.display_name.split(',').filter((p: string) => !/^\s*\d{4,6}\s*$/.test(p)).slice(1, 3).join(',').trim();
        return {
          place_id: `nom_${r.place_id}`,
          text:     r.display_name.split(',')[0].trim(),
          place_name: placeName,
          lat: parseFloat(r.lat), lng: parseFloat(r.lon),
          distanceKm: null, _rawTypes: [] as string[],
        };
      });
    } catch { return []; }
  }



  /** Activa el modo pin-drop en el mapa para seleccionar destino */
  useMapPin(forTrip = false) {
    this.closeAddressEdit();
    this.originEditOpen.set(false);
    if (forTrip) {
      this.tripOpen.set(false);
      this.tripQuery.set('');
      this.tripSuggestions.set([]);
      this.tripPinDrop.set(true);
      this._enableMapPinDrop();
    }
  }

  private _mapPinHandler: ((e: any) => void) | null = null;
  private _pinDropMarker: any = null;

  // ── Google Maps / Places ──────────────────────────────────────────────────
  private _gmapsPromise: Promise<boolean> | null = null;
  private _autocompleteService: any = null;
  private _placesService: any = null;
  private _placesSessionToken: any = null;
  private _tripDebounceTimer: any = null;

  private _enableMapPinDrop() {
    if (!this._map) return;
    this._map.getCanvas().style.cursor = 'crosshair';
    this._mapPinHandler = (e: any) => this._onMapPinClick(e.lngLat.lat, e.lngLat.lng);
    this._map.once('click', this._mapPinHandler);
  }

  private async _onMapPinClick(lat: number, lng: number) {
    if (!this._map) return;
    this._map.getCanvas().style.cursor = '';
    this.tripPinDrop.set(false);

    // Marcador provisional mientras se hace reverse geocode
    const mapboxgl = (window as any).mapboxgl;
    if (this._pinDropMarker) { try { this._pinDropMarker.remove(); } catch {} }
    if (mapboxgl) {
      const el = document.createElement('div');
      el.innerHTML = `<div style="width:32px;height:32px;background:#4f46e5;border:3px solid #fff;border-radius:50%;box-shadow:0 4px 12px rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center"><span class='material-symbols-outlined' style='color:#fff;font-size:16px'>place</span></div>`;
      this._pinDropMarker = new mapboxgl.Marker({ element: el, anchor: 'center' })
        .setLngLat([lng, lat]).addTo(this._map);
    }

    const name = await this._reverseGeocodeDirect(lat, lng);

    if (this._pinDropMarker) { try { this._pinDropMarker.remove(); } catch {} this._pinDropMarker = null; }

    this.tripDest.set({ name, lat, lng });
    this._saveRecentDest({ name, lat, lng });
    this.cdr.markForCheck();
    this._drawRoute(lng, lat);
  }

  cancelPinDrop() {
    this.tripPinDrop.set(false);
    if (this._map) {
      this._map.getCanvas().style.cursor = '';
      if (this._mapPinHandler) { this._map.off('click', this._mapPinHandler); this._mapPinHandler = null; }
    }
  }

  async selectAddress(feature: any) {
    this.closeAddressEdit();
    this.originEditOpen.set(false);
    if (!feature?.place_id) return;
    try {
      if (!this._placesService) this._initGooglePlaces();
      const gmaps = (window as any).google?.maps;
      if (!gmaps) return;
      const pos = await new Promise<{ lat: number; lng: number }>((resolve, reject) => {
        this._placesService.getDetails(
          { placeId: feature.place_id, fields: ['geometry'] },
          (res: any, status: string) => {
            if (status !== 'OK' || !res?.geometry?.location) { reject(status); return; }
            resolve({ lat: res.geometry.location.lat(), lng: res.geometry.location.lng() });
          }
        );
      });
      this._currentLat  = pos.lat;
      this._currentLng  = pos.lng;
      this._gpsRealFix  = true;
      this._lastNotifiedLat = pos.lat;
      this._lastNotifiedLng = pos.lng;
      const addrName = `${feature.text}${feature.place_name ? ', ' + feature.place_name : ''}`;
      this.currentAddress.set(addrName);
      this.currentNeighborhood.set('');
      this._saveRecentOrigin({ name: addrName, lat: pos.lat, lng: pos.lng });
      this._saveLocationAddress(pos.lat, pos.lng, addrName, '');
      if (this._map) {
        this._map.easeTo({ center: [pos.lng, pos.lat], zoom: 16, duration: 800 });
        this._userMarker?.setLngLat([pos.lng, pos.lat]);
      }
      this.cdr.markForCheck();
    } catch (e) { console.warn('selectAddress error', e); }
  }

  private _saveRecentDest(dest: { name: string; lat: number; lng: number }) {
    if (typeof localStorage === 'undefined') return;
    try {
      const list: typeof dest[] = JSON.parse(localStorage.getItem('movi_recent_dest') ?? '[]');
      const filtered = list.filter(d => d.name !== dest.name);
      const updated = [dest, ...filtered].slice(0, 5);
      localStorage.setItem('movi_recent_dest', JSON.stringify(updated));
      this.recentDests.set(updated);
    } catch {}
  }

  private _saveRecentOrigin(origin: { name: string; lat: number; lng: number }) {
    if (typeof localStorage === 'undefined') return;
    try {
      const list: typeof origin[] = JSON.parse(localStorage.getItem('movi_recent_origin') ?? '[]');
      const filtered = list.filter(o => o.name !== origin.name);
      const updated = [origin, ...filtered].slice(0, 5);
      localStorage.setItem('movi_recent_origin', JSON.stringify(updated));
      this.recentOrigins.set(updated);
    } catch {}
  }

  private _loadRecentDests() {
    if (typeof localStorage === 'undefined') return;
    try {
      const list = JSON.parse(localStorage.getItem('movi_recent_dest') ?? '[]');
      this.recentDests.set(list);
    } catch {}
  }

  private _loadRecentOrigins() {
    if (typeof localStorage === 'undefined') return;
    try {
      const list = JSON.parse(localStorage.getItem('movi_recent_origin') ?? '[]');
      this.recentOrigins.set(list);
    } catch {}
  }

  selectRecentDest(r: { name: string; lat: number; lng: number }) {
    this.tripOpen.set(false);
    this.tripQuery.set('');
    this.tripSuggestions.set([]);
    this.tripDest.set(r);
    this._saveRecentDest(r);
    this.cdr.markForCheck();
    this._drawRoute(r.lng, r.lat);
  }

  selectRecentOrigin(r: { name: string; lat: number; lng: number }) {
    this.closeAddressEdit();
    this.originEditOpen.set(false);
    this._currentLat = r.lat;
    this._currentLng = r.lng;
    this._gpsRealFix = true;
    this._lastNotifiedLat = r.lat;
    this._lastNotifiedLng = r.lng;
    this.currentAddress.set(r.name);
    this.currentNeighborhood.set('');
    this._saveRecentOrigin(r);
    if (this._map) {
      this._map.easeTo({ center: [r.lng, r.lat], zoom: 16, duration: 800 });
      this._userMarker?.setLngLat([r.lng, r.lat]);
    }
    this.cdr.markForCheck();
  }


  private async _reverseGeocode(lat: number, lng: number) {
    // Si el usuario ya escribió una dirección en esta ubicación, usarla directamente
    const cached = this._getCachedAddress(lat, lng);
    if (cached) {
      this.currentAddress.set(cached.address);
      if (cached.neighborhood) this.currentNeighborhood.set(cached.neighborhood);
      this.addressLoading.set(false);
      this.cdr.markForCheck();
      return;
    }
    this.addressLoading.set(true);
    try {
      // Request 1: Mapbox para calle + ciudad (confiable)
      // Request 2: Nominatim reverse para barrio (mejor cobertura en Colombia)
      const [dataMapbox, dataNom] = await Promise.all([
        fetch(
          `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json` +
          `?access_token=${this.MAPBOX_TOKEN}&language=es&types=address,poi,place&limit=1`
        ).then(r => r.json()).catch(() => ({ features: [] })),
        fetch(
          `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`,
          { headers: { 'Accept-Language': 'es' } }
        ).then(r => r.json()).catch(() => null),
      ]);

      const feat = dataMapbox.features?.[0];
      const ctx  = feat?.context ?? [];

      // Barrio: Nominatim tiene mejor cobertura de barrios en ciudades colombianas
      const nomAddr   = dataNom?.address ?? {};
      const barrioText: string | null =
        nomAddr.neighbourhood ?? nomAddr.suburb ?? nomAddr.quarter ?? nomAddr.hamlet ??
        ctx.find((c: any) => c.id?.startsWith('neighborhood.') || c.id?.startsWith('locality.') || c.id?.startsWith('district.'))?.text ??
        null;
      this.currentNeighborhood.set(barrioText ?? '');

      // Ciudad: Mapbox primero, Nominatim como fallback
      const ctxCity  = ctx.find((c: any) => c.id?.startsWith('place.'));
      const cityText: string | null =
        ctxCity?.text ??
        (feat?.id?.startsWith('place.') ? feat.text : null) ??
        nomAddr.city ?? nomAddr.town ?? nomAddr.municipality ?? null;

      // Calle: del feature Mapbox
      const isStreet   = feat?.id?.startsWith('address.') || feat?.id?.startsWith('poi.');
      const streetText: string | null = isStreet
        ? (feat.address ? `${feat.text} ${feat.address}` : feat.text)
        : (nomAddr.road ? (nomAddr.house_number ? `${nomAddr.road} ${nomAddr.house_number}` : nomAddr.road) : null);

      // Dirección principal: calle + ciudad (SIN barrio para evitar duplicado en subtítulo)
      // Si no hay calle, usar barrio como primera línea
      const mainParts = streetText
        ? [streetText, cityText].filter(Boolean)
        : [barrioText, cityText].filter(Boolean);

      if (mainParts.length > 0) {
        this.currentAddress.set(mainParts.join(', '));
      } else {
        const fallbackName = feat?.place_name ?? dataNom?.display_name ?? '';
        this.currentAddress.set(
          fallbackName.split(',').filter((p: string) => !/^\s*\d{4,6}\s*$/.test(p)).slice(0, 3).join(',').trim()
        );
      }
      // Persistir la dirección detectada para esta ubicación GPS
      if (this.currentAddress()) {
        this._saveLocationAddress(lat, lng, this.currentAddress(), this.currentNeighborhood());
      }

      // Guardar ciudad para filtrar sugerencias de búsqueda
      if (cityText) this._cityFromGps = cityText;

      // Actualizar ciudad del perfil si el conductor cambió de ciudad
      if (cityText) {
        const profile = this.agProfile();
        if (profile && profile.city !== cityText) {
          this.agService.updateUserCity(profile.id, cityText).catch(() => {});
          this.agProfile.update(p => p ? { ...p, city: cityText! } : p);
        }
      }
    } catch { this.currentAddress.set(''); }
    this.addressLoading.set(false);
    this.cdr.markForCheck();
  }

  private _createMap(containerId: string, lat: number, lng: number) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const mapboxgl = (window as any).mapboxgl;
    if (!mapboxgl) return;

    // Asegurar dimensiones explícitas antes de crear el mapa
    if (!container.offsetHeight) {
      container.style.height = '520px';
    }
    if (!container.offsetWidth) {
      container.style.width = '100%';
    }

    this._destroyMap();

    mapboxgl.accessToken = this.MAPBOX_TOKEN;
    this._map = new mapboxgl.Map({
      container,
      style:   'mapbox://styles/mapbox/dark-v11',
      center:  [lng, lat],
      zoom:    15,
      attributionControl: false,
      logoPosition:       'bottom-left',
      failIfMajorPerformanceCaveat: false,
      dragRotate:  false,
      pitchWithRotate: false,
    });

    // Deshabilitar rotación táctil
    this._map.touchZoomRotate?.disableRotation?.();

    // Saturación reducida al 40% (−60%) para no competir con UI
    container.style.filter = 'saturate(0.4)';

    // Ocultar logo de Mapbox
    const logoEl = container.querySelector?.('.mapboxgl-ctrl-logo') as HTMLElement | null;
    if (logoEl) logoEl.style.display = 'none';

    // Controles custom minimalistas (zoom) — esquina inferior derecha del contenedor
    if (!container.querySelector('.ag-zoom-ctrl')) {
      const zoomBox = document.createElement('div');
      zoomBox.className = 'ag-zoom-ctrl';
      zoomBox.style.cssText = `
        position:absolute;bottom:80px;right:12px;z-index:10;
        display:flex;flex-direction:column;gap:4px;
      `;
      const btnStyle = `
        width:36px;height:36px;border-radius:10px;border:none;cursor:pointer;
        background:rgba(18,18,18,0.85);backdrop-filter:blur(8px);
        color:#E0E0E0;font-size:20px;font-weight:300;
        display:flex;align-items:center;justify-content:center;
        box-shadow:0 2px 8px rgba(0,0,0,0.45);
        font-family:'Inter','SF Pro Display',sans-serif;letter-spacing:-0.02em;
        transition:background 0.15s;
      `;
      const btnIn  = document.createElement('button');
      const btnOut = document.createElement('button');
      btnIn.style.cssText  = btnStyle;
      btnOut.style.cssText = btnStyle;
      btnIn.textContent  = '+';
      btnOut.textContent = '−';
      btnIn.addEventListener('click',  () => this._map?.zoomIn({ duration: 350 }));
      btnOut.addEventListener('click', () => this._map?.zoomOut({ duration: 350 }));
      btnIn.addEventListener('mouseover',  () => { btnIn.style.background  = 'rgba(123,47,255,0.8)'; });
      btnIn.addEventListener('mouseout',   () => { btnIn.style.background  = 'rgba(18,18,18,0.85)'; });
      btnOut.addEventListener('mouseover', () => { btnOut.style.background = 'rgba(123,47,255,0.8)'; });
      btnOut.addEventListener('mouseout',  () => { btnOut.style.background = 'rgba(18,18,18,0.85)'; });
      zoomBox.appendChild(btnIn);
      zoomBox.appendChild(btnOut);
      container.style.position = 'relative';
      container.appendChild(zoomBox);
    }

    this.noDriversNearby.set(true);

    this._map.once('load', () => {
      const m = this._map!;

      // ── Paleta premium ──────────────────────────────────────────
      const safeSet = (id: string, prop: string, val: any) => {
        try { if (m.getLayer(id)) m.setPaintProperty(id, prop, val); } catch {}
      };

      // Fondo
      safeSet('background', 'background-color', '#121212');

      // Agua
      ['water', 'waterway-river-canal', 'waterway'].forEach(id =>
        safeSet(id, 'fill-color', '#0D1B2A'));

      // Vías principales
      ['road-motorway-trunk', 'road-primary', 'road-primary-case',
       'road-motorway-trunk-case', 'bridge-motorway-trunk', 'bridge-primary'].forEach(id =>
        safeSet(id, 'line-color', '#333333'));

      // Vías secundarias / locales
      ['road-secondary-tertiary', 'road-street', 'road-service-link-track',
       'road-secondary-tertiary-case', 'road-street-case',
       'bridge-secondary-tertiary', 'bridge-street',
       'tunnel-motorway-trunk', 'tunnel-primary',
       'tunnel-secondary-tertiary', 'tunnel-street'].forEach(id =>
        safeSet(id, 'line-color', '#2A2A2A'));

      // Labels road — propiedades exactas
      try { m.setPaintProperty('road-label', 'text-size',       12);        } catch {}
      try { m.setPaintProperty('road-label', 'text-color',      '#A0A0A0'); } catch {}
      try { m.setPaintProperty('road-label', 'text-halo-color', '#121212'); } catch {}
      try { m.setPaintProperty('road-label', 'text-halo-width', 1.5);       } catch {}

      // Labels resto de capas símbolo
      m.getStyle().layers.forEach((layer: any) => {
        if (layer.type === 'symbol' && layer.id !== 'road-label') {
          try { m.setPaintProperty(layer.id, 'text-color',      '#E0E0E0'); } catch {}
          try { m.setPaintProperty(layer.id, 'text-halo-color', '#121212'); } catch {}
        }
      });

      // Cargar vehículos cuando el mapa esté completamente renderizado
      m.once('idle', () => this._loadVehicleMarkers(lat, lng));

      // ── Marcador de posición del usuario ────────────────────────
      const el = document.createElement('div');
      el.style.cssText = `
        width:36px;height:36px;border-radius:50%;
        background:radial-gradient(circle,#7B2FFF 0%,rgba(123,47,255,0.3) 60%,transparent 70%);
        border:2.5px solid #7B2FFF;
        box-shadow:0 0 0 4px rgba(123,47,255,0.2),0 4px 12px rgba(123,47,255,0.4);
        display:flex;align-items:center;justify-content:center;
        animation:ag-pulse 1.8s ease-out infinite;
      `;
      const dot = document.createElement('div');
      dot.style.cssText = `
        width:12px;height:12px;border-radius:50%;
        background:#7B2FFF;border:2.5px solid #fff;
        box-shadow:0 2px 6px rgba(0,0,0,0.4);
      `;
      el.appendChild(dot);

      if (!document.getElementById('ag-map-styles')) {
        const s = document.createElement('style');
        s.id = 'ag-map-styles';
        s.textContent = `
          @keyframes ag-pulse {
            0%   { box-shadow:0 0 0 0px rgba(123,47,255,0.45),0 4px 12px rgba(123,47,255,0.4); }
            100% { box-shadow:0 0 0 22px rgba(123,47,255,0),0 4px 12px rgba(123,47,255,0.1); }
          }
          .mapboxgl-ctrl-logo { display:none !important; }
          .mapboxgl-ctrl-attrib { display:none !important; }
        `;
        document.head.appendChild(s);
      }

      this._userMarker = new mapboxgl.Marker({ element: el, anchor: 'center', draggable: true })
        .setLngLat([lng, lat])
        .addTo(m);

      this._userMarker.on('dragend', () => {
        const lngLat = this._userMarker!.getLngLat();
        this._currentLat = lngLat.lat;
        this._currentLng = lngLat.lng;
        this._gpsRealFix = true; // el usuario confirmó su posición manualmente
        this._reverseGeocode(lngLat.lat, lngLat.lng);
      });

      m.resize();
      setTimeout(() => {
        if (this._map) {
          this._map.easeTo({ center: [lng, lat], zoom: 15, duration: 900, easing: (t: number) => 1 - Math.pow(1 - t, 3) });
        }
      }, 500);
    });
  }

  // ── Vehículos en el mapa ───────────────────────────────────────
  private async _loadVehicleMarkers(lat: number, lng: number) {
    if (!this._map) return;
    const mapboxgl = (window as any).mapboxgl;
    if (!mapboxgl) return;

    this._stopAnimation();
    this._vehicleMarkers.forEach(m => { try { m.remove(); } catch { /**/ } });
    this._vehicleMarkers = [];

    const realVehicles = await this.agService.getNearbyVehicles(lat, lng);

    if (realVehicles.length > 0) {
      // Conductores reales — marcadores estáticos
      realVehicles.forEach((v: any) => {
        const isMoto = v.vehicle_type?.toLowerCase().includes('moto');
        const color  = v.color ?? (isMoto ? '#06B6D4' : '#F59E0B');
        const el     = isMoto ? this._motoElement(v.heading, color) : this._carElement(v.heading, color);
        const m = new mapboxgl.Marker({ element: el, anchor: 'center' })
          .setLngLat([v.lng, v.lat]).addTo(this._map);
        this._vehicleMarkers.push(m);
      });
      return;
    }

    // ── Demo animado — rutas reales por calles (Mapbox Directions API) ──────
    const paths = await this._generateRoadPaths(lat, lng);

    const configs = [
      { isMoto: false, color: '#1D4ED8' },  // azul rey
      { isMoto: false, color: '#DC2626' },  // rojo
      { isMoto: false, color: '#D97706' },  // ámbar oscuro
      { isMoto: false, color: '#15803D' },  // verde oscuro
      { isMoto: false, color: '#1e293b' },  // grafito
      { isMoto: false, color: '#7C3AED' },  // violeta
      { isMoto: false, color: '#0F766E' },  // teal
      { isMoto: true,  color: '#EA580C' },  // naranja
      { isMoto: true,  color: '#0891B2' },  // cyan oscuro
      { isMoto: true,  color: '#16A34A' },  // verde
      { isMoto: true,  color: '#9333EA' },  // púrpura
      { isMoto: true,  color: '#BE185D' },  // rosa oscuro
    ];

    for (let i = 0; i < configs.length; i++) {
      const { isMoto, color } = configs[i];
      const path = paths[i % paths.length];
      // Cada vehículo arranca en un punto diferente del recorrido
      const segIdx = Math.floor((i / configs.length) * (path.length - 1));
      const h0 = this._segHeading(path, segIdx);
      const [lng0, lat0] = path[segIdx];

      const el = isMoto ? this._motoElement(h0, color) : this._carElement(h0, color);
      const marker = new mapboxgl.Marker({ element: el, anchor: 'center' })
        .setLngLat([lng0, lat0]).addTo(this._map!);

      this._vehicleMarkers.push(marker);
      this._vehicleStates.push({
        path,
        segIdx,
        t:       0,
        speed:   isMoto ? 0.00055 : 0.00040,
        forward: true,
        marker,
        heading: h0,
      });
    }

    this._startAnimation();
  }

  /**
   * Genera rutas reales por calles usando la API de Directions de Mapbox.
   * Cada vehículo recibe una ruta circular de 3 waypoints aleatorios cercanos
   * que sigue el trazado real de calles y avenidas.
   */
  private async _generateRoadPaths(lat: number, lng: number): Promise<[number, number][][]> {
    const paths: [number, number][][] = [];
    const angles = [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330];

    const fetchRoute = async (waypoints: [number, number][]): Promise<[number, number][]> => {
      const coords = waypoints.map(w => `${w[0]},${w[1]}`).join(';');
      const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${coords}`
        + `?geometries=geojson&overview=full&access_token=${this.MAPBOX_TOKEN}`;
      try {
        const res = await fetch(url);
        const data = await res.json();
        if (data.routes?.[0]?.geometry?.coordinates) {
          return data.routes[0].geometry.coordinates as [number, number][];
        }
      } catch { /* fallback below */ }
      return [];
    };

    // Generar 12 rutas circulares (ida y vuelta) por calles reales
    const promises = angles.map(async (angle, i) => {
      const rad1 = (angle * Math.PI) / 180;
      const rad2 = ((angle + 120) * Math.PI) / 180;
      const dist = 0.004 + Math.random() * 0.004; // 400-800m aprox
      const dist2 = 0.003 + Math.random() * 0.003;

      const wp1: [number, number] = [lng + Math.cos(rad1) * dist, lat + Math.sin(rad1) * dist];
      const wp2: [number, number] = [lng + Math.cos(rad2) * dist2, lat + Math.sin(rad2) * dist2];

      // Ruta circular: origen → wp1 → wp2 → origen
      const route = await fetchRoute([wp1, wp2, wp1]);
      return route.length >= 2 ? route : null;
    });

    const results = await Promise.all(promises);
    for (const r of results) {
      if (r) paths.push(r);
    }

    // Fallback: si no se obtuvo ninguna ruta, generar rectángulos simples
    if (paths.length === 0) {
      return this._generateFallbackPaths(lat, lng);
    }

    // Rellenar hasta 12 si faltan rutas
    while (paths.length < 12) {
      paths.push(paths[paths.length % paths.length]);
    }

    return paths;
  }

  /** Fallback rectangular si la API de rutas falla */
  private _generateFallbackPaths(lat: number, lng: number): [number, number][][] {
    const N = 30;
    const cw = 0.007;
    const ch = 0.006;
    const cols = 4, rows = 3;
    const startLng = lng - (cols / 2) * cw;
    const startLat = lat - (rows / 2) * ch;

    const cell = (col: number, row: number): [number, number][] => {
      const gap = 0.0002;
      const x0 = startLng + col * cw + gap;
      const y0 = startLat + row * ch + gap;
      const x1 = x0 + cw - gap * 2;
      const y1 = y0 + ch - gap * 2;
      const p: [number, number][] = [];
      for (let i = 0; i < N; i++) p.push([x0 + (x1 - x0) * i / N, y1]);
      for (let i = 0; i < N; i++) p.push([x1, y1 - (y1 - y0) * i / N]);
      for (let i = 0; i < N; i++) p.push([x1 - (x1 - x0) * i / N, y0]);
      for (let i = 0; i < N; i++) p.push([x0, y0 + (y1 - y0) * i / N]);
      p.push(p[0]);
      return p;
    };

    return [
      cell(0, 0), cell(1, 0), cell(2, 0), cell(3, 0),
      cell(0, 1), cell(1, 1), cell(2, 1), cell(3, 1),
      cell(0, 2), cell(1, 2), cell(2, 2), cell(3, 2),
    ];
  }

  private _segHeading(path: [number, number][], segIdx: number): number {
    const i = Math.min(segIdx, path.length - 2);
    return Math.atan2(path[i + 1][0] - path[i][0], path[i + 1][1] - path[i][1]) * 180 / Math.PI;
  }

  private _startAnimation() {
    this._stopAnimation();
    const loop = (ts: number) => {
      if (!this._map) return;
      const dt = this._lastTs === null ? 16 : Math.min(ts - this._lastTs, 50);
      this._lastTs = ts;

      for (const vs of this._vehicleStates) {
        if (vs.path.length < 2) continue;

        // Longitud del segmento actual
        const [x0, y0] = vs.path[vs.segIdx];
        const nx = Math.min(vs.segIdx + 1, vs.path.length - 1);
        const [x1, y1] = vs.path[nx];
        const segLen = Math.sqrt((x1 - x0) ** 2 + (y1 - y0) ** 2) || 1e-9;

        vs.t += (vs.speed * dt) / segLen;

        // Avanzar segmentos en loop continuo (los recorridos son loops cerrados)
        while (vs.t >= 1) {
          vs.t -= 1;
          vs.segIdx = (vs.segIdx + 1) % Math.max(1, vs.path.length - 1);
        }

        // Posición interpolada
        const [cx0, cy0] = vs.path[vs.segIdx];
        const ni = Math.min(vs.segIdx + 1, vs.path.length - 1);
        const [cx1, cy1] = vs.path[ni];
        const curLng = cx0 + vs.t * (cx1 - cx0);
        const curLat = cy0 + vs.t * (cy1 - cy0);

        // Heading objetivo del segmento actual (siempre hacia adelante)
        const targetH = Math.atan2(cx1 - cx0, cy1 - cy0) * 180 / Math.PI;

        // Interpolación suave del ángulo (maneja cruce por ±180°)
        let dH = targetH - vs.heading;
        if (dH > 180)  dH -= 360;
        if (dH < -180) dH += 360;
        // Giro suave proporcional a la velocidad — más rápido = giro más ágil
        vs.heading += dH * Math.min(1, dt * 0.15);

        // No colocar vehículo encima del marcador del usuario
        const uLng = this._currentLng, uLat = this._currentLat;
        if (Math.abs(curLng - uLng) > 0.0006 || Math.abs(curLat - uLat) > 0.0006) {
          vs.marker.setLngLat([curLng, curLat]);
        }
        // Rotar el inner div — el outer lo usa Mapbox para el translate de posición
        const rotEl = vs.marker.getElement().firstElementChild as HTMLElement | null;
        if (rotEl) rotEl.style.transform = `rotate(${vs.heading}deg)`;
      }

      this._animFrame = requestAnimationFrame(loop);
    };
    this._animFrame = requestAnimationFrame(loop);
  }

  private _stopAnimation() {
    if (this._animFrame !== null) { cancelAnimationFrame(this._animFrame); this._animFrame = null; }
    this._lastTs       = null;
    this._vehicleStates = [];
  }

  // ── Íconos estilo inDrive — vista superior (top-down) ────────────────────

  private _carElement(heading: number, color: string, offline = false): HTMLElement {
    const c = offline ? '#666666' : color;
    const outer = document.createElement('div');
    outer.style.cssText = `width:28px;height:46px;filter:drop-shadow(0 8px 24px rgba(0,0,0,0.55));opacity:${offline ? '0.65' : '1'};`;
    const wrap = document.createElement('div');
    wrap.style.cssText = `width:28px;height:46px;transform:rotate(${heading}deg);will-change:transform;`;
    wrap.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 46" width="28" height="46">
      <!-- Sombra base -->
      <ellipse cx="14" cy="44.5" rx="10" ry="2" fill="rgba(0,0,0,0.35)"/>
      <!-- Borde contraste oscuro -->
      <path d="M5,9 C5,4 8,2 14,2 C20,2 23,4 23,9 L23,37 C23,42 20,44 14,44 C8,44 5,42 5,37 Z"
            fill="rgba(0,0,0,0.6)" stroke="rgba(0,0,0,0.4)" stroke-width="0.5"/>
      <!-- Carrocería principal -->
      <path d="M6,10 C6,5 9,3 14,3 C19,3 22,5 22,10 L22,36 C22,41 19,43 14,43 C9,43 6,41 6,36 Z"
            fill="${c}"/>
      <!-- Highlight lateral izquierdo -->
      <path d="M6,12 C6,8 8,6 10,5.5 L10,40 C8,39.5 6,38 6,34 Z"
            fill="rgba(255,255,255,0.07)"/>
      <!-- Techo / capó oscuro -->
      <path d="M9,18 C9,16 11,15 14,15 C17,15 19,16 19,18 L19,31 C19,33 17,34 14,34 C11,34 9,33 9,31 Z"
            fill="rgba(0,0,0,0.2)"/>
      <!-- Parabrisas -->
      <path d="M8,10 C8,7 10,6 14,6 C18,6 20,7 20,10 L19,16 C17,18 11,18 9,16 Z"
            fill="rgba(130,200,255,0.55)"/>
      <!-- Reflejo parabrisas -->
      <path d="M9.5,10.5 C10.5,8.5 12,7.5 14,7 L13.5,14 C12,13.5 10.5,12.5 9.5,11.5 Z"
            fill="rgba(255,255,255,0.3)"/>
      <!-- Luneta trasera -->
      <path d="M9,32 C11,34 17,34 19,32 L19,37 C17,39 11,39 9,37 Z"
            fill="rgba(100,180,240,0.45)"/>
      <!-- Espejos -->
      <rect x="2" y="20" width="4" height="6" rx="2" fill="${c}" stroke="rgba(255,255,255,0.25)" stroke-width="0.8"/>
      <rect x="22" y="20" width="4" height="6" rx="2" fill="${c}" stroke="rgba(255,255,255,0.25)" stroke-width="0.8"/>
      <!-- Faros LED delanteros -->
      <rect x="7" y="5.5" width="4" height="1.8" rx="0.9" fill="#FFFDE7" opacity="0.9"/>
      <rect x="17" y="5.5" width="4" height="1.8" rx="0.9" fill="#FFFDE7" opacity="0.9"/>
      <rect x="7.5" y="5.7" width="3" height="1.2" rx="0.6" fill="#FDD835"/>
      <rect x="17.5" y="5.7" width="3" height="1.2" rx="0.6" fill="#FDD835"/>
      <!-- Luces traseras LED -->
      <rect x="7" y="38" width="4" height="2.5" rx="1.2" fill="#FF1744" opacity="0.85"/>
      <rect x="17" y="38" width="4" height="2.5" rx="1.2" fill="#FF1744" opacity="0.85"/>
      <!-- Indicador de frente -->
      <path d="M14,1.5 L11.5,4.5 L14,3.5 L16.5,4.5 Z" fill="rgba(255,255,255,0.9)"/>
    </svg>`;
    outer.appendChild(wrap);
    return outer;
  }

  private _motoElement(heading: number, color: string, offline = false): HTMLElement {
    const c = offline ? '#666666' : color;
    const outer = document.createElement('div');
    outer.style.cssText = `width:14px;height:32px;filter:drop-shadow(0 6px 18px rgba(0,0,0,0.5));opacity:${offline ? '0.65' : '1'};`;
    const wrap = document.createElement('div');
    wrap.style.cssText = `width:14px;height:32px;transform:rotate(${heading}deg);will-change:transform;`;
    wrap.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 14 36" width="14" height="32">
      <!-- Sombra base -->
      <ellipse cx="7" cy="35" rx="5" ry="1.5" fill="rgba(0,0,0,0.35)"/>
      <!-- Rueda trasera -->
      <ellipse cx="7" cy="30.5" rx="3.5" ry="3.5" fill="#0f172a"/>
      <ellipse cx="7" cy="30.5" rx="2.2" ry="2.2" fill="#1e293b"/>
      <ellipse cx="7" cy="30.5" rx="0.9" ry="0.9" fill="#475569"/>
      <!-- Borde carrocería -->
      <path d="M4,8 C4,5 5,3.5 7,3.5 C9,3.5 10,5 10,8 L10,26 C10,28.5 9,30 7,30 C5,30 4,28.5 4,26 Z"
            fill="rgba(0,0,0,0.5)"/>
      <!-- Carrocería principal -->
      <path d="M4.8,9 C4.8,6 5.8,4.5 7,4.5 C8.2,4.5 9.2,6 9.2,9 L9.2,25 C9.2,27.5 8.2,29 7,29 C5.8,29 4.8,27.5 4.8,25 Z"
            fill="${c}"/>
      <!-- Highlight lateral -->
      <path d="M4.8,10 L5.5,4.8 L5.5,28 L4.8,27 Z" fill="rgba(255,255,255,0.1)"/>
      <!-- Casco piloto -->
      <ellipse cx="7" cy="18.5" rx="2.4" ry="3" fill="#0f172a"/>
      <ellipse cx="7" cy="17.5" rx="1.3" ry="1" fill="rgba(255,255,255,0.18)"/>
      <!-- Manillar -->
      <rect x="1" y="12" width="12" height="1.6" rx="0.8" fill="#334155"/>
      <rect x="1" y="12" width="2.5" height="1.6" rx="0.8" fill="#1e293b"/>
      <rect x="10.5" y="12" width="2.5" height="1.6" rx="0.8" fill="#1e293b"/>
      <!-- Rueda delantera -->
      <ellipse cx="7" cy="5.5" rx="3.5" ry="3.5" fill="#0f172a"/>
      <ellipse cx="7" cy="5.5" rx="2.2" ry="2.2" fill="#1e293b"/>
      <ellipse cx="7" cy="5.5" rx="0.9" ry="0.9" fill="#475569"/>
      <!-- Faro LED -->
      <ellipse cx="7" cy="2.5" rx="2.2" ry="1.4" fill="#FFFDE7" opacity="0.9"/>
      <ellipse cx="7" cy="2.5" rx="1.2" ry="0.8" fill="#FDD835"/>
      <!-- Indicador frente -->
      <path d="M7,0.8 L5.2,3.5 L7,2.7 L8.8,3.5 Z" fill="rgba(255,255,255,0.9)"/>
      <!-- Luz trasera -->
      <rect x="5" y="31.5" width="4" height="2" rx="1" fill="#FF1744" opacity="0.85"/>
    </svg>`;
    outer.appendChild(wrap);
    return outer;
  }

  private _destroyMap() {
    this._stopAnimation();
    this._clearRoute();
    this._vehicleMarkers.forEach(m => { try { m.remove(); } catch { /**/ } });
    this._vehicleMarkers = [];
    this._userMarker = null;
    if (this._map) {
      try { this._map.remove(); } catch { /* ignore */ }
      this._map = null;
    }
  }

  // ── Trip request ──────────────────────────────────────────────
  formatCOP(n: number): string {
    return '$\u00a0' + n.toLocaleString('es-CO') + ' COP';
  }

  formatAmt(n: number): string {
    return '$\u00a0' + n.toLocaleString('es-CO');
  }

  requiredCommission(price: number): number {
    return Math.ceil(price * this.driverCommissionPct() / 100);
  }

  // ── Rating — passenger finishes trip ──────────────────────────
  async finishTrip() {
    const tripId = this.currentTripRequestId();
    const offer  = this.tripAccepted();
    if (!tripId || !offer) { this._resetTrip(); return; }
    this.passengerMapFullscreen.set(false);
    this._clearNavRoute();
    this._clearArrivalTimer();
    try {
      await this._withTimeout(this.agService.completeTrip(tripId));
    } catch (e: any) {
      alert(e?.message ?? 'Error al finalizar el viaje. Intenta de nuevo.');
      return;
    }
    // Notificar al conductor para que también muestre recibo y rating
    const driverId = offer.driver_id;
    if (driverId) this.agService.broadcastTripCompletedToDriver(driverId, tripId);
    this._showTripReceipt('passenger');
    this._resetTrip();
  }

  // ── Rating — driver finishes trip ─────────���────────────────���──
  async finishDriverTrip(trip: any) {
    const tripRequestId = trip.trip_request_id ?? trip.ag_trip_requests?.id;
    if (!tripRequestId) return;
    const wasQuick = this.driverStatus() === 'quick';
    // Salir del fullscreen y detener navegación antes de finalizar
    if (this.driverMapFullscreen()) {
      this.driverMapFullscreen.set(false);
      this.driverFullscreenTrip.set(null);
      if (this.navActive()) this.stopInAppNav();
      setTimeout(() => this._map?.resize(), 150);
    }
    try {
      await this._withTimeout(this.agService.completeTrip(tripRequestId));
    } catch (e: any) {
      alert(e?.message ?? 'Error al finalizar el viaje.'); return;
    }
    // Notificar al pasajero para que también muestre recibo y rating
    const passengerAuthId = trip.ag_trip_requests?.ag_users?.auth_user_id;
    if (passengerAuthId) this.agService.broadcastTripCompletedToPassenger(passengerAuthId);
    // Guardar datos para recibo antes de limpiar el viaje activo
    const tripDetails = await this.agService.getTripDetails(tripRequestId).catch(() => null);
    this.driverActiveTrips.update(list => list.filter(t => t.id !== trip.id));
    // Primer viaje completado: ocultar banner inmediatamente y actualizar BD
    if (wasQuick) {
      this.driverStatus.set('pending_docs');
      this.agService.graduateQuickDriver().then(() =>
        this.agService.getMyDriverProfile().then(updated => {
          if (updated) { this.driverData.set(updated); this.driverStatus.set(updated.status ?? 'pending_docs'); }
        })
      );
    }
    // Mostrar recibo del viaje al conductor
    if (tripDetails) {
      this.tripReceiptData.set({ ...tripDetails, _role: 'driver' });
      this.tripReceiptTrip.set(trip);
      this.tripReceiptModal.set(true);
      this.cdr.markForCheck();
    } else {
      // Si no hay datos del recibo, ir directo al rating
      await this.promptRatePassenger(trip);
    }
  }

  async submitRating() {
    if (this.ratingStars() === 0) return;
    const profile = this.agProfile();
    const target  = this.ratingTarget();
    const tripId  = this.ratingTripId();
    if (!profile || !target || !tripId) { this.ratingSkipped.set(true); return; }
    this.submittingRating.set(true);
    await this.agService.submitRating(
      tripId, profile.id, target.userId, target.role,
      this.ratingStars(), this.ratingCommentValue,
    );
    this.submittingRating.set(false);
    this.ratingSkipped.set(true); // reuse "finished" screen
  }

  skipRating() {
    this.ratingSkipped.set(true);
  }

  closeRatingModal() {
    this.ratingModal.set(false);
    this.ratingSkipped.set(false);
    this.ratingStars.set(0);
    this.ratingCommentValue = '';
    this.ratingTarget.set(null);
    this.ratingTripId.set(null);
  }

  // ── Driver section helpers ────────────────────────────────────
  readonly prefOptions = [
    { key: 'acceptsPets',       icon: 'pets',              label: 'Acepto mascotas' },
    { key: 'acceptsLuggage',    icon: 'luggage',           label: 'Acepto equipaje' },
    { key: 'acceptsChildSeat',  icon: 'child_care',        label: 'Tengo silla infantil' },
  ];

  readonly settingOptions = [
    { key: 'notifySound',      icon: 'volume_up',   label: 'Sonido de notificaciones' },
    { key: 'notifyVibration',  icon: 'vibration',   label: 'Vibración' },
  ];

  readonly faqItems = [
    { q: '¿Cómo se calcula mi pago?', a: 'El pago es el precio ofrecido por el pasajero menos la comisión de la plataforma. El saldo se acredita automáticamente al completar el viaje.' },
    { q: '¿Puedo rechazar solicitudes?', a: 'Sí, puedes rechazar cualquier solicitud sin penalización. También puedes desconectarte en cualquier momento.' },
    { q: '¿Cómo retiro mis ganancias?', a: 'Desde la sección Ganancias puedes solicitar un retiro a tu cuenta bancaria o billetera digital registrada.' },
    { q: '¿Qué pasa si el pasajero cancela?', a: 'Si el pasajero cancela después de aceptar la oferta, recibirás una compensación por el tiempo y distancia recorrida.' },
    { q: '¿Cómo mejoro mi calificación?', a: 'Brinda un servicio puntual, mantén el vehículo limpio y sé amable. Las calificaciones se promedian con los últimos 50 viajes.' },
  ];

  openFaq = signal<string | null>(null);

  toggleFaq(q: string) {
    this.openFaq.set(this.openFaq() === q ? null : q);
  }

  getPrefValue(key: string): boolean {
    const p = this.driverPrefs();
    return (p as any)[key] ?? false;
  }

  setMaxDistance(val: number) {
    this.driverPrefs.update(p => ({ ...p, maxDistance: val }));
  }

  togglePref(key: string) {
    this.driverPrefs.update(p => ({ ...p, [key]: !(p as any)[key] }));
  }

  getSettingValue(key: string): boolean {
    const s = this.driverSettings();
    return (s as any)[key] ?? false;
  }

  toggleSetting(key: string) {
    this.driverSettings.update(s => ({ ...s, [key]: !(s as any)[key] }));
  }

  async openDriverSection(action: string) {
    this.driverMenuOpen.set(false);
    if (!action) return;
    if (action === 'wallet-panel') { this.walletPanelOpen.set(true); return; }
    this.driverSection.set(action);
    const driver = this.driverData();
    if (!driver) return;

    this.loadingSection.set(true);
    if (action === 'profile') {
      const stats = await this.agService.getDriverStats(driver.id);
      this.driverStats.set(stats);
    } else if (action === 'earnings') {
      const profile = this.agProfile();
      if (profile) {
        await this.loadReferralData();
        const withdrawals = await this.agService.listReferralWithdrawals(profile.id);
        this.referralWithdrawals.set(withdrawals);
      }
    } else if (action === 'trips') {
      const trips = await this.agService.getDriverCompletedTrips(driver.id);
      this.driverCompletedTrips.set(trips);
    } else if (action === 'analytics') {
      await this.loadDriverAnalytics();
    } else if (action === 'quests') {
      await this.loadQuests();
    } else if (action === 'vehicles') {
      await this.loadVehicles();
    } else if (action === 'blacklist') {
      await this.loadBlacklist();
    } else if (action === 'preferences') {
      this.driverPrefs.set({
        maxDistance:      driver.max_distance_km   ?? 20,
        acceptsPets:      driver.accepts_pets      ?? false,
        acceptsLuggage:   driver.accepts_luggage   ?? true,
        acceptsChildSeat: driver.accepts_child_seat ?? false,
      });
      this.driverSettings.set({
        hidePhone:        driver.hide_phone        ?? false,
        notifySound:      driver.notify_sound      ?? true,
        notifyVibration:  driver.notify_vibration  ?? true,
      });
    } else if (action === 'settings') {
      this.driverSettings.set({
        hidePhone:        driver.hide_phone        ?? false,
        notifySound:      driver.notify_sound      ?? true,
        notifyVibration:  driver.notify_vibration  ?? true,
      });
    } else if (action === 'referrals') {
      await this.loadReferralData();
    } else if (action === 'documents') {
      await this.loadDriverDocs();
    } else if (action === 'performance') {
      const [_, total] = await Promise.all([
        this.loadDriverMetrics(),
        this.agService.getDriverEarningsSummary(driver.id),
      ]);
      this.driverEarnings.update(e => ({ ...e, total }));
    } else if (action === 'autoaccept') {
      this.autoAcceptCfg.set({
        enabled: driver.auto_accept_enabled ?? false,
        minPrice: driver.auto_accept_min_price ?? 5000,
        maxDistance: driver.auto_accept_max_distance ?? 5,
      });
    } else if (action === 'lost') {
      await this.loadLostItems();
    } else if (action === 'scheduled') {
      await this.loadScheduledTrips();
    } else if (action === 'notifications') {
      this.driverNotifySettings.set({
        newRequests: (driver as any).notify_new_requests ?? true,
        tripUpdates: (driver as any).notify_trip_updates ?? true,
        earnings: (driver as any).notify_earnings ?? true,
      });
    } else if (action === 'report') {
      await this.loadDriverReports();
    } else if (action === 'benefits') {
      const benefits = await this.agService.getDriverBenefits(driver.id);
      if (benefits) this.driverBenefits.set(benefits);
    }
    this.loadingSection.set(false);
  }

  // ═══════════════════════════════════════════════════
  // Documentos
  // ═══════════════════════════════════════════════════
  async loadDriverDocs(): Promise<void> {
    const d = this.driverData();
    if (!d) return;
    const docs = await this.agService.listDriverDocuments(d.id);
    this.driverDocs.set(docs);
  }

  getDocByType(type: string): any | null {
    return this.driverDocs().find(doc => doc.doc_type === type) ?? null;
  }

  docStatusLabel(status: string): string {
    const map: Record<string, string> = {
      pending: 'En revisión', approved: 'Aprobado', rejected: 'Rechazado', expired: 'Vencido',
    };
    return map[status] ?? status;
  }

  docStatusColor(status: string): string {
    const map: Record<string, string> = {
      pending: 'text-yellow-400', approved: 'text-green-400',
      rejected: 'text-red-400', expired: 'text-red-400',
    };
    return map[status] ?? 'text-gray-400';
  }

  docIsExpiringSoon(doc: any): boolean {
    if (!doc?.expires_at) return false;
    const exp = new Date(doc.expires_at).getTime();
    const diff = exp - Date.now();
    return diff > 0 && diff < 1000 * 60 * 60 * 24 * 30;
  }

  async onUploadDoc(type: string, event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    const d = this.driverData();
    if (!d) return;
    this.uploadingDoc.set(type);
    const meta: any = { number: this.docNumberInput[type] };
    if (this.docExpiryInput[type]) meta.expires_at = this.docExpiryInput[type];
    const res = await this.agService.uploadDriverDocument(d.id, type as any, file, meta);
    this.uploadingDoc.set(null);
    input.value = '';
    if (res.success) {
      await this.loadDriverDocs();
    } else {
      alert('Error subiendo: ' + (res.error ?? 'desconocido'));
    }
  }

  async onDocNumberChange(type: string, value: string): Promise<void> {
    this.docNumberInput[type] = value;
  }

  async onDocExpiryChange(type: string, value: string): Promise<void> {
    this.docExpiryInput[type] = value;
  }

  // ═══════════════════════════════════════════════════
  // Métricas performance
  // ═══════════════════════════════════════════════════
  async loadDriverMetrics(): Promise<void> {
    const m = await this.agService.getDriverMetrics();
    this.driverMetrics.set(m);
  }

  metricColor(rate: number, kind: 'positive' | 'negative'): string {
    if (kind === 'positive') {
      if (rate >= 90) return 'text-green-400';
      if (rate >= 70) return 'text-yellow-400';
      return 'text-red-400';
    }
    if (rate <= 5) return 'text-green-400';
    if (rate <= 15) return 'text-yellow-400';
    return 'text-red-400';
  }

  // ═══════════════════════════════════════════════════
  // Detalle de viaje
  // ═══════════════════════════════════════════════════
  async openTripDetail(trip: any): Promise<void> {
    const id = trip.id ?? trip.trip_request_id;
    if (!id) return;
    this.loadingTripDetail.set(true);
    this.tripDetailOpen.set(true);
    const detail = await this.agService.getTripDetail(id);
    this.tripDetail.set(detail);
    this.loadingTripDetail.set(false);
  }

  closeTripDetail(): void {
    this.tripDetailOpen.set(false);
    this.tripDetail.set(null);
  }

  downloadReceipt(): void {
    const d = this.tripDetail();
    if (!d) return;
    const driver = this.driverData();
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Recibo Movi</title>
<style>body{font-family:Arial,sans-serif;max-width:600px;margin:20px auto;padding:20px;color:#222}
h1{color:#00E5FF;border-bottom:2px solid #00E5FF;padding-bottom:10px}
.row{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #eee}
.total{font-weight:bold;font-size:18px;color:#00E5FF}</style></head>
<body><h1>Recibo de viaje — Movi</h1>
<p><strong>Viaje ID:</strong> ${d.id}<br><strong>Fecha:</strong> ${d.completed_at ? new Date(d.completed_at).toLocaleString('es-CO') : '-'}</p>
<p><strong>Conductor:</strong> ${driver?.ag_users?.full_name ?? '-'}<br>
<strong>Pasajero:</strong> ${d.passenger_name ?? '-'}<br>
<strong>Destino:</strong> ${d.dest_name ?? '-'}<br>
<strong>Distancia:</strong> ${(d.distance_km ?? 0).toFixed(2)} km</p>
<h2>Desglose</h2>
<div class="row"><span>Tarifa base</span><span>$${(d.base_fare ?? 0).toLocaleString('es-CO')}</span></div>
<div class="row"><span>Distancia</span><span>$${(d.distance_fare ?? 0).toLocaleString('es-CO')}</span></div>
${d.surge_multiplier > 1 ? `<div class="row"><span>Alta demanda x${d.surge_multiplier}</span><span>+$${(d.surge_amount ?? 0).toLocaleString('es-CO')}</span></div>` : ''}
<div class="row"><span>Total cobrado al pasajero</span><span>$${(d.final_price ?? d.offered_price ?? 0).toLocaleString('es-CO')}</span></div>
<div class="row"><span>Comisión plataforma (${d.commission_pct ?? 0}%)</span><span>-$${(d.commission_amount ?? 0).toLocaleString('es-CO')}</span></div>
<div class="row total"><span>Ganancia neta conductor</span><span>$${(d.driver_net ?? 0).toLocaleString('es-CO')}</span></div>
<p style="margin-top:30px;font-size:12px;color:#666">Este recibo fue generado automáticamente por Movi (Publihazclick). Para facturación electrónica, contacta soporte.</p>
</body></html>`;
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `recibo-movi-${d.id?.slice(0, 8)}.html`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // ═══════════════════════════════════════════════════
  // Auto-aceptar
  // ═══════════════════════════════════════════════════
  async saveAutoAccept(): Promise<void> {
    const d = this.driverData();
    if (!d) return;
    this.savingAutoAccept.set(true);
    const cfg = this.autoAcceptCfg();
    await this.agService.updateAutoAccept(d.id, cfg.enabled, cfg.minPrice, cfg.maxDistance);
    this.savingAutoAccept.set(false);
  }

  toggleAutoAcceptEnabled(): void {
    this.autoAcceptCfg.update(c => ({ ...c, enabled: !c.enabled }));
  }

  setAutoAcceptMinPrice(value: number): void {
    this.autoAcceptCfg.update(c => ({ ...c, minPrice: value }));
  }

  setAutoAcceptMaxDistance(value: number): void {
    this.autoAcceptCfg.update(c => ({ ...c, maxDistance: value }));
  }

  // ═══════════════════════════════════════════════════
  // Objetos perdidos
  // ═══════════════════════════════════════════════════
  async loadLostItems(): Promise<void> {
    const d = this.driverData();
    if (!d) return;
    const items = await this.agService.listLostItems(d.id);
    this.lostItems.set(items);
  }

  openReportLost(tripId: string): void {
    this.newLostTripId.set(tripId);
    this.newLostDesc = '';
    this.newLostPhoto = null;
  }

  onLostPhotoChange(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    this.newLostPhoto = file ?? null;
  }

  async submitLostItem(): Promise<void> {
    const tripId = this.newLostTripId();
    const d = this.driverData();
    if (!tripId || !d || !this.newLostDesc.trim()) return;
    const trip = this.driverCompletedTrips().find(
      t => (t.ag_trip_requests?.id ?? t.trip_request_id) === tripId,
    ) ?? this.driverActiveTrips().find(
      t => (t.ag_trip_requests?.id ?? t.trip_request_id) === tripId,
    );
    const passengerUserId = trip?.ag_trip_requests?.passenger_user_id;
    if (!passengerUserId) {
      alert('No se encontró el pasajero de este viaje.');
      return;
    }
    this.submittingLost.set(true);
    const res = await this.agService.reportLostItem({
      tripRequestId: tripId,
      driverId: d.id,
      passengerUserId,
      description: this.newLostDesc,
      photo: this.newLostPhoto ?? undefined,
    });
    this.submittingLost.set(false);
    if (res.success) {
      this.newLostTripId.set(null);
      this.newLostDesc = '';
      this.newLostPhoto = null;
      await this.loadLostItems();
    } else {
      alert('Error: ' + (res.error ?? 'desconocido'));
    }
  }

  async changeLostStatus(itemId: string, status: 'reported' | 'contacted' | 'returned' | 'closed'): Promise<void> {
    await this.agService.updateLostItemStatus(itemId, status);
    await this.loadLostItems();
  }

  // ═══════════════════════════════════════════════════
  // Viajes programados
  // ═══════════════════════════════════════════════════
  async loadScheduledTrips(): Promise<void> {
    const d = this.driverData();
    if (!d) return;
    const [available, mine] = await Promise.all([
      this.agService.listAvailableScheduledTrips(d.id, d.max_distance_km ?? 30),
      this.agService.listMyScheduledTrips(d.id),
    ]);
    this.availableScheduledTrips.set(available);
    this.myScheduledTrips.set(mine);
  }

  async claimScheduled(id: string): Promise<void> {
    const d = this.driverData();
    if (!d) return;
    this.claimingScheduledId.set(id);
    const res = await this.agService.claimScheduledTrip(id, d.id);
    this.claimingScheduledId.set(null);
    if (res.success) {
      await this.loadScheduledTrips();
    } else {
      alert('No se pudo reservar el viaje: ' + (res.error ?? 'desconocido'));
    }
  }

  async releaseScheduled(id: string): Promise<void> {
    if (!confirm('¿Liberar esta reserva? Volverá a estar disponible para otros conductores.')) return;
    await this.agService.releaseScheduledTrip(id);
    await this.loadScheduledTrips();
  }

  // ═══════════════════════════════════════════════════
  // Rating pasajero post-viaje
  // ═══════════════════════════════════════════════════
  async promptRatePassenger(trip: any): Promise<void> {
    const tripId = trip.ag_trip_requests?.id ?? trip.trip_request_id ?? trip.id;
    if (!tripId) return;
    const profile = this.agProfile();
    if (!profile) return;
    const already = await this.agService.hasRatedTrip(tripId, profile.id);
    if (already) return;
    this.pendingRatingTrip.set({
      trip_request_id: tripId,
      passenger_user_id: trip.ag_trip_requests?.passenger_user_id ?? trip.passenger_user_id,
      passenger_name: trip.ag_trip_requests?.ag_users?.full_name ?? trip.ag_users?.full_name ?? 'Pasajero',
    });
    this.passengerRatingStars.set(0);
    this.passengerRatingTags.set(new Set());
    this.passengerRatingComment = '';
    this.passengerRatingModal.set(true);
  }

  togglePassengerRatingTag(tag: string): void {
    this.passengerRatingTags.update(set => {
      const next = new Set(set);
      if (next.has(tag)) next.delete(tag); else next.add(tag);
      return next;
    });
  }

  async submitPassengerRating(): Promise<void> {
    const pending = this.pendingRatingTrip();
    const profile = this.agProfile();
    if (!pending || !profile || this.passengerRatingStars() === 0) return;
    this.submittingPassengerRating.set(true);
    const res = await this.agService.submitPassengerRating(
      pending.trip_request_id,
      profile.id,
      pending.passenger_user_id,
      this.passengerRatingStars(),
      Array.from(this.passengerRatingTags()),
      this.passengerRatingComment,
    );
    this.submittingPassengerRating.set(false);
    if (res.success) {
      this.passengerRatingModal.set(false);
      this.pendingRatingTrip.set(null);
    } else {
      alert('Error enviando calificación: ' + (res.error ?? 'desconocido'));
    }
  }

  skipPassengerRating(): void {
    this.passengerRatingModal.set(false);
    this.pendingRatingTrip.set(null);
  }

  private _gpsWatchId: number | null = null;

  async toggleOnline() {
    const driver = this.driverData();
    if (!driver) return;
    // Si está en línea, pedir confirmación antes de desconectar
    if (this.driverOnline()) {
      this.offlineConfirmOpen.set(true);
      this.cdr.markForCheck();
      return;
    }
    // Si está fuera de línea, conectar directamente
    await this._setOnline(true);
  }

  async confirmGoOffline() {
    this.offlineConfirmOpen.set(false);
    await this._setOnline(false);
  }

  cancelGoOffline() {
    this.offlineConfirmOpen.set(false);
    this.cdr.markForCheck();
  }

  private async _setOnline(next: boolean) {
    const driver = this.driverData();
    if (!driver) return;
    this.togglingOnline.set(true);
    await this.agService.setDriverOnline(driver.id, next);
    this.driverOnline.set(next);

    if (next) {
      // Iniciar tracking GPS + sesión online + cargar solicitudes
      this.startGpsTracking(driver.id);
      try {
        const sessionId = await this.agService.startOnlineSession(driver.id);
        this._onlineSessionId = sessionId;
      } catch {}
      this._startOnlineTimer();
      this._loadDriverRequests(driver.vehicle_type, this._currentLat, this._currentLng);
      if (isPlatformBrowser(this.platformId) && !this._visibilityHandler) {
        this._visibilityHandler = () => {
          if (!document.hidden && this.driverOnline()) {
            this.refreshDriverRequests();
          }
        };
        document.addEventListener('visibilitychange', this._visibilityHandler);
      }
      // Registrar notificaciones para recibir solicitudes aunque la app esté cerrada
      this._registerNativePush().catch(() => {});
      this._autoRegisterPush().catch(() => {});
    } else {
      // Detener tracking, cerrar sesión y limpiar solicitudes
      this.stopGpsTracking();
      await this.agService.removeDriverLocation(driver.id);
      if (this._onlineSessionId) {
        await this.agService.endOnlineSession(this._onlineSessionId);
        this._onlineSessionId = null;
      }
      this._stopOnlineTimer();
      // Cancelar suscripción y limpiar lista de solicitudes
      if (this._requestsChannel) { this._requestsChannel.unsubscribe(); this._requestsChannel = null; }
      if (this._driverRefreshInterval) { clearInterval(this._driverRefreshInterval); this._driverRefreshInterval = null; }
      if (this._reqTimerInterval) { clearInterval(this._reqTimerInterval); this._reqTimerInterval = null; }
      if (this._cancelCheckInterval) { clearInterval(this._cancelCheckInterval); this._cancelCheckInterval = null; }
      this.driverRequests.set([]);
      this.cdr.markForCheck();
    }

    this.togglingOnline.set(false);
  }

  // Estados del viaje (conductor)
  readonly tripStages = [
    { key: 'heading_to_pickup', label: 'Yendo' },
    { key: 'arrived_at_pickup', label: 'Llegó' },
    { key: 'picked_up', label: 'A bordo' },
    { key: 'on_route', label: 'En ruta' },
    { key: 'arrived_at_destination', label: 'Llegó destino' },
  ];

  isStageReached(current: string | null | undefined, target: string): boolean {
    if (!current) return false;
    const order = ['heading_to_pickup', 'arrived_at_pickup', 'picked_up', 'on_route', 'arrived_at_destination', 'completed'];
    return order.indexOf(current) >= order.indexOf(target);
  }

  async advanceStage(trip: any, stage: 'heading_to_pickup'|'arrived_at_pickup'|'picked_up'|'on_route'|'arrived_at_destination'|'completed'): Promise<void> {
    const tripReqId = trip.trip_request_id ?? trip.ag_trip_requests?.id;
    if (!tripReqId) return;
    await this.agService.updateTripStage(tripReqId, stage);
    // Actualizar el signal con un nuevo objeto para que Angular OnPush detecte el cambio
    this.driverActiveTrips.update(list =>
      list.map(t => {
        const id = t.trip_request_id ?? t.ag_trip_requests?.id;
        if (id !== tripReqId) return t;
        return { ...t, ag_trip_requests: { ...(t.ag_trip_requests ?? {}), driver_stage: stage } };
      })
    );

    // Push al pasajero según etapa
    const req = trip.ag_trip_requests ?? trip;
    const passengerAuthId = req?.ag_users?.auth_user_id;
    if (passengerAuthId) {
      const pushMap: Partial<Record<string, { title: string; body: string }>> = {
        arrived_at_pickup:      { title: '🚗 Tu conductor llegó', body: 'Tu conductor está esperándote en el punto de recogida.' },
        on_route:               { title: '🚀 ¡El viaje inició!', body: 'Estás en camino a tu destino. Buen viaje.' },
        arrived_at_destination: { title: '📍 Llegaste a tu destino', body: 'El conductor confirma tu llegada. Gracias por viajar con Movi.' },
      };
      const pd = pushMap[stage];
      if (pd) this.agService.sendPush({ userIds: [passengerAuthId], title: pd.title, body: pd.body, tag: `stage-${tripReqId}-${stage}`, urgent: stage === 'arrived_at_pickup' }).catch(() => {});
    }

    // Conductor llegó al punto de recogida: cerrar fullscreen + abrir modal de espera
    if (stage === 'arrived_at_pickup') {
      if (this.driverMapFullscreen()) {
        this.stopInAppNav();
        this.driverMapFullscreen.set(false);
        this.driverFullscreenTrip.set(null);
        setTimeout(() => this._map?.resize(), 150);
      }
      this.driverArrivalTrip.set(trip);
      this._startDriverArrivalTimer();
      // Canal bidireccional: conductor escucha si el PASAJERO confirma abordaje
      const boardId = trip.trip_request_id ?? trip.ag_trip_requests?.id;
      if (boardId) {
        if (this._tripBoardingChannel) { this._tripBoardingChannel.unsubscribe(); }
        this._tripBoardingChannel = this.agService.subscribeTripBoarding(boardId, () => {
          if (this.driverArrivalTrip()) this._applyDriverBoarding();
        });
      }
    }

    // Cuando inicia el viaje: activar fullscreen + navegar al destino
    if (stage === 'on_route') {
      this.driverFullscreenTrip.set(trip);
      this.driverMapFullscreen.set(true);
      setTimeout(() => {
        this._map?.resize();
        this.startInAppNav(trip, false);
      }, 200);
    }

    this.cdr.markForCheck();
  }

  // Botón "Iniciar recogida" desde la alerta inDrive full-screen
  async acceptTripAndGo(alert: any): Promise<void> {
    this.driverTripAlert.set(null);
    await this.advanceStage(alert, 'heading_to_pickup');
    const req = alert.ag_trip_requests ?? alert;
    if (req?.origin_lat && req?.origin_lng) {
      this.driverFullscreenTrip.set(alert);
      this.driverMapFullscreen.set(true);
      // Esperar a que el mapa esté listo (puede estar cargando en primer uso)
      this._waitForMap(() => {
        this._map?.resize();
        this.startInAppNav(alert, true);
      });
    }
  }

  dismissTripAlert(): void {
    this.driverTripAlert.set(null);
  }

  exitDriverFullscreen(): void {
    this.driverMapFullscreen.set(false);
    this.driverFullscreenTrip.set(null);
    setTimeout(() => this._map?.resize(), 150);
  }

  openPassengerFullscreenMap(): void {
    this.passengerSection.set(null);
    this.passengerMapFullscreen.set(true);
    setTimeout(() => this._map?.resize(), 200);
    if (this.currentTripStage() === 'on_route' || this.currentTripStage() === 'arrived_at_destination') {
      this._drawPassengerTripRoute();
    }
  }

  navigateTo(lat: number, lng: number, label: 'pickup' | 'dest' = 'dest'): void {
    if (!lat || !lng) return;
    const url = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`;
    if (typeof window !== 'undefined') window.open(url, '_blank');
  }

  // ── Navegación en app ────────────────────────────────────────

  private _speak(text: string): void {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    if (!this.navVoiceEnabled()) return;
    window.speechSynthesis.cancel();
    const utt = new SpeechSynthesisUtterance(text);
    utt.lang  = 'es-CO';
    utt.rate  = 1.05;
    utt.pitch = 1;
    const voices = window.speechSynthesis.getVoices();
    const es = voices.find(v => v.lang.startsWith('es')) ?? null;
    if (es) utt.voice = es;
    window.speechSynthesis.speak(utt);
  }

  private _maneuverIconFromStep(step: any): string {
    const t = step.maneuver?.type ?? '';
    const m = step.maneuver?.modifier ?? '';
    if (t === 'turn' && m.includes('right')) return 'turn_right';
    if (t === 'turn' && m.includes('left'))  return 'turn_left';
    if (t === 'fork' && m.includes('right')) return 'fork_right';
    if (t === 'fork' && m.includes('left'))  return 'fork_left';
    if (t === 'merge')    return 'merge';
    if (t === 'roundabout' || t === 'rotary') return 'roundabout_right';
    if (t === 'arrive')   return 'location_on';
    if (t === 'depart')   return 'near_me';
    return 'straight';
  }

  private _fmtDist(meters: number): string {
    if (meters < 1000) return `${Math.round(meters / 10) * 10} m`;
    return `${(meters / 1000).toFixed(1)} km`;
  }

  async startInAppNav(trip: any, toPickup: boolean): Promise<void> {
    const req = trip.ag_trip_requests ?? trip;
    const destLat = toPickup ? req.origin_lat : req.dest_lat;
    const destLng = toPickup ? req.origin_lng : req.dest_lng;
    if (!destLat || !destLng) return;

    this.navActive.set(true);
    this.navPhase.set(toPickup ? 'to_pickup' : 'to_dest');
    this.navInstruction.set('Calculando ruta...');
    this._navSteps     = [];
    this._navStepIdx   = 0;
    this._navSpokenKeys = new Set();

    try {
      const url = [
        `https://api.mapbox.com/directions/v5/mapbox/driving/`,
        `${this._currentLng},${this._currentLat};${destLng},${destLat}`,
        `?geometries=geojson&steps=true&voice_instructions=true`,
        `&language=es&overview=full&access_token=${this.MAPBOX_TOKEN}`,
      ].join('');
      const json  = await (await fetch(url)).json();
      const route = json.routes?.[0];
      if (!route) { this.navInstruction.set('No se encontró ruta'); return; }

      this._navSteps   = route.legs?.[0]?.steps ?? [];
      this.navTotalKm.set(Math.round(route.distance / 100) / 10);
      this.navEtaMin.set(Math.round(route.duration / 60));

      // Switch to light map style for navigation, then draw route
      this._clearNavRoute();
      if (this._map) {
        const drawRoute = () => {
          this._clearNavRoute();
          this._map.addSource('nav-route', { type: 'geojson', data: { type: 'Feature', properties: {}, geometry: route.geometry } });
          this._map.addLayer({ id: 'nav-route-bg',   type: 'line', source: 'nav-route', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#bfdbfe', 'line-width': 12, 'line-opacity': 0.6 } });
          this._map.addLayer({ id: 'nav-route-line', type: 'line', source: 'nav-route', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#2563eb', 'line-width': 6,  'line-opacity': 1.0 } });
          this._map.addLayer({ id: 'nav-route-arr',  type: 'line', source: 'nav-route', layout: { 'line-cap': 'round' },                       paint: { 'line-color': '#fff',    'line-width': 2,  'line-opacity': 0.5, 'line-dasharray': [0, 5] } });
          const mapboxgl = (window as any).mapboxgl;
          const coords = route.geometry.coordinates as [number, number][];
          const bounds = coords.reduce((b: any, c: [number,number]) => b.extend(c), new mapboxgl.LngLatBounds(coords[0], coords[0]));
          const bottomPad = this.driverMapFullscreen() ? 200 : 80;
          this._map.fitBounds(bounds, { padding: { top: 160, bottom: bottomPad, left: 40, right: 40 }, duration: 900 });
        };
        const currentStyle = this._map.getStyle()?.name ?? '';
        if (currentStyle.toLowerCase().includes('dark') || currentStyle.toLowerCase().includes('dark-v11')) {
          this._map.setStyle('mapbox://styles/mapbox/streets-v12');
          this._map.once('style.load', drawRoute);
        } else {
          drawRoute();
        }
      }

      this._applyNavStep(0);
      const dest = toPickup ? 'el punto de recogida' : 'tu destino';
      this._speak(`Ruta calculada. En ${this.navEtaMin()} minutos llegas a ${dest}.`);
    } catch (e) {
      this.navInstruction.set('Error al calcular ruta');
      console.warn('nav error', e);
    }
  }

  stopInAppNav(): void {
    this.navActive.set(false);
    this._navSteps   = [];
    this._navStepIdx = 0;
    this._navSpokenKeys = new Set();
    window.speechSynthesis?.cancel();
    this._clearNavRoute();
    if (this._map) {
      const currentStyle = this._map.getStyle()?.name ?? '';
      if (!currentStyle.toLowerCase().includes('dark')) {
        this._map.setStyle('mapbox://styles/mapbox/dark-v11');
      }
    }
  }

  private _clearNavRoute(): void {
    if (!this._map) return;
    ['nav-route-arr','nav-route-line','nav-route-bg'].forEach(id => {
      try { if (this._map.getLayer(id)) this._map.removeLayer(id); } catch {}
    });
    try { if (this._map.getSource('nav-route')) this._map.removeSource('nav-route'); } catch {}
  }

  private _applyNavStep(idx: number): void {
    const step = this._navSteps[idx];
    if (!step) return;
    this._navStepIdx = idx;

    const voiceInstr = step.voiceInstructions?.[0]?.announcement ?? step.maneuver?.instruction ?? '';
    const dist = step.distance ?? 0;

    this.navInstruction.set(voiceInstr || step.maneuver?.instruction || 'Continúa recto');
    this.navDistToNext.set(this._fmtDist(dist));
    this.navManeuverIcon.set(this._maneuverIconFromStep(step));

    const key = `${idx}-${Math.round(dist)}`;
    if (!this._navSpokenKeys.has(key)) {
      this._navSpokenKeys.add(key);
      if (voiceInstr) this._speak(voiceInstr);
    }
  }

  _updateNavFromGps(lat: number, lng: number): void {
    if (!this.navActive() || this._navSteps.length === 0) return;
    const step = this._navSteps[this._navStepIdx];
    if (!step) return;

    // Distance to end of current step (maneuver location)
    const [sLng, sLat] = step.maneuver?.location ?? [lng, lat];
    const distToStep = this._distKm(lat, lng, sLat, sLng) * 1000;

    // Advance step when within 25m of its maneuver point
    if (distToStep < 25 && this._navStepIdx < this._navSteps.length - 1) {
      this._applyNavStep(this._navStepIdx + 1);
    } else {
      this.navDistToNext.set(this._fmtDist(distToStep));
    }

    // Update ETA roughly (subtract driven distance)
    if (step.duration) {
      const remaining = this._navSteps.slice(this._navStepIdx).reduce((s: number, st: any) => s + (st.duration ?? 0), 0);
      this.navEtaMin.set(Math.max(1, Math.round(remaining / 60)));
    }
  }

  // ═══════════ Heatmap demanda ═══════════
  heatmapVisible = signal(false);
  private _heatmapLoaded = false;

  async toggleHeatmap(): Promise<void> {
    const next = !this.heatmapVisible();
    this.heatmapVisible.set(next);
    if (next) await this._showHeatmap();
    else this._hideHeatmap();
  }

  private async _showHeatmap(): Promise<void> {
    if (!this._map) return;
    try {
      const b = this._map.getBounds();
      const pts = await this.agService.getHeatmap({
        latMin: b.getSouth(), lngMin: b.getWest(),
        latMax: b.getNorth(), lngMax: b.getEast(),
      });
      const features = pts.map(p => ({
        type: 'Feature' as const, properties: { weight: p.weight },
        geometry: { type: 'Point' as const, coordinates: [p.lng, p.lat] },
      }));
      const geojson = { type: 'FeatureCollection' as const, features };
      if (this._map.getSource('ag-heatmap')) {
        (this._map.getSource('ag-heatmap') as any).setData(geojson);
      } else {
        this._map.addSource('ag-heatmap', { type: 'geojson', data: geojson });
        this._map.addLayer({
          id: 'ag-heatmap-layer', type: 'heatmap', source: 'ag-heatmap',
          paint: {
            'heatmap-weight': ['interpolate', ['linear'], ['get', 'weight'], 0, 0, 10, 1],
            'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 10, 1, 15, 3],
            'heatmap-color': ['interpolate', ['linear'], ['heatmap-density'],
              0, 'rgba(0,0,255,0)', 0.2, 'rgb(0,100,255)',
              0.4, 'rgb(0,255,100)', 0.6, 'rgb(255,200,0)',
              0.8, 'rgb(255,100,0)', 1, 'rgb(255,0,0)'],
            'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 10, 15, 15, 40],
            'heatmap-opacity': 0.7,
          },
        });
        this._heatmapLoaded = true;
      }
    } catch (e) { console.warn('heatmap err', e); }
  }

  private _hideHeatmap(): void {
    if (!this._map || !this._heatmapLoaded) return;
    try {
      if (this._map.getLayer('ag-heatmap-layer')) this._map.removeLayer('ag-heatmap-layer');
      if (this._map.getSource('ag-heatmap')) this._map.removeSource('ag-heatmap');
      this._heatmapLoaded = false;
    } catch {}
  }

  async callPassengerFromTrip(trip: any): Promise<void> {
    const tripReqId = trip.trip_request_id ?? trip.ag_trip_requests?.id;
    if (!tripReqId) return;
    const r = await this.agService.startMaskedCall(tripReqId);
    if (r.ok) {
      alert('📞 Te estamos llamando. Al contestar conectaremos con el pasajero.');
    } else {
      alert('Error: ' + (r.error ?? 'No se pudo llamar'));
    }
  }

  driverLevelColor(): string {
    const lvl = (this.driverData() as any)?.level ?? 'bronce';
    const map: Record<string, string> = {
      bronce: 'rgba(180,83,9,0.2);color:#fbbf24',
      plata: 'rgba(148,163,184,0.2);color:#e2e8f0',
      oro: 'rgba(251,191,36,0.2);color:#fbbf24',
      platino: 'rgba(103,232,249,0.2);color:#67e8f9',
      diamante: 'rgba(192,132,252,0.25);color:#c084fc',
    };
    return map[lvl] ?? map['bronce'];
  }
  driverLevelIcon(): string {
    const lvl = (this.driverData() as any)?.level ?? 'bronce';
    const map: Record<string, string> = { bronce: 'workspace_premium', plata: 'military_tech', oro: 'emoji_events', platino: 'diamond', diamante: 'auto_awesome' };
    return map[lvl] ?? 'workspace_premium';
  }

  // Tracking horas online del día (signal hh:mm:ss)
  private _onlineSessionId: string | null = null;
  private _onlineTimer: any = null;
  onlineTodaySeconds = signal(0);
  onlineTodayFormatted = computed(() => {
    const s = this.onlineTodaySeconds();
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
    return `${h}h ${m}m`;
  });

  private async _startOnlineTimer() {
    const driver = this.driverData();
    if (!driver) return;
    const refresh = async () => {
      try {
        const sec = await this.agService.getTodayOnlineSeconds(driver.id);
        this.onlineTodaySeconds.set(sec);
        // Modo descanso: alerta a las 8h (28800s), obligatorio a las 10h (36000s)
        if (sec >= 36000 && !this.restEnforced()) {
          this.restEnforced.set(true);
          alert('🛏️ Has trabajado 10 horas seguidas. Por tu seguridad te ponemos fuera de línea. Descansa al menos 30 minutos antes de volver a conectarte.');
          await this.toggleOnline();
        } else if (sec >= 28800 && !this.restWarned()) {
          this.restWarned.set(true);
          alert('⚠️ Llevas 8 horas trabajando. Te recomendamos descansar pronto. En 2 horas te desconectaremos automáticamente por seguridad.');
        }
      } catch {}
    };
    await refresh();
    this._onlineTimer = setInterval(refresh, 30000);
  }

  restWarned = signal(false);
  restEnforced = signal(false);

  private _stopOnlineTimer() {
    if (this._onlineTimer) { clearInterval(this._onlineTimer); this._onlineTimer = null; }
  }

  private startGpsTracking(driverId: string): void {
    if (!navigator.geolocation) {
      alert('Tu dispositivo no soporta GPS. No podrás recibir solicitudes.');
      return;
    }

    // Enviar posición inicial solo si la precisión es real (≤50m, no lectura de red/IP)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (pos.coords.accuracy <= 50) {
          this.agService.updateDriverLocation(driverId, pos.coords.latitude, pos.coords.longitude, pos.coords.heading);
        }
      },
      (err) => {
        console.error('GPS inicial falló:', err.message);
        if (err.code === err.PERMISSION_DENIED) {
          alert('Permiso de GPS denegado. Activa la ubicación para recibir solicitudes.');
          this.driverOnline.set(false);
          this.agService.setDriverOnline(driverId, false);
        }
      },
      { enableHighAccuracy: true, timeout: 30000, maximumAge: 5000 }
    );

    // Tracking continuo — solo actualizar con lecturas de precisión real
    this._gpsWatchId = navigator.geolocation.watchPosition(
      (pos) => {
        if (pos.coords.accuracy > 50) return; // rechazar lecturas de red imprecisas (>50m)
        this.agService.updateDriverLocation(driverId, pos.coords.latitude, pos.coords.longitude, pos.coords.heading);
        this._updateNavFromGps(pos.coords.latitude, pos.coords.longitude);
      },
      (err) => {
        console.error('GPS tracking error:', err.message);
        if (err.code === err.PERMISSION_DENIED) {
          this.stopGpsTracking();
          this.driverOnline.set(false);
          this.agService.setDriverOnline(driverId, false);
          alert('Se perdió el acceso al GPS. Te pusimos fuera de línea.');
        }
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 30000 }
    );

    // Background tracking con Capacitor (solo app nativa Android/iOS)
    this._startBackgroundTracking(driverId).catch(() => {});
    // Web Push para navegadores (funciona con app cerrada)
    this._autoRegisterWebPush().catch(() => {});
  }

  async fixPushNotifications(): Promise<void> {
    this.pushDiagStatus.set('checking');
    this.pushDiagLabel.set('Activando...');
    this.cdr.markForCheck();
    this._nativePushRegistered = false;
    await this._registerNativePush();
  }

  private _nativePushRegistered = false;
  private async _registerNativePush(): Promise<void> {
    if (this._nativePushRegistered) return;

    const cap = (window as any)?.Capacitor;
    if (!cap?.isNativePlatform?.()) {
      this.pushDiagStatus.set('error');
      this.pushDiagLabel.set('Notificaciones solo funcionan en la app nativa (APK)');
      this.cdr.markForCheck();
      return;
    }

    const PP = cap.Plugins?.PushNotifications;
    if (!PP) {
      this.pushDiagStatus.set('error');
      this.pushDiagLabel.set('Plugin FCM no encontrado — reinstala la app');
      this.cdr.markForCheck();
      return;
    }

    try {
      const perm = await PP.checkPermissions();
      if (perm.receive === 'denied') {
        this.pushDiagStatus.set('denied');
        this.pushDiagLabel.set('Permiso denegado — ve a Ajustes del celular → Apps → Movi → Notificaciones y actívalas');
        this.cdr.markForCheck();
        return;
      }
      if (perm.receive !== 'granted') {
        const req = await PP.requestPermissions();
        if (req.receive !== 'granted') {
          this.pushDiagStatus.set('error');
          this.pushDiagLabel.set('Debes aceptar los permisos de notificación');
          this.cdr.markForCheck();
          return;
        }
      }

      await PP.removeAllListeners().catch(() => {});

      PP.addListener('registration', async (token: { value: string }) => {
        if (!token?.value) return;
        this._nativePushRegistered = true;
        try {
          await this.agService.registerFcmToken(token.value);
          this.pushDiagStatus.set('ok');
          this.pushDiagLabel.set('✓ Activo — recibirás solicitudes aunque la app esté cerrada');
          this.cdr.markForCheck();
        } catch {
          setTimeout(() => this.agService.registerFcmToken(token.value).catch(() => {}), 5000);
        }
      });

      PP.addListener('registrationError', (err: any) => {
        this._nativePushRegistered = false;
        this.pushDiagStatus.set('error');
        this.pushDiagLabel.set('Error al registrar FCM: ' + (err?.error ?? JSON.stringify(err)));
        this.cdr.markForCheck();
      });

      PP.addListener('pushNotificationReceived', (n: any) => {
        this._notifyNewTrip({ offered_price: n?.data?.price, distance_km: n?.data?.dist });
      });

      PP.addListener('pushNotificationActionPerformed', (ev: any) => {
        const url = ev?.notification?.data?.url;
        if (url) window.location.href = url;
      });

      this.pushDiagStatus.set('checking');
      this.pushDiagLabel.set('Registrando con Firebase...');
      this.cdr.markForCheck();
      await PP.register();

    } catch (e: any) {
      this.pushDiagStatus.set('error');
      this.pushDiagLabel.set('Error: ' + (e?.message ?? String(e)));
      this.cdr.markForCheck();
    }
  }

  private _audioCtx: AudioContext | null = null;
  private _getAudioCtx(): AudioContext | null {
    try {
      if (!this._audioCtx || this._audioCtx.state === 'closed') {
        this._audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      return this._audioCtx;
    } catch { return null; }
  }

  private _notifyNewTrip(req: any): void {
    if (typeof window === 'undefined') return;

    // 1. Vibración fuerte — funciona en background con foreground service
    try {
      navigator.vibrate?.([500, 100, 500, 100, 500, 100, 800]);
    } catch {}

    // 2. Sonido — reusar AudioContext y forzar resume (necesario en background)
    try {
      const ctx = this._getAudioCtx();
      if (ctx) {
        const play = () => {
          // 3 pitidos descendentes: agudo → medio → agudo
          [[880, 0], [660, 0.2], [880, 0.4]].forEach(([freq, when]) => {
            const osc  = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.frequency.value = freq;
            gain.gain.setValueAtTime(0.8, ctx.currentTime + when);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + when + 0.18);
            osc.start(ctx.currentTime + when);
            osc.stop(ctx.currentTime + when + 0.2);
          });
        };
        if (ctx.state === 'suspended') {
          ctx.resume().then(play).catch(() => {});
        } else {
          play();
        }
      }
    } catch {}

    // 3. Audio HTML como fallback (más compatible con background)
    try {
      const a = new Audio('/notification.wav');
      a.volume = 1;
      a.play().catch(() => {});
    } catch {}

    // Pedir permiso si aún no se ha otorgado (solo una vez)
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }
  }

  private async _autoRegisterWebPush(): Promise<void> {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
    const vapid = (environment as any).vapidPublicKey;
    if (!vapid) return;
    try {
      const reg = await navigator.serviceWorker.register('/sw-movi.js');
      await navigator.serviceWorker.ready;

      // Si ya tiene suscripción activa, solo actualizar el signal y salir
      const existing = await reg.pushManager.getSubscription();
      if (existing) {
        this.pushEnabled.set(true);
        // Re-guardar por si cambió el user (sesión nueva)
        await this.agService.registerPushSubscription(existing).catch(() => {});
        return;
      }

      // Pedir permiso — si el usuario lo niega, no molestamos con alerts
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') return;

      const key = this._urlB64ToUint8(vapid);
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: key.buffer as ArrayBuffer,
      });
      await this.agService.registerPushSubscription(sub);
      this.pushEnabled.set(true);
    } catch (e) { console.warn('web push auto-register:', e); }
  }

  private _bgWatcherId: string | null = null;
  private _bgLastCheck = 0;
  private _bgNotifiedIds = new Set<string>();

  private async _startBackgroundTracking(driverId: string): Promise<void> {
    try {
      const w = window as any;
      const cap = w.Capacitor;
      if (!cap?.isNativePlatform?.()) return;
      const BackgroundGeolocation = cap.Plugins?.BackgroundGeolocation;
      if (!BackgroundGeolocation) return;
      const distanceFilter = await this.agService.getDistanceFilter();
      this._bgWatcherId = await BackgroundGeolocation.addWatcher({
        backgroundMessage: 'Movi Conductor: hay solicitudes disponibles',
        backgroundTitle: '🚗 Movi — En línea',
        requestPermissions: true,
        stale: false,
        distanceFilter,
      }, async (location: any, error: any) => {
        if (error) return;
        if (!location) return;

        // Actualizar posición GPS
        if (location.accuracy == null || location.accuracy <= 50) {
          this.agService.updateDriverLocation(driverId, location.latitude, location.longitude, location.bearing ?? 0);
        }

        // Revisar nuevas solicitudes cada vez que llega una posición GPS
        // (el callback GPS corre incluso con la app en background)
        const now = Date.now();
        if (now - this._bgLastCheck < 15000) return; // máximo 1 vez cada 15s
        this._bgLastCheck = now;

        try {
          const driver = this.driverData();
          const vt = driver?.vehicle_type === 'moto' ? 'moto' : 'carro';
          const reqs = await this.agService.getSearchingRequests(vt, location.latitude, location.longitude);
          const newOnes = (reqs as any[]).filter(r => !this._bgNotifiedIds.has(r.id));
          if (newOnes.length > 0) {
            newOnes.forEach(r => this._bgNotifiedIds.add(r.id));
            // Limpiar IDs viejos para no crecer indefinidamente
            if (this._bgNotifiedIds.size > 50) this._bgNotifiedIds.clear();
            this._notifyNewTrip(newOnes[0]);
          }
        } catch {}
      });
    } catch (e) { console.warn('BG geo init:', e); }
  }

  private async _stopBackgroundTracking(): Promise<void> {
    try {
      const w = window as any;
      const BackgroundGeolocation = w.Capacitor?.Plugins?.BackgroundGeolocation;
      if (BackgroundGeolocation && this._bgWatcherId) {
        await BackgroundGeolocation.removeWatcher({ id: this._bgWatcherId });
        this._bgWatcherId = null;
      }
    } catch {}
  }

  private stopGpsTracking(): void {
    if (this._gpsWatchId !== null) {
      navigator.geolocation.clearWatch(this._gpsWatchId);
      this._gpsWatchId = null;
    }
    this._stopBackgroundTracking();
  }

  async savePreferences() {
    const driver = this.driverData();
    if (!driver) return;
    this.savingPrefs.set(true);
    const p = this.driverPrefs();
    const s = this.driverSettings();
    await this.agService.updateDriverPreferences(driver.id, {
      max_distance_km:    p.maxDistance,
      accepts_pets:       p.acceptsPets,
      accepts_luggage:    p.acceptsLuggage,
      accepts_child_seat: p.acceptsChildSeat,
      hide_phone:         s.hidePhone,
      notify_sound:       s.notifySound,
      notify_vibration:   s.notifyVibration,
    });
    this.savingPrefs.set(false);
  }

  async saveSettings() {
    await this.savePreferences();
    this.savingSettings.set(true);
    await new Promise(r => setTimeout(r, 300));
    this.savingSettings.set(false);
  }

  activatePanic() {
    this.panicActivated.set(true);
    // Llamada de emergencia al 123 (Colombia)
    if (typeof window !== 'undefined') {
      const contacts = this.emergencyContacts();
      if (contacts.length > 0) {
        window.open(`tel:${contacts[0].phone}`, '_self');
      }
    }
  }

  addEmergencyContact() {
    if (!this.newContactName.trim() || !this.newContactPhone.trim()) return;
    this.emergencyContacts.update(list => [...list, { name: this.newContactName.trim(), phone: this.newContactPhone.trim() }]);
    this.newContactName = '';
    this.newContactPhone = '';
  }

  removeEmergencyContact(phone: string) {
    this.emergencyContacts.update(list => list.filter(c => c.phone !== phone));
  }

  async submitReport(type: 'incident' | 'passenger') {
    const text = type === 'incident' ? this.reportIncidentText.trim() : this.reportPassengerText.trim();
    if (!text) { alert('Escribe una descripción del reporte.'); return; }

    const profile = this.agProfile();
    if (!profile) { alert('No se pudo identificar tu perfil.'); return; }

    const result = await this.agService.submitReport(profile.id, type, text);
    if (result.success) {
      if (type === 'incident') this.reportIncidentText = '';
      else this.reportPassengerText = '';
      alert('Reporte enviado. Nuestro equipo lo revisará en las próximas 24 horas.');
    } else {
      alert('Error al enviar el reporte. Intenta de nuevo.');
    }
  }

  private _resetTrip() {
    this._stopWaiting();
    this._unsubscribeOffers();
    this.stopDriverTracking();
    this._stopTrackingAssignedDriver();
    this.passengerMapFullscreen.set(false);
    this.currentTripStage.set(null);
    this._clearNavRoute();
    this.tripDest.set(null);
    this.tripSent.set(false);
    this.tripOpen.set(false);
    this.tripQuery.set('');
    this.tripSuggestions.set([]);
    this.tripDistKm.set(0);
    this.tripPrice.set(0);
    this.waitingDriverCount.set(0);
    this.waitingDriverColors.set([]);
    this.autoAccept.set(false);
    this.currentTripRequestId.set(null);
    this.receivedOffers.set([]);
    this.tripAccepted.set(null);
    this.acceptingOfferId.set(null);
    this.offerAcceptError.set(null);
    this._clearRoute();
    // Limpiar estado persistido del viaje
    if (typeof localStorage !== 'undefined') localStorage.removeItem('movi_active_trip');
  }

  scrollIcons(px: number) {
    document.getElementById('ag-icons-scroll')?.scrollBy({ left: px, behavior: 'smooth' });
  }

  openTripSearch() {
    this.tripOpen.set(true);
    this._loadRecentDests();
    if (isPlatformBrowser(this.platformId)) this._loadGoogleMapsSDK();
  }
  closeTripSearch() {
    this._tripRaw = '';
    this.tripQuery.set('');
    this.tripInputHasText.set(false);
    this.tripOpen.set(false);
    this.tripSuggestions.set([]);
    const el = document.querySelector<HTMLInputElement>('[placeholder="Busca o pega tu destino..."]');
    if (el) el.value = '';
  }

  onTripQueryInput(val: string) {
    // CERO signal updates aquí — evita re-render que rompe el IME Android
    this._tripRaw = val;
    if (this._tripDebounceTimer) clearTimeout(this._tripDebounceTimer);
    if (!val.trim() || val.length < 2) {
      this._tripDebounceTimer = setTimeout(() => {
        if (this.tripSuggestions().length) this.tripSuggestions.set([]);
        this.tripNoResults.set(false);
      }, 0);
      return;
    }
    this._tripDebounceTimer = setTimeout(() => {
      this.tripQuery.set(val);
      this.tripLoading.set(true);
      this._searchGooglePlaces(val);
    }, 350);
  }

  /** Carga el SDK de Google Maps una sola vez de forma lazy */
  private _loadGoogleMapsSDK(): Promise<boolean> {
    if (this._gmapsPromise) return this._gmapsPromise;
    this._gmapsPromise = new Promise<boolean>((resolve) => {
      if ((window as any).google?.maps?.places) { resolve(true); return; }
      const script = document.createElement('script');
      script.src = 'https://maps.googleapis.com/maps/api/js?key=AIzaSyBLDiN9C3SMSKnitd_aGryhilPb4JwBbto&libraries=places,geometry&language=es';
      script.async = true;
      const timeout = setTimeout(() => { this._gmapsPromise = null; resolve(false); }, 4000);
      script.onload = () => {
        clearTimeout(timeout);
        const check = (n = 0) => {
          if ((window as any).google?.maps?.places) { resolve(true); return; }
          if (n > 20) { resolve(false); return; }
          setTimeout(() => check(n + 1), 100);
        };
        check();
      };
      script.onerror = () => { clearTimeout(timeout); this._gmapsPromise = null; resolve(false); };
      document.head.appendChild(script);
    });
    return this._gmapsPromise;
  }

  /** Inicializa los servicios de Google Places */
  private _initGooglePlaces() {
    const gmaps = (window as any).google.maps;
    this._autocompleteService = new gmaps.places.AutocompleteService();
    const div = document.createElement('div');
    this._placesService = new gmaps.places.PlacesService(div);
    this._placesSessionToken = new gmaps.places.AutocompleteSessionToken();
  }

  /** Busca sugerencias vía Google Places + Nominatim en paralelo para cobertura completa de barrios */
  private async _searchGooglePlaces(query: string) {
    if (!isPlatformBrowser(this.platformId)) return;

    const hasGps = this._gpsRealFix;

    // Google Places y Nominatim en paralelo
    const [sdkOk, nomSugs] = await Promise.all([
      this._loadGoogleMapsSDK(),
      this._fetchNominatimSuggestions(query),
    ]);

    if (!sdkOk) {
      // Sin Google SDK: usar solo Nominatim
      this.tripLoading.set(false);
      const results = nomSugs.map(n => ({ id: n.place_id, ...n, _rawTypes: [] }));
      this.tripSuggestions.set(results);
      this.tripNoResults.set(results.length === 0);
      this.cdr.markForCheck();
      return;
    }
    if (!this._autocompleteService) this._initGooglePlaces();

    const request: any = {
      input: query,
      componentRestrictions: { country: 'co' },
      sessionToken: this._placesSessionToken,
    };
    if (hasGps) {
      const gmaps = (window as any).google.maps;
      const d = 0.1;
      request.bounds = new gmaps.LatLngBounds(
        new gmaps.LatLng(this._currentLat - d, this._currentLng - d),
        new gmaps.LatLng(this._currentLat + d, this._currentLng + d)
      );
    }

    this._autocompleteService.getPlacePredictions(request, (predictions: any[], status: string) => {
      this.tripLoading.set(false);

      // Resultados Google (filtrados por ciudad)
      const city = this._cityFromGps.toLowerCase();
      const googlePreds = (status === 'OK' && predictions?.length)
        ? (() => { const loc = city ? predictions.filter((p: any) => p.description?.toLowerCase().includes(city)) : predictions; return (loc.length > 0 ? loc : predictions); })()
        : [];
      const googleItems = googlePreds.slice(0, 5).map((p: any) => ({
        id: p.place_id, place_id: p.place_id,
        text: p.structured_formatting?.main_text ?? p.description,
        place_name: p.structured_formatting?.secondary_text ?? '',
        lat: null as number | null, lng: null as number | null,
        distanceKm: null as number | null, _rawTypes: p.types,
      }));

      // Fusionar con Nominatim: llenar huecos con barrios que Google no retornó
      const merged = [...googleItems];
      for (const n of nomSugs) {
        if (merged.length >= 6) break;
        const key = n.text.toLowerCase().split(',')[0].trim();
        if (!merged.some(g => g.text.toLowerCase().includes(key) || key.includes(g.text.toLowerCase()))) {
          merged.push({ id: n.place_id, ...n, _rawTypes: [] });
        }
      }

      // Si no hubo resultados de ninguna fuente
      if (merged.length === 0) { this._searchNominatimFallback(query); return; }

      const results = merged.slice(0, 6);
      this.tripSuggestions.set(results);
      this.tripNoResults.set(false);
      this.cdr.markForCheck();

      // Enriquecer con distancia via getDetails + computeDistanceBetween
      if (hasGps) {
        const gmaps   = (window as any).google.maps;
        const userPos = new gmaps.LatLng(this._currentLat, this._currentLng);
        const detailsService = this._placesService;

        Promise.allSettled(
          googlePreds.slice(0, 5).map((p: any) =>
            new Promise<{ place_id: string; distanceKm: number }>((resolve, reject) => {
              detailsService.getDetails(
                { placeId: p.place_id, fields: ['geometry'] },
                (res: any, st: string) => {
                  if (st !== 'OK' || !res?.geometry?.location) { reject(st); return; }
                  const dist = gmaps.geometry.spherical.computeDistanceBetween(userPos, res.geometry.location);
                  resolve({ place_id: p.place_id, distanceKm: Math.round(dist / 100) / 10 });
                }
              );
            })
          )
        ).then((settled) => {
          const distances: Record<string, number> = {};
          for (const r of settled) {
            if (r.status === 'fulfilled') distances[r.value.place_id] = r.value.distanceKm;
          }
          const current = this.tripSuggestions();
          if (current.length) {
            this.tripSuggestions.set(current.map(s => ({
              ...s,
              distanceKm: distances[s.place_id] ?? null,
            })));
            this.cdr.markForCheck();
          }
        });
      }
    });
  }

  /** Fallback Nominatim OSM cuando Google Places no retorna resultados */
  private async _searchNominatimFallback(query: string) {
    try {
      const params = new URLSearchParams({
        q: query, format: 'json', countrycodes: 'co', limit: '5', addressdetails: '1',
      });
      if (this._gpsRealFix) {
        params.set('viewbox', `${this._currentLng - 0.5},${this._currentLat + 0.5},${this._currentLng + 0.5},${this._currentLat - 0.5}`);
        params.set('bounded', '1');
      }
      const res  = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
        headers: { 'Accept-Language': 'es' },
      });
      const data = await res.json();
      const hasGps = this._gpsRealFix;
      const results = (data ?? []).slice(0, 5).map((r: any) => {
        const rLat = parseFloat(r.lat), rLng = parseFloat(r.lon);
        let distanceKm: number | null = null;
        if (hasGps) {
          // haversine (Google Maps puede no estar cargado en el fallback)
          const R = 6371, dLat = (rLat - this._currentLat) * Math.PI / 180;
          const dLng = (rLng - this._currentLng) * Math.PI / 180;
          const a = Math.sin(dLat/2)**2 + Math.cos(this._currentLat*Math.PI/180)*Math.cos(rLat*Math.PI/180)*Math.sin(dLng/2)**2;
          distanceKm = Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)) * 10) / 10;
        }
        // Usar campos estructurados de address para evitar mostrar código postal
        const addr = r.address ?? {};
        const neighbourhood = addr.neighbourhood ?? addr.suburb ?? addr.quarter ?? addr.hamlet ?? null;
        const city = addr.city ?? addr.town ?? addr.municipality ?? addr.village ?? null;
        const placeParts = [neighbourhood, city].filter(Boolean);
        const placeName = placeParts.length > 0
          ? placeParts.join(', ')
          : r.display_name.split(',').filter((p: string) => !/^\s*\d{4,6}\s*$/.test(p)).slice(1, 3).join(',').trim();
        return {
          id: r.place_id, place_id: `nominatim_${r.place_id}`,
          text: r.display_name.split(',')[0],
          place_name: placeName,
          lat: rLat, lng: rLng, distanceKm, _rawTypes: [] as string[],
        };
      });
      this.tripSuggestions.set(results);
      this.tripNoResults.set(results.length === 0);
      this.cdr.markForCheck();
    } catch {
      this.tripSuggestions.set([]);
      this.tripNoResults.set(true);
      this.cdr.markForCheck();
    }
  }

  private _detectedCity(): string {
    const addr = this.currentAddress() ?? '';
    const cities = ['Bogotá','Medellín','Cali','Barranquilla','Cartagena','Bucaramanga',
      'Pereira','Manizales','Cúcuta','Ibagué','Neiva','Villavicencio','Armenia','Pasto','Montería'];
    for (const c of cities) {
      if (addr.toLowerCase().includes(c.toLowerCase())) return c;
    }
    return '';
  }


  async selectTripDest(s: any) {
    this.tripOpen.set(false);
    this.tripQuery.set('');
    this.tripSuggestions.set([]);

    // Renovar session token después de seleccionar
    if ((window as any).google?.maps?.places) {
      this._placesSessionToken = new (window as any).google.maps.places.AutocompleteSessionToken();
    }

    const name = s.text || s.place_name || 'Destino';

    // Si ya tiene coordenadas (Nominatim fallback), úsalas directo
    if (s.lat != null && s.lng != null) {
      this.tripDest.set({ name, lat: s.lat, lng: s.lng });
      this._saveRecentDest({ name, lat: s.lat, lng: s.lng });
      this.cdr.markForCheck();
      this._drawRoute(s.lng, s.lat);
      return;
    }

    // Google Place: obtener coordenadas con PlacesService.getDetails
    try {
      await this._loadGoogleMapsSDK();
      if (!this._placesService) this._initGooglePlaces();
      const details = await new Promise<any>((resolve, reject) => {
        this._placesService.getDetails(
          { placeId: s.place_id, fields: ['geometry'], sessionToken: this._placesSessionToken },
          (result: any, status: string) => status === 'OK' ? resolve(result) : reject(status),
        );
      });
      const loc = details.geometry?.location;
      if (loc) {
        this.tripDest.set({ name, lat: loc.lat(), lng: loc.lng() });
        this._saveRecentDest({ name, lat: loc.lat(), lng: loc.lng() });
        this.cdr.markForCheck();
        this._drawRoute(loc.lng(), loc.lat());
      }
    } catch {
      // Si falla getDetails, intenta Nominatim geocoding como fallback
      try {
        const res  = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(name)}&format=json&countrycodes=co&limit=1`);
        const data = await res.json();
        if (data?.[0]) {
          const lat = parseFloat(data[0].lat), lng = parseFloat(data[0].lon);
          this.tripDest.set({ name, lat, lng });
          this.cdr.markForCheck();
          this._drawRoute(lng, lat);
        }
      } catch { /* nada */ }
    }
  }

  setTripVehicle(type: 'carro' | 'moto' | 'camion') {
    this.tripVehicle.set(type);
    this.tripPrice.set(this._calcPrice(this.tripDistKm(), type));
  }

  adjustTripPrice(delta: number) {
    const newPrice = Math.max(2000, this.tripPrice() + delta);
    this.tripPrice.set(newPrice);
    // Persistir en BD para que los conductores vean el precio actualizado
    const tripId = this.currentTripRequestId();
    if (tripId) this.agService.updateTripOfferedPrice(tripId, newPrice).catch(() => {});
  }

  adjustTripPriceSmart(dir: 1 | -1) {
    const p = this.tripPrice();
    const step = p < 8000 ? 500 : p < 20000 ? 1000 : 2000;
    const newPrice = Math.max(2000, p + dir * step);
    this.tripPrice.set(newPrice);
    const tripId = this.currentTripRequestId();
    if (tripId) this.agService.updateTripOfferedPrice(tripId, newPrice).catch(() => {});
  }

  setTripPricePreset(pct: number) {
    const base = this._calcPrice(this.tripDistKm(), this.tripVehicle());
    this.tripPrice.set(Math.max(2000, Math.round(base * (1 + pct) / 500) * 500));
  }

  readonly tripSliderMax = computed(() =>
    Math.max(this._calcPrice(this.tripDistKm(), this.tripVehicle()) * 2, 30000),
  );

  async findOffers() {
    const dest = this.tripDest();
    if (!dest) return;
    // Bloquear si GPS denegado O si aún no tenemos una lectura de precisión real
    // (evita enviar coords por defecto de Bogotá como origen del viaje)
    if (this.gpsStatus() === 'denied' || !this._gpsRealFix) {
      this.tripGpsError.set(true);
      setTimeout(() => this.tripGpsError.set(false), 4000);
      return;
    }
    this.tripGpsError.set(false);
    this.tripRequestError.set(null);
    this.tripSending.set(true);
    const profile = this.agProfile();
    if (!profile) {
      this.tripSending.set(false);
      this.tripRequestError.set('Debes registrarte antes de solicitar un viaje.');
      setTimeout(() => this.tripRequestError.set(null), 5000);
      return;
    }
    const result = await this.agService.requestTrip({
      passengerUserId: profile.id,
      passengerName: profile.full_name || undefined,
      passengerSelfieUrl: profile.selfie_url || undefined,
      originLat: this._currentLat, originLng: this._currentLng,
      originName: [this.currentNeighborhood(), this.currentAddress()].filter(Boolean).join(' — ') || undefined,
      destName: dest.name, destLat: dest.lat, destLng: dest.lng,
      distanceKm: this.tripDistKm(),
      vehicleType: this.tripVehicle(),
      offeredPrice: this.tripPrice(),
      paymentMethod: this.tripPayment(),
    });
    this.tripSending.set(false);
    if (!result.success || !result.tripId) {
      this.tripRequestError.set(result.error ?? 'Error al crear el viaje. Intenta de nuevo.');
      setTimeout(() => this.tripRequestError.set(null), 5000);
      return;
    }
    this.currentTripRequestId.set(result.tripId);
    this.receivedOffers.set([]);
    this.tripAccepted.set(null);
    // Aplicar cupón si hay uno
    const ac = this.appliedCoupon();
    if (ac) {
      try { await this.agService.applyCoupon(ac.couponId, result.tripId, ac.discount); } catch {}
    }
    this._subscribeToOffers(result.tripId);
    // Persistir estado de búsqueda para restaurar si el pasajero cierra la app
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('movi_active_trip', JSON.stringify({
        tripId: result.tripId, status: 'searching', ts: Date.now(),
        dest: this.tripDest(), price: this.tripPrice(), vehicle: this.tripVehicle(), payment: this.tripPayment(),
      }));
    }
    this._autoAssignNearestDrivers(result.tripId, this._currentLat, this._currentLng, this.tripVehicle(), this.tripPrice());
    this.tripSent.set(true);
    this._startWaiting();
  }

  private _startWaiting() {
    this._stopWaiting();
    const total = 90;
    const driverTimes = [4, 12, 21, 32, 45];
    const palette = ['#1D4ED8','#DC2626','#15803D','#7C3AED','#EA580C'];
    let elapsed = 0;
    this.waitingCountdown.set(total);
    this.waitingProgress.set(0);
    this.waitingDriverCount.set(0);
    this.waitingDriverColors.set([]);
    this._waitingInterval = setInterval(() => {
      elapsed++;
      this.waitingCountdown.set(Math.max(0, total - elapsed));
      this.waitingProgress.set(Math.min(100, (elapsed / total) * 100));
      if (driverTimes.includes(elapsed)) {
        const n = this.waitingDriverCount();
        this.waitingDriverCount.set(n + 1);
        this.waitingDriverColors.update(arr => [...arr, palette[n % palette.length]]);
      }
      if (elapsed >= total) {
        this._stopWaiting();
        // El viaje sigue activo — solo el pasajero puede cancelarlo manualmente
      }
    }, 1000);
  }

  private _stopWaiting() {
    if (this._waitingInterval !== null) { clearInterval(this._waitingInterval); this._waitingInterval = null; }
  }

  // ── Realtime offer subscription ────────────────────────────────
  private _subscribeToOffers(tripId: string) {
    if (!isPlatformBrowser(this.platformId)) return;
    this._unsubscribeOffers();
    this._offerChannel = this.agService.subscribeToOffers(tripId, async (offer) => {
      // Enriquecer con info pública del conductor (rating + trips)
      try {
        const info = await this.getDriverPublic(offer.driver_id);
        if (info && offer.ag_drivers) {
          (offer.ag_drivers as any).rating_avg = info.rating_avg;
          (offer.ag_drivers as any).rating_count = info.rating_count;
          (offer.ag_drivers as any).trips_completed = info.trips_completed;
          if (info.driver_photo) (offer.ag_drivers as any).ag_users.selfie_url = info.driver_photo;
        }
      } catch {}
      // Calcular ETA del conductor al pasajero
      try {
        const loc = await this.agService.getDriverLocation(offer.driver_id);
        if (loc) {
          const R = 6371;
          const dLat = (loc.lat - this._currentLat) * Math.PI / 180;
          const dLng = (loc.lng - this._currentLng) * Math.PI / 180;
          const a = Math.sin(dLat/2)**2 + Math.cos(this._currentLat*Math.PI/180)*Math.cos(loc.lat*Math.PI/180)*Math.sin(dLng/2)**2;
          const distKm = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
          const etaMin = Math.max(1, Math.round(distKm / 30 * 60));
          this.driverEtaMin.update(m => ({ ...m, [offer.id]: etaMin }));
        }
      } catch {}
      this.receivedOffers.update(list => {
        const idx = list.findIndex(o => o.id === offer.id);
        if (idx >= 0) { const nl = [...list]; nl[idx] = offer; return nl; }
        return [...list, offer];
      });
      this.cdr.markForCheck();
    });
    // Timer 1s para la barra de progreso y auto-expirar ofertas > 4 min
    if (this._offerTimerInterval) clearInterval(this._offerTimerInterval);
    this._offerTimerInterval = setInterval(() => {
      const now = Date.now();
      this.reqNowMs.set(now);
      const hasExpired = this.receivedOffers().some(o => now - new Date(o.created_at).getTime() > 240000);
      if (hasExpired) {
        this.receivedOffers.update(list => list.filter(o => now - new Date(o.created_at).getTime() <= 240000));
        this.cdr.markForCheck();
      }
    }, 1000);
  }

  private _unsubscribeOffers() {
    if (this._offerChannel) {
      this._offerChannel.unsubscribe();
      this._offerChannel = null;
    }
    if (this._offerTimerInterval) { clearInterval(this._offerTimerInterval); this._offerTimerInterval = null; }
  }

  // ── Accept / reject offer (passenger) ─────────────────────────
  async acceptOfferCard(offer: AgTripOffer) {
    this.acceptingOfferId.set(offer.id);
    this.offerAcceptError.set(null);
    let result: { success: boolean; error?: string };
    try {
      result = await this._withTimeout(this.agService.acceptOffer(offer.id));
    } catch (e: any) {
      this.acceptingOfferId.set(null);
      this.offerAcceptError.set(e?.message ?? 'Error al aceptar la oferta. Intenta de nuevo.');
      setTimeout(() => this.offerAcceptError.set(null), 5000);
      return;
    }
    if (!result.success) {
      this.acceptingOfferId.set(null);
      this.offerAcceptError.set(result.error ?? 'No se pudo aceptar la oferta.');
      setTimeout(() => this.offerAcceptError.set(null), 5000);
      return;
    }
    this._stopWaiting();
    this._unsubscribeOffers();
    this.tripAccepted.set(offer);
    this.tripSent.set(false);
    const tripId = (offer as any).trip_request_id ?? this.currentTripRequestId();
    // Persistir estado del viaje para recuperación tras crash
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('movi_active_trip', JSON.stringify({
        tripId, driverId: offer.driver_id, offerId: offer.id, status: 'accepted', ts: Date.now(),
        dest: this.tripDest(), price: this.tripPrice(), vehicle: this.tripVehicle(), payment: this.tripPayment(),
      }));
    }
    this._startTrackingAssignedDriver(offer.driver_id);
    // Pasajero escucha canal passenger-live-${authId} — misma lógica que driver-live para conductor
    const myAuthId = this.agProfile()?.auth_user_id;
    if (myAuthId) {
      if (this._passengerLiveChannel) { this._passengerLiveChannel.unsubscribe(); }
      this._passengerLiveChannel = this.agService.subscribeToPassengerBroadcast(
        myAuthId,
        () => { this._applyPassengerBoarding(); },
        () => {
          // Conductor finalizó → pasajero muestra recibo y rating (backup, ya manejado por _tripStageChannel)
          if (this.tripAccepted() && !this.tripReceiptModal()) {
            this._showTripReceipt('passenger');
          }
        },
      );
    }
    if (tripId && offer.driver_id) {
      this.startDriverTracking(offer.driver_id, tripId);
    }
    // Suscripción de fondo al chat para que el badge de no leídos funcione
    if (tripId) {
      this.startPassengerChatBackground(tripId);
    }
    // Broadcast directo al conductor (no depende de RLS)
    if (offer.driver_id && tripId) {
      this.agService.broadcastOfferAccepted(offer.driver_id, offer.id, tripId);
    }
    // Notificar al conductor — con logging de error
    try {
      const driverAuthUserId = (offer as any)?.ag_drivers?.ag_users?.auth_user_id;
      if (driverAuthUserId) {
        this.agService.sendPush({
          userIds: [driverAuthUserId],
          title: '🎉 Tu oferta fue aceptada',
          body: 'Dirígete al punto de recogida. Revisa detalles en la app.',
          tag: `offer-accepted-${offer.id}`, urgent: true,
        }).catch((e) => console.error('[Movi] Push al conductor falló:', e));
      }
    } catch (e) { console.error('[Movi] sendPush error:', e); }
    this.acceptingOfferId.set(null);
  }

  /** Restaura el estado del viaje activo si la app se cerró durante un viaje */
  private async _restoreActiveTrip(): Promise<void> {
    if (typeof localStorage === 'undefined') return;
    const raw = localStorage.getItem('movi_active_trip');
    if (!raw) return;
    try {
      const saved = JSON.parse(raw) as {
        tripId: string; driverId?: string; offerId?: string; status?: string; ts: number;
        dest?: { name: string; lat: number; lng: number } | null;
        price?: number; vehicle?: 'carro' | 'moto' | 'camion'; payment?: AgPaymentMethod;
      };
      // Ignorar si tiene más de 2 horas (viaje muy viejo)
      if (Date.now() - saved.ts > 2 * 60 * 60 * 1000) { localStorage.removeItem('movi_active_trip'); return; }
      // Verificar estado actual en BD
      const { data: trip } = await getMoviClient()
        .from('ag_trip_requests').select('id, status, accepted_offer_id').eq('id', saved.tripId).maybeSingle();
      if (!trip || ['cancelled', 'completed'].includes(trip.status)) {
        localStorage.removeItem('movi_active_trip'); return;
      }
      // Restaurar datos del viaje comunes a ambos estados
      if (saved.dest) this.tripDest.set(saved.dest);
      if (saved.price) this.tripPrice.set(saved.price);
      if (saved.vehicle) this.tripVehicle.set(saved.vehicle);
      if (saved.payment) this.tripPayment.set(saved.payment);
      // Si el viaje sigue buscando conductor: re-suscribir a ofertas y cargar las ya recibidas
      if (trip.status === 'searching') {
        this.currentTripRequestId.set(saved.tripId);
        this.tripSent.set(true);
        this.tripAccepted.set(null);
        this._subscribeToOffers(saved.tripId);
        const existingOffers = await this.agService.getOffersForTrip(saved.tripId);
        if (existingOffers.length > 0) {
          // Calcular ETA para cada oferta ya existente
          for (const offer of existingOffers) {
            try {
              const loc = await this.agService.getDriverLocation(offer.driver_id);
              if (loc) {
                const R = 6371;
                const dLat = (loc.lat - this._currentLat) * Math.PI / 180;
                const dLng = (loc.lng - this._currentLng) * Math.PI / 180;
                const a = Math.sin(dLat / 2) ** 2 + Math.cos(this._currentLat * Math.PI / 180) * Math.cos(loc.lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
                const distKm = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
                this.driverEtaMin.update(m => ({ ...m, [offer.id]: Math.max(1, Math.round(distKm / 30 * 60)) }));
              }
            } catch {}
          }
          this.receivedOffers.set(existingOffers);
        }
        this._startWaiting();
        this.cdr.markForCheck();
        return;
      }
      // Si ya fue aceptado: restaurar estado de viaje activo
      if (!['accepted', 'in_progress'].includes(trip.status)) {
        localStorage.removeItem('movi_active_trip'); return;
      }
      this.currentTripRequestId.set(saved.tripId);
      const { data: offer } = await getMoviClient()
        .from('ag_trip_offers').select('*, ag_drivers(*, ag_users(*))').eq('id', saved.offerId!).maybeSingle();
      if (offer) {
        this.tripAccepted.set(offer as any);
        this.tripSent.set(false);
        this._startTrackingAssignedDriver(saved.driverId!);
        this.startDriverTracking(saved.driverId!, saved.tripId);
        this.startPassengerChatBackground(saved.tripId);
        this.cdr.markForCheck();
      }
    } catch { localStorage.removeItem('movi_active_trip'); }
  }

  /** Tracking en vivo del conductor asignado: muestra marker + ETA + centra mapa */
  private _assignedDriverChannel: any = null;
  private _assignedDriverMarker: any = null;
  // Ruta conductor → pickup: última posición del conductor cuando se dibujó y timestamp
  private _approachRouteLastLat = 0;
  private _approachRouteLastLng = 0;
  private _approachRouteLastAt  = 0;

  private _startTrackingAssignedDriver(driverId: string): void {
    this._stopTrackingAssignedDriver();
    // Cancelar cualquier _drawRoute en vuelo e limpiar el mapa inmediatamente
    this._drawRouteToken++;
    this._clearRoute();
    this._approachRouteLastLat = 0;
    this._approachRouteLastLng = 0;
    this._approachRouteLastAt  = 0;
    // Dibujar marker + ruta de aproximación con última ubicación conocida
    this.agService.getLatestDriverLocation(driverId).then(loc => {
      if (loc) {
        this._drawAssignedDriverMarker(loc.lat, loc.lng);
        this._drawDriverApproachRoute(loc.lat, loc.lng);
      }
    });
    this._assignedDriverChannel = this.agService.subscribeDriverLocation(driverId, (loc) => {
      this._drawAssignedDriverMarker(loc.lat, loc.lng, loc.heading);
      const distKm = this._distKm(this._currentLat, this._currentLng, loc.lat, loc.lng);
      // ETA en vivo: distancia / velocidad promedio 30km/h
      if (this.currentTripStage() !== 'on_route' && this.currentTripStage() !== 'arrived_at_destination') {
        this.acceptedDriverEta.set(distKm < 0.05 ? 0 : Math.max(1, Math.round(distKm / 30 * 60)));
        this.cdr.markForCheck();
      }
      // Alerta "conductor cerca" cuando está a menos de 500m
      if (!this._driverNearbyShown && distKm < 0.5) {
        this._driverNearbyShown = true;
        this.driverNearbyAlert.set(true);
        this.cdr.markForCheck();
        setTimeout(() => { this.driverNearbyAlert.set(false); this.cdr.markForCheck(); }, 6000);
      }
      // Ruta conductor→pickup: primera vez siempre dibuja, luego throttle >150m o >30s
      const stage = this.currentTripStage();
      const headingToPassenger = !stage || stage === 'heading_to_pickup' || stage === 'arrived_at_pickup';
      if (headingToPassenger) {
        const neverDrawn = this._approachRouteLastAt === 0;
        const movedKm = this._distKm(loc.lat, loc.lng, this._approachRouteLastLat, this._approachRouteLastLng);
        const secsSinceDraw = (Date.now() - this._approachRouteLastAt) / 1000;
        if (neverDrawn || movedKm > 0.08 || secsSinceDraw > 15) {
          this._drawDriverApproachRoute(loc.lat, loc.lng);
        }
      }
    });
  }

  private _stopTrackingAssignedDriver(): void {
    if (this._assignedDriverChannel) { try { this._assignedDriverChannel.unsubscribe(); } catch {} this._assignedDriverChannel = null; }
    if (this._assignedDriverMarker) { try { this._assignedDriverMarker.remove(); } catch {} this._assignedDriverMarker = null; }
    this._clearApproachRoute();
    this._approachRouteDrawn = false;
    this.approachRouteInfo.set(null);
  }

  private _approachRouteDrawn = false; // true tras el primer dibujo exitoso

  private async _drawDriverApproachRoute(driverLat: number, driverLng: number): Promise<void> {
    if (!this._map) return;
    const mapboxgl = (window as any).mapboxgl;
    if (!mapboxgl) return;
    const pickupLat = this._currentLat;
    const pickupLng = this._currentLng;
    if (!pickupLat || !pickupLng) return;
    const isFirstDraw = !this._approachRouteDrawn;
    // En primer draw limpiar ruta destino; en updates solo actualizar geometría
    if (isFirstDraw) {
      this._clearRoute();
      this._clearApproachRoute();
    }
    try {
      const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${driverLng},${driverLat};${pickupLng},${pickupLat}?geometries=geojson&overview=full&access_token=${this.MAPBOX_TOKEN}`;
      const json = await (await fetch(url)).json();
      const route = json.routes?.[0];
      if (!route) return;
      this._approachRouteLastLat = driverLat;
      this._approachRouteLastLng = driverLng;
      this._approachRouteLastAt  = Date.now();
      // Distancia y tiempo REALES del API → actualizar señales visibles al pasajero
      const distKm      = Math.round(route.distance / 100) / 10;
      const durationMin = Math.max(1, Math.round(route.duration / 60));
      this.approachRouteInfo.set({ distKm, durationMin });
      this.acceptedDriverEta.set(durationMin);
      this.cdr.markForCheck();
      // Actualizar geometría sin recrear capas si ya existen
      const src = this._map.getSource('approach-route') as any;
      if (src) {
        src.setData({ type: 'Feature', properties: {}, geometry: route.geometry });
      } else {
        this._map.addSource('approach-route', { type: 'geojson', data: { type: 'Feature', properties: {}, geometry: route.geometry } });
        this._map.addLayer({ id: 'approach-route-bg',   type: 'line', source: 'approach-route', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#000',    'line-width': 9,  'line-opacity': 0.18 } });
        this._map.addLayer({ id: 'approach-route-line', type: 'line', source: 'approach-route', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#10b981', 'line-width': 5,  'line-opacity': 0.92 } });
        this._map.addLayer({ id: 'approach-route-dash', type: 'line', source: 'approach-route', layout: { 'line-cap': 'round' },                       paint: { 'line-color': '#fff',    'line-width': 1.5,'line-opacity': 0.5, 'line-dasharray': [0, 4] } });
      }
      this._approachRouteDrawn = true;
      // Solo en el primer dibujo ajustar cámara para mostrar conductor + pickup
      if (isFirstDraw) {
        const coords = route.geometry.coordinates as [number, number][];
        const bounds = coords.reduce((b: any, c: [number, number]) => b.extend(c), new mapboxgl.LngLatBounds(coords[0], coords[0]));
        this._map.fitBounds(bounds, { padding: { top: 80, bottom: 240, left: 50, right: 50 }, duration: 900 });
      }
    } catch { /* ignorar errores de red */ }
  }

  private _clearApproachRoute(): void {
    if (!this._map) return;
    ['approach-route-dash', 'approach-route-line', 'approach-route-bg'].forEach(id => {
      try { if (this._map.getLayer(id)) this._map.removeLayer(id); } catch {}
    });
    try { if (this._map.getSource('approach-route')) this._map.removeSource('approach-route'); } catch {}
  }

  private _drawAssignedDriverMarker(lat: number, lng: number, heading = 0): void {
    if (!this._map) return;
    const mapboxgl = (window as any).mapboxgl;
    if (!mapboxgl) return;
    if (this._assignedDriverMarker) {
      this._assignedDriverMarker.setLngLat([lng, lat]);
    } else {
      const el = this._carElement(heading, '#10b981');
      el.style.filter = 'drop-shadow(0 0 12px rgba(16,185,129,0.8))';
      this._assignedDriverMarker = new mapboxgl.Marker({ element: el, anchor: 'center' })
        .setLngLat([lng, lat]).addTo(this._map);
      this._map.flyTo({ center: [lng, lat], zoom: 15.5, duration: 1000 });
    }
  }

  async rejectOfferCard(offer: AgTripOffer) {
    await this.agService.rejectOffer(offer.id);
    this.receivedOffers.update(list => list.filter(o => o.id !== offer.id));
    // Notificar al conductor que su oferta fue rechazada para que pueda contra-ofertar
    const driverAuthId = (offer as any)?.ag_drivers?.ag_users?.auth_user_id;
    if (driverAuthId) {
      this.agService.sendPush({
        userIds: [driverAuthId],
        title: '❌ Oferta rechazada',
        body: 'El pasajero rechazó tu oferta. Puedes hacer una nueva propuesta.',
        tag: `offer-rejected-${offer.id}`,
      }).catch(() => {});
    }
  }

  // ── Driver: load & refresh trip requests ──────────────────────
  private _driverRefreshInterval: ReturnType<typeof setInterval> | null = null;
  private _reqTimerInterval: ReturnType<typeof setInterval> | null = null;
  private _cancelCheckInterval: ReturnType<typeof setInterval> | null = null;
  private _offerTimerInterval: ReturnType<typeof setInterval> | null = null;
  private _visibilityHandler: (() => void) | null = null;
  private readonly _REQUESTS_CACHE_KEY = 'movi_driver_req_cache';
  private readonly _CANCELLED_CACHE_KEY = 'movi_driver_cancelled_ids';
  private _cancelledRequestIds = new Set<string>();
  reqNowMs = signal(Date.now());
  driverEtaMin = signal<Record<string, number>>({});

  private _saveRequestsToCache(reqs: AgTripRequest[]): void {
    if (!isPlatformBrowser(this.platformId)) return;
    try {
      localStorage.setItem(this._REQUESTS_CACHE_KEY, JSON.stringify({ ts: Date.now(), reqs }));
    } catch {}
  }

  private _loadRequestsFromCache(): AgTripRequest[] {
    if (!isPlatformBrowser(this.platformId)) return [];
    try {
      // Cargar IDs cancelados/aceptados desde localStorage
      const cancelledRaw = localStorage.getItem(this._CANCELLED_CACHE_KEY);
      if (cancelledRaw) {
        const { ids } = JSON.parse(cancelledRaw) as { ids: string[] };
        ids.forEach(id => this._cancelledRequestIds.add(id));
      }
      const raw = localStorage.getItem(this._REQUESTS_CACHE_KEY);
      if (!raw) return [];
      const { ts, reqs } = JSON.parse(raw) as { ts: number; reqs: AgTripRequest[] };
      if (Date.now() - ts > 240000) return [];
      const now = Date.now();
      return reqs.filter(r =>
        now - new Date(r.created_at).getTime() <= 240000 &&
        !this._cancelledRequestIds.has(r.id)
      );
    } catch { return []; }
  }

  // ── Swipe-to-dismiss en modal de solicitud ──────────────────────
  requestSwipeX    = signal(0);
  requestSwiping   = signal(false);
  dismissConfirmId = signal<string | null>(null);
  readonly Math    = Math;
  private _swipeTouchStartX = 0;

  onRequestSwipeStart(e: TouchEvent): void {
    this._swipeTouchStartX = e.touches[0].clientX;
    this.requestSwiping.set(true);
  }

  onRequestSwipeMove(e: TouchEvent): void {
    const dx = e.touches[0].clientX - this._swipeTouchStartX;
    if (dx < 0) this.requestSwipeX.set(Math.max(-140, dx));
  }

  onRequestSwipeEnd(id: string): void {
    this.requestSwiping.set(false);
    if (this.requestSwipeX() < -80) {
      this.requestSwipeX.set(0);
      this.dismissConfirmId.set(id);
    } else {
      this.requestSwipeX.set(0);
    }
  }

  openDismissConfirm(id: string): void {
    this.dismissConfirmId.set(id);
  }

  confirmDismissRequest(): void {
    const id = this.dismissConfirmId();
    if (!id) return;
    this.dismissConfirmId.set(null);
    this.dismissDriverRequest(id);
  }

  /** Descarta una solicitud solo de la vista del conductor (no cancela el viaje del pasajero) */
  dismissDriverRequest(id: string): void {
    this._markRequestCancelled(id);
    this.driverRequests.update(list => {
      const updated = list.filter(r => r.id !== id);
      this._saveRequestsToCache(updated);
      return updated;
    });
    this.cdr.markForCheck();
  }

  private _markRequestCancelled(id: string): void {
    this._cancelledRequestIds.add(id);
    if (!isPlatformBrowser(this.platformId)) return;
    try {
      localStorage.setItem(this._CANCELLED_CACHE_KEY, JSON.stringify({ ids: [...this._cancelledRequestIds] }));
    } catch {}
    // Quitar también del caché de solicitudes
    const raw = localStorage.getItem(this._REQUESTS_CACHE_KEY);
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as { ts: number; reqs: AgTripRequest[] };
        parsed.reqs = parsed.reqs.filter(r => r.id !== id);
        localStorage.setItem(this._REQUESTS_CACHE_KEY, JSON.stringify(parsed));
      } catch {}
    }
  }

  _loadDriverRequests(vehicleType?: string, lat?: number, lng?: number) {
    // ag_trip_requests solo acepta 'carro' o 'moto'; normalizar cualquier otro valor a 'carro'
    const vt = vehicleType === 'moto' ? 'moto' : vehicleType ? 'carro' : undefined;
    // Sin filtro de distancia: el conductor debe ver TODAS las solicitudes activas sin importar GPS
    // El refresh de 20s tampoco usa distancia para no excluir solicitudes válidas
    this.agService.getSearchingRequests(vt, undefined, undefined).then(reqs => {
      this.driverRequests.set(reqs);
      this._saveRequestsToCache(reqs);
      if (reqs.length > 0) this.agService.logMetricEvent('offer_seen').catch(() => {});
      this.cdr.markForCheck();
    }).catch(() => {});
    // Cancelar suscripción previa
    if (this._requestsChannel) {
      this._requestsChannel.unsubscribe();
      this._requestsChannel = null;
    }
    if (this._driverRefreshInterval) {
      clearInterval(this._driverRefreshInterval);
      this._driverRefreshInterval = null;
    }
    if (this._cancelCheckInterval) {
      clearInterval(this._cancelCheckInterval);
      this._cancelCheckInterval = null;
    }
    // Refresh cada 20s — merge seguro: agrega nuevas del servidor, expira viejas,
    // pero NO borra solicitudes válidas si el servidor devuelve vacío (error de red)
    this._driverRefreshInterval = setInterval(() => {
      this.agService.getSearchingRequests(vt, undefined, undefined).then(reqs => {
        const now = Date.now();
        this.driverRequests.update(current => {
          const serverIds = new Set(reqs.map((r: AgTripRequest) => r.id));
          // Mantener solicitudes locales que: no llegaron del servidor, no están canceladas, < 4 min
          const kept = current.filter(r =>
            !serverIds.has(r.id) &&
            !this._cancelledRequestIds.has(r.id) &&
            now - new Date(r.created_at).getTime() <= 240000
          );
          // Orden: más antigua primero (llevan más tiempo esperando → mayor prioridad)
          const merged = [...reqs, ...kept].sort(
            (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
          );
          this._saveRequestsToCache(merged);
          return merged;
        });
        this.cdr.markForCheck();
      });
    }, 20000);
    // Cancel-check cada 1.5s: backup al realtime para detectar cancelaciones del pasajero rápido
    this._cancelCheckInterval = setInterval(() => {
      const visible = this.driverRequests();
      if (!visible.length) return;
      // La RLS ya permite ver filas 'cancelled', así que status !== 'searching' detecta cancelaciones.
      // No usar "missing ID" logic: un error de red devuelve [] y borraría TODO.
      this.agService.checkRequestsStatus(visible.map(r => r.id)).then(statuses => {
        if (!statuses.length) return; // query vacío = error de red, no borrar nada
        const cancelledIds = statuses.filter(s => s.status !== 'searching').map(s => s.id);
        if (!cancelledIds.length) return;
        cancelledIds.forEach(id => this._markRequestCancelled(id));
        this.driverRequests.update(list => {
          const updated = list.filter(r => !cancelledIds.includes(r.id));
          this._saveRequestsToCache(updated);
          return updated;
        });
        this.cdr.markForCheck();
      });
    }, 1500);
    // Timer 1s: actualiza reloj para el botón de color y expira solicitudes > 4 min
    if (this._reqTimerInterval) clearInterval(this._reqTimerInterval);
    this._reqTimerInterval = setInterval(() => {
      const now = Date.now();
      this.reqNowMs.set(now);
      this.cdr.markForCheck();
      const hasExpired = this.driverRequests().some(r => now - new Date(r.created_at).getTime() > 240000);
      if (hasExpired) {
        this.driverRequests.update(list => list.filter(r => now - new Date(r.created_at).getTime() <= 240000));
        this.cdr.markForCheck();
      }
    }, 1000);
    // Suscripción realtime filtrada por distancia
    this._requestsChannel = this.agService.subscribeToTripRequests(
      vt,
      (req) => {
        this.driverRequests.update(list => {
          if (list.some(r => r.id === req.id)) return list;
          this.agService.logMetricEvent('offer_seen').catch(() => {});
          this._notifyNewTrip(req);
          const updated = [...list, req];
          this._saveRequestsToCache(updated);
          return updated;
        });
        this.cdr.markForCheck();
      },
      (req) => {
        // Actualizar precio si el pasajero cambió la oferta
        if (req.status === 'searching') {
          this.driverRequests.update(list =>
            list.map(r => r.id === req.id ? { ...r, offered_price: (req as any).offered_price ?? r.offered_price } : r)
          );
          this.cdr.markForCheck();
          return;
        }

        this._markRequestCancelled(req.id);
        this.driverRequests.update(list => {
          const updated = list.filter(r => r.id !== req.id);
          this._saveRequestsToCache(updated);
          return updated;
        });
        this.cdr.markForCheck();

        // Pasajero canceló el viaje
        if (req.status === 'cancelled') {
          this._handleTripCancelled(req.id, (req as any).cancel_reason);
        }

        // Pasajero aceptó oferta por primera vez
        if (req.status === 'accepted' && !(req as any).driver_stage && !this.driverTripAlert()) {
          const driverId = this.driverData()?.id;
          if (driverId) {
            this.agService.getDriverActiveTrips(driverId).then(trips => {
              const match = trips.find((t: any) => (t.ag_trip_requests?.id === req.id || t.trip_request_id === req.id) && !t.ag_trip_requests?.driver_stage);
              if (match && !this.driverTripAlert()) this._handleNewAcceptedOffer(match);
            }).catch(() => {});
          }
        }

        // Pasajero confirmó "Ya estoy a bordo" → disparar lo mismo que si el conductor tocara "Pasajero a Bordo"
        if (req.status === 'accepted' && (req as any).driver_stage === 'on_route' && this.driverArrivalTrip()) {
          const waitingId = this.driverArrivalTrip()?.trip_request_id ?? this.driverArrivalTrip()?.ag_trip_requests?.id;
          if (waitingId === req.id) {
            this.driverPassengerBoarded();
          }
        }
      },
      undefined,
      undefined,
    );
  }

  toggleDriverRequests() {
    const nowOpen = !this.driverRequestsOpen();
    this.driverRequestsOpen.set(nowOpen);
    if (nowOpen) this._loadDriverRequests(this.driverData()?.vehicle_type, this._currentLat, this._currentLng);
  }

  refreshDriverRequests() {
    this._loadDriverRequests(this.driverData()?.vehicle_type, this._currentLat, this._currentLng);
  }

  async debugLoadRequests() {
    // Query directa sin filtros para diagnosticar
    const cutoff = new Date(Date.now() - 240000).toISOString();
    const { data, error } = await (this.agService as any).supabase
      .from('ag_trip_requests')
      .select('id, status, vehicle_type, created_at, offered_price')
      .gte('created_at', cutoff)
      .order('created_at', { ascending: true });
    const msg = error
      ? `ERROR: ${error.message}`
      : `Encontradas: ${data?.length ?? 0}\n` +
        (data ?? []).map((r: any) =>
          `- ${r.vehicle_type} | ${r.status} | $${r.offered_price} | ${new Date(r.created_at).toLocaleTimeString()}`
        ).join('\n');
    alert(`DEBUG solicitudes BD:\n${msg}`);
    // También cargar en pantalla sin filtro
    const reqs = (data ?? []).filter((r: any) => r.status === 'searching');
    if (reqs.length > 0) {
      this._loadDriverRequests(undefined);
    }
  }

  reqRemainingMs(req: AgTripRequest): number {
    return Math.max(0, 240000 - (this.reqNowMs() - new Date(req.created_at).getTime()));
  }
  reqRemainingPct(req: AgTripRequest): number {
    return (this.reqRemainingMs(req) / 240000) * 100;
  }
  reqBtnGradient(req: AgTripRequest): string {
    const pct = Math.max(0, Math.min(100, this.reqRemainingPct(req)));
    const activeColor = pct > 50 ? '#059669' : pct > 25 ? '#d97706' : '#dc2626';
    const bg = '#0d1421';
    return `linear-gradient(to right, ${activeColor} ${pct}%, ${bg} ${pct}%)`;
  }
  reqRemainingStr(req: AgTripRequest): string {
    const ms = this.reqRemainingMs(req);
    const m = Math.floor(ms / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    return `${m}:${s.toString().padStart(2, '0')}`;
  }
  offerRemainingMs(offer: AgTripOffer): number {
    return Math.max(0, 240000 - (this.reqNowMs() - new Date(offer.created_at).getTime()));
  }
  offerRemainingPct(offer: AgTripOffer): number {
    return (this.offerRemainingMs(offer) / 240000) * 100;
  }
  offerRemainingStr(offer: AgTripOffer): string {
    const ms = this.offerRemainingMs(offer);
    const m = Math.floor(ms / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  async acceptDirectly(req: AgTripRequest) {
    this.makingOfferFor.set(req);
    this.driverOfferPrice.set(req.offered_price);
    await this.submitDriverOffer();
  }

  openMakeOffer(req: AgTripRequest) {
    this.makingOfferFor.set(req);
    this.driverOfferPrice.set(req.offered_price);
  }

  closeMakeOffer() {
    this.makingOfferFor.set(null);
  }

  toggleInlineCounter(req: AgTripRequest) {
    if (this.inlineCounterOpen()) {
      this.inlineCounterOpen.set(false);
    } else {
      this.inlineCounterValue.set(req.offered_price + 500);
      this.inlineCounterOpen.set(true);
    }
  }

  async submitInlineCounter(req: AgTripRequest) {
    this.makingOfferFor.set(req);
    this.driverOfferPrice.set(this.inlineCounterValue());
    this.inlineCounterOpen.set(false);
    await this.submitDriverOffer();
  }

  async submitDriverOffer() {
    const req = this.makingOfferFor();
    const driver = this.driverData();
    if (!req || !driver) return;

    const status = this.driverStatus();
    if (status === 'pending_docs') {
      alert('Debes completar tu registro antes de aceptar más viajes.');
      return;
    }
    if (status === 'pending') {
      alert('Tu solicitud está siendo revisada. En 24–48 horas recibirás respuesta.');
      return;
    }
    // Validar saldo para conductores aprobados (first trip es gratis para 'quick')
    const completedTrips = (driver as any)?.metric_trips_completed ?? 0;
    const commission = this.requiredCommission(this.driverOfferPrice());
    if (status === 'approved') {
      if (this.driverWalletBalance() < 20000) {
        alert('Necesitas mínimo $20.000 en tu billetera para aceptar viajes.');
        return;
      }
      if (this.driverCommissionPct() > 0 && this.driverWalletBalance() < commission) {
        alert(`Saldo insuficiente. Necesitas al menos ${this.formatCOP(commission)} para cubrir la comisión.`);
        return;
      }
    } else if (status === 'quick' && completedTrips >= 1) {
      // Desde el 2do viaje el conductor quick también paga comisión
      if (this.driverWalletBalance() < commission) {
        alert(`Saldo insuficiente. Necesitas al menos ${this.formatCOP(commission)} para cubrir la comisión de este viaje.`);
        return;
      }
    }

    this.sendingOffer.set(true);
    const result = await this.agService.makeOffer(req.id, driver.id, this.driverOfferPrice());
    this.sendingOffer.set(false);
    if (result.success) {
      this.offerSentFor.update(s => { const ns = new Set(s); ns.add(req.id); return ns; });
      this.makingOfferFor.set(null);
      this.agService.logMetricEvent('offer_made', req.id).catch(() => {});
      // Push al pasajero para que vea la oferta aunque tenga la app cerrada
      const passAuthId = (req.ag_users as any)?.auth_user_id;
      if (passAuthId) {
        const driverName = (driver as any)?.ag_users?.full_name ?? 'Un conductor';
        this.agService.sendPush({
          userIds: [passAuthId],
          title: `🚗 ${driverName} te hizo una oferta`,
          body: `Te ofrece ${this.formatCOP(this.driverOfferPrice())}. ¡Tienes 4 min para aceptar!`,
          tag: `offer-${req.id}`,
          urgent: true,
        }).catch(() => {});
      }
    }
  }

  formatTime(s: number): string {
    const v = Math.max(0, s);
    return `${Math.floor(v / 60)}:${(v % 60).toString().padStart(2, '0')}`;
  }

  cancelTrip(reason?: string) {
    this._driverNearbyShown = false;
    this.driverNearbyAlert.set(false);
    this._stopWaiting();
    this._unsubscribeOffers();
    this.stopDriverTracking();
    this.passengerMapFullscreen.set(false);
    this.currentTripStage.set(null);
    this._clearNavRoute();
    const tripId = this.currentTripRequestId();
    if (tripId) this.agService.cancelTripRequest(tripId, reason);
    this.tripDest.set(null);
    this.tripSent.set(false);
    this.tripOpen.set(false);
    this.tripQuery.set('');
    this.tripSuggestions.set([]);
    this.tripDistKm.set(0);
    this.tripPrice.set(0);
    this.waitingDriverCount.set(0);
    this.waitingDriverColors.set([]);
    this.autoAccept.set(false);
    this.currentTripRequestId.set(null);
    this.receivedOffers.set([]);
    this.tripAccepted.set(null);
    this.acceptingOfferId.set(null);
    this._clearRoute();
    if (typeof localStorage !== 'undefined') localStorage.removeItem('movi_active_trip');
    this.passengerSection.set(null);
    if (this._tripBoardingChannel) { this._tripBoardingChannel.unsubscribe(); this._tripBoardingChannel = null; }
    if (this._passengerLiveChannel) { this._passengerLiveChannel.unsubscribe(); this._passengerLiveChannel = null; }
    // Destruir y recrear el mapa siempre — resize() solo no es suficiente tras un viaje fullscreen
    const lat = this._currentLat || this.DEFAULT_LAT;
    const lng = this._currentLng || this.DEFAULT_LNG;
    setTimeout(() => this._createMap('ag-map-user', lat, lng), 600);
  }

  private _withTimeout<T>(p: Promise<T>, ms = 12000): Promise<T> {
    return Promise.race([p, new Promise<never>((_, rej) =>
      setTimeout(() => rej(new Error('Tiempo de espera agotado. Verifica tu conexión.')), ms))]);
  }

  private _calcPrice(km: number, vehicle: 'carro' | 'moto' | 'camion'): number {
    // Tarifas calibradas para igualar el precio sugerido de InDrive en Colombia
    const raw = vehicle === 'camion'
      ? Math.max(8000, 6000 + km * 1500)
      : vehicle === 'carro'
      ? Math.max(4500, 4000 + km * 1000)
      : Math.max(3000, 2500 + km * 700);
    const surge = this.surgeMultiplier() ?? 1;
    return Math.round((raw * surge) / 500) * 500;
  }

  private _distKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371, dLat = (lat2 - lat1) * Math.PI / 180, dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
    return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 10) / 10;
  }

  private _drawRouteToken = 0; // se incrementa para cancelar llamadas async anteriores

  private async _drawRoute(destLng: number, destLat: number) {
    if (!this._map) return;
    const mapboxgl = (window as any).mapboxgl;
    if (!mapboxgl) return;
    const token = ++this._drawRouteToken;
    this._clearRoute();
    try {
      const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${this._currentLng},${this._currentLat};${destLng},${destLat}?geometries=geojson&overview=full&access_token=${this.MAPBOX_TOKEN}`;
      const json = await (await fetch(url)).json();
      // Si el token cambió (oferta aceptada u otra ruta), abortar
      if (token !== this._drawRouteToken) return;
      const route = json.routes?.[0];
      if (!route) return;

      const km = Math.round(route.distance / 100) / 10;
      this.tripDistKm.set(km);
      this.tripSuggestions.set([]);
      this.tripPrice.set(this._calcPrice(km, this.tripVehicle()));

      this._map.addSource('trip-route', { type: 'geojson', data: { type: 'Feature', properties: {}, geometry: route.geometry } });
      this._map.addLayer({ id: 'trip-route-bg',   type: 'line', source: 'trip-route', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#000',    'line-width': 9,  'line-opacity': 0.18 } });
      this._map.addLayer({ id: 'trip-route-line', type: 'line', source: 'trip-route', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#4f46e5', 'line-width': 5,  'line-opacity': 0.92 } });
      this._map.addLayer({ id: 'trip-route-dash', type: 'line', source: 'trip-route', layout: { 'line-cap': 'round' },                       paint: { 'line-color': '#fff',    'line-width': 1.5,'line-opacity': 0.5, 'line-dasharray': [0, 4] } });

      // Marcador de destino
      const pin = document.createElement('div');
      pin.innerHTML = `<div style="position:relative;width:32px;height:44px"><div style="position:absolute;bottom:0;left:50%;transform:translateX(-50%);width:32px;height:40px;background:#4f46e5;border-radius:50% 50% 50% 50% / 60% 60% 40% 40%;border:3px solid #fff;box-shadow:0 4px 14px rgba(0,0,0,0.45);display:flex;align-items:center;justify-content:center"><span class='material-symbols-outlined' style='color:#fff;font-size:16px'>place</span></div><div style="position:absolute;bottom:0;left:50%;transform:translateX(-50%);width:6px;height:6px;background:#4f46e5;border-radius:50%;margin-bottom:-3px"></div></div>`;
      this._destMarker = new mapboxgl.Marker({ element: pin, anchor: 'bottom' }).setLngLat([destLng, destLat]).addTo(this._map);

      // Ajustar vista para mostrar toda la ruta
      const coords = route.geometry.coordinates as [number, number][];
      const bounds = coords.reduce((b: any, c: [number, number]) => b.extend(c), new mapboxgl.LngLatBounds(coords[0], coords[0]));
      this._map.fitBounds(bounds, { padding: { top: 80, bottom: 220, left: 40, right: 40 }, duration: 800 });
    } catch { /* ignore network errors */ }
  }

  private _clearRoute() {
    if (this._map) {
      ['trip-route-dash','trip-route-line','trip-route-bg'].forEach(id => {
        try { if (this._map.getLayer(id)) this._map.removeLayer(id); } catch { /**/ }
      });
      try { if (this._map.getSource('trip-route')) this._map.removeSource('trip-route'); } catch { /**/ }
    }
    if (this._destMarker) { try { this._destMarker.remove(); } catch { /**/ } this._destMarker = null; }
  }

  // ── Datos de ubicación para registro ──
  readonly agLocationData: Record<string, { depts: string[]; cities: Record<string, string[]> }> = {
    'Colombia': {
      depts: ['Amazonas','Antioquia','Arauca','Atlántico','Bogotá D.C.','Bolívar','Boyacá','Caldas','Caquetá','Casanare','Cauca','Cesar','Chocó','Córdoba','Cundinamarca','Guainía','Guaviare','Huila','La Guajira','Magdalena','Meta','Nariño','Norte de Santander','Putumayo','Quindío','Risaralda','San Andrés','Santander','Sucre','Tolima','Valle del Cauca','Vaupés','Vichada'],
      cities: {
        'Antioquia':['Medellín','Bello','Itagüí','Envigado','Rionegro','Sabaneta','La Estrella','Copacabana','Barbosa','Caldas','Girardota','Apartadó','Turbo'],
        'Atlántico':['Barranquilla','Soledad','Malambo','Galapa','Puerto Colombia','Sabanagrande'],
        'Bogotá D.C.':['Bogotá'],
        'Bolívar':['Cartagena','Magangué','Turbaco','Arjona','El Carmen de Bolívar'],
        'Boyacá':['Tunja','Duitama','Sogamoso','Chiquinquirá','Moniquirá','Paipa'],
        'Caldas':['Manizales','La Dorada','Chinchiná','Riosucio','Anserma'],
        'Caquetá':['Florencia','El Doncello','Puerto Rico'],
        'Casanare':['Yopal','Aguazul','Villanueva','Tauramena'],
        'Cauca':['Popayán','Santander de Quilichao','Puerto Tejada','Patía'],
        'Cesar':['Valledupar','Aguachica','Bosconia','La Paz'],
        'Chocó':['Quibdó','Istmina','Tadó'],
        'Córdoba':['Montería','Cereté','Sahagún','Lorica','Montelíbano'],
        'Cundinamarca':['Soacha','Fusagasugá','Facatativá','Zipaquirá','Chía','Mosquera','Madrid','Cajicá','Tabio','Funza','Tocancipá','La Calera'],
        'Guainía':['Inírida'],
        'Guaviare':['San José del Guaviare','El Retorno'],
        'Huila':['Neiva','Pitalito','Garzón','La Plata','Campoalegre'],
        'La Guajira':['Riohacha','Maicao','Uribia','Manaure'],
        'Magdalena':['Santa Marta','Ciénaga','Fundación','El Banco'],
        'Meta':['Villavicencio','Acacías','Granada','Puerto López'],
        'Nariño':['Pasto','Tumaco','Ipiales','Túquerres','La Unión'],
        'Norte de Santander':['Cúcuta','Ocaña','Pamplona','Los Patios','Villa del Rosario','El Zulia'],
        'Putumayo':['Mocoa','Puerto Asís','Sibundoy'],
        'Quindío':['Armenia','Calarcá','Montenegro','La Tebaida','Quimbaya'],
        'Risaralda':['Pereira','Dosquebradas','Santa Rosa de Cabal','La Virginia','Belén de Umbría'],
        'San Andrés':['San Andrés','Providencia'],
        'Santander':['Bucaramanga','Floridablanca','Girón','Piedecuesta','Barrancabermeja','San Gil','Socorro'],
        'Sucre':['Sincelejo','Corozal','Sampués','San Marcos'],
        'Tolima':['Ibagué','Espinal','Melgar','Honda','Chaparral','Líbano'],
        'Valle del Cauca':['Cali','Buenaventura','Palmira','Tuluá','Buga','Cartago','Jamundí','Florida','Yumbo','Candelaria'],
        'Vaupés':['Mitú'],
        'Vichada':['Puerto Carreño'],
        'Amazonas':['Leticia','Puerto Nariño'],
        'Arauca':['Arauca','Saravena','Tame'],
      },
    },
    'Venezuela': {
      depts: ['Amazonas','Anzoátegui','Apure','Aragua','Barinas','Bolívar','Carabobo','Cojedes','Delta Amacuro','Distrito Capital','Falcón','Guárico','Lara','Mérida','Miranda','Monagas','Nueva Esparta','Portuguesa','Sucre','Táchira','Trujillo','Vargas','Yaracuy','Zulia'],
      cities: {
        'Distrito Capital':['Caracas'],'Carabobo':['Valencia','Maracay'],'Zulia':['Maracaibo','Cabimas'],
        'Lara':['Barquisimeto','Cabudare'],'Miranda':['Los Teques','Guarenas','Guatire'],
        'Táchira':['San Cristóbal','San Antonio del Táchira'],'Bolívar':['Ciudad Bolívar','Puerto Ordaz'],
        'Anzoátegui':['Barcelona','Puerto La Cruz'],'Mérida':['Mérida','El Vigía'],
      },
    },
    'Ecuador': {
      depts: ['Azuay','Bolívar','Cañar','Carchi','Chimborazo','Cotopaxi','El Oro','Esmeraldas','Galápagos','Guayas','Imbabura','Loja','Los Ríos','Manabí','Morona Santiago','Napo','Orellana','Pastaza','Pichincha','Santa Elena','Santo Domingo de los Tsáchilas','Sucumbíos','Tungurahua','Zamora Chinchipe'],
      cities: {
        'Pichincha':['Quito','Cayambe','Rumiñahui'],'Guayas':['Guayaquil','Durán','Milagro','Samborondón'],
        'Azuay':['Cuenca','Gualaceo'],'Manabí':['Portoviejo','Manta','Chone'],
        'Tungurahua':['Ambato','Baños'],'El Oro':['Machala','Santa Rosa'],'Imbabura':['Ibarra','Otavalo'],
      },
    },
    'Perú': {
      depts: ['Amazonas','Áncash','Apurímac','Arequipa','Ayacucho','Cajamarca','Callao','Cusco','Huancavelica','Huánuco','Ica','Junín','La Libertad','Lambayeque','Lima','Loreto','Madre de Dios','Moquegua','Pasco','Piura','Puno','San Martín','Tacna','Tumbes','Ucayali'],
      cities: {
        'Lima':['Lima','Callao','San Juan de Miraflores','Villa El Salvador','Ate'],'Arequipa':['Arequipa'],
        'La Libertad':['Trujillo','La Esperanza'],'Cusco':['Cusco'],'Piura':['Piura','Sullana'],
        'Junín':['Huancayo'],'Lambayeque':['Chiclayo'],
      },
    },
    'México': {
      depts: ['Aguascalientes','Baja California','Baja California Sur','Campeche','Chiapas','Chihuahua','Ciudad de México','Coahuila','Colima','Durango','Estado de México','Guanajuato','Guerrero','Hidalgo','Jalisco','Michoacán','Morelos','Nayarit','Nuevo León','Oaxaca','Puebla','Querétaro','Quintana Roo','San Luis Potosí','Sinaloa','Sonora','Tabasco','Tamaulipas','Tlaxcala','Veracruz','Yucatán','Zacatecas'],
      cities: {
        'Ciudad de México':['Ciudad de México'],'Estado de México':['Ecatepec','Naucalpan','Toluca'],
        'Jalisco':['Guadalajara','Zapopan'],'Nuevo León':['Monterrey','Guadalupe'],
        'Puebla':['Puebla'],'Guanajuato':['León','Irapuato','Celaya'],'Veracruz':['Xalapa','Veracruz'],
      },
    },
    'Chile': {
      depts: ['Arica y Parinacota','Tarapacá','Antofagasta','Atacama','Coquimbo','Valparaíso','Metropolitana de Santiago',"O'Higgins",'Maule','Ñuble','Biobío','La Araucanía','Los Ríos','Los Lagos','Aysén','Magallanes y Antártica'],
      cities: {
        'Metropolitana de Santiago':['Santiago','Puente Alto','Maipú','La Florida'],
        'Valparaíso':['Valparaíso','Viña del Mar'],'Biobío':['Concepción'],'La Araucanía':['Temuco'],
      },
    },
    'Argentina': {
      depts: ['Buenos Aires','Buenos Aires (Ciudad)','Catamarca','Chaco','Chubut','Córdoba','Corrientes','Entre Ríos','Formosa','Jujuy','La Pampa','La Rioja','Mendoza','Misiones','Neuquén','Río Negro','Salta','San Juan','San Luis','Santa Cruz','Santa Fe','Santiago del Estero','Tierra del Fuego','Tucumán'],
      cities: {
        'Buenos Aires (Ciudad)':['Buenos Aires'],'Buenos Aires':['La Plata','Mar del Plata','Quilmes'],
        'Córdoba':['Córdoba','Río Cuarto'],'Santa Fe':['Rosario','Santa Fe'],'Mendoza':['Mendoza'],
        'Tucumán':['San Miguel de Tucumán'],
      },
    },
    'Bolivia': {
      depts: ['Beni','Chuquisaca','Cochabamba','La Paz','Oruro','Pando','Potosí','Santa Cruz','Tarija'],
      cities: {
        'La Paz':['La Paz','El Alto'],'Santa Cruz':['Santa Cruz de la Sierra','Warnes'],
        'Cochabamba':['Cochabamba','Quillacollo'],'Chuquisaca':['Sucre'],'Tarija':['Tarija'],
      },
    },
    'Paraguay': {
      depts: ['Alto Paraguay','Alto Paraná','Amambay','Asunción','Boquerón','Caaguazú','Caazapá','Canindeyú','Central','Concepción','Cordillera','Guairá','Itapúa','Misiones','Ñeembucú','Paraguarí','Presidente Hayes','San Pedro'],
      cities: {
        'Asunción':['Asunción'],'Central':['Luque','San Lorenzo','Lambaré'],'Alto Paraná':['Ciudad del Este'],
      },
    },
    'Uruguay': {
      depts: ['Artigas','Canelones','Cerro Largo','Colonia','Durazno','Flores','Florida','Lavalleja','Maldonado','Montevideo','Paysandú','Río Negro','Rivera','Rocha','Salto','San José','Soriano','Tacuarembó','Treinta y Tres'],
      cities: {
        'Montevideo':['Montevideo'],'Canelones':['Las Piedras','Ciudad de la Costa'],'Maldonado':['Punta del Este'],
      },
    },
    'Costa Rica': {
      depts: ['Alajuela','Cartago','Guanacaste','Heredia','Limón','Puntarenas','San José'],
      cities: { 'San José':['San José','Desamparados'],'Alajuela':['Alajuela'],'Heredia':['Heredia'] },
    },
    'Panamá': {
      depts: ['Bocas del Toro','Chiriquí','Coclé','Colón','Darién','Herrera','Los Santos','Ngäbe-Buglé','Panamá','Panamá Oeste','Veraguas'],
      cities: { 'Panamá':['Panamá','San Miguelito'],'Panamá Oeste':['La Chorrera','Arraiján'],'Chiriquí':['David'] },
    },
    'República Dominicana': {
      depts: ['Azua','Bahoruco','Barahona','Dajabón','Distrito Nacional','Duarte','El Seibo','Elías Piña','Espaillat','Hato Mayor','Hermanas Mirabal','Independencia','La Altagracia','La Romana','La Vega','María Trinidad Sánchez','Monseñor Nouel','Monte Cristi','Monte Plata','Pedernales','Peravia','Puerto Plata','Samaná','San Cristóbal','San José de Ocoa','San Juan','San Pedro de Macorís','Santiago','Santiago Rodríguez','Santo Domingo','Valverde'],
      cities: {
        'Distrito Nacional':['Santo Domingo de Guzmán'],'Santo Domingo':['Santo Domingo Este','Santo Domingo Norte'],
        'Santiago':['Santiago de los Caballeros'],'La Altagracia':['Higüey'],'Puerto Plata':['Puerto Plata','Sosúa'],
      },
    },
  };

  readonly agCountries: string[] = [
    'Argentina','Bolivia','Brasil','Canadá','Chile','Colombia','Costa Rica','Cuba','Ecuador',
    'El Salvador','España','Estados Unidos','Francia','Guatemala','Honduras','Italia','México',
    'Nicaragua','Panamá','Paraguay','Perú','Portugal','Puerto Rico','Reino Unido','República Dominicana',
    'Uruguay','Venezuela','Otro',
  ];

  getDepts(country: string): string[] {
    return this.agLocationData[country]?.depts ?? [];
  }

  getCities(country: string, dept: string): string[] {
    return this.agLocationData[country]?.cities[dept] ?? [];
  }

  // ── OTP state (shared pasajero + conductor) ──
  otpStep    = signal<'idle' | 'sending' | 'sent' | 'verifying'>('idle');
  otpCode    = signal('');
  otpError   = signal('');
  otpPhone   = signal('');
  otpContext = signal<'passenger' | 'driver'>('passenger');

  // ── Quick-register state (3 pasos) ──
  qrRole              = signal<'pasajero' | 'conductor'>('pasajero');
  qrVehicleType       = signal<'carro' | 'moto' | 'camion' | ''>('');
  qrVehicleBrand      = signal('');
  qrVehicleColor      = signal('');
  qrVehiclePlate      = signal('');
  qrVehicleBrandVal   = '';
  qrVehicleColorVal   = '';
  qrVehiclePlateVal   = '';
  qrStep              = signal<1 | 2 | 3>(1);
  qrName              = signal('');
  qrPhone             = signal('');
  qrOtpCode           = signal('');
  // display vars for [(ngModel)] — avoids cursor-jump caused by [value] re-evaluation on signal CD
  otpCodeDisplay   = '';
  qrNameDisplay    = '';
  qrPhoneDisplay   = '';
  qrOtpCodeDisplay = '';
  qrOtpError          = signal('');
  qrOtpSending        = signal(false);
  qrOtpVerifying      = signal(false);
  qrResendCountdown   = signal(0);
  qrOriginQuery       = signal('');
  qrOriginSuggestions = signal<any[]>([]);
  qrOriginSelected    = signal<{ name: string; lat: number; lng: number } | null>(null);
  qrDestQuery         = signal('');
  qrDestSuggestions   = signal<any[]>([]);
  qrDestSelected      = signal<{ name: string; lat: number; lng: number } | null>(null);
  qrVehicle           = signal<'carro' | 'moto' | 'camion'>('carro');
  qrPrice             = signal(8000);
  qrPayment           = signal<AgPaymentMethod>('efectivo');
  qrSubmitting        = signal(false);
  qrError             = signal('');
  private _qrCountdownInterval: ReturnType<typeof setInterval> | null = null;
  private _qrSearchDebounce: ReturnType<typeof setTimeout> | null = null;
  private _qrEdgeProfile: any = null;

  // ── Passenger form state ──
  passengerLoading = signal(false);
  passengerSuccess = signal(false);
  passengerError   = signal('');

  pf = {
    fullName: '', birthDate: '', country: 'Colombia', department: '', city: '', idNumber: '',
    phone: '', email: '', password: '', selfie: '',
    emergencyName: '', emergencyPhone: '', terms: false,
  };
  private _pfFiles: Record<string, File> = {};

  // ── SMS verification state ──
  smsCodeSent = signal(false);
  smsCodeInput = '';
  smsGeneratedCode = '';
  smsSending = signal(false);
  smsVerified = signal(false);
  smsError = signal('');
  smsCountdown = signal(0);
  private _smsTimer: ReturnType<typeof setInterval> | null = null;

  private _normalizePhone(phone: string): string {
    const digits = phone.replace(/\D/g, '');
    if (phone.trim().startsWith('+')) return `+${digits}`;
    if (digits.length === 10) return `+57${digits}`;
    if (digits.length === 12 && digits.startsWith('57')) return `+${digits}`;
    return `+${digits}`;
  }

  async sendSmsCode(phone: string): Promise<void> {
    if (!phone || phone.replace(/\D/g, '').length < 10) {
      this.smsError.set('Ingresa un número de teléfono válido');
      return;
    }
    this.smsSending.set(true);
    this.smsError.set('');

    const normalized = this._normalizePhone(phone);
    this.smsGeneratedCode = Math.floor(100000 + Math.random() * 900000).toString();

    try {
      const { data, error } = await this.supabase.functions.invoke('ag-sms', {
        body: { phone: normalized, code: this.smsGeneratedCode },
      });

      if (error) throw error;
      if (!data?.sent) throw new Error('SMS no enviado');

      this.smsCodeSent.set(true);
      // Timer de 60 segundos para reenviar
      this.smsCountdown.set(60);
      this._smsTimer = setInterval(() => {
        this.smsCountdown.update(v => {
          if (v <= 1) {
            if (this._smsTimer) clearInterval(this._smsTimer);
            return 0;
          }
          return v - 1;
        });
      }, 1000);
    } catch (e: any) {
      this.smsError.set('No se pudo enviar el SMS. Verifica que el número incluya el indicativo (+57) o intenta de nuevo.');
    } finally {
      this.smsSending.set(false);
    }
  }

  verifySmsCode(): void {
    if (this.smsCodeInput === this.smsGeneratedCode) {
      this.smsVerified.set(true);
      this.smsError.set('');
      if (this._smsTimer) clearInterval(this._smsTimer);
    } else {
      this.smsError.set('Código incorrecto. Intenta de nuevo.');
    }
  }

  // ── Auto-asignación conductor más cercano ────────────────────
  private async _autoAssignNearestDrivers(tripId: string, lat: number, lng: number, vehicleType: string, price: number): Promise<void> {
    try {
      const drivers = await this.agService.findNearestDrivers(tripId, lat, lng, vehicleType);
      if (drivers.length === 0) return;
      const driverIds: string[] = [];
      for (const driver of drivers) {
        await this.agService.autoOfferNearest(tripId, driver.driver_id, price);
        if (driver.driver_id) driverIds.push(driver.driver_id);
      }
      // Push a conductores cercanos para que vean la solicitud aunque tengan la app cerrada
      if (driverIds.length > 0) {
        const authIds = await this.agService.getDriverAuthUserIds(driverIds);
        if (authIds.length > 0) {
          this.agService.sendPush({
            userIds: authIds,
            title: '🔔 Nueva solicitud cerca de ti',
            body: `Hay un viaje por ${this.formatCOP(price)}. ¡Abre Movi para aceptarlo!`,
            tag: `new-trip-${tripId}`,
            urgent: true,
          }).catch(() => {});
        }
      }
    } catch {
      // Silencioso — no afecta el flujo del pasajero
    }
  }

  // ── Chat en viaje ────────────────────────────────────────────
  showChatModal = signal(false);
  chatMessages = signal<{ id: string; sender_ag_user_id: string; message: string; created_at: string }[]>([]);
  chatInput = '';
  chatSending = signal(false);
  chatRequestId = signal<string | null>(null);
  chatUnread = signal(0);
  private _chatChannel: RealtimeChannel | null = null;

  async openTripChat(): Promise<void> {
    const offer = this.tripAccepted();
    if (!offer?.trip_request_id) return;
    const requestId = offer.trip_request_id;
    this.chatRequestId.set(requestId);
    this.chatUnread.set(0);

    // Cargar mensajes existentes
    const messages = await this.agService.getChatMessages(requestId);
    this.chatMessages.set(messages);
    this.showChatModal.set(true);

    // Suscribirse a nuevos mensajes
    this._unsubscribeChat();
    this._chatChannel = this.agService.subscribeToChatMessages(requestId, (msg) => {
      this.chatMessages.update(list => [...list, msg]);
    });
  }

  async openDriverChat(trip: any): Promise<void> {
    const requestId = trip.ag_trip_requests?.id ?? trip.trip_request_id;
    if (!requestId) return;
    this.chatRequestId.set(requestId);
    this.chatUnread.set(0);

    const messages = await this.agService.getChatMessages(requestId);
    this.chatMessages.set(messages);
    this.showChatModal.set(true);

    this._unsubscribeChat();
    this._chatChannel = this.agService.subscribeToChatMessages(requestId, (msg) => {
      this.chatMessages.update(list => [...list, msg]);
      this.cdr.markForCheck();
      this._scrollChatToBottom('driver-chat-messages');
    });
    setTimeout(() => this._scrollChatToBottom('driver-chat-messages'), 50);
  }

  closeChatModal(): void {
    this.showChatModal.set(false);
    this._unsubscribeChat();
  }

  async sendChatMsg(): Promise<void> {
    const reqId = this.chatRequestId();
    const myProfile = this.agProfile();
    if (!this.chatInput.trim() || !reqId || !myProfile) return;

    this.chatSending.set(true);
    const text = this.chatInput;
    this.chatInput = '';
    await this.agService.sendChatMessage(reqId, myProfile.id, text);
    this.chatSending.set(false);
    this._scrollChatToBottom('driver-chat-messages');
  }

  isMyChatMessage(msg: { sender_ag_user_id: string }): boolean {
    return msg.sender_ag_user_id === this.agProfile()?.id;
  }

  formatChatTime(dateStr: string): string {
    return new Date(dateStr).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
  }

  private _unsubscribeChat(): void {
    if (this._chatChannel) {
      this._chatChannel.unsubscribe();
      this._chatChannel = null;
    }
  }

  // ── Cámara de documento ──
  docCameraOpen   = signal(false);
  docCameraField  = '';
  docCameraDriver = false;
  private _docStream:  MediaStream      | null = null;
  private _docVideo:   HTMLVideoElement | null = null;
  private _overlayRaf: number           | null = null;

  async openDocCamera(field: string, isDriver: boolean): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) return;
    if (!navigator?.mediaDevices?.getUserMedia) { this._triggerFallback(field, isDriver); return; }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
    } catch {
      this._triggerFallback(field, isDriver);
      return;
    }

    this._docStream      = stream;
    this.docCameraField  = field;
    this.docCameraDriver = isDriver;
    this.docCameraOpen.set(true);
    this.cdr.detectChanges();

    // 2 frames para que Angular renderice el @if y el video llegue al DOM
    await new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(() => r())));

    const video = document.getElementById('doc-cam-video') as HTMLVideoElement | null;
    if (!video) { this.closeDocCamera(); return; }

    video.srcObject = stream;
    this._docVideo  = video;
    video.play().catch(() => {});

    this._startCamLoop();
  }

  private _startCamLoop(): void {
    const video = this._docVideo;
    if (!video) return;

    const canvas = document.getElementById('doc-cam-main') as HTMLCanvasElement | null;
    if (!canvas) return;

    // Dimensiones fijas para toda la sesión (evita reset de contexto cada frame)
    const W = canvas.width  = window.innerWidth;
    const H = canvas.height = window.innerHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const cw = W * 0.85, ch = cw / 1.586;
    const cx = (W - cw) / 2, cy = H * 0.22;
    const r = 12, cs = 30, ct = 5;

    const draw = () => {
      if (!this.docCameraOpen()) return;

      // 1 · video (cover fit)
      if (video.readyState >= 2 && video.videoWidth > 0) {
        const s  = Math.max(W / video.videoWidth, H / video.videoHeight);
        const dw = video.videoWidth * s, dh = video.videoHeight * s;
        ctx.drawImage(video, (W - dw) / 2, (H - dh) / 2, dw, dh);
      } else {
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, W, H);
      }

      // 2 · overlay oscuro fuera del recuadro (evenodd = solo entre los 2 paths)
      ctx.beginPath();
      ctx.rect(0, 0, W, H);
      ctx.moveTo(cx + r, cy);
      ctx.lineTo(cx + cw - r, cy);
      ctx.arcTo(cx + cw, cy,      cx + cw, cy + r,      r);
      ctx.lineTo(cx + cw, cy + ch - r);
      ctx.arcTo(cx + cw, cy + ch, cx + cw - r, cy + ch, r);
      ctx.lineTo(cx + r, cy + ch);
      ctx.arcTo(cx,      cy + ch, cx,      cy + ch - r, r);
      ctx.lineTo(cx, cy + r);
      ctx.arcTo(cx,      cy,      cx + r,  cy,          r);
      ctx.closePath();
      ctx.fillStyle = 'rgba(0,0,0,0.65)';
      ctx.fill('evenodd');

      // 3 · borde blanco
      ctx.beginPath();
      ctx.moveTo(cx + r, cy);
      ctx.lineTo(cx + cw - r, cy);
      ctx.arcTo(cx + cw, cy,      cx + cw, cy + r,      r);
      ctx.lineTo(cx + cw, cy + ch - r);
      ctx.arcTo(cx + cw, cy + ch, cx + cw - r, cy + ch, r);
      ctx.lineTo(cx + r, cy + ch);
      ctx.arcTo(cx,      cy + ch, cx,      cy + ch - r, r);
      ctx.lineTo(cx, cy + r);
      ctx.arcTo(cx,      cy,      cx + r,  cy,          r);
      ctx.closePath();
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.lineWidth   = 2;
      ctx.stroke();

      // 4 · esquinas naranja
      ctx.strokeStyle = '#fb923c';
      ctx.lineWidth   = ct;
      ctx.lineCap     = 'square';
      ctx.beginPath(); ctx.moveTo(cx,cy+cs);      ctx.lineTo(cx,cy);      ctx.lineTo(cx+cs,cy);      ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx+cw-cs,cy);   ctx.lineTo(cx+cw,cy);   ctx.lineTo(cx+cw,cy+cs);   ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx,cy+ch-cs);   ctx.lineTo(cx,cy+ch);   ctx.lineTo(cx+cs,cy+ch);   ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx+cw-cs,cy+ch);ctx.lineTo(cx+cw,cy+ch);ctx.lineTo(cx+cw,cy+ch-cs);ctx.stroke();

      this._overlayRaf = requestAnimationFrame(draw);
    };

    this._overlayRaf = requestAnimationFrame(draw);
  }

  captureDocPhoto(): void {
    const video  = this._docVideo;
    const canvas = document.getElementById('doc-cam-canvas') as HTMLCanvasElement | null;
    if (!video || !canvas || !video.videoWidth) return;

    canvas.width  = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);

    const field = this.docCameraField, isDriver = this.docCameraDriver;
    this.closeDocCamera();

    canvas.toBlob(blob => {
      if (!blob) return;
      const file = new File([blob], 'documento-identidad.jpg', { type: 'image/jpeg' });
      if (isDriver) { (this.df as Record<string,unknown>)[field] = file.name; this._dfFiles[field] = file; }
      else          { (this.pf as Record<string,unknown>)[field] = file.name; this._pfFiles[field] = file; }
      this.cdr.detectChanges();
    }, 'image/jpeg', 0.92);
  }

  closeDocCamera(): void {
    if (this._overlayRaf !== null) { cancelAnimationFrame(this._overlayRaf); this._overlayRaf = null; }
    if (this._docVideo) { this._docVideo.srcObject = null; this._docVideo = null; }
    this._docStream?.getTracks().forEach(t => t.stop());
    this._docStream = null;
    this.docCameraOpen.set(false);
    this.cdr.detectChanges();
  }

  private _triggerFallback(field: string, isDriver: boolean): void {
    const el = document.getElementById(`doc-file-${isDriver ? 'd' : 'p'}-${field}`) as HTMLInputElement | null;
    el?.click();
  }

  resetSmsState(): void {
    this.smsCodeSent.set(false);
    this.smsCodeInput = '';
    this.smsGeneratedCode = '';
    this.smsVerified.set(false);
    this.smsError.set('');
    this.smsCountdown.set(0);
    if (this._smsTimer) clearInterval(this._smsTimer);
  }

  // ── Driver form state ──
  driverLoading = signal(false);
  driverSuccess = signal(false);
  driverError   = signal('');

  df = {
    fullName: '', birthDate: '', country: 'Colombia', department: '', city: '', idNumber: '',
    phone: '', email: '', password: '',
    emergencyName: '', emergencyPhone: '',
    idFront: '', idBack: '', selfieWithId: '', criminalRecord: '',
    licenseNumber: '', licenseCategory: '', licenseExpiry: '', licensePhoto: '', licenseBack: '',
    plate: '', vehicleType: '', vehicleBrand: '', vehicleModel: '', vehicleYear: '', vehicleColor: '',
    vehiclePhoto: '', vehicleSidePhoto: '',
    soatPhoto: '', soatExpiry: '',
    propertyCardFront: '', propertyCardBack: '',
    tecnoPhoto: '', tecnoExpiry: '',
    civilLiability: '', civilLiabilityExpiry: '',
    terms: false,
  };
  private _dfFiles: Record<string, File> = {};

  // ── Field definitions ──
  idPhotoFields = [
    { key: 'idFront',      label: 'Cédula — parte frontal' },
    { key: 'idBack',       label: 'Cédula — parte trasera' },
    { key: 'selfieWithId', label: 'Selfie sosteniendo la cédula' },
  ];

  vehiclePhotoFields = [
    { key: 'vehiclePhoto',     label: 'Foto frontal del vehículo' },
    { key: 'vehicleSidePhoto', label: 'Foto lateral del vehículo' },
  ];

  vehicleDocFields = [
    { key: 'soatPhoto',         label: 'SOAT (seguro obligatorio)', expiry: 'soatExpiry' },
    { key: 'propertyCardFront', label: 'Tarjeta de propiedad — frontal', expiry: null },
    { key: 'propertyCardBack',  label: 'Tarjeta de propiedad — trasera', expiry: null },
    { key: 'tecnoPhoto',        label: 'Revisión tecnomecánica', expiry: 'tecnoExpiry' },
    { key: 'civilLiability',    label: 'Seguro de responsabilidad civil', expiry: 'civilLiabilityExpiry' },
  ];

  get dfr(): Record<string, unknown> { return this.df as Record<string, unknown>; }

  onPassengerFileChange(event: Event, field: string) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (file) {
      (this.pf as Record<string, unknown>)[field] = file.name;
      this._pfFiles[field] = file;
    }
  }

  onDriverFileChange(event: Event, field: string) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (file) {
      (this.df as Record<string, unknown>)[field] = file.name;
      this._dfFiles[field] = file;
    }
  }

  nextDriverStep(current: number) {
    this.driverError.set('');
    if (current === 1) {
      if (!this.df.fullName || !this.df.birthDate || !this.df.country || !this.df.department || !this.df.city ||
          !this.df.idNumber || !this.df.phone || !this.df.email || !this.df.password ||
          !this.df.emergencyName || !this.df.emergencyPhone) {
        this.driverError.set('Por favor completa todos los campos obligatorios, incluyendo país, departamento y ciudad.');
        return;
      }
    }
    if (current === 2) {
      if (!this.df.idFront || !this.df.idBack || !this.df.selfieWithId || !this.df.criminalRecord) {
        this.driverError.set('Debes subir todos los documentos de identidad requeridos.');
        return;
      }
    }
    if (current === 3) {
      if (!this.df.licenseNumber || !this.df.licenseCategory || !this.df.licenseExpiry || !this.df.licensePhoto || !this.df.licenseBack) {
        this.driverError.set('Completa todos los datos y fotos de tu licencia de conducción.');
        return;
      }
    }
    this.driverStep.set(current + 1);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // ── OTP helpers ────────────────────────────────────────────────
  async _triggerOtp(context: 'passenger' | 'driver', phone: string) {
    this.otpContext.set(context);
    this.otpPhone.set(phone);
    this.otpCode.set('');
    this.otpCodeDisplay = '';
    this.otpError.set('');
    this.otpStep.set('sending');
    this.cdr.markForCheck();

    if (isPlatformBrowser(this.platformId)) {
      this.phoneAuth.setupRecaptcha('ag-recaptcha-container');
    }
    const res = await this.phoneAuth.sendOTP(phone);
    if (res.ok) {
      this.otpStep.set('sent');
    } else {
      this.otpStep.set('idle');
      if (context === 'passenger') this.passengerError.set(res.message ?? 'Error enviando SMS');
      else this.driverError.set(res.message ?? 'Error enviando SMS');
    }
    this.cdr.markForCheck();
  }

  async resendOtp() {
    this.phoneAuth.reset();
    await this._triggerOtp(this.otpContext(), this.otpPhone());
  }

  cancelOtp() {
    this.phoneAuth.reset();
    this.otpStep.set('idle');
    this.otpCode.set('');
    this.otpCodeDisplay = '';
    this.otpError.set('');
    this.cdr.markForCheck();
  }

  async confirmOtp() {
    const code = this.otpCode().trim();
    if (code.length !== 6) { this.otpError.set('El código debe tener 6 dígitos.'); return; }
    this.otpStep.set('verifying');
    this.cdr.markForCheck();
    const res = await this.phoneAuth.verifyOTP(code);
    if (!res.ok) {
      this.otpStep.set('sent');
      this.otpError.set(res.message ?? 'Código incorrecto');
      this.cdr.markForCheck();
      return;
    }
    // OTP verificado — proceder con el registro
    this.otpStep.set('idle');
    this.cdr.markForCheck();
    if (this.otpContext() === 'passenger') {
      await this._doRegisterPassenger();
    } else {
      await this._doRegisterDriver();
    }
  }

  // ────────────────────────────────────────────────────────────────

  async submitPassenger() {
    this.passengerError.set('');
    const p = this.pf;
    if (!p.fullName || !p.birthDate || !p.country || !p.department || !p.city || !p.idNumber ||
        !p.phone || !p.email || !p.password || !p.emergencyName || !p.emergencyPhone) {
      this.passengerError.set('Por favor completa todos los campos obligatorios, incluyendo país, departamento y ciudad.');
      return;
    }
    if (!p.terms) {
      this.passengerError.set('Debes aceptar los términos y condiciones.');
      return;
    }
    // Disparar verificación OTP antes de registrar
    await this._triggerOtp('passenger', p.phone);
  }

  async _doRegisterPassenger() {
    const p = this.pf;
    this.passengerLoading.set(true);
    this.cdr.markForCheck();
    const result = await this.agService.registerPassenger({
      fullName: p.fullName,
      birthDate: p.birthDate,
      country: p.country,
      department: p.department,
      city: p.city,
      idNumber: p.idNumber,
      phone: p.phone,
      email: p.email,
      password: p.password,
      emergencyName: p.emergencyName,
      emergencyPhone: p.emergencyPhone,
      selfieFile: this._pfFiles['selfie'],
      referredBy: this.referredBy ?? undefined,
    });
    this.passengerLoading.set(false);
    if (result.success) {
      this.passengerSuccess.set(true);
      setTimeout(async () => { await this.ngOnInit(); }, 2000);
    } else {
      this.passengerError.set(result.error ?? 'Error al registrarse.');
    }
    this.cdr.markForCheck();
  }

  async submitDriver() {
    this.driverError.set('');
    if (!this.df.plate || !this.df.vehicleType || !this.df.vehicleBrand ||
        !this.df.vehicleModel || !this.df.vehicleYear || !this.df.vehicleColor) {
      this.driverError.set('Completa todos los datos del vehículo.');
      return;
    }
    if (!this.df.terms) {
      this.driverError.set('Debes aceptar los términos y condiciones.');
      return;
    }
    // Disparar verificación OTP antes de registrar
    await this._triggerOtp('driver', this.df.phone);
  }

  async _doRegisterDriver() {
    this.driverLoading.set(true);
    this.cdr.markForCheck();
    const result = await this.agService.registerDriver({
      fullName: this.df.fullName,
      birthDate: this.df.birthDate,
      country: this.df.country,
      department: this.df.department,
      city: this.df.city,
      idNumber: this.df.idNumber,
      phone: this.df.phone,
      email: this.df.email,
      password: this.df.password,
      emergencyName: this.df.emergencyName,
      emergencyPhone: this.df.emergencyPhone,
      licenseNumber: this.df.licenseNumber,
      licenseCategory: this.df.licenseCategory,
      licenseExpiry: this.df.licenseExpiry,
      plate: this.df.plate,
      vehicleType: this.df.vehicleType,
      vehicleBrand: this.df.vehicleBrand,
      vehicleModel: this.df.vehicleModel,
      vehicleYear: this.df.vehicleYear,
      vehicleColor: this.df.vehicleColor,
      files: this._dfFiles,
      referredBy: this.referredBy ?? undefined,
    });
    this.driverLoading.set(false);
    if (result.success) {
      this.driverSuccess.set(true);
      setTimeout(async () => { await this.ngOnInit(); }, 2000);
    } else {
      this.driverError.set(result.error ?? 'Error al registrarse.');
    }
    this.cdr.markForCheck();
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

  async startWalletRecharge(): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) return;

    const amount = this.rechargeAmount();
    if (amount < 5000) { this.rechargeError.set('El monto mínimo es $5.000 COP'); return; }
    if (amount > 500000) { this.rechargeError.set('El monto máximo es $500.000 COP'); return; }

    this.rechargeError.set(null);
    this.rechargeLoading.set(true);
    this.cdr.markForCheck();

    try {
      const params = await this.agService.createWalletRecharge(amount);
      await this.loadEpaycoScript();

      const epayco = (window as any)['ePayco'] as any;
      const handler = epayco.checkout.configure({ key: params['publicKey'], test: params['test'] });
      handler.open({
        name:         params['name'],
        description:  params['description'],
        invoice:      params['invoice'],
        currency:     params['currency'],
        amount:       params['amount'],
        tax_base:     params['tax_base'],
        tax:          params['tax'],
        country:      params['country'],
        lang:         params['lang'],
        external:     'false',
        methodConfirmation: 'GET',
        confirmation: params['confirmation'],
        response:     params['response'],
        email_billing: params['email_billing'],
        name_billing:  params['name_billing'],
        extra1:        params['extra1'],
        extra2:        params['extra2'],
        extra3:        params['extra3'],
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al iniciar el pago';
      this.rechargeError.set(msg);
    } finally {
      this.rechargeLoading.set(false);
      this.cdr.markForCheck();
    }
  }

  // ── Passenger menu methods ─────────────────────────────────────
  async loadReferralData() {
    const profile = this.agProfile();
    if (!profile) return;
    const [wallet, count, txs] = await Promise.all([
      this.agService.getReferralWallet(profile.id),
      this.agService.getReferralCount(profile.id),
      this.agService.getReferralTransactions(profile.id),
    ]);
    this.referralBalance.set(wallet?.balance ?? 0);
    this.referralTotalEarned.set(wallet?.total_earned ?? 0);
    this.referralCount.set(count);
    this.referralTransactions.set(txs);
  }

  async copyReferralLink() {
    if (isPlatformBrowser(this.platformId)) {
      await navigator.clipboard.writeText(this.agReferralLink());
      this.referralCopied.set(true);
      setTimeout(() => this.referralCopied.set(false), 2000);
    }
  }

  openPassengerSection(action: string) {
    this.agMenuOpen.set(false);
    if (action.startsWith('service:')) {
      const svc = action.replace('service:', '') as 'viaje' | 'moto' | 'ciudad' | 'domicilio' | 'fletes';
      this.tripService.set(svc);
      return;
    }
    if (action === 'driver') {
      this.screen.set('driver-home');
      return;
    }
    this.passengerSection.set(action);
    if (action === 'history') this.loadPassengerHistory();
    if (action === 'referrals') this.loadReferralData();
    if (action === 'favorites') this.loadPassengerFavorites();
    if (action === 'paymentmethods') this.loadPaymentMethods();
    if (action === 'wallet') this.loadPassengerWallet();
    if (action === 'schedule') this.loadPassengerScheduled();
    if (action === 'lost') this.loadPassengerLostItems();
    if (action === 'report') this.loadPassengerReports();
    if (action === 'loyalty') this.loadPassengerLoyalty();
    if (action === 'corporate') this.loadCorporateAccounts();
    if (action === 'profile') this.openEditProfile();
    if (action === 'blockeddrivers') this.loadPassengerBlockedDrivers();
  }



  // ═══════════════════════════════════════════════════
  // PASSENGER: blocked drivers
  // ═══════════════════════════════════════════════════
  passengerBlockedDrivers = signal<any[]>([]);

  async loadPassengerBlockedDrivers() {
    const profile = this.agProfile();
    if (!profile) return;
    const list = await this.agService.listPassengerBlockedDrivers(profile.id);
    this.passengerBlockedDrivers.set(list);
  }

  async unblockDriverAction(id: string) {
    await this.agService.unblockDriver(id);
    await this.loadPassengerBlockedDrivers();
  }

  async blockDriverFromTrip(driverId: string, reason?: string) {
    const profile = this.agProfile();
    if (!profile) return;
    const res = await this.agService.blockDriver(profile.id, driverId, reason);
    if (res.success) alert('Conductor bloqueado. No aparecerá en tus futuras solicitudes.');
    else alert('Error: ' + (res.error ?? 'desconocido'));
  }

  // ═══════════════════════════════════════════════════
  // PASSENGER: tutorial
  // ═══════════════════════════════════════════════════
  passengerTutorialDone = signal(false);
  readonly passengerTutorialSteps = [
    { icon: 'search', title: '1. Busca tu destino', body: 'Toca "¿A dónde vas?" y escribe la dirección. Puedes guardar lugares frecuentes en Favoritos.' },
    { icon: 'tune', title: '2. Elige tu categoría', body: 'Economy (más barato), Comfort (más espacio), XL (grupos), Premium (ejecutivo). Cada uno tiene un multiplicador.' },
    { icon: 'accessibility', title: '3. Indica necesidades', body: 'Marca si llevas mascota, equipaje grande, silla de bebé o silla de ruedas para que el conductor sepa qué esperar.' },
    { icon: 'payments', title: '4. Selecciona pago', body: 'Efectivo, Nequi, Daviplata, Bancolombia o tarjeta. Guarda tus métodos frecuentes en "Métodos de pago".' },
    { icon: 'local_offer', title: '5. Propón tu precio', body: 'Ajusta el monto que quieres pagar. Varios conductores verán tu solicitud y harán ofertas en vivo.' },
    { icon: 'star', title: '6. Elige la mejor oferta', body: 'Cada conductor muestra su rating, nivel y viajes completados. Acepta al que prefieras.' },
    { icon: 'navigation', title: '7. Sigue el viaje en vivo', body: 'Verás al conductor moverse en el mapa en tiempo real. Usa el chat o llamada enmascarada para coordinar.' },
    { icon: 'share_location', title: '8. Comparte tu viaje', body: 'Comparte un link con tu familia para que vean dónde vas. El link expira al llegar.' },
    { icon: 'emoji_events', title: '9. Gana puntos', body: 'Cada viaje te da +10 puntos. Sube de Bronce a Diamante para desbloquear descuentos y beneficios.' },
    { icon: 'emergency', title: '🚨 Botón de pánico', body: 'Si tienes una emergencia, activa el botón rojo en Seguridad. Se avisará a tus contactos con tu ubicación.' },
  ];

  async completePassengerTutorial() {
    const profile = this.agProfile();
    if (!profile) return;
    await this.agService.markPassengerTutorialCompleted(profile.id);
    this.passengerTutorialDone.set(true);
  }

  // ═══════════════════════════════════════════════════
  // DRIVER: notificaciones / settings / report
  // ═══════════════════════════════════════════════════
  driverNotifySettings = signal({ newRequests: true, tripUpdates: true, earnings: true });
  savingDriverNotify   = signal(false);
  driverReports        = signal<any[]>([]);
  driverReportKind     = signal<'passenger'|'incident'|'app'|'vehicle'|'other'>('passenger');
  driverReportDesc     = '';
  submittingDriverReport = signal(false);

  toggleDriverNotifyRequests(): void {
    this.driverNotifySettings.update(s => ({ ...s, newRequests: !s.newRequests }));
  }
  toggleDriverNotifyTripUpdates(): void {
    this.driverNotifySettings.update(s => ({ ...s, tripUpdates: !s.tripUpdates }));
  }
  toggleDriverNotifyEarnings(): void {
    this.driverNotifySettings.update(s => ({ ...s, earnings: !s.earnings }));
  }

  async saveDriverNotifySettings() {
    this.savingDriverNotify.set(true);
    const cfg = this.driverNotifySettings();
    await this.agService.updateDriverNotifySettings({
      newRequests: cfg.newRequests, tripUpdates: cfg.tripUpdates, earnings: cfg.earnings,
    });
    this.savingDriverNotify.set(false);
  }

  async loadDriverReports() {
    const profile = this.agProfile();
    if (!profile) return;
    const rs = await this.agService.listDriverReports(profile.id);
    this.driverReports.set(rs);
  }

  async submitDriverReport() {
    const profile = this.agProfile();
    if (!profile || !this.driverReportDesc.trim()) return;
    this.submittingDriverReport.set(true);
    const res = await this.agService.submitDriverReport(
      profile.id, this.driverReportKind(), this.driverReportDesc,
    );
    this.submittingDriverReport.set(false);
    if (res.success) {
      this.driverReportDesc = '';
      await this.loadDriverReports();
      alert('Reporte enviado. Te contactaremos pronto.');
    } else {
      alert('Error: ' + (res.error ?? 'desconocido'));
    }
  }

  // ═══════════════════════════════════════════════════
  // PASSENGER: favoritos
  // ═══════════════════════════════════════════════════
  async loadPassengerFavorites() {
    const userId = (await this.agService['supabase'].auth.getUser()).data.user?.id;
    if (!userId) return;
    const favs = await this.agService.listPassengerFavorites(userId);
    this.passengerFavorites.set(favs);
  }

  async addPassengerFavorite() {
    if (!this.newFavLabel.trim() || !this.newFavAddress.trim()) return;
    const userId = (await this.agService['supabase'].auth.getUser()).data.user?.id;
    if (!userId) return;
    this.addingFav.set(true);
    const lat = this._currentLat ?? this.DEFAULT_LAT;
    const lng = this._currentLng ?? this.DEFAULT_LNG;
    await this.agService.addPassengerFavorite(userId, {
      label: this.newFavLabel.trim(), address: this.newFavAddress.trim(), lat, lng,
    });
    this.newFavLabel = '';
    this.newFavAddress = '';
    this.addingFav.set(false);
    await this.loadPassengerFavorites();
  }

  async removePassengerFavorite(id: string) {
    await this.agService.removePassengerFavorite(id);
    await this.loadPassengerFavorites();
  }

  useFavoriteAsDestination(fav: any) {
    this.tripDest.set({ name: fav.address, lat: fav.lat, lng: fav.lng });
    this.passengerSection.set(null);
  }

  // ═══════════════════════════════════════════════════
  // PASSENGER: métodos de pago
  // ═══════════════════════════════════════════════════
  async loadPaymentMethods() {
    const profile = this.agProfile();
    if (!profile) return;
    const pms = await this.agService.listPaymentMethods(profile.id);
    this.passengerPaymentMethods.set(pms);
  }

  async addPaymentMethod() {
    const profile = this.agProfile();
    if (!profile || !this.newPmLabel.trim()) return;
    this.addingPm.set(true);
    await this.agService.addPaymentMethod(profile.id, {
      kind: this.newPmKind(), label: this.newPmLabel.trim(),
      last4: this.newPmLast4 || undefined, brand: this.newPmBrand || undefined,
      account: this.newPmAccount || undefined,
      isDefault: this.passengerPaymentMethods().length === 0,
    });
    this.newPmLabel = '';
    this.newPmLast4 = '';
    this.newPmBrand = '';
    this.newPmAccount = '';
    this.addingPm.set(false);
    await this.loadPaymentMethods();
  }

  async deletePm(id: string) {
    await this.agService.deletePaymentMethod(id);
    await this.loadPaymentMethods();
  }

  async setDefaultPm(id: string) {
    const profile = this.agProfile();
    if (!profile) return;
    await this.agService.setDefaultPaymentMethod(id, profile.id);
    await this.loadPaymentMethods();
  }

  // ═══════════════════════════════════════════════════
  // PASSENGER: wallet
  // ═══════════════════════════════════════════════════
  async loadPassengerWallet() {
    const profile = this.agProfile();
    if (!profile) return;
    const [balance, history] = await Promise.all([
      this.agService.getPassengerWalletBalance(profile.id),
      this.agService.getPassengerWalletHistory(profile.id),
    ]);
    this.passengerWalletBalance.set(balance);
    this.passengerWalletHistory.set(history);
  }

  async rechargePassengerWallet() {
    const amount = this.pRechargeAmount();
    if (amount < 5000) { alert('Monto mínimo $5,000'); return; }
    this.pRechargeLoading.set(true);
    try {
      await this.agService.creditPassengerWallet(amount, 'recharge', 'Recarga wallet');
      this.pRechargeAmount.set(0);
      await this.loadPassengerWallet();
    } finally {
      this.pRechargeLoading.set(false);
    }
  }

  // ═══════════════════════════════════════════════════
  // PASSENGER: scheduled trips
  // ═══════════════════════════════════════════════════
  async loadPassengerScheduled() {
    const userId = (await this.agService['supabase'].auth.getUser()).data.user?.id;
    if (!userId) return;
    const trips = await this.agService.listPassengerScheduledTrips(userId);
    this.passengerScheduled.set(trips);
  }

  async createScheduledTripPassenger() {
    const userId = (await this.agService['supabase'].auth.getUser()).data.user?.id;
    const dest = this.tripDest();
    if (!userId || !dest || !this.schedDate || !this.schedTime) {
      alert('Selecciona fecha, hora y destino primero.');
      return;
    }
    this.creatingSched.set(true);
    const when = new Date(`${this.schedDate}T${this.schedTime}:00`).toISOString();
    const res = await this.agService.createScheduledTrip(userId, {
      originAddress: this.currentAddress() ?? 'Ubicación actual',
      originLat: this._currentLat, originLng: this._currentLng,
      destinationAddress: dest.name, destinationLat: dest.lat, destinationLng: dest.lng,
      vehicleType: this.tripVehicle(), suggestedPrice: this.tripPrice(),
      paymentMethod: this.tripPayment(), scheduledFor: when,
    });
    this.creatingSched.set(false);
    if (res.success) {
      this.schedDate = '';
      this.schedTime = '';
      await this.loadPassengerScheduled();
    } else {
      alert('Error: ' + (res.error ?? 'desconocido'));
    }
  }

  async cancelScheduledTripPassenger(id: string) {
    if (!confirm('¿Cancelar este viaje programado?')) return;
    await this.agService.cancelScheduledTrip(id);
    await this.loadPassengerScheduled();
  }

  // ═══════════════════════════════════════════════════
  // PASSENGER: lost items
  // ═══════════════════════════════════════════════════
  async loadPassengerLostItems() {
    const profile = this.agProfile();
    if (!profile) return;
    const items = await this.agService.listPassengerLostItems(profile.id);
    this.passengerLostItems.set(items);
  }

  // ═══════════════════════════════════════════════════
  // PASSENGER: reportes
  // ═══════════════════════════════════════════════════
  async loadPassengerReports() {
    const profile = this.agProfile();
    if (!profile) return;
    const reports = await this.agService.listPassengerReports(profile.id);
    this.passengerReports.set(reports);
  }

  async submitPassengerReport() {
    const profile = this.agProfile();
    if (!profile || !this.reportDescription.trim()) return;
    this.submittingReport.set(true);
    const res = await this.agService.submitPassengerReport(
      profile.id, this.reportKind(), this.reportDescription,
    );
    this.submittingReport.set(false);
    if (res.success) {
      this.reportDescription = '';
      await this.loadPassengerReports();
      alert('Reporte enviado. Te contactaremos pronto.');
    } else {
      alert('Error: ' + (res.error ?? 'desconocido'));
    }
  }

  // ═══════════════════════════════════════════════════
  // PASSENGER: loyalty
  // ═══════════════════════════════════════════════════
  async loadPassengerLoyalty() {
    const profile = this.agProfile();
    if (!profile) return;
    const l = await this.agService.getPassengerLoyalty(profile.id);
    this.passengerLoyalty.set(l);
  }

  levelColor(level: string): string {
    const m: Record<string, string> = {
      bronce: '#cd7f32', plata: '#c0c0c0', oro: '#ffd700',
      platino: '#e5e4e2', diamante: '#b9f2ff',
    };
    return m[level] ?? '#cd7f32';
  }

  tripsToNextLevel(level: string, total: number): { next: string; remaining: number } | null {
    const thresholds: Record<string, { next: string; at: number }> = {
      bronce:   { next: 'plata', at: 15 },
      plata:    { next: 'oro', at: 50 },
      oro:      { next: 'platino', at: 100 },
      platino:  { next: 'diamante', at: 200 },
    };
    const t = thresholds[level];
    if (!t) return null;
    return { next: t.next, remaining: Math.max(0, t.at - total) };
  }

  // ═══════════════════════════════════════════════════
  // PASSENGER: corporate
  // ═══════════════════════════════════════════════════
  async loadCorporateAccounts() {
    const profile = this.agProfile();
    if (!profile) return;
    const accounts = await this.agService.listCorporateAccounts(profile.id);
    this.passengerCorporateAccounts.set(accounts);
  }

  async createCorporateAccount() {
    const profile = this.agProfile();
    if (!profile || !this.newCorpName.trim()) return;
    this.creatingCorp.set(true);
    const res = await this.agService.createCorporateAccount(profile.id, {
      name: this.newCorpName.trim(), nit: this.newCorpNit.trim() || undefined,
      monthlyBudget: this.newCorpBudget || 0,
    });
    this.creatingCorp.set(false);
    if (res.success) {
      this.newCorpName = '';
      this.newCorpNit = '';
      this.newCorpBudget = 0;
      await this.loadCorporateAccounts();
    } else {
      alert('Error: ' + (res.error ?? 'desconocido'));
    }
  }

  // ═══════════════════════════════════════════════════
  // PASSENGER: editar perfil
  // ═══════════════════════════════════════════════════
  openTerms() {
    window.open('https://publihazclick.com/terminos', '_blank');
  }

  openEditProfile() {
    const p = this.agProfile();
    if (!p) return;
    this.editProfileName = p.full_name ?? '';
    this.editProfilePhone = p.phone ?? '';
    this.editProfileCity = (p as any).city ?? '';
    this.editProfileFile = null;
    this.editProfilePreview = null;
    this.editProfileOpen.set(true);
  }

  onEditProfileFile(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.editProfileFile = file;
    const reader = new FileReader();
    reader.onload = (e) => { this.editProfilePreview = e.target?.result as string; this.cdr.markForCheck(); };
    reader.readAsDataURL(file);
  }

  async saveEditProfile() {
    this.savingProfile.set(true);
    const res = await this.agService.updatePassengerProfile({
      fullName: this.editProfileName.trim() || undefined,
      phone: this.editProfilePhone.trim() || undefined,
      city: this.editProfileCity.trim() || undefined,
      selfieFile: this.editProfileFile ?? undefined,
    });
    this.savingProfile.set(false);
    if (res.success) {
      this.editProfileOpen.set(false);
      const profile = await this.agService.getMyAgProfile();
      this.agProfile.set(profile);
    } else {
      alert('Error: ' + (res.error ?? 'desconocido'));
    }
  }

  // ═══════════════════════════════════════════════════
  // PASSENGER: propina
  // ═══════════════════════════════════════════════════
  openTipModal(tripId: string) {
    this.tipTripId.set(tripId);
    this.tipAmount.set(0);
    this.tipModalOpen.set(true);
  }

  async submitTip() {
    const tripId = this.tipTripId();
    const amount = this.tipAmount();
    if (!tripId || amount <= 0) return;
    this.submittingTip.set(true);
    const res = await this.agService.tipDriverSafe(tripId, amount);
    this.submittingTip.set(false);
    if (res.success) {
      this.tipModalOpen.set(false);
      this.tipTripId.set(null);
      alert(`¡Gracias! Propina de $${amount.toLocaleString('es-CO')} enviada al conductor.`);
    } else {
      alert('Error: ' + (res.error ?? 'desconocido'));
    }
  }

  // ═══════════════════════════════════════════════════
  // PASSENGER: detalle viaje + recibo
  // ═══════════════════════════════════════════════════
  async openPassengerTripDetail(trip: any) {
    const id = trip.id ?? trip.trip_request_id;
    if (!id) return;
    this.loadingPassengerDetail.set(true);
    this.passengerTripDetailOpen.set(true);
    const detail = await this.agService.getPassengerTripDetail(id);
    this.passengerTripDetail.set(detail);
    this.loadingPassengerDetail.set(false);
  }

  closePassengerTripDetail() {
    this.passengerTripDetailOpen.set(false);
    this.passengerTripDetail.set(null);
  }

  downloadPassengerReceipt() {
    const d = this.passengerTripDetail();
    const p = this.agProfile();
    if (!d) return;
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Recibo Movi</title>
<style>body{font-family:Arial,sans-serif;max-width:600px;margin:20px auto;padding:20px;color:#222}
h1{color:#f97316;border-bottom:2px solid #f97316;padding-bottom:10px}
.row{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #eee}
.total{font-weight:bold;font-size:18px;color:#f97316}</style></head>
<body><h1>Recibo de viaje — Movi</h1>
<p><strong>Viaje ID:</strong> ${d.id}<br><strong>Fecha:</strong> ${d.completed_at ? new Date(d.completed_at).toLocaleString('es-CO') : '-'}</p>
<p><strong>Pasajero:</strong> ${p?.full_name ?? '-'}<br>
<strong>Conductor:</strong> ${d.driver_name ?? '-'} ${d.driver_rating ? '⭐ ' + d.driver_rating : ''}<br>
<strong>Vehículo:</strong> ${d.driver_vehicle_brand ?? ''} ${d.driver_vehicle_model ?? ''} ${d.driver_plate ? '· ' + d.driver_plate : ''}<br>
<strong>Destino:</strong> ${d.dest_name ?? '-'}<br>
<strong>Distancia:</strong> ${(d.distance_km ?? 0).toFixed(2)} km<br>
<strong>Categoría:</strong> ${d.trip_category ?? 'economy'}<br>
<strong>Método de pago:</strong> ${d.payment_method ?? '-'}</p>
<h2>Desglose</h2>
<div class="row"><span>Tarifa base</span><span>$${(d.base_fare ?? 0).toLocaleString('es-CO')}</span></div>
<div class="row"><span>Distancia</span><span>$${(d.distance_fare ?? 0).toLocaleString('es-CO')}</span></div>
${d.surge_multiplier > 1 ? `<div class="row"><span>Alta demanda x${d.surge_multiplier}</span><span>+$${(d.surge_amount ?? 0).toLocaleString('es-CO')}</span></div>` : ''}
${d.tip_amount > 0 ? `<div class="row"><span>Propina</span><span>+$${d.tip_amount.toLocaleString('es-CO')}</span></div>` : ''}
<div class="row total"><span>Total pagado</span><span>$${((d.final_price ?? d.offered_price ?? 0) + (d.tip_amount ?? 0)).toLocaleString('es-CO')}</span></div>
<p style="margin-top:30px;font-size:12px;color:#666">Gracias por viajar con Movi.</p>
</body></html>`;
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `recibo-movi-${d.id?.slice(0, 8)}.html`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // ═══════════════════════════════════════════════════
  // PASSENGER: rechazar oferta
  // ═══════════════════════════════════════════════════
  async rejectPassengerOffer(offerId: string) {
    await this.agService.rejectOffer(offerId);
    this.receivedOffers.update(list => list.filter((o: any) => o.id !== offerId));
  }

  // ═══════════════════════════════════════════════════
  // PASSENGER: repetir viaje
  // ═══════════════════════════════════════════════════
  async repeatPassengerTrip(tripId: string) {
    if (!confirm('¿Pedir el mismo viaje de nuevo?')) return;
    const newId = await this.agService.repeatTrip(tripId);
    if (newId) {
      this.currentTripRequestId.set(newId);
      this.passengerSection.set(null);
      alert('Nueva solicitud creada. Los conductores cercanos la están viendo.');
    }
  }

  // ═══════════════════════════════════════════════════
  // PASSENGER: chat bidireccional
  // ═══════════════════════════════════════════════════
  async openPassengerChat() {
    const tripId = this.tripAccepted()?.trip_request_id ?? this.currentTripRequestId();
    if (!tripId) return;
    this.chatRequestId.set(tripId);
    this.chatUnread.set(0);
    const msgs = await this.agService.getChatMessages(tripId);
    this.chatMessages.set(msgs);
    this.chatOpen.set(true);  // abre el modal del pasajero (no el del conductor)
    this._unsubscribeChat();
    this._chatChannel = this.agService.subscribeToChatMessages(tripId, (msg: any) => {
      this.chatMessages.update(list => [...list, msg]);
      this.cdr.markForCheck();
      this._scrollChatToBottom('passenger-chat-messages');
    });
    setTimeout(() => this._scrollChatToBottom('passenger-chat-messages'), 50);
  }

  closePassengerChat() {
    this.chatOpen.set(false);
    this._unsubscribeChat();
  }

  async sendPassengerChat() {
    const profile = this.agProfile();
    const tripId = this.tripAccepted()?.trip_request_id ?? this.currentTripRequestId();
    if (!profile || !tripId || !this.chatInput.trim()) return;
    this.sendingChat.set(true);
    const text = this.chatInput;
    this.chatInput = '';
    await this.agService.sendChatMessage(tripId, profile.id, text);
    this.sendingChat.set(false);
    this._scrollChatToBottom('passenger-chat-messages');
  }

  // suscripción de fondo — solo incrementa badge cuando el modal está cerrado
  startPassengerChatBackground(tripId: string) {
    if (this.chatRequestId() === tripId) return; // ya suscrito
    this.chatRequestId.set(tripId);
    this._unsubscribeChat();
    this._chatChannel = this.agService.subscribeToChatMessages(tripId, (msg: any) => {
      if (!this.chatOpen()) {
        this.chatUnread.update(n => n + 1);
        this.cdr.markForCheck();
      } else {
        this.chatMessages.update(list => [...list, msg]);
        this.cdr.markForCheck();
        this._scrollChatToBottom('passenger-chat-messages');
      }
    });
  }

  private _scrollChatToBottom(containerId: string) {
    if (!isPlatformBrowser(this.platformId)) return;
    setTimeout(() => {
      const el = document.getElementById(containerId);
      if (el) el.scrollTop = el.scrollHeight;
    }, 30);
  }

  // ═══════════════════════════════════════════════════
  // PASSENGER: tracking live del conductor y etapas
  // ═══════════════════════════════════════════════════
  async startDriverTracking(driverId: string, tripId: string) {
    const initial = await this.agService.getDriverLocation(driverId);
    if (initial) this.driverLiveLocation.set(initial);
    this._driverLocChannel = this.agService.subscribeDriverLocation(driverId, (loc: any) => {
      this.driverLiveLocation.set(loc);
    });
    this._tripStageChannel = this.agService.subscribeTripStage(tripId, (stage: string) => {
      this.currentTripStage.set(stage);
      this.cdr.markForCheck();

      // Conductor llegó al punto de recogida: mostrar banner + countdown 5 min
      if (stage === 'arrived_at_pickup') {
        this.arrivedAtPickupTimer.set(240);
        this._startArrivalTimer();
        this.acceptedDriverEta.set(0);
      }

      // Pasajero recogido: limpiar ruta de aproximación + timer + activar mapa fullscreen
      if (stage === 'picked_up' || stage === 'on_route') {
        this._clearApproachRoute();
        this._clearArrivalTimer();
        this.arrivedAtPickupTimer.set(null);
        this.acceptedDriverEta.set(null);
        this.passengerSection.set(null);
        this.passengerMapFullscreen.set(true);
        if (stage === 'on_route') {
          this._drawPassengerTripRoute();
        }
        setTimeout(() => this._map?.resize(), 200);
      }

      // Cuando el conductor llega al destino: mostrar banner "llegaste"
      if (stage === 'arrived_at_destination') {
        this.passengerMapFullscreen.set(true);
        setTimeout(() => this._map?.resize(), 200);
      }

      // Cuando el conductor finaliza el viaje: auto-completar desde el lado del pasajero
      if (stage === 'completed') {
        this.stopDriverTracking();
        this.passengerMapFullscreen.set(false);
        this._clearNavRoute();
        this._clearArrivalTimer();
        this.arrivedAtPickupTimer.set(null);
        this._showTripReceipt('passenger');
      }

      // Viaje cancelado: resetear home y mapa del pasajero
      if (stage === 'cancelled') {
        this.stopDriverTracking();
        // Asegurar estado inicial del pasajero: sin fullscreen → 520px
        this.passengerMapFullscreen.set(false);
        this._clearNavRoute();
        this._clearApproachRoute();
        this._clearArrivalTimer();
        this.arrivedAtPickupTimer.set(null);
        this.acceptedDriverEta.set(null);
        this.driverLiveLocation.set(null);
        this.passengerSection.set(null);
        this.currentTripStage.set(null);
        this.tripAccepted.set(null);
        this.tripSent.set(false);
        this.tripOpen.set(false);
        this.tripQuery.set('');
        this.tripSuggestions.set([]);
        this.tripDistKm.set(0);
        this.tripPrice.set(0);
        this.currentTripRequestId.set(null);
        this.receivedOffers.set([]);
        this.acceptingOfferId.set(null);
        this._clearRoute();
        if (typeof localStorage !== 'undefined') localStorage.removeItem('movi_active_trip');
        // Restaurar mapa a estado inicial (520px, tiles recargados)
        this._resetMapToInitialState();
      }
    });
  }

  private _autoCompletePassengerTrip(): void {
    const offer  = this.tripAccepted();
    const tripId = this.currentTripRequestId();
    if (!tripId || !offer) { this._resetTrip(); return; }
    const driverUser = (offer as any).ag_drivers?.ag_users;
    this.ratingTripId.set(tripId);
    this.ratingTarget.set({
      userId: (offer as any).ag_drivers?.ag_user_id ?? '',
      name:   driverUser?.full_name ?? 'Tu conductor',
      role:   'driver',
    });
    this.ratingStars.set(0);
    this.ratingCommentValue = '';
    this.ratingSkipped.set(false);
    this.ratingModal.set(true);
    this._resetTrip();
  }

  private async _drawPassengerTripRoute(): Promise<void> {
    const dest = this.tripDest();
    if (!dest || !this._map) return;
    try {
      this._clearNavRoute();
      const url = [
        `https://api.mapbox.com/directions/v5/mapbox/driving/`,
        `${this._currentLng},${this._currentLat};${dest.lng},${dest.lat}`,
        `?geometries=geojson&overview=full&access_token=${this.MAPBOX_TOKEN}`,
      ].join('');
      const json  = await (await fetch(url)).json();
      const route = json.routes?.[0];
      if (!route || !this._map) return;
      this._map.addSource('nav-route', { type: 'geojson', data: { type: 'Feature', properties: {}, geometry: route.geometry } });
      this._map.addLayer({ id: 'nav-route-bg',   type: 'line', source: 'nav-route', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#000',    'line-width': 10, 'line-opacity': 0.12 } });
      this._map.addLayer({ id: 'nav-route-line', type: 'line', source: 'nav-route', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#f97316', 'line-width': 6,  'line-opacity': 0.9 } });
      const coords   = route.geometry.coordinates as [number, number][];
      const mapboxgl = (window as any).mapboxgl;
      const bounds   = coords.reduce((b: any, c: [number, number]) => b.extend(c), new mapboxgl.LngLatBounds(coords[0], coords[0]));
      this._map.fitBounds(bounds, { padding: { top: 120, bottom: 200, left: 40, right: 40 }, duration: 900 });
    } catch (e) { console.warn('passenger route err', e); }
  }

  stopDriverTracking() {
    this.agService.unsubscribeChannel(this._driverLocChannel);
    this.agService.unsubscribeChannel(this._tripStageChannel);
    this._driverLocChannel = null;
    this._tripStageChannel = null;
  }

  stageLabel(stage: string | null): string {
    if (!stage) return 'Esperando...';
    const found = this.passengerTripStages.find(s => s.key === stage);
    return found?.label ?? stage;
  }

  isStagePassed(stage: string, current: string | null): boolean {
    if (!current) return false;
    const order = this.passengerTripStages.map(s => s.key);
    return order.indexOf(current) >= order.indexOf(stage);
  }

  // ═══════════════════════════════════════════════════
  // PASSENGER: share trip link
  // ═══════════════════════════════════════════════════
  async sharePassengerTrip() {
    const tripId = this.tripAccepted()?.trip_request_id ?? this.currentTripRequestId();
    const userId = (await this.agService['supabase'].auth.getUser()).data.user?.id;
    if (!tripId || !userId) return;
    this.creatingShare.set(true);
    const token = await this.agService.createPassengerTripShare(tripId, userId, 4);
    this.creatingShare.set(false);
    if (token) {
      const link = `${window.location.origin}/anda-gana/share/${token}`;
      this.tripShareLink.set(link);
      if (navigator.share) {
        try { await navigator.share({ title: 'Sigue mi viaje en Movi', url: link }); } catch {}
      }
    }
  }

  async copyShareLink() {
    const link = this.tripShareLink();
    if (link && navigator.clipboard) {
      await navigator.clipboard.writeText(link);
      alert('Link copiado');
    }
  }

  // ═══════════════════════════════════════════════════
  // PASSENGER: obtener info pública del conductor para mostrar rating en oferta
  // ═══════════════════════════════════════════════════
  async getDriverPublic(driverId: string): Promise<any> {
    if (this.driverPublicInfoCache.has(driverId)) return this.driverPublicInfoCache.get(driverId);
    const info = await this.agService.getDriverPublicInfo(driverId);
    this.driverPublicInfoCache.set(driverId, info);
    return info;
  }

  // ═══════════════════════════════════════════════════
  // PASSENGER: accesibilidad
  // ═══════════════════════════════════════════════════
  toggleAccessibility(key: 'pets'|'luggage'|'child_seat'|'wheelchair') {
    this.tripAccessibility.update(a => ({ ...a, [key]: !a[key] }));
  }

  // ═══════════════════════════════════════════════════
  // PASSENGER: waypoints
  // ═══════════════════════════════════════════════════
  addPassengerWaypoint() {
    if (!this.newWaypointAddress.trim()) return;
    const lat = this.tripDest()?.lat ?? this._currentLat;
    const lng = this.tripDest()?.lng ?? this._currentLng;
    this.passengerWaypoints.update(list => [...list, {
      address: this.newWaypointAddress.trim(), lat, lng,
    }]);
    this.newWaypointAddress = '';
  }

  removePassengerWaypoint(index: number) {
    this.passengerWaypoints.update(list => list.filter((_, i) => i !== index));
  }

  // ═══════════════════════════════════════════════════
  // PASSENGER: categoría premium
  // ═══════════════════════════════════════════════════
  selectTripCategory(cat: string) {
    this.selectedCategory.set(cat as 'economy'|'comfort'|'premium'|'xl');
    const mult = this.tripCategories.find(c => c.key === cat)?.mult ?? 1;
    // Recalcular precio base
    const baseKm = 1500;
    const minFare = 5000;
    const distKm = this.tripDistKm();
    const newPrice = Math.max(minFare, Math.round(distKm * baseKm * mult));
    this.tripPrice.set(newPrice);
  }

  async loadPassengerHistory() {
    const profile = this.agProfile();
    if (!profile) return;
    this.passengerHistoryLoading.set(true);
    try {
      const history = await this.agService.getPassengerTripHistory(profile.id);
      this.passengerHistory.set(history);
    } catch { /* silent */ } finally {
      this.passengerHistoryLoading.set(false);
    }
  }

  addPassengerContact() {
    if (!this.passengerNewContactName.trim() || !this.passengerNewContactPhone.trim()) return;
    this.passengerSecurityContacts.update(list => [
      ...list,
      { name: this.passengerNewContactName.trim(), phone: this.passengerNewContactPhone.trim() },
    ]);
    this.passengerNewContactName = '';
    this.passengerNewContactPhone = '';
  }

  removePassengerContact(phone: string) {
    this.passengerSecurityContacts.update(list => list.filter(c => c.phone !== phone));
  }

  async savePassengerSettings() {
    this.savingPassengerSettings.set(true);
    await new Promise(r => setTimeout(r, 400));
    this.savingPassengerSettings.set(false);
  }

  // ═════════════ Push notifications ═════════════
  private _urlB64ToUint8(base64: string): Uint8Array {
    const padding = '='.repeat((4 - (base64.length % 4)) % 4);
    const b = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
    const raw = atob(b);
    const out = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
  }

  async checkPushSupport(): Promise<void> {
    if (typeof window === 'undefined') return;
    const supported = 'serviceWorker' in navigator && 'PushManager' in window;
    this.pushSupported.set(supported);
    if (!supported) return;
    try {
      const reg = await navigator.serviceWorker.getRegistration('/sw-movi.js');
      const sub = await reg?.pushManager.getSubscription();
      this.pushEnabled.set(!!sub);
    } catch {}
  }

  async _autoRegisterPush(): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) return;
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      this.pushDiagStatus.set('error');
      this.pushDiagLabel.set('Este navegador no soporta Web Push');
      this.cdr.markForCheck(); return;
    }
    const vapid = (environment as any).vapidPublicKey;
    if (!vapid) return;
    try {
      if (Notification.permission === 'denied') {
        this.pushDiagStatus.set('denied');
        this.pushDiagLabel.set('Permiso denegado — actívalo en el menú del navegador o en Ajustes → Apps → Movi');
        this.cdr.markForCheck(); return;
      }
      const reg = await navigator.serviceWorker.register('/sw-movi.js');
      let granted = Notification.permission === 'granted';
      if (!granted) {
        const res = await Notification.requestPermission();
        granted = res === 'granted';
      }
      if (!granted) {
        this.pushDiagStatus.set('error');
        this.pushDiagLabel.set('Permiso no concedido — toca "Activar"');
        this.cdr.markForCheck(); return;
      }
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        const key = this._urlB64ToUint8(vapid);
        sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key.buffer as ArrayBuffer });
      }
      await this.agService.registerPushSubscription(sub);
      this.pushEnabled.set(true);
      this.pushDiagStatus.set('ok');
      this.pushDiagLabel.set('✓ Notificaciones activas — recibirás viajes con la app cerrada');
      this.cdr.markForCheck();
    } catch (e: any) {
      this.pushDiagStatus.set('error');
      this.pushDiagLabel.set('Error: ' + (e?.message ?? String(e)));
      this.cdr.markForCheck();
    }
  }

  async enablePush(): Promise<void> {
    const vapid = (environment as any).vapidPublicKey;
    if (!vapid) { alert('Notificaciones no configuradas'); return; }
    try {
      const reg = await navigator.serviceWorker.register('/sw-movi.js');
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') { alert('Permiso denegado por el navegador'); return; }
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        const key = this._urlB64ToUint8(vapid);
        sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key.buffer as ArrayBuffer });
      }
      await this.agService.registerPushSubscription(sub);
      this.pushEnabled.set(true);
    } catch (e: any) { alert('Error: ' + (e?.message ?? 'No se pudo activar')); }
  }

  async disablePush(): Promise<void> {
    try {
      const reg = await navigator.serviceWorker.getRegistration('/sw-movi.js');
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await this.agService.unregisterPushSubscription(sub.endpoint);
        await sub.unsubscribe();
      }
      this.pushEnabled.set(false);
    } catch {}
  }

  async callDriver(): Promise<void> {
    const tripId = this.currentTripRequestId();
    if (!tripId || this.callingDriver()) return;
    this.callingDriver.set(true);
    try {
      const r = await this.agService.startMaskedCall(tripId);
      if (r.ok) {
        alert('📞 Te estamos llamando. Contesta y serás conectado con el conductor.');
      } else {
        alert('Error: ' + (r.error ?? 'No se pudo iniciar llamada'));
      }
    } finally { this.callingDriver.set(false); }
  }

  // ═══════════ Cupones ═══════════
  async applyCouponCode(): Promise<void> {
    const code = (this.couponInput ?? '').trim();
    if (!code) return;
    this.validatingCoupon.set(true);
    this.couponError.set(null);
    try {
      const r = await this.agService.validateCoupon(code, this.tripPrice());
      if (r.ok && r.couponId != null && r.discount != null) {
        this.appliedCoupon.set({ couponId: r.couponId, discount: r.discount, title: r.title ?? code, description: r.description });
      } else {
        this.couponError.set(r.error ?? 'Cupón inválido');
      }
    } finally { this.validatingCoupon.set(false); }
  }

  removeCoupon(): void {
    this.appliedCoupon.set(null);
    this.couponInput = '';
    this.couponError.set(null);
  }

  async triggerPanic(): Promise<void> {
    if (this.panicActivated() || this.panicSending()) return;
    this.panicSending.set(true);
    try {
      // Obtener ubicación actual
      let lat: number | undefined;
      let lng: number | undefined;
      let accuracy: number | undefined;
      if (typeof navigator !== 'undefined' && navigator.geolocation) {
        try {
          const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
            navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 30000, maximumAge: 5000 })
          );
          if (pos.coords.accuracy <= 50) {
            lat = pos.coords.latitude;
            lng = pos.coords.longitude;
            accuracy = pos.coords.accuracy;
          }
        } catch {}
      }
      // Sincronizar contactos locales con DB antes (si no están)
      try {
        const userId = (await this.agService['supabase'].auth.getUser()).data.user?.id;
        if (userId) {
          const existing = await this.agService.listEmergencyContacts(userId);
          const existingPhones = new Set((existing ?? []).map((c: any) => c.phone));
          const locals = this.passengerSecurityContacts();
          for (const c of locals) {
            if (!existingPhones.has(c.phone)) {
              await this.agService.addEmergencyContact(userId, c.name, c.phone).catch(() => {});
            }
          }
        }
      } catch {}

      const tripId = this.currentTripRequestId();
      const result = await this.agService.triggerSos({ tripId: tripId ?? null, lat, lng, accuracy, message: 'Activado desde la app' });
      this.panicActivated.set(true);
      this.panicContactsNotified.set(result.contactsNotified ?? 0);
      this.panicMapsLink.set(result.mapsLink ?? '');
      if (typeof alert !== 'undefined') {
        alert(`🚨 Alerta enviada. ${result.contactsNotified ?? 0} contacto(s) notificado(s).\n\nSi es una emergencia real, llama al 123.`);
      }
    } catch (e: any) {
      alert('Error: ' + (e?.message ?? 'No se pudo enviar alerta'));
    } finally {
      this.panicSending.set(false);
    }
  }

  togglePassengerFaq(q: string) {
    this.openPassengerFaq.set(this.openPassengerFaq() === q ? null : q);
  }

  togglePassengerSound() {
    const s = this.passengerNotifSettings();
    this.passengerNotifSettings.set({ ...s, sound: !s.sound });
  }

  togglePassengerVibration() {
    const s = this.passengerNotifSettings();
    this.passengerNotifSettings.set({ ...s, vibration: !s.vibration });
  }

  togglePassengerNewOffers() {
    const s = this.passengerNotifSettings();
    this.passengerNotifSettings.set({ ...s, newOffers: !s.newOffers });
  }

  togglePassengerHidePhone() {
    const s = this.passengerSettings();
    this.passengerSettings.set({ ...s, hidePhone: !s.hidePhone });
  }

  formatTripDate(isoString: string): string {
    try {
      return new Date(isoString).toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: '2-digit' });
    } catch {
      return '';
    }
  }


  // ══════════════════════════════════════════════════════════
  // QUICK-REGISTER: registro rápido en 3 pasos
  // ══════════════════════════════════════════════════════════

  async qrSaveVehicleAndEnter() {
    const vehicle = this.qrVehicleType();
    if (!vehicle) return;
    this.qrOtpVerifying.set(true);
    this.qrOtpError.set('');
    this.cdr.markForCheck();
    const phone = '+57' + this.qrPhone().replace(/\D/g, '');
    const edgeProfile = this._qrEdgeProfile;

    // Use edge function with service_role — bypasses all client-side auth/RLS issues
    const sb = getMoviClient();
    const { data, error } = await sb.functions.invoke('ag-register-driver', {
      body: {
        phone,
        ag_user_id: edgeProfile?.id ?? null,
        name: (edgeProfile?.full_name ?? this.qrName().trim()) || 'Conductor',
        vehicle_type: vehicle,
        vehicle_brand: this.qrVehicleBrand() || '',
        vehicle_color: this.qrVehicleColor() || '',
        plate: this.qrVehiclePlate() || '',
      },
    });
    this._qrEdgeProfile = null;

    this.qrOtpVerifying.set(false);
    if (error || !data?.ok) {
      this.qrOtpError.set(data?.error ?? 'Error al guardar el vehículo. Intenta de nuevo.');
      this.cdr.markForCheck();
      return;
    }

    const profile = data.profile;
    const driverRow = data.driver;
    this.agProfile.set(profile);
    this.agReferralLink.set(`${window.location.origin}/anda-gana?ref=${profile.id}`);
    const mine = driverRow ? { ...driverRow, status: driverRow.status ?? 'quick' } : null;
    this.driverData.set(mine);
    this.driverStatus.set(mine?.status ?? 'quick');
    if (driverRow?.wallet_balance != null) {
      this.driverWalletBalance.set(driverRow.wallet_balance);
    }
    this.screen.set('driver-home');
    setTimeout(() => this.initGpsAndMap('ag-map-user'), 150);
    await this._initDriverHome(mine);
    this.cdr.markForCheck();
  }

  startQuickRegister() {
    this.qrRole.set('pasajero');
    this.qrStep.set(1);
    this.qrName.set('');
    this.qrPhone.set('');
    this.qrOtpCode.set('');
    this.qrNameDisplay    = '';
    this.qrPhoneDisplay   = '';
    this.qrOtpCodeDisplay = '';
    this.qrOtpError.set('');
    this.qrError.set('');
    this.qrOriginQuery.set('');
    this.qrOriginSuggestions.set([]);
    this.qrOriginSelected.set(null);
    this.qrDestQuery.set('');
    this.qrDestSuggestions.set([]);
    this.qrDestSelected.set(null);
    this.qrPrice.set(8000);
    this.qrVehicle.set('carro');
    this.qrPayment.set('efectivo');
    this.screen.set('quick-register');
    if (this._qrCountdownInterval) { clearInterval(this._qrCountdownInterval); this._qrCountdownInterval = null; }
    setTimeout(() => this.phoneAuth.setupRecaptcha('qr-recaptcha-container'), 300);
  }

  async qrSendOtp() {
    const digits = this.qrPhone().replace(/\D/g, '');
    if (digits.length !== 10) { this.qrError.set('Ingresa un número de celular de 10 dígitos.'); return; }
    this.qrOtpSending.set(true);
    this.qrError.set('');
    this.cdr.markForCheck();
    const result = await this.phoneAuth.sendOTP('+57' + digits);
    this.qrOtpSending.set(false);
    if (result.ok) {
      this.qrOtpCode.set('');
      this.qrOtpCodeDisplay = '';
      this.qrOtpError.set('');
      this.qrStep.set(2);
      this._startQrCountdown();
    } else {
      this.qrError.set(result.message ?? 'Error al enviar el SMS. Intenta de nuevo.');
    }
    this.cdr.markForCheck();
  }

  private _startQrCountdown() {
    if (this._qrCountdownInterval) clearInterval(this._qrCountdownInterval);
    this.qrResendCountdown.set(30);
    this._qrCountdownInterval = setInterval(() => {
      const c = this.qrResendCountdown() - 1;
      this.qrResendCountdown.set(c);
      this.cdr.markForCheck();
      if (c <= 0 && this._qrCountdownInterval) {
        clearInterval(this._qrCountdownInterval);
        this._qrCountdownInterval = null;
      }
    }, 1000);
  }

  async qrResendOtp() {
    this.phoneAuth.reset();
    this.qrOtpCode.set('');
    this.qrOtpCodeDisplay = '';
    this.qrOtpError.set('');
    setTimeout(() => this.phoneAuth.setupRecaptcha('qr-recaptcha-container'), 100);
    await this.qrSendOtp();
  }

  async qrVerifyOtp() {
    const code = this.qrOtpCode().trim();
    if (code.length !== 6) { this.qrOtpError.set('El código debe tener 6 dígitos.'); return; }
    this.qrOtpVerifying.set(true);
    this.qrOtpError.set('');
    this.cdr.markForCheck();

    const phone = '+57' + this.qrPhone().replace(/\D/g, '');
    const name  = this.qrName().trim() || 'Usuario';
    const role  = this.qrRole() === 'conductor' ? 'driver' : 'passenger';

    // Pass name + role so the edge function creates ag_users with service role (bypasses RLS)
    const result = await this.phoneAuth.verifyOTP(code, {
      name,
      role,
      referredBy: this.referredBy ?? undefined,
    });

    if (!result.ok) {
      this.qrOtpVerifying.set(false);
      this.qrOtpError.set(result.message ?? 'Código incorrecto. Verifica e intenta de nuevo.');
      this.cdr.markForCheck();
      return;
    }

    if (this.qrRole() === 'conductor') {
      // Profile already created in edge function; store it if available
      if (result.profile) { this._qrEdgeProfile = result.profile; }
      this.qrOtpVerifying.set(false);
      this.qrStep.set(3);
      this.cdr.markForCheck();
      return;
    }

    // Passenger: use profile from edge function OR fall back to RPC
    let profile = result.profile;
    if (!profile) {
      const reg = await this.agService.registerQuickPassenger(name, phone, this.referredBy ?? undefined);
      this.qrOtpVerifying.set(false);
      if (!reg.success || !reg.profile) {
        this.qrOtpError.set(reg.error ?? 'Error al crear perfil. Intenta de nuevo.');
        this.cdr.markForCheck();
        return;
      }
      profile = reg.profile;
    } else {
      this.qrOtpVerifying.set(false);
    }

    this.agProfile.set(profile);
    this.agReferralLink.set(`${window.location.origin}/anda-gana?ref=${profile.id}`);
    this.loadReferralData();
    this.screen.set('passenger-home');
    this._startPassengerWatch();
    this._subscribeToDriverLocations();
    setTimeout(() => this.initGpsAndMap('ag-map-user'), 150);
    this.cdr.markForCheck();
  }

  private async _qrSearchPlaces(query: string): Promise<any[]> {
    if (!isPlatformBrowser(this.platformId)) return [];
    if (query.trim().length < 2) return [];
    try {
      const encoded = encodeURIComponent(query + ' Colombia');
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encoded}&limit=5&countrycodes=co&addressdetails=1`, {
        headers: { 'Accept-Language': 'es' },
      });
      const data = await res.json();
      return (data as any[]).map((r: any, i: number) => {
        const addr = r.address ?? {};
        const neighbourhood = addr.neighbourhood ?? addr.suburb ?? addr.quarter ?? null;
        const city = addr.city ?? addr.town ?? addr.municipality ?? addr.village ?? null;
        const placeParts = [neighbourhood, city].filter(Boolean);
        const placeName = placeParts.length > 0
          ? placeParts.join(', ')
          : (r.display_name ?? '').split(',').filter((p: string) => !/^\s*\d{4,6}\s*$/.test(p)).slice(1, 3).join(',').trim();
        return {
          id: `nom-${i}`,
          text: r.display_name?.split(',')[0] ?? '',
          place_name: placeName,
          center: [parseFloat(r.lon), parseFloat(r.lat)] as [number, number],
        };
      });
    } catch { return []; }
  }

  onQrOriginInput(val: string) {
    this.qrOriginQuery.set(val);
    if (this._qrSearchDebounce) clearTimeout(this._qrSearchDebounce);
    this._qrSearchDebounce = setTimeout(async () => {
      const results = await this._qrSearchPlaces(val);
      this.qrOriginSuggestions.set(results);
      this.cdr.markForCheck();
    }, 350);
  }

  qrSelectOrigin(s: any) {
    const lat = s.lat ?? (s.center ? s.center[1] : this._currentLat);
    const lng = s.lng ?? (s.center ? s.center[0] : this._currentLng);
    this.qrOriginSelected.set({ name: s.text || s.place_name, lat, lng });
    this.qrOriginQuery.set('');
    this.qrOriginSuggestions.set([]);
    this.cdr.markForCheck();
  }

  onQrDestInput(val: string) {
    this.qrDestQuery.set(val);
    if (this._qrSearchDebounce) clearTimeout(this._qrSearchDebounce);
    this._qrSearchDebounce = setTimeout(async () => {
      const results = await this._qrSearchPlaces(val);
      this.qrDestSuggestions.set(results);
      this.cdr.markForCheck();
    }, 350);
  }

  qrSelectDest(s: any) {
    const lat = s.lat ?? (s.center ? s.center[1] : this._currentLat);
    const lng = s.lng ?? (s.center ? s.center[0] : this._currentLng);
    this.qrDestSelected.set({ name: s.text || s.place_name, lat, lng });
    this.qrDestQuery.set('');
    this.qrDestSuggestions.set([]);
    this.cdr.markForCheck();
  }

  padTime(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  // ── Arrival timer (conductor llegó) ──────────────────────────
  private _startArrivalTimer(): void {
    this._clearArrivalTimer();
    this._arrivalTimerInterval = setInterval(() => {
      const t = this.arrivedAtPickupTimer();
      if (t === null || t <= 0) { this._clearArrivalTimer(); return; }
      this.arrivedAtPickupTimer.set(t - 1);
      this.cdr.markForCheck();
    }, 1000);
  }

  private _clearArrivalTimer(): void {
    if (this._arrivalTimerInterval) {
      clearInterval(this._arrivalTimerInterval);
      this._arrivalTimerInterval = null;
    }
  }

  private _startDriverArrivalTimer(): void {
    this._clearDriverArrivalTimer();
    this.driverArrivalTimer.set(240);
    this._driverArrivalTimerInterval = setInterval(() => {
      const t = this.driverArrivalTimer();
      if (t === null || t <= 0) { this._clearDriverArrivalTimer(); return; }
      this.driverArrivalTimer.set(t - 1);
    }, 1000);
  }

  private _clearDriverArrivalTimer(): void {
    if (this._driverArrivalTimerInterval) {
      clearInterval(this._driverArrivalTimerInterval);
      this._driverArrivalTimerInterval = null;
    }
  }

  // Aplica el estado de abordaje en el lado del pasajero (sin broadcast para evitar bucle)
  private _applyPassengerBoarding(): void {
    if (!this.tripAccepted()) return;
    this._clearArrivalTimer();
    this.arrivedAtPickupTimer.set(null);
    this.passengerSection.set(null);
    this.passengerMapFullscreen.set(true);
    this.cdr.markForCheck();
    // Pequeño delay para que Angular actualice el DOM al fullscreen antes de dibujar la ruta
    setTimeout(() => {
      this._map?.resize();
      this._drawPassengerTripRoute();
    }, 300);
  }

  async passengerConfirmBoarding(): Promise<void> {
    const tripId = this.currentTripRequestId();
    const driverId = this.tripAccepted()?.driver_id;
    if (!tripId) return;
    this._applyPassengerBoarding();
    // Notificar al conductor por los dos canales para garantizar entrega
    if (driverId) this.agService.broadcastPassengerBoarded(driverId, tripId);
    this.agService.broadcastTripBoarding(tripId);
    await this.agService.updateTripStage(tripId, 'on_route');
    this.cdr.markForCheck();
  }

  // Aplica el estado de abordaje en el lado del conductor (sin broadcast para evitar bucle)
  private _applyDriverBoarding(): void {
    const trip = this.driverArrivalTrip();
    if (!trip) return;
    this._clearDriverArrivalTimer();
    this.driverArrivalTrip.set(null);
    this.driverArrivalTimer.set(null);
    // Fullscreen + ruta de destino inmediatamente
    this.driverFullscreenTrip.set(trip);
    this.driverMapFullscreen.set(true);
    this.cdr.markForCheck();
    setTimeout(() => {
      this._map?.resize();
      this.startInAppNav(trip, false);
    }, 250);
    // Actualizar DB en segundo plano
    this.advanceStage(trip, 'on_route');
  }

  async driverPassengerBoarded(): Promise<void> {
    const trip = this.driverArrivalTrip();
    if (!trip) return;
    // Notificar al pasajero via passenger-live-${authId} — misma lógica que driver-live
    const passengerAuthId = trip.ag_trip_requests?.ag_users?.auth_user_id;
    this._applyDriverBoarding();
    if (passengerAuthId) this.agService.broadcastBoardingToPassenger(passengerAuthId);
  }

  // ── Trip receipt (recibo al finalizar) ────────────────────────
  private async _showTripReceipt(role: 'passenger' | 'driver'): Promise<void> {
    const tripId = role === 'passenger' ? this.currentTripRequestId() : null;
    let details: any = null;
    if (tripId) {
      details = await this.agService.getTripDetails(tripId).catch(() => null);
    }
    const offer = this.tripAccepted();
    const receipt = details ?? {
      final_price: offer?.offered_price ?? this.tripPrice(),
      origin_name: null,
      dest_name: this.tripDest()?.name ?? 'Destino',
      driver_net: null,
      commission_amount: null,
      commission_pct: null,
      ag_users: null,
    };
    if (offer && !receipt.ag_users) {
      receipt._driver = offer.ag_drivers?.ag_users ?? null;
    }
    this.tripReceiptData.set(receipt);
    this.tripReceiptModal.set(true);
    this.cdr.markForCheck();
  }

  closeReceiptModal(): void {
    this.tripReceiptModal.set(false);
    this.tripReceiptData.set(null);
    this._resetTrip();
  }

  closeReceiptAndRate(): void {
    this.tripReceiptModal.set(false);
    this.tripReceiptData.set(null);
    const offer = this.tripAccepted();
    if (offer) this._autoCompletePassengerTrip();
    else this._resetTrip();
  }

  async closeDriverReceiptAndRate(): Promise<void> {
    const trip = this.tripReceiptTrip();
    this.tripReceiptModal.set(false);
    this.tripReceiptData.set(null);
    this.tripReceiptTrip.set(null);
    if (trip) await this.promptRatePassenger(trip);
  }

  // ── Cancel with reason ────────────────────────────────────────
  openCancelWithReason(target: 'passenger' | 'driver'): void {
    this.cancelReasonTarget.set(target);
    this.cancelReasonSelected.set('');
    this.cancelReasonModal.set(true);
  }

  async confirmCancelWithReason(): Promise<void> {
    this.cancelReasonModal.set(false);
    await this.cancelTrip(this.cancelReasonSelected() || undefined);
  }

  // ── Counter-offer from passenger ─────────────────────────────
  openCounterOffer(offer: AgTripOffer): void {
    this.counterOfferTarget.set(offer);
    this.counterOfferValue.set(offer.offered_price);
    this.counterOfferModal.set(true);
  }

  async submitCounterOffer(): Promise<void> {
    const target = this.counterOfferTarget();
    const price  = this.counterOfferValue();
    if (!target || price < 2000) return;
    this.submittingCounter.set(true);
    try {
      // Enviar contraoferta al conductor: actualizar el precio propuesto en la solicitud
      await this.agService.updateTripOfferedPrice(target.trip_request_id, price);
      this.counterOfferModal.set(false);
      this.counterOfferTarget.set(null);
    } catch {
      // silencioso — el conductor verá el precio actualizado via realtime
    } finally {
      this.submittingCounter.set(false);
    }
  }

  async qrSubmitTrip() {
    const orig = this.qrOriginSelected();
    const dest = this.qrDestSelected();
    if (!orig || !dest) { this.qrError.set('Selecciona el punto de origen y el destino.'); return; }
    if (this.qrPrice() < 2000) { this.qrError.set('El precio mínimo es $2.000.'); return; }
    this.qrSubmitting.set(true);
    this.qrError.set('');
    this.cdr.markForCheck();

    const phone = '+57' + this.qrPhone().replace(/\D/g, '');
    const registerResult = await this.agService.registerQuickPassenger(
      this.qrName().trim() || 'Pasajero', phone, this.referredBy ?? undefined
    );

    if (!registerResult.success || !registerResult.profile) {
      this.qrSubmitting.set(false);
      this.qrError.set(registerResult.error ?? 'No se pudo crear tu perfil. Intenta de nuevo.');
      this.cdr.markForCheck();
      return;
    }

    const profile = registerResult.profile;
    this.agProfile.set(profile);

    const dist = this._distKm(orig.lat, orig.lng, dest.lat, dest.lng);
    const tripResult = await this.agService.requestTrip({
      passengerUserId: profile.id,
      passengerName: profile.full_name || undefined,
      passengerSelfieUrl: profile.selfie_url || undefined,
      originLat: orig.lat, originLng: orig.lng,
      originName: orig.name || undefined,
      destName: dest.name, destLat: dest.lat, destLng: dest.lng,
      distanceKm: dist,
      vehicleType: this.qrVehicle(),
      offeredPrice: this.qrPrice(),
      paymentMethod: this.qrPayment(),
    });

    this.qrSubmitting.set(false);

    if (!tripResult.success) {
      this.qrError.set(tripResult.error ?? 'Error al enviar la solicitud. Intenta de nuevo.');
      this.cdr.markForCheck();
      return;
    }

    // Actualizar estado de viaje y entrar a passenger-home en modo espera
    if (tripResult.tripId) {
      this.currentTripRequestId.set(tripResult.tripId);
      this.receivedOffers.set([]);
      this.tripAccepted.set(null);
      this._subscribeToOffers(tripResult.tripId);
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('movi_active_trip', JSON.stringify({ tripId: tripResult.tripId, status: 'searching', ts: Date.now(), dest, price: this.qrPrice(), vehicle: this.qrVehicle(), payment: this.qrPayment() }));
      }
      this._autoAssignNearestDrivers(tripResult.tripId, orig.lat, orig.lng, this.qrVehicle(), this.qrPrice());
    }
    this.tripDest.set(dest);
    this.tripPrice.set(this.qrPrice());
    this.tripVehicle.set(this.qrVehicle());
    this.tripPayment.set(this.qrPayment());
    this.tripSent.set(true);
    this._startWaiting();
    this.loadReferralData();
    this.screen.set('passenger-home');
    this._subscribeToDriverLocations();
    setTimeout(() => this.initGpsAndMap('ag-map-user'), 150);
    if (isPlatformBrowser(this.platformId)) {
      this.agReferralLink.set(`${window.location.origin}/anda-gana?ref=${profile.id}`);
    }
    this.cdr.markForCheck();
  }
}
