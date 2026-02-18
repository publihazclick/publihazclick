import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideAngularModule } from 'lucide-angular';

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [CommonModule, LucideAngularModule],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss'
})
export class AdminDashboardComponent {
  // Iconos
  readonly Users = LucideAngularModule;
  readonly MousePointerClick = LucideAngularModule;
  readonly DollarSign = LucideAngularModule;
  readonly Clock = LucideAngularModule;
  readonly TrendingUp = LucideAngularModule;
  readonly TrendingDown = LucideAngularModule;
  readonly Check = LucideAngularModule;
  readonly X = LucideAngularModule;
  readonly Globe = LucideAngularModule;

  // Stats
  totalUsers = 24800;
  activeAds = 1402;
  totalRevenue = '$45.2M';
  pendingWithdrawals = 48;

  // Chart data (últimos 7 días)
  chartData = [
    { day: 'Mon', traffic: 32, engagement: 20 },
    { day: 'Tue', traffic: 40, engagement: 28 },
    { day: 'Wed', traffic: 36, engagement: 32 },
    { day: 'Thu', traffic: 48, engagement: 44 },
    { day: 'Fri', traffic: 56, engagement: 50 },
    { day: 'Sat', traffic: 24, engagement: 16 },
    { day: 'Sun', traffic: 20, engagement: 12 }
  ];

  // Pending moderation items
  pendingAds = [
    {
      id: '#AD-8842',
      title: 'Pizza Weekend 2x1',
      image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuA6-vAbh3zEYdpIpEOlqowjqOxU0KECvCDqoVWr-RNfNab_mM3o53N_sGgrEmtU38FNsDRrlJ-i98piK2opbuE9g05q2wtpi6jtKLe3e_TH8cK8cPq1YczgAHIk1PUoXOpcNvmeSWtT89B2Ub1VU3w0TREhDQlX1MVgUF_cnlcmi1I9PUYwVCpAFrjx9luzZjDo4L0vYrBGiubVYJoGREeI0PwIgOdgXNAF8D6YjIl0ThbarUp1pyji-2mZbEnIcaFABDRrLKoAO7Bh',
      submittedBy: 'MileniuStore',
      tier: 'Basic Advertiser',
      category: 'Food & Beverages',
      status: 'pending'
    },
    {
      id: '#AD-8845',
      title: 'SmartWatch Series 5',
      image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuCqJWHgYzbfxqgSYCeY5BOiFUA1UGS-y0S-ucn_0njMo5iGlXVAaoWNZnifhnSwinZpwk3sOc4ENyIBSvUWIPqW9n4eFTWOZImwwBeybOoLnvA0w3AGMxpbif26khD-sYbgzbmVOVmAcS41eouxnl3j8SS2DKs1RcDcUZel0dQttpW_ZcBcBLGSbhjURAYmPP9AFi6D0xow7ZVP3JBpnHjYFVM-Mx6wLRlxh2z69fZl8rrtTPvwwAOJYqYWjivTQe-DGhv2Za15q-sM',
      submittedBy: 'TechNova Pro',
      tier: 'Pro Advertiser',
      category: 'Electronics',
      status: 'pending'
    }
  ];

  // Revenue breakdown
  revenueBreakdown = [
    { label: 'Ad Sales', percentage: 68, color: 'bg-primary' },
    { label: 'Withdrawal Fees', percentage: 22, color: 'bg-blue-500' },
    { label: 'Other', percentage: 10, color: 'bg-slate-300 dark:bg-slate-700' }
  ];

  // Node clusters
  nodeClusters = [
    { name: 'USA-EAST-1', status: 'Active', statusClass: 'text-emerald-400' },
    { name: 'LATAM-NORTH', status: 'Active', statusClass: 'text-emerald-400' },
    { name: 'EU-CENTRAL', status: 'Active', statusClass: 'text-emerald-400' },
    { name: 'ASIA-SOUTH', status: 'Latency', statusClass: 'text-amber-400' }
  ];
}
