import { Component, ChangeDetectionStrategy } from '@angular/core';
import { RouterModule } from '@angular/router';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-not-found',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterModule],
  templateUrl: './not-found.component.html',
})
export class NotFoundComponent {
  readonly supportLink = `https://wa.me/${environment.whatsappNumber}?text=${encodeURIComponent('Hola! Necesito soporte en Publihazclick.')}`;
}
