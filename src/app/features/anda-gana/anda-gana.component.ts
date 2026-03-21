import { Component, ChangeDetectionStrategy, signal, inject, OnInit, OnDestroy, PLATFORM_ID } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SlicePipe, isPlatformBrowser } from '@angular/common';
import { AndaGanaService, AgUser } from './anda-gana.service';
import { environment } from '../../../environments/environment';

type AgScreen = 'loading' | 'home' | 'passenger-form' | 'driver-form' | 'passenger-home' | 'driver-home';
type GpsStatus = 'idle' | 'requesting' | 'granted' | 'denied';

@Component({
  selector: 'app-anda-gana',
  standalone: true,
  imports: [FormsModule, SlicePipe],
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
    <div class="w-full max-w-lg flex flex-col gap-5">
      <div class="flex flex-col items-center gap-3 text-center pt-4 pb-2">
        <div class="w-16 h-16 rounded-2xl bg-orange-500/10 border-2 border-orange-500/20 flex items-center justify-center">
          <span class="material-symbols-outlined text-orange-400" style="font-size:32px">person</span>
        </div>
        <div>
          <h1 class="text-white font-black text-xl">¡Hola, {{ firstName() }}!</h1>
          <p class="text-slate-400 text-sm">Tu cuenta de pasajero está activa</p>
        </div>
        <span class="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-bold">
          <span class="material-symbols-outlined" style="font-size:14px">check_circle</span> Activo
        </span>
      </div>

      <!-- Info card -->
      <div class="bg-white/[0.03] border border-white/8 rounded-2xl p-5 flex flex-col gap-3">
        <h3 class="text-white font-black text-sm uppercase tracking-widest">Tu perfil</h3>
        <div class="grid grid-cols-2 gap-3">
          <div><p class="text-slate-500 text-[10px] uppercase">Ciudad</p><p class="text-white text-sm font-bold">{{ agProfile()?.city }}</p></div>
          <div><p class="text-slate-500 text-[10px] uppercase">Teléfono</p><p class="text-white text-sm font-bold">{{ agProfile()?.phone }}</p></div>
          <div><p class="text-slate-500 text-[10px] uppercase">Correo</p><p class="text-slate-300 text-xs">{{ agProfile()?.email }}</p></div>
          <div><p class="text-slate-500 text-[10px] uppercase">Miembro desde</p><p class="text-slate-300 text-xs">{{ agProfile()?.created_at | slice:0:10 }}</p></div>
        </div>
      </div>

      <!-- Mapa + dirección -->
      <div class="flex flex-col gap-2">

        <!-- Barra de dirección -->
        @if (gpsStatus() !== 'requesting') {
          <div class="relative">
            @if (!addressEditMode()) {
              <!-- Pill clickeable -->
              <button (click)="openAddressEdit()"
                class="w-full flex items-center gap-3 bg-white rounded-2xl px-4 py-3 shadow-lg shadow-black/20 text-left transition-all hover:shadow-xl active:scale-[0.98]">
                <span class="material-symbols-outlined text-orange-500 flex-shrink-0" style="font-size:22px">location_on</span>
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
              <!-- Input de búsqueda -->
              <div class="flex flex-col bg-white rounded-2xl shadow-xl shadow-black/20 overflow-hidden">
                <div class="flex items-center gap-3 px-4 py-3 border-b border-slate-100">
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
                <!-- Sugerencias -->
                @if (addressSuggestions().length > 0) {
                  <div class="flex flex-col max-h-60 overflow-y-auto">
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
          </div>
        }

        <!-- Estado GPS -->
        @if (gpsStatus() === 'requesting') {
          <div class="rounded-2xl bg-white/[0.03] border border-white/8 h-60 flex flex-col items-center justify-center gap-3">
            <span class="material-symbols-outlined text-orange-400 animate-pulse" style="font-size:38px">my_location</span>
            <p class="text-slate-400 text-sm font-bold">Obteniendo tu ubicación...</p>
            <p class="text-slate-600 text-xs">Acepta el permiso en tu dispositivo</p>
          </div>
        }

        <!-- Contenedor del mapa -->
        <div id="ag-map-user" style="height:300px;border-radius:16px;overflow:hidden;border:1px solid rgba(255,255,255,0.08);"
          [style.display]="gpsStatus() === 'requesting' ? 'none' : 'block'"></div>

        @if (gpsStatus() === 'denied') {
          <div class="flex items-center justify-between">
            <p class="text-slate-600 text-xs">Sin ubicación exacta</p>
            <button (click)="retryGps('ag-map-user')"
              class="text-xs text-orange-400 font-bold flex items-center gap-1">
              <span class="material-symbols-outlined" style="font-size:13px">my_location</span> Reintentar
            </button>
          </div>
        }
      </div>

      <!-- ══════════ PANEL DE VIAJE ══════════ -->
      @if (gpsStatus() !== 'requesting') {
        <div class="rounded-2xl overflow-hidden border border-white/8 shadow-xl shadow-black/30" style="background:#0d1117">

          @if (!tripDest()) {
            <!-- Estado: sin destino seleccionado -->
            @if (!tripOpen()) {
              <!-- Barra colapsada -->
              <button (click)="openTripSearch()"
                class="w-full flex items-center gap-3 px-4 py-4 hover:bg-white/[0.03] transition-colors text-left">
                <div class="w-10 h-10 rounded-xl bg-orange-500/15 border border-orange-500/25 flex items-center justify-center flex-shrink-0">
                  <span class="material-symbols-outlined text-orange-400" style="font-size:22px">search</span>
                </div>
                <div class="flex-1">
                  <p class="text-white font-black text-sm">¿A dónde vas y por cuánto?</p>
                  <p class="text-slate-500 text-xs mt-0.5">Toca para buscar tu destino</p>
                </div>
                <span class="material-symbols-outlined text-slate-600" style="font-size:20px">chevron_right</span>
              </button>
            } @else {
              <!-- Búsqueda expandida -->
              <div class="flex flex-col">
                <div class="flex items-center gap-3 px-4 py-3 border-b border-white/6">
                  <span class="material-symbols-outlined text-orange-400 flex-shrink-0" style="font-size:20px">search</span>
                  <input #tripInput
                    [value]="tripQuery()"
                    (input)="onTripQueryInput($any($event.target).value)"
                    (keydown.escape)="closeTripSearch()"
                    placeholder="Busca tu destino..."
                    class="flex-1 bg-transparent text-white text-sm outline-none placeholder-slate-500"/>
                  <button (click)="closeTripSearch()">
                    <span class="material-symbols-outlined text-slate-500" style="font-size:20px">close</span>
                  </button>
                </div>
                <!-- Resultados -->
                @if (tripSuggestions().length > 0) {
                  <div class="flex flex-col max-h-56 overflow-y-auto">
                    @for (s of tripSuggestions(); track s.id) {
                      <button (mousedown)="$event.preventDefault(); selectTripDest(s)"
                        class="flex items-center gap-3 px-4 py-3 border-b border-white/4 last:border-0 hover:bg-white/[0.05] active:bg-white/[0.08] text-left transition-colors">
                        <span class="material-symbols-outlined text-orange-400 flex-shrink-0" style="font-size:18px">place</span>
                        <div class="flex-1 min-w-0">
                          <p class="text-white text-sm font-semibold truncate">{{ s.text }}</p>
                          <p class="text-slate-500 text-xs truncate">{{ s.place_name }}</p>
                        </div>
                        <span class="text-orange-400 text-xs font-black flex-shrink-0">{{ s.distKm }} km</span>
                      </button>
                    }
                  </div>
                } @else if (tripQuery().length > 1) {
                  <div class="px-4 py-5 text-slate-500 text-sm text-center flex items-center justify-center gap-2">
                    <span class="material-symbols-outlined animate-spin" style="font-size:16px">autorenew</span>
                    Buscando lugares...
                  </div>
                }
              </div>
            }

          } @else if (!tripSent()) {
            <!-- Estado: destino seleccionado → precio + tipo + botón -->

            <!-- Destino -->
            <div class="flex items-center gap-3 px-4 py-3 border-b border-white/6">
              <span class="material-symbols-outlined text-orange-400 flex-shrink-0" style="font-size:20px">place</span>
              <div class="flex-1 min-w-0">
                <p class="text-slate-400 text-[10px] uppercase tracking-wider">Destino · {{ tripDistKm() }} km</p>
                <p class="text-white text-sm font-bold truncate">{{ tripDest()!.name }}</p>
              </div>
              <button (click)="cancelTrip()">
                <span class="material-symbols-outlined text-slate-500" style="font-size:20px">close</span>
              </button>
            </div>

            <!-- Tipo de vehículo -->
            <div class="flex gap-2 px-4 py-3 border-b border-white/6">
              <button (click)="setTripVehicle('carro')"
                class="flex-1 py-3 rounded-xl font-black text-sm flex items-center justify-center gap-2 transition-all"
                [class]="tripVehicle()==='carro'
                  ? 'bg-orange-500 text-black'
                  : 'bg-white/5 border border-white/10 text-slate-400'">
                <span class="material-symbols-outlined" style="font-size:20px">directions_car</span> Carro
              </button>
              <button (click)="setTripVehicle('moto')"
                class="flex-1 py-3 rounded-xl font-black text-sm flex items-center justify-center gap-2 transition-all"
                [class]="tripVehicle()==='moto'
                  ? 'bg-cyan-500 text-black'
                  : 'bg-white/5 border border-white/10 text-slate-400'">
                <span class="material-symbols-outlined" style="font-size:20px">two_wheeler</span> Moto
              </button>
            </div>

            <!-- Precio -->
            <div class="flex items-center gap-3 px-4 py-3 border-b border-white/6">
              <div class="flex-1">
                <p class="text-slate-500 text-[10px] uppercase tracking-wider">Valor sugerido</p>
                <p class="text-white font-black text-2xl">{{ formatCOP(tripPrice()) }}</p>
              </div>
              <div class="flex items-center gap-2">
                <button (click)="adjustTripPrice(-500)"
                  class="w-10 h-10 rounded-xl bg-white/8 border border-white/10 text-white font-black text-xl flex items-center justify-center hover:bg-white/12 active:scale-95 transition-all">−</button>
                <button (click)="adjustTripPrice(500)"
                  class="w-10 h-10 rounded-xl bg-white/8 border border-white/10 text-white font-black text-xl flex items-center justify-center hover:bg-white/12 active:scale-95 transition-all">+</button>
              </div>
            </div>

            <!-- Botón encontrar ofertas -->
            <div class="px-4 py-3">
              <button (click)="findOffers()" [disabled]="tripSending()"
                class="w-full py-4 rounded-xl font-black text-sm uppercase tracking-wider flex items-center justify-center gap-2 transition-all disabled:opacity-60 active:scale-[0.98]"
                [class]="tripVehicle()==='carro' ? 'bg-orange-500 text-black' : 'bg-cyan-500 text-black'">
                @if (tripSending()) {
                  <span class="material-symbols-outlined animate-spin" style="font-size:18px">autorenew</span> Buscando...
                } @else {
                  <span class="material-symbols-outlined" style="font-size:18px">local_taxi</span> Encontrar ofertas
                }
              </button>
            </div>

          } @else {
            <!-- Estado: solicitud enviada -->
            <div class="px-4 py-8 flex flex-col items-center gap-3 text-center">
              <div class="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                <span class="material-symbols-outlined text-emerald-400" style="font-size:32px">check_circle</span>
              </div>
              <p class="text-white font-black text-base">¡Solicitud enviada!</p>
              <p class="text-slate-400 text-sm">Buscando conductores disponibles cerca de ti…</p>
              <p class="text-slate-600 text-xs">{{ tripDest()!.name }} · {{ formatCOP(tripPrice()) }} · {{ tripDistKm() }} km</p>
              <button (click)="cancelTrip()"
                class="mt-3 px-5 py-2 rounded-xl bg-white/5 border border-white/10 text-slate-400 text-xs font-bold hover:bg-white/10 transition-colors">
                Cancelar solicitud
              </button>
            </div>
          }

        </div>
      }
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
                <div class="flex items-center gap-3 px-4 py-3 border-b border-slate-100">
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

  private _map:             any    = null;
  private _userMarker:      any    = null;
  private _vehicleMarkers:  any[]  = [];
  private _vehicleStates: Array<{
    path: [number, number][]; segIdx: number; t: number;
    speed: number; forward: boolean; marker: any;
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
      container.style.height = '300px';
    }

    this._destroyMap();

    mapboxgl.accessToken = this.MAPBOX_TOKEN;
    this._map = new mapboxgl.Map({
      container,
      style:   'mapbox://styles/mapbox/streets-v12',  // mapa claro con calles
      center:  [lng, lat],
      zoom:    15,
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
    const configs = [
      { isMoto: false, color: '#F59E0B' },
      { isMoto: false, color: '#FFFFFF'  },
      { isMoto: false, color: '#3B82F6'  },
      { isMoto: false, color: '#EF4444'  },
      { isMoto: false, color: '#1e293b'  },
      { isMoto: true,  color: '#06B6D4'  },
      { isMoto: true,  color: '#F97316'  },
      { isMoto: true,  color: '#22C55E'  },
      { isMoto: true,  color: '#A855F7'  },
    ];

    const paths = this._extractRoadPaths(lat, lng);

    for (let i = 0; i < configs.length; i++) {
      const { isMoto, color } = configs[i];
      const path = paths[i % paths.length];
      if (!path || path.length < 2) continue;

      // Distribuir puntos de inicio a lo largo de los caminos
      // Evitar puntos muy cercanos al usuario (radio ~150 m ≈ 0.0014°)
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
        speed:   isMoto ? 0.000035 : 0.000028, // velocidad visible en mapa
        forward: i % 3 !== 0,                     // la mayoría en sentido original
        marker,
      });
    }

    this._startAnimation();
  }

  /** Extrae LineStrings de calles renderizadas como rutas de animación */
  private _extractRoadPaths(lat: number, lng: number): [number, number][][] {
    const layers = [
      'road-street', 'road-secondary-tertiary', 'road-primary',
      'road-minor',  'road-minor-low',           'road-street-low',
    ];
    const features = (this._map as any)?.queryRenderedFeatures(undefined, { layers }) ?? [];
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

    // Fallback con trayectorias en cuadrícula si no hay tiles
    if (paths.length < 9) {
      const R = 0.003;
      const fb: [number, number][][] = [
        [[lng,lat],[lng+R,lat],[lng+R*2,lat+R*0.5],[lng+R*2.5,lat+R*1.5]],
        [[lng-R,lat+R],[lng,lat+R],[lng+R,lat+R],[lng+R*2,lat+R]],
        [[lng+R,lat-R],[lng+R,lat],[lng+R,lat+R],[lng+R,lat+R*2]],
        [[lng-R*2,lat],[lng-R,lat+R*0.5],[lng,lat],[lng+R,lat-R*0.5]],
        [[lng,lat+R*1.5],[lng+R*0.8,lat+R],[lng+R*1.2,lat+R*0.3],[lng+R*2,lat]],
        [[lng-R*1.5,lat-R],[lng-R,lat-R*0.5],[lng,lat-R],[lng+R,lat-R]],
        [[lng+R*0.5,lat+R*2],[lng+R,lat+R*1.5],[lng+R*1.5,lat+R],[lng+R*2,lat]],
        [[lng-R,lat-R*1.5],[lng-R*0.5,lat-R],[lng,lat-R*0.5],[lng+R*0.5,lat]],
        [[lng+R*2,lat+R*2],[lng+R,lat+R],[lng,lat],[lng-R,lat-R]],
      ];
      for (const p of fb) { if (paths.length < 9) paths.push(p); }
    }
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

        // Heading del segmento actual
        const rawH = Math.atan2(cx1 - cx0, cy1 - cy0) * 180 / Math.PI;
        const heading = vs.forward ? rawH : rawH + 180;

        // No colocar vehículo encima del marcador del usuario
        const uLng = this._currentLng, uLat = this._currentLat;
        if (Math.abs(curLng - uLng) > 0.0006 || Math.abs(curLat - uLat) > 0.0006) {
          vs.marker.setLngLat([curLng, curLat]);
        }
        (vs.marker.getElement() as HTMLElement).style.transform = `rotate(${heading}deg)`;
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

  private _carElement(heading: number, color: string): HTMLElement {
    const uid = Math.random().toString(36).slice(2, 6);
    const wrap = document.createElement('div');
    wrap.style.cssText = `width:34px;height:56px;transform:rotate(${heading}deg);filter:drop-shadow(0 4px 10px rgba(0,0,0,0.55));`;
    wrap.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 34 56" width="34" height="56">
      <defs>
        <linearGradient id="cg${uid}" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%"   stop-color="rgba(0,0,0,0.20)"/>
          <stop offset="45%"  stop-color="rgba(255,255,255,0.12)"/>
          <stop offset="100%" stop-color="rgba(0,0,0,0.18)"/>
        </linearGradient>
      </defs>
      <!-- shadow -->
      <ellipse cx="17" cy="54" rx="11" ry="2" fill="rgba(0,0,0,0.25)"/>
      <!-- body -->
      <path d="M5,12 C5,5 10,2 17,2 C24,2 29,5 29,12 L29,46 C29,52 24,54 17,54 C10,54 5,52 5,46 Z" fill="${color}"/>
      <path d="M5,12 C5,5 10,2 17,2 C24,2 29,5 29,12 L29,46 C29,52 24,54 17,54 C10,54 5,52 5,46 Z" fill="url(#cg${uid})"/>
      <!-- windshield -->
      <path d="M9,13 C9,8 12,6 17,6 C22,6 25,8 25,13 L24,22 C21,24 13,24 10,22 Z" fill="rgba(186,230,253,0.78)"/>
      <path d="M11,7.5 C13,6.5 16,6.5 18,7.5 L17.5,17 C15.5,16.5 12.5,16 11,14 Z" fill="rgba(255,255,255,0.28)"/>
      <!-- rear window -->
      <path d="M10,36 C13,38.5 21,38.5 24,36 L24,43 C21,44.5 13,44.5 10,43 Z" fill="rgba(186,230,253,0.55)"/>
      <!-- headlights -->
      <circle cx="9"  cy="7"  r="5" fill="#FEF9C3"/>
      <circle cx="9"  cy="7"  r="2.8" fill="#FDE047"/>
      <circle cx="25" cy="7"  r="5" fill="#FEF9C3"/>
      <circle cx="25" cy="7"  r="2.8" fill="#FDE047"/>
      <!-- direction chevron -->
      <path d="M17,1 L14,5 L17,4 L20,5 Z" fill="rgba(255,255,255,0.75)"/>
      <!-- taillights -->
      <circle cx="9"  cy="50" r="4.5" fill="#EF4444"/>
      <circle cx="9"  cy="50" r="2.4" fill="#FCA5A5"/>
      <circle cx="25" cy="50" r="4.5" fill="#EF4444"/>
      <circle cx="25" cy="50" r="2.4" fill="#FCA5A5"/>
    </svg>`;
    return wrap;
  }

  private _motoElement(heading: number, color: string): HTMLElement {
    const uid = Math.random().toString(36).slice(2, 6);
    const wrap = document.createElement('div');
    wrap.style.cssText = `width:22px;height:56px;transform:rotate(${heading}deg);filter:drop-shadow(0 4px 10px rgba(0,0,0,0.55));`;
    wrap.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 22 56" width="22" height="56">
      <defs>
        <linearGradient id="mg${uid}" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%"   stop-color="rgba(0,0,0,0.22)"/>
          <stop offset="50%"  stop-color="rgba(255,255,255,0.15)"/>
          <stop offset="100%" stop-color="rgba(0,0,0,0.20)"/>
        </linearGradient>
      </defs>
      <!-- shadow -->
      <ellipse cx="11" cy="54" rx="8" ry="2" fill="rgba(0,0,0,0.25)"/>
      <!-- rear wheel -->
      <circle cx="11" cy="47" r="7" fill="#0f172a"/>
      <circle cx="11" cy="47" r="4.5" fill="#1e293b"/>
      <circle cx="11" cy="47" r="1.8" fill="#475569"/>
      <line x1="11" y1="41" x2="11" y2="53" stroke="#374151" stroke-width="0.7"/>
      <line x1="5"  y1="47" x2="17" y2="47" stroke="#374151" stroke-width="0.7"/>
      <!-- body -->
      <path d="M8,18 C8,14 9,12 11,12 C13,12 14,14 14,18 L14,40 C14,43 13,44 11,44 C9,44 8,43 8,40 Z" fill="${color}"/>
      <path d="M8,18 C8,14 9,12 11,12 C13,12 14,14 14,18 L14,40 C14,43 13,44 11,44 C9,44 8,43 8,40 Z" fill="url(#mg${uid})"/>
      <!-- tank highlight -->
      <path d="M8.5,18 C8.5,15 9.5,13 11,13 L10.5,22 C9.5,21.5 8.5,20.5 8.5,19 Z" fill="rgba(255,255,255,0.22)"/>
      <!-- seat -->
      <rect x="8.5" y="26" width="5" height="12" rx="2" fill="rgba(0,0,0,0.28)"/>
      <!-- handlebars -->
      <rect x="2" y="20" width="18" height="2.5" rx="1.2" fill="#94a3b8"/>
      <rect x="2"   y="20" width="3.5" height="2.5" rx="1.2" fill="#64748b"/>
      <rect x="16.5" y="20" width="3.5" height="2.5" rx="1.2" fill="#64748b"/>
      <!-- fork -->
      <rect x="9.5" y="13" width="3" height="9" rx="1.5" fill="${color}" opacity="0.65"/>
      <!-- front wheel -->
      <circle cx="11" cy="9"  r="7" fill="#0f172a"/>
      <circle cx="11" cy="9"  r="4.5" fill="#1e293b"/>
      <circle cx="11" cy="9"  r="1.8" fill="#475569"/>
      <line x1="11" y1="3"  x2="11" y2="15" stroke="#374151" stroke-width="0.7"/>
      <line x1="5"  y1="9"  x2="17" y2="9"  stroke="#374151" stroke-width="0.7"/>
      <!-- headlight -->
      <circle cx="11" cy="4"  r="3.2" fill="#FEF9C3"/>
      <circle cx="11" cy="4"  r="1.7" fill="#FDE047"/>
      <!-- direction chevron -->
      <path d="M11,1 L9,4 L11,3.3 L13,4 Z" fill="rgba(255,255,255,0.75)"/>
      <!-- taillight -->
      <circle cx="11" cy="51" r="2.5" fill="#EF4444"/>
      <circle cx="11" cy="51" r="1.2" fill="#FCA5A5"/>
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

  openTripSearch() { this.tripOpen.set(true); }
  closeTripSearch() { this.tripOpen.set(false); this.tripQuery.set(''); this.tripSuggestions.set([]); }

  onTripQueryInput(val: string) {
    this.tripQuery.set(val);
    if (this._tripDebounce) clearTimeout(this._tripDebounce);
    if (val.length < 2) { this.tripSuggestions.set([]); return; }
    this._tripDebounce = setTimeout(() => this._searchTripPlaces(val), 350);
  }

  private async _searchTripPlaces(query: string) {
    const lat = this._currentLat, lng = this._currentLng;
    const bbox = [lng - 0.22, lat - 0.22, lng + 0.22, lat + 0.22].join(',');
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json`
      + `?access_token=${this.MAPBOX_TOKEN}&language=es&limit=6`
      + `&proximity=${lng},${lat}&bbox=${bbox}`;
    try {
      const res  = await fetch(url);
      const json = await res.json();
      const features = (json.features ?? []).map((f: any) => {
        const [fLng, fLat] = f.center ?? [lng, lat];
        return { ...f, distKm: this._distKm(lat, lng, fLat, fLng) };
      });
      this.tripSuggestions.set(features);
    } catch { /* ignore */ }
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
