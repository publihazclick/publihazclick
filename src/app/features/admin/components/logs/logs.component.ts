import { Component } from '@angular/core';

@Component({
  selector: 'app-admin-logs',
  standalone: true,
  template: `
    <div class="bg-white dark:bg-card-dark rounded-2xl border border-slate-200 dark:border-white/5 p-8">
      <h2 class="text-2xl font-bold mb-4">System Logs</h2>
      <p class="text-slate-500">View system activity logs and diagnostics.</p>
    </div>
  `
})
export class AdminLogsComponent {}
