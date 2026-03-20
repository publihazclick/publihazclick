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
  avatar_url?: string;
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
  created_at: string;
  ag_user?: AgUser;
}

@Injectable({ providedIn: 'root' })
export class AndaGanaService {
  private readonly supabase = getSupabaseClient();

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

  /** Genera código de 6 dígitos y lo guarda en BD. Retorna el código para mostrarlo en pantalla. */
  async sendVerificationCode(phone: string): Promise<string> {
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    await this.supabase.from('ag_phone_verifications').insert({ phone, code, expires_at: expiresAt });
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

  async registerUser(role: 'passenger' | 'driver', fullName: string, phone: string): Promise<AgUser | null> {
    const { data: { user } } = await this.supabase.auth.getUser();
    if (!user) return null;
    const { data, error } = await this.supabase
      .from('ag_users')
      .insert({ auth_user_id: user.id, full_name: fullName, phone, phone_verified: true, role })
      .select()
      .single();
    return error ? null : data as AgUser;
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
}
