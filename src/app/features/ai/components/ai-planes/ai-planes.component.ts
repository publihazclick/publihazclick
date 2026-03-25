import { Component, signal, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';

interface Plan {
  id: string;
  name: string;
  price: string;
  period: string;
  description: string;
  features: string[];
  popular: boolean;
  colorClass: string;
  borderClass: string;
  badgeClass: string;
  btnClass: string;
  iconBgClass: string;
}

interface FaqItem {
  question: string;
  answer: string;
  open: boolean;
}

interface Benefit {
  icon: string;
  title: string;
  description: string;
}

@Component({
  selector: 'app-ai-planes',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
  template: `
    <div class="space-y-12">
      <!-- Header -->
      <div class="text-center space-y-3">
        <div
          class="inline-flex items-center gap-2 px-4 py-2 bg-violet-500/10 border border-violet-500/20 rounded-full text-xs font-bold text-violet-400 uppercase tracking-widest"
        >
          <span class="material-symbols-outlined" style="font-size:14px">sell</span>
          Planes y Precios
        </div>
        <h1 class="text-3xl lg:text-4xl font-black text-white">
          Elige tu plan de
          <span
            class="bg-gradient-to-r from-violet-400 to-fuchsia-400 bg-clip-text text-transparent"
          >
            Inteligencia Artificial
          </span>
        </h1>
        <p class="text-slate-400 text-sm lg:text-base max-w-xl mx-auto">
          Desde el plan gratuito hasta Business. Sin contratos, cancela cuando quieras.
        </p>
      </div>

      <!-- Plans grid -->
      <div class="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8">
        @for (plan of plans; track plan.id) {
          <div
            class="relative flex flex-col rounded-2xl border p-6 lg:p-8 transition-all"
            [class]="plan.popular
              ? 'bg-gradient-to-b from-violet-900/40 to-fuchsia-900/20 border-violet-500/50 shadow-xl shadow-violet-500/10 scale-105'
              : 'bg-card-dark border-white/10 hover:border-white/20'"
          >
            <!-- Popular badge -->
            @if (plan.popular) {
              <div class="absolute -top-4 left-1/2 -translate-x-1/2">
                <span
                  class="px-4 py-1.5 text-[11px] font-black uppercase tracking-widest rounded-full bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white shadow-lg"
                >
                  ⭐ Más Popular
                </span>
              </div>
            }

            <!-- Plan header -->
            <div class="mb-6">
              <div
                class="w-12 h-12 rounded-xl flex items-center justify-center mb-4"
                [class]="plan.iconBgClass"
              >
                <span class="material-symbols-outlined text-white" style="font-size:24px">
                  @if (plan.id === 'starter') { rocket_launch }
                  @else if (plan.id === 'pro') { auto_awesome }
                  @else { business_center }
                </span>
              </div>
              <h2 class="text-xl font-black text-white">{{ plan.name }}</h2>
              <p class="text-xs text-slate-400 mt-1">{{ plan.description }}</p>
            </div>

            <!-- Price -->
            <div class="mb-6">
              <div class="flex items-end gap-1">
                <span class="text-4xl font-black text-white">{{ plan.price }}</span>
                @if (plan.price !== '$0') {
                  <span class="text-slate-400 text-sm mb-1.5">/mes</span>
                }
              </div>
              @if (plan.price === '$0') {
                <span class="text-sm text-emerald-400 font-bold">Gratis para siempre</span>
              } @else {
                <span class="text-xs text-slate-500">Facturado mensualmente</span>
              }
            </div>

            <!-- Features -->
            <ul class="space-y-3 flex-1 mb-8">
              @for (feature of plan.features; track feature) {
                <li class="flex items-start gap-2.5 text-sm">
                  <span
                    class="material-symbols-outlined flex-shrink-0 mt-0.5"
                    style="font-size:16px"
                    [class.text-emerald-400]="!feature.startsWith('—')"
                    [class.text-slate-600]="feature.startsWith('—')"
                  >
                    {{ feature.startsWith('—') ? 'remove' : 'check_circle' }}
                  </span>
                  <span
                    [class.text-white]="!feature.startsWith('—')"
                    [class.text-slate-600]="feature.startsWith('—')"
                  >
                    {{ feature.startsWith('—') ? feature.slice(2) : feature }}
                  </span>
                </li>
              }
            </ul>

            <!-- CTA button -->
            <button
              (click)="handleCta(plan)"
              class="w-full py-3 px-6 font-black text-sm rounded-xl transition-all uppercase tracking-wider"
              [class]="plan.btnClass"
            >
              @if (plan.id === 'starter') {
                Plan actual
              } @else {
                Contratar ahora
              }
            </button>
          </div>
        }
      </div>

      <!-- Why PubliStudio -->
      <div class="space-y-6">
        <h2 class="text-2xl font-black text-white text-center">
          ¿Por qué elegir
          <span
            class="bg-gradient-to-r from-violet-400 to-fuchsia-400 bg-clip-text text-transparent"
          >
            PubliStudio?
          </span>
        </h2>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
          @for (benefit of benefits; track benefit.title) {
            <div
              class="bg-card-dark border border-white/10 rounded-xl p-6 hover:border-violet-500/20 hover:bg-violet-500/5 transition-all text-center"
            >
              <div
                class="w-14 h-14 rounded-xl bg-gradient-to-br from-violet-600 to-fuchsia-600 flex items-center justify-center mx-auto mb-4"
              >
                <span class="material-symbols-outlined text-white" style="font-size:28px">{{
                  benefit.icon
                }}</span>
              </div>
              <h3 class="text-base font-bold text-white mb-2">{{ benefit.title }}</h3>
              <p class="text-xs text-slate-400 leading-relaxed">{{ benefit.description }}</p>
            </div>
          }
        </div>
      </div>

      <!-- FAQ -->
      <div class="space-y-4">
        <h2 class="text-2xl font-black text-white text-center">Preguntas Frecuentes</h2>
        <div class="max-w-2xl mx-auto space-y-3">
          @for (faq of faqs(); track faq.question; let i = $index) {
            <div
              class="bg-card-dark border border-white/10 rounded-xl overflow-hidden hover:border-violet-500/20 transition-all"
            >
              <button
                (click)="toggleFaq(i)"
                class="w-full flex items-center justify-between px-5 py-4 text-left gap-3"
              >
                <span class="text-sm font-bold text-white">{{ faq.question }}</span>
                <span
                  class="material-symbols-outlined text-violet-400 transition-transform flex-shrink-0"
                  [class.rotate-180]="faq.open"
                  style="font-size:20px"
                >
                  expand_more
                </span>
              </button>
              @if (faq.open) {
                <div class="px-5 pb-4 border-t border-white/5">
                  <p class="text-sm text-slate-400 leading-relaxed mt-3">{{ faq.answer }}</p>
                </div>
              }
            </div>
          }
        </div>
      </div>

      <!-- Bottom CTA -->
      <div
        class="bg-gradient-to-r from-violet-900/30 to-fuchsia-900/20 border border-violet-500/20 rounded-2xl p-8 text-center space-y-4"
      >
        <h3 class="text-xl font-black text-white">¿Tienes dudas?</h3>
        <p class="text-sm text-slate-400">
          Nuestro equipo está disponible para ayudarte a elegir el plan perfecto para tu negocio.
        </p>
        <button
          (click)="openWhatsApp()"
          class="inline-flex items-center gap-2 px-6 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-black text-sm rounded-xl transition-all uppercase tracking-wider"
        >
          <span class="material-symbols-outlined" style="font-size:18px">chat</span>
          Hablar con un asesor
        </button>
      </div>

      <!-- Toast -->
      @if (toastMsg()) {
        <div
          class="fixed bottom-6 right-6 z-50 flex items-center gap-3 bg-violet-900/90 border border-violet-500/30 backdrop-blur rounded-xl px-5 py-4 text-sm text-white shadow-2xl max-w-sm animate-pulse"
        >
          <span class="material-symbols-outlined text-violet-400" style="font-size:20px">
            info
          </span>
          <span>{{ toastMsg() }}</span>
          <button (click)="toastMsg.set('')" class="ml-2 text-slate-400 hover:text-white">
            <span class="material-symbols-outlined" style="font-size:16px">close</span>
          </button>
        </div>
      }
    </div>
  `,
})
export class AiPlanesComponent {
  readonly toastMsg = signal('');

  readonly plans: Plan[] = [
    {
      id: 'starter',
      name: 'Starter',
      price: '$0',
      period: '',
      description: 'Perfecto para empezar a explorar las herramientas de IA',
      popular: false,
      colorClass: 'text-slate-300',
      borderClass: 'border-slate-700',
      badgeClass: 'bg-slate-700 text-slate-300',
      iconBgClass: 'bg-gradient-to-br from-slate-600 to-slate-700',
      btnClass:
        'bg-white/10 text-slate-400 border border-white/10 cursor-default',
      features: [
        '20 imágenes IA/mes',
        '10 guiones de video',
        '5 audios TTS',
        '100 mensajes de Chatbot',
        'Soporte básico',
        '— Video IA',
        '— Sin marca de agua',
        '— API Access',
      ],
    },
    {
      id: 'pro',
      name: 'Pro',
      price: '$19.99',
      period: '/mes',
      description: 'Ideal para creadores de contenido y emprendedores activos',
      popular: true,
      colorClass: 'text-violet-300',
      borderClass: 'border-violet-500/50',
      badgeClass: 'bg-violet-500/20 text-violet-300',
      iconBgClass: 'bg-gradient-to-br from-violet-600 to-fuchsia-600',
      btnClass:
        'bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white hover:from-violet-500 hover:to-fuchsia-500 shadow-lg shadow-violet-500/25',
      features: [
        '200 imágenes IA/mes',
        '100 guiones de video',
        '50 audios TTS',
        'Mensajes de Chatbot ilimitados',
        'Video IA (hasta 5 videos/mes)',
        'Soporte prioritario',
        'Sin marca de agua',
        '— API Access',
      ],
    },
    {
      id: 'business',
      name: 'Business',
      price: '$49.99',
      period: '/mes',
      description: 'Para agencias y negocios que necesitan escala total',
      popular: false,
      colorClass: 'text-amber-300',
      borderClass: 'border-amber-700/50',
      badgeClass: 'bg-amber-500/20 text-amber-300',
      iconBgClass: 'bg-gradient-to-br from-amber-600 to-orange-600',
      btnClass:
        'bg-gradient-to-r from-amber-600 to-orange-600 text-white hover:from-amber-500 hover:to-orange-500 shadow-lg shadow-amber-500/25',
      features: [
        'Imágenes IA ilimitadas',
        'Guiones ilimitados',
        'Audios TTS ilimitados',
        'Videos IA ilimitados',
        'Mensajes de Chatbot ilimitados',
        'API Access completo',
        'Soporte 24/7',
        'Marca personalizada',
      ],
    },
  ];

  readonly benefits: Benefit[] = [
    {
      icon: 'bolt',
      title: 'Resultados Instantáneos',
      description:
        'Genera imágenes, guiones y audios en segundos con la última tecnología de IA de Google.',
    },
    {
      icon: 'lock',
      title: 'Sin API Keys propias',
      description:
        'Toda la infraestructura está incluida. No necesitas configurar nada, solo crea contenido.',
    },
    {
      icon: 'trending_up',
      title: 'Optimizado para LATAM',
      description:
        'Voces neurales en español, prompts optimizados para audiencias latinoamericanas y estrategias locales.',
    },
  ];

  readonly faqs = signal<FaqItem[]>([
    {
      question: '¿Puedo cancelar mi plan en cualquier momento?',
      answer:
        'Sí, puedes cancelar tu plan en cualquier momento desde tu panel de configuración. No hay contratos ni penalizaciones. Tu plan seguirá activo hasta el final del período ya pagado.',
      open: false,
    },
    {
      question: '¿Los créditos no usados se acumulan para el siguiente mes?',
      answer:
        'No, los créditos se renuevan cada mes y no se acumulan. Están diseñados para uso mensual constante. Si necesitas más créditos en un mes específico, puedes hacer upgrade temporal.',
      open: false,
    },
    {
      question: '¿Qué calidad tienen las imágenes y audios generados?',
      answer:
        'Las imágenes se generan con Vertex AI Imagen 3 de Google (la más avanzada disponible) en alta resolución. Los audios usan voces neurales de Microsoft Edge TTS que suenan completamente naturales.',
      open: false,
    },
    {
      question: '¿Puedo usar el contenido generado comercialmente?',
      answer:
        'Sí, todo el contenido generado es tuyo para uso comercial. Puedes usarlo en redes sociales, anuncios pagados, sitios web, videos de YouTube y cualquier otro medio sin restricciones adicionales.',
      open: false,
    },
  ]);

  toggleFaq(index: number): void {
    this.faqs.update((items) =>
      items.map((item, i) => (i === index ? { ...item, open: !item.open } : item))
    );
  }

  handleCta(plan: Plan): void {
    if (plan.id === 'starter') return;
    this.showToast(
      `Próximamente disponible 🚀 Contacta por WhatsApp para contratar el plan ${plan.name}.`
    );
  }

  openWhatsApp(): void {
    const msg = encodeURIComponent(
      'Hola! Me interesa contratar un plan de PubliStudio IA. ¿Puedes darme más información?'
    );
    window.open(`https://wa.me/?text=${msg}`, '_blank');
  }

  private showToast(msg: string): void {
    this.toastMsg.set(msg);
    setTimeout(() => this.toastMsg.set(''), 5000);
  }
}
