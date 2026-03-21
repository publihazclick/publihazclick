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

      <div class="bg-orange-500/5 border border-orange-500/15 rounded-2xl p-5 text-center">
        <span class="material-symbols-outlined text-orange-400 mb-2 block" style="font-size:36px">directions_car</span>
        <p class="text-white font-bold text-sm mb-1">Pronto podrás solicitar viajes</p>
        <p class="text-slate-500 text-xs">Estamos activando los conductores en tu ciudad. Te notificaremos cuando esté disponible.</p>
      </div>
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

  private _map:             any    = null;
  private _userMarker:      any    = null;
  private _vehicleMarkers:  any[]  = [];
  private _mapboxPromise:   Promise<void> | null = null;
  private _searchDebounce:  ReturnType<typeof setTimeout> | null = null;
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
      // Cargar vehículos cercanos
      this._loadVehicleMarkers(lat, lng);

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

    // Limpiar marcadores anteriores
    this._vehicleMarkers.forEach(m => m.remove());
    this._vehicleMarkers = [];

    // Intentar cargar conductores reales
    let vehicles = await this.agService.getNearbyVehicles(lat, lng);

    // Si no hay conductores reales, mostrar demos visuales
    if (vehicles.length === 0) {
      const R = 0.0035; // ~350m
      vehicles = [
        { id: 'd1', lat: lat + R * 0.8,  lng: lng + R * 0.5,  heading: 45,  vehicle_type: 'carro' },
        { id: 'd2', lat: lat - R * 0.6,  lng: lng + R * 1.0,  heading: 180, vehicle_type: 'carro' },
        { id: 'd3', lat: lat + R * 0.3,  lng: lng - R * 0.9,  heading: 90,  vehicle_type: 'moto'  },
        { id: 'd4', lat: lat + R * 1.1,  lng: lng - R * 0.3,  heading: 270, vehicle_type: 'moto'  },
        { id: 'd5', lat: lat - R * 0.9,  lng: lng - R * 0.6,  heading: 135, vehicle_type: 'carro' },
        { id: 'd6', lat: lat - R * 0.2,  lng: lng + R * 1.3,  heading: 310, vehicle_type: 'moto'  },
      ];
    }

    vehicles.forEach(v => {
      const isMoto = v.vehicle_type?.toLowerCase().includes('moto');
      const el = isMoto ? this._motoElement(v.heading) : this._carElement(v.heading);
      const marker = new mapboxgl.Marker({ element: el, anchor: 'center' })
        .setLngLat([v.lng, v.lat])
        .addTo(this._map);
      this._vehicleMarkers.push(marker);
    });
  }

  private _carElement(heading: number): HTMLElement {
    const wrap = document.createElement('div');
    wrap.style.cssText = `transform:rotate(${heading}deg);filter:drop-shadow(0 3px 6px rgba(0,0,0,0.35));`;
    wrap.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="44" height="28" viewBox="0 0 44 28">
        <!-- sombra -->
        <ellipse cx="22" cy="25" rx="14" ry="3" fill="rgba(0,0,0,0.18)"/>
        <!-- carrocería -->
        <rect x="4" y="10" width="36" height="12" rx="4" fill="#F59E0B"/>
        <!-- techo -->
        <rect x="10" y="5" width="24" height="10" rx="3" fill="#FBBF24"/>
        <!-- parabrisas delantero -->
        <rect x="11" y="6" width="10" height="7" rx="1.5" fill="rgba(186,230,253,0.85)"/>
        <!-- parabrisas trasero -->
        <rect x="23" y="6" width="10" height="7" rx="1.5" fill="rgba(186,230,253,0.85)"/>
        <!-- ruedas -->
        <rect x="2"  y="9"  width="6" height="5" rx="2" fill="#1f2937"/>
        <rect x="36" y="9"  width="6" height="5" rx="2" fill="#1f2937"/>
        <rect x="2"  y="16" width="6" height="5" rx="2" fill="#1f2937"/>
        <rect x="36" y="16" width="6" height="5" rx="2" fill="#1f2937"/>
        <!-- faros -->
        <rect x="38" y="11" width="4" height="2" rx="1" fill="#FEF08A"/>
        <rect x="38" y="17" width="4" height="2" rx="1" fill="#FEF08A"/>
      </svg>`;
    return wrap;
  }

  private _motoElement(heading: number): HTMLElement {
    const wrap = document.createElement('div');
    wrap.style.cssText = `transform:rotate(${heading}deg);filter:drop-shadow(0 3px 5px rgba(0,0,0,0.35));`;
    wrap.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="36" height="22" viewBox="0 0 36 22">
        <!-- sombra -->
        <ellipse cx="18" cy="20" rx="9" ry="2" fill="rgba(0,0,0,0.18)"/>
        <!-- cuerpo -->
        <ellipse cx="18" cy="11" rx="12" ry="5" fill="#06B6D4"/>
        <!-- asiento -->
        <rect x="11" y="7" width="14" height="5" rx="2" fill="#0891B2"/>
        <!-- rueda delantera -->
        <ellipse cx="5"  cy="11" rx="4" ry="4" fill="#0f172a" stroke="#475569" stroke-width="1.5"/>
        <ellipse cx="5"  cy="11" rx="2" ry="2" fill="#334155"/>
        <!-- rueda trasera -->
        <ellipse cx="31" cy="11" rx="4" ry="4" fill="#0f172a" stroke="#475569" stroke-width="1.5"/>
        <ellipse cx="31" cy="11" rx="2" ry="2" fill="#334155"/>
        <!-- faro -->
        <ellipse cx="3" cy="11" rx="1.5" ry="1.5" fill="#FEF08A"/>
      </svg>`;
    return wrap;
  }

  private _destroyMap() {
    this._vehicleMarkers.forEach(m => { try { m.remove(); } catch { /**/ } });
    this._vehicleMarkers = [];
    this._userMarker = null;
    if (this._map) {
      try { this._map.remove(); } catch { /* ignore */ }
      this._map = null;
    }
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
