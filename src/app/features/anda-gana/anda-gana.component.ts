import { Component, ChangeDetectionStrategy, signal, computed, inject, OnInit, OnDestroy, PLATFORM_ID } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { isPlatformBrowser, SlicePipe, DatePipe, DecimalPipe } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { AndaGanaService, AgUser, AgTripOffer, AgTripRequest, AgPaymentMethod } from './anda-gana.service';
import { RealtimeChannel } from '@supabase/supabase-js';
import { environment } from '../../../environments/environment';
import { getSupabaseClient } from '../../core/supabase.client';

type AgScreen = 'splash' | 'loading' | 'home' | 'passenger-form' | 'driver-form' | 'passenger-home' | 'driver-home';
type GpsStatus = 'idle' | 'requesting' | 'granted' | 'denied';

@Component({
  selector: 'app-anda-gana',
  standalone: true,
  imports: [FormsModule, SlicePipe, DatePipe, DecimalPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
<div class="min-h-screen w-full flex flex-col items-center py-6 px-4"
  [style.background]="screen() === 'home' ? 'linear-gradient(135deg,#6C3AED 0%,#2563EB 100%)' : ''">

  <!-- ═══════════ SPLASH ═══════════ -->
  @if (screen() === 'splash') {
    <div class="fixed inset-0 z-[999] flex items-center justify-center"
      style="background:linear-gradient(135deg,#6C3AED 0%,#2563EB 100%)">
      <img src="movi-splash.svg" alt="Movi"
        [style.width.px]="splashSize()"
        [style.height.px]="splashSize()"
        style="transition:width 3.5s cubic-bezier(0.05,0.6,0.3,1),height 3.5s cubic-bezier(0.05,0.6,0.3,1)" />
    </div>
  }

  <!-- ═══════════ LOADING ═══════════ -->
  @if (screen() === 'loading') {
    <div class="flex-1 flex items-center justify-center">
      <span class="material-symbols-outlined text-orange-400 animate-spin" style="font-size:40px">autorenew</span>
    </div>
  }

  <!-- ═══════════ PASAJERO DASHBOARD ═══════════ -->
  @if (screen() === 'passenger-home') {
    <div class="w-full max-w-lg flex flex-col gap-3">

      <!-- Compact header -->
      <div class="flex items-center justify-between px-1 pt-2">
        <div>
          <h1 class="text-white font-black text-lg leading-tight">¡Hola, {{ firstName() }}!</h1>
          <p class="text-slate-500 text-xs">Pasajero activo</p>
        </div>
        <div class="flex items-center gap-2">
          <span class="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-bold">
            <span class="material-symbols-outlined" style="font-size:13px">check_circle</span> Activo
          </span>
          <!-- Botón hamburguesa -->
          <button (click)="agMenuOpen.set(true)"
            class="flex flex-col items-center justify-center gap-1 transition-all active:scale-90 px-2 py-1.5 rounded-xl"
            style="background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.12)">
            <div class="flex flex-col items-center gap-1">
              <span class="block rounded-full bg-white" style="width:18px;height:2px"></span>
              <span class="block rounded-full bg-white" style="width:18px;height:2px"></span>
              <span class="block rounded-full bg-white" style="width:14px;height:2px"></span>
            </div>
            <span class="text-white font-bold" style="font-size:9px;letter-spacing:0.08em">MENÚ</span>
          </button>
        </div>
      </div>

      <!-- ══ Drawer menú Anda y Gana ══ -->
      @if (agMenuOpen()) {
        <!-- Overlay oscuro -->
        <div (click)="agMenuOpen.set(false)"
          class="fixed inset-0 z-50 transition-opacity"
          style="background:rgba(0,0,0,0.55);backdrop-filter:blur(2px)"></div>

        <!-- Panel lateral derecho -->
        <div class="fixed top-0 right-0 bottom-0 z-50 flex flex-col"
          style="width:280px;background:#0f1421;border-left:1px solid rgba(255,255,255,0.08);box-shadow:-8px 0 32px rgba(0,0,0,0.6)">

          <!-- Cabecera del menú -->
          <div class="flex items-center justify-between px-5 pt-10 pb-5"
            style="border-bottom:1px solid rgba(255,255,255,0.07)">
            <div class="flex items-center gap-2.5">
              <img src="movi-logo.svg" alt="Movi" class="w-8 h-8 rounded-xl" />
              <div>
                <p class="text-white font-black text-sm">Movi</p>
                <p class="text-slate-400 text-xs font-medium">{{ agProfile()?.full_name }}</p>
              </div>
            </div>
            <button (click)="agMenuOpen.set(false)"
              class="w-8 h-8 rounded-lg flex items-center justify-center transition-colors active:scale-90"
              style="background:rgba(255,255,255,0.06)">
              <span class="material-symbols-outlined text-slate-400" style="font-size:20px">close</span>
            </button>
          </div>

          <!-- Opciones -->
          <nav class="flex-1 overflow-y-auto py-3 px-3">

            <p class="text-slate-600 text-xs font-bold uppercase tracking-widest px-3 pb-2 pt-1">Principal</p>

            @for (item of agMenuItems; track item.label) {
              @if (item.divider) {
                <div class="my-2" style="border-top:1px solid rgba(255,255,255,0.06)"></div>
                @if (item.section) {
                  <p class="text-slate-600 text-xs font-bold uppercase tracking-widest px-3 pb-2 pt-1">{{ item.section }}</p>
                }
              } @else {
                <button (click)="openPassengerSection(item.action)"
                  class="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-left transition-all active:scale-[0.98] mb-0.5"
                  style="color:#cbd5e1"
                  onmouseover="this.style.background='rgba(249,115,22,0.08)'"
                  onmouseout="this.style.background='transparent'">
                  <span class="material-symbols-outlined flex-shrink-0"
                    style="font-size:20px;color:#f97316">{{ item.icon }}</span>
                  <span class="text-sm font-medium">{{ item.label }}</span>
                </button>
              }
            }
          </nav>

          <!-- Footer del menú -->
          <div class="px-5 py-5" style="border-top:1px solid rgba(255,255,255,0.07)">
            <p class="text-slate-600 text-xs text-center">Movi · v1.0</p>
          </div>
        </div>
      }

      <!-- ══ Billetera de retiro (siempre visible) ══ -->
      <button (click)="openPassengerSection('referrals')"
        class="w-full rounded-2xl p-3 flex items-center gap-3 active:scale-[0.98] transition-transform"
        style="background:linear-gradient(135deg,#6C3AED,#2563EB);border:1px solid rgba(255,255,255,0.15)">
        <div class="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
          style="background:rgba(255,255,255,0.15)">
          <span class="material-symbols-outlined text-white" style="font-size:22px">account_balance_wallet</span>
        </div>
        <div class="flex-1 min-w-0 text-left">
          <p class="text-white/60 text-[10px] font-bold uppercase tracking-widest">Billetera de retiro</p>
          <p class="text-white font-black text-lg leading-tight">{{ '$' + referralBalance().toLocaleString() }}</p>
        </div>
        <div class="flex flex-col items-end gap-0.5 flex-shrink-0">
          <span class="text-emerald-300 text-[10px] font-bold">{{ referralCount() }} invitados</span>
          <span class="material-symbols-outlined text-white/40" style="font-size:18px">chevron_right</span>
        </div>
      </button>

      @if (passengerSection() === null) {
      <!-- Mapa con overlays flotantes -->
      <div class="relative rounded-2xl overflow-hidden" style="height:520px;border:1px solid rgba(255,255,255,0.08)">

        <!-- GPS loading state -->
        @if (gpsStatus() === 'requesting') {
          <div class="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3" style="background:#0d111a">
            <span class="material-symbols-outlined text-orange-400 animate-pulse" style="font-size:38px">my_location</span>
            <p class="text-slate-400 text-sm font-bold">Obteniendo tu ubicación...</p>
            <p class="text-slate-600 text-xs">Acepta el permiso en tu dispositivo</p>
          </div>
        }

        <!-- Mapa -->
        <div id="ag-map-user" style="position:absolute;top:0;left:0;width:100%;height:100%"></div>

        <!-- Barra de dirección (flotante arriba) -->
        @if (gpsStatus() !== 'requesting') {
          <div class="absolute top-3 left-3 right-3 z-20">
            @if (!addressEditMode()) {
              <button (click)="openAddressEdit()"
                class="w-full flex items-center gap-3 bg-white rounded-2xl px-4 py-2.5 shadow-xl shadow-black/40 text-left transition-all active:scale-[0.98]">
                <span class="material-symbols-outlined text-orange-500 flex-shrink-0" style="font-size:20px">location_on</span>
                <div class="flex-1 min-w-0">
                  @if (addressLoading()) {
                    <p class="text-slate-400 text-sm animate-pulse">Obteniendo dirección...</p>
                  } @else if (currentAddress()) {
                    <p class="text-slate-800 text-sm font-semibold truncate">{{ currentAddress() }}</p>
                  } @else {
                    <p class="text-slate-500 text-sm">Dirección no disponible</p>
                  }
                </div>
                <span class="material-symbols-outlined text-slate-400 flex-shrink-0" style="font-size:16px">edit</span>
              </button>
            } @else {
              <div class="flex flex-col bg-white rounded-2xl shadow-2xl shadow-black/50 overflow-hidden">
                <div class="flex items-center gap-3 px-4 py-3 border-b border-slate-200">
                  <span class="material-symbols-outlined text-orange-500" style="font-size:20px">search</span>
                  <input #addressInput
                    [value]="addressQuery()"
                    (input)="onAddressInput($any($event.target).value)"
                    (keydown.escape)="closeAddressEdit()"
                    (keydown.enter)="confirmTypedAddress()"
                    placeholder="Busca tu dirección o lugar..."
                    class="flex-1 text-slate-800 text-sm outline-none placeholder-slate-400 bg-transparent"/>
                  <button (mousedown)="$event.preventDefault(); confirmTypedAddress()" class="flex-shrink-0 w-8 h-8 rounded-lg bg-orange-500 flex items-center justify-center">
                    <span class="material-symbols-outlined text-white" style="font-size:16px">arrow_forward</span>
                  </button>
                  <button (click)="closeAddressEdit()" class="flex-shrink-0">
                    <span class="material-symbols-outlined text-slate-400" style="font-size:20px">close</span>
                  </button>
                </div>
                @if (addressSuggestions().length > 0) {
                  <div class="flex flex-col max-h-56 overflow-y-auto">
                    @for (s of addressSuggestions(); track s.id) {
                      <button (mousedown)="$event.preventDefault(); selectAddress(s)"
                        class="flex items-start gap-3 px-4 py-3 hover:bg-orange-50 active:bg-orange-100 transition-colors text-left border-b border-slate-50 last:border-0">
                        <span class="material-symbols-outlined text-orange-400 mt-0.5 flex-shrink-0" style="font-size:16px">location_on</span>
                        <div class="min-w-0">
                          <p class="text-slate-800 text-sm font-semibold truncate">{{ s.text }}</p>
                          <p class="text-slate-400 text-xs truncate">{{ s.place_name }}</p>
                        </div>
                      </button>
                    }
                  </div>
                } @else if (addressQuery().length > 1) {
                  @if (addressNoResults()) {
                    <div class="px-4 py-4 text-center">
                      <p class="text-slate-500 text-sm mb-2">No encontramos ese lugar</p>
                      <button (mousedown)="$event.preventDefault(); useMapPin()"
                        class="inline-flex items-center gap-1.5 px-4 py-2 bg-orange-50 text-orange-600 rounded-lg text-xs font-bold hover:bg-orange-100 transition-colors">
                        <span class="material-symbols-outlined" style="font-size:14px">pin_drop</span>
                        Ubicar moviendo el pin en el mapa
                      </button>
                    </div>
                  } @else {
                    <div class="px-4 py-4 text-slate-400 text-sm text-center flex items-center justify-center gap-1.5">
                      <span class="material-symbols-outlined animate-spin" style="font-size:14px">autorenew</span> Buscando...
                    </div>
                  }
                }
              </div>
            }

            <!-- GPS denied badge -->
            @if (gpsStatus() === 'denied') {
              <div class="mt-2 flex justify-end">
                <button (click)="retryGps('ag-map-user')"
                  class="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-black/60 backdrop-blur text-orange-400 text-xs font-bold border border-orange-500/20">
                  <span class="material-symbols-outlined" style="font-size:13px">my_location</span> Reintentar GPS
                </button>
              </div>
            }
          </div>
        }

        <!-- Panel de viaje (flotante abajo) -->
        @if (gpsStatus() !== 'requesting') {
          <div class="absolute bottom-0 left-0 right-0 z-20 rounded-t-3xl"
            [style.maxHeight]="(tripSent() || tripAccepted()) ? '58%' : ''"
            [style.overflowY]="(tripSent() || tripAccepted()) ? 'auto' : 'hidden'"
            style="background:#f1f5f9;border-top:1px solid #cbd5e1;overflow-x:hidden">

            <!-- Fila de servicios -->
            <div class="flex items-center gap-1 pt-3 pb-1">
              <button (click)="scrollIcons(-120)"
                class="flex-shrink-0 w-7 h-7 rounded-full bg-slate-200 flex items-center justify-center ml-2 active:scale-90 transition-all">
                <span class="material-symbols-outlined text-slate-500" style="font-size:16px">chevron_left</span>
              </button>
            <div id="ag-icons-scroll" class="flex gap-1 flex-1 overflow-x-auto" style="scrollbar-width:none">
              <button (click)="tripService.set('viaje')"
                class="flex flex-col items-center gap-1 px-3 py-2 rounded-2xl flex-shrink-0 transition-all"
                [class]="tripService()==='viaje' ? 'bg-orange-50 border border-orange-200' : 'hover:bg-slate-200'">
                <span class="material-symbols-outlined" style="font-size:26px"
                  [style.color]="tripService()==='viaje' ? '#f97316' : '#94a3b8'">directions_car</span>
                <span class="text-[10px] font-bold" [style.color]="tripService()==='viaje' ? '#f97316' : '#94a3b8'">Viaje</span>
              </button>
              <button (click)="tripService.set('moto')"
                class="flex flex-col items-center gap-1 px-3 py-2 rounded-2xl flex-shrink-0 transition-all"
                [class]="tripService()==='moto' ? 'bg-cyan-50 border border-cyan-200' : 'hover:bg-slate-200'">
                <span class="material-symbols-outlined" style="font-size:26px"
                  [style.color]="tripService()==='moto' ? '#06b6d4' : '#94a3b8'">two_wheeler</span>
                <span class="text-[10px] font-bold" [style.color]="tripService()==='moto' ? '#06b6d4' : '#94a3b8'">Moto</span>
              </button>
              <button (click)="tripService.set('ciudad')"
                class="flex flex-col items-center gap-1 px-3 py-2 rounded-2xl flex-shrink-0 transition-all"
                [class]="tripService()==='ciudad' ? 'bg-purple-50 border border-purple-200' : 'hover:bg-slate-200'">
                <span class="material-symbols-outlined" style="font-size:26px"
                  [style.color]="tripService()==='ciudad' ? '#a855f7' : '#94a3b8'">commute</span>
                <span class="text-[10px] font-bold" [style.color]="tripService()==='ciudad' ? '#a855f7' : '#94a3b8'">Ciudad a ciudad</span>
              </button>
              <button (click)="tripService.set('domicilio')"
                class="flex flex-col items-center gap-1 px-3 py-2 rounded-2xl flex-shrink-0 transition-all"
                [class]="tripService()==='domicilio' ? 'bg-emerald-50 border border-emerald-200' : 'hover:bg-slate-200'">
                <span class="material-symbols-outlined" style="font-size:26px"
                  [style.color]="tripService()==='domicilio' ? '#10b981' : '#94a3b8'">delivery_dining</span>
                <span class="text-[10px] font-bold" [style.color]="tripService()==='domicilio' ? '#10b981' : '#94a3b8'">Domicilio</span>
              </button>
              <button (click)="tripService.set('fletes')"
                class="flex flex-col items-center gap-1 px-3 py-2 rounded-2xl flex-shrink-0 transition-all"
                [class]="tripService()==='fletes' ? 'bg-amber-50 border border-amber-200' : 'hover:bg-slate-200'">
                <span class="material-symbols-outlined" style="font-size:26px"
                  [style.color]="tripService()==='fletes' ? '#f59e0b' : '#94a3b8'">local_shipping</span>
                <span class="text-[10px] font-bold" [style.color]="tripService()==='fletes' ? '#f59e0b' : '#94a3b8'">Fletes</span>
              </button>
            </div>
              <button (click)="scrollIcons(120)"
                class="flex-shrink-0 w-7 h-7 rounded-full bg-slate-200 flex items-center justify-center mr-2 active:scale-90 transition-all">
                <span class="material-symbols-outlined text-slate-500" style="font-size:16px">chevron_right</span>
              </button>
            </div>

            <!-- Divider -->
            <div class="mx-4 h-px bg-slate-300 my-1"></div>

            <!-- Contenido del panel según estado -->
            @if (!tripDest()) {
              @if (!tripOpen()) {
                <!-- Punto de origen — clicable para modificar -->
                @if (currentAddress()) {
                  @if (!originEditOpen()) {
                    <button (click)="openOriginEdit()"
                      class="mx-4 mt-2 mb-1 w-[calc(100%-2rem)] flex items-center gap-2.5 px-3 py-2 rounded-xl text-left active:scale-[0.98] transition-all"
                      style="background:#fff7ed;border:1px solid #fed7aa">
                      <div class="w-2.5 h-2.5 rounded-full bg-orange-500 flex-shrink-0"></div>
                      <div class="flex-1 min-w-0">
                        <p class="text-orange-400 font-bold uppercase tracking-wider" style="font-size:9px">Saldrás desde aquí · Toca para cambiar</p>
                        <p class="text-slate-700 text-xs font-semibold truncate">{{ currentAddress() }}</p>
                      </div>
                      <span class="material-symbols-outlined text-orange-300 flex-shrink-0" style="font-size:16px">edit</span>
                    </button>
                  } @else {
                    <!-- Búsqueda inline de origen -->
                    <div class="mx-4 mt-2 mb-1 rounded-xl overflow-hidden"
                      style="background:#fff;border:1.5px solid #fb923c;box-shadow:0 4px 16px rgba(249,115,22,0.15)">
                      <div class="flex items-center gap-2.5 px-3 py-2.5" style="border-bottom:1px solid #f1f5f9">
                        <div class="w-2.5 h-2.5 rounded-full bg-orange-500 flex-shrink-0"></div>
                        <input id="origin-edit-input"
                          [value]="addressQuery()"
                          (input)="onAddressInput($any($event.target).value)"
                          (keydown.escape)="originEditOpen.set(false)"
                          (keydown.enter)="confirmTypedAddress()"
                          placeholder="Escribe tu punto de salida..."
                          class="flex-1 text-slate-800 text-sm outline-none placeholder-slate-400 bg-transparent"/>
                        <button (click)="originEditOpen.set(false)" class="flex-shrink-0">
                          <span class="material-symbols-outlined text-slate-400" style="font-size:20px">close</span>
                        </button>
                      </div>
                      @if (addressSuggestions().length > 0) {
                        <div class="flex flex-col max-h-44 overflow-y-auto">
                          @for (s of addressSuggestions(); track s.id) {
                            <button (mousedown)="$event.preventDefault(); selectAddress(s)"
                              class="flex items-center gap-2.5 px-3 py-2.5 border-b border-slate-50 last:border-0 hover:bg-orange-50 active:bg-orange-100 text-left transition-colors">
                              <span class="material-symbols-outlined text-orange-400 flex-shrink-0" style="font-size:16px">location_on</span>
                              <div class="flex-1 min-w-0">
                                <p class="text-slate-800 text-xs font-semibold truncate">{{ s.text }}</p>
                                <p class="text-slate-400 text-[10px] truncate">{{ s.place_name }}</p>
                              </div>
                            </button>
                          }
                        </div>
                      } @else if (addressQuery().length > 1) {
                        @if (addressNoResults()) {
                          <div class="px-3 py-3 text-center">
                            <p class="text-slate-500 text-xs mb-1.5">No encontramos ese lugar</p>
                            <button (mousedown)="$event.preventDefault(); useMapPin()"
                              class="inline-flex items-center gap-1 px-3 py-1.5 bg-orange-50 text-orange-600 rounded-lg text-[10px] font-bold hover:bg-orange-100 transition-colors">
                              <span class="material-symbols-outlined" style="font-size:12px">pin_drop</span>
                              Mover pin en el mapa
                            </button>
                          </div>
                        } @else {
                          <div class="px-3 py-3 text-slate-400 text-xs flex items-center justify-center gap-1.5">
                            <span class="material-symbols-outlined animate-spin" style="font-size:14px">autorenew</span> Buscando...
                          </div>
                        }
                      }
                    </div>
                  }
                }
                <button (click)="openTripSearch()"
                  class="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-200 transition-colors text-left">
                  <div class="w-10 h-10 rounded-xl bg-orange-50 border border-orange-200 flex items-center justify-center flex-shrink-0">
                    <span class="material-symbols-outlined text-orange-500" style="font-size:22px">search</span>
                  </div>
                  <div class="flex-1">
                    <p class="text-slate-800 font-black text-sm">¿A dónde vas y por cuánto?</p>
                    <p class="text-slate-400 text-xs mt-0.5">Toca para buscar tu destino</p>
                  </div>
                  <span class="material-symbols-outlined text-slate-300" style="font-size:20px">chevron_right</span>
                </button>
              } @else {
                <div class="flex flex-col">
                  <div class="flex items-center gap-3 px-4 py-3 border-b border-slate-200">
                    <span class="material-symbols-outlined text-orange-500 flex-shrink-0" style="font-size:20px">search</span>
                    <input #tripInput
                      [value]="tripQuery()"
                      (input)="onTripQueryInput($any($event.target).value)"
                      (keydown.escape)="closeTripSearch()"
                      placeholder="Busca tu destino..."
                      class="flex-1 bg-transparent text-slate-800 text-sm outline-none placeholder-slate-400"/>
                    <button (click)="closeTripSearch()">
                      <span class="material-symbols-outlined text-slate-400" style="font-size:20px">close</span>
                    </button>
                  </div>
                  @if (tripSuggestions().length > 0) {
                    <div class="flex flex-col max-h-48 overflow-y-auto">
                      @for (s of tripSuggestions(); track s.id) {
                        <button (mousedown)="$event.preventDefault(); selectTripDest(s)"
                          class="flex items-center gap-3 px-4 py-3 border-b border-slate-50 last:border-0 hover:bg-orange-50 active:bg-orange-100 text-left transition-colors">
                          <span class="material-symbols-outlined text-orange-400 flex-shrink-0" style="font-size:18px">place</span>
                          <div class="flex-1 min-w-0">
                            <p class="text-slate-800 text-sm font-semibold truncate">{{ s.text }}</p>
                            <p class="text-slate-400 text-xs truncate">{{ s.place_name }}</p>
                          </div>
                          <span class="text-orange-500 text-xs font-black flex-shrink-0">{{ s.distKm }} km</span>
                        </button>
                      }
                    </div>
                  } @else if (tripQuery().length > 1) {
                    @if (tripNoResults()) {
                      <div class="px-4 py-4 text-center">
                        <p class="text-slate-500 text-sm mb-2">No encontramos ese destino</p>
                        <p class="text-slate-400 text-xs">Intenta con el nombre del barrio o una dirección cercana</p>
                      </div>
                    } @else {
                      <div class="px-4 py-4 text-slate-400 text-sm text-center flex items-center justify-center gap-2">
                        <span class="material-symbols-outlined animate-spin" style="font-size:16px">autorenew</span>
                        Buscando lugares...
                      </div>
                    }
                  }
                </div>
              }

            } @else if (tripAccepted()) {
              <!-- ══ Viaje Aceptado ══ -->
              <div class="px-4 pt-4 pb-3 flex flex-col gap-3">
                <!-- Header éxito -->
                <div class="rounded-2xl flex flex-col items-center gap-2 py-4"
                  style="background:linear-gradient(135deg,#dcfce7,#bbf7d0);border:1px solid #86efac">
                  <div class="w-12 h-12 rounded-2xl bg-emerald-500 flex items-center justify-center">
                    <span class="material-symbols-outlined text-white" style="font-size:24px">check_circle</span>
                  </div>
                  <p class="text-emerald-800 font-black text-base">¡Conductor en camino!</p>
                  <p class="text-emerald-700 text-xs">Tu viaje ha sido confirmado</p>
                </div>
                <!-- Datos del conductor -->
                <div class="rounded-2xl flex items-center gap-3 px-4 py-3"
                  style="background:#fff;border:1px solid #e2e8f0">
                  <div class="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0"
                    style="background:linear-gradient(135deg,#f97316,#fb923c)">
                    <span class="material-symbols-outlined text-white" style="font-size:24px">person</span>
                  </div>
                  <div class="flex-1 min-w-0">
                    <p class="text-slate-800 font-black text-sm truncate">
                      {{ tripAccepted()!.ag_drivers?.ag_users?.full_name ?? 'Tu conductor' }}
                    </p>
                    <p class="text-slate-500 text-xs truncate">
                      {{ tripAccepted()!.ag_drivers?.vehicle_brand }} {{ tripAccepted()!.ag_drivers?.vehicle_model }}
                      · {{ tripAccepted()!.ag_drivers?.plate }}
                      · {{ tripAccepted()!.ag_drivers?.vehicle_color }}
                    </p>
                  </div>
                  <p class="font-black text-lg text-emerald-600 flex-shrink-0">{{ formatCOP(tripAccepted()!.offered_price) }}</p>
                </div>
                <!-- Destino + pago -->
                <div class="flex gap-2">
                  <div class="flex-1 flex items-center gap-3 rounded-xl px-3 py-2.5"
                    style="background:#f8fafc;border:1px solid #e2e8f0">
                    <span class="material-symbols-outlined text-slate-700 flex-shrink-0" style="font-size:18px">place</span>
                    <div class="flex-1 min-w-0">
                      <p class="text-slate-500 text-[10px] uppercase font-bold">Destino</p>
                      <p class="text-slate-800 text-sm font-semibold truncate">{{ tripDest()?.name }}</p>
                    </div>
                  </div>
                  <div class="flex flex-col items-center justify-center gap-0.5 rounded-xl px-3 py-2.5"
                    [style.background]="paymentMethodMap[tripPayment()].bgSel"
                    [style.border]="'1px solid ' + paymentMethodMap[tripPayment()].color">
                    <span class="material-symbols-outlined" style="font-size:20px"
                      [style.color]="paymentMethodMap[tripPayment()].color">{{ paymentMethodMap[tripPayment()].icon }}</span>
                    <p class="text-[10px] font-black whitespace-nowrap"
                      [style.color]="paymentMethodMap[tripPayment()].color">{{ paymentMethodMap[tripPayment()].label }}</p>
                  </div>
                </div>
                <!-- Aviso de pago digital -->
                @if (tripPayment() !== 'efectivo') {
                  <div class="rounded-xl px-3 py-2.5 flex items-start gap-2"
                    style="background:#fefce8;border:1px solid #fde68a">
                    <span class="material-symbols-outlined text-amber-600 flex-shrink-0 mt-0.5" style="font-size:16px">info</span>
                    <div>
                      <p class="text-amber-800 text-xs font-bold">Paga por {{ paymentMethodMap[tripPayment()].label }}</p>
                      <p class="text-amber-700 text-[10px]">Transfiere {{ formatCOP(tripAccepted()!.offered_price) }} al conductor. Usa el chat para coordinar los datos de pago.</p>
                    </div>
                  </div>
                }

                <!-- Chat + Llamar + Finalizar / Cancelar -->
                <div class="flex gap-2">
                  <button (click)="openTripChat()"
                    class="px-4 py-2.5 rounded-xl text-white text-xs font-black flex items-center justify-center gap-1 active:scale-[0.98] transition-all"
                    style="background:linear-gradient(135deg,#2563eb,#3b82f6)">
                    <span class="material-symbols-outlined" style="font-size:15px">chat</span>
                    Chat
                    @if (chatUnread() > 0) {
                      <span class="min-w-[16px] h-4 px-1 bg-red-500 text-[10px] font-bold text-white rounded-full flex items-center justify-center">{{ chatUnread() }}</span>
                    }
                  </button>
                  <button (click)="callDriver()" [disabled]="callingDriver()"
                    class="px-4 py-2.5 rounded-xl text-white text-xs font-black flex items-center justify-center gap-1 active:scale-[0.98] transition-all disabled:opacity-50"
                    style="background:linear-gradient(135deg,#16a34a,#22c55e)">
                    <span class="material-symbols-outlined" style="font-size:15px">{{ callingDriver() ? 'hourglass_empty' : 'call' }}</span>
                    {{ callingDriver() ? '...' : 'Llamar' }}
                  </button>
                  <button (click)="finishTrip()"
                    class="flex-1 py-2.5 rounded-xl text-white text-xs font-black flex items-center justify-center gap-1 active:scale-[0.98] transition-all"
                    style="background:linear-gradient(135deg,#16a34a,#15803d)">
                    <span class="material-symbols-outlined" style="font-size:15px">check_circle</span>
                    Finalizar viaje
                  </button>
                  <button (click)="cancelTrip()"
                    class="px-4 py-2.5 rounded-xl text-slate-500 text-xs font-bold active:scale-[0.98] transition-all"
                    style="background:#f1f5f9;border:1px solid #e2e8f0">
                    Cancelar
                  </button>
                </div>
              </div>

            } @else if (!tripSent()) {
              <!-- ── Tarjeta de ruta: origen → destino ── -->
              <div class="mx-4 mt-3 mb-1 rounded-2xl overflow-hidden"
                style="background:#fff;border:1px solid #e2e8f0;box-shadow:0 2px 8px rgba(0,0,0,0.06)">

                <!-- Fila origen — clicable para cambiar -->
                @if (!originEditOpen()) {
                  <button (click)="openOriginEdit()"
                    class="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-orange-50 active:bg-orange-50 transition-colors"
                    style="border-bottom:1px solid #f1f5f9">
                    <div class="flex flex-col items-center gap-0 flex-shrink-0" style="width:20px">
                      <div class="w-3 h-3 rounded-full border-2 border-orange-400 bg-orange-100"></div>
                      <div class="w-px bg-slate-200" style="height:14px;margin:1px 0"></div>
                    </div>
                    <div class="flex-1 min-w-0">
                      <p class="font-bold uppercase tracking-wider text-orange-400" style="font-size:9px">Saldrás desde aquí · Toca para cambiar</p>
                      <p class="text-slate-700 text-xs font-semibold truncate">{{ currentAddress() || 'Tu ubicación actual' }}</p>
                    </div>
                    <span class="material-symbols-outlined text-orange-300 flex-shrink-0" style="font-size:15px">edit</span>
                  </button>
                } @else {
                  <!-- Búsqueda inline dentro de la tarjeta -->
                  <div style="border-bottom:1px solid #fed7aa;background:#fff7ed">
                    <div class="flex items-center gap-2.5 px-3 py-2.5">
                      <div class="w-3 h-3 rounded-full border-2 border-orange-500 bg-orange-100 flex-shrink-0"></div>
                      <input id="origin-edit-input"
                        [value]="addressQuery()"
                        (input)="onAddressInput($any($event.target).value)"
                        (keydown.escape)="originEditOpen.set(false)"
                        (keydown.enter)="confirmTypedAddress()"
                        placeholder="Escribe tu punto de salida..."
                        class="flex-1 text-slate-800 text-xs outline-none placeholder-slate-500 bg-transparent"/>
                      <button (click)="originEditOpen.set(false)" class="flex-shrink-0">
                        <span class="material-symbols-outlined text-slate-400" style="font-size:17px">close</span>
                      </button>
                    </div>
                    @if (addressSuggestions().length > 0) {
                      <div class="flex flex-col max-h-40 overflow-y-auto" style="background:#fff">
                        @for (s of addressSuggestions(); track s.id) {
                          <button (mousedown)="$event.preventDefault(); selectAddress(s)"
                            class="flex items-center gap-2.5 px-3 py-2.5 border-b border-slate-50 last:border-0 hover:bg-orange-50 active:bg-orange-100 text-left transition-colors">
                            <span class="material-symbols-outlined text-orange-400 flex-shrink-0" style="font-size:15px">location_on</span>
                            <div class="flex-1 min-w-0">
                              <p class="text-slate-800 text-xs font-semibold truncate">{{ s.text }}</p>
                              <p class="text-slate-400 text-[10px] truncate">{{ s.place_name }}</p>
                            </div>
                          </button>
                        }
                      </div>
                    } @else if (addressQuery().length > 1) {
                      @if (addressNoResults()) {
                        <div class="px-3 py-2.5 text-center" style="background:#fff">
                          <p class="text-slate-500 text-xs mb-1.5">No encontramos ese lugar</p>
                          <button (mousedown)="$event.preventDefault(); useMapPin()"
                            class="inline-flex items-center gap-1 px-3 py-1.5 bg-orange-50 text-orange-600 rounded-lg text-[10px] font-bold hover:bg-orange-100 transition-colors">
                            <span class="material-symbols-outlined" style="font-size:12px">pin_drop</span>
                            Mover pin en el mapa
                          </button>
                        </div>
                      } @else {
                        <div class="px-3 py-2.5 text-slate-400 text-xs flex items-center justify-center gap-1.5" style="background:#fff">
                          <span class="material-symbols-outlined animate-spin" style="font-size:13px">autorenew</span> Buscando...
                        </div>
                      }
                    }
                  </div>
                }

                <!-- Fila destino -->
                <div class="flex items-center gap-3 px-3 py-2.5">
                  <div class="flex flex-col items-center flex-shrink-0" style="width:20px">
                    <div class="w-3 h-3 rounded-full border-2 border-slate-700 bg-slate-800"></div>
                  </div>
                  <div class="flex-1 min-w-0">
                    <p class="font-bold uppercase tracking-wider text-slate-400" style="font-size:9px">Tu destino · {{ tripDistKm() }} km</p>
                    <p class="text-slate-800 text-sm font-black truncate">{{ tripDest()!.name }}</p>
                  </div>
                  <button (click)="cancelTrip()"
                    class="flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center active:scale-90 transition-all"
                    style="background:#f1f5f9;border:1px solid #e2e8f0">
                    <span class="material-symbols-outlined text-slate-400" style="font-size:16px">close</span>
                  </button>
                </div>
              </div>

              <div class="flex items-center justify-between px-4 py-2 border-b border-slate-200">
                <button (click)="adjustTripPrice(-500)"
                  class="w-11 h-11 rounded-xl bg-slate-200 border border-slate-300 text-slate-700 font-black text-2xl flex items-center justify-center active:scale-95 transition-all flex-shrink-0">−</button>
                <div class="text-center">
                  <p class="text-slate-400 text-[10px] uppercase tracking-wider">Valor sugerido</p>
                  <p class="text-slate-800 font-black text-2xl">{{ formatCOP(tripPrice()) }}</p>
                  @if (surgeMultiplier() > 1) {
                    <p class="text-orange-600 text-[10px] font-black mt-0.5">⚡ Alta demanda ×{{ surgeMultiplier() }}</p>
                  }
                </div>
                <button (click)="adjustTripPrice(500)"
                  class="w-11 h-11 rounded-xl bg-slate-200 border border-slate-300 text-slate-700 font-black text-2xl flex items-center justify-center active:scale-95 transition-all flex-shrink-0">+</button>
              </div>

              <!-- Cupón -->
              <div class="px-4 pt-2 pb-1 border-b border-slate-200">
                <p class="text-slate-500 text-[10px] uppercase font-bold tracking-wider mb-2">Cupón (opcional)</p>
                @if (appliedCoupon(); as ac) {
                  <div class="flex items-center gap-2 p-2 bg-green-50 border border-green-200 rounded-lg">
                    <span class="material-symbols-outlined text-green-600" style="font-size:16px">local_activity</span>
                    <div class="flex-1 min-w-0">
                      <p class="text-xs font-black text-green-800 truncate">{{ ac.title }}</p>
                      <p class="text-[10px] text-green-600">−{{ formatCOP(ac.discount) }}</p>
                    </div>
                    <button (click)="removeCoupon()" class="w-6 h-6 rounded-md bg-red-100 flex items-center justify-center">
                      <span class="material-symbols-outlined text-red-600" style="font-size:14px">close</span>
                    </button>
                  </div>
                } @else {
                  <div class="flex gap-2">
                    <input [(ngModel)]="couponInput" placeholder="Código"
                      class="flex-1 px-3 py-2 rounded-lg text-sm text-slate-800 outline-none uppercase"
                      style="background:#f8fafc;border:1px solid #e2e8f0" />
                    <button (click)="applyCouponCode()" [disabled]="validatingCoupon()"
                      class="px-3 py-2 rounded-lg text-xs font-black uppercase disabled:opacity-50"
                      style="background:#ec4899;color:#fff">
                      {{ validatingCoupon() ? '...' : 'Aplicar' }}
                    </button>
                  </div>
                  @if (couponError()) { <p class="text-[10px] text-red-500 mt-1">{{ couponError() }}</p> }
                }
              </div>

              <!-- Método de pago -->
              <div class="px-4 pt-2 pb-1">
                <p class="text-slate-500 text-[10px] uppercase font-bold tracking-wider mb-2">Método de pago</p>
                <div class="grid grid-cols-3 gap-1.5">
                  @for (pm of paymentMethods; track pm.value) {
                    <button (click)="tripPayment.set(pm.value)"
                      class="flex flex-col items-center gap-1 py-2 rounded-xl border transition-all active:scale-95"
                      [style.background]="tripPayment() === pm.value ? pm.bgSel : '#f8fafc'"
                      [style.borderColor]="tripPayment() === pm.value ? pm.color : '#e2e8f0'">
                      <span class="material-symbols-outlined" style="font-size:18px"
                        [style.color]="tripPayment() === pm.value ? pm.color : '#94a3b8'">{{ pm.icon }}</span>
                      <span class="text-[10px] font-bold leading-tight text-center"
                        [style.color]="tripPayment() === pm.value ? pm.color : '#94a3b8'">{{ pm.label }}</span>
                    </button>
                  }
                </div>
              </div>

              <div class="px-4 py-3">
                <button (click)="findOffers()" [disabled]="tripSending()"
                  class="w-full py-3.5 rounded-xl font-black text-sm uppercase tracking-wider flex items-center justify-center gap-2 transition-all disabled:opacity-60 active:scale-[0.98] bg-orange-500 text-white">
                  @if (tripSending()) {
                    <span class="material-symbols-outlined animate-spin" style="font-size:18px">autorenew</span> Buscando...
                  } @else {
                    <span class="material-symbols-outlined" style="font-size:18px">local_taxi</span> Encontrar ofertas
                  }
                </button>
              </div>

            } @else {
              <!-- ══ Pantalla de espera estilo inDrive ══ -->

              <!-- Fila: conductores viendo + avatares -->
              <div class="flex items-center justify-between px-4 pt-3 pb-2.5" style="border-bottom:1px solid #e2e8f0">
                <p class="text-slate-800 text-sm font-semibold flex-1 leading-snug">
                  @if (receivedOffers().length > 0) {
                    <span class="text-emerald-600 font-black">{{ receivedOffers().length }}</span>
                    {{ receivedOffers().length === 1 ? ' oferta recibida' : ' ofertas recibidas' }}
                  } @else if (waitingDriverCount() === 0) {
                    Buscando conductores disponibles...
                  } @else {
                    <span class="text-orange-500 font-black">{{ waitingDriverCount() }}</span>
                    {{ waitingDriverCount() === 1 ? ' conductor está viendo' : ' conductores están viendo' }} tu solicitud
                  }
                </p>
                <div class="flex items-center flex-shrink-0 ml-2">
                  @for (color of waitingDriverColors(); track $index) {
                    <div class="w-8 h-8 rounded-full border-2 border-white flex items-center justify-center flex-shrink-0"
                      [style.background]="color" style="margin-left:-10px">
                      <span class="material-symbols-outlined text-white" style="font-size:15px">person</span>
                    </div>
                  }
                </div>
              </div>

              <!-- ══ Tarjetas de ofertas reales ══ -->
              @if (receivedOffers().length > 0) {
                <div class="flex flex-col gap-2 px-4 pt-2 pb-1">
                  @for (offer of receivedOffers(); track offer.id) {
                    <div class="rounded-2xl overflow-hidden"
                      style="background:#fff;border:1.5px solid #e2e8f0;box-shadow:0 2px 8px rgba(0,0,0,0.06)">
                      <div class="flex items-center gap-3 px-3 py-3">
                        <!-- Avatar conductor -->
                        <div class="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                          style="background:linear-gradient(135deg,#f97316,#fb923c)">
                          <span class="material-symbols-outlined text-white" style="font-size:20px">person</span>
                        </div>
                        <!-- Datos -->
                        <div class="flex-1 min-w-0">
                          <p class="text-slate-800 text-sm font-black truncate">
                            {{ offer.ag_drivers?.ag_users?.full_name ?? 'Conductor' }}
                          </p>
                          <p class="text-slate-500 text-xs truncate">
                            {{ offer.ag_drivers?.vehicle_brand }} {{ offer.ag_drivers?.vehicle_model }}
                            · {{ offer.ag_drivers?.plate }}
                          </p>
                        </div>
                        <!-- Precio ofrecido -->
                        <div class="text-right flex-shrink-0">
                          <p class="font-black text-lg leading-tight"
                            [style.color]="offer.offered_price <= tripPrice() ? '#16a34a' : '#dc2626'">
                            {{ formatCOP(offer.offered_price) }}
                          </p>
                          @if (offer.offered_price < tripPrice()) {
                            <p class="text-emerald-600 text-[10px] font-bold">Más barato</p>
                          } @else if (offer.offered_price > tripPrice()) {
                            <p class="text-rose-500 text-[10px] font-bold">Más caro</p>
                          } @else {
                            <p class="text-slate-400 text-[10px]">Igual al tuyo</p>
                          }
                        </div>
                      </div>
                      <!-- Botones -->
                      <div class="flex border-t border-slate-100">
                        <button (click)="rejectOfferCard(offer)"
                          class="flex-1 py-2.5 text-slate-500 text-sm font-bold flex items-center justify-center gap-1.5 active:bg-slate-100 transition-colors"
                          style="border-right:1px solid #f1f5f9">
                          <span class="material-symbols-outlined" style="font-size:16px">close</span> Rechazar
                        </button>
                        <button (click)="acceptOfferCard(offer)"
                          [disabled]="acceptingOfferId() === offer.id"
                          class="flex-1 py-2.5 text-white text-sm font-black flex items-center justify-center gap-1.5 active:opacity-80 transition-all disabled:opacity-60"
                          style="background:#16a34a">
                          @if (acceptingOfferId() === offer.id) {
                            <span class="material-symbols-outlined animate-spin" style="font-size:16px">autorenew</span>
                          } @else {
                            <span class="material-symbols-outlined" style="font-size:16px">check</span>
                          }
                          Aceptar
                        </button>
                      </div>
                    </div>
                  }
                </div>
              }

              <!-- Fila: pago + temporizador -->
              <div class="flex items-center gap-2 px-4 pt-3 pb-1">
                <p class="text-slate-700 text-sm font-semibold flex-1 leading-snug">
                  Mejor tarifa. Tu solicitud tiene prioridad
                </p>
                <div class="flex items-center gap-1.5 flex-shrink-0 px-2.5 py-1 rounded-full"
                  [style.background]="paymentMethodMap[tripPayment()].bgSel"
                  [style.border]="'1px solid ' + paymentMethodMap[tripPayment()].color">
                  <span class="material-symbols-outlined" style="font-size:13px"
                    [style.color]="paymentMethodMap[tripPayment()].color">{{ paymentMethodMap[tripPayment()].icon }}</span>
                  <span class="text-[10px] font-black"
                    [style.color]="paymentMethodMap[tripPayment()].color">{{ paymentMethodMap[tripPayment()].label }}</span>
                </div>
                <span class="font-black text-xl text-slate-800 flex-shrink-0 tabular-nums">{{ formatTime(waitingCountdown()) }}</span>
              </div>

              <!-- Barra de progreso -->
              <div class="mx-4 mb-3 rounded-full overflow-hidden" style="height:3px;background:#e2e8f0">
                <div class="h-full rounded-full bg-slate-800 transition-all duration-1000"
                  [style.width]="waitingProgress() + '%'"></div>
              </div>

              <!-- Ajuste de precio -->
              <div class="flex items-center justify-between px-4 py-2.5" style="border-top:1px solid #e2e8f0;border-bottom:1px solid #e2e8f0">
                <button (click)="adjustTripPrice(-500)"
                  class="px-4 py-2 rounded-xl text-slate-600 text-sm font-bold active:scale-95 transition-all"
                  style="background:#f1f5f9;border:1px solid #e2e8f0">-500</button>
                <p class="font-black text-xl text-slate-800">{{ formatCOP(tripPrice()) }}</p>
                <button (click)="adjustTripPrice(500)"
                  class="px-4 py-2 rounded-xl text-slate-600 text-sm font-bold active:scale-95 transition-all"
                  style="background:#f1f5f9;border:1px solid #e2e8f0">+500</button>
              </div>

              <!-- Aumentar tarifa -->
              <div class="px-4 py-2" style="border-bottom:1px solid #e2e8f0">
                <button class="w-full py-1.5 text-slate-400 text-sm font-semibold text-center">
                  Aumentar tarifa
                </button>
              </div>

              <!-- Toggle auto-aceptar -->
              <div class="flex items-center gap-3 px-4 py-3" style="border-bottom:1px solid #e2e8f0">
                <span class="material-symbols-outlined text-orange-500 flex-shrink-0" style="font-size:20px">near_me</span>
                <p class="text-slate-700 text-xs flex-1 leading-snug">
                  Aceptar automáticamente al conductor más cercano por {{ formatCOP(tripPrice()) }}
                </p>
                <button (click)="autoAccept.set(!autoAccept())"
                  class="flex-shrink-0 relative rounded-full transition-all duration-200"
                  style="width:44px;height:24px"
                  [style.background]="autoAccept() ? '#f97316' : '#cbd5e1'">
                  <div class="absolute top-0.5 rounded-full bg-white shadow transition-all duration-200"
                    style="width:20px;height:20px"
                    [style.left]="autoAccept() ? '22px' : '2px'"></div>
                </button>
              </div>

              <!-- Cancelar -->
              <div class="px-4 py-3">
                <button (click)="cancelTrip()"
                  class="w-full py-2.5 rounded-xl text-slate-500 text-xs font-bold active:scale-[0.98] transition-all"
                  style="background:#f1f5f9;border:1px solid #e2e8f0">
                  Cancelar solicitud
                </button>
              </div>
            }

          </div>
        }

      </div><!-- /map container -->
      } @else {
      <!-- ══ Sección pasajero ══ -->
      <div class="flex flex-col gap-4">

        <!-- Botón volver -->
        <button (click)="passengerSection.set(null)"
          class="flex items-center gap-2 text-orange-400 font-bold text-sm active:scale-95 transition-all self-start">
          <span class="material-symbols-outlined" style="font-size:20px">arrow_back</span>
          Volver
        </button>

        <!-- ── HISTORIAL ── -->
        @if (passengerSection() === 'history') {
          <div class="flex flex-col gap-3">
            <h2 class="text-white font-black text-lg">Historial de solicitudes</h2>
            @if (passengerHistoryLoading()) {
              <div class="flex justify-center py-8">
                <span class="material-symbols-outlined text-orange-400 animate-spin" style="font-size:32px">autorenew</span>
              </div>
            } @else if (passengerHistory().length === 0) {
              <div class="flex flex-col items-center gap-3 py-10">
                <span class="material-symbols-outlined text-slate-600" style="font-size:48px">history</span>
                <p class="text-slate-400 text-sm">No tienes viajes registrados aún</p>
              </div>
            } @else {
              <div class="flex flex-col gap-2">
                @for (trip of passengerHistory(); track trip.id) {
                  <div class="rounded-2xl p-4 flex flex-col gap-2"
                    style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08)">
                    <div class="flex items-center justify-between">
                      <div class="flex items-center gap-2">
                        <span class="material-symbols-outlined text-orange-400 flex-shrink-0" style="font-size:18px">place</span>
                        <p class="text-white font-bold text-sm truncate max-w-[180px]">{{ trip.dest_name }}</p>
                      </div>
                      <span class="px-2 py-0.5 rounded-full text-[10px] font-black uppercase"
                        [style.background]="trip.status==='completed' ? 'rgba(16,185,129,0.15)' : trip.status==='cancelled' ? 'rgba(239,68,68,0.15)' : 'rgba(249,115,22,0.15)'"
                        [style.color]="trip.status==='completed' ? '#34d399' : trip.status==='cancelled' ? '#f87171' : '#fb923c'">
                        {{ trip.status === 'completed' ? 'Completado' : trip.status === 'cancelled' ? 'Cancelado' : 'En curso' }}
                      </span>
                    </div>
                    <div class="flex items-center gap-4 text-xs text-slate-400">
                      <span class="flex items-center gap-1">
                        <span class="material-symbols-outlined" style="font-size:14px">straighten</span>
                        {{ trip.distance_km }} km
                      </span>
                      <span class="flex items-center gap-1 text-emerald-400 font-bold">
                        <span class="material-symbols-outlined" style="font-size:14px">payments</span>
                        {{ formatCOP(trip.offered_price) }}
                      </span>
                      <span>{{ formatTripDate(trip.created_at) }}</span>
                    </div>
                  </div>
                }
              </div>
            }
          </div>
        }

        <!-- ── NOTIFICACIONES ── -->
        @if (passengerSection() === 'notifications') {
          <div class="flex flex-col gap-4">
            <h2 class="text-white font-black text-lg">Notificaciones</h2>
            <div class="rounded-2xl overflow-hidden" style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08)">
              <div class="flex items-center justify-between px-4 py-4" style="border-bottom:1px solid rgba(255,255,255,0.06)">
                <div class="flex items-center gap-3">
                  <span class="material-symbols-outlined text-orange-400" style="font-size:20px">volume_up</span>
                  <div>
                    <p class="text-white font-bold text-sm">Sonido</p>
                    <p class="text-slate-400 text-xs">Alertas sonoras al recibir ofertas</p>
                  </div>
                </div>
                <button (click)="togglePassengerSound()"
                  class="relative rounded-full transition-all duration-200 flex-shrink-0"
                  style="width:44px;height:24px"
                  [style.background]="passengerNotifSettings().sound ? '#f97316' : 'rgba(255,255,255,0.1)'">
                  <div class="absolute top-0.5 rounded-full bg-white shadow transition-all duration-200"
                    style="width:20px;height:20px"
                    [style.left]="passengerNotifSettings().sound ? '22px' : '2px'"></div>
                </button>
              </div>
              <div class="flex items-center justify-between px-4 py-4" style="border-bottom:1px solid rgba(255,255,255,0.06)">
                <div class="flex items-center gap-3">
                  <span class="material-symbols-outlined text-orange-400" style="font-size:20px">vibration</span>
                  <div>
                    <p class="text-white font-bold text-sm">Vibración</p>
                    <p class="text-slate-400 text-xs">Vibrar al recibir nuevas ofertas</p>
                  </div>
                </div>
                <button (click)="togglePassengerVibration()"
                  class="relative rounded-full transition-all duration-200 flex-shrink-0"
                  style="width:44px;height:24px"
                  [style.background]="passengerNotifSettings().vibration ? '#f97316' : 'rgba(255,255,255,0.1)'">
                  <div class="absolute top-0.5 rounded-full bg-white shadow transition-all duration-200"
                    style="width:20px;height:20px"
                    [style.left]="passengerNotifSettings().vibration ? '22px' : '2px'"></div>
                </button>
              </div>
              <div class="flex items-center justify-between px-4 py-4">
                <div class="flex items-center gap-3">
                  <span class="material-symbols-outlined text-orange-400" style="font-size:20px">notifications_active</span>
                  <div>
                    <p class="text-white font-bold text-sm">Nuevas ofertas</p>
                    <p class="text-slate-400 text-xs">Notificar cuando un conductor responde</p>
                  </div>
                </div>
                <button (click)="togglePassengerNewOffers()"
                  class="relative rounded-full transition-all duration-200 flex-shrink-0"
                  style="width:44px;height:24px"
                  [style.background]="passengerNotifSettings().newOffers ? '#f97316' : 'rgba(255,255,255,0.1)'">
                  <div class="absolute top-0.5 rounded-full bg-white shadow transition-all duration-200"
                    style="width:20px;height:20px"
                    [style.left]="passengerNotifSettings().newOffers ? '22px' : '2px'"></div>
                </button>
              </div>
            </div>
          </div>
        }

        <!-- ── SEGURIDAD ── -->
        @if (passengerSection() === 'security') {
          <div class="flex flex-col gap-4">
            <h2 class="text-white font-black text-lg">Seguridad</h2>
            <!-- Notificaciones push -->
            @if (pushSupported()) {
              <div class="rounded-2xl p-4 flex items-center gap-3" style="background:rgba(59,130,246,0.08);border:1px solid rgba(59,130,246,0.2)">
                <span class="material-symbols-outlined text-blue-400" style="font-size:22px">notifications_active</span>
                <div class="flex-1 min-w-0">
                  <p class="text-white font-black text-sm">Notificaciones push</p>
                  <p class="text-slate-400 text-xs">Avisos cuando llegue el conductor o aceptes una oferta</p>
                </div>
                @if (pushEnabled()) {
                  <button (click)="disablePush()" class="px-3 py-1.5 rounded-lg text-xs text-slate-400" style="background:rgba(255,255,255,0.08)">Activadas</button>
                } @else {
                  <button (click)="enablePush()" class="px-3 py-1.5 rounded-lg text-xs font-bold text-white" style="background:#3b82f6">Activar</button>
                }
              </div>
            }
            <!-- Botón de pánico -->
            <div class="rounded-2xl p-4 flex flex-col gap-3" style="background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.2)">
              <div class="flex items-center gap-3">
                <span class="material-symbols-outlined text-red-400" style="font-size:22px">emergency</span>
                <div>
                  <p class="text-white font-black text-sm">Botón de pánico</p>
                  <p class="text-slate-400 text-xs">Llama a tu contacto de emergencia</p>
                </div>
              </div>
              <button (click)="triggerPanic()" [disabled]="panicSending()"
                class="w-full py-3 rounded-xl font-black text-sm transition-all active:scale-[0.98] disabled:opacity-60"
                [style.background]="panicActivated() ? 'rgba(34,197,94,0.3)' : 'linear-gradient(135deg,#dc2626,#b91c1c)'"
                style="color:#fff">
                @if (panicActivated()) { ✓ Alerta enviada — {{ panicContactsNotified() }} contactos notificados }
                @else if (panicSending()) { Enviando alerta... }
                @else { 🚨 Activar pánico }
              </button>
              @if (panicActivated() && panicMapsLink()) {
                <a [href]="panicMapsLink()" target="_blank" class="text-[11px] text-red-300 underline text-center">Ver ubicación compartida</a>
              }
            </div>
            <!-- Contactos de emergencia -->
            <div class="rounded-2xl p-4 flex flex-col gap-3" style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08)">
              <p class="text-white font-black text-sm">Contactos de emergencia</p>
              @for (c of passengerSecurityContacts(); track c.phone) {
                <div class="flex items-center justify-between gap-2">
                  <div class="flex items-center gap-2 flex-1 min-w-0">
                    <span class="material-symbols-outlined text-orange-400" style="font-size:16px">person</span>
                    <div class="min-w-0">
                      <p class="text-white text-xs font-bold truncate">{{ c.name }}</p>
                      <p class="text-slate-400 text-[10px]">{{ c.phone }}</p>
                    </div>
                  </div>
                  <button (click)="removePassengerContact(c.phone)"
                    class="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                    style="background:rgba(239,68,68,0.15)">
                    <span class="material-symbols-outlined text-red-400" style="font-size:14px">close</span>
                  </button>
                </div>
              }
              <div class="flex flex-col gap-2">
                <input [(ngModel)]="passengerNewContactName" placeholder="Nombre"
                  class="w-full px-3 py-2 rounded-xl text-sm text-white outline-none"
                  style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1)"/>
                <input [(ngModel)]="passengerNewContactPhone" placeholder="Teléfono" type="tel"
                  class="w-full px-3 py-2 rounded-xl text-sm text-white outline-none"
                  style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1)"/>
                <button (click)="addPassengerContact()"
                  class="w-full py-2.5 rounded-xl text-sm font-black transition-all active:scale-[0.98]"
                  style="background:linear-gradient(135deg,#f97316,#ea580c);color:#fff">
                  Agregar contacto
                </button>
              </div>
            </div>
            <!-- Compartir ubicación -->
            <div class="rounded-2xl p-4" style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08)">
              <div class="flex items-center gap-3">
                <span class="material-symbols-outlined text-orange-400" style="font-size:20px">share_location</span>
                <div>
                  <p class="text-white font-bold text-sm">Compartir ubicación</p>
                  <p class="text-slate-400 text-xs">Envía tu ubicación en tiempo real a tus contactos durante el viaje</p>
                </div>
              </div>
            </div>
          </div>
        }

        <!-- ── CONFIGURACIÓN ── -->
        @if (passengerSection() === 'settings') {
          <div class="flex flex-col gap-4">
            <h2 class="text-white font-black text-lg">Configuración</h2>
            <div class="rounded-2xl overflow-hidden" style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08)">
              <div class="flex items-center justify-between px-4 py-4" style="border-bottom:1px solid rgba(255,255,255,0.06)">
                <div class="flex items-center gap-3">
                  <span class="material-symbols-outlined text-orange-400" style="font-size:20px">phone_disabled</span>
                  <div>
                    <p class="text-white font-bold text-sm">Ocultar teléfono</p>
                    <p class="text-slate-400 text-xs">Los conductores no verán tu número</p>
                  </div>
                </div>
                <button (click)="togglePassengerHidePhone()"
                  class="relative rounded-full transition-all duration-200 flex-shrink-0"
                  style="width:44px;height:24px"
                  [style.background]="passengerSettings().hidePhone ? '#f97316' : 'rgba(255,255,255,0.1)'">
                  <div class="absolute top-0.5 rounded-full bg-white shadow transition-all duration-200"
                    style="width:20px;height:20px"
                    [style.left]="passengerSettings().hidePhone ? '22px' : '2px'"></div>
                </button>
              </div>
              <div class="flex items-center justify-between px-4 py-4">
                <div class="flex items-center gap-3">
                  <span class="material-symbols-outlined text-orange-400" style="font-size:20px">language</span>
                  <div>
                    <p class="text-white font-bold text-sm">Idioma</p>
                    <p class="text-slate-400 text-xs">Español (Colombia)</p>
                  </div>
                </div>
                <span class="text-slate-500 text-xs font-bold">ES</span>
              </div>
            </div>
            <div class="rounded-2xl p-4 flex flex-col gap-3" style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08)">
              <p class="text-slate-400 text-xs">Versión de la app</p>
              <p class="text-white font-bold text-sm">Movi v1.0.0</p>
              <button class="text-slate-500 text-xs text-left hover:text-slate-300 transition-colors">Ver términos y condiciones</button>
              <button class="text-slate-500 text-xs text-left hover:text-slate-300 transition-colors">Política de privacidad</button>
            </div>
            <button (click)="savePassengerSettings()"
              [disabled]="savingPassengerSettings()"
              class="w-full py-3 rounded-xl font-black text-sm transition-all active:scale-[0.98] disabled:opacity-40"
              style="background:linear-gradient(135deg,#f97316,#ea580c);color:#fff">
              @if (savingPassengerSettings()) { Guardando... } @else { Guardar cambios }
            </button>
          </div>
        }

        <!-- ── AYUDA ── -->
        @if (passengerSection() === 'support') {
          <div class="flex flex-col gap-4">
            <h2 class="text-white font-black text-lg">Ayuda y Soporte</h2>
            <!-- Contacto rápido -->
            <div class="rounded-2xl p-4 flex flex-col gap-3" style="background:rgba(249,115,22,0.08);border:1px solid rgba(249,115,22,0.2)">
              <p class="text-white font-black text-sm">Contactar soporte</p>
              <a href="https://wa.me/573000000000" target="_blank" rel="noopener"
                class="flex items-center gap-3 py-2.5 px-3 rounded-xl transition-all active:scale-[0.98]"
                style="background:rgba(37,211,102,0.15);border:1px solid rgba(37,211,102,0.25)">
                <span class="material-symbols-outlined text-green-400" style="font-size:20px">chat</span>
                <span class="text-green-300 font-bold text-sm">WhatsApp 24&#x2F;7</span>
              </a>
              <a href="mailto:soporte@andaygana.com"
                class="flex items-center gap-3 py-2.5 px-3 rounded-xl transition-all active:scale-[0.98]"
                style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1)">
                <span class="material-symbols-outlined text-orange-400" style="font-size:20px">mail</span>
                <span class="text-slate-300 font-bold text-sm">soporte&#64;andaygana.com</span>
              </a>
            </div>
            <!-- FAQ -->
            <p class="text-slate-400 text-xs font-bold uppercase tracking-widest">Preguntas frecuentes</p>
            <div class="flex flex-col gap-2">
              @for (faq of passengerFaqItems; track faq.q) {
                <div class="rounded-xl overflow-hidden" style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08)">
                  <button (click)="togglePassengerFaq(faq.q)"
                    class="w-full flex items-center justify-between px-4 py-3 text-left">
                    <p class="text-white font-bold text-sm flex-1 pr-2">{{ faq.q }}</p>
                    <span class="material-symbols-outlined text-orange-400 flex-shrink-0 transition-transform"
                      style="font-size:18px"
                      [style.transform]="openPassengerFaq() === faq.q ? 'rotate(180deg)' : 'rotate(0)'">expand_more</span>
                  </button>
                  @if (openPassengerFaq() === faq.q) {
                    <div class="px-4 pb-4 text-slate-400 text-sm leading-relaxed" style="border-top:1px solid rgba(255,255,255,0.06)">
                      <p class="pt-3">{{ faq.a }}</p>
                    </div>
                  }
                </div>
              }
            </div>
          </div>
        }

        <!-- ── RECOMIENDA Y GANA (Pasajero) ── -->
        @if (passengerSection() === 'referrals') {
          <div class="flex flex-col gap-4">
            <h2 class="text-white font-black text-lg flex items-center gap-2">
              <span class="material-symbols-outlined text-amber-400" style="font-size:24px">card_giftcard</span>
              Recomienda y Gana
            </h2>

            <!-- Billetera de retiro -->
            <div class="rounded-2xl p-4 flex flex-col gap-2"
              style="background:linear-gradient(135deg,#6C3AED,#2563EB);border:1px solid rgba(255,255,255,0.2)">
              <p class="text-white/70 text-xs font-bold uppercase tracking-widest">Billetera de retiro</p>
              <p class="text-white font-black text-2xl">{{ '$' + referralBalance().toLocaleString() }}</p>
              <div class="flex items-center gap-4 mt-1">
                <div class="flex items-center gap-1">
                  <span class="material-symbols-outlined text-emerald-300" style="font-size:14px">trending_up</span>
                  <span class="text-emerald-300 text-xs font-bold">Total ganado: {{ '$' + referralTotalEarned().toLocaleString() }}</span>
                </div>
                <div class="flex items-center gap-1">
                  <span class="material-symbols-outlined text-amber-300" style="font-size:14px">group</span>
                  <span class="text-amber-300 text-xs font-bold">{{ referralCount() }} invitados</span>
                </div>
              </div>
            </div>

            <div class="rounded-2xl p-4 flex flex-col gap-3"
              style="background:linear-gradient(135deg,rgba(108,58,237,0.15),rgba(37,99,235,0.15));border:1px solid rgba(108,58,237,0.3)">
              <p class="text-white font-black text-base">Gana el 2% vitalicio</p>
              <p class="text-slate-300 text-xs sm:text-sm leading-relaxed">
                Cada vez que alguien se registre en <span class="text-white font-bold">Movi</span> con tu link y use nuestro servicio,
                tú ganas el <span class="text-amber-400 font-black">2% del valor de cada servicio</span> de por vida.
                No importa si tus invitados son pasajeros o conductores.
              </p>
            </div>

            <!-- Link de referido -->
            <div class="rounded-2xl p-4 flex flex-col gap-3"
              style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.1)">
              <p class="text-slate-400 text-xs font-bold uppercase tracking-widest">Tu link de invitación</p>
              <div class="flex items-center gap-2">
                <div class="flex-1 rounded-xl px-3 py-2.5 text-xs text-white font-mono truncate"
                  style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1)">
                  {{ agReferralLink() }}
                </div>
                <button (click)="copyReferralLink()"
                  class="px-4 py-2.5 rounded-xl text-xs font-black text-black flex items-center gap-1 active:scale-95 transition-transform flex-shrink-0"
                  style="background:linear-gradient(135deg,#f59e0b,#d97706)">
                  <span class="material-symbols-outlined" style="font-size:16px">content_copy</span>
                  {{ referralCopied() ? '¡Copiado!' : 'Copiar' }}
                </button>
              </div>
            </div>

            <!-- Historial de comisiones -->
            @if (referralTransactions().length > 0) {
              <p class="text-slate-400 text-xs font-bold uppercase tracking-widest">Historial de comisiones</p>
              <div class="flex flex-col gap-2">
                @for (tx of referralTransactions(); track tx.id) {
                  <div class="flex items-center justify-between rounded-xl px-3 py-2.5"
                    style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.06)">
                    <div class="flex-1 min-w-0">
                      <p class="text-white text-xs font-bold truncate">{{ tx.description }}</p>
                      <p class="text-slate-500 text-[10px]">{{ tx.created_at?.slice(0,10) }}</p>
                    </div>
                    <span class="text-emerald-400 font-black text-sm flex-shrink-0 ml-2">{{ '+$' + tx.commission_amount?.toLocaleString() }}</span>
                  </div>
                }
              </div>
            }

            <!-- Cómo funciona -->
            <p class="text-slate-400 text-xs font-bold uppercase tracking-widest">¿Cómo funciona?</p>
            <div class="flex flex-col gap-2">
              <div class="flex items-start gap-3 rounded-xl p-3" style="background:rgba(255,255,255,0.04)">
                <div class="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0" style="background:rgba(108,58,237,0.2)">
                  <span class="text-purple-400 font-black text-xs">1</span>
                </div>
                <p class="text-slate-300 text-xs leading-relaxed">Comparte tu link con amigos, familiares o en redes sociales</p>
              </div>
              <div class="flex items-start gap-3 rounded-xl p-3" style="background:rgba(255,255,255,0.04)">
                <div class="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0" style="background:rgba(108,58,237,0.2)">
                  <span class="text-purple-400 font-black text-xs">2</span>
                </div>
                <p class="text-slate-300 text-xs leading-relaxed">Ellos se registran como pasajero o conductor usando tu link</p>
              </div>
              <div class="flex items-start gap-3 rounded-xl p-3" style="background:rgba(255,255,255,0.04)">
                <div class="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0" style="background:rgba(245,158,11,0.2)">
                  <span class="text-amber-400 font-black text-xs">3</span>
                </div>
                <p class="text-slate-300 text-xs leading-relaxed">Cada vez que usen Movi, tú ganas el <span class="text-amber-400 font-bold">2% del valor del servicio</span> en tu billetera de retiro</p>
              </div>
            </div>
          </div>
        }

      </div>
      }

    </div>
  }

    <!-- ═══════════ CONDUCTOR DASHBOARD ═══════════ -->
  @if (screen() === 'driver-home') {
    <div class="w-full max-w-lg flex flex-col gap-5">

      <!-- Header conductor -->
      <div class="flex items-center justify-between px-1 pt-2">
        <div>
          <h1 class="text-white font-black text-lg leading-tight">¡Hola, {{ firstName() }}!</h1>
          <p class="text-slate-500 text-xs">Modo conductor</p>
        </div>
        <button (click)="driverMenuOpen.set(true)"
          class="flex flex-col items-center justify-center gap-1 transition-all active:scale-90 px-2 py-1.5 rounded-xl"
          style="background:rgba(8,145,178,0.1);border:1px solid rgba(8,145,178,0.2)">
          <div class="flex flex-col items-center gap-1">
            <span class="block rounded-full bg-cyan-400" style="width:18px;height:2px"></span>
            <span class="block rounded-full bg-cyan-400" style="width:18px;height:2px"></span>
            <span class="block rounded-full bg-cyan-400" style="width:14px;height:2px"></span>
          </div>
          <span class="text-cyan-400 font-bold" style="font-size:9px;letter-spacing:0.08em">MENÚ</span>
        </button>
      </div>

      <!-- Drawer menú conductor -->
      @if (driverMenuOpen()) {
        <div (click)="driverMenuOpen.set(false)"
          class="fixed inset-0 z-50 transition-opacity"
          style="background:rgba(0,0,0,0.55);backdrop-filter:blur(2px)"></div>

        <div class="fixed top-0 right-0 bottom-0 z-50 flex flex-col"
          style="width:285px;background:#0b1220;border-left:1px solid rgba(8,145,178,0.15);box-shadow:-8px 0 32px rgba(0,0,0,0.6)">

          <!-- Cabecera -->
          <div class="flex items-center justify-between px-5 pt-10 pb-5"
            style="border-bottom:1px solid rgba(255,255,255,0.07)">
            <div class="flex items-center gap-2.5">
              <img src="movi-logo.svg" alt="Movi" class="w-9 h-9 rounded-xl" />
              <div>
                <p class="text-white font-black text-sm">Movi · Conductor</p>
                <p class="text-slate-400 text-xs font-medium">{{ agProfile()?.full_name }}</p>
              </div>
            </div>
            <button (click)="driverMenuOpen.set(false)"
              class="w-8 h-8 rounded-lg flex items-center justify-center active:scale-90"
              style="background:rgba(255,255,255,0.06)">
              <span class="material-symbols-outlined text-slate-400" style="font-size:20px">close</span>
            </button>
          </div>

          <!-- Estado en línea badge -->
          <div class="mx-4 mt-4 flex items-center gap-3 px-4 py-3 rounded-xl"
            style="background:rgba(16,185,129,0.08);border:1px solid rgba(16,185,129,0.2)">
            <div class="w-2.5 h-2.5 rounded-full bg-emerald-400 flex-shrink-0" style="box-shadow:0 0 6px #34d399"></div>
            <div class="flex-1">
              <p class="text-emerald-400 font-black text-xs">En línea</p>
              <p class="text-slate-500 text-[10px]">Disponible para viajes</p>
            </div>
            <div class="w-10 h-5 rounded-full flex items-center px-0.5 cursor-pointer"
              style="background:linear-gradient(135deg,#10b981,#059669)">
              <div class="w-4 h-4 rounded-full bg-white ml-auto"></div>
            </div>
          </div>

          <!-- Opciones -->
          <nav class="flex-1 overflow-y-auto py-3 px-3">
            @for (item of driverMenuItems; track item.label) {
              @if (item.divider) {
                <div class="my-2" style="border-top:1px solid rgba(255,255,255,0.06)"></div>
                @if (item.sectionLabel) {
                  <p class="text-slate-600 text-xs font-bold uppercase tracking-widest px-3 pb-2 pt-1">{{ item.sectionLabel }}</p>
                }
              } @else {
                <button (click)="openDriverSection(item.action)"
                  class="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-left transition-all active:scale-[0.98] mb-0.5"
                  [style.color]="item.danger ? '#f87171' : '#cbd5e1'"
                  onmouseover="this.style.background='rgba(8,145,178,0.08)'"
                  onmouseout="this.style.background='transparent'">
                  <span class="material-symbols-outlined flex-shrink-0" style="font-size:20px"
                    [style.color]="item.danger ? '#f87171' : '#22d3ee'">{{ item.icon }}</span>
                  <span class="text-sm font-medium">{{ item.label }}</span>
                </button>
              }
            }
          </nav>

          <!-- Footer -->
          <div class="px-5 py-5" style="border-top:1px solid rgba(255,255,255,0.07)">
            <p class="text-slate-600 text-xs text-center">Movi · Conductor v1.0</p>
          </div>
        </div>
      }

      <!-- ══ Billetera de retiro conductor (siempre visible) ══ -->
      <button (click)="openDriverSection('referrals')"
        class="w-full rounded-2xl p-3 flex items-center gap-3 active:scale-[0.98] transition-transform"
        style="background:linear-gradient(135deg,#6C3AED,#2563EB);border:1px solid rgba(255,255,255,0.15)">
        <div class="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
          style="background:rgba(255,255,255,0.15)">
          <span class="material-symbols-outlined text-white" style="font-size:22px">account_balance_wallet</span>
        </div>
        <div class="flex-1 min-w-0 text-left">
          <p class="text-white/60 text-[10px] font-bold uppercase tracking-widest">Billetera de retiro</p>
          <p class="text-white font-black text-lg leading-tight">{{ '$' + referralBalance().toLocaleString() }}</p>
        </div>
        <div class="flex flex-col items-end gap-0.5 flex-shrink-0">
          <span class="text-emerald-300 text-[10px] font-bold">{{ referralCount() }} invitados</span>
          <span class="material-symbols-outlined text-white/40" style="font-size:18px">chevron_right</span>
        </div>
      </button>

      @if (driverSection() === null) {
      <div class="flex flex-col items-center gap-3 text-center pt-2 pb-2">
        <div class="w-16 h-16 rounded-2xl bg-cyan-500/10 border-2 border-cyan-500/20 flex items-center justify-center">
          <span class="material-symbols-outlined text-cyan-400" style="font-size:32px">directions_car</span>
        </div>
        <div>
          <p class="text-slate-400 text-sm">Tu cuenta de conductor</p>
        </div>
        @if (driverStatus() === 'pending') {
          <span class="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-bold">
            <span class="material-symbols-outlined" style="font-size:14px">schedule</span> En revisión
          </span>
        } @else if (driverStatus() === 'approved') {
          <span class="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-bold">
            <span class="material-symbols-outlined" style="font-size:14px">check_circle</span> Aprobado
          </span>
        } @else if (driverStatus() === 'rejected') {
          <span class="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-bold">
            <span class="material-symbols-outlined" style="font-size:14px">cancel</span> Rechazado
          </span>
        }
      </div>

      @if (driverStatus() === 'pending') {
        <div class="bg-amber-500/5 border border-amber-500/15 rounded-2xl p-5 text-center flex flex-col items-center gap-2">
          <span class="material-symbols-outlined text-amber-400" style="font-size:36px">hourglass_top</span>
          <p class="text-white font-bold text-sm">Tu solicitud está siendo revisada</p>
          <p class="text-slate-400 text-xs leading-relaxed">Nuestro equipo verificará tus documentos en las próximas 24–48 horas. Te notificaremos por correo cuando sea aprobada.</p>
        </div>
      }
      @if (driverStatus() === 'approved') {
        <!-- Billetera del conductor -->
        <div class="flex items-center gap-3 rounded-2xl px-4 py-3"
          style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08)">
          <div class="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
            style="background:rgba(16,185,129,0.1);border:1px solid rgba(16,185,129,0.2)">
            <span class="material-symbols-outlined text-emerald-400" style="font-size:18px">account_balance_wallet</span>
          </div>
          <div class="flex-1">
            <p class="text-slate-500 text-[10px] uppercase font-bold tracking-widest">Saldo billetera</p>
            <p class="font-black text-base" [class]="driverWalletBalance() >= 0 ? 'text-emerald-400' : 'text-rose-400'">
              {{ formatCOP(driverWalletBalance()) }}
            </p>
          </div>
          @if (driverCommissionPct() > 0) {
            <div class="text-right">
              <p class="text-slate-600 text-[10px]">Comisión</p>
              <p class="text-purple-400 font-black text-sm">{{ driverCommissionPct() }}%</p>
            </div>
          } @else {
            <span class="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 text-[10px] font-bold">Sin comisión</span>
          }
        </div>

        <!-- Viajes activos del conductor -->
        @if (driverActiveTrips().length > 0) {
          <div class="flex flex-col gap-2">
            <p class="text-slate-400 text-xs font-bold uppercase tracking-widest px-1">Viajes en curso</p>
            @for (trip of driverActiveTrips(); track trip.id) {
              <div class="rounded-2xl overflow-hidden" style="background:#0f1421;border:1px solid rgba(16,185,129,0.2)">
                <div class="flex items-center gap-3 px-4 py-3">
                  <div class="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                    style="background:rgba(16,185,129,0.1);border:1px solid rgba(16,185,129,0.2)">
                    <span class="material-symbols-outlined text-emerald-400" style="font-size:18px">directions_car</span>
                  </div>
                  <div class="flex-1 min-w-0">
                    <p class="text-white font-bold text-sm truncate">{{ trip.ag_trip_requests?.ag_users?.full_name ?? 'Pasajero' }}</p>
                    <p class="text-slate-500 text-xs truncate">→ {{ trip.ag_trip_requests?.dest_name }}</p>
                    <!-- Método de pago -->
                    <div class="flex items-center gap-2 mt-1">
                      <div class="flex items-center gap-1 px-2 py-0.5 rounded-full"
                        [style.background]="getPaymentInfo(trip.ag_trip_requests?.payment_method).bgDark"
                        [style.border]="'1px solid ' + getPaymentInfo(trip.ag_trip_requests?.payment_method).colorDark">
                        <span class="material-symbols-outlined" style="font-size:10px"
                          [style.color]="getPaymentInfo(trip.ag_trip_requests?.payment_method).colorDark">{{ getPaymentInfo(trip.ag_trip_requests?.payment_method).icon }}</span>
                        <span class="text-[9px] font-bold"
                          [style.color]="getPaymentInfo(trip.ag_trip_requests?.payment_method).colorDark">{{ getPaymentInfo(trip.ag_trip_requests?.payment_method).label }}</span>
                      </div>
                      @if (trip.ag_trip_requests?.ag_users?.phone) {
                        <a [href]="'tel:' + trip.ag_trip_requests.ag_users.phone" class="flex items-center gap-1 text-[9px] text-slate-500 hover:text-white transition-colors">
                          <span class="material-symbols-outlined" style="font-size:10px">call</span>
                          {{ trip.ag_trip_requests.ag_users.phone }}
                        </a>
                      }
                    </div>
                  </div>
                  <p class="text-emerald-400 font-black text-sm flex-shrink-0">{{ formatCOP(trip.offered_price) }}</p>
                </div>
                <!-- Estados del viaje -->
                <div class="px-4 pb-2 flex items-center gap-1">
                  @for (st of tripStages; track st.key) {
                    <div class="flex-1 flex flex-col items-center gap-0.5">
                      <div class="w-full h-1 rounded-full"
                        [style.background]="isStageReached(trip.ag_trip_requests?.driver_stage, st.key) ? '#10b981' : 'rgba(255,255,255,0.1)'"></div>
                      <span class="text-[9px] font-bold"
                        [style.color]="isStageReached(trip.ag_trip_requests?.driver_stage, st.key) ? '#10b981' : '#64748b'">{{ st.label }}</span>
                    </div>
                  }
                </div>
                <div class="px-4 pb-3 flex flex-wrap gap-2">
                  <button (click)="openDriverChat(trip)"
                    class="px-3 py-2.5 rounded-xl text-white text-xs font-black flex items-center justify-center gap-1 active:scale-[0.98] transition-all"
                    style="background:linear-gradient(135deg,#2563eb,#3b82f6)">
                    <span class="material-symbols-outlined" style="font-size:15px">chat</span>Chat
                  </button>
                  <button (click)="callPassengerFromTrip(trip)"
                    class="px-3 py-2.5 rounded-xl text-white text-xs font-black flex items-center justify-center gap-1 active:scale-[0.98] transition-all"
                    style="background:linear-gradient(135deg,#16a34a,#22c55e)">
                    <span class="material-symbols-outlined" style="font-size:15px">call</span>Llamar
                  </button>
                  <button (click)="navigateTo(trip.ag_trip_requests?.origin_lat, trip.ag_trip_requests?.origin_lng, 'pickup')"
                    class="px-3 py-2.5 rounded-xl text-white text-xs font-black flex items-center justify-center gap-1"
                    style="background:linear-gradient(135deg,#8b5cf6,#6366f1)">
                    <span class="material-symbols-outlined" style="font-size:15px">navigation</span>Origen
                  </button>
                  <button (click)="navigateTo(trip.ag_trip_requests?.dest_lat, trip.ag_trip_requests?.dest_lng, 'dest')"
                    class="px-3 py-2.5 rounded-xl text-white text-xs font-black flex items-center justify-center gap-1"
                    style="background:linear-gradient(135deg,#f59e0b,#f97316)">
                    <span class="material-symbols-outlined" style="font-size:15px">place</span>Destino
                  </button>
                  @if (trip.ag_trip_requests?.driver_stage !== 'picked_up' && trip.ag_trip_requests?.driver_stage !== 'on_route') {
                    <button (click)="advanceStage(trip, 'picked_up')"
                      class="flex-1 py-2.5 rounded-xl text-white text-xs font-black flex items-center justify-center gap-1"
                      style="background:linear-gradient(135deg,#0891b2,#06b6d4)">
                      <span class="material-symbols-outlined" style="font-size:15px">person_check</span>Pasajero a bordo
                    </button>
                  }
                  <button (click)="finishDriverTrip(trip)"
                    class="flex-1 py-2.5 rounded-xl text-white text-xs font-black flex items-center justify-center gap-1 active:scale-[0.98] transition-all"
                    style="background:linear-gradient(135deg,#16a34a,#15803d)">
                    <span class="material-symbols-outlined" style="font-size:15px">check_circle</span>Finalizar
                  </button>
                </div>
              </div>
            }
          </div>
        }

        <!-- Panel de solicitudes de viaje -->
        <div class="flex flex-col gap-3">
          <!-- Header toggle -->
          <button (click)="toggleDriverRequests()"
            class="w-full flex items-center justify-between px-4 py-3 rounded-2xl transition-all active:scale-[0.98]"
            style="background:linear-gradient(135deg,#0f766e,#0891b2);box-shadow:0 4px 14px rgba(8,145,178,0.25)">
            <div class="flex items-center gap-2.5">
              <span class="material-symbols-outlined text-white" style="font-size:22px">directions_car</span>
              <div class="text-left">
                <p class="text-white font-black text-sm">Solicitudes de viaje</p>
                <p class="text-cyan-200 text-xs">{{ driverRequests().length }} disponibles cerca</p>
              </div>
            </div>
            <span class="material-symbols-outlined text-white" style="font-size:20px">
              {{ driverRequestsOpen() ? 'expand_less' : 'expand_more' }}
            </span>
          </button>

          @if (driverRequestsOpen()) {
            <!-- Actualizar -->
            <div class="flex justify-end">
              <button (click)="refreshDriverRequests()"
                class="flex items-center gap-1 text-xs text-cyan-400 font-bold active:scale-95 transition-all">
                <span class="material-symbols-outlined" style="font-size:14px">refresh</span> Actualizar
              </button>
            </div>

            @if (driverRequests().length === 0) {
              <div class="rounded-2xl flex flex-col items-center gap-2 py-8"
                style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08)">
                <span class="material-symbols-outlined text-slate-600" style="font-size:36px">search_off</span>
                <p class="text-slate-500 text-sm">Sin solicitudes activas ahora</p>
                <p class="text-slate-600 text-xs">Los pasajeros aparecerán aquí</p>
              </div>
            }

            @for (req of driverRequests(); track req.id) {
              <div class="rounded-2xl overflow-hidden"
                style="background:#0f1421;border:1px solid rgba(255,255,255,0.08)">
                <div class="flex items-start gap-3 px-4 pt-3 pb-2">
                  <!-- Icono tipo -->
                  <div class="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                    style="background:rgba(8,145,178,0.12);border:1px solid rgba(8,145,178,0.2)">
                    <span class="material-symbols-outlined text-cyan-400" style="font-size:20px">
                      {{ req.vehicle_type === 'moto' ? 'two_wheeler' : 'directions_car' }}
                    </span>
                  </div>
                  <!-- Info -->
                  <div class="flex-1 min-w-0">
                    <p class="text-slate-300 text-xs mb-0.5">
                      <span class="text-white font-bold">{{ req.ag_users?.full_name ?? 'Pasajero' }}</span>
                      · {{ req.distance_km }} km
                    </p>
                    <p class="text-slate-500 text-xs truncate">→ {{ req.dest_name }}</p>
                    <!-- Método de pago -->
                    <div class="flex items-center gap-1 mt-1.5 w-fit px-2 py-0.5 rounded-full"
                      [style.background]="paymentMethodMap[req.payment_method ?? 'efectivo'].bgDark"
                      [style.border]="'1px solid ' + paymentMethodMap[req.payment_method ?? 'efectivo'].colorDark">
                      <span class="material-symbols-outlined" style="font-size:11px"
                        [style.color]="paymentMethodMap[req.payment_method ?? 'efectivo'].colorDark">{{ paymentMethodMap[req.payment_method ?? 'efectivo'].icon }}</span>
                      <span class="text-[10px] font-bold"
                        [style.color]="paymentMethodMap[req.payment_method ?? 'efectivo'].colorDark">{{ paymentMethodMap[req.payment_method ?? 'efectivo'].label }}</span>
                    </div>
                  </div>
                  <!-- Precio ofrecido -->
                  <div class="text-right flex-shrink-0">
                    <p class="text-cyan-400 font-black text-base">{{ formatCOP(req.offered_price) }}</p>
                    <p class="text-slate-600 text-[10px]">precio pasajero</p>
                  </div>
                </div>

                <!-- Botón hacer oferta -->
                @if (offerSentFor().has(req.id)) {
                  <div class="flex items-center justify-center gap-1.5 py-2.5 mx-4 mb-3 rounded-xl"
                    style="background:rgba(16,185,129,0.08);border:1px solid rgba(16,185,129,0.2)">
                    <span class="material-symbols-outlined text-emerald-400" style="font-size:16px">check_circle</span>
                    <span class="text-emerald-400 text-xs font-bold">Oferta enviada</span>
                  </div>
                } @else {
                  <div class="px-4 pb-3">
                    @if (driverWalletBalance() <= 0) {
                      <div class="w-full py-2.5 rounded-xl flex flex-col items-center gap-1"
                        style="background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.2)">
                        <div class="flex items-center gap-1.5">
                          <span class="material-symbols-outlined text-rose-400" style="font-size:15px">account_balance_wallet</span>
                          <span class="text-rose-400 text-xs font-black">Recarga requerida</span>
                        </div>
                        <p class="text-slate-500 text-[10px]">Necesitas saldo en tu billetera para aceptar viajes</p>
                        <button (click)="openDriverSection('earnings')"
                          class="mt-1 px-4 py-1.5 rounded-lg text-[10px] font-black text-cyan-400 flex items-center gap-1"
                          style="background:rgba(8,145,178,0.1);border:1px solid rgba(8,145,178,0.25)">
                          <span class="material-symbols-outlined" style="font-size:12px">add_circle</span>
                          Recargar billetera
                        </button>
                      </div>
                    } @else if (driverCommissionPct() > 0 && driverWalletBalance() < requiredCommission(req.offered_price)) {
                      <div class="w-full py-2.5 rounded-xl flex flex-col items-center gap-1"
                        style="background:rgba(251,191,36,0.08);border:1px solid rgba(251,191,36,0.2)">
                        <div class="flex items-center gap-1.5">
                          <span class="material-symbols-outlined text-amber-400" style="font-size:15px">account_balance_wallet</span>
                          <span class="text-amber-400 text-xs font-black">Saldo insuficiente</span>
                        </div>
                        <p class="text-slate-500 text-[10px]">Necesitas {{ formatCOP(requiredCommission(req.offered_price)) }} de comisión</p>
                        <button (click)="openDriverSection('earnings')"
                          class="mt-1 px-4 py-1.5 rounded-lg text-[10px] font-black text-cyan-400 flex items-center gap-1"
                          style="background:rgba(8,145,178,0.1);border:1px solid rgba(8,145,178,0.25)">
                          <span class="material-symbols-outlined" style="font-size:12px">add_circle</span>
                          Recargar billetera
                        </button>
                      </div>
                    } @else {
                      <button (click)="openMakeOffer(req)"
                        class="w-full py-2.5 rounded-xl text-white text-sm font-black flex items-center justify-center gap-2 active:scale-[0.98] transition-all"
                        style="background:linear-gradient(135deg,#0891b2,#0e7490)">
                        <span class="material-symbols-outlined" style="font-size:16px">local_offer</span>
                        Hacer oferta
                      </button>
                    }
                  </div>
                }
              </div>
            }
          }
        </div>
      }
      @if (driverStatus() === 'rejected') {
        <div class="bg-rose-500/5 border border-rose-500/15 rounded-2xl p-5 flex flex-col gap-2">
          <p class="text-white font-bold text-sm">Tu solicitud fue rechazada</p>
          @if (driverRejectionReason()) {
            <p class="text-slate-400 text-xs leading-relaxed"><span class="text-rose-400 font-bold">Motivo:</span> {{ driverRejectionReason() }}</p>
          }
          <p class="text-slate-500 text-xs">Puedes contactar al soporte para más información.</p>
        </div>
      }

      <!-- Info card -->
      <div class="bg-white/[0.03] border border-white/8 rounded-2xl p-5 flex flex-col gap-3">
        <h3 class="text-white font-black text-sm uppercase tracking-widest">Tu vehículo</h3>
        <div class="grid grid-cols-2 gap-3">
          <div><p class="text-slate-500 text-[10px] uppercase">Placa</p><p class="text-white text-sm font-black">{{ driverData()?.plate }}</p></div>
          <div><p class="text-slate-500 text-[10px] uppercase">Tipo</p><p class="text-white text-sm font-bold">{{ driverData()?.vehicle_type }}</p></div>
          <div><p class="text-slate-500 text-[10px] uppercase">Marca / Modelo</p><p class="text-slate-300 text-xs">{{ driverData()?.vehicle_brand }} {{ driverData()?.vehicle_model }}</p></div>
          <div><p class="text-slate-500 text-[10px] uppercase">Año</p><p class="text-slate-300 text-xs">{{ driverData()?.vehicle_year }}</p></div>
        </div>
      </div>

      <!-- Mapa + dirección -->
      <div class="flex flex-col gap-2">

        @if (gpsStatus() !== 'requesting') {
          <div class="relative">
            @if (!addressEditMode()) {
              <button (click)="openAddressEdit()"
                class="w-full flex items-center gap-3 bg-white rounded-2xl px-4 py-3 shadow-lg shadow-black/20 text-left transition-all hover:shadow-xl active:scale-[0.98]">
                <span class="material-symbols-outlined text-cyan-500 flex-shrink-0" style="font-size:22px">location_on</span>
                <div class="flex-1 min-w-0">
                  @if (addressLoading()) {
                    <p class="text-slate-400 text-sm animate-pulse">Obteniendo dirección...</p>
                  } @else if (currentAddress()) {
                    <p class="text-slate-800 text-sm font-semibold truncate">{{ currentAddress() }}</p>
                    <p class="text-slate-400 text-xs mt-0.5">Toca para cambiar tu ubicación</p>
                  } @else {
                    <p class="text-slate-500 text-sm">Dirección no disponible</p>
                    <p class="text-slate-400 text-xs mt-0.5">Toca para buscar tu ubicación</p>
                  }
                </div>
                <span class="material-symbols-outlined text-slate-400 flex-shrink-0" style="font-size:18px">edit</span>
              </button>
            } @else {
              <div class="flex flex-col bg-white rounded-2xl shadow-xl shadow-black/20 overflow-hidden">
                <div class="flex items-center gap-3 px-4 py-3 border-b border-slate-200">
                  <span class="material-symbols-outlined text-cyan-500" style="font-size:20px">search</span>
                  <input [value]="addressQuery()"
                    (input)="onAddressInput($any($event.target).value)"
                    (keydown.escape)="closeAddressEdit()"
                    (keydown.enter)="confirmTypedAddress()"
                    placeholder="Busca tu dirección o lugar..."
                    class="flex-1 text-slate-800 text-sm outline-none placeholder-slate-400 bg-transparent"/>
                  <button (mousedown)="$event.preventDefault(); confirmTypedAddress()" class="flex-shrink-0 w-8 h-8 rounded-lg bg-cyan-500 flex items-center justify-center">
                    <span class="material-symbols-outlined text-white" style="font-size:16px">arrow_forward</span>
                  </button>
                  <button (click)="closeAddressEdit()">
                    <span class="material-symbols-outlined text-slate-400" style="font-size:20px">close</span>
                  </button>
                </div>
                @if (addressSuggestions().length > 0) {
                  <div class="flex flex-col max-h-60 overflow-y-auto">
                    @for (s of addressSuggestions(); track s.id) {
                      <button (mousedown)="$event.preventDefault(); selectAddress(s)"
                        class="flex items-start gap-3 px-4 py-3 hover:bg-cyan-50 active:bg-cyan-100 transition-colors text-left border-b border-slate-50 last:border-0">
                        <span class="material-symbols-outlined text-cyan-400 mt-0.5 flex-shrink-0" style="font-size:16px">location_on</span>
                        <div class="min-w-0">
                          <p class="text-slate-800 text-sm font-semibold truncate">{{ s.text }}</p>
                          <p class="text-slate-400 text-xs truncate">{{ s.place_name }}</p>
                        </div>
                      </button>
                    }
                  </div>
                } @else if (addressQuery().length > 1) {
                  @if (addressNoResults()) {
                    <div class="px-4 py-4 text-center">
                      <p class="text-slate-500 text-sm mb-2">No encontramos ese lugar</p>
                      <button (mousedown)="$event.preventDefault(); useMapPin()"
                        class="inline-flex items-center gap-1.5 px-4 py-2 bg-cyan-50 text-cyan-600 rounded-lg text-xs font-bold hover:bg-cyan-100 transition-colors">
                        <span class="material-symbols-outlined" style="font-size:14px">pin_drop</span>
                        Ubicar moviendo el pin en el mapa
                      </button>
                    </div>
                  } @else {
                    <div class="px-4 py-4 text-slate-400 text-sm text-center flex items-center justify-center gap-1.5">
                      <span class="material-symbols-outlined animate-spin" style="font-size:14px">autorenew</span> Buscando...
                    </div>
                  }
                }
              </div>
            }
          </div>
        }

        @if (gpsStatus() === 'requesting') {
          <div class="rounded-2xl bg-white/[0.03] border border-white/8 h-60 flex flex-col items-center justify-center gap-3">
            <span class="material-symbols-outlined text-cyan-400 animate-pulse" style="font-size:38px">my_location</span>
            <p class="text-slate-400 text-sm font-bold">Obteniendo tu ubicación...</p>
            <p class="text-slate-600 text-xs">Acepta el permiso en tu dispositivo</p>
          </div>
        }

        <div class="relative">
          <div id="ag-map-user" style="height:300px;border-radius:16px;overflow:hidden;border:1px solid rgba(255,255,255,0.08);"
            [style.display]="gpsStatus() === 'requesting' ? 'none' : 'block'"></div>
          @if (driverData() && driverOnline()) {
            <button (click)="toggleHeatmap()" title="Zonas con demanda"
              class="absolute top-2 right-2 w-10 h-10 rounded-xl flex items-center justify-center active:scale-95 transition"
              [style]="heatmapVisible() ? 'background:linear-gradient(135deg,#f97316,#ef4444);color:#fff' : 'background:rgba(0,0,0,0.7);color:#fb923c'">
              <span class="material-symbols-outlined" style="font-size:22px">local_fire_department</span>
            </button>
          }
        </div>

        @if (gpsStatus() === 'denied') {
          <div class="flex items-center justify-between">
            <p class="text-slate-600 text-xs">Sin ubicación exacta</p>
            <button (click)="retryGps('ag-map-user')"
              class="text-xs text-cyan-400 font-bold flex items-center gap-1">
              <span class="material-symbols-outlined" style="font-size:13px">my_location</span> Reintentar
            </button>
          </div>
        }
      </div>

      } @else {
        <!-- ══ SECCIONES DEL MENÚ CONDUCTOR ══ -->
        <div class="flex flex-col gap-4">

          <!-- Back header (común a todas las secciones) -->
          <div class="flex items-center gap-3">
            <button (click)="driverSection.set(null)"
              class="w-9 h-9 rounded-xl flex items-center justify-center active:scale-90 transition-all"
              style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1)">
              <span class="material-symbols-outlined text-white" style="font-size:20px">arrow_back</span>
            </button>
            <h2 class="text-white font-black text-lg">
              {{ driverSection() === 'profile' ? 'Mi Perfil' :
                 driverSection() === 'status' ? 'Estado' :
                 driverSection() === 'earnings' ? 'Ganancias' :
                 driverSection() === 'trips' ? 'Mis Viajes' :
                 driverSection() === 'referrals' ? 'Recomienda y Gana' :
                 driverSection() === 'analytics' ? 'Analytics' :
                 driverSection() === 'performance' ? 'Rendimiento' :
                 driverSection() === 'quests' ? 'Metas y bonos' :
                 driverSection() === 'vehicles' ? 'Mis vehículos' :
                 driverSection() === 'blacklist' ? 'Pasajeros bloqueados' :
                 driverSection() === 'tutorial' ? 'Tutorial' :
                 driverSection() === 'preferences' ? 'Preferencias' :
                 driverSection() === 'autoaccept' ? 'Auto-aceptar' :
                 driverSection() === 'documents' ? 'Mis documentos' :
                 driverSection() === 'lost' ? 'Objetos olvidados' :
                 driverSection() === 'scheduled' ? 'Viajes programados' :
                 driverSection() === 'security' ? 'Seguridad' :
                 driverSection() === 'support' ? 'Soporte' :
                 driverSection() === 'settings' ? 'Configuración' : '' }}
            </h2>
          </div>

          @if (loadingSection()) {
            <div class="flex items-center justify-center py-16">
              <span class="material-symbols-outlined text-cyan-400 animate-spin" style="font-size:36px">autorenew</span>
            </div>
          }

          <!-- ── MI PERFIL ── -->
          @if (!loadingSection() && driverSection() === 'profile') {
            <div class="flex flex-col items-center gap-4 pt-2">
              <!-- Avatar -->
              <div class="w-24 h-24 rounded-3xl flex items-center justify-center"
                style="background:linear-gradient(135deg,#0891b2,#0e7490);font-size:36px;color:white;font-weight:900">
                {{ firstName().charAt(0).toUpperCase() }}
              </div>
              <div class="text-center">
                <p class="text-white font-black text-xl">{{ agProfile()?.full_name }}</p>
                <p class="text-slate-500 text-sm">{{ agProfile()?.email }}</p>
                <p class="text-slate-500 text-sm">{{ agProfile()?.phone }}</p>
              </div>
              <!-- Verificación -->
              @if (driverStatus() === 'approved') {
                <div class="flex items-center gap-2 px-4 py-2 rounded-full"
                  style="background:rgba(16,185,129,0.1);border:1px solid rgba(16,185,129,0.2)">
                  <span class="material-symbols-outlined text-emerald-400" style="font-size:16px">verified</span>
                  <span class="text-emerald-400 text-xs font-black">Identidad verificada</span>
                </div>
              }
            </div>
            <!-- Nivel + horas online -->
            @if (driverOnline()) {
              <div class="rounded-2xl p-3 flex items-center justify-between"
                style="background:rgba(34,197,94,0.08);border:1px solid rgba(34,197,94,0.2)">
                <div class="flex items-center gap-2">
                  <span class="material-symbols-outlined text-emerald-400 animate-pulse" style="font-size:18px">schedule</span>
                  <div>
                    <p class="text-white font-black text-sm">{{ onlineTodayFormatted() }}</p>
                    <p class="text-slate-400 text-[10px]">online hoy</p>
                  </div>
                </div>
                <div class="flex items-center gap-1.5 px-2 py-1 rounded-lg" [style.background]="driverLevelColor()">
                  <span class="material-symbols-outlined" style="font-size:14px">{{ driverLevelIcon() }}</span>
                  <span class="text-xs font-black uppercase">{{ driverData()?.level ?? 'bronce' }}</span>
                </div>
              </div>
            }
            <!-- Stats -->
            <div class="grid grid-cols-3 gap-3">
              <div class="rounded-2xl p-4 flex flex-col items-center gap-1"
                style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08)">
                <span class="material-symbols-outlined text-amber-400" style="font-size:22px">star</span>
                <p class="text-white font-black text-xl">{{ driverStats()?.avgRating ?? '–' }}</p>
                <p class="text-slate-500 text-[10px] text-center">Calificación</p>
              </div>
              <div class="rounded-2xl p-4 flex flex-col items-center gap-1"
                style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08)">
                <span class="material-symbols-outlined text-cyan-400" style="font-size:22px">directions_car</span>
                <p class="text-white font-black text-xl">{{ driverStats()?.completedTrips ?? 0 }}</p>
                <p class="text-slate-500 text-[10px] text-center">Viajes</p>
              </div>
              <div class="rounded-2xl p-4 flex flex-col items-center gap-1"
                style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08)">
                <span class="material-symbols-outlined text-emerald-400" style="font-size:22px">account_balance_wallet</span>
                <p class="text-white font-black text-lg">{{ formatCOP(driverWalletBalance()) }}</p>
                <p class="text-slate-500 text-[10px] text-center">Saldo</p>
              </div>
            </div>
            <!-- Vehículo -->
            <div class="rounded-2xl p-4 flex flex-col gap-3"
              style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08)">
              <p class="text-slate-400 text-xs font-bold uppercase tracking-widest">Tu vehículo</p>
              <div class="grid grid-cols-2 gap-2">
                <div><p class="text-slate-500 text-[10px] uppercase">Placa</p><p class="text-white font-black text-sm">{{ driverData()?.plate }}</p></div>
                <div><p class="text-slate-500 text-[10px] uppercase">Tipo</p><p class="text-white text-sm">{{ driverData()?.vehicle_type }}</p></div>
                <div><p class="text-slate-500 text-[10px] uppercase">Marca</p><p class="text-white text-sm">{{ driverData()?.vehicle_brand }} {{ driverData()?.vehicle_model }}</p></div>
                <div><p class="text-slate-500 text-[10px] uppercase">Color</p><p class="text-white text-sm">{{ driverData()?.vehicle_color }}</p></div>
              </div>
            </div>
          }

          <!-- ── ESTADO ── -->
          @if (!loadingSection() && driverSection() === 'status') {
            <div class="flex flex-col items-center gap-6 pt-4">
              <!-- Toggle grande -->
              <div class="flex flex-col items-center gap-3">
                <button (click)="toggleOnline()"
                  [disabled]="togglingOnline()"
                  class="w-32 h-32 rounded-full flex flex-col items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-60"
                  [style]="driverOnline() ? 'background:linear-gradient(135deg,#10b981,#059669);box-shadow:0 0 40px rgba(16,185,129,0.4)' : 'background:rgba(255,255,255,0.05);border:2px solid rgba(255,255,255,0.1)'">
                  @if (togglingOnline()) {
                    <span class="material-symbols-outlined text-white animate-spin" style="font-size:36px">autorenew</span>
                  } @else {
                    <span class="material-symbols-outlined text-white" style="font-size:36px">{{ driverOnline() ? 'wifi_tethering' : 'wifi_off' }}</span>
                  }
                  <span class="text-white font-black text-sm">{{ driverOnline() ? 'En línea' : 'Fuera de línea' }}</span>
                </button>
                <p class="text-slate-500 text-xs text-center">Toca para {{ driverOnline() ? 'desconectarte' : 'conectarte' }}</p>
              </div>
              <div class="w-full rounded-2xl p-4 flex flex-col gap-2"
                [style]="driverOnline() ? 'background:rgba(16,185,129,0.06);border:1px solid rgba(16,185,129,0.15)' : 'background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08)'">
                <p class="font-bold text-sm" [class]="driverOnline() ? 'text-emerald-400' : 'text-slate-400'">
                  {{ driverOnline() ? 'Estás recibiendo solicitudes' : 'No recibes solicitudes' }}
                </p>
                <p class="text-slate-500 text-xs">Puedes conectarte y desconectarte sin penalizaciones en cualquier momento.</p>
              </div>
            </div>
          }

          <!-- ── GANANCIAS ── -->
          @if (!loadingSection() && driverSection() === 'earnings') {
            <!-- Balance total -->
            <div class="rounded-2xl p-5 flex flex-col gap-3"
              style="background:linear-gradient(135deg,rgba(16,185,129,0.12),rgba(5,150,105,0.08));border:1px solid rgba(16,185,129,0.2)">
              <div>
                <p class="text-slate-400 text-xs uppercase font-bold tracking-widest">Saldo disponible</p>
                <p class="text-white font-black text-4xl">{{ formatCOP(driverWalletBalance()) }}</p>
                <p class="text-slate-500 text-xs">Total ganado en viajes: {{ formatCOP(driverEarnings().total) }}</p>
              </div>
              <!-- Recargar saldo -->
              <div class="flex flex-col gap-3 pt-2" style="border-top:1px solid rgba(16,185,129,0.15)">
                <p class="text-slate-400 text-xs font-bold uppercase tracking-widest">Recargar saldo</p>
                <!-- Montos rápidos -->
                <div class="grid grid-cols-3 gap-2">
                  @for (amt of rechargePresets; track amt) {
                    <button (click)="rechargeAmount.set(amt)"
                      class="py-2.5 rounded-xl text-xs font-black transition-all active:scale-95"
                      [style]="rechargeAmount() === amt
                        ? 'background:linear-gradient(135deg,#10b981,#059669);color:#fff'
                        : 'background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);color:#94a3b8'">
                      {{ formatCOP(amt) }}
                    </button>
                  }
                </div>
                <!-- Monto personalizado -->
                <div class="flex items-center gap-2 rounded-xl px-3 py-2"
                  style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.1)">
                  <span class="text-slate-500 text-sm font-bold">$</span>
                  <input type="number" [(ngModel)]="rechargeCustom"
                    (input)="rechargeAmount.set(+rechargeCustom || 0)"
                    placeholder="Otro monto..."
                    class="flex-1 bg-transparent text-white text-sm outline-none placeholder-slate-600"/>
                  <span class="text-slate-600 text-xs">COP</span>
                </div>
                @if (rechargeError()) {
                  <p class="text-rose-400 text-xs">{{ rechargeError() }}</p>
                }
                <!-- Botón pagar -->
                <button (click)="startWalletRecharge()"
                  [disabled]="rechargeAmount() < 5000 || rechargeLoading()"
                  class="w-full py-3 rounded-xl font-black text-sm flex items-center justify-center gap-2 disabled:opacity-40 transition-all active:scale-[0.98]"
                  style="background:linear-gradient(135deg,#0f6fde,#1d4ed8);color:#fff">
                  @if (rechargeLoading()) {
                    <span class="material-symbols-outlined animate-spin" style="font-size:16px">autorenew</span> Abriendo pago...
                  } @else {
                    <span class="material-symbols-outlined" style="font-size:16px">credit_card</span>
                    Pagar {{ rechargeAmount() >= 5000 ? formatCOP(rechargeAmount()) : '' }} con ePayco
                  }
                </button>
                <p class="text-slate-600 text-[10px] text-center">Mínimo {{ formatCOP(5000) }} · Seguro con ePayco</p>
              </div>

              <!-- Retirar ganancias -->
              <div class="rounded-2xl p-4 flex flex-col gap-3"
                style="background:rgba(16,185,129,0.06);border:1px solid rgba(16,185,129,0.2)">
                <div class="flex items-center gap-2">
                  <span class="material-symbols-outlined text-emerald-400" style="font-size:18px">payments</span>
                  <p class="text-white font-black text-sm">Retirar ganancias</p>
                </div>
                <p class="text-slate-500 text-[11px]">Mínimo 20.000 COP. Recibes en 1-3 días hábiles.</p>
                <input type="number" [(ngModel)]="wdAmount" placeholder="Monto en COP" min="20000"
                  class="w-full px-3 py-2 rounded-lg text-white text-sm outline-none"
                  style="background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1)" />
                <select [(ngModel)]="wdMethod"
                  class="w-full px-3 py-2 rounded-lg text-white text-sm outline-none"
                  style="background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1)">
                  <option value="bank">Transferencia bancaria</option>
                  <option value="nequi">Nequi</option>
                  <option value="daviplata">Daviplata</option>
                  <option value="efectivo">Efectivo (oficina)</option>
                </select>
                <input type="text" [(ngModel)]="wdAccount" [placeholder]="wdPlaceholder()"
                  class="w-full px-3 py-2 rounded-lg text-white text-sm outline-none"
                  style="background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1)" />
                <button (click)="requestDriverWithdraw()" [disabled]="wdLoading() || (wdAmount ?? 0) < 20000"
                  class="w-full py-2.5 rounded-xl font-black text-xs uppercase disabled:opacity-40"
                  style="background:linear-gradient(135deg,#10b981,#059669);color:#fff">
                  {{ wdLoading() ? 'Procesando...' : 'Solicitar retiro' }}
                </button>
                @if (wdMsg()) { <p class="text-xs text-center" [class]="wdMsg()!.startsWith('Error') ? 'text-rose-400' : 'text-emerald-300'">{{ wdMsg() }}</p> }
                @if (driverWithdrawals().length > 0) {
                  <div class="pt-2 border-t border-white/10 space-y-1">
                    <p class="text-[10px] text-slate-500 uppercase tracking-wide">Solicitudes recientes</p>
                    @for (w of driverWithdrawals().slice(0, 5); track w.id) {
                      <div class="flex items-center justify-between text-[11px]">
                        <span class="text-slate-400">{{ w.created_at | date:'short' }}</span>
                        <span class="text-white">{{ formatCOP(w.amount) }}</span>
                        <span class="px-1.5 py-0.5 rounded text-[9px] font-bold"
                          [class]="w.status === 'completed' ? 'bg-emerald-500/20 text-emerald-400' : w.status === 'pending' ? 'bg-amber-500/20 text-amber-400' : 'bg-red-500/20 text-red-400'">{{ w.status }}</span>
                      </div>
                    }
                  </div>
                }
              </div>
            </div>
            <!-- Historial -->
            <p class="text-slate-400 text-xs font-bold uppercase tracking-widest px-1">Historial de movimientos</p>
            @if (driverEarnings().walletHistory.length === 0) {
              <div class="rounded-2xl flex flex-col items-center gap-2 py-10"
                style="background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.06)">
                <span class="material-symbols-outlined text-slate-600" style="font-size:36px">receipt_long</span>
                <p class="text-slate-500 text-sm">Sin movimientos aún</p>
              </div>
            }
            @for (tx of driverEarnings().walletHistory; track tx.id) {
              <div class="flex items-center gap-3 rounded-xl px-4 py-3"
                style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07)">
                <div class="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                  [style]="tx.type === 'recharge' ? 'background:rgba(16,185,129,0.1);border:1px solid rgba(16,185,129,0.2)' : 'background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.2)'">
                  <span class="material-symbols-outlined" style="font-size:16px"
                    [class]="tx.type === 'recharge' ? 'text-emerald-400' : 'text-rose-400'">
                    {{ tx.type === 'recharge' ? 'add_circle' : 'remove_circle' }}
                  </span>
                </div>
                <div class="flex-1 min-w-0">
                  <p class="text-slate-300 text-xs truncate">{{ tx.description }}</p>
                  <p class="text-slate-600 text-[10px]">{{ tx.created_at | slice:0:10 }}</p>
                </div>
                <p class="font-black text-sm flex-shrink-0"
                  [class]="tx.amount > 0 ? 'text-emerald-400' : 'text-rose-400'">
                  {{ tx.amount > 0 ? '+' : '' }}{{ formatCOP(tx.amount) }}
                </p>
              </div>
            }
          }

          <!-- ── MIS VIAJES ── -->
          @if (!loadingSection() && driverSection() === 'trips') {
            @if (driverCompletedTrips().length === 0) {
              <div class="flex flex-col items-center gap-3 py-16"
                style="background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.06);border-radius:16px">
                <span class="material-symbols-outlined text-slate-600" style="font-size:40px">directions_car</span>
                <p class="text-slate-500 text-sm">Aún no has completado viajes</p>
              </div>
            }
            @for (trip of driverCompletedTrips(); track trip.id) {
              <button (click)="openTripDetail(trip)"
                class="rounded-2xl p-4 flex flex-col gap-2 text-left w-full cursor-pointer hover:bg-white/5 transition-colors"
                style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08)">
                <div class="flex items-center justify-between">
                  <p class="text-white font-bold text-sm">{{ trip.ag_users?.full_name ?? 'Pasajero' }}</p>
                  <p class="text-emerald-400 font-black text-sm">{{ formatCOP(trip.ag_trip_offers?.offered_price ?? 0) }}</p>
                </div>
                <div class="flex items-center gap-2">
                  <span class="material-symbols-outlined text-slate-500" style="font-size:14px">place</span>
                  <p class="text-slate-400 text-xs truncate">→ {{ trip.dest_name }}</p>
                </div>
                <div class="flex items-center justify-between">
                  <p class="text-slate-600 text-[10px]">{{ trip.completed_at | slice:0:10 }}</p>
                  <span class="text-cyan-400 text-[10px] font-bold flex items-center gap-1">
                    Ver detalle <span class="material-symbols-outlined" style="font-size:12px">chevron_right</span>
                  </span>
                </div>
              </button>
            }
          }

          <!-- ── ANALYTICS ── -->
          @if (!loadingSection() && driverSection() === 'analytics') {
            <div class="flex flex-col gap-4">
              <div class="flex items-center gap-2 flex-wrap">
                @for (p of [7, 14, 30, 90]; track p) {
                  <button (click)="setAnalyticsPeriod(p)" class="px-3 py-1.5 rounded-lg text-xs font-bold"
                    [class]="analyticsPeriodDriver() === p ? 'bg-emerald-600 text-white' : 'bg-white/5 text-slate-400'">{{ p }}d</button>
                }
              </div>
              @if (driverAnalytics(); as a) {
                <div class="grid grid-cols-2 gap-3">
                  <div class="rounded-2xl p-4" style="background:rgba(16,185,129,0.08);border:1px solid rgba(16,185,129,0.2)">
                    <p class="text-[10px] text-emerald-400 uppercase tracking-wide">Ganado</p>
                    <p class="text-2xl font-black text-emerald-300 mt-1">{{ formatCOP(a.total_earned) }}</p>
                  </div>
                  <div class="rounded-2xl p-4" style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08)">
                    <p class="text-[10px] text-slate-400 uppercase">Viajes</p>
                    <p class="text-2xl font-black text-white mt-1">{{ a.completed_trips }}</p>
                  </div>
                  <div class="rounded-2xl p-4" style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08)">
                    <p class="text-[10px] text-slate-400 uppercase">Cancelados</p>
                    <p class="text-2xl font-black text-rose-300 mt-1">{{ a.cancelled_trips }}</p>
                  </div>
                  <div class="rounded-2xl p-4" style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08)">
                    <p class="text-[10px] text-slate-400 uppercase">Horas online</p>
                    <p class="text-2xl font-black text-cyan-300 mt-1">{{ a.online_hours }}h</p>
                  </div>
                  <div class="rounded-2xl p-4" style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08)">
                    <p class="text-[10px] text-slate-400 uppercase">Rating</p>
                    <p class="text-2xl font-black text-amber-300 mt-1">{{ a.avg_rating }} <span class="text-xs text-slate-500">({{ a.ratings_count }})</span></p>
                  </div>
                  <div class="rounded-2xl p-4" style="background:rgba(168,85,247,0.08);border:1px solid rgba(168,85,247,0.2)">
                    <p class="text-[10px] text-purple-400 uppercase">Nivel</p>
                    <p class="text-xl font-black text-purple-300 mt-1 uppercase">{{ a.level }}</p>
                  </div>
                </div>
                @if (driverDailyEarnings().length > 0) {
                  <div class="rounded-2xl p-4" style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08)">
                    <p class="text-[10px] text-slate-500 uppercase mb-2">Ganancias diarias</p>
                    <div class="flex items-end gap-1 h-24">
                      @for (d of driverDailyEarnings(); track d.day) {
                        <div class="flex-1 bg-emerald-500/70 rounded-t" [style.height.%]="dailyBarHeight(d.earnings)" [title]="d.day + ': ' + formatCOP(d.earnings)"></div>
                      }
                    </div>
                  </div>
                }
              }
            </div>
          }

          <!-- ── QUESTS ── -->
          @if (!loadingSection() && driverSection() === 'quests') {
            <div class="flex flex-col gap-3">
              <p class="text-slate-400 text-sm">Completa estas metas para ganar bonos extras.</p>
              @for (q of quests(); track q.id) {
                <div class="rounded-2xl p-4" style="background:rgba(168,85,247,0.08);border:1px solid rgba(168,85,247,0.2)">
                  <div class="flex items-center gap-2 mb-1">
                    <span class="material-symbols-outlined text-purple-400" style="font-size:22px">emoji_events</span>
                    <p class="text-white font-black text-sm flex-1">{{ q.title }}</p>
                    <span class="text-amber-400 font-black text-sm">+{{ formatCOP(q.reward_cop) }}</span>
                  </div>
                  <p class="text-slate-400 text-xs mb-2">{{ q.description }}</p>
                  <p class="text-[10px] text-slate-500">Expira: {{ q.valid_until | date:'shortDate' }} · {{ q.period }}</p>
                </div>
              }
              @if (quests().length === 0) {
                <p class="text-slate-500 text-center py-8">No hay metas activas</p>
              }
            </div>
          }

          <!-- ── MIS VEHÍCULOS ── -->
          @if (!loadingSection() && driverSection() === 'vehicles') {
            <div class="flex flex-col gap-3">
              @for (v of myVehicles(); track v.id) {
                <div class="rounded-2xl p-4" style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08)">
                  <div class="flex items-center gap-3">
                    <span class="material-symbols-outlined text-cyan-400" style="font-size:24px">{{ v.vehicle_type === 'moto' ? 'two_wheeler' : 'directions_car' }}</span>
                    <div class="flex-1 min-w-0">
                      <p class="text-white font-bold">{{ v.brand }} {{ v.model }}</p>
                      <p class="text-slate-500 text-xs">{{ v.plate }} · {{ v.color }} · {{ v.year }}</p>
                    </div>
                    @if (v.is_current) {
                      <span class="px-2 py-1 bg-emerald-500/20 text-emerald-400 text-[10px] font-black rounded-lg uppercase">Activo</span>
                    } @else {
                      <button (click)="switchVehicle(v.id)" class="px-2 py-1 bg-cyan-600 text-white text-[10px] font-bold rounded-lg">Usar</button>
                    }
                  </div>
                </div>
              }
              <button (click)="openAddVehicle()" class="py-3 rounded-xl text-white text-sm font-black"
                style="background:linear-gradient(135deg,#0891b2,#06b6d4)">+ Agregar vehículo</button>
              @if (addingVehicle()) {
                <div class="flex flex-col gap-2 rounded-2xl p-3" style="background:rgba(255,255,255,0.04)">
                  <div class="grid grid-cols-2 gap-2">
                    <select [(ngModel)]="newVehicle.vehicle_type" class="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm">
                      <option value="carro">Carro</option>
                      <option value="moto">Moto</option>
                      <option value="suv">SUV</option>
                      <option value="van">Van</option>
                      <option value="camion">Camión</option>
                    </select>
                    <input [(ngModel)]="newVehicle.plate" placeholder="Placa" class="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm uppercase" />
                    <input [(ngModel)]="newVehicle.brand" placeholder="Marca" class="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm" />
                    <input [(ngModel)]="newVehicle.model" placeholder="Modelo" class="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm" />
                    <input [(ngModel)]="newVehicle.color" placeholder="Color" class="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm" />
                    <input [(ngModel)]="newVehicle.year" type="number" placeholder="Año" class="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm" />
                  </div>
                  <button (click)="saveNewVehicle()" class="py-2 bg-emerald-600 text-white text-xs font-bold rounded-lg">Guardar</button>
                </div>
              }
            </div>
          }

          <!-- ── BLACKLIST ── -->
          @if (!loadingSection() && driverSection() === 'blacklist') {
            <div class="flex flex-col gap-2">
              <p class="text-slate-400 text-sm">Pasajeros con los que prefieres no volver a viajar.</p>
              @for (b of blacklist(); track b.id) {
                <div class="flex items-center justify-between rounded-xl p-3" style="background:rgba(239,68,68,0.06);border:1px solid rgba(239,68,68,0.2)">
                  <div>
                    <p class="text-white text-xs font-mono">{{ b.passenger_user_id.slice(0, 8) }}...</p>
                    @if (b.reason) { <p class="text-slate-400 text-[10px]">{{ b.reason }}</p> }
                  </div>
                  <button (click)="removeFromBlacklist(b.id)" class="text-emerald-400 text-xs">Desbloquear</button>
                </div>
              }
              @if (blacklist().length === 0) {
                <p class="text-slate-500 text-center py-8">Sin pasajeros bloqueados</p>
              }
            </div>
          }

          <!-- ── TUTORIAL ── -->
          @if (!loadingSection() && driverSection() === 'tutorial') {
            <div class="flex flex-col gap-4">
              @for (t of tutorialSteps; track t.title) {
                <div class="rounded-2xl p-4" style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08)">
                  <div class="flex items-center gap-2 mb-2">
                    <span class="material-symbols-outlined text-cyan-400" style="font-size:22px">{{ t.icon }}</span>
                    <p class="text-white font-black">{{ t.title }}</p>
                  </div>
                  <p class="text-slate-300 text-sm">{{ t.body }}</p>
                </div>
              }
              @if (!tutorialDone()) {
                <button (click)="completeTutorial()" class="py-3 rounded-xl text-white text-sm font-black"
                  style="background:linear-gradient(135deg,#16a34a,#059669)">He leído todo · Completar</button>
              } @else {
                <p class="text-emerald-400 text-sm text-center">✓ Tutorial completado</p>
              }
            </div>
          }

          <!-- ── PREFERENCIAS ── -->
          @if (!loadingSection() && driverSection() === 'preferences') {
            <div class="flex flex-col gap-4">
              <!-- Distancia máxima -->
              <div class="rounded-2xl p-4 flex flex-col gap-3"
                style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08)">
                <div class="flex items-center justify-between">
                  <p class="text-white font-bold text-sm">Distancia máxima</p>
                  <p class="text-cyan-400 font-black text-sm">{{ driverPrefs().maxDistance }} km</p>
                </div>
                <input type="range" min="5" max="50" step="5"
                  [value]="driverPrefs().maxDistance"
                  (input)="setMaxDistance(+$any($event.target).value)"
                  class="w-full" style="accent-color:#0891b2"/>
                <div class="flex justify-between text-[10px] text-slate-600">
                  <span>5 km</span><span>25 km</span><span>50 km</span>
                </div>
              </div>
              <!-- Opciones extra -->
              <div class="rounded-2xl p-4 flex flex-col gap-3"
                style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08)">
                <p class="text-slate-400 text-xs font-bold uppercase tracking-widest">Opciones extra</p>
                @for (opt of prefOptions; track opt.key) {
                  <div class="flex items-center justify-between py-1">
                    <div class="flex items-center gap-3">
                      <span class="material-symbols-outlined text-slate-400" style="font-size:18px">{{ opt.icon }}</span>
                      <p class="text-slate-300 text-sm">{{ opt.label }}</p>
                    </div>
                    <button (click)="togglePref(opt.key)"
                      class="w-12 h-6 rounded-full flex items-center px-0.5 transition-all"
                      [style]="getPrefValue(opt.key) ? 'background:#0891b2' : 'background:rgba(255,255,255,0.1)'">
                      <div class="w-5 h-5 rounded-full bg-white transition-all"
                        [style]="getPrefValue(opt.key) ? 'margin-left:auto' : 'margin-left:0'"></div>
                    </button>
                  </div>
                }
              </div>
              <button (click)="savePreferences()"
                [disabled]="savingPrefs()"
                class="w-full py-3 rounded-xl text-white font-black text-sm flex items-center justify-center gap-2 disabled:opacity-50"
                style="background:linear-gradient(135deg,#0891b2,#0e7490)">
                @if (savingPrefs()) {
                  <span class="material-symbols-outlined animate-spin" style="font-size:16px">autorenew</span>
                } @else {
                  <span class="material-symbols-outlined" style="font-size:16px">save</span>
                }
                Guardar preferencias
              </button>
            </div>
          }

          <!-- ── SEGURIDAD ── -->
          @if (!loadingSection() && driverSection() === 'security') {
            <div class="flex flex-col gap-4">
              <!-- Pánico -->
              <button (click)="activatePanic()"
                class="w-full py-6 rounded-2xl flex flex-col items-center gap-2 transition-all active:scale-[0.98]"
                [style]="panicActivated() ? 'background:rgba(239,68,68,0.2);border:2px solid #ef4444' : 'background:rgba(239,68,68,0.08);border:2px solid rgba(239,68,68,0.3)'">
                <span class="material-symbols-outlined text-rose-400" style="font-size:40px">emergency</span>
                <p class="text-rose-400 font-black text-base">{{ panicActivated() ? '¡Alerta enviada!' : 'Botón de pánico' }}</p>
                <p class="text-slate-500 text-xs">{{ panicActivated() ? 'Se notificó a tus contactos de emergencia' : 'Toca para alertar a tus contactos' }}</p>
              </button>
              <!-- Contactos de confianza -->
              <div class="rounded-2xl p-4 flex flex-col gap-3"
                style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08)">
                <p class="text-slate-400 text-xs font-bold uppercase tracking-widest">Contactos de confianza</p>
                @for (c of emergencyContacts(); track c.phone) {
                  <div class="flex items-center gap-3">
                    <span class="material-symbols-outlined text-slate-500" style="font-size:18px">person</span>
                    <div class="flex-1">
                      <p class="text-white text-sm font-bold">{{ c.name }}</p>
                      <p class="text-slate-500 text-xs">{{ c.phone }}</p>
                    </div>
                    <button (click)="removeEmergencyContact(c.phone)"
                      class="text-slate-600 active:text-rose-400">
                      <span class="material-symbols-outlined" style="font-size:18px">delete</span>
                    </button>
                  </div>
                }
                <div class="flex gap-2">
                  <input [(ngModel)]="newContactName" placeholder="Nombre"
                    class="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white text-xs focus:outline-none focus:border-cyan-500/50"/>
                  <input [(ngModel)]="newContactPhone" placeholder="Teléfono"
                    class="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white text-xs focus:outline-none focus:border-cyan-500/50"/>
                  <button (click)="addEmergencyContact()"
                    class="px-3 rounded-xl text-white font-black text-xs"
                    style="background:rgba(8,145,178,0.2);border:1px solid rgba(8,145,178,0.3)">
                    <span class="material-symbols-outlined" style="font-size:18px">add</span>
                  </button>
                </div>
              </div>
              <!-- Reportar incidente -->
              <div class="rounded-2xl p-4 flex flex-col gap-3"
                style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08)">
                <p class="text-slate-400 text-xs font-bold uppercase tracking-widest">Reportar incidente</p>
                <textarea [(ngModel)]="reportIncidentText" placeholder="Describe el incidente..." rows="3"
                  class="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white text-xs resize-none focus:outline-none focus:border-rose-500/50"></textarea>
                <button (click)="submitReport('incident')"
                  class="w-full py-2.5 rounded-xl text-white text-xs font-black"
                  style="background:rgba(239,68,68,0.15);border:1px solid rgba(239,68,68,0.25)">
                  Enviar reporte
                </button>
              </div>
            </div>
          }

          <!-- ── SOPORTE ── -->
          @if (!loadingSection() && driverSection() === 'support') {
            <div class="flex flex-col gap-4">
              <!-- Contacto directo -->
              <a href="https://wa.me/573000000000" target="_blank"
                class="w-full py-4 rounded-2xl flex items-center justify-center gap-3"
                style="background:linear-gradient(135deg,rgba(37,211,102,0.12),rgba(18,140,126,0.08));border:1px solid rgba(37,211,102,0.25)">
                <span class="material-symbols-outlined text-emerald-400" style="font-size:24px">chat</span>
                <div class="text-left">
                  <p class="text-white font-black text-sm">Chat con soporte 24/7</p>
                  <p class="text-slate-400 text-xs">Respuesta en menos de 5 minutos</p>
                </div>
              </a>
              <!-- FAQ -->
              <p class="text-slate-400 text-xs font-bold uppercase tracking-widest px-1">Preguntas frecuentes</p>
              @for (faq of faqItems; track faq.q) {
                <div class="rounded-2xl overflow-hidden"
                  style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08)">
                  <button (click)="toggleFaq(faq.q)"
                    class="w-full flex items-center justify-between px-4 py-3 text-left">
                    <p class="text-white text-sm font-bold">{{ faq.q }}</p>
                    <span class="material-symbols-outlined text-slate-500 flex-shrink-0" style="font-size:18px">
                      {{ openFaq() === faq.q ? 'expand_less' : 'expand_more' }}
                    </span>
                  </button>
                  @if (openFaq() === faq.q) {
                    <div class="px-4 pb-3">
                      <p class="text-slate-400 text-xs leading-relaxed">{{ faq.a }}</p>
                    </div>
                  }
                </div>
              }
              <!-- Reportar pasajero -->
              <div class="rounded-2xl p-4 flex flex-col gap-3"
                style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08)">
                <p class="text-slate-400 text-xs font-bold uppercase tracking-widest">Reportar problema con pasajero</p>
                <textarea [(ngModel)]="reportPassengerText" placeholder="Describe el problema..." rows="3"
                  class="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white text-xs resize-none focus:outline-none focus:border-amber-500/50"></textarea>
                <button (click)="submitReport('passenger')"
                  class="w-full py-2.5 rounded-xl text-amber-400 text-xs font-black"
                  style="background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.2)">
                  Enviar reporte
                </button>
              </div>
            </div>
          }

          <!-- ── CONFIGURACIÓN ── -->
          @if (!loadingSection() && driverSection() === 'settings') {
            <div class="flex flex-col gap-4">
              <div class="rounded-2xl p-4 flex flex-col gap-4"
                style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08)">
                <p class="text-slate-400 text-xs font-bold uppercase tracking-widest">Notificaciones</p>
                @for (opt of settingOptions; track opt.key) {
                  <div class="flex items-center justify-between">
                    <div class="flex items-center gap-3">
                      <span class="material-symbols-outlined text-slate-400" style="font-size:18px">{{ opt.icon }}</span>
                      <p class="text-slate-300 text-sm">{{ opt.label }}</p>
                    </div>
                    <button (click)="toggleSetting(opt.key)"
                      class="w-12 h-6 rounded-full flex items-center px-0.5 transition-all"
                      [style]="getSettingValue(opt.key) ? 'background:#0891b2' : 'background:rgba(255,255,255,0.1)'">
                      <div class="w-5 h-5 rounded-full bg-white transition-all"
                        [style]="getSettingValue(opt.key) ? 'margin-left:auto' : 'margin-left:0'"></div>
                    </button>
                  </div>
                }
              </div>
              <div class="rounded-2xl p-4 flex flex-col gap-4"
                style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08)">
                <p class="text-slate-400 text-xs font-bold uppercase tracking-widest">Privacidad</p>
                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-3">
                    <span class="material-symbols-outlined text-slate-400" style="font-size:18px">phone_locked</span>
                    <div>
                      <p class="text-slate-300 text-sm">Ocultar número</p>
                      <p class="text-slate-600 text-[10px]">El pasajero no verá tu número</p>
                    </div>
                  </div>
                  <button (click)="toggleSetting('hidePhone')"
                    class="w-12 h-6 rounded-full flex items-center px-0.5 transition-all"
                    [style]="driverSettings().hidePhone ? 'background:#0891b2' : 'background:rgba(255,255,255,0.1)'">
                    <div class="w-5 h-5 rounded-full bg-white transition-all"
                      [style]="driverSettings().hidePhone ? 'margin-left:auto' : 'margin-left:0'"></div>
                  </button>
                </div>
              </div>
              <!-- T&C -->
              <button class="flex items-center gap-3 px-4 py-3 rounded-2xl w-full text-left"
                style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08)">
                <span class="material-symbols-outlined text-slate-400" style="font-size:18px">description</span>
                <p class="text-slate-300 text-sm">Términos y condiciones</p>
                <span class="material-symbols-outlined text-slate-600 ml-auto" style="font-size:16px">chevron_right</span>
              </button>
              <button (click)="saveSettings()"
                [disabled]="savingSettings()"
                class="w-full py-3 rounded-xl text-white font-black text-sm flex items-center justify-center gap-2 disabled:opacity-50"
                style="background:linear-gradient(135deg,#0891b2,#0e7490)">
                @if (savingSettings()) {
                  <span class="material-symbols-outlined animate-spin" style="font-size:16px">autorenew</span>
                } @else {
                  <span class="material-symbols-outlined" style="font-size:16px">save</span>
                }
                Guardar configuración
              </button>
            </div>
          }

          <!-- ── RECOMIENDA Y GANA (Conductor) ── -->
          @if (!loadingSection() && driverSection() === 'referrals') {
            <div class="flex flex-col gap-4">

              <!-- Billetera de retiro -->
              <div class="rounded-2xl p-4 flex flex-col gap-2"
                style="background:linear-gradient(135deg,#6C3AED,#2563EB);border:1px solid rgba(255,255,255,0.2)">
                <p class="text-white/70 text-xs font-bold uppercase tracking-widest">Billetera de retiro</p>
                <p class="text-white font-black text-2xl">{{ '$' + referralBalance().toLocaleString() }}</p>
                <div class="flex items-center gap-4 mt-1">
                  <div class="flex items-center gap-1">
                    <span class="material-symbols-outlined text-emerald-300" style="font-size:14px">trending_up</span>
                    <span class="text-emerald-300 text-xs font-bold">Total: {{ '$' + referralTotalEarned().toLocaleString() }}</span>
                  </div>
                  <div class="flex items-center gap-1">
                    <span class="material-symbols-outlined text-amber-300" style="font-size:14px">group</span>
                    <span class="text-amber-300 text-xs font-bold">{{ referralCount() }} invitados</span>
                  </div>
                </div>
              </div>

              <div class="rounded-2xl p-4 flex flex-col gap-3"
                style="background:linear-gradient(135deg,rgba(108,58,237,0.15),rgba(37,99,235,0.15));border:1px solid rgba(108,58,237,0.3)">
                <p class="text-white font-black text-base">Gana el 2% vitalicio</p>
                <p class="text-slate-300 text-xs sm:text-sm leading-relaxed">
                  Cada vez que alguien se registre en <span class="text-white font-bold">Movi</span> con tu link y use nuestro servicio,
                  tú ganas el <span class="text-amber-400 font-black">2% del valor de cada servicio</span> de por vida.
                </p>
              </div>

              <!-- Link de referido -->
              <div class="rounded-2xl p-4 flex flex-col gap-3"
                style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.1)">
                <p class="text-slate-400 text-xs font-bold uppercase tracking-widest">Tu link de invitación</p>
                <div class="flex items-center gap-2">
                  <div class="flex-1 rounded-xl px-3 py-2.5 text-xs text-white font-mono truncate"
                    style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1)">
                    {{ agReferralLink() }}
                  </div>
                  <button (click)="copyReferralLink()"
                    class="px-4 py-2.5 rounded-xl text-xs font-black text-black flex items-center gap-1 active:scale-95 transition-transform flex-shrink-0"
                    style="background:linear-gradient(135deg,#f59e0b,#d97706)">
                    <span class="material-symbols-outlined" style="font-size:16px">content_copy</span>
                    {{ referralCopied() ? '¡Copiado!' : 'Copiar' }}
                  </button>
                </div>
              </div>

              <!-- Historial de comisiones -->
              @if (referralTransactions().length > 0) {
                <p class="text-slate-400 text-xs font-bold uppercase tracking-widest">Historial de comisiones</p>
                <div class="flex flex-col gap-2">
                  @for (tx of referralTransactions(); track tx.id) {
                    <div class="flex items-center justify-between rounded-xl px-3 py-2.5"
                      style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.06)">
                      <div class="flex-1 min-w-0">
                        <p class="text-white text-xs font-bold truncate">{{ tx.description }}</p>
                        <p class="text-slate-500 text-[10px]">{{ tx.created_at?.slice(0,10) }}</p>
                      </div>
                      <span class="text-emerald-400 font-black text-sm flex-shrink-0 ml-2">{{ '+$' + tx.commission_amount?.toLocaleString() }}</span>
                    </div>
                  }
                </div>
              }

              <!-- Cómo funciona -->
              <p class="text-slate-400 text-xs font-bold uppercase tracking-widest">¿Cómo funciona?</p>
              <div class="flex flex-col gap-2">
                <div class="flex items-start gap-3 rounded-xl p-3" style="background:rgba(255,255,255,0.04)">
                  <div class="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0" style="background:rgba(108,58,237,0.2)">
                    <span class="text-purple-400 font-black text-xs">1</span>
                  </div>
                  <p class="text-slate-300 text-xs leading-relaxed">Comparte tu link con amigos, familiares o en redes sociales</p>
                </div>
                <div class="flex items-start gap-3 rounded-xl p-3" style="background:rgba(255,255,255,0.04)">
                  <div class="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0" style="background:rgba(108,58,237,0.2)">
                    <span class="text-purple-400 font-black text-xs">2</span>
                  </div>
                  <p class="text-slate-300 text-xs leading-relaxed">Ellos se registran como pasajero o conductor usando tu link</p>
                </div>
                <div class="flex items-start gap-3 rounded-xl p-3" style="background:rgba(255,255,255,0.04)">
                  <div class="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0" style="background:rgba(245,158,11,0.2)">
                    <span class="text-amber-400 font-black text-xs">3</span>
                  </div>
                  <p class="text-slate-300 text-xs leading-relaxed">Cada vez que usen Movi, tú ganas el <span class="text-amber-400 font-bold">2% del valor del servicio</span> en tu billetera de retiro</p>
                </div>
              </div>
            </div>
          }

          <!-- ── MIS DOCUMENTOS ── -->
          @if (!loadingSection() && driverSection() === 'documents') {
            <div class="flex flex-col gap-3">
              <p class="text-slate-400 text-xs leading-relaxed">
                Mantén tus documentos al día. Si se vencen, tu cuenta quedará suspendida hasta renovarlos. Sube imagen clara, legible y sin recortes.
              </p>

              @for (dt of docTypes; track dt.key) {
                <div class="rounded-2xl p-4 flex flex-col gap-3"
                  style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08)">
                  <div class="flex items-center justify-between">
                    <div class="flex items-center gap-2">
                      <span class="material-symbols-outlined text-cyan-400" style="font-size:20px">{{ dt.icon }}</span>
                      <span class="text-white font-black text-sm">{{ dt.label }}</span>
                    </div>
                    @if (getDocByType(dt.key); as doc) {
                      <span class="text-xs font-bold" [class]="docStatusColor(doc.status)">{{ docStatusLabel(doc.status) }}</span>
                    } @else {
                      <span class="text-xs font-bold text-slate-500">Sin subir</span>
                    }
                  </div>

                  @if (getDocByType(dt.key); as doc) {
                    <div class="flex items-center gap-3">
                      <a [href]="doc.file_url" target="_blank" rel="noopener"
                        class="w-16 h-16 rounded-xl flex-shrink-0 overflow-hidden flex items-center justify-center"
                        style="background:rgba(8,145,178,0.15);border:1px solid rgba(8,145,178,0.3)">
                        <span class="material-symbols-outlined text-cyan-400" style="font-size:24px">visibility</span>
                      </a>
                      <div class="flex-1 text-xs text-slate-300 space-y-1">
                        @if (doc.number) { <p><span class="text-slate-500">N°:</span> {{ doc.number }}</p> }
                        @if (doc.expires_at) {
                          <p>
                            <span class="text-slate-500">Vence:</span>
                            <span [class.text-yellow-400]="docIsExpiringSoon(doc)" [class.font-bold]="docIsExpiringSoon(doc)">
                              {{ doc.expires_at }}
                            </span>
                          </p>
                        }
                        @if (doc.status === 'rejected' && doc.rejection_reason) {
                          <p class="text-red-400">⚠ {{ doc.rejection_reason }}</p>
                        }
                      </div>
                    </div>
                  }

                  @if (dt.requiresExpiry) {
                    <input type="date" [value]="docExpiryInput[dt.key] || (getDocByType(dt.key)?.expires_at || '')"
                      (change)="onDocExpiryChange(dt.key, $any($event.target).value)"
                      class="w-full px-3 py-2 rounded-lg text-white text-xs"
                      style="background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1)" />
                  }
                  <input type="text" placeholder="Número (opcional)"
                    [value]="docNumberInput[dt.key] || (getDocByType(dt.key)?.number || '')"
                    (input)="onDocNumberChange(dt.key, $any($event.target).value)"
                    class="w-full px-3 py-2 rounded-lg text-white text-xs"
                    style="background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1)" />

                  <label class="w-full py-2.5 rounded-xl text-white font-bold text-xs flex items-center justify-center gap-2 cursor-pointer"
                    style="background:linear-gradient(135deg,#0891b2,#0e7490)"
                    [class.opacity-50]="uploadingDoc() === dt.key">
                    @if (uploadingDoc() === dt.key) {
                      <span class="material-symbols-outlined animate-spin" style="font-size:14px">autorenew</span>
                      Subiendo...
                    } @else {
                      <span class="material-symbols-outlined" style="font-size:14px">upload</span>
                      {{ getDocByType(dt.key) ? 'Reemplazar' : 'Subir archivo' }}
                    }
                    <input type="file" accept="image/*,application/pdf" class="hidden"
                      [disabled]="uploadingDoc() !== null"
                      (change)="onUploadDoc(dt.key, $event)" />
                  </label>
                </div>
              }
            </div>
          }

          <!-- ── RENDIMIENTO (aceptación / cancelación) ── -->
          @if (!loadingSection() && driverSection() === 'performance') {
            <div class="flex flex-col gap-4">
              @if (driverMetrics(); as m) {
                <!-- KPIs principales -->
                <div class="grid grid-cols-1 gap-3">
                  <div class="rounded-2xl p-4" style="background:linear-gradient(135deg,rgba(16,185,129,0.15),rgba(16,185,129,0.05));border:1px solid rgba(16,185,129,0.3)">
                    <p class="text-emerald-300/80 text-xs font-bold uppercase tracking-widest mb-1">Tasa de aceptación</p>
                    <p class="text-4xl font-black" [class]="metricColor(m.acceptance_rate, 'positive')">{{ m.acceptance_rate }}%</p>
                    <p class="text-slate-400 text-xs mt-1">{{ m.offers_made }} ofertas hechas de {{ m.offers_seen }} vistas</p>
                  </div>
                  <div class="rounded-2xl p-4" style="background:linear-gradient(135deg,rgba(239,68,68,0.12),rgba(239,68,68,0.03));border:1px solid rgba(239,68,68,0.3)">
                    <p class="text-red-300/80 text-xs font-bold uppercase tracking-widest mb-1">Tasa de cancelación</p>
                    <p class="text-4xl font-black" [class]="metricColor(m.cancellation_rate, 'negative')">{{ m.cancellation_rate }}%</p>
                    <p class="text-slate-400 text-xs mt-1">{{ m.trips_cancelled }} cancelados de {{ m.trips_accepted }} aceptados</p>
                  </div>
                  <div class="rounded-2xl p-4" style="background:linear-gradient(135deg,rgba(8,145,178,0.15),rgba(8,145,178,0.05));border:1px solid rgba(8,145,178,0.3)">
                    <p class="text-cyan-300/80 text-xs font-bold uppercase tracking-widest mb-1">Tasa de finalización</p>
                    <p class="text-4xl font-black" [class]="metricColor(m.completion_rate, 'positive')">{{ m.completion_rate }}%</p>
                    <p class="text-slate-400 text-xs mt-1">{{ m.trips_completed }} completados de {{ m.trips_accepted }}</p>
                  </div>
                </div>

                <!-- Guía -->
                <div class="rounded-2xl p-4" style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08)">
                  <p class="text-white font-bold text-sm mb-2">💡 ¿Cómo mejorar?</p>
                  <ul class="text-slate-300 text-xs leading-relaxed space-y-1 list-disc list-inside">
                    <li>Acepta más viajes para subir tu <span class="text-emerald-400">tasa de aceptación</span>.</li>
                    <li>Evita cancelar viajes aceptados. Si algo pasa, contacta al pasajero por chat primero.</li>
                    <li>Una tasa superior al 90% te da prioridad en solicitudes y promos.</li>
                  </ul>
                </div>

                <p class="text-slate-500 text-xs text-center">Métricas desde {{ m.window_start | date:'dd MMM yyyy' }}</p>
              } @else {
                <p class="text-slate-500 text-center py-6 text-sm">Aún no tienes datos suficientes.</p>
              }
            </div>
          }

          <!-- ── AUTO-ACEPTAR ── -->
          @if (!loadingSection() && driverSection() === 'autoaccept') {
            <div class="flex flex-col gap-4">
              <p class="text-slate-400 text-xs leading-relaxed">
                Cuando está activado, Movi aceptará automáticamente viajes que cumplan tus condiciones mínimas mientras estás en línea.
              </p>

              <!-- Toggle -->
              <div class="rounded-2xl p-4 flex items-center justify-between"
                style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08)">
                <div class="flex items-center gap-2">
                  <span class="material-symbols-outlined text-cyan-400" style="font-size:20px">auto_mode</span>
                  <span class="text-white font-bold text-sm">Activar auto-aceptar</span>
                </div>
                <button (click)="toggleAutoAcceptEnabled()"
                  class="w-12 h-6 rounded-full transition-colors"
                  [style.background]="autoAcceptCfg().enabled ? '#10b981' : 'rgba(255,255,255,0.15)'">
                  <div class="w-5 h-5 rounded-full bg-white transition-transform"
                    [style.transform]="autoAcceptCfg().enabled ? 'translateX(26px)' : 'translateX(2px)'"></div>
                </button>
              </div>

              <!-- Min price -->
              <div class="rounded-2xl p-4" style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08)">
                <div class="flex items-center justify-between mb-2">
                  <span class="text-white font-bold text-sm">Precio mínimo</span>
                  <span class="text-cyan-400 font-black text-sm">{{ '$' + autoAcceptCfg().minPrice.toLocaleString('es-CO') }}</span>
                </div>
                <input type="range" min="5000" max="50000" step="1000"
                  [value]="autoAcceptCfg().minPrice"
                  (input)="setAutoAcceptMinPrice(+$any($event.target).value)"
                  class="w-full accent-cyan-400" />
                <p class="text-slate-500 text-xs mt-1">Solo aceptará viajes iguales o mayores a este precio</p>
              </div>

              <!-- Max distance -->
              <div class="rounded-2xl p-4" style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08)">
                <div class="flex items-center justify-between mb-2">
                  <span class="text-white font-bold text-sm">Distancia máxima al pasajero</span>
                  <span class="text-cyan-400 font-black text-sm">{{ autoAcceptCfg().maxDistance }} km</span>
                </div>
                <input type="range" min="1" max="20" step="1"
                  [value]="autoAcceptCfg().maxDistance"
                  (input)="setAutoAcceptMaxDistance(+$any($event.target).value)"
                  class="w-full accent-cyan-400" />
                <p class="text-slate-500 text-xs mt-1">Solo aceptará si estás dentro de este radio del punto de recogida</p>
              </div>

              <button (click)="saveAutoAccept()" [disabled]="savingAutoAccept()"
                class="w-full py-3 rounded-xl text-white font-black text-sm flex items-center justify-center gap-2 disabled:opacity-50"
                style="background:linear-gradient(135deg,#0891b2,#0e7490)">
                @if (savingAutoAccept()) {
                  <span class="material-symbols-outlined animate-spin" style="font-size:16px">autorenew</span>
                } @else {
                  <span class="material-symbols-outlined" style="font-size:16px">save</span>
                }
                Guardar configuración
              </button>
            </div>
          }

          <!-- ── OBJETOS OLVIDADOS ── -->
          @if (!loadingSection() && driverSection() === 'lost') {
            <div class="flex flex-col gap-3">
              <p class="text-slate-400 text-xs leading-relaxed">
                Reporta objetos que los pasajeros hayan olvidado en tu vehículo para que puedan recuperarlos.
              </p>

              <!-- Formulario nuevo -->
              @if (newLostTripId()) {
                <div class="rounded-2xl p-4 flex flex-col gap-3"
                  style="background:rgba(16,185,129,0.08);border:1px solid rgba(16,185,129,0.3)">
                  <p class="text-white font-bold text-sm">Reportar objeto olvidado</p>
                  <textarea [(ngModel)]="newLostDesc" maxlength="300" rows="3"
                    placeholder="Ej: Billetera de cuero negra con documentos"
                    class="w-full px-3 py-2 rounded-lg text-white text-sm"
                    style="background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.1)"></textarea>
                  <label class="w-full py-2 rounded-lg text-white font-bold text-xs flex items-center justify-center gap-2 cursor-pointer"
                    style="background:rgba(255,255,255,0.05);border:1px dashed rgba(255,255,255,0.2)">
                    <span class="material-symbols-outlined" style="font-size:14px">camera_alt</span>
                    {{ newLostPhoto ? newLostPhoto.name : 'Agregar foto (opcional)' }}
                    <input type="file" accept="image/*" class="hidden" (change)="onLostPhotoChange($event)" />
                  </label>
                  <div class="flex gap-2">
                    <button (click)="newLostTripId.set(null)"
                      class="flex-1 py-2 rounded-xl text-slate-300 font-bold text-xs"
                      style="background:rgba(255,255,255,0.05)">Cancelar</button>
                    <button (click)="submitLostItem()" [disabled]="submittingLost() || !newLostDesc.trim()"
                      class="flex-1 py-2 rounded-xl text-white font-black text-xs disabled:opacity-50"
                      style="background:linear-gradient(135deg,#10b981,#059669)">
                      @if (submittingLost()) { Enviando... } @else { Reportar }
                    </button>
                  </div>
                </div>
              }

              <!-- Botón disparador por viaje completado -->
              @if (!newLostTripId() && driverCompletedTrips().length > 0) {
                <div class="rounded-2xl p-3 flex flex-col gap-2"
                  style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08)">
                  <p class="text-white text-xs font-bold">Reportar sobre un viaje reciente:</p>
                  @for (t of driverCompletedTrips().slice(0, 5); track t.id) {
                    <button (click)="openReportLost(t.ag_trip_requests?.id ?? t.trip_request_id)"
                      class="flex items-center justify-between py-2 px-3 rounded-lg text-left"
                      style="background:rgba(255,255,255,0.03)">
                      <div class="flex-1 min-w-0">
                        <p class="text-white text-xs font-bold truncate">{{ t.ag_trip_requests?.ag_users?.full_name ?? 'Pasajero' }}</p>
                        <p class="text-slate-500 text-[10px] truncate">{{ t.ag_trip_requests?.dest_name ?? '-' }}</p>
                      </div>
                      <span class="material-symbols-outlined text-cyan-400" style="font-size:18px">add_circle</span>
                    </button>
                  }
                </div>
              }

              <!-- Lista de reportes -->
              @if (lostItems().length === 0) {
                <p class="text-slate-500 text-center py-6 text-sm">No has reportado objetos olvidados.</p>
              } @else {
                @for (item of lostItems(); track item.id) {
                  <div class="rounded-2xl p-4 flex flex-col gap-2"
                    style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08)">
                    <div class="flex items-start gap-3">
                      @if (item.photo_url) {
                        <img [src]="item.photo_url" class="w-16 h-16 rounded-xl object-cover" />
                      }
                      <div class="flex-1 min-w-0">
                        <p class="text-white text-sm font-bold">{{ item.ag_users?.full_name ?? 'Pasajero' }}</p>
                        <p class="text-slate-300 text-xs mt-1">{{ item.description }}</p>
                        <p class="text-slate-500 text-[10px] mt-1">{{ item.created_at | date:'dd MMM HH:mm' }}</p>
                      </div>
                      <span class="text-[10px] font-bold uppercase"
                        [class.text-yellow-400]="item.status === 'reported'"
                        [class.text-cyan-400]="item.status === 'contacted'"
                        [class.text-green-400]="item.status === 'returned'"
                        [class.text-slate-500]="item.status === 'closed'">
                        {{ item.status === 'reported' ? 'Reportado' : item.status === 'contacted' ? 'En contacto' : item.status === 'returned' ? 'Devuelto' : 'Cerrado' }}
                      </span>
                    </div>
                    <div class="flex gap-2">
                      @if (item.ag_users?.phone) {
                        <a [href]="'tel:' + item.ag_users.phone"
                          class="flex-1 py-1.5 rounded-lg text-white text-xs font-bold text-center"
                          style="background:rgba(16,185,129,0.2);border:1px solid rgba(16,185,129,0.3)">
                          📞 Llamar
                        </a>
                      }
                      @if (item.status !== 'returned' && item.status !== 'closed') {
                        <button (click)="changeLostStatus(item.id, 'returned')"
                          class="flex-1 py-1.5 rounded-lg text-white text-xs font-bold"
                          style="background:rgba(8,145,178,0.2);border:1px solid rgba(8,145,178,0.3)">
                          Marcar devuelto
                        </button>
                      }
                      @if (item.status === 'reported') {
                        <button (click)="changeLostStatus(item.id, 'contacted')"
                          class="flex-1 py-1.5 rounded-lg text-white text-xs font-bold"
                          style="background:rgba(245,158,11,0.2);border:1px solid rgba(245,158,11,0.3)">
                          En contacto
                        </button>
                      }
                    </div>
                  </div>
                }
              }
            </div>
          }

          <!-- ── VIAJES PROGRAMADOS ── -->
          @if (!loadingSection() && driverSection() === 'scheduled') {
            <div class="flex flex-col gap-4">
              <!-- Mis reservas -->
              <div>
                <p class="text-white font-black text-sm mb-2">Mis reservas</p>
                @if (myScheduledTrips().length === 0) {
                  <p class="text-slate-500 text-xs text-center py-4">No tienes viajes reservados.</p>
                } @else {
                  <div class="flex flex-col gap-2">
                    @for (st of myScheduledTrips(); track st.id) {
                      <div class="rounded-2xl p-4 flex flex-col gap-2"
                        style="background:linear-gradient(135deg,rgba(8,145,178,0.1),rgba(8,145,178,0.03));border:1px solid rgba(8,145,178,0.3)">
                        <div class="flex items-center justify-between">
                          <div class="flex items-center gap-2">
                            <span class="material-symbols-outlined text-cyan-400" style="font-size:18px">event</span>
                            <span class="text-white font-bold text-sm">{{ st.scheduled_for | date:'dd MMM HH:mm' }}</span>
                          </div>
                          <span class="text-emerald-400 font-black text-sm">{{ '$' + (st.estimated_price ?? 0).toLocaleString('es-CO') }}</span>
                        </div>
                        <div class="text-slate-300 text-xs space-y-1">
                          <p><span class="text-slate-500">Pasajero:</span> {{ st.ag_users?.full_name ?? 'N/A' }}</p>
                          <p><span class="text-slate-500">Origen:</span> {{ st.origin_name ?? '-' }}</p>
                          <p><span class="text-slate-500">Destino:</span> {{ st.dest_name ?? '-' }}</p>
                        </div>
                        <div class="flex gap-2">
                          @if (st.ag_users?.phone) {
                            <a [href]="'tel:' + st.ag_users.phone"
                              class="flex-1 py-1.5 rounded-lg text-white text-xs font-bold text-center"
                              style="background:rgba(16,185,129,0.2);border:1px solid rgba(16,185,129,0.3)">
                              📞 Llamar
                            </a>
                          }
                          <button (click)="releaseScheduled(st.id)"
                            class="flex-1 py-1.5 rounded-lg text-red-300 text-xs font-bold"
                            style="background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.3)">
                            Liberar
                          </button>
                        </div>
                      </div>
                    }
                  </div>
                }
              </div>

              <!-- Disponibles -->
              <div>
                <p class="text-white font-black text-sm mb-2">Disponibles cerca</p>
                @if (availableScheduledTrips().length === 0) {
                  <p class="text-slate-500 text-xs text-center py-4">No hay viajes programados disponibles.</p>
                } @else {
                  <div class="flex flex-col gap-2">
                    @for (st of availableScheduledTrips(); track st.id) {
                      <div class="rounded-2xl p-4 flex flex-col gap-2"
                        style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08)">
                        <div class="flex items-center justify-between">
                          <div class="flex items-center gap-2">
                            <span class="material-symbols-outlined text-amber-400" style="font-size:18px">schedule</span>
                            <span class="text-white font-bold text-sm">{{ st.scheduled_for | date:'dd MMM HH:mm' }}</span>
                          </div>
                          <span class="text-emerald-400 font-black text-sm">{{ '$' + (st.estimated_price ?? 0).toLocaleString('es-CO') }}</span>
                        </div>
                        <div class="text-slate-300 text-xs space-y-1">
                          <p><span class="text-slate-500">Origen:</span> {{ st.origin_name ?? '-' }}</p>
                          <p><span class="text-slate-500">Destino:</span> {{ st.dest_name ?? '-' }}</p>
                        </div>
                        <button (click)="claimScheduled(st.id)" [disabled]="claimingScheduledId() === st.id"
                          class="w-full py-2 rounded-xl text-white font-black text-xs disabled:opacity-50"
                          style="background:linear-gradient(135deg,#0891b2,#0e7490)">
                          @if (claimingScheduledId() === st.id) { Reservando... } @else { Reservar este viaje }
                        </button>
                      </div>
                    }
                  </div>
                }
              </div>
            </div>
          }

        </div>
      }

    </div>

    <!-- ══ Modal: Detalle de viaje con desglose ══ -->
    @if (tripDetailOpen()) {
      <div (click)="closeTripDetail()" class="fixed inset-0 z-50"
        style="background:rgba(0,0,0,0.65);backdrop-filter:blur(3px)"></div>
      <div class="fixed bottom-0 left-0 right-0 z-50 rounded-t-3xl flex flex-col gap-4 px-5 pt-5 pb-8 max-h-[90vh] overflow-y-auto"
        style="background:#0f1421;border-top:1px solid rgba(255,255,255,0.1);box-shadow:0 -8px 40px rgba(0,0,0,0.5)">
        <div class="mx-auto w-10 h-1 rounded-full bg-white/20 mb-1"></div>
        <div class="flex items-center justify-between">
          <p class="text-white font-black text-base">Detalle del viaje</p>
          <button (click)="closeTripDetail()"
            class="w-8 h-8 rounded-lg flex items-center justify-center"
            style="background:rgba(255,255,255,0.06)">
            <span class="material-symbols-outlined text-slate-400" style="font-size:20px">close</span>
          </button>
        </div>

        @if (loadingTripDetail()) {
          <div class="flex items-center justify-center py-12">
            <span class="material-symbols-outlined text-cyan-400 animate-spin" style="font-size:32px">autorenew</span>
          </div>
        } @else if (tripDetail(); as d) {
          <div class="flex flex-col gap-3">
            <!-- Info general -->
            <div class="rounded-2xl p-4" style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08)">
              <div class="flex items-center justify-between mb-2">
                <p class="text-white font-bold text-sm">{{ d.passenger_name ?? 'Pasajero' }}</p>
                <p class="text-slate-500 text-xs">{{ d.completed_at | date:'dd MMM yyyy HH:mm' }}</p>
              </div>
              <p class="text-slate-300 text-xs">
                <span class="text-slate-500">Destino:</span> {{ d.dest_name ?? '-' }}
              </p>
              <p class="text-slate-300 text-xs">
                <span class="text-slate-500">Distancia:</span> {{ (d.distance_km ?? 0) | number:'1.2-2' }} km
              </p>
              <p class="text-slate-300 text-xs">
                <span class="text-slate-500">Vehículo:</span> {{ d.vehicle_type ?? '-' }}
              </p>
            </div>

            <!-- Desglose tarifa -->
            <div class="rounded-2xl p-4 flex flex-col gap-2" style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08)">
              <p class="text-cyan-400 font-bold text-xs uppercase tracking-widest mb-1">Desglose</p>

              <div class="flex items-center justify-between">
                <span class="text-slate-400 text-xs">Tarifa base</span>
                <span class="text-white text-xs font-bold">{{ '$' + (d.base_fare ?? 0).toLocaleString('es-CO') }}</span>
              </div>
              <div class="flex items-center justify-between">
                <span class="text-slate-400 text-xs">Distancia</span>
                <span class="text-white text-xs font-bold">{{ '$' + (d.distance_fare ?? 0).toLocaleString('es-CO') }}</span>
              </div>
              @if (d.surge_multiplier > 1) {
                <div class="flex items-center justify-between">
                  <span class="text-amber-400 text-xs">⚡ Alta demanda x{{ d.surge_multiplier }}</span>
                  <span class="text-amber-400 text-xs font-bold">{{ '+$' + (d.surge_amount ?? 0).toLocaleString('es-CO') }}</span>
                </div>
              }
              <div class="border-t border-white/10 my-1"></div>
              <div class="flex items-center justify-between">
                <span class="text-white text-sm font-bold">Total al pasajero</span>
                <span class="text-white text-sm font-black">{{ '$' + (d.final_price ?? d.offered_price ?? 0).toLocaleString('es-CO') }}</span>
              </div>
              <div class="flex items-center justify-between">
                <span class="text-red-400 text-xs">Comisión plataforma ({{ d.commission_pct ?? 0 }}%)</span>
                <span class="text-red-400 text-xs font-bold">{{ '-$' + (d.commission_amount ?? 0).toLocaleString('es-CO') }}</span>
              </div>
              <div class="border-t border-white/10 my-1"></div>
              <div class="flex items-center justify-between rounded-xl p-3"
                style="background:linear-gradient(135deg,rgba(16,185,129,0.15),rgba(16,185,129,0.05))">
                <span class="text-emerald-300 text-sm font-bold">Tu ganancia neta</span>
                <span class="text-emerald-300 text-lg font-black">{{ '$' + (d.driver_net ?? 0).toLocaleString('es-CO') }}</span>
              </div>
            </div>

            <button (click)="downloadReceipt()"
              class="w-full py-3 rounded-xl text-white font-black text-sm flex items-center justify-center gap-2"
              style="background:linear-gradient(135deg,#0891b2,#0e7490)">
              <span class="material-symbols-outlined" style="font-size:16px">download</span>
              Descargar recibo
            </button>
          </div>
        } @else {
          <p class="text-slate-500 text-center py-8 text-sm">No se pudo cargar el detalle.</p>
        }
      </div>
    }

    <!-- ══ Modal: Calificar pasajero (con tags) ══ -->
    @if (passengerRatingModal()) {
      <div class="fixed inset-0 z-50" style="background:rgba(0,0,0,0.75);backdrop-filter:blur(4px)"></div>
      <div class="fixed bottom-0 left-0 right-0 z-50 rounded-t-3xl flex flex-col gap-4 px-5 pt-5 pb-8 max-h-[90vh] overflow-y-auto"
        style="background:#0f1421;border-top:1px solid rgba(255,255,255,0.1);box-shadow:0 -8px 40px rgba(0,0,0,0.5)">
        <div class="mx-auto w-10 h-1 rounded-full bg-white/20 mb-1"></div>

        <div class="text-center">
          <p class="text-white font-black text-lg">Califica al pasajero</p>
          <p class="text-slate-400 text-xs mt-1">{{ pendingRatingTrip()?.passenger_name ?? 'Pasajero' }}</p>
        </div>

        <!-- Estrellas -->
        <div class="flex items-center justify-center gap-2">
          @for (i of [1,2,3,4,5]; track i) {
            <button (click)="passengerRatingStars.set(i)"
              class="w-12 h-12 flex items-center justify-center transition-transform"
              [class.scale-110]="passengerRatingStars() >= i">
              <span class="material-symbols-outlined" style="font-size:36px"
                [style.color]="passengerRatingStars() >= i ? '#fbbf24' : 'rgba(255,255,255,0.15)'">
                star
              </span>
            </button>
          }
        </div>

        <!-- Tags -->
        <div class="flex flex-wrap gap-2 justify-center">
          @for (tag of passengerRatingTagOptions; track tag.key) {
            <button (click)="togglePassengerRatingTag(tag.key)"
              class="px-3 py-1.5 rounded-full text-xs font-bold transition-colors"
              [style.background]="passengerRatingTags().has(tag.key) ? 'rgba(8,145,178,0.3)' : 'rgba(255,255,255,0.05)'"
              [style.border]="passengerRatingTags().has(tag.key) ? '1px solid rgba(8,145,178,0.6)' : '1px solid rgba(255,255,255,0.1)'"
              [style.color]="passengerRatingTags().has(tag.key) ? '#67e8f9' : 'rgba(255,255,255,0.7)'">
              {{ tag.label }}
            </button>
          }
        </div>

        <!-- Comentario -->
        <textarea [(ngModel)]="passengerRatingComment" maxlength="300" rows="2"
          placeholder="Comentario (opcional)"
          class="w-full px-3 py-2 rounded-lg text-white text-sm"
          style="background:rgba(0,0,0,0.3);border:1px solid rgba(255,255,255,0.1)"></textarea>

        <div class="flex gap-2">
          <button (click)="skipPassengerRating()"
            class="flex-1 py-3 rounded-xl text-slate-300 font-bold text-sm"
            style="background:rgba(255,255,255,0.05)">Omitir</button>
          <button (click)="submitPassengerRating()"
            [disabled]="passengerRatingStars() === 0 || submittingPassengerRating()"
            class="flex-1 py-3 rounded-xl text-white font-black text-sm disabled:opacity-50"
            style="background:linear-gradient(135deg,#0891b2,#0e7490)">
            @if (submittingPassengerRating()) { Enviando... } @else { Enviar }
          </button>
        </div>
      </div>
    }

    <!-- ══ Modal: hacer oferta ══ -->
    @if (makingOfferFor()) {
      <!-- Overlay -->
      <div (click)="closeMakeOffer()"
        class="fixed inset-0 z-50"
        style="background:rgba(0,0,0,0.65);backdrop-filter:blur(3px)"></div>
      <!-- Sheet -->
      <div class="fixed bottom-0 left-0 right-0 z-50 rounded-t-3xl flex flex-col gap-4 px-5 pt-5 pb-8"
        style="background:#0f1421;border-top:1px solid rgba(255,255,255,0.1);box-shadow:0 -8px 40px rgba(0,0,0,0.5)">
        <!-- Handle -->
        <div class="mx-auto w-10 h-1 rounded-full bg-white/20 mb-1"></div>
        <!-- Header -->
        <div class="flex items-center justify-between">
          <div>
            <p class="text-white font-black text-base">Tu oferta</p>
            <p class="text-slate-500 text-xs">{{ makingOfferFor()!.dest_name }} · {{ makingOfferFor()!.distance_km }} km</p>
          </div>
          <button (click)="closeMakeOffer()"
            class="w-8 h-8 rounded-lg flex items-center justify-center"
            style="background:rgba(255,255,255,0.06)">
            <span class="material-symbols-outlined text-slate-400" style="font-size:20px">close</span>
          </button>
        </div>
        <!-- Precio pasajero vs tu oferta -->
        <div class="flex items-center gap-3 rounded-2xl px-4 py-3"
          style="background:rgba(8,145,178,0.07);border:1px solid rgba(8,145,178,0.15)">
          <div class="flex-1 text-center">
            <p class="text-slate-500 text-[10px] uppercase font-bold">Pasajero pide</p>
            <p class="text-slate-300 font-black text-lg">{{ formatCOP(makingOfferFor()!.offered_price) }}</p>
          </div>
          <div class="w-px self-stretch bg-white/10"></div>
          <div class="flex-1 text-center">
            <p class="text-cyan-400 text-[10px] uppercase font-bold">Tu oferta</p>
            <p class="text-white font-black text-xl">{{ formatCOP(driverOfferPrice()) }}</p>
          </div>
        </div>
        <!-- Ajustar precio -->
        <div class="flex items-center gap-3">
          <button (click)="driverOfferPrice.set(driverOfferPrice() > 2500 ? driverOfferPrice() - 500 : 2000)"
            class="w-14 h-14 rounded-2xl font-black text-2xl flex items-center justify-center active:scale-90 transition-all text-slate-200"
            style="background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.12)">−</button>
          <div class="flex-1 flex flex-col items-center">
            <input type="number" [value]="driverOfferPrice()"
              (input)="driverOfferPrice.set(+$any($event.target).value > 2000 ? +$any($event.target).value : 2000)"
              class="w-full text-center text-white font-black text-2xl bg-transparent outline-none"
              style="min-width:0"/>
            <p class="text-slate-600 text-[10px]">COP</p>
          </div>
          <button (click)="driverOfferPrice.set(driverOfferPrice() + 500)"
            class="w-14 h-14 rounded-2xl font-black text-2xl flex items-center justify-center active:scale-90 transition-all text-slate-200"
            style="background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.12)">+</button>
        </div>
        <!-- Enviar oferta -->
        <button (click)="submitDriverOffer()" [disabled]="sendingOffer()"
          class="w-full py-4 rounded-2xl font-black text-base text-white flex items-center justify-center gap-2 active:scale-[0.98] transition-all disabled:opacity-60"
          style="background:linear-gradient(135deg,#0891b2,#0e7490);box-shadow:0 4px 16px rgba(8,145,178,0.3)">
          @if (sendingOffer()) {
            <span class="material-symbols-outlined animate-spin" style="font-size:20px">autorenew</span> Enviando...
          } @else {
            <span class="material-symbols-outlined" style="font-size:20px">local_offer</span>
            Enviar oferta · {{ formatCOP(driverOfferPrice()) }}
          }
        </button>
      </div>
    }
  }

  <!-- ═══════════ HOME ═══════════ -->
  @if (screen() === 'home') {
    <div class="flex flex-col items-center gap-4 text-center w-full px-5 sm:px-8"
      style="max-width:420px;padding-top:clamp(0.5rem,2vh,1rem)">
      <img src="movi-splash.svg" alt="Movi"
        style="width:clamp(200px,55vw,280px);height:clamp(200px,55vw,280px)" />
      <p class="text-white/70 text-sm sm:text-base leading-relaxed font-medium">Selecciona cómo quieres participar</p>

      <!-- Info referidos -->
      <div class="w-full rounded-2xl p-4 text-left"
        style="background:rgba(255,255,255,0.12);border:1px solid rgba(255,255,255,0.2);backdrop-filter:blur(8px)">
        <p class="text-white/90 text-xs sm:text-sm leading-relaxed">
          En <span class="text-white font-black">Movi</span> tu ganas dinero tanto si te registras como
          <span class="text-amber-300 font-bold">pasajero</span> o como
          <span class="text-amber-300 font-bold">conductor</span>. En ambos encontrarás en el menú un botón llamado
          <span class="text-yellow-300 font-black">"Recomienda y gana"</span>: cada vez que alguien se cree una cuenta en Movi
          con tu link y use nuestro servicio, tú ganas el <span class="text-yellow-300 font-black">2% vitalicio</span>
          del valor de cada servicio, sin importar si tus invitados son pasajeros o conductores.
        </p>
      </div>

      <div class="flex flex-col gap-3 w-full mt-1">
        <button (click)="screen.set('passenger-form')"
          class="w-full py-4 sm:py-5 rounded-2xl font-black text-sm sm:text-base uppercase tracking-wider bg-white text-black shadow-lg shadow-black/20 flex items-center justify-center gap-2 active:scale-[0.97] transition-transform">
          <span class="material-symbols-outlined" style="font-size:20px">person</span>
          Crear cuenta pasajero
        </button>
        <button (click)="screen.set('driver-form'); driverStep.set(1)"
          class="w-full py-4 sm:py-5 rounded-2xl font-black text-sm sm:text-base uppercase tracking-wider text-white shadow-lg shadow-black/20 flex items-center justify-center gap-2 active:scale-[0.97] transition-transform"
          style="background:rgba(255,255,255,0.15);border:1px solid rgba(255,255,255,0.3);backdrop-filter:blur(4px)">
          <span class="material-symbols-outlined" style="font-size:20px">directions_car</span>
          <span class="material-symbols-outlined" style="font-size:20px">local_shipping</span>
          <span class="material-symbols-outlined" style="font-size:20px">two_wheeler</span>
          Conductor
        </button>
      </div>
    </div>
  }

  <!-- ═══════════ FORMULARIO PASAJERO ═══════════ -->
  @if (screen() === 'passenger-form') {
    <div class="w-full max-w-lg px-1">
      <!-- Header -->
      <div class="flex items-center gap-3 mb-5">
        <button (click)="screen.set('home')" class="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center flex-shrink-0 active:scale-90 transition-transform">
          <span class="material-symbols-outlined text-white" style="font-size:18px">arrow_back</span>
        </button>
        <div>
          <h2 class="text-white font-black text-lg sm:text-xl">Registro de Pasajero</h2>
          <p class="text-slate-500 text-xs">Completa todos los campos</p>
        </div>
      </div>

      <div class="rounded-2xl p-3 mb-4"
        style="background:rgba(59,130,246,0.08);border:1px solid rgba(59,130,246,0.2)">
        <p class="text-slate-300 text-xs leading-relaxed">
          <span class="material-symbols-outlined text-blue-400 align-middle" style="font-size:14px">verified_user</span>
          En <span class="text-white font-bold">Movi</span> verificamos cada registro para garantizar tu seguridad y la de los conductores. Escribe tus datos exactamente como figuran en tu documento de identidad. Así activamos tu cuenta más rápido.
        </p>
      </div>

      @if (passengerSuccess()) {
        <div class="flex flex-col items-center gap-4 py-16 text-center">
          <div class="w-16 h-16 rounded-2xl bg-emerald-500/10 border-2 border-emerald-500/30 flex items-center justify-center">
            <span class="material-symbols-outlined text-emerald-400" style="font-size:36px">check_circle</span>
          </div>
          <h3 class="text-white font-black text-xl">¡Cuenta creada!</h3>
          <p class="text-slate-400 text-sm">Tu cuenta de pasajero fue registrada exitosamente.</p>
          <button (click)="screen.set('home'); passengerSuccess.set(false)" class="mt-2 px-8 py-3 rounded-xl bg-orange-500 text-black font-black text-sm">Volver al inicio</button>
        </div>
      } @else {
        <form (ngSubmit)="submitPassenger()" class="flex flex-col gap-4">

          <!-- Datos personales -->
          <div class="bg-white/[0.03] border border-white/8 rounded-2xl p-3 sm:p-4 flex flex-col gap-3">
            <h3 class="text-orange-400 font-black text-xs uppercase tracking-widest flex items-center gap-2">
              <span class="material-symbols-outlined" style="font-size:14px">person</span>Datos Personales
            </h3>
            <div class="flex flex-col gap-1">
              <label class="text-slate-400 text-xs font-bold">Nombre completo *</label>
              <input [(ngModel)]="pf.fullName" name="fullName" required placeholder="Ej: Juan Carlos Pérez"
                class="bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm placeholder:text-slate-600 focus:outline-none focus:border-orange-500/50 transition-colors w-full"/>
            </div>
            <div class="flex flex-col gap-1">
              <label class="text-slate-400 text-xs font-bold">Fecha de nacimiento *</label>
              <input [(ngModel)]="pf.birthDate" name="birthDate" type="date" required
                class="bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-orange-500/50 transition-colors w-full"/>
            </div>
            <div class="flex flex-col gap-1">
              <label class="text-slate-400 text-xs font-bold">Ciudad *</label>
              <input [(ngModel)]="pf.city" name="city" required placeholder="Tu ciudad"
                class="bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm placeholder:text-slate-600 focus:outline-none focus:border-orange-500/50 transition-colors w-full"/>
            </div>
            <div class="flex flex-col gap-1">
              <label class="text-slate-400 text-xs font-bold">Número de cédula / documento *</label>
              <input [(ngModel)]="pf.idNumber" name="idNumber" required placeholder="Número de identificación"
                class="bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm placeholder:text-slate-600 focus:outline-none focus:border-orange-500/50 transition-colors w-full"/>
            </div>
          </div>

          <!-- Contacto -->
          <div class="bg-white/[0.03] border border-white/8 rounded-2xl p-3 sm:p-4 flex flex-col gap-3">
            <h3 class="text-orange-400 font-black text-xs uppercase tracking-widest flex items-center gap-2">
              <span class="material-symbols-outlined" style="font-size:14px">phone</span>Contacto y Acceso
            </h3>
            <div class="flex flex-col gap-1">
              <label class="text-slate-400 text-xs font-bold">Número de teléfono *</label>
              <div class="flex gap-2">
                <input [(ngModel)]="pf.phone" name="phone" type="tel" required placeholder="+57 300 000 0000"
                  class="bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm placeholder:text-slate-600 focus:outline-none focus:border-orange-500/50 transition-colors flex-1"
                  [disabled]="smsVerified()"/>
                @if (!smsVerified()) {
                  <button type="button" (click)="sendSmsCode(pf.phone)"
                    [disabled]="smsSending() || smsCountdown() > 0 || !pf.phone"
                    class="px-3 py-2.5 rounded-xl text-xs font-bold transition-all flex-shrink-0 disabled:opacity-40"
                    [class]="smsCodeSent() ? 'bg-white/5 text-slate-400 border border-white/10' : 'bg-orange-500 text-black'">
                    @if (smsSending()) {
                      <span class="material-symbols-outlined animate-spin" style="font-size:14px">sync</span>
                    } @else if (smsCountdown() > 0) {
                      {{ smsCountdown() }}s
                    } @else {
                      {{ smsCodeSent() ? 'Reenviar' : 'Verificar' }}
                    }
                  </button>
                } @else {
                  <span class="flex items-center gap-1 px-3 py-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400 text-xs font-bold">
                    <span class="material-symbols-outlined" style="font-size:14px">check_circle</span> Verificado
                  </span>
                }
              </div>
              @if (smsCodeSent() && !smsVerified()) {
                <div class="mt-2 flex gap-2">
                  <input [(ngModel)]="smsCodeInput" name="smsCode" type="text" maxlength="6" placeholder="Código de 6 dígitos"
                    class="bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm text-center tracking-[0.3em] font-bold placeholder:text-slate-600 focus:outline-none focus:border-orange-500/50 transition-colors flex-1"/>
                  <button type="button" (click)="verifySmsCode()"
                    [disabled]="smsCodeInput.length < 6"
                    class="px-4 py-2.5 rounded-xl bg-emerald-500 text-black text-xs font-bold disabled:opacity-40 transition-all">
                    Confirmar
                  </button>
                </div>
                <p class="text-slate-500 text-[10px] mt-1">Ingresa el código que recibiste por SMS</p>
              }
              @if (smsError()) {
                <p class="text-rose-400 text-xs mt-1">{{ smsError() }}</p>
              }
            </div>
            <div class="flex flex-col gap-1">
              <label class="text-slate-400 text-xs font-bold">Correo electrónico *</label>
              <input [(ngModel)]="pf.email" name="email" type="email" required placeholder="correo@ejemplo.com"
                class="bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm placeholder:text-slate-600 focus:outline-none focus:border-orange-500/50 transition-colors w-full"/>
            </div>
            <div class="flex flex-col gap-1">
              <label class="text-slate-400 text-xs font-bold">Contraseña *</label>
              <input [(ngModel)]="pf.password" name="password" type="password" required placeholder="Mínimo 8 caracteres"
                class="bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm placeholder:text-slate-600 focus:outline-none focus:border-orange-500/50 transition-colors w-full"/>
            </div>
          </div>

          <!-- Foto de perfil -->
          <div class="bg-white/[0.03] border border-white/8 rounded-2xl p-3 sm:p-4 flex flex-col gap-3">
            <h3 class="text-orange-400 font-black text-xs uppercase tracking-widest flex items-center gap-2">
              <span class="material-symbols-outlined" style="font-size:14px">photo_camera</span>Foto de Perfil
            </h3>
            <div class="flex flex-col gap-1">
              <label class="text-slate-400 text-xs font-bold">Selfie / Foto de perfil *</label>
              <label class="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-white/10 rounded-xl py-5 cursor-pointer hover:border-orange-500/40 active:border-orange-500/40 transition-colors">
                <span class="material-symbols-outlined text-slate-500" style="font-size:28px">add_a_photo</span>
                <span class="text-slate-500 text-xs">Toca para subir tu foto</span>
                <input type="file" accept="image/*" capture="user" class="hidden" (change)="onPassengerFileChange($event, 'selfie')"/>
              </label>
              @if (pf.selfie) { <p class="text-emerald-400 text-xs mt-1">✓ {{ pf.selfie }}</p> }
            </div>
          </div>

          <!-- Contacto de emergencia -->
          <div class="bg-white/[0.03] border border-white/8 rounded-2xl p-3 sm:p-4 flex flex-col gap-3">
            <h3 class="text-orange-400 font-black text-xs uppercase tracking-widest flex items-center gap-2">
              <span class="material-symbols-outlined" style="font-size:14px">emergency</span>Contacto de Emergencia
            </h3>
            <div class="flex flex-col gap-1">
              <label class="text-slate-400 text-xs font-bold">Nombre del contacto *</label>
              <input [(ngModel)]="pf.emergencyName" name="emergencyName" required placeholder="Nombre completo"
                class="bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm placeholder:text-slate-600 focus:outline-none focus:border-orange-500/50 transition-colors w-full"/>
            </div>
            <div class="flex flex-col gap-1">
              <label class="text-slate-400 text-xs font-bold">Teléfono del contacto *</label>
              <input [(ngModel)]="pf.emergencyPhone" name="emergencyPhone" type="tel" required placeholder="+57 300 000 0000"
                class="bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm placeholder:text-slate-600 focus:outline-none focus:border-orange-500/50 transition-colors w-full"/>
            </div>
          </div>

          <!-- Términos -->
          <label class="flex items-start gap-3 cursor-pointer px-1">
            <input [(ngModel)]="pf.terms" name="terms" type="checkbox" class="mt-1 accent-orange-500 flex-shrink-0"/>
            <span class="text-slate-400 text-xs leading-relaxed">Acepto los <span class="text-orange-400 font-bold">Términos y Condiciones</span> y la <span class="text-orange-400 font-bold">Política de Privacidad</span> de Movi. *</span>
          </label>

          @if (passengerError()) {
            <div class="bg-rose-500/10 border border-rose-500/20 rounded-xl px-4 py-3 text-rose-300 text-xs">{{ passengerError() }}</div>
          }

          <button type="submit" [disabled]="passengerLoading()"
            class="w-full py-4 rounded-2xl font-black text-sm sm:text-base uppercase tracking-wider bg-gradient-to-r from-orange-500 to-amber-500 text-black disabled:opacity-50 flex items-center justify-center gap-2 active:scale-[0.97] transition-transform">
            @if (passengerLoading()) {
              <span class="material-symbols-outlined animate-spin" style="font-size:18px">autorenew</span> Registrando...
            } @else {
              <span class="material-symbols-outlined" style="font-size:18px">check</span> Crear cuenta de pasajero
            }
          </button>
        </form>
      }
    </div>
  }

  <!-- ═══════════ FORMULARIO CONDUCTOR ═══════════ -->
  @if (screen() === 'driver-form') {
    <div class="w-full max-w-lg px-1">

      <!-- Header -->
      <div class="flex items-center gap-3 mb-4">
        <button (click)="driverStep() === 1 ? screen.set('home') : driverStep.set(driverStep() - 1)"
          class="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center flex-shrink-0 active:scale-90 transition-transform">
          <span class="material-symbols-outlined text-white" style="font-size:18px">arrow_back</span>
        </button>
        <div class="flex-1">
          <h2 class="text-white font-black text-lg sm:text-xl">Registro de Conductor</h2>
          <p class="text-slate-500 text-xs">Paso {{ driverStep() }} de 4</p>
        </div>
      </div>

      <!-- Progress bar -->
      <div class="w-full h-1.5 bg-white/5 rounded-full mb-4 overflow-hidden">
        <div class="h-full bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full transition-all duration-500"
          [style.width]="(driverStep() / 4 * 100) + '%'"></div>
      </div>

      <div class="rounded-2xl p-3 mb-4"
        style="background:rgba(6,182,212,0.08);border:1px solid rgba(6,182,212,0.2)">
        <p class="text-slate-300 text-xs leading-relaxed">
          <span class="material-symbols-outlined text-cyan-400 align-middle" style="font-size:14px">shield</span>
          En <span class="text-white font-bold">Movi</span> aplicamos un proceso riguroso de verificación para tu seguridad y la de los pasajeros. Todos los datos serán validados con fuentes oficiales antes de activarte como conductor. Escribe <span class="text-white font-black">EXACTAMENTE</span> como aparece en tu cédula y tarjeta de propiedad. La precisión evita rechazos.
        </p>
      </div>

      @if (driverSuccess()) {
        <div class="flex flex-col items-center gap-4 py-16 text-center">
          <div class="w-16 h-16 rounded-2xl bg-emerald-500/10 border-2 border-emerald-500/30 flex items-center justify-center">
            <span class="material-symbols-outlined text-emerald-400" style="font-size:36px">check_circle</span>
          </div>
          <h3 class="text-white font-black text-xl">¡Solicitud enviada!</h3>
          <p class="text-slate-400 text-sm leading-relaxed">Tu solicitud como conductor está en revisión. Te notificaremos cuando sea aprobada.</p>
          <button (click)="screen.set('home'); driverSuccess.set(false)" class="mt-2 px-8 py-3 rounded-xl bg-cyan-500 text-black font-black text-sm">Volver al inicio</button>
        </div>

      } @else {

        <!-- PASO 1: Datos Personales -->
        @if (driverStep() === 1) {
          <div class="flex flex-col gap-4">
            <div class="bg-white/[0.03] border border-white/8 rounded-2xl p-3 sm:p-4 flex flex-col gap-3">
              <h3 class="text-cyan-400 font-black text-xs uppercase tracking-widest flex items-center gap-2">
                <span class="material-symbols-outlined" style="font-size:14px">person</span>Datos Personales
              </h3>
              <div class="flex flex-col gap-1">
                <label class="text-slate-400 text-xs font-bold">Nombre completo *</label>
                <input [(ngModel)]="df.fullName" name="d_fullName" placeholder="Nombre y apellidos"
                  class="bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm placeholder:text-slate-600 focus:outline-none focus:border-cyan-500/50 transition-colors w-full"/>
              </div>
              <div class="flex flex-col gap-1">
                <label class="text-slate-400 text-xs font-bold">Fecha de nacimiento *</label>
                <input [(ngModel)]="df.birthDate" name="d_birthDate" type="date"
                  class="bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-cyan-500/50 transition-colors w-full"/>
              </div>
              <div class="flex flex-col gap-1">
                <label class="text-slate-400 text-xs font-bold">Ciudad *</label>
                <input [(ngModel)]="df.city" name="d_city" placeholder="Tu ciudad"
                  class="bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm placeholder:text-slate-600 focus:outline-none focus:border-cyan-500/50 transition-colors w-full"/>
              </div>
              <div class="flex flex-col gap-1">
                <label class="text-slate-400 text-xs font-bold">Número de cédula *</label>
                <input [(ngModel)]="df.idNumber" name="d_idNumber" placeholder="Número de identificación"
                  class="bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm placeholder:text-slate-600 focus:outline-none focus:border-cyan-500/50 transition-colors w-full"/>
              </div>
              <div class="flex flex-col gap-1">
                <label class="text-slate-400 text-xs font-bold">Teléfono *</label>
                <div class="flex gap-2">
                  <input [(ngModel)]="df.phone" name="d_phone" type="tel" placeholder="+57 300 000 0000"
                    class="bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm placeholder:text-slate-600 focus:outline-none focus:border-cyan-500/50 transition-colors flex-1"
                    [disabled]="smsVerified()"/>
                  @if (!smsVerified()) {
                    <button type="button" (click)="sendSmsCode(df.phone)"
                      [disabled]="smsSending() || smsCountdown() > 0 || !df.phone"
                      class="px-3 py-2.5 rounded-xl text-xs font-bold transition-all flex-shrink-0 disabled:opacity-40"
                      [class]="smsCodeSent() ? 'bg-white/5 text-slate-400 border border-white/10' : 'bg-cyan-500 text-black'">
                      @if (smsSending()) {
                        <span class="material-symbols-outlined animate-spin" style="font-size:14px">sync</span>
                      } @else if (smsCountdown() > 0) {
                        {{ smsCountdown() }}s
                      } @else {
                        {{ smsCodeSent() ? 'Reenviar' : 'Verificar' }}
                      }
                    </button>
                  } @else {
                    <span class="flex items-center gap-1 px-3 py-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400 text-xs font-bold">
                      <span class="material-symbols-outlined" style="font-size:14px">check_circle</span> Verificado
                    </span>
                  }
                </div>
                @if (smsCodeSent() && !smsVerified()) {
                  <div class="mt-2 flex gap-2">
                    <input [(ngModel)]="smsCodeInput" name="dSmsCode" type="text" maxlength="6" placeholder="Código de 6 dígitos"
                      class="bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm text-center tracking-[0.3em] font-bold placeholder:text-slate-600 focus:outline-none focus:border-cyan-500/50 transition-colors flex-1"/>
                    <button type="button" (click)="verifySmsCode()"
                      [disabled]="smsCodeInput.length < 6"
                      class="px-4 py-2.5 rounded-xl bg-emerald-500 text-black text-xs font-bold disabled:opacity-40 transition-all">
                      Confirmar
                    </button>
                  </div>
                  <p class="text-slate-500 text-[10px] mt-1">Ingresa el código que recibiste por SMS</p>
                }
                @if (smsError()) {
                  <p class="text-rose-400 text-xs mt-1">{{ smsError() }}</p>
                }
              </div>
              <div class="flex flex-col gap-1">
                <label class="text-slate-400 text-xs font-bold">Correo electrónico *</label>
                <input [(ngModel)]="df.email" name="d_email" type="email" placeholder="correo@ejemplo.com"
                  class="bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm placeholder:text-slate-600 focus:outline-none focus:border-cyan-500/50 transition-colors w-full"/>
              </div>
              <div class="flex flex-col gap-1">
                <label class="text-slate-400 text-xs font-bold">Contraseña *</label>
                <input [(ngModel)]="df.password" name="d_password" type="password" placeholder="Mínimo 8 caracteres"
                  class="bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm placeholder:text-slate-600 focus:outline-none focus:border-cyan-500/50 transition-colors w-full"/>
              </div>
            </div>

            <div class="bg-white/[0.03] border border-white/8 rounded-2xl p-3 sm:p-4 flex flex-col gap-3">
              <h3 class="text-cyan-400 font-black text-xs uppercase tracking-widest flex items-center gap-2">
                <span class="material-symbols-outlined" style="font-size:14px">emergency</span>Contacto de Emergencia
              </h3>
              <div class="flex flex-col gap-1">
                <label class="text-slate-400 text-xs font-bold">Nombre del contacto *</label>
                <input [(ngModel)]="df.emergencyName" name="d_emergencyName" placeholder="Nombre completo"
                  class="bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm placeholder:text-slate-600 focus:outline-none focus:border-cyan-500/50 transition-colors w-full"/>
              </div>
              <div class="flex flex-col gap-1">
                <label class="text-slate-400 text-xs font-bold">Teléfono del contacto *</label>
                <input [(ngModel)]="df.emergencyPhone" name="d_emergencyPhone" type="tel" placeholder="+57 300 000 0000"
                  class="bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm placeholder:text-slate-600 focus:outline-none focus:border-cyan-500/50 transition-colors w-full"/>
              </div>
            </div>

            @if (driverError()) {
              <div class="bg-rose-500/10 border border-rose-500/20 rounded-xl px-4 py-3 text-rose-300 text-xs">{{ driverError() }}</div>
            }
            <button (click)="nextDriverStep(1)"
              class="w-full py-4 rounded-2xl font-black text-sm sm:text-base uppercase tracking-wider bg-gradient-to-r from-cyan-500 to-blue-500 text-black flex items-center justify-center gap-2 active:scale-[0.97] transition-transform">
              Continuar <span class="material-symbols-outlined" style="font-size:18px">arrow_forward</span>
            </button>
          </div>
        }

        <!-- PASO 2: Documentos de Identidad -->
        @if (driverStep() === 2) {
          <div class="flex flex-col gap-4">
            <div class="bg-white/[0.03] border border-white/8 rounded-2xl p-3 sm:p-4 flex flex-col gap-3">
              <h3 class="text-cyan-400 font-black text-xs uppercase tracking-widest flex items-center gap-2">
                <span class="material-symbols-outlined" style="font-size:14px">badge</span>Documentos de Identidad
              </h3>
              @for (f of idPhotoFields; track f.key) {
                <div class="flex flex-col gap-1">
                  <label class="text-slate-400 text-xs font-bold">{{ f.label }} *</label>
                  <label class="flex items-center gap-3 border border-dashed border-white/10 rounded-xl px-3 py-2.5 cursor-pointer hover:border-cyan-500/40 active:border-cyan-500/40 transition-colors">
                    <span class="material-symbols-outlined text-slate-500" style="font-size:20px">upload</span>
                    <span class="text-slate-500 text-xs flex-1 truncate">{{ dfr[f.key] || 'Toca para subir foto' }}</span>
                    @if (dfr[f.key]) { <span class="material-symbols-outlined text-emerald-400" style="font-size:16px">check_circle</span> }
                    <input type="file" accept="image/*" class="hidden" (change)="onDriverFileChange($event, f.key)"/>
                  </label>
                </div>
              }
            </div>

            <div class="bg-white/[0.03] border border-white/8 rounded-2xl p-3 sm:p-4 flex flex-col gap-3">
              <h3 class="text-cyan-400 font-black text-xs uppercase tracking-widest flex items-center gap-2">
                <span class="material-symbols-outlined" style="font-size:14px">policy</span>Antecedentes
              </h3>
              <div class="flex flex-col gap-1">
                <label class="text-slate-400 text-xs font-bold">Certificado de antecedentes judiciales *</label>
                <label class="flex items-center gap-3 border border-dashed border-white/10 rounded-xl px-3 py-2.5 cursor-pointer hover:border-cyan-500/40 active:border-cyan-500/40 transition-colors">
                  <span class="material-symbols-outlined text-slate-500" style="font-size:20px">upload</span>
                  <span class="text-slate-500 text-xs flex-1 truncate">{{ df.criminalRecord || 'Toca para subir documento' }}</span>
                  @if (df.criminalRecord) { <span class="material-symbols-outlined text-emerald-400" style="font-size:16px">check_circle</span> }
                  <input type="file" accept="image/*,application/pdf" class="hidden" (change)="onDriverFileChange($event, 'criminalRecord')"/>
                </label>
                <p class="text-slate-600 text-[10px]">Emitido en los últimos 30 días</p>
              </div>
            </div>

            @if (driverError()) {
              <div class="bg-rose-500/10 border border-rose-500/20 rounded-xl px-4 py-3 text-rose-300 text-xs">{{ driverError() }}</div>
            }
            <button (click)="nextDriverStep(2)"
              class="w-full py-4 rounded-2xl font-black text-sm sm:text-base uppercase tracking-wider bg-gradient-to-r from-cyan-500 to-blue-500 text-black flex items-center justify-center gap-2 active:scale-[0.97] transition-transform">
              Continuar <span class="material-symbols-outlined" style="font-size:18px">arrow_forward</span>
            </button>
          </div>
        }

        <!-- PASO 3: Licencia de Conducción -->
        @if (driverStep() === 3) {
          <div class="flex flex-col gap-4">
            <div class="bg-white/[0.03] border border-white/8 rounded-2xl p-3 sm:p-4 flex flex-col gap-3">
              <h3 class="text-cyan-400 font-black text-xs uppercase tracking-widest flex items-center gap-2">
                <span class="material-symbols-outlined" style="font-size:14px">id_card</span>Licencia de Conducción
              </h3>
              <div class="flex flex-col gap-1">
                <label class="text-slate-400 text-xs font-bold">Número de licencia *</label>
                <input [(ngModel)]="df.licenseNumber" name="d_licenseNumber" placeholder="Número"
                  class="bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm placeholder:text-slate-600 focus:outline-none focus:border-cyan-500/50 transition-colors w-full"/>
              </div>
              <div class="flex flex-col gap-1">
                <label class="text-slate-400 text-xs font-bold">Categoría *</label>
                <select [(ngModel)]="df.licenseCategory" name="d_licenseCategory"
                  class="bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-cyan-500/50 transition-colors w-full">
                  <option value="" class="bg-zinc-900">Seleccionar</option>
                  <option value="B1" class="bg-zinc-900">B1 — Automóvil</option>
                  <option value="B2" class="bg-zinc-900">B2 — Camioneta</option>
                  <option value="B3" class="bg-zinc-900">B3 — Microbús</option>
                  <option value="C1" class="bg-zinc-900">C1 — Motocicleta</option>
                  <option value="C2" class="bg-zinc-900">C2 — Mototriciclo</option>
                </select>
              </div>
              <div class="flex flex-col gap-1">
                <label class="text-slate-400 text-xs font-bold">Fecha de vencimiento *</label>
                <input [(ngModel)]="df.licenseExpiry" name="d_licenseExpiry" type="date"
                  class="bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-cyan-500/50 transition-colors w-full"/>
              </div>
              <div class="flex flex-col gap-1">
                <label class="text-slate-400 text-xs font-bold">Foto frontal de la licencia *</label>
                <label class="flex items-center gap-3 border border-dashed border-white/10 rounded-xl px-3 py-2.5 cursor-pointer hover:border-cyan-500/40 active:border-cyan-500/40 transition-colors">
                  <span class="material-symbols-outlined text-slate-500" style="font-size:20px">upload</span>
                  <span class="text-slate-500 text-xs flex-1 truncate">{{ df.licensePhoto || 'Toca para subir foto' }}</span>
                  @if (df.licensePhoto) { <span class="material-symbols-outlined text-emerald-400" style="font-size:16px">check_circle</span> }
                  <input type="file" accept="image/*" class="hidden" (change)="onDriverFileChange($event, 'licensePhoto')"/>
                </label>
              </div>
              <div class="flex flex-col gap-1">
                <label class="text-slate-400 text-xs font-bold">Foto trasera de la licencia *</label>
                <label class="flex items-center gap-3 border border-dashed border-white/10 rounded-xl px-3 py-2.5 cursor-pointer hover:border-cyan-500/40 active:border-cyan-500/40 transition-colors">
                  <span class="material-symbols-outlined text-slate-500" style="font-size:20px">upload</span>
                  <span class="text-slate-500 text-xs flex-1 truncate">{{ df.licenseBack || 'Toca para subir foto' }}</span>
                  @if (df.licenseBack) { <span class="material-symbols-outlined text-emerald-400" style="font-size:16px">check_circle</span> }
                  <input type="file" accept="image/*" class="hidden" (change)="onDriverFileChange($event, 'licenseBack')"/>
                </label>
              </div>
            </div>

            @if (driverError()) {
              <div class="bg-rose-500/10 border border-rose-500/20 rounded-xl px-4 py-3 text-rose-300 text-xs">{{ driverError() }}</div>
            }
            <button (click)="nextDriverStep(3)"
              class="w-full py-4 rounded-2xl font-black text-sm sm:text-base uppercase tracking-wider bg-gradient-to-r from-cyan-500 to-blue-500 text-black flex items-center justify-center gap-2 active:scale-[0.97] transition-transform">
              Continuar <span class="material-symbols-outlined" style="font-size:18px">arrow_forward</span>
            </button>
          </div>
        }

        <!-- PASO 4: Vehículo y Documentos -->
        @if (driverStep() === 4) {
          <div class="flex flex-col gap-4">
            <div class="bg-white/[0.03] border border-white/8 rounded-2xl p-3 sm:p-4 flex flex-col gap-3">
              <h3 class="text-cyan-400 font-black text-xs uppercase tracking-widest flex items-center gap-2">
                <span class="material-symbols-outlined" style="font-size:14px">directions_car</span>Datos del Vehículo
              </h3>
              <div class="grid grid-cols-2 gap-2 sm:gap-3">
                <div class="flex flex-col gap-1">
                  <label class="text-slate-400 text-xs font-bold">Placa *</label>
                  <input [(ngModel)]="df.plate" name="d_plate" placeholder="ABC123"
                    class="bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm placeholder:text-slate-600 focus:outline-none focus:border-cyan-500/50 transition-colors uppercase w-full"/>
                </div>
                <div class="flex flex-col gap-1">
                  <label class="text-slate-400 text-xs font-bold">Tipo *</label>
                  <select [(ngModel)]="df.vehicleType" name="d_vehicleType"
                    class="bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-cyan-500/50 transition-colors w-full">
                    <option value="" class="bg-zinc-900">Seleccionar</option>
                    <option value="sedan" class="bg-zinc-900">Sedán</option>
                    <option value="suv" class="bg-zinc-900">SUV</option>
                    <option value="hatchback" class="bg-zinc-900">Hatchback</option>
                    <option value="moto" class="bg-zinc-900">Moto</option>
                    <option value="van" class="bg-zinc-900">Van</option>
                  </select>
                </div>
              </div>
              <div class="grid grid-cols-2 gap-2 sm:gap-3">
                <div class="flex flex-col gap-1">
                  <label class="text-slate-400 text-xs font-bold">Marca *</label>
                  <input [(ngModel)]="df.vehicleBrand" name="d_vehicleBrand" placeholder="Toyota"
                    class="bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm placeholder:text-slate-600 focus:outline-none focus:border-cyan-500/50 transition-colors w-full"/>
                </div>
                <div class="flex flex-col gap-1">
                  <label class="text-slate-400 text-xs font-bold">Modelo *</label>
                  <input [(ngModel)]="df.vehicleModel" name="d_vehicleModel" placeholder="Corolla"
                    class="bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm placeholder:text-slate-600 focus:outline-none focus:border-cyan-500/50 transition-colors w-full"/>
                </div>
              </div>
              <div class="grid grid-cols-2 gap-2 sm:gap-3">
                <div class="flex flex-col gap-1">
                  <label class="text-slate-400 text-xs font-bold">Año *</label>
                  <input [(ngModel)]="df.vehicleYear" name="d_vehicleYear" type="number" placeholder="2020" min="2000"
                    class="bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm placeholder:text-slate-600 focus:outline-none focus:border-cyan-500/50 transition-colors w-full"/>
                </div>
                <div class="flex flex-col gap-1">
                  <label class="text-slate-400 text-xs font-bold">Color *</label>
                  <input [(ngModel)]="df.vehicleColor" name="d_vehicleColor" placeholder="Blanco"
                    class="bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm placeholder:text-slate-600 focus:outline-none focus:border-cyan-500/50 transition-colors w-full"/>
                </div>
              </div>
              @for (f of vehiclePhotoFields; track f.key) {
                <div class="flex flex-col gap-1">
                  <label class="text-slate-400 text-xs font-bold">{{ f.label }} *</label>
                  <label class="flex items-center gap-3 border border-dashed border-white/10 rounded-xl px-4 py-3 cursor-pointer hover:border-cyan-500/40 transition-colors">
                    <span class="material-symbols-outlined text-slate-500" style="font-size:22px">upload</span>
                    <span class="text-slate-500 text-xs flex-1">{{ dfr[f.key] || 'Toca para subir foto' }}</span>
                    @if (dfr[f.key]) { <span class="material-symbols-outlined text-emerald-400" style="font-size:18px">check_circle</span> }
                    <input type="file" accept="image/*" class="hidden" (change)="onDriverFileChange($event, f.key)"/>
                  </label>
                </div>
              }
            </div>

            <div class="bg-white/[0.03] border border-white/8 rounded-2xl p-3 sm:p-4 flex flex-col gap-3">
              <h3 class="text-cyan-400 font-black text-xs uppercase tracking-widest flex items-center gap-2">
                <span class="material-symbols-outlined" style="font-size:14px">description</span>Documentos del Vehículo
              </h3>
              @for (f of vehicleDocFields; track f.key) {
                <div class="flex flex-col gap-2">
                  <label class="text-slate-400 text-xs font-bold">{{ f.label }} *</label>
                  @if (f.expiry) {
                    <input [(ngModel)]="dfr[f.expiry]" [name]="'d_' + f.expiry" type="date"
                      class="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white text-xs focus:outline-none focus:border-cyan-500/50 transition-colors w-full"/>
                  }
                  <label class="flex items-center gap-3 border border-dashed border-white/10 rounded-xl px-3 py-2.5 cursor-pointer hover:border-cyan-500/40 active:border-cyan-500/40 transition-colors">
                    <span class="material-symbols-outlined text-slate-500" style="font-size:20px">upload</span>
                    <span class="text-slate-500 text-xs flex-1 truncate">{{ dfr[f.key] || 'Subir foto / documento' }}</span>
                    @if (dfr[f.key]) { <span class="material-symbols-outlined text-emerald-400" style="font-size:16px">check_circle</span> }
                    <input type="file" accept="image/*,application/pdf" class="hidden" (change)="onDriverFileChange($event, f.key)"/>
                  </label>
                </div>
              }
            </div>

            <!-- Términos -->
            <label class="flex items-start gap-3 cursor-pointer px-1">
              <input [(ngModel)]="df.terms" name="d_terms" type="checkbox" class="mt-1 accent-cyan-500 flex-shrink-0"/>
              <span class="text-slate-400 text-xs leading-relaxed">Acepto los <span class="text-cyan-400 font-bold">Términos y Condiciones</span>, confirmo que la información es verídica y entiendo que seré verificado antes de ser aprobado. *</span>
            </label>

            @if (driverError()) {
              <div class="bg-rose-500/10 border border-rose-500/20 rounded-xl px-4 py-3 text-rose-300 text-xs">{{ driverError() }}</div>
            }

            <button (click)="submitDriver()" [disabled]="driverLoading()"
              class="w-full py-4 rounded-2xl font-black text-sm sm:text-base uppercase tracking-wider bg-gradient-to-r from-cyan-500 to-blue-500 text-black disabled:opacity-50 flex items-center justify-center gap-2 active:scale-[0.97] transition-transform">
              @if (driverLoading()) {
                <span class="material-symbols-outlined animate-spin" style="font-size:18px">autorenew</span> Enviando...
              } @else {
                <span class="material-symbols-outlined" style="font-size:18px">send</span> Enviar solicitud
              }
            </button>
          </div>
        }
      }
    </div>
  }

  <!-- ═══════════ MODAL CALIFICACIÓN ═══════════ -->
  @if (ratingModal()) {
    <div class="fixed inset-0 z-50 flex items-end justify-center pb-0"
      style="background:rgba(0,0,0,0.6);backdrop-filter:blur(4px)">
      <div class="w-full max-w-lg rounded-t-3xl flex flex-col gap-5 p-6 pb-10"
        style="background:#0f1421;border-top:1px solid rgba(255,255,255,0.1)">

        @if (ratingSkipped()) {
          <!-- Confirmación de skip -->
          <div class="flex flex-col items-center gap-3 py-4 text-center">
            <span class="material-symbols-outlined text-emerald-400" style="font-size:48px">check_circle</span>
            <p class="text-white font-black text-lg">¡Viaje finalizado!</p>
            <p class="text-slate-500 text-sm">Gracias por usar Movi</p>
            <button (click)="closeRatingModal()"
              class="mt-2 px-8 py-3 rounded-xl text-white font-black text-sm"
              style="background:linear-gradient(135deg,#f97316,#fb923c)">
              Cerrar
            </button>
          </div>
        } @else {
          <!-- Handle -->
          <div class="flex justify-center -mt-2 mb-1">
            <div class="w-10 h-1 rounded-full" style="background:rgba(255,255,255,0.2)"></div>
          </div>

          <div class="flex flex-col items-center gap-1 text-center">
            <p class="text-slate-400 text-xs uppercase tracking-widest font-bold">Calificar (opcional)</p>
            <p class="text-white font-black text-xl">
              {{ ratingTarget()?.role === 'driver' ? '¿Cómo fue tu conductor?' : '¿Cómo fue el pasajero?' }}
            </p>
            <p class="text-slate-400 text-sm">{{ ratingTarget()?.name }}</p>
          </div>

          <!-- Estrellas -->
          <div class="flex justify-center gap-3">
            @for (s of [1,2,3,4,5]; track s) {
              <button (click)="ratingStars.set(s)" class="transition-transform active:scale-90"
                [style.transform]="ratingStars() >= s ? 'scale(1.15)' : 'scale(1)'">
                <span class="material-symbols-outlined"
                  style="font-size:40px"
                  [style.color]="ratingStars() >= s ? '#f59e0b' : 'rgba(255,255,255,0.15)'">
                  {{ ratingStars() >= s ? 'star' : 'star_border' }}
                </span>
              </button>
            }
          </div>

          <!-- Label estrellas -->
          @if (ratingStars() > 0) {
            <p class="text-center text-sm font-bold"
              [class]="ratingStars() >= 4 ? 'text-amber-400' : ratingStars() === 3 ? 'text-slate-300' : 'text-rose-400'">
              {{ ratingStars() === 1 ? 'Muy malo' : ratingStars() === 2 ? 'Malo' : ratingStars() === 3 ? 'Regular' : ratingStars() === 4 ? 'Bueno' : '¡Excelente!' }}
            </p>
          }

          <!-- Comentario -->
          <textarea [(ngModel)]="ratingCommentValue" placeholder="Comentario opcional..."
            rows="2"
            class="w-full rounded-2xl px-4 py-3 text-sm text-white placeholder-slate-600 resize-none focus:outline-none"
            style="background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1)"></textarea>

          <!-- Botones -->
          <div class="flex gap-3">
            <button (click)="skipRating()"
              class="flex-1 py-3 rounded-xl text-slate-400 text-sm font-bold transition-all active:scale-[0.98]"
              style="background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.08)">
              Omitir
            </button>
            <button (click)="submitRating()"
              [disabled]="ratingStars() === 0 || submittingRating()"
              class="flex-[2] py-3 rounded-xl text-white text-sm font-black transition-all active:scale-[0.98] disabled:opacity-40 flex items-center justify-center gap-2"
              style="background:linear-gradient(135deg,#f59e0b,#d97706)">
              @if (submittingRating()) {
                <span class="material-symbols-outlined animate-spin" style="font-size:16px">autorenew</span>
              } @else {
                <span class="material-symbols-outlined" style="font-size:16px">star</span>
              }
              Enviar calificación
            </button>
          </div>
        }
      </div>
    </div>
  }

  <!-- ═══ MODAL CHAT ═══ -->
  @if (showChatModal()) {
    <div class="fixed inset-0 z-[200] flex flex-col">
      <div class="absolute inset-0 bg-black/80" (click)="closeChatModal()"></div>
      <div class="relative flex flex-col w-full max-w-md mx-auto mt-auto sm:my-auto bg-[#0d0d0d] rounded-t-2xl sm:rounded-2xl border border-white/10 shadow-2xl overflow-hidden"
           style="max-height:80vh" (click)="$event.stopPropagation()">

        <!-- Header -->
        <div class="flex items-center justify-between px-4 py-3 border-b border-white/10 flex-shrink-0"
          style="background:linear-gradient(135deg,#2563eb,#3b82f6)">
          <div class="flex items-center gap-2">
            <span class="material-symbols-outlined text-white" style="font-size:20px">chat</span>
            <p class="text-white font-black text-sm">Chat del viaje</p>
          </div>
          <button (click)="closeChatModal()" class="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
            <span class="material-symbols-outlined text-white" style="font-size:18px">close</span>
          </button>
        </div>

        <!-- Mensajes -->
        <div class="flex-1 overflow-y-auto p-4 space-y-2" style="min-height:200px">
          @if (chatMessages().length === 0) {
            <div class="flex flex-col items-center justify-center py-10 text-center">
              <span class="material-symbols-outlined text-slate-700" style="font-size:40px">chat_bubble_outline</span>
              <p class="text-slate-500 text-sm mt-2">Sin mensajes aún</p>
              <p class="text-slate-600 text-xs">Envía un mensaje para comunicarte</p>
            </div>
          } @else {
            @for (msg of chatMessages(); track msg.id) {
              <div class="flex" [class]="isMyChatMessage(msg) ? 'justify-end' : 'justify-start'">
                <div class="max-w-[75%] rounded-2xl px-3 py-2"
                  [class]="isMyChatMessage(msg) ? 'bg-blue-600 text-white rounded-br-sm' : 'bg-white/10 text-white rounded-bl-sm'">
                  <p class="text-sm leading-relaxed">{{ msg.message }}</p>
                  <p class="text-[9px] mt-0.5 opacity-60">{{ formatChatTime(msg.created_at) }}</p>
                </div>
              </div>
            }
          }
        </div>

        <!-- Input -->
        <div class="flex items-center gap-2 px-3 py-3 border-t border-white/10 flex-shrink-0" style="background:#111">
          <input [(ngModel)]="chatInput" name="chatInput"
            placeholder="Escribe un mensaje..."
            (keydown.enter)="sendChatMsg()"
            class="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm placeholder:text-slate-600 focus:outline-none focus:border-blue-500/50"/>
          <button (click)="sendChatMsg()" [disabled]="!chatInput.trim() || chatSending()"
            class="w-10 h-10 rounded-xl bg-blue-600 hover:bg-blue-500 flex items-center justify-center transition-all disabled:opacity-40">
            @if (chatSending()) {
              <span class="material-symbols-outlined text-white animate-spin" style="font-size:18px">sync</span>
            } @else {
              <span class="material-symbols-outlined text-white" style="font-size:18px">send</span>
            }
          </button>
        </div>
      </div>
    </div>
  }

</div>
  `,
})
export class AndaGanaComponent implements OnInit, OnDestroy {

  private readonly agService  = inject(AndaGanaService);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly route      = inject(ActivatedRoute);
  private readonly supabase   = getSupabaseClient();
  private referredBy: string | null = null;

  screen     = signal<AgScreen>('splash');
  splashSize = signal(10);
  driverStep = signal<number>(1);

  // Perfil actual
  agProfile             = signal<AgUser | null>(null);
  driverData            = signal<any>(null);
  driverStatus          = signal<string>('');
  driverRejectionReason = signal<string | null>(null);

  // Referidos
  referralCopied     = signal(false);
  agReferralLink     = signal('');
  referralBalance    = signal(0);
  referralTotalEarned = signal(0);
  referralCount      = signal(0);
  referralTransactions = signal<any[]>([]);

  // Mapa / GPS
  gpsStatus      = signal<GpsStatus>('idle');
  currentAddress = signal('');
  addressLoading = signal(false);
  addressEditMode    = signal(false);
  addressQuery       = signal('');
  addressSuggestions = signal<any[]>([]);
  addressNoResults   = signal(false);  // true cuando la búsqueda terminó sin resultados
  originEditOpen     = signal(false);  // edición inline del punto de origen

  // Trip request
  tripOpen        = signal(false);
  tripQuery       = signal('');
  tripSuggestions = signal<any[]>([]);
  tripNoResults   = signal(false);
  tripDest        = signal<{ name: string; lat: number; lng: number } | null>(null);
  tripVehicle     = signal<'carro' | 'moto'>('carro');
  tripPrice       = signal(0);
  tripPayment     = signal<AgPaymentMethod>('efectivo');
  tripDistKm      = signal(0);
  tripSending     = signal(false);
  tripSent        = signal(false);
  // Pantalla de espera estilo inDrive
  waitingDriverCount  = signal(0);
  waitingDriverColors = signal<string[]>([]);
  waitingCountdown    = signal(90);
  waitingProgress     = signal(0);
  autoAccept          = signal(false);
  // Offer system — passenger
  currentTripRequestId = signal<string | null>(null);
  receivedOffers       = signal<AgTripOffer[]>([]);
  acceptingOfferId     = signal<string | null>(null);
  tripAccepted         = signal<AgTripOffer | null>(null);
  // Offer system — driver
  driverRequests       = signal<AgTripRequest[]>([]);
  driverRequestsOpen   = signal(false);
  makingOfferFor       = signal<AgTripRequest | null>(null);
  driverOfferPrice     = signal(0);
  sendingOffer         = signal(false);
  offerSentFor         = signal<Set<string>>(new Set());
  // Commission + wallet — driver
  driverCommissionPct  = signal(0);
  driverWalletBalance  = signal(0);
  // Rating
  ratingModal      = signal(false);
  ratingStars      = signal(0);
  ratingCommentValue = '';
  submittingRating = signal(false);
  ratingSkipped    = signal(false);
  ratingTarget     = signal<{ userId: string; name: string; role: 'driver' | 'passenger' } | null>(null);
  ratingTripId     = signal<string | null>(null);
  // Driver active trips (accepted offers)
  driverActiveTrips = signal<any[]>([]);
  // Driver menu sections
  driverSection      = signal<string | null>(null);
  loadingSection     = signal(false);
  driverOnline       = signal(false);
  togglingOnline     = signal(false);
  driverStats        = signal<{ avgRating: number; completedTrips: number } | null>(null);
  driverCompletedTrips = signal<any[]>([]);
  driverEarnings     = signal<{ total: number; walletHistory: any[] }>({ total: 0, walletHistory: [] });
  driverPrefs        = signal({ maxDistance: 20, acceptsPets: false, acceptsLuggage: true, acceptsChildSeat: false });
  driverSettings     = signal({ hidePhone: false, notifySound: true, notifyVibration: true });
  savingPrefs        = signal(false);
  savingSettings     = signal(false);
  // Wallet recharge via ePayco
  rechargeAmount     = signal(0);
  rechargeCustom     = '';
  rechargeLoading    = signal(false);
  rechargeError      = signal<string | null>(null);
  panicActivated     = signal(false);
  panicSending       = signal(false);
  panicContactsNotified = signal(0);
  panicMapsLink      = signal<string>('');
  pushSupported      = signal(false);
  pushEnabled        = signal(false);

  // Cupón
  couponInput        = '';
  appliedCoupon      = signal<{ couponId: string; discount: number; title: string; description?: string } | null>(null);
  validatingCoupon   = signal(false);
  couponError        = signal<string | null>(null);

  // Surge
  surgeMultiplier    = signal(1);
  surgeZoneId        = signal<string | null>(null);

  // Llamadas enmascaradas
  callingDriver      = signal(false);

  // Driver analytics
  analyticsPeriodDriver = signal(30);
  driverAnalytics       = signal<any | null>(null);
  driverDailyEarnings   = signal<{ day: string; trips: number; earnings: number }[]>([]);

  // Quests + vehicles + blacklist + tutorial
  quests      = signal<any[]>([]);
  myVehicles  = signal<any[]>([]);
  blacklist   = signal<any[]>([]);
  addingVehicle = signal(false);
  newVehicle = { vehicle_type: 'carro', plate: '', brand: '', model: '', color: '', year: new Date().getFullYear() };

  readonly tutorialSteps = [
    { icon: 'directions_car', title: '1. Antes de salir', body: 'Revisa SOAT vigente, tecnomecánica, combustible y limpieza del vehículo. Los pasajeros califican todo.' },
    { icon: 'wifi_tethering', title: '2. Ponte en línea', body: 'Activa el botón verde de "En línea" cuando estés listo para trabajar. Necesitas GPS activado y permiso de ubicación.' },
    { icon: 'local_offer', title: '3. Recibes solicitudes', body: 'Verás solicitudes cercanas con precio sugerido. Puedes aceptar el precio del pasajero o hacer una contraoferta.' },
    { icon: 'navigation', title: '4. Navega con Google Maps', body: 'Usa el botón "Origen" para ir a recoger, y "Destino" para llegar al final del viaje. El pasajero verá tu ubicación en tiempo real.' },
    { icon: 'person_check', title: '5. Recoge al pasajero', body: 'Cuando el pasajero se suba, toca "Pasajero a bordo" para avanzar el estado.' },
    { icon: 'check_circle', title: '6. Finaliza y cobra', body: 'Al terminar el viaje, toca "Finalizar". Si el pago es efectivo, cobra antes de bajarlo. Si es digital, confirma con el pasajero por chat.' },
    { icon: 'star', title: '7. Califica al pasajero', body: 'Después de cada viaje, califica al pasajero. Esto nos ayuda a proteger a conductores como tú.' },
    { icon: 'emergency', title: '🚨 Botón de pánico', body: 'En caso de emergencia, usa el botón rojo. Enviaremos alerta a tus contactos con tu ubicación actual.' },
  ];

  // Driver withdrawals
  wdAmount: number | null = null;
  wdMethod: 'bank'|'nequi'|'daviplata'|'efectivo' = 'bank';
  wdAccount = '';
  wdLoading          = signal(false);
  wdMsg              = signal<string | null>(null);
  driverWithdrawals  = signal<any[]>([]);

  // ── Documentos del conductor ─────────────────────────
  driverDocs         = signal<any[]>([]);
  readonly docTypes: Array<{ key: string; label: string; requiresExpiry: boolean; icon: string }> = [
    { key: 'license',        label: 'Licencia de conducción', requiresExpiry: true,  icon: 'badge' },
    { key: 'soat',           label: 'SOAT',                   requiresExpiry: true,  icon: 'health_and_safety' },
    { key: 'tecnomecanica',  label: 'Tecnomecánica',          requiresExpiry: true,  icon: 'build' },
    { key: 'cedula',         label: 'Cédula',                 requiresExpiry: false, icon: 'fingerprint' },
    { key: 'vehicle_front',  label: 'Vehículo — frente',      requiresExpiry: false, icon: 'directions_car' },
    { key: 'vehicle_back',   label: 'Vehículo — atrás',       requiresExpiry: false, icon: 'directions_car' },
    { key: 'insurance',      label: 'Seguro (opcional)',      requiresExpiry: true,  icon: 'verified_user' },
  ];
  uploadingDoc       = signal<string | null>(null);
  docExpiryInput: Record<string, string> = {};
  docNumberInput: Record<string, string> = {};

  // ── Métricas performance ─────────────────────────────
  driverMetrics      = signal<{
    acceptance_rate: number; cancellation_rate: number; completion_rate: number;
    offers_seen: number; offers_made: number;
    trips_accepted: number; trips_cancelled: number; trips_completed: number;
    window_start: string;
  } | null>(null);

  // ── Detalle de viaje ─────────────────────────────────
  tripDetailOpen     = signal(false);
  tripDetail         = signal<any | null>(null);
  loadingTripDetail  = signal(false);

  // ── Auto-aceptar ─────────────────────────────────────
  autoAcceptCfg      = signal({ enabled: false, minPrice: 5000, maxDistance: 5 });
  savingAutoAccept   = signal(false);

  // ── Objetos perdidos ─────────────────────────────────
  lostItems          = signal<any[]>([]);
  newLostDesc        = '';
  newLostTripId      = signal<string | null>(null);
  newLostPhoto: File | null = null;
  submittingLost     = signal(false);

  // ── Viajes programados ───────────────────────────────
  availableScheduledTrips = signal<any[]>([]);
  myScheduledTrips        = signal<any[]>([]);
  claimingScheduledId     = signal<string | null>(null);

  // ── Rating pasajero (post-viaje) ─────────────────────
  passengerRatingModal = signal(false);
  passengerRatingStars = signal(0);
  passengerRatingTags  = signal<Set<string>>(new Set());
  passengerRatingComment = '';
  submittingPassengerRating = signal(false);
  pendingRatingTrip    = signal<any | null>(null);
  readonly passengerRatingTagOptions = [
    { key: 'amable',    label: 'Amable' },
    { key: 'puntual',   label: 'Puntual' },
    { key: 'limpio',    label: 'Limpio' },
    { key: 'respetuoso', label: 'Respetuoso' },
    { key: 'buena_conversacion', label: 'Buena conversación' },
    { key: 'propina',   label: 'Dejó propina' },
    { key: 'grosero',   label: 'Grosero' },
    { key: 'impuntual', label: 'Impuntual' },
    { key: 'maltrato',  label: 'Maltrato' },
  ];

  wdPlaceholder(): string {
    const m = this.wdMethod;
    if (m === 'bank') return 'Ej: Bancolombia 1234567890';
    if (m === 'nequi' || m === 'daviplata') return '+57 300 1234567';
    return 'Opcional';
  }

  // Driver analytics
  async setAnalyticsPeriod(days: number): Promise<void> {
    this.analyticsPeriodDriver.set(days);
    await this.loadDriverAnalytics();
  }

  async loadDriverAnalytics(): Promise<void> {
    const d = this.driverData();
    if (!d) return;
    const days = this.analyticsPeriodDriver();
    const [a, series] = await Promise.all([
      this.agService.getDriverAnalytics(d.id, days),
      this.agService.getDriverDailyEarnings(d.id, Math.min(days, 30)),
    ]);
    this.driverAnalytics.set(a);
    this.driverDailyEarnings.set(series);
  }

  dailyBarHeight(val: number): number {
    const max = Math.max(...this.driverDailyEarnings().map(d => d.earnings), 1);
    return Math.round((val / max) * 100);
  }

  // Quests
  async loadQuests(): Promise<void> {
    this.quests.set(await this.agService.listQuests());
  }

  // Vehicles
  async loadVehicles(): Promise<void> {
    const d = this.driverData();
    if (!d) return;
    this.myVehicles.set(await this.agService.listVehicles(d.id));
  }

  openAddVehicle(): void { this.addingVehicle.set(!this.addingVehicle()); }

  async saveNewVehicle(): Promise<void> {
    const d = this.driverData();
    if (!d || !this.newVehicle.plate.trim()) return;
    try {
      await this.agService.addVehicle(d.id, {
        vehicle_type: this.newVehicle.vehicle_type,
        brand: this.newVehicle.brand.trim(),
        model: this.newVehicle.model.trim(),
        year: Number(this.newVehicle.year),
        color: this.newVehicle.color.trim(),
        plate: this.newVehicle.plate.trim().toUpperCase(),
      });
      this.newVehicle = { vehicle_type: 'carro', plate: '', brand: '', model: '', color: '', year: new Date().getFullYear() };
      this.addingVehicle.set(false);
      await this.loadVehicles();
    } catch (e: any) { alert('Error: ' + (e?.message ?? 'No se pudo')); }
  }

  async switchVehicle(vehicleId: string): Promise<void> {
    const d = this.driverData();
    if (!d) return;
    await this.agService.setCurrentVehicle(d.id, vehicleId);
    await this.loadVehicles();
  }

  // Blacklist
  async loadBlacklist(): Promise<void> {
    const d = this.driverData();
    if (!d) return;
    this.blacklist.set(await this.agService.listBlacklist(d.id));
  }

  async removeFromBlacklist(id: string): Promise<void> {
    await this.agService.removeFromBlacklist(id);
    await this.loadBlacklist();
  }

  tutorialDone(): boolean {
    return !!((this.driverData() as any)?.tutorial_completed);
  }

  // Tutorial
  async completeTutorial(): Promise<void> {
    const d = this.driverData();
    if (!d) return;
    await this.agService.markTutorialCompleted(d.id);
    if ((d as any).tutorial_completed !== undefined) (d as any).tutorial_completed = true;
    alert('✓ Tutorial completado. ¡Ya puedes trabajar!');
  }

  async requestDriverWithdraw(): Promise<void> {
    const d = this.driverData();
    const amt = Number(this.wdAmount);
    if (!d || !amt || amt < 20000) { this.wdMsg.set('Error: mínimo 20.000 COP'); return; }
    this.wdLoading.set(true);
    this.wdMsg.set(null);
    try {
      await this.agService.requestDriverWithdrawal(d.id, amt, this.wdMethod, { account: this.wdAccount.trim() });
      this.wdMsg.set('Retiro solicitado. Recibirás en 1-3 días hábiles.');
      this.wdAmount = null;
      this.wdAccount = '';
      this.driverWithdrawals.set(await this.agService.listDriverWithdrawals(d.id));
      // Refrescar balance visible (ajustar localmente en memoria)
      (d as any).wallet_balance = ((d as any).wallet_balance ?? 0) - amt;
    } catch (e: any) {
      this.wdMsg.set('Error: ' + (e?.message ?? 'No se pudo'));
    } finally { this.wdLoading.set(false); }
  }
  emergencyContacts  = signal<{ name: string; phone: string }[]>([]);
  newContactName     = '';
  newContactPhone    = '';
  reportIncidentText = '';
  reportPassengerText = '';
  tripService     = signal<'viaje' | 'moto' | 'ciudad' | 'domicilio' | 'fletes'>('viaje');
  agMenuOpen      = signal(false);

  // ── Passenger menu sections ────────────────────────────────────
  passengerSection         = signal<string | null>(null);
  passengerHistory         = signal<any[]>([]);
  passengerHistoryLoading  = signal(false);
  passengerNotifSettings   = signal({ sound: true, vibration: true, newOffers: true });
  passengerSettings        = signal({ hidePhone: false, language: 'es' });
  passengerSecurityContacts = signal<{ name: string; phone: string }[]>([]);
  passengerNewContactName  = '';
  passengerNewContactPhone = '';
  savingPassengerSettings  = signal(false);
  openPassengerFaq         = signal<string | null>(null);

  readonly passengerFaqItems = [
    { q: '¿Cómo solicito un viaje?',       a: 'Toca el botón "¿A dónde vas?" en el mapa, busca tu destino y confirma el precio. Los conductores cercanos recibirán tu solicitud.' },
    { q: '¿Cómo se calcula el precio?',    a: 'El precio se calcula según la distancia del recorrido. Tú propones el precio y los conductores deciden si aceptan.' },
    { q: '¿Puedo cancelar un viaje?',       a: 'Sí, puedes cancelar antes de que un conductor sea asignado. Toca el botón "Cancelar solicitud" en el panel inferior.' },
    { q: '¿Cómo pago?',                    a: 'Puedes pagar en efectivo, Nequi, Daviplata, Bancolombia o tarjeta. Selecciona tu método antes de confirmar el viaje.' },
    { q: '¿Cómo califico al conductor?',   a: 'Al finalizar el viaje aparecerá una pantalla de calificación. Tu opinión ayuda a mantener la calidad del servicio.' },
  ];

  readonly paymentMethods: {
    value: AgPaymentMethod; label: string; icon: string;
    color: string; bgSel: string; colorDark: string; bgDark: string;
  }[] = [
    { value: 'efectivo',    label: 'Efectivo',    icon: 'payments',        color: '#16a34a', bgSel: '#f0fdf4', colorDark: '#4ade80', bgDark: 'rgba(74,222,128,0.08)' },
    { value: 'nequi',       label: 'Nequi',       icon: 'smartphone',      color: '#7c3aed', bgSel: '#faf5ff', colorDark: '#a78bfa', bgDark: 'rgba(167,139,250,0.08)' },
    { value: 'daviplata',   label: 'Daviplata',   icon: 'smartphone',      color: '#dc2626', bgSel: '#fff1f2', colorDark: '#f87171', bgDark: 'rgba(248,113,113,0.08)' },
    { value: 'bancolombia', label: 'Bancolombia', icon: 'account_balance',  color: '#b45309', bgSel: '#fffbeb', colorDark: '#fbbf24', bgDark: 'rgba(251,191,36,0.08)'  },
    { value: 'tarjeta',     label: 'Tarjeta',     icon: 'credit_card',     color: '#0369a1', bgSel: '#f0f9ff', colorDark: '#38bdf8', bgDark: 'rgba(56,189,248,0.08)'  },
  ];

  readonly paymentMethodMap = Object.fromEntries(
    this.paymentMethods.map(p => [p.value, p])
  ) as Record<AgPaymentMethod, typeof this.paymentMethods[0]>;

  /** Helper para obtener método de pago (evita error TS con any) */
  getPaymentInfo(method: unknown) {
    return this.paymentMethodMap[(method as AgPaymentMethod) ?? 'efectivo'] ?? this.paymentMethodMap['efectivo'];
  }

  readonly agMenuItems = [
    { icon: 'location_city',    label: 'Ciudad',                   action: 'service:viaje',    divider: false, section: '' },
    { icon: 'history',          label: 'Historial de solicitudes', action: 'history',           divider: false, section: '' },
    { icon: 'local_shipping',   label: 'Entregas',                 action: 'service:domicilio', divider: false, section: '' },
    { icon: 'directions_bus',   label: 'Ciudad a Ciudad',          action: 'service:ciudad',    divider: false, section: '' },
    { icon: 'airport_shuttle',  label: 'Flete',                    action: 'service:fletes',    divider: false, section: '' },
    { divider: true,  section: 'Ganancias', icon: '', label: '', action: '' },
    { icon: 'card_giftcard',    label: 'Recomienda y Gana',        action: 'referrals',         divider: false, section: '' },
    { divider: true,  section: 'Cuenta', icon: '', label: '', action: '' },
    { icon: 'notifications',    label: 'Notificaciones',           action: 'notifications',     divider: false, section: '' },
    { icon: 'shield',           label: 'Seguridad',                action: 'security',          divider: false, section: '' },
    { icon: 'settings',         label: 'Configuración',            action: 'settings',          divider: false, section: '' },
    { icon: 'help',             label: 'Ayuda',                    action: 'support',           divider: false, section: '' },
    { divider: true,  section: '', icon: '', label: '', action: '' },
    { icon: 'drive_eta',        label: 'Conductor',                action: 'driver',            divider: false, section: '' },
  ];

  readonly rechargePresets = [10000, 20000, 50000, 100000, 200000, 500000];

  readonly driverMenuItems = [
    { icon: 'person',          label: 'Mi Perfil',            action: 'profile',      sectionLabel: 'Principal',     danger: false, divider: false },
    { icon: 'wifi_tethering',  label: 'Estado / En Línea',    action: 'status',       sectionLabel: '',              danger: false, divider: false },
    { icon: 'payments',        label: 'Ganancias',            action: 'earnings',     sectionLabel: '',              danger: false, divider: false },
    { icon: 'route',           label: 'Mis Viajes',           action: 'trips',        sectionLabel: '',              danger: false, divider: false },
    { icon: 'schedule',        label: 'Viajes programados',   action: 'scheduled',    sectionLabel: '',              danger: false, divider: false },
    { icon: 'analytics',       label: 'Analytics',            action: 'analytics',    sectionLabel: '',              danger: false, divider: false },
    { icon: 'insights',        label: 'Rendimiento',          action: 'performance',  sectionLabel: '',              danger: false, divider: false },
    { icon: 'emoji_events',    label: 'Metas y bonos',        action: 'quests',       sectionLabel: '',              danger: false, divider: false },
    { icon: '',                label: '',                     action: '',             sectionLabel: 'Ganancias',     danger: false, divider: true },
    { icon: 'card_giftcard',   label: 'Recomienda y Gana',    action: 'referrals',    sectionLabel: '',              danger: false, divider: false },
    { icon: '',                label: '',                     action: '',             sectionLabel: 'Configuración', danger: false, divider: true },
    { icon: 'description',     label: 'Mis documentos',       action: 'documents',    sectionLabel: '',              danger: false, divider: false },
    { icon: 'tune',            label: 'Preferencias',         action: 'preferences',  sectionLabel: '',              danger: false, divider: false },
    { icon: 'auto_mode',       label: 'Auto-aceptar',         action: 'autoaccept',   sectionLabel: '',              danger: false, divider: false },
    { icon: 'directions_car',  label: 'Mis vehículos',        action: 'vehicles',     sectionLabel: '',              danger: false, divider: false },
    { icon: 'shield',          label: 'Seguridad',            action: 'security',     sectionLabel: '',              danger: false, divider: false },
    { icon: 'block',           label: 'Pasajeros bloqueados', action: 'blacklist',    sectionLabel: '',              danger: false, divider: false },
    { icon: 'inventory_2',     label: 'Objetos olvidados',    action: 'lost',         sectionLabel: '',              danger: false, divider: false },
    { icon: 'support_agent',   label: 'Soporte',              action: 'support',      sectionLabel: '',              danger: false, divider: false },
    { icon: 'school',          label: 'Tutorial',             action: 'tutorial',     sectionLabel: '',              danger: false, divider: false },
    { icon: '',                label: '',                     action: '',             sectionLabel: '',              danger: false, divider: true },
    { icon: 'logout',          label: 'Cerrar Sesión',        action: 'logout',       sectionLabel: '',              danger: true,  divider: false },
  ];

  driverMenuOpen = signal(false);

  private _map:             any    = null;
  private _userMarker:      any    = null;
  private _vehicleMarkers:  any[]  = [];
  private _vehicleStates: Array<{
    path: [number, number][]; segIdx: number; t: number;
    speed: number; forward: boolean; marker: any; heading: number;
  }> = [];
  private _animFrame: number | null = null;
  private _lastTs:    number | null = null;
  private _waitingInterval: ReturnType<typeof setInterval> | null = null;
  private _offerChannel: RealtimeChannel | null = null;
  private _mapboxPromise:   Promise<void> | null = null;
  private _searchDebounce:  ReturnType<typeof setTimeout> | null = null;
  private _tripDebounce:    ReturnType<typeof setTimeout> | null = null;
  private _destMarker:      any = null;
  private _currentLat = 4.6097;
  private _currentLng = -74.0817;
  private readonly MAPBOX_TOKEN = environment.andaGana.mapboxToken;
  private readonly GOOGLE_PLACES_KEY = (environment.andaGana as any).googlePlacesKey ?? '';
  private readonly DEFAULT_LAT  = 4.6097;
  private readonly DEFAULT_LNG  = -74.0817;

  firstName() { return this.agProfile()?.full_name?.split(' ')[0] ?? ''; }

  // ── Lifecycle ────────────────────────────────���─────────────────
  async ngOnInit() {
    // Capturar referido desde query param ?ref=
    this.referredBy = this.route.snapshot.queryParamMap.get('ref');

    // Detectar soporte push y estado
    this.checkPushSupport();

    // Cargar surge actual
    this.agService.currentSurge().then(s => this.surgeMultiplier.set(s)).catch(() => {});

    // Splash: logo empieza en 10px y crece lentamente hasta llenar la pantalla
    if (isPlatformBrowser(this.platformId)) {
      const maxDim = Math.max(window.innerWidth, window.innerHeight) * 1.6;
      setTimeout(() => this.splashSize.set(maxDim), 50);
    }

    const profile = await this.agService.getMyAgProfile();
    this.agProfile.set(profile);
    if (profile && isPlatformBrowser(this.platformId)) {
      this.agReferralLink.set(`${window.location.origin}/anda-gana?ref=${profile.id}`);
    }

    // Esperar a que la animación del splash termine (3.8s)
    await new Promise(r => setTimeout(r, 3800));

    if (!profile) { this.screen.set('home'); return; }

    // Cargar datos de billetera de retiro
    this.loadReferralData();

    if (profile.role === 'passenger') {
      this.screen.set('passenger-home');
      // Suscribirse a ubicaciones de conductores en tiempo real
      this._subscribeToDriverLocations();
    } else {
      const drivers = await this.agService.getDrivers();
      const mine = drivers.find(d => d.ag_user_id === profile.id) ?? null;
      this.driverData.set(mine);
      this.driverStatus.set(mine?.status ?? 'pending');
      this.driverRejectionReason.set(mine?.rejection_reason ?? null);
      this.screen.set('driver-home');
      if (mine?.status === 'approved') {
        this._loadDriverRequests(mine.vehicle_type);
        const [pct, balance, activeTrips] = await Promise.all([
          this.agService.getCommissionPct(),
          this.agService.getDriverWalletBalance(mine.id),
          this.agService.getMyAcceptedDriverOffers(),
        ]);
        this.driverCommissionPct.set(pct);
        this.driverWalletBalance.set(balance);
        this.driverActiveTrips.set(activeTrips);
        this.driverOnline.set(mine.is_online ?? false);
        // Si ya estaba online, iniciar tracking GPS
        if (mine.is_online) {
          this.startGpsTracking(mine.id);
        }
      }
    }

    // Iniciar mapa después de que Angular renderice el DOM
    setTimeout(() => this.initGpsAndMap('ag-map-user'), 150);
  }

  private _locationChannel: RealtimeChannel | null = null;

  ngOnDestroy() {
    this._destroyMap();
    this._stopWaiting();
    this._unsubscribeOffers();
    this._unsubscribeChat();
    this.stopGpsTracking();
    this._unsubscribeLocations();
    this._stopTrackingAssignedDriver();
    if (this._driverRefreshInterval) { clearInterval(this._driverRefreshInterval); this._driverRefreshInterval = null; }
  }

  /** Suscribirse a cambios en ubicación de conductores (para el mapa del pasajero) */
  private _subscribeToDriverLocations(): void {
    this._unsubscribeLocations();
    this._locationChannel = this.supabase
      .channel('driver-locations-realtime')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'ag_driver_locations',
      }, (payload: any) => {
        if (!this._map) return;
        const mapboxgl = (window as any).mapboxgl;
        if (!mapboxgl) return;

        const record = payload.new as { driver_id: string; lat: number; lng: number; heading: number } | undefined;
        if (!record) return;

        // Buscar marcador existente o crear uno nuevo
        const existingIdx = this._vehicleMarkers.findIndex((m: any) => m._agDriverId === record.driver_id);
        if (existingIdx >= 0) {
          // Actualizar posición del marcador existente
          this._vehicleMarkers[existingIdx].setLngLat([record.lng, record.lat]);
        } else {
          // Crear nuevo marcador
          const el = this._carElement(record.heading ?? 0, '#10b981');
          const marker = new mapboxgl.Marker({ element: el, anchor: 'center' })
            .setLngLat([record.lng, record.lat])
            .addTo(this._map);
          (marker as any)._agDriverId = record.driver_id;
          this._vehicleMarkers.push(marker);
        }

        // Si fue DELETE, remover marcador
        if (payload.eventType === 'DELETE' && payload.old) {
          const delId = (payload.old as any).driver_id;
          const idx = this._vehicleMarkers.findIndex((m: any) => m._agDriverId === delId);
          if (idx >= 0) {
            try { this._vehicleMarkers[idx].remove(); } catch {}
            this._vehicleMarkers.splice(idx, 1);
          }
        }
      })
      .subscribe();
  }

  private _unsubscribeLocations(): void {
    if (this._locationChannel) {
      this._locationChannel.unsubscribe();
      this._locationChannel = null;
    }
  }

  // ── Mapbox loader (CDN con caché) ──────────────────────────────
  private loadMapbox(): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) return Promise.resolve();
    const w = window as any;
    if (w.mapboxgl) return Promise.resolve();
    if (this._mapboxPromise) return this._mapboxPromise;

    this._mapboxPromise = new Promise<void>((resolve, reject) => {
      // CSS
      if (!document.querySelector('link[href*="mapbox-gl.css"]')) {
        const link = document.createElement('link');
        link.rel  = 'stylesheet';
        link.href = 'https://api.mapbox.com/mapbox-gl-js/v2.15.0/mapbox-gl.css';
        document.head.appendChild(link);
      }
      // JS
      const script = document.createElement('script');
      script.src = 'https://api.mapbox.com/mapbox-gl-js/v2.15.0/mapbox-gl.js';
      script.onload = () => resolve();
      script.onerror = () => {
        this._mapboxPromise = null;
        reject(new Error('No se pudo cargar Mapbox'));
      };
      document.head.appendChild(script);
    });
    return this._mapboxPromise;
  }

  // ── GPS + mapa ─────────────────────────────────────────────────
  async initGpsAndMap(containerId: string) {
    if (!isPlatformBrowser(this.platformId)) return;

    this.gpsStatus.set('requesting');

    let lat = this.DEFAULT_LAT;
    let lng = this.DEFAULT_LNG;

    try {
      // Obtener la mejor ubicación posible usando watchPosition con timeout
      const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
        let bestPos: GeolocationPosition | null = null;
        const watchId = navigator.geolocation.watchPosition(
          (p) => {
            // Guardar la mejor lectura (menor accuracy = más preciso)
            if (!bestPos || p.coords.accuracy < bestPos.coords.accuracy) {
              bestPos = p;
            }
            // Si tenemos precisión ≤30m, aceptar de inmediato
            if (p.coords.accuracy <= 30) {
              navigator.geolocation.clearWatch(watchId);
              clearTimeout(timer);
              resolve(p);
            }
          },
          (err) => {
            navigator.geolocation.clearWatch(watchId);
            clearTimeout(timer);
            if (bestPos) resolve(bestPos);
            else reject(err);
          },
          { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
        );
        // Después de 6s, usar la mejor lectura que tengamos
        const timer = setTimeout(() => {
          navigator.geolocation.clearWatch(watchId);
          if (bestPos) resolve(bestPos);
          else reject(new Error('GPS timeout'));
        }, 6000);
      });

      lat = pos.coords.latitude;
      lng = pos.coords.longitude;
      this.gpsStatus.set('granted');
    } catch {
      this.gpsStatus.set('denied');
    }

    this._currentLat = lat;
    this._currentLng = lng;

    // Geocodificación inversa en paralelo con la carga del mapa
    this._reverseGeocode(lat, lng);

    await this.loadMapbox();
    await new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(() => r())));
    this._createMap(containerId, lat, lng);
  }

  retryGps(containerId: string) {
    this._destroyMap();
    this.currentAddress.set('');
    this.initGpsAndMap(containerId);
  }

  // ── Dirección ──────────────────────────────────────────────────
  openOriginEdit() {
    this.addressQuery.set('');
    this.addressSuggestions.set([]);
    this.originEditOpen.set(true);
    setTimeout(() => (document.getElementById('origin-edit-input') as HTMLInputElement | null)?.focus(), 60);
  }

  openAddressEdit() {
    this.addressQuery.set('');
    this.addressSuggestions.set([]);
    this.addressEditMode.set(true);
    // Focus input after render
    setTimeout(() => {
      const el = document.querySelector<HTMLInputElement>('[placeholder="Busca tu dirección o lugar..."]');
      el?.focus();
    }, 50);
  }

  closeAddressEdit() {
    this.addressEditMode.set(false);
    this.addressQuery.set('');
    this.addressSuggestions.set([]);
    if (this._searchDebounce) clearTimeout(this._searchDebounce);
  }

  private _addressAbort: AbortController | null = null;

  onAddressInput(query: string) {
    this.addressQuery.set(query);
    this.addressNoResults.set(false);
    if (this._searchDebounce) clearTimeout(this._searchDebounce);
    if (!query.trim() || query.length < 2) { this.addressSuggestions.set([]); return; }
    this._searchDebounce = setTimeout(() => this._searchPlaces(query), 150);
  }

  private async _searchPlaces(query: string) {
    if (this._addressAbort) this._addressAbort.abort();
    this._addressAbort = new AbortController();
    const sig = this._addressAbort.signal;

    const lat = this._currentLat;
    const lng = this._currentLng;

    // ── Google Places (New) — fuente principal, encuentra conjuntos, edificios, POIs
    const googleUrl = 'https://places.googleapis.com/v1/places:searchText';
    const googleBody = {
      textQuery: query,
      locationBias: { circle: { center: { latitude: lat, longitude: lng }, radius: 30000 } },
      languageCode: 'es',
      maxResultCount: 8,
    };

    // ── Mapbox — complementa con direcciones y calles
    const d = 0.25;
    const bbox = `${lng - d},${lat - d},${lng + d},${lat + d}`;
    const mbxUrl = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json`
      + `?access_token=${this.MAPBOX_TOKEN}&autocomplete=true&language=es`
      + `&country=co&limit=5&types=poi,place,address,neighborhood,locality`
      + `&proximity=${lng},${lat}&bbox=${bbox}`;

    try {
      const [googleRes, mbxRes] = await Promise.all([
        fetch(googleUrl, {
          method: 'POST', signal: sig,
          headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': this.GOOGLE_PLACES_KEY,
            'X-Goog-FieldMask': 'places.displayName,places.formattedAddress,places.location',
          },
          body: JSON.stringify(googleBody),
        }),
        fetch(mbxUrl, { signal: sig }),
      ]);

      const googleJson = await googleRes.json();
      const mbxJson = await mbxRes.json();

      // Convertir Google Places al formato interno
      const googleFeatures = (googleJson.places ?? []).map((p: any, i: number) => {
        const fLat = p.location?.latitude ?? lat;
        const fLng = p.location?.longitude ?? lng;
        return {
          id: `gpl-${i}`,
          text: p.displayName?.text ?? '',
          place_name: p.formattedAddress ?? '',
          center: [fLng, fLat] as [number, number],
          distKm: this._distKm(lat, lng, fLat, fLng),
        };
      });

      // Convertir Mapbox al formato interno
      const mbxFeatures = (mbxJson.features ?? []).map((f: any) => {
        const [fLng, fLat] = f.center ?? [lng, lat];
        return { ...f, id: `mbx-${f.id}`, distKm: this._distKm(lat, lng, fLat, fLng) };
      });

      // Google primero (mejor para POIs/conjuntos), Mapbox complementa
      const seen = new Set<string>();
      const merged: any[] = [];
      for (const f of [...googleFeatures, ...mbxFeatures]) {
        const key = `${(+f.center[0]).toFixed(3)},${(+f.center[1]).toFixed(3)}`;
        if (!seen.has(key)) { seen.add(key); merged.push(f); }
      }
      merged.sort((a, b) => (a.distKm ?? 999) - (b.distKm ?? 999));

      const results = merged.slice(0, 8);
      this.addressSuggestions.set(results);
      this.addressNoResults.set(results.length === 0 && this.addressQuery().trim().length >= 2);
    } catch { /* abortado o sin red */ }
  }

  /** Cierra la búsqueda y deja que el usuario mueva el pin en el mapa */
  useMapPin() {
    this.closeAddressEdit();
    this.originEditOpen.set(false);
  }

  selectAddress(feature: any) {
    const coords: [number, number] = feature.center ?? feature.geometry?.coordinates;
    if (!coords) return;
    const [lng, lat] = coords;
    this.currentAddress.set(feature.place_name ?? feature.text ?? '');
    this._currentLat = lat;
    this._currentLng = lng;
    this.closeAddressEdit();
    this.originEditOpen.set(false);

    if (!this._map) return;

    // Volar al lugar seleccionado
    this._map.flyTo({ center: [lng, lat], zoom: 16, speed: 1.5, essential: true });

    // Mover marcador existente o crear uno nuevo
    if (this._userMarker) {
      this._userMarker.setLngLat([lng, lat]);
    } else {
      const mapboxgl = (window as any).mapboxgl;
      if (mapboxgl) {
        const el = document.createElement('div');
        el.style.cssText = 'width:20px;height:20px;border-radius:50%;background:#FF6600;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.3);';
        this._userMarker = new mapboxgl.Marker({ element: el, anchor: 'center' })
          .setLngLat([lng, lat])
          .addTo(this._map);
      }
    }

    // Si ya hay destino seleccionado, redibujar la ruta desde el nuevo origen
    const dest = this.tripDest();
    if (dest) this._drawRoute(dest.lng, dest.lat);
  }

  async confirmTypedAddress() {
    const q = this.addressQuery().trim();
    if (!q) return;
    // Buscar y seleccionar el primer resultado
    if (this.addressSuggestions().length > 0) {
      this.selectAddress(this.addressSuggestions()[0]);
    } else {
      await this._searchPlaces(q);
      const first = this.addressSuggestions()[0];
      if (first) this.selectAddress(first);
    }
  }

  private async _reverseGeocode(lat: number, lng: number) {
    this.addressLoading.set(true);
    try {
      const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json`
        + `?access_token=${this.MAPBOX_TOKEN}&language=es&types=address,poi,place&limit=1`;
      const res  = await fetch(url);
      const data = await res.json();
      this.currentAddress.set(data.features?.[0]?.place_name ?? '');
    } catch { this.currentAddress.set(''); }
    this.addressLoading.set(false);
  }

  private _createMap(containerId: string, lat: number, lng: number) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const mapboxgl = (window as any).mapboxgl;
    if (!mapboxgl) return;

    // Asegurar dimensiones explícitas antes de crear el mapa
    if (!container.offsetHeight) {
      container.style.height = '520px';
    }
    if (!container.offsetWidth) {
      container.style.width = '100%';
    }

    this._destroyMap();

    mapboxgl.accessToken = this.MAPBOX_TOKEN;
    this._map = new mapboxgl.Map({
      container,
      style:   'mapbox://styles/mapbox/navigation-day-v1',
      center:  [lng, lat],
      zoom:    15,
      attributionControl: false,
      failIfMajorPerformanceCaveat: false,
    });

    this._map.addControl(new mapboxgl.AttributionControl({ compact: true }));
    this._map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'bottom-right');

    this._map.once('load', () => {
      // Cargar vehículos cuando el mapa esté completamente renderizado (tiles listos)
      this._map!.once('idle', () => this._loadVehicleMarkers(lat, lng));

      // Marcador de posición del usuario
      const el = document.createElement('div');
      el.style.cssText = `
        width:32px; height:32px; border-radius:50%;
        background: radial-gradient(circle, #FF6600 0%, rgba(255,102,0,0.3) 60%, transparent 70%);
        border: 2px solid #FF6600;
        box-shadow: 0 0 0 4px rgba(255,102,0,0.2);
        display:flex; align-items:center; justify-content:center;
        animation: pulse-ring 1.5s ease-out infinite;
      `;
      const dot = document.createElement('div');
      dot.style.cssText = 'width:10px;height:10px;border-radius:50%;background:#FF6600;border:2px solid #fff;';
      el.appendChild(dot);

      // Inyectar keyframes una sola vez
      if (!document.getElementById('ag-map-styles')) {
        const style = document.createElement('style');
        style.id = 'ag-map-styles';
        style.textContent = `
          @keyframes pulse-ring {
            0%   { box-shadow: 0 0 0 0px rgba(255,102,0,0.4); }
            100% { box-shadow: 0 0 0 20px rgba(255,102,0,0); }
          }
        `;
        document.head.appendChild(style);
      }

      this._userMarker = new mapboxgl.Marker({ element: el, anchor: 'center', draggable: true })
        .setLngLat([lng, lat])
        .addTo(this._map);

      // Al arrastrar el pin, actualizar ubicación y dirección
      this._userMarker.on('dragend', () => {
        const lngLat = this._userMarker!.getLngLat();
        this._currentLat = lngLat.lat;
        this._currentLng = lngLat.lng;
        this._reverseGeocode(lngLat.lat, lngLat.lng);
      });

      this._map.resize();
      // Centrar el mapa en la ubicación del usuario después de renderizar todo
      setTimeout(() => {
        if (this._map) {
          this._map.flyTo({ center: [lng, lat], zoom: 15, duration: 800 });
        }
      }, 500);
    });
  }

  // ── Vehículos en el mapa ───────────────────────────────────────
  private async _loadVehicleMarkers(lat: number, lng: number) {
    if (!this._map) return;
    const mapboxgl = (window as any).mapboxgl;
    if (!mapboxgl) return;

    this._stopAnimation();
    this._vehicleMarkers.forEach(m => { try { m.remove(); } catch { /**/ } });
    this._vehicleMarkers = [];

    const realVehicles = await this.agService.getNearbyVehicles(lat, lng);

    if (realVehicles.length > 0) {
      // Conductores reales — marcadores estáticos
      realVehicles.forEach((v: any) => {
        const isMoto = v.vehicle_type?.toLowerCase().includes('moto');
        const color  = v.color ?? (isMoto ? '#06B6D4' : '#F59E0B');
        const el     = isMoto ? this._motoElement(v.heading, color) : this._carElement(v.heading, color);
        const m = new mapboxgl.Marker({ element: el, anchor: 'center' })
          .setLngLat([v.lng, v.lat]).addTo(this._map);
        this._vehicleMarkers.push(m);
      });
      return;
    }

    // ── Demo animado — rutas reales por calles (Mapbox Directions API) ──────
    const paths = await this._generateRoadPaths(lat, lng);

    const configs = [
      { isMoto: false, color: '#1D4ED8' },  // azul rey
      { isMoto: false, color: '#DC2626' },  // rojo
      { isMoto: false, color: '#D97706' },  // ámbar oscuro
      { isMoto: false, color: '#15803D' },  // verde oscuro
      { isMoto: false, color: '#1e293b' },  // grafito
      { isMoto: false, color: '#7C3AED' },  // violeta
      { isMoto: false, color: '#0F766E' },  // teal
      { isMoto: true,  color: '#EA580C' },  // naranja
      { isMoto: true,  color: '#0891B2' },  // cyan oscuro
      { isMoto: true,  color: '#16A34A' },  // verde
      { isMoto: true,  color: '#9333EA' },  // púrpura
      { isMoto: true,  color: '#BE185D' },  // rosa oscuro
    ];

    for (let i = 0; i < configs.length; i++) {
      const { isMoto, color } = configs[i];
      const path = paths[i % paths.length];
      // Cada vehículo arranca en un punto diferente del recorrido
      const segIdx = Math.floor((i / configs.length) * (path.length - 1));
      const h0 = this._segHeading(path, segIdx);
      const [lng0, lat0] = path[segIdx];

      const el = isMoto ? this._motoElement(h0, color) : this._carElement(h0, color);
      const marker = new mapboxgl.Marker({ element: el, anchor: 'center' })
        .setLngLat([lng0, lat0]).addTo(this._map!);

      this._vehicleMarkers.push(marker);
      this._vehicleStates.push({
        path,
        segIdx,
        t:       0,
        speed:   isMoto ? 0.00055 : 0.00040,
        forward: true,
        marker,
        heading: h0,
      });
    }

    this._startAnimation();
  }

  /**
   * Genera rutas reales por calles usando la API de Directions de Mapbox.
   * Cada vehículo recibe una ruta circular de 3 waypoints aleatorios cercanos
   * que sigue el trazado real de calles y avenidas.
   */
  private async _generateRoadPaths(lat: number, lng: number): Promise<[number, number][][]> {
    const paths: [number, number][][] = [];
    const angles = [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330];

    const fetchRoute = async (waypoints: [number, number][]): Promise<[number, number][]> => {
      const coords = waypoints.map(w => `${w[0]},${w[1]}`).join(';');
      const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${coords}`
        + `?geometries=geojson&overview=full&access_token=${this.MAPBOX_TOKEN}`;
      try {
        const res = await fetch(url);
        const data = await res.json();
        if (data.routes?.[0]?.geometry?.coordinates) {
          return data.routes[0].geometry.coordinates as [number, number][];
        }
      } catch { /* fallback below */ }
      return [];
    };

    // Generar 12 rutas circulares (ida y vuelta) por calles reales
    const promises = angles.map(async (angle, i) => {
      const rad1 = (angle * Math.PI) / 180;
      const rad2 = ((angle + 120) * Math.PI) / 180;
      const dist = 0.004 + Math.random() * 0.004; // 400-800m aprox
      const dist2 = 0.003 + Math.random() * 0.003;

      const wp1: [number, number] = [lng + Math.cos(rad1) * dist, lat + Math.sin(rad1) * dist];
      const wp2: [number, number] = [lng + Math.cos(rad2) * dist2, lat + Math.sin(rad2) * dist2];

      // Ruta circular: origen → wp1 → wp2 → origen
      const route = await fetchRoute([wp1, wp2, wp1]);
      return route.length >= 2 ? route : null;
    });

    const results = await Promise.all(promises);
    for (const r of results) {
      if (r) paths.push(r);
    }

    // Fallback: si no se obtuvo ninguna ruta, generar rectángulos simples
    if (paths.length === 0) {
      return this._generateFallbackPaths(lat, lng);
    }

    // Rellenar hasta 12 si faltan rutas
    while (paths.length < 12) {
      paths.push(paths[paths.length % paths.length]);
    }

    return paths;
  }

  /** Fallback rectangular si la API de rutas falla */
  private _generateFallbackPaths(lat: number, lng: number): [number, number][][] {
    const N = 30;
    const cw = 0.007;
    const ch = 0.006;
    const cols = 4, rows = 3;
    const startLng = lng - (cols / 2) * cw;
    const startLat = lat - (rows / 2) * ch;

    const cell = (col: number, row: number): [number, number][] => {
      const gap = 0.0002;
      const x0 = startLng + col * cw + gap;
      const y0 = startLat + row * ch + gap;
      const x1 = x0 + cw - gap * 2;
      const y1 = y0 + ch - gap * 2;
      const p: [number, number][] = [];
      for (let i = 0; i < N; i++) p.push([x0 + (x1 - x0) * i / N, y1]);
      for (let i = 0; i < N; i++) p.push([x1, y1 - (y1 - y0) * i / N]);
      for (let i = 0; i < N; i++) p.push([x1 - (x1 - x0) * i / N, y0]);
      for (let i = 0; i < N; i++) p.push([x0, y0 + (y1 - y0) * i / N]);
      p.push(p[0]);
      return p;
    };

    return [
      cell(0, 0), cell(1, 0), cell(2, 0), cell(3, 0),
      cell(0, 1), cell(1, 1), cell(2, 1), cell(3, 1),
      cell(0, 2), cell(1, 2), cell(2, 2), cell(3, 2),
    ];
  }

  private _segHeading(path: [number, number][], segIdx: number): number {
    const i = Math.min(segIdx, path.length - 2);
    return Math.atan2(path[i + 1][0] - path[i][0], path[i + 1][1] - path[i][1]) * 180 / Math.PI;
  }

  private _startAnimation() {
    this._stopAnimation();
    const loop = (ts: number) => {
      if (!this._map) return;
      const dt = this._lastTs === null ? 16 : Math.min(ts - this._lastTs, 50);
      this._lastTs = ts;

      for (const vs of this._vehicleStates) {
        if (vs.path.length < 2) continue;

        // Longitud del segmento actual
        const [x0, y0] = vs.path[vs.segIdx];
        const nx = Math.min(vs.segIdx + 1, vs.path.length - 1);
        const [x1, y1] = vs.path[nx];
        const segLen = Math.sqrt((x1 - x0) ** 2 + (y1 - y0) ** 2) || 1e-9;

        vs.t += (vs.speed * dt) / segLen;

        // Avanzar segmentos en loop continuo (los recorridos son loops cerrados)
        while (vs.t >= 1) {
          vs.t -= 1;
          vs.segIdx = (vs.segIdx + 1) % Math.max(1, vs.path.length - 1);
        }

        // Posición interpolada
        const [cx0, cy0] = vs.path[vs.segIdx];
        const ni = Math.min(vs.segIdx + 1, vs.path.length - 1);
        const [cx1, cy1] = vs.path[ni];
        const curLng = cx0 + vs.t * (cx1 - cx0);
        const curLat = cy0 + vs.t * (cy1 - cy0);

        // Heading objetivo del segmento actual (siempre hacia adelante)
        const targetH = Math.atan2(cx1 - cx0, cy1 - cy0) * 180 / Math.PI;

        // Interpolación suave del ángulo (maneja cruce por ±180°)
        let dH = targetH - vs.heading;
        if (dH > 180)  dH -= 360;
        if (dH < -180) dH += 360;
        // Giro suave proporcional a la velocidad — más rápido = giro más ágil
        vs.heading += dH * Math.min(1, dt * 0.15);

        // No colocar vehículo encima del marcador del usuario
        const uLng = this._currentLng, uLat = this._currentLat;
        if (Math.abs(curLng - uLng) > 0.0006 || Math.abs(curLat - uLat) > 0.0006) {
          vs.marker.setLngLat([curLng, curLat]);
        }
        // Rotar el inner div — el outer lo usa Mapbox para el translate de posición
        const rotEl = vs.marker.getElement().firstElementChild as HTMLElement | null;
        if (rotEl) rotEl.style.transform = `rotate(${vs.heading}deg)`;
      }

      this._animFrame = requestAnimationFrame(loop);
    };
    this._animFrame = requestAnimationFrame(loop);
  }

  private _stopAnimation() {
    if (this._animFrame !== null) { cancelAnimationFrame(this._animFrame); this._animFrame = null; }
    this._lastTs       = null;
    this._vehicleStates = [];
  }

  // ── Íconos estilo inDrive — vista superior (top-down) ────────────────────

  private _carElement(heading: number, color: string): HTMLElement {
    const outer = document.createElement('div');
    outer.style.cssText = 'width:18px;height:30px;';
    const wrap = document.createElement('div');
    wrap.style.cssText = `width:18px;height:30px;transform:rotate(${heading}deg);filter:drop-shadow(0 2px 6px rgba(0,0,0,0.45));will-change:transform;`;
    wrap.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 46" width="18" height="30">
      <!-- Sombra exterior -->
      <ellipse cx="14" cy="44.5" rx="10" ry="2" fill="rgba(0,0,0,0.22)"/>
      <!-- Borde blanco (contraste sobre mapa claro) -->
      <path d="M5,9 C5,4 8,2 14,2 C20,2 23,4 23,9 L23,37 C23,42 20,44 14,44 C8,44 5,42 5,37 Z"
            fill="white" stroke="white" stroke-width="1"/>
      <!-- Carrocería principal -->
      <path d="M6,10 C6,5 9,3 14,3 C19,3 22,5 22,10 L22,36 C22,41 19,43 14,43 C9,43 6,41 6,36 Z"
            fill="${color}"/>
      <!-- Techo (panel central más claro) -->
      <path d="M9,18 C9,16 11,15 14,15 C17,15 19,16 19,18 L19,31 C19,33 17,34 14,34 C11,34 9,33 9,31 Z"
            fill="rgba(255,255,255,0.18)"/>
      <!-- Parabrisas delantero -->
      <path d="M8,10 C8,7 10,6 14,6 C18,6 20,7 20,10 L19,16 C17,18 11,18 9,16 Z"
            fill="rgba(196,232,252,0.88)"/>
      <!-- Reflejo parabrisas -->
      <path d="M9,10 C10,8 11,7 14,7 L13.5,14 C12,13.5 10.5,12.5 9,11 Z"
            fill="rgba(255,255,255,0.35)"/>
      <!-- Luneta trasera -->
      <path d="M9,32 C11,34 17,34 19,32 L19,37 C17,39 11,39 9,37 Z"
            fill="rgba(185,220,245,0.70)"/>
      <!-- Espejos retrovisores -->
      <rect x="2.5" y="20" width="3.5" height="5.5" rx="1.8" fill="${color}" stroke="rgba(255,255,255,0.75)" stroke-width="0.9"/>
      <rect x="22" y="20" width="3.5" height="5.5" rx="1.8" fill="${color}" stroke="rgba(255,255,255,0.75)" stroke-width="0.9"/>
      <!-- Faros delanteros (amarillo-blanco) -->
      <path d="M6.5,7 L9,6 L9,11 L7,10 Z" fill="#FFFDE7"/>
      <path d="M21.5,7 L19,6 L19,11 L21,10 Z" fill="#FFFDE7"/>
      <ellipse cx="7.5" cy="8.5" rx="1.5" ry="1.2" fill="#FDD835"/>
      <ellipse cx="20.5" cy="8.5" rx="1.5" ry="1.2" fill="#FDD835"/>
      <!-- Luces traseras (rojo) -->
      <path d="M6.5,40 L9,41 L9,36 L7,37 Z" fill="#E53935"/>
      <path d="M21.5,40 L19,41 L19,36 L21,37 Z" fill="#E53935"/>
      <ellipse cx="7.5" cy="39" rx="1.5" ry="1.1" fill="#FF5252"/>
      <ellipse cx="20.5" cy="39" rx="1.5" ry="1.1" fill="#FF5252"/>
      <!-- Flecha de dirección (frente del vehículo) -->
      <path d="M14,1 L11,4.5 L14,3.5 L17,4.5 Z" fill="rgba(255,255,255,0.95)"/>
    </svg>`;
    outer.appendChild(wrap);
    return outer;
  }

  private _motoElement(heading: number, color: string): HTMLElement {
    const outer = document.createElement('div');
    outer.style.cssText = 'width:10px;height:24px;';
    const wrap = document.createElement('div');
    wrap.style.cssText = `width:10px;height:24px;transform:rotate(${heading}deg);filter:drop-shadow(0 2px 6px rgba(0,0,0,0.45));will-change:transform;`;
    wrap.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 14 36" width="10" height="24">
      <!-- Sombra exterior -->
      <ellipse cx="7" cy="35" rx="5" ry="1.5" fill="rgba(0,0,0,0.22)"/>
      <!-- Rueda trasera (oscura, pequeña) -->
      <ellipse cx="7" cy="30.5" rx="3.5" ry="3.5" fill="#1e293b"/>
      <ellipse cx="7" cy="30.5" rx="2" ry="2" fill="#334155"/>
      <ellipse cx="7" cy="30.5" rx="0.8" ry="0.8" fill="#64748b"/>
      <!-- Borde blanco carrocería -->
      <path d="M4,8 C4,5 5,3.5 7,3.5 C9,3.5 10,5 10,8 L10,26 C10,28.5 9,30 7,30 C5,30 4,28.5 4,26 Z"
            fill="white"/>
      <!-- Carrocería principal -->
      <path d="M5,9 C5,6 6,4.5 7,4.5 C8,4.5 9,6 9,9 L9,25 C9,27.5 8,29 7,29 C6,29 5,27.5 5,25 Z"
            fill="${color}"/>
      <!-- Piloto (vista desde arriba — casco ovalado) -->
      <ellipse cx="7" cy="18" rx="2.2" ry="2.8" fill="rgba(15,23,42,0.80)"/>
      <ellipse cx="7" cy="17.2" rx="1.2" ry="0.9" fill="rgba(255,255,255,0.22)"/>
      <!-- Manillar -->
      <rect x="1.5" y="11.5" width="11" height="1.8" rx="0.9" fill="#94a3b8"/>
      <rect x="1.5" y="11.5" width="2.5" height="1.8" rx="0.9" fill="#64748b"/>
      <rect x="10" y="11.5" width="2.5" height="1.8" rx="0.9" fill="#64748b"/>
      <!-- Rueda delantera (oscura) -->
      <ellipse cx="7" cy="5.5" rx="3.5" ry="3.5" fill="#1e293b"/>
      <ellipse cx="7" cy="5.5" rx="2" ry="2" fill="#334155"/>
      <ellipse cx="7" cy="5.5" rx="0.8" ry="0.8" fill="#64748b"/>
      <!-- Faro delantero -->
      <ellipse cx="7" cy="2.8" rx="2" ry="1.3" fill="#FFFDE7"/>
      <ellipse cx="7" cy="2.8" rx="1.1" ry="0.7" fill="#FDD835"/>
      <!-- Flecha de dirección -->
      <path d="M7,1 L5.2,3.5 L7,2.8 L8.8,3.5 Z" fill="rgba(255,255,255,0.95)"/>
      <!-- Luz trasera -->
      <ellipse cx="7" cy="33" rx="1.8" ry="1.3" fill="#E53935"/>
      <ellipse cx="7" cy="33" rx="1" ry="0.7" fill="#FF5252"/>
    </svg>`;
    outer.appendChild(wrap);
    return outer;
  }

  private _destroyMap() {
    this._stopAnimation();
    this._clearRoute();
    this._vehicleMarkers.forEach(m => { try { m.remove(); } catch { /**/ } });
    this._vehicleMarkers = [];
    this._userMarker = null;
    if (this._map) {
      try { this._map.remove(); } catch { /* ignore */ }
      this._map = null;
    }
  }

  // ── Trip request ──────────────────────────────────────────────
  formatCOP(n: number): string {
    return '$\u00a0' + n.toLocaleString('es-CO') + ' COP';
  }

  requiredCommission(price: number): number {
    return Math.ceil(price * this.driverCommissionPct() / 100);
  }

  // ── Rating — passenger finishes trip ──────────────────────────
  async finishTrip() {
    const tripId = this.currentTripRequestId();
    const offer  = this.tripAccepted();
    if (!tripId || !offer) { this._resetTrip(); return; }
    await this.agService.completeTrip(tripId);
    const driverUser = offer.ag_drivers?.ag_users;
    this.ratingTripId.set(tripId);
    this.ratingTarget.set({
      userId: offer.ag_drivers?.ag_user_id ?? '',
      name:   driverUser?.full_name ?? 'Tu conductor',
      role:   'driver',
    });
    this.ratingStars.set(0);
    this.ratingCommentValue = '';
    this.ratingSkipped.set(false);
    this.ratingModal.set(true);
    this._resetTrip();
  }

  // ── Rating — driver finishes trip ─────────────────────────────
  async finishDriverTrip(trip: any) {
    const tripRequestId = trip.trip_request_id ?? trip.ag_trip_requests?.id;
    if (!tripRequestId) return;
    await this.agService.completeTrip(tripRequestId);
    this.driverActiveTrips.update(list => list.filter(t => t.id !== trip.id));
    // Disparar rating detallado de pasajero (con tags)
    await this.promptRatePassenger(trip);
  }

  async submitRating() {
    if (this.ratingStars() === 0) return;
    const profile = this.agProfile();
    const target  = this.ratingTarget();
    const tripId  = this.ratingTripId();
    if (!profile || !target || !tripId) { this.ratingSkipped.set(true); return; }
    this.submittingRating.set(true);
    await this.agService.submitRating(
      tripId, profile.id, target.userId, target.role,
      this.ratingStars(), this.ratingCommentValue,
    );
    this.submittingRating.set(false);
    this.ratingSkipped.set(true); // reuse "finished" screen
  }

  skipRating() {
    this.ratingSkipped.set(true);
  }

  closeRatingModal() {
    this.ratingModal.set(false);
    this.ratingSkipped.set(false);
    this.ratingStars.set(0);
    this.ratingCommentValue = '';
    this.ratingTarget.set(null);
    this.ratingTripId.set(null);
  }

  // ── Driver section helpers ────────────────────────────────────
  readonly prefOptions = [
    { key: 'acceptsPets',       icon: 'pets',              label: 'Acepto mascotas' },
    { key: 'acceptsLuggage',    icon: 'luggage',           label: 'Acepto equipaje' },
    { key: 'acceptsChildSeat',  icon: 'child_care',        label: 'Tengo silla infantil' },
  ];

  readonly settingOptions = [
    { key: 'notifySound',      icon: 'volume_up',   label: 'Sonido de notificaciones' },
    { key: 'notifyVibration',  icon: 'vibration',   label: 'Vibración' },
  ];

  readonly faqItems = [
    { q: '¿Cómo se calcula mi pago?', a: 'El pago es el precio ofrecido por el pasajero menos la comisión de la plataforma. El saldo se acredita automáticamente al completar el viaje.' },
    { q: '¿Puedo rechazar solicitudes?', a: 'Sí, puedes rechazar cualquier solicitud sin penalización. También puedes desconectarte en cualquier momento.' },
    { q: '¿Cómo retiro mis ganancias?', a: 'Desde la sección Ganancias puedes solicitar un retiro a tu cuenta bancaria o billetera digital registrada.' },
    { q: '¿Qué pasa si el pasajero cancela?', a: 'Si el pasajero cancela después de aceptar la oferta, recibirás una compensación por el tiempo y distancia recorrida.' },
    { q: '¿Cómo mejoro mi calificación?', a: 'Brinda un servicio puntual, mantén el vehículo limpio y sé amable. Las calificaciones se promedian con los últimos 50 viajes.' },
  ];

  openFaq = signal<string | null>(null);

  toggleFaq(q: string) {
    this.openFaq.set(this.openFaq() === q ? null : q);
  }

  getPrefValue(key: string): boolean {
    const p = this.driverPrefs();
    return (p as any)[key] ?? false;
  }

  setMaxDistance(val: number) {
    this.driverPrefs.update(p => ({ ...p, maxDistance: val }));
  }

  togglePref(key: string) {
    this.driverPrefs.update(p => ({ ...p, [key]: !(p as any)[key] }));
  }

  getSettingValue(key: string): boolean {
    const s = this.driverSettings();
    return (s as any)[key] ?? false;
  }

  toggleSetting(key: string) {
    this.driverSettings.update(s => ({ ...s, [key]: !(s as any)[key] }));
  }

  async openDriverSection(action: string) {
    this.driverMenuOpen.set(false);
    if (!action) return;
    if (action === 'logout') { await this.agService.signOut(); window.location.href = '/login'; return; }
    this.driverSection.set(action);
    const driver = this.driverData();
    if (!driver) return;

    this.loadingSection.set(true);
    if (action === 'profile') {
      const stats = await this.agService.getDriverStats(driver.id);
      this.driverStats.set(stats);
    } else if (action === 'earnings') {
      const [history, total, withdrawals] = await Promise.all([
        this.agService.getDriverWalletHistory(driver.id),
        this.agService.getDriverEarningsSummary(driver.id),
        this.agService.listDriverWithdrawals(driver.id),
      ]);
      this.driverEarnings.set({ total, walletHistory: history });
      this.driverWithdrawals.set(withdrawals);
    } else if (action === 'trips') {
      const trips = await this.agService.getDriverCompletedTrips(driver.id);
      this.driverCompletedTrips.set(trips);
    } else if (action === 'analytics') {
      await this.loadDriverAnalytics();
    } else if (action === 'quests') {
      await this.loadQuests();
    } else if (action === 'vehicles') {
      await this.loadVehicles();
    } else if (action === 'blacklist') {
      await this.loadBlacklist();
    } else if (action === 'preferences') {
      this.driverPrefs.set({
        maxDistance:      driver.max_distance_km   ?? 20,
        acceptsPets:      driver.accepts_pets      ?? false,
        acceptsLuggage:   driver.accepts_luggage   ?? true,
        acceptsChildSeat: driver.accepts_child_seat ?? false,
      });
      this.driverSettings.set({
        hidePhone:        driver.hide_phone        ?? false,
        notifySound:      driver.notify_sound      ?? true,
        notifyVibration:  driver.notify_vibration  ?? true,
      });
    } else if (action === 'settings') {
      this.driverSettings.set({
        hidePhone:        driver.hide_phone        ?? false,
        notifySound:      driver.notify_sound      ?? true,
        notifyVibration:  driver.notify_vibration  ?? true,
      });
    } else if (action === 'referrals') {
      await this.loadReferralData();
    } else if (action === 'documents') {
      await this.loadDriverDocs();
    } else if (action === 'performance') {
      await this.loadDriverMetrics();
    } else if (action === 'autoaccept') {
      this.autoAcceptCfg.set({
        enabled: driver.auto_accept_enabled ?? false,
        minPrice: driver.auto_accept_min_price ?? 5000,
        maxDistance: driver.auto_accept_max_distance ?? 5,
      });
    } else if (action === 'lost') {
      await this.loadLostItems();
    } else if (action === 'scheduled') {
      await this.loadScheduledTrips();
    }
    this.loadingSection.set(false);
  }

  // ═══════════════════════════════════════════════════
  // Documentos
  // ═══════════════════════════════════════════════════
  async loadDriverDocs(): Promise<void> {
    const d = this.driverData();
    if (!d) return;
    const docs = await this.agService.listDriverDocuments(d.id);
    this.driverDocs.set(docs);
  }

  getDocByType(type: string): any | null {
    return this.driverDocs().find(doc => doc.doc_type === type) ?? null;
  }

  docStatusLabel(status: string): string {
    const map: Record<string, string> = {
      pending: 'En revisión', approved: 'Aprobado', rejected: 'Rechazado', expired: 'Vencido',
    };
    return map[status] ?? status;
  }

  docStatusColor(status: string): string {
    const map: Record<string, string> = {
      pending: 'text-yellow-400', approved: 'text-green-400',
      rejected: 'text-red-400', expired: 'text-red-400',
    };
    return map[status] ?? 'text-gray-400';
  }

  docIsExpiringSoon(doc: any): boolean {
    if (!doc?.expires_at) return false;
    const exp = new Date(doc.expires_at).getTime();
    const diff = exp - Date.now();
    return diff > 0 && diff < 1000 * 60 * 60 * 24 * 30;
  }

  async onUploadDoc(type: string, event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    const d = this.driverData();
    if (!d) return;
    this.uploadingDoc.set(type);
    const meta: any = { number: this.docNumberInput[type] };
    if (this.docExpiryInput[type]) meta.expires_at = this.docExpiryInput[type];
    const res = await this.agService.uploadDriverDocument(d.id, type as any, file, meta);
    this.uploadingDoc.set(null);
    input.value = '';
    if (res.success) {
      await this.loadDriverDocs();
    } else {
      alert('Error subiendo: ' + (res.error ?? 'desconocido'));
    }
  }

  async onDocNumberChange(type: string, value: string): Promise<void> {
    this.docNumberInput[type] = value;
  }

  async onDocExpiryChange(type: string, value: string): Promise<void> {
    this.docExpiryInput[type] = value;
  }

  // ═══════════════════════════════════════════════════
  // Métricas performance
  // ═══════════════════════════════════════════════════
  async loadDriverMetrics(): Promise<void> {
    const m = await this.agService.getDriverMetrics();
    this.driverMetrics.set(m);
  }

  metricColor(rate: number, kind: 'positive' | 'negative'): string {
    if (kind === 'positive') {
      if (rate >= 90) return 'text-green-400';
      if (rate >= 70) return 'text-yellow-400';
      return 'text-red-400';
    }
    if (rate <= 5) return 'text-green-400';
    if (rate <= 15) return 'text-yellow-400';
    return 'text-red-400';
  }

  // ═══════════════════════════════════════════════════
  // Detalle de viaje
  // ═══════════════════════════════════════════════════
  async openTripDetail(trip: any): Promise<void> {
    const id = trip.id ?? trip.trip_request_id;
    if (!id) return;
    this.loadingTripDetail.set(true);
    this.tripDetailOpen.set(true);
    const detail = await this.agService.getTripDetail(id);
    this.tripDetail.set(detail);
    this.loadingTripDetail.set(false);
  }

  closeTripDetail(): void {
    this.tripDetailOpen.set(false);
    this.tripDetail.set(null);
  }

  downloadReceipt(): void {
    const d = this.tripDetail();
    if (!d) return;
    const driver = this.driverData();
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Recibo Movi</title>
<style>body{font-family:Arial,sans-serif;max-width:600px;margin:20px auto;padding:20px;color:#222}
h1{color:#00E5FF;border-bottom:2px solid #00E5FF;padding-bottom:10px}
.row{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #eee}
.total{font-weight:bold;font-size:18px;color:#00E5FF}</style></head>
<body><h1>Recibo de viaje — Movi</h1>
<p><strong>Viaje ID:</strong> ${d.id}<br><strong>Fecha:</strong> ${d.completed_at ? new Date(d.completed_at).toLocaleString('es-CO') : '-'}</p>
<p><strong>Conductor:</strong> ${driver?.ag_users?.full_name ?? '-'}<br>
<strong>Pasajero:</strong> ${d.passenger_name ?? '-'}<br>
<strong>Destino:</strong> ${d.dest_name ?? '-'}<br>
<strong>Distancia:</strong> ${(d.distance_km ?? 0).toFixed(2)} km</p>
<h2>Desglose</h2>
<div class="row"><span>Tarifa base</span><span>$${(d.base_fare ?? 0).toLocaleString('es-CO')}</span></div>
<div class="row"><span>Distancia</span><span>$${(d.distance_fare ?? 0).toLocaleString('es-CO')}</span></div>
${d.surge_multiplier > 1 ? `<div class="row"><span>Alta demanda x${d.surge_multiplier}</span><span>+$${(d.surge_amount ?? 0).toLocaleString('es-CO')}</span></div>` : ''}
<div class="row"><span>Total cobrado al pasajero</span><span>$${(d.final_price ?? d.offered_price ?? 0).toLocaleString('es-CO')}</span></div>
<div class="row"><span>Comisión plataforma (${d.commission_pct ?? 0}%)</span><span>-$${(d.commission_amount ?? 0).toLocaleString('es-CO')}</span></div>
<div class="row total"><span>Ganancia neta conductor</span><span>$${(d.driver_net ?? 0).toLocaleString('es-CO')}</span></div>
<p style="margin-top:30px;font-size:12px;color:#666">Este recibo fue generado automáticamente por Movi (Publihazclick). Para facturación electrónica, contacta soporte.</p>
</body></html>`;
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `recibo-movi-${d.id?.slice(0, 8)}.html`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // ═══════════════════════════════════════════════════
  // Auto-aceptar
  // ═══════════════════════════════════════════════════
  async saveAutoAccept(): Promise<void> {
    const d = this.driverData();
    if (!d) return;
    this.savingAutoAccept.set(true);
    const cfg = this.autoAcceptCfg();
    await this.agService.updateAutoAccept(d.id, cfg.enabled, cfg.minPrice, cfg.maxDistance);
    this.savingAutoAccept.set(false);
  }

  toggleAutoAcceptEnabled(): void {
    this.autoAcceptCfg.update(c => ({ ...c, enabled: !c.enabled }));
  }

  setAutoAcceptMinPrice(value: number): void {
    this.autoAcceptCfg.update(c => ({ ...c, minPrice: value }));
  }

  setAutoAcceptMaxDistance(value: number): void {
    this.autoAcceptCfg.update(c => ({ ...c, maxDistance: value }));
  }

  // ═══════════════════════════════════════════════════
  // Objetos perdidos
  // ═══════════════════════════════════════════════════
  async loadLostItems(): Promise<void> {
    const d = this.driverData();
    if (!d) return;
    const items = await this.agService.listLostItems(d.id);
    this.lostItems.set(items);
  }

  openReportLost(tripId: string): void {
    this.newLostTripId.set(tripId);
    this.newLostDesc = '';
    this.newLostPhoto = null;
  }

  onLostPhotoChange(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    this.newLostPhoto = file ?? null;
  }

  async submitLostItem(): Promise<void> {
    const tripId = this.newLostTripId();
    const d = this.driverData();
    if (!tripId || !d || !this.newLostDesc.trim()) return;
    const trip = this.driverCompletedTrips().find(
      t => (t.ag_trip_requests?.id ?? t.trip_request_id) === tripId,
    ) ?? this.driverActiveTrips().find(
      t => (t.ag_trip_requests?.id ?? t.trip_request_id) === tripId,
    );
    const passengerUserId = trip?.ag_trip_requests?.passenger_user_id;
    if (!passengerUserId) {
      alert('No se encontró el pasajero de este viaje.');
      return;
    }
    this.submittingLost.set(true);
    const res = await this.agService.reportLostItem({
      tripRequestId: tripId,
      driverId: d.id,
      passengerUserId,
      description: this.newLostDesc,
      photo: this.newLostPhoto ?? undefined,
    });
    this.submittingLost.set(false);
    if (res.success) {
      this.newLostTripId.set(null);
      this.newLostDesc = '';
      this.newLostPhoto = null;
      await this.loadLostItems();
    } else {
      alert('Error: ' + (res.error ?? 'desconocido'));
    }
  }

  async changeLostStatus(itemId: string, status: 'reported' | 'contacted' | 'returned' | 'closed'): Promise<void> {
    await this.agService.updateLostItemStatus(itemId, status);
    await this.loadLostItems();
  }

  // ═══════════════════════════════════════════════════
  // Viajes programados
  // ═══════════════════════════════════════════════════
  async loadScheduledTrips(): Promise<void> {
    const d = this.driverData();
    if (!d) return;
    const [available, mine] = await Promise.all([
      this.agService.listAvailableScheduledTrips(d.id, d.max_distance_km ?? 30),
      this.agService.listMyScheduledTrips(d.id),
    ]);
    this.availableScheduledTrips.set(available);
    this.myScheduledTrips.set(mine);
  }

  async claimScheduled(id: string): Promise<void> {
    const d = this.driverData();
    if (!d) return;
    this.claimingScheduledId.set(id);
    const res = await this.agService.claimScheduledTrip(id, d.id);
    this.claimingScheduledId.set(null);
    if (res.success) {
      await this.loadScheduledTrips();
    } else {
      alert('No se pudo reservar el viaje: ' + (res.error ?? 'desconocido'));
    }
  }

  async releaseScheduled(id: string): Promise<void> {
    if (!confirm('¿Liberar esta reserva? Volverá a estar disponible para otros conductores.')) return;
    await this.agService.releaseScheduledTrip(id);
    await this.loadScheduledTrips();
  }

  // ═══════════════════════════════════════════════════
  // Rating pasajero post-viaje
  // ═══════════════════════════════════════════════════
  async promptRatePassenger(trip: any): Promise<void> {
    const tripId = trip.ag_trip_requests?.id ?? trip.trip_request_id ?? trip.id;
    if (!tripId) return;
    const profile = this.agProfile();
    if (!profile) return;
    const already = await this.agService.hasRatedTrip(tripId, profile.id);
    if (already) return;
    this.pendingRatingTrip.set({
      trip_request_id: tripId,
      passenger_user_id: trip.ag_trip_requests?.passenger_user_id ?? trip.passenger_user_id,
      passenger_name: trip.ag_trip_requests?.ag_users?.full_name ?? trip.ag_users?.full_name ?? 'Pasajero',
    });
    this.passengerRatingStars.set(0);
    this.passengerRatingTags.set(new Set());
    this.passengerRatingComment = '';
    this.passengerRatingModal.set(true);
  }

  togglePassengerRatingTag(tag: string): void {
    this.passengerRatingTags.update(set => {
      const next = new Set(set);
      if (next.has(tag)) next.delete(tag); else next.add(tag);
      return next;
    });
  }

  async submitPassengerRating(): Promise<void> {
    const pending = this.pendingRatingTrip();
    const profile = this.agProfile();
    if (!pending || !profile || this.passengerRatingStars() === 0) return;
    this.submittingPassengerRating.set(true);
    const res = await this.agService.submitPassengerRating(
      pending.trip_request_id,
      profile.id,
      pending.passenger_user_id,
      this.passengerRatingStars(),
      Array.from(this.passengerRatingTags()),
      this.passengerRatingComment,
    );
    this.submittingPassengerRating.set(false);
    if (res.success) {
      this.passengerRatingModal.set(false);
      this.pendingRatingTrip.set(null);
    } else {
      alert('Error enviando calificación: ' + (res.error ?? 'desconocido'));
    }
  }

  skipPassengerRating(): void {
    this.passengerRatingModal.set(false);
    this.pendingRatingTrip.set(null);
  }

  private _gpsWatchId: number | null = null;

  async toggleOnline() {
    const driver = this.driverData();
    if (!driver) return;
    this.togglingOnline.set(true);
    const next = !this.driverOnline();
    await this.agService.setDriverOnline(driver.id, next);
    this.driverOnline.set(next);

    if (next) {
      // Iniciar tracking GPS + sesión online
      this.startGpsTracking(driver.id);
      try {
        const sessionId = await this.agService.startOnlineSession(driver.id);
        this._onlineSessionId = sessionId;
      } catch {}
      this._startOnlineTimer();
    } else {
      // Detener tracking y cerrar sesión
      this.stopGpsTracking();
      await this.agService.removeDriverLocation(driver.id);
      if (this._onlineSessionId) {
        await this.agService.endOnlineSession(this._onlineSessionId);
        this._onlineSessionId = null;
      }
      this._stopOnlineTimer();
    }

    this.togglingOnline.set(false);
  }

  // Estados del viaje (conductor)
  readonly tripStages = [
    { key: 'heading_to_pickup', label: 'Yendo' },
    { key: 'arrived_at_pickup', label: 'Llegó' },
    { key: 'picked_up', label: 'A bordo' },
    { key: 'on_route', label: 'En ruta' },
    { key: 'arrived_at_destination', label: 'Llegó destino' },
  ];

  isStageReached(current: string | null | undefined, target: string): boolean {
    if (!current) return false;
    const order = ['heading_to_pickup', 'arrived_at_pickup', 'picked_up', 'on_route', 'arrived_at_destination', 'completed'];
    return order.indexOf(current) >= order.indexOf(target);
  }

  async advanceStage(trip: any, stage: 'heading_to_pickup'|'arrived_at_pickup'|'picked_up'|'on_route'|'arrived_at_destination'|'completed'): Promise<void> {
    const tripReqId = trip.trip_request_id ?? trip.ag_trip_requests?.id;
    if (!tripReqId) return;
    await this.agService.updateTripStage(tripReqId, stage);
    if (trip.ag_trip_requests) trip.ag_trip_requests.driver_stage = stage;
  }

  navigateTo(lat: number, lng: number, label: 'pickup' | 'dest' = 'dest'): void {
    if (!lat || !lng) return;
    // Google Maps funciona en Android/iOS; Waze alt
    const url = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`;
    if (typeof window !== 'undefined') window.open(url, '_blank');
  }

  // ═══════════ Heatmap demanda ═══════════
  heatmapVisible = signal(false);
  private _heatmapLoaded = false;

  async toggleHeatmap(): Promise<void> {
    const next = !this.heatmapVisible();
    this.heatmapVisible.set(next);
    if (next) await this._showHeatmap();
    else this._hideHeatmap();
  }

  private async _showHeatmap(): Promise<void> {
    if (!this._map) return;
    try {
      const b = this._map.getBounds();
      const pts = await this.agService.getHeatmap({
        latMin: b.getSouth(), lngMin: b.getWest(),
        latMax: b.getNorth(), lngMax: b.getEast(),
      });
      const features = pts.map(p => ({
        type: 'Feature' as const, properties: { weight: p.weight },
        geometry: { type: 'Point' as const, coordinates: [p.lng, p.lat] },
      }));
      const geojson = { type: 'FeatureCollection' as const, features };
      if (this._map.getSource('ag-heatmap')) {
        (this._map.getSource('ag-heatmap') as any).setData(geojson);
      } else {
        this._map.addSource('ag-heatmap', { type: 'geojson', data: geojson });
        this._map.addLayer({
          id: 'ag-heatmap-layer', type: 'heatmap', source: 'ag-heatmap',
          paint: {
            'heatmap-weight': ['interpolate', ['linear'], ['get', 'weight'], 0, 0, 10, 1],
            'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 10, 1, 15, 3],
            'heatmap-color': ['interpolate', ['linear'], ['heatmap-density'],
              0, 'rgba(0,0,255,0)', 0.2, 'rgb(0,100,255)',
              0.4, 'rgb(0,255,100)', 0.6, 'rgb(255,200,0)',
              0.8, 'rgb(255,100,0)', 1, 'rgb(255,0,0)'],
            'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 10, 15, 15, 40],
            'heatmap-opacity': 0.7,
          },
        });
        this._heatmapLoaded = true;
      }
    } catch (e) { console.warn('heatmap err', e); }
  }

  private _hideHeatmap(): void {
    if (!this._map || !this._heatmapLoaded) return;
    try {
      if (this._map.getLayer('ag-heatmap-layer')) this._map.removeLayer('ag-heatmap-layer');
      if (this._map.getSource('ag-heatmap')) this._map.removeSource('ag-heatmap');
      this._heatmapLoaded = false;
    } catch {}
  }

  async callPassengerFromTrip(trip: any): Promise<void> {
    const tripReqId = trip.trip_request_id ?? trip.ag_trip_requests?.id;
    if (!tripReqId) return;
    const r = await this.agService.startMaskedCall(tripReqId);
    if (r.ok) {
      alert('📞 Te estamos llamando. Al contestar conectaremos con el pasajero.');
    } else {
      alert('Error: ' + (r.error ?? 'No se pudo llamar'));
    }
  }

  driverLevelColor(): string {
    const lvl = (this.driverData() as any)?.level ?? 'bronce';
    const map: Record<string, string> = {
      bronce: 'rgba(180,83,9,0.2);color:#fbbf24',
      plata: 'rgba(148,163,184,0.2);color:#e2e8f0',
      oro: 'rgba(251,191,36,0.2);color:#fbbf24',
      platino: 'rgba(103,232,249,0.2);color:#67e8f9',
      diamante: 'rgba(192,132,252,0.25);color:#c084fc',
    };
    return map[lvl] ?? map['bronce'];
  }
  driverLevelIcon(): string {
    const lvl = (this.driverData() as any)?.level ?? 'bronce';
    const map: Record<string, string> = { bronce: 'workspace_premium', plata: 'military_tech', oro: 'emoji_events', platino: 'diamond', diamante: 'auto_awesome' };
    return map[lvl] ?? 'workspace_premium';
  }

  // Tracking horas online del día (signal hh:mm:ss)
  private _onlineSessionId: string | null = null;
  private _onlineTimer: any = null;
  onlineTodaySeconds = signal(0);
  onlineTodayFormatted = computed(() => {
    const s = this.onlineTodaySeconds();
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
    return `${h}h ${m}m`;
  });

  private async _startOnlineTimer() {
    const driver = this.driverData();
    if (!driver) return;
    const refresh = async () => {
      try {
        const sec = await this.agService.getTodayOnlineSeconds(driver.id);
        this.onlineTodaySeconds.set(sec);
        // Modo descanso: alerta a las 8h (28800s), obligatorio a las 10h (36000s)
        if (sec >= 36000 && !this.restEnforced()) {
          this.restEnforced.set(true);
          alert('🛏️ Has trabajado 10 horas seguidas. Por tu seguridad te ponemos fuera de línea. Descansa al menos 30 minutos antes de volver a conectarte.');
          await this.toggleOnline();
        } else if (sec >= 28800 && !this.restWarned()) {
          this.restWarned.set(true);
          alert('⚠️ Llevas 8 horas trabajando. Te recomendamos descansar pronto. En 2 horas te desconectaremos automáticamente por seguridad.');
        }
      } catch {}
    };
    await refresh();
    this._onlineTimer = setInterval(refresh, 30000);
  }

  restWarned = signal(false);
  restEnforced = signal(false);

  private _stopOnlineTimer() {
    if (this._onlineTimer) { clearInterval(this._onlineTimer); this._onlineTimer = null; }
  }

  private startGpsTracking(driverId: string): void {
    if (!navigator.geolocation) {
      alert('Tu dispositivo no soporta GPS. No podrás recibir solicitudes.');
      return;
    }

    // Enviar posición inicial
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        this.agService.updateDriverLocation(driverId, pos.coords.latitude, pos.coords.longitude, pos.coords.heading);
      },
      (err) => {
        console.error('GPS inicial falló:', err.message);
        if (err.code === err.PERMISSION_DENIED) {
          alert('Permiso de GPS denegado. Activa la ubicación para recibir solicitudes.');
          this.driverOnline.set(false);
          this.agService.setDriverOnline(driverId, false);
        }
      },
      { enableHighAccuracy: true, timeout: 15000 }
    );

    // Tracking continuo cada vez que se mueve
    this._gpsWatchId = navigator.geolocation.watchPosition(
      (pos) => {
        this.agService.updateDriverLocation(driverId, pos.coords.latitude, pos.coords.longitude, pos.coords.heading);
      },
      (err) => {
        console.error('GPS tracking error:', err.message);
        if (err.code === err.PERMISSION_DENIED) {
          this.stopGpsTracking();
          this.driverOnline.set(false);
          this.agService.setDriverOnline(driverId, false);
          alert('Se perdió el acceso al GPS. Te pusimos fuera de línea.');
        }
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
    );

    // Background tracking con Capacitor (solo app nativa Android/iOS)
    this._startBackgroundTracking(driverId).catch(() => {});
    this._registerNativePush().catch(() => {});
  }

  private async _registerNativePush(): Promise<void> {
    try {
      const w = window as any;
      const cap = w.Capacitor;
      if (!cap?.isNativePlatform?.()) return;
      const PushNotifications = cap.Plugins?.PushNotifications;
      if (!PushNotifications) return;

      const perm = await PushNotifications.checkPermissions();
      if (perm.receive !== 'granted') {
        const req = await PushNotifications.requestPermissions();
        if (req.receive !== 'granted') return;
      }

      PushNotifications.addListener('registration', async (token: { value: string }) => {
        try { await this.agService.registerFcmToken(token.value); } catch (e) { console.warn('fcm reg', e); }
      });
      PushNotifications.addListener('registrationError', (err: any) => console.warn('fcm regErr', err));
      PushNotifications.addListener('pushNotificationActionPerformed', (ev: any) => {
        const url = ev?.notification?.data?.url;
        if (url && typeof window !== 'undefined') window.location.href = url;
      });

      await PushNotifications.register();
    } catch (e) { console.warn('native push init:', e); }
  }

  private _bgWatcherId: string | null = null;
  private async _startBackgroundTracking(driverId: string): Promise<void> {
    try {
      const w = window as any;
      const cap = w.Capacitor;
      if (!cap?.isNativePlatform?.()) return; // solo nativa
      const BackgroundGeolocation = cap.Plugins?.BackgroundGeolocation;
      if (!BackgroundGeolocation) return;
      this._bgWatcherId = await BackgroundGeolocation.addWatcher({
        backgroundMessage: 'Movi Conductor: tracking activo',
        backgroundTitle: 'Recibiendo solicitudes',
        requestPermissions: true,
        stale: false,
        distanceFilter: 20,
      }, (location: any, error: any) => {
        if (error) { console.error('bg-loc', error); return; }
        if (location) {
          this.agService.updateDriverLocation(driverId, location.latitude, location.longitude, location.bearing ?? 0);
        }
      });
    } catch (e) { console.warn('BG geo init:', e); }
  }

  private async _stopBackgroundTracking(): Promise<void> {
    try {
      const w = window as any;
      const BackgroundGeolocation = w.Capacitor?.Plugins?.BackgroundGeolocation;
      if (BackgroundGeolocation && this._bgWatcherId) {
        await BackgroundGeolocation.removeWatcher({ id: this._bgWatcherId });
        this._bgWatcherId = null;
      }
    } catch {}
  }

  private stopGpsTracking(): void {
    if (this._gpsWatchId !== null) {
      navigator.geolocation.clearWatch(this._gpsWatchId);
      this._gpsWatchId = null;
    }
    this._stopBackgroundTracking();
  }

  async savePreferences() {
    const driver = this.driverData();
    if (!driver) return;
    this.savingPrefs.set(true);
    const p = this.driverPrefs();
    const s = this.driverSettings();
    await this.agService.updateDriverPreferences(driver.id, {
      max_distance_km:    p.maxDistance,
      accepts_pets:       p.acceptsPets,
      accepts_luggage:    p.acceptsLuggage,
      accepts_child_seat: p.acceptsChildSeat,
      hide_phone:         s.hidePhone,
      notify_sound:       s.notifySound,
      notify_vibration:   s.notifyVibration,
    });
    this.savingPrefs.set(false);
  }

  async saveSettings() {
    await this.savePreferences();
    this.savingSettings.set(true);
    await new Promise(r => setTimeout(r, 300));
    this.savingSettings.set(false);
  }

  activatePanic() {
    this.panicActivated.set(true);
    // Llamada de emergencia al 123 (Colombia)
    if (typeof window !== 'undefined') {
      const contacts = this.emergencyContacts();
      if (contacts.length > 0) {
        window.open(`tel:${contacts[0].phone}`, '_self');
      }
    }
  }

  addEmergencyContact() {
    if (!this.newContactName.trim() || !this.newContactPhone.trim()) return;
    this.emergencyContacts.update(list => [...list, { name: this.newContactName.trim(), phone: this.newContactPhone.trim() }]);
    this.newContactName = '';
    this.newContactPhone = '';
  }

  removeEmergencyContact(phone: string) {
    this.emergencyContacts.update(list => list.filter(c => c.phone !== phone));
  }

  async submitReport(type: 'incident' | 'passenger') {
    const text = type === 'incident' ? this.reportIncidentText.trim() : this.reportPassengerText.trim();
    if (!text) { alert('Escribe una descripción del reporte.'); return; }

    const profile = this.agProfile();
    if (!profile) { alert('No se pudo identificar tu perfil.'); return; }

    const result = await this.agService.submitReport(profile.id, type, text);
    if (result.success) {
      if (type === 'incident') this.reportIncidentText = '';
      else this.reportPassengerText = '';
      alert('Reporte enviado. Nuestro equipo lo revisará en las próximas 24 horas.');
    } else {
      alert('Error al enviar el reporte. Intenta de nuevo.');
    }
  }

  private _resetTrip() {
    this._stopWaiting();
    this._unsubscribeOffers();
    this.tripDest.set(null);
    this.tripSent.set(false);
    this.tripOpen.set(false);
    this.tripQuery.set('');
    this.tripSuggestions.set([]);
    this.tripDistKm.set(0);
    this.tripPrice.set(0);
    this.waitingDriverCount.set(0);
    this.waitingDriverColors.set([]);
    this.autoAccept.set(false);
    this.currentTripRequestId.set(null);
    this.receivedOffers.set([]);
    this.tripAccepted.set(null);
    this.acceptingOfferId.set(null);
    this._clearRoute();
  }

  scrollIcons(px: number) {
    document.getElementById('ag-icons-scroll')?.scrollBy({ left: px, behavior: 'smooth' });
  }

  openTripSearch() { this.tripOpen.set(true); }
  closeTripSearch() { this.tripOpen.set(false); this.tripQuery.set(''); this.tripSuggestions.set([]); }

  onTripQueryInput(val: string) {
    this.tripQuery.set(val);
    this.tripNoResults.set(false);
    if (this._tripDebounce) clearTimeout(this._tripDebounce);
    if (!val.trim()) { this.tripSuggestions.set([]); return; }
    this._tripDebounce = setTimeout(() => this._searchTripPlaces(val), 120);
  }

  private _tripAbort: AbortController | null = null;

  private async _searchTripPlaces(query: string) {
    if (this._tripAbort) this._tripAbort.abort();
    this._tripAbort = new AbortController();
    const sig = this._tripAbort.signal;

    const lat = this._currentLat, lng = this._currentLng;

    // ── Google Places (New) — fuente principal para destinos
    const googleUrl = 'https://places.googleapis.com/v1/places:searchText';
    const googleBody = {
      textQuery: query,
      locationBias: { circle: { center: { latitude: lat, longitude: lng }, radius: 50000 } },
      languageCode: 'es',
      maxResultCount: 8,
    };

    // ── Mapbox — complementa con direcciones y calles
    const d = 0.5;
    const bbox = `${lng - d},${lat - d},${lng + d},${lat + d}`;
    const mbxUrl = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json`
      + `?access_token=${this.MAPBOX_TOKEN}&autocomplete=true&language=es`
      + `&country=co&limit=5&types=poi,place,address,neighborhood,locality,district`
      + `&proximity=${lng},${lat}&bbox=${bbox}`;

    try {
      const [googleRes, mbxRes] = await Promise.all([
        fetch(googleUrl, {
          method: 'POST', signal: sig,
          headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': this.GOOGLE_PLACES_KEY,
            'X-Goog-FieldMask': 'places.displayName,places.formattedAddress,places.location',
          },
          body: JSON.stringify(googleBody),
        }),
        fetch(mbxUrl, { signal: sig }),
      ]);

      const googleJson = await googleRes.json();
      const mbxJson = await mbxRes.json();

      // Convertir Google Places al formato interno
      const googleFeatures = (googleJson.places ?? []).map((p: any, i: number) => {
        const fLat = p.location?.latitude ?? lat;
        const fLng = p.location?.longitude ?? lng;
        return {
          id: `gpl-${i}`,
          text: p.displayName?.text ?? '',
          place_name: p.formattedAddress ?? '',
          center: [fLng, fLat] as [number, number],
          distKm: this._distKm(lat, lng, fLat, fLng),
        };
      });

      // Convertir Mapbox al formato interno
      const mbxFeatures = (mbxJson.features ?? []).map((f: any) => {
        const [fLng, fLat] = f.center ?? [lng, lat];
        return { ...f, id: `mbx-${f.id}`, distKm: this._distKm(lat, lng, fLat, fLng) };
      });

      // Unir, deduplicar y ordenar por distancia (más cercanos primero)
      const seen  = new Set<string>();
      const merged: any[] = [];
      for (const f of [...googleFeatures, ...mbxFeatures]) {
        const key = `${(+f.center[0]).toFixed(3)},${(+f.center[1]).toFixed(3)}`;
        if (!seen.has(key)) { seen.add(key); merged.push(f); }
      }
      merged.sort((a, b) => (a.distKm ?? 999) - (b.distKm ?? 999));

      const results = merged.slice(0, 8);
      this.tripSuggestions.set(results);
      this.tripNoResults.set(results.length === 0 && this.tripQuery().trim().length >= 2);
    } catch { /* abortado o sin red */ }
  }

  selectTripDest(s: any) {
    const [dLng, dLat] = s.center ?? s.geometry?.coordinates ?? [this._currentLng, this._currentLat];
    const name = s.text ?? s.place_name ?? 'Destino';
    this.tripDest.set({ name, lat: dLat, lng: dLng });
    this.tripOpen.set(false);
    this.tripQuery.set('');
    this.tripSuggestions.set([]);
    this._drawRoute(dLng, dLat);
  }

  setTripVehicle(type: 'carro' | 'moto') {
    this.tripVehicle.set(type);
    this.tripPrice.set(this._calcPrice(this.tripDistKm(), type));
  }

  adjustTripPrice(delta: number) {
    this.tripPrice.set(Math.max(2000, this.tripPrice() + delta));
  }

  async findOffers() {
    const dest = this.tripDest();
    if (!dest) return;
    this.tripSending.set(true);
    const profile = this.agProfile();
    if (profile) {
      const result = await this.agService.requestTrip({
        passengerUserId: profile.id,
        originLat: this._currentLat, originLng: this._currentLng,
        destName: dest.name, destLat: dest.lat, destLng: dest.lng,
        distanceKm: this.tripDistKm(),
        vehicleType: this.tripVehicle(),
        offeredPrice: this.tripPrice(),
        paymentMethod: this.tripPayment(),
      });
      if (result.success && result.tripId) {
        this.currentTripRequestId.set(result.tripId);
        this.receivedOffers.set([]);
        this.tripAccepted.set(null);
        // Aplicar cupón si hay uno
        const ac = this.appliedCoupon();
        if (ac) {
          try { await this.agService.applyCoupon(ac.couponId, result.tripId, ac.discount); } catch {}
        }
        this._subscribeToOffers(result.tripId);

        // Auto-buscar conductores cercanos y enviarles la solicitud
        this._autoAssignNearestDrivers(result.tripId, this._currentLat, this._currentLng, this.tripVehicle(), this.tripPrice());
      }
    }
    this.tripSending.set(false);
    this.tripSent.set(true);
    this._startWaiting();
  }

  private _startWaiting() {
    this._stopWaiting();
    const total = 90;
    const driverTimes = [4, 12, 21, 32, 45];
    const palette = ['#1D4ED8','#DC2626','#15803D','#7C3AED','#EA580C'];
    let elapsed = 0;
    this.waitingCountdown.set(total);
    this.waitingProgress.set(0);
    this.waitingDriverCount.set(0);
    this.waitingDriverColors.set([]);
    this._waitingInterval = setInterval(() => {
      elapsed++;
      this.waitingCountdown.set(Math.max(0, total - elapsed));
      this.waitingProgress.set(Math.min(100, (elapsed / total) * 100));
      if (driverTimes.includes(elapsed)) {
        const n = this.waitingDriverCount();
        this.waitingDriverCount.set(n + 1);
        this.waitingDriverColors.update(arr => [...arr, palette[n % palette.length]]);
      }
      if (elapsed >= total) this._stopWaiting();
    }, 1000);
  }

  private _stopWaiting() {
    if (this._waitingInterval !== null) { clearInterval(this._waitingInterval); this._waitingInterval = null; }
  }

  // ── Realtime offer subscription ────────────────────────────────
  private _subscribeToOffers(tripId: string) {
    if (!isPlatformBrowser(this.platformId)) return;
    this._unsubscribeOffers();
    this._offerChannel = this.agService.subscribeToOffers(tripId, (offer) => {
      this.receivedOffers.update(list => {
        const idx = list.findIndex(o => o.id === offer.id);
        if (idx >= 0) { const nl = [...list]; nl[idx] = offer; return nl; }
        return [...list, offer];
      });
    });
  }

  private _unsubscribeOffers() {
    if (this._offerChannel) {
      this._offerChannel.unsubscribe();
      this._offerChannel = null;
    }
  }

  // ── Accept / reject offer (passenger) ─────────────────────────
  async acceptOfferCard(offer: AgTripOffer) {
    this.acceptingOfferId.set(offer.id);
    const result = await this.agService.acceptOffer(offer.id);
    if (result.success) {
      this._stopWaiting();
      this._unsubscribeOffers();
      this.tripAccepted.set(offer);
      this.tripSent.set(false);
      this._startTrackingAssignedDriver(offer.driver_id);
      // Notificar al conductor que su oferta fue aceptada
      try {
        const driverAuthUserId = (offer as any)?.ag_drivers?.ag_users?.auth_user_id;
        if (driverAuthUserId) {
          this.agService.sendPush({
            userIds: [driverAuthUserId],
            title: '🎉 Tu oferta fue aceptada',
            body: 'Dirígete al punto de recogida. Revisa detalles en la app.',
            tag: `offer-accepted-${offer.id}`, urgent: true,
          }).catch(() => {});
        }
      } catch {}
    }
    this.acceptingOfferId.set(null);
  }

  /** Tracking en vivo del conductor asignado: muestra marker + ETA + centra mapa */
  private _assignedDriverChannel: any = null;
  private _assignedDriverMarker: any = null;
  private _startTrackingAssignedDriver(driverId: string): void {
    this._stopTrackingAssignedDriver();
    // Dibujar marker con última ubicación conocida
    this.agService.getLatestDriverLocation(driverId).then(loc => {
      if (loc) this._drawAssignedDriverMarker(loc.lat, loc.lng);
    });
    this._assignedDriverChannel = this.agService.subscribeDriverLocation(driverId, (loc) => {
      this._drawAssignedDriverMarker(loc.lat, loc.lng, loc.heading);
    });
  }

  private _stopTrackingAssignedDriver(): void {
    if (this._assignedDriverChannel) { try { this._assignedDriverChannel.unsubscribe(); } catch {} this._assignedDriverChannel = null; }
    if (this._assignedDriverMarker) { try { this._assignedDriverMarker.remove(); } catch {} this._assignedDriverMarker = null; }
  }

  private _drawAssignedDriverMarker(lat: number, lng: number, heading = 0): void {
    if (!this._map) return;
    const mapboxgl = (window as any).mapboxgl;
    if (!mapboxgl) return;
    if (this._assignedDriverMarker) {
      this._assignedDriverMarker.setLngLat([lng, lat]);
    } else {
      const el = this._carElement(heading, '#10b981');
      el.style.filter = 'drop-shadow(0 0 12px rgba(16,185,129,0.8))';
      this._assignedDriverMarker = new mapboxgl.Marker({ element: el, anchor: 'center' })
        .setLngLat([lng, lat]).addTo(this._map);
      this._map.flyTo({ center: [lng, lat], zoom: 15.5, duration: 1000 });
    }
  }

  async rejectOfferCard(offer: AgTripOffer) {
    await this.agService.rejectOffer(offer.id);
    this.receivedOffers.update(list => list.filter(o => o.id !== offer.id));
  }

  // ── Driver: load & refresh trip requests ──────────────────────
  private _driverRefreshInterval: ReturnType<typeof setInterval> | null = null;

  _loadDriverRequests(vehicleType?: string) {
    this.agService.getSearchingRequests(vehicleType).then(reqs => {
      this.driverRequests.set(reqs);
      if (reqs.length > 0) this.agService.logMetricEvent('offer_seen').catch(() => {});
    });
    // Limpiar intervalo previo antes de crear uno nuevo (evita duplicados)
    if (this._driverRefreshInterval) {
      clearInterval(this._driverRefreshInterval);
      this._driverRefreshInterval = null;
    }
    // Refresh every 15s solo si el panel está abierto
    this._driverRefreshInterval = setInterval(() => {
      if (this.driverRequestsOpen()) {
        this.agService.getSearchingRequests(vehicleType).then(reqs => this.driverRequests.set(reqs));
      } else {
        // Si se cerró el panel, detener polling
        if (this._driverRefreshInterval) {
          clearInterval(this._driverRefreshInterval);
          this._driverRefreshInterval = null;
        }
      }
    }, 15000);
  }

  toggleDriverRequests() {
    const nowOpen = !this.driverRequestsOpen();
    this.driverRequestsOpen.set(nowOpen);
    if (nowOpen) this._loadDriverRequests(this.driverData()?.vehicle_type);
  }

  refreshDriverRequests() {
    this._loadDriverRequests(this.driverData()?.vehicle_type);
  }

  openMakeOffer(req: AgTripRequest) {
    this.makingOfferFor.set(req);
    this.driverOfferPrice.set(req.offered_price);
  }

  closeMakeOffer() {
    this.makingOfferFor.set(null);
  }

  async submitDriverOffer() {
    const req = this.makingOfferFor();
    const driver = this.driverData();
    if (!req || !driver) return;

    // Validar saldo de wallet antes de enviar
    if (this.driverWalletBalance() <= 0) {
      alert('Necesitas recargar tu billetera antes de aceptar viajes.');
      return;
    }
    const commission = this.requiredCommission(this.driverOfferPrice());
    if (this.driverCommissionPct() > 0 && this.driverWalletBalance() < commission) {
      alert(`Saldo insuficiente. Necesitas al menos ${this.formatCOP(commission)} en tu billetera para cubrir la comisión.`);
      return;
    }

    this.sendingOffer.set(true);
    const result = await this.agService.makeOffer(req.id, driver.id, this.driverOfferPrice());
    this.sendingOffer.set(false);
    if (result.success) {
      this.offerSentFor.update(s => { const ns = new Set(s); ns.add(req.id); return ns; });
      this.makingOfferFor.set(null);
      this.agService.logMetricEvent('offer_made', req.id).catch(() => {});
    }
  }

  formatTime(s: number): string {
    const v = Math.max(0, s);
    return `${Math.floor(v / 60)}:${(v % 60).toString().padStart(2, '0')}`;
  }

  cancelTrip() {
    this._stopWaiting();
    this._unsubscribeOffers();
    const tripId = this.currentTripRequestId();
    if (tripId) this.agService.cancelTripRequest(tripId);
    this.tripDest.set(null);
    this.tripSent.set(false);
    this.tripOpen.set(false);
    this.tripQuery.set('');
    this.tripSuggestions.set([]);
    this.tripDistKm.set(0);
    this.tripPrice.set(0);
    this.waitingDriverCount.set(0);
    this.waitingDriverColors.set([]);
    this.autoAccept.set(false);
    this.currentTripRequestId.set(null);
    this.receivedOffers.set([]);
    this.tripAccepted.set(null);
    this.acceptingOfferId.set(null);
    this._clearRoute();
  }

  private _calcPrice(km: number, vehicle: 'carro' | 'moto'): number {
    const raw = vehicle === 'carro'
      ? Math.max(4500, 4500 + km * 1200)
      : Math.max(3000, 3000 + km * 800);
    const surge = this.surgeMultiplier() ?? 1;
    return Math.round((raw * surge) / 500) * 500;
  }

  private _distKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371, dLat = (lat2 - lat1) * Math.PI / 180, dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
    return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 10) / 10;
  }

  private async _drawRoute(destLng: number, destLat: number) {
    if (!this._map) return;
    const mapboxgl = (window as any).mapboxgl;
    if (!mapboxgl) return;
    this._clearRoute();
    try {
      const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${this._currentLng},${this._currentLat};${destLng},${destLat}?geometries=geojson&overview=full&access_token=${this.MAPBOX_TOKEN}`;
      const json = await (await fetch(url)).json();
      const route = json.routes?.[0];
      if (!route) return;

      const km = Math.round(route.distance / 100) / 10;
      this.tripDistKm.set(km);
      this.tripSuggestions.set([]);
      this.tripPrice.set(this._calcPrice(km, this.tripVehicle()));

      this._map.addSource('trip-route', { type: 'geojson', data: { type: 'Feature', properties: {}, geometry: route.geometry } });
      this._map.addLayer({ id: 'trip-route-bg',   type: 'line', source: 'trip-route', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#000',    'line-width': 9,  'line-opacity': 0.18 } });
      this._map.addLayer({ id: 'trip-route-line', type: 'line', source: 'trip-route', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#FF6600', 'line-width': 5,  'line-opacity': 0.92 } });
      this._map.addLayer({ id: 'trip-route-dash', type: 'line', source: 'trip-route', layout: { 'line-cap': 'round' },                       paint: { 'line-color': '#fff',    'line-width': 1.5,'line-opacity': 0.5, 'line-dasharray': [0, 4] } });

      // Marcador de destino
      const pin = document.createElement('div');
      pin.innerHTML = `<div style="position:relative;width:32px;height:44px"><div style="position:absolute;bottom:0;left:50%;transform:translateX(-50%);width:32px;height:40px;background:#FF6600;border-radius:50% 50% 50% 50% / 60% 60% 40% 40%;border:3px solid #fff;box-shadow:0 4px 14px rgba(0,0,0,0.45);display:flex;align-items:center;justify-content:center"><span class='material-symbols-outlined' style='color:#fff;font-size:16px'>place</span></div><div style="position:absolute;bottom:0;left:50%;transform:translateX(-50%);width:6px;height:6px;background:#FF6600;border-radius:50%;margin-bottom:-3px"></div></div>`;
      this._destMarker = new mapboxgl.Marker({ element: pin, anchor: 'bottom' }).setLngLat([destLng, destLat]).addTo(this._map);

      // Ajustar vista para mostrar toda la ruta
      const coords = route.geometry.coordinates as [number, number][];
      const bounds = coords.reduce((b: any, c: [number, number]) => b.extend(c), new mapboxgl.LngLatBounds(coords[0], coords[0]));
      this._map.fitBounds(bounds, { padding: { top: 80, bottom: 220, left: 40, right: 40 }, duration: 800 });
    } catch { /* ignore network errors */ }
  }

  private _clearRoute() {
    if (this._map) {
      ['trip-route-dash','trip-route-line','trip-route-bg'].forEach(id => {
        try { if (this._map.getLayer(id)) this._map.removeLayer(id); } catch { /**/ }
      });
      try { if (this._map.getSource('trip-route')) this._map.removeSource('trip-route'); } catch { /**/ }
    }
    if (this._destMarker) { try { this._destMarker.remove(); } catch { /**/ } this._destMarker = null; }
  }

  // ── Passenger form state ──
  passengerLoading = signal(false);
  passengerSuccess = signal(false);
  passengerError   = signal('');

  pf = {
    fullName: '', birthDate: '', city: '', idNumber: '',
    phone: '', email: '', password: '', selfie: '',
    emergencyName: '', emergencyPhone: '', terms: false,
  };
  private _pfFiles: Record<string, File> = {};

  // ── SMS verification state ──
  smsCodeSent = signal(false);
  smsCodeInput = '';
  smsGeneratedCode = '';
  smsSending = signal(false);
  smsVerified = signal(false);
  smsError = signal('');
  smsCountdown = signal(0);
  private _smsTimer: ReturnType<typeof setInterval> | null = null;

  async sendSmsCode(phone: string): Promise<void> {
    if (!phone || phone.length < 10) {
      this.smsError.set('Ingresa un número de teléfono válido');
      return;
    }
    this.smsSending.set(true);
    this.smsError.set('');

    // Generar código de 6 dígitos
    this.smsGeneratedCode = Math.floor(100000 + Math.random() * 900000).toString();

    try {
      const { data, error } = await this.supabase.functions.invoke('ag-sms', {
        body: { phone, code: this.smsGeneratedCode },
      });

      if (error) throw error;

      this.smsCodeSent.set(true);
      // Timer de 60 segundos para reenviar
      this.smsCountdown.set(60);
      this._smsTimer = setInterval(() => {
        this.smsCountdown.update(v => {
          if (v <= 1) {
            if (this._smsTimer) clearInterval(this._smsTimer);
            return 0;
          }
          return v - 1;
        });
      }, 1000);
    } catch (e: any) {
      this.smsError.set('Error al enviar SMS. Verifica tu número.');
    } finally {
      this.smsSending.set(false);
    }
  }

  verifySmsCode(): void {
    if (this.smsCodeInput === this.smsGeneratedCode) {
      this.smsVerified.set(true);
      this.smsError.set('');
      if (this._smsTimer) clearInterval(this._smsTimer);
    } else {
      this.smsError.set('Código incorrecto. Intenta de nuevo.');
    }
  }

  // ── Auto-asignación conductor más cercano ────────────────────
  private async _autoAssignNearestDrivers(tripId: string, lat: number, lng: number, vehicleType: string, price: number): Promise<void> {
    try {
      const drivers = await this.agService.findNearestDrivers(tripId, lat, lng, vehicleType);
      if (drivers.length === 0) return;

      // Enviar oferta al conductor más cercano con el precio del pasajero
      for (const driver of drivers) {
        await this.agService.autoOfferNearest(tripId, driver.driver_id, price);
      }
    } catch {
      // Silencioso — no afecta el flujo del pasajero, los conductores
      // también pueden ver la solicitud manualmente en su feed
    }
  }

  // ── Chat en viaje ────────────────────────────────────────────
  showChatModal = signal(false);
  chatMessages = signal<{ id: string; sender_ag_user_id: string; message: string; created_at: string }[]>([]);
  chatInput = '';
  chatSending = signal(false);
  chatRequestId = signal<string | null>(null);
  chatUnread = signal(0);
  private _chatChannel: RealtimeChannel | null = null;

  async openTripChat(): Promise<void> {
    const offer = this.tripAccepted();
    if (!offer?.trip_request_id) return;
    const requestId = offer.trip_request_id;
    this.chatRequestId.set(requestId);
    this.chatUnread.set(0);

    // Cargar mensajes existentes
    const messages = await this.agService.getChatMessages(requestId);
    this.chatMessages.set(messages);
    this.showChatModal.set(true);

    // Suscribirse a nuevos mensajes
    this._unsubscribeChat();
    this._chatChannel = this.agService.subscribeToChatMessages(requestId, (msg) => {
      this.chatMessages.update(list => [...list, msg]);
    });
  }

  async openDriverChat(trip: any): Promise<void> {
    const requestId = trip.ag_trip_requests?.id ?? trip.trip_request_id;
    if (!requestId) return;
    this.chatRequestId.set(requestId);
    this.chatUnread.set(0);

    const messages = await this.agService.getChatMessages(requestId);
    this.chatMessages.set(messages);
    this.showChatModal.set(true);

    this._unsubscribeChat();
    this._chatChannel = this.agService.subscribeToChatMessages(requestId, (msg) => {
      this.chatMessages.update(list => [...list, msg]);
    });
  }

  closeChatModal(): void {
    this.showChatModal.set(false);
    this._unsubscribeChat();
  }

  async sendChatMsg(): Promise<void> {
    const text = this.chatInput.trim();
    const reqId = this.chatRequestId();
    const myProfile = this.agProfile();
    if (!text || !reqId || !myProfile) return;

    this.chatSending.set(true);
    await this.agService.sendChatMessage(reqId, myProfile.id, text);
    this.chatInput = '';
    this.chatSending.set(false);
  }

  isMyChatMessage(msg: { sender_ag_user_id: string }): boolean {
    return msg.sender_ag_user_id === this.agProfile()?.id;
  }

  formatChatTime(dateStr: string): string {
    return new Date(dateStr).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
  }

  private _unsubscribeChat(): void {
    if (this._chatChannel) {
      this._chatChannel.unsubscribe();
      this._chatChannel = null;
    }
  }

  resetSmsState(): void {
    this.smsCodeSent.set(false);
    this.smsCodeInput = '';
    this.smsGeneratedCode = '';
    this.smsVerified.set(false);
    this.smsError.set('');
    this.smsCountdown.set(0);
    if (this._smsTimer) clearInterval(this._smsTimer);
  }

  // ── Driver form state ──
  driverLoading = signal(false);
  driverSuccess = signal(false);
  driverError   = signal('');

  df = {
    fullName: '', birthDate: '', city: '', idNumber: '',
    phone: '', email: '', password: '',
    emergencyName: '', emergencyPhone: '',
    idFront: '', idBack: '', selfieWithId: '', criminalRecord: '',
    licenseNumber: '', licenseCategory: '', licenseExpiry: '', licensePhoto: '', licenseBack: '',
    plate: '', vehicleType: '', vehicleBrand: '', vehicleModel: '', vehicleYear: '', vehicleColor: '',
    vehiclePhoto: '', vehicleSidePhoto: '',
    soatPhoto: '', soatExpiry: '',
    propertyCardFront: '', propertyCardBack: '',
    tecnoPhoto: '', tecnoExpiry: '',
    civilLiability: '', civilLiabilityExpiry: '',
    terms: false,
  };
  private _dfFiles: Record<string, File> = {};

  // ── Field definitions ──
  idPhotoFields = [
    { key: 'idFront',      label: 'Cédula — parte frontal' },
    { key: 'idBack',       label: 'Cédula — parte trasera' },
    { key: 'selfieWithId', label: 'Selfie sosteniendo la cédula' },
  ];

  vehiclePhotoFields = [
    { key: 'vehiclePhoto',     label: 'Foto frontal del vehículo' },
    { key: 'vehicleSidePhoto', label: 'Foto lateral del vehículo' },
  ];

  vehicleDocFields = [
    { key: 'soatPhoto',         label: 'SOAT (seguro obligatorio)', expiry: 'soatExpiry' },
    { key: 'propertyCardFront', label: 'Tarjeta de propiedad — frontal', expiry: null },
    { key: 'propertyCardBack',  label: 'Tarjeta de propiedad — trasera', expiry: null },
    { key: 'tecnoPhoto',        label: 'Revisión tecnomecánica', expiry: 'tecnoExpiry' },
    { key: 'civilLiability',    label: 'Seguro de responsabilidad civil', expiry: 'civilLiabilityExpiry' },
  ];

  get dfr(): Record<string, unknown> { return this.df as Record<string, unknown>; }

  onPassengerFileChange(event: Event, field: string) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (file) {
      (this.pf as Record<string, unknown>)[field] = file.name;
      this._pfFiles[field] = file;
    }
  }

  onDriverFileChange(event: Event, field: string) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (file) {
      (this.df as Record<string, unknown>)[field] = file.name;
      this._dfFiles[field] = file;
    }
  }

  nextDriverStep(current: number) {
    this.driverError.set('');
    if (current === 1) {
      if (!this.df.fullName || !this.df.birthDate || !this.df.city || !this.df.idNumber ||
          !this.df.phone || !this.df.email || !this.df.password || !this.df.emergencyName || !this.df.emergencyPhone) {
        this.driverError.set('Por favor completa todos los campos obligatorios antes de continuar.');
        return;
      }
    }
    if (current === 2) {
      if (!this.df.idFront || !this.df.idBack || !this.df.selfieWithId || !this.df.criminalRecord) {
        this.driverError.set('Debes subir todos los documentos de identidad requeridos.');
        return;
      }
    }
    if (current === 3) {
      if (!this.df.licenseNumber || !this.df.licenseCategory || !this.df.licenseExpiry || !this.df.licensePhoto || !this.df.licenseBack) {
        this.driverError.set('Completa todos los datos y fotos de tu licencia de conducción.');
        return;
      }
    }
    this.driverStep.set(current + 1);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async submitPassenger() {
    this.passengerError.set('');
    const p = this.pf;
    if (!p.fullName || !p.birthDate || !p.city || !p.idNumber ||
        !p.phone || !p.email || !p.password || !p.emergencyName || !p.emergencyPhone) {
      this.passengerError.set('Por favor completa todos los campos obligatorios.');
      return;
    }
    if (!this.smsVerified()) {
      this.passengerError.set('Debes verificar tu número de teléfono con el código SMS.');
      return;
    }
    if (!p.terms) {
      this.passengerError.set('Debes aceptar los términos y condiciones.');
      return;
    }
    this.passengerLoading.set(true);
    const result = await this.agService.registerPassenger({
      fullName: p.fullName,
      birthDate: p.birthDate,
      city: p.city,
      idNumber: p.idNumber,
      phone: p.phone,
      email: p.email,
      password: p.password,
      emergencyName: p.emergencyName,
      emergencyPhone: p.emergencyPhone,
      selfieFile: this._pfFiles['selfie'],
      referredBy: this.referredBy ?? undefined,
    });
    this.passengerLoading.set(false);
    if (result.success) {
      this.passengerSuccess.set(true);
      setTimeout(async () => {
        await this.ngOnInit();
      }, 2000);
    } else {
      this.passengerError.set(result.error ?? 'Error al registrarse.');
    }
  }

  async submitDriver() {
    this.driverError.set('');
    if (!this.df.plate || !this.df.vehicleType || !this.df.vehicleBrand ||
        !this.df.vehicleModel || !this.df.vehicleYear || !this.df.vehicleColor) {
      this.driverError.set('Completa todos los datos del vehículo.');
      return;
    }
    if (!this.smsVerified()) {
      this.driverError.set('Debes verificar tu número de teléfono con el código SMS.');
      return;
    }
    if (!this.df.terms) {
      this.driverError.set('Debes aceptar los términos y condiciones.');
      return;
    }
    this.driverLoading.set(true);
    const result = await this.agService.registerDriver({
      fullName: this.df.fullName,
      birthDate: this.df.birthDate,
      city: this.df.city,
      idNumber: this.df.idNumber,
      phone: this.df.phone,
      email: this.df.email,
      password: this.df.password,
      emergencyName: this.df.emergencyName,
      emergencyPhone: this.df.emergencyPhone,
      licenseNumber: this.df.licenseNumber,
      licenseCategory: this.df.licenseCategory,
      licenseExpiry: this.df.licenseExpiry,
      plate: this.df.plate,
      vehicleType: this.df.vehicleType,
      vehicleBrand: this.df.vehicleBrand,
      vehicleModel: this.df.vehicleModel,
      vehicleYear: this.df.vehicleYear,
      vehicleColor: this.df.vehicleColor,
      files: this._dfFiles,
      referredBy: this.referredBy ?? undefined,
    });
    this.driverLoading.set(false);
    if (result.success) {
      this.driverSuccess.set(true);
      setTimeout(async () => {
        await this.ngOnInit();
      }, 2000);
    } else {
      this.driverError.set(result.error ?? 'Error al registrarse.');
    }
  }

  // ── Recarga de billetera vía ePayco ────────────────────────────────────────

  async startWalletRecharge(): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) return;

    const amount = this.rechargeAmount();
    if (amount < 5000) {
      this.rechargeError.set('El monto mínimo es $5.000 COP');
      return;
    }

    this.rechargeError.set(null);
    this.rechargeLoading.set(true);

    try {
      const params = await this.agService.createWalletRecharge(amount);
      await this._openEpaycoWalletCheckout(params);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al iniciar el pago';
      this.rechargeError.set(msg);
    } finally {
      this.rechargeLoading.set(false);
    }
  }

  private _loadEpaycoScript(): Promise<void> {
    return new Promise((resolve, reject) => {
      if ((window as unknown as Record<string, unknown>)['ePayco']) {
        resolve();
        return;
      }
      const script = document.createElement('script');
      script.src = 'https://checkout.epayco.co/checkout.js';
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('No se pudo cargar el script de ePayco'));
      document.head.appendChild(script);
    });
  }

  // ── Passenger menu methods ─────────────────────────────────────
  async loadReferralData() {
    const profile = this.agProfile();
    if (!profile) return;
    const [wallet, count, txs] = await Promise.all([
      this.agService.getReferralWallet(profile.id),
      this.agService.getReferralCount(profile.id),
      this.agService.getReferralTransactions(profile.id),
    ]);
    this.referralBalance.set(wallet?.balance ?? 0);
    this.referralTotalEarned.set(wallet?.total_earned ?? 0);
    this.referralCount.set(count);
    this.referralTransactions.set(txs);
  }

  async copyReferralLink() {
    if (isPlatformBrowser(this.platformId)) {
      await navigator.clipboard.writeText(this.agReferralLink());
      this.referralCopied.set(true);
      setTimeout(() => this.referralCopied.set(false), 2000);
    }
  }

  openPassengerSection(action: string) {
    this.agMenuOpen.set(false);
    if (action.startsWith('service:')) {
      const svc = action.replace('service:', '') as 'viaje' | 'moto' | 'ciudad' | 'domicilio' | 'fletes';
      this.tripService.set(svc);
      return;
    }
    if (action === 'driver') {
      this.screen.set('driver-home');
      return;
    }
    this.passengerSection.set(action);
    if (action === 'history') this.loadPassengerHistory();
    if (action === 'referrals') this.loadReferralData();
  }

  async loadPassengerHistory() {
    const profile = this.agProfile();
    if (!profile) return;
    this.passengerHistoryLoading.set(true);
    try {
      const history = await this.agService.getPassengerTripHistory(profile.id);
      this.passengerHistory.set(history);
    } catch { /* silent */ } finally {
      this.passengerHistoryLoading.set(false);
    }
  }

  addPassengerContact() {
    if (!this.passengerNewContactName.trim() || !this.passengerNewContactPhone.trim()) return;
    this.passengerSecurityContacts.update(list => [
      ...list,
      { name: this.passengerNewContactName.trim(), phone: this.passengerNewContactPhone.trim() },
    ]);
    this.passengerNewContactName = '';
    this.passengerNewContactPhone = '';
  }

  removePassengerContact(phone: string) {
    this.passengerSecurityContacts.update(list => list.filter(c => c.phone !== phone));
  }

  async savePassengerSettings() {
    this.savingPassengerSettings.set(true);
    await new Promise(r => setTimeout(r, 400));
    this.savingPassengerSettings.set(false);
  }

  // ═════════════ Push notifications ═════════════
  private _urlB64ToUint8(base64: string): Uint8Array {
    const padding = '='.repeat((4 - (base64.length % 4)) % 4);
    const b = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
    const raw = atob(b);
    const out = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
  }

  async checkPushSupport(): Promise<void> {
    if (typeof window === 'undefined') return;
    const supported = 'serviceWorker' in navigator && 'PushManager' in window;
    this.pushSupported.set(supported);
    if (!supported) return;
    try {
      const reg = await navigator.serviceWorker.getRegistration('/sw-movi.js');
      const sub = await reg?.pushManager.getSubscription();
      this.pushEnabled.set(!!sub);
    } catch {}
  }

  async enablePush(): Promise<void> {
    const vapid = (environment as any).vapidPublicKey;
    if (!vapid) { alert('Notificaciones no configuradas'); return; }
    try {
      const reg = await navigator.serviceWorker.register('/sw-movi.js');
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') { alert('Permiso denegado por el navegador'); return; }
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        const key = this._urlB64ToUint8(vapid);
        sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key.buffer as ArrayBuffer });
      }
      await this.agService.registerPushSubscription(sub);
      this.pushEnabled.set(true);
    } catch (e: any) { alert('Error: ' + (e?.message ?? 'No se pudo activar')); }
  }

  async disablePush(): Promise<void> {
    try {
      const reg = await navigator.serviceWorker.getRegistration('/sw-movi.js');
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await this.agService.unregisterPushSubscription(sub.endpoint);
        await sub.unsubscribe();
      }
      this.pushEnabled.set(false);
    } catch {}
  }

  async callDriver(): Promise<void> {
    const tripId = this.currentTripRequestId();
    if (!tripId || this.callingDriver()) return;
    this.callingDriver.set(true);
    try {
      const r = await this.agService.startMaskedCall(tripId);
      if (r.ok) {
        alert('📞 Te estamos llamando. Contesta y serás conectado con el conductor.');
      } else {
        alert('Error: ' + (r.error ?? 'No se pudo iniciar llamada'));
      }
    } finally { this.callingDriver.set(false); }
  }

  // ═══════════ Cupones ═══════════
  async applyCouponCode(): Promise<void> {
    const code = (this.couponInput ?? '').trim();
    if (!code) return;
    this.validatingCoupon.set(true);
    this.couponError.set(null);
    try {
      const r = await this.agService.validateCoupon(code, this.tripPrice());
      if (r.ok && r.couponId != null && r.discount != null) {
        this.appliedCoupon.set({ couponId: r.couponId, discount: r.discount, title: r.title ?? code, description: r.description });
      } else {
        this.couponError.set(r.error ?? 'Cupón inválido');
      }
    } finally { this.validatingCoupon.set(false); }
  }

  removeCoupon(): void {
    this.appliedCoupon.set(null);
    this.couponInput = '';
    this.couponError.set(null);
  }

  async triggerPanic(): Promise<void> {
    if (this.panicActivated() || this.panicSending()) return;
    this.panicSending.set(true);
    try {
      // Obtener ubicación actual
      let lat: number | undefined;
      let lng: number | undefined;
      let accuracy: number | undefined;
      if (typeof navigator !== 'undefined' && navigator.geolocation) {
        try {
          const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
            navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 8000 })
          );
          lat = pos.coords.latitude;
          lng = pos.coords.longitude;
          accuracy = pos.coords.accuracy;
        } catch {}
      }
      // Sincronizar contactos locales con DB antes (si no están)
      try {
        const userId = (await this.agService['supabase'].auth.getUser()).data.user?.id;
        if (userId) {
          const existing = await this.agService.listEmergencyContacts(userId);
          const existingPhones = new Set((existing ?? []).map((c: any) => c.phone));
          const locals = this.passengerSecurityContacts();
          for (const c of locals) {
            if (!existingPhones.has(c.phone)) {
              await this.agService.addEmergencyContact(userId, c.name, c.phone).catch(() => {});
            }
          }
        }
      } catch {}

      const tripId = this.currentTripRequestId();
      const result = await this.agService.triggerSos({ tripId: tripId ?? null, lat, lng, accuracy, message: 'Activado desde la app' });
      this.panicActivated.set(true);
      this.panicContactsNotified.set(result.contactsNotified ?? 0);
      this.panicMapsLink.set(result.mapsLink ?? '');
      if (typeof alert !== 'undefined') {
        alert(`🚨 Alerta enviada. ${result.contactsNotified ?? 0} contacto(s) notificado(s).\n\nSi es una emergencia real, llama al 123.`);
      }
    } catch (e: any) {
      alert('Error: ' + (e?.message ?? 'No se pudo enviar alerta'));
    } finally {
      this.panicSending.set(false);
    }
  }

  togglePassengerFaq(q: string) {
    this.openPassengerFaq.set(this.openPassengerFaq() === q ? null : q);
  }

  togglePassengerSound() {
    const s = this.passengerNotifSettings();
    this.passengerNotifSettings.set({ ...s, sound: !s.sound });
  }

  togglePassengerVibration() {
    const s = this.passengerNotifSettings();
    this.passengerNotifSettings.set({ ...s, vibration: !s.vibration });
  }

  togglePassengerNewOffers() {
    const s = this.passengerNotifSettings();
    this.passengerNotifSettings.set({ ...s, newOffers: !s.newOffers });
  }

  togglePassengerHidePhone() {
    const s = this.passengerSettings();
    this.passengerSettings.set({ ...s, hidePhone: !s.hidePhone });
  }

  formatTripDate(isoString: string): string {
    try {
      return new Date(isoString).toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: '2-digit' });
    } catch {
      return '';
    }
  }

  private async _openEpaycoWalletCheckout(params: Record<string, unknown>): Promise<void> {
    await this._loadEpaycoScript();

    const epayco = (window as unknown as Record<string, unknown>)['ePayco'] as {
      checkout: { configure: (cfg: unknown) => { open: (params: unknown) => void } };
    };

    const handler = epayco.checkout.configure({
      key:  params['publicKey'],
      test: params['test'],
    });

    handler.open({
      name:          params['name'],
      description:   params['description'],
      invoice:       params['invoice'],
      currency:      params['currency'],
      amount:        params['amount'],
      tax_base:      params['tax_base'],
      tax:           params['tax'],
      country:       params['country'],
      lang:          params['lang'],
      external:      'true',
      methodConfirmation: 'GET',
      confirmation:  params['confirmation'],
      response:      params['response'],
      email_billing: params['email_billing'],
      name_billing:  params['name_billing'],
      extra1:        params['extra1'],
      extra2:        params['extra2'],
      extra3:        params['extra3'],
    });
  }
}
