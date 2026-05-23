import { Component, signal, ChangeDetectionStrategy } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { getSupabaseClient } from '../../core/supabase.client';

interface AccessUser {
  key: string;
  label: string;
  sublabel: string;
  email: string;
  password: string;
  iconSymbol: string;
  color: string;
  gradient: string;
  redirect: string;
  description: string;
  features: string[];
  badge?: string;
}

const USERS: AccessUser[] = [
  {
    key: 'superadmin',
    label: 'Super Admin',
    sublabel: 'superadmin@phc.dev',
    email: 'superadmin@phc.dev',
    password: 'PHC_SuperAdmin_2026!',
    iconSymbol: 'shield_person',
    color: '#7C3AED',
    gradient: 'linear-gradient(135deg,#7C3AED,#4F46E5)',
    redirect: '/movi-admin',
    description: 'Control total de Movi. Acceso a todos los módulos: conductores, pasajeros, viajes, retiros y configuración.',
    features: ['Aprobar conductores', 'Ver todos los viajes', 'Retiros & pagos', 'Cupones', 'Configuración comisión'],
    badge: 'MÁXIMO ACCESO',
  },
  {
    key: 'admin',
    label: 'Administrador',
    sublabel: 'admin@phc.dev',
    email: 'admin@phc.dev',
    password: 'PHC_Admin_2026!',
    iconSymbol: 'manage_accounts',
    color: '#0891B2',
    gradient: 'linear-gradient(135deg,#0891B2,#0369A1)',
    redirect: '/movi-admin',
    description: 'Gestión operativa de Movi: conductores pendientes, pasajeros, viajes activos, SOS y cupones.',
    features: ['Aprobar / rechazar conductores', 'Recarga de wallets', 'Viajes activos en tiempo real', 'Eventos SOS', 'Cupones promocionales'],
  },
  {
    key: 'contable',
    label: 'Contable',
    sublabel: 'contable@phc.dev',
    email: 'contable@phc.dev',
    password: 'PHC_Contable_2026!',
    iconSymbol: 'account_balance',
    color: '#059669',
    gradient: 'linear-gradient(135deg,#059669,#047857)',
    redirect: '/movi-admin',
    description: 'Vista financiera de Movi. Retiros pendientes de conductores, historial y analytics.',
    features: ['Retiros pendientes', 'Aprobar / rechazar retiros', 'Analytics financiero', 'Historial de pagos'],
  },
  {
    key: 'pasajero',
    label: 'Pasajero Movi',
    sublabel: 'pasajero@phc.dev',
    email: 'pasajero@phc.dev',
    password: 'PHC_Pasajero_2026!',
    iconSymbol: 'person_pin_circle',
    color: '#D97706',
    gradient: 'linear-gradient(135deg,#D97706,#B45309)',
    redirect: '/anda-gana',
    description: 'Usuario pasajero de Movi. Solicita viajes, ve conductores en el mapa y gestiona métodos de pago.',
    features: ['Solicitar viajes', 'Mapa en tiempo real', 'Historial de carreras', 'Chat con conductor'],
  },
  {
    key: 'conductor',
    label: 'Conductor Movi',
    sublabel: 'conductor@phc.dev',
    email: 'conductor@phc.dev',
    password: 'PHC_Conductor_2026!',
    iconSymbol: 'directions_car',
    color: '#DC2626',
    gradient: 'linear-gradient(135deg,#DC2626,#991B1B)',
    redirect: '/anda-gana',
    description: 'Conductor aprobado con $50.000 en wallet. Recibe solicitudes, navega y gestiona tus ganancias.',
    features: ['Estado ONLINE/OFFLINE', 'Recibir solicitudes', 'Wallet $50.000', 'Perfil aprobado'],
    badge: 'APROBADO',
  },
];

@Component({
  selector: 'app-quick-access',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
  template: `
    <div class="min-h-screen flex flex-col items-center justify-start py-10 px-4"
      style="background:linear-gradient(160deg,#0a0a0f 0%,#0f0f1a 50%,#0a0a0f 100%)">

      <!-- Header -->
      <div class="w-full max-w-4xl mb-10 text-center">
        <div class="inline-flex items-center gap-2 px-4 py-1.5 rounded-full mb-4"
          style="background:rgba(124,58,237,0.12);border:1px solid rgba(124,58,237,0.25)">
          <span class="material-symbols-outlined text-purple-400" style="font-size:14px">lock</span>
          <span class="text-purple-300 text-xs font-mono tracking-widest">ACCESO INTERNO · PHC SYSTEMS</span>
        </div>
        <h1 class="text-3xl font-black tracking-tight mb-2"
          style="background:linear-gradient(135deg,#fff,#a78bfa);-webkit-background-clip:text;-webkit-text-fill-color:transparent">
          Panel de Acceso Rápido
        </h1>
        <p class="text-slate-400 text-sm max-w-lg mx-auto">
          Entra a cualquier perfil con un clic. Sin verificación. Solo para uso interno de desarrollo y pruebas.
        </p>
      </div>

      <!-- Cards grid -->
      <div class="w-full max-w-4xl grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        @for (user of users; track user.key) {
          <div class="relative rounded-2xl overflow-hidden flex flex-col"
            style="background:#111118;border:1px solid rgba(255,255,255,0.07)">

            <!-- Top accent bar -->
            <div class="h-1 w-full" [style.background]="user.gradient"></div>

            <!-- Card content -->
            <div class="p-5 flex flex-col gap-4 flex-1">

              <!-- Icon + title + badge -->
              <div class="flex items-start justify-between gap-3">
                <div class="flex items-center gap-3">
                  <div class="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                    [style.background]="'rgba(' + hexToRgb(user.color) + ',0.12)'"
                    [style.border]="'1px solid rgba(' + hexToRgb(user.color) + ',0.25)'">
                    <span class="material-symbols-outlined" style="font-size:20px" [style.color]="user.color">{{ user.iconSymbol }}</span>
                  </div>
                  <div>
                    <p class="font-black text-sm text-white leading-tight">{{ user.label }}</p>
                    <p class="text-slate-500 text-[10px] font-mono mt-0.5">{{ user.sublabel }}</p>
                  </div>
                </div>
                @if (user.badge) {
                  <span class="text-[9px] font-black px-2 py-0.5 rounded-full flex-shrink-0"
                    [style.background]="'rgba(' + hexToRgb(user.color) + ',0.15)'"
                    [style.color]="user.color">{{ user.badge }}</span>
                }
              </div>

              <!-- Description -->
              <p class="text-slate-400 text-xs leading-relaxed">{{ user.description }}</p>

              <!-- Features list -->
              <ul class="flex flex-col gap-1.5">
                @for (feat of user.features; track feat) {
                  <li class="flex items-center gap-2">
                    <span class="w-1 h-1 rounded-full flex-shrink-0" [style.background]="user.color"></span>
                    <span class="text-slate-300 text-[11px]">{{ feat }}</span>
                  </li>
                }
              </ul>

              <!-- Spacer -->
              <div class="flex-1"></div>

              <!-- Login button -->
              <button
                [disabled]="loadingKey() === user.key"
                (click)="loginAs(user)"
                class="w-full py-2.5 rounded-xl text-white text-xs font-black flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed"
                [style.background]="loadingKey() === user.key ? 'rgba(255,255,255,0.05)' : user.gradient">
                @if (loadingKey() === user.key) {
                  <span class="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin"></span>
                  <span>Entrando...</span>
                } @else {
                  <span class="material-symbols-outlined" style="font-size:15px">login</span>
                  <span>Entrar como {{ user.label }}</span>
                }
              </button>
            </div>
          </div>
        }
      </div>

      <!-- Error -->
      @if (errorMsg()) {
        <div class="w-full max-w-4xl mb-4 rounded-xl px-4 py-3 flex items-center gap-3"
          style="background:rgba(220,38,38,0.1);border:1px solid rgba(220,38,38,0.3)">
          <span class="material-symbols-outlined text-red-400" style="font-size:18px">error</span>
          <p class="text-red-300 text-sm">{{ errorMsg() }}</p>
        </div>
      }

      <!-- Footer note -->
      <p class="text-slate-600 text-[10px] font-mono text-center max-w-sm">
        Esta página no está indexada ni es accesible desde ningún menú.
        URL confidencial — no compartir.
      </p>
    </div>
  `,
})
export class QuickAccessComponent {
  readonly users = USERS;
  loadingKey = signal<string | null>(null);
  errorMsg = signal<string | null>(null);

  private supabase = getSupabaseClient();

  constructor(private router: Router) {}

  async loginAs(user: AccessUser): Promise<void> {
    this.loadingKey.set(user.key);
    this.errorMsg.set(null);
    try {
      const { data, error } = await this.supabase.auth.signInWithPassword({
        email: user.email,
        password: user.password,
      });
      if (error) {
        this.errorMsg.set('Error al entrar como ' + user.label + ': ' + error.message);
        this.loadingKey.set(null);
        return;
      }
      // Para usuarios de anda-gana: garantizar que el perfil exista sin OTP
      if ((user.key === 'pasajero' || user.key === 'conductor') && data.user) {
        await this._ensureAgProfile(data.user.id, user.key, user.email);
      }
      await this.router.navigate([user.redirect]);
    } catch (e: any) {
      this.errorMsg.set(e?.message ?? 'Error inesperado');
      this.loadingKey.set(null);
    }
  }

  private async _ensureAgProfile(authUserId: string, key: 'pasajero' | 'conductor', email: string): Promise<void> {
    const { data: existing } = await this.supabase
      .from('ag_users')
      .select('id, role')
      .eq('auth_user_id', authUserId)
      .maybeSingle();

    if (existing) {
      // Si es conductor, asegurarse de que tenga ag_drivers
      if (key === 'conductor') await this._ensureDriverRow(existing.id);
      return;
    }

    const agRole = key === 'pasajero' ? 'passenger' : 'driver';
    const fullName = key === 'pasajero' ? 'Pasajero Test PHC' : 'Conductor Test PHC';
    const phone = key === 'pasajero' ? '3000000001' : '3000000002';

    const { data: newUser, error: userErr } = await this.supabase
      .from('ag_users')
      .insert({ auth_user_id: authUserId, role: agRole, full_name: fullName, phone, city: '', country: 'Colombia', department: '' })
      .select('id')
      .single();

    if (userErr || !newUser) return;

    if (key === 'conductor') await this._ensureDriverRow(newUser.id);
  }

  private async _ensureDriverRow(agUserId: string): Promise<void> {
    const { data: existing } = await this.supabase
      .from('ag_drivers')
      .select('id')
      .eq('ag_user_id', agUserId)
      .maybeSingle();

    if (existing) return;

    await this.supabase.from('ag_drivers').insert({
      ag_user_id: agUserId,
      vehicle_type: 'carro',
      vehicle_brand: 'Test',
      vehicle_color: 'Negro',
      plate: 'TEST01',
      status: 'approved',
      is_online: false,
      wallet_balance: 50000,
    });
  }

  hexToRgb(hex: string): string {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `${r},${g},${b}`;
  }
}
