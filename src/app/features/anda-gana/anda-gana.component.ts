import { Component, ChangeDetectionStrategy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

type AgScreen = 'home' | 'passenger-form' | 'driver-form';

@Component({
  selector: 'app-anda-gana',
  standalone: true,
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
<div class="min-h-screen w-full flex flex-col items-center py-6 px-4">

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
                <input type="file" accept="image/*" capture="user" class="hidden" (change)="pf.selfie = $any($event.target).files[0]?.name || ''"/>
              </label>
              @if (pf.selfie) { <p class="text-emerald-400 text-xs">✓ {{ pf.selfie }}</p> }
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
                    <input type="file" accept="image/*" class="hidden" (change)="onFileChange($event, f.key)"/>
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
                  <input type="file" accept="image/*,application/pdf" class="hidden" (change)="onFileChange($event, 'criminalRecord')"/>
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
                  <input type="file" accept="image/*" class="hidden" (change)="onFileChange($event, 'licensePhoto')"/>
                </label>
              </div>
              <div class="flex flex-col gap-1">
                <label class="text-slate-400 text-xs font-bold">Foto trasera de la licencia *</label>
                <label class="flex items-center gap-3 border border-dashed border-white/10 rounded-xl px-4 py-3 cursor-pointer hover:border-cyan-500/40 transition-colors">
                  <span class="material-symbols-outlined text-slate-500" style="font-size:22px">upload</span>
                  <span class="text-slate-500 text-xs flex-1">{{ df.licenseBack || 'Toca para subir foto' }}</span>
                  @if (df.licenseBack) { <span class="material-symbols-outlined text-emerald-400" style="font-size:18px">check_circle</span> }
                  <input type="file" accept="image/*" class="hidden" (change)="onFileChange($event, 'licenseBack')"/>
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
                    <input type="file" accept="image/*" class="hidden" (change)="onFileChange($event, f.key)"/>
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
                    <input type="file" accept="image/*,application/pdf" class="hidden" (change)="onFileChange($event, f.key)"/>
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
export class AndaGanaComponent {

  screen   = signal<AgScreen>('home');
  driverStep = signal<number>(1);

  // ── Passenger form state ──
  passengerLoading = signal(false);
  passengerSuccess = signal(false);
  passengerError   = signal('');

  pf = {
    fullName: '', birthDate: '', city: '', idNumber: '',
    phone: '', email: '', password: '', selfie: '',
    emergencyName: '', emergencyPhone: '', terms: false,
  };

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

  onFileChange(event: Event, field: string) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (file) (this.df as Record<string, unknown>)[field] = file.name;
  }

  nextDriverStep(current: number) {
    this.driverError.set('');
    if (current === 1) {
      if (!this.df['fullName'] || !this.df['birthDate'] || !this.df['city'] || !this.df['idNumber'] ||
          !this.df['phone'] || !this.df['email'] || !this.df['password'] || !this.df['emergencyName'] || !this.df['emergencyPhone']) {
        this.driverError.set('Por favor completa todos los campos obligatorios antes de continuar.');
        return;
      }
    }
    if (current === 2) {
      if (!this.df['idFront'] || !this.df['idBack'] || !this.df['selfieWithId'] || !this.df['criminalRecord']) {
        this.driverError.set('Debes subir todos los documentos de identidad requeridos.');
        return;
      }
    }
    if (current === 3) {
      if (!this.df['licenseNumber'] || !this.df['licenseCategory'] || !this.df['licenseExpiry'] || !this.df['licensePhoto'] || !this.df['licenseBack']) {
        this.driverError.set('Completa todos los datos y fotos de tu licencia de conducción.');
        return;
      }
    }
    this.driverStep.set(current + 1);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  submitPassenger() {
    this.passengerError.set('');
    const p = this.pf;
    if (!p['fullName'] || !p['birthDate'] || !p['city'] || !p['idNumber'] ||
        !p['phone'] || !p['email'] || !p['password'] || !p['emergencyName'] || !p['emergencyPhone']) {
      this.passengerError.set('Por favor completa todos los campos obligatorios.');
      return;
    }
    if (!p['terms']) {
      this.passengerError.set('Debes aceptar los términos y condiciones.');
      return;
    }
    this.passengerLoading.set(true);
    // TODO: conectar con backend
    setTimeout(() => {
      this.passengerLoading.set(false);
      this.passengerSuccess.set(true);
    }, 1500);
  }

  submitDriver() {
    this.driverError.set('');
    if (!this.df['plate'] || !this.df['vehicleType'] || !this.df['vehicleBrand'] ||
        !this.df['vehicleModel'] || !this.df['vehicleYear'] || !this.df['vehicleColor']) {
      this.driverError.set('Completa todos los datos del vehículo.');
      return;
    }
    if (!this.df['terms']) {
      this.driverError.set('Debes aceptar los términos y condiciones.');
      return;
    }
    this.driverLoading.set(true);
    // TODO: conectar con backend
    setTimeout(() => {
      this.driverLoading.set(false);
      this.driverSuccess.set(true);
    }, 1500);
  }
}
