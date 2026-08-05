import {
  Component, ChangeDetectionStrategy, signal, computed, inject, OnInit, OnDestroy,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SlicePipe, DatePipe, CurrencyPipe } from '@angular/common';
import { Router } from '@angular/router';
import { AndaGanaService, AgUser, AgDriver } from '../anda-gana/anda-gana.service';
import { AuthService } from '../../core/services/auth.service';
import { ProfileService } from '../../core/services/profile.service';
import { UserRole } from '../../core/models/profile.model';

type AdminTab =
  | 'inicio' | 'analytics' | 'finanzas'
  | 'pendientes' | 'conductores' | 'pasajeros'
  | 'viajes' | 'sos' | 'retiros' | 'cupones' | 'configuracion';

interface TabDef { id: AdminTab; label: string; sym: string; color: string; border: string; roles: UserRole[]; }

const TABS: TabDef[] = [
  { id: 'inicio',        label: 'Inicio',        sym: 'dashboard',          color: 'text-orange-400',  border: 'border-orange-400',  roles: ['super_admin'] },
  { id: 'pendientes',    label: 'Pendientes',     sym: 'pending_actions',    color: 'text-amber-400',   border: 'border-amber-400',   roles: ['super_admin','movi_admin'] },
  { id: 'conductores',   label: 'Conductores',    sym: 'directions_car',     color: 'text-cyan-400',    border: 'border-cyan-400',    roles: ['super_admin','movi_admin'] },
  { id: 'pasajeros',     label: 'Pasajeros',      sym: 'person_pin_circle',  color: 'text-sky-400',     border: 'border-sky-400',     roles: ['super_admin','movi_admin'] },
  { id: 'viajes',        label: 'Viajes',         sym: 'route',              color: 'text-green-400',   border: 'border-green-400',   roles: ['super_admin','movi_admin'] },
  { id: 'sos',           label: 'SOS',            sym: 'emergency',          color: 'text-red-400',     border: 'border-red-400',     roles: ['super_admin','movi_admin'] },
  { id: 'cupones',       label: 'Cupones',        sym: 'confirmation_number', color: 'text-pink-400',   border: 'border-pink-400',    roles: ['super_admin','movi_admin'] },
  { id: 'finanzas',      label: 'Finanzas',       sym: 'account_balance',    color: 'text-emerald-400', border: 'border-emerald-400', roles: ['contable'] },
  { id: 'retiros',       label: 'Retiros',        sym: 'payments',           color: 'text-teal-400',    border: 'border-teal-400',    roles: ['super_admin','contable'] },
  { id: 'analytics',     label: 'Analytics',      sym: 'bar_chart',          color: 'text-blue-400',    border: 'border-blue-400',    roles: ['super_admin','contable'] },
  { id: 'configuracion', label: 'Configuración',  sym: 'tune',               color: 'text-purple-400',  border: 'border-purple-400',  roles: ['super_admin'] },
];

@Component({
  selector: 'app-movi-admin',
  standalone: true,
  imports: [FormsModule, SlicePipe, DatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
<div class="min-h-screen flex flex-col" style="background:#07070f">

  <!-- ══════════ HEADER ══════════ -->
  <header class="sticky top-0 z-50 flex items-center justify-between px-4 h-14 border-b"
    style="background:rgba(7,7,15,0.95);backdrop-filter:blur(20px);border-color:rgba(255,255,255,0.06)">
    <!-- Brand -->
    <div class="flex items-center gap-2.5">
      <div class="w-8 h-8 rounded-xl flex items-center justify-center"
        style="background:linear-gradient(135deg,#f97316,#dc2626)">
        <span class="material-symbols-outlined text-white" style="font-size:18px;font-variation-settings:'FILL' 1">directions_car</span>
      </div>
      <div class="leading-tight">
        <p class="text-white font-black text-base tracking-tight" style="letter-spacing:-0.02em">MOVI</p>
        <p class="text-[9px] font-bold uppercase tracking-widest" style="color:rgba(255,255,255,0.3)">
          @if (userRole() === 'super_admin') { Super Admin }
          @else if (userRole() === 'movi_admin') { Administrador }
          @else { Contable }
        </p>
      </div>
    </div>
    <!-- Right -->
    <div class="flex items-center gap-2">
      @if (sosActiveCount() > 0) {
        <button (click)="switchTab('sos')"
          class="flex items-center gap-1 px-2 py-1 rounded-lg animate-pulse"
          style="background:rgba(220,38,38,0.15);border:1px solid rgba(220,38,38,0.4)">
          <span class="material-symbols-outlined text-red-500" style="font-size:14px;font-variation-settings:'FILL' 1">emergency</span>
          <span class="text-red-400 text-[11px] font-black">{{ sosActiveCount() }}</span>
        </button>
      }
      @if (pendingDriversCount() > 0 && (userRole() === 'super_admin' || userRole() === 'movi_admin')) {
        <button (click)="switchTab('pendientes')"
          class="flex items-center gap-1 px-2 py-1 rounded-lg"
          style="background:rgba(245,158,11,0.1);border:1px solid rgba(245,158,11,0.3)">
          <span class="material-symbols-outlined text-amber-400" style="font-size:14px">pending_actions</span>
          <span class="text-amber-400 text-[11px] font-black">{{ pendingDriversCount() }}</span>
        </button>
      }
      <span class="text-slate-500 text-xs hidden sm:block">{{ userName() }}</span>
      <button (click)="logout()"
        class="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold text-slate-400 hover:text-white transition-colors"
        style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08)">
        <span class="material-symbols-outlined" style="font-size:14px">logout</span>
      </button>
    </div>
  </header>

  <!-- ══════════ TABS ══════════ -->
  <div class="flex gap-0 border-b overflow-x-auto flex-shrink-0" style="border-color:rgba(255,255,255,0.06);scrollbar-width:none">
    @for (t of visibleTabs(); track t.id) {
      <button (click)="switchTab(t.id)"
        class="relative flex items-center gap-1.5 px-4 py-3 text-[11px] font-black uppercase tracking-wide whitespace-nowrap flex-shrink-0 transition-all"
        [class]="tab() === t.id ? t.color : 'text-slate-600 hover:text-slate-400'">
        <span class="material-symbols-outlined" style="font-size:14px;font-variation-settings:'FILL' 1">{{ t.sym }}</span>
        {{ t.label }}
        @if (t.id === 'pendientes' && pendingDriversCount() > 0) {
          <span class="px-1.5 py-0.5 rounded-full text-[9px] font-black text-amber-900" style="background:#f59e0b">{{ pendingDriversCount() }}</span>
        }
        @if (t.id === 'sos' && sosActiveCount() > 0) {
          <span class="px-1.5 py-0.5 rounded-full text-[9px] font-black text-white" style="background:#dc2626">{{ sosActiveCount() }}</span>
        }
        @if (t.id === 'retiros' && pendingWithdrawalsCount() > 0) {
          <span class="px-1.5 py-0.5 rounded-full text-[9px] font-black text-white" style="background:#059669">{{ pendingWithdrawalsCount() }}</span>
        }
        @if (tab() === t.id) {
          <span class="absolute bottom-0 left-0 right-0 h-0.5 rounded-t" [class]="t.border.replace('border-','bg-')"></span>
        }
      </button>
    }
  </div>

  <!-- ══════════ BODY ══════════ -->
  <main class="flex-1 w-full max-w-5xl mx-auto px-4 py-6 flex flex-col gap-5">

    @if (loading()) {
      <div class="flex items-center justify-center py-24">
        <div class="flex flex-col items-center gap-3">
          <div class="w-12 h-12 rounded-2xl flex items-center justify-center" style="background:linear-gradient(135deg,#f97316,#dc2626)">
            <span class="material-symbols-outlined text-white animate-spin" style="font-size:24px">autorenew</span>
          </div>
          <p class="text-slate-500 text-sm">Cargando datos...</p>
        </div>
      </div>
    }

    <!-- ══ INICIO (super_admin) ══ -->
    @if (!loading() && tab() === 'inicio') {
      <!-- Real-time KPIs -->
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div class="rounded-2xl p-4 flex flex-col gap-2" style="background:rgba(16,185,129,0.06);border:1px solid rgba(16,185,129,0.15)">
          <div class="flex items-center justify-between">
            <p class="text-emerald-400 text-[10px] font-black uppercase tracking-widest">Conductores online</p>
            <span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
          </div>
          <p class="text-white font-black text-4xl">{{ inicioStats().driversOnline }}</p>
          <p class="text-emerald-600 text-[10px]">en este momento</p>
        </div>
        <div class="rounded-2xl p-4 flex flex-col gap-2" style="background:rgba(59,130,246,0.06);border:1px solid rgba(59,130,246,0.15)">
          <div class="flex items-center justify-between">
            <p class="text-blue-400 text-[10px] font-black uppercase tracking-widest">Viajes en curso</p>
            <span class="w-2 h-2 rounded-full bg-blue-400 animate-pulse"></span>
          </div>
          <p class="text-white font-black text-4xl">{{ inicioStats().activeTrips }}</p>
          <p class="text-blue-600 text-[10px]">activos ahora</p>
        </div>
        <div class="rounded-2xl p-4 flex flex-col gap-2" [style]="inicioStats().activeSOS > 0
          ? 'background:rgba(220,38,38,0.1);border:1px solid rgba(220,38,38,0.3)'
          : 'background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.07)'">
          <p [class]="inicioStats().activeSOS > 0 ? 'text-red-400' : 'text-slate-500'" class="text-[10px] font-black uppercase tracking-widest">SOS activos</p>
          <p class="text-white font-black text-4xl" [class]="inicioStats().activeSOS > 0 ? 'text-red-400' : ''">{{ inicioStats().activeSOS }}</p>
          <p class="text-slate-600 text-[10px]">emergencias</p>
        </div>
        <div class="rounded-2xl p-4 flex flex-col gap-2" [style]="inicioStats().pendingWithdrawalsCount > 0
          ? 'background:rgba(5,150,105,0.06);border:1px solid rgba(5,150,105,0.2)'
          : 'background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.07)'">
          <p class="text-teal-400 text-[10px] font-black uppercase tracking-widest">Retiros pendientes</p>
          <p class="text-white font-black text-2xl">{{ formatCOP(inicioStats().pendingWithdrawalsTotal) }}</p>
          <p class="text-slate-500 text-[10px]">{{ inicioStats().pendingWithdrawalsCount }} solicitudes</p>
        </div>
      </div>

      <!-- Platform stats -->
      <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div class="rounded-2xl p-4" style="background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.06)">
          <p class="text-slate-500 text-[10px] uppercase tracking-widest mb-1">Total pasajeros</p>
          <p class="text-white font-black text-3xl">{{ stats().passengers }}</p>
        </div>
        <div class="rounded-2xl p-4" style="background:rgba(245,158,11,0.04);border:1px solid rgba(245,158,11,0.12)">
          <p class="text-amber-400 text-[10px] uppercase tracking-widest mb-1">Pendientes aprobación</p>
          <p class="text-white font-black text-3xl">{{ stats().pending }}</p>
        </div>
        <div class="rounded-2xl p-4" style="background:rgba(16,185,129,0.04);border:1px solid rgba(16,185,129,0.12)">
          <p class="text-emerald-400 text-[10px] uppercase tracking-widest mb-1">Conductores aprobados</p>
          <p class="text-white font-black text-3xl">{{ stats().approved }}</p>
        </div>
        <div class="rounded-2xl p-4" style="background:rgba(239,68,68,0.04);border:1px solid rgba(239,68,68,0.12)">
          <p class="text-rose-400 text-[10px] uppercase tracking-widest mb-1">Rechazados</p>
          <p class="text-white font-black text-3xl">{{ stats().rejected }}</p>
        </div>
      </div>

      <!-- Quick actions -->
      <div class="grid grid-cols-2 md:grid-cols-3 gap-3">
        @if (stats().pending > 0) {
          <button (click)="switchTab('pendientes')"
            class="flex items-center gap-3 p-4 rounded-2xl text-left transition-all active:scale-[0.98]"
            style="background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.2)">
            <span class="material-symbols-outlined text-amber-400" style="font-size:24px;font-variation-settings:'FILL' 1">pending_actions</span>
            <div>
              <p class="text-amber-400 font-black text-sm">{{ stats().pending }} conductores esperan</p>
              <p class="text-slate-500 text-xs">Revisar solicitudes</p>
            </div>
          </button>
        }
        @if (inicioStats().pendingWithdrawalsCount > 0) {
          <button (click)="switchTab('retiros')"
            class="flex items-center gap-3 p-4 rounded-2xl text-left transition-all active:scale-[0.98]"
            style="background:rgba(5,150,105,0.06);border:1px solid rgba(5,150,105,0.2)">
            <span class="material-symbols-outlined text-teal-400" style="font-size:24px;font-variation-settings:'FILL' 1">payments</span>
            <div>
              <p class="text-teal-400 font-black text-sm">{{ inicioStats().pendingWithdrawalsCount }} retiros pendientes</p>
              <p class="text-slate-500 text-xs">{{ formatCOP(inicioStats().pendingWithdrawalsTotal) }}</p>
            </div>
          </button>
        }
        @if (inicioStats().activeSOS > 0) {
          <button (click)="switchTab('sos')"
            class="flex items-center gap-3 p-4 rounded-2xl text-left transition-all active:scale-[0.98] animate-pulse"
            style="background:rgba(220,38,38,0.1);border:1px solid rgba(220,38,38,0.3)">
            <span class="material-symbols-outlined text-red-400" style="font-size:24px;font-variation-settings:'FILL' 1">emergency</span>
            <div>
              <p class="text-red-400 font-black text-sm">{{ inicioStats().activeSOS }} SOS activo</p>
              <p class="text-slate-500 text-xs">Atender emergencia</p>
            </div>
          </button>
        }
        <button (click)="switchTab('conductores')"
          class="flex items-center gap-3 p-4 rounded-2xl text-left transition-all active:scale-[0.98]"
          style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07)">
          <span class="material-symbols-outlined text-cyan-400" style="font-size:24px;font-variation-settings:'FILL' 1">directions_car</span>
          <div>
            <p class="text-white font-black text-sm">Ver conductores</p>
            <p class="text-slate-500 text-xs">{{ stats().approved }} aprobados</p>
          </div>
        </button>
        <button (click)="switchTab('analytics')"
          class="flex items-center gap-3 p-4 rounded-2xl text-left transition-all active:scale-[0.98]"
          style="background:rgba(59,130,246,0.06);border:1px solid rgba(59,130,246,0.15)">
          <span class="material-symbols-outlined text-blue-400" style="font-size:24px;font-variation-settings:'FILL' 1">bar_chart</span>
          <div>
            <p class="text-white font-black text-sm">Ver analytics</p>
            <p class="text-slate-500 text-xs">Métricas del negocio</p>
          </div>
        </button>
        <button (click)="refreshInicio()"
          class="flex items-center gap-3 p-4 rounded-2xl text-left transition-all active:scale-[0.98]"
          style="background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.07)">
          <span class="material-symbols-outlined text-slate-400" style="font-size:24px">refresh</span>
          <div>
            <p class="text-slate-400 font-black text-sm">Actualizar</p>
            <p class="text-slate-600 text-xs">Recargar datos en vivo</p>
          </div>
        </button>
      </div>
    }

    <!-- ══ FINANZAS (contable) ══ -->
    @if (!loading() && tab() === 'finanzas') {
      <!-- KPIs financieros -->
      <div class="grid grid-cols-2 gap-3">
        <div class="rounded-2xl p-5 flex flex-col gap-1 col-span-2 md:col-span-1"
          style="background:rgba(5,150,105,0.07);border:1px solid rgba(5,150,105,0.2)">
          <p class="text-emerald-400 text-[10px] font-black uppercase tracking-widest">Volumen de negocio (GMV)</p>
          <p class="text-white font-black text-3xl">{{ formatCOP(financialData().gmv) }}</p>
          <p class="text-emerald-600 text-xs">Últimos {{ analyticsPeriod() }} días</p>
        </div>
        <div class="rounded-2xl p-5 flex flex-col gap-1 col-span-2 md:col-span-1"
          style="background:rgba(168,85,247,0.07);border:1px solid rgba(168,85,247,0.2)">
          <p class="text-purple-400 text-[10px] font-black uppercase tracking-widest">Comisiones estimadas ({{ commissionPct() }}%)</p>
          <p class="text-white font-black text-3xl">{{ formatCOP(financialData().estimatedCommissions) }}</p>
          <p class="text-purple-600 text-xs">{{ financialData().completedTrips }} viajes completados</p>
        </div>
      </div>

      <div class="grid grid-cols-2 md:grid-cols-3 gap-3">
        <div class="rounded-2xl p-4 flex flex-col gap-1"
          [style]="financialData().pendingWithdrawalsCount > 0
            ? 'background:rgba(245,158,11,0.06);border:1px solid rgba(245,158,11,0.2)'
            : 'background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.06)'">
          <p class="text-amber-400 text-[10px] font-black uppercase tracking-widest">Retiros pendientes</p>
          <p class="text-white font-black text-2xl">{{ formatCOP(financialData().pendingTotal) }}</p>
          <p class="text-slate-500 text-xs">{{ financialData().pendingWithdrawalsCount }} solicitudes</p>
        </div>
        <div class="rounded-2xl p-4 flex flex-col gap-1" style="background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.06)">
          <p class="text-teal-400 text-[10px] font-black uppercase tracking-widest">Total pagado</p>
          <p class="text-white font-black text-2xl">{{ formatCOP(financialData().completedTotal) }}</p>
          <p class="text-slate-500 text-xs">retiros aprobados</p>
        </div>
        <div class="rounded-2xl p-4 flex flex-col gap-1" style="background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.06)">
          <p class="text-cyan-400 text-[10px] font-black uppercase tracking-widest">Saldo en wallets</p>
          <p class="text-white font-black text-2xl">{{ formatCOP(financialData().totalWalletBalance) }}</p>
          <p class="text-slate-500 text-xs">conductores aprobados</p>
        </div>
      </div>

      <!-- Period selector -->
      <div class="flex items-center gap-2">
        <p class="text-slate-500 text-xs">Período:</p>
        @for (p of [7, 30, 90]; track p) {
          <button (click)="analyticsPeriod.set(p); loadFinancialSummary()" class="px-3 py-1.5 rounded-lg text-xs font-black"
            [class]="analyticsPeriod() === p ? 'bg-emerald-600 text-white' : 'text-slate-400'"
            [style]="analyticsPeriod() !== p ? 'background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.08)' : ''">{{ p }}d</button>
        }
      </div>

      <!-- CTA to withdrawals -->
      @if (financialData().pendingWithdrawalsCount > 0) {
        <button (click)="switchTab('retiros')"
          class="w-full py-3.5 rounded-2xl font-black text-sm flex items-center justify-center gap-2 transition-all active:scale-[0.99]"
          style="background:linear-gradient(135deg,#059669,#047857);color:#fff">
          <span class="material-symbols-outlined" style="font-size:18px;font-variation-settings:'FILL' 1">payments</span>
          Gestionar {{ financialData().pendingWithdrawalsCount }} retiros pendientes
          <span class="px-2 py-0.5 rounded-full text-[10px] bg-white/20">{{ formatCOP(financialData().pendingTotal) }}</span>
        </button>
      }
    }

    <!-- ══ CONDUCTORES PENDIENTES ══ -->
    @if (!loading() && tab() === 'pendientes') {
      @if (pendingDrivers().length === 0) {
        <div class="flex flex-col items-center gap-3 py-20">
          <span class="material-symbols-outlined text-slate-600" style="font-size:48px;font-variation-settings:'FILL' 1">check_circle</span>
          <p class="text-slate-500 text-sm">No hay conductores pendientes de aprobación.</p>
        </div>
      }
      @for (d of pendingDrivers(); track d.id) {
        <div class="rounded-2xl overflow-hidden" style="border:1px solid rgba(245,158,11,0.15)">
          <div class="h-0.5" style="background:linear-gradient(90deg,#f59e0b,#d97706)"></div>
          <div class="p-5 flex flex-col gap-4" style="background:rgba(255,255,255,0.02)">
            <!-- User info -->
            <div class="flex items-start justify-between gap-3">
              <div class="flex items-center gap-3">
                <div class="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0"
                  style="background:rgba(245,158,11,0.1);border:1px solid rgba(245,158,11,0.2)">
                  <span class="material-symbols-outlined text-amber-400" style="font-size:22px;font-variation-settings:'FILL' 1">person</span>
                </div>
                <div>
                  <p class="text-white font-black text-base">{{ d.ag_users?.full_name }}</p>
                  <p class="text-slate-400 text-xs">{{ d.ag_users?.email }}</p>
                  <p class="text-slate-500 text-xs">{{ d.ag_users?.phone }}</p>
                </div>
              </div>
              <div class="text-right flex-shrink-0">
                <p class="text-[10px] text-slate-600">{{ d.created_at | date:'dd/MM/yy' }}</p>
                <span class="inline-block mt-1 px-2 py-0.5 rounded-full text-[9px] font-black text-amber-900" style="background:#f59e0b">PENDIENTE</span>
              </div>
            </div>
            <!-- Vehicle grid -->
            <div class="grid grid-cols-3 gap-2 rounded-xl p-3" style="background:rgba(0,0,0,0.2)">
              <div><p class="text-[9px] text-slate-600 uppercase">Placa</p><p class="text-white font-black text-sm">{{ d.plate }}</p></div>
              <div><p class="text-[9px] text-slate-600 uppercase">Vehículo</p><p class="text-slate-200 text-xs">{{ d.vehicle_brand }} {{ d.vehicle_model }} {{ d.vehicle_year }}</p></div>
              <div><p class="text-[9px] text-slate-600 uppercase">Color</p><p class="text-slate-200 text-xs">{{ d.vehicle_color }}</p></div>
              <div><p class="text-[9px] text-slate-600 uppercase">Tipo</p><p class="text-slate-200 text-xs">{{ d.vehicle_type }}</p></div>
              <div><p class="text-[9px] text-slate-600 uppercase">Licencia</p><p class="text-slate-200 text-xs">{{ d.license_number }}</p></div>
              <div><p class="text-[9px] text-slate-600 uppercase">Vence</p><p class="text-slate-200 text-xs">{{ d.license_expiry }}</p></div>
            </div>
            <!-- Documents -->
            @if (d.documents && objectKeys(d.documents).length > 0) {
              <div>
                <p class="text-[10px] text-slate-500 uppercase tracking-widest font-bold mb-2">Documentos</p>
                <div class="flex flex-wrap gap-2">
                  @for (key of objectKeys(d.documents); track key) {
                    <a [href]="d.documents[key]" target="_blank"
                      class="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-slate-300 text-[11px] hover:text-white transition-colors"
                      style="background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1)">
                      <span class="material-symbols-outlined" style="font-size:12px">open_in_new</span>
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
                  class="bg-white/5 border border-rose-500/30 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-rose-500/50"/>
                <div class="flex gap-2">
                  <button (click)="confirmReject(d.id)"
                    class="flex-1 py-2.5 rounded-xl font-black text-xs uppercase text-white"
                    style="background:#ef4444">Confirmar rechazo</button>
                  <button (click)="rejectingId.set(null)"
                    class="px-4 py-2.5 rounded-xl text-slate-400 text-xs"
                    style="background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1)">Cancelar</button>
                </div>
              </div>
            } @else {
              <div class="flex gap-2">
                <button (click)="approve(d.id)" [disabled]="actionLoading() === d.id"
                  class="flex-1 py-3 rounded-xl font-black text-sm uppercase tracking-wide disabled:opacity-40 flex items-center justify-center gap-1.5"
                  style="background:#10b981;color:#000">
                  @if (actionLoading() === d.id) {
                    <span class="material-symbols-outlined animate-spin" style="font-size:16px">autorenew</span>
                  } @else {
                    <span class="material-symbols-outlined" style="font-size:16px;font-variation-settings:'FILL' 1">check_circle</span>
                  }
                  Aprobar
                </button>
                <button (click)="rejectingId.set(d.id)"
                  class="flex-1 py-3 rounded-xl font-black text-sm uppercase tracking-wide text-rose-400 flex items-center justify-center gap-1.5"
                  style="background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.2)">
                  <span class="material-symbols-outlined" style="font-size:16px;font-variation-settings:'FILL' 1">cancel</span>
                  Rechazar
                </button>
              </div>
            }
          </div>
        </div>
      }
    }

    <!-- ══ CONDUCTORES ══ -->
    @if (!loading() && tab() === 'conductores') {
      <!-- Search/filter -->
      <div class="flex gap-2 flex-wrap">
        @for (s of driverFilterOptions; track s.v) {
          <button (click)="driverFilter.set(s.v)"
            class="px-3 py-1.5 rounded-lg text-[11px] font-black uppercase transition-all"
            [class]="driverFilter() === s.v ? 'text-white' : 'text-slate-500'"
            [style]="driverFilter() === s.v ? s.style : 'background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08)'">
            {{ s.l }} <span class="ml-1 opacity-60">({{ driverCountFor(s.v) }})</span>
          </button>
        }
      </div>

      @if (filteredDrivers().length === 0) {
        <div class="text-center py-16 text-slate-600 text-sm">Sin conductores en este estado.</div>
      }

      @for (d of filteredDrivers(); track d.id) {
        <div class="rounded-2xl p-4 flex flex-col gap-3" style="background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.06)">
          <div class="flex items-center gap-3">
            <div class="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
              style="background:rgba(6,182,212,0.1);border:1px solid rgba(6,182,212,0.2)">
              <span class="material-symbols-outlined text-cyan-400" style="font-size:20px;font-variation-settings:'FILL' 1">directions_car</span>
            </div>
            <div class="flex-1 min-w-0">
              <p class="text-white font-bold text-sm truncate">{{ d.ag_users?.full_name }}</p>
              <p class="text-slate-500 text-xs">{{ d.plate }} · {{ d.vehicle_brand }} {{ d.vehicle_model }}</p>
              <div class="flex items-center gap-3 mt-0.5">
                @if (d.trips_completed !== undefined) {
                  <span class="text-[10px] text-slate-600">{{ d.trips_completed }} viajes</span>
                }
                @if (d.rating_avg && d.rating_count) {
                  <span class="text-[10px] text-amber-500">★ {{ formatRating(d.rating_avg) }} ({{ d.rating_count }})</span>
                }
                @if (d.is_online) {
                  <span class="flex items-center gap-1 text-[10px] text-emerald-400"><span class="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block"></span>Online</span>
                }
              </div>
            </div>
            <div class="flex flex-col items-end gap-1.5 flex-shrink-0">
              <span class="px-2 py-0.5 rounded-full text-[9px] font-black"
                [style]="d.status === 'approved' ? 'background:rgba(16,185,129,0.15);color:#34d399' : d.status === 'pending' ? 'background:rgba(245,158,11,0.15);color:#fbbf24' : 'background:rgba(239,68,68,0.15);color:#f87171'">
                {{ d.status === 'approved' ? 'APROBADO' : d.status === 'pending' ? 'PENDIENTE' : 'RECHAZADO' }}
              </span>
              <span class="text-[10px] text-slate-600">{{ d.created_at | date:'dd/MM/yy' }}</span>
            </div>
          </div>

          <!-- Wallet (approved only) -->
          @if (d.status === 'approved') {
            <div class="flex items-center gap-3 rounded-xl px-3 py-2.5" style="background:rgba(0,0,0,0.2);border:1px solid rgba(255,255,255,0.05)">
              <span class="material-symbols-outlined text-emerald-400 flex-shrink-0" style="font-size:18px;font-variation-settings:'FILL' 1">account_balance_wallet</span>
              <div class="flex-1">
                <p class="text-[10px] text-slate-500 uppercase font-bold">Saldo billetera</p>
                <p class="font-black text-sm text-emerald-400">{{ formatCOP(d.wallet_balance ?? 0) }}</p>
              </div>
              @if (rechargingId() === d.id) {
                <div class="flex items-center gap-2">
                  <input type="number" [(ngModel)]="rechargeAmount" placeholder="Monto COP"
                    class="w-28 rounded-lg px-2 py-1.5 text-white text-xs focus:outline-none"
                    style="background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.15)"/>
                  <button (click)="confirmRecharge(d.id)" [disabled]="actionLoading() === d.id"
                    class="px-3 py-1.5 rounded-lg text-xs font-black disabled:opacity-50"
                    style="background:#10b981;color:#000">OK</button>
                  <button (click)="rechargingId.set(null)"
                    class="px-2 py-1.5 rounded-lg text-slate-400 text-xs"
                    style="background:rgba(255,255,255,0.05)">✕</button>
                </div>
              } @else {
                <button (click)="rechargingId.set(d.id); rechargeAmount = 0"
                  class="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-black"
                  style="background:rgba(16,185,129,0.1);border:1px solid rgba(16,185,129,0.2);color:#34d399">
                  <span class="material-symbols-outlined" style="font-size:14px">add</span> Recargar
                </button>
              }
            </div>
          }
        </div>
      }
    }

    <!-- ══ PASAJEROS ══ -->
    @if (!loading() && tab() === 'pasajeros') {
      <p class="text-slate-600 text-xs">{{ passengers().length }} pasajeros registrados</p>
      @if (passengers().length === 0) {
        <div class="text-center py-16 text-slate-600 text-sm">No hay pasajeros registrados.</div>
      }
      @for (p of passengers(); track p.id) {
        <div class="rounded-2xl p-4 flex items-center gap-4" style="background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.06)">
          <div class="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
            style="background:rgba(14,165,233,0.1);border:1px solid rgba(14,165,233,0.2)">
            <span class="material-symbols-outlined text-sky-400" style="font-size:20px;font-variation-settings:'FILL' 1">person_pin_circle</span>
          </div>
          <div class="flex-1 min-w-0">
            <p class="text-white font-bold text-sm truncate">{{ p.full_name }}</p>
            <p class="text-slate-500 text-xs truncate">{{ p.email }}</p>
            <p class="text-slate-600 text-[11px]">{{ p.phone }} · {{ p.city }}</p>
          </div>
          <div class="flex flex-col items-end gap-1 flex-shrink-0">
            @if ((p.total_trips_as_passenger ?? 0) > 0) {
              <span class="text-[10px] text-sky-400 font-bold">{{ p.total_trips_as_passenger }} viajes</span>
            }
            @if (p.loyalty_points) {
              <span class="text-[10px] text-amber-500">{{ p.loyalty_points }} pts</span>
            }
            <span class="text-[10px] text-slate-600">{{ p.created_at | date:'dd/MM/yy' }}</span>
          </div>
        </div>
      }
    }

    <!-- ══ VIAJES ══ -->
    @if (!loading() && tab() === 'viajes') {
      <div class="flex gap-2">
        <button (click)="tripsView.set('active'); loadActiveTrips()"
          class="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-black uppercase transition-all"
          [class]="tripsView() === 'active' ? 'text-green-900' : 'text-slate-500'"
          [style]="tripsView() === 'active' ? 'background:#10b981' : 'background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08)'">
          <span class="w-2 h-2 rounded-full" [class]="tripsView() === 'active' ? 'bg-green-900 animate-pulse' : 'bg-slate-600'"></span>
          Activos ({{ activeTrips().length }})
        </button>
        <button (click)="tripsView.set('history'); loadTripHistory()"
          class="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-black uppercase transition-all"
          [class]="tripsView() === 'history' ? 'text-white' : 'text-slate-500'"
          [style]="tripsView() === 'history' ? 'background:rgba(255,255,255,0.12);border:1px solid rgba(255,255,255,0.2)' : 'background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08)'">
          Historial
        </button>
      </div>

      @if (tripsView() === 'active') {
        @if (activeTrips().length === 0) {
          <div class="flex flex-col items-center gap-3 py-20">
            <span class="material-symbols-outlined text-slate-600" style="font-size:48px;font-variation-settings:'FILL' 1">route</span>
            <p class="text-slate-500 text-sm">Sin viajes en curso ahora.</p>
          </div>
        }
        @for (t of activeTrips(); track t.id) {
          <div class="rounded-2xl p-4" style="background:rgba(16,185,129,0.04);border:1px solid rgba(16,185,129,0.12)">
            <div class="flex items-center justify-between flex-wrap gap-2 mb-2">
              <p class="text-white font-bold text-sm">{{ t.dest_name ?? 'Destino no especificado' }}</p>
              <span class="px-2 py-0.5 rounded-full text-[9px] font-black uppercase" style="background:rgba(16,185,129,0.15);color:#34d399">{{ t.status }}</span>
            </div>
            <div class="flex items-center gap-4 flex-wrap">
              <span class="text-emerald-400 font-black text-lg">{{ formatCOP(t.offered_price) }}</span>
              @if (t.distance_km) { <span class="text-slate-500 text-xs">{{ t.distance_km }} km</span> }
            </div>
            <p class="text-[11px] text-slate-500 mt-1">
              Pasajero: {{ t.passenger_user_id?.slice(0,8) }}…
              @if (t.driver_id) { · Conductor: {{ t.driver_id.slice(0,8) }}… }
            </p>
          </div>
        }
      }

      @if (tripsView() === 'history') {
        @if (tripHistory().length === 0) {
          <div class="text-center py-16 text-slate-600 text-sm">Sin historial disponible.</div>
        }
        @for (t of tripHistory(); track t.id) {
          <div class="rounded-2xl p-4" [style]="t.gps_integrity_flagged ? 'background:rgba(239,68,68,0.06);border:1px solid rgba(239,68,68,0.25)' : 'background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.05)'">
            <div class="flex items-center justify-between flex-wrap gap-2 mb-1">
              <p class="text-slate-300 font-semibold text-sm">{{ t.dest_name ?? 'Sin destino' }}</p>
              <div class="flex items-center gap-1.5">
                @if (t.gps_integrity_flagged) {
                  <span class="flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black uppercase" style="background:rgba(239,68,68,0.15);color:#f87171"
                    [title]="t.gps_integrity_detail?.reason">
                    <span class="material-symbols-outlined" style="font-size:11px">gps_off</span>
                    GPS sospechoso
                  </span>
                }
                <span class="px-2 py-0.5 rounded-full text-[9px] font-black uppercase"
                  [style]="t.status === 'completed' ? 'background:rgba(16,185,129,0.15);color:#34d399' : 'background:rgba(239,68,68,0.15);color:#f87171'">{{ t.status }}</span>
              </div>
            </div>
            <div class="flex items-center gap-4 flex-wrap">
              <span class="text-slate-200 font-black">{{ formatCOP(t.offered_price) }}</span>
              @if (t.distance_km) { <span class="text-slate-500 text-xs">{{ t.distance_km }} km</span> }
              <span class="text-slate-600 text-xs">{{ t.created_at | date:'dd/MM/yy HH:mm' }}</span>
            </div>
            @if (t.gps_integrity_flagged) {
              <p class="text-[10px] text-red-400/80 mt-1.5">{{ t.gps_integrity_detail?.reason }}</p>
            }
          </div>
        }
      }
    }

    <!-- ══ ANALYTICS ══ -->
    @if (tab() === 'analytics') {
      <div class="flex items-center gap-2">
        @for (p of [7, 30, 90]; track p) {
          <button (click)="analyticsPeriod.set(p); loadAnalytics()"
            class="px-4 py-2 rounded-xl text-xs font-black"
            [class]="analyticsPeriod() === p ? 'text-white' : 'text-slate-500'"
            [style]="analyticsPeriod() === p ? 'background:linear-gradient(135deg,#3b82f6,#1d4ed8)' : 'background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08)'">
            {{ p }} días
          </button>
        }
      </div>

      @if (analyticsData(); as a) {
        <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div class="rounded-2xl p-4" style="background:rgba(16,185,129,0.06);border:1px solid rgba(16,185,129,0.15)">
            <p class="text-[10px] text-emerald-400 uppercase tracking-wider mb-1">Viajes completados</p>
            <p class="text-3xl font-black text-white">{{ a.completed_trips }}</p>
          </div>
          <div class="rounded-2xl p-4" style="background:rgba(245,158,11,0.06);border:1px solid rgba(245,158,11,0.15)">
            <p class="text-[10px] text-amber-400 uppercase tracking-wider mb-1">GMV total</p>
            <p class="text-xl font-black text-white">{{ formatCOP(a.gmv_cop) }}</p>
          </div>
          <div class="rounded-2xl p-4" style="background:rgba(59,130,246,0.06);border:1px solid rgba(59,130,246,0.15)">
            <p class="text-[10px] text-blue-400 uppercase tracking-wider mb-1">Tasa completitud</p>
            <p class="text-3xl font-black text-white">{{ a.completion_rate }}<span class="text-lg">%</span></p>
          </div>
          <div class="rounded-2xl p-4" style="background:rgba(168,85,247,0.06);border:1px solid rgba(168,85,247,0.15)">
            <p class="text-[10px] text-purple-400 uppercase tracking-wider mb-1">Conductores activos</p>
            <p class="text-3xl font-black text-white">{{ a.active_drivers }}</p>
          </div>
          <div class="rounded-2xl p-4" style="background:rgba(236,72,153,0.06);border:1px solid rgba(236,72,153,0.15)">
            <p class="text-[10px] text-pink-400 uppercase tracking-wider mb-1">Pasajeros únicos</p>
            <p class="text-3xl font-black text-white">{{ a.unique_passengers }}</p>
          </div>
          <div class="rounded-2xl p-4" style="background:rgba(6,182,212,0.06);border:1px solid rgba(6,182,212,0.15)">
            <p class="text-[10px] text-cyan-400 uppercase tracking-wider mb-1">Nuevos conductores</p>
            <p class="text-3xl font-black text-white">{{ a.new_drivers }}</p>
          </div>
          <div class="rounded-2xl p-4" style="background:rgba(249,115,22,0.06);border:1px solid rgba(249,115,22,0.15)">
            <p class="text-[10px] text-orange-400 uppercase tracking-wider mb-1">Nuevos pasajeros</p>
            <p class="text-3xl font-black text-white">{{ a.new_passengers }}</p>
          </div>
          <div class="rounded-2xl p-4" style="background:rgba(239,68,68,0.06);border:1px solid rgba(239,68,68,0.2)">
            <p class="text-[10px] text-red-400 uppercase tracking-wider mb-1">Eventos SOS</p>
            <p class="text-3xl font-black text-red-400">{{ a.sos_events }}</p>
          </div>
        </div>

        @if (dailySeries().length > 0) {
          <div class="rounded-2xl p-5" style="background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.07)">
            <p class="text-[10px] text-slate-500 uppercase tracking-wider font-bold mb-4">Viajes completados por día</p>
            <div class="flex items-end gap-1 h-28">
              @for (d of dailySeries(); track d.day) {
                <div class="flex-1 rounded-t cursor-pointer transition-opacity hover:opacity-80"
                  style="background:linear-gradient(180deg,#3b82f6,#1d4ed8)"
                  [style.height.%]="barHeight(d.trips)"
                  [title]="d.day + ': ' + d.trips + ' viajes · ' + formatCOP(d.gmv)"></div>
              }
            </div>
            <div class="flex justify-between mt-2">
              <span class="text-[9px] text-slate-700">{{ dailySeries()[0]?.day }}</span>
              <span class="text-[9px] text-slate-700">{{ dailySeries()[dailySeries().length-1]?.day }}</span>
            </div>
          </div>
        }
      } @else {
        <div class="text-center py-16 text-slate-600 text-sm">Cargando analytics...</div>
      }
    }

    <!-- ══ SOS ══ -->
    @if (tab() === 'sos') {
      @if (sosEvents().length === 0) {
        <div class="flex flex-col items-center gap-3 py-20">
          <span class="material-symbols-outlined text-slate-600" style="font-size:48px;font-variation-settings:'FILL' 1">shield</span>
          <p class="text-slate-500 text-sm">Sin eventos SOS. Todo en orden.</p>
        </div>
      }
      @for (s of sosEvents(); track s.id) {
        <div class="rounded-2xl overflow-hidden" [style]="s.status === 'active' ? 'border:1px solid rgba(220,38,38,0.4)' : 'border:1px solid rgba(255,255,255,0.07)'">
          @if (s.status === 'active') { <div class="h-0.5 bg-red-500 animate-pulse"></div> }
          <div class="p-4" [style]="s.status === 'active' ? 'background:rgba(220,38,38,0.07)' : 'background:rgba(255,255,255,0.02)'">
            <div class="flex items-center justify-between flex-wrap gap-3 mb-2">
              <div class="flex items-center gap-2">
                <span class="material-symbols-outlined font-variation-settings:'FILL' 1"
                  [class]="s.status === 'active' ? 'text-red-400 animate-pulse' : 'text-slate-500'"
                  style="font-size:20px">emergency</span>
                <span class="px-2 py-0.5 rounded-full text-[9px] font-black uppercase"
                  [style]="s.status === 'active' ? 'background:#dc2626;color:#fff' : s.status === 'resolved' ? 'background:rgba(16,185,129,0.2);color:#34d399' : 'background:rgba(100,116,139,0.2);color:#94a3b8'">
                  {{ s.status === 'active' ? 'ACTIVO' : s.status === 'resolved' ? 'ATENDIDO' : 'FALSA ALARMA' }}
                </span>
                <span class="text-[10px] text-slate-500">{{ s.created_at | date:'dd/MM/yy HH:mm' }}</span>
              </div>
              @if (s.status === 'active') {
                <div class="flex gap-2">
                  <button (click)="resolveSos(s.id, 'resolved')"
                    class="px-3 py-1.5 rounded-lg text-xs font-black text-white" style="background:#10b981">Atendido</button>
                  <button (click)="resolveSos(s.id, 'false_alarm')"
                    class="px-3 py-1.5 rounded-lg text-xs font-black text-slate-300" style="background:rgba(255,255,255,0.08)">Falsa alarma</button>
                </div>
              }
            </div>
            @if (s.lat && s.lng) {
              <a [href]="'https://maps.google.com/?q=' + s.lat + ',' + s.lng" target="_blank"
                class="inline-flex items-center gap-1 text-xs text-blue-400 hover:underline">
                <span class="material-symbols-outlined" style="font-size:13px">location_on</span>Ver en Google Maps
              </a>
            }
            @if (s.message) { <p class="text-xs text-slate-300 mt-2 italic">"{{ s.message }}"</p> }
          </div>
        </div>
      }
    }

    <!-- ══ RETIROS ══ -->
    @if (tab() === 'retiros') {
      <div class="flex gap-2 flex-wrap">
        @for (s of [{v:'pending',l:'Pendientes'},{v:'completed',l:'Pagados'},{v:'rejected',l:'Rechazados'},{v:'',l:'Todos'}]; track s.v) {
          <button (click)="withdrawalFilter.set(s.v); loadWithdrawals()"
            class="px-3 py-1.5 rounded-lg text-[11px] font-black uppercase"
            [class]="withdrawalFilter() === s.v ? 'text-white' : 'text-slate-500'"
            [style]="withdrawalFilter() === s.v
              ? s.v === 'pending' ? 'background:#f59e0b;color:#000' : s.v === 'completed' ? 'background:#10b981;color:#000' : s.v === 'rejected' ? 'background:#ef4444' : 'background:rgba(255,255,255,0.15)'
              : 'background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08)'">
            {{ s.l }}
          </button>
        }
      </div>

      @if (withdrawals().length === 0) {
        <div class="flex flex-col items-center gap-3 py-20">
          <span class="material-symbols-outlined text-slate-600" style="font-size:48px;font-variation-settings:'FILL' 1">payments</span>
          <p class="text-slate-500 text-sm">Sin retiros en este estado.</p>
        </div>
      }

      @for (w of withdrawals(); track w.id) {
        <div class="rounded-2xl overflow-hidden" [style]="w.status === 'pending' ? 'border:1px solid rgba(245,158,11,0.2)' : 'border:1px solid rgba(255,255,255,0.06)'">
          @if (w.status === 'pending') { <div class="h-0.5" style="background:#f59e0b"></div> }
          <div class="p-4 flex flex-col gap-3" style="background:rgba(255,255,255,0.02)">
            <div class="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <p class="text-white font-black text-base">{{ w.ag_drivers?.ag_users?.full_name ?? 'Conductor' }}</p>
                <p class="text-slate-400 text-xs">{{ w.ag_drivers?.plate ?? '—' }} · {{ w.ag_drivers?.vehicle_brand ?? '' }}</p>
                <p class="text-slate-500 text-[11px]">{{ w.ag_drivers?.ag_users?.phone ?? '' }}</p>
              </div>
              <div class="text-right flex-shrink-0">
                <p class="text-emerald-400 font-black text-2xl">{{ formatCOP(w.amount) }}</p>
                <span class="inline-block mt-1 px-2 py-0.5 rounded-full text-[9px] font-black uppercase"
                  [style]="w.status === 'pending' ? 'background:rgba(245,158,11,0.15);color:#fbbf24' : w.status === 'completed' ? 'background:rgba(16,185,129,0.15);color:#34d399' : 'background:rgba(239,68,68,0.15);color:#f87171'">
                  {{ w.status }}
                </span>
                <p class="text-slate-600 text-[10px] mt-1">{{ w.created_at | date:'dd/MM/yy HH:mm' }}</p>
              </div>
            </div>
            <div class="flex gap-2 flex-wrap">
              <span class="px-2 py-1 rounded-lg text-[11px] text-slate-400" style="background:rgba(255,255,255,0.05)">{{ w.method }}</span>
              @if (w.details?.account) {
                <span class="px-2 py-1 rounded-lg text-[11px] text-slate-400" style="background:rgba(255,255,255,0.05)">{{ w.details.account }}</span>
              }
            </div>
            @if (w.status === 'pending') {
              @if (rejectingWithdrawalId() === w.id) {
                <div class="flex gap-2">
                  <input [(ngModel)]="withdrawalRejectReason" placeholder="Motivo del rechazo"
                    class="flex-1 rounded-lg px-3 py-2 text-white text-xs focus:outline-none"
                    style="background:rgba(255,255,255,0.06);border:1px solid rgba(239,68,68,0.3)"/>
                  <button (click)="confirmWithdrawalReject(w.id)" [disabled]="actionLoading() === w.id"
                    class="px-3 py-2 rounded-lg text-xs font-black text-white disabled:opacity-50" style="background:#ef4444">Confirmar</button>
                  <button (click)="rejectingWithdrawalId.set(null)"
                    class="px-2 py-2 rounded-lg text-slate-400 text-xs" style="background:rgba(255,255,255,0.05)">✕</button>
                </div>
              } @else {
                <div class="flex gap-2">
                  <button (click)="approveWithdrawal(w.id)" [disabled]="actionLoading() === w.id"
                    class="flex-1 py-2.5 rounded-xl font-black text-sm uppercase disabled:opacity-40 flex items-center justify-center gap-1.5"
                    style="background:#10b981;color:#000">
                    @if (actionLoading() === w.id) {
                      <span class="material-symbols-outlined animate-spin" style="font-size:16px">autorenew</span>
                    } @else { ✓ Aprobar pago }
                  </button>
                  <button (click)="rejectingWithdrawalId.set(w.id)"
                    class="flex-1 py-2.5 rounded-xl font-black text-sm uppercase text-rose-400 flex items-center justify-center gap-1.5"
                    style="background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.2)">
                    ✗ Rechazar
                  </button>
                </div>
              }
            }
          </div>
        </div>
      }
    }

    <!-- ══ CUPONES ══ -->
    @if (tab() === 'cupones') {
      <!-- Crear -->
      <div class="rounded-2xl p-5 flex flex-col gap-3" style="background:rgba(236,72,153,0.04);border:1px solid rgba(236,72,153,0.15)">
        <p class="text-white font-black text-sm flex items-center gap-2">
          <span class="material-symbols-outlined text-pink-400" style="font-size:18px;font-variation-settings:'FILL' 1">confirmation_number</span>
          Crear nuevo cupón
        </p>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-2">
          <input [(ngModel)]="couponCode" placeholder="Código (ej: PROMO20)"
            class="px-3 py-2.5 rounded-xl text-white text-sm focus:outline-none" style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1)"/>
          <input [(ngModel)]="couponTitle" placeholder="Título del cupón"
            class="px-3 py-2.5 rounded-xl text-white text-sm focus:outline-none" style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1)"/>
          <input [(ngModel)]="couponDescription" placeholder="Descripción"
            class="px-3 py-2.5 rounded-xl text-white text-sm focus:outline-none md:col-span-2" style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1)"/>
          <select [(ngModel)]="couponType" class="px-3 py-2.5 rounded-xl text-white text-sm focus:outline-none" style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1)">
            <option value="percent">Porcentaje de descuento</option>
            <option value="fixed">Monto fijo (COP)</option>
            <option value="first_trip">Solo primer viaje</option>
          </select>
          <input [(ngModel)]="couponValue" type="number" placeholder="Valor (% o COP)"
            class="px-3 py-2.5 rounded-xl text-white text-sm focus:outline-none" style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1)"/>
          <input [(ngModel)]="couponMaxUses" type="number" placeholder="Máximo de usos (opcional)"
            class="px-3 py-2.5 rounded-xl text-white text-sm focus:outline-none" style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1)"/>
          <input [(ngModel)]="couponValidUntil" type="date" placeholder="Fecha de expiración"
            class="px-3 py-2.5 rounded-xl text-white text-sm focus:outline-none" style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1)"/>
        </div>
        <button (click)="saveCoupon()" [disabled]="savingCoupon()"
          class="py-2.5 rounded-xl font-black text-sm uppercase disabled:opacity-50 flex items-center justify-center gap-2"
          style="background:linear-gradient(135deg,#ec4899,#be185d);color:#fff">
          @if (savingCoupon()) {
            <span class="material-symbols-outlined animate-spin" style="font-size:16px">autorenew</span> Creando...
          } @else {
            <span class="material-symbols-outlined" style="font-size:16px;font-variation-settings:'FILL' 1">add_circle</span> Crear cupón
          }
        </button>
      </div>

      <!-- Lista -->
      @if (coupons().length === 0) {
        <div class="text-center py-12 text-slate-600 text-sm">No hay cupones creados.</div>
      }
      @for (c of coupons(); track c.id) {
        <div class="rounded-2xl p-4" style="background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.07)">
          <div class="flex items-center justify-between flex-wrap gap-3">
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 flex-wrap mb-1">
                <code class="px-2 py-1 rounded-lg font-black text-sm" style="background:rgba(236,72,153,0.1);color:#f472b6">{{ c.code }}</code>
                <span class="text-white font-bold text-sm">{{ c.title }}</span>
                @if (!c.is_active) { <span class="text-[10px] text-slate-600 font-bold">(inactivo)</span> }
              </div>
              <p class="text-slate-400 text-xs">{{ c.description }}</p>
              <p class="text-[11px] text-slate-500 mt-1">
                {{ c.discount_type === 'percent' ? c.discount_value + '% descuento' : formatCOP(c.discount_value) + ' descuento fijo' }}
                · Usos: <span class="text-slate-300 font-bold">{{ c.total_uses }}</span>{{ c.max_uses ? '/' + c.max_uses : '' }}
                @if (c.valid_until) { · Expira {{ c.valid_until | date:'dd/MM/yy' }} }
              </p>
            </div>
            <button (click)="toggleCoupon(c)"
              class="px-3 py-2 rounded-xl text-xs font-black"
              [style]="c.is_active ? 'background:rgba(255,255,255,0.08);color:#94a3b8' : 'background:#10b981;color:#000'">
              {{ c.is_active ? 'Desactivar' : 'Activar' }}
            </button>
          </div>
        </div>
      }
    }

    <!-- ══ CONFIGURACIÓN (super_admin only) ══ -->
    @if (!loading() && tab() === 'configuracion') {
      <div class="flex flex-col gap-5">
        <!-- Comisión -->
        <div class="rounded-2xl p-6 flex flex-col gap-5" style="background:rgba(168,85,247,0.05);border:1px solid rgba(168,85,247,0.15)">
          <div class="flex items-center gap-3">
            <div class="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0"
              style="background:rgba(168,85,247,0.12);border:1px solid rgba(168,85,247,0.25)">
              <span class="material-symbols-outlined text-purple-400" style="font-size:22px;font-variation-settings:'FILL' 1">percent</span>
            </div>
            <div>
              <p class="text-white font-black">Comisión por servicio</p>
              <p class="text-slate-500 text-xs">Porcentaje cobrado al conductor al aceptar un viaje. Se descuenta de su wallet automáticamente.</p>
            </div>
          </div>

          <div class="flex items-center justify-center py-4">
            <div class="flex flex-col items-center gap-1 px-10 py-5 rounded-2xl"
              style="background:rgba(168,85,247,0.1);border:1px solid rgba(168,85,247,0.2)">
              <p class="font-black text-6xl" style="background:linear-gradient(135deg,#c084fc,#a855f7);-webkit-background-clip:text;-webkit-text-fill-color:transparent">
                {{ commissionPct() }}<span class="text-3xl">%</span>
              </p>
              <p class="text-slate-500 text-xs">comisión actual</p>
            </div>
          </div>

          <div class="flex flex-col gap-3">
            <div class="flex justify-between text-[10px] text-slate-600 font-bold uppercase tracking-widest">
              <span>0%</span><span>5%</span><span>10%</span><span>15%</span>
            </div>
            <input type="range" min="0" max="15" step="1"
              [value]="commissionPct()"
              (input)="commissionPct.set(+$any($event.target).value)"
              class="w-full h-2 rounded-full appearance-none cursor-pointer" style="accent-color:#a855f7"/>
          </div>

          <div class="flex gap-2 flex-wrap">
            @for (p of [0,3,5,8,10,12,15]; track p) {
              <button (click)="commissionPct.set(p)"
                class="px-4 py-2 rounded-xl text-xs font-black transition-all"
                [style]="commissionPct() === p ? 'background:#a855f7;color:#fff' : 'background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);color:#64748b'">
                {{ p }}%
              </button>
            }
          </div>

          <div class="rounded-xl p-3 text-center" style="background:rgba(0,0,0,0.2)">
            @if (commissionPct() === 0) {
              <p class="text-slate-500 text-xs">Con 0% los conductores toman servicios sin costo.</p>
            } @else {
              <p class="text-slate-400 text-xs">
                Ejemplo: viaje de <span class="text-white font-bold">{{ formatCOP(10000) }}</span>
                → comisión Movi <span class="text-purple-400 font-black">{{ formatCOP(exampleCommission()) }}</span>
                · conductor recibe <span class="text-emerald-400 font-bold">{{ formatCOP(10000 - exampleCommission()) }}</span>
              </p>
            }
          </div>

          <button (click)="saveCommission()" [disabled]="savingCommission()"
            class="w-full py-3.5 rounded-2xl font-black text-sm uppercase tracking-widest disabled:opacity-50 flex items-center justify-center gap-2"
            style="background:linear-gradient(135deg,#a855f7,#7c3aed);color:#fff">
            @if (savingCommission()) {
              <span class="material-symbols-outlined animate-spin" style="font-size:16px">autorenew</span> Guardando…
            } @else {
              <span class="material-symbols-outlined" style="font-size:16px;font-variation-settings:'FILL' 1">save</span> Guardar configuración
            }
          </button>
        </div>
      </div>
    }

  </main>
</div>
  `,
})
export class MoviAdminComponent implements OnInit {

  private readonly agService   = inject(AndaGanaService);
  private readonly authService = inject(AuthService);
  private readonly profileService = inject(ProfileService);
  private readonly router      = inject(Router);

  userRole = signal<UserRole | null>(null);
  userName = signal<string | null>(null);

  tab     = signal<AdminTab>('inicio');
  loading = signal(true);

  // Drivers
  driverFilter   = signal<string>('all');
  rechargingId   = signal<string | null>(null);
  rechargeAmount = 0;
  rejectingId    = signal<string | null>(null);
  rejectReason   = '';
  actionLoading  = signal<string | null>(null);

  stats          = signal({ passengers: 0, pending: 0, approved: 0, rejected: 0 });
  pendingDrivers = signal<AgDriver[]>([]);
  allDrivers     = signal<AgDriver[]>([]);
  passengers     = signal<AgUser[]>([]);

  filteredDrivers = computed(() => {
    const f = this.driverFilter();
    const all = this.allDrivers();
    return f === 'all' ? all : all.filter(d => d.status === f);
  });
  pendingDriversCount = computed(() => this.stats().pending);

  // Trips
  tripsView   = signal<'active' | 'history'>('active');
  activeTrips = signal<any[]>([]);
  tripHistory = signal<any[]>([]);

  // SOS
  sosEvents      = signal<any[]>([]);
  sosActiveCount = signal(0);

  // Withdrawals
  withdrawals             = signal<any[]>([]);
  withdrawalFilter        = signal('pending');
  rejectingWithdrawalId   = signal<string | null>(null);
  withdrawalRejectReason  = '';
  pendingWithdrawalsCount = signal(0);

  // Coupons
  coupons          = signal<any[]>([]);
  savingCoupon     = signal(false);
  couponCode = ''; couponTitle = ''; couponDescription = '';
  couponType: 'percent' | 'fixed' | 'first_trip' = 'percent';
  couponValue = 10; couponMaxDiscount: number | null = null;
  couponMaxUses: number | null = null; couponValidUntil = '';

  // Commission
  commissionPct    = signal(0);
  savingCommission = signal(false);
  exampleCommission = computed(() => Math.ceil(10000 * this.commissionPct() / 100));

  // Analytics
  analyticsPeriod = signal(30);
  analyticsData   = signal<any | null>(null);
  dailySeries     = signal<{ day: string; trips: number; gmv: number }[]>([]);

  // Inicio tab
  inicioStats = signal({
    driversOnline: 0, activeTrips: 0, activeSOS: 0,
    pendingWithdrawalsCount: 0, pendingWithdrawalsTotal: 0,
  });

  // Finanzas tab
  financialData = signal({
    gmv: 0, estimatedCommissions: 0, completedTrips: 0,
    pendingWithdrawalsCount: 0, pendingTotal: 0, completedTotal: 0, totalWalletBalance: 0,
  });

  visibleTabs = computed(() => {
    const role = this.userRole();
    if (!role) return [];
    return TABS.filter(t => t.roles.includes(role));
  });

  async ngOnInit(): Promise<void> {
    try {
      const profile = await this.profileService.getCurrentProfile();
      if (profile) {
        this.userRole.set(profile.role);
        this.userName.set(profile.full_name ?? profile.email ?? null);
        this.tab.set(this._defaultTab(profile.role));
      }
    } catch { /* ignore */ }

    await this.load();
    await Promise.all([
      this.loadCommission(),
      this.loadSos(),
      this.loadPendingWithdrawalsCount(),
    ]);

    const role = this.userRole();
    if (role === 'super_admin') await this.loadInicio();
    else if (role === 'contable') await this.loadFinancialSummary();
  }

  private _defaultTab(role: UserRole): AdminTab {
    if (role === 'super_admin')  return 'inicio';
    if (role === 'movi_admin')   return 'pendientes';
    if (role === 'contable')     return 'finanzas';
    return 'inicio';
  }

  switchTab(id: AdminTab): void {
    this.tab.set(id);
    if (id === 'analytics')     this.loadAnalytics();
    else if (id === 'sos')      this.loadSos();
    else if (id === 'viajes')   this.loadActiveTrips();
    else if (id === 'cupones')  this.loadCoupons();
    else if (id === 'retiros')  this.loadWithdrawals();
    else if (id === 'finanzas') this.loadFinancialSummary();
    else if (id === 'inicio')   this.loadInicio();
  }

  async refreshInicio(): Promise<void> {
    await Promise.all([this.load(), this.loadInicio(), this.loadSos(), this.loadPendingWithdrawalsCount()]);
  }

  async logout(): Promise<void> {
    await this.authService.logout();
    this.router.navigate(['/login']);
  }

  // ── Data loading ──────────────────────────────────────────

  async load(): Promise<void> {
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

  async loadInicio(): Promise<void> {
    const sb = this.agService['supabase'];
    const [onlineRes, tripsRes, pending] = await Promise.all([
      sb.from('ag_drivers').select('id', { count: 'exact', head: true }).eq('is_online', true).eq('status', 'approved'),
      sb.from('ag_trip_requests').select('id', { count: 'exact', head: true }).in('status', ['in_progress', 'accepted', 'pickup', 'arrived', 'on_route']),
      this.agService.adminListWithdrawals('pending'),
    ]);
    this.inicioStats.set({
      driversOnline: onlineRes.count ?? 0,
      activeTrips: tripsRes.count ?? 0,
      activeSOS: this.sosActiveCount(),
      pendingWithdrawalsCount: pending.length,
      pendingWithdrawalsTotal: pending.reduce((s: number, w: any) => s + (w.amount || 0), 0),
    });
  }

  async loadFinancialSummary(): Promise<void> {
    const sb = this.agService['supabase'];
    const [analyticsRes, pending, completed, walletRes] = await Promise.all([
      sb.rpc('ag_admin_stats', { p_days: this.analyticsPeriod() }),
      this.agService.adminListWithdrawals('pending'),
      this.agService.adminListWithdrawals('completed'),
      sb.from('ag_drivers').select('wallet_balance').eq('status', 'approved'),
    ]);
    const a = analyticsRes.data;
    const totalWallets = (walletRes.data ?? []).reduce((s: number, d: any) => s + (d.wallet_balance || 0), 0);
    const gmv = a?.gmv_cop ?? 0;
    const pct = this.commissionPct();
    this.financialData.set({
      gmv,
      estimatedCommissions: Math.ceil(gmv * pct / 100),
      completedTrips: a?.completed_trips ?? 0,
      pendingWithdrawalsCount: pending.length,
      pendingTotal: pending.reduce((s: number, w: any) => s + (w.amount || 0), 0),
      completedTotal: completed.reduce((s: number, w: any) => s + (w.amount || 0), 0),
      totalWalletBalance: totalWallets,
    });
  }

  async loadPendingWithdrawalsCount(): Promise<void> {
    const list = await this.agService.adminListWithdrawals('pending');
    this.pendingWithdrawalsCount.set(list.length);
  }

  async loadCommission(): Promise<void> {
    const pct = await this.agService.getCommissionPct();
    this.commissionPct.set(pct);
  }

  async saveCommission(): Promise<void> {
    this.savingCommission.set(true);
    await this.agService.setCommissionPct(this.commissionPct());
    this.savingCommission.set(false);
  }

  async loadSos(): Promise<void> {
    const { data } = await this.agService['supabase']
      .from('ag_sos_events').select('*')
      .order('created_at', { ascending: false }).limit(50);
    this.sosEvents.set(data ?? []);
    this.sosActiveCount.set((data ?? []).filter((s: any) => s.status === 'active').length);
  }

  async resolveSos(id: string, status: 'resolved' | 'false_alarm'): Promise<void> {
    await this.agService['supabase'].from('ag_sos_events')
      .update({ status, resolved_at: new Date().toISOString() }).eq('id', id);
    await this.loadSos();
  }

  async loadActiveTrips(): Promise<void> {
    const { data } = await this.agService['supabase']
      .from('ag_trip_requests').select('*')
      .in('status', ['in_progress', 'accepted', 'pickup', 'on_route', 'arrived'])
      .order('created_at', { ascending: false }).limit(50);
    this.activeTrips.set(data ?? []);
  }

  async loadTripHistory(): Promise<void> {
    const { data } = await this.agService['supabase']
      .from('ag_trip_requests').select('*')
      .in('status', ['completed', 'cancelled'])
      .order('created_at', { ascending: false }).limit(100);
    this.tripHistory.set(data ?? []);
  }

  async loadAnalytics(): Promise<void> {
    const sb = this.agService['supabase'];
    const [statsR, seriesR] = await Promise.all([
      sb.rpc('ag_admin_stats', { p_days: this.analyticsPeriod() }),
      sb.rpc('ag_admin_daily_series', { p_days: this.analyticsPeriod() }),
    ]);
    this.analyticsData.set(statsR.data ?? null);
    this.dailySeries.set((seriesR.data ?? []).map((r: any) => ({ day: r.day, trips: Number(r.trips), gmv: Number(r.gmv) })));
  }

  barHeight(val: number): number {
    const max = Math.max(...this.dailySeries().map(d => d.trips), 1);
    return Math.round((val / max) * 100);
  }

  async loadWithdrawals(): Promise<void> {
    const filter = this.withdrawalFilter();
    this.withdrawals.set(await this.agService.adminListWithdrawals(filter || undefined));
    if (!filter) {
      this.pendingWithdrawalsCount.set(this.withdrawals().filter((w: any) => w.status === 'pending').length);
    }
  }

  // ── Driver actions ────────────────────────────────────────

  async approve(driverId: string): Promise<void> {
    this.actionLoading.set(driverId);
    await this.agService.approveDriver(driverId);
    this.actionLoading.set(null);
    await this.load();
  }

  async confirmReject(driverId: string): Promise<void> {
    if (!this.rejectReason.trim()) return;
    this.actionLoading.set(driverId);
    await this.agService.rejectDriver(driverId, this.rejectReason.trim());
    this.rejectingId.set(null);
    this.rejectReason = '';
    this.actionLoading.set(null);
    await this.load();
  }

  async confirmRecharge(driverId: string): Promise<void> {
    if (!this.rechargeAmount || this.rechargeAmount <= 0) return;
    this.actionLoading.set(driverId);
    const result = await this.agService.adminRechargeDriver(driverId, this.rechargeAmount);
    if (result.success) { this.rechargingId.set(null); this.rechargeAmount = 0; await this.load(); }
    this.actionLoading.set(null);
  }

  // ── Withdrawal actions ────────────────────────────────────

  async approveWithdrawal(id: string): Promise<void> {
    this.actionLoading.set(id);
    await this.agService.adminApproveWithdrawal(id);
    this.actionLoading.set(null);
    await this.loadWithdrawals();
    await this.loadPendingWithdrawalsCount();
  }

  async confirmWithdrawalReject(id: string): Promise<void> {
    if (!this.withdrawalRejectReason.trim()) return;
    this.actionLoading.set(id);
    await this.agService.adminRejectWithdrawal(id, this.withdrawalRejectReason.trim());
    this.rejectingWithdrawalId.set(null);
    this.withdrawalRejectReason = '';
    this.actionLoading.set(null);
    await this.loadWithdrawals();
    await this.loadPendingWithdrawalsCount();
  }

  // ── Coupons ───────────────────────────────────────────────

  async loadCoupons(): Promise<void> {
    this.coupons.set(await this.agService.listCoupons());
  }

  async saveCoupon(): Promise<void> {
    if (!this.couponCode.trim() || !this.couponTitle.trim()) return;
    this.savingCoupon.set(true);
    try {
      await this.agService.createCoupon({
        code: this.couponCode.trim(), title: this.couponTitle.trim(),
        description: this.couponDescription.trim() || undefined,
        discountType: this.couponType, discountValue: Number(this.couponValue) || 0,
        maxUses: this.couponMaxUses ? Number(this.couponMaxUses) : undefined,
        validUntil: this.couponValidUntil ? new Date(this.couponValidUntil).toISOString() : undefined,
      });
      this.couponCode = ''; this.couponTitle = ''; this.couponDescription = '';
      await this.loadCoupons();
    } catch (e: any) { alert('Error: ' + (e?.message ?? 'No se pudo crear el cupón')); }
    finally { this.savingCoupon.set(false); }
  }

  async toggleCoupon(c: any): Promise<void> {
    await this.agService.toggleCoupon(c.id, !c.is_active);
    await this.loadCoupons();
  }

  // ── Helpers ───────────────────────────────────────────────

  readonly driverFilterOptions = [
    { v: 'all',      l: 'Todos',      style: 'background:rgba(255,255,255,0.15)' },
    { v: 'approved', l: 'Aprobados',  style: 'background:#10b981;color:#000' },
    { v: 'pending',  l: 'Pendientes', style: 'background:#f59e0b;color:#000' },
    { v: 'rejected', l: 'Rechazados', style: 'background:#ef4444' },
  ];

  driverCountFor(status: string): number {
    const all = this.allDrivers();
    return status === 'all' ? all.length : all.filter(d => d.status === status).length;
  }

  formatRating(val: number): string { return val.toFixed(1); }

  objectKeys(obj: Record<string, string>): string[] { return Object.keys(obj ?? {}); }

  docLabel(key: string): string {
    const labels: Record<string, string> = {
      idFront: 'Cédula frontal', idBack: 'Cédula trasera', selfieWithId: 'Selfie + cédula',
      criminalRecord: 'Antecedentes', licensePhoto: 'Licencia frontal', licenseBack: 'Licencia trasera',
      vehiclePhoto: 'Foto vehículo', vehicleSidePhoto: 'Foto lateral',
      soatPhoto: 'SOAT', propertyCardFront: 'Tarjeta prop. frontal',
      propertyCardBack: 'Tarjeta prop. trasera', tecnoPhoto: 'Tecnomecánica',
      civilLiability: 'Resp. civil',
    };
    return labels[key] ?? key;
  }

  formatCOP(amount: number): string {
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(amount ?? 0);
  }
}
