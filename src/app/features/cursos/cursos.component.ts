import { Component, ChangeDetectionStrategy } from '@angular/core';

@Component({
  selector: 'app-cursos',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-col items-center justify-center min-h-[60vh] text-center px-4 gap-6">
      <div class="w-24 h-24 rounded-3xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center shadow-xl shadow-sky-500/10">
        <span class="material-symbols-outlined text-sky-400" style="font-size:48px">school</span>
      </div>
      <div class="space-y-2 max-w-md">
        <h1 class="text-2xl font-black text-white">Cpra-Vde Cursos</h1>
        <p class="text-slate-400 text-sm leading-relaxed">
          Pronto podrás comprar y vender cursos dentro de la plataforma.
          Estamos trabajando en esta funcionalidad para ti.
        </p>
      </div>
      <span class="px-4 py-2 bg-sky-500/10 border border-sky-500/20 text-sky-400 text-xs font-black uppercase tracking-wider rounded-full">
        Próximamente
      </span>
    </div>
  `,
})
export class CursosComponent {}
