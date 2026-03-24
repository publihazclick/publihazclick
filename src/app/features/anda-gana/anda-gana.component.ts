import { Component, ChangeDetectionStrategy, signal, inject, OnInit, OnDestroy, PLATFORM_ID } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { isPlatformBrowser } from '@angular/common';
import { AndaGanaService, AgUser } from './anda-gana.service';
import { environment } from '../../../environments/environment';

type AgScreen = 'loading' | 'home' | 'passenger-form' | 'driver-form' | 'passenger-home' | 'driver-home';
type GpsStatus = 'idle' | 'requesting' | 'granted' | 'denied';

@Component({
  selector: 'app-anda-gana',
  standalone: true,
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
<div class="min-h-screen w-full flex flex-col items-center py-6 px-4">

  <!-- ═══════════ LOADING ═══════════ -->
  @if (screen() === 'loading') {
    <div class="flex-1 flex items-center justify-center">
      <span class="material-symbols-outlined text-orange-400 animate-spin" style="font-size:40px">autorenew</span>
    </div>
  }

  <!-- ═══════════ PASAJERO DASHBOARD ═══════════ -->
  @if (screen() === 'passenger-home') {
    <div class="w-full max-w-lg flex flex-col gap-3">

      <!-- Compact header -->
      <div class="flex items-center justify-between px-1 pt-2">
        <div>
          <h1 class="text-white font-black text-lg leading-tight">¡Hola, {{ firstName() }}!</h1>
          <p class="text-slate-500 text-xs">Pasajero activo</p>
        </div>
        <div class="flex items-center gap-2">
          <span class="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-bold">
            <span class="material-symbols-outlined" style="font-size:13px">check_circle</span> Activo
          </span>
          <!-- Botón hamburguesa -->
          <button (click)="agMenuOpen.set(true)"
            class="flex flex-col items-center justify-center gap-1 transition-all active:scale-90 px-2 py-1.5 rounded-xl"
            style="background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.12)">
            <div class="flex flex-col items-center gap-1">
              <span class="block rounded-full bg-white" style="width:18px;height:2px"></span>
              <span class="block rounded-full bg-white" style="width:18px;height:2px"></span>
              <span class="block rounded-full bg-white" style="width:14px;height:2px"></span>
            </div>
            <span class="text-white font-bold" style="font-size:9px;letter-spacing:0.08em">MENÚ</span>
          </button>
        </div>
      </div>

      <!-- ══ Drawer menú Anda y Gana ══ -->
      @if (agMenuOpen()) {
        <!-- Overlay oscuro -->
        <div (click)="agMenuOpen.set(false)"
          class="fixed inset-0 z-50 transition-opacity"
          style="background:rgba(0,0,0,0.55);backdrop-filter:blur(2px)"></div>

        <!-- Panel lateral derecho -->
        <div class="fixed top-0 right-0 bottom-0 z-50 flex flex-col"
          style="width:280px;background:#0f1421;border-left:1px solid rgba(255,255,255,0.08);box-shadow:-8px 0 32px rgba(0,0,0,0.6)">

          <!-- Cabecera del menú -->
          <div class="flex items-center justify-between px-5 pt-10 pb-5"
            style="border-bottom:1px solid rgba(255,255,255,0.07)">
            <div class="flex items-center gap-2.5">
              <div class="w-8 h-8 rounded-xl flex items-center justify-center"
                style="background:linear-gradient(135deg,#f97316,#fb923c)">
                <span class="material-symbols-outlined text-white" style="font-size:18px">directions_car</span>
              </div>
              <div>
                <p class="text-white font-black text-sm">Anda y Gana</p>
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
                <button (click)="agMenuOpen.set(false)"
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
            <p class="text-slate-600 text-xs text-center">Anda y Gana · v1.0</p>
          </div>
        </div>
      }

      <!-- Mapa con overlays flotantes -->
      <div class="relative rounded-2xl overflow-hidden" style="height:520px;border:1px solid rgba(255,255,255,0.08)">

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

        <!-- Barra de dirección (flotante arriba) -->
        @if (gpsStatus() !== 'requesting') {
          <div class="absolute top-3 left-3 right-3 z-20">
            @if (!addressEditMode()) {
              <button (click)="openAddressEdit()"
                class="w-full flex items-center gap-3 bg-white rounded-2xl px-4 py-2.5 shadow-xl shadow-black/40 text-left transition-all active:scale-[0.98]">
                <span class="material-symbols-outlined text-orange-500 flex-shrink-0" style="font-size:20px">location_on</span>
                <div class="flex-1 min-w-0">
                  @if (addressLoading()) {
                    <p class="text-slate-400 text-sm animate-pulse">Obteniendo dirección...</p>
                  } @else if (currentAddress()) {
                    <p class="text-slate-800 text-sm font-semibold truncate">{{ currentAddress() }}</p>
                  } @else {
                    <p class="text-slate-500 text-sm">Dirección no disponible</p>
                  }
                </div>
                <span class="material-symbols-outlined text-slate-400 flex-shrink-0" style="font-size:16px">edit</span>
              </button>
            } @else {
              <div class="flex flex-col bg-white rounded-2xl shadow-2xl shadow-black/50 overflow-hidden">
                <div class="flex items-center gap-3 px-4 py-3 border-b border-slate-200">
                  <span class="material-symbols-outlined text-orange-500" style="font-size:20px">search</span>
                  <input #addressInput
                    [value]="addressQuery()"
                    (input)="onAddressInput($any($event.target).value)"
                    (keydown.escape)="closeAddressEdit()"
                    (keydown.enter)="confirmTypedAddress()"
                    placeholder="Busca tu dirección o lugar..."
                    class="flex-1 text-slate-800 text-sm outline-none placeholder-slate-400 bg-transparent"/>
                  <button (mousedown)="$event.preventDefault(); confirmTypedAddress()" class="flex-shrink-0 w-8 h-8 rounded-lg bg-orange-500 flex items-center justify-center">
                    <span class="material-symbols-outlined text-white" style="font-size:16px">arrow_forward</span>
                  </button>
                  <button (click)="closeAddressEdit()" class="flex-shrink-0">
                    <span class="material-symbols-outlined text-slate-400" style="font-size:20px">close</span>
                  </button>
                </div>
                @if (addressSuggestions().length > 0) {
                  <div class="flex flex-col max-h-56 overflow-y-auto">
                    @for (s of addressSuggestions(); track s.id) {
                      <button (mousedown)="$event.preventDefault(); selectAddress(s)"
                        class="flex items-start gap-3 px-4 py-3 hover:bg-orange-50 active:bg-orange-100 transition-colors text-left border-b border-slate-50 last:border-0">
                        <span class="material-symbols-outlined text-orange-400 mt-0.5 flex-shrink-0" style="font-size:16px">location_on</span>
                        <div class="min-w-0">
                          <p class="text-slate-800 text-sm font-semibold truncate">{{ s.text }}</p>
                          <p class="text-slate-400 text-xs truncate">{{ s.place_name }}</p>
                        </div>
                      </button>
                    }
                  </div>
                } @else if (addressQuery().length > 1) {
                  <div class="px-4 py-4 text-slate-400 text-sm text-center">Buscando...</div>
                }
              </div>
            }

            <!-- GPS denied badge -->
            @if (gpsStatus() === 'denied') {
              <div class="mt-2 flex justify-end">
                <button (click)="retryGps('ag-map-user')"
                  class="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-black/60 backdrop-blur text-orange-400 text-xs font-bold border border-orange-500/20">
                  <span class="material-symbols-outlined" style="font-size:13px">my_location</span> Reintentar GPS
                </button>
              </div>
            }
          </div>
        }

        <!-- Panel de viaje (flotante abajo) -->
        @if (gpsStatus() !== 'requesting') {
          <div class="absolute bottom-0 left-0 right-0 z-20 rounded-t-3xl overflow-hidden"
            style="background:#f1f5f9;border-top:1px solid #cbd5e1">

            <!-- Fila de servicios -->
            <div class="flex items-center gap-1 pt-3 pb-1">
              <button (click)="scrollIcons(-120)"
                class="flex-shrink-0 w-7 h-7 rounded-full bg-slate-200 flex items-center justify-center ml-2 active:scale-90 transition-all">
                <span class="material-symbols-outlined text-slate-500" style="font-size:16px">chevron_left</span>
              </button>
            <div id="ag-icons-scroll" class="flex gap-1 flex-1 overflow-x-auto" style="scrollbar-width:none">
              <button (click)="tripService.set('viaje')"
                class="flex flex-col items-center gap-1 px-3 py-2 rounded-2xl flex-shrink-0 transition-all"
                [class]="tripService()==='viaje' ? 'bg-orange-50 border border-orange-200' : 'hover:bg-slate-200'">
                <span class="material-symbols-outlined" style="font-size:26px"
                  [style.color]="tripService()==='viaje' ? '#f97316' : '#94a3b8'">directions_car</span>
                <span class="text-[10px] font-bold" [style.color]="tripService()==='viaje' ? '#f97316' : '#94a3b8'">Viaje</span>
              </button>
              <button (click)="tripService.set('moto')"
                class="flex flex-col items-center gap-1 px-3 py-2 rounded-2xl flex-shrink-0 transition-all"
                [class]="tripService()==='moto' ? 'bg-cyan-50 border border-cyan-200' : 'hover:bg-slate-200'">
                <span class="material-symbols-outlined" style="font-size:26px"
                  [style.color]="tripService()==='moto' ? '#06b6d4' : '#94a3b8'">two_wheeler</span>
                <span class="text-[10px] font-bold" [style.color]="tripService()==='moto' ? '#06b6d4' : '#94a3b8'">Moto</span>
              </button>
              <button (click)="tripService.set('ciudad')"
                class="flex flex-col items-center gap-1 px-3 py-2 rounded-2xl flex-shrink-0 transition-all"
                [class]="tripService()==='ciudad' ? 'bg-purple-50 border border-purple-200' : 'hover:bg-slate-200'">
                <span class="material-symbols-outlined" style="font-size:26px"
                  [style.color]="tripService()==='ciudad' ? '#a855f7' : '#94a3b8'">commute</span>
                <span class="text-[10px] font-bold" [style.color]="tripService()==='ciudad' ? '#a855f7' : '#94a3b8'">Ciudad a ciudad</span>
              </button>
              <button (click)="tripService.set('domicilio')"
                class="flex flex-col items-center gap-1 px-3 py-2 rounded-2xl flex-shrink-0 transition-all"
                [class]="tripService()==='domicilio' ? 'bg-emerald-50 border border-emerald-200' : 'hover:bg-slate-200'">
                <span class="material-symbols-outlined" style="font-size:26px"
                  [style.color]="tripService()==='domicilio' ? '#10b981' : '#94a3b8'">delivery_dining</span>
                <span class="text-[10px] font-bold" [style.color]="tripService()==='domicilio' ? '#10b981' : '#94a3b8'">Domicilio</span>
              </button>
              <button (click)="tripService.set('fletes')"
                class="flex flex-col items-center gap-1 px-3 py-2 rounded-2xl flex-shrink-0 transition-all"
                [class]="tripService()==='fletes' ? 'bg-amber-50 border border-amber-200' : 'hover:bg-slate-200'">
                <span class="material-symbols-outlined" style="font-size:26px"
                  [style.color]="tripService()==='fletes' ? '#f59e0b' : '#94a3b8'">local_shipping</span>
                <span class="text-[10px] font-bold" [style.color]="tripService()==='fletes' ? '#f59e0b' : '#94a3b8'">Fletes</span>
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
                      [value]="tripQuery()"
                      (input)="onTripQueryInput($any($event.target).value)"
                      (keydown.escape)="closeTripSearch()"
                      placeholder="Busca tu destino..."
                      class="flex-1 bg-transparent text-slate-800 text-sm outline-none placeholder-slate-400"/>
                    <button (click)="closeTripSearch()">
                      <span class="material-symbols-outlined text-slate-400" style="font-size:20px">close</span>
                    </button>
                  </div>
                  @if (tripSuggestions().length > 0) {
                    <div class="flex flex-col max-h-48 overflow-y-auto">
                      @for (s of tripSuggestions(); track s.id) {
                        <button (mousedown)="$event.preventDefault(); selectTripDest(s)"
                          class="flex items-center gap-3 px-4 py-3 border-b border-slate-50 last:border-0 hover:bg-orange-50 active:bg-orange-100 text-left transition-colors">
                          <span class="material-symbols-outlined text-orange-400 flex-shrink-0" style="font-size:18px">place</span>
                          <div class="flex-1 min-w-0">
                            <p class="text-slate-800 text-sm font-semibold truncate">{{ s.text }}</p>
                            <p class="text-slate-400 text-xs truncate">{{ s.place_name }}</p>
                          </div>
                          <span class="text-orange-500 text-xs font-black flex-shrink-0">{{ s.distKm }} km</span>
                        </button>
                      }
                    </div>
                  } @else if (tripQuery().length > 1) {
                    <div class="px-4 py-4 text-slate-400 text-sm text-center flex items-center justify-center gap-2">
                      <span class="material-symbols-outlined animate-spin" style="font-size:16px">autorenew</span>
                      Buscando lugares...
                    </div>
                  }
                </div>
              }

            } @else if (!tripSent()) {
              <div class="flex items-center gap-3 px-4 py-3 border-b border-slate-200">
                <span class="material-symbols-outlined text-orange-500 flex-shrink-0" style="font-size:20px">place</span>
                <div class="flex-1 min-w-0">
                  <p class="text-slate-400 text-[10px] uppercase tracking-wider">Destino · {{ tripDistKm() }} km</p>
                  <p class="text-slate-800 text-sm font-bold truncate">{{ tripDest()!.name }}</p>
                </div>
                <button (click)="cancelTrip()">
                  <span class="material-symbols-outlined text-slate-400" style="font-size:20px">close</span>
                </button>
              </div>

              <div class="flex items-center justify-between px-4 py-2 border-b border-slate-200">
                <button (click)="adjustTripPrice(-500)"
                  class="w-11 h-11 rounded-xl bg-slate-200 border border-slate-300 text-slate-700 font-black text-2xl flex items-center justify-center active:scale-95 transition-all flex-shrink-0">−</button>
                <div class="text-center">
                  <p class="text-slate-400 text-[10px] uppercase tracking-wider">Valor sugerido</p>
                  <p class="text-slate-800 font-black text-2xl">{{ formatCOP(tripPrice()) }}</p>
                </div>
                <button (click)="adjustTripPrice(500)"
                  class="w-11 h-11 rounded-xl bg-slate-200 border border-slate-300 text-slate-700 font-black text-2xl flex items-center justify-center active:scale-95 transition-all flex-shrink-0">+</button>
              </div>

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
              <div class="px-4 py-6 flex flex-col items-center gap-3 text-center">
                <div class="w-14 h-14 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-center">
                  <span class="material-symbols-outlined text-emerald-500" style="font-size:28px">check_circle</span>
                </div>
                <p class="text-slate-800 font-black text-base">¡Solicitud enviada!</p>
                <p class="text-slate-500 text-sm">Buscando conductores disponibles…</p>
                <p class="text-slate-400 text-xs">{{ tripDest()!.name }} · {{ formatCOP(tripPrice()) }} · {{ tripDistKm() }} km</p>
                <button (click)="cancelTrip()"
                  class="mt-2 px-5 py-2 rounded-xl bg-slate-200 border border-slate-300 text-slate-500 text-xs font-bold">
                  Cancelar solicitud
                </button>
              </div>
            }

          </div>
        }

      </div><!-- /map container -->
    </div>
  }

    <!-- ═══════════ CONDUCTOR DASHBOARD ═══════════ -->
  @if (screen() === 'driver-home') {
    <div class="w-full max-w-lg flex flex-col gap-5">
      <div class="flex flex-col items-center gap-3 text-center pt-4 pb-2">
        <div class="w-16 h-16 rounded-2xl bg-cyan-500/10 border-2 border-cyan-500/20 flex items-center justify-center">
          <span class="material-symbols-outlined text-cyan-400" style="font-size:32px">directions_car</span>
        </div>
        <div>
          <h1 class="text-white font-black text-xl">¡Hola, {{ firstName() }}!</h1>
          <p class="text-slate-400 text-sm">Tu cuenta de conductor</p>
        </div>
        @if (driverStatus() === 'pending') {
          <span class="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-bold">
            <span class="material-symbols-outlined" style="font-size:14px">schedule</span> En revisión
          </span>
        } @else if (driverStatus() === 'approved') {
          <span class="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-bold">
            <span class="material-symbols-outlined" style="font-size:14px">check_circle</span> Aprobado
          </span>
        } @else if (driverStatus() === 'rejected') {
          <span class="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-bold">
            <span class="material-symbols-outlined" style="font-size:14px">cancel</span> Rechazado
          </span>
        }
      </div>

      @if (driverStatus() === 'pending') {
        <div class="bg-amber-500/5 border border-amber-500/15 rounded-2xl p-5 text-center flex flex-col items-center gap-2">
          <span class="material-symbols-outlined text-amber-400" style="font-size:36px">hourglass_top</span>
          <p class="text-white font-bold text-sm">Tu solicitud está siendo revisada</p>
          <p class="text-slate-400 text-xs leading-relaxed">Nuestro equipo verificará tus documentos en las próximas 24–48 horas. Te notificaremos por correo cuando sea aprobada.</p>
        </div>
      }
      @if (driverStatus() === 'approved') {
        <div class="bg-emerald-500/5 border border-emerald-500/15 rounded-2xl p-5 text-center flex flex-col items-center gap-2">
          <span class="material-symbols-outlined text-emerald-400" style="font-size:36px">verified</span>
          <p class="text-white font-bold text-sm">¡Estás aprobado como conductor!</p>
          <p class="text-slate-400 text-xs">Ya puedes recibir solicitudes de viaje. La app estará disponible muy pronto.</p>
        </div>
      }
      @if (driverStatus() === 'rejected') {
        <div class="bg-rose-500/5 border border-rose-500/15 rounded-2xl p-5 flex flex-col gap-2">
          <p class="text-white font-bold text-sm">Tu solicitud fue rechazada</p>
          @if (driverRejectionReason()) {
            <p class="text-slate-400 text-xs leading-relaxed"><span class="text-rose-400 font-bold">Motivo:</span> {{ driverRejectionReason() }}</p>
          }
          <p class="text-slate-500 text-xs">Puedes contactar al soporte para más información.</p>
        </div>
      }

      <!-- Info card -->
      <div class="bg-white/[0.03] border border-white/8 rounded-2xl p-5 flex flex-col gap-3">
        <h3 class="text-white font-black text-sm uppercase tracking-widest">Tu vehículo</h3>
        <div class="grid grid-cols-2 gap-3">
          <div><p class="text-slate-500 text-[10px] uppercase">Placa</p><p class="text-white text-sm font-black">{{ driverData()?.plate }}</p></div>
          <div><p class="text-slate-500 text-[10px] uppercase">Tipo</p><p class="text-white text-sm font-bold">{{ driverData()?.vehicle_type }}</p></div>
          <div><p class="text-slate-500 text-[10px] uppercase">Marca / Modelo</p><p class="text-slate-300 text-xs">{{ driverData()?.vehicle_brand }} {{ driverData()?.vehicle_model }}</p></div>
          <div><p class="text-slate-500 text-[10px] uppercase">Año</p><p class="text-slate-300 text-xs">{{ driverData()?.vehicle_year }}</p></div>
        </div>
      </div>

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
                    <p class="text-slate-400 text-xs mt-0.5">Toca para cambiar tu ubicación</p>
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
                  <input [value]="addressQuery()"
                    (input)="onAddressInput($any($event.target).value)"
                    (keydown.escape)="closeAddressEdit()"
                    (keydown.enter)="confirmTypedAddress()"
                    placeholder="Busca tu dirección o lugar..."
                    class="flex-1 text-slate-800 text-sm outline-none placeholder-slate-400 bg-transparent"/>
                  <button (mousedown)="$event.preventDefault(); confirmTypedAddress()" class="flex-shrink-0 w-8 h-8 rounded-lg bg-cyan-500 flex items-center justify-center">
                    <span class="material-symbols-outlined text-white" style="font-size:16px">arrow_forward</span>
                  </button>
                  <button (click)="closeAddressEdit()">
                    <span class="material-symbols-outlined text-slate-400" style="font-size:20px">close</span>
                  </button>
                </div>
                @if (addressSuggestions().length > 0) {
                  <div class="flex flex-col max-h-60 overflow-y-auto">
                    @for (s of addressSuggestions(); track s.id) {
                      <button (mousedown)="$event.preventDefault(); selectAddress(s)"
                        class="flex items-start gap-3 px-4 py-3 hover:bg-cyan-50 active:bg-cyan-100 transition-colors text-left border-b border-slate-50 last:border-0">
                        <span class="material-symbols-outlined text-cyan-400 mt-0.5 flex-shrink-0" style="font-size:16px">location_on</span>
                        <div class="min-w-0">
                          <p class="text-slate-800 text-sm font-semibold truncate">{{ s.text }}</p>
                          <p class="text-slate-400 text-xs truncate">{{ s.place_name }}</p>
                        </div>
                      </button>
                    }
                  </div>
                } @else if (addressQuery().length > 1) {
                  <div class="px-4 py-4 text-slate-400 text-sm text-center">Buscando...</div>
                }
              </div>
            }
          </div>
        }

        @if (gpsStatus() === 'requesting') {
          <div class="rounded-2xl bg-white/[0.03] border border-white/8 h-60 flex flex-col items-center justify-center gap-3">
            <span class="material-symbols-outlined text-cyan-400 animate-pulse" style="font-size:38px">my_location</span>
            <p class="text-slate-400 text-sm font-bold">Obteniendo tu ubicación...</p>
            <p class="text-slate-600 text-xs">Acepta el permiso en tu dispositivo</p>
          </div>
        }

        <div id="ag-map-user" style="height:300px;border-radius:16px;overflow:hidden;border:1px solid rgba(255,255,255,0.08);"
          [style.display]="gpsStatus() === 'requesting' ? 'none' : 'block'"></div>

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
    </div>
  }

  <!-- ═══════════ HOME ═══════════ -->
  @if (screen() === 'home') {
    <div class="flex flex-col items-center gap-6 text-center max-w-sm w-full pt-10">
      <div class="w-20 h-20 rounded-3xl bg-orange-500/10 border-2 border-orange-500/20 flex items-center justify-center">
        <span class="material-symbols-outlined text-orange-400" style="font-size:40px">directions_car</span>
      </div>
      <div>
        <h1 class="text-white font-black text-2xl mb-2">Anda y Gana</h1>
        <p class="text-slate-400 text-sm leading-relaxed">Selecciona cómo quieres participar</p>
      </div>
      <div class="flex flex-col gap-3 w-full mt-2">
        <button (click)="screen.set('passenger-form')"
          class="w-full py-4 rounded-2xl font-black text-base uppercase tracking-wider bg-gradient-to-r from-orange-500 to-amber-500 text-black shadow-lg shadow-orange-500/20 flex items-center justify-center gap-2">
          <span class="material-symbols-outlined" style="font-size:20px">person</span>
          Crear cuenta pasajero
        </button>
        <button (click)="screen.set('driver-form'); driverStep.set(1)"
          class="w-full py-4 rounded-2xl font-black text-base uppercase tracking-wider bg-gradient-to-r from-cyan-500 to-blue-500 text-black shadow-lg shadow-cyan-500/20 flex items-center justify-center gap-2">
          <span class="material-symbols-outlined" style="font-size:20px">directions_car</span>
          Crear cuenta conductor
        </button>
      </div>
    </div>
  }

  <!-- ═══════════ FORMULARIO PASAJERO ═══════════ -->
  @if (screen() === 'passenger-form') {
    <div class="w-full max-w-lg">
      <!-- Header -->
      <div class="flex items-center gap-3 mb-6">
        <button (click)="screen.set('home')" class="w-9 h-9 rounded-full bg-white/5 border border-white/10 flex items-center justify-center">
          <span class="material-symbols-outlined text-white" style="font-size:18px">arrow_back</span>
        </button>
        <div>
          <h2 class="text-white font-black text-xl">Registro de Pasajero</h2>
          <p class="text-slate-500 text-xs">Completa todos los campos requeridos</p>
        </div>
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
        <form (ngSubmit)="submitPassenger()" class="flex flex-col gap-5">

          <!-- Datos personales -->
          <div class="bg-white/[0.03] border border-white/8 rounded-2xl p-4 flex flex-col gap-4">
            <h3 class="text-orange-400 font-black text-xs uppercase tracking-widest flex items-center gap-2">
              <span class="material-symbols-outlined" style="font-size:14px">person</span>Datos Personales
            </h3>
            <div class="flex flex-col gap-1">
              <label class="text-slate-400 text-xs font-bold">Nombre completo *</label>
              <input [(ngModel)]="pf.fullName" name="fullName" required placeholder="Ej: Juan Carlos Pérez"
                class="bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder:text-slate-600 focus:outline-none focus:border-orange-500/50 transition-colors"/>
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div class="flex flex-col gap-1">
                <label class="text-slate-400 text-xs font-bold">Fecha de nacimiento *</label>
                <input [(ngModel)]="pf.birthDate" name="birthDate" type="date" required
                  class="bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-orange-500/50 transition-colors"/>
              </div>
              <div class="flex flex-col gap-1">
                <label class="text-slate-400 text-xs font-bold">Ciudad *</label>
                <input [(ngModel)]="pf.city" name="city" required placeholder="Tu ciudad"
                  class="bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder:text-slate-600 focus:outline-none focus:border-orange-500/50 transition-colors"/>
              </div>
            </div>
            <div class="flex flex-col gap-1">
              <label class="text-slate-400 text-xs font-bold">Número de cédula / documento *</label>
              <input [(ngModel)]="pf.idNumber" name="idNumber" required placeholder="Número de identificación"
                class="bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder:text-slate-600 focus:outline-none focus:border-orange-500/50 transition-colors"/>
            </div>
          </div>

          <!-- Contacto -->
          <div class="bg-white/[0.03] border border-white/8 rounded-2xl p-4 flex flex-col gap-4">
            <h3 class="text-orange-400 font-black text-xs uppercase tracking-widest flex items-center gap-2">
              <span class="material-symbols-outlined" style="font-size:14px">phone</span>Contacto y Acceso
            </h3>
            <div class="flex flex-col gap-1">
              <label class="text-slate-400 text-xs font-bold">Número de teléfono *</label>
              <input [(ngModel)]="pf.phone" name="phone" type="tel" required placeholder="+57 300 000 0000"
                class="bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder:text-slate-600 focus:outline-none focus:border-orange-500/50 transition-colors"/>
            </div>
            <div class="flex flex-col gap-1">
              <label class="text-slate-400 text-xs font-bold">Correo electrónico *</label>
              <input [(ngModel)]="pf.email" name="email" type="email" required placeholder="correo@ejemplo.com"
                class="bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder:text-slate-600 focus:outline-none focus:border-orange-500/50 transition-colors"/>
            </div>
            <div class="flex flex-col gap-1">
              <label class="text-slate-400 text-xs font-bold">Contraseña *</label>
              <input [(ngModel)]="pf.password" name="password" type="password" required placeholder="Mínimo 8 caracteres"
                class="bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder:text-slate-600 focus:outline-none focus:border-orange-500/50 transition-colors"/>
            </div>
          </div>

          <!-- Foto de perfil -->
          <div class="bg-white/[0.03] border border-white/8 rounded-2xl p-4 flex flex-col gap-4">
            <h3 class="text-orange-400 font-black text-xs uppercase tracking-widest flex items-center gap-2">
              <span class="material-symbols-outlined" style="font-size:14px">photo_camera</span>Foto de Perfil
            </h3>
            <div class="flex flex-col gap-1">
              <label class="text-slate-400 text-xs font-bold">Selfie / Foto de perfil *</label>
              <label class="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-white/10 rounded-xl py-6 cursor-pointer hover:border-orange-500/40 transition-colors">
                <span class="material-symbols-outlined text-slate-500" style="font-size:32px">add_a_photo</span>
                <span class="text-slate-500 text-xs">Toca para subir tu foto</span>
                <input type="file" accept="image/*" capture="user" class="hidden" (change)="onPassengerFileChange($event, 'selfie')"/>
              </label>
              @if (pf.selfie) { <p class="text-emerald-400 text-xs mt-1">✓ {{ pf.selfie }}</p> }
            </div>
          </div>

          <!-- Contacto de emergencia -->
          <div class="bg-white/[0.03] border border-white/8 rounded-2xl p-4 flex flex-col gap-4">
            <h3 class="text-orange-400 font-black text-xs uppercase tracking-widest flex items-center gap-2">
              <span class="material-symbols-outlined" style="font-size:14px">emergency</span>Contacto de Emergencia
            </h3>
            <div class="flex flex-col gap-1">
              <label class="text-slate-400 text-xs font-bold">Nombre del contacto *</label>
              <input [(ngModel)]="pf.emergencyName" name="emergencyName" required placeholder="Nombre completo"
                class="bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder:text-slate-600 focus:outline-none focus:border-orange-500/50 transition-colors"/>
            </div>
            <div class="flex flex-col gap-1">
              <label class="text-slate-400 text-xs font-bold">Teléfono del contacto *</label>
              <input [(ngModel)]="pf.emergencyPhone" name="emergencyPhone" type="tel" required placeholder="+57 300 000 0000"
                class="bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder:text-slate-600 focus:outline-none focus:border-orange-500/50 transition-colors"/>
            </div>
          </div>

          <!-- Términos -->
          <label class="flex items-start gap-3 cursor-pointer">
            <input [(ngModel)]="pf.terms" name="terms" type="checkbox" class="mt-1 accent-orange-500"/>
            <span class="text-slate-400 text-xs leading-relaxed">Acepto los <span class="text-orange-400 font-bold">Términos y Condiciones</span> y la <span class="text-orange-400 font-bold">Política de Privacidad</span> de Anda y Gana. *</span>
          </label>

          @if (passengerError()) {
            <div class="bg-rose-500/10 border border-rose-500/20 rounded-xl px-4 py-3 text-rose-300 text-xs">{{ passengerError() }}</div>
          }

          <button type="submit" [disabled]="passengerLoading()"
            class="w-full py-4 rounded-2xl font-black text-base uppercase tracking-wider bg-gradient-to-r from-orange-500 to-amber-500 text-black disabled:opacity-50 flex items-center justify-center gap-2">
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
    <div class="w-full max-w-lg">

      <!-- Header -->
      <div class="flex items-center gap-3 mb-4">
        <button (click)="driverStep() === 1 ? screen.set('home') : driverStep.set(driverStep() - 1)"
          class="w-9 h-9 rounded-full bg-white/5 border border-white/10 flex items-center justify-center">
          <span class="material-symbols-outlined text-white" style="font-size:18px">arrow_back</span>
        </button>
        <div class="flex-1">
          <h2 class="text-white font-black text-xl">Registro de Conductor</h2>
          <p class="text-slate-500 text-xs">Paso {{ driverStep() }} de 4</p>
        </div>
      </div>

      <!-- Progress bar -->
      <div class="w-full h-1.5 bg-white/5 rounded-full mb-6 overflow-hidden">
        <div class="h-full bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full transition-all duration-500"
          [style.width]="(driverStep() / 4 * 100) + '%'"></div>
      </div>

      @if (driverSuccess()) {
        <div class="flex flex-col items-center gap-4 py-16 text-center">
          <div class="w-16 h-16 rounded-2xl bg-emerald-500/10 border-2 border-emerald-500/30 flex items-center justify-center">
            <span class="material-symbols-outlined text-emerald-400" style="font-size:36px">check_circle</span>
          </div>
          <h3 class="text-white font-black text-xl">¡Solicitud enviada!</h3>
          <p class="text-slate-400 text-sm leading-relaxed">Tu solicitud como conductor está en revisión. Te notificaremos cuando sea aprobada.</p>
          <button (click)="screen.set('home'); driverSuccess.set(false)" class="mt-2 px-8 py-3 rounded-xl bg-cyan-500 text-black font-black text-sm">Volver al inicio</button>
        </div>

      } @else {

        <!-- PASO 1: Datos Personales -->
        @if (driverStep() === 1) {
          <div class="flex flex-col gap-5">
            <div class="bg-white/[0.03] border border-white/8 rounded-2xl p-4 flex flex-col gap-4">
              <h3 class="text-cyan-400 font-black text-xs uppercase tracking-widest flex items-center gap-2">
                <span class="material-symbols-outlined" style="font-size:14px">person</span>Datos Personales
              </h3>
              <div class="flex flex-col gap-1">
                <label class="text-slate-400 text-xs font-bold">Nombre completo *</label>
                <input [(ngModel)]="df.fullName" name="d_fullName" placeholder="Nombre y apellidos"
                  class="bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder:text-slate-600 focus:outline-none focus:border-cyan-500/50 transition-colors"/>
              </div>
              <div class="grid grid-cols-2 gap-3">
                <div class="flex flex-col gap-1">
                  <label class="text-slate-400 text-xs font-bold">Fecha de nacimiento *</label>
                  <input [(ngModel)]="df.birthDate" name="d_birthDate" type="date"
                    class="bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-cyan-500/50 transition-colors"/>
                </div>
                <div class="flex flex-col gap-1">
                  <label class="text-slate-400 text-xs font-bold">Ciudad *</label>
                  <input [(ngModel)]="df.city" name="d_city" placeholder="Tu ciudad"
                    class="bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder:text-slate-600 focus:outline-none focus:border-cyan-500/50 transition-colors"/>
                </div>
              </div>
              <div class="flex flex-col gap-1">
                <label class="text-slate-400 text-xs font-bold">Número de cédula *</label>
                <input [(ngModel)]="df.idNumber" name="d_idNumber" placeholder="Número de identificación"
                  class="bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder:text-slate-600 focus:outline-none focus:border-cyan-500/50 transition-colors"/>
              </div>
              <div class="flex flex-col gap-1">
                <label class="text-slate-400 text-xs font-bold">Teléfono *</label>
                <input [(ngModel)]="df.phone" name="d_phone" type="tel" placeholder="+57 300 000 0000"
                  class="bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder:text-slate-600 focus:outline-none focus:border-cyan-500/50 transition-colors"/>
              </div>
              <div class="flex flex-col gap-1">
                <label class="text-slate-400 text-xs font-bold">Correo electrónico *</label>
                <input [(ngModel)]="df.email" name="d_email" type="email" placeholder="correo@ejemplo.com"
                  class="bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder:text-slate-600 focus:outline-none focus:border-cyan-500/50 transition-colors"/>
              </div>
              <div class="flex flex-col gap-1">
                <label class="text-slate-400 text-xs font-bold">Contraseña *</label>
                <input [(ngModel)]="df.password" name="d_password" type="password" placeholder="Mínimo 8 caracteres"
                  class="bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder:text-slate-600 focus:outline-none focus:border-cyan-500/50 transition-colors"/>
              </div>
            </div>

            <div class="bg-white/[0.03] border border-white/8 rounded-2xl p-4 flex flex-col gap-4">
              <h3 class="text-cyan-400 font-black text-xs uppercase tracking-widest flex items-center gap-2">
                <span class="material-symbols-outlined" style="font-size:14px">emergency</span>Contacto de Emergencia
              </h3>
              <div class="flex flex-col gap-1">
                <label class="text-slate-400 text-xs font-bold">Nombre del contacto *</label>
                <input [(ngModel)]="df.emergencyName" name="d_emergencyName" placeholder="Nombre completo"
                  class="bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder:text-slate-600 focus:outline-none focus:border-cyan-500/50 transition-colors"/>
              </div>
              <div class="flex flex-col gap-1">
                <label class="text-slate-400 text-xs font-bold">Teléfono del contacto *</label>
                <input [(ngModel)]="df.emergencyPhone" name="d_emergencyPhone" type="tel" placeholder="+57 300 000 0000"
                  class="bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder:text-slate-600 focus:outline-none focus:border-cyan-500/50 transition-colors"/>
              </div>
            </div>

            @if (driverError()) {
              <div class="bg-rose-500/10 border border-rose-500/20 rounded-xl px-4 py-3 text-rose-300 text-xs">{{ driverError() }}</div>
            }
            <button (click)="nextDriverStep(1)"
              class="w-full py-4 rounded-2xl font-black text-base uppercase tracking-wider bg-gradient-to-r from-cyan-500 to-blue-500 text-black flex items-center justify-center gap-2">
              Continuar <span class="material-symbols-outlined" style="font-size:18px">arrow_forward</span>
            </button>
          </div>
        }

        <!-- PASO 2: Documentos de Identidad -->
        @if (driverStep() === 2) {
          <div class="flex flex-col gap-5">
            <div class="bg-white/[0.03] border border-white/8 rounded-2xl p-4 flex flex-col gap-4">
              <h3 class="text-cyan-400 font-black text-xs uppercase tracking-widest flex items-center gap-2">
                <span class="material-symbols-outlined" style="font-size:14px">badge</span>Documentos de Identidad
              </h3>
              @for (f of idPhotoFields; track f.key) {
                <div class="flex flex-col gap-1">
                  <label class="text-slate-400 text-xs font-bold">{{ f.label }} *</label>
                  <label class="flex items-center gap-3 border border-dashed border-white/10 rounded-xl px-4 py-3 cursor-pointer hover:border-cyan-500/40 transition-colors">
                    <span class="material-symbols-outlined text-slate-500" style="font-size:22px">upload</span>
                    <span class="text-slate-500 text-xs flex-1">{{ dfr[f.key] || 'Toca para subir foto' }}</span>
                    @if (dfr[f.key]) { <span class="material-symbols-outlined text-emerald-400" style="font-size:18px">check_circle</span> }
                    <input type="file" accept="image/*" class="hidden" (change)="onDriverFileChange($event, f.key)"/>
                  </label>
                </div>
              }
            </div>

            <div class="bg-white/[0.03] border border-white/8 rounded-2xl p-4 flex flex-col gap-4">
              <h3 class="text-cyan-400 font-black text-xs uppercase tracking-widest flex items-center gap-2">
                <span class="material-symbols-outlined" style="font-size:14px">policy</span>Antecedentes
              </h3>
              <div class="flex flex-col gap-1">
                <label class="text-slate-400 text-xs font-bold">Certificado de antecedentes judiciales *</label>
                <label class="flex items-center gap-3 border border-dashed border-white/10 rounded-xl px-4 py-3 cursor-pointer hover:border-cyan-500/40 transition-colors">
                  <span class="material-symbols-outlined text-slate-500" style="font-size:22px">upload</span>
                  <span class="text-slate-500 text-xs flex-1">{{ df.criminalRecord || 'Toca para subir documento' }}</span>
                  @if (df.criminalRecord) { <span class="material-symbols-outlined text-emerald-400" style="font-size:18px">check_circle</span> }
                  <input type="file" accept="image/*,application/pdf" class="hidden" (change)="onDriverFileChange($event, 'criminalRecord')"/>
                </label>
                <p class="text-slate-600 text-[10px]">Emitido en los últimos 30 días</p>
              </div>
            </div>

            @if (driverError()) {
              <div class="bg-rose-500/10 border border-rose-500/20 rounded-xl px-4 py-3 text-rose-300 text-xs">{{ driverError() }}</div>
            }
            <button (click)="nextDriverStep(2)"
              class="w-full py-4 rounded-2xl font-black text-base uppercase tracking-wider bg-gradient-to-r from-cyan-500 to-blue-500 text-black flex items-center justify-center gap-2">
              Continuar <span class="material-symbols-outlined" style="font-size:18px">arrow_forward</span>
            </button>
          </div>
        }

        <!-- PASO 3: Licencia de Conducción -->
        @if (driverStep() === 3) {
          <div class="flex flex-col gap-5">
            <div class="bg-white/[0.03] border border-white/8 rounded-2xl p-4 flex flex-col gap-4">
              <h3 class="text-cyan-400 font-black text-xs uppercase tracking-widest flex items-center gap-2">
                <span class="material-symbols-outlined" style="font-size:14px">id_card</span>Licencia de Conducción
              </h3>
              <div class="grid grid-cols-2 gap-3">
                <div class="flex flex-col gap-1">
                  <label class="text-slate-400 text-xs font-bold">Número de licencia *</label>
                  <input [(ngModel)]="df.licenseNumber" name="d_licenseNumber" placeholder="Número"
                    class="bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder:text-slate-600 focus:outline-none focus:border-cyan-500/50 transition-colors"/>
                </div>
                <div class="flex flex-col gap-1">
                  <label class="text-slate-400 text-xs font-bold">Categoría *</label>
                  <select [(ngModel)]="df.licenseCategory" name="d_licenseCategory"
                    class="bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-cyan-500/50 transition-colors">
                    <option value="" class="bg-zinc-900">Seleccionar</option>
                    <option value="B1" class="bg-zinc-900">B1 — Automóvil</option>
                    <option value="B2" class="bg-zinc-900">B2 — Camioneta</option>
                    <option value="B3" class="bg-zinc-900">B3 — Microbús</option>
                    <option value="C1" class="bg-zinc-900">C1 — Motocicleta</option>
                    <option value="C2" class="bg-zinc-900">C2 — Mototriciclo</option>
                  </select>
                </div>
              </div>
              <div class="flex flex-col gap-1">
                <label class="text-slate-400 text-xs font-bold">Fecha de vencimiento *</label>
                <input [(ngModel)]="df.licenseExpiry" name="d_licenseExpiry" type="date"
                  class="bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-cyan-500/50 transition-colors"/>
              </div>
              <div class="flex flex-col gap-1">
                <label class="text-slate-400 text-xs font-bold">Foto frontal de la licencia *</label>
                <label class="flex items-center gap-3 border border-dashed border-white/10 rounded-xl px-4 py-3 cursor-pointer hover:border-cyan-500/40 transition-colors">
                  <span class="material-symbols-outlined text-slate-500" style="font-size:22px">upload</span>
                  <span class="text-slate-500 text-xs flex-1">{{ df.licensePhoto || 'Toca para subir foto' }}</span>
                  @if (df.licensePhoto) { <span class="material-symbols-outlined text-emerald-400" style="font-size:18px">check_circle</span> }
                  <input type="file" accept="image/*" class="hidden" (change)="onDriverFileChange($event, 'licensePhoto')"/>
                </label>
              </div>
              <div class="flex flex-col gap-1">
                <label class="text-slate-400 text-xs font-bold">Foto trasera de la licencia *</label>
                <label class="flex items-center gap-3 border border-dashed border-white/10 rounded-xl px-4 py-3 cursor-pointer hover:border-cyan-500/40 transition-colors">
                  <span class="material-symbols-outlined text-slate-500" style="font-size:22px">upload</span>
                  <span class="text-slate-500 text-xs flex-1">{{ df.licenseBack || 'Toca para subir foto' }}</span>
                  @if (df.licenseBack) { <span class="material-symbols-outlined text-emerald-400" style="font-size:18px">check_circle</span> }
                  <input type="file" accept="image/*" class="hidden" (change)="onDriverFileChange($event, 'licenseBack')"/>
                </label>
              </div>
            </div>

            @if (driverError()) {
              <div class="bg-rose-500/10 border border-rose-500/20 rounded-xl px-4 py-3 text-rose-300 text-xs">{{ driverError() }}</div>
            }
            <button (click)="nextDriverStep(3)"
              class="w-full py-4 rounded-2xl font-black text-base uppercase tracking-wider bg-gradient-to-r from-cyan-500 to-blue-500 text-black flex items-center justify-center gap-2">
              Continuar <span class="material-symbols-outlined" style="font-size:18px">arrow_forward</span>
            </button>
          </div>
        }

        <!-- PASO 4: Vehículo y Documentos -->
        @if (driverStep() === 4) {
          <div class="flex flex-col gap-5">
            <div class="bg-white/[0.03] border border-white/8 rounded-2xl p-4 flex flex-col gap-4">
              <h3 class="text-cyan-400 font-black text-xs uppercase tracking-widest flex items-center gap-2">
                <span class="material-symbols-outlined" style="font-size:14px">directions_car</span>Datos del Vehículo
              </h3>
              <div class="grid grid-cols-2 gap-3">
                <div class="flex flex-col gap-1">
                  <label class="text-slate-400 text-xs font-bold">Placa *</label>
                  <input [(ngModel)]="df.plate" name="d_plate" placeholder="Ej: ABC123"
                    class="bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder:text-slate-600 focus:outline-none focus:border-cyan-500/50 transition-colors uppercase"/>
                </div>
                <div class="flex flex-col gap-1">
                  <label class="text-slate-400 text-xs font-bold">Tipo *</label>
                  <select [(ngModel)]="df.vehicleType" name="d_vehicleType"
                    class="bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-cyan-500/50 transition-colors">
                    <option value="" class="bg-zinc-900">Seleccionar</option>
                    <option value="sedan" class="bg-zinc-900">Sedán</option>
                    <option value="suv" class="bg-zinc-900">SUV / Camioneta</option>
                    <option value="hatchback" class="bg-zinc-900">Hatchback</option>
                    <option value="moto" class="bg-zinc-900">Motocicleta</option>
                    <option value="van" class="bg-zinc-900">Van / Minivan</option>
                  </select>
                </div>
              </div>
              <div class="grid grid-cols-2 gap-3">
                <div class="flex flex-col gap-1">
                  <label class="text-slate-400 text-xs font-bold">Marca *</label>
                  <input [(ngModel)]="df.vehicleBrand" name="d_vehicleBrand" placeholder="Ej: Toyota"
                    class="bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder:text-slate-600 focus:outline-none focus:border-cyan-500/50 transition-colors"/>
                </div>
                <div class="flex flex-col gap-1">
                  <label class="text-slate-400 text-xs font-bold">Modelo *</label>
                  <input [(ngModel)]="df.vehicleModel" name="d_vehicleModel" placeholder="Ej: Corolla"
                    class="bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder:text-slate-600 focus:outline-none focus:border-cyan-500/50 transition-colors"/>
                </div>
              </div>
              <div class="grid grid-cols-2 gap-3">
                <div class="flex flex-col gap-1">
                  <label class="text-slate-400 text-xs font-bold">Año *</label>
                  <input [(ngModel)]="df.vehicleYear" name="d_vehicleYear" type="number" placeholder="Ej: 2020" min="2000"
                    class="bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder:text-slate-600 focus:outline-none focus:border-cyan-500/50 transition-colors"/>
                </div>
                <div class="flex flex-col gap-1">
                  <label class="text-slate-400 text-xs font-bold">Color *</label>
                  <input [(ngModel)]="df.vehicleColor" name="d_vehicleColor" placeholder="Ej: Blanco"
                    class="bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder:text-slate-600 focus:outline-none focus:border-cyan-500/50 transition-colors"/>
                </div>
              </div>
              @for (f of vehiclePhotoFields; track f.key) {
                <div class="flex flex-col gap-1">
                  <label class="text-slate-400 text-xs font-bold">{{ f.label }} *</label>
                  <label class="flex items-center gap-3 border border-dashed border-white/10 rounded-xl px-4 py-3 cursor-pointer hover:border-cyan-500/40 transition-colors">
                    <span class="material-symbols-outlined text-slate-500" style="font-size:22px">upload</span>
                    <span class="text-slate-500 text-xs flex-1">{{ dfr[f.key] || 'Toca para subir foto' }}</span>
                    @if (dfr[f.key]) { <span class="material-symbols-outlined text-emerald-400" style="font-size:18px">check_circle</span> }
                    <input type="file" accept="image/*" class="hidden" (change)="onDriverFileChange($event, f.key)"/>
                  </label>
                </div>
              }
            </div>

            <div class="bg-white/[0.03] border border-white/8 rounded-2xl p-4 flex flex-col gap-4">
              <h3 class="text-cyan-400 font-black text-xs uppercase tracking-widest flex items-center gap-2">
                <span class="material-symbols-outlined" style="font-size:14px">description</span>Documentos del Vehículo
              </h3>
              @for (f of vehicleDocFields; track f.key) {
                <div class="flex flex-col gap-2">
                  <label class="text-slate-400 text-xs font-bold">{{ f.label }} *</label>
                  @if (f.expiry) {
                    <input [(ngModel)]="dfr[f.expiry]" [name]="'d_' + f.expiry" type="date"
                      class="bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-white text-xs focus:outline-none focus:border-cyan-500/50 transition-colors"/>
                  }
                  <label class="flex items-center gap-3 border border-dashed border-white/10 rounded-xl px-4 py-3 cursor-pointer hover:border-cyan-500/40 transition-colors">
                    <span class="material-symbols-outlined text-slate-500" style="font-size:22px">upload</span>
                    <span class="text-slate-500 text-xs flex-1">{{ dfr[f.key] || 'Subir foto / documento' }}</span>
                    @if (dfr[f.key]) { <span class="material-symbols-outlined text-emerald-400" style="font-size:18px">check_circle</span> }
                    <input type="file" accept="image/*,application/pdf" class="hidden" (change)="onDriverFileChange($event, f.key)"/>
                  </label>
                </div>
              }
            </div>

            <!-- Términos -->
            <label class="flex items-start gap-3 cursor-pointer">
              <input [(ngModel)]="df.terms" name="d_terms" type="checkbox" class="mt-1 accent-cyan-500"/>
              <span class="text-slate-400 text-xs leading-relaxed">Acepto los <span class="text-cyan-400 font-bold">Términos y Condiciones</span>, confirmo que la información es verídica y entiendo que seré verificado antes de ser aprobado. *</span>
            </label>

            @if (driverError()) {
              <div class="bg-rose-500/10 border border-rose-500/20 rounded-xl px-4 py-3 text-rose-300 text-xs">{{ driverError() }}</div>
            }

            <button (click)="submitDriver()" [disabled]="driverLoading()"
              class="w-full py-4 rounded-2xl font-black text-base uppercase tracking-wider bg-gradient-to-r from-cyan-500 to-blue-500 text-black disabled:opacity-50 flex items-center justify-center gap-2">
              @if (driverLoading()) {
                <span class="material-symbols-outlined animate-spin" style="font-size:18px">autorenew</span> Enviando solicitud...
              } @else {
                <span class="material-symbols-outlined" style="font-size:18px">send</span> Enviar solicitud de conductor
              }
            </button>
          </div>
        }
      }
    </div>
  }

</div>
  `,
})
export class AndaGanaComponent implements OnInit, OnDestroy {

  private readonly agService  = inject(AndaGanaService);
  private readonly platformId = inject(PLATFORM_ID);

  screen     = signal<AgScreen>('loading');
  driverStep = signal<number>(1);

  // Perfil actual
  agProfile             = signal<AgUser | null>(null);
  driverData            = signal<any>(null);
  driverStatus          = signal<string>('');
  driverRejectionReason = signal<string | null>(null);

  // Mapa / GPS
  gpsStatus      = signal<GpsStatus>('idle');
  currentAddress = signal('');
  addressLoading = signal(false);
  addressEditMode    = signal(false);
  addressQuery       = signal('');
  addressSuggestions = signal<any[]>([]);

  // Trip request
  tripOpen        = signal(false);
  tripQuery       = signal('');
  tripSuggestions = signal<any[]>([]);
  tripDest        = signal<{ name: string; lat: number; lng: number } | null>(null);
  tripVehicle     = signal<'carro' | 'moto'>('carro');
  tripPrice       = signal(0);
  tripDistKm      = signal(0);
  tripSending     = signal(false);
  tripSent        = signal(false);
  tripService     = signal<'viaje' | 'moto' | 'ciudad' | 'domicilio' | 'fletes'>('viaje');
  agMenuOpen      = signal(false);

  readonly agMenuItems = [
    { icon: 'location_city',    label: 'Ciudad',                  divider: false, section: '' },
    { icon: 'history',          label: 'Historial de solicitudes', divider: false, section: '' },
    { icon: 'local_shipping',   label: 'Entregas',                divider: false, section: '' },
    { icon: 'directions_bus',   label: 'Ciudad a Ciudad',         divider: false, section: '' },
    { icon: 'airport_shuttle',  label: 'Flete',                   divider: false, section: '' },
    { divider: true,  section: 'Cuenta', icon: '', label: '' },
    { icon: 'notifications',    label: 'Notificaciones',          divider: false, section: '' },
    { icon: 'shield',           label: 'Seguridad',               divider: false, section: '' },
    { icon: 'settings',         label: 'Configuración',           divider: false, section: '' },
    { icon: 'help',             label: 'Ayuda',                   divider: false, section: '' },
    { divider: true,  section: '', icon: '', label: '' },
    { icon: 'drive_eta',        label: 'Conductor',               divider: false, section: '' },
  ];

  private _map:             any    = null;
  private _userMarker:      any    = null;
  private _vehicleMarkers:  any[]  = [];
  private _vehicleStates: Array<{
    path: [number, number][]; segIdx: number; t: number;
    speed: number; forward: boolean; marker: any; heading: number;
  }> = [];
  private _animFrame: number | null = null;
  private _lastTs:    number | null = null;
  private _mapboxPromise:   Promise<void> | null = null;
  private _searchDebounce:  ReturnType<typeof setTimeout> | null = null;
  private _tripDebounce:    ReturnType<typeof setTimeout> | null = null;
  private _destMarker:      any = null;
  private _currentLat = 4.6097;
  private _currentLng = -74.0817;
  private readonly MAPBOX_TOKEN = environment.andaGana.mapboxToken;
  private readonly DEFAULT_LAT  = 4.6097;
  private readonly DEFAULT_LNG  = -74.0817;

  firstName() { return this.agProfile()?.full_name?.split(' ')[0] ?? ''; }

  // ── Lifecycle ──────────────────────────────────────────────────
  async ngOnInit() {
    const profile = await this.agService.getMyAgProfile();
    this.agProfile.set(profile);

    if (!profile) { this.screen.set('home'); return; }

    if (profile.role === 'passenger') {
      this.screen.set('passenger-home');
    } else {
      const drivers = await this.agService.getDrivers();
      const mine = drivers.find(d => d.ag_user_id === profile.id) ?? null;
      this.driverData.set(mine);
      this.driverStatus.set(mine?.status ?? 'pending');
      this.driverRejectionReason.set(mine?.rejection_reason ?? null);
      this.screen.set('driver-home');
    }

    // Iniciar mapa después de que Angular renderice el DOM
    setTimeout(() => this.initGpsAndMap('ag-map-user'), 150);
  }

  ngOnDestroy() { this._destroyMap(); }

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

  // ── GPS + mapa ─────────────────────────────────────────────────
  async initGpsAndMap(containerId: string) {
    if (!isPlatformBrowser(this.platformId)) return;

    this.gpsStatus.set('requesting');

    let lat = this.DEFAULT_LAT;
    let lng = this.DEFAULT_LNG;

    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true, timeout: 15000, maximumAge: 30000,
        })
      );
      lat = pos.coords.latitude;
      lng = pos.coords.longitude;
      this.gpsStatus.set('granted');
    } catch {
      this.gpsStatus.set('denied');
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

  // ── Dirección ──────────────────────────────────────────────────
  openAddressEdit() {
    this.addressQuery.set('');
    this.addressSuggestions.set([]);
    this.addressEditMode.set(true);
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
    if (this._searchDebounce) clearTimeout(this._searchDebounce);
  }

  onAddressInput(query: string) {
    this.addressQuery.set(query);
    if (this._searchDebounce) clearTimeout(this._searchDebounce);
    if (!query.trim() || query.length < 2) { this.addressSuggestions.set([]); return; }
    this._searchDebounce = setTimeout(() => this._searchPlaces(query), 350);
  }

  private async _searchPlaces(query: string) {
    try {
      const lat  = this._currentLat;
      const lng  = this._currentLng;
      const prox = `${lng},${lat}`;
      // Bounding box de ~25 km alrededor del usuario → solo resultados locales
      const delta = 0.22;
      const bbox  = `${lng - delta},${lat - delta},${lng + delta},${lat + delta}`;
      const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json`
        + `?access_token=${this.MAPBOX_TOKEN}&language=es`
        + `&types=address,poi,neighborhood,locality,place`
        + `&proximity=${prox}`
        + `&bbox=${bbox}`
        + `&limit=6`;
      const res  = await fetch(url);
      const data = await res.json();
      this.addressSuggestions.set(data.features ?? []);
    } catch { this.addressSuggestions.set([]); }
  }

  selectAddress(feature: any) {
    const coords: [number, number] = feature.center ?? feature.geometry?.coordinates;
    if (!coords) return;
    const [lng, lat] = coords;
    this.currentAddress.set(feature.place_name ?? feature.text ?? '');
    this._currentLat = lat;
    this._currentLng = lng;
    this.closeAddressEdit();

    if (!this._map) return;

    // Volar al lugar seleccionado
    this._map.flyTo({ center: [lng, lat], zoom: 16, speed: 1.5, essential: true });

    // Mover marcador existente o crear uno nuevo
    if (this._userMarker) {
      this._userMarker.setLngLat([lng, lat]);
    } else {
      const mapboxgl = (window as any).mapboxgl;
      if (mapboxgl) {
        const el = document.createElement('div');
        el.style.cssText = 'width:20px;height:20px;border-radius:50%;background:#FF6600;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.3);';
        this._userMarker = new mapboxgl.Marker({ element: el, anchor: 'center' })
          .setLngLat([lng, lat])
          .addTo(this._map);
      }
    }
  }

  async confirmTypedAddress() {
    const q = this.addressQuery().trim();
    if (!q) return;
    // Buscar y seleccionar el primer resultado
    if (this.addressSuggestions().length > 0) {
      this.selectAddress(this.addressSuggestions()[0]);
    } else {
      await this._searchPlaces(q);
      const first = this.addressSuggestions()[0];
      if (first) this.selectAddress(first);
    }
  }

  private async _reverseGeocode(lat: number, lng: number) {
    this.addressLoading.set(true);
    try {
      const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json`
        + `?access_token=${this.MAPBOX_TOKEN}&language=es&types=address,poi,place&limit=1`;
      const res  = await fetch(url);
      const data = await res.json();
      this.currentAddress.set(data.features?.[0]?.place_name ?? '');
    } catch { this.currentAddress.set(''); }
    this.addressLoading.set(false);
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
      style:   'mapbox://styles/mapbox/navigation-day-v1',  // estilo profesional de navegación (claro, como Uber/Lyft)
      center:  [lng, lat],
      zoom:    16,
      attributionControl: false,
      failIfMajorPerformanceCaveat: false,
    });

    this._map.addControl(new mapboxgl.AttributionControl({ compact: true }));
    this._map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'bottom-right');

    this._map.once('load', () => {
      // Cargar vehículos cuando el mapa esté completamente renderizado (tiles listos)
      this._map!.once('idle', () => this._loadVehicleMarkers(lat, lng));

      // Marcador de posición del usuario
      const el = document.createElement('div');
      el.style.cssText = `
        width:48px; height:48px; border-radius:50%;
        background: radial-gradient(circle, #FF6600 0%, rgba(255,102,0,0.3) 60%, transparent 70%);
        border: 3px solid #FF6600;
        box-shadow: 0 0 0 6px rgba(255,102,0,0.2);
        display:flex; align-items:center; justify-content:center;
        animation: pulse-ring 1.5s ease-out infinite;
      `;
      const dot = document.createElement('div');
      dot.style.cssText = 'width:14px;height:14px;border-radius:50%;background:#FF6600;border:2px solid #fff;';
      el.appendChild(dot);

      // Inyectar keyframes una sola vez
      if (!document.getElementById('ag-map-styles')) {
        const style = document.createElement('style');
        style.id = 'ag-map-styles';
        style.textContent = `
          @keyframes pulse-ring {
            0%   { box-shadow: 0 0 0 0px rgba(255,102,0,0.4); }
            100% { box-shadow: 0 0 0 20px rgba(255,102,0,0); }
          }
        `;
        document.head.appendChild(style);
      }

      this._userMarker = new mapboxgl.Marker({ element: el, anchor: 'center' })
        .setLngLat([lng, lat])
        .addTo(this._map);

      this._map.resize();
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

    // ── Demo animado ──────────────────────────────────────────────
    // 1. Directions API primero — garantiza rutas sobre calles reales
    let paths = await this._fetchRoadPathsViaDirections(lat, lng);

    // 2. Fallback: calles del mapa ya renderizado
    if (paths.length < 2) {
      paths = this._extractRoadPaths(lat, lng);
    }

    // 3. Sin calles → no mostrar vehículos demo
    if (paths.length < 2) return;

    const configs = [
      // Carros — colores contrastantes sobre fondo claro
      { isMoto: false, color: '#1D4ED8' },  // azul rey
      { isMoto: false, color: '#DC2626' },  // rojo
      { isMoto: false, color: '#D97706' },  // ámbar oscuro
      { isMoto: false, color: '#15803D' },  // verde oscuro
      { isMoto: false, color: '#1e293b' },  // grafito
      { isMoto: false, color: '#7C3AED' },  // violeta
      { isMoto: false, color: '#0F766E' },  // teal
      // Motos — colores vivos
      { isMoto: true,  color: '#EA580C' },  // naranja
      { isMoto: true,  color: '#0891B2' },  // cyan oscuro
      { isMoto: true,  color: '#16A34A' },  // verde
      { isMoto: true,  color: '#9333EA' },  // púrpura
      { isMoto: true,  color: '#BE185D' },  // rosa oscuro
    ];

    for (let i = 0; i < configs.length; i++) {
      const { isMoto, color } = configs[i];
      const path = paths[i % paths.length];
      if (!path || path.length < 2) continue;

      // Distribuir puntos de inicio a lo largo de los caminos
      let segIdx = Math.min(Math.floor(((i * 0.11) % 1) * (path.length - 1)), path.length - 2);
      for (let s = 0; s < path.length - 1; s++) {
        const [cx, cy] = path[segIdx];
        if (Math.abs(cx - lng) > 0.0014 || Math.abs(cy - lat) > 0.0014) break;
        segIdx = (segIdx + 1) % (path.length - 1);
      }
      const [lng0, lat0] = path[segIdx];
      const h0 = this._segHeading(path, segIdx);

      const el = isMoto ? this._motoElement(h0, color) : this._carElement(h0, color);
      const marker = new mapboxgl.Marker({ element: el, anchor: 'center' })
        .setLngLat([lng0, lat0]).addTo(this._map);

      this._vehicleMarkers.push(marker);
      this._vehicleStates.push({
        path,
        segIdx,
        t:       0,
        speed:   isMoto ? 0.0000022 : 0.0000015,
        forward: i % 3 !== 0,
        marker,
        heading: h0,
      });
    }

    this._startAnimation();
  }

  /** Extrae LineStrings de cualquier capa renderizada como rutas de animación */
  private _extractRoadPaths(lat: number, lng: number): [number, number][][] {
    // Sin filtro de capas → funciona con cualquier estilo de Mapbox
    const features = (this._map as any)?.queryRenderedFeatures(undefined) ?? [];
    const paths:  [number, number][][] = [];
    const seen = new Set<string>();

    for (const f of features) {
      if (paths.length >= 12) break;
      if (f?.geometry?.type !== 'LineString') continue;
      const coords = f.geometry.coordinates as [number, number][];
      if (coords.length < 3) continue;
      const mid = coords[Math.floor(coords.length / 2)];
      if (Math.abs(mid[0] - lng) > 0.006 || Math.abs(mid[1] - lat) > 0.006) continue;
      const key = `${coords[0][0].toFixed(5)},${coords[0][1].toFixed(5)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      paths.push(coords);
    }

    return paths;
  }

  /** Obtiene rutas reales sobre calles vía Mapbox Directions API */
  private async _fetchRoadPathsViaDirections(lat: number, lng: number): Promise<[number, number][][]> {
    // Genera 12 destinos radiales alrededor del punto actual (~300m–500m)
    // Ángulos distribuidos uniformemente para máxima cobertura de calles
    const R1 = 0.003;   // ~330m
    const R2 = 0.005;   // ~550m
    const offsets: [number, number][] = [
      [lng + R1,        lat],
      [lng - R1,        lat],
      [lng,             lat + R1],
      [lng,             lat - R1],
      [lng + R1,        lat + R1],
      [lng - R1,        lat + R1],
      [lng + R1,        lat - R1],
      [lng - R1,        lat - R1],
      [lng + R2,        lat + R1 * 0.5],
      [lng - R2,        lat - R1 * 0.5],
      [lng + R1 * 0.5,  lat + R2],
      [lng - R1 * 0.5,  lat - R2],
    ];

    const paths: [number, number][][] = [];
    const token = this.MAPBOX_TOKEN;

    await Promise.all(offsets.map(async ([dLng, dLat]) => {
      try {
        const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${lng},${lat};${dLng},${dLat}`
          + `?geometries=geojson&overview=full&access_token=${token}`;
        const res = await fetch(url);
        if (!res.ok) return;
        const json = await res.json();
        const coords = json?.routes?.[0]?.geometry?.coordinates as [number, number][] | undefined;
        if (coords && coords.length >= 3) paths.push(coords);
      } catch { /* ignorar errores de red */ }
    }));

    return paths;
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

        vs.t += (vs.speed * dt) / segLen * (vs.forward ? 1 : -1);

        // Avanzar o retroceder segmentos (ping-pong al llegar a extremos)
        while (vs.t >= 1 && vs.forward) {
          vs.t -= 1;
          vs.segIdx = Math.min(vs.segIdx + 1, vs.path.length - 2);
          if (vs.segIdx >= vs.path.length - 2 && vs.t > 0) { vs.forward = false; break; }
        }
        while (vs.t < 0 && !vs.forward) {
          vs.t += 1;
          vs.segIdx = Math.max(vs.segIdx - 1, 0);
          if (vs.segIdx <= 0 && vs.t < 1) { vs.forward = true; break; }
        }
        vs.t = Math.max(0, Math.min(1, vs.t));

        // Posición interpolada
        const [cx0, cy0] = vs.path[vs.segIdx];
        const ni = Math.min(vs.segIdx + 1, vs.path.length - 1);
        const [cx1, cy1] = vs.path[ni];
        const curLng = cx0 + vs.t * (cx1 - cx0);
        const curLat = cy0 + vs.t * (cy1 - cy0);

        // Heading objetivo del segmento actual
        const rawH = Math.atan2(cx1 - cx0, cy1 - cy0) * 180 / Math.PI;
        const targetH = vs.forward ? rawH : rawH + 180;

        // Interpolación suave del ángulo (maneja cruce por ±180°)
        let dH = targetH - vs.heading;
        if (dH > 180)  dH -= 360;
        if (dH < -180) dH += 360;
        // Interpolación de giro suave: los carros giran más despacio que las motos
        vs.heading += dH * Math.min(1, dt * 0.018);

        // No colocar vehículo encima del marcador del usuario
        const uLng = this._currentLng, uLat = this._currentLat;
        if (Math.abs(curLng - uLng) > 0.0006 || Math.abs(curLat - uLat) > 0.0006) {
          vs.marker.setLngLat([curLng, curLat]);
        }
        (vs.marker.getElement() as HTMLElement).style.transform = `rotate(${vs.heading}deg)`;
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

  private _carElement(heading: number, color: string): HTMLElement {
    const wrap = document.createElement('div');
    // Tamaño mayor para visibilidad clara en el mapa
    wrap.style.cssText = `width:28px;height:46px;transform:rotate(${heading}deg);filter:drop-shadow(0 3px 12px rgba(0,0,0,0.50)) drop-shadow(0 1px 4px rgba(0,0,0,0.35));will-change:transform;`;
    wrap.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 46" width="28" height="46">
      <!-- Sombra exterior -->
      <ellipse cx="14" cy="44.5" rx="10" ry="2" fill="rgba(0,0,0,0.22)"/>
      <!-- Borde blanco (contraste sobre mapa claro) -->
      <path d="M5,9 C5,4 8,2 14,2 C20,2 23,4 23,9 L23,37 C23,42 20,44 14,44 C8,44 5,42 5,37 Z"
            fill="white" stroke="white" stroke-width="1"/>
      <!-- Carrocería principal -->
      <path d="M6,10 C6,5 9,3 14,3 C19,3 22,5 22,10 L22,36 C22,41 19,43 14,43 C9,43 6,41 6,36 Z"
            fill="${color}"/>
      <!-- Techo (panel central más claro) -->
      <path d="M9,18 C9,16 11,15 14,15 C17,15 19,16 19,18 L19,31 C19,33 17,34 14,34 C11,34 9,33 9,31 Z"
            fill="rgba(255,255,255,0.18)"/>
      <!-- Parabrisas delantero -->
      <path d="M8,10 C8,7 10,6 14,6 C18,6 20,7 20,10 L19,16 C17,18 11,18 9,16 Z"
            fill="rgba(196,232,252,0.88)"/>
      <!-- Reflejo parabrisas -->
      <path d="M9,10 C10,8 11,7 14,7 L13.5,14 C12,13.5 10.5,12.5 9,11 Z"
            fill="rgba(255,255,255,0.35)"/>
      <!-- Luneta trasera -->
      <path d="M9,32 C11,34 17,34 19,32 L19,37 C17,39 11,39 9,37 Z"
            fill="rgba(185,220,245,0.70)"/>
      <!-- Espejos retrovisores -->
      <rect x="2.5" y="20" width="3.5" height="5.5" rx="1.8" fill="${color}" stroke="rgba(255,255,255,0.75)" stroke-width="0.9"/>
      <rect x="22" y="20" width="3.5" height="5.5" rx="1.8" fill="${color}" stroke="rgba(255,255,255,0.75)" stroke-width="0.9"/>
      <!-- Faros delanteros (amarillo-blanco) -->
      <path d="M6.5,7 L9,6 L9,11 L7,10 Z" fill="#FFFDE7"/>
      <path d="M21.5,7 L19,6 L19,11 L21,10 Z" fill="#FFFDE7"/>
      <ellipse cx="7.5" cy="8.5" rx="1.5" ry="1.2" fill="#FDD835"/>
      <ellipse cx="20.5" cy="8.5" rx="1.5" ry="1.2" fill="#FDD835"/>
      <!-- Luces traseras (rojo) -->
      <path d="M6.5,40 L9,41 L9,36 L7,37 Z" fill="#E53935"/>
      <path d="M21.5,40 L19,41 L19,36 L21,37 Z" fill="#E53935"/>
      <ellipse cx="7.5" cy="39" rx="1.5" ry="1.1" fill="#FF5252"/>
      <ellipse cx="20.5" cy="39" rx="1.5" ry="1.1" fill="#FF5252"/>
      <!-- Flecha de dirección (frente del vehículo) -->
      <path d="M14,1 L11,4.5 L14,3.5 L17,4.5 Z" fill="rgba(255,255,255,0.95)"/>
    </svg>`;
    return wrap;
  }

  private _motoElement(heading: number, color: string): HTMLElement {
    const wrap = document.createElement('div');
    // Más estrecha y alargada que el carro — claramente diferenciable
    wrap.style.cssText = `width:14px;height:36px;transform:rotate(${heading}deg);filter:drop-shadow(0 3px 10px rgba(0,0,0,0.50)) drop-shadow(0 1px 3px rgba(0,0,0,0.35));will-change:transform;`;
    wrap.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 14 36" width="14" height="36">
      <!-- Sombra exterior -->
      <ellipse cx="7" cy="35" rx="5" ry="1.5" fill="rgba(0,0,0,0.22)"/>
      <!-- Rueda trasera (oscura, pequeña) -->
      <ellipse cx="7" cy="30.5" rx="3.5" ry="3.5" fill="#1e293b"/>
      <ellipse cx="7" cy="30.5" rx="2" ry="2" fill="#334155"/>
      <ellipse cx="7" cy="30.5" rx="0.8" ry="0.8" fill="#64748b"/>
      <!-- Borde blanco carrocería -->
      <path d="M4,8 C4,5 5,3.5 7,3.5 C9,3.5 10,5 10,8 L10,26 C10,28.5 9,30 7,30 C5,30 4,28.5 4,26 Z"
            fill="white"/>
      <!-- Carrocería principal -->
      <path d="M5,9 C5,6 6,4.5 7,4.5 C8,4.5 9,6 9,9 L9,25 C9,27.5 8,29 7,29 C6,29 5,27.5 5,25 Z"
            fill="${color}"/>
      <!-- Piloto (vista desde arriba — casco ovalado) -->
      <ellipse cx="7" cy="18" rx="2.2" ry="2.8" fill="rgba(15,23,42,0.80)"/>
      <ellipse cx="7" cy="17.2" rx="1.2" ry="0.9" fill="rgba(255,255,255,0.22)"/>
      <!-- Manillar -->
      <rect x="1.5" y="11.5" width="11" height="1.8" rx="0.9" fill="#94a3b8"/>
      <rect x="1.5" y="11.5" width="2.5" height="1.8" rx="0.9" fill="#64748b"/>
      <rect x="10" y="11.5" width="2.5" height="1.8" rx="0.9" fill="#64748b"/>
      <!-- Rueda delantera (oscura) -->
      <ellipse cx="7" cy="5.5" rx="3.5" ry="3.5" fill="#1e293b"/>
      <ellipse cx="7" cy="5.5" rx="2" ry="2" fill="#334155"/>
      <ellipse cx="7" cy="5.5" rx="0.8" ry="0.8" fill="#64748b"/>
      <!-- Faro delantero -->
      <ellipse cx="7" cy="2.8" rx="2" ry="1.3" fill="#FFFDE7"/>
      <ellipse cx="7" cy="2.8" rx="1.1" ry="0.7" fill="#FDD835"/>
      <!-- Flecha de dirección -->
      <path d="M7,1 L5.2,3.5 L7,2.8 L8.8,3.5 Z" fill="rgba(255,255,255,0.95)"/>
      <!-- Luz trasera -->
      <ellipse cx="7" cy="33" rx="1.8" ry="1.3" fill="#E53935"/>
      <ellipse cx="7" cy="33" rx="1" ry="0.7" fill="#FF5252"/>
    </svg>`;
    return wrap;
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
    return '$\u00a0' + n.toLocaleString('es-CO');
  }

  scrollIcons(px: number) {
    document.getElementById('ag-icons-scroll')?.scrollBy({ left: px, behavior: 'smooth' });
  }

  openTripSearch() { this.tripOpen.set(true); }
  closeTripSearch() { this.tripOpen.set(false); this.tripQuery.set(''); this.tripSuggestions.set([]); }

  onTripQueryInput(val: string) {
    this.tripQuery.set(val);
    if (this._tripDebounce) clearTimeout(this._tripDebounce);
    if (!val.trim()) { this.tripSuggestions.set([]); return; }
    this._tripDebounce = setTimeout(() => this._searchTripPlaces(val), 120);
  }

  private _tripAbort: AbortController | null = null;

  private async _searchTripPlaces(query: string) {
    if (this._tripAbort) this._tripAbort.abort();
    this._tripAbort = new AbortController();
    const sig = this._tripAbort.signal;

    const lat = this._currentLat, lng = this._currentLng;
    const d = 0.8; // ~88 km — cubre toda el área metropolitana

    // ── Nominatim (OpenStreetMap) — mejor cobertura de POIs, barrios y conjuntos
    // viewbox sin bounded=1 para que busque en toda Colombia pero priorice la zona
    const viewbox = `${lng - d},${lat + d},${lng + d},${lat - d}`;
    const nomUrl  = `https://nominatim.openstreetmap.org/search`
      + `?q=${encodeURIComponent(query)}&format=jsonv2&limit=10`
      + `&countrycodes=co&viewbox=${viewbox}&addressdetails=1`;

    // ── Mapbox — complementa con direcciones y lugares adicionales
    const bbox   = `${lng - d},${lat - d},${lng + d},${lat + d}`;
    const mbxUrl = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json`
      + `?access_token=${this.MAPBOX_TOKEN}&autocomplete=true&language=es`
      + `&country=co&limit=6&types=poi,place,address,neighborhood,locality,district`
      + `&proximity=${lng},${lat}&bbox=${bbox}`;

    try {
      const [nomRes, mbxRes] = await Promise.all([
        fetch(nomUrl, { signal: sig, headers: { 'Accept-Language': 'es' } }),
        fetch(mbxUrl, { signal: sig }),
      ]);

      const nomJson = await nomRes.json() as any[];
      const mbxJson = await mbxRes.json();

      // Convertir Nominatim al formato interno
      const nomFeatures = nomJson.map((f: any) => {
        const fLat = parseFloat(f.lat), fLng = parseFloat(f.lon);
        const name = f.name || f.display_name.split(',')[0];
        const addr = f.display_name;
        return { id: `nom-${f.place_id}`, text: name, place_name: addr,
                 center: [fLng, fLat] as [number, number],
                 distKm: this._distKm(lat, lng, fLat, fLng) };
      });

      // Convertir Mapbox al formato interno
      const mbxFeatures = (mbxJson.features ?? []).map((f: any) => {
        const [fLng, fLat] = f.center ?? [lng, lat];
        return { ...f, id: `mbx-${f.id}`, distKm: this._distKm(lat, lng, fLat, fLng) };
      });

      // Unir: Nominatim primero (mejores POIs), luego Mapbox sin duplicados
      const seen  = new Set<string>();
      const merged: any[] = [];
      for (const f of [...nomFeatures, ...mbxFeatures]) {
        const key = `${(+f.center[0]).toFixed(3)},${(+f.center[1]).toFixed(3)}`;
        if (!seen.has(key)) { seen.add(key); merged.push(f); }
      }

      this.tripSuggestions.set(merged.slice(0, 8));
    } catch { /* abortado o sin red */ }
  }

  selectTripDest(s: any) {
    const [dLng, dLat] = s.center ?? s.geometry?.coordinates ?? [this._currentLng, this._currentLat];
    const name = s.text ?? s.place_name ?? 'Destino';
    this.tripDest.set({ name, lat: dLat, lng: dLng });
    this.tripOpen.set(false);
    this.tripQuery.set('');
    this.tripSuggestions.set([]);
    this._drawRoute(dLng, dLat);
  }

  setTripVehicle(type: 'carro' | 'moto') {
    this.tripVehicle.set(type);
    this.tripPrice.set(this._calcPrice(this.tripDistKm(), type));
  }

  adjustTripPrice(delta: number) {
    this.tripPrice.set(Math.max(2000, this.tripPrice() + delta));
  }

  async findOffers() {
    const dest = this.tripDest();
    if (!dest) return;
    this.tripSending.set(true);
    const profile = this.agProfile();
    if (profile) {
      await this.agService.requestTrip({
        passengerUserId: profile.id,
        originLat: this._currentLat, originLng: this._currentLng,
        destName: dest.name, destLat: dest.lat, destLng: dest.lng,
        distanceKm: this.tripDistKm(),
        vehicleType: this.tripVehicle(),
        offeredPrice: this.tripPrice(),
      });
    }
    this.tripSending.set(false);
    this.tripSent.set(true);
  }

  cancelTrip() {
    this.tripDest.set(null);
    this.tripSent.set(false);
    this.tripOpen.set(false);
    this.tripQuery.set('');
    this.tripSuggestions.set([]);
    this.tripDistKm.set(0);
    this.tripPrice.set(0);
    this._clearRoute();
  }

  private _calcPrice(km: number, vehicle: 'carro' | 'moto'): number {
    const raw = vehicle === 'carro'
      ? Math.max(8000, 8000 + km * 2000)
      : Math.max(5000, 5000 + km * 1300);
    return Math.round(raw / 500) * 500;
  }

  private _distKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371, dLat = (lat2 - lat1) * Math.PI / 180, dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
    return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 10) / 10;
  }

  private async _drawRoute(destLng: number, destLat: number) {
    if (!this._map) return;
    const mapboxgl = (window as any).mapboxgl;
    if (!mapboxgl) return;
    this._clearRoute();
    try {
      const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${this._currentLng},${this._currentLat};${destLng},${destLat}?geometries=geojson&overview=full&access_token=${this.MAPBOX_TOKEN}`;
      const json = await (await fetch(url)).json();
      const route = json.routes?.[0];
      if (!route) return;

      const km = Math.round(route.distance / 100) / 10;
      this.tripDistKm.set(km);
      this.tripSuggestions.set([]);
      this.tripPrice.set(this._calcPrice(km, this.tripVehicle()));

      this._map.addSource('trip-route', { type: 'geojson', data: { type: 'Feature', properties: {}, geometry: route.geometry } });
      this._map.addLayer({ id: 'trip-route-bg',   type: 'line', source: 'trip-route', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#000',    'line-width': 9,  'line-opacity': 0.18 } });
      this._map.addLayer({ id: 'trip-route-line', type: 'line', source: 'trip-route', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#FF6600', 'line-width': 5,  'line-opacity': 0.92 } });
      this._map.addLayer({ id: 'trip-route-dash', type: 'line', source: 'trip-route', layout: { 'line-cap': 'round' },                       paint: { 'line-color': '#fff',    'line-width': 1.5,'line-opacity': 0.5, 'line-dasharray': [0, 4] } });

      // Marcador de destino
      const pin = document.createElement('div');
      pin.innerHTML = `<div style="position:relative;width:32px;height:44px"><div style="position:absolute;bottom:0;left:50%;transform:translateX(-50%);width:32px;height:40px;background:#FF6600;border-radius:50% 50% 50% 50% / 60% 60% 40% 40%;border:3px solid #fff;box-shadow:0 4px 14px rgba(0,0,0,0.45);display:flex;align-items:center;justify-content:center"><span class='material-symbols-outlined' style='color:#fff;font-size:16px'>place</span></div><div style="position:absolute;bottom:0;left:50%;transform:translateX(-50%);width:6px;height:6px;background:#FF6600;border-radius:50%;margin-bottom:-3px"></div></div>`;
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

  // ── Passenger form state ──
  passengerLoading = signal(false);
  passengerSuccess = signal(false);
  passengerError   = signal('');

  pf = {
    fullName: '', birthDate: '', city: '', idNumber: '',
    phone: '', email: '', password: '', selfie: '',
    emergencyName: '', emergencyPhone: '', terms: false,
  };
  private _pfFiles: Record<string, File> = {};

  // ── Driver form state ──
  driverLoading = signal(false);
  driverSuccess = signal(false);
  driverError   = signal('');

  df = {
    fullName: '', birthDate: '', city: '', idNumber: '',
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
      if (!this.df.fullName || !this.df.birthDate || !this.df.city || !this.df.idNumber ||
          !this.df.phone || !this.df.email || !this.df.password || !this.df.emergencyName || !this.df.emergencyPhone) {
        this.driverError.set('Por favor completa todos los campos obligatorios antes de continuar.');
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

  async submitPassenger() {
    this.passengerError.set('');
    const p = this.pf;
    if (!p.fullName || !p.birthDate || !p.city || !p.idNumber ||
        !p.phone || !p.email || !p.password || !p.emergencyName || !p.emergencyPhone) {
      this.passengerError.set('Por favor completa todos los campos obligatorios.');
      return;
    }
    if (!p.terms) {
      this.passengerError.set('Debes aceptar los términos y condiciones.');
      return;
    }
    this.passengerLoading.set(true);
    const result = await this.agService.registerPassenger({
      fullName: p.fullName,
      birthDate: p.birthDate,
      city: p.city,
      idNumber: p.idNumber,
      phone: p.phone,
      email: p.email,
      password: p.password,
      emergencyName: p.emergencyName,
      emergencyPhone: p.emergencyPhone,
      selfieFile: this._pfFiles['selfie'],
    });
    this.passengerLoading.set(false);
    if (result.success) {
      this.passengerSuccess.set(true);
      setTimeout(async () => {
        await this.ngOnInit();
      }, 2000);
    } else {
      this.passengerError.set(result.error ?? 'Error al registrarse.');
    }
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
    this.driverLoading.set(true);
    const result = await this.agService.registerDriver({
      fullName: this.df.fullName,
      birthDate: this.df.birthDate,
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
    });
    this.driverLoading.set(false);
    if (result.success) {
      this.driverSuccess.set(true);
      setTimeout(async () => {
        await this.ngOnInit();
      }, 2000);
    } else {
      this.driverError.set(result.error ?? 'Error al registrarse.');
    }
  }
}
