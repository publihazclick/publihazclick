import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-user-referrals',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './referrals.component.html'
})
export class UserReferralsComponent {
  referrals = [
    { id: 1, name: 'Usuario 1', days: 1, earned: 1200 },
    { id: 2, name: 'Usuario 2', days: 2, earned: 2400 },
    { id: 3, name: 'Usuario 3', days: 3, earned: 800 },
    { id: 4, name: 'Usuario 4', days: 4, earned: 1500 },
    { id: 5, name: 'Usuario 5', days: 5, earned: 3200 }
  ];
}
