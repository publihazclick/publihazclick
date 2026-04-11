import { Component, ChangeDetectionStrategy } from '@angular/core';
import { RouterModule } from '@angular/router';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-about',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterModule],
  templateUrl: './about.component.html',
})
export class AboutComponent {
  readonly whatsappLink = `https://wa.me/${environment.whatsappNumber}?text=${encodeURIComponent(environment.whatsappDefaultMessage)}`;

  readonly stats = [
    { value: '12.000+', label: 'Usuarios activos',   icon: 'group',              color: 'cyan'    },
    { value: '500+',    label: 'Anuncios activos',    icon: 'ads_click',          color: 'purple'  },
    { value: '100%',    label: 'Pagos exitosos',      icon: 'verified',           color: 'emerald' },
  ];

  readonly steps = [
    {
      num: '01',
      icon: 'person_add',
      title: 'Regístrate',
      desc: 'Crea tu cuenta gratis con un enlace de invitado de un miembro activo. Solo necesitas tu correo y datos básicos.',
      color: 'cyan',
    },
    {
      num: '02',
      icon: 'storefront',
      title: 'Activa tu cuenta',
      desc: 'Conviértete en anunciante dentro de la plataforma y accede a todas las herramientas para posicionar tu negocio.',
      color: 'purple',
    },
    {
      num: '03',
      icon: 'upload',
      title: 'Sube tu anuncio',
      desc: 'Sube tu anuncio para que sea visto por cientos de personas registradas en la plataforma.',
      color: 'blue',
    },
    {
      num: '04',
      icon: 'payments',
      title: 'Retira tus ganancias',
      desc: 'Solicita tu retiro cuando quieras. Procesamos los pagos en menos de 24 horas directamente a tu cuenta bancaria o billetera digital.',
      color: 'emerald',
    },
  ];

  readonly adTypes = [
    { icon: 'star',        label: 'Mega Anuncio', time: '60 seg', reward: '+$2.00', color: 'purple', desc: 'El más rentable. Videos premium de marcas de alto impacto.' },
    { icon: 'play_circle', label: 'Anuncio 400',  time: '60 seg', reward: '+$0.40', color: 'blue',   desc: 'Contenido publicitario variado de marcas nacionales.' },
    { icon: 'bolt',        label: 'Mini Anuncio', time: '30 seg', reward: '+$0.08', color: 'emerald', desc: 'Rápido y frecuente. Ideal para acumular de forma constante.' },
  ];

  readonly features = [
    { icon: 'verified_user',  label: 'Pagos reales',         desc: 'Cada retiro es procesado y verificado. Ningún pago queda pendiente sin respuesta.' },
    { icon: 'no_encryption',  label: 'Sin inversión mínima', desc: 'No necesitas comprar nada para empezar. Tu único recurso es tu tiempo.' },
    { icon: 'schedule',       label: 'Pagos en 24 horas',    desc: 'Una vez solicitado el retiro, lo procesamos en menos de un día hábil.' },
    { icon: 'devices',        label: 'Desde cualquier lugar', desc: 'Funciona en móvil, tablet y computador. Solo necesitas internet.' },
    { icon: 'group_add',      label: 'Referidos multinivel', desc: 'Gana comisiones por cada persona que invites y por la red que construyan.' },
    { icon: 'support_agent',  label: 'Soporte real',         desc: 'Equipo de soporte disponible para resolver cualquier duda o inconveniente.' },
  ];
}
