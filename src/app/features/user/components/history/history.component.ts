import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';

@Component({
  selector: 'app-user-history',
  standalone: true,
  imports: [CommonModule, RouterModule, LucideAngularModule],
  templateUrl: './history.component.html'
})
export class UserHistoryComponent {
  activities = [
    { id: 1, title: 'Click en Anuncio #1', time: '1 de febrero, 2024 • 14:30', amount: 300 },
    { id: 2, title: 'Click en Anuncio #2', time: '1 de febrero, 2024 • 14:25', amount: 300 },
    { id: 3, title: 'Click en Anuncio #3', time: '1 de febrero, 2024 • 14:20', amount: 300 },
    { id: 4, title: 'Click en Anuncio #4', time: '1 de febrero, 2024 • 14:15', amount: 300 },
    { id: 5, title: 'Click en Anuncio #5', time: '1 de febrero, 2024 • 14:10', amount: 300 },
    { id: 6, title: 'Click en Anuncio #6', time: '1 de febrero, 2024 • 14:05', amount: 300 },
    { id: 7, title: 'Click en Anuncio #7', time: '1 de febrero, 2024 • 14:00', amount: 300 },
    { id: 8, title: 'Click en Anuncio #8', time: '1 de febrero, 2024 • 13:55', amount: 300 },
    { id: 9, title: 'Click en Anuncio #9', time: '1 de febrero, 2024 • 13:50', amount: 300 },
    { id: 10, title: 'Click en Anuncio #10', time: '1 de febrero, 2024 • 13:45', amount: 300 }
  ];
}
