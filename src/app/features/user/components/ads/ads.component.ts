import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';

@Component({
  selector: 'app-user-ads',
  standalone: true,
  imports: [CommonModule, RouterModule, LucideAngularModule],
  templateUrl: './ads.component.html'
})
export class UserAdsComponent {
  ads = [
    { id: 1, title: 'Anuncio #1', desc: 'Descripción del anuncio disponible para clickear', reward: 300 },
    { id: 2, title: 'Anuncio #2', desc: 'Descripción del anuncio disponible para clickear', reward: 600 },
    { id: 3, title: 'Anuncio #3', desc: 'Descripción del anuncio disponible para clickear', reward: 900 },
    { id: 4, title: 'Anuncio #4', desc: 'Descripción del anuncio disponible para clickear', reward: 1200 },
    { id: 5, title: 'Anuncio #5', desc: 'Descripción del anuncio disponible para clickear', reward: 1500 },
    { id: 6, title: 'Anuncio #6', desc: 'Descripción del anuncio disponible para clickear', reward: 1800 }
  ];
}
