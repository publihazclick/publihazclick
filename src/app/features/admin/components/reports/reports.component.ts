import { Component } from '@angular/core';

@Component({
  selector: 'app-admin-reports',
  standalone: true,
  template: `
    <div class="bg-white dark:bg-card-dark rounded-2xl border border-slate-200 dark:border-white/5 p-8">
      <h2 class="text-2xl font-bold mb-4">Financial Reports</h2>
      <p class="text-slate-500">View platform financial analytics and reports.</p>
    </div>
  `
})
export class AdminReportsComponent {}
