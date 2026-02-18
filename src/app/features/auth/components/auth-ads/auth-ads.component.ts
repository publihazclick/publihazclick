import { Component } from '@angular/core';
import { LucideAngularModule } from 'lucide-angular';

@Component({
  selector: 'app-auth-ads',
  standalone: true,
  imports: [LucideAngularModule],
  templateUrl: './auth-ads.component.html',
  styleUrl: './auth-ads.component.scss'
})
export class AuthAdsComponent {
  // Importar iconos de Lucide
  readonly ArrowRight = LucideAngularModule;
  readonly MapPin = LucideAngularModule;
}
