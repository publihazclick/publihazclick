import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

interface Feature {
  icon: string;
  title: string;
  description: string;
}

@Component({
  selector: 'app-features',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './features.component.html',
  styleUrl: './features.component.scss'
})
export class FeaturesComponent {
  protected readonly features: Feature[] = [
    {
      icon: 'rocket_launch',
      title: 'Escalabilidad',
      description: 'Haz crecer tu negocio digital con herramientas de última generación diseñadas para el éxito.'
    },
    {
      icon: 'monetization_on',
      title: 'Ingresos Pasivos',
      description: 'Genera ganancias constantes a través de nuestra red inteligente de afiliados premium.'
    },
    {
      icon: 'verified_user',
      title: 'Seguridad',
      description: 'Transacciones seguras y soporte especializado para proteger tu inversión digital.'
    }
  ];
}
