import { Component, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-cursos-landing',
  standalone: true,
  imports: [CommonModule, RouterModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './cursos-landing.component.html',
})
export class CursosPublicLandingComponent {
  readonly stats = [
    { value: '13', label: 'Categorías', icon: 'category' },
    { value: '20%', label: 'Comisión afiliados', icon: 'handshake' },
    { value: '70%', label: 'Para el creador', icon: 'person' },
    { value: '0', label: 'Costo por publicar', icon: 'money_off' },
  ];

  readonly categories = [
    'Marketing Digital', 'Negocios', 'Tecnología', 'Finanzas',
    'Desarrollo Personal', 'Programación', 'Arte y Diseño',
    'Idiomas', 'Fotografía', 'Música', 'Gastronomía',
    'Salud y Bienestar', 'General',
  ];

  readonly forBuyers = [
    { icon: 'play_lesson', title: 'Cursos Gratuitos', desc: 'Accede a miles de cursos gratuitos de YouTube integrados directamente en la plataforma. Filtra por categoría, duración y relevancia.' },
    { icon: 'store', title: 'Marketplace Premium', desc: 'Explora cursos premium creados por expertos. Busca por categoría, nivel (principiante, intermedio, avanzado) y precio.' },
    { icon: 'smart_display', title: 'Reproductor Profesional', desc: 'Aprende con un reproductor de video integrado, navegación por módulos y lecciones, y seguimiento automático de tu progreso.' },
    { icon: 'task_alt', title: 'Progreso Visible', desc: 'Marca lecciones como completadas, ve tu porcentaje de avance y retoma donde lo dejaste en cualquier momento.' },
  ];

  readonly forSellers = [
    { icon: 'edit_note', title: 'Crea tu Curso Fácil', desc: 'Editor completo con módulos, lecciones, videos de YouTube, duración, descripción y lecciones de vista previa gratuita.' },
    { icon: 'attach_money', title: 'Tú Pones el Precio', desc: 'Establece el precio en COP. Sin costo por publicar. Ganas el 70% de cada venta directa de tu curso.' },
    { icon: 'monitoring', title: 'Dashboard de Ventas', desc: 'Panel de ganancias en tiempo real: total vendido, ventas completadas, pendientes y detalle de cada transacción.' },
    { icon: 'diversity_3', title: 'Red de Afiliados', desc: 'Otros usuarios promocionan tu curso y tú ganas más. Los afiliados reciben el 20%, tú mantienes tu 70%.' },
  ];

  readonly steps = [
    { num: '01', title: 'Crea tu cuenta', desc: 'Regístrate gratis en Publihazclick. Accede al módulo de cursos desde tu panel.', icon: 'person_add' },
    { num: '02', title: 'Explora o crea', desc: 'Busca cursos para aprender o crea el tuyo propio con nuestro editor de módulos y lecciones.', icon: 'explore' },
    { num: '03', title: 'Aprende o vende', desc: 'Compra cursos premium con ePayco o publica los tuyos para que otros los compren.', icon: 'school' },
    { num: '04', title: 'Gana con afiliados', desc: 'Hazte afiliado de cualquier curso y gana el 20% por cada venta que generes con tu link.', icon: 'link' },
    { num: '05', title: 'Cobra tus ganancias', desc: 'Monitorea tus ingresos en tiempo real y solicita retiros desde tu panel de ganancias.', icon: 'savings' },
  ];

  readonly faqs = [
    { q: '¿Cuánto cuesta publicar un curso?', a: 'Publicar es completamente gratis. No hay costos por subir tu curso. Solo pagas si vendes: la plataforma retiene el 10% y tú recibes el 70% de cada venta.' },
    { q: '¿Cómo funciona el programa de afiliados?', a: 'Puedes hacerte afiliado de cualquier curso con un solo click. Obtienes un link único. Por cada venta que generes con ese link, ganas el 20% de comisión automáticamente.' },
    { q: '¿Qué tipo de cursos puedo crear?', a: 'Cualquier tema: Marketing Digital, Programación, Negocios, Finanzas, Idiomas, Cocina, Música, Fotografía y más. Hay 13 categorías disponibles y 3 niveles de dificultad.' },
    { q: '¿Cómo subo las lecciones?', a: 'Las lecciones usan videos de YouTube. Sube tu contenido a YouTube (puede ser no listado) y pega el link en cada lección. Organiza todo en módulos con el orden que prefieras.' },
    { q: '¿Cómo compran mis cursos los estudiantes?', a: 'Los estudiantes pagan con ePayco (tarjetas, PSE, Nequi, Daviplata, efectivo). El pago es instantáneo y seguro. El curso se activa automáticamente después del pago.' },
    { q: '¿Los cursos gratuitos también son míos?', a: 'Los cursos gratuitos vienen de YouTube y son contenido público. Si quieres monetizar tu conocimiento, crea un curso premium con contenido exclusivo.' },
  ];

  expandedFaq = -1;

  toggleFaq(i: number): void {
    this.expandedFaq = this.expandedFaq === i ? -1 : i;
  }
}
