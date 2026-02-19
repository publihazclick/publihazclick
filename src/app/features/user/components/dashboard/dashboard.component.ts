import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-user-dashboard',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss'
})
export class UserDashboardComponent {
  // Stats del usuario
  balance = 25450;
  pendingBalance = 5000;
  totalEarned = 125000;
  referralEarnings = 15000;
  todayClicks = 7;
  dailyGoal = 10;

  // Datos de clicks de los últimos 7 días
  clicksHistory = [
    { day: 'Lun', clicks: 8, earnings: 2400 },
    { day: 'Mar', clicks: 12, earnings: 3600 },
    { day: 'Mie', clicks: 10, earnings: 3000 },
    { day: 'Jue', clicks: 15, earnings: 4500 },
    { day: 'Vie', clicks: 9, earnings: 2700 },
    { day: 'Sab', clicks: 6, earnings: 1800 },
    { day: 'Dom', clicks: 7, earnings: 2100 }
  ];

  // Anuncios disponibles para clickear
  availableAds = [
    {
      id: 1,
      title: 'Promoción Especial - Tienda Online',
      description: 'Ver catálogo de productos',
      reward: 300,
      duration: 30,
      type: 'banner',
      advertiser: 'MegaStore'
    },
    {
      id: 2,
      title: 'Nueva App de Delivery',
      description: 'Descubre la app y gana',
      reward: 500,
      duration: 45,
      type: 'video',
      advertiser: 'FastDelivery'
    },
    {
      id: 3,
      title: 'Oferta de Viajes',
      description: 'Explora destinos increíbles',
      reward: 400,
      duration: 30,
      type: 'banner',
      advertiser: 'Viajes Plus'
    },
    {
      id: 4,
      title: 'Seguro de Vida',
      description: 'Cotiza tu seguro ideal',
      reward: 600,
      duration: 60,
      type: 'microsite',
      advertiser: 'Seguros Seguros'
    }
  ];

  // Actividad reciente
  recentActivity = [
    { type: 'click', description: 'Clickeaste "Promoción Especial"', reward: 300, time: 'Hace 5 minutos' },
    { type: 'referral', description: 'Tu referido Juan hizo un click', reward: 30, time: 'Hace 1 hora' },
    { type: 'bonus', description: 'Bonus por meta diaria', reward: 1000, time: 'Hace 3 horas' },
    { type: 'withdrawal', description: 'Retiro aprobado', reward: -20000, time: 'Ayer' }
  ];

  // Niveles del sistema de referidos
  referralTiers = [
    { level: 1, percentage: 10, active: true },
    { level: 2, percentage: 5, active: true },
    { level: 3, percentage: 3, active: false },
    { level: 4, percentage: 2, active: false },
    { level: 5, percentage: 1, active: false }
  ];

  get progressPercentage(): number {
    return (this.todayClicks / this.dailyGoal) * 100;
  }
}
