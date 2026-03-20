import { Component, ChangeDetectionStrategy, OnInit, signal, inject, computed } from '@angular/core';
import { DatePipe, DecimalPipe, NgClass } from '@angular/common';
import { AndaGanaService, AgDriver, AgUser, AgRideRequest } from '../../../anda-gana/anda-gana.service';

type AdminTab = 'dashboard' | 'drivers' | 'trips' | 'users' | 'config';
type DriversFilter = 'pending' | 'approved' | 'rejected' | 'all';
type TripsFilter = 'today' | 'week' | 'month' | 'all';

@Component({
  selector: 'app-anda-gana-admin',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, DecimalPipe, NgClass],
  template: `
<div class="min-h-screen bg-black text-white p-4 md:p-6 lg:p-8">

  <!-- ══════════ PAGE HEADER ══════════ -->
  <div class="flex items-center gap-4 mb-6">
    <div class="w-12 h-12 rounded-2xl bg-gradient-to-tr from-orange-500/30 to-amber-500/20 border border-orange-500/30 flex items-center justify-center shrink-0">
      <span class="material-symbols-outlined text-orange-400" style="font-size:24px">directions_car</span>
    </div>
    <div>
      <h1 class="text-xl font-black text-white tracking-tight">Anda y Gana · Admin</h1>
      <p class="text-slate-500 text-xs">Panel de administración del módulo de transporte</p>
    </div>
    <button (click)="reload()" [disabled]="loading()"
      class="ml-auto flex items-center gap-1.5 px-3 py-2 rounded-xl border border-white/10 text-slate-400 hover:text-white hover:bg-white/5 transition-all text-xs font-bold disabled:opacity-40">
      <span class="material-symbols-outlined text-sm" [class.animate-spin]="loading()">refresh</span>
      Actualizar
    </button>
  </div>

  <!-- ══════════ TABS ══════════ -->
  <div class="flex gap-1 bg-white/[0.03] border border-white/10 rounded-2xl p-1.5 mb-6 overflow-x-auto">
    @for (t of tabs; track t.key) {
      <button (click)="activeTab.set(t.key)"
        [class]="activeTab() === t.key
          ? 'flex items-center gap-2 px-4 py-2.5 rounded-xl font-black text-xs uppercase tracking-wider bg-orange-500 text-black shrink-0 transition-all'
          : 'flex items-center gap-2 px-4 py-2.5 rounded-xl font-black text-xs uppercase tracking-wider text-slate-400 hover:text-white hover:bg-white/5 shrink-0 transition-all'">
        <span class="material-symbols-outlined" style="font-size:16px">{{ t.icon }}</span>
        {{ t.label }}
        @if (t.badge && t.badge() > 0) {
          <span class="px-1.5 py-0.5 rounded-full text-[9px] font-black"
            [class]="activeTab() === t.key ? 'bg-black/20 text-black' : 'bg-rose-500 text-white'">
            {{ t.badge() }}
          </span>
        }
      </button>
    }
  </div>

  <!-- ══════════════════════════════════════════════════ -->
  <!-- TAB: DASHBOARD                                     -->
  <!-- ══════════════════════════════════════════════════ -->
  @if (activeTab() === 'dashboard') {
    <div class="flex flex-col gap-6">

      <!-- KPI grid -->
      <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <!-- Viajes hoy -->
        <div class="rounded-2xl p-4 border border-amber-500/20 bg-amber-500/5 flex flex-col gap-1">
          <p class="text-[9px] text-amber-400 uppercase tracking-widest font-black">Viajes hoy</p>
          <p class="text-3xl font-black text-white">{{ stats()?.tripsToday ?? '—' }}</p>
          <div class="flex items-center gap-1 mt-1">
            <span class="material-symbols-outlined text-amber-400" style="font-size:14px">directions_car</span>
            <span class="text-[10px] text-slate-500">completados</span>
          </div>
        </div>
        <!-- Ingresos hoy -->
        <div class="rounded-2xl p-4 border border-emerald-500/20 bg-emerald-500/5 flex flex-col gap-1">
          <p class="text-[9px] text-emerald-400 uppercase tracking-widest font-black">Ingresos hoy</p>
          <p class="text-2xl font-black text-emerald-400">\${{ (stats()?.revenueToday ?? 0) | number:'1.0-0' }}</p>
          <p class="text-[10px] text-emerald-700">COP cobrado</p>
        </div>
        <!-- Ingresos semana -->
        <div class="rounded-2xl p-4 border border-cyan-500/20 bg-cyan-500/5 flex flex-col gap-1">
          <p class="text-[9px] text-cyan-400 uppercase tracking-widest font-black">Ingresos semana</p>
          <p class="text-2xl font-black text-cyan-400">\${{ (stats()?.revenueWeek ?? 0) | number:'1.0-0' }}</p>
          <p class="text-[10px] text-cyan-700">COP · últimos 7 días</p>
        </div>
        <!-- Ingresos mes -->
        <div class="rounded-2xl p-4 border border-violet-500/20 bg-violet-500/5 flex flex-col gap-1">
          <p class="text-[9px] text-violet-400 uppercase tracking-widest font-black">Ingresos mes</p>
          <p class="text-2xl font-black text-violet-400">\${{ (stats()?.revenueMonth ?? 0) | number:'1.0-0' }}</p>
          <p class="text-[10px] text-violet-700">COP · últimos 30 días</p>
        </div>
        <!-- Viajes activos ahora -->
        <div class="rounded-2xl p-4 border border-rose-500/20 bg-rose-500/5 flex flex-col gap-1 col-span-2 sm:col-span-1">
          <div class="flex items-center gap-1.5 mb-1">
            <span class="w-2 h-2 rounded-full bg-rose-500 animate-pulse"></span>
            <p class="text-[9px] text-rose-400 uppercase tracking-widest font-black">En curso ahora</p>
          </div>
          <p class="text-3xl font-black text-rose-400">{{ stats()?.activeRides ?? '—' }}</p>
          <p class="text-[10px] text-rose-700">viajes activos</p>
        </div>
      </div>

      <!-- Segunda fila KPI -->
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div class="rounded-xl p-4 border border-white/10 bg-white/[0.02] flex flex-col gap-1">
          <p class="text-[9px] text-slate-500 uppercase tracking-widest font-bold">Conductores totales</p>
          <p class="text-2xl font-black text-white">{{ stats()?.totalDrivers ?? '—' }}</p>
        </div>
        <div class="rounded-xl p-4 border border-emerald-500/20 bg-emerald-500/5 flex flex-col gap-1">
          <p class="text-[9px] text-emerald-400 uppercase tracking-widest font-bold">En línea ahora</p>
          <p class="text-2xl font-black text-emerald-400">{{ stats()?.availableDrivers ?? '—' }}</p>
        </div>
        <div class="rounded-xl p-4 border border-amber-500/20 bg-amber-500/5 flex flex-col gap-1">
          <p class="text-[9px] text-amber-400 uppercase tracking-widest font-bold">Pendientes aprobación</p>
          <p class="text-2xl font-black text-amber-400">{{ stats()?.pendingDrivers ?? '—' }}</p>
        </div>
        <div class="rounded-xl p-4 border border-white/10 bg-white/[0.02] flex flex-col gap-1">
          <p class="text-[9px] text-slate-500 uppercase tracking-widest font-bold">Pasajeros registrados</p>
          <p class="text-2xl font-black text-white">{{ stats()?.totalPassengers ?? '—' }}</p>
        </div>
      </div>

      <!-- Viajes activos en tiempo real -->
      <div>
        <div class="flex items-center gap-2 mb-3">
          <span class="w-2 h-2 rounded-full bg-rose-500 animate-pulse"></span>
          <p class="text-[10px] text-slate-500 uppercase tracking-widest font-black">Viajes en tiempo real</p>
          <button (click)="loadActiveRides()" class="ml-auto text-[10px] text-orange-400 hover:underline font-bold">Actualizar</button>
        </div>

        @if (activeRides().length === 0) {
          <div class="flex items-center gap-3 px-4 py-4 rounded-xl border border-white/10 bg-white/[0.02]">
            <span class="material-symbols-outlined text-slate-600" style="font-size:22px">directions_car</span>
            <p class="text-slate-500 text-sm">No hay viajes activos en este momento</p>
          </div>
        } @else {
          <div class="flex flex-col gap-2">
            @for (ride of activeRides(); track ride.id) {
              <div class="flex items-start gap-3 px-4 py-3 rounded-xl border transition-all"
                [ngClass]="ride.status === 'in_progress' ? 'border-emerald-500/20 bg-emerald-500/5' : ride.status === 'accepted' ? 'border-amber-500/20 bg-amber-500/5' : 'border-white/10 bg-white/[0.02]'">
                <span class="px-2 py-0.5 rounded-full text-[9px] font-black uppercase shrink-0 mt-0.5"
                  [ngClass]="ride.status === 'in_progress' ? 'bg-emerald-500/20 text-emerald-400' : ride.status === 'accepted' ? 'bg-amber-500/20 text-amber-400' : 'bg-slate-500/20 text-slate-400'">
                  {{ ride.status === 'in_progress' ? 'En curso' : ride.status === 'accepted' ? 'Aceptado' : 'Buscando' }}
                </span>
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2 text-xs mb-0.5">
                    <span class="material-symbols-outlined text-emerald-400" style="font-size:12px">trip_origin</span>
                    <span class="text-slate-300 truncate">{{ ride.origin_address }}</span>
                  </div>
                  <div class="flex items-center gap-2 text-xs">
                    <span class="material-symbols-outlined text-rose-400" style="font-size:12px">location_on</span>
                    <span class="text-slate-400 truncate">{{ ride.dest_address }}</span>
                  </div>
                </div>
                <div class="text-right shrink-0">
                  <p class="text-amber-400 font-black text-sm">\${{ ride.offered_price | number:'1.0-0' }}</p>
                  <p class="text-slate-600 text-[10px]">{{ ride.created_at | date:'h:mm a' }}</p>
                </div>
              </div>
            }
          </div>
        }
      </div>

    </div>
  }

  <!-- ══════════════════════════════════════════════════ -->
  <!-- TAB: CONDUCTORES                                   -->
  <!-- ══════════════════════════════════════════════════ -->
  @if (activeTab() === 'drivers') {
    <div class="flex flex-col gap-4">

      <!-- Filtros -->
      <div class="flex gap-1 bg-white/[0.02] border border-white/10 rounded-xl p-1 w-fit">
        @for (f of driverFilters; track f.key) {
          <button (click)="driversFilter.set(f.key)"
            [class]="driversFilter() === f.key
              ? 'px-4 py-2 rounded-lg text-xs font-black bg-orange-500 text-black transition-all'
              : 'px-4 py-2 rounded-lg text-xs font-bold text-slate-400 hover:text-white transition-all'">
            {{ f.label }} ({{ driversCount()[f.key] }})
          </button>
        }
      </div>

      @if (driversLoading()) {
        <div class="flex items-center justify-center py-16">
          <span class="material-symbols-outlined text-orange-400 animate-spin" style="font-size:32px">autorenew</span>
        </div>
      } @else if (filteredDriversList().length === 0) {
        <div class="flex flex-col items-center gap-3 py-12 border border-white/10 rounded-2xl bg-white/[0.02] text-center">
          <span class="material-symbols-outlined text-slate-600" style="font-size:40px">person_search</span>
          <p class="text-slate-400 text-sm">No hay conductores en este estado</p>
        </div>
      } @else {
        <div class="flex flex-col gap-4">
          @for (driver of filteredDriversList(); track driver.id) {
            <div class="rounded-2xl border p-5 transition-all"
              [ngClass]="driver.status === 'pending' ? 'border-amber-500/20 bg-amber-500/5' : driver.status === 'approved' ? 'border-emerald-500/20 bg-emerald-500/5' : 'border-rose-500/20 bg-rose-500/5'">

              <!-- Header conductor -->
              <div class="flex items-start gap-4 mb-4">
                <div class="w-12 h-12 rounded-xl bg-white/10 border border-white/10 flex items-center justify-center shrink-0">
                  <span class="material-symbols-outlined text-slate-400" style="font-size:24px">person</span>
                </div>
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2 mb-1 flex-wrap">
                    <p class="text-white font-black text-base">{{ driver.ag_user?.full_name }}</p>
                    <span class="px-2 py-0.5 rounded-full text-[9px] font-black uppercase"
                      [ngClass]="driver.status === 'pending' ? 'bg-amber-500/20 text-amber-400' : driver.status === 'approved' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'">
                      {{ driver.status === 'pending' ? 'Pendiente' : driver.status === 'approved' ? 'Aprobado' : 'Rechazado' }}
                    </span>
                    @if (driver.status === 'approved') {
                      <span class="px-2 py-0.5 rounded-full text-[9px] font-black uppercase"
                        [ngClass]="driver.is_available ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-500/20 text-slate-500'">
                        {{ driver.is_available ? 'En línea' : 'Offline' }}
                      </span>
                    }
                  </div>
                  <p class="text-slate-400 text-xs">{{ driver.ag_user?.phone }}</p>
                  <p class="text-slate-500 text-xs">Registrado: {{ driver.created_at | date:'d MMM yyyy, h:mm a' }}</p>
                </div>
              </div>

              <!-- Info vehículo -->
              <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                <div class="rounded-xl bg-white/5 border border-white/10 px-3 py-2">
                  <p class="text-[9px] text-slate-500 uppercase tracking-wider">Placa</p>
                  <p class="text-white font-black text-sm">{{ driver.vehicle_plate }}</p>
                </div>
                <div class="rounded-xl bg-white/5 border border-white/10 px-3 py-2">
                  <p class="text-[9px] text-slate-500 uppercase tracking-wider">Vehículo</p>
                  <p class="text-white font-bold text-xs">{{ driver.vehicle_brand }} {{ driver.vehicle_model }}</p>
                </div>
                <div class="rounded-xl bg-white/5 border border-white/10 px-3 py-2">
                  <p class="text-[9px] text-slate-500 uppercase tracking-wider">Licencia</p>
                  <p class="text-white font-black text-sm">{{ driver.license_number }}</p>
                </div>
                @if (driver.soat_expiry) {
                  <div class="rounded-xl bg-white/5 border border-white/10 px-3 py-2">
                    <p class="text-[9px] text-slate-500 uppercase tracking-wider">SOAT vence</p>
                    <p class="text-white font-bold text-xs">{{ driver.soat_expiry | date:'d MMM yyyy' }}</p>
                  </div>
                }
              </div>

              <!-- Documentos -->
              <div class="flex gap-2 mb-4 flex-wrap">
                @if (driver.license_photo_url) {
                  <a [href]="driver.license_photo_url" target="_blank"
                    class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-cyan-500/30 bg-cyan-500/5 text-cyan-400 text-xs font-bold hover:bg-cyan-500/15 transition-all">
                    <span class="material-symbols-outlined" style="font-size:14px">id_card</span>
                    Ver licencia
                  </a>
                }
                @if (driver.vehicle_photo_url) {
                  <a [href]="driver.vehicle_photo_url" target="_blank"
                    class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-cyan-500/30 bg-cyan-500/5 text-cyan-400 text-xs font-bold hover:bg-cyan-500/15 transition-all">
                    <span class="material-symbols-outlined" style="font-size:14px">directions_car</span>
                    Ver foto vehículo
                  </a>
                }
                @if (driver.soat_photo_url) {
                  <a [href]="driver.soat_photo_url" target="_blank"
                    class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-cyan-500/30 bg-cyan-500/5 text-cyan-400 text-xs font-bold hover:bg-cyan-500/15 transition-all">
                    <span class="material-symbols-outlined" style="font-size:14px">receipt_long</span>
                    Ver SOAT
                  </a>
                }
              </div>

              @if (driver.rejection_reason) {
                <div class="flex items-start gap-2 px-3 py-2 rounded-xl bg-rose-500/10 border border-rose-500/20 mb-4">
                  <span class="material-symbols-outlined text-rose-400 shrink-0" style="font-size:14px">info</span>
                  <p class="text-rose-300 text-xs">Motivo rechazo: {{ driver.rejection_reason }}</p>
                </div>
              }

              <!-- Acciones -->
              @if (driver.status === 'pending') {
                <div class="flex gap-2">
                  <button (click)="approveDriver(driver.id)"
                    class="flex-1 py-2.5 rounded-xl font-black text-sm bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/25 transition-all">
                    <span class="flex items-center justify-center gap-1.5">
                      <span class="material-symbols-outlined" style="font-size:16px">check_circle</span>
                      Aprobar conductor
                    </span>
                  </button>
                  <button (click)="startReject(driver)"
                    class="flex-1 py-2.5 rounded-xl font-black text-sm bg-rose-500/10 border border-rose-500/20 text-rose-400 hover:bg-rose-500/20 transition-all">
                    <span class="flex items-center justify-center gap-1.5">
                      <span class="material-symbols-outlined" style="font-size:16px">cancel</span>
                      Rechazar
                    </span>
                  </button>
                </div>
              }
            </div>
          }
        </div>
      }

      <!-- Modal rechazo -->
      @if (rejectingDriver()) {
        <div class="fixed inset-0 z-50 flex items-center justify-center p-4" (click)="rejectingDriver.set(null)">
          <div class="absolute inset-0 bg-black/80 backdrop-blur-sm"></div>
          <div class="relative z-10 w-full max-w-sm rounded-2xl bg-[#0d0d0d] border border-rose-500/30 p-6 flex flex-col gap-4" (click)="$event.stopPropagation()">
            <h3 class="text-white font-black text-base">Rechazar conductor</h3>
            <p class="text-slate-400 text-sm">{{ rejectingDriver()?.ag_user?.full_name }}</p>
            <textarea [value]="rejectReason()" (input)="rejectReason.set($any($event.target).value)"
              placeholder="Motivo del rechazo (requerido)..." rows="3"
              class="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder:text-slate-600 focus:outline-none focus:border-rose-500/50 transition-all resize-none"></textarea>
            <div class="flex gap-2">
              <button (click)="rejectingDriver.set(null)"
                class="flex-1 py-2.5 rounded-xl border border-white/10 text-slate-400 font-black text-sm hover:bg-white/5 transition-all">
                Cancelar
              </button>
              <button (click)="confirmReject()" [disabled]="!rejectReason().trim()"
                class="flex-[2] py-2.5 rounded-xl bg-rose-500/20 border border-rose-500/30 text-rose-400 font-black text-sm hover:bg-rose-500/30 transition-all disabled:opacity-40">
                Confirmar rechazo
              </button>
            </div>
          </div>
        </div>
      }

    </div>
  }

  <!-- ══════════════════════════════════════════════════ -->
  <!-- TAB: VIAJES                                        -->
  <!-- ══════════════════════════════════════════════════ -->
  @if (activeTab() === 'trips') {
    <div class="flex flex-col gap-4">

      <!-- Filtro período -->
      <div class="flex items-center gap-3 flex-wrap">
        <div class="flex gap-1 bg-white/[0.02] border border-white/10 rounded-xl p-1">
          @for (f of tripFilters; track f.key) {
            <button (click)="tripsFilter.set(f.key); loadTrips()"
              [class]="tripsFilter() === f.key
                ? 'px-4 py-2 rounded-lg text-xs font-black bg-orange-500 text-black transition-all'
                : 'px-4 py-2 rounded-lg text-xs font-bold text-slate-400 hover:text-white transition-all'">
              {{ f.label }}
            </button>
          }
        </div>
        <div class="ml-auto flex items-center gap-2">
          <p class="text-slate-500 text-xs">{{ trips().length }} viajes</p>
          <div class="h-4 w-px bg-white/10"></div>
          <p class="text-emerald-400 text-xs font-black">\${{ tripsRevenue() | number:'1.0-0' }} COP</p>
        </div>
      </div>

      @if (tripsLoading()) {
        <div class="flex items-center justify-center py-16">
          <span class="material-symbols-outlined text-orange-400 animate-spin" style="font-size:32px">autorenew</span>
        </div>
      } @else if (trips().length === 0) {
        <div class="flex flex-col items-center gap-3 py-12 border border-white/10 rounded-2xl bg-white/[0.02] text-center">
          <span class="material-symbols-outlined text-slate-600" style="font-size:40px">route</span>
          <p class="text-slate-400 text-sm">No hay viajes en este período</p>
        </div>
      } @else {
        <!-- Resumen rápido -->
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div class="rounded-xl p-3 border border-white/10 bg-white/[0.02] text-center">
            <p class="text-2xl font-black text-white">{{ trips().length }}</p>
            <p class="text-[9px] text-slate-500 uppercase mt-1">Viajes</p>
          </div>
          <div class="rounded-xl p-3 border border-white/10 bg-white/[0.02] text-center">
            <p class="text-lg font-black text-white">\${{ tripsRevenue() | number:'1.0-0' }}</p>
            <p class="text-[9px] text-slate-500 uppercase mt-1">Total cobrado</p>
          </div>
          <div class="rounded-xl p-3 border border-rose-500/20 bg-rose-500/5 text-center">
            <p class="text-lg font-black text-rose-400">\${{ tripsCommission() | number:'1.0-0' }}</p>
            <p class="text-[9px] text-rose-500 uppercase mt-1">Comisión ({{ currentCommission() }}%)</p>
          </div>
          <div class="rounded-xl p-3 border border-emerald-500/20 bg-emerald-500/5 text-center">
            <p class="text-lg font-black text-emerald-400">\${{ tripsEarnings() | number:'1.0-0' }}</p>
            <p class="text-[9px] text-emerald-500 uppercase mt-1">Ganancias conductores</p>
          </div>
        </div>

        <!-- Lista de viajes -->
        <div class="flex flex-col gap-2">
          @for (trip of trips(); track trip.id) {
            <div class="flex flex-col sm:flex-row sm:items-center gap-3 px-4 py-3 rounded-xl border border-white/10 bg-white/[0.02] hover:border-white/20 transition-all">
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2 mb-0.5">
                  <span class="material-symbols-outlined text-emerald-400" style="font-size:12px">trip_origin</span>
                  <p class="text-white text-sm font-bold truncate">{{ trip.origin }}</p>
                </div>
                <div class="flex items-center gap-2">
                  <span class="material-symbols-outlined text-rose-400" style="font-size:12px">location_on</span>
                  <p class="text-slate-400 text-xs truncate">{{ trip.destination }}</p>
                </div>
                <div class="flex items-center gap-3 mt-1.5 flex-wrap">
                  @if (trip.driver?.ag_user?.full_name) {
                    <span class="flex items-center gap-0.5 text-[10px] text-amber-400">
                      <span class="material-symbols-outlined" style="font-size:11px">directions_car</span>
                      {{ trip.driver.ag_user.full_name }} · {{ trip.driver.vehicle_plate }}
                    </span>
                  }
                  @if (trip.passenger_name) {
                    <span class="flex items-center gap-0.5 text-[10px] text-slate-500">
                      <span class="material-symbols-outlined" style="font-size:11px">person</span>
                      {{ trip.passenger_name }}
                    </span>
                  }
                  <span class="text-[10px] text-slate-600">{{ trip.trip_date | date:'d MMM · h:mm a' }}</span>
                </div>
              </div>
              <div class="flex sm:flex-col items-center sm:items-end gap-3 sm:gap-0.5 shrink-0">
                <div class="text-right">
                  <p class="text-[9px] text-slate-500 uppercase">Cobrado</p>
                  <p class="text-white font-black text-sm">\${{ trip.total_amount | number:'1.0-0' }}</p>
                </div>
                <div class="text-right">
                  <p class="text-[9px] text-rose-500 uppercase">Comisión</p>
                  <p class="text-rose-400 text-xs font-bold">-\${{ trip.platform_commission | number:'1.0-0' }}</p>
                </div>
                <div class="text-right">
                  <p class="text-[9px] text-emerald-500 uppercase">Conductor</p>
                  <p class="text-emerald-400 font-black text-sm">\${{ trip.driver_earnings | number:'1.0-0' }}</p>
                </div>
              </div>
            </div>
          }
        </div>
      }
    </div>
  }

  <!-- ══════════════════════════════════════════════════ -->
  <!-- TAB: USUARIOS                                      -->
  <!-- ══════════════════════════════════════════════════ -->
  @if (activeTab() === 'users') {
    <div class="flex flex-col gap-4">

      <!-- Buscador -->
      <div class="flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl px-4 py-3 focus-within:border-orange-500/40 transition-all">
        <span class="material-symbols-outlined text-slate-500" style="font-size:18px">search</span>
        <input type="text" [value]="userSearch()" (input)="userSearch.set($any($event.target).value)"
          placeholder="Buscar por nombre o teléfono..."
          class="flex-1 bg-transparent text-white text-sm placeholder:text-slate-600 focus:outline-none" />
      </div>

      <p class="text-[10px] text-slate-500 uppercase tracking-widest font-black">{{ filteredUsers().length }} usuarios</p>

      @if (usersLoading()) {
        <div class="flex items-center justify-center py-16">
          <span class="material-symbols-outlined text-orange-400 animate-spin" style="font-size:32px">autorenew</span>
        </div>
      } @else if (filteredUsers().length === 0) {
        <div class="flex flex-col items-center gap-3 py-12 border border-white/10 rounded-2xl bg-white/[0.02] text-center">
          <span class="material-symbols-outlined text-slate-600" style="font-size:40px">person_search</span>
          <p class="text-slate-400 text-sm">No se encontraron usuarios</p>
        </div>
      } @else {
        <div class="flex flex-col gap-2">
          @for (user of filteredUsers(); track user.id) {
            <div class="flex items-center gap-4 px-4 py-3 rounded-xl border transition-all"
              [ngClass]="user.is_blocked ? 'border-rose-500/20 bg-rose-500/5' : 'border-white/10 bg-white/[0.02] hover:border-white/20'">

              <!-- Avatar placeholder -->
              <div class="w-10 h-10 rounded-full border border-white/10 flex items-center justify-center shrink-0"
                [ngClass]="user.role === 'driver' ? 'bg-amber-500/10' : 'bg-orange-500/10'">
                <span class="material-symbols-outlined text-sm"
                  [style.color]="user.role === 'driver' ? '#f59e0b' : '#f97316'">
                  {{ user.role === 'driver' ? 'directions_car' : 'person_pin_circle' }}
                </span>
              </div>

              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2 flex-wrap">
                  <p class="text-white font-bold text-sm">{{ user.full_name }}</p>
                  <span class="px-1.5 py-0.5 rounded text-[9px] font-black uppercase"
                    [ngClass]="user.role === 'driver' ? 'bg-amber-500/15 text-amber-400' : 'bg-orange-500/15 text-orange-400'">
                    {{ user.role === 'driver' ? 'Conductor' : 'Pasajero' }}
                  </span>
                  @if (user.is_blocked) {
                    <span class="px-1.5 py-0.5 rounded text-[9px] font-black uppercase bg-rose-500/20 text-rose-400">Bloqueado</span>
                  }
                </div>
                <p class="text-slate-500 text-xs">{{ user.phone }}</p>
                @if (user.is_blocked && user.blocked_reason) {
                  <p class="text-rose-400 text-xs mt-0.5">Motivo: {{ user.blocked_reason }}</p>
                }
              </div>

              <!-- Acción bloquear/desbloquear -->
              @if (!user.is_blocked) {
                <button (click)="startBlockUser(user)"
                  class="px-3 py-1.5 rounded-xl border border-rose-500/20 bg-rose-500/5 text-rose-400 text-xs font-black hover:bg-rose-500/15 transition-all shrink-0">
                  Bloquear
                </button>
              } @else {
                <button (click)="unblockUser(user.id)"
                  class="px-3 py-1.5 rounded-xl border border-emerald-500/20 bg-emerald-500/5 text-emerald-400 text-xs font-black hover:bg-emerald-500/15 transition-all shrink-0">
                  Desbloquear
                </button>
              }
            </div>
          }
        </div>
      }

      <!-- Modal bloqueo -->
      @if (blockingUser()) {
        <div class="fixed inset-0 z-50 flex items-center justify-center p-4" (click)="blockingUser.set(null)">
          <div class="absolute inset-0 bg-black/80 backdrop-blur-sm"></div>
          <div class="relative z-10 w-full max-w-sm rounded-2xl bg-[#0d0d0d] border border-rose-500/30 p-6 flex flex-col gap-4" (click)="$event.stopPropagation()">
            <h3 class="text-white font-black text-base">Bloquear usuario</h3>
            <p class="text-slate-400 text-sm">{{ blockingUser()?.full_name }}</p>
            <textarea [value]="blockReason()" (input)="blockReason.set($any($event.target).value)"
              placeholder="Motivo del bloqueo (requerido)..." rows="3"
              class="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder:text-slate-600 focus:outline-none focus:border-rose-500/50 transition-all resize-none"></textarea>
            <div class="flex gap-2">
              <button (click)="blockingUser.set(null)"
                class="flex-1 py-2.5 rounded-xl border border-white/10 text-slate-400 font-black text-sm hover:bg-white/5 transition-all">
                Cancelar
              </button>
              <button (click)="confirmBlock()" [disabled]="!blockReason().trim()"
                class="flex-[2] py-2.5 rounded-xl bg-rose-500/20 border border-rose-500/30 text-rose-400 font-black text-sm hover:bg-rose-500/30 transition-all disabled:opacity-40">
                Bloquear usuario
              </button>
            </div>
          </div>
        </div>
      }

    </div>
  }

  <!-- ══════════════════════════════════════════════════ -->
  <!-- TAB: CONFIGURACIÓN                                 -->
  <!-- ══════════════════════════════════════════════════ -->
  @if (activeTab() === 'config') {
    <div class="max-w-lg flex flex-col gap-5">

      <!-- Comisión -->
      <div class="rounded-2xl border border-white/10 bg-white/[0.02] p-6 flex flex-col gap-4">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center shrink-0">
            <span class="material-symbols-outlined text-rose-400" style="font-size:20px">percent</span>
          </div>
          <div>
            <h3 class="text-white font-black text-sm">Comisión por viaje</h3>
            <p class="text-slate-500 text-xs">Porcentaje que retiene la plataforma de cada viaje</p>
          </div>
        </div>

        <div class="flex items-center gap-3">
          <div class="flex-1 flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl px-4 py-3 focus-within:border-rose-500/50 transition-all">
            <input type="number" min="0" max="50" step="0.5"
              [value]="commissionInput()"
              (input)="commissionInput.set(+$any($event.target).value)"
              class="flex-1 bg-transparent text-white text-2xl font-black focus:outline-none w-20" />
            <span class="text-slate-400 text-xl font-black">%</span>
          </div>
          <button (click)="saveCommission()" [disabled]="savingCommission()"
            class="px-5 py-3 rounded-xl font-black text-sm bg-gradient-to-r from-orange-500 to-amber-500 text-black hover:from-orange-400 hover:to-amber-400 transition-all disabled:opacity-40 shrink-0">
            @if (savingCommission()) {
              <span class="material-symbols-outlined animate-spin" style="font-size:16px">autorenew</span>
            } @else {
              Guardar
            }
          </button>
        </div>

        @if (commissionSaved()) {
          <div class="flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
            <span class="material-symbols-outlined text-emerald-400" style="font-size:16px">check_circle</span>
            <p class="text-emerald-400 text-xs font-bold">Comisión actualizada correctamente</p>
          </div>
        }

        <!-- Simulador -->
        <div class="border-t border-white/10 pt-4">
          <p class="text-[10px] text-slate-500 uppercase tracking-widest font-black mb-3">Simulador</p>
          <div class="grid grid-cols-3 gap-2">
            @for (amount of [10000, 15000, 20000]; track amount) {
              <div class="rounded-xl bg-white/5 border border-white/10 p-3 text-center">
                <p class="text-[10px] text-slate-500 uppercase mb-1">Cobro \${{ amount | number:'1.0-0' }}</p>
                <p class="text-rose-400 font-black text-xs">-\${{ amount * commissionInput() / 100 | number:'1.0-0' }}</p>
                <p class="text-emerald-400 font-black text-sm">\${{ amount * (100 - commissionInput()) / 100 | number:'1.0-0' }}</p>
                <p class="text-[9px] text-slate-600 mt-0.5">al conductor</p>
              </div>
            }
          </div>
        </div>
      </div>

      <!-- Info comisión actual -->
      <div class="flex items-center gap-3 px-4 py-3 rounded-xl border border-amber-500/20 bg-amber-500/5">
        <span class="material-symbols-outlined text-amber-400 shrink-0" style="font-size:20px">info</span>
        <p class="text-amber-300 text-xs leading-relaxed">
          La comisión actual es del <span class="font-black">{{ currentCommission() }}%</span>. Este valor se aplica automáticamente a cada viaje registrado. Los conductores reciben el <span class="font-black">{{ 100 - currentCommission() }}%</span> restante.
        </p>
      </div>

    </div>
  }

</div>
  `,
})
export class AndaGanaAdminComponent implements OnInit {
  private svc = inject(AndaGanaService);

  // Tabs
  activeTab = signal<AdminTab>('dashboard');
  loading   = signal(false);

  readonly tabs: { key: AdminTab; label: string; icon: string; badge?: () => number }[] = [
    { key: 'dashboard', label: 'Dashboard',   icon: 'dashboard' },
    { key: 'drivers',   label: 'Conductores', icon: 'directions_car', badge: () => this.driversCount().pending },
    { key: 'trips',     label: 'Viajes',      icon: 'route' },
    { key: 'users',     label: 'Usuarios',    icon: 'group' },
    { key: 'config',    label: 'Config',      icon: 'settings' },
  ];

  // Dashboard
  stats       = signal<any>(null);
  activeRides = signal<AgRideRequest[]>([]);

  // Drivers
  allDrivers      = signal<AgDriver[]>([]);
  driversLoading  = signal(false);
  driversFilter   = signal<DriversFilter>('pending');
  rejectingDriver = signal<AgDriver | null>(null);
  rejectReason    = signal('');

  readonly driverFilters: { key: DriversFilter; label: string }[] = [
    { key: 'pending',  label: 'Pendientes' },
    { key: 'approved', label: 'Aprobados' },
    { key: 'rejected', label: 'Rechazados' },
    { key: 'all',      label: 'Todos' },
  ];

  driversCount = computed(() => {
    const d = this.allDrivers();
    return {
      pending:  d.filter(x => x.status === 'pending').length,
      approved: d.filter(x => x.status === 'approved').length,
      rejected: d.filter(x => x.status === 'rejected').length,
      all:      d.length,
    };
  });

  filteredDriversList = computed(() => {
    const f = this.driversFilter();
    const d = this.allDrivers();
    return f === 'all' ? d : d.filter(x => x.status === f);
  });

  // Trips
  trips        = signal<any[]>([]);
  tripsLoading = signal(false);
  tripsFilter  = signal<TripsFilter>('today');

  readonly tripFilters: { key: TripsFilter; label: string }[] = [
    { key: 'today', label: 'Hoy' },
    { key: 'week',  label: 'Semana' },
    { key: 'month', label: 'Mes' },
    { key: 'all',   label: 'Total' },
  ];

  tripsRevenue    = computed(() => this.trips().reduce((s, t) => s + Number(t.total_amount), 0));
  tripsCommission = computed(() => this.trips().reduce((s, t) => s + Number(t.platform_commission), 0));
  tripsEarnings   = computed(() => this.trips().reduce((s, t) => s + Number(t.driver_earnings), 0));

  // Users
  allUsers     = signal<any[]>([]);
  usersLoading = signal(false);
  userSearch   = signal('');
  blockingUser = signal<any>(null);
  blockReason  = signal('');

  filteredUsers = computed(() => {
    const q = this.userSearch().toLowerCase().trim();
    const u = this.allUsers();
    if (!q) return u;
    return u.filter(u => u.full_name?.toLowerCase().includes(q) || u.phone?.includes(q));
  });

  // Config
  currentCommission  = signal(15);
  commissionInput    = signal(15);
  savingCommission   = signal(false);
  commissionSaved    = signal(false);

  async ngOnInit() {
    await this.reload();
  }

  async reload() {
    this.loading.set(true);
    await Promise.all([
      this.loadStats(),
      this.loadDrivers(),
      this.loadTrips(),
      this.loadUsers(),
      this.loadCommission(),
    ]);
    this.loading.set(false);
  }

  private async loadStats() {
    const s = await this.svc.getAgAdminStats();
    this.stats.set(s);
    await this.loadActiveRides();
  }

  async loadActiveRides() {
    const rides = await this.svc.getActiveRideRequests();
    this.activeRides.set(rides);
  }

  private async loadDrivers() {
    this.driversLoading.set(true);
    const drivers = await this.svc.getAllDrivers();
    this.allDrivers.set(drivers);
    this.driversLoading.set(false);
  }

  async loadTrips() {
    this.tripsLoading.set(true);
    const data = await this.svc.getAgAllTrips(this.tripsFilter());
    this.trips.set(data);
    this.tripsLoading.set(false);
  }

  private async loadUsers() {
    this.usersLoading.set(true);
    const users = await this.svc.getAllAgUsers();
    this.allUsers.set(users);
    this.usersLoading.set(false);
  }

  private async loadCommission() {
    const rate = await this.svc.getCommissionRate();
    this.currentCommission.set(rate);
    this.commissionInput.set(rate);
  }

  // Drivers
  async approveDriver(driverId: string) {
    await this.svc.approveDriver(driverId);
    await this.loadDrivers();
    const s = await this.svc.getAgAdminStats();
    this.stats.set(s);
  }

  startReject(driver: AgDriver) {
    this.rejectingDriver.set(driver);
    this.rejectReason.set('');
  }

  async confirmReject() {
    const d = this.rejectingDriver();
    if (!d || !this.rejectReason().trim()) return;
    await this.svc.rejectDriver(d.id, this.rejectReason().trim());
    this.rejectingDriver.set(null);
    await this.loadDrivers();
    const s = await this.svc.getAgAdminStats();
    this.stats.set(s);
  }

  // Users
  startBlockUser(user: any) {
    this.blockingUser.set(user);
    this.blockReason.set('');
  }

  async confirmBlock() {
    const u = this.blockingUser();
    if (!u || !this.blockReason().trim()) return;
    await this.svc.blockAgUser(u.id, true, this.blockReason().trim());
    this.blockingUser.set(null);
    await this.loadUsers();
  }

  async unblockUser(agUserId: string) {
    await this.svc.blockAgUser(agUserId, false);
    await this.loadUsers();
  }

  // Config
  async saveCommission() {
    const rate = this.commissionInput();
    if (rate < 0 || rate > 50) return;
    this.savingCommission.set(true);
    this.commissionSaved.set(false);
    const ok = await this.svc.setCommissionRate(rate);
    this.savingCommission.set(false);
    if (ok) {
      this.currentCommission.set(rate);
      this.commissionSaved.set(true);
      setTimeout(() => this.commissionSaved.set(false), 3000);
    }
  }
}
