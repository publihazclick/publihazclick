import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-footer',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './footer.component.html',
  styleUrl: './footer.component.scss'
})
export class FooterComponent {
  protected readonly currentYear = new Date().getFullYear();
  protected readonly whatsappLink = `https://wa.me/${environment.whatsappNumber}?text=${encodeURIComponent('¡Hola! Quiero más información sobre Publihazclick.')}`;
}
