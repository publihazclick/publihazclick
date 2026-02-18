import { Component } from '@angular/core';
import { LucideAngularModule } from 'lucide-angular';

@Component({
  selector: 'app-admin-users',
  standalone: true,
  imports: [LucideAngularModule],
  template: `
    <div class="bg-white dark:bg-card-dark rounded-2xl border border-slate-200 dark:border-white/5 p-8">
      <h2 class="text-2xl font-bold mb-4">User Management</h2>
      <p class="text-slate-500">Manage platform users, roles, and permissions.</p>
    </div>
  `
})
export class AdminUsersComponent {
  readonly Users = LucideAngularModule;
}
