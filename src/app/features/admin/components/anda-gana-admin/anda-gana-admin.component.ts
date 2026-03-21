import { Component, ChangeDetectionStrategy, signal, inject, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SlicePipe } from '@angular/common';
import { AndaGanaService, AgUser, AgDriver } from '../../../../features/anda-gana/anda-gana.service';

type AdminTab = 'conductores-pendientes' | 'conductores' | 'pasajeros';

@Component({
  selector: 'app-anda-gana-admin',
  standalone: true,
  imports: [FormsModule, SlicePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
<div class="min-h-screen w-full flex flex-col py-6 px-4 max-w-5xl mx-auto gap-6">

  <!-- Header -->
  <div class="flex items-center justify-between">
    <div>
      <h1 class="text-white font-black text-2xl">Anda y Gana</h1>
      <p class="text-slate-500 text-sm">Panel de administración</p>
    </div>
    <button (click)="load()" class="w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 transition-colors">
      <span class="material-symbols-outlined text-slate-400" style="font-size:18px">refresh</span>
    </button>
  </div>

  <!-- Stats -->
  @if (!loading()) {
    <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
      <div class="bg-white/[0.03] border border-white/8 rounded-2xl p-4 flex flex-col gap-1">
        <p class="text-slate-500 text-xs uppercase tracking-widest">Pasajeros</p>
        <p class="text-white font-black text-3xl">{{ stats().passengers }}</p>
      </div>
      <div class="bg-amber-500/5 border border-amber-500/15 rounded-2xl p-4 flex flex-col gap-1">
        <p class="text-amber-400 text-xs uppercase tracking-widest">Pendientes</p>
        <p class="text-white font-black text-3xl">{{ stats().pending }}</p>
      </div>
      <div class="bg-emerald-500/5 border border-emerald-500/15 rounded-2xl p-4 flex flex-col gap-1">
        <p class="text-emerald-400 text-xs uppercase tracking-widest">Aprobados</p>
        <p class="text-white font-black text-3xl">{{ stats().approved }}</p>
      </div>
      <div class="bg-rose-500/5 border border-rose-500/15 rounded-2xl p-4 flex flex-col gap-1">
        <p class="text-rose-400 text-xs uppercase tracking-widest">Rechazados</p>
        <p class="text-white font-black text-3xl">{{ stats().rejected }}</p>
      </div>
    </div>
  }

  <!-- Tabs -->
  <div class="flex gap-2 border-b border-white/8 pb-0">
    <button (click)="tab.set('conductores-pendientes')"
      class="px-4 py-2 text-xs font-black uppercase tracking-widest transition-colors rounded-t-lg"
      [class]="tab() === 'conductores-pendientes' ? 'text-amber-400 border-b-2 border-amber-400' : 'text-slate-500 hover:text-slate-300'">
      Pendientes <span class="ml-1 px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-400 text-[10px]">{{ stats().pending }}</span>
    </button>
    <button (click)="tab.set('conductores')"
      class="px-4 py-2 text-xs font-black uppercase tracking-widest transition-colors rounded-t-lg"
      [class]="tab() === 'conductores' ? 'text-cyan-400 border-b-2 border-cyan-400' : 'text-slate-500 hover:text-slate-300'">
      Conductores
    </button>
    <button (click)="tab.set('pasajeros')"
      class="px-4 py-2 text-xs font-black uppercase tracking-widest transition-colors rounded-t-lg"
      [class]="tab() === 'pasajeros' ? 'text-orange-400 border-b-2 border-orange-400' : 'text-slate-500 hover:text-slate-300'">
      Pasajeros
    </button>
  </div>

  @if (loading()) {
    <div class="flex items-center justify-center py-16">
      <span class="material-symbols-outlined text-slate-500 animate-spin" style="font-size:36px">autorenew</span>
    </div>
  }

  <!-- ═══ CONDUCTORES PENDIENTES ═══ -->
  @if (!loading() && tab() === 'conductores-pendientes') {
    @if (pendingDrivers().length === 0) {
      <div class="text-center py-16 text-slate-500 text-sm">No hay conductores pendientes de aprobación.</div>
    }
    @for (d of pendingDrivers(); track d.id) {
      <div class="bg-white/[0.03] border border-white/8 rounded-2xl p-5 flex flex-col gap-4">
        <!-- Header -->
        <div class="flex items-start justify-between gap-3">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center flex-shrink-0">
              <span class="material-symbols-outlined text-cyan-400" style="font-size:20px">person</span>
            </div>
            <div>
              <p class="text-white font-black text-sm">{{ d.ag_users?.full_name }}</p>
              <p class="text-slate-500 text-xs">{{ d.ag_users?.email }} · {{ d.ag_users?.phone }}</p>
            </div>
          </div>
          <span class="text-[10px] text-slate-600">{{ d.created_at | slice:0:10 }}</span>
        </div>

        <!-- Vehicle info -->
        <div class="grid grid-cols-3 gap-3 bg-white/[0.02] rounded-xl p-3">
          <div><p class="text-slate-500 text-[10px] uppercase">Placa</p><p class="text-white font-black text-sm">{{ d.plate }}</p></div>
          <div><p class="text-slate-500 text-[10px] uppercase">Vehículo</p><p class="text-white text-xs">{{ d.vehicle_brand }} {{ d.vehicle_model }} {{ d.vehicle_year }}</p></div>
          <div><p class="text-slate-500 text-[10px] uppercase">Color</p><p class="text-white text-xs">{{ d.vehicle_color }}</p></div>
          <div><p class="text-slate-500 text-[10px] uppercase">Tipo</p><p class="text-white text-xs">{{ d.vehicle_type }}</p></div>
          <div><p class="text-slate-500 text-[10px] uppercase">Licencia</p><p class="text-white text-xs">{{ d.license_number }} ({{ d.license_category }})</p></div>
          <div><p class="text-slate-500 text-[10px] uppercase">Vence</p><p class="text-white text-xs">{{ d.license_expiry }}</p></div>
        </div>

        <!-- Documents -->
        @if (d.documents && objectKeys(d.documents).length > 0) {
          <div class="flex flex-col gap-2">
            <p class="text-slate-500 text-[10px] uppercase tracking-widest font-bold">Documentos adjuntos</p>
            <div class="flex flex-wrap gap-2">
              @for (key of objectKeys(d.documents); track key) {
                <a [href]="d.documents[key]" target="_blank"
                  class="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-slate-300 text-xs hover:bg-white/10 transition-colors">
                  <span class="material-symbols-outlined" style="font-size:14px">open_in_new</span>
                  {{ docLabel(key) }}
                </a>
              }
            </div>
          </div>
        }

        <!-- Reject reason input -->
        @if (rejectingId() === d.id) {
          <div class="flex flex-col gap-2">
            <input [(ngModel)]="rejectReason" placeholder="Motivo del rechazo (obligatorio)"
              class="bg-white/5 border border-rose-500/30 rounded-xl px-4 py-2 text-white text-sm focus:outline-none focus:border-rose-500/60"/>
            <div class="flex gap-2">
              <button (click)="confirmReject(d.id)"
                class="flex-1 py-2 rounded-xl bg-rose-500 text-white text-xs font-black uppercase">
                Confirmar rechazo
              </button>
              <button (click)="rejectingId.set(null)"
                class="px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-slate-400 text-xs">
                Cancelar
              </button>
            </div>
          </div>
        } @else {
          <!-- Actions -->
          <div class="flex gap-2">
            <button (click)="approve(d.id)"
              [disabled]="actionLoading() === d.id"
              class="flex-1 py-3 rounded-xl bg-emerald-500 text-black font-black text-sm uppercase tracking-wider disabled:opacity-50 flex items-center justify-center gap-1">
              @if (actionLoading() === d.id) {
                <span class="material-symbols-outlined animate-spin" style="font-size:16px">autorenew</span>
              } @else {
                <span class="material-symbols-outlined" style="font-size:16px">check_circle</span> Aprobar
              }
            </button>
            <button (click)="rejectingId.set(d.id)"
              class="flex-1 py-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 font-black text-sm uppercase tracking-wider flex items-center justify-center gap-1">
              <span class="material-symbols-outlined" style="font-size:16px">cancel</span> Rechazar
            </button>
          </div>
        }
      </div>
    }
  }

  <!-- ═══ TODOS LOS CONDUCTORES ═══ -->
  @if (!loading() && tab() === 'conductores') {
    @if (allDrivers().length === 0) {
      <div class="text-center py-16 text-slate-500 text-sm">No hay conductores registrados.</div>
    }
    @for (d of allDrivers(); track d.id) {
      <div class="bg-white/[0.03] border border-white/8 rounded-2xl p-4 flex items-center gap-4">
        <div class="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center flex-shrink-0">
          <span class="material-symbols-outlined text-cyan-400" style="font-size:20px">directions_car</span>
        </div>
        <div class="flex-1 min-w-0">
          <p class="text-white font-bold text-sm truncate">{{ d.ag_users?.full_name }}</p>
          <p class="text-slate-500 text-xs">{{ d.plate }} · {{ d.vehicle_brand }} {{ d.vehicle_model }}</p>
        </div>
        <div class="flex flex-col items-end gap-1">
          @if (d.status === 'pending') {
            <span class="px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 text-[10px] font-bold">Pendiente</span>
          } @else if (d.status === 'approved') {
            <span class="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 text-[10px] font-bold">Aprobado</span>
          } @else if (d.status === 'rejected') {
            <span class="px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-400 text-[10px] font-bold">Rechazado</span>
          }
          <span class="text-slate-600 text-[10px]">{{ d.created_at | slice:0:10 }}</span>
        </div>
      </div>
    }
  }

  <!-- ═══ PASAJEROS ═══ -->
  @if (!loading() && tab() === 'pasajeros') {
    @if (passengers().length === 0) {
      <div class="text-center py-16 text-slate-500 text-sm">No hay pasajeros registrados.</div>
    }
    @for (p of passengers(); track p.id) {
      <div class="bg-white/[0.03] border border-white/8 rounded-2xl p-4 flex items-center gap-4">
        <div class="w-10 h-10 rounded-xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center flex-shrink-0">
          <span class="material-symbols-outlined text-orange-400" style="font-size:20px">person</span>
        </div>
        <div class="flex-1 min-w-0">
          <p class="text-white font-bold text-sm truncate">{{ p.full_name }}</p>
          <p class="text-slate-500 text-xs truncate">{{ p.email }} · {{ p.city }}</p>
        </div>
        <div class="flex flex-col items-end gap-1">
          <span class="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 text-[10px] font-bold">Activo</span>
          <span class="text-slate-600 text-[10px]">{{ p.created_at | slice:0:10 }}</span>
        </div>
      </div>
    }
  }

</div>
  `,
})
export class AndaGanaAdminComponent implements OnInit {

  private readonly agService = inject(AndaGanaService);

  tab           = signal<AdminTab>('conductores-pendientes');
  loading       = signal(true);
  actionLoading = signal<string | null>(null);
  rejectingId   = signal<string | null>(null);
  rejectReason  = '';

  stats          = signal({ passengers: 0, pending: 0, approved: 0, rejected: 0 });
  pendingDrivers = signal<AgDriver[]>([]);
  allDrivers     = signal<AgDriver[]>([]);
  passengers     = signal<AgUser[]>([]);

  async ngOnInit() { await this.load(); }

  async load() {
    this.loading.set(true);
    const [statsData, pending, all, pass] = await Promise.all([
      this.agService.getStats(),
      this.agService.getDrivers('pending'),
      this.agService.getDrivers(),
      this.agService.getPassengers(),
    ]);
    this.stats.set(statsData);
    this.pendingDrivers.set(pending);
    this.allDrivers.set(all);
    this.passengers.set(pass);
    this.loading.set(false);
  }

  async approve(driverId: string) {
    this.actionLoading.set(driverId);
    await this.agService.approveDriver(driverId);
    this.actionLoading.set(null);
    await this.load();
  }

  async confirmReject(driverId: string) {
    if (!this.rejectReason.trim()) return;
    this.actionLoading.set(driverId);
    await this.agService.rejectDriver(driverId, this.rejectReason.trim());
    this.rejectingId.set(null);
    this.rejectReason = '';
    this.actionLoading.set(null);
    await this.load();
  }

  objectKeys(obj: Record<string, string>): string[] {
    return Object.keys(obj ?? {});
  }

  docLabel(key: string): string {
    const labels: Record<string, string> = {
      idFront: 'Cédula frontal', idBack: 'Cédula trasera',
      selfieWithId: 'Selfie con cédula', criminalRecord: 'Antecedentes',
      licensePhoto: 'Licencia frontal', licenseBack: 'Licencia trasera',
      vehiclePhoto: 'Foto vehículo', vehicleSidePhoto: 'Foto lateral',
      soatPhoto: 'SOAT', propertyCardFront: 'Propiedad frontal',
      propertyCardBack: 'Propiedad trasera', tecnoPhoto: 'Tecnomecánica',
      civilLiability: 'Resp. civil',
    };
    return labels[key] ?? key;
  }
}
