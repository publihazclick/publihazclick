import { Component, ChangeDetectionStrategy } from '@angular/core';

@Component({
  selector: 'app-anda-gana',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-col items-center justify-center min-h-[70vh] py-12 px-4">
      <!-- Icono principal -->
      <div class="w-24 h-24 rounded-3xl bg-gradient-to-tr from-orange-500/20 to-amber-500/20 border border-orange-500/30 flex items-center justify-center mb-6 shadow-xl shadow-orange-500/10">
        <span class="material-symbols-outlined text-orange-400" style="font-size:48px">directions_car</span>
      </div>

      <!-- Título -->
      <h1 class="text-3xl font-black text-white uppercase tracking-widest text-center mb-2">
        Anda y <span class="text-orange-400">Gana</span>
      </h1>
      <p class="text-slate-500 text-sm text-center mb-8 max-w-md">
        Plataforma de transporte inteligente · Próximamente disponible
      </p>

      <!-- Badge próximamente -->
      <div class="flex items-center gap-2 px-4 py-2 rounded-full bg-orange-500/10 border border-orange-500/20 mb-10">
        <span class="w-2 h-2 rounded-full bg-orange-500 animate-pulse"></span>
        <span class="text-orange-400 font-black text-xs uppercase tracking-widest">En desarrollo</span>
      </div>

      <!-- Cards de funciones futuras -->
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 w-full max-w-3xl">
        <div class="rounded-xl p-4 border border-white/10 bg-white/[0.02] flex flex-col gap-3">
          <div class="w-10 h-10 rounded-xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center">
            <span class="material-symbols-outlined text-orange-400" style="font-size:22px">person_pin_circle</span>
          </div>
          <p class="text-white font-black text-sm">Solicitar Viaje</p>
          <p class="text-slate-500 text-xs">Pide tu transporte desde cualquier punto de la ciudad con precios justos.</p>
        </div>

        <div class="rounded-xl p-4 border border-white/10 bg-white/[0.02] flex flex-col gap-3">
          <div class="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
            <span class="material-symbols-outlined text-amber-400" style="font-size:22px">monetization_on</span>
          </div>
          <p class="text-white font-black text-sm">Conduce y Gana</p>
          <p class="text-slate-500 text-xs">Regístrate como conductor, acepta viajes y recibe pagos directos.</p>
        </div>

        <div class="rounded-xl p-4 border border-white/10 bg-white/[0.02] flex flex-col gap-3">
          <div class="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center">
            <span class="material-symbols-outlined text-cyan-400" style="font-size:22px">route</span>
          </div>
          <p class="text-white font-black text-sm">Rastreo en Tiempo Real</p>
          <p class="text-slate-500 text-xs">Sigue la ruta de tu conductor en vivo desde tu dispositivo.</p>
        </div>

        <div class="rounded-xl p-4 border border-white/10 bg-white/[0.02] flex flex-col gap-3">
          <div class="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
            <span class="material-symbols-outlined text-emerald-400" style="font-size:22px">price_check</span>
          </div>
          <p class="text-white font-black text-sm">Precio Justo</p>
          <p class="text-slate-500 text-xs">Los conductores pueden ofertar el precio. El pasajero elige la mejor oferta.</p>
        </div>

        <div class="rounded-xl p-4 border border-white/10 bg-white/[0.02] flex flex-col gap-3">
          <div class="w-10 h-10 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center">
            <span class="material-symbols-outlined text-violet-400" style="font-size:22px">star</span>
          </div>
          <p class="text-white font-black text-sm">Calificaciones</p>
          <p class="text-slate-500 text-xs">Sistema de reseñas para conductores y pasajeros que garantiza calidad.</p>
        </div>

        <div class="rounded-xl p-4 border border-white/10 bg-white/[0.02] flex flex-col gap-3">
          <div class="w-10 h-10 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center">
            <span class="material-symbols-outlined text-rose-400" style="font-size:22px">shield_person</span>
          </div>
          <p class="text-white font-black text-sm">Viajes Seguros</p>
          <p class="text-slate-500 text-xs">Conductores verificados, SOAT vigente y aprobación por nuestro equipo.</p>
        </div>
      </div>

      <!-- Mensaje final -->
      <p class="text-slate-600 text-xs text-center mt-10 max-w-sm">
        Estamos construyendo algo increíble para ti. Pronto podrás solicitar y ofrecer viajes directamente desde PubliHazClick.
      </p>
    </div>
  `,
})
export class AndaGanaComponent {}
