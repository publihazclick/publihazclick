import { Injectable } from '@angular/core';
import { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseClient } from '../../core/supabase.client';
import { environment } from '../../../environments/environment';

export interface PassengerFormData {
  fullName: string; birthDate: string; city: string; idNumber: string;
  phone: string; email: string; password: string;
  emergencyName: string; emergencyPhone: string;
  selfieFile?: File;
  referredBy?: string;
}

export interface DriverFormData {
  fullName: string; birthDate: string; city: string; idNumber: string;
  phone: string; email: string; password: string;
  emergencyName: string; emergencyPhone: string;
  licenseNumber: string; licenseCategory: string; licenseExpiry: string;
  plate: string; vehicleType: string; vehicleBrand: string;
  vehicleModel: string; vehicleYear: string; vehicleColor: string;
  files: Record<string, File>;
  referredBy?: string;
}

export interface AgUser {
  id: string; auth_user_id: string; role: 'passenger' | 'driver';
  full_name: string; birth_date: string; city: string;
  phone: string; email: string; status: string;
  created_at: string;
}

export interface AgDriver {
  id: string; ag_user_id: string;
  license_number: string; license_category: string; license_expiry: string;
  plate: string; vehicle_type: string; vehicle_brand: string;
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
}

export type AgPaymentMethod = 'efectivo' | 'nequi' | 'daviplata' | 'bancolombia' | 'tarjeta';

export interface AgTripRequest {
  id: string;
  passenger_user_id: string;
  origin_lat: number;
  origin_lng: number;
  dest_name: string;
  dest_lat: number;
  dest_lng: number;
  distance_km: number;
  vehicle_type: string;
  offered_price: number;
  payment_method: AgPaymentMethod;
  status: string;
  created_at: string;
  ag_users?: AgUser;
}

export interface AgRegistrationResult {
  success: boolean;
  error?: string;
}

@Injectable({ providedIn: 'root' })
export class AndaGanaService {
  private readonly supabase: SupabaseClient = getSupabaseClient();

  // ── Auth ──────────────────────────────────────────────────────
  private async currentUserId(): Promise<string | null> {
    const { data } = await this.supabase.auth.getUser();
    return data.user?.id ?? null;
  }

  // ── Perfil AG del usuario actual ──────────────────────────────
  async getMyAgProfile(): Promise<AgUser | null> {
    const uid = await this.currentUserId();
    if (!uid) return null;
    const { data } = await this.supabase
      .from('ag_users')
      .select('*')
      .eq('auth_user_id', uid)
      .maybeSingle();
    return data ?? null;
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
        city: form.city,
        id_number: form.idNumber,
        phone: form.phone,
        email: form.email,
        emergency_contact_name: form.emergencyName,
        emergency_contact_phone: form.emergencyPhone,
        selfie_url: selfieUrl,
      };
      if (form.referredBy) insertData.referred_by = form.referredBy;

      const { error } = await this.supabase.from('ag_users').insert(insertData);

      if (error) return { success: false, error: error.message };
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e?.message ?? 'Error inesperado.' };
    }
  }

  async registerDriver(form: DriverFormData): Promise<AgRegistrationResult> {
    try {
      const uid = await this.currentUserId();
      if (!uid) return { success: false, error: 'Debes iniciar sesión primero.' };

      const existing = await this.getMyAgProfile();
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
        city: form.city,
        id_number: form.idNumber,
        phone: form.phone,
        email: form.email,
        emergency_contact_name: form.emergencyName,
        emergency_contact_phone: form.emergencyPhone,
      };
      if (form.referredBy) driverInsert.referred_by = form.referredBy;

      const { data: agUser, error: userError } = await this.supabase
        .from('ag_users')
        .insert(driverInsert)
        .select('id')
        .single();

      if (userError) return { success: false, error: userError.message };

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
        status: 'pending',
      }).select('id').single();

      if (driverError) return { success: false, error: driverError.message };

      // Disparar verificación automática con GPT-4o Vision (no bloquea el registro)
      if (driverRow?.id) {
        this.triggerDriverVerification(driverRow.id).catch(() => {});
      }
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e?.message ?? 'Error inesperado.' };
    }
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
  async getPassengers(): Promise<AgUser[]> {
    const { data } = await this.supabase
      .from('ag_users')
      .select('*')
      .eq('role', 'passenger')
      .order('created_at', { ascending: false });
    return data ?? [];
  }

  async getDrivers(statusFilter?: string): Promise<AgDriver[]> {
    let query = this.supabase
      .from('ag_drivers')
      .select('*, ag_users(*)')
      .order('created_at', { ascending: false });
    if (statusFilter) query = query.eq('status', statusFilter);
    const { data } = await query;
    return data ?? [];
  }

  async approveDriver(driverId: string): Promise<boolean> {
    const { error } = await this.supabase
      .from('ag_drivers')
      .update({ status: 'approved', approved_at: new Date().toISOString() })
      .eq('id', driverId);
    return !error;
  }

  async rejectDriver(driverId: string, reason: string): Promise<boolean> {
    const { error } = await this.supabase
      .from('ag_drivers')
      .update({ status: 'rejected', rejection_reason: reason })
      .eq('id', driverId);
    return !error;
  }

  // ── Trip requests ─────────────────────────────────────────────
  async requestTrip(data: {
    passengerUserId: string; originLat: number; originLng: number;
    destName: string; destLat: number; destLng: number;
    distanceKm: number; vehicleType: string; offeredPrice: number;
    paymentMethod: AgPaymentMethod;
  }): Promise<{ success: boolean; tripId?: string; error?: string }> {
    const { data: row, error } = await this.supabase
      .from('ag_trip_requests')
      .insert({
        passenger_user_id: data.passengerUserId,
        origin_lat: data.originLat, origin_lng: data.originLng,
        dest_name: data.destName, dest_lat: data.destLat, dest_lng: data.destLng,
        distance_km: data.distanceKm, vehicle_type: data.vehicleType,
        offered_price: data.offeredPrice, payment_method: data.paymentMethod,
        status: 'searching',
      })
      .select('id')
      .single();
    if (error) return { success: false, error: error.message };
    return { success: true, tripId: row.id };
  }

  async cancelTripRequest(tripRequestId: string): Promise<void> {
    await this.supabase
      .from('ag_trip_requests')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('id', tripRequestId);
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
    const { error } = await this.supabase
      .from('ag_trip_offers')
      .update({ status: 'accepted', updated_at: new Date().toISOString() })
      .eq('id', offerId);
    return error ? { success: false, error: error.message } : { success: true };
  }

  async rejectOffer(offerId: string): Promise<{ success: boolean; error?: string }> {
    const { error } = await this.supabase
      .from('ag_trip_offers')
      .update({ status: 'rejected', updated_at: new Date().toISOString() })
      .eq('id', offerId);
    return error ? { success: false, error: error.message } : { success: true };
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
  async getSearchingRequests(vehicleType?: string): Promise<AgTripRequest[]> {
    let query = this.supabase
      .from('ag_trip_requests')
      .select('*, ag_users(*)')
      .eq('status', 'searching')
      .order('created_at', { ascending: false })
      .limit(20);
    if (vehicleType) query = query.eq('vehicle_type', vehicleType);
    const { data } = await query;
    return (data ?? []) as AgTripRequest[];
  }

  async makeOffer(
    tripRequestId: string,
    driverId: string,
    offeredPrice: number,
  ): Promise<{ success: boolean; error?: string }> {
    const { error } = await this.supabase
      .from('ag_trip_offers')
      .insert({ trip_request_id: tripRequestId, driver_id: driverId, offered_price: offeredPrice });
    return error ? { success: false, error: error.message } : { success: true };
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

  async setCommissionPct(pct: number): Promise<boolean> {
    const { error } = await this.supabase
      .from('platform_settings')
      .upsert({ key: 'ag_commission_pct', value: String(Math.max(0, Math.min(15, pct))) },
               { onConflict: 'key' });
    return !error;
  }

  // ── Billetera conductor ───────────────────────────────────────
  async getDriverWalletBalance(driverId: string): Promise<number> {
    const { data } = await this.supabase
      .from('ag_drivers')
      .select('wallet_balance')
      .eq('id', driverId)
      .single();
    return data?.wallet_balance ?? 0;
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

  async setDriverOnline(driverId: string, online: boolean): Promise<void> {
    await this.supabase.from('ag_drivers').update({ is_online: online, updated_at: new Date().toISOString() }).eq('id', driverId);
  }

  async updateDriverPreferences(driverId: string, prefs: {
    max_distance_km: number; accepts_pets: boolean; accepts_luggage: boolean;
    accepts_child_seat: boolean; hide_phone: boolean; notify_sound: boolean; notify_vibration: boolean;
  }): Promise<void> {
    await this.supabase.from('ag_drivers').update({ ...prefs, updated_at: new Date().toISOString() }).eq('id', driverId);
  }

  async createWalletRecharge(amount: number): Promise<any> {
    const { data: { session } } = await this.supabase.auth.getSession();
    if (!session) throw new Error('Sin sesión activa');
    const res = await fetch(
      `${environment.supabase.url}/functions/v1/ag-create-wallet-recharge`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ amount }),
      }
    );
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? 'Error al crear pago');
    return data;
  }

  async signOut(): Promise<void> {
    await this.supabase.auth.signOut();
  }

  async completeTrip(tripRequestId: string): Promise<{ success: boolean; error?: string }> {
    const { error } = await this.supabase.rpc('ag_complete_trip', { p_trip_request_id: tripRequestId });
    return error ? { success: false, error: error.message } : { success: true };
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

  // ── Billetera de retiro por referidos ───────────────────────────
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

  async getStats(): Promise<{ passengers: number; pending: number; approved: number; rejected: number }> {
    const [p, pend, appr, rej] = await Promise.all([
      this.supabase.from('ag_users').select('id', { count: 'exact', head: true }).eq('role', 'passenger'),
      this.supabase.from('ag_drivers').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      this.supabase.from('ag_drivers').select('id', { count: 'exact', head: true }).eq('status', 'approved'),
      this.supabase.from('ag_drivers').select('id', { count: 'exact', head: true }).eq('status', 'rejected'),
    ]);
    return {
      passengers: p.count ?? 0,
      pending: pend.count ?? 0,
      approved: appr.count ?? 0,
      rejected: rej.count ?? 0,
    };
  }

  // ═══════════════════════════════════════════════════
  // SOS / Emergencias
  // ═══════════════════════════════════════════════════
  async triggerSos(payload: { tripId?: string | null; lat?: number; lng?: number; accuracy?: number; message?: string }): Promise<{ ok: boolean; sosId?: string; contactsNotified?: number; mapsLink?: string }> {
    const { data: sess } = await this.supabase.auth.getSession();
    const accessToken = sess?.session?.access_token;
    if (!accessToken) throw new Error('Sesión no iniciada');
    const r = await fetch(`${environment.supabase.url}/functions/v1/ag-sos-trigger`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: environment.supabase.anonKey, Authorization: `Bearer ${accessToken}` },
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

  async listEmergencyContacts(userId: string): Promise<any[]> {
    const { data } = await this.supabase.from('ag_emergency_contacts').select('*').eq('user_id', userId).order('created_at');
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
    const { data } = await this.supabase.from('ag_favorite_addresses').select('*').eq('user_id', userId).order('sort_order');
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
    const { data } = await this.supabase.from('ag_scheduled_trips').select('*').eq('user_id', userId).in('status', ['pending', 'notified']).order('scheduled_for', { ascending: true });
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
    const { error } = await this.supabase.rpc('ag_tip_driver', { p_trip_id: tripId, p_amount: amount });
    if (error) throw error;
  }

  // ═══════════════════════════════════════════════════
  // Llamada enmascarada (Twilio)
  // ═══════════════════════════════════════════════════
  async startMaskedCall(tripRequestId: string): Promise<{ ok: boolean; callSid?: string; error?: string }> {
    const { data: sess } = await this.supabase.auth.getSession();
    const accessToken = sess?.session?.access_token;
    if (!accessToken) return { ok: false, error: 'No autenticado' };
    try {
      const r = await fetch(`${environment.supabase.url}/functions/v1/ag-masked-call`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: environment.supabase.anonKey, Authorization: `Bearer ${accessToken}` },
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

  async listZones(): Promise<any[]> {
    const { data } = await this.supabase.from('ag_zones').select('*').order('name');
    return data ?? [];
  }

  async listSurgeRules(): Promise<any[]> {
    const { data } = await this.supabase.from('ag_surge_rules').select('*').order('created_at', { ascending: false });
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

  // Admin: gestión cupones
  async listCoupons(): Promise<any[]> {
    const { data } = await this.supabase.from('ag_coupons').select('*').order('created_at', { ascending: false });
    return data ?? [];
  }

  async createCoupon(payload: { code: string; title: string; description?: string; discountType: 'percent' | 'fixed' | 'first_trip'; discountValue: number; maxDiscountCop?: number; minTripCop?: number; maxUses?: number; maxUsesPerUser?: number; validUntil?: string }): Promise<void> {
    const { error } = await this.supabase.from('ag_coupons').insert({
      code: payload.code.toUpperCase(), title: payload.title, description: payload.description ?? null,
      discount_type: payload.discountType, discount_value: payload.discountValue,
      max_discount_cop: payload.maxDiscountCop ?? null, min_trip_cop: payload.minTripCop ?? 5000,
      max_uses: payload.maxUses ?? null, max_uses_per_user: payload.maxUsesPerUser ?? 1,
      valid_until: payload.validUntil ?? null,
    });
    if (error) throw error;
  }

  async toggleCoupon(id: string, active: boolean): Promise<void> {
    await this.supabase.from('ag_coupons').update({ is_active: active }).eq('id', id);
  }

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
    const { data } = await this.supabase.from('ag_withdrawals').select('*').eq('driver_id', driverId).order('created_at', { ascending: false });
    return data ?? [];
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
    const { data } = await this.supabase.from('ag_quests').select('*').eq('is_active', true).order('created_at', { ascending: false });
    return data ?? [];
  }

  async getQuestProgress(driverId: string): Promise<any[]> {
    const { data } = await this.supabase.from('ag_quest_progress').select('*, ag_quests(*)').eq('driver_id', driverId);
    return data ?? [];
  }

  // ═══════════════════════════════════════════════════
  // DRIVER: blacklist pasajeros
  // ═══════════════════════════════════════════════════
  async listBlacklist(driverId: string): Promise<any[]> {
    const { data } = await this.supabase.from('ag_passenger_blacklist').select('*').eq('driver_id', driverId).order('created_at', { ascending: false });
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
    const { data } = await this.supabase.from('ag_driver_vehicles').select('*').eq('driver_id', driverId).order('is_current', { ascending: false });
    return data ?? [];
  }

  async addVehicle(driverId: string, payload: { vehicle_type: string; brand: string; model: string; year: number; color: string; plate: string; photo_url?: string }): Promise<void> {
    await this.supabase.from('ag_driver_vehicles').insert({ driver_id: driverId, ...payload });
  }

  async setCurrentVehicle(driverId: string, vehicleId: string): Promise<void> {
    await this.supabase.from('ag_driver_vehicles').update({ is_current: false }).eq('driver_id', driverId);
    await this.supabase.from('ag_driver_vehicles').update({ is_current: true }).eq('id', vehicleId);
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
  async updateTripStage(tripRequestId: string, stage: 'heading_to_pickup'|'arrived_at_pickup'|'picked_up'|'on_route'|'arrived_at_destination'|'completed'): Promise<void> {
    const patch: any = { driver_stage: stage };
    if (stage === 'heading_to_pickup') patch['driver_started_at'] = new Date().toISOString();
    if (stage === 'picked_up') patch['passenger_picked_at'] = new Date().toISOString();
    await this.supabase.from('ag_trip_requests').update(patch).eq('id', tripRequestId);
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
    await this.supabase.rpc('ag_register_fcm_token', {
      p_token: token,
      p_user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
    });
  }

  async triggerDriverVerification(driverId: string): Promise<{ score: number; decision: string; flags: string[] } | null> {
    try {
      const { data: { session } } = await this.supabase.auth.getSession();
      const token = session?.access_token ?? environment.supabase.anonKey;
      const res = await fetch(`${environment.supabase.url}/functions/v1/ag-verify-driver-docs`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: environment.supabase.anonKey,
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

  async sendPush(payload: { userIds: string[]; title: string; body?: string; url?: string; tag?: string; urgent?: boolean }): Promise<void> {
    try {
      await fetch(`${environment.supabase.url}/functions/v1/ag-send-push`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: environment.supabase.anonKey },
        body: JSON.stringify({
          user_ids: payload.userIds, title: payload.title, body: payload.body,
          url: payload.url ?? '/anda-gana', tag: payload.tag, urgent: payload.urgent,
        }),
      });
    } catch {}
  }
}
