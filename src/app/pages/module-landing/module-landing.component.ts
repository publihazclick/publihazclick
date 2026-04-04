import { Component, OnInit, inject, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, ActivatedRoute } from '@angular/router';

interface ModuleConfig {
  slug: string;
  name: string;
  tagline: string;
  description: string;
  icon: string;
  color: string;         // tailwind color name (emerald, violet, orange, sky, purple, cyan)
  gradient: string;       // CSS gradient
  dashboardPath: string;
  features: { icon: string; title: string; desc: string }[];
}

const MODULES: Record<string, ModuleConfig> = {
  'trading-bot': {
    slug: 'trading-bot',
    name: 'Trading Bot AI',
    tagline: 'Tu dinero trabaja por ti con inteligencia artificial',
    description: 'Automatiza tus inversiones en criptomonedas con nuestro bot de trading potenciado por IA. Obtén rendimientos mensuales de hasta el 30% sin necesidad de experiencia previa.',
    icon: 'trending_up',
    color: 'emerald',
    gradient: 'linear-gradient(135deg, #059669, #065f46)',
    dashboardPath: '/dashboard/trading-bot',
    features: [
      { icon: 'smart_toy', title: 'IA Avanzada', desc: 'Algoritmos de machine learning que analizan el mercado 24/7 para encontrar las mejores oportunidades.' },
      { icon: 'speed', title: 'Operaciones Automáticas', desc: 'El bot ejecuta compras y ventas en milisegundos, sin intervención humana.' },
      { icon: 'security', title: 'Capital Protegido', desc: 'Sistema de stop-loss inteligente que protege tu inversión en mercados volátiles.' },
      { icon: 'payments', title: 'Retiros Flexibles', desc: 'Retira tus ganancias cuando quieras, sin penalidades ni tiempos de espera.' },
    ]
  },
  'herramientas-ia': {
    slug: 'herramientas-ia',
    name: 'Herramientas IA',
    tagline: 'Crea contenido profesional con inteligencia artificial',
    description: 'Suite completa de herramientas de IA para generar videos, imágenes, documentos y más. Potencia tu negocio digital con tecnología de última generación.',
    icon: 'auto_awesome',
    color: 'violet',
    gradient: 'linear-gradient(135deg, #7c3aed, #4c1d95)',
    dashboardPath: '/advertiser/ai',
    features: [
      { icon: 'videocam', title: 'Generador de Videos', desc: 'Crea videos profesionales con avatares AI, voces naturales y scripts automáticos.' },
      { icon: 'image', title: 'Generador de Imágenes', desc: 'Diseña imágenes únicas para tus redes sociales, anuncios y proyectos.' },
      { icon: 'description', title: 'Generador de Documentos', desc: 'Redacta artículos, propuestas y contenido optimizado para SEO en segundos.' },
      { icon: 'play_circle', title: 'YouTube Studio', desc: 'Herramientas especializadas para crear y optimizar contenido de YouTube.' },
    ]
  },
  'cursos': {
    slug: 'cursos',
    name: 'Compra-Vende Cursos',
    tagline: 'Aprende, enseña y monetiza tu conocimiento',
    description: 'Marketplace de cursos online donde puedes aprender nuevas habilidades o crear y vender tus propios cursos. Gana dinero compartiendo lo que sabes.',
    icon: 'school',
    color: 'sky',
    gradient: 'linear-gradient(135deg, #0284c7, #0c4a6e)',
    dashboardPath: '/dashboard/cursos',
    features: [
      { icon: 'play_lesson', title: 'Cursos Gratuitos', desc: 'Accede a una biblioteca de cursos gratuitos para comenzar tu aprendizaje.' },
      { icon: 'store', title: 'Marketplace', desc: 'Explora y compra cursos premium creados por expertos en cada área.' },
      { icon: 'sell', title: 'Vende tus Cursos', desc: 'Crea y publica tus propios cursos. Establece tu precio y gana con cada venta.' },
      { icon: 'diversity_3', title: 'Programa de Afiliados', desc: 'Promociona cursos y gana comisiones por cada venta que generes.' },
    ]
  },
  'sms-masivos': {
    slug: 'sms-masivos',
    name: 'SMS Masivos',
    tagline: 'Envía campañas SMS a miles de contactos al instante',
    description: 'Plataforma profesional de marketing por SMS. Gestiona contactos, crea plantillas, programa campañas y alcanza a tu audiencia directamente en su celular.',
    icon: 'sms',
    color: 'purple',
    gradient: 'linear-gradient(135deg, #9333ea, #581c87)',
    dashboardPath: '/dashboard/sms-masivos',
    features: [
      { icon: 'contacts', title: 'Gestión de Contactos', desc: 'Importa y organiza tu base de datos de contactos de forma fácil y rápida.' },
      { icon: 'draft', title: 'Plantillas SMS', desc: 'Crea plantillas reutilizables con variables personalizadas para cada contacto.' },
      { icon: 'campaign', title: 'Campañas Programadas', desc: 'Programa tus envíos para la fecha y hora perfecta. Maximiza tu alcance.' },
      { icon: 'analytics', title: 'Reportes en Tiempo Real', desc: 'Monitorea entregas, aperturas y respuestas de cada campaña enviada.' },
    ]
  },
};

@Component({
  selector: 'app-module-landing',
  standalone: true,
  imports: [CommonModule, RouterModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './module-landing.component.html',
})
export class ModuleLandingComponent implements OnInit {
  private route = inject(ActivatedRoute);
  module!: ModuleConfig;

  ngOnInit(): void {
    const slug = this.route.snapshot.data['moduleSlug'] || 'trading-bot';
    this.module = MODULES[slug] || MODULES['trading-bot'];
  }
}
