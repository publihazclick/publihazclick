import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-user-wallet',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './wallet.component.html'
})
export class UserWalletComponent {
  transactions = [
    { id: 1, type: 'Ganancia por click', time: 'Hace 1 horas', amount: 300 },
    { id: 2, type: 'Ganancia por click', time: 'Hace 2 horas', amount: 600 },
    { id: 3, type: 'Ganancia por click', time: 'Hace 3 horas', amount: 900 },
    { id: 4, type: 'Ganancia por click', time: 'Hace 4 horas', amount: 1200 },
    { id: 5, type: 'Ganancia por click', time: 'Hace 5 horas', amount: 1500 }
  ];
}
