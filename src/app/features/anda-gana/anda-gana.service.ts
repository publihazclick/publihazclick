import { Injectable } from '@angular/core';
import { getSupabaseClient } from '../../core/supabase.client';

export interface AgTrip {
  id: string;
  driver_id: string;
  passenger_name?: string;
  origin: string;
  destination: string;
  distance_km?: number;
  duration_minutes?: number;
  total_amount: number;
  platform_commission: number;
  driver_earnings: number;
  status: 'completed' | 'cancelled';
  trip_date: string;
  created_at: string;
}

export interface AgUser {
  id: string;
  auth_user_id: string;
  full_name: string;
  phone: string;
  phone_verified: boolean;
  role: 'passenger' | 'driver';
  email?: string;
  city?: string;
  avatar_url?: string;
  emergency_contact_name?: string;
  emergency_contact_phone?: string;
  selfie_url?: string;
  selfie_verified?: boolean;
  selfie_verified_at?: string;
  created_at: string;
  driver?: AgDriver;
}

export interface AgDriver {
  id: string;
  ag_user_id: string;
  license_number: string;
  license_photo_url?: string;
  vehicle_plate: string;
  vehicle_brand: string;
  vehicle_model: string;
  vehicle_year?: number;
  vehicle_photo_url?: string;
  soat_photo_url?: string;
  soat_expiry?: string;
  status: 'pending' | 'approved' | 'rejected';
  rejection_reason?: string;
  is_available?: boolean;
  created_at: string;
  ag_user?: AgUser;
}

export interface AgRideRequest {
  id: string;
  passenger_id: string;
  origin_address: string;
  origin_lat: number;
  origin_lng: number;
  dest_address: string;
  dest_lat: number;
  dest_lng: number;
  offered_price: number;
  status: 'pending' | 'accepted' | 'in_progress' | 'completed' | 'cancelled';
  driver_id?: string;
  driver?: AgDriver & { ag_user?: AgUser };
  passenger?: AgUser;
  accepted_at?: string;
  completed_at?: string;
  created_at: string;
  updated_at: string;
}

export interface AgChatMessage {
  id: string;
  request_id: string;
  sender_ag_user_id: string;
  message: string;
  created_at: string;
}

export interface PlaceSuggestion {
  id:      string;
  name:    string;
  address: string;
  lat:     number;
  lng:     number;
}

export interface RouteInfo {
  distance_km:     number;
  duration_min:    number;
  suggested_price: number;
  geometry?:       any;
}

@Injectable({ providedIn: 'root' })
export class AndaGanaService {
  readonly supabase = getSupabaseClient();

  async getMyAgUser(): Promise<AgUser | null> {
    const { data: { user } } = await this.supabase.auth.getUser();
    if (!user) return null;
    const { data } = await this.supabase
      .from('ag_users')
      .select('*, driver:ag_drivers(*)')
      .eq('auth_user_id', user.id)
      .maybeSingle();
    return data as AgUser | null;
  }

  async getMainProfile(): Promise<{ role: string } | null> {
    const { data: { user } } = await this.supabase.auth.getUser();
    if (!user) return null;
    const { data } = await this.supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle();
    return data;
  }

  /** Genera código de 6 dígitos, lo guarda en BD y envía SMS via Twilio. Retorna el código. */
  async sendVerificationCode(phone: string): Promise<string> {
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    await this.supabase.from('ag_phone_verifications').insert({ phone, code, expires_at: expiresAt });
    // Send real SMS via Twilio (fire and forget — code is always stored in DB as backup)
    this.sendSmsCode(phone, code);
    return code;
  }

  async verifyCode(phone: string, code: string): Promise<boolean> {
    const { data } = await this.supabase
      .from('ag_phone_verifications')
      .select('id')
      .eq('phone', phone)
      .eq('code', code)
      .eq('used', false)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!data) return false;
    await this.supabase.from('ag_phone_verifications').update({ used: true }).eq('id', data.id);
    return true;
  }

  async registerUser(
    role: 'passenger' | 'driver',
    fullName: string,
    phone: string,
    extra?: {
      email?: string;
      city?: string;
      avatarUrl?: string;
      emergencyPhone?: string;
      identityDocUrl?: string;
    }
  ): Promise<AgUser | null> {
    const { data: { user } } = await this.supabase.auth.getUser();
    if (!user) return null;
    const row: Record<string, any> = {
      auth_user_id: user.id,
      full_name: fullName,
      phone,
      phone_verified: true,
      role,
    };
    if (extra?.email)         row['email']                   = extra.email;
    if (extra?.city)          row['city']                    = extra.city;
    if (extra?.avatarUrl)     row['avatar_url']              = extra.avatarUrl;
    if (extra?.emergencyPhone) row['emergency_contact_phone'] = extra.emergencyPhone;
    if (extra?.identityDocUrl) row['selfie_url']             = extra.identityDocUrl;

    const { data, error } = await this.supabase
      .from('ag_users')
      .insert(row)
      .select()
      .single();
    return error ? null : data as AgUser;
  }

  async uploadPassengerDoc(file: File, userId: string, docType: 'avatar' | 'identity'): Promise<string | null> {
    const ext = file.name.split('.').pop();
    const path = `${userId}/${docType}-${Date.now()}.${ext}`;
    const { data, error } = await this.supabase.storage
      .from('ag-drivers')
      .upload(path, file, { upsert: true });
    if (error) return null;
    const { data: urlData } = this.supabase.storage.from('ag-drivers').getPublicUrl(data.path);
    return urlData.publicUrl;
  }

  async saveDriverData(agUserId: string, d: {
    licenseNumber: string; vehiclePlate: string; vehicleBrand: string;
    vehicleModel: string; vehicleYear?: number; soatExpiry?: string;
    licensePhotoUrl?: string; vehiclePhotoUrl?: string; soatPhotoUrl?: string;
  }): Promise<boolean> {
    const { error } = await this.supabase.from('ag_drivers').insert({
      ag_user_id: agUserId,
      license_number: d.licenseNumber,
      vehicle_plate: d.vehiclePlate,
      vehicle_brand: d.vehicleBrand,
      vehicle_model: d.vehicleModel,
      vehicle_year: d.vehicleYear || null,
      soat_expiry: d.soatExpiry || null,
      license_photo_url: d.licensePhotoUrl || null,
      vehicle_photo_url: d.vehiclePhotoUrl || null,
      soat_photo_url: d.soatPhotoUrl || null,
    });
    return !error;
  }

  async uploadDriverDoc(file: File, userId: string, docType: string): Promise<string | null> {
    const ext = file.name.split('.').pop();
    const path = `${userId}/${docType}-${Date.now()}.${ext}`;
    const { data, error } = await this.supabase.storage
      .from('ag-drivers')
      .upload(path, file, { upsert: true });
    if (error) return null;
    const { data: urlData } = this.supabase.storage.from('ag-drivers').getPublicUrl(data.path);
    return urlData.publicUrl;
  }

  async getPendingDrivers(): Promise<AgDriver[]> {
    const { data } = await this.supabase
      .from('ag_drivers')
      .select('*, ag_user:ag_users(*)')
      .eq('status', 'pending')
      .order('created_at', { ascending: true });
    return (data || []) as AgDriver[];
  }

  async getAllDrivers(): Promise<AgDriver[]> {
    const { data } = await this.supabase
      .from('ag_drivers')
      .select('*, ag_user:ag_users(*)')
      .order('created_at', { ascending: false });
    return (data || []) as AgDriver[];
  }

  async approveDriver(driverId: string): Promise<boolean> {
    const { data: { user } } = await this.supabase.auth.getUser();
    if (!user) return false;
    const { error } = await this.supabase.from('ag_drivers').update({
      status: 'approved',
      reviewed_at: new Date().toISOString(),
      reviewed_by: user.id,
    }).eq('id', driverId);
    return !error;
  }

  async rejectDriver(driverId: string, reason: string): Promise<boolean> {
    const { data: { user } } = await this.supabase.auth.getUser();
    if (!user) return false;
    const { error } = await this.supabase.from('ag_drivers').update({
      status: 'rejected',
      rejection_reason: reason,
      reviewed_at: new Date().toISOString(),
      reviewed_by: user.id,
    }).eq('id', driverId);
    return !error;
  }

  /** Registra un viaje completado con comisión del 15% */
  async registerTrip(driverId: string, data: {
    origin: string; destination: string; totalAmount: number;
    passengerName?: string; distanceKm?: number; durationMinutes?: number;
  }): Promise<AgTrip | null> {
    const commission = parseFloat((data.totalAmount * 0.15).toFixed(2));
    const earnings   = parseFloat((data.totalAmount * 0.85).toFixed(2));
    const { data: trip, error } = await this.supabase.from('ag_trips').insert({
      driver_id: driverId,
      origin: data.origin,
      destination: data.destination,
      total_amount: data.totalAmount,
      platform_commission: commission,
      driver_earnings: earnings,
      passenger_name: data.passengerName || null,
      distance_km: data.distanceKm || null,
      duration_minutes: data.durationMinutes || null,
      status: 'completed',
    }).select().single();
    return error ? null : trip as AgTrip;
  }

  async getMyTrips(driverId: string, from?: string): Promise<AgTrip[]> {
    let q = this.supabase.from('ag_trips').select('*')
      .eq('driver_id', driverId)
      .eq('status', 'completed')
      .order('trip_date', { ascending: false });
    if (from) q = q.gte('trip_date', from);
    const { data } = await q;
    return (data || []) as AgTrip[];
  }

  async getAdminTripStats(): Promise<{
    totalTrips: number; totalCharged: number;
    totalCommission: number; totalDriverEarnings: number;
  }> {
    const { data } = await this.supabase.from('ag_trips').select('total_amount,platform_commission,driver_earnings').eq('status','completed');
    const trips = data || [];
    return {
      totalTrips: trips.length,
      totalCharged: trips.reduce((s, t) => s + Number(t.total_amount), 0),
      totalCommission: trips.reduce((s, t) => s + Number(t.platform_commission), 0),
      totalDriverEarnings: trips.reduce((s, t) => s + Number(t.driver_earnings), 0),
    };
  }

  async getDriverStats(): Promise<{ pending: number; approved: number; rejected: number; total: number }> {
    const { data } = await this.supabase.from('ag_drivers').select('status');
    const drivers = data || [];
    return {
      pending: drivers.filter(d => d.status === 'pending').length,
      approved: drivers.filter(d => d.status === 'approved').length,
      rejected: drivers.filter(d => d.status === 'rejected').length,
      total: drivers.length,
    };
  }

  // ─────────────────────────────────────────────────────────────
  // PASSENGER FLOW
  // ─────────────────────────────────────────────────────────────

  async createRideRequest(passengerId: string, data: {
    originAddress: string;
    originLat: number;
    originLng: number;
    destAddress: string;
    destLat: number;
    destLng: number;
    offeredPrice: number;
  }): Promise<AgRideRequest | null> {
    const { data: req, error } = await this.supabase
      .from('ag_ride_requests')
      .insert({
        passenger_id: passengerId,
        origin_address: data.originAddress,
        origin_lat: data.originLat,
        origin_lng: data.originLng,
        dest_address: data.destAddress,
        dest_lat: data.destLat,
        dest_lng: data.destLng,
        offered_price: data.offeredPrice,
        status: 'pending',
      })
      .select()
      .single();
    return error ? null : req as AgRideRequest;
  }

  async cancelRideRequest(id: string): Promise<void> {
    await this.supabase
      .from('ag_ride_requests')
      .update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
      .eq('id', id);
  }

  async getActiveRideRequest(passengerId: string): Promise<AgRideRequest | null> {
    const { data } = await this.supabase
      .from('ag_ride_requests')
      .select('*, driver:ag_drivers(*, ag_user:ag_users(*))')
      .eq('passenger_id', passengerId)
      .in('status', ['pending', 'accepted', 'in_progress'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    return data as AgRideRequest | null;
  }

  subscribeToRideRequest(id: string, cb: (req: AgRideRequest) => void): any {
    const channel = this.supabase
      .channel(`ride_request_${id}`)
      .on(
        'postgres_changes' as any,
        {
          event: '*',
          schema: 'public',
          table: 'ag_ride_requests',
          filter: `id=eq.${id}`,
        },
        async (payload: any) => {
          // Re-fetch with driver join on every change
          const { data } = await this.supabase
            .from('ag_ride_requests')
            .select('*, driver:ag_drivers(*, ag_user:ag_users(*))')
            .eq('id', id)
            .maybeSingle();
          if (data) cb(data as AgRideRequest);
        }
      )
      .subscribe();
    return channel;
  }

  async getChatMessages(requestId: string): Promise<AgChatMessage[]> {
    const { data } = await this.supabase
      .from('ag_chat_messages')
      .select('*')
      .eq('request_id', requestId)
      .order('created_at', { ascending: true });
    return (data || []) as AgChatMessage[];
  }

  async sendChatMessage(requestId: string, senderAgUserId: string, message: string): Promise<void> {
    await this.supabase.from('ag_chat_messages').insert({
      request_id: requestId,
      sender_ag_user_id: senderAgUserId,
      message,
    });
  }

  subscribeToChat(requestId: string, cb: (msg: AgChatMessage) => void): any {
    const channel = this.supabase
      .channel(`chat_${requestId}`)
      .on(
        'postgres_changes' as any,
        {
          event: 'INSERT',
          schema: 'public',
          table: 'ag_chat_messages',
          filter: `request_id=eq.${requestId}`,
        },
        (payload: any) => {
          if (payload.new) cb(payload.new as AgChatMessage);
        }
      )
      .subscribe();
    return channel;
  }

  async submitRating(
    requestId: string,
    passengerId: string,
    driverId: string,
    stars: number,
    comment: string
  ): Promise<boolean> {
    const { error } = await this.supabase
      .from('ag_ratings')
      .upsert({
        request_id: requestId,
        passenger_id: passengerId,
        driver_id: driverId,
        stars,
        comment: comment || null,
      }, { onConflict: 'request_id' });
    return !error;
  }

  async getDriverAverageRating(driverId: string): Promise<number> {
    const { data } = await this.supabase
      .from('ag_ratings')
      .select('stars')
      .eq('driver_id', driverId);
    const rows = data || [];
    if (rows.length === 0) return 0;
    const avg = rows.reduce((s, r) => s + Number(r.stars), 0) / rows.length;
    return Math.round(avg * 10) / 10;
  }

  // ─────────────────────────────────────────────────────────────
  // DRIVER FLOW
  // ─────────────────────────────────────────────────────────────

  async setDriverAvailability(driverId: string, available: boolean): Promise<void> {
    await this.supabase
      .from('ag_drivers')
      .update({ is_available: available })
      .eq('id', driverId);
  }

  async getPendingRideRequests(): Promise<AgRideRequest[]> {
    const { data } = await this.supabase
      .from('ag_ride_requests')
      .select('*, passenger:ag_users!ag_ride_requests_passenger_id_fkey(*)')
      .eq('status', 'pending')
      .order('created_at', { ascending: false });
    return (data || []) as AgRideRequest[];
  }

  async acceptRideRequest(requestId: string, driverId: string): Promise<boolean> {
    const { error } = await this.supabase
      .from('ag_ride_requests')
      .update({
        status: 'accepted',
        driver_id: driverId,
        accepted_at: new Date().toISOString(),
      })
      .eq('id', requestId)
      .eq('status', 'pending');
    return !error;
  }

  async startTrip(requestId: string): Promise<boolean> {
    const { error } = await this.supabase
      .from('ag_ride_requests')
      .update({ status: 'in_progress' })
      .eq('id', requestId)
      .eq('status', 'accepted');
    return !error;
  }

  async completeRideRequest(requestId: string): Promise<boolean> {
    const { error } = await this.supabase
      .from('ag_ride_requests')
      .update({ status: 'completed', completed_at: new Date().toISOString() })
      .eq('id', requestId)
      .in('status', ['accepted', 'in_progress']);
    return !error;
  }

  async getDriverActiveRideRequest(driverId: string): Promise<AgRideRequest | null> {
    const { data } = await this.supabase
      .from('ag_ride_requests')
      .select('*, passenger:ag_users!ag_ride_requests_passenger_id_fkey(*)')
      .eq('driver_id', driverId)
      .in('status', ['accepted', 'in_progress'])
      .order('accepted_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    return data as AgRideRequest | null;
  }

  subscribeToNewRequests(cb: (req: AgRideRequest) => void): any {
    const channel = this.supabase
      .channel('ag_new_pending_requests')
      .on(
        'postgres_changes' as any,
        { event: 'INSERT', schema: 'public', table: 'ag_ride_requests' },
        async (payload: any) => {
          if (payload.new?.status !== 'pending') return;
          const { data } = await this.supabase
            .from('ag_ride_requests')
            .select('*, passenger:ag_users!ag_ride_requests_passenger_id_fkey(*)')
            .eq('id', payload.new.id)
            .maybeSingle();
          if (data) cb(data as AgRideRequest);
        }
      )
      .subscribe();
    return channel;
  }

  subscribeToDriverRide(requestId: string, cb: (req: AgRideRequest) => void): any {
    const channel = this.supabase
      .channel(`driver_ride_${requestId}`)
      .on(
        'postgres_changes' as any,
        {
          event: '*',
          schema: 'public',
          table: 'ag_ride_requests',
          filter: `id=eq.${requestId}`,
        },
        async () => {
          const { data } = await this.supabase
            .from('ag_ride_requests')
            .select('*, passenger:ag_users!ag_ride_requests_passenger_id_fkey(*)')
            .eq('id', requestId)
            .maybeSingle();
          if (data) cb(data as AgRideRequest);
        }
      )
      .subscribe();
    return channel;
  }

  async submitPassengerRating(
    requestId: string,
    driverId: string,
    passengerId: string,
    stars: number,
    comment: string
  ): Promise<boolean> {
    const { error } = await this.supabase
      .from('ag_passenger_ratings')
      .upsert(
        { request_id: requestId, driver_id: driverId, passenger_id: passengerId, stars, comment: comment || null },
        { onConflict: 'request_id' }
      );
    return !error;
  }

  // ─────────────────────────────────────────────────────────────
  // ADMIN PANEL
  // ─────────────────────────────────────────────────────────────

  async getAgAdminStats(): Promise<{
    tripsToday: number; revenueToday: number; revenueWeek: number; revenueMonth: number;
    totalDrivers: number; availableDrivers: number; pendingDrivers: number;
    totalPassengers: number; activeRides: number;
  }> {
    const now  = new Date();
    const tod  = new Date(now); tod.setHours(0, 0, 0, 0);
    const week = new Date(now); week.setDate(now.getDate() - 7);
    const mon  = new Date(now); mon.setDate(now.getDate() - 30);

    const [tripsRes, driversRes, passRes, activeRes] = await Promise.all([
      this.supabase.from('ag_trips').select('total_amount,trip_date').eq('status', 'completed'),
      this.supabase.from('ag_drivers').select('status,is_available'),
      this.supabase.from('ag_users').select('id').eq('role', 'passenger'),
      this.supabase.from('ag_ride_requests').select('id').in('status', ['pending', 'accepted', 'in_progress']),
    ]);

    const trips    = tripsRes.data || [];
    const drivers  = driversRes.data || [];
    const todIso   = tod.toISOString();
    const weekIso  = week.toISOString();
    const monIso   = mon.toISOString();

    return {
      tripsToday:       trips.filter(t => t.trip_date >= todIso).length,
      revenueToday:     trips.filter(t => t.trip_date >= todIso).reduce((s, t) => s + Number(t.total_amount), 0),
      revenueWeek:      trips.filter(t => t.trip_date >= weekIso).reduce((s, t) => s + Number(t.total_amount), 0),
      revenueMonth:     trips.filter(t => t.trip_date >= monIso).reduce((s, t) => s + Number(t.total_amount), 0),
      totalDrivers:     drivers.length,
      availableDrivers: drivers.filter(d => d.is_available).length,
      pendingDrivers:   drivers.filter(d => d.status === 'pending').length,
      totalPassengers:  (passRes.data || []).length,
      activeRides:      (activeRes.data || []).length,
    };
  }

  async getAgAllTrips(period: 'today' | 'week' | 'month' | 'all' = 'all'): Promise<any[]> {
    const now  = new Date();
    let   from = '';
    if (period === 'today') { const d = new Date(now); d.setHours(0,0,0,0); from = d.toISOString(); }
    if (period === 'week')  { const d = new Date(now); d.setDate(now.getDate()-7); from = d.toISOString(); }
    if (period === 'month') { const d = new Date(now); d.setDate(now.getDate()-30); from = d.toISOString(); }

    let q = this.supabase
      .from('ag_trips')
      .select('*, driver:ag_drivers(vehicle_plate,vehicle_brand,vehicle_model,ag_user:ag_users(full_name))')
      .eq('status', 'completed')
      .order('trip_date', { ascending: false });
    if (from) q = q.gte('trip_date', from);
    const { data } = await q;
    return data || [];
  }

  async getActiveRideRequests(): Promise<AgRideRequest[]> {
    const { data } = await this.supabase
      .from('ag_ride_requests')
      .select('*, passenger:ag_users!ag_ride_requests_passenger_id_fkey(*), driver:ag_drivers(vehicle_plate,vehicle_brand,ag_user:ag_users(full_name))')
      .in('status', ['pending', 'accepted', 'in_progress'])
      .order('created_at', { ascending: false });
    return (data || []) as AgRideRequest[];
  }

  async getAllAgUsers(): Promise<(AgUser & { is_blocked?: boolean; blocked_reason?: string })[]> {
    const { data } = await this.supabase
      .from('ag_users')
      .select('*, driver:ag_drivers(status,vehicle_plate,is_available)')
      .order('created_at', { ascending: false });
    return (data || []) as any[];
  }

  async blockAgUser(agUserId: string, blocked: boolean, reason?: string): Promise<boolean> {
    const { error } = await this.supabase
      .from('ag_users')
      .update({ is_blocked: blocked, blocked_reason: reason || null })
      .eq('id', agUserId);
    return !error;
  }

  async getCommissionRate(): Promise<number> {
    const { data } = await this.supabase
      .from('ag_config')
      .select('value')
      .eq('key', 'commission_rate')
      .maybeSingle();
    return data ? parseFloat(data.value) : 15;
  }

  async setCommissionRate(rate: number): Promise<boolean> {
    const { error } = await this.supabase
      .from('ag_config')
      .upsert({ key: 'commission_rate', value: rate.toString(), updated_at: new Date().toISOString() });
    return !error;
  }

  async reverseGeocode(lat: number, lng: number): Promise<string> {
    try {
      const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lng=${lng}`;
      const res = await fetch(url, {
        headers: { 'Accept-Language': 'es', 'User-Agent': 'AndaYGana/1.0' },
      });
      if (!res.ok) return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
      const json = await res.json();
      return json.display_name || `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    } catch {
      return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    }
  }

  async updateEmergencyContact(agUserId: string, name: string, phone: string): Promise<boolean> {
    const { error } = await this.supabase
      .from('ag_users')
      .update({ emergency_contact_name: name, emergency_contact_phone: phone })
      .eq('id', agUserId);
    return !error;
  }

  async uploadSelfie(agUserId: string, file: File): Promise<string | null> {
    const ext  = file.name.split('.').pop() || 'jpg';
    const path = `${agUserId}/selfie-${Date.now()}.${ext}`;
    const { data, error } = await this.supabase.storage
      .from('ag-selfies')
      .upload(path, file, { upsert: true });
    if (error) return null;
    const { data: urlData } = this.supabase.storage.from('ag-selfies').getPublicUrl(data.path);
    const url = urlData.publicUrl;
    await this.supabase.from('ag_users').update({ selfie_url: url, selfie_verified: false }).eq('id', agUserId);
    return url;
  }

  async triggerPanic(requestId: string, passengerId: string, driverId?: string, lat?: number, lng?: number): Promise<boolean> {
    const { error } = await this.supabase.from('ag_panic_alerts').insert({
      request_id:   requestId,
      passenger_id: passengerId,
      driver_id:    driverId || null,
      location_lat: lat || null,
      location_lng: lng || null,
    });
    return !error;
  }

  buildShareTripMessage(request: AgRideRequest): string {
    const driverName  = request.driver?.ag_user?.full_name ?? 'conductor';
    const plate       = request.driver?.vehicle_plate ?? '';
    const origin      = request.origin_address;
    const dest        = request.dest_address;
    const mapsLink    = `https://maps.google.com/?q=${request.dest_lat},${request.dest_lng}`;
    return encodeURIComponent(
      `🚗 Estoy en un viaje de Anda y Gana con ${driverName} (placa ${plate}).\n` +
      `📍 Origen: ${origin}\n` +
      `🏁 Destino: ${dest}\n` +
      `Mapa: ${mapsLink}`
    );
  }

  buildPanicMessage(request: AgRideRequest, passengerName: string): string {
    const driverName = request.driver?.ag_user?.full_name ?? 'desconocido';
    const plate      = request.driver?.vehicle_plate ?? '';
    const mapsLink   = `https://maps.google.com/?q=${request.dest_lat},${request.dest_lng}`;
    return encodeURIComponent(
      `🚨 ALERTA DE EMERGENCIA\n${passengerName} activó el botón de pánico.\n` +
      `Conductor: ${driverName} · Placa: ${plate}\n` +
      `Destino: ${request.dest_address}\n` +
      `📍 ${mapsLink}`
    );
  }

  async getPendingSelfieVerifications(): Promise<AgUser[]> {
    const { data } = await this.supabase
      .from('ag_users')
      .select('*')
      .not('selfie_url', 'is', null)
      .eq('selfie_verified', false)
      .order('created_at', { ascending: true });
    return (data || []) as AgUser[];
  }

  async approveSelfie(agUserId: string): Promise<boolean> {
    const { error } = await this.supabase
      .from('ag_users')
      .update({ selfie_verified: true, selfie_verified_at: new Date().toISOString() })
      .eq('id', agUserId);
    return !error;
  }

  async rejectSelfie(agUserId: string): Promise<boolean> {
    const { error } = await this.supabase
      .from('ag_users')
      .update({ selfie_url: null, selfie_verified: false })
      .eq('id', agUserId);
    return !error;
  }

  /** Conductores disponibles que tienen GPS registrado — para mostrar en el mapa del pasajero */
  async getAvailableDriversWithLocation(): Promise<{ lat: number; lng: number; plate: string }[]> {
    const { data } = await this.supabase
      .from('ag_driver_locations')
      .select('lat, lng, driver:ag_drivers!inner(vehicle_plate, status, is_available)');
    return (data || [])
      .filter((d: any) => d.driver?.status === 'approved' && d.driver?.is_available)
      .map((d: any) => ({ lat: d.lat, lng: d.lng, plate: d.driver?.vehicle_plate || '' }));
  }

  // ── Geocodificación directa con Nominatim (OpenStreetMap) — 100% gratis, sin token ──
  async searchPlaces(query: string, lat?: number, lng?: number): Promise<PlaceSuggestion[]> {
    if (!query.trim() || query.trim().length < 2) return [];
    try {
      // Sin countrycodes para permitir búsqueda global (país, ciudad, dirección)
      // Con viewbox+bounded=0 priorizamos resultados cercanos pero no excluimos nada
      let url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&addressdetails=1&limit=8&accept-language=es`;
      if (lat != null && lng != null) {
        const d = 2; // grados de proximidad
        url += `&viewbox=${lng - d},${lat + d},${lng + d},${lat - d}&bounded=0`;
      }
      // NOTA: No incluir 'User-Agent' custom — es cabecera prohibida en browsers
      const resp = await fetch(url);
      if (!resp.ok) return [];
      const data = await resp.json();
      return (data || []).map((f: any, i: number) => ({
        id:      `nom-${i}-${Date.now()}`,
        name:    f.name || f.display_name.split(',')[0],
        address: f.display_name,
        lat:     parseFloat(f.lat),
        lng:     parseFloat(f.lon),
      })) as PlaceSuggestion[];
    } catch {
      return [];
    }
  }

  // ── Cálculo de ruta con OSRM (Open Source Routing Machine) — 100% gratis, sin token ──
  async calculateRoute(
    origin: { lat: number; lng: number },
    dest:   { lat: number; lng: number }
  ): Promise<RouteInfo | null> {
    try {
      const coords = `${origin.lng},${origin.lat};${dest.lng},${dest.lat}`;
      const url = `https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson`;
      const resp = await fetch(url);
      if (!resp.ok) return null;
      const data = await resp.json();
      const route = data.routes?.[0];
      if (!route) return null;
      const distance_km   = Math.round((route.distance / 1000) * 10) / 10;
      const duration_min  = Math.round(route.duration / 60);
      const suggested_price = Math.max(5000, Math.round(distance_km * 1500 / 1000) * 1000);
      return { distance_km, duration_min, suggested_price, geometry: route.geometry };
    } catch {
      return null;
    }
  }

  // ── SMS via Edge Function (opcional) ──
  async sendSmsCode(phone: string, code: string): Promise<void> {
    try {
      const env = (await import('../../../environments/environment')).environment;
      const base = env.andaGana?.functionsBaseUrl ?? '';
      if (!base) return;
      await fetch(`${base}/ag-sms`, {
        method: 'POST',
        headers: {
          'Content-Type':  'application/json',
          'apikey':        env.supabase.anonKey,
          'Authorization': `Bearer ${env.supabase.anonKey}`,
        },
        body: JSON.stringify({ phone, code }),
      });
    } catch {
      // Fail silently — code is still stored in DB
    }
  }

  // ── Real-time GPS tracking via Supabase Realtime Broadcast ──
  async upsertDriverLocation(driverId: string, lat: number, lng: number, requestId?: string): Promise<void> {
    await this.supabase.from('ag_driver_locations').upsert({
      driver_id:  driverId,
      request_id: requestId || null,
      lat,
      lng,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'driver_id' });
  }

  broadcastDriverLocation(channel: any, lat: number, lng: number): void {
    channel.send({ type: 'broadcast', event: 'location', payload: { lat, lng } });
  }

  subscribeToDriverLocationChannel(
    driverId: string,
    onLocation: (lat: number, lng: number) => void
  ): any {
    const channel = this.supabase
      .channel(`driver-loc:${driverId}`)
      .on('broadcast', { event: 'location' }, ({ payload }: any) => {
        onLocation(payload.lat, payload.lng);
      })
      .subscribe();
    return channel;
  }

  createDriverBroadcastChannel(driverId: string): any {
    return this.supabase.channel(`driver-loc:${driverId}`).subscribe();
  }
}
