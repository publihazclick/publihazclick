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
  readonly stats = [
    { value: '5.000+', label: 'Usuarios activos', icon: 'group' },
    { value: '$500K+', label: 'Pagado a usuarios', icon: 'payments' },
    { value: '200+', label: 'Anunciantes confían', icon: 'business_center' },
  ];

  readonly whatsappLink = `https://wa.me/${environment.whatsappNumber}?text=${encodeURIComponent(environment.whatsappDefaultMessage)}`;

  readonly features = [
    { icon: 'verified_user', label: 'Transparencia total', desc: 'Cada transacción es auditable y verificable en tiempo real.' },
    { icon: 'payments', label: 'Pagos reales', desc: 'Retiros procesados en menos de 5 días hábiles, sin trampa.' },
    { icon: 'group', label: 'Comunidad activa', desc: 'Miles de usuarios reales generando ingresos cada día.' },
    { icon: 'trending_up', label: 'Crecimiento real', desc: 'Sistema de referidos multinivel que multiplica tus ganancias.' },
  ];
}
