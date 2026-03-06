import { Component, inject, signal, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { ActivatedRoute } from '@angular/router';

@Component({
  selector: 'app-ai-placeholder',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-col items-center justify-center py-20 px-6">
      <div class="w-20 h-20 rounded-2xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center mb-6">
        <span class="material-symbols-outlined text-violet-400" style="font-size:40px">{{ icon() }}</span>
      </div>
      <h2 class="text-2xl font-black text-white mb-2">{{ name() }}</h2>
      <div class="flex items-center gap-2 mb-4">
        <span class="px-3 py-1 text-xs font-black bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white rounded-full uppercase tracking-wider">
          Próximamente
        </span>
      </div>
      <p class="text-slate-400 text-sm text-center max-w-md">
        Esta herramienta estará disponible muy pronto. Estamos trabajando para traerte
        la mejor experiencia de IA para tu negocio.
      </p>
    </div>
  `,
})
export class AiPlaceholderComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  readonly name = signal('Herramienta IA');
  readonly icon = signal('auto_awesome');

  ngOnInit(): void {
    const data = this.route.snapshot.data;
    if (data['name']) this.name.set(data['name']);
    if (data['icon']) this.icon.set(data['icon']);
  }
}
