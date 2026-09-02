import { Injectable } from '@angular/core';
import { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import * as Sentry from '@sentry/angular';
import { getMoviClient } from './movi.client';
import { environment } from '../../../environments/environment';

export interface PassengerFormData {
  fullName: string; birthDate: string; city: string; idNumber: string;
  phone: string; email: string; password: string;
  emergencyName: string; emergencyPhone: string;
  country?: string; department?: string;
  selfieFile?: File;
  referredBy?: string;
}

export interface DriverFormData {
  fullName: string; birthDate: string; city: string; idNumber: string;
  phone: string; email: string; password: string;
  emergencyName: string; emergencyPhone: string;
  country?: string; department?: string;
  licenseNumber: string; licenseCategory: string; licenseExpiry: string;
  plate: string; vehicleType: string; vehicleBrand: string;
  vehicleModel: string; vehicleYear: string; vehicleColor: string;
  files: Record<string, File>;
  referredBy?: string;
}

/** Datos del Paso 1 del registro de conductor -- ver createDriverStep1(). */
export interface DriverStep1Data {
  fullName: string; birthDate: string; city: string; idNumber: string;
  phone: string; email: string;
  emergencyName: string; emergencyPhone: string;
  country?: string; department?: string;
  referredBy?: string;
}

export interface AgUser {
  id: string; auth_user_id: string; role: 'passenger' | 'driver';
  full_name: string; birth_date: string; city: string;
  phone: string; email: string; status: string;
  created_at: string;
  selfie_url?: string;
  selfie_verified?: boolean;
  loyalty_points?: number;
  total_trips_as_passenger?: number;
  passenger_level?: string;
  passenger_wallet_balance?: number;
  passenger_verified?: boolean;
  id_front_url?: string;
  id_back_url?: string;
  ref_code?: string;
}

export interface AgDriver {
  id: string; ag_user_id: string;
  license_number: string; license_category: string; license_expiry: string;
  plate: string; vehicle_plate?: string; vehicle_type: string; vehicle_brand: string;
  vehicle_model: string; vehicle_year: string; vehicle_color: string;
  documents: Record<string, string>; status: string;
  rejection_reason: string | null; approved_at: string | null;
  wallet_balance: number;
  max_distance_km: number;
  accepts_pets: boolean;
  accepts_luggage: boolean;
  accepts_child_seat: boolean;
  hide_phone: boolean;
  notify_sound: boolean;
  notify_vibration: boolean;
  is_online: boolean;
  created_at: string;
  ag_users?: AgUser;
  level?: string;
  level_points?: number;
  auto_accept_enabled?: boolean;
  auto_accept_min_price?: number;
  auto_accept_max_distance?: number;
  rating_avg?: number;
  rating_count?: number;
  trips_completed?: number;
  tutorial_completed?: boolean;
}

export interface AgTripOffer {
  id: string;
  trip_request_id: string;
  driver_id: string;
  offered_price: number;
  status: 'pending' | 'accepted' | 'rejected' | 'cancelled';
  created_at: string;
  updated_at: string;
  ag_drivers?: AgDriver & { ag_users?: AgUser };
  ag_trip_requests?: AgTripRequest;
}

export type AgPaymentMethod = 'efectivo' | 'nequi' | 'daviplata' | 'bancolombia' | 'tarjeta';

export interface AgTripRequest {
  id: string;
  passenger_user_id: string;
  passenger_name?: string;
  passenger_selfie_url?: string;
  // Pedido para otra persona -- ver ag-whatsapp/index.ts createWaTrip() (WhatsApp,
  // identifica a quien pidió por su celular) y requestTrip() más abajo (app,
  // identifica a quien pidió por su user id).
  for_other?: { name: string; phone: string | null; requested_by_phone?: string; requested_by_user_id?: string } | null;
  passenger_note?: string | null;
  accessibility?: { pets?: boolean; luggage?: boolean; child_seat?: boolean; wheelchair?: boolean } | null;
  origin_lat: number;
  origin_lng: number;
  origin_name?: string;
  dest_name: string;
  dest_lat: number;
  dest_lng: number;
  distance_km: number;
  vehicle_type: string;
  offered_price: number;
  payment_method: AgPaymentMethod;
  status: string;
  created_at: string;
  // Reloj aparte de created_at para decidir si el conductor debe seguir viendo la solicitud en su
  // lista -- arranca igual a created_at, pero ag_rebroadcast_trip_request() lo reinicia a now()
  // cada vez que el pasajero toca "Seguir buscando"/"Subir oferta" (migración 242). created_at
  // sigue siendo el momento real en que se pidió el viaje (historial/analítica), sin tocar.
  driver_visible_since: string;
  ag_users?: AgUser;
  // ── Domicilio fields ────────────────────────────────────────────
  service_type?: string;
  package_type?: string;
  package_description?: string;
  recipient_name?: string;
  recipient_phone?: string;
  contactless_delivery?: boolean;
  delivery_code?: string;
  driver_stage?: string;
}

export interface AgRegistrationResult {
  success: boolean;
  error?: string;
}

@Injectable({ providedIn: 'root' })
export class AndaGanaService {
  private readonly supabase: SupabaseClient = getMoviClient();

  private _withTimeout<T>(promise: Promise<T>, ms = 12000): Promise<T> {
    return Promise.race([
      promise,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Tiempo de espera agotado. Verifica tu conexión.')), ms)
      ),
    ]);
  }

  /**
   * Reporta un fallo real del flujo de viaje: siempre a Sentry, y si es
   * `critical` además por WhatsApp al número de soporte (mismo canal que
   * ya usa triggerWaSos en ag-whatsapp). Supabase no lanza excepciones en
   * queries fallidas, solo devuelve {data, error}, así que sin esto los
   * fallos quedaban invisibles para todos (plan "Alertas de error en el
   * flujo de viaje", 2026-08-09).
   */
  private reportTripError(context: string, error: unknown, opts?: { critical?: boolean; extra?: Record<string, unknown> }): void {
    const err = error instanceof Error ? error : new Error(typeof error === 'string' ? error : JSON.stringify(error));
    Sentry.captureException(err, { tags: { flow: 'anda-gana', context }, extra: opts?.extra });
    if (opts?.critical) {
      fetch(`${environment.andaGana.functionsBaseUrl}/ag-whatsapp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: 'admin', event: 'error_alert', data: { context, message: err.message } }),
      }).catch(() => {});
    }
  }

  // ── Auth ──────────────────────────────────────────────────────
  private async currentUserId(): Promise<string | null> {
    // Bug real encontrado 2026-08-12 (app que nunca salía de la pantalla de carga, confirmado
    // por el usuario que esperó mas de 15s): getSession() puede quedarse colgado sin resolver
    // NI rechazar bajo ciertas condiciones (token de sesión corrupto/expirado, lock interno del
    // SDK) -- sin timeout, ngOnInit espera este await para siempre y screen() nunca sale de
    // 'splash'. _withTimeout ya existía para otros usos pero no estaba aplicado aquí.
    const { data } = await this._withTimeout(this.supabase.auth.getSession(), 8000);
    return data.session?.user?.id ?? null;
  }

  // ── Perfil AG del usuario actual ──────────────────────────────
  async getMyAgProfile(): Promise<AgUser | null> {
    const uid = await this.currentUserId();
    if (!uid) return null;
    // Usar array select para manejar teléfonos duplicados (mismo auth_user_id en varios registros)
    const { data } = await this.supabase
      .from('ag_users')
      .select('*')
      .eq('auth_user_id', uid)
      .order('created_at', { ascending: false });
    if (!data || data.length === 0) return null;
    return (data as any[]).find((u: any) => u.role === 'driver') ?? data[0];
  }

  /** Resuelve el código corto del link de invitación (?r=carlos4821) al UUID real de
   * ag_users.id -- ver migración 231_ag_referral_ref_code. Resuelve vía RPC SECURITY DEFINER
   * (ag_resolve_ref_code, migración 233) en vez de leer la tabla directo: ag_users ya no tiene
   * SELECT público (ver hallazgo "ag_users_select_by_phone/ag_users_admin_read" de la auditoría
   * 2026-08-25), así que igual no hace falta sesión para esto (el link se abre antes de
   * registrarse), pero ahora sin exponer el resto de la tabla. */
  async resolveRefCode(code: string): Promise<string | null> {
    try {
      const { data } = await this.supabase.rpc('ag_resolve_ref_code', { p_code: code });
      return data ?? null;
    } catch { return null; }
  }

  // ── Driver profile for current user ───────────────────────────
  async getMyDriverProfile(): Promise<AgDriver | null> {
    const profile = await this.getMyAgProfile();
    if (!profile || profile.role !== 'driver') return null;
    const { data } = await this.supabase
      .from('ag_drivers')
      .select('*')
      .eq('ag_user_id', profile.id)
      .maybeSingle();
    return data ?? null;
  }

  // ── Registro ──────────────────────────────────────────────────
  private async uploadFile(bucket: string, folder: string, file: File): Promise<string | null> {
    const ext = file.name.split('.').pop() ?? 'jpg';
    const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const { error } = await this.supabase.storage.from(bucket).upload(path, file, {
      cacheControl: '3600', upsert: false, contentType: file.type,
    });
    if (error) return null;
    const { data } = this.supabase.storage.from(bucket).getPublicUrl(path);
    return data.publicUrl;
  }

  async registerQuickPassenger(name: string, phone: string, referredBy?: string): Promise<AgRegistrationResult & { profile?: AgUser }> {
    try {
      let { data: { user } } = await this.supabase.auth.getUser();
      if (!user) {
        const { data: byPhone } = await this.supabase
          .rpc('ag_get_user_by_phone', { p_phone: phone }).maybeSingle();
        if (byPhone) return { success: true, profile: byPhone as AgUser };
        return { success: false, error: 'Sesión expirada. Vuelve a verificar tu número.' };
      }
      const { data: profiles, error } = await this.supabase.rpc('ag_upsert_user_by_phone', {
        p_phone: phone,
        p_auth_uid: user.id,
        p_role: 'passenger',
        p_full_name: name || 'Usuario',
        p_referred_by: referredBy ?? null,
      });
      if (error) {
        const { data: byPhone } = await this.supabase
          .rpc('ag_get_user_by_phone', { p_phone: phone }).maybeSingle();
        if (byPhone) return { success: true, profile: byPhone as AgUser };
        return { success: false, error: 'No se pudo crear tu perfil. Intenta de nuevo.' };
      }
      const profile = Array.isArray(profiles) ? profiles[0] : profiles;
      return { success: true, profile: profile as AgUser };
    } catch (e: any) {
      return { success: false, error: 'Error al registrarse. Intenta de nuevo.' };
    }
  }

  async registerQuickDriver(
    name: string, phone: string, vehicleType: string, referredBy?: string,
    vehicleDetails?: { brand?: string; color?: string; plate?: string },
    prebuiltProfile?: any
  ): Promise<AgRegistrationResult & { profile?: AgUser }> {
    try {
      let profile: AgUser | null = prebuiltProfile ?? null;

      if (!profile) {
        // Try to get the current user (session may have been set by setSession after OTP verify)
        let { data: { user } } = await this.supabase.auth.getUser();
        if (!user) {
          // No session — fall back to phone lookup via edge function pattern: fetch profile by phone
          // (signInAnonymously is disabled, so we skip it)
          const { data: byPhone } = await this.supabase
            .rpc('ag_get_user_by_phone', { p_phone: phone }).maybeSingle();
          if (byPhone) {
            profile = byPhone as AgUser;
          } else {
            return { success: false, error: 'Sesión expirada. Vuelve a verificar tu número.' };
          }
        } else {
          // Upsert ag_user via SECURITY DEFINER (bypasses RLS for phone lookup + insert)
          const { data: profiles, error: upsertError } = await this.supabase.rpc('ag_upsert_user_by_phone', {
            p_phone: phone,
            p_auth_uid: user.id,
            p_role: 'driver',
            p_full_name: name || 'Conductor',
            p_referred_by: referredBy ?? null,
          });
          if (upsertError) {
            // RPC failed — try direct phone lookup as last resort
            const { data: byPhone } = await this.supabase
              .rpc('ag_get_user_by_phone', { p_phone: phone }).maybeSingle();
            if (byPhone) { profile = byPhone as AgUser; }
            else return { success: false, error: 'No se pudo crear tu perfil. Intenta de nuevo.' };
          } else {
            profile = (Array.isArray(profiles) ? profiles[0] : profiles) as AgUser;
          }
        }
      }

      // Ensure ag_drivers record exists
      const { data: existingDriver } = await this.supabase
        .from('ag_drivers').select('id, status, metric_trips_completed').eq('ag_user_id', profile.id).maybeSingle();
      if (existingDriver) {
        const updateData: any = {};
        if (vehicleType) updateData.vehicle_type = vehicleType;
        if (vehicleDetails?.brand) updateData.vehicle_brand = vehicleDetails.brand;
        if (vehicleDetails?.color) updateData.vehicle_color = vehicleDetails.color;
        if (vehicleDetails?.plate) { updateData.plate = vehicleDetails.plate; updateData.vehicle_plate = vehicleDetails.plate; }
        if ((existingDriver.metric_trips_completed ?? 0) === 0) updateData.status = 'quick';
        if (Object.keys(updateData).length > 0) {
          await this.supabase.from('ag_drivers').update(updateData).eq('id', existingDriver.id);
        }
      } else {
        const { error: driverError } = await this.supabase.from('ag_drivers').insert({
          ag_user_id: profile.id, vehicle_type: vehicleType,
          vehicle_brand: vehicleDetails?.brand ?? '',
          vehicle_color: vehicleDetails?.color ?? '',
          plate: vehicleDetails?.plate ?? 'PENDIENTE',
          vehicle_plate: vehicleDetails?.plate ?? 'PENDIENTE',
          status: 'quick', is_online: false, wallet_balance: 0,
        });
        if (driverError) return { success: false, error: 'No se pudo guardar el vehículo. Intenta de nuevo.' };
      }
      return { success: true, profile };
    } catch (e: any) {
      return { success: false, error: 'Error al registrarse. Intenta de nuevo.' };
    }
  }

  /**
   * Deja el telefono siempre en formato E.164 (+57...) antes de guardarlo en ag_users.
   *
   * BUG REAL 2026-09-01: los tres registros (pasajero y las dos rutas de conductor) guardaban
   * form.phone tal cual lo escribia la persona -- 10 digitos sueltos, sin prefijo. Todo lo demas
   * del sistema busca por E.164. El impacto real es el bot de soporte de WhatsApp: consulta
   * ag_users/ag_drivers por telefono para responder estado de solicitud, saldo, bonos y
   * vencimientos, y a un conductor guardado sin prefijo simplemente no lo encuentra -- le
   * responde mal o escala a un humano sin necesidad. El login NO se rompia: ag-otp-verify
   * busca primero por telefono y, si no encuentra, cae a buscar por auth_user_id (que si
   * coincidia, porque el correo sintetico si se arma con el telefono ya normalizado) --
   * comprobado leyendo el codigo, no asumido. Habia 3 conductores reales asi (Pedro, Jeison y
   * Henry) cuando se detecto.
   */
  private _phoneE164(phone: string): string {
    const raw = (phone ?? '').trim();
    if (!raw) return raw;
    const digits = raw.replace(/D/g, '');
    if (!digits) return raw;
    if (raw.startsWith('+')) return '+' + digits;
    if (digits.length === 10) return '+57' + digits;
    if (digits.length === 12 && digits.startsWith('57')) return '+' + digits;
    return '+' + digits;
  }

  async registerPassenger(form: PassengerFormData): Promise<AgRegistrationResult> {
    try {
      const uid = await this.currentUserId();
      if (!uid) return { success: false, error: 'Debes iniciar sesión primero.' };

      const existing = await this.getMyAgProfile();
      if (existing) return { success: false, error: 'Ya tienes un perfil en Anda y Gana.' };

      let selfieUrl: string | null = null;
      if (form.selfieFile) {
        selfieUrl = await this.uploadFile('ag-passengers', uid, form.selfieFile);
      }

      const insertData: any = {
        auth_user_id: uid,
        role: 'passenger',
        full_name: form.fullName,
        birth_date: form.birthDate,
        country: form.country ?? 'Colombia',
        department: form.department ?? '',
        city: form.city,
        id_number: form.idNumber,
        phone: this._phoneE164(form.phone),
        email: form.email,
        emergency_contact_name: form.emergencyName,
        emergency_contact_phone: form.emergencyPhone,
        selfie_url: selfieUrl,
      };
      if (form.referredBy) insertData.referred_by = form.referredBy;

      const { error } = await this.supabase.from('ag_users').insert(insertData);

      if (error) {
        console.error('[registerPassenger] ag_users insert:', error);
        return { success: false, error: 'No se pudo crear tu perfil. Intenta de nuevo.' };
      }
      return { success: true };
    } catch (e: any) {
      console.error('[registerPassenger] catch:', e);
      return { success: false, error: 'Error al registrarse. Intenta de nuevo.' };
    }
  }

  /** Traduce errores crudos de Postgres (ej. del trigger ag_validate_vehicle_age, migración
   * 185) a mensajes que el conductor entiende -- por defecto (validación ya cubierta en el
   * frontend, esto es la red de seguridad) cae a un mensaje genérico en vez de mostrar el
   * texto técnico de Postgres. Ver [[feedback_no_english_errors]]: nunca mostrar errores
   * técnicos de librerías al usuario. */
  private _friendlyDriverError(error: { message?: string } | null): string {
    const msg = error?.message ?? '';
    if (msg.includes('VEHICULO_MUY_ANTIGUO:')) return msg.split('VEHICULO_MUY_ANTIGUO:')[1].trim();
    if (msg.includes('AÑO_INVALIDO:')) return msg.split('AÑO_INVALIDO:')[1].trim();
    if (msg.includes('PAIS_NO_PERMITIDO:')) return msg.split('PAIS_NO_PERMITIDO:')[1].trim();
    if (msg.includes('CEDULA_INVALIDA:')) return msg.split('CEDULA_INVALIDA:')[1].trim();
    if (msg.includes('DOCUMENTOS_VENCIDOS:')) return msg.split('DOCUMENTOS_VENCIDOS:')[1].trim();
    if (msg.includes('VEHICULO_DEBE_ACTUALIZARSE:')) return msg.split('VEHICULO_DEBE_ACTUALIZARSE:')[1].trim();
    return 'No se pudo guardar los documentos. Intenta de nuevo.';
  }

  /**
   * Crea el conductor apenas termina el Paso 1 (datos personales) y confirma el OTP -- ya no se
   * espera a que llene los 4 pasos para tener sesión + fila en ag_drivers. Pedido explícito del
   * usuario 2026-08-21 ("consultemos el RUNT apenas ponga la placa"): para eso hace falta un
   * driver_id real antes de llegar al Paso 4, así el chequeo en vivo con Verifik
   * (verifyVehicleRunt) puede correr mientras el conductor todavía está llenando el formulario.
   * Deja el conductor en status='quick' (mismo estado que ya usa el alta rápida por WhatsApp/QR,
   * ver registerQuickDriver más arriba) -- registerDriver() en el Paso 4 ya sabe completar esa
   * fila via _completeDriverRegistration() en vez de insertar una nueva.
   */
  async createDriverStep1(form: DriverStep1Data): Promise<{ success: boolean; driverId?: string; error?: string }> {
    try {
      const uid = await this.currentUserId();
      if (!uid) return { success: false, error: 'Sesión no encontrada. Vuelve a verificar tu número.' };

      let existing = await this.getMyAgProfile();
      let agUserId: string | undefined = existing?.id;

      if (!agUserId) {
        // Red de seguridad: ag-otp-verify ya debería haber creado esta fila (se le pasa
        // role:'driver' al confirmar el OTP), pero por si acaso no existiera todavía.
        const { data: agUser, error: userError } = await this.supabase.from('ag_users').insert({
          auth_user_id: uid, role: 'driver', full_name: form.fullName, birth_date: form.birthDate,
          country: form.country ?? 'Colombia', department: form.department ?? '', city: form.city,
          id_number: form.idNumber, phone: this._phoneE164(form.phone), email: form.email,
          emergency_contact_name: form.emergencyName, emergency_contact_phone: form.emergencyPhone,
          ...(form.referredBy ? { referred_by: form.referredBy } : {}),
        }).select('id').single();
        if (userError) {
          console.error('[createDriverStep1] ag_users insert:', userError);
          return { success: false, error: 'No se pudo crear tu perfil. Intenta de nuevo.' };
        }
        agUserId = agUser.id;
      } else {
        if (existing!.role !== 'driver') {
          return { success: false, error: 'Ya tienes un perfil en Anda y Gana con este número.' };
        }
        // El placeholder que crea ag-otp-verify solo trae teléfono + nombre genérico -- completar
        // con los datos reales que el conductor acaba de escribir en el Paso 1.
        await this.supabase.from('ag_users').update({
          full_name: form.fullName, birth_date: form.birthDate, country: form.country ?? 'Colombia',
          department: form.department ?? '', city: form.city, id_number: form.idNumber, email: form.email,
          emergency_contact_name: form.emergencyName, emergency_contact_phone: form.emergencyPhone,
        }).eq('id', agUserId);
      }

      const { data: existingDriver } = await this.supabase
        .from('ag_drivers').select('id, status').eq('ag_user_id', agUserId).maybeSingle();
      if (existingDriver) {
        if (!['quick', 'pending_docs', 'rejected'].includes(existingDriver.status)) {
          return { success: false, error: 'Ya tienes un perfil de conductor activo.' };
        }
        return { success: true, driverId: existingDriver.id };
      }

      const { data: driverRow, error: driverError } = await this.supabase.from('ag_drivers').insert({
        ag_user_id: agUserId, id_number: form.idNumber,
        plate: 'PENDIENTE', vehicle_plate: 'PENDIENTE',
        status: 'quick', is_online: false, wallet_balance: 0,
      }).select('id').single();
      if (driverError) {
        console.error('[createDriverStep1] ag_drivers insert:', driverError);
        return { success: false, error: this._friendlyDriverError(driverError) };
      }
      return { success: true, driverId: driverRow.id };
    } catch (e: any) {
      console.error('[createDriverStep1] catch:', e);
      return { success: false, error: 'Error al registrarse. Intenta de nuevo.' };
    }
  }

  async registerDriver(form: DriverFormData): Promise<AgRegistrationResult> {
    try {
      const uid = await this.currentUserId();
      if (!uid) return { success: false, error: 'Debes iniciar sesión primero.' };

      const existing = await this.getMyAgProfile();

      // Quick/pending_docs drivers complete their full registration by updating existing rows
      if (existing && existing.role === 'driver') {
        const { data: existingDriver } = await this.supabase
          .from('ag_drivers').select('id, status').eq('ag_user_id', existing.id).maybeSingle();
        if (existingDriver && ['quick', 'pending_docs', 'rejected'].includes(existingDriver.status)) {
          return this._completeDriverRegistration(existing.id, existingDriver.id, uid, form);
        }
        return { success: false, error: 'Ya tienes un perfil de conductor activo.' };
      }
      if (existing) return { success: false, error: 'Ya tienes un perfil en Anda y Gana.' };

      const uploadTasks = Object.entries(form.files).map(async ([key, file]) => {
        const url = await this.uploadFile('ag-drivers', uid, file);
        return [key, url] as [string, string | null];
      });
      const results = await Promise.all(uploadTasks);
      const documents: Record<string, string> = {};
      for (const [key, url] of results) { if (url) documents[key] = url; }

      const driverInsert: any = {
        auth_user_id: uid,
        role: 'driver',
        full_name: form.fullName,
        birth_date: form.birthDate,
        country: form.country ?? 'Colombia',
        department: form.department ?? '',
        city: form.city,
        id_number: form.idNumber,
        phone: this._phoneE164(form.phone),
        email: form.email,
        emergency_contact_name: form.emergencyName,
        emergency_contact_phone: form.emergencyPhone,
      };
      // Selfie de rostro (sin cédula) — foto pública que ve el pasajero, distinta de la
      // selfie con cédula (KYC) que va a ag_drivers.selfie_with_id_url.
      if (documents['selfie']) driverInsert.selfie_url = documents['selfie'];
      if (form.referredBy) driverInsert.referred_by = form.referredBy;

      const { data: agUser, error: userError } = await this.supabase
        .from('ag_users')
        .insert(driverInsert)
        .select('id')
        .single();

      if (userError) {
        console.error('[registerDriver] ag_users insert:', userError);
        return { success: false, error: 'No se pudo crear tu perfil. Intenta de nuevo.' };
      }

      const { data: driverRow, error: driverError } = await this.supabase.from('ag_drivers').insert({
        ag_user_id: agUser.id,
        license_number: form.licenseNumber,
        license_category: form.licenseCategory,
        license_expiry: form.licenseExpiry,
        plate: form.plate.toUpperCase(),
        vehicle_plate: form.plate.toUpperCase(),
        vehicle_type: form.vehicleType,
        vehicle_brand: form.vehicleBrand,
        vehicle_model: form.vehicleModel,
        vehicle_year: form.vehicleYear,
        vehicle_color: form.vehicleColor,
        id_number: form.idNumber,
        id_front_url:            documents['idFront']            ?? null,
        id_back_url:             documents['idBack']             ?? null,
        selfie_with_id_url:      documents['selfieWithId']       ?? null,
        license_photo_url:       documents['licensePhoto']       ?? null,
        license_back_url:        documents['licenseBack']        ?? null,
        vehicle_photo_url:       documents['vehiclePhoto']       ?? null,
        vehicle_side_photo_url:  documents['vehicleSidePhoto']   ?? null,
        soat_photo_url:          documents['soatPhoto']          ?? null,
        property_card_front_url: documents['propertyCardFront']  ?? null,
        property_card_back_url:  documents['propertyCardBack']   ?? null,
        tecno_photo_url:         documents['tecnoPhoto']         ?? null,
        civil_liability_url:     documents['civilLiability']     ?? null,
        criminal_record_url:     documents['criminalRecord']     ?? null,
        documents,
        // Pedido explícito del usuario 2026-08-23: mientras no haya presupuesto para pagar
        // verificación automática (GPT-4o Vision) ni revisión manual, todo conductor que suba
        // todos los documentos requeridos queda aprobado de inmediato -- ver
        // [[movi_driver_autoapproval_no_ai_reject]]. El formulario (nextDriverStep) ya exige
        // cédula/selfie/antecedentes y licencia completa antes de dejar avanzar, así que llegar
        // aquí significa que los documentos obligatorios están completos.
        status: 'approved',
        approved_at: new Date().toISOString(),
      }).select('id').single();

      if (driverError) {
        console.error('[registerDriver] ag_drivers insert:', driverError);
        return { success: false, error: this._friendlyDriverError(driverError) };
      }

      if (driverRow?.id) {
        // Pedido explícito del usuario 2026-08-23: NO disparar más triggerDriverVerification()
        // (GPT-4o Vision) ni triggerBackgroundCheck() (Verifik antecedentes/RUNT) en el registro --
        // ambas podían mover el status de 'pending' a 'rejected' de forma automática y sin
        // revisión humana (una de ellas rechazaba conductores reales solo por tener licencia
        // particular en vez de categoría de servicio público, que no aplica a un modelo
        // peer-to-peer como Movi). Además cuestan dinero por conductor y el usuario no quiere
        // gastar en esto por ahora. El código de ambas funciones queda intacto por si se
        // reactivan más adelante (ver ag-verify-driver-docs / ag-verify-driver-background).
        this.verifyVehicleRunt({ driverId: driverRow.id }).catch(() => {});
      }
      return { success: true };
    } catch (e: any) {
      console.error('[registerDriver] catch:', e);
      return { success: false, error: 'Error al registrarse. Intenta de nuevo.' };
    }
  }

  private async _completeDriverRegistration(
    agUserId: string, driverId: string, uid: string, form: DriverFormData
  ): Promise<AgRegistrationResult> {
    const uploadTasks = Object.entries(form.files).map(async ([key, file]) => {
      const url = await this.uploadFile('ag-drivers', uid, file);
      return [key, url] as [string, string | null];
    });
    const results = await Promise.all(uploadTasks);
    const documents: Record<string, string> = {};
    for (const [key, url] of results) { if (url) documents[key] = url; }

    const userUpdate: any = {
      full_name: form.fullName,
      birth_date: form.birthDate,
      country: form.country ?? 'Colombia',
      department: form.department ?? '',
      city: form.city,
      id_number: form.idNumber,
      phone: this._phoneE164(form.phone),
      email: form.email,
      emergency_contact_name: form.emergencyName,
      emergency_contact_phone: form.emergencyPhone,
    };
    // Solo pisa selfie_url si efectivamente se subió una selfie nueva en este registro
    // (el paso puede ser opcional para conductores 'quick' completando sus datos).
    if (documents['selfie']) userUpdate.selfie_url = documents['selfie'];

    const { error: userError } = await this.supabase.from('ag_users').update(userUpdate).eq('id', agUserId);
    if (userError) return { success: false, error: userError.message };

    const { error: driverError } = await this.supabase.from('ag_drivers').update({
      license_number: form.licenseNumber,
      license_category: form.licenseCategory,
      license_expiry: form.licenseExpiry,
      plate: form.plate.toUpperCase(),
      vehicle_plate: form.plate.toUpperCase(),
      vehicle_type: form.vehicleType,
      vehicle_brand: form.vehicleBrand,
      vehicle_model: form.vehicleModel,
      vehicle_year: form.vehicleYear,
      vehicle_color: form.vehicleColor,
      id_number: form.idNumber,
      id_front_url:            documents['idFront']            ?? null,
      id_back_url:             documents['idBack']             ?? null,
      selfie_with_id_url:      documents['selfieWithId']       ?? null,
      license_photo_url:       documents['licensePhoto']       ?? null,
      license_back_url:        documents['licenseBack']        ?? null,
      vehicle_photo_url:       documents['vehiclePhoto']       ?? null,
      vehicle_side_photo_url:  documents['vehicleSidePhoto']   ?? null,
      soat_photo_url:          documents['soatPhoto']          ?? null,
      property_card_front_url: documents['propertyCardFront']  ?? null,
      property_card_back_url:  documents['propertyCardBack']   ?? null,
      tecno_photo_url:         documents['tecnoPhoto']         ?? null,
      civil_liability_url:     documents['civilLiability']     ?? null,
      criminal_record_url:     documents['criminalRecord']     ?? null,
      documents,
      // Ver nota igual en registerDriver(): aprobación inmediata sin IA/revisión manual,
      // pedido explícito del usuario 2026-08-23.
      status: 'approved',
      approved_at: new Date().toISOString(),
      rejection_reason: null,
    }).eq('id', driverId);
    if (driverError) return { success: false, error: this._friendlyDriverError(driverError) };

    this.verifyVehicleRunt({ driverId }).catch(() => {});
    return { success: true };
  }

  // ── Auto-asignación conductor más cercano ─────────────────────
  async findNearestDrivers(tripRequestId: string, lat: number, lng: number, vehicleType?: string): Promise<any[]> {
    const { data } = await this.supabase.rpc('ag_find_nearest_drivers', {
      p_trip_request_id: tripRequestId,
      p_lat: lat,
      p_lng: lng,
      p_vehicle_type: vehicleType ?? null,
      p_limit: 5,
    });
    return data?.drivers ?? [];
  }

  async autoOfferNearest(tripRequestId: string, driverId: string, offeredPrice: number): Promise<boolean> {
    const { data } = await this.supabase.rpc('ag_auto_offer_nearest', {
      p_trip_request_id: tripRequestId,
      p_driver_id: driverId,
      p_offered_price: offeredPrice,
    });
    return data?.ok ?? false;
  }

  // ── Chat pasajero-conductor ───────────────────────────────────
  async getChatMessages(requestId: string): Promise<{ id: string; sender_ag_user_id: string; message: string; created_at: string }[]> {
    const { data } = await this.supabase
      .from('ag_chat_messages')
      .select('id, sender_ag_user_id, message, created_at')
      .eq('request_id', requestId)
      .order('created_at', { ascending: true });
    return data ?? [];
  }

  async sendChatMessage(requestId: string, senderAgUserId: string, message: string): Promise<void> {
    await this.supabase.from('ag_chat_messages').insert({
      request_id: requestId,
      sender_ag_user_id: senderAgUserId,
      message: message.trim(),
    });
  }

  subscribeToChatMessages(requestId: string, callback: (msg: any) => void): RealtimeChannel {
    return this.supabase
      .channel(`ag-chat-${requestId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'ag_chat_messages',
        filter: `request_id=eq.${requestId}`,
      }, (payload) => callback(payload.new))
      .subscribe();
  }

  // ── GPS Tracking — actualizar ubicación del conductor ─────────
  async updateDriverLocation(driverId: string, lat: number, lng: number, heading: number | null): Promise<void> {
    await this.supabase
      .from('ag_driver_locations')
      .upsert({
        driver_id: driverId,
        lat,
        lng,
        heading: heading ?? 0,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'driver_id' });
  }

  async removeDriverLocation(driverId: string): Promise<void> {
    await this.supabase
      .from('ag_driver_locations')
      .delete()
      .eq('driver_id', driverId);
  }

  /** Registra un punto del recorrido (conductor o pasajero) durante un viaje activo -- para
   * poder validar más adelante que ambos de verdad viajaron juntos (migración 189), no solo
   * confiar en los botones de "llegué"/"pasajero a bordo". Pasa por un RPC que valida que
   * quien llama sea de verdad el conductor o el pasajero de ESE viaje -- si no, no guarda nada
   * silenciosamente, sin lanzar error (es un ping de fondo, no debe interrumpir el flujo). */
  async logTripLocation(tripRequestId: string, role: 'driver' | 'passenger', lat: number, lng: number): Promise<void> {
    try {
      await this.supabase.rpc('ag_log_trip_location', {
        p_trip_request_id: tripRequestId, p_role: role, p_lat: lat, p_lng: lng,
      });
    } catch { /* ping de fondo, no debe interrumpir el flujo */ }
  }

  // ── Mapa — vehículos cercanos ─────────────────────────────────
  async getNearbyVehicles(lat: number, lng: number): Promise<
    { id: string; lat: number; lng: number; heading: number; vehicle_type: string }[]
  > {
    const { data } = await this.supabase
      .from('ag_driver_locations')
      .select('driver_id, lat, lng, heading, ag_drivers!inner(vehicle_type, status, is_available)')
      .eq('ag_drivers.status', 'approved')
      .eq('ag_drivers.is_available', true);

    if (data && data.length > 0) {
      return data.map((d: any) => ({
        id:           d.driver_id,
        lat:          d.lat,
        lng:          d.lng,
        heading:      d.heading ?? 0,
        vehicle_type: d.ag_drivers?.vehicle_type ?? 'carro',
      }));
    }
    return [];
  }

  // ── Admin ─────────────────────────────────────────────────────

  // getDrivers/approveDriver/rejectDriver: eliminados 2026-08-25 (bug real de
  // seguridad -- hacían UPDATE/SELECT directo con la clave anon de Movi contra
  // una política RLS wide-open, sin ninguna verificación real de admin).
  // Reemplazados por adminListDrivers / adminApproveDriver / adminRejectDriver,
  // que pasan por la Edge Function ag-admin-action.

  // ── Trip requests ─────────────────────────────────────────────
  async requestTrip(data: {
    passengerUserId: string; passengerName?: string; passengerSelfieUrl?: string;
    originLat: number; originLng: number;
    originName?: string;
    destName: string; destLat: number; destLng: number;
    distanceKm: number; vehicleType: string; offeredPrice: number;
    paymentMethod: AgPaymentMethod;
    // ── Domicilio fields (optional) ───────────────────────────────
    serviceType?: 'viaje' | 'domicilio';
    packageType?: string;
    packageDescription?: string;
    recipientName?: string;
    recipientPhone?: string;
    contactlessDelivery?: boolean;
    // ── Viaje para otra persona (optional) ────────────────────────
    isForSelf?: boolean;
    travelerName?: string;
    travelerPhone?: string;
    // ── Nota al conductor + accesibilidad (optional) ──────────────
    passengerNote?: string;
    accessibility?: { pets?: boolean; luggage?: boolean; child_seat?: boolean; wheelchair?: boolean };
  }): Promise<{ success: boolean; tripId?: string; error?: string }> {
    const { data: row, error } = await this.supabase
      .from('ag_trip_requests')
      .insert({
        passenger_user_id: data.passengerUserId,
        passenger_name: data.passengerName || null,
        passenger_selfie_url: data.passengerSelfieUrl || null,
        origin_lat: data.originLat, origin_lng: data.originLng,
        origin_name: data.originName || null,
        dest_name: data.destName, dest_lat: data.destLat, dest_lng: data.destLng,
        distance_km: data.distanceKm, vehicle_type: data.vehicleType,
        offered_price: data.offeredPrice, payment_method: data.paymentMethod,
        status: 'searching',
        // Campos domicilio (solo cuando service_type='domicilio')
        ...(data.serviceType === 'domicilio' ? {
          service_type:         'domicilio',
          package_type:         data.packageType         ?? null,
          package_description:  data.packageDescription  ?? null,
          recipient_name:       data.recipientName       ?? null,
          recipient_phone:      data.recipientPhone      ?? null,
          contactless_delivery: data.contactlessDelivery ?? false,
        } : {}),
        // Viaje para otra persona: mismas 2 columnas que ya usa el flujo de
        // WhatsApp (ver ag-whatsapp/index.ts createWaTrip) -- passenger_name
        // pasa a ser el nombre de quien viaja (el conductor ya lo lee con
        // prioridad sobre el nombre de la cuenta), y for_other queda como
        // registro de quién pidió el viaje y a quién es responsable.
        ...(data.isForSelf === false && data.travelerName ? {
          passenger_name: data.travelerName,
          for_other: {
            name: data.travelerName,
            phone: data.travelerPhone || null,
            requested_by_user_id: data.passengerUserId,
          },
        } : {}),
        // Nota al conductor (solo si escribió algo)
        ...(data.passengerNote?.trim() ? { passenger_note: data.passengerNote.trim() } : {}),
        // Accesibilidad (solo si marcó al menos una -- no llenar la columna con
        // un objeto de puros "false" cuando el pasajero no pidió nada especial)
        ...(data.accessibility && Object.values(data.accessibility).some(Boolean)
          ? { accessibility: data.accessibility } : {}),
      })
      .select('id')
      .single();
    if (error) {
      this.reportTripError('requestTrip', error, { critical: true, extra: { passengerUserId: data.passengerUserId } });
      // Bug real encontrado 2026-08-30: un pasajero con sesión válida pero cuyo perfil
      // (ag_users) no estaba vinculado a esa sesión (auth_user_id desincronizado -- caso
      // real: cuenta creada primero por WhatsApp, vinculada después al iniciar sesión en la
      // app, y la vinculación no se completó) chocaba contra la política de seguridad de la
      // fila (RLS) al insertar. El error crudo de Postgres ("new row violates row-level
      // security policy...") le llegaba en inglés y sin ninguna acción clara -- viola
      // feedback_no_english_errors. code 42501 = violación de RLS; se traduce a un mensaje
      // accionable en vez de mostrar el texto técnico.
      const friendly = error.code === '42501'
        ? 'No pudimos verificar tu perfil. Cierra sesión y vuelve a entrar, e intenta pedir el viaje de nuevo.'
        : error.message;
      return { success: false, error: friendly };
    }
    return { success: true, tripId: row.id };
  }

  async confirmDeliveryCode(tripRequestId: string, code: string): Promise<{ success: boolean; error?: string }> {
    const { data } = await this.supabase
      .from('ag_trip_requests')
      .select('delivery_code')
      .eq('id', tripRequestId)
      .single();
    if (!data || data.delivery_code !== code) return { success: false, error: 'Código incorrecto' };
    return this.completeTrip(tripRequestId);
  }

  async cancelTripRequest(tripRequestId: string, reason?: string): Promise<void> {
    const { error } = await this.supabase
      .from('ag_trip_requests')
      .update({ status: 'cancelled', updated_at: new Date().toISOString(), cancel_reason: reason ?? null })
      .eq('id', tripRequestId);
    if (error) this.reportTripError('cancelTripRequest', error, { critical: true, extra: { tripRequestId } });
  }

  async checkRequestsStatus(ids: string[]): Promise<{ id: string; status: string }[]> {
    if (!ids.length) return [];
    const { data } = await this.supabase
      .from('ag_trip_requests')
      .select('id, status')
      .in('id', ids);
    return (data ?? []) as { id: string; status: string }[];
  }

  // ── Trip offers — passenger ───────────────────────────────────
  async getOffersForTrip(tripRequestId: string): Promise<AgTripOffer[]> {
    const { data } = await this.supabase
      .from('ag_trip_offers')
      .select('*, ag_drivers(*, ag_users(*))')
      .eq('trip_request_id', tripRequestId)
      .eq('status', 'pending')
      .order('created_at', { ascending: true });
    return (data ?? []) as AgTripOffer[];
  }

  async acceptOffer(offerId: string): Promise<{ success: boolean; error?: string }> {
    // Un solo UPDATE dispara el trigger ag_on_offer_accepted que:
    //  - Valida saldo del conductor
    //  - Cancela otras ofertas pendientes
    //  - Actualiza ag_trip_requests
    //  - Descuenta comisión de la wallet
    const { error: offerErr } = await this.supabase
      .from('ag_trip_offers')
      .update({ status: 'accepted', updated_at: new Date().toISOString() })
      .eq('id', offerId)
      .eq('status', 'pending'); // solo acepta si aún está pendiente

    if (offerErr) {
      const msg = offerErr.message ?? '';
      if (msg.includes('SALDO_INSUFICIENTE')) {
        const match = msg.match(/Necesita \$(\d+) pero tiene \$(\d+)/);
        if (match) return { success: false, error: `El conductor no tiene saldo suficiente. Necesita $${Number(match[1]).toLocaleString('es-CO')} pero tiene $${Number(match[2]).toLocaleString('es-CO')} en su wallet.` };
        return { success: false, error: 'El conductor no tiene saldo suficiente en su wallet para aceptar este viaje.' };
      }
      this.reportTripError('acceptOffer', offerErr, { critical: true, extra: { offerId } });
      return { success: false, error: offerErr.message };
    }
    return { success: true };
  }

  /** Carga viajes activos del conductor via RPC SECURITY DEFINER (bypassa RLS) */
  async getDriverActiveTrips(_driverId: string): Promise<any[]> {
    const { data, error } = await this.supabase.rpc('ag_get_my_active_trips');
    if (error) console.error('[Movi] getDriverActiveTrips RPC error:', error);
    return Array.isArray(data) ? data : [];
  }

  /** Broadcast directo pasajero → conductor cuando acepta la oferta (sin RLS) */
  broadcastOfferAccepted(driverId: string, offerId: string, tripRequestId: string): void {
    const ch = this.supabase.channel(`driver-live-${driverId}`);
    ch.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        ch.send({ type: 'broadcast', event: 'offer_accepted', payload: { offerId, tripRequestId } })
          .catch(() => {});
        setTimeout(() => { try { ch.unsubscribe(); } catch {} }, 3000);
      }
    });
  }

  broadcastPassengerBoarded(driverId: string, tripRequestId: string): void {
    const ch = this.supabase.channel(`driver-live-${driverId}`);
    ch.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        ch.send({ type: 'broadcast', event: 'passenger_boarded', payload: { tripRequestId } })
          .catch(() => {});
        setTimeout(() => { try { ch.unsubscribe(); } catch {} }, 3000);
      }
    });
  }

  /** Conductor → Pasajero: mismo patrón que driver-live pero invertido */
  broadcastBoardingToPassenger(passengerAuthId: string): void {
    const ch = this.supabase.channel(`passenger-live-${passengerAuthId}`);
    ch.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        ch.send({ type: 'broadcast', event: 'driver_boarded', payload: {} }).catch(() => {});
        setTimeout(() => { try { ch.unsubscribe(); } catch {} }, 3000);
      }
    });
  }

  subscribeToPassengerBroadcast(passengerAuthId: string, onDriverBoarded: () => void, onTripCompleted?: () => void): RealtimeChannel {
    const ch = this.supabase
      .channel(`passenger-live-${passengerAuthId}`)
      .on('broadcast', { event: 'driver_boarded' }, () => onDriverBoarded());
    if (onTripCompleted) ch.on('broadcast', { event: 'trip_completed' }, () => onTripCompleted());
    return ch.subscribe();
  }

  /** Canal bidireccional para sincronizar el abordaje entre pasajero y conductor */
  subscribeTripBoarding(tripId: string, onBoarded: () => void): RealtimeChannel {
    return this.supabase
      .channel(`trip-boarding-${tripId}`)
      .on('broadcast', { event: 'boarded' }, () => onBoarded())
      .subscribe();
  }

  broadcastTripBoarding(tripId: string): void {
    const ch = this.supabase.channel(`trip-boarding-${tripId}`);
    ch.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        ch.send({ type: 'broadcast', event: 'boarded', payload: {} }).catch(() => {});
        setTimeout(() => { try { ch.unsubscribe(); } catch {} }, 3000);
      }
    });
  }

  /** Conductor suscribe al canal broadcast de su ID */
  subscribeToDriverBroadcast(
    driverId: string,
    onAccepted: (payload: any) => void,
    onBoarded?: (payload: any) => void,
    onCompleted?: (payload: any) => void,
  ): RealtimeChannel {
    const ch = this.supabase
      .channel(`driver-live-${driverId}`)
      .on('broadcast', { event: 'offer_accepted' }, ({ payload }) => onAccepted(payload));
    if (onBoarded) ch.on('broadcast', { event: 'passenger_boarded' }, ({ payload }) => onBoarded(payload));
    if (onCompleted) ch.on('broadcast', { event: 'trip_completed' }, ({ payload }) => onCompleted(payload));
    return ch.subscribe();
  }

  broadcastTripCompletedToDriver(driverId: string, tripRequestId: string): void {
    const ch = this.supabase.channel(`driver-live-${driverId}`);
    ch.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        ch.send({ type: 'broadcast', event: 'trip_completed', payload: { tripRequestId } }).catch(() => {});
        setTimeout(() => { try { ch.unsubscribe(); } catch {} }, 3000);
      }
    });
  }

  broadcastTripCompletedToPassenger(passengerAuthId: string): void {
    const ch = this.supabase.channel(`passenger-live-${passengerAuthId}`);
    ch.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        ch.send({ type: 'broadcast', event: 'trip_completed', payload: {} }).catch(() => {});
        setTimeout(() => { try { ch.unsubscribe(); } catch {} }, 3000);
      }
    });
  }

  /** Realtime: notifica al conductor cuando su oferta es aceptada por el pasajero */
  subscribeToDriverOfferAccepted(
    driverId: string,
    onAccepted: (offer: any) => void,
  ): RealtimeChannel {
    return this.supabase
      .channel(`driver-offer-accepted-${driverId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'ag_trip_offers', filter: `driver_id=eq.${driverId}` },
        async (payload) => {
          if (payload.new['status'] !== 'accepted') return;
          const { data } = await this.supabase
            .from('ag_trip_offers')
            .select('*, ag_trip_requests(*, ag_users!passenger_user_id(*))')
            .eq('id', payload.new['id'])
            .single();
          if (data) onAccepted(data);
        },
      )
      .subscribe();
  }

  async rejectOffer(offerId: string): Promise<{ success: boolean; error?: string }> {
    const { error } = await this.supabase
      .from('ag_trip_offers')
      .update({ status: 'rejected', updated_at: new Date().toISOString() })
      .eq('id', offerId);
    if (error) {
      this.reportTripError('rejectOffer', error, { critical: true, extra: { offerId } });
      return { success: false, error: error.message };
    }
    return { success: true };
  }

  /** Escucha nuevas ofertas en tiempo real para un viaje activo */
  subscribeToOffers(
    tripRequestId: string,
    onOffer: (offer: AgTripOffer) => void,
  ): RealtimeChannel {
    return this.supabase
      .channel(`trip-offers-${tripRequestId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'ag_trip_offers',
          filter: `trip_request_id=eq.${tripRequestId}`,
        },
        async (payload) => {
          const { data } = await this.supabase
            .from('ag_trip_offers')
            .select('*, ag_drivers(*, ag_users(*))')
            .eq('id', payload.new['id'])
            .single();
          if (data) onOffer(data as AgTripOffer);
        },
      )
      .subscribe();
  }

  // ── Trip offers — driver ──────────────────────────────────────
  /** Solicitudes de viaje en estado "searching" compatibles con el tipo de vehículo */
  async getSearchingRequests(vehicleType?: string, lat?: number, lng?: number, maxKm = 50): Promise<AgTripRequest[]> {
    // Solo solicitudes visibles en los últimos 4 minutos (240 segundos). driver_visible_since, NO
    // created_at -- una solicitud reenviada por "Seguir buscando"/"Subir oferta" (migración 241)
    // reinicia este reloj para que vuelva a aparecer en la lista del conductor (bug real
    // reportado 2026-08-30: el push llegaba pero la solicitud nunca aparecía en la app porque
    // este filtro seguía comparando contra el created_at original, ya vencido).
    const cutoff = new Date(Date.now() - 240000).toISOString();
    let query = this.supabase
      .from('ag_trip_requests')
      .select('*, ag_users!passenger_user_id(id, auth_user_id, full_name, total_trips_as_passenger, selfie_url, passenger_level)')
      .eq('status', 'searching')
      .gte('driver_visible_since', cutoff)
      .order('driver_visible_since', { ascending: true })
      .limit(50);
    if (vehicleType) query = query.eq('vehicle_type', vehicleType);
    const { data } = await query;
    const reqs = (data ?? []) as AgTripRequest[];
    if (!lat || !lng) return reqs;
    return reqs.filter(r => {
      if (!r.origin_lat || !r.origin_lng) return true;
      return this._haversine(lat, lng, r.origin_lat, r.origin_lng) <= maxKm;
    });
  }

  /** Trae una sola solicitud por id -- usada para mostrar el modal de solicitud entrante cuando
   * la app se abre desde la notificacion push (full-screen intent con app cerrada, o dato del
   * push mientras esta en segundo plano) y no se puede depender de la lista ya cargada. */
  async getTripRequestById(id: string): Promise<AgTripRequest | null> {
    const { data } = await this.supabase
      .from('ag_trip_requests')
      .select('*, ag_users!passenger_user_id(id, auth_user_id, full_name, total_trips_as_passenger, selfie_url, passenger_level)')
      .eq('id', id)
      .maybeSingle();
    return (data as AgTripRequest) ?? null;
  }

  async updateUserCity(agUserId: string, city: string): Promise<void> {
    await this.supabase.from('ag_users').update({ city }).eq('id', agUserId);
  }

  /** Suscripción realtime a nuevas solicitudes de viaje para el conductor */
  subscribeToTripRequests(
    vehicleType: string | undefined,
    onNew: (req: AgTripRequest) => void,
    onUpdate: (req: AgTripRequest) => void,
    lat?: number,
    lng?: number,
    maxKm = 50,
  ): RealtimeChannel {
    const channel = this.supabase
      .channel(`trip-requests-driver-${vehicleType ?? 'all'}-${Date.now()}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'ag_trip_requests' },
        async (payload) => {
          const row = payload.new as any;
          if (row.status !== 'searching') return;
          if (vehicleType && row.vehicle_type !== vehicleType) return;
          if (lat && lng && row.origin_lat && row.origin_lng) {
            if (this._haversine(lat, lng, row.origin_lat, row.origin_lng) > maxKm) return;
          }
          const { data } = await this.supabase
            .from('ag_trip_requests').select('*, ag_users!passenger_user_id(id, auth_user_id, full_name, total_trips_as_passenger, selfie_url, passenger_level)').eq('id', row.id).single();
          // Si el SELECT falla, usar datos básicos del payload para no perder el evento
          onNew((data ?? row) as AgTripRequest);
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'ag_trip_requests' },
        (payload) => {
          onUpdate(payload.new as AgTripRequest);
        },
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'ag_trip_requests' },
        (payload) => {
          if (payload.old?.['id']) onUpdate({ id: payload.old['id'], status: 'cancelled' } as any);
        },
      )
      .subscribe();
    return channel;
  }

  async makeOffer(
    tripRequestId: string,
    driverId: string,
    offeredPrice: number,
  ): Promise<{ success: boolean; error?: string }> {
    const { error } = await this.supabase
      .from('ag_trip_offers')
      .insert({ trip_request_id: tripRequestId, driver_id: driverId, offered_price: offeredPrice });
    if (error) {
      this.reportTripError('makeOffer', error, { critical: true, extra: { tripRequestId, driverId } });
      return { success: false, error: error.message };
    }
    return { success: true };
  }

  // ── Passenger trip history ────────────────────────────────────
  async getPassengerTripHistory(userId: string): Promise<any[]> {
    const { data } = await this.supabase
      .from('ag_trip_requests')
      .select('id, dest_name, distance_km, offered_price, status, created_at, payment_method')
      .eq('passenger_user_id', userId)
      .order('created_at', { ascending: false })
      .limit(30);
    return data ?? [];
  }

  // ── Comisión (admin) ──────────────────────────────────────────
  async getCommissionPct(): Promise<number> {
    const { data } = await this.supabase
      .from('platform_settings')
      .select('value')
      .eq('key', 'ag_commission_pct')
      .maybeSingle();
    return parseInt(data?.value ?? '0', 10);
  }

  /** Beneficios completos del conductor: comisión fija, bonos por hitos de viajes, fundador */
  async getDriverBenefits(driverId: string): Promise<{
    monthly_trips: number; total_trips: number; commission_pct: number;
    next_milestone_trips: number | null; next_milestone_bonus: number | null;
    lifetime_bonus_earned: number;
    is_founder: boolean; founder_number: number | null; founders_left: number;
  } | null> {
    const { data, error } = await this.supabase.rpc('ag_get_driver_benefits', { p_driver_id: driverId });
    if (error || !data) return null;
    return data as any;
  }

  async setCommissionPct(pct: number, publihazclickToken: string): Promise<boolean> {
    try {
      await this.callAdminAction(publihazclickToken, { action: 'set_commission_pct', pct });
      return true;
    } catch { return false; }
  }

  // ── Cambio de número de celular + baja de cuenta (menú Seguridad) ────────

  /** Manda el OTP al número NUEVO (reusa ag-otp-send, mismo endpoint que login) */
  async requestPhoneChangeOtp(newPhone: string): Promise<{ ok: boolean; error?: string }> {
    const { data, error } = await this.supabase.functions.invoke('ag-otp-send', { body: { phone: newPhone } });
    if (error || data?.error) return { ok: false, error: data?.error ?? error?.message ?? 'Error enviando SMS' };
    return { ok: true };
  }

  /** Verifica el código y aplica el cambio de número (requiere sesión activa) */
  async confirmPhoneChange(newPhone: string, code: string): Promise<{ ok: boolean; error?: string; profile?: any }> {
    const { data, error } = await this.supabase.functions.invoke('ag-change-phone', { body: { new_phone: newPhone, code } });
    if (error || !data?.ok) return { ok: false, error: data?.error ?? error?.message ?? 'No se pudo cambiar el número' };
    return { ok: true, profile: data.profile };
  }

  /** Da de baja la cuenta propia (bloquea login, no borra historial) */
  async deactivateAccount(userId: string): Promise<{ ok: boolean; error?: string }> {
    const { data, error } = await this.supabase.rpc('ag_deactivate_account', { p_user_id: userId });
    if (error || !data?.ok) return { ok: false, error: data?.error ?? error?.message ?? 'No se pudo dar de baja la cuenta' };
    return { ok: true };
  }

  async getDistanceFilter(): Promise<number> {
    const { data } = await this.supabase
      .from('platform_settings')
      .select('value')
      .eq('key', 'ag_distance_filter')
      .maybeSingle();
    return parseInt(data?.value ?? '50', 10);
  }

  async setDistanceFilter(meters: number, publihazclickToken: string): Promise<boolean> {
    try {
      await this.callAdminAction(publihazclickToken, { action: 'set_distance_filter', meters });
      return true;
    } catch { return false; }
  }

  // ── Versión mínima/recomendada de la app nativa (pedido explicito 2026-09-01) ──
  // version_code = versionCode de Android (entero, ver android/app/build.gradle), no el nombre
  // "1.4.30". min bloquea el uso hasta actualizar; latest solo recomienda actualizar.
  async getAppVersionRequirements(): Promise<{ min: number; latest: number }> {
    const { data } = await this.supabase
      .from('platform_settings')
      .select('key, value')
      .in('key', ['ag_min_app_version_code', 'ag_latest_app_version_code']);
    const map: Record<string, string> = {};
    for (const row of (data ?? []) as any[]) map[row.key] = row.value;
    return {
      min: parseInt(map['ag_min_app_version_code'] ?? '0', 10) || 0,
      latest: parseInt(map['ag_latest_app_version_code'] ?? '0', 10) || 0,
    };
  }

  async setMinAppVersion(versionCode: number, publihazclickToken: string): Promise<boolean> {
    try {
      await this.callAdminAction(publihazclickToken, { action: 'set_min_app_version', version_code: versionCode });
      return true;
    } catch { return false; }
  }

  async setLatestAppVersion(versionCode: number, publihazclickToken: string): Promise<boolean> {
    try {
      await this.callAdminAction(publihazclickToken, { action: 'set_latest_app_version', version_code: versionCode });
      return true;
    } catch { return false; }
  }

  // ── Billetera conductor ───────────────────────────────────────
  async getDriverWalletBalance(driverId: string): Promise<number | null> {
    try {
      const url = `${environment.andaGana.functionsBaseUrl}/ag-api?action=driver-wallet&driver_id=${encodeURIComponent(driverId)}`;
      const resp = await fetch(url, {
        headers: {
          apikey: environment.moviSupabase.anonKey,
          Authorization: `Bearer ${environment.moviSupabase.anonKey}`,
        },
      });
      if (!resp.ok) return null;
      const data = await resp.json();
      return typeof data?.wallet_balance === 'number' ? data.wallet_balance : null;
    } catch {
      return null;
    }
  }

  async getDriverProfileByPhone(phone: string): Promise<{ profile: any; driver: any } | null> {
    try {
      const url = `${environment.andaGana.functionsBaseUrl}/ag-api?action=driver-by-phone&phone=${encodeURIComponent(phone)}`;
      const resp = await fetch(url, {
        headers: {
          apikey: environment.moviSupabase.anonKey,
          Authorization: `Bearer ${environment.moviSupabase.anonKey}`,
        },
      });
      if (!resp.ok) return null;
      const data = await resp.json();
      if (!data?.driver) return null;
      return { profile: data.profile, driver: data.driver };
    } catch {
      return null;
    }
  }

  async getDriverWalletHistory(driverId: string): Promise<any[]> {
    const { data } = await this.supabase
      .from('ag_wallet_transactions')
      .select('*')
      .eq('driver_id', driverId)
      .order('created_at', { ascending: false })
      .limit(30);
    return data ?? [];
  }

  async adminRechargeDriver(driverId: string, amount: number): Promise<{ success: boolean; error?: string }> {
    const { error } = await this.supabase.rpc('ag_recharge_driver_wallet', {
      p_driver_id: driverId,
      p_amount:    amount,
    });
    return error ? { success: false, error: error.message } : { success: true };
  }

  async getDriverStats(driverId: string): Promise<{ avgRating: number; completedTrips: number }> {
    const [ratingsRes, tripsRes] = await Promise.all([
      this.supabase.from('ag_trip_ratings')
        .select('stars').eq('rated_user_id', driverId).eq('rated_by_role', 'passenger'),  // ratings que pasajeros dan al conductor
      this.supabase.from('ag_trip_requests')
        .select('id', { count: 'exact', head: true })
        .eq('driver_id', driverId).eq('status', 'completed'),
    ]);
    const stars = (ratingsRes.data ?? []).map((r: any) => r.stars);
    const avg = stars.length ? Math.round((stars.reduce((a: number, b: number) => a + b, 0) / stars.length) * 10) / 10 : 0;
    return { avgRating: avg, completedTrips: tripsRes.count ?? 0 };
  }

  async getDriverCompletedTrips(driverId: string): Promise<any[]> {
    const { data } = await this.supabase
      .from('ag_trip_requests')
      .select('*, ag_users!passenger_user_id(full_name), ag_trip_offers!accepted_offer_id(offered_price)')
      .eq('driver_id', driverId)
      .eq('status', 'completed')
      .order('completed_at', { ascending: false })
      .limit(50);
    return data ?? [];
  }

  async getDriverEarningsSummary(driverId: string): Promise<number> {
    const { data } = await this.supabase
      .from('ag_trip_offers')
      .select('offered_price')
      .eq('driver_id', driverId)
      .eq('status', 'accepted');
    return (data ?? []).reduce((sum: number, r: any) => sum + (r.offered_price ?? 0), 0);
  }

  async submitReport(reporterUserId: string, type: 'incident' | 'passenger', description: string): Promise<{ success: boolean }> {
    const { error } = await this.supabase.from('ag_reports').insert({
      reporter_user_id: reporterUserId,
      type,
      description,
      status: 'pending',
    });
    return { success: !error };
  }

  async submitPassengerVerification(
    agUserId: string,
    selfieFile: File,
    idFrontFile: File,
    idBackFile: File,
  ): Promise<{ success: boolean; error?: string }> {
    const uid = agUserId;
    const [selfieUrl, frontUrl, backUrl] = await Promise.all([
      this.uploadFile('ag-passengers', uid, selfieFile),
      this.uploadFile('ag-passengers', `${uid}-doc-front`, idFrontFile),
      this.uploadFile('ag-passengers', `${uid}-doc-back`, idBackFile),
    ]);
    if (!selfieUrl || !frontUrl || !backUrl) {
      return { success: false, error: 'Error al subir las fotos. Intenta de nuevo.' };
    }
    const { error } = await this.supabase
      .from('ag_users')
      .update({ selfie_url: selfieUrl, id_front_url: frontUrl, id_back_url: backUrl, passenger_verified: true })
      .eq('id', agUserId);
    return error ? { success: false, error: error.message } : { success: true };
  }

  async setDriverOnline(driverId: string, online: boolean): Promise<{ ok: boolean; error?: string }> {
    const { error } = await this.supabase.from('ag_drivers')
      .update({ is_online: online, updated_at: new Date().toISOString() }).eq('id', driverId);
    if (error) return { ok: false, error: this._friendlyDriverError(error) };
    return { ok: true };
  }

  /** Documentos por vencer o vencidos (últimos 5 días) para el banner de aviso en driver-home. */
  async getDriverDocumentAlerts(driverId: string): Promise<Array<{ doc_type: string; expires_at: string; days_left: number; is_expired: boolean }>> {
    const { data, error } = await this.supabase.rpc('ag_get_driver_document_alerts', { p_driver_id: driverId });
    if (error || !data) return [];
    return data as Array<{ doc_type: string; expires_at: string; days_left: number; is_expired: boolean }>;
  }

  async updateDriverPreferences(driverId: string, prefs: {
    max_distance_km: number; accepts_pets: boolean; accepts_luggage: boolean;
    accepts_child_seat: boolean; hide_phone: boolean; notify_sound: boolean; notify_vibration: boolean;
  }): Promise<void> {
    await this.supabase.from('ag_drivers').update({ ...prefs, updated_at: new Date().toISOString() }).eq('id', driverId);
  }

  async createWalletRecharge(amount: number, method: 'pse' | 'card' = 'pse'): Promise<Record<string, unknown>> {
    const { data: { session } } = await this.supabase.auth.getSession();
    if (!session) throw new Error('Sin sesión activa');
    const res = await fetch(`${environment.andaGana.functionsBaseUrl}/ag-create-wallet-recharge`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ amount, method }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? 'Error al iniciar el pago');
    return data as Record<string, unknown>;
  }

  async signOut(): Promise<void> {
    await this.supabase.auth.signOut();
  }

  async cancelStaleTrips(): Promise<void> {
    await this.supabase.rpc('ag_cancel_stale_trips');
  }

  async completeTrip(tripRequestId: string): Promise<{ success: boolean; error?: string }> {
    const { error } = await this.supabase.rpc('ag_complete_trip', { p_trip_request_id: tripRequestId });
    if (error) {
      this.reportTripError('completeTrip', error, { critical: true, extra: { tripRequestId } });
      return { success: false, error: error.message };
    }
    return { success: true };
  }

  async graduateQuickDriver(): Promise<void> {
    const profile = await this.getMyAgProfile();
    if (!profile) return;
    await this.supabase
      .from('ag_drivers')
      .update({ status: 'pending_docs' })
      .eq('ag_user_id', profile.id)
      .eq('status', 'quick');
  }

  async submitRating(
    tripRequestId: string,
    raterUserId: string,
    ratedUserId: string,
    ratedByRole: 'passenger' | 'driver',
    stars: number,
    comment: string,
  ): Promise<{ success: boolean; error?: string }> {
    const { error } = await this.supabase.from('ag_trip_ratings').insert({
      trip_request_id: tripRequestId,
      rated_by_role:   ratedByRole,
      rater_user_id:   raterUserId,
      rated_user_id:   ratedUserId,
      stars,
      comment: comment.trim() || null,
    });
    return error ? { success: false, error: error.message } : { success: true };
  }

  async getMyAcceptedDriverOffers(): Promise<any[]> {
    const profile = await this.getMyAgProfile();
    if (!profile || profile.role !== 'driver') return [];
    const { data: driver } = await this.supabase
      .from('ag_drivers').select('id').eq('ag_user_id', profile.id).maybeSingle();
    if (!driver) return [];
    const { data } = await this.supabase
      .from('ag_trip_offers')
      .select('*, ag_trip_requests(*, ag_users(*))')
      .eq('driver_id', driver.id)
      .eq('status', 'accepted')
      .order('updated_at', { ascending: false })
      .limit(10);
    return data ?? [];
  }

  // ── Billetera de retiro por invitados ───────────────────────────
  async getReferralWallet(agUserId: string): Promise<{ balance: number; total_earned: number } | null> {
    const { data } = await this.supabase
      .from('ag_referral_wallet')
      .select('balance, total_earned')
      .eq('ag_user_id', agUserId)
      .maybeSingle();
    return data ?? null;
  }

  async getReferralTransactions(agUserId: string): Promise<any[]> {
    const { data: wallet } = await this.supabase
      .from('ag_referral_wallet')
      .select('id')
      .eq('ag_user_id', agUserId)
      .maybeSingle();
    if (!wallet) return [];
    const { data } = await this.supabase
      .from('ag_referral_transactions')
      .select('*')
      .eq('wallet_id', wallet.id)
      .order('created_at', { ascending: false })
      .limit(50);
    return data ?? [];
  }

  async getReferralCount(agUserId: string): Promise<number> {
    const { count } = await this.supabase
      .from('ag_users')
      .select('id', { count: 'exact', head: true })
      .eq('referred_by', agUserId);
    return count ?? 0;
  }

  /**
   * Estadísticas globales para el panel admin (pasajeros/pendientes/
   * aprobados/rechazados). Antes esto consultaba las tablas directo con la
   * clave anon -- las políticas RLS de ag_users/ag_drivers solo dejan ver
   * los propios registros (auth.uid()), y el admin nunca tiene sesión real
   * en el proyecto de Movi, así que SIEMPRE devolvía 0/0/0/0 sin importar
   * cuántos datos reales hubiera (confirmado 2026-08-28: 46 pasajeros y 3
   * conductores aprobados reales, mostraba 0 en ambos). Ahora pasa por
   * ag-admin-action con service_role, igual que el resto de acciones admin.
   */
  async getStats(publihazclickToken: string): Promise<{ passengers: number; quick: number; pending: number; approved: number; rejected: number }> {
    const out = await this.callAdminAction(publihazclickToken, { action: 'get_stats' });
    return out.data ?? { passengers: 0, quick: 0, pending: 0, approved: 0, rejected: 0 };
  }

  // ═══════════════════════════════════════════════════
  // SOS / Emergencias
  // ═══════════════════════════════════════════════════
  async triggerSos(payload: { tripId?: string | null; lat?: number; lng?: number; accuracy?: number; message?: string }): Promise<{ ok: boolean; sosId?: string; contactsNotified?: number; mapsLink?: string }> {
    const { data: sess } = await this.supabase.auth.getSession();
    const accessToken = sess?.session?.access_token;
    if (!accessToken) throw new Error('Sesión no iniciada');
    const r = await fetch(`${environment.moviSupabase.url}/functions/v1/ag-sos-trigger`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: environment.moviSupabase.anonKey, Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({
        trip_id: payload.tripId ?? null,
        lat: payload.lat ?? null, lng: payload.lng ?? null,
        accuracy_m: payload.accuracy ?? null, message: payload.message ?? null,
      }),
    });
    const text = await r.text();
    if (!r.ok) {
      let msg = `Error ${r.status}`;
      try { msg = JSON.parse(text).error ?? msg; } catch {}
      throw new Error(msg);
    }
    const out = JSON.parse(text);
    return { ok: out.ok, sosId: out.sos_id, contactsNotified: out.contacts_notified, mapsLink: out.maps_link };
  }

  /** Igual que triggerSos pero para un viaje Ciudad a Ciudad -- mismo edge
   * function (ag-sos-trigger, migración 226 le agregó soporte a cc_request_id),
   * mismas notificaciones reales por SMS + admin. Antes esto solo abría un link
   * de WhatsApp desde el cliente sin registrar nada ni avisar a nadie de verdad. */
  async triggerCcSos(payload: { ccRequestId?: string | null; lat?: number; lng?: number; accuracy?: number; message?: string }): Promise<{ ok: boolean; sosId?: string; contactsNotified?: number; mapsLink?: string }> {
    const { data: sess } = await this.supabase.auth.getSession();
    const accessToken = sess?.session?.access_token;
    if (!accessToken) throw new Error('Sesión no iniciada');
    const r = await fetch(`${environment.moviSupabase.url}/functions/v1/ag-sos-trigger`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: environment.moviSupabase.anonKey, Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({
        cc_request_id: payload.ccRequestId ?? null,
        lat: payload.lat ?? null, lng: payload.lng ?? null,
        accuracy_m: payload.accuracy ?? null, message: payload.message ?? null,
      }),
    });
    const text = await r.text();
    if (!r.ok) {
      let msg = `Error ${r.status}`;
      try { msg = JSON.parse(text).error ?? msg; } catch {}
      throw new Error(msg);
    }
    const out = JSON.parse(text);
    return { ok: out.ok, sosId: out.sos_id, contactsNotified: out.contacts_notified, mapsLink: out.maps_link };
  }

  /** Registra un punto del recorrido (conductor o pasajero) durante un viaje
   * Ciudad a Ciudad activo -- mismo propósito que logTripLocation, pero contra
   * cc_log_trip_location/cc_trip_locations (migración 226), tabla propia que
   * no toca el recorrido de viajes urbanos. Ping de fondo, no interrumpe el flujo. */
  async logCcTripLocation(requestId: string, role: 'driver' | 'passenger', lat: number, lng: number): Promise<void> {
    try {
      await this.supabase.rpc('cc_log_trip_location', {
        p_request_id: requestId, p_role: role, p_lat: lat, p_lng: lng,
      });
    } catch { /* ping de fondo, no debe interrumpir el flujo */ }
  }

  async listEmergencyContacts(userId: string): Promise<any[]> {
    const { data } = await this.supabase.from('ag_emergency_contacts').select('*').eq('user_id', userId).order('created_at').limit(10);
    return data ?? [];
  }

  async addEmergencyContact(userId: string, name: string, phone: string, relationship?: string): Promise<void> {
    const { error } = await this.supabase.from('ag_emergency_contacts').insert({ user_id: userId, name, phone, relationship: relationship ?? null });
    if (error) throw error;
  }

  async removeEmergencyContact(id: string): Promise<void> {
    const { error } = await this.supabase.from('ag_emergency_contacts').delete().eq('id', id);
    if (error) throw error;
  }

  // ═══════════════════════════════════════════════════
  // Share trip
  // ═══════════════════════════════════════════════════
  async createTripShare(userId: string, tripId: string, hours = 4): Promise<string> {
    const { data, error } = await this.supabase.rpc('ag_create_trip_share', { p_user_id: userId, p_trip_id: tripId, p_hours: hours });
    if (error) throw error;
    return data as string;
  }

  // ═══════════════════════════════════════════════════
  // Favoritos
  // ═══════════════════════════════════════════════════
  async listFavorites(userId: string): Promise<any[]> {
    const { data } = await this.supabase.from('ag_favorite_addresses').select('*').eq('user_id', userId).order('sort_order').limit(20);
    return data ?? [];
  }

  async addFavorite(userId: string, payload: { label: string; icon?: string; address: string; lat: number; lng: number }): Promise<void> {
    const { error } = await this.supabase.from('ag_favorite_addresses').insert({ user_id: userId, ...payload, icon: payload.icon ?? 'place' });
    if (error) throw error;
  }

  async removeFavorite(id: string): Promise<void> {
    const { error } = await this.supabase.from('ag_favorite_addresses').delete().eq('id', id);
    if (error) throw error;
  }

  // ═══════════════════════════════════════════════════
  // Viajes programados
  // ═══════════════════════════════════════════════════
  async listScheduledTrips(userId: string): Promise<any[]> {
    const { data } = await this.supabase.from('ag_scheduled_trips').select('*').eq('user_id', userId).in('status', ['pending', 'notified']).order('scheduled_for', { ascending: true }).limit(20);
    return data ?? [];
  }

  async scheduleTrip(payload: {
    userId: string; origin: { address: string; lat: number; lng: number };
    destination: { address: string; lat: number; lng: number };
    vehicleType?: string; suggestedPrice?: number; paymentMethod?: string; scheduledFor: string;
  }): Promise<void> {
    const { error } = await this.supabase.from('ag_scheduled_trips').insert({
      user_id: payload.userId,
      origin_address: payload.origin.address, origin_lat: payload.origin.lat, origin_lng: payload.origin.lng,
      destination_address: payload.destination.address, destination_lat: payload.destination.lat, destination_lng: payload.destination.lng,
      vehicle_type: payload.vehicleType ?? null, suggested_price: payload.suggestedPrice ?? null,
      payment_method: payload.paymentMethod ?? null, scheduled_for: payload.scheduledFor,
    });
    if (error) throw error;
  }

  async cancelScheduledTrip(id: string): Promise<void> {
    const { error } = await this.supabase.from('ag_scheduled_trips').update({ status: 'cancelled' }).eq('id', id);
    if (error) throw error;
  }

  // ═══════════════════════════════════════════════════
  // Driver tracking live (sub realtime)
  // ═══════════════════════════════════════════════════
  subscribeDriverLocation(driverId: string, cb: (loc: { lat: number; lng: number; heading?: number }) => void): RealtimeChannel {
    return this.supabase.channel(`ag-driver-loc-${driverId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'ag_driver_locations',
        filter: `driver_id=eq.${driverId}`,
      }, (payload: any) => {
        const row = payload.new ?? payload.record;
        if (row) cb({ lat: row.lat, lng: row.lng, heading: row.heading });
      }).subscribe();
  }

  async getLatestDriverLocation(driverId: string): Promise<{ lat: number; lng: number } | null> {
    const { data } = await this.supabase.from('ag_driver_locations').select('lat, lng').eq('driver_id', driverId).order('updated_at', { ascending: false }).limit(1).maybeSingle();
    return data as any;
  }

  // ═══════════════════════════════════════════════════
  // Propinas
  // ═══════════════════════════════════════════════════
  async tipDriver(tripId: string, amount: number): Promise<void> {
    const { error } = await this.supabase.rpc('ag_tip_driver', { p_trip_request_id: tripId, p_amount: amount });
    if (error) throw error;
  }

  // ═══════════════════════════════════════════════════
  // Llamada enmascarada por PSTN (Telnyx) -- respaldo real para cuando el otro lado del
  // viaje no tiene cuenta de Auth (pasajero invitado de WhatsApp) y LiveKit no puede
  // conectarlo. Ver callPassengerFromTrip() en anda-gana.component.ts.
  // ═══════════════════════════════════════════════════
  async startMaskedCall(tripRequestId: string): Promise<{ ok: boolean; callSid?: string; error?: string }> {
    const { data: sess } = await this.supabase.auth.getSession();
    const accessToken = sess?.session?.access_token;
    if (!accessToken) return { ok: false, error: 'No autenticado' };
    try {
      const r = await fetch(`${environment.moviSupabase.url}/functions/v1/ag-masked-call`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: environment.moviSupabase.anonKey, Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ trip_request_id: tripRequestId }),
      });
      const out = await r.json();
      if (!r.ok) return { ok: false, error: out.error ?? 'Error llamando' };
      return { ok: true, callSid: out.call_sid };
    } catch (e: any) {
      return { ok: false, error: e?.message ?? 'No se pudo iniciar llamada' };
    }
  }

  // ═══════════════════════════════════════════════════
  // Surge / Zonas
  // ═══════════════════════════════════════════════════
  async detectZone(lat: number, lng: number): Promise<string | null> {
    const { data } = await this.supabase.rpc('ag_detect_zone', { p_lat: lat, p_lng: lng });
    return (data as any) ?? null;
  }

  async currentSurge(zoneId?: string | null): Promise<number> {
    const { data } = await this.supabase.rpc('ag_current_surge', { p_zone_id: zoneId ?? null });
    return Number(data ?? 1);
  }

  // Fase 3 (ver memoria movi_unicorn_code_plan_2026-08-14): combina el horario fijo
  // de siempre con oferta/demanda real en vivo -- toma el más alto de los dos.
  async blendedSurge(lat: number, lng: number, zoneId?: string | null): Promise<number> {
    const { data } = await this.supabase.rpc('ag_blended_surge', { p_lat: lat, p_lng: lng, p_zone_id: zoneId ?? null });
    return Number(data ?? 1);
  }

  async getBusinessMetrics(days = 30): Promise<any> {
    const { data, error } = await this.supabase.rpc('ag_business_metrics', { p_days: days });
    if (error) throw error;
    return data ?? {};
  }

  async getFraudRepeatedPairs(minTrips = 5, minShare = 0.6): Promise<any[]> {
    const { data, error } = await this.supabase.rpc('ag_fraud_repeated_pairs', { p_min_trips: minTrips, p_min_share: minShare });
    if (error) throw error;
    return data ?? [];
  }

  async getFraudShortTripFarming(maxKm = 0.4, minTrips = 5, days = 7): Promise<any[]> {
    const { data, error } = await this.supabase.rpc('ag_fraud_short_trip_farming', { p_max_km: maxKm, p_min_trips: minTrips, p_days: days });
    if (error) throw error;
    return data ?? [];
  }

  async getFraudGpsFlagged(days = 7): Promise<any[]> {
    const { data, error } = await this.supabase.rpc('ag_fraud_gps_flagged', { p_days: days });
    if (error) throw error;
    return data ?? [];
  }

  async listZones(): Promise<any[]> {
    const { data } = await this.supabase.from('ag_zones').select('*').order('name').limit(100);
    return data ?? [];
  }

  async listSurgeRules(): Promise<any[]> {
    const { data } = await this.supabase.from('ag_surge_rules').select('*').order('created_at', { ascending: false }).limit(100);
    return data ?? [];
  }

  // ═══════════════════════════════════════════════════
  // Cupones
  // ═══════════════════════════════════════════════════
  async validateCoupon(code: string, tripPrice: number): Promise<{ ok: boolean; couponId?: string; discount?: number; title?: string; description?: string; error?: string }> {
    const userId = (await this.supabase.auth.getUser()).data.user?.id;
    if (!userId) return { ok: false, error: 'No autenticado' };
    const { data, error } = await this.supabase.rpc('ag_validate_coupon', {
      p_user_id: userId, p_code: code.toUpperCase(), p_trip_price: tripPrice,
    });
    if (error) return { ok: false, error: error.message };
    const r = data as any;
    return { ok: r.ok, couponId: r.coupon_id, discount: r.discount, title: r.title, description: r.description, error: r.error };
  }

  async applyCoupon(couponId: string, tripRequestId: string, discount: number): Promise<void> {
    const userId = (await this.supabase.auth.getUser()).data.user?.id;
    if (!userId) return;
    await this.supabase.rpc('ag_apply_coupon', { p_user_id: userId, p_coupon_id: couponId, p_trip_request_id: tripRequestId, p_discount: discount });
  }

  // listCoupons/createCoupon/toggleCoupon: eliminados 2026-08-25 (mismo bug de
  // seguridad que getDrivers/approveDriver -- sin verificación real de admin).
  // Reemplazados por adminListCoupons / adminCreateCoupon / adminToggleCoupon,
  // que pasan por la Edge Function ag-admin-action.

  // ═══════════════════════════════════════════════════
  // DRIVER: online sessions (tracking horas)
  // ═══════════════════════════════════════════════════
  async startOnlineSession(driverId: string): Promise<string | null> {
    await this.supabase.from('ag_online_sessions').update({
      ended_at: new Date().toISOString(),
    }).eq('driver_id', driverId).is('ended_at', null);
    const { data } = await this.supabase.from('ag_online_sessions').insert({ driver_id: driverId }).select('id').single();
    return data?.id ?? null;
  }

  async endOnlineSession(sessionId: string): Promise<void> {
    const { data: sess } = await this.supabase.from('ag_online_sessions').select('started_at').eq('id', sessionId).maybeSingle();
    if (!sess) return;
    const total = Math.floor((Date.now() - new Date((sess as any).started_at).getTime()) / 1000);
    await this.supabase.from('ag_online_sessions').update({ ended_at: new Date().toISOString(), total_seconds: total }).eq('id', sessionId);
  }

  async getTodayOnlineSeconds(driverId: string): Promise<number> {
    const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
    const { data } = await this.supabase.from('ag_online_sessions')
      .select('started_at, ended_at, total_seconds').eq('driver_id', driverId).gte('started_at', startOfDay.toISOString());
    let total = 0;
    for (const s of (data ?? [])) {
      if ((s as any).total_seconds) total += (s as any).total_seconds;
      else if (!(s as any).ended_at) total += Math.floor((Date.now() - new Date((s as any).started_at).getTime()) / 1000);
    }
    return total;
  }

  // ═══════════════════════════════════════════════════
  // DRIVER: retiros
  // ═══════════════════════════════════════════════════
  async requestDriverWithdrawal(driverId: string, amount: number, method: 'bank'|'nequi'|'daviplata'|'efectivo', details: Record<string, string>): Promise<string> {
    const { data, error } = await this.supabase.rpc('ag_request_withdrawal', {
      p_driver_id: driverId, p_amount: amount, p_method: method, p_details: details,
    });
    if (error) throw error;
    return data as string;
  }

  async listDriverWithdrawals(driverId: string): Promise<any[]> {
    const { data } = await this.supabase.from('ag_withdrawals').select('*').eq('driver_id', driverId).order('created_at', { ascending: false }).limit(100);
    return data ?? [];
  }

  async requestReferralWithdrawal(agUserId: string, amount: number, method: 'bank_ahorros'|'bank_corriente'|'nequi'|'daviplata', details: Record<string, string>): Promise<string> {
    const { data, error } = await this.supabase.rpc('ag_request_referral_withdrawal', {
      p_user_id: agUserId, p_amount: amount, p_method: method, p_details: details,
    });
    if (error) throw error;
    return data as string;
  }

  async listReferralWithdrawals(agUserId: string): Promise<any[]> {
    const { data } = await this.supabase.from('ag_referral_withdrawal_requests').select('*').eq('ag_user_id', agUserId).order('created_at', { ascending: false }).limit(20);
    return data ?? [];
  }

  /**
   * Lista de retiros para el panel admin. Antes leía ag_withdrawals directo
   * con la clave anon -- su única política RLS de SELECT es
   * "driver_id = ag_current_driver_id()" (solo el propio conductor ve sus
   * retiros), así que el admin (sin sesión real de conductor) siempre veía
   * la lista vacía sin importar cuántos retiros reales hubiera pendientes.
   */
  async adminListWithdrawals(publihazclickToken: string, status?: string): Promise<any[]> {
    const out = await this.callAdminAction(publihazclickToken, { action: 'list_withdrawals', status });
    return out.data ?? [];
  }

  /** Viajes activos para el panel admin -- mismo motivo que adminListWithdrawals. */
  async adminListActiveTrips(publihazclickToken: string): Promise<any[]> {
    const out = await this.callAdminAction(publihazclickToken, { action: 'list_active_trips' });
    return out.data ?? [];
  }

  /** Solicitudes Ciudad a Ciudad para el panel admin. */
  async adminListCcRequests(publihazclickToken: string, status?: string): Promise<any[]> {
    const out = await this.callAdminAction(publihazclickToken, { action: 'list_cc_requests', status });
    return out.data ?? [];
  }

  /** Conteo de viajes Ciudad a Ciudad con integridad GPS marcada, para el panel admin. */
  async adminGetCcFlaggedCount(publihazclickToken: string): Promise<number> {
    const out = await this.callAdminAction(publihazclickToken, { action: 'get_cc_flagged_count' });
    return out.data ?? 0;
  }

  /** Resumen de la pestaña Inicio del panel admin (conductores en línea, viajes activos, retiros pendientes). */
  async adminGetInicioStats(publihazclickToken: string): Promise<{ driversOnline: number; activeTrips: number; pendingWithdrawalsCount: number; pendingWithdrawalsTotal: number }> {
    const out = await this.callAdminAction(publihazclickToken, { action: 'get_inicio_stats' });
    return out.data ?? { driversOnline: 0, activeTrips: 0, pendingWithdrawalsCount: 0, pendingWithdrawalsTotal: 0 };
  }

  /** Suma del saldo de billetera de todos los conductores aprobados, para el panel admin. */
  async adminGetTotalWalletBalance(publihazclickToken: string): Promise<number> {
    const out = await this.callAdminAction(publihazclickToken, { action: 'get_total_wallet_balance' });
    return out.data ?? 0;
  }

  /** Historial de viajes completados/cancelados, para el panel admin. */
  async adminListTripHistory(publihazclickToken: string): Promise<any[]> {
    const out = await this.callAdminAction(publihazclickToken, { action: 'list_trip_history' });
    return out.data ?? [];
  }

  /**
   * Llama a la Edge Function ag-admin-action, que valida (con el token real de
   * publihazclick del admin, no de Movi) que quien pide la acción es admin/dev
   * antes de tocar la base de datos de Movi con service_role.
   * BUG REAL DE SEGURIDAD (2026-08-25): antes estas acciones hacían UPDATE
   * directo con la clave anon de Movi, protegidas solo por una política RLS
   * con qual:true -- cualquiera con la clave anon podía aprobar/rechazar
   * cualquier retiro o resolver cualquier alerta SOS. Ver memoria
   * movi_rls_wide_open_admin_policies_fix.
   */
  private async callAdminAction(publihazclickToken: string, body: Record<string, unknown>): Promise<any> {
    // Timeout explícito: sin esto, un problema de red pasajero deja el fetch
    // colgado indefinidamente y el panel admin (anda-gana-admin) se queda con
    // el spinner de carga pegado para siempre, sin ningún error visible.
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    let res: Response;
    try {
      res = await fetch(`${environment.moviSupabase.url}/functions/v1/ag-admin-action`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: environment.moviSupabase.anonKey,
          Authorization: `Bearer ${publihazclickToken}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (e) {
      if ((e as { name?: string })?.name === 'AbortError') {
        throw new Error('La conexión tardó demasiado. Intenta de nuevo.');
      }
      throw e;
    } finally {
      clearTimeout(timeoutId);
    }
    const out = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(out?.error || `ag-admin-action failed (${res.status})`);
    }
    return out;
  }

  async adminListSosEvents(publihazclickToken: string): Promise<any[]> {
    const out = await this.callAdminAction(publihazclickToken, { action: 'list_sos_events' });
    return out.data ?? [];
  }

  async adminListWaConversations(role: 'conductor' | 'pasajero', publihazclickToken: string): Promise<any[]> {
    const out = await this.callAdminAction(publihazclickToken, { action: 'list_wa_conversations', role });
    return out.data ?? [];
  }

  async adminListWaMessages(phone: string, publihazclickToken: string): Promise<any[]> {
    const out = await this.callAdminAction(publihazclickToken, { action: 'list_wa_messages', phone });
    return out.data ?? [];
  }

  async adminApproveDriver(driverId: string, publihazclickToken: string): Promise<boolean> {
    try {
      await this.callAdminAction(publihazclickToken, { action: 'approve_driver', driver_id: driverId });
      return true;
    } catch { return false; }
  }

  async adminRejectDriver(driverId: string, reason: string, publihazclickToken: string): Promise<boolean> {
    try {
      await this.callAdminAction(publihazclickToken, { action: 'reject_driver', driver_id: driverId, reason });
      return true;
    } catch { return false; }
  }

  async adminListDrivers(publihazclickToken: string, statusFilter?: string): Promise<AgDriver[]> {
    const out = await this.callAdminAction(publihazclickToken, { action: 'list_drivers', status: statusFilter });
    return out.data ?? [];
  }

  async adminListPassengers(publihazclickToken: string): Promise<AgUser[]> {
    const out = await this.callAdminAction(publihazclickToken, { action: 'list_passengers' });
    return out.data ?? [];
  }

  async adminCreateCoupon(payload: { code: string; title: string; description?: string; discountType: 'percent' | 'fixed' | 'first_trip'; discountValue: number; maxDiscountCop?: number; minTripCop?: number; maxUses?: number; maxUsesPerUser?: number; validUntil?: string }, publihazclickToken: string): Promise<void> {
    await this.callAdminAction(publihazclickToken, { action: 'create_coupon', payload });
  }

  async adminToggleCoupon(id: string, active: boolean, publihazclickToken: string): Promise<void> {
    await this.callAdminAction(publihazclickToken, { action: 'toggle_coupon', coupon_id: id, active });
  }

  async adminListCoupons(publihazclickToken: string): Promise<any[]> {
    const out = await this.callAdminAction(publihazclickToken, { action: 'list_coupons' });
    return out.data ?? [];
  }

  async adminApproveWithdrawal(id: string, publihazclickToken: string): Promise<void> {
    await this.callAdminAction(publihazclickToken, { action: 'approve_withdrawal', withdrawal_id: id });
  }

  async adminRejectWithdrawal(id: string, reason: string, publihazclickToken: string): Promise<void> {
    await this.callAdminAction(publihazclickToken, { action: 'reject_withdrawal', withdrawal_id: id, reason });
  }

  async adminResolveSos(id: string, status: 'resolved' | 'false_alarm', publihazclickToken: string): Promise<void> {
    await this.callAdminAction(publihazclickToken, { action: 'resolve_sos', sos_id: id, status });
  }

  // ═══════════════════════════════════════════════════
  // DRIVER: analytics + niveles + quests
  // ═══════════════════════════════════════════════════
  async getDriverAnalytics(driverId: string, days = 30): Promise<any> {
    const { data } = await this.supabase.rpc('ag_driver_analytics', { p_driver_id: driverId, p_days: days });
    return data;
  }

  async getDriverDailyEarnings(driverId: string, days = 14): Promise<{ day: string; trips: number; earnings: number }[]> {
    const { data } = await this.supabase.rpc('ag_driver_daily_earnings', { p_driver_id: driverId, p_days: days });
    return (data ?? []).map((r: any) => ({ day: r.day, trips: Number(r.trips), earnings: Number(r.earnings) }));
  }

  async recalcDriverLevel(driverId: string): Promise<string> {
    const { data } = await this.supabase.rpc('ag_recalc_driver_level', { p_driver_id: driverId });
    return data as string;
  }

  async listQuests(): Promise<any[]> {
    const { data } = await this.supabase.from('ag_quests').select('*').eq('is_active', true).order('created_at', { ascending: false }).limit(50);
    return data ?? [];
  }

  async getQuestProgress(driverId: string): Promise<any[]> {
    const { data } = await this.supabase.from('ag_quest_progress').select('*, ag_quests(*)').eq('driver_id', driverId).limit(50);
    return data ?? [];
  }

  // ═══════════════════════════════════════════════════
  // DRIVER: blacklist pasajeros
  // ═══════════════════════════════════════════════════
  async listBlacklist(driverId: string): Promise<any[]> {
    const { data } = await this.supabase.from('ag_passenger_blacklist')
      .select('*, ag_users!passenger_user_id(full_name, phone)')
      .eq('driver_id', driverId).order('created_at', { ascending: false }).limit(100);
    return data ?? [];
  }

  async addToBlacklist(driverId: string, passengerUserId: string, reason?: string): Promise<void> {
    await this.supabase.from('ag_passenger_blacklist').insert({ driver_id: driverId, passenger_user_id: passengerUserId, reason: reason ?? null });
  }

  async removeFromBlacklist(id: string): Promise<void> {
    await this.supabase.from('ag_passenger_blacklist').delete().eq('id', id);
  }

  // ═══════════════════════════════════════════════════
  // DRIVER: multi-vehículo
  // ═══════════════════════════════════════════════════
  async listVehicles(driverId: string): Promise<any[]> {
    const { data } = await this.supabase.from('ag_driver_vehicles').select('*').eq('driver_id', driverId).order('is_current', { ascending: false }).limit(10);
    return data ?? [];
  }

  async addVehicle(driverId: string, payload: { vehicle_type: string; brand: string; model: string; year: number; color: string; plate: string; photo_url?: string }): Promise<void> {
    // BUG REAL evitado antes de desplegar: este insert nunca chequeaba `error` -- si el
    // trigger de antigüedad (migración 186) lo rechazaba, el conductor no veía ningún mensaje,
    // solo no pasaba nada (silencioso). supabase-js no lanza excepción por su cuenta en
    // errores de query, hay que revisar `error` y lanzarlo explícito.
    const { error } = await this.supabase.from('ag_driver_vehicles').insert({ driver_id: driverId, ...payload });
    if (error) throw new Error(this._friendlyDriverError(error));
  }

  async setCurrentVehicle(driverId: string, vehicleId: string): Promise<{ ok: boolean; error?: string }> {
    const { data, error } = await this.supabase.rpc('ag_set_current_vehicle', {
      p_driver_id: driverId, p_vehicle_id: vehicleId,
    });
    if (error) return { ok: false, error: this._friendlyDriverError(error) };
    if (!data?.ok) return { ok: false, error: data?.error ?? 'No se pudo cambiar de vehículo.' };
    return { ok: true };
  }

  async removeVehicle(id: string): Promise<void> {
    await this.supabase.from('ag_driver_vehicles').delete().eq('id', id);
  }

  // ═══════════════════════════════════════════════════
  // DRIVER: auto-accept + tutorial
  // ═══════════════════════════════════════════════════
  async updateAutoAccept(driverId: string, enabled: boolean, minPrice?: number, maxDistance?: number): Promise<void> {
    await this.supabase.from('ag_drivers').update({
      auto_accept_enabled: enabled,
      auto_accept_min_price: minPrice ?? null,
      auto_accept_max_distance: maxDistance ?? null,
    }).eq('id', driverId);
  }

  async markTutorialCompleted(driverId: string): Promise<void> {
    await this.supabase.from('ag_drivers').update({
      tutorial_completed: true,
      tutorial_completed_at: new Date().toISOString(),
    }).eq('id', driverId);
  }

  // ═══════════════════════════════════════════════════
  // DRIVER: estados viaje + paradas
  // ═══════════════════════════════════════════════════
  /** BUG REAL evitado 2026-08-04: esto era un UPDATE crudo desde el cliente -- cualquier
   * conductor podía marcar "llegué"/"pasajero a bordo" sin estar cerca de verdad, lo que además
   * de ser injusto para el pasajero podía inflar metric_trips_completed de forma falsa y ganar
   * los bonos por hitos de viajes (migración 182) sin haber llevado a nadie. Ahora pasa por un
   * RPC (migración 188) que valida el GPS real del conductor contra el punto de recogida/destino
   * antes de aceptar el cambio de etapa -- rechaza con un mensaje claro si no está cerca. */
  async updateTripStage(tripRequestId: string, stage: 'heading_to_pickup'|'arrived_at_pickup'|'picked_up'|'on_route'|'arrived_at_destination'|'completed'): Promise<{ ok: boolean; error?: string }> {
    const { data, error } = await this.supabase.rpc('ag_advance_trip_stage', {
      p_trip_request_id: tripRequestId, p_stage: stage,
    });
    // Solo se reporta `error` (fallo real de RPC/conexión) -- data?.ok === false
    // con GPS todavía no válido es un rechazo de negocio esperado, no un bug.
    if (error) this.reportTripError('updateTripStage', error, { critical: true, extra: { tripRequestId, stage } });
    if (error || !data?.ok) return { ok: false, error: data?.error ?? error?.message ?? 'No se pudo actualizar el viaje' };
    return { ok: true };
  }

  async updateTripOfferedPrice(tripId: string, price: number): Promise<void> {
    await this.supabase.from('ag_trip_requests')
      .update({ offered_price: price, updated_at: new Date().toISOString() })
      .eq('id', tripId).eq('status', 'searching');
  }

  async getTripDetails(tripId: string): Promise<any | null> {
    const { data } = await this.supabase
      .from('ag_trip_requests')
      .select('*, ag_users!passenger_user_id(full_name, selfie_url, phone)')
      .eq('id', tripId).maybeSingle();
    return data ?? null;
  }

  async addWaypoint(tripRequestId: string, waypoint: { address: string; lat: number; lng: number }): Promise<void> {
    const { data: trip } = await this.supabase.from('ag_trip_requests').select('waypoints').eq('id', tripRequestId).maybeSingle();
    const current = (trip as any)?.waypoints ?? [];
    await this.supabase.from('ag_trip_requests').update({ waypoints: [...current, { ...waypoint, order: current.length }] }).eq('id', tripRequestId);
  }

  // ═══════════════════════════════════════════════════
  // DRIVER: heatmap
  // ═══════════════════════════════════════════════════
  async getHeatmap(bbox: { latMin: number; lngMin: number; latMax: number; lngMax: number }): Promise<{ lat: number; lng: number; weight: number }[]> {
    const { data } = await this.supabase.rpc('ag_heatmap_zones', {
      p_lat_min: bbox.latMin, p_lng_min: bbox.lngMin, p_lat_max: bbox.latMax, p_lng_max: bbox.lngMax,
    });
    return (data ?? []).map((r: any) => ({ lat: r.lat, lng: r.lng, weight: Number(r.weight) }));
  }

  // ═══════════════════════════════════════════════════
  // Push notifications
  // ═══════════════════════════════════════════════════
  async registerPushSubscription(sub: PushSubscription): Promise<void> {
    const userId = (await this.supabase.auth.getUser()).data.user?.id;
    if (!userId) return;
    const json: any = sub.toJSON();
    await this.supabase.from('ag_push_subs').upsert({
      user_id: userId,
      provider: 'webpush',
      endpoint: json.endpoint,
      p256dh: json.keys?.p256dh,
      auth: json.keys?.auth,
      user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
    }, { onConflict: 'endpoint' });
  }

  async unregisterPushSubscription(endpoint: string): Promise<void> {
    await this.supabase.from('ag_push_subs').delete().eq('endpoint', endpoint);
  }

  async registerFcmToken(token: string): Promise<void> {
    if (!token) return;
    // BUG REAL encontrado 2026-07-30: el error de la RPC nunca se revisaba -- supabase-js NO
    // lanza excepcion en fallos de .rpc(), devuelve {data, error}. Como este await no chequeaba
    // `error`, un fallo silencioso (ej. auth.uid() null por sesion aun no restaurada, token con
    // formato invalido, etc.) dejaba pasar el flujo como si hubiera funcionado -- la UI mostraba
    // "✓ Activo" con la base de datos completamente vacia de suscripciones push reales.
    const { error } = await this.supabase.rpc('ag_register_fcm_token', {
      p_token: token,
      p_user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
    });
    if (error) throw error;
  }

  async triggerDriverVerification(driverId: string): Promise<{ score: number; decision: string; flags: string[] } | null> {
    try {
      const { data: { session } } = await this.supabase.auth.getSession();
      const token = session?.access_token ?? environment.moviSupabase.anonKey;
      const res = await fetch(`${environment.moviSupabase.url}/functions/v1/ag-verify-driver-docs`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: environment.moviSupabase.anonKey,
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ driver_id: driverId }),
      });
      if (!res.ok) return null;
      return await res.json();
    } catch { return null; }
  }

  async getLatestDriverVerification(driverId: string): Promise<{ score: number; auto_decision: string; flags: any; extracted: any; created_at: string } | null> {
    const { data } = await this.supabase
      .from('ag_driver_verifications')
      .select('score, auto_decision, flags, extracted, created_at')
      .eq('driver_id', driverId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    return data as any;
  }

  /** Verificación de antecedentes (Policía Nacional) + licencia RUNT via Verifik -- sistema
   * independiente de triggerDriverVerification (GPT-4o Vision, ver arriba). Mientras no haya
   * VERIFIK_API_TOKEN configurado en el servidor, la funcion se auto-omite sin bloquear el
   * registro (ver ag-verify-driver-background/index.ts). */
  async triggerBackgroundCheck(driverId: string): Promise<{ ok: boolean; passed?: boolean; reasons?: string[] } | null> {
    try {
      const { data: { session } } = await this.supabase.auth.getSession();
      const token = session?.access_token ?? environment.moviSupabase.anonKey;
      const res = await fetch(`${environment.moviSupabase.url}/functions/v1/ag-verify-driver-background`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: environment.moviSupabase.anonKey,
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ driver_id: driverId }),
      });
      if (!res.ok) return null;
      return await res.json();
    } catch { return null; }
  }

  async getLatestBackgroundCheck(driverId: string): Promise<{ passed: boolean; reason: string | null; created_at: string } | null> {
    const { data } = await this.supabase
      .from('ag_driver_background_checks')
      .select('passed, reason, created_at')
      .eq('driver_id', driverId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    return data as any;
  }

  /** BUG REAL encontrado en auditoria 2026-09-01: esta funcion tiene verify_jwt=true en el
   * gateway de Supabase (confirmado con una llamada real: sin 'Authorization' devuelve 401
   * UNAUTHORIZED_NO_AUTH_HEADER antes de ejecutar el codigo de la funcion) -- faltaba el header
   * 'Authorization', asi que TODO push disparado desde el cliente (oferta hecha/aceptada/
   * rechazada, cada etapa del viaje, contraoferta, abordaje, cancelacion) fallaba en silencio
   * (el catch{} se traga el error) desde siempre. La API key anonima sirve como Bearer valido
   * para el gateway -- la funcion no necesita la sesion de un usuario real, solo recibe los
   * user_ids a los que hay que avisar.
   */
  async sendPush(payload: { userIds: string[]; title: string; body?: string; url?: string; tag?: string; urgent?: boolean }): Promise<void> {
    try {
      await fetch(`${environment.moviSupabase.url}/functions/v1/ag-send-push`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: environment.moviSupabase.anonKey,
          Authorization: `Bearer ${environment.moviSupabase.anonKey}`,
        },
        body: JSON.stringify({
          user_ids: payload.userIds, title: payload.title, body: payload.body,
          url: payload.url ?? '/anda-gana', tag: payload.tag, urgent: payload.urgent,
        }),
      });
    } catch {}
  }

  // ═══════════════════════════════════════════════════
  // LLAMADAS DE VOZ (LiveKit) — conductor<->pasajero, sin costo de PSTN
  // ═══════════════════════════════════════════════════
  async getCallToken(tripRequestId: string, agUserId: string): Promise<{ token: string; url: string; room: string; peer_name: string }> {
    const r = await fetch(`${environment.moviSupabase.url}/functions/v1/ag-livekit-token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: environment.moviSupabase.anonKey },
      body: JSON.stringify({ trip_request_id: tripRequestId, ag_user_id: agUserId }),
    });
    const out = await r.json();
    if (!r.ok) throw new Error(out?.error ?? 'No se pudo iniciar la llamada');
    return out;
  }

  /** Notifica al conductor que le esta entrando una llamada del pasajero. callerReplyId/callerRole
   * identifican a quien llama para que el conductor sepa a que canal responder al colgar/rechazar. */
  broadcastCallToDriver(driverId: string, payload: { tripRequestId: string; callerName: string; callerRole: 'driver' | 'passenger'; callerReplyId: string }): void {
    const ch = this.supabase.channel(`driver-calls-${driverId}`);
    ch.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        ch.send({ type: 'broadcast', event: 'incoming_call', payload }).catch(() => {});
        setTimeout(() => { try { ch.unsubscribe(); } catch {} }, 3000);
      }
    });
  }

  /** Notifica al pasajero que le esta entrando una llamada del conductor */
  broadcastCallToPassenger(passengerAuthId: string, payload: { tripRequestId: string; callerName: string; callerRole: 'driver' | 'passenger'; callerReplyId: string }): void {
    const ch = this.supabase.channel(`passenger-calls-${passengerAuthId}`);
    ch.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        ch.send({ type: 'broadcast', event: 'incoming_call', payload }).catch(() => {});
        setTimeout(() => { try { ch.unsubscribe(); } catch {} }, 3000);
      }
    });
  }

  /** Avisa que la llamada termino (colgada o rechazada) al otro lado */
  broadcastCallEndedToDriver(driverId: string, tripRequestId: string): void {
    const ch = this.supabase.channel(`driver-calls-${driverId}`);
    ch.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        ch.send({ type: 'broadcast', event: 'call_ended', payload: { tripRequestId } }).catch(() => {});
        setTimeout(() => { try { ch.unsubscribe(); } catch {} }, 3000);
      }
    });
  }
  broadcastCallEndedToPassenger(passengerAuthId: string, tripRequestId: string): void {
    const ch = this.supabase.channel(`passenger-calls-${passengerAuthId}`);
    ch.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        ch.send({ type: 'broadcast', event: 'call_ended', payload: { tripRequestId } }).catch(() => {});
        setTimeout(() => { try { ch.unsubscribe(); } catch {} }, 3000);
      }
    });
  }

  subscribeToDriverCalls(driverId: string, onIncoming: (p: { tripRequestId: string; callerName: string; callerRole: 'driver' | 'passenger'; callerReplyId: string }) => void, onEnded: (p: { tripRequestId: string }) => void): RealtimeChannel {
    return this.supabase
      .channel(`driver-calls-${driverId}`)
      .on('broadcast', { event: 'incoming_call' }, ({ payload }) => onIncoming(payload as any))
      .on('broadcast', { event: 'call_ended' }, ({ payload }) => onEnded(payload as any))
      .subscribe();
  }

  subscribeToPassengerCalls(passengerAuthId: string, onIncoming: (p: { tripRequestId: string; callerName: string; callerRole: 'driver' | 'passenger'; callerReplyId: string }) => void, onEnded: (p: { tripRequestId: string }) => void): RealtimeChannel {
    return this.supabase
      .channel(`passenger-calls-${passengerAuthId}`)
      .on('broadcast', { event: 'incoming_call' }, ({ payload }) => onIncoming(payload as any))
      .on('broadcast', { event: 'call_ended' }, ({ payload }) => onEnded(payload as any))
      .subscribe();
  }

  // ═══════════════════════════════════════════════════
  // DRIVER: documentos
  // ═══════════════════════════════════════════════════
  // license/cedula/selfie/etc. son del conductor como persona; soat/tecnomecanica/insurance/
  // vehicle_front/vehicle_back son del vehículo -- un conductor con carro y moto guardados puede
  // tener un SOAT distinto para cada uno (migración 195, pedido explícito del usuario 2026-08-05).
  private static readonly VEHICLE_SCOPED_DOC_TYPES = new Set(['soat', 'tecnomecanica', 'vehicle_front', 'vehicle_back']);
  private static readonly DOC_TYPES_WITH_EXPIRY = new Set(['license', 'soat', 'tecnomecanica']);

  private async _getCurrentVehicleId(driverId: string): Promise<string | null> {
    const { data } = await this.supabase.from('ag_driver_vehicles')
      .select('id').eq('driver_id', driverId).eq('is_current', true).maybeSingle();
    return data?.id ?? null;
  }

  async listDriverDocuments(driverId: string): Promise<any[]> {
    const [driverDocsRes, vehicleId] = await Promise.all([
      this.supabase.from('ag_driver_documents').select('*').eq('driver_id', driverId).order('doc_type').limit(20),
      this._getCurrentVehicleId(driverId),
    ]);
    let vehicleDocs: any[] = [];
    if (vehicleId) {
      const { data } = await this.supabase.from('ag_vehicle_documents').select('*').eq('vehicle_id', vehicleId).order('doc_type').limit(20);
      vehicleDocs = data ?? [];
    }
    return [...(driverDocsRes.data ?? []), ...vehicleDocs];
  }

  async uploadDriverDocument(
    driverId: string,
    docType: 'license' | 'license_back' | 'soat' | 'tecnomecanica' | 'cedula' | 'cedula_back' | 'vehicle_front' | 'vehicle_back',
    file: File,
    meta: { number?: string; expires_at?: string | null } = {},
  ): Promise<{ success: boolean; error?: string; extractedExpiry?: string | null; extractionFailed?: boolean }> {
    const userId = (await this.supabase.auth.getUser()).data.user?.id;
    if (!userId) return { success: false, error: 'No session' };
    const isVehicleScoped = AndaGanaService.VEHICLE_SCOPED_DOC_TYPES.has(docType);
    let vehicleId: string | null = null;
    if (isVehicleScoped) {
      vehicleId = await this._getCurrentVehicleId(driverId);
      if (!vehicleId) return { success: false, error: 'No tienes un vehículo activo registrado. Registra tu vehículo primero.' };
    }

    const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
    const path = `${userId}/${docType}-${Date.now()}.${ext}`;
    const up = await this.supabase.storage.from('movi-driver-docs').upload(path, file, { upsert: true });
    if (up.error) return { success: false, error: up.error.message };
    const { data: signed } = await this.supabase.storage.from('movi-driver-docs').createSignedUrl(path, 60 * 60 * 24 * 30);
    const fileUrl = signed?.signedUrl ?? '';

    const row = {
      doc_type: docType, file_url: fileUrl, file_path: path,
      number: meta.number ?? null, expires_at: meta.expires_at ?? null,
      status: 'pending', rejection_reason: null,
    };
    const { error } = isVehicleScoped
      ? await this.supabase.from('ag_vehicle_documents')
          .upsert({ ...row, vehicle_id: vehicleId, driver_id: driverId }, { onConflict: 'vehicle_id,doc_type' })
      : await this.supabase.from('ag_driver_documents')
          .upsert({ ...row, driver_id: driverId }, { onConflict: 'driver_id,doc_type' });
    if (error) return { success: false, error: error.message };

    // Lectura automática de la fecha de vencimiento con GPT-4o Vision -- reemplaza lo que el
    // conductor escribió a mano si la IA logra leerla (decisión del usuario 2026-08-05). Si
    // falla o no aplica al tipo de documento, se conserva la fecha manual sin bloquear la subida.
    if (!AndaGanaService.DOC_TYPES_WITH_EXPIRY.has(docType)) return { success: true };
    try {
      const { data: { session } } = await this.supabase.auth.getSession();
      const token = session?.access_token ?? environment.moviSupabase.anonKey;
      const res = await fetch(`${environment.moviSupabase.url}/functions/v1/ag-extract-doc-date`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: environment.moviSupabase.anonKey, Authorization: `Bearer ${token}` },
        body: JSON.stringify({ driver_id: driverId, doc_type: docType, file_url: fileUrl, vehicle_id: vehicleId }),
      });
      const r = res.ok ? await res.json() : null;
      if (r?.readable && r?.expiry_date) return { success: true, extractedExpiry: r.expiry_date };
      return { success: true, extractionFailed: true };
    } catch {
      return { success: true, extractionFailed: true };
    }
  }

  async refreshDocumentUrl(filePath: string): Promise<string | null> {
    const { data } = await this.supabase.storage.from('movi-driver-docs').createSignedUrl(filePath, 60 * 60 * 24);
    return data?.signedUrl ?? null;
  }

  /** Verifica SOAT + tecnomecánica directo contra el RUNT (vía Verifik) por placa + cédula del
   * dueño del vehículo -- pedido explícito del usuario 2026-08-21 para conductores que no tienen
   * el documento físico ni una copia digital a mano, solo saben que está vigente. Si se pasa
   * vehicleId (vehículo ya existe en BD, ej. "Mis documentos"), el resultado se guarda solo del
   * lado del servidor. Si NO se pasa vehicleId (durante el registro inicial, antes de crear el
   * vehículo), el resultado solo se devuelve -- quien llama debe guardarlo en el formulario y
   * persistirlo después junto con registerDriver(). ownerDocumentNumber solo hace falta si el
   * vehículo NO está a nombre del propio conductor. */
  async verifyVehicleRunt(params: {
    driverId: string; vehicleId?: string; plate?: string;
    ownerDocumentType?: string; ownerDocumentNumber?: string;
  }): Promise<{
    ok: boolean; skipped?: boolean; found?: boolean; reason?: string;
    soat?: { valid: boolean; expires_at: string | null; number: string | null };
    techReview?: { valid: boolean; expires_at: string | null; number: string | null };
    error?: string;
  }> {
    try {
      const { data: { session } } = await this.supabase.auth.getSession();
      const token = session?.access_token ?? environment.moviSupabase.anonKey;
      const res = await fetch(`${environment.moviSupabase.url}/functions/v1/ag-verify-vehicle-runt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: environment.moviSupabase.anonKey, Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          driver_id: params.driverId,
          vehicle_id: params.vehicleId ?? null,
          plate: params.plate ?? null,
          owner_document_type: params.ownerDocumentType ?? null,
          owner_document_number: params.ownerDocumentNumber ?? null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return { ok: false, error: data?.error ?? `Error ${res.status}` };
      return data;
    } catch (e: any) {
      return { ok: false, error: e?.message ?? 'Error de red' };
    }
  }

  // ═══════════════════════════════════════════════════
  // DRIVER: métricas aceptación/cancelación
  // ═══════════════════════════════════════════════════
  async getDriverMetrics(): Promise<{
    acceptance_rate: number; cancellation_rate: number; completion_rate: number;
    offers_seen: number; offers_made: number;
    trips_accepted: number; trips_cancelled: number; trips_completed: number;
    window_start: string;
  } | null> {
    const { data } = await this.supabase.rpc('ag_get_driver_metrics');
    const row = Array.isArray(data) ? data[0] : data;
    return row ?? null;
  }

  async logMetricEvent(eventType: 'offer_seen' | 'offer_made' | 'trip_cancelled_self', tripId?: string): Promise<void> {
    await this.supabase.rpc('ag_log_metric_event', { p_event_type: eventType, p_trip_id: tripId ?? null });
  }

  /** Marca que ESTE conductor abrió la notificación push de ESTA solicitud puntual (pedido
   * explícito 2026-09-01: saber qué conductores de verdad leen los push, no solo asumirlo).
   * Solo se debe llamar desde _showIncomingTripById -- ahí sí sabemos que vino de tocar la
   * notificación (deep link nativo o el puente __moviHandleTripPush), no de abrir la app normal. */
  /**
   * source 'tap' = el conductor TOCO la notificacion. 'foreground' = el push le llego con la app
   * ya abierta en pantalla, sin que tocara nada. Son señales distintas y el informe las cuenta
   * por separado: mezclarlas era el bug de la migracion 248.
   */
  async logPushOpened(tripRequestId: string, driverId: string, source: 'tap' | 'foreground' = 'tap'): Promise<void> {
    await this.supabase.rpc('ag_log_push_opened', { p_trip_request_id: tripRequestId, p_driver_id: driverId, p_source: source });
  }

  async driverCancelTrip(tripRequestId: string, reason?: string): Promise<{ success: boolean; error?: string }> {
    const { error } = await this.supabase.rpc('ag_driver_cancel_trip', {
      p_trip_request_id: tripRequestId, p_reason: reason ?? null,
    });
    if (error) {
      this.reportTripError('driverCancelTrip', error, { critical: true, extra: { tripRequestId } });
      return { success: false, error: error.message };
    }
    return { success: true };
  }

  // ═══════════════════════════════════════════════════
  // DRIVER: objetos perdidos
  // ═══════════════════════════════════════════════════
  async listLostItems(driverId: string): Promise<any[]> {
    const { data } = await this.supabase
      .from('ag_lost_items')
      .select('*, ag_users!passenger_user_id(full_name, phone)')
      .eq('driver_id', driverId)
      .order('created_at', { ascending: false })
      .limit(50);
    return data ?? [];
  }

  async reportLostItem(payload: {
    tripRequestId: string; driverId: string; passengerUserId: string;
    description: string; photo?: File;
  }): Promise<{ success: boolean; error?: string }> {
    let photoUrl: string | null = null;
    if (payload.photo) {
      const ext = payload.photo.name.split('.').pop()?.toLowerCase() || 'jpg';
      const userId = (await this.supabase.auth.getUser()).data.user?.id;
      const path = `${userId}/${payload.tripRequestId}-${Date.now()}.${ext}`;
      const up = await this.supabase.storage.from('movi-lost-items').upload(path, payload.photo, { upsert: true });
      if (!up.error) {
        const { data } = this.supabase.storage.from('movi-lost-items').getPublicUrl(path);
        photoUrl = data.publicUrl;
      }
    }
    const { error } = await this.supabase.from('ag_lost_items').insert({
      trip_request_id: payload.tripRequestId,
      driver_id: payload.driverId,
      passenger_user_id: payload.passengerUserId,
      description: payload.description.trim(),
      photo_url: photoUrl,
      status: 'reported',
    });
    if (error) return { success: false, error: error.message };
    try {
      const passenger = await this.supabase.from('ag_users').select('auth_user_id, full_name').eq('id', payload.passengerUserId).maybeSingle();
      if (passenger.data?.auth_user_id) {
        await this.sendPush({
          userIds: [passenger.data.auth_user_id],
          title: '📦 Objeto olvidado',
          body: `Un conductor reportó que dejaste algo: ${payload.description.slice(0, 80)}`,
          url: '/anda-gana?view=lost',
          tag: `lost-${payload.tripRequestId}`,
          urgent: true,
        });
      }
    } catch {}
    return { success: true };
  }

  async updateLostItemStatus(itemId: string, status: 'reported' | 'contacted' | 'returned' | 'closed', notes?: string): Promise<void> {
    await this.supabase.from('ag_lost_items').update({
      status, driver_notes: notes ?? null, updated_at: new Date().toISOString(),
    }).eq('id', itemId);
  }

  // ═══════════════════════════════════════════════════
  // DRIVER: detalle de viaje con desglose
  // ═══════════════════════════════════════════════════
  async getTripDetail(tripRequestId: string): Promise<any | null> {
    const { data } = await this.supabase
      .from('ag_trip_detail_v')
      .select('*')
      .eq('id', tripRequestId)
      .maybeSingle();
    return data ?? null;
  }

  // ═══════════════════════════════════════════════════
  // DRIVER: viajes programados
  // ═══════════════════════════════════════════════════
  async listAvailableScheduledTrips(driverId: string, maxDistanceKm: number = 30): Promise<any[]> {
    const { data: driver } = await this.supabase
      .from('ag_driver_locations').select('lat, lng').eq('driver_id', driverId).maybeSingle();
    const { data } = await this.supabase
      .from('ag_scheduled_trips')
      .select('*, ag_users!user_id(full_name)')
      .eq('status', 'pending')
      .is('driver_id', null)
      .gte('scheduled_for', new Date().toISOString())
      .order('scheduled_for', { ascending: true })
      .limit(30);
    if (!driver || !data) return data ?? [];
    return data.filter((t: any) => {
      if (!t.origin_lat || !t.origin_lng) return true;
      const d = this._haversine(driver.lat, driver.lng, t.origin_lat, t.origin_lng);
      return d <= maxDistanceKm;
    });
  }

  async claimScheduledTrip(scheduledTripId: string, driverId: string): Promise<{ success: boolean; error?: string }> {
    const { error } = await this.supabase.from('ag_scheduled_trips').update({
      driver_id: driverId, status: 'claimed', updated_at: new Date().toISOString(),
    }).eq('id', scheduledTripId).eq('status', 'pending').is('driver_id', null);
    return error ? { success: false, error: error.message } : { success: true };
  }

  async listMyScheduledTrips(driverId: string): Promise<any[]> {
    const { data } = await this.supabase
      .from('ag_scheduled_trips')
      .select('*, ag_users!user_id(full_name, phone)')
      .eq('driver_id', driverId)
      .in('status', ['claimed', 'active'])
      .order('scheduled_for', { ascending: true });
    return data ?? [];
  }

  async releaseScheduledTrip(scheduledTripId: string): Promise<void> {
    await this.supabase.from('ag_scheduled_trips').update({
      driver_id: null, status: 'pending', updated_at: new Date().toISOString(),
    }).eq('id', scheduledTripId);
  }

  private _haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371; const toRad = (v: number) => v * Math.PI / 180;
    const dLat = toRad(lat2 - lat1); const dLng = toRad(lng2 - lng1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
  }

  // ═══════════════════════════════════════════════════
  // DRIVER: rating pasajero con tags
  // ═══════════════════════════════════════════════════
  async submitPassengerRating(
    tripRequestId: string, raterUserId: string, ratedUserId: string,
    stars: number, tags: string[], comment: string,
  ): Promise<{ success: boolean; error?: string }> {
    const { error } = await this.supabase.from('ag_trip_ratings').insert({
      trip_request_id: tripRequestId,
      rated_by_role: 'driver',
      rater_user_id: raterUserId,
      rated_user_id: ratedUserId,
      stars,
      tags,
      comment: comment.trim() || null,
    });
    return error ? { success: false, error: error.message } : { success: true };
  }

  async hasRatedTrip(tripRequestId: string, raterUserId: string): Promise<boolean> {
    const { count } = await this.supabase
      .from('ag_trip_ratings')
      .select('id', { count: 'exact', head: true })
      .eq('trip_request_id', tripRequestId)
      .eq('rater_user_id', raterUserId);
    return (count ?? 0) > 0;
  }

  // ═══════════════════════════════════════════════════
  // PASSENGER: payment methods
  // ═══════════════════════════════════════════════════
  async listPaymentMethods(agUserId: string): Promise<any[]> {
    const { data } = await this.supabase
      .from('ag_payment_methods').select('*')
      .eq('user_id', agUserId)
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(10);
    return data ?? [];
  }

  async addPaymentMethod(agUserId: string, payload: {
    kind: 'card'|'nequi'|'daviplata'|'bancolombia'|'efectivo';
    label: string; last4?: string; brand?: string; account?: string; isDefault?: boolean;
  }): Promise<{ success: boolean; error?: string }> {
    const { error } = await this.supabase.from('ag_payment_methods').insert({
      user_id: agUserId, kind: payload.kind, label: payload.label,
      last4: payload.last4 ?? null, brand: payload.brand ?? null,
      account: payload.account ?? null, is_default: payload.isDefault ?? false,
    });
    return error ? { success: false, error: error.message } : { success: true };
  }

  async deletePaymentMethod(id: string): Promise<void> {
    await this.supabase.from('ag_payment_methods').delete().eq('id', id);
  }

  async setDefaultPaymentMethod(id: string, agUserId: string): Promise<void> {
    await this.supabase.from('ag_payment_methods').update({ is_default: true })
      .eq('id', id).eq('user_id', agUserId);
  }

  // ═══════════════════════════════════════════════════
  // PASSENGER: wallet
  // ═══════════════════════════════════════════════════
  async getPassengerWalletBalance(agUserId: string): Promise<number> {
    const { data } = await this.supabase
      .from('ag_users').select('passenger_wallet_balance')
      .eq('id', agUserId).maybeSingle();
    return (data as any)?.passenger_wallet_balance ?? 0;
  }

  async getPassengerWalletHistory(agUserId: string): Promise<any[]> {
    const { data } = await this.supabase
      .from('ag_passenger_wallet_tx').select('*')
      .eq('user_id', agUserId)
      .order('created_at', { ascending: false })
      .limit(50);
    return data ?? [];
  }

  async creditPassengerWallet(amount: number, kind: 'recharge'|'bonus', desc?: string): Promise<void> {
    await this.supabase.rpc('ag_passenger_wallet_credit', {
      p_amount: amount, p_kind: kind, p_desc: desc ?? null,
    });
  }

  // ═══════════════════════════════════════════════════
  // PASSENGER: favoritos
  // ═══════════════════════════════════════════════════
  async listPassengerFavorites(authUserId: string): Promise<any[]> {
    const { data } = await this.supabase
      .from('ag_favorite_addresses').select('*')
      .eq('user_id', authUserId)
      .order('sort_order', { ascending: true })
      .limit(20);
    return data ?? [];
  }

  async addPassengerFavorite(authUserId: string, fav: {
    label: string; icon?: string; address: string; lat: number; lng: number;
  }): Promise<{ success: boolean; error?: string }> {
    const { error } = await this.supabase.from('ag_favorite_addresses').insert({
      user_id: authUserId, label: fav.label, icon: fav.icon ?? 'home',
      address: fav.address, lat: fav.lat, lng: fav.lng,
    });
    return error ? { success: false, error: error.message } : { success: true };
  }

  async removePassengerFavorite(id: string): Promise<void> {
    await this.supabase.from('ag_favorite_addresses').delete().eq('id', id);
  }

  // ═══════════════════════════════════════════════════
  // PASSENGER: scheduled trips
  // ═══════════════════════════════════════════════════
  async listPassengerScheduledTrips(authUserId: string): Promise<any[]> {
    const { data } = await this.supabase
      .from('ag_scheduled_trips').select('*')
      .eq('user_id', authUserId)
      .gte('scheduled_for', new Date().toISOString())
      .in('status', ['pending', 'notified'])
      .order('scheduled_for', { ascending: true })
      .limit(20);
    return data ?? [];
  }

  async createScheduledTrip(authUserId: string, payload: {
    originAddress: string; originLat: number; originLng: number;
    destinationAddress: string; destinationLat: number; destinationLng: number;
    vehicleType: string; suggestedPrice: number; paymentMethod: string;
    scheduledFor: string;
  }): Promise<{ success: boolean; error?: string }> {
    const { error } = await this.supabase.from('ag_scheduled_trips').insert({
      user_id: authUserId,
      origin_address: payload.originAddress, origin_lat: payload.originLat, origin_lng: payload.originLng,
      destination_address: payload.destinationAddress, destination_lat: payload.destinationLat, destination_lng: payload.destinationLng,
      vehicle_type: payload.vehicleType, suggested_price: payload.suggestedPrice,
      payment_method: payload.paymentMethod, scheduled_for: payload.scheduledFor, status: 'pending',
    });
    return error ? { success: false, error: error.message } : { success: true };
  }

  // ═══════════════════════════════════════════════════
  // PASSENGER: trip share (wrapper)
  // ═══════════════════════════════════════════════════
  async createPassengerTripShare(tripId: string, authUserId: string, hours: number = 4): Promise<string | null> {
    try {
      return await this.createTripShare(authUserId, tripId, hours);
    } catch {
      return null;
    }
  }

  // ═══════════════════════════════════════════════════
  // PASSENGER: reportar problema
  // ═══════════════════════════════════════════════════
  async submitPassengerReport(agUserId: string, kind: 'driver'|'incident'|'payment'|'vehicle'|'other',
    description: string, tripId?: string): Promise<{ success: boolean; error?: string }> {
    const { error } = await this.supabase.from('ag_reports').insert({
      reporter_user_id: agUserId, type: kind, description: description.trim(),
      trip_id: tripId ?? null, status: 'open',
    });
    return error ? { success: false, error: error.message } : { success: true };
  }

  async listPassengerReports(agUserId: string): Promise<any[]> {
    const { data } = await this.supabase.from('ag_reports')
      .select('*').eq('reporter_user_id', agUserId)
      .order('created_at', { ascending: false })
      .limit(50);
    return data ?? [];
  }

  // ═══════════════════════════════════════════════════
  // PASSENGER: objetos olvidados (vista)
  // ═══════════════════════════════════════════════════
  async listPassengerLostItems(agUserId: string): Promise<any[]> {
    const { data } = await this.supabase
      .from('ag_lost_items').select('*, ag_passenger_lost_items_v!inner(driver_name, driver_phone, driver_plate)')
      .eq('passenger_user_id', agUserId)
      .order('created_at', { ascending: false })
      .limit(20);
    return data ?? [];
  }

  // ═══════════════════════════════════════════════════
  // PASSENGER: detalle viaje
  // ═══════════════════════════════════════════════════
  async getPassengerTripDetail(tripRequestId: string): Promise<any | null> {
    const { data } = await this.supabase
      .from('ag_passenger_trip_detail_v').select('*')
      .eq('id', tripRequestId).maybeSingle();
    return data ?? null;
  }

  // ═══════════════════════════════════════════════════
  // PASSENGER: repeat / tip
  // ═══════════════════════════════════════════════════
  async repeatTrip(previousTripId: string): Promise<string | null> {
    const { data } = await this.supabase.rpc('ag_passenger_repeat_trip', { p_previous_trip_id: previousTripId });
    return (data as string) ?? null;
  }

  async tipDriverSafe(tripRequestId: string, amount: number): Promise<{ success: boolean; error?: string }> {
    try {
      const { error } = await this.supabase.rpc('ag_tip_driver', {
        p_trip_request_id: tripRequestId, p_amount: amount,
      });
      return error ? { success: false, error: error.message } : { success: true };
    } catch (e: any) {
      return { success: false, error: e?.message ?? 'error' };
    }
  }

  // ═══════════════════════════════════════════════════
  // PASSENGER: editar perfil
  // ═══════════════════════════════════════════════════
  async updatePassengerProfile(payload: {
    fullName?: string; phone?: string; city?: string; selfieFile?: File;
  }): Promise<{ success: boolean; error?: string }> {
    let selfieUrl: string | null = null;
    if (payload.selfieFile) {
      const userId = (await this.supabase.auth.getUser()).data.user?.id;
      const ext = payload.selfieFile.name.split('.').pop()?.toLowerCase() || 'jpg';
      const path = `${userId}/${Date.now()}.${ext}`;
      const up = await this.supabase.storage.from('movi-passenger-profile').upload(path, payload.selfieFile, { upsert: true });
      if (!up.error) {
        const { data } = this.supabase.storage.from('movi-passenger-profile').getPublicUrl(path);
        selfieUrl = data.publicUrl;
      }
    }
    const { error } = await this.supabase.rpc('ag_update_passenger_profile', {
      p_full_name: payload.fullName ?? null,
      p_phone: payload.phone ?? null,
      p_city: payload.city ?? null,
      p_selfie_url: selfieUrl,
    });
    return error ? { success: false, error: error.message } : { success: true };
  }

  // ═══════════════════════════════════════════════════
  // PASSENGER: driver public info (rating + nivel para mostrar en oferta)
  // ═══════════════════════════════════════════════════
  async getDriverPublicInfo(driverId: string): Promise<any | null> {
    const { data } = await this.supabase
      .from('ag_driver_public_v').select('*')
      .eq('driver_id', driverId).maybeSingle();
    return data ?? null;
  }

  // ═══════════════════════════════════════════════════
  // PASSENGER: loyalty info
  // ═══════════════════════════════════════════════════
  async getPassengerLoyalty(agUserId: string): Promise<{
    points: number; level: string; total_trips: number;
  } | null> {
    const { data } = await this.supabase
      .from('ag_users').select('loyalty_points, passenger_level, total_trips_as_passenger')
      .eq('id', agUserId).maybeSingle();
    if (!data) return null;
    return {
      points: (data as any).loyalty_points ?? 0,
      level: (data as any).passenger_level ?? 'bronce',
      total_trips: (data as any).total_trips_as_passenger ?? 0,
    };
  }

  // ═══════════════════════════════════════════════════
  // PASSENGER: corporate
  // ═══════════════════════════════════════════════════
  async listCorporateAccounts(agUserId: string): Promise<any[]> {
    const { data: memberships } = await this.supabase
      .from('ag_corporate_members').select('corporate_id, role, monthly_limit, ag_corporate_accounts(*)')
      .eq('user_id', agUserId);
    return (memberships ?? []).map((m: any) => ({
      ...m.ag_corporate_accounts, role: m.role, monthly_limit: m.monthly_limit,
    }));
  }

  async createCorporateAccount(agUserId: string, payload: {
    name: string; nit?: string; monthlyBudget?: number;
  }): Promise<{ success: boolean; error?: string }> {
    const { data: acc, error: accErr } = await this.supabase.from('ag_corporate_accounts').insert({
      name: payload.name, nit: payload.nit ?? null,
      owner_user_id: agUserId, monthly_budget: payload.monthlyBudget ?? 0,
    }).select('id').single();
    if (accErr) return { success: false, error: accErr.message };
    const { error: memErr } = await this.supabase.from('ag_corporate_members').insert({
      corporate_id: (acc as any).id, user_id: agUserId, role: 'owner',
    });
    return memErr ? { success: false, error: memErr.message } : { success: true };
  }

  async getDriverLocation(driverId: string): Promise<{ lat: number; lng: number; heading?: number } | null> {
    const { data } = await this.supabase
      .from('ag_driver_locations').select('lat, lng, heading')
      .eq('driver_id', driverId).maybeSingle();
    return data as any;
  }

  async getDriverAuthUserIds(driverIds: string[]): Promise<string[]> {
    if (!driverIds.length) return [];
    const { data } = await this.supabase
      .from('ag_drivers')
      .select('ag_users(auth_user_id)')
      .in('id', driverIds);
    return (data ?? []).map((d: any) => d.ag_users?.auth_user_id).filter(Boolean);
  }

  // ═══════════════════════════════════════════════════
  // PASSENGER: real-time trip stage subscription
  // ═══════════════════════════════════════════════════
  subscribeTripStage(tripId: string, onUpdate: (stage: string) => void): RealtimeChannel {
    const channel = this.supabase.channel(`trip-stage-${tripId}`)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'ag_trip_requests', filter: `id=eq.${tripId}`,
      }, (payload: any) => {
        if (payload.new?.driver_stage) {
          onUpdate(payload.new.driver_stage);
        }
        if (payload.new?.status === 'completed') {
          onUpdate('completed');
        }
        if (payload.new?.status === 'cancelled') {
          onUpdate('cancelled');
        }
      })
      .subscribe();
    return channel;
  }

  // ═══════════════════════════════════════════════════
  // PASSENGER: blacklist conductores
  // ═══════════════════════════════════════════════════
  async listPassengerBlockedDrivers(agUserId: string): Promise<any[]> {
    const { data } = await this.supabase
      .from('ag_driver_blacklist')
      .select('id, reason, created_at, ag_drivers(id, plate, vehicle_brand, vehicle_model, ag_users(full_name))')
      .eq('passenger_user_id', agUserId)
      .order('created_at', { ascending: false });
    return data ?? [];
  }

  async blockDriver(passengerUserId: string, driverId: string, reason?: string): Promise<{ success: boolean; error?: string }> {
    const { error } = await this.supabase.from('ag_driver_blacklist').insert({
      passenger_user_id: passengerUserId, driver_id: driverId, reason: reason ?? null,
    });
    return error ? { success: false, error: error.message } : { success: true };
  }

  async unblockDriver(id: string): Promise<void> {
    await this.supabase.from('ag_driver_blacklist').delete().eq('id', id);
  }

  // ═══════════════════════════════════════════════════
  // PASSENGER: tutorial
  // ═══════════════════════════════════════════════════
  async markPassengerTutorialCompleted(agUserId: string): Promise<void> {
    await this.supabase.from('ag_users').update({
      tutorial_completed: true,
      tutorial_completed_at: new Date().toISOString(),
    }).eq('id', agUserId);
  }

  // ═══════════════════════════════════════════════════
  // Settings unificados
  // ═══════════════════════════════════════════════════
  async updateUserSettings(payload: {
    notifySound?: boolean; notifyVibration?: boolean; notifyNewOffers?: boolean;
    hidePhone?: boolean; language?: string;
  }): Promise<void> {
    await this.supabase.rpc('ag_update_user_settings', {
      p_notify_sound: payload.notifySound ?? null,
      p_notify_vibration: payload.notifyVibration ?? null,
      p_notify_new_offers: payload.notifyNewOffers ?? null,
      p_hide_phone: payload.hidePhone ?? null,
      p_language: payload.language ?? null,
    });
  }

  async updateDriverNotifySettings(payload: {
    newRequests?: boolean; tripUpdates?: boolean; earnings?: boolean;
  }): Promise<void> {
    await this.supabase.rpc('ag_update_driver_notify_settings', {
      p_notify_new_requests: payload.newRequests ?? null,
      p_notify_trip_updates: payload.tripUpdates ?? null,
      p_notify_earnings: payload.earnings ?? null,
    });
  }

  // ═══════════════════════════════════════════════════
  // DRIVER: reportar problema (reutiliza ag_reports)
  // ═══════════════════════════════════════════════════
  async submitDriverReport(agUserId: string, kind: 'passenger'|'incident'|'app'|'vehicle'|'other',
    description: string, tripId?: string): Promise<{ success: boolean; error?: string }> {
    const { error } = await this.supabase.from('ag_reports').insert({
      reporter_user_id: agUserId, type: kind, description: description.trim(),
      trip_id: tripId ?? null, status: 'open',
    });
    return error ? { success: false, error: error.message } : { success: true };
  }

  async listDriverReports(agUserId: string): Promise<any[]> {
    const { data } = await this.supabase.from('ag_reports')
      .select('*').eq('reporter_user_id', agUserId)
      .order('created_at', { ascending: false })
      .limit(50);
    return data ?? [];
  }

  // ═══════════════════════════════════════════════════
  // Utility: unsubscribe channel
  // ═══════════════════════════════════════════════════
  unsubscribeChannel(channel: RealtimeChannel | null): void {
    if (channel) this.supabase.removeChannel(channel);
  }
}
