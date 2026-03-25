import { Component, inject, ChangeDetectionStrategy } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { ProfileService } from '../../core/services/profile.service';

@Component({
  selector: 'app-cursos',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  template: `
    <div class="space-y-0">
      <!-- Sub-navegación tabs -->
      <div class="sticky top-0 z-30 bg-card-dark/95 backdrop-blur border-b border-white/5 -mx-4 lg:-mx-8 px-4 lg:px-8 mb-6">
        <nav class="flex items-center gap-1 overflow-x-auto scrollbar-hide py-1">
          <a routerLink="explorar" routerLinkActive="bg-sky-500/10 text-sky-400 border-sky-500/30"
             class="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-slate-400 hover:text-sky-300 hover:bg-sky-500/5 border border-transparent transition-all whitespace-nowrap flex-shrink-0">
            <span class="material-symbols-outlined" style="font-size:16px">explore</span>
            Explorar
          </a>
          <a routerLink="mis-cursos" routerLinkActive="bg-sky-500/10 text-sky-400 border-sky-500/30"
             class="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-slate-400 hover:text-sky-300 hover:bg-sky-500/5 border border-transparent transition-all whitespace-nowrap flex-shrink-0">
            <span class="material-symbols-outlined" style="font-size:16px">play_circle</span>
            Mis Cursos
          </a>
          <a routerLink="vender" routerLinkActive="bg-sky-500/10 text-sky-400 border-sky-500/30"
             class="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-slate-400 hover:text-sky-300 hover:bg-sky-500/5 border border-transparent transition-all whitespace-nowrap flex-shrink-0">
            <span class="material-symbols-outlined" style="font-size:16px">upload</span>
            Vender Curso
          </a>
          <a routerLink="afiliados" routerLinkActive="bg-sky-500/10 text-sky-400 border-sky-500/30"
             class="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-slate-400 hover:text-sky-300 hover:bg-sky-500/5 border border-transparent transition-all whitespace-nowrap flex-shrink-0">
            <span class="material-symbols-outlined" style="font-size:16px">link</span>
            Afiliados
          </a>
          <a routerLink="ganancias" routerLinkActive="bg-sky-500/10 text-sky-400 border-sky-500/30"
             class="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-slate-400 hover:text-sky-300 hover:bg-sky-500/5 border border-transparent transition-all whitespace-nowrap flex-shrink-0">
            <span class="material-symbols-outlined" style="font-size:16px">trending_up</span>
            Ganancias
          </a>
          @if (isAdmin()) {
            <a routerLink="admin" routerLinkActive="bg-sky-500/10 text-sky-400 border-sky-500/30"
               class="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-slate-400 hover:text-sky-300 hover:bg-sky-500/5 border border-transparent transition-all whitespace-nowrap flex-shrink-0">
              <span class="material-symbols-outlined" style="font-size:16px">admin_panel_settings</span>
              Admin
            </a>
          }
        </nav>
      </div>
      <router-outlet />
    </div>
  `,
})
export class CursosComponent {
  private readonly profileService = inject(ProfileService);
  readonly profile = this.profileService.profile;

  isAdmin(): boolean {
    return ['admin', 'dev'].includes(this.profile()?.role ?? '');
  }
}
