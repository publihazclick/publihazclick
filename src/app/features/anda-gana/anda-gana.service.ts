import { Injectable } from '@angular/core';
import { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseClient } from '../../core/supabase.client';

export interface PassengerFormData {
  fullName: string; birthDate: string; city: string; idNumber: string;
  phone: string; email: string; password: string;
  emergencyName: string; emergencyPhone: string;
  selfieFile?: File;
}

export interface DriverFormData {
  fullName: string; birthDate: string; city: string; idNumber: string;
  phone: string; email: string; password: string;
  emergencyName: string; emergencyPhone: string;
  licenseNumber: string; licenseCategory: string; licenseExpiry: string;
  plate: string; vehicleType: string; vehicleBrand: string;
  vehicleModel: string; vehicleYear: string; vehicleColor: string;
  files: Record<string, File>;
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

      const { error } = await this.supabase.from('ag_users').insert({
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
      });

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

      const { data: agUser, error: userError } = await this.supabase
        .from('ag_users')
        .insert({
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
        })
        .select('id')
        .single();

      if (userError) return { success: false, error: userError.message };

      const { error: driverError } = await this.supabase.from('ag_drivers').insert({
        ag_user_id: agUser.id,
        license_number: form.licenseNumber,
        license_category: form.licenseCategory,
        license_expiry: form.licenseExpiry,
        plate: form.plate.toUpperCase(),
        vehicle_type: form.vehicleType,
        vehicle_brand: form.vehicleBrand,
        vehicle_model: form.vehicleModel,
        vehicle_year: form.vehicleYear,
        vehicle_color: form.vehicleColor,
        documents,
        status: 'pending',
      });

      if (driverError) return { success: false, error: driverError.message };
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e?.message ?? 'Error inesperado.' };
    }
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
}
