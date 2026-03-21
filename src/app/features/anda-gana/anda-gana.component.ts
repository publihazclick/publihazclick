import { Component, ChangeDetectionStrategy, OnInit, OnDestroy, signal, inject, computed, NgZone, PLATFORM_ID } from '@angular/core';
import { AndaGanaService, AgUser, AgDriver, AgTrip, AgRideRequest, AgChatMessage, PlaceSuggestion, RouteInfo } from './anda-gana.service';
import { DatePipe, DecimalPipe, isPlatformBrowser } from '@angular/common';

type AgScreen =
  | 'loading' | 'welcome' | 'enter-phone' | 'verify-code'
  | 'register-passenger' | 'register-driver' | 'pending'
  | 'rejected' | 'passenger-home' | 'driver-home' | 'admin-panel'
  | 'passenger-gps-wait'
  | 'passenger-pick-origin' | 'passenger-pick-dest' | 'passenger-offer'
  | 'passenger-searching' | 'passenger-trip' | 'passenger-rating'
  | 'driver-requests' | 'driver-trip-active' | 'driver-rate-passenger' | 'driver-earnings'
  | 'security-settings';

@Component({
  selector: 'app-anda-gana',
  standalone: true,
  imports: [DatePipe, DecimalPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
<div class="min-h-screen w-full flex flex-col items-center py-6 px-4">

  <!-- ═══════════════════ LOADING ═══════════════════ -->
  @if (screen() === 'loading') {
    <div class="flex flex-col items-center justify-center min-h-[60vh] gap-4">
      <div class="w-16 h-16 rounded-2xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center">
        <span class="material-symbols-outlined text-orange-400 animate-pulse" style="font-size:32px">directions_car</span>
      </div>
      <p class="text-slate-500 text-sm">Cargando Anda y Gana...</p>
    </div>
  }

  <!-- ═══════════════════ GPS WAIT ═══════════════════ -->
  @if (screen() === 'passenger-gps-wait') {
    <div class="w-full max-w-sm flex flex-col items-center gap-6 py-10">
      <div class="w-24 h-24 rounded-3xl bg-orange-500/10 border-2 border-orange-500/30 flex items-center justify-center">
        @if (mapLoading()) {
          <span class="material-symbols-outlined text-orange-400 animate-pulse" style="font-size:48px">my_location</span>
        } @else {
          <span class="material-symbols-outlined text-rose-400" style="font-size:48px">location_off</span>
        }
      </div>
      @if (mapLoading()) {
        <div class="text-center">
          <h2 class="text-white font-black text-xl mb-2">Detectando tu ubicación</h2>
          <p class="text-slate-400 text-sm leading-relaxed">Por favor <strong class="text-orange-400">permite el acceso al GPS</strong> cuando tu navegador lo solicite.<br>Solo así podemos mostrarte en el mapa tu posición real.</p>
        </div>
        <div class="flex items-center gap-3 bg-orange-500/10 border border-orange-500/20 rounded-2xl px-5 py-4">
          <span class="material-symbols-outlined text-orange-400 animate-spin" style="font-size:20px">autorenew</span>
          <p class="text-orange-300 text-sm font-bold">Esperando permiso GPS...</p>
        </div>
      } @else {
        <div class="text-center">
          <h2 class="text-white font-black text-xl mb-2">GPS no disponible</h2>
          <p class="text-slate-400 text-sm leading-relaxed">{{ gpsError() || 'No se pudo obtener tu ubicación.' }}<br><br>Puedes continuar buscando tu dirección de origen manualmente en el mapa.</p>
        </div>
        <button (click)="openMapWithDefault()"
          class="w-full py-4 rounded-2xl font-black text-base uppercase tracking-wider bg-gradient-to-r from-orange-500 to-amber-500 text-black">
          <span class="flex items-center justify-center gap-2">
            <span class="material-symbols-outlined" style="font-size:20px">map</span>
            Continuar sin GPS
          </span>
        </button>
        <button (click)="retryGps()"
          class="w-full py-3 rounded-2xl border border-cyan-500/30 bg-cyan-500/5 text-cyan-400 font-black text-sm">
          <span class="flex items-center justify-center gap-2">
            <span class="material-symbols-outlined" style="font-size:16px">refresh</span>
            Intentar GPS de nuevo
          </span>
        </button>
      }
      <button (click)="screen.set('passenger-home')"
        class="text-slate-500 text-sm hover:text-slate-300 transition-colors">
        ← Volver al inicio
      </button>
    </div>
  }

  <!-- ═══════════════════ WELCOME ═══════════════════ -->
  @if (screen() === 'welcome') {
    <div class="w-full max-w-lg flex flex-col items-center gap-6">
      <!-- Hero -->
      <div class="text-center">
        <div class="w-20 h-20 rounded-3xl bg-gradient-to-tr from-orange-500/20 to-amber-500/20 border border-orange-500/30 flex items-center justify-center mx-auto mb-4">
          <span class="material-symbols-outlined text-orange-400" style="font-size:40px">directions_car</span>
        </div>
        <h1 class="text-2xl font-black text-white uppercase tracking-widest">Anda y <span class="text-orange-400">Gana</span></h1>
        <p class="text-slate-500 text-sm mt-2">Plataforma de transporte inteligente · Precios justos · Sin intermediarios</p>
      </div>

      <!-- Botones de registro -->
      <div class="flex flex-col gap-4 w-full">
        <button (click)="chooseRole('passenger')"
          class="w-full flex items-center gap-4 px-6 py-5 rounded-2xl font-black text-base uppercase tracking-wider transition-all
            bg-gradient-to-r from-orange-500 to-amber-500 text-black hover:from-orange-400 hover:to-amber-400 shadow-lg shadow-orange-500/30 active:scale-[0.98]">
          <div class="w-12 h-12 rounded-xl bg-black/20 flex items-center justify-center shrink-0">
            <span class="material-symbols-outlined" style="font-size:28px">person_pin_circle</span>
          </div>
          <div class="text-left">
            <p class="text-base font-black leading-tight">Crear cuenta de pasajero</p>
            <p class="text-xs font-normal normal-case tracking-normal opacity-80 mt-0.5">Solicita viajes y llega a tu destino</p>
          </div>
          <span class="material-symbols-outlined ml-auto" style="font-size:22px">arrow_forward</span>
        </button>

        <button (click)="chooseRole('driver')"
          class="w-full flex items-center gap-4 px-6 py-5 rounded-2xl font-black text-base uppercase tracking-wider transition-all
            bg-gradient-to-r from-slate-700 to-slate-600 text-white hover:from-slate-600 hover:to-slate-500 border border-white/10 shadow-lg active:scale-[0.98]">
          <div class="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center shrink-0">
            <span class="material-symbols-outlined text-amber-400" style="font-size:28px">directions_car</span>
          </div>
          <div class="text-left">
            <p class="text-base font-black leading-tight">Crear cuenta de conductor</p>
            <p class="text-xs font-normal normal-case tracking-normal opacity-60 mt-0.5">Acepta viajes y genera ingresos</p>
          </div>
          <span class="material-symbols-outlined ml-auto opacity-60" style="font-size:22px">arrow_forward</span>
        </button>
      </div>

      @if (isAdmin()) {
        <button (click)="screen.set('admin-panel'); loadAdminData()"
          class="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-primary/30 bg-primary/5 text-primary hover:bg-primary/10 transition-all font-black text-sm uppercase tracking-widest">
          <span class="material-symbols-outlined" style="font-size:18px">admin_panel_settings</span>
          Panel Administrador
        </button>
      }
    </div>
  }

  <!-- ═══════════════════ ENTER PHONE ═══════════════════ -->
  @if (screen() === 'enter-phone') {
    <div class="w-full max-w-sm flex flex-col gap-6">
      <div class="text-center">
        <div class="w-14 h-14 rounded-2xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center mx-auto mb-3">
          <span class="material-symbols-outlined text-orange-400" style="font-size:26px">phone_iphone</span>
        </div>
        <h2 class="text-xl font-black text-white">Verifica tu número</h2>
        <p class="text-slate-500 text-sm mt-1">Ingresa tu número de celular para continuar</p>
      </div>

      <div class="bg-white/[0.02] border border-white/10 rounded-2xl p-5 flex flex-col gap-4">
        <div>
          <label class="block text-[10px] text-slate-400 uppercase tracking-widest mb-1.5 font-bold">Número de celular</label>
          <div class="flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl px-3 py-3 focus-within:border-orange-500/50 transition-all">
            <span class="text-slate-400 font-bold text-sm shrink-0">+57</span>
            <div class="w-px h-4 bg-white/10 shrink-0"></div>
            <input type="tel" [value]="phone()" (input)="phone.set($any($event.target).value)"
              placeholder="300 000 0000" maxlength="10"
              class="flex-1 bg-transparent text-white text-sm placeholder:text-slate-600 focus:outline-none" />
          </div>
        </div>

        @if (error()) {
          <p class="text-rose-400 text-xs flex items-center gap-1">
            <span class="material-symbols-outlined" style="font-size:14px">error</span> {{ error() }}
          </p>
        }

        <button (click)="sendCode()" [disabled]="loading() || phone().length < 10"
          class="w-full py-3 rounded-xl font-black text-sm uppercase tracking-widest transition-all
            bg-gradient-to-r from-orange-500 to-amber-500 text-black hover:from-orange-400 hover:to-amber-400 disabled:opacity-40">
          @if (loading()) { <span class="material-symbols-outlined animate-spin" style="font-size:16px">autorenew</span> }
          @else { Enviar Código }
        </button>

        <button (click)="screen.set('welcome')" class="text-slate-500 text-xs text-center hover:text-slate-300 transition-colors">
          ← Volver
        </button>
      </div>
    </div>
  }

  <!-- ═══════════════════ VERIFY CODE ═══════════════════ -->
  @if (screen() === 'verify-code') {
    <div class="w-full max-w-sm flex flex-col gap-6">
      <div class="text-center">
        <div class="w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mx-auto mb-3">
          <span class="material-symbols-outlined text-emerald-400" style="font-size:26px">sms</span>
        </div>
        <h2 class="text-xl font-black text-white">Ingresa el código</h2>
        <p class="text-slate-500 text-sm mt-1">Código enviado al +57 {{ phone() }}</p>
      </div>

      <!-- Código visible en pantalla (sin proveedor SMS real) -->
      @if (pendingCode()) {
        <div class="flex items-center gap-3 px-4 py-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
          <span class="material-symbols-outlined text-amber-400 shrink-0" style="font-size:20px">info</span>
          <div>
            <p class="text-amber-400 font-black text-xs uppercase tracking-wider">Tu código de verificación</p>
            <p class="text-white font-black text-2xl tracking-[0.3em] mt-0.5">{{ pendingCode() }}</p>
          </div>
        </div>
      }

      <div class="bg-white/[0.02] border border-white/10 rounded-2xl p-5 flex flex-col gap-4">
        <div>
          <label class="block text-[10px] text-slate-400 uppercase tracking-widest mb-1.5 font-bold">Código de 6 dígitos</label>
          <input type="text" [value]="verificationCode()" (input)="verificationCode.set($any($event.target).value)"
            placeholder="000000" maxlength="6"
            class="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-2xl text-center tracking-[0.4em] placeholder:text-slate-600 focus:outline-none focus:border-emerald-500/50 transition-all" />
        </div>

        @if (error()) {
          <p class="text-rose-400 text-xs flex items-center gap-1">
            <span class="material-symbols-outlined" style="font-size:14px">error</span> {{ error() }}
          </p>
        }

        <button (click)="confirmCode()" [disabled]="loading() || verificationCode().length < 6"
          class="w-full py-3 rounded-xl font-black text-sm uppercase tracking-widest transition-all
            bg-gradient-to-r from-emerald-500 to-cyan-500 text-black hover:from-emerald-400 hover:to-cyan-400 disabled:opacity-40">
          @if (loading()) { <span class="material-symbols-outlined animate-spin" style="font-size:16px">autorenew</span> }
          @else { Verificar Código }
        </button>

        <button (click)="screen.set('enter-phone')" class="text-slate-500 text-xs text-center hover:text-slate-300 transition-colors">
          ← Cambiar número
        </button>
      </div>
    </div>
  }

  <!-- ═══════════════════ REGISTER PASSENGER ═══════════════════ -->
  @if (screen() === 'register-passenger') {
    <div class="w-full max-w-sm flex flex-col gap-6">
      <div class="text-center">
        <div class="w-14 h-14 rounded-2xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center mx-auto mb-3">
          <span class="material-symbols-outlined text-orange-400" style="font-size:26px">person_add</span>
        </div>
        <h2 class="text-xl font-black text-white">Completa tu perfil</h2>
        <p class="text-slate-500 text-sm mt-1">Solo necesitamos tu nombre para empezar</p>
      </div>

      <div class="bg-white/[0.02] border border-white/10 rounded-2xl p-5 flex flex-col gap-4">
        <div>
          <label class="block text-[10px] text-slate-400 uppercase tracking-widest mb-1.5 font-bold">Nombres y Apellidos</label>
          <input type="text" [value]="fullName()" (input)="fullName.set($any($event.target).value)"
            placeholder="Tu nombre completo"
            class="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder:text-slate-600 focus:outline-none focus:border-orange-500/50 transition-all" />
        </div>

        @if (error()) {
          <p class="text-rose-400 text-xs flex items-center gap-1">
            <span class="material-symbols-outlined" style="font-size:14px">error</span> {{ error() }}
          </p>
        }

        <button (click)="registerPassenger()" [disabled]="loading() || !fullName().trim()"
          class="w-full py-3 rounded-xl font-black text-sm uppercase tracking-widest transition-all
            bg-gradient-to-r from-orange-500 to-amber-500 text-black hover:from-orange-400 hover:to-amber-400 disabled:opacity-40">
          @if (loading()) { <span class="material-symbols-outlined animate-spin" style="font-size:16px">autorenew</span> }
          @else { Crear mi cuenta }
        </button>
      </div>
    </div>
  }

  <!-- ═══════════════════ REGISTER DRIVER ═══════════════════ -->
  @if (screen() === 'register-driver') {
    <div class="w-full max-w-xl flex flex-col gap-6">
      <div class="text-center">
        <div class="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mx-auto mb-3">
          <span class="material-symbols-outlined text-amber-400" style="font-size:26px">badge</span>
        </div>
        <h2 class="text-xl font-black text-white">Registro de Conductor</h2>
        <p class="text-slate-500 text-sm mt-1">Completa tus datos · Tu solicitud será revisada por nuestro equipo</p>
      </div>

      <div class="bg-white/[0.02] border border-white/10 rounded-2xl p-5 flex flex-col gap-5">

        <!-- Datos personales -->
        <div>
          <p class="text-[10px] text-orange-400 uppercase tracking-widest font-black mb-3 flex items-center gap-1.5">
            <span class="material-symbols-outlined" style="font-size:14px">person</span> Datos Personales
          </p>
          <input type="text" [value]="fullName()" (input)="fullName.set($any($event.target).value)"
            placeholder="Nombres y Apellidos"
            class="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder:text-slate-600 focus:outline-none focus:border-amber-500/50 transition-all" />
        </div>

        <!-- Licencia -->
        <div>
          <p class="text-[10px] text-orange-400 uppercase tracking-widest font-black mb-3 flex items-center gap-1.5">
            <span class="material-symbols-outlined" style="font-size:14px">id_card</span> Licencia de Conducción
          </p>
          <input type="text" [value]="licenseNumber()" (input)="licenseNumber.set($any($event.target).value)"
            placeholder="Número de licencia"
            class="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder:text-slate-600 focus:outline-none focus:border-amber-500/50 transition-all mb-3" />

          <!-- Upload licencia -->
          <label class="flex flex-col items-center gap-2 p-4 rounded-xl border border-dashed border-white/20 bg-white/[0.02] cursor-pointer hover:border-amber-500/40 hover:bg-amber-500/5 transition-all">
            <input type="file" accept="image/*,.pdf" class="hidden" (change)="uploadFile($event, 'license')" />
            @if (uploadingLicense()) {
              <span class="material-symbols-outlined text-amber-400 animate-spin" style="font-size:24px">autorenew</span>
              <span class="text-amber-400 text-xs font-bold">Subiendo...</span>
            } @else if (licensePhotoUrl()) {
              <span class="material-symbols-outlined text-emerald-400" style="font-size:24px">check_circle</span>
              <span class="text-emerald-400 text-xs font-bold">Foto de licencia cargada ✓</span>
            } @else {
              <span class="material-symbols-outlined text-slate-500" style="font-size:24px">upload_file</span>
              <span class="text-slate-500 text-xs">Foto de licencia (JPG, PNG, PDF)</span>
            }
          </label>
        </div>

        <!-- Vehículo -->
        <div>
          <p class="text-[10px] text-orange-400 uppercase tracking-widest font-black mb-3 flex items-center gap-1.5">
            <span class="material-symbols-outlined" style="font-size:14px">directions_car</span> Datos del Vehículo
          </p>
          <div class="grid grid-cols-2 gap-3 mb-3">
            <input type="text" [value]="vehiclePlate()" (input)="vehiclePlate.set($any($event.target).value)"
              placeholder="Placa (AAA-000)"
              class="bg-white/5 border border-white/10 rounded-xl px-3 py-3 text-white text-sm placeholder:text-slate-600 focus:outline-none focus:border-amber-500/50 transition-all uppercase" />
            <input type="number" [value]="vehicleYear()" (input)="vehicleYear.set($any($event.target).value)"
              placeholder="Año" min="2000" max="2030"
              class="bg-white/5 border border-white/10 rounded-xl px-3 py-3 text-white text-sm placeholder:text-slate-600 focus:outline-none focus:border-amber-500/50 transition-all" />
          </div>
          <div class="grid grid-cols-2 gap-3 mb-3">
            <input type="text" [value]="vehicleBrand()" (input)="vehicleBrand.set($any($event.target).value)"
              placeholder="Marca (Toyota...)"
              class="bg-white/5 border border-white/10 rounded-xl px-3 py-3 text-white text-sm placeholder:text-slate-600 focus:outline-none focus:border-amber-500/50 transition-all" />
            <input type="text" [value]="vehicleModel()" (input)="vehicleModel.set($any($event.target).value)"
              placeholder="Modelo (Corolla...)"
              class="bg-white/5 border border-white/10 rounded-xl px-3 py-3 text-white text-sm placeholder:text-slate-600 focus:outline-none focus:border-amber-500/50 transition-all" />
          </div>

          <!-- Upload foto vehículo -->
          <label class="flex flex-col items-center gap-2 p-4 rounded-xl border border-dashed border-white/20 bg-white/[0.02] cursor-pointer hover:border-amber-500/40 hover:bg-amber-500/5 transition-all">
            <input type="file" accept="image/*" class="hidden" (change)="uploadFile($event, 'vehicle')" />
            @if (uploadingVehicle()) {
              <span class="material-symbols-outlined text-amber-400 animate-spin" style="font-size:24px">autorenew</span>
              <span class="text-amber-400 text-xs font-bold">Subiendo...</span>
            } @else if (vehiclePhotoUrl()) {
              <span class="material-symbols-outlined text-emerald-400" style="font-size:24px">check_circle</span>
              <span class="text-emerald-400 text-xs font-bold">Foto del vehículo cargada ✓</span>
            } @else {
              <span class="material-symbols-outlined text-slate-500" style="font-size:24px">add_a_photo</span>
              <span class="text-slate-500 text-xs">Foto del vehículo</span>
            }
          </label>
        </div>

        <!-- SOAT -->
        <div>
          <p class="text-[10px] text-orange-400 uppercase tracking-widest font-black mb-3 flex items-center gap-1.5">
            <span class="material-symbols-outlined" style="font-size:14px">verified_user</span> SOAT Vigente
          </p>
          <input type="date" [value]="soatExpiry()" (input)="soatExpiry.set($any($event.target).value)"
            placeholder="Fecha de vencimiento"
            class="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-amber-500/50 transition-all mb-3" />
          <label class="flex flex-col items-center gap-2 p-4 rounded-xl border border-dashed border-white/20 bg-white/[0.02] cursor-pointer hover:border-amber-500/40 hover:bg-amber-500/5 transition-all">
            <input type="file" accept="image/*,.pdf" class="hidden" (change)="uploadFile($event, 'soat')" />
            @if (uploadingSoat()) {
              <span class="material-symbols-outlined text-amber-400 animate-spin" style="font-size:24px">autorenew</span>
              <span class="text-amber-400 text-xs font-bold">Subiendo...</span>
            } @else if (soatPhotoUrl()) {
              <span class="material-symbols-outlined text-emerald-400" style="font-size:24px">check_circle</span>
              <span class="text-emerald-400 text-xs font-bold">Foto del SOAT cargada ✓</span>
            } @else {
              <span class="material-symbols-outlined text-slate-500" style="font-size:24px">upload_file</span>
              <span class="text-slate-500 text-xs">Foto del SOAT (JPG, PNG, PDF)</span>
            }
          </label>
        </div>

        @if (error()) {
          <p class="text-rose-400 text-xs flex items-center gap-1">
            <span class="material-symbols-outlined" style="font-size:14px">error</span> {{ error() }}
          </p>
        }

        <button (click)="registerDriver()" [disabled]="loading() || !driverFormValid()"
          class="w-full py-3 rounded-xl font-black text-sm uppercase tracking-widest transition-all
            bg-gradient-to-r from-amber-500 to-orange-500 text-black hover:from-amber-400 hover:to-orange-400 disabled:opacity-40">
          @if (loading()) { <span class="material-symbols-outlined animate-spin" style="font-size:16px">autorenew</span> }
          @else { Enviar Solicitud }
        </button>
      </div>
    </div>
  }

  <!-- ═══════════════════ PENDING APPROVAL ═══════════════════ -->
  @if (screen() === 'pending') {
    <div class="w-full max-w-sm flex flex-col items-center gap-6 text-center">
      <div class="w-20 h-20 rounded-3xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
        <span class="material-symbols-outlined text-amber-400" style="font-size:40px">hourglass_top</span>
      </div>
      <div>
        <h2 class="text-xl font-black text-white mb-2">Solicitud en Revisión</h2>
        <p class="text-slate-400 text-sm leading-relaxed">
          Hemos recibido tu solicitud como conductor. Nuestro equipo está verificando tus documentos.
          Te notificaremos cuando tu cuenta sea aprobada.
        </p>
      </div>
      <div class="w-full bg-white/[0.02] border border-white/10 rounded-2xl p-5 space-y-3">
        <div class="flex items-center gap-3">
          <span class="material-symbols-outlined text-emerald-400" style="font-size:20px">check_circle</span>
          <span class="text-sm text-slate-300">Documentos enviados</span>
        </div>
        <div class="flex items-center gap-3">
          <span class="material-symbols-outlined text-amber-400 animate-pulse" style="font-size:20px">pending</span>
          <span class="text-sm text-slate-300">Verificación en proceso</span>
        </div>
        <div class="flex items-center gap-3">
          <span class="material-symbols-outlined text-slate-600" style="font-size:20px">radio_button_unchecked</span>
          <span class="text-sm text-slate-500">Aprobación del equipo</span>
        </div>
      </div>
      <p class="text-slate-600 text-xs">Tiempo estimado: 24-48 horas hábiles</p>
    </div>
  }

  <!-- ═══════════════════ REJECTED ═══════════════════ -->
  @if (screen() === 'rejected') {
    <div class="w-full max-w-sm flex flex-col items-center gap-6 text-center">
      <div class="w-20 h-20 rounded-3xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center">
        <span class="material-symbols-outlined text-rose-400" style="font-size:40px">cancel</span>
      </div>
      <div>
        <h2 class="text-xl font-black text-white mb-2">Solicitud Rechazada</h2>
        @if (agUser()?.driver?.rejection_reason) {
          <div class="bg-rose-500/10 border border-rose-500/20 rounded-xl px-4 py-3 mb-3">
            <p class="text-rose-300 text-sm leading-relaxed">{{ agUser()!.driver!.rejection_reason }}</p>
          </div>
        }
        <p class="text-slate-500 text-sm">Puedes corregir tus datos y volver a aplicar.</p>
      </div>
      <a href="https://wa.me/573181800264?text=Hola%2C%20mi%20solicitud%20de%20conductor%20fue%20rechazada%20en%20Anda%20y%20Gana" target="_blank"
        class="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-[#25D366] hover:bg-[#20bd5a] text-black font-black text-sm transition-all">
        <span class="material-symbols-outlined" style="font-size:18px">chat</span>
        Contactar Soporte
      </a>
    </div>
  }

  <!-- ═══════════════════ PASSENGER HOME ═══════════════════ -->
  @if (screen() === 'passenger-home') {
    <div class="w-full max-w-2xl flex flex-col gap-6">
      <!-- Header -->
      <div class="flex items-center gap-4 px-5 py-4 rounded-2xl bg-gradient-to-r from-orange-500/10 to-amber-500/5 border border-orange-500/20">
        <div class="w-12 h-12 rounded-2xl bg-orange-500/20 border border-orange-500/30 flex items-center justify-center shrink-0">
          <span class="material-symbols-outlined text-orange-400" style="font-size:24px">person_pin_circle</span>
        </div>
        <div>
          <p class="text-[10px] text-orange-400 uppercase tracking-widest font-black">Pasajero Activo</p>
          <p class="text-white font-black text-base">{{ agUser()?.full_name }}</p>
          <p class="text-slate-500 text-xs">{{ agUser()?.phone }}</p>
        </div>
        <span class="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">
          <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
          <span class="text-[10px] text-emerald-400 font-black uppercase">Verificado</span>
        </span>
      </div>

      @if (!activeRideRequest()) {
        <!-- Solicitar viaje -->
        <div class="rounded-2xl border border-orange-500/20 bg-gradient-to-b from-orange-500/5 to-transparent p-8 text-center flex flex-col items-center gap-4">
          <div class="w-24 h-24 rounded-full bg-orange-500/15 border border-orange-500/30 flex items-center justify-center">
            <span class="material-symbols-outlined text-orange-400" style="font-size:48px">location_on</span>
          </div>
          <div>
            <h3 class="text-white font-black text-xl">¿A dónde vas?</h3>
            <p class="text-slate-400 text-sm mt-1">Solicita tu viaje en 3 pasos y obtén el mejor precio</p>
          </div>
          <button (click)="startRideRequest()"
            class="mt-2 px-8 py-4 rounded-2xl font-black text-base uppercase tracking-wider transition-all
              bg-gradient-to-r from-orange-500 to-amber-500 text-black hover:from-orange-400 hover:to-amber-400 shadow-lg shadow-orange-500/20">
            <span class="flex items-center gap-2">
              <span class="material-symbols-outlined" style="font-size:20px">directions_car</span>
              Solicitar Viaje
            </span>
          </button>
        </div>

        <div class="grid grid-cols-3 gap-3">
          <div class="rounded-xl p-3 border border-white/10 bg-white/[0.02] flex flex-col items-center gap-2 text-center">
            <span class="material-symbols-outlined text-cyan-400" style="font-size:24px">route</span>
            <p class="text-white font-bold text-xs">Rastreo en vivo</p>
          </div>
          <div class="rounded-xl p-3 border border-white/10 bg-white/[0.02] flex flex-col items-center gap-2 text-center">
            <span class="material-symbols-outlined text-emerald-400" style="font-size:24px">price_check</span>
            <p class="text-white font-bold text-xs">Precio justo</p>
          </div>
          <div class="rounded-xl p-3 border border-white/10 bg-white/[0.02] flex flex-col items-center gap-2 text-center">
            <span class="material-symbols-outlined text-violet-400" style="font-size:24px">star</span>
            <p class="text-white font-bold text-xs">Conductores verificados</p>
          </div>
        </div>

        <!-- Seguridad -->
        <button (click)="openSecuritySettings()"
          class="flex items-center gap-4 px-5 py-4 rounded-2xl border border-rose-500/20 bg-rose-500/[0.03] hover:bg-rose-500/10 transition-all group w-full">
          <div class="w-10 h-10 rounded-xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
            <span class="material-symbols-outlined text-rose-400" style="font-size:20px">shield_person</span>
          </div>
          <div class="flex-1 text-left">
            <p class="text-white font-black text-sm">Seguridad del viaje</p>
            <p class="text-slate-500 text-xs">Contacto de emergencia · Foto de verificación · Pánico</p>
          </div>
          @if (agUser()?.selfie_verified) {
            <span class="flex items-center gap-1 px-2 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-[9px] font-black uppercase tracking-wider shrink-0">
              <span class="material-symbols-outlined" style="font-size:12px">verified</span> ID OK
            </span>
          } @else {
            <span class="text-[9px] text-rose-400 font-black uppercase tracking-wider shrink-0 px-2 py-1 rounded-full bg-rose-500/10 border border-rose-500/20">Configura</span>
          }
          <span class="material-symbols-outlined text-slate-600 shrink-0" style="font-size:18px">chevron_right</span>
        </button>
      }

      @if (activeRideRequest()) {
        <!-- Viaje activo -->
        <div class="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-5 flex flex-col gap-4">
          <div class="flex items-center justify-between">
            <p class="text-amber-400 font-black text-sm uppercase tracking-widest">Viaje activo</p>
            <span class="text-xs px-3 py-1 rounded-full font-black uppercase
              {{ activeRideRequest()?.status === 'accepted' || activeRideRequest()?.status === 'in_progress'
                ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400'
                : 'bg-amber-500/10 border border-amber-500/20 text-amber-400' }}">
              {{ activeRideRequest()?.status === 'pending' ? 'Buscando conductor' :
                 activeRideRequest()?.status === 'accepted' ? 'Conductor en camino' : 'En curso' }}
            </span>
          </div>
          <div class="flex flex-col gap-2">
            <div class="flex items-center gap-2 text-sm">
              <span class="material-symbols-outlined text-emerald-400" style="font-size:16px">trip_origin</span>
              <span class="text-slate-300 truncate">{{ activeRideRequest()?.origin_address }}</span>
            </div>
            <div class="flex items-center gap-2 text-sm">
              <span class="material-symbols-outlined text-rose-400" style="font-size:16px">location_on</span>
              <span class="text-slate-300 truncate">{{ activeRideRequest()?.dest_address }}</span>
            </div>
          </div>
          <button (click)="resumeActiveRide()"
            class="w-full py-3 rounded-xl font-black text-sm uppercase tracking-wider
              bg-gradient-to-r from-amber-500 to-orange-500 text-black hover:from-amber-400 hover:to-orange-400 transition-all">
            Retomar viaje
          </button>
        </div>
      }
    </div>
  }

  <!-- ═══════════════════ PASSENGER: PICK ORIGIN ═══════════════════ -->
  <!-- ═══════════════════ PASSENGER: PICK ORIGIN ═══════════════════ -->
  @if (screen() === 'passenger-pick-origin') {
    <div class="fixed inset-0 z-50 bg-black flex flex-col" style="padding:0;margin:0;max-width:none;width:100vw;left:0;right:0;top:0;bottom:0">
      <!-- Map fills everything -->
      <div id="ag-map-origin" class="absolute inset-0" style="z-index:1"></div>

      <!-- Top overlay: back + search -->
      <div class="absolute top-0 left-0 right-0 z-10 px-4 pt-12 pb-3 flex flex-col gap-3"
           style="background:linear-gradient(to bottom,rgba(0,0,0,0.85) 0%,rgba(0,0,0,0) 100%)">
        <div class="flex items-center gap-3">
          <button (click)="screen.set('passenger-home')" class="w-10 h-10 rounded-full bg-black/70 border border-white/15 flex items-center justify-center backdrop-blur-xl shrink-0">
            <span class="material-symbols-outlined text-white" style="font-size:20px">arrow_back</span>
          </button>
          <div class="flex-1 flex items-center gap-2 bg-black/70 border border-white/15 rounded-2xl px-4 py-2.5 backdrop-blur-xl">
            <span class="material-symbols-outlined text-slate-400" style="font-size:18px">search</span>
            <input type="text" [value]="placeSearchQuery()" (input)="onPlaceSearch($event, 'origin')"
              placeholder="Buscar dirección de origen..."
              class="flex-1 bg-transparent text-white text-sm placeholder:text-slate-500 focus:outline-none" />
            @if (placesLoading()) {
              <span class="material-symbols-outlined text-orange-400 animate-spin" style="font-size:16px">autorenew</span>
            }
          </div>
        </div>
        <!-- Autocomplete dropdown -->
        @if (placeSuggestions().length > 0) {
          <div class="bg-black/90 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden shadow-2xl mx-1">
            @for (s of placeSuggestions(); track s.id) {
              <button (click)="selectPlace(s, 'origin')"
                class="w-full flex items-start gap-3 px-4 py-3 hover:bg-white/5 transition-all text-left border-b border-white/[0.05] last:border-0">
                <span class="material-symbols-outlined text-orange-400 shrink-0 mt-0.5" style="font-size:16px">location_on</span>
                <div class="min-w-0">
                  <p class="text-white text-sm font-bold truncate">{{ s.name }}</p>
                  <p class="text-slate-500 text-xs truncate">{{ s.address }}</p>
                </div>
              </button>
            }
          </div>
        }
      </div>

      <!-- Center pin (stationary) -->
      <div class="absolute inset-0 flex items-center justify-center z-10 pointer-events-none" style="padding-bottom:160px">
        <div class="flex flex-col items-center">
          <svg width="42" height="56" viewBox="0 0 42 56" fill="none" xmlns="http://www.w3.org/2000/svg" style="filter:drop-shadow(0 4px 12px rgba(249,115,22,0.5))">
            <path d="M21 1C10.51 1 2 9.51 2 20c0 15.75 19 35 19 35s19-19.25 19-35C40 9.51 31.49 1 21 1z" fill="#f97316" stroke="white" stroke-width="2"/>
            <circle cx="21" cy="20" r="8" fill="white" opacity="0.95"/>
          </svg>
          <div style="width:10px;height:5px;background:rgba(0,0,0,0.35);border-radius:50%;margin-top:-2px"></div>
        </div>
      </div>

      <!-- Bottom card -->
      <div class="absolute bottom-0 left-0 right-0 z-10 bg-black/95 backdrop-blur-2xl border-t border-white/10 rounded-t-3xl px-5 pt-5 pb-8">
        <!-- Drag handle -->
        <div class="w-10 h-1 bg-white/20 rounded-full mx-auto mb-4"></div>

        <div class="flex items-start gap-3 mb-4">
          <div class="w-3 h-3 rounded-full bg-orange-500 mt-1 shrink-0 ring-2 ring-orange-500/30"></div>
          <div class="flex-1 min-w-0">
            <p class="text-[10px] text-slate-500 uppercase tracking-widest font-bold mb-1">Punto de Origen</p>
            @if (mapPickingAddress()) {
              <p class="text-white font-bold text-sm leading-snug">{{ mapPickingAddress() }}</p>
            } @else {
              <div class="flex flex-col gap-1.5">
                <div class="h-3.5 bg-white/10 rounded-lg animate-pulse w-4/5"></div>
                <div class="h-3 bg-white/5 rounded-lg animate-pulse w-3/5"></div>
              </div>
            }
          </div>
        </div>

        <button (click)="confirmOrigin()" [disabled]="!rideOrigin()"
          class="w-full py-4 rounded-2xl font-black text-base uppercase tracking-wider transition-all
            bg-gradient-to-r from-orange-500 to-amber-500 text-black hover:from-orange-400 hover:to-amber-400 disabled:opacity-40
            shadow-lg shadow-orange-500/25">
          <span class="flex items-center justify-center gap-2">
            <span class="material-symbols-outlined" style="font-size:20px">trip_origin</span>
            Confirmar Origen
          </span>
        </button>

        <button (click)="useCurrentLocationOrigin()" [disabled]="mapLoading()"
          class="w-full mt-3 flex items-center justify-center gap-2 py-3 rounded-2xl border border-cyan-500/30 bg-cyan-500/5 text-cyan-400 font-black text-sm hover:bg-cyan-500/10 transition-all disabled:opacity-40">
          @if (mapLoading()) {
            <span class="material-symbols-outlined animate-spin" style="font-size:16px">autorenew</span> Detectando...
          } @else {
            <span class="material-symbols-outlined" style="font-size:16px">my_location</span> Usar mi ubicación GPS
          }
        </button>
        @if (gpsError()) {
          <div class="mt-2 flex items-start gap-2 bg-rose-500/10 border border-rose-500/20 rounded-xl p-3">
            <span class="material-symbols-outlined text-rose-400 shrink-0 mt-0.5" style="font-size:15px">warning</span>
            <p class="text-rose-300 text-xs leading-relaxed">{{ gpsError() }}</p>
          </div>
        }
      </div>
    </div>
  }

  <!-- ═══════════════════ PASSENGER: PICK DEST ═══════════════════ -->
  @if (screen() === 'passenger-pick-dest') {
    <div class="fixed inset-0 z-50 bg-black flex flex-col" style="padding:0;margin:0;max-width:none;width:100vw;left:0;right:0;top:0;bottom:0">
      <!-- Map -->
      <div id="ag-map-dest" class="absolute inset-0" style="z-index:1"></div>

      <!-- Top overlay -->
      <div class="absolute top-0 left-0 right-0 z-10 px-4 pt-12 pb-3 flex flex-col gap-3"
           style="background:linear-gradient(to bottom,rgba(0,0,0,0.85) 0%,rgba(0,0,0,0) 100%)">
        <div class="flex items-center gap-3">
          <button (click)="goBackToOrigin()" class="w-10 h-10 rounded-full bg-black/70 border border-white/15 flex items-center justify-center backdrop-blur-xl shrink-0">
            <span class="material-symbols-outlined text-white" style="font-size:20px">arrow_back</span>
          </button>
          <div class="flex-1 flex items-center gap-2 bg-black/70 border border-white/15 rounded-2xl px-4 py-2.5 backdrop-blur-xl">
            <span class="material-symbols-outlined text-slate-400" style="font-size:18px">search</span>
            <input type="text" [value]="placeSearchQuery()" (input)="onPlaceSearch($event, 'dest')"
              placeholder="¿A dónde vas?"
              class="flex-1 bg-transparent text-white text-sm placeholder:text-slate-500 focus:outline-none" />
            @if (placesLoading()) {
              <span class="material-symbols-outlined text-rose-400 animate-spin" style="font-size:16px">autorenew</span>
            }
          </div>
        </div>
        @if (placeSuggestions().length > 0) {
          <div class="bg-black/90 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden shadow-2xl mx-1">
            @for (s of placeSuggestions(); track s.id) {
              <button (click)="selectPlace(s, 'dest')"
                class="w-full flex items-start gap-3 px-4 py-3 hover:bg-white/5 transition-all text-left border-b border-white/[0.05] last:border-0">
                <span class="material-symbols-outlined text-rose-400 shrink-0 mt-0.5" style="font-size:16px">location_on</span>
                <div class="min-w-0">
                  <p class="text-white text-sm font-bold truncate">{{ s.name }}</p>
                  <p class="text-slate-500 text-xs truncate">{{ s.address }}</p>
                </div>
              </button>
            }
          </div>
        }
      </div>

      <!-- Center pin (rose/red for destination) -->
      <div class="absolute inset-0 flex items-center justify-center z-10 pointer-events-none" style="padding-bottom:160px">
        <div class="flex flex-col items-center">
          <svg width="42" height="56" viewBox="0 0 42 56" fill="none" xmlns="http://www.w3.org/2000/svg" style="filter:drop-shadow(0 4px 12px rgba(239,68,68,0.5))">
            <path d="M21 1C10.51 1 2 9.51 2 20c0 15.75 19 35 19 35s19-19.25 19-35C40 9.51 31.49 1 21 1z" fill="#ef4444" stroke="white" stroke-width="2"/>
            <circle cx="21" cy="20" r="8" fill="white" opacity="0.95"/>
          </svg>
          <div style="width:10px;height:5px;background:rgba(0,0,0,0.35);border-radius:50%;margin-top:-2px"></div>
        </div>
      </div>

      <!-- Bottom card -->
      <div class="absolute bottom-0 left-0 right-0 z-10 bg-black/95 backdrop-blur-2xl border-t border-white/10 rounded-t-3xl px-5 pt-5 pb-8">
        <div class="w-10 h-1 bg-white/20 rounded-full mx-auto mb-4"></div>

        <!-- Route mini-summary -->
        @if (rideOrigin()) {
          <div class="flex items-center gap-3 px-4 py-3 rounded-xl bg-white/[0.03] border border-white/5 mb-4">
            <div class="flex flex-col items-center gap-1">
              <div class="w-2 h-2 rounded-full bg-orange-500"></div>
              <div class="w-px h-6 bg-white/15"></div>
              <div class="w-2 h-2 rounded-full bg-rose-500"></div>
            </div>
            <div class="flex-1 min-w-0 flex flex-col gap-2">
              <p class="text-slate-400 text-xs truncate">{{ rideOrigin()?.address }}</p>
              <div class="h-px bg-white/5"></div>
              @if (mapPickingAddress()) {
                <p class="text-white font-bold text-sm truncate">{{ mapPickingAddress() }}</p>
              } @else {
                <div class="h-3.5 bg-white/10 rounded-lg animate-pulse w-4/5"></div>
              }
            </div>
          </div>
        }

        <button (click)="confirmDest()" [disabled]="!rideDest()"
          class="w-full py-4 rounded-2xl font-black text-base uppercase tracking-wider transition-all
            bg-gradient-to-r from-rose-500 to-pink-500 text-white hover:from-rose-400 hover:to-pink-400 disabled:opacity-40
            shadow-lg shadow-rose-500/25">
          <span class="flex items-center justify-center gap-2">
            <span class="material-symbols-outlined" style="font-size:20px">flag</span>
            Confirmar Destino
          </span>
        </button>
      </div>
    </div>
  }

  <!-- ═══════════════════ PASSENGER: OFFER PRICE ═══════════════════ -->
  @if (screen() === 'passenger-offer') {
    <div class="w-full max-w-md flex flex-col gap-5">
      <!-- Steps -->
      <div class="flex items-center gap-2 justify-center">
        <div class="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-500/20 border border-emerald-500/40">
          <span class="w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center text-black font-black text-[10px]">✓</span>
          <span class="text-emerald-400 font-black text-xs">Origen</span>
        </div>
        <div class="flex-1 h-px bg-white/10 max-w-8"></div>
        <div class="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-500/20 border border-emerald-500/40">
          <span class="w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center text-black font-black text-[10px]">✓</span>
          <span class="text-emerald-400 font-black text-xs">Destino</span>
        </div>
        <div class="flex-1 h-px bg-white/10 max-w-8"></div>
        <div class="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-orange-500/20 border border-orange-500/40">
          <span class="w-5 h-5 rounded-full bg-orange-500 flex items-center justify-center text-black font-black text-[10px]">3</span>
          <span class="text-orange-400 font-black text-xs">Precio</span>
        </div>
      </div>

      <div class="text-center">
        <h2 class="text-xl font-black text-white">¿Cuánto ofreces?</h2>
        <p class="text-slate-500 text-sm mt-1">Los conductores cercanos recibirán tu oferta</p>
      </div>

      <!-- Ruta resumen -->
      <div class="bg-white/[0.02] border border-white/10 rounded-2xl p-4 flex flex-col gap-3">
        <div class="flex items-start gap-3">
          <div class="flex flex-col items-center gap-1 pt-1">
            <span class="w-3 h-3 rounded-full bg-emerald-500 shrink-0"></span>
            <span class="w-px flex-1 bg-white/20" style="min-height:24px"></span>
            <span class="w-3 h-3 rounded-full bg-rose-500 shrink-0"></span>
          </div>
          <div class="flex-1 flex flex-col gap-4">
            <div>
              <p class="text-[10px] text-slate-500 uppercase tracking-widest">Origen</p>
              <p class="text-white text-sm font-bold leading-tight">{{ rideOrigin()?.address }}</p>
            </div>
            <div>
              <p class="text-[10px] text-slate-500 uppercase tracking-widest">Destino</p>
              <p class="text-white text-sm font-bold leading-tight">{{ rideDest()?.address }}</p>
            </div>
          </div>
        </div>
      </div>

      <!-- Route info from Mapbox -->
      @if (routeInfo()) {
        <div class="flex items-center gap-0 rounded-2xl border border-cyan-500/20 bg-cyan-500/[0.03] overflow-hidden">
          <div class="flex-1 flex flex-col items-center gap-1 py-3 px-4 border-r border-cyan-500/10">
            <span class="material-symbols-outlined text-cyan-400" style="font-size:20px">route</span>
            <p class="text-white font-black text-base">{{ routeInfo()!.distance_km | number:'1.1-1' }} km</p>
            <p class="text-slate-500 text-[10px] uppercase tracking-widest">Distancia</p>
          </div>
          <div class="flex-1 flex flex-col items-center gap-1 py-3 px-4 border-r border-cyan-500/10">
            <span class="material-symbols-outlined text-amber-400" style="font-size:20px">schedule</span>
            <p class="text-white font-black text-base">~{{ routeInfo()!.duration_min }} min</p>
            <p class="text-slate-500 text-[10px] uppercase tracking-widest">Estimado</p>
          </div>
          <div class="flex-1 flex flex-col items-center gap-1 py-3 px-4">
            <span class="material-symbols-outlined text-emerald-400" style="font-size:20px">price_check</span>
            <p class="text-emerald-400 font-black text-base">\${{ routeInfo()!.suggested_price | number:'1.0-0' }}</p>
            <p class="text-slate-500 text-[10px] uppercase tracking-widest">Sugerido</p>
          </div>
        </div>
      } @else {
        <div class="flex items-center gap-2 px-4 py-3 rounded-xl bg-white/[0.02] border border-white/5">
          <span class="material-symbols-outlined text-slate-600 animate-spin" style="font-size:16px">autorenew</span>
          <p class="text-slate-600 text-xs">Calculando ruta y precio sugerido...</p>
        </div>
      }

      <!-- Precio -->
      <div class="bg-white/[0.02] border border-white/10 rounded-2xl p-5 flex flex-col gap-4">
        <label class="block text-[10px] text-slate-400 uppercase tracking-widest font-bold">Tu oferta en pesos (COP)</label>
        <div class="flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl px-4 py-3 focus-within:border-orange-500/50 transition-all">
          <span class="text-orange-400 font-black text-lg">$</span>
          <input type="number" min="0" [value]="offeredPrice()" (input)="offeredPrice.set($any($event.target).value)"
            placeholder="15000"
            class="flex-1 bg-transparent text-white text-xl font-black placeholder:text-slate-600 focus:outline-none" />
          <span class="text-slate-500 text-sm">COP</span>
        </div>
        <div class="grid grid-cols-3 gap-2">
          @for (p of quickPrices; track p) {
            <button (click)="offeredPrice.set(p.toString())"
              class="py-2 rounded-xl border font-black text-sm transition-all
                {{ offeredPrice() === p.toString()
                  ? 'border-orange-500/60 bg-orange-500/15 text-orange-400'
                  : 'border-white/10 bg-white/[0.02] text-slate-400 hover:border-orange-500/30 hover:text-orange-300' }}">
              ${'$'}{{ p | number }}
            </button>
          }
        </div>
      </div>

      @if (error()) {
        <p class="text-rose-400 text-xs flex items-center gap-1">
          <span class="material-symbols-outlined" style="font-size:14px">error</span> {{ error() }}
        </p>
      }

      <div class="flex gap-3">
        <button (click)="screen.set('passenger-pick-dest')"
          class="flex-1 py-3 rounded-xl border border-white/10 text-slate-400 font-black text-sm hover:bg-white/5 transition-all">
          ← Volver
        </button>
        <button (click)="sendRideRequest()" [disabled]="loading() || !offeredPrice() || +offeredPrice() <= 0"
          class="flex-[2] py-3 rounded-xl font-black text-sm uppercase tracking-wider transition-all
            bg-gradient-to-r from-orange-500 to-amber-500 text-black hover:from-orange-400 hover:to-amber-400 disabled:opacity-40">
          @if (loading()) {
            <span class="material-symbols-outlined animate-spin" style="font-size:16px">autorenew</span>
          } @else {
            <span class="flex items-center justify-center gap-2">
              <span class="material-symbols-outlined" style="font-size:16px">search</span>
              Buscar conductor
            </span>
          }
        </button>
      </div>
    </div>
  }

  <!-- ═══════════════════ PASSENGER: SEARCHING ═══════════════════ -->
  @if (screen() === 'passenger-searching') {
    <div class="w-full max-w-md flex flex-col items-center gap-6">
      <div class="text-center">
        <div class="w-24 h-24 rounded-full bg-orange-500/10 border-2 border-orange-500/30 flex items-center justify-center mx-auto mb-4 relative">
          <div class="absolute inset-0 rounded-full border-2 border-orange-400/40 animate-ping"></div>
          <span class="material-symbols-outlined text-orange-400" style="font-size:40px">directions_car</span>
        </div>
        <h2 class="text-xl font-black text-white">Buscando conductor...</h2>
        <p class="text-slate-500 text-sm mt-1">Tu oferta fue enviada a los conductores cercanos</p>
      </div>

      <!-- Detalles del viaje -->
      <div class="w-full bg-white/[0.02] border border-white/10 rounded-2xl p-5 flex flex-col gap-3">
        <div class="flex items-center gap-2 text-sm">
          <span class="material-symbols-outlined text-emerald-400 shrink-0" style="font-size:16px">trip_origin</span>
          <span class="text-slate-300 truncate">{{ activeRideRequest()?.origin_address }}</span>
        </div>
        <div class="flex items-center gap-2 text-sm">
          <span class="material-symbols-outlined text-rose-400 shrink-0" style="font-size:16px">location_on</span>
          <span class="text-slate-300 truncate">{{ activeRideRequest()?.dest_address }}</span>
        </div>
        <div class="flex items-center gap-2 text-sm border-t border-white/10 pt-3 mt-1">
          <span class="material-symbols-outlined text-amber-400 shrink-0" style="font-size:16px">payments</span>
          <span class="text-white font-black">Tu oferta: ${'$'}{{ activeRideRequest()?.offered_price | number }} COP</span>
        </div>
      </div>

      <!-- Contador -->
      <div class="flex flex-col items-center gap-2">
        <div class="w-16 h-16 rounded-full border-2 border-amber-500/40 flex items-center justify-center">
          <span class="text-amber-400 font-black text-lg">{{ searchTimerDisplay() }}</span>
        </div>
        <p class="text-slate-500 text-xs">Tiempo restante</p>
      </div>

      <button (click)="cancelRide()" [disabled]="loading()"
        class="w-full py-3 rounded-xl border border-rose-500/30 bg-rose-500/5 text-rose-400 font-black text-sm hover:bg-rose-500/10 transition-all disabled:opacity-40">
        <span class="flex items-center justify-center gap-2">
          <span class="material-symbols-outlined" style="font-size:16px">cancel</span>
          Cancelar solicitud
        </span>
      </button>
    </div>
  }

  <!-- ═══════════════════ PASSENGER: TRIP IN PROGRESS ═══════════════════ -->
  @if (screen() === 'passenger-trip') {
    <div class="w-full max-w-2xl flex flex-col gap-4">
      <!-- Driver info -->
      <div class="flex items-center gap-4 px-5 py-4 rounded-2xl bg-gradient-to-r from-emerald-500/10 to-cyan-500/5 border border-emerald-500/20">
        <div class="w-14 h-14 rounded-full bg-emerald-500/20 border-2 border-emerald-500/40 flex items-center justify-center shrink-0 overflow-hidden">
          @if (activeRideRequest()?.driver?.ag_user?.avatar_url) {
            <img [src]="activeRideRequest()?.driver?.ag_user?.avatar_url" class="w-full h-full object-cover" alt="conductor" />
          } @else {
            <span class="material-symbols-outlined text-emerald-400" style="font-size:28px">person</span>
          }
        </div>
        <div class="flex-1 min-w-0">
          <p class="text-[10px] text-emerald-400 uppercase tracking-widest font-black">
            {{ activeRideRequest()?.status === 'accepted' ? 'Conductor en camino' : 'Viaje en curso' }}
          </p>
          <p class="text-white font-black text-base truncate">{{ activeRideRequest()?.driver?.ag_user?.full_name }}</p>
          <p class="text-slate-400 text-xs truncate">
            {{ activeRideRequest()?.driver?.vehicle_brand }} {{ activeRideRequest()?.driver?.vehicle_model }}
            · <span class="font-black text-white">{{ activeRideRequest()?.driver?.vehicle_plate }}</span>
          </p>
        </div>
        <div class="flex flex-col items-end gap-1 shrink-0">
          <span class="text-emerald-400 font-black text-xl">${'$'}{{ activeRideRequest()?.offered_price | number }}</span>
          <span class="text-[10px] text-slate-500">COP · efectivo</span>
        </div>
      </div>

      <!-- Pestañas: Mapa / Chat -->
      <div class="flex bg-white/[0.02] border border-white/10 rounded-xl p-1 gap-1">
        <button (click)="tripTab.set('map')"
          [class]="'flex-1 py-2 rounded-lg font-black text-xs uppercase tracking-wider transition-all ' +
            (tripTab() === 'map' ? 'bg-white/10 text-white' : 'text-slate-500 hover:text-white')">
          <span class="flex items-center justify-center gap-1.5">
            <span class="material-symbols-outlined" style="font-size:14px">map</span> Mapa
          </span>
        </button>
        <button (click)="tripTab.set('chat'); loadChat()"
          [class]="'flex-1 py-2 rounded-lg font-black text-xs uppercase tracking-wider transition-all relative ' +
            (tripTab() === 'chat' ? 'bg-white/10 text-white' : 'text-slate-500 hover:text-white')">
          <span class="flex items-center justify-center gap-1.5">
            <span class="material-symbols-outlined" style="font-size:14px">chat</span> Chat
          </span>
        </button>
      </div>

      <!-- Mapa del viaje -->
      @if (tripTab() === 'map') {
        <div id="ag-map-trip" class="overflow-hidden border border-white/5 bg-zinc-900 w-full" style="height:420px;border-radius:20px"></div>

        <!-- Real-time GPS indicator -->
        <div class="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-white/[0.02] border border-white/5">
          @if (driverLatLng()) {
            <span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0"></span>
            <p class="text-emerald-400 text-xs font-bold">Conductor en movimiento · GPS activo</p>
            <span class="ml-auto text-slate-600 text-[10px] font-mono">{{ driverLatLng()!.lat | number:'1.4-4' }}, {{ driverLatLng()!.lng | number:'1.4-4' }}</span>
          } @else {
            <span class="w-2 h-2 rounded-full bg-slate-600 shrink-0"></span>
            <p class="text-slate-600 text-xs">Esperando señal GPS del conductor...</p>
          }
        </div>

        <!-- Llamada protegida -->
        <div class="flex items-center gap-3 px-4 py-3 rounded-xl bg-white/[0.02] border border-white/10">
          <span class="material-symbols-outlined text-cyan-400" style="font-size:20px">phone_locked</span>
          <div class="flex-1">
            <p class="text-white font-bold text-sm">Llamada protegida</p>
            <p class="text-slate-500 text-xs">Los números permanecen ocultos</p>
          </div>
          <a [href]="'tel:' + activeRideRequest()?.driver?.ag_user?.phone"
            class="flex items-center gap-2 px-4 py-2 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 font-black text-sm hover:bg-cyan-500/20 transition-all">
            <span class="material-symbols-outlined" style="font-size:16px">call</span>
            Llamar
          </a>
        </div>

        <!-- Compartir viaje (WhatsApp) -->
        <button (click)="shareTrip()"
          class="flex items-center gap-3 px-4 py-3 rounded-xl bg-[#25d366]/10 border border-[#25d366]/30 hover:bg-[#25d366]/20 transition-all w-full">
          <span class="material-symbols-outlined text-[#25d366]" style="font-size:20px">share</span>
          <div class="flex-1 text-left">
            <p class="text-white font-bold text-sm">Compartir viaje</p>
            <p class="text-slate-500 text-xs">Envía tu recorrido por WhatsApp</p>
          </div>
          <span class="text-[#25d366] font-black text-xs">WhatsApp</span>
        </button>

        <!-- Botón de pánico -->
        <button (click)="triggerPanic()"
          [disabled]="panicSent()"
          class="flex items-center gap-3 px-4 py-3 rounded-xl border transition-all w-full
            {{ panicSent()
              ? 'bg-emerald-500/10 border-emerald-500/20 cursor-default'
              : 'bg-rose-500/10 border-rose-500/30 hover:bg-rose-500/20 active:scale-95' }}">
          @if (panicSent()) {
            <span class="material-symbols-outlined text-emerald-400" style="font-size:20px">check_circle</span>
            <div class="flex-1 text-left">
              <p class="text-emerald-400 font-black text-sm">Alerta enviada</p>
              <p class="text-slate-500 text-xs">Tu contacto de emergencia fue notificado</p>
            </div>
          } @else {
            <span class="material-symbols-outlined text-rose-400 animate-pulse" style="font-size:20px">emergency</span>
            <div class="flex-1 text-left">
              <p class="text-rose-400 font-black text-sm">Botón de Pánico</p>
              <p class="text-slate-500 text-xs">Alerta inmediata a tu contacto de emergencia</p>
            </div>
            <span class="text-rose-400 font-black text-xs uppercase tracking-wider px-3 py-1.5 rounded-lg bg-rose-500/15 border border-rose-500/20">SOS</span>
          }
        </button>
      }

      <!-- Chat -->
      @if (tripTab() === 'chat') {
        <div class="flex flex-col gap-3">
          <div class="h-64 overflow-y-auto flex flex-col gap-2 p-3 rounded-xl bg-white/[0.02] border border-white/10" #chatBox>
            @if (chatMessages().length === 0) {
              <div class="flex-1 flex items-center justify-center">
                <p class="text-slate-600 text-sm">Inicia la conversación con tu conductor</p>
              </div>
            }
            @for (msg of chatMessages(); track msg.id) {
              <div [class]="'flex ' + (msg.sender_ag_user_id === agUser()?.id ? 'justify-end' : 'justify-start')">
                <div [class]="'max-w-[75%] px-3 py-2 rounded-xl text-sm leading-relaxed ' +
                  (msg.sender_ag_user_id === agUser()?.id
                    ? 'bg-orange-500/20 border border-orange-500/20 text-white rounded-br-none'
                    : 'bg-white/5 border border-white/10 text-slate-300 rounded-bl-none')">
                  {{ msg.message }}
                </div>
              </div>
            }
          </div>

          <div class="flex gap-2">
            <input type="text" [value]="chatInput()" (input)="chatInput.set($any($event.target).value)"
              (keydown.enter)="sendChat()"
              placeholder="Escribe un mensaje..."
              class="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder:text-slate-600 focus:outline-none focus:border-orange-500/50 transition-all" />
            <button (click)="sendChat()" [disabled]="!chatInput().trim()"
              class="w-12 h-12 rounded-xl bg-orange-500/15 border border-orange-500/30 flex items-center justify-center text-orange-400 hover:bg-orange-500/25 transition-all disabled:opacity-40">
              <span class="material-symbols-outlined" style="font-size:20px">send</span>
            </button>
          </div>
        </div>
      }

      <!-- Finalizar viaje (solo si está en progreso) -->
      @if (activeRideRequest()?.status === 'in_progress') {
        <button (click)="finishTrip()"
          class="w-full py-3 rounded-xl font-black text-sm uppercase tracking-wider transition-all
            bg-gradient-to-r from-emerald-500 to-cyan-500 text-black hover:from-emerald-400 hover:to-cyan-400">
          <span class="flex items-center justify-center gap-2">
            <span class="material-symbols-outlined" style="font-size:16px">check_circle</span>
            He llegado a mi destino
          </span>
        </button>
      }
    </div>
  }

  <!-- ═══════════════════ PASSENGER: RATING ═══════════════════ -->
  @if (screen() === 'passenger-rating') {
    <div class="w-full max-w-md flex flex-col items-center gap-6">
      <div class="text-center">
        <div class="w-20 h-20 rounded-full bg-amber-500/20 border-2 border-amber-500/40 flex items-center justify-center mx-auto mb-4 overflow-hidden">
          @if (activeRideRequest()?.driver?.ag_user?.avatar_url) {
            <img [src]="activeRideRequest()?.driver?.ag_user?.avatar_url" class="w-full h-full object-cover" alt="conductor" />
          } @else {
            <span class="material-symbols-outlined text-amber-400" style="font-size:36px">person</span>
          }
        </div>
        <h2 class="text-xl font-black text-white">¿Cómo fue tu viaje?</h2>
        <p class="text-slate-400 text-sm mt-1">Con {{ activeRideRequest()?.driver?.ag_user?.full_name }}</p>
      </div>

      <!-- Estrellas -->
      <div class="flex gap-3">
        @for (s of [1,2,3,4,5]; track s) {
          <button (click)="ratingStars.set(s)"
            class="transition-all hover:scale-110">
            <span class="material-symbols-outlined text-4xl transition-colors"
              [style.color]="ratingStars() >= s ? '#f59e0b' : '#334155'">
              {{ ratingStars() >= s ? 'star' : 'star_border' }}
            </span>
          </button>
        }
      </div>
      @if (ratingStars() > 0) {
        <p class="text-amber-400 font-black text-sm">
          {{ ratingStars() === 1 ? 'Muy malo' : ratingStars() === 2 ? 'Malo' : ratingStars() === 3 ? 'Regular' : ratingStars() === 4 ? 'Bueno' : 'Excelente' }}
        </p>
      }

      <!-- Comentario -->
      <div class="w-full">
        <textarea [value]="ratingComment()" (input)="ratingComment.set($any($event.target).value)"
          placeholder="Comentario opcional..."
          rows="3"
          class="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder:text-slate-600 focus:outline-none focus:border-amber-500/50 transition-all resize-none"></textarea>
      </div>

      @if (error()) {
        <p class="text-rose-400 text-xs flex items-center gap-1">
          <span class="material-symbols-outlined" style="font-size:14px">error</span> {{ error() }}
        </p>
      }

      <div class="flex flex-col gap-3 w-full">
        <button (click)="submitRating()" [disabled]="loading() || ratingStars() === 0"
          class="w-full py-3 rounded-xl font-black text-sm uppercase tracking-wider transition-all
            bg-gradient-to-r from-amber-500 to-orange-500 text-black hover:from-amber-400 hover:to-orange-400 disabled:opacity-40">
          @if (loading()) {
            <span class="material-symbols-outlined animate-spin" style="font-size:16px">autorenew</span>
          } @else {
            Enviar calificación
          }
        </button>
        <button (click)="skipRating()" class="text-slate-500 text-xs text-center hover:text-slate-300 transition-colors">
          Omitir por ahora
        </button>
      </div>
    </div>
  }

  <!-- ═══════════════════ DRIVER HOME ═══════════════════ -->
  @if (screen() === 'driver-home') {
    <div class="w-full max-w-3xl flex flex-col gap-5">

      <!-- Header conductor + toggle disponible -->
      <div class="flex items-center gap-4 px-5 py-4 rounded-2xl bg-gradient-to-r from-amber-500/10 to-orange-500/5 border border-amber-500/20">
        <div class="w-12 h-12 rounded-2xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center shrink-0">
          <span class="material-symbols-outlined text-amber-400" style="font-size:24px">directions_car</span>
        </div>
        <div class="flex-1 min-w-0">
          <p class="text-[10px] text-amber-400 uppercase tracking-widest font-black">Conductor Verificado</p>
          <p class="text-white font-black text-base truncate">{{ agUser()?.full_name }}</p>
          <p class="text-slate-500 text-xs truncate">{{ agUser()?.driver?.vehicle_brand }} {{ agUser()?.driver?.vehicle_model }} · {{ agUser()?.driver?.vehicle_plate }}</p>
        </div>
        <!-- Toggle disponible/no disponible -->
        <button (click)="toggleDriverAvailability()"
          [class]="'flex flex-col items-center gap-1 px-3 py-2 rounded-xl border transition-all shrink-0 ' +
            (driverAvailable()
              ? 'bg-emerald-500/15 border-emerald-500/40 hover:bg-emerald-500/25'
              : 'bg-white/5 border-white/10 hover:bg-white/10')">
          <span class="material-symbols-outlined text-lg"
            [style.color]="driverAvailable() ? '#22c55e' : '#64748b'">
            {{ driverAvailable() ? 'toggle_on' : 'toggle_off' }}
          </span>
          <span class="text-[9px] font-black uppercase tracking-wider"
            [style.color]="driverAvailable() ? '#22c55e' : '#64748b'">
            {{ driverAvailable() ? 'En línea' : 'Offline' }}
          </span>
        </button>
      </div>

      <!-- CTA Buscar solicitudes (cuando está disponible) -->
      @if (driverAvailable()) {
        <button (click)="openDriverRequests()"
          class="w-full flex items-center gap-4 px-5 py-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/5 hover:bg-emerald-500/10 transition-all group">
          <div class="w-12 h-12 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
            <span class="material-symbols-outlined text-emerald-400" style="font-size:24px">search_activity</span>
          </div>
          <div class="flex-1 text-left">
            <p class="text-emerald-400 font-black text-sm">Buscar solicitudes cercanas</p>
            <p class="text-slate-500 text-xs">Ver pasajeros que necesitan transporte ahora</p>
          </div>
          <span class="material-symbols-outlined text-slate-500 group-hover:text-emerald-400 transition-colors">chevron_right</span>
        </button>
      } @else {
        <div class="flex items-center gap-3 px-4 py-3 rounded-xl border border-white/10 bg-white/[0.02]">
          <span class="material-symbols-outlined text-slate-600" style="font-size:20px">bedtime</span>
          <p class="text-slate-500 text-sm">Activa el modo <span class="text-white font-bold">En línea</span> para recibir solicitudes de viaje</p>
        </div>
      }

      <!-- Filtro de período -->
      <div class="flex items-center gap-2">
        <div class="flex flex-1 gap-1 bg-white/[0.02] border border-white/10 rounded-xl p-1">
          @for (f of tripFilters; track f.key) {
            <button (click)="tripsFilter.set(f.key); loadTrips()"
              [class]="tripsFilter() === f.key
                ? 'flex-1 py-2 rounded-lg text-xs font-black bg-amber-500 text-black transition-all'
                : 'flex-1 py-2 rounded-lg text-xs font-bold text-slate-400 hover:text-white transition-all'">
              {{ f.label }}
            </button>
          }
        </div>
        <button (click)="showTripForm.set(true)"
          class="flex items-center gap-1 px-3 py-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-400 font-black text-xs hover:bg-amber-500/20 transition-all shrink-0">
          <span class="material-symbols-outlined" style="font-size:16px">add</span>
          Manual
        </button>
      </div>

      <!-- Stats de ganancias -->
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div class="rounded-xl p-4 border border-white/10 bg-white/[0.02] flex flex-col gap-1">
          <p class="text-[9px] text-slate-500 uppercase tracking-widest font-bold">Viajes</p>
          <p class="text-2xl font-black text-white">{{ filteredTrips().length }}</p>
        </div>
        <div class="rounded-xl p-4 border border-white/10 bg-white/[0.02] flex flex-col gap-1">
          <p class="text-[9px] text-slate-500 uppercase tracking-widest font-bold">Total Cobrado</p>
          <p class="text-xl font-black text-white">\${{ totalCharged() | number:'1.0-0' }}</p>
          <p class="text-[9px] text-slate-600">COP</p>
        </div>
        <div class="rounded-xl p-4 border border-rose-500/20 bg-rose-500/5 flex flex-col gap-1">
          <p class="text-[9px] text-rose-400 uppercase tracking-widest font-bold">Comisión 15%</p>
          <p class="text-xl font-black text-rose-400">-\${{ totalCommission() | number:'1.0-0' }}</p>
          <p class="text-[9px] text-rose-700">Plataforma</p>
        </div>
        <div class="rounded-xl p-4 border border-emerald-500/20 bg-emerald-500/5 flex flex-col gap-1">
          <p class="text-[9px] text-emerald-400 uppercase tracking-widest font-bold">Tu Ganancia</p>
          <p class="text-xl font-black text-emerald-400">\${{ totalEarnings() | number:'1.0-0' }}</p>
          <p class="text-[9px] text-emerald-700">85% del cobro</p>
        </div>
      </div>

      <!-- Acceso rápido a billetera -->
      <button (click)="openEarnings()"
        class="w-full flex items-center gap-4 px-5 py-4 rounded-2xl border border-emerald-500/20 bg-gradient-to-r from-emerald-500/5 to-transparent hover:from-emerald-500/10 transition-all group">
        <div class="flex flex-col items-start flex-1 min-w-0">
          <p class="text-[10px] text-emerald-400 uppercase tracking-widest font-black">Ganancia total</p>
          <p class="text-2xl font-black text-white">\${{ earningsSummary().all.earnings | number:'1.0-0' }}<span class="text-sm text-slate-500 font-normal ml-1">COP</span></p>
          <p class="text-xs text-slate-500 mt-0.5">{{ earningsSummary().all.count }} viajes registrados</p>
        </div>
        <div class="flex flex-col items-end gap-1 shrink-0">
          <span class="material-symbols-outlined text-emerald-400 group-hover:translate-x-1 transition-transform" style="font-size:24px">account_balance_wallet</span>
          <span class="text-[10px] text-emerald-400 font-black">Ver billetera →</span>
        </div>
      </button>

      <!-- Historial de viajes -->
      <div>
        <div class="flex items-center justify-between mb-3">
          <p class="text-[10px] text-slate-500 uppercase tracking-widest font-black">Historial de Viajes</p>
          <button (click)="openEarnings()" class="text-[10px] text-emerald-400 font-black hover:underline">Ver ganancias →</button>
        </div>

        @if (tripsLoading()) {
          <div class="flex items-center justify-center py-10">
            <span class="material-symbols-outlined text-slate-600 animate-spin" style="font-size:28px">autorenew</span>
          </div>
        } @else if (filteredTrips().length === 0) {
          <div class="flex flex-col items-center py-10 gap-2 text-center border border-white/10 rounded-xl bg-white/[0.02]">
            <span class="material-symbols-outlined text-slate-600" style="font-size:36px">route</span>
            <p class="text-slate-500 text-sm">No hay viajes en este período</p>
            @if (driverAvailable()) {
              <button (click)="openDriverRequests()"
                class="mt-2 px-4 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-black uppercase tracking-wider hover:bg-emerald-500/20 transition-all">
                Buscar solicitudes
              </button>
            }
          </div>
        } @else {
          <div class="flex flex-col gap-2">
            @for (trip of filteredTrips(); track trip.id) {
              <div class="flex flex-col sm:flex-row sm:items-center gap-3 px-4 py-3 rounded-xl border border-white/10 bg-white/[0.02] hover:border-white/20 transition-all">
                <!-- Ruta -->
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2 mb-1">
                    <span class="material-symbols-outlined text-emerald-400" style="font-size:14px">trip_origin</span>
                    <p class="text-white font-bold text-sm truncate">{{ trip.origin }}</p>
                  </div>
                  <div class="flex items-center gap-2">
                    <span class="material-symbols-outlined text-rose-400" style="font-size:14px">location_on</span>
                    <p class="text-slate-400 text-sm truncate">{{ trip.destination }}</p>
                  </div>
                  <div class="flex items-center gap-3 mt-1.5 flex-wrap">
                    @if (trip.passenger_name) {
                      <span class="text-[10px] text-slate-500 flex items-center gap-0.5">
                        <span class="material-symbols-outlined" style="font-size:11px">person</span> {{ trip.passenger_name }}
                      </span>
                    }
                    @if (trip.distance_km) {
                      <span class="text-[10px] text-slate-500">{{ trip.distance_km }} km</span>
                    }
                    @if (trip.duration_minutes) {
                      <span class="text-[10px] text-slate-500">{{ trip.duration_minutes }} min</span>
                    }
                    <span class="text-[10px] text-slate-600">{{ trip.trip_date | date:'d MMM · h:mm a' }}</span>
                  </div>
                </div>

                <!-- Montos -->
                <div class="flex sm:flex-col items-center sm:items-end gap-3 sm:gap-0.5 shrink-0">
                  <div class="text-right">
                    <p class="text-[9px] text-slate-500 uppercase">Cobrado</p>
                    <p class="text-white font-black text-base">\${{ trip.total_amount | number:'1.0-0' }}</p>
                  </div>
                  <div class="text-right">
                    <p class="text-[9px] text-rose-500 uppercase">Comisión</p>
                    <p class="text-rose-400 font-bold text-sm">-\${{ trip.platform_commission | number:'1.0-0' }}</p>
                  </div>
                  <div class="text-right">
                    <p class="text-[9px] text-emerald-500 uppercase">Ganancia</p>
                    <p class="text-emerald-400 font-black text-base">\${{ trip.driver_earnings | number:'1.0-0' }}</p>
                  </div>
                </div>
              </div>
            }
          </div>
        }
      </div>
    </div>

    <!-- Modal Nuevo Viaje -->
    @if (showTripForm()) {
      <div class="fixed inset-0 z-[80] flex items-end sm:items-center justify-center p-0 sm:p-4" (click)="showTripForm.set(false)">
        <div class="absolute inset-0 bg-black/80 backdrop-blur-sm"></div>
        <div class="relative z-10 w-full max-w-md rounded-t-2xl sm:rounded-2xl bg-[#0d0d0d] border border-amber-500/20 overflow-hidden" (click)="$event.stopPropagation()">

          <!-- Header modal -->
          <div class="flex items-center justify-between px-5 py-4 border-b border-white/10">
            <div class="flex items-center gap-3">
              <div class="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
                <span class="material-symbols-outlined text-amber-400" style="font-size:18px">add_road</span>
              </div>
              <p class="text-white font-black text-sm">Registrar Viaje</p>
            </div>
            <button (click)="showTripForm.set(false)" class="text-slate-500 hover:text-white transition-colors">
              <span class="material-symbols-outlined" style="font-size:20px">close</span>
            </button>
          </div>

          <!-- Formulario -->
          <div class="px-5 py-5 flex flex-col gap-4">
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block text-[9px] text-slate-400 uppercase tracking-widest mb-1 font-bold">Origen</label>
                <input type="text" [value]="tripOrigin()" (input)="tripOrigin.set($any($event.target).value)"
                  placeholder="Barrio / Dirección"
                  class="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm placeholder:text-slate-600 focus:outline-none focus:border-emerald-500/50 transition-all" />
              </div>
              <div>
                <label class="block text-[9px] text-slate-400 uppercase tracking-widest mb-1 font-bold">Destino</label>
                <input type="text" [value]="tripDestination()" (input)="tripDestination.set($any($event.target).value)"
                  placeholder="Barrio / Dirección"
                  class="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm placeholder:text-slate-600 focus:outline-none focus:border-rose-500/50 transition-all" />
              </div>
            </div>

            <div>
              <label class="block text-[9px] text-slate-400 uppercase tracking-widest mb-1 font-bold">Total Cobrado al Pasajero (COP)</label>
              <input type="number" [value]="tripAmount()" (input)="tripAmount.set($any($event.target).value)"
                placeholder="Ej: 15000" min="0"
                class="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm placeholder:text-slate-600 focus:outline-none focus:border-amber-500/50 transition-all" />
            </div>

            <!-- Preview de comisión en tiempo real -->
            @if (tripAmount() && +tripAmount() > 0) {
              <div class="grid grid-cols-3 gap-2">
                <div class="rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-center">
                  <p class="text-[9px] text-slate-500 uppercase">Cobrado</p>
                  <p class="text-white font-black text-sm">\${{ +tripAmount() | number:'1.0-0' }}</p>
                </div>
                <div class="rounded-lg bg-rose-500/8 border border-rose-500/20 px-3 py-2 text-center">
                  <p class="text-[9px] text-rose-500 uppercase">Comisión 15%</p>
                  <p class="text-rose-400 font-black text-sm">-\${{ +tripAmount() * 0.15 | number:'1.0-0' }}</p>
                </div>
                <div class="rounded-lg bg-emerald-500/8 border border-emerald-500/20 px-3 py-2 text-center">
                  <p class="text-[9px] text-emerald-500 uppercase">Tu ganancia</p>
                  <p class="text-emerald-400 font-black text-sm">\${{ +tripAmount() * 0.85 | number:'1.0-0' }}</p>
                </div>
              </div>
            }

            <div class="grid grid-cols-3 gap-3">
              <div>
                <label class="block text-[9px] text-slate-400 uppercase tracking-widest mb-1 font-bold">Pasajero</label>
                <input type="text" [value]="tripPassengerName()" (input)="tripPassengerName.set($any($event.target).value)"
                  placeholder="Nombre (opcional)"
                  class="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm placeholder:text-slate-600 focus:outline-none focus:border-white/20 transition-all" />
              </div>
              <div>
                <label class="block text-[9px] text-slate-400 uppercase tracking-widest mb-1 font-bold">Km</label>
                <input type="number" [value]="tripDistanceKm()" (input)="tripDistanceKm.set($any($event.target).value)"
                  placeholder="0" min="0"
                  class="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm placeholder:text-slate-600 focus:outline-none focus:border-white/20 transition-all" />
              </div>
              <div>
                <label class="block text-[9px] text-slate-400 uppercase tracking-widest mb-1 font-bold">Minutos</label>
                <input type="number" [value]="tripDuration()" (input)="tripDuration.set($any($event.target).value)"
                  placeholder="0" min="0"
                  class="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm placeholder:text-slate-600 focus:outline-none focus:border-white/20 transition-all" />
              </div>
            </div>

            @if (tripError()) {
              <p class="text-rose-400 text-xs flex items-center gap-1">
                <span class="material-symbols-outlined" style="font-size:14px">error</span> {{ tripError() }}
              </p>
            }

            <button (click)="saveTrip()" [disabled]="savingTrip() || !tripOrigin().trim() || !tripDestination().trim() || !tripAmount() || +tripAmount() <= 0"
              class="w-full py-3 rounded-xl font-black text-sm uppercase tracking-widest transition-all
                bg-gradient-to-r from-amber-500 to-orange-500 text-black hover:from-amber-400 hover:to-orange-400 disabled:opacity-40">
              @if (savingTrip()) {
                <span class="material-symbols-outlined animate-spin" style="font-size:16px">autorenew</span>
              } @else {
                Registrar Viaje
              }
            </button>
          </div>
        </div>
      </div>
    }
  }

  <!-- ═══════════════════ DRIVER: EARNINGS / BILLETERA ═══════════════════ -->
  @if (screen() === 'driver-earnings') {
    <div class="w-full max-w-2xl flex flex-col gap-5">

      <!-- Header -->
      <div class="flex items-center gap-3">
        <button (click)="screen.set('driver-home')"
          class="w-9 h-9 rounded-xl border border-white/10 flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/5 transition-all">
          <span class="material-symbols-outlined" style="font-size:18px">arrow_back</span>
        </button>
        <div>
          <h2 class="text-base font-black text-white">Mi Billetera</h2>
          <p class="text-xs text-slate-500">Ganancias · Comisiones · Historial</p>
        </div>
      </div>

      <!-- Tarjeta balance total -->
      <div class="relative overflow-hidden rounded-3xl p-6 bg-gradient-to-br from-emerald-500/20 via-cyan-500/10 to-transparent border border-emerald-500/30">
        <div class="absolute top-0 right-0 w-48 h-48 rounded-full bg-emerald-500/5 -translate-y-12 translate-x-12 pointer-events-none"></div>
        <div class="absolute bottom-0 left-0 w-32 h-32 rounded-full bg-cyan-500/5 translate-y-8 -translate-x-8 pointer-events-none"></div>
        <div class="relative z-10">
          <div class="flex items-start justify-between mb-4">
            <div>
              <p class="text-[10px] text-emerald-400 uppercase tracking-widest font-black mb-1">Balance acumulado</p>
              <p class="text-4xl font-black text-white">\${{ earningsSummary().all.earnings | number:'1.0-0' }}</p>
              <p class="text-emerald-400 text-sm font-bold mt-1">COP · ganancia neta</p>
            </div>
            <div class="w-14 h-14 rounded-2xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center shrink-0">
              <span class="material-symbols-outlined text-emerald-400" style="font-size:28px">account_balance_wallet</span>
            </div>
          </div>

          <!-- Desglose rápido total -->
          <div class="grid grid-cols-3 gap-3 pt-4 border-t border-white/10">
            <div>
              <p class="text-[9px] text-slate-500 uppercase tracking-wider">Total cobrado</p>
              <p class="text-white font-black text-sm">\${{ earningsSummary().all.charged | number:'1.0-0' }}</p>
            </div>
            <div>
              <p class="text-[9px] text-rose-400 uppercase tracking-wider">Comisión 15%</p>
              <p class="text-rose-400 font-black text-sm">-\${{ earningsSummary().all.commission | number:'1.0-0' }}</p>
            </div>
            <div>
              <p class="text-[9px] text-slate-500 uppercase tracking-wider">Viajes</p>
              <p class="text-white font-black text-sm">{{ earningsSummary().all.count }}</p>
            </div>
          </div>
        </div>
      </div>

      <!-- Retiro (próximamente) -->
      <div class="flex items-center gap-4 px-5 py-4 rounded-2xl border border-white/10 bg-white/[0.02]">
        <div class="w-10 h-10 rounded-xl bg-slate-500/10 border border-slate-500/20 flex items-center justify-center shrink-0">
          <span class="material-symbols-outlined text-slate-500" style="font-size:20px">output</span>
        </div>
        <div class="flex-1">
          <p class="text-white font-black text-sm">Solicitar retiro</p>
          <p class="text-slate-500 text-xs">Retira tus ganancias a tu cuenta bancaria o billetera digital</p>
        </div>
        <span class="px-3 py-1.5 rounded-full bg-slate-800 border border-slate-700 text-slate-500 text-[9px] font-black uppercase tracking-widest shrink-0">Próximamente</span>
      </div>

      <!-- Separador -->
      <div class="flex items-center gap-3">
        <div class="flex-1 h-px bg-white/10"></div>
        <p class="text-[10px] text-slate-600 uppercase tracking-widest font-black">Análisis por período</p>
        <div class="flex-1 h-px bg-white/10"></div>
      </div>

      <!-- Selector de período -->
      <div class="flex bg-white/[0.02] border border-white/10 rounded-xl p-1 gap-1">
        @for (p of earningsPeriodLabels; track p.key) {
          <button (click)="earningsPeriod.set(p.key)"
            [class]="earningsPeriod() === p.key
              ? 'flex-1 py-2 rounded-lg text-xs font-black bg-emerald-500 text-black transition-all'
              : 'flex-1 py-2 rounded-lg text-xs font-bold text-slate-400 hover:text-white transition-all'">
            {{ p.label }}
          </button>
        }
      </div>

      <!-- KPI cards del período -->
      <div class="grid grid-cols-2 gap-3">
        <div class="rounded-2xl p-4 border border-white/10 bg-white/[0.02] flex flex-col gap-1">
          <p class="text-[9px] text-slate-500 uppercase tracking-widest font-bold">Viajes</p>
          <p class="text-3xl font-black text-white">{{ earningsPeriodStats().count }}</p>
          <p class="text-[10px] text-slate-600">completados</p>
        </div>
        <div class="rounded-2xl p-4 border border-emerald-500/20 bg-emerald-500/5 flex flex-col gap-1">
          <p class="text-[9px] text-emerald-400 uppercase tracking-widest font-bold">Tu ganancia</p>
          <p class="text-3xl font-black text-emerald-400">\${{ earningsPeriodStats().earnings | number:'1.0-0' }}</p>
          <p class="text-[10px] text-emerald-700">85% del cobro</p>
        </div>
        <div class="rounded-2xl p-4 border border-white/10 bg-white/[0.02] flex flex-col gap-1">
          <p class="text-[9px] text-slate-500 uppercase tracking-widest font-bold">Total cobrado</p>
          <p class="text-2xl font-black text-white">\${{ earningsPeriodStats().charged | number:'1.0-0' }}</p>
          <p class="text-[10px] text-slate-600">COP</p>
        </div>
        <div class="rounded-2xl p-4 border border-rose-500/20 bg-rose-500/5 flex flex-col gap-1">
          <p class="text-[9px] text-rose-400 uppercase tracking-widest font-bold">Comisión plataforma</p>
          <p class="text-2xl font-black text-rose-400">-\${{ earningsPeriodStats().commission | number:'1.0-0' }}</p>
          <p class="text-[10px] text-rose-800">15% por viaje</p>
        </div>
      </div>

      <!-- Desglose diario (solo si hay más de 1 día) -->
      @if (earningsByDay().length > 1) {
        <div class="flex flex-col gap-3">
          <p class="text-[10px] text-slate-500 uppercase tracking-widest font-black">Desglose diario</p>
          <div class="rounded-2xl border border-white/10 bg-white/[0.02] overflow-hidden">
            @for (day of earningsByDay(); track day.dateTs) {
              <div class="flex items-center gap-3 px-4 py-3 border-b border-white/5 last:border-b-0 hover:bg-white/[0.02] transition-all">
                <!-- Fecha -->
                <div class="w-20 shrink-0">
                  <p class="text-white font-bold text-xs">{{ day.dateTs | date:'EEE d' }}</p>
                  <p class="text-slate-600 text-[10px]">{{ day.dateTs | date:'MMM yyyy' }}</p>
                </div>
                <!-- Barra de progreso -->
                <div class="flex-1 flex flex-col gap-1">
                  <div class="h-2 rounded-full bg-white/5 overflow-hidden">
                    <div class="h-full rounded-full bg-gradient-to-r from-emerald-500 to-cyan-500 transition-all"
                      [style.width.%]="day.barPct"></div>
                  </div>
                  <p class="text-[10px] text-slate-600">{{ day.count }} viaje{{ day.count !== 1 ? 's' : '' }}</p>
                </div>
                <!-- Monto -->
                <div class="text-right shrink-0">
                  <p class="text-emerald-400 font-black text-sm">\${{ day.earnings | number:'1.0-0' }}</p>
                  <p class="text-slate-600 text-[10px]">ganancia</p>
                </div>
              </div>
            }
          </div>
        </div>
      }

      @if (earningsByDay().length === 1) {
        <!-- Solo 1 día — mostrar resumen del día en lugar de la barra -->
        <div class="flex items-center gap-4 px-5 py-4 rounded-2xl border border-emerald-500/20 bg-emerald-500/5">
          <span class="material-symbols-outlined text-emerald-400" style="font-size:24px">today</span>
          <div class="flex-1">
            <p class="text-white font-black text-sm">{{ earningsByDay()[0].dateTs | date:"EEEE d 'de' MMMM" }}</p>
            <p class="text-slate-500 text-xs">{{ earningsByDay()[0].count }} viaje{{ earningsByDay()[0].count !== 1 ? 's' : '' }} · \${{ earningsByDay()[0].charged | number:'1.0-0' }} cobrado</p>
          </div>
          <p class="text-emerald-400 font-black text-xl">\${{ earningsByDay()[0].earnings | number:'1.0-0' }}</p>
        </div>
      }

      @if (earningsByDay().length === 0) {
        <div class="flex flex-col items-center gap-3 py-8 border border-white/10 rounded-2xl bg-white/[0.02] text-center">
          <span class="material-symbols-outlined text-slate-600" style="font-size:40px">bar_chart</span>
          <p class="text-slate-400 text-sm">Sin viajes en este período</p>
        </div>
      }

      <!-- Historial detallado del período -->
      @if (earningsPeriodTrips().length > 0) {
        <div class="flex flex-col gap-2">
          <p class="text-[10px] text-slate-500 uppercase tracking-widest font-black">Historial detallado</p>
          @for (trip of earningsPeriodTrips(); track trip.id) {
            <div class="rounded-xl border border-white/10 bg-white/[0.02] hover:border-white/20 transition-all overflow-hidden">
              <div class="flex items-start gap-3 px-4 py-3">
                <!-- Icono + ruta -->
                <div class="flex flex-col items-center gap-0.5 pt-1 shrink-0">
                  <span class="w-2 h-2 rounded-full bg-emerald-500"></span>
                  <span class="w-px flex-1 bg-white/15" style="min-height:14px"></span>
                  <span class="w-2 h-2 rounded-full bg-rose-500"></span>
                </div>
                <div class="flex-1 min-w-0">
                  <p class="text-white text-sm font-bold truncate">{{ trip.origin }}</p>
                  <p class="text-slate-400 text-xs truncate mt-0.5">{{ trip.destination }}</p>
                  <div class="flex items-center gap-2 mt-1.5 flex-wrap">
                    @if (trip.passenger_name) {
                      <span class="flex items-center gap-0.5 text-[10px] text-slate-500">
                        <span class="material-symbols-outlined" style="font-size:11px">person</span>{{ trip.passenger_name }}
                      </span>
                    }
                    <span class="text-[10px] text-slate-600">{{ trip.trip_date | date:'d MMM · h:mm a' }}</span>
                    @if (trip.distance_km) {
                      <span class="text-[10px] text-slate-600">· {{ trip.distance_km }} km</span>
                    }
                  </div>
                </div>
                <!-- Montos verticales -->
                <div class="flex flex-col items-end gap-0.5 shrink-0 text-right">
                  <div>
                    <p class="text-[9px] text-slate-500 uppercase">Cobrado</p>
                    <p class="text-white font-black text-sm">\${{ trip.total_amount | number:'1.0-0' }}</p>
                  </div>
                  <div>
                    <p class="text-[9px] text-rose-500 uppercase">Comisión</p>
                    <p class="text-rose-400 text-xs font-bold">-\${{ trip.platform_commission | number:'1.0-0' }}</p>
                  </div>
                  <div>
                    <p class="text-[9px] text-emerald-500 uppercase">Ganancia</p>
                    <p class="text-emerald-400 font-black text-sm">\${{ trip.driver_earnings | number:'1.0-0' }}</p>
                  </div>
                </div>
              </div>
              <!-- Barra de comisión visual -->
              <div class="h-1 bg-white/5">
                <div class="h-full bg-gradient-to-r from-emerald-500 to-cyan-500" style="width:85%"></div>
              </div>
            </div>
          }
        </div>
      }

    </div>
  }

  <!-- ═══════════════════ DRIVER: REQUESTS MAP ═══════════════════ -->
  @if (screen() === 'driver-requests') {
    <div class="w-full max-w-2xl flex flex-col gap-4">
      <!-- Header -->
      <div class="flex items-center gap-3">
        <button (click)="closeDriverRequests()"
          class="w-9 h-9 rounded-xl border border-white/10 flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/5 transition-all">
          <span class="material-symbols-outlined" style="font-size:18px">arrow_back</span>
        </button>
        <div class="flex-1">
          <h2 class="text-base font-black text-white">Solicitudes cercanas</h2>
          <p class="text-xs text-slate-500">Radio de 5 km · Actualización en tiempo real</p>
        </div>
        <span class="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">
          <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
          <span class="text-[10px] text-emerald-400 font-black uppercase">En línea</span>
        </span>
      </div>

      <!-- Mapa con pines -->
      <div id="ag-map-driver-requests" class="overflow-hidden border border-white/5 bg-zinc-900 w-full" style="height:380px;border-radius:20px"></div>

      <!-- Lista de solicitudes -->
      @if (requestsLoading()) {
        <div class="flex items-center justify-center py-10">
          <span class="material-symbols-outlined text-amber-400 animate-spin" style="font-size:28px">autorenew</span>
        </div>
      } @else if (pendingRequests().length === 0) {
        <div class="flex flex-col items-center gap-3 py-10 border border-white/10 rounded-2xl bg-white/[0.02] text-center">
          <span class="material-symbols-outlined text-slate-600" style="font-size:40px">search_off</span>
          <p class="text-slate-400 text-sm font-bold">Sin solicitudes en este momento</p>
          <p class="text-slate-600 text-xs">Las nuevas solicitudes aparecerán automáticamente</p>
          <button (click)="loadPendingRequests()"
            class="mt-1 px-4 py-2 rounded-xl border border-amber-500/30 bg-amber-500/5 text-amber-400 font-black text-xs hover:bg-amber-500/10 transition-all">
            Actualizar
          </button>
        </div>
      } @else {
        <p class="text-[10px] text-slate-500 uppercase tracking-widest font-black">{{ pendingRequests().length }} solicitud{{ pendingRequests().length !== 1 ? 'es' : '' }}</p>
        <div class="flex flex-col gap-3">
          @for (req of pendingRequests(); track req.id) {
            <div class="rounded-2xl border border-white/10 bg-white/[0.02] hover:border-amber-500/30 transition-all overflow-hidden">
              <!-- Ruta -->
              <div class="p-4 flex flex-col gap-2.5">
                <div class="flex items-start gap-3">
                  <div class="flex flex-col items-center gap-1 pt-1 shrink-0">
                    <span class="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
                    <span class="w-px bg-white/20 flex-1" style="min-height:16px"></span>
                    <span class="w-2.5 h-2.5 rounded-full bg-rose-500"></span>
                  </div>
                  <div class="flex-1 flex flex-col gap-2 min-w-0">
                    <p class="text-white text-sm font-bold leading-tight truncate">{{ req.origin_address }}</p>
                    <p class="text-slate-400 text-sm truncate">{{ req.dest_address }}</p>
                  </div>
                  <div class="shrink-0 text-right">
                    <p class="text-amber-400 font-black text-lg">\${{ req.offered_price | number:'1.0-0' }}</p>
                    <p class="text-slate-600 text-[10px]">COP ofertado</p>
                  </div>
                </div>

                <div class="flex items-center gap-3">
                  @if (req.passenger?.full_name) {
                    <span class="flex items-center gap-1 text-[11px] text-slate-500">
                      <span class="material-symbols-outlined" style="font-size:13px">person</span>
                      {{ req.passenger?.full_name }}
                    </span>
                  }
                  <span class="flex items-center gap-1 text-[11px] text-slate-500">
                    <span class="material-symbols-outlined" style="font-size:13px">schedule</span>
                    {{ req.created_at | date:'h:mm a' }}
                  </span>
                  <span class="ml-auto text-[10px] text-emerald-500 font-black">Tu ganancia: \${{ req.offered_price * 0.85 | number:'1.0-0' }}</span>
                </div>
              </div>

              <!-- Acciones -->
              <div class="flex border-t border-white/10">
                <button (click)="ignoreRequest(req)"
                  class="flex-1 py-3 text-slate-500 font-black text-sm hover:bg-rose-500/5 hover:text-rose-400 transition-all border-r border-white/10">
                  <span class="flex items-center justify-center gap-1.5">
                    <span class="material-symbols-outlined" style="font-size:16px">close</span>
                    Ignorar
                  </span>
                </button>
                <button (click)="acceptRequest(req)" [disabled]="loading()"
                  class="flex-[2] py-3 font-black text-sm uppercase tracking-wider bg-gradient-to-r from-amber-500/20 to-orange-500/10 text-amber-400 hover:from-amber-500/30 hover:to-orange-500/20 transition-all disabled:opacity-40">
                  <span class="flex items-center justify-center gap-1.5">
                    @if (loading()) {
                      <span class="material-symbols-outlined animate-spin" style="font-size:16px">autorenew</span>
                    } @else {
                      <span class="material-symbols-outlined" style="font-size:16px">check_circle</span>
                      Aceptar viaje
                    }
                  </span>
                </button>
              </div>
            </div>
          }
        </div>
      }
    </div>
  }

  <!-- ═══════════════════ DRIVER: ACTIVE TRIP ═══════════════════ -->
  @if (screen() === 'driver-trip-active') {
    <div class="w-full max-w-2xl flex flex-col gap-4">
      <!-- Phase header -->
      <div [class]="'flex items-center gap-4 px-5 py-4 rounded-2xl border ' +
        (activeDriverRide()?.status === 'accepted'
          ? 'bg-gradient-to-r from-amber-500/10 to-orange-500/5 border-amber-500/20'
          : 'bg-gradient-to-r from-emerald-500/10 to-cyan-500/5 border-emerald-500/20')">
        <div [class]="'w-12 h-12 rounded-full border-2 flex items-center justify-center shrink-0 ' +
          (activeDriverRide()?.status === 'accepted'
            ? 'bg-amber-500/20 border-amber-500/40'
            : 'bg-emerald-500/20 border-emerald-500/40')">
          <span class="material-symbols-outlined" style="font-size:24px"
            [style.color]="activeDriverRide()?.status === 'accepted' ? '#f59e0b' : '#22c55e'">
            {{ activeDriverRide()?.status === 'accepted' ? 'person_pin' : 'directions_car' }}
          </span>
        </div>
        <div class="flex-1 min-w-0">
          <p class="font-black text-sm"
            [style.color]="activeDriverRide()?.status === 'accepted' ? '#f59e0b' : '#22c55e'">
            {{ activeDriverRide()?.status === 'accepted' ? 'Ve a recoger al pasajero' : 'Viaje en curso' }}
          </p>
          <p class="text-white font-black text-base truncate">{{ activeDriverRide()?.passenger?.full_name }}</p>
          <p class="text-slate-500 text-xs">
            {{ activeDriverRide()?.status === 'accepted' ? activeDriverRide()?.origin_address : activeDriverRide()?.dest_address }}
          </p>
        </div>
        <div class="shrink-0 text-right">
          <p class="text-amber-400 font-black text-xl">\${{ activeDriverRide()?.offered_price | number:'1.0-0' }}</p>
          <p class="text-slate-600 text-[10px]">efectivo</p>
        </div>
      </div>

      <!-- Tabs Mapa / Chat -->
      <div class="flex bg-white/[0.02] border border-white/10 rounded-xl p-1 gap-1">
        <button (click)="driverTripTab.set('map')"
          [class]="'flex-1 py-2 rounded-lg font-black text-xs uppercase tracking-wider transition-all ' +
            (driverTripTab() === 'map' ? 'bg-white/10 text-white' : 'text-slate-500 hover:text-white')">
          <span class="flex items-center justify-center gap-1.5">
            <span class="material-symbols-outlined" style="font-size:14px">map</span> Mapa
          </span>
        </button>
        <button (click)="driverTripTab.set('chat'); loadDriverChat()"
          [class]="'flex-1 py-2 rounded-lg font-black text-xs uppercase tracking-wider transition-all ' +
            (driverTripTab() === 'chat' ? 'bg-white/10 text-white' : 'text-slate-500 hover:text-white')">
          <span class="flex items-center justify-center gap-1.5">
            <span class="material-symbols-outlined" style="font-size:14px">chat</span> Chat
          </span>
        </button>
      </div>

      <!-- Mapa -->
      @if (driverTripTab() === 'map') {
        <div id="ag-map-driver-trip" class="overflow-hidden border border-white/5 bg-zinc-900 w-full" style="height:420px;border-radius:20px"></div>

        <!-- GPS tracking status -->
        <div class="flex items-center gap-3 px-4 py-2.5 rounded-xl border transition-all"
          [class]="gpsTracking() ? 'bg-emerald-500/[0.03] border-emerald-500/20' : 'bg-white/[0.02] border-white/5'">
          @if (gpsTracking()) {
            <span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0"></span>
            <p class="text-emerald-400 text-xs font-bold">Tu posición se comparte en tiempo real</p>
            <span class="ml-auto text-emerald-600 text-[10px]">WebSocket</span>
          } @else {
            <span class="w-2 h-2 rounded-full bg-amber-500 animate-pulse shrink-0"></span>
            <p class="text-amber-400 text-xs font-bold">Activando GPS...</p>
          }
        </div>

        <!-- Navegar con Google Maps / Waze -->
        <div class="grid grid-cols-2 gap-3">
          <a [href]="driverNavUrl('google')" target="_blank"
            class="flex items-center justify-center gap-2 py-3 rounded-xl border border-white/10 bg-white/[0.02] text-slate-300 font-black text-sm hover:bg-white/5 transition-all">
            <span class="text-base">🗺️</span> Google Maps
          </a>
          <a [href]="driverNavUrl('waze')" target="_blank"
            class="flex items-center justify-center gap-2 py-3 rounded-xl border border-blue-500/20 bg-blue-500/5 text-blue-400 font-black text-sm hover:bg-blue-500/10 transition-all">
            <span class="text-base">🚗</span> Waze
          </a>
        </div>

        <!-- Llamada protegida -->
        <div class="flex items-center gap-3 px-4 py-3 rounded-xl bg-white/[0.02] border border-white/10">
          <span class="material-symbols-outlined text-cyan-400" style="font-size:20px">phone_locked</span>
          <div class="flex-1">
            <p class="text-white font-bold text-sm">Llamada protegida</p>
            <p class="text-slate-500 text-xs">Número del pasajero oculto</p>
          </div>
          <a [href]="'tel:' + activeDriverRide()?.passenger?.phone"
            class="flex items-center gap-2 px-4 py-2 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 font-black text-sm hover:bg-cyan-500/20 transition-all">
            <span class="material-symbols-outlined" style="font-size:16px">call</span>
            Llamar
          </a>
        </div>
      }

      <!-- Chat -->
      @if (driverTripTab() === 'chat') {
        <div class="flex flex-col gap-3">
          <div class="h-64 overflow-y-auto flex flex-col gap-2 p-3 rounded-xl bg-white/[0.02] border border-white/10">
            @if (driverChatMessages().length === 0) {
              <div class="flex-1 flex items-center justify-center">
                <p class="text-slate-600 text-sm">Inicia la conversación</p>
              </div>
            }
            @for (msg of driverChatMessages(); track msg.id) {
              <div [class]="'flex ' + (msg.sender_ag_user_id === agUser()?.id ? 'justify-end' : 'justify-start')">
                <div [class]="'max-w-[75%] px-3 py-2 rounded-xl text-sm leading-relaxed ' +
                  (msg.sender_ag_user_id === agUser()?.id
                    ? 'bg-amber-500/20 border border-amber-500/20 text-white rounded-br-none'
                    : 'bg-white/5 border border-white/10 text-slate-300 rounded-bl-none')">
                  {{ msg.message }}
                </div>
              </div>
            }
          </div>

          <div class="flex gap-2">
            <input type="text" [value]="driverChatInput()" (input)="driverChatInput.set($any($event.target).value)"
              (keydown.enter)="sendDriverChat()"
              placeholder="Escribe un mensaje..."
              class="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder:text-slate-600 focus:outline-none focus:border-amber-500/50 transition-all" />
            <button (click)="sendDriverChat()" [disabled]="!driverChatInput().trim()"
              class="w-12 h-12 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 hover:bg-amber-500/25 transition-all disabled:opacity-40">
              <span class="material-symbols-outlined" style="font-size:20px">send</span>
            </button>
          </div>
        </div>
      }

      <!-- Botón de acción principal -->
      @if (activeDriverRide()?.status === 'accepted') {
        <button (click)="driverStartTrip()" [disabled]="loading()"
          class="w-full py-4 rounded-2xl font-black text-base uppercase tracking-wider transition-all
            bg-gradient-to-r from-emerald-500 to-cyan-500 text-black hover:from-emerald-400 hover:to-cyan-400 disabled:opacity-40 shadow-lg shadow-emerald-500/20">
          <span class="flex items-center justify-center gap-2">
            @if (loading()) {
              <span class="material-symbols-outlined animate-spin" style="font-size:20px">autorenew</span>
            } @else {
              <span class="material-symbols-outlined" style="font-size:20px">play_circle</span>
              Iniciar viaje — Pasajero a bordo
            }
          </span>
        </button>
      }
      @if (activeDriverRide()?.status === 'in_progress') {
        <button (click)="driverFinishTrip()" [disabled]="loading()"
          class="w-full py-4 rounded-2xl font-black text-base uppercase tracking-wider transition-all
            bg-gradient-to-r from-amber-500 to-orange-500 text-black hover:from-amber-400 hover:to-orange-400 disabled:opacity-40 shadow-lg shadow-amber-500/20">
          <span class="flex items-center justify-center gap-2">
            @if (loading()) {
              <span class="material-symbols-outlined animate-spin" style="font-size:20px">autorenew</span>
            } @else {
              <span class="material-symbols-outlined" style="font-size:20px">flag</span>
              Finalizar viaje — Cobrar efectivo
            }
          </span>
        </button>
        <!-- Recordatorio de cobro -->
        <div class="flex items-center gap-3 px-4 py-3 rounded-xl bg-amber-500/5 border border-amber-500/20">
          <span class="material-symbols-outlined text-amber-400" style="font-size:20px">payments</span>
          <div>
            <p class="text-amber-400 font-black text-sm">Cobra \${{ activeDriverRide()?.offered_price | number:'1.0-0' }} COP en efectivo</p>
            <p class="text-slate-500 text-xs">Tu ganancia: \${{ (activeDriverRide()?.offered_price ?? 0) * 0.85 | number:'1.0-0' }} (85%)</p>
          </div>
        </div>
      }
    </div>
  }

  <!-- ═══════════════════ DRIVER: RATE PASSENGER ═══════════════════ -->
  @if (screen() === 'driver-rate-passenger') {
    <div class="w-full max-w-md flex flex-col items-center gap-6">
      <!-- Resumen del viaje -->
      <div class="w-full flex items-center gap-4 px-5 py-4 rounded-2xl bg-emerald-500/5 border border-emerald-500/20">
        <div class="w-12 h-12 rounded-full bg-emerald-500/20 border-2 border-emerald-500/30 flex items-center justify-center shrink-0">
          <span class="material-symbols-outlined text-emerald-400" style="font-size:24px">check_circle</span>
        </div>
        <div class="flex-1 min-w-0">
          <p class="text-emerald-400 font-black text-sm">¡Viaje completado!</p>
          <p class="text-slate-400 text-xs truncate">{{ activeDriverRide()?.origin_address }} → {{ activeDriverRide()?.dest_address }}</p>
        </div>
        <div class="text-right shrink-0">
          <p class="text-emerald-400 font-black text-lg">\${{ (activeDriverRide()?.offered_price ?? 0) * 0.85 | number:'1.0-0' }}</p>
          <p class="text-slate-600 text-[10px]">tu ganancia</p>
        </div>
      </div>

      <div class="text-center">
        <div class="w-20 h-20 rounded-full bg-amber-500/15 border-2 border-amber-500/30 flex items-center justify-center mx-auto mb-4">
          <span class="material-symbols-outlined text-amber-400" style="font-size:36px">person</span>
        </div>
        <h2 class="text-xl font-black text-white">¿Cómo fue el pasajero?</h2>
        <p class="text-slate-400 text-sm mt-1">{{ activeDriverRide()?.passenger?.full_name }}</p>
      </div>

      <!-- Estrellas -->
      <div class="flex gap-3">
        @for (s of [1,2,3,4,5]; track s) {
          <button (click)="driverRatingStars.set(s)" class="transition-all hover:scale-110">
            <span class="material-symbols-outlined text-4xl transition-colors"
              [style.color]="driverRatingStars() >= s ? '#f59e0b' : '#334155'">
              {{ driverRatingStars() >= s ? 'star' : 'star_border' }}
            </span>
          </button>
        }
      </div>
      @if (driverRatingStars() > 0) {
        <p class="text-amber-400 font-black text-sm">
          {{ driverRatingStars() === 1 ? 'Muy malo' : driverRatingStars() === 2 ? 'Malo' : driverRatingStars() === 3 ? 'Regular' : driverRatingStars() === 4 ? 'Bueno' : 'Excelente' }}
        </p>
      }

      <div class="w-full">
        <textarea [value]="driverRatingComment()" (input)="driverRatingComment.set($any($event.target).value)"
          placeholder="Comentario opcional..."
          rows="3"
          class="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder:text-slate-600 focus:outline-none focus:border-amber-500/50 transition-all resize-none"></textarea>
      </div>

      @if (error()) {
        <p class="text-rose-400 text-xs flex items-center gap-1">
          <span class="material-symbols-outlined" style="font-size:14px">error</span> {{ error() }}
        </p>
      }

      <div class="flex flex-col gap-3 w-full">
        <button (click)="submitDriverRating()" [disabled]="loading() || driverRatingStars() === 0"
          class="w-full py-3 rounded-xl font-black text-sm uppercase tracking-wider transition-all
            bg-gradient-to-r from-amber-500 to-orange-500 text-black hover:from-amber-400 hover:to-orange-400 disabled:opacity-40">
          @if (loading()) {
            <span class="material-symbols-outlined animate-spin" style="font-size:16px">autorenew</span>
          } @else {
            Enviar calificación
          }
        </button>
        <button (click)="skipDriverRating()" class="text-slate-500 text-xs text-center hover:text-slate-300 transition-colors">
          Omitir por ahora
        </button>
      </div>
    </div>
  }

  <!-- ═══════════════════ SECURITY SETTINGS ═══════════════════ -->
  @if (screen() === 'security-settings') {
    <div class="w-full max-w-md flex flex-col gap-5">
      <div class="flex items-center gap-3">
        <button (click)="screen.set('passenger-home')" class="w-10 h-10 rounded-xl border border-white/10 flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/5 transition-all shrink-0">
          <span class="material-symbols-outlined" style="font-size:20px">arrow_back</span>
        </button>
        <div>
          <h2 class="text-lg font-black text-white">Seguridad del Viaje</h2>
          <p class="text-slate-500 text-xs">Configura tu perfil de seguridad</p>
        </div>
      </div>

      <!-- Verificación de identidad -->
      <div class="rounded-2xl border border-white/10 bg-white/[0.02] p-5 flex flex-col gap-4">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-xl bg-violet-500/15 border border-violet-500/30 flex items-center justify-center shrink-0">
            <span class="material-symbols-outlined text-violet-400" style="font-size:20px">face</span>
          </div>
          <div class="flex-1">
            <p class="text-white font-black text-sm">Verificación de Identidad</p>
            <p class="text-slate-500 text-xs">Sube una foto de tu rostro para generar confianza</p>
          </div>
          @if (agUser()?.selfie_verified) {
            <span class="flex items-center gap-1 px-2 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-[9px] font-black uppercase">
              <span class="material-symbols-outlined" style="font-size:12px">verified</span> Verificado
            </span>
          } @else if (agUser()?.selfie_url) {
            <span class="px-2 py-1 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-400 text-[9px] font-black uppercase">En revisión</span>
          }
        </div>

        @if (selfiePreviewUrl()) {
          <img [src]="selfiePreviewUrl()" alt="Selfie" class="w-24 h-24 rounded-2xl object-cover border-2 border-violet-500/40 mx-auto" />
        } @else if (agUser()?.selfie_url) {
          <img [src]="agUser()!.selfie_url" alt="Selfie" class="w-24 h-24 rounded-2xl object-cover border-2 border-violet-500/40 mx-auto" />
        }

        @if (!agUser()?.selfie_verified) {
          <label class="flex items-center justify-center gap-2 w-full py-3 rounded-xl border border-violet-500/30 bg-violet-500/10 text-violet-400 font-black text-sm hover:bg-violet-500/20 transition-all cursor-pointer">
            @if (selfieUploading()) {
              <span class="material-symbols-outlined animate-spin" style="font-size:18px">autorenew</span>
              Subiendo...
            } @else {
              <span class="material-symbols-outlined" style="font-size:18px">add_a_photo</span>
              {{ agUser()?.selfie_url ? 'Cambiar foto' : 'Subir selfie' }}
            }
            <input type="file" accept="image/*" capture="user" class="hidden" (change)="onSelfieFile($event)" />
          </label>
        }
      </div>

      <!-- Contacto de emergencia -->
      <div class="rounded-2xl border border-white/10 bg-white/[0.02] p-5 flex flex-col gap-4">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center shrink-0">
            <span class="material-symbols-outlined text-rose-400" style="font-size:20px">emergency</span>
          </div>
          <div>
            <p class="text-white font-black text-sm">Contacto de Emergencia</p>
            <p class="text-slate-500 text-xs">Se notifica cuando activas el botón de pánico</p>
          </div>
        </div>

        <div class="flex flex-col gap-3">
          <div>
            <label class="block text-[10px] text-slate-400 uppercase tracking-widest mb-1.5 font-bold">Nombre</label>
            <input type="text" [value]="emergencyContactName()" (input)="emergencyContactName.set($any($event.target).value)"
              placeholder="Nombre completo"
              class="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder:text-slate-600 focus:outline-none focus:border-rose-500/50 transition-all" />
          </div>
          <div>
            <label class="block text-[10px] text-slate-400 uppercase tracking-widest mb-1.5 font-bold">Teléfono (WhatsApp)</label>
            <div class="flex gap-2">
              <div class="flex items-center px-3 py-3 rounded-xl bg-white/5 border border-white/10 text-slate-400 text-sm font-bold shrink-0">+57</div>
              <input type="tel" [value]="emergencyContactPhone()" (input)="emergencyContactPhone.set($any($event.target).value)"
                placeholder="3001234567" maxlength="10"
                class="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder:text-slate-600 focus:outline-none focus:border-rose-500/50 transition-all" />
            </div>
          </div>
        </div>

        @if (contactSaved()) {
          <div class="flex items-center gap-2 px-4 py-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
            <span class="material-symbols-outlined text-emerald-400" style="font-size:16px">check_circle</span>
            <p class="text-emerald-400 font-black text-sm">Contacto guardado correctamente</p>
          </div>
        }

        <button (click)="saveEmergencyContact()"
          [disabled]="savingContact() || !emergencyContactName().trim() || emergencyContactPhone().length < 10"
          class="w-full py-3 rounded-xl font-black text-sm uppercase tracking-wider transition-all
            bg-gradient-to-r from-rose-500 to-pink-500 text-white hover:from-rose-400 hover:to-pink-400 disabled:opacity-40">
          @if (savingContact()) {
            <span class="material-symbols-outlined animate-spin" style="font-size:16px">autorenew</span>
          } @else {
            Guardar contacto
          }
        </button>
      </div>

      <!-- Cómo funciona el pánico -->
      <div class="rounded-2xl border border-rose-500/10 bg-rose-500/[0.02] p-4 flex flex-col gap-3">
        <p class="text-rose-400 font-black text-xs uppercase tracking-widest">¿Cómo funciona el botón de pánico?</p>
        <div class="flex flex-col gap-2">
          <div class="flex items-start gap-3">
            <span class="w-5 h-5 rounded-full bg-rose-500/20 flex items-center justify-center text-rose-400 font-black text-[10px] shrink-0 mt-0.5">1</span>
            <p class="text-slate-400 text-xs">Durante el viaje, presiona el botón rojo "SOS"</p>
          </div>
          <div class="flex items-start gap-3">
            <span class="w-5 h-5 rounded-full bg-rose-500/20 flex items-center justify-center text-rose-400 font-black text-[10px] shrink-0 mt-0.5">2</span>
            <p class="text-slate-400 text-xs">Se registra la alerta en el sistema y se abre WhatsApp con tu contacto de emergencia</p>
          </div>
          <div class="flex items-start gap-3">
            <span class="w-5 h-5 rounded-full bg-rose-500/20 flex items-center justify-center text-rose-400 font-black text-[10px] shrink-0 mt-0.5">3</span>
            <p class="text-slate-400 text-xs">El mensaje incluye los datos del conductor, placa y enlace de Google Maps</p>
          </div>
        </div>
      </div>
    </div>
  }

  <!-- ═══════════════════ ADMIN PANEL ═══════════════════ -->
  @if (screen() === 'admin-panel') {
    <div class="w-full max-w-4xl flex flex-col gap-6">
      <!-- Header admin -->
      <div class="flex items-center gap-4">
        <div class="w-12 h-12 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
          <span class="material-symbols-outlined text-primary" style="font-size:24px">admin_panel_settings</span>
        </div>
        <div>
          <h2 class="text-lg font-black text-white">Panel · Anda y Gana</h2>
          <p class="text-slate-500 text-xs">Gestión de conductores y aprobaciones</p>
        </div>
        @if (!isAdmin()) {
          <button (click)="screen.set('welcome')" class="ml-auto text-slate-500 hover:text-white text-sm flex items-center gap-1 transition-colors">
            <span class="material-symbols-outlined" style="font-size:16px">arrow_back</span> Volver
          </button>
        }
      </div>

      <!-- Stats -->
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div class="rounded-xl p-4 border border-white/10 bg-white/[0.02] text-center">
          <p class="text-2xl font-black text-white">{{ adminStats().total }}</p>
          <p class="text-[10px] text-slate-500 uppercase tracking-widest mt-1">Total</p>
        </div>
        <div class="rounded-xl p-4 border border-amber-500/20 bg-amber-500/5 text-center">
          <p class="text-2xl font-black text-amber-400">{{ adminStats().pending }}</p>
          <p class="text-[10px] text-amber-500 uppercase tracking-widest mt-1">Pendientes</p>
        </div>
        <div class="rounded-xl p-4 border border-emerald-500/20 bg-emerald-500/5 text-center">
          <p class="text-2xl font-black text-emerald-400">{{ adminStats().approved }}</p>
          <p class="text-[10px] text-emerald-500 uppercase tracking-widest mt-1">Aprobados</p>
        </div>
        <div class="rounded-xl p-4 border border-rose-500/20 bg-rose-500/5 text-center">
          <p class="text-2xl font-black text-rose-400">{{ adminStats().rejected }}</p>
          <p class="text-[10px] text-rose-500 uppercase tracking-widest mt-1">Rechazados</p>
        </div>
      </div>

      <!-- Tabs -->
      <div class="flex gap-2 border-b border-white/10 pb-0">
        <button (click)="adminTab.set('pending')"
          [class]="adminTab() === 'pending'
            ? 'px-4 py-2 text-sm font-black text-amber-400 border-b-2 border-amber-400 -mb-px'
            : 'px-4 py-2 text-sm font-bold text-slate-500 hover:text-slate-300 transition-colors'">
          Pendientes ({{ adminStats().pending }})
        </button>
        <button (click)="adminTab.set('all')"
          [class]="adminTab() === 'all'
            ? 'px-4 py-2 text-sm font-black text-primary border-b-2 border-primary -mb-px'
            : 'px-4 py-2 text-sm font-bold text-slate-500 hover:text-slate-300 transition-colors'">
          Todos
        </button>
      </div>

      <!-- Lista de conductores -->
      @if (adminLoading()) {
        <div class="flex items-center justify-center py-12">
          <span class="material-symbols-outlined text-slate-500 animate-spin" style="font-size:32px">autorenew</span>
        </div>
      } @else {
        @for (driver of filteredDrivers(); track driver.id) {
          <div class="rounded-2xl border p-4 sm:p-5 transition-all"
            [class]="driver.status === 'pending' ? 'border-amber-500/20 bg-amber-500/5'
              : driver.status === 'approved' ? 'border-emerald-500/20 bg-emerald-500/5'
              : 'border-rose-500/20 bg-rose-500/5'">

            <div class="flex flex-col sm:flex-row sm:items-start gap-4">
              <!-- Info conductor -->
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2 mb-2">
                  <span class="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest"
                    [class]="driver.status === 'pending' ? 'bg-amber-500/20 text-amber-400'
                      : driver.status === 'approved' ? 'bg-emerald-500/20 text-emerald-400'
                      : 'bg-rose-500/20 text-rose-400'">
                    {{ driver.status === 'pending' ? 'Pendiente' : driver.status === 'approved' ? 'Aprobado' : 'Rechazado' }}
                  </span>
                  <span class="text-slate-600 text-[10px]">{{ driver.created_at | date:'d MMM yyyy' }}</span>
                </div>

                <p class="text-white font-black text-base">{{ driver.ag_user?.full_name }}</p>
                <p class="text-slate-400 text-sm">+57 {{ driver.ag_user?.phone }}</p>

                <div class="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                  <div><span class="text-slate-500">Licencia:</span> <span class="text-slate-300 font-bold ml-1">{{ driver.license_number }}</span></div>
                  <div><span class="text-slate-500">Placa:</span> <span class="text-slate-300 font-bold ml-1">{{ driver.vehicle_plate }}</span></div>
                  <div><span class="text-slate-500">Vehículo:</span> <span class="text-slate-300 font-bold ml-1">{{ driver.vehicle_brand }} {{ driver.vehicle_model }}</span></div>
                  <div><span class="text-slate-500">Año:</span> <span class="text-slate-300 font-bold ml-1">{{ driver.vehicle_year || '—' }}</span></div>
                </div>

                @if (driver.rejection_reason) {
                  <p class="mt-2 text-rose-400 text-xs bg-rose-500/10 rounded-lg px-3 py-2">Motivo: {{ driver.rejection_reason }}</p>
                }

                <!-- Fotos docs -->
                <div class="flex gap-2 mt-3 flex-wrap">
                  @if (driver.license_photo_url) {
                    <a [href]="driver.license_photo_url" target="_blank" class="flex items-center gap-1 px-2 py-1 rounded-lg bg-white/5 border border-white/10 text-slate-400 hover:text-white text-[10px] font-bold transition-colors">
                      <span class="material-symbols-outlined" style="font-size:12px">id_card</span> Ver Licencia
                    </a>
                  }
                  @if (driver.vehicle_photo_url) {
                    <a [href]="driver.vehicle_photo_url" target="_blank" class="flex items-center gap-1 px-2 py-1 rounded-lg bg-white/5 border border-white/10 text-slate-400 hover:text-white text-[10px] font-bold transition-colors">
                      <span class="material-symbols-outlined" style="font-size:12px">directions_car</span> Ver Vehículo
                    </a>
                  }
                  @if (driver.soat_photo_url) {
                    <a [href]="driver.soat_photo_url" target="_blank" class="flex items-center gap-1 px-2 py-1 rounded-lg bg-white/5 border border-white/10 text-slate-400 hover:text-white text-[10px] font-bold transition-colors">
                      <span class="material-symbols-outlined" style="font-size:12px">verified_user</span> Ver SOAT
                    </a>
                  }
                </div>
              </div>

              <!-- Acciones (solo si pendiente) -->
              @if (driver.status === 'pending') {
                <div class="flex sm:flex-col gap-2 shrink-0">
                  <button (click)="approve(driver.id)"
                    class="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-black text-xs uppercase tracking-wider transition-all">
                    <span class="material-symbols-outlined" style="font-size:14px">check</span> Aprobar
                  </button>
                  <button (click)="openReject(driver)"
                    class="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/30 text-rose-400 font-black text-xs uppercase tracking-wider transition-all">
                    <span class="material-symbols-outlined" style="font-size:14px">close</span> Rechazar
                  </button>
                </div>
              }
            </div>
          </div>
        } @empty {
          <div class="flex flex-col items-center py-12 gap-3 text-center">
            <span class="material-symbols-outlined text-slate-600" style="font-size:40px">inbox</span>
            <p class="text-slate-500 text-sm">No hay conductores {{ adminTab() === 'pending' ? 'pendientes' : 'registrados' }}</p>
          </div>
        }
      }
    </div>

    <!-- Modal rechazo -->
    @if (rejectingDriver()) {
      <div class="fixed inset-0 z-[80] flex items-end sm:items-center justify-center p-4" (click)="rejectingDriver.set(null)">
        <div class="absolute inset-0 bg-black/80 backdrop-blur-sm"></div>
        <div class="relative z-10 w-full max-w-md rounded-2xl bg-[#0d0d0d] border border-rose-500/20 p-6" (click)="$event.stopPropagation()">
          <h3 class="text-white font-black text-base mb-4">Motivo de Rechazo</h3>
          <textarea [value]="rejectionReason()" (input)="rejectionReason.set($any($event.target).value)"
            placeholder="Explica al conductor qué debe corregir..." rows="3"
            class="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder:text-slate-600 focus:outline-none focus:border-rose-500/50 transition-all resize-none"></textarea>
          <div class="flex gap-3 mt-4">
            <button (click)="rejectingDriver.set(null)" class="flex-1 py-2.5 rounded-xl border border-white/10 text-slate-400 font-black text-sm hover:bg-white/5 transition-all">Cancelar</button>
            <button (click)="reject()" [disabled]="!rejectionReason().trim()"
              class="flex-1 py-2.5 rounded-xl bg-rose-500 hover:bg-rose-400 text-white font-black text-sm transition-all disabled:opacity-40">
              Confirmar Rechazo
            </button>
          </div>
        </div>
      </div>
    }
  }

</div>
  `,
})
export class AndaGanaComponent implements OnInit, OnDestroy {
  private svc = inject(AndaGanaService);
  private zone = inject(NgZone);
  private platformId = inject(PLATFORM_ID);

  screen        = signal<AgScreen>('loading');
  agUser        = signal<AgUser | null>(null);
  isAdmin       = signal(false);

  // Forms
  phone             = signal('');
  verificationCode  = signal('');
  pendingCode       = signal('');
  selectedRole      = signal<'passenger' | 'driver'>('passenger');
  fullName          = signal('');
  licenseNumber     = signal('');
  vehiclePlate      = signal('');
  vehicleBrand      = signal('');
  vehicleModel      = signal('');
  vehicleYear       = signal('');
  soatExpiry        = signal('');
  licensePhotoUrl   = signal('');
  vehiclePhotoUrl   = signal('');
  soatPhotoUrl      = signal('');

  // UI
  loading        = signal(false);
  error          = signal('');
  uploadingLicense = signal(false);
  uploadingVehicle = signal(false);
  uploadingSoat    = signal(false);

  // Viajes
  trips           = signal<AgTrip[]>([]);
  tripsFilter     = signal<'today' | 'week' | 'month' | 'all'>('month');
  tripsLoading    = signal(false);
  showTripForm    = signal(false);
  tripOrigin      = signal('');
  tripDestination = signal('');
  tripAmount      = signal('');
  tripPassengerName = signal('');
  tripDistanceKm  = signal('');
  tripDuration    = signal('');
  tripError       = signal('');
  savingTrip      = signal(false);

  readonly tripFilters = [
    { key: 'today' as const, label: 'Hoy' },
    { key: 'week'  as const, label: 'Semana' },
    { key: 'month' as const, label: 'Mes' },
    { key: 'all'   as const, label: 'Todo' },
  ];

  filteredTrips = computed(() => {
    const all = this.trips();
    const f = this.tripsFilter();
    const now = new Date();
    if (f === 'all') return all;
    return all.filter(t => {
      const d = new Date(t.trip_date);
      if (f === 'today') return d.toDateString() === now.toDateString();
      if (f === 'week') {
        const weekAgo = new Date(now); weekAgo.setDate(now.getDate() - 7); return d >= weekAgo;
      }
      const monthAgo = new Date(now); monthAgo.setDate(now.getDate() - 30); return d >= monthAgo;
    });
  });

  totalCharged    = computed(() => this.filteredTrips().reduce((s, t) => s + Number(t.total_amount), 0));
  totalCommission = computed(() => this.filteredTrips().reduce((s, t) => s + Number(t.platform_commission), 0));
  totalEarnings   = computed(() => this.filteredTrips().reduce((s, t) => s + Number(t.driver_earnings), 0));

  // ── Earnings screen ──
  earningsPeriod = signal<'today' | 'week' | 'month' | 'all'>('month');

  private sumTrips(t: AgTrip[]) {
    return {
      count:      t.length,
      charged:    t.reduce((s, r) => s + Number(r.total_amount),        0),
      commission: t.reduce((s, r) => s + Number(r.platform_commission), 0),
      earnings:   t.reduce((s, r) => s + Number(r.driver_earnings),     0),
    };
  }

  earningsSummary = computed(() => {
    const all   = this.trips();
    const now   = new Date();
    const today = now.toDateString();
    const weekAgo  = new Date(now); weekAgo.setDate(now.getDate() - 7);
    const monthAgo = new Date(now); monthAgo.setDate(now.getDate() - 30);
    return {
      today: this.sumTrips(all.filter(t => new Date(t.trip_date).toDateString() === today)),
      week:  this.sumTrips(all.filter(t => new Date(t.trip_date) >= weekAgo)),
      month: this.sumTrips(all.filter(t => new Date(t.trip_date) >= monthAgo)),
      all:   this.sumTrips(all),
    };
  });

  earningsPeriodStats = computed(() => {
    const s = this.earningsSummary();
    const p = this.earningsPeriod();
    return p === 'today' ? s.today : p === 'week' ? s.week : p === 'month' ? s.month : s.all;
  });

  earningsPeriodTrips = computed(() => {
    const all   = this.trips();
    const now   = new Date();
    const p     = this.earningsPeriod();
    if (p === 'today') return all.filter(t => new Date(t.trip_date).toDateString() === now.toDateString());
    if (p === 'week')  { const w = new Date(now); w.setDate(now.getDate() - 7); return all.filter(t => new Date(t.trip_date) >= w); }
    if (p === 'month') { const m = new Date(now); m.setDate(now.getDate() - 30); return all.filter(t => new Date(t.trip_date) >= m); }
    return all;
  });

  earningsByDay = computed(() => {
    const trips = this.earningsPeriodTrips();
    const map = new Map<string, { label: string; dateTs: number; count: number; charged: number; earnings: number }>();
    trips.forEach(t => {
      const d   = new Date(t.trip_date);
      const key = d.toDateString();
      const ex  = map.get(key) ?? { label: key, dateTs: d.getTime(), count: 0, charged: 0, earnings: 0 };
      map.set(key, {
        ...ex,
        count:    ex.count    + 1,
        charged:  ex.charged  + Number(t.total_amount),
        earnings: ex.earnings + Number(t.driver_earnings),
      });
    });
    const days = Array.from(map.values()).sort((a, b) => b.dateTs - a.dateTs);
    const maxEarnings = Math.max(...days.map(d => d.earnings), 1);
    return days.map(d => ({ ...d, barPct: Math.round((d.earnings / maxEarnings) * 100) }));
  });

  readonly earningsPeriodLabels: { key: 'today'|'week'|'month'|'all'; label: string }[] = [
    { key: 'today', label: 'Hoy' },
    { key: 'week',  label: 'Semana' },
    { key: 'month', label: 'Mes' },
    { key: 'all',   label: 'Total' },
  ];

  // Autocomplete + Route
  placeSearchQuery  = signal('');
  placeSuggestions  = signal<PlaceSuggestion[]>([]);
  placesLoading     = signal(false);
  routeInfo         = signal<RouteInfo | null>(null);
  routeGeometry     = signal<any>(null);
  private _placeSearchTimer: any = null;

  // GPS Tracking
  driverLatLng      = signal<{ lat: number; lng: number } | null>(null);
  gpsTracking       = signal(false);
  private _driverMarker:    any   = null;
  private _gpsWatchId:      number | null = null;
  private _locationChannel: any   = null;
  private _gpsBroadcastChannel: any = null;

  // Security
  emergencyContactName  = signal('');
  emergencyContactPhone = signal('');
  savingContact         = signal(false);
  contactSaved          = signal(false);
  selfiePreviewUrl      = signal('');
  selfieUploading       = signal(false);
  panicSent             = signal(false);

  // Passenger flow
  rideOrigin          = signal<{ lat: number; lng: number; address: string } | null>(null);
  rideDest            = signal<{ lat: number; lng: number; address: string } | null>(null);
  offeredPrice        = signal('');
  activeRideRequest   = signal<AgRideRequest | null>(null);
  searchTimer         = signal(300); // 5 min in seconds
  chatMessages        = signal<AgChatMessage[]>([]);
  chatInput           = signal('');
  tripTab             = signal<'map' | 'chat'>('map');
  ratingStars         = signal(0);
  ratingComment       = signal('');
  mapPickingAddress   = signal('');
  mapLoading          = signal(false);
  gpsError            = signal('');

  readonly quickPrices = [5000, 8000, 10000, 12000, 15000, 20000];

  // Driver flow
  driverAvailable       = signal(false);
  pendingRequests       = signal<AgRideRequest[]>([]);
  requestsLoading       = signal(false);
  activeDriverRide      = signal<AgRideRequest | null>(null);
  driverTripTab         = signal<'map' | 'chat'>('map');
  driverRatingStars     = signal(0);
  driverRatingComment   = signal('');
  driverChatMessages    = signal<AgChatMessage[]>([]);
  driverChatInput       = signal('');
  private _driverRideChannel: any = null;
  private _newRequestsChannel: any = null;
  private _driverChatChannel: any = null;

  searchTimerDisplay = computed(() => {
    const s = this.searchTimer();
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, '0')}`;
  });

  // Private refs for cleanup
  private _map: any = null;
  private _skipNextMoveEnd = false; // evita que moveend sobreescriba un lugar seleccionado del buscador
  private _rideChannel: any = null;
  private _chatChannel: any = null;
  private _timerInterval: any = null;
  private _leafletLoaded = false;

  // Admin
  adminTab        = signal<'pending' | 'all'>('pending');
  adminLoading    = signal(false);
  allDrivers      = signal<AgDriver[]>([]);
  rejectingDriver = signal<AgDriver | null>(null);
  rejectionReason = signal('');
  adminStats      = signal({ pending: 0, approved: 0, rejected: 0, total: 0 });

  filteredDrivers = () => {
    const tab = this.adminTab();
    const drivers = this.allDrivers();
    return tab === 'pending' ? drivers.filter(d => d.status === 'pending') : drivers;
  };

  driverFormValid = () =>
    !!this.fullName().trim() && !!this.licenseNumber().trim() &&
    !!this.vehiclePlate().trim() && !!this.vehicleBrand().trim() && !!this.vehicleModel().trim();

  async ngOnInit() {
    const [profile, agUser] = await Promise.all([
      this.svc.getMainProfile(),
      this.svc.getMyAgUser(),
    ]);
    this.isAdmin.set(profile?.role === 'admin' || profile?.role === 'dev');
    this.agUser.set(agUser);

    // Si hay un viaje ACTIVO en progreso, redirigir directo sin pasar por welcome
    if (agUser?.role === 'passenger') {
      const active = await this.svc.getActiveRideRequest(agUser.id);
      this.activeRideRequest.set(active);
      if (active && (active.status === 'pending' || active.status === 'accepted' || active.status === 'in_progress')) {
        if (active.status === 'pending') {
          this.startSearchTimer();
          this.subscribeToRide(active.id);
          this.screen.set('passenger-searching');
        } else {
          this.subscribeToRide(active.id);
          this.screen.set('passenger-trip');
          if (active.driver_id) this.subscribeToDriverGps(active.driver_id);
        }
        return;
      }
    } else if (agUser?.role === 'driver') {
      const status = agUser.driver?.status;
      if (status === 'approved') {
        this.driverAvailable.set(agUser.driver?.is_available ?? false);
        const activeRide = await this.svc.getDriverActiveRideRequest(agUser.driver!.id);
        if (activeRide) {
          this.activeDriverRide.set(activeRide);
          this.subscribeToDriverRide(activeRide.id);
          this.screen.set('driver-trip-active');
          setTimeout(() => this.initDriverTripMap(), 50);
          setTimeout(() => this.startGpsBroadcasting(), 200);
          return;
        }
      }
    }

    // Siempre mostrar welcome con los 2 botones al entrar
    this.screen.set('welcome');
    if (this.isAdmin() && !agUser) {
      // Admin sin cuenta AG puede ir al panel desde welcome
    }
  }

  /** Navega al home correcto si el usuario ya tiene cuenta, o inicia registro si no */
  async chooseRole(role: 'passenger' | 'driver') {
    const agUser = this.agUser();

    if (agUser) {
      // Usuario ya tiene cuenta — llevar directo a su panel
      if (agUser.role === 'passenger' && role === 'passenger') {
        this.screen.set('passenger-home');
        return;
      }
      if (agUser.role === 'driver' && role === 'driver') {
        const status = agUser.driver?.status;
        if (status === 'approved') {
          this.screen.set('driver-home');
          await this.loadTrips();
        } else {
          this.screen.set(status === 'rejected' ? 'rejected' : 'pending');
        }
        return;
      }
    }

    // Sin cuenta — iniciar registro
    this.selectedRole.set(role);
    this.screen.set('enter-phone');
    this.error.set('');
  }

  async sendCode() {
    if (this.phone().length < 10) return;
    this.loading.set(true);
    this.error.set('');
    const code = await this.svc.sendVerificationCode('+57' + this.phone());
    this.pendingCode.set(code);
    this.loading.set(false);
    this.screen.set('verify-code');
  }

  async confirmCode() {
    this.loading.set(true);
    this.error.set('');
    const ok = await this.svc.verifyCode('+57' + this.phone(), this.verificationCode());
    if (!ok) {
      this.error.set('Código incorrecto o expirado. Intenta de nuevo.');
      this.loading.set(false);
      return;
    }
    this.loading.set(false);
    this.screen.set(this.selectedRole() === 'passenger' ? 'register-passenger' : 'register-driver');
  }

  async registerPassenger() {
    if (!this.fullName().trim()) return;
    this.loading.set(true);
    this.error.set('');
    const user = await this.svc.registerUser('passenger', this.fullName().trim(), '+57' + this.phone());
    if (!user) {
      this.error.set('Error al crear cuenta. Intenta de nuevo.');
      this.loading.set(false);
      return;
    }
    this.agUser.set(user);
    this.loading.set(false);
    this.screen.set('passenger-home');
  }

  async registerDriver() {
    if (!this.driverFormValid()) return;
    this.loading.set(true);
    this.error.set('');
    const user = await this.svc.registerUser('driver', this.fullName().trim(), '+57' + this.phone());
    if (!user) {
      this.error.set('Error al crear cuenta. Intenta de nuevo.');
      this.loading.set(false);
      return;
    }
    const ok = await this.svc.saveDriverData(user.id, {
      licenseNumber: this.licenseNumber().trim(),
      vehiclePlate: this.vehiclePlate().trim().toUpperCase(),
      vehicleBrand: this.vehicleBrand().trim(),
      vehicleModel: this.vehicleModel().trim(),
      vehicleYear: this.vehicleYear() ? parseInt(this.vehicleYear()) : undefined,
      soatExpiry: this.soatExpiry() || undefined,
      licensePhotoUrl: this.licensePhotoUrl() || undefined,
      vehiclePhotoUrl: this.vehiclePhotoUrl() || undefined,
      soatPhotoUrl: this.soatPhotoUrl() || undefined,
    });
    this.loading.set(false);
    if (ok) {
      this.agUser.set({ ...user });
      this.screen.set('pending');
    } else {
      this.error.set('Error al guardar datos del vehículo. Intenta de nuevo.');
    }
  }

  async uploadFile(event: Event, type: 'license' | 'vehicle' | 'soat') {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const { data: { user } } = await (this.svc as any).supabase.auth.getUser().catch(() => ({ data: { user: null } }));
    const userId = user?.id || 'unknown';

    if (type === 'license') this.uploadingLicense.set(true);
    else if (type === 'vehicle') this.uploadingVehicle.set(true);
    else this.uploadingSoat.set(true);

    const url = await this.svc.uploadDriverDoc(file, userId, type);

    if (type === 'license') { this.uploadingLicense.set(false); if (url) this.licensePhotoUrl.set(url); }
    else if (type === 'vehicle') { this.uploadingVehicle.set(false); if (url) this.vehiclePhotoUrl.set(url); }
    else { this.uploadingSoat.set(false); if (url) this.soatPhotoUrl.set(url); }
  }

  async loadTrips() {
    const driver = this.agUser()?.driver;
    if (!driver) return;
    this.tripsLoading.set(true);
    const all = await this.svc.getMyTrips(driver.id);
    this.trips.set(all);
    this.tripsLoading.set(false);
  }

  async saveTrip() {
    const driver = this.agUser()?.driver;
    if (!driver || !this.tripOrigin().trim() || !this.tripDestination().trim() || +this.tripAmount() <= 0) return;
    this.savingTrip.set(true);
    this.tripError.set('');
    const trip = await this.svc.registerTrip(driver.id, {
      origin: this.tripOrigin().trim(),
      destination: this.tripDestination().trim(),
      totalAmount: +this.tripAmount(),
      passengerName: this.tripPassengerName().trim() || undefined,
      distanceKm: this.tripDistanceKm() ? +this.tripDistanceKm() : undefined,
      durationMinutes: this.tripDuration() ? +this.tripDuration() : undefined,
    });
    this.savingTrip.set(false);
    if (!trip) { this.tripError.set('Error al registrar el viaje. Intenta de nuevo.'); return; }
    // Limpiar formulario y recargar
    this.tripOrigin.set(''); this.tripDestination.set(''); this.tripAmount.set('');
    this.tripPassengerName.set(''); this.tripDistanceKm.set(''); this.tripDuration.set('');
    this.showTripForm.set(false);
    await this.loadTrips();
  }

  async loadAdminData() {
    this.adminLoading.set(true);
    const [drivers, stats] = await Promise.all([
      this.svc.getAllDrivers(),
      this.svc.getDriverStats(),
    ]);
    this.allDrivers.set(drivers);
    this.adminStats.set(stats);
    this.adminLoading.set(false);
  }

  openReject(driver: AgDriver) {
    this.rejectingDriver.set(driver);
    this.rejectionReason.set('');
  }

  async approve(driverId: string) {
    await this.svc.approveDriver(driverId);
    await this.loadAdminData();
  }

  async reject() {
    const driver = this.rejectingDriver();
    if (!driver || !this.rejectionReason().trim()) return;
    await this.svc.rejectDriver(driver.id, this.rejectionReason().trim());
    this.rejectingDriver.set(null);
    await this.loadAdminData();
  }

  // ─────────────────────────────────────────────────────────────
  // PASSENGER FLOW METHODS
  // ─────────────────────────────────────────────────────────────

  async startRideRequest() {
    this.rideOrigin.set(null);
    this.rideDest.set(null);
    this.offeredPrice.set('');
    this.error.set('');
    this.gpsError.set('');

    if (!isPlatformBrowser(this.platformId) || !navigator.geolocation) {
      this.screen.set('passenger-pick-origin');
      this.initPickMap('ag-map-origin', 4.711, -74.0721, (lat, lng) => this.onOriginPick(lat, lng));
      return;
    }

    this.screen.set('passenger-gps-wait');
    this.mapLoading.set(true);

    let lat = 4.711, lng = -74.0721;
    try {
      const pos = await this.getGpsPosition(true);
      lat = pos.coords.latitude;
      lng = pos.coords.longitude;
    } catch (err: any) {
      this.mapLoading.set(false);
      if (err?.code === 1) {
        // Permiso denegado — mostrar error y esperar que el usuario reintente
        this.gpsError.set('Permiso de GPS denegado. Activa la ubicación en la configuración de tu navegador y vuelve a intentar.');
        return;
      } else if (err?.code === 2) {
        this.gpsError.set('No se pudo detectar tu posición. Verifica que el GPS de tu dispositivo esté activado.');
        return;
      }
      // Timeout u otro error — abrimos con Bogotá para no bloquear al usuario
      this.gpsError.set('El GPS tardó demasiado. Puedes buscar tu dirección en el mapa manualmente.');
    }

    this.mapLoading.set(false);
    this.screen.set('passenger-pick-origin');
    this.initPickMap('ag-map-origin', lat, lng, (lt, ln) => this.onOriginPick(lt, ln));
  }

  openMapWithDefault() {
    this.screen.set('passenger-pick-origin');
    this.initPickMap('ag-map-origin', 4.711, -74.0721, (lat, lng) => this.onOriginPick(lat, lng));
  }

  async retryGps() {
    this.gpsError.set('');
    this.mapLoading.set(true);
    if (!navigator.geolocation) { this.mapLoading.set(false); return; }

    let lat = 4.711, lng = -74.0721;
    try {
      const pos = await this.getGpsPosition(true);
      lat = pos.coords.latitude;
      lng = pos.coords.longitude;
    } catch (err: any) {
      this.mapLoading.set(false);
      if (err?.code === 1) {
        this.gpsError.set('GPS sigue denegado. Ve a la configuración de tu navegador, busca "Ubicación" y permite el acceso a este sitio.');
        return;
      }
      this.gpsError.set('No se pudo obtener GPS. Continúa sin él y escribe tu dirección en el buscador del mapa.');
    }

    this.mapLoading.set(false);
    this.screen.set('passenger-pick-origin');
    this.initPickMap('ag-map-origin', lat, lng, (lt, ln) => this.onOriginPick(lt, ln));
  }

  goBackToOrigin() {
    this.screen.set('passenger-pick-origin');
    const o = this.rideOrigin();
    this.initPickMap('ag-map-origin', o?.lat ?? 4.711, o?.lng ?? -74.0721, (lat, lng) => this.onOriginPick(lat, lng));
  }

  confirmOrigin() {
    if (!this.rideOrigin()) return;
    this.placeSuggestions.set([]); this.placeSearchQuery.set('');
    this.screen.set('passenger-pick-dest');
    const o = this.rideOrigin()!;
    this.initPickMap('ag-map-dest', o.lat, o.lng, (lat, lng) => this.onDestPick(lat, lng));
  }

  confirmDest() {
    if (!this.rideDest()) return;
    this.placeSuggestions.set([]); this.placeSearchQuery.set('');
    this.destroyMap();
    this.screen.set('passenger-offer');
    this.loadRoute();
  }

  async sendRideRequest() {
    const user = this.agUser();
    const origin = this.rideOrigin();
    const dest = this.rideDest();
    const price = parseFloat(this.offeredPrice());
    if (!user || !origin || !dest || isNaN(price) || price <= 0) {
      this.error.set('Completa todos los campos correctamente.');
      return;
    }
    this.loading.set(true);
    this.error.set('');
    const req = await this.svc.createRideRequest(user.id, {
      originAddress: origin.address,
      originLat: origin.lat,
      originLng: origin.lng,
      destAddress: dest.address,
      destLat: dest.lat,
      destLng: dest.lng,
      offeredPrice: price,
    });
    this.loading.set(false);
    if (!req) {
      this.error.set('Error al enviar la solicitud. Intenta de nuevo.');
      return;
    }
    this.activeRideRequest.set(req);
    this.startSearchTimer();
    this.subscribeToRide(req.id);
    this.screen.set('passenger-searching');
  }

  async cancelRide() {
    const req = this.activeRideRequest();
    if (!req) return;
    this.loading.set(true);
    await this.svc.cancelRideRequest(req.id);
    this.cleanupRide();
    this.activeRideRequest.set(null);
    this.loading.set(false);
    this.screen.set('passenger-home');
  }

  resumeActiveRide() {
    const req = this.activeRideRequest();
    if (!req) return;
    if (req.status === 'pending') {
      this.screen.set('passenger-searching');
    } else if (req.status === 'accepted' || req.status === 'in_progress') {
      this.screen.set('passenger-trip');
      setTimeout(() => this.initTripMap(), 50);
    }
  }

  async finishTrip() {
    const req = this.activeRideRequest();
    if (!req) return;
    this.screen.set('passenger-rating');
    this.cleanupRide();
  }

  async submitRating() {
    const req = this.activeRideRequest();
    const user = this.agUser();
    if (!req || !user || this.ratingStars() === 0) return;
    this.loading.set(true);
    this.error.set('');
    const ok = await this.svc.submitRating(
      req.id, user.id, req.driver_id!, this.ratingStars(), this.ratingComment()
    );
    this.loading.set(false);
    if (!ok) { this.error.set('Error al enviar calificación.'); return; }
    this.activeRideRequest.set(null);
    this.screen.set('passenger-home');
  }

  skipRating() {
    this.activeRideRequest.set(null);
    this.screen.set('passenger-home');
  }

  async loadChat() {
    const req = this.activeRideRequest();
    if (!req) return;
    const msgs = await this.svc.getChatMessages(req.id);
    this.chatMessages.set(msgs);
    this.subscribeToChatMessages(req.id);
  }

  async sendChat() {
    const msg = this.chatInput().trim();
    const req = this.activeRideRequest();
    const user = this.agUser();
    if (!msg || !req || !user) return;
    this.chatInput.set('');
    await this.svc.sendChatMessage(req.id, user.id, msg);
  }

  // ── Map helpers ──

  private async loadLeaflet(): Promise<any> {
    if (!isPlatformBrowser(this.platformId)) return null;
    if ((window as any).L) return (window as any).L;
    if (!document.getElementById('leaflet-css')) {
      const link = document.createElement('link');
      link.id = 'leaflet-css';
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(link);
    }
    return new Promise(resolve => {
      const script = document.createElement('script');
      script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      script.onload = () => { this._leafletLoaded = true; resolve((window as any).L); };
      document.head.appendChild(script);
    });
  }

  // ── Light tile layer (CARTO Voyager — claro, sin API key, mismo CDN que ya funciona) ──
  private addTiles(map: any, L: any) {
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> © <a href="https://carto.com/attributions">CARTO</a>',
      subdomains: 'abcd',
      maxZoom: 19,
    }).addTo(map);
  }

  // ── Origin pin (orange) for map ──
  private originIcon(L: any) {
    return L.divIcon({
      className: '',
      html: `<div style="display:flex;flex-direction:column;align-items:center">
               <div style="width:18px;height:18px;border-radius:50%;background:#f97316;border:3px solid white;box-shadow:0 0 0 4px rgba(249,115,22,0.3),0 4px 12px rgba(0,0,0,0.5)"></div>
             </div>`,
      iconSize: [18, 18],
      iconAnchor: [9, 9],
    });
  }

  // ── Destination pin (red) ──
  private destIcon(L: any) {
    return L.divIcon({
      className: '',
      html: `<div style="display:flex;flex-direction:column;align-items:center">
               <div style="width:18px;height:18px;border-radius:50%;background:#ef4444;border:3px solid white;box-shadow:0 0 0 4px rgba(239,68,68,0.3),0 4px 12px rgba(0,0,0,0.5)"></div>
             </div>`,
      iconSize: [18, 18],
      iconAnchor: [9, 9],
    });
  }

  // ── Animated car icon for driver ──
  private carIcon(L: any, color = '#22c55e') {
    return L.divIcon({
      className: '',
      html: `<div style="width:44px;height:44px;border-radius:50%;background:${color};border:3px solid white;box-shadow:0 0 0 6px ${color}33,0 4px 16px rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;transition:all 0.5s ease">
               <span class="material-symbols-outlined" style="font-size:22px;color:white;font-variation-settings:'FILL' 1">directions_car</span>
             </div>`,
      iconSize: [44, 44],
      iconAnchor: [22, 22],
    });
  }

  // ── Draw GeoJSON route on map ──
  private drawRoute(map: any, L: any, geometry: any) {
    if (!geometry) return;
    try {
      L.geoJSON(geometry, {
        style: {
          color: '#f97316',
          weight: 6,
          opacity: 0.9,
          lineCap: 'round',
          lineJoin: 'round',
        },
      }).addTo(map);
      // White outline below for contrast
      L.geoJSON(geometry, {
        style: {
          color: 'rgba(255,255,255,0.15)',
          weight: 10,
          opacity: 1,
          lineCap: 'round',
          lineJoin: 'round',
        },
      }).addTo(map);
    } catch {}
  }

  /** Espera hasta que el elemento exista en el DOM (OnPush puede demorar varios frames) */
  private waitForDomElement(id: string): Promise<HTMLElement | null> {
    return new Promise(resolve => {
      const attempt = (tries: number) => {
        const el = document.getElementById(id);
        if (el) { resolve(el); return; }
        if (tries <= 0) { resolve(null); return; }
        requestAnimationFrame(() => attempt(tries - 1));
      };
      attempt(60); // hasta ~1 segundo a 60fps
    });
  }

  /** Promesa para obtener GPS — envuelve el callback en zona Angular */
  private getGpsPosition(highAccuracy = true): Promise<GeolocationPosition> {
    return new Promise((resolve, reject) =>
      navigator.geolocation.getCurrentPosition(
        pos => this.zone.run(() => resolve(pos)),
        err => this.zone.run(() => reject(err)),
        { enableHighAccuracy: highAccuracy, timeout: 15000, maximumAge: 30000 }
      )
    );
  }

  // ── Pick map: center-pin approach, instant GPS ──
  private async initPickMap(elementId: string, lat: number, lng: number, onPick: (lat: number, lng: number) => void) {
    const L = await this.loadLeaflet();
    if (!L) return;
    this.destroyMap();
    // Espera real a que Angular renderice el div (OnPush puede demorar más que setTimeout fijo)
    const el = await this.waitForDomElement(elementId);
    if (!el) return;
    this.mapLoading.set(true);

    // Set position IMMEDIATELY so confirm button is enabled right away
    onPick(lat, lng);
    this.mapPickingAddress.set('Detectando dirección...');

    const map = L.map(el, { zoomControl: false, attributionControl: false }).setView([lat, lng], 16);
    this.addTiles(map, L);

    L.control.zoom({ position: 'bottomright' }).addTo(map);
    L.control.attribution({ position: 'bottomright', prefix: '' }).addTo(map);

    // On map move: update position immediately, geocode asynchronously
    const handleCenter = () => {
      // Si el usuario seleccionó un lugar del buscador, ignorar este moveend
      if (this._skipNextMoveEnd) { this._skipNextMoveEnd = false; return; }
      const center = map.getCenter();
      onPick(center.lat, center.lng); // habilita el botón confirmar al instante
      this.zone.run(async () => {
        this.mapPickingAddress.set('Obteniendo dirección...');
        const addr = await this.svc.reverseGeocode(center.lat, center.lng);
        this.zone.run(() => {
          this.mapPickingAddress.set(addr);
          onPick(center.lat, center.lng);
        });
      });
    };

    map.on('moveend', handleCenter);
    this._map = map;
    this.mapLoading.set(false);

    // Forzar redibujado de tiles (esencial cuando el contenedor acababa de aparecer en DOM)
    setTimeout(() => { if (this._map) { this._map.invalidateSize(); handleCenter(); } }, 200);

    // Show available drivers on map (those with real GPS location in DB)
    this.showDriversOnMap(map, L);
  }

  // ── Trip map (passenger): origin + dest + route + driver marker ──
  private async initTripMap() {
    const req = this.activeRideRequest();
    if (!req) return;
    const L = await this.loadLeaflet();
    if (!L) return;
    this.destroyMap();
    const el = await this.waitForDomElement('ag-map-trip');
    if (!el) return;

    const map = L.map(el, { zoomControl: false, attributionControl: false }).setView([req.origin_lat, req.origin_lng], 14);
    this.addTiles(map, L);
    L.control.zoom({ position: 'bottomright' }).addTo(map);

    // Origin and dest markers
    L.marker([req.origin_lat, req.origin_lng], { icon: this.originIcon(L) }).addTo(map)
      .bindPopup('<b style="color:#f97316">Origen</b>');
    L.marker([req.dest_lat, req.dest_lng], { icon: this.destIcon(L) }).addTo(map)
      .bindPopup('<b style="color:#ef4444">Destino</b>');

    // Route from geometry if available, fallback to straight dashed line
    const geo = this.routeGeometry();
    if (geo) {
      this.drawRoute(map, L, geo);
    } else {
      L.polyline([[req.origin_lat, req.origin_lng], [req.dest_lat, req.dest_lng]], {
        color: '#f97316', weight: 5, opacity: 0.8, dashArray: '10,8',
      }).addTo(map);
    }

    // Driver marker if we have location
    const dloc = this.driverLatLng();
    if (dloc) {
      this._driverMarker = L.marker([dloc.lat, dloc.lng], { icon: this.carIcon(L) }).addTo(map);
    }

    map.fitBounds([[req.origin_lat, req.origin_lng], [req.dest_lat, req.dest_lng]], { padding: [60, 60] });
    this._map = map;
  }

  // ── Show available drivers with real GPS position on map ──
  private async showDriversOnMap(map: any, L: any) {
    try {
      const drivers = await this.svc.getAvailableDriversWithLocation();
      this.zone.run(() => {
        drivers.forEach(d => {
          if (!map) return;
          L.marker([d.lat, d.lng], { icon: this.carIcon(L, '#f59e0b') })
            .addTo(map)
            .bindPopup(`<div style="font-weight:900;color:#d97706;font-size:13px">🚗 ${d.plate || 'Conductor disponible'}</div>`);
        });
      });
    } catch {}
  }

  private destroyMap() {
    if (this._driverMarker) { try { this._map?.removeLayer(this._driverMarker); } catch {} this._driverMarker = null; }
    if (this._map) {
      try { this._map.remove(); } catch {}
      this._map = null;
    }
    this.mapPickingAddress.set('');
  }

  // ── Origin / Dest pick callbacks ──

  private onOriginPick(lat: number, lng: number) {
    this.rideOrigin.set({ lat, lng, address: this.mapPickingAddress() });
  }

  private onDestPick(lat: number, lng: number) {
    this.rideDest.set({ lat, lng, address: this.mapPickingAddress() });
  }

  async useCurrentLocationOrigin() {
    if (!isPlatformBrowser(this.platformId)) return;
    if (!navigator.geolocation) {
      this.gpsError.set('Tu navegador no soporta GPS. Escribe la dirección manualmente.');
      return;
    }
    this.mapLoading.set(true);
    this.gpsError.set('');
    navigator.geolocation.getCurrentPosition(
      pos => {
        this.zone.run(() => {
          this.mapLoading.set(false);
          this.gpsError.set('');
          if (this._map) {
            this._map.setView([pos.coords.latitude, pos.coords.longitude], 17, { animate: true });
          } else {
            this.initPickMap('ag-map-origin', pos.coords.latitude, pos.coords.longitude, (lat, lng) => this.onOriginPick(lat, lng));
          }
        });
      },
      err => {
        this.zone.run(() => {
          this.mapLoading.set(false);
          if (err.code === 1) {
            this.gpsError.set('GPS denegado. Activa la ubicación en tu navegador y vuelve a intentar, o escribe la dirección en el buscador.');
          } else if (err.code === 2) {
            this.gpsError.set('No se pudo obtener tu posición. Verifica tu conexión o escribe la dirección.');
          } else {
            this.gpsError.set('GPS tardó demasiado. Escribe la dirección manualmente o intenta de nuevo.');
          }
        });
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
    );
  }

  // ── Realtime subscriptions ──

  private subscribeToRide(id: string) {
    this._rideChannel = this.svc.subscribeToRideRequest(id, req => {
      this.zone.run(() => {
        this.activeRideRequest.set(req);
        if (req.status === 'accepted' || req.status === 'in_progress') {
          clearInterval(this._timerInterval);
          this.screen.set('passenger-trip');
          setTimeout(() => this.initTripMap(), 50);
          if (req.driver_id) this.subscribeToDriverGps(req.driver_id);
        } else if (req.status === 'cancelled' || req.status === 'completed') {
          this.cleanupRide();
          this.screen.set('passenger-home');
        }
      });
    });
  }

  private subscribeToChatMessages(requestId: string) {
    if (this._chatChannel) return; // already subscribed
    this._chatChannel = this.svc.subscribeToChat(requestId, msg => {
      this.zone.run(() => {
        this.chatMessages.update(list => [...list, msg]);
      });
    });
  }

  // ── Search timer ──

  private startSearchTimer() {
    this.searchTimer.set(300);
    clearInterval(this._timerInterval);
    this._timerInterval = setInterval(() => {
      this.zone.run(() => {
        const t = this.searchTimer() - 1;
        this.searchTimer.set(t);
        if (t <= 0) {
          clearInterval(this._timerInterval);
          this.cancelRide();
        }
      });
    }, 1000);
  }

  private cleanupRide() {
    clearInterval(this._timerInterval);
    if (this._rideChannel) { try { this._rideChannel.unsubscribe(); } catch {} this._rideChannel = null; }
    if (this._chatChannel) { try { this._chatChannel.unsubscribe(); } catch {} this._chatChannel = null; }
    this.destroyMap();
    this.chatMessages.set([]);
  }

  // ─────────────────────────────────────────────────────────────
  // DRIVER FLOW METHODS
  // ─────────────────────────────────────────────────────────────

  openEarnings() {
    this.screen.set('driver-earnings');
    if (this.trips().length === 0) this.loadTrips();
  }

  async toggleDriverAvailability() {
    const driver = this.agUser()?.driver;
    if (!driver) return;
    const newVal = !this.driverAvailable();
    this.driverAvailable.set(newVal);
    await this.svc.setDriverAvailability(driver.id, newVal);
    if (!newVal && this.screen() === 'driver-requests') {
      this.closeDriverRequests();
    }
  }

  async openDriverRequests() {
    this.screen.set('driver-requests');
    this.error.set('');
    await this.loadPendingRequests();
    // Subscibe to new incoming requests in real time
    if (!this._newRequestsChannel) {
      this._newRequestsChannel = this.svc.subscribeToNewRequests(req => {
        this.zone.run(() => {
          this.pendingRequests.update(list => [req, ...list.filter(r => r.id !== req.id)]);
          this.refreshDriverRequestsMap();
        });
      });
    }
    setTimeout(() => this.initDriverRequestsMap(), 80);
  }

  closeDriverRequests() {
    if (this._newRequestsChannel) {
      try { this._newRequestsChannel.unsubscribe(); } catch {}
      this._newRequestsChannel = null;
    }
    this.destroyMap();
    this.screen.set('driver-home');
  }

  async loadPendingRequests() {
    this.requestsLoading.set(true);
    const reqs = await this.svc.getPendingRideRequests();
    this.pendingRequests.set(reqs);
    this.requestsLoading.set(false);
    this.refreshDriverRequestsMap();
  }

  ignoreRequest(req: AgRideRequest) {
    this.pendingRequests.update(list => list.filter(r => r.id !== req.id));
    this.refreshDriverRequestsMap();
  }

  async acceptRequest(req: AgRideRequest) {
    const driver = this.agUser()?.driver;
    if (!driver) return;
    this.loading.set(true);
    const ok = await this.svc.acceptRideRequest(req.id, driver.id);
    this.loading.set(false);
    if (!ok) {
      this.error.set('No se pudo aceptar: ya fue tomado por otro conductor.');
      await this.loadPendingRequests();
      return;
    }
    // Reload with passenger info
    const accepted = await this.svc.getDriverActiveRideRequest(driver.id);
    this.activeDriverRide.set(accepted);
    this.subscribeToDriverRide(req.id);
    if (this._newRequestsChannel) {
      try { this._newRequestsChannel.unsubscribe(); } catch {}
      this._newRequestsChannel = null;
    }
    this.destroyMap();
    this.screen.set('driver-trip-active');
    setTimeout(() => this.initDriverTripMap(), 50);
    setTimeout(() => this.startGpsBroadcasting(), 200);
  }

  async driverStartTrip() {
    const ride = this.activeDriverRide();
    if (!ride) return;
    this.loading.set(true);
    const ok = await this.svc.startTrip(ride.id);
    this.loading.set(false);
    if (ok) {
      this.activeDriverRide.update(r => r ? { ...r, status: 'in_progress' } : r);
    }
  }

  async driverFinishTrip() {
    const ride = this.activeDriverRide();
    if (!ride) return;
    this.loading.set(true);
    const ok = await this.svc.completeRideRequest(ride.id);
    // Also register in ag_trips for the history
    if (ok && this.agUser()?.driver) {
      await this.svc.registerTrip(this.agUser()!.driver!.id, {
        origin: ride.origin_address,
        destination: ride.dest_address,
        totalAmount: ride.offered_price,
        passengerName: ride.passenger?.full_name,
      });
    }
    this.loading.set(false);
    this.cleanupDriverRide();
    this.driverRatingStars.set(0);
    this.driverRatingComment.set('');
    this.screen.set('driver-rate-passenger');
  }

  async loadDriverChat() {
    const ride = this.activeDriverRide();
    if (!ride) return;
    const msgs = await this.svc.getChatMessages(ride.id);
    this.driverChatMessages.set(msgs);
    if (!this._driverChatChannel) {
      this._driverChatChannel = this.svc.subscribeToChat(ride.id, msg => {
        this.zone.run(() => this.driverChatMessages.update(list => [...list, msg]));
      });
    }
  }

  async sendDriverChat() {
    const msg = this.driverChatInput().trim();
    const ride = this.activeDriverRide();
    const user = this.agUser();
    if (!msg || !ride || !user) return;
    this.driverChatInput.set('');
    await this.svc.sendChatMessage(ride.id, user.id, msg);
  }

  async submitDriverRating() {
    const ride = this.activeDriverRide();
    const driver = this.agUser()?.driver;
    if (!ride || !driver || this.driverRatingStars() === 0) return;
    this.loading.set(true);
    this.error.set('');
    const ok = await this.svc.submitPassengerRating(
      ride.id, driver.id, ride.passenger_id, this.driverRatingStars(), this.driverRatingComment()
    );
    this.loading.set(false);
    if (!ok) { this.error.set('Error al enviar calificación.'); return; }
    this.activeDriverRide.set(null);
    await this.loadTrips();
    this.screen.set('driver-home');
  }

  skipDriverRating() {
    this.activeDriverRide.set(null);
    this.loadTrips();
    this.screen.set('driver-home');
  }

  driverNavUrl(app: 'google' | 'waze'): string {
    const ride = this.activeDriverRide();
    if (!ride) return '#';
    const isPickup = ride.status === 'accepted';
    const lat = isPickup ? ride.origin_lat : ride.dest_lat;
    const lng = isPickup ? ride.origin_lng : ride.dest_lng;
    if (app === 'google') {
      return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`;
    }
    return `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`;
  }

  private subscribeToDriverRide(requestId: string) {
    if (this._driverRideChannel) return;
    this._driverRideChannel = this.svc.subscribeToDriverRide(requestId, ride => {
      this.zone.run(() => {
        this.activeDriverRide.set(ride);
        if (ride.status === 'cancelled') {
          this.cleanupDriverRide();
          this.screen.set('driver-home');
          this.loadTrips();
        }
      });
    });
  }

  // ── Driver map helpers ──

  private async initDriverRequestsMap() {
    const L = await this.loadLeaflet();
    if (!L) return;
    this.destroyMap();
    const el = await this.waitForDomElement('ag-map-driver-requests');
    if (!el) return;
    const reqs = this.pendingRequests();

    // Center: user's GPS if available, else first request, else Bogotá
    const getCenter = (): [number, number] => {
      if (reqs.length > 0) return [reqs[0].origin_lat, reqs[0].origin_lng];
      return [4.711, -74.0721];
    };

    const map = L.map(el, { zoomControl: false, attributionControl: false }).setView(getCenter(), 13);
    this.addTiles(map, L);
    L.control.zoom({ position: 'bottomright' }).addTo(map);

    // Try to show driver's own position
    if (isPlatformBrowser(this.platformId) && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(pos => {
        this.zone.run(() => {
          if (this._map) {
            L.marker([pos.coords.latitude, pos.coords.longitude], { icon: this.carIcon(L, '#f59e0b') })
              .addTo(this._map)
              .bindPopup('<b style="color:#f59e0b">Tu posición</b>');
            if (reqs.length === 0) this._map.setView([pos.coords.latitude, pos.coords.longitude], 14);
          }
        });
      }, () => {}, { enableHighAccuracy: true, timeout: 5000 });
    }

    // Request markers with price badge
    reqs.forEach(req => {
      const icon = L.divIcon({
        className: '',
        html: `<div style="background:#f59e0b;color:#000;font-weight:900;font-size:11px;padding:4px 8px;border-radius:999px;white-space:nowrap;box-shadow:0 2px 12px rgba(245,158,11,0.6);border:2px solid rgba(255,255,255,0.3)">$${(req.offered_price / 1000).toFixed(0)}k</div>`,
        iconAnchor: [24, 12],
      });
      L.marker([req.origin_lat, req.origin_lng], { icon })
        .addTo(map)
        .bindPopup(`<b style="color:#f59e0b">$${req.offered_price.toLocaleString('es-CO')} COP</b><br><span style="color:#ccc;font-size:12px">${req.origin_address}</span>`);
    });

    this._map = map;
  }

  private refreshDriverRequestsMap() {
    if (this._map && this.screen() === 'driver-requests') {
      setTimeout(() => this.initDriverRequestsMap(), 50);
    }
  }

  private async initDriverTripMap() {
    const ride = this.activeDriverRide();
    if (!ride) return;
    const L = await this.loadLeaflet();
    if (!L) return;
    this.destroyMap();
    const el = await this.waitForDomElement('ag-map-driver-trip');
    if (!el) return;

    const isPickup = ride.status === 'accepted'; // going to pick up passenger
    const targetLat = isPickup ? ride.origin_lat : ride.dest_lat;
    const targetLng = isPickup ? ride.origin_lng : ride.dest_lng;

    const map = L.map(el, { zoomControl: false, attributionControl: false }).setView([targetLat, targetLng], 14);
    this.addTiles(map, L);
    L.control.zoom({ position: 'bottomright' }).addTo(map);

    // Origin marker (passenger pickup point)
    L.marker([ride.origin_lat, ride.origin_lng], { icon: this.originIcon(L) }).addTo(map)
      .bindPopup('<b style="color:#22c55e">Recoger pasajero</b>');

    // Destination marker
    L.marker([ride.dest_lat, ride.dest_lng], { icon: this.destIcon(L) }).addTo(map)
      .bindPopup('<b style="color:#ef4444">Destino del pasajero</b>');

    // Route from stored geometry or dashed fallback
    const geo = this.routeGeometry();
    if (geo) {
      this.drawRoute(map, L, geo);
    } else {
      L.polyline([[ride.origin_lat, ride.origin_lng], [ride.dest_lat, ride.dest_lng]], {
        color: '#f59e0b', weight: 5, opacity: 0.85, dashArray: '10,8',
      }).addTo(map);
    }

    // Try to show driver's current GPS position
    if (isPlatformBrowser(this.platformId) && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(pos => {
        this.zone.run(() => {
          if (this._map) {
            const { latitude, longitude } = pos.coords;
            this._driverMarker = L.marker([latitude, longitude], { icon: this.carIcon(L, '#f59e0b') })
              .addTo(this._map);
            // Fit bounds to show driver + destination
            const bounds = L.latLngBounds([
              [latitude, longitude],
              [targetLat, targetLng],
            ]);
            this._map.fitBounds(bounds, { padding: [60, 60] });
          }
        });
      }, () => {
        // No GPS: just fit origin to dest
        map.fitBounds([[ride.origin_lat, ride.origin_lng], [ride.dest_lat, ride.dest_lng]], { padding: [60, 60] });
      }, { enableHighAccuracy: true, timeout: 5000 });
    } else {
      map.fitBounds([[ride.origin_lat, ride.origin_lng], [ride.dest_lat, ride.dest_lng]], { padding: [60, 60] });
    }

    this._map = map;
  }

  private cleanupDriverRide() {
    this.stopGpsBroadcasting();
    if (this._driverRideChannel) { try { this._driverRideChannel.unsubscribe(); } catch {} this._driverRideChannel = null; }
    if (this._driverChatChannel) { try { this._driverChatChannel.unsubscribe(); } catch {} this._driverChatChannel = null; }
    this.destroyMap();
    this.driverChatMessages.set([]);
  }

  // ── Address autocomplete ──────────────────────────────────────

  onPlaceSearch(event: Event, type: 'origin' | 'dest') {
    const q = (event.target as HTMLInputElement).value;
    this.placeSearchQuery.set(q);
    clearTimeout(this._placeSearchTimer);
    if (q.trim().length < 2) { this.placeSuggestions.set([]); return; }
    this.placesLoading.set(true);
    this._placeSearchTimer = setTimeout(async () => {
      const center = this._map?.getCenter();
      const suggestions = await this.svc.searchPlaces(q, center?.lat, center?.lng);
      this.zone.run(() => {
        this.placeSuggestions.set(suggestions);
        this.placesLoading.set(false);
      });
    }, 400);
  }

  selectPlace(s: PlaceSuggestion, type: 'origin' | 'dest') {
    this.placeSuggestions.set([]);
    this.placeSearchQuery.set('');

    // Guardar datos del lugar antes de que moveend los pueda sobreescribir
    const name = s.name || s.address.split(',')[0];
    const address = s.address;

    if (type === 'origin') {
      this.rideOrigin.set({ lat: s.lat, lng: s.lng, address });
      this.mapPickingAddress.set(name);
    } else {
      this.rideDest.set({ lat: s.lat, lng: s.lng, address });
      this.mapPickingAddress.set(name);
    }

    if (this._map) {
      // Poner bandera para que moveend no sobreescriba el lugar seleccionado
      this._skipNextMoveEnd = true;
      this._map.setView([s.lat, s.lng], 15, { animate: true });
      // Forzar redibujado de tiles en la nueva posición
      setTimeout(() => { if (this._map) this._map.invalidateSize(); }, 300);
    }
  }

  // ── Route calculation ─────────────────────────────────────────

  async loadRoute() {
    const origin = this.rideOrigin();
    const dest   = this.rideDest();
    if (!origin || !dest) return;
    this.routeInfo.set(null);
    const info = await this.svc.calculateRoute(origin, dest);
    this.zone.run(() => {
      this.routeInfo.set(info);
      if (info?.suggested_price && !this.offeredPrice()) {
        this.offeredPrice.set(info.suggested_price.toString());
      }
      if (info?.geometry) this.routeGeometry.set(info.geometry);
    });
  }

  // ── Passenger: subscribe to driver GPS ───────────────────────

  private subscribeToDriverGps(driverId: string) {
    if (this._locationChannel) return;
    this._locationChannel = this.svc.subscribeToDriverLocationChannel(driverId, (lat, lng) => {
      this.zone.run(() => {
        this.driverLatLng.set({ lat, lng });
        this.updateDriverMarkerOnMap(lat, lng);
      });
    });
  }

  private updateDriverMarkerOnMap(lat: number, lng: number) {
    if (!this._map) return;
    if (!this._driverMarker) {
      if (isPlatformBrowser(this.platformId) && (window as any).L) {
        const L = (window as any).L;
        this._driverMarker = L.marker([lat, lng], { icon: this.carIcon(L) }).addTo(this._map);
      }
    } else {
      this._driverMarker.setLatLng([lat, lng]);
      // Smooth pan to keep driver visible
      if (!this._map.getBounds().contains([lat, lng])) {
        this._map.panTo([lat, lng], { animate: true, duration: 1 });
      }
    }
  }

  // ── Driver: start/stop GPS broadcasting ──────────────────────

  startGpsBroadcasting() {
    const driver = this.agUser()?.driver;
    if (!driver || !isPlatformBrowser(this.platformId) || !navigator.geolocation) return;
    this.gpsTracking.set(false);
    this._gpsBroadcastChannel = this.svc.createDriverBroadcastChannel(driver.id);

    this._gpsWatchId = navigator.geolocation.watchPosition(
      pos => {
        this.zone.run(() => {
          const { latitude: lat, longitude: lng } = pos.coords;
          this.gpsTracking.set(true);
          this.svc.broadcastDriverLocation(this._gpsBroadcastChannel, lat, lng);
          const ride = this.activeDriverRide();
          this.svc.upsertDriverLocation(driver.id, lat, lng, ride?.id);
        });
      },
      () => { this.zone.run(() => this.gpsTracking.set(false)); },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
    );
  }

  stopGpsBroadcasting() {
    if (this._gpsWatchId != null) {
      navigator.geolocation.clearWatch(this._gpsWatchId);
      this._gpsWatchId = null;
    }
    if (this._gpsBroadcastChannel) {
      try { this._gpsBroadcastChannel.unsubscribe(); } catch {}
      this._gpsBroadcastChannel = null;
    }
    this.gpsTracking.set(false);
  }

  openSecuritySettings() {
    const u = this.agUser();
    if (u) {
      this.emergencyContactName.set(u.emergency_contact_name || '');
      this.emergencyContactPhone.set(u.emergency_contact_phone ? u.emergency_contact_phone.replace('+57', '') : '');
    }
    this.contactSaved.set(false);
    this.screen.set('security-settings');
  }

  async saveEmergencyContact() {
    const u = this.agUser();
    if (!u) return;
    this.savingContact.set(true);
    const ok = await this.svc.updateEmergencyContact(u.id, this.emergencyContactName().trim(), '+57' + this.emergencyContactPhone().trim());
    if (ok) {
      this.agUser.set({ ...u, emergency_contact_name: this.emergencyContactName().trim(), emergency_contact_phone: '+57' + this.emergencyContactPhone().trim() });
      this.contactSaved.set(true);
      setTimeout(() => this.contactSaved.set(false), 3000);
    }
    this.savingContact.set(false);
  }

  async onSelfieFile(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file || !this.agUser()) return;
    const reader = new FileReader();
    reader.onload = e => this.zone.run(() => this.selfiePreviewUrl.set(e.target?.result as string));
    reader.readAsDataURL(file);
    this.selfieUploading.set(true);
    const url = await this.svc.uploadSelfie(this.agUser()!.id, file);
    if (url) {
      this.agUser.set({ ...this.agUser()!, selfie_url: url, selfie_verified: false });
    }
    this.selfieUploading.set(false);
  }

  async triggerPanic() {
    const req = this.activeRideRequest();
    const u   = this.agUser();
    if (!req || !u) return;
    await this.svc.triggerPanic(req.id, u.id, req.driver_id);
    this.panicSent.set(true);
    const emergencyPhone = u.emergency_contact_phone;
    const msg = this.svc.buildPanicMessage(req, u.full_name);
    const waUrl = emergencyPhone
      ? `https://wa.me/${emergencyPhone.replace('+', '')}?text=${msg}`
      : `https://wa.me/?text=${msg}`;
    if (isPlatformBrowser(this.platformId)) window.open(waUrl, '_blank');
  }

  shareTrip() {
    const req = this.activeRideRequest();
    if (!req) return;
    const msg = this.svc.buildShareTripMessage(req);
    const waUrl = `https://wa.me/?text=${msg}`;
    if (isPlatformBrowser(this.platformId)) window.open(waUrl, '_blank');
  }

  ngOnDestroy() {
    this.stopGpsBroadcasting();
    if (this._locationChannel) { try { this._locationChannel.unsubscribe(); } catch {} this._locationChannel = null; }
    if (this._placeSearchTimer) clearTimeout(this._placeSearchTimer);
    this.cleanupRide();
    this.cleanupDriverRide();
    if (this._newRequestsChannel) { try { this._newRequestsChannel.unsubscribe(); } catch {} }
  }
}
