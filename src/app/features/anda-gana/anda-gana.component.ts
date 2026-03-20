import { Component, ChangeDetectionStrategy, OnInit, signal, inject, computed } from '@angular/core';
import { AndaGanaService, AgUser, AgDriver, AgTrip } from './anda-gana.service';
import { DatePipe, DecimalPipe } from '@angular/common';

type AgScreen =
  | 'loading' | 'welcome' | 'enter-phone' | 'verify-code'
  | 'register-passenger' | 'register-driver' | 'pending'
  | 'rejected' | 'passenger-home' | 'driver-home' | 'admin-panel';

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

      <!-- Cards de rol -->
      <p class="text-slate-400 text-sm font-bold uppercase tracking-widest">¿Cómo quieres usar la plataforma?</p>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full">
        <button (click)="chooseRole('passenger')"
          class="flex flex-col items-center gap-3 p-6 rounded-2xl border border-white/10 bg-white/[0.02] hover:border-orange-500/40 hover:bg-orange-500/5 transition-all group">
          <div class="w-14 h-14 rounded-2xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center group-hover:scale-110 transition-transform">
            <span class="material-symbols-outlined text-orange-400" style="font-size:28px">person_pin_circle</span>
          </div>
          <div class="text-center">
            <p class="text-white font-black text-base">Soy Pasajero</p>
            <p class="text-slate-500 text-xs mt-1">Solicita viajes y llega a tu destino</p>
          </div>
        </button>

        <button (click)="chooseRole('driver')"
          class="flex flex-col items-center gap-3 p-6 rounded-2xl border border-white/10 bg-white/[0.02] hover:border-amber-500/40 hover:bg-amber-500/5 transition-all group">
          <div class="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center group-hover:scale-110 transition-transform">
            <span class="material-symbols-outlined text-amber-400" style="font-size:28px">directions_car</span>
          </div>
          <div class="text-center">
            <p class="text-white font-black text-base">Soy Conductor</p>
            <p class="text-slate-500 text-xs mt-1">Acepta viajes y genera ingresos</p>
          </div>
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
          <p class="text-slate-500 text-xs">+57 {{ agUser()?.phone }}</p>
        </div>
        <span class="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">
          <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
          <span class="text-[10px] text-emerald-400 font-black uppercase">Verificado</span>
        </span>
      </div>

      <!-- Próximamente -->
      <div class="rounded-2xl border border-white/10 bg-white/[0.02] p-6 text-center">
        <span class="material-symbols-outlined text-orange-400 mb-3" style="font-size:48px">location_on</span>
        <h3 class="text-white font-black text-lg mb-2">Solicitar Viaje</h3>
        <p class="text-slate-500 text-sm leading-relaxed mb-4">
          Pronto podrás solicitar viajes, comparar precios de conductores cercanos y llegar a tu destino de forma segura.
        </p>
        <span class="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-orange-500/10 border border-orange-500/20">
          <span class="w-2 h-2 rounded-full bg-orange-500 animate-pulse"></span>
          <span class="text-orange-400 font-black text-xs uppercase tracking-widest">Próximamente</span>
        </span>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div class="rounded-xl p-4 border border-white/10 bg-white/[0.02] flex flex-col items-center gap-2 text-center">
          <span class="material-symbols-outlined text-cyan-400" style="font-size:28px">route</span>
          <p class="text-white font-bold text-sm">Rastreo en vivo</p>
          <p class="text-slate-500 text-xs">Sigue a tu conductor en tiempo real</p>
        </div>
        <div class="rounded-xl p-4 border border-white/10 bg-white/[0.02] flex flex-col items-center gap-2 text-center">
          <span class="material-symbols-outlined text-emerald-400" style="font-size:28px">price_check</span>
          <p class="text-white font-bold text-sm">Precio justo</p>
          <p class="text-slate-500 text-xs">Conductores compiten por tu viaje</p>
        </div>
        <div class="rounded-xl p-4 border border-white/10 bg-white/[0.02] flex flex-col items-center gap-2 text-center">
          <span class="material-symbols-outlined text-violet-400" style="font-size:28px">star</span>
          <p class="text-white font-bold text-sm">Calificaciones</p>
          <p class="text-slate-500 text-xs">Conductores verificados y evaluados</p>
        </div>
      </div>
    </div>
  }

  <!-- ═══════════════════ DRIVER HOME ═══════════════════ -->
  @if (screen() === 'driver-home') {
    <div class="w-full max-w-3xl flex flex-col gap-5">

      <!-- Header conductor -->
      <div class="flex items-center gap-4 px-5 py-4 rounded-2xl bg-gradient-to-r from-amber-500/10 to-orange-500/5 border border-amber-500/20">
        <div class="w-12 h-12 rounded-2xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center shrink-0">
          <span class="material-symbols-outlined text-amber-400" style="font-size:24px">directions_car</span>
        </div>
        <div class="flex-1 min-w-0">
          <p class="text-[10px] text-amber-400 uppercase tracking-widest font-black">Conductor Verificado</p>
          <p class="text-white font-black text-base truncate">{{ agUser()?.full_name }}</p>
          <p class="text-slate-500 text-xs truncate">{{ agUser()?.driver?.vehicle_brand }} {{ agUser()?.driver?.vehicle_model }} · {{ agUser()?.driver?.vehicle_plate }}</p>
        </div>
        <button (click)="showTripForm.set(true)"
          class="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-black font-black text-xs uppercase tracking-wider hover:from-amber-400 hover:to-orange-400 transition-all shrink-0">
          <span class="material-symbols-outlined" style="font-size:16px">add</span>
          Nuevo Viaje
        </button>
      </div>

      <!-- Filtro de período -->
      <div class="flex gap-2 bg-white/[0.02] border border-white/10 rounded-xl p-1">
        @for (f of tripFilters; track f.key) {
          <button (click)="tripsFilter.set(f.key); loadTrips()"
            [class]="tripsFilter() === f.key
              ? 'flex-1 py-2 rounded-lg text-xs font-black bg-amber-500 text-black transition-all'
              : 'flex-1 py-2 rounded-lg text-xs font-bold text-slate-400 hover:text-white transition-all'">
            {{ f.label }}
          </button>
        }
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

      <!-- Botón retiro (próximamente) -->
      <div class="flex items-center gap-3 px-5 py-4 rounded-xl border border-white/10 bg-white/[0.02]">
        <span class="material-symbols-outlined text-slate-500" style="font-size:22px">account_balance_wallet</span>
        <div class="flex-1">
          <p class="text-white font-black text-sm">Retirar Ganancias</p>
          <p class="text-slate-500 text-xs">Podrás solicitar el retiro de tus ganancias muy pronto</p>
        </div>
        <span class="px-3 py-1 rounded-full bg-slate-500/10 border border-slate-500/20 text-slate-500 text-[9px] font-black uppercase tracking-widest">Próximamente</span>
      </div>

      <!-- Historial de viajes -->
      <div>
        <p class="text-[10px] text-slate-500 uppercase tracking-widest font-black mb-3">Historial de Viajes</p>

        @if (tripsLoading()) {
          <div class="flex items-center justify-center py-10">
            <span class="material-symbols-outlined text-slate-600 animate-spin" style="font-size:28px">autorenew</span>
          </div>
        } @else if (filteredTrips().length === 0) {
          <div class="flex flex-col items-center py-10 gap-2 text-center border border-white/10 rounded-xl bg-white/[0.02]">
            <span class="material-symbols-outlined text-slate-600" style="font-size:36px">route</span>
            <p class="text-slate-500 text-sm">No hay viajes registrados en este período</p>
            <button (click)="showTripForm.set(true)"
              class="mt-2 px-4 py-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-black uppercase tracking-wider hover:bg-amber-500/20 transition-all">
              Registrar primer viaje
            </button>
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
export class AndaGanaComponent implements OnInit {
  private svc = inject(AndaGanaService);

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

    if (this.isAdmin() && !agUser) {
      this.screen.set('admin-panel');
      await this.loadAdminData();
    } else if (!agUser) {
      this.screen.set('welcome');
    } else if (agUser.role === 'passenger') {
      this.screen.set('passenger-home');
    } else {
      const status = agUser.driver?.status;
      this.screen.set(status === 'approved' ? 'driver-home' : status === 'rejected' ? 'rejected' : 'pending');
      if (status === 'approved') await this.loadTrips();
    }
  }

  chooseRole(role: 'passenger' | 'driver') {
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
}
