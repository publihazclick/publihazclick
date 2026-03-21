import { Component, ChangeDetectionStrategy } from '@angular/core';

@Component({
  selector: 'app-anda-gana',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="min-h-screen w-full flex flex-col items-center justify-center py-16 px-4">
      <div class="flex flex-col items-center gap-6 text-center max-w-sm">
        <div class="w-20 h-20 rounded-3xl bg-orange-500/10 border-2 border-orange-500/20 flex items-center justify-center">
          <span class="material-symbols-outlined text-orange-400" style="font-size:40px">directions_car</span>
        </div>
        <div>
          <h1 class="text-white font-black text-2xl mb-2">Anda y Gana</h1>
          <p class="text-slate-400 text-sm leading-relaxed">Próximamente disponible.<br>Estamos preparando algo increíble.</p>
        </div>
      </div>
    </div>
  `,
})
export class AndaGanaComponent {}
