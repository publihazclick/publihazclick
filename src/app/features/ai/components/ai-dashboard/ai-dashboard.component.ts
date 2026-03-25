import { Component, ChangeDetectionStrategy } from '@angular/core';
import { RouterModule } from '@angular/router';

interface AiTool {
  name: string;
  description: string;
  icon: string;
  route: string;
  available: boolean;
  badge?: string;
  gradient: string;
}

@Component({
  selector: 'app-ai-dashboard',
  standalone: true,
  imports: [RouterModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="space-y-8">
      <!-- Header -->
      <div>
        <h1 class="text-2xl lg:text-3xl font-black text-white">Herramientas IA</h1>
        <p class="text-sm text-slate-400 mt-1">Potencia tu negocio con inteligencia artificial</p>
      </div>

      <!-- Tools grid -->
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 lg:gap-6">
        @for (tool of tools; track tool.route) {
          <a
            [routerLink]="tool.route"
            class="group bg-card-dark border border-white/10 rounded-xl p-6 hover:border-violet-500/30 hover:bg-violet-500/5 transition-all relative overflow-hidden"
            [class.opacity-60]="!tool.available"
            [class.cursor-default]="!tool.available"
          >
            <!-- Badge -->
            <div class="absolute top-3 right-3">
              @if (tool.available) {
                <span class="px-2 py-0.5 text-[9px] font-black bg-emerald-500/20 text-emerald-400 rounded-full uppercase tracking-wider border border-emerald-500/20">
                  Disponible
                </span>
              } @else if (tool.badge) {
                <span class="px-2 py-0.5 text-[9px] font-black bg-violet-500/20 text-violet-300 rounded-full uppercase tracking-wider border border-violet-500/20">
                  {{ tool.badge }}
                </span>
              }
            </div>

            <!-- Icon -->
            <div
              class="w-14 h-14 rounded-xl flex items-center justify-center mb-4 transition-transform group-hover:scale-110"
              [class]="tool.gradient"
            >
              <span class="material-symbols-outlined text-white" style="font-size:28px">{{ tool.icon }}</span>
            </div>

            <!-- Info -->
            <h3 class="text-base font-bold text-white mb-1">{{ tool.name }}</h3>
            <p class="text-xs text-slate-400 leading-relaxed">{{ tool.description }}</p>
          </a>
        }
      </div>
    </div>
  `,
})
export class AiDashboardComponent {
  readonly tools: AiTool[] = [
    {
      name: 'Video IA',
      description: 'Genera guiones profesionales para reels y videos cortos con inteligencia artificial.',
      icon: 'smart_display',
      route: '/ai/video',
      available: true,
      gradient: 'bg-gradient-to-br from-violet-600 to-fuchsia-600',
    },
    {
      name: 'Imagen IA',
      description: 'Crea imágenes profesionales para tus anuncios con Vertex AI Imagen 3.',
      icon: 'image',
      route: '/ai/imagen',
      available: true,
      gradient: 'bg-gradient-to-br from-blue-600 to-cyan-600',
    },
    {
      name: 'Chatbot IA',
      description: 'Asistente inteligente para responder preguntas y ayudarte con tu estrategia.',
      icon: 'chat',
      route: '/ai/chatbot',
      available: true,
      gradient: 'bg-gradient-to-br from-emerald-600 to-teal-600',
    },
    {
      name: 'Voz IA',
      description: 'Genera voces profesionales para narración de tus videos y anuncios.',
      icon: 'mic',
      route: '/ai/voz',
      available: true,
      gradient: 'bg-gradient-to-br from-amber-600 to-orange-600',
    },
    {
      name: 'Planes y Precios',
      description: 'Elige el plan que mejor se adapta a tus necesidades. Desde gratuito hasta Business.',
      icon: 'sell',
      route: '/ai/planes',
      available: true,
      gradient: 'bg-gradient-to-br from-amber-600 to-orange-600',
    },
  ];
}
