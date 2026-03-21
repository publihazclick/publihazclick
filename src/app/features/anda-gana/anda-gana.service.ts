import { Injectable } from '@angular/core';
import { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseClient } from '../../core/supabase.client';

export interface PassengerFormData {
  fullName: string;
  birthDate: string;
  city: string;
  idNumber: string;
  phone: string;
  email: string;
  password: string;
  emergencyName: string;
  emergencyPhone: string;
  selfieFile?: File;
}

export interface DriverFormData {
  // Personal
  fullName: string;
  birthDate: string;
  city: string;
  idNumber: string;
  phone: string;
  email: string;
  password: string;
  emergencyName: string;
  emergencyPhone: string;
  // License
  licenseNumber: string;
  licenseCategory: string;
  licenseExpiry: string;
  // Vehicle
  plate: string;
  vehicleType: string;
  vehicleBrand: string;
  vehicleModel: string;
  vehicleYear: string;
  vehicleColor: string;
  // Files
  files: Record<string, File>;
}

export interface AgRegistrationResult {
  success: boolean;
  error?: string;
}

@Injectable({ providedIn: 'root' })
export class AndaGanaService {
  private readonly supabase: SupabaseClient = getSupabaseClient();

  private async uploadFile(bucket: string, folder: string, file: File): Promise<string | null> {
    const ext = file.name.split('.').pop() ?? 'jpg';
    const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const { error } = await this.supabase.storage.from(bucket).upload(path, file, {
      cacheControl: '3600',
      upsert: false,
      contentType: file.type,
    });
    if (error) return null;
    const { data } = this.supabase.storage.from(bucket).getPublicUrl(path);
    return data.publicUrl;
  }

  async registerPassenger(form: PassengerFormData): Promise<AgRegistrationResult> {
    try {
      // 1. Create auth account
      const { data: authData, error: authError } = await this.supabase.auth.signUp({
        email: form.email,
        password: form.password,
        options: { data: { ag_role: 'passenger', full_name: form.fullName } },
      });

      if (authError) {
        if (authError.message.toLowerCase().includes('already registered')) {
          return { success: false, error: 'Ya existe una cuenta con ese correo.' };
        }
        return { success: false, error: authError.message };
      }

      const authUserId = authData.user?.id;
      if (!authUserId) return { success: false, error: 'No se pudo crear la cuenta. Intenta de nuevo.' };

      // 2. Upload selfie if provided
      let selfieUrl: string | null = null;
      if (form.selfieFile) {
        selfieUrl = await this.uploadFile('ag-passengers', authUserId, form.selfieFile);
      }

      // 3. Insert into ag_users
      const { error: dbError } = await this.supabase.from('ag_users').insert({
        auth_user_id: authUserId,
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

      if (dbError) return { success: false, error: 'Error al guardar tu perfil: ' + dbError.message };

      return { success: true };
    } catch (e: any) {
      return { success: false, error: e?.message ?? 'Error inesperado.' };
    }
  }

  async registerDriver(form: DriverFormData): Promise<AgRegistrationResult> {
    try {
      // 1. Create auth account
      const { data: authData, error: authError } = await this.supabase.auth.signUp({
        email: form.email,
        password: form.password,
        options: { data: { ag_role: 'driver', full_name: form.fullName } },
      });

      if (authError) {
        if (authError.message.toLowerCase().includes('already registered')) {
          return { success: false, error: 'Ya existe una cuenta con ese correo.' };
        }
        return { success: false, error: authError.message };
      }

      const authUserId = authData.user?.id;
      if (!authUserId) return { success: false, error: 'No se pudo crear la cuenta. Intenta de nuevo.' };

      // 2. Upload all documents in parallel
      const uploadTasks = Object.entries(form.files).map(async ([key, file]) => {
        const url = await this.uploadFile('ag-drivers', authUserId, file);
        return [key, url] as [string, string | null];
      });
      const uploadResults = await Promise.all(uploadTasks);
      const documents: Record<string, string> = {};
      for (const [key, url] of uploadResults) {
        if (url) documents[key] = url;
      }

      // 3. Insert into ag_users
      const { data: agUser, error: userError } = await this.supabase
        .from('ag_users')
        .insert({
          auth_user_id: authUserId,
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

      if (userError) return { success: false, error: 'Error al guardar tu perfil: ' + userError.message };

      // 4. Insert into ag_drivers
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

      if (driverError) return { success: false, error: 'Error al guardar datos del vehículo: ' + driverError.message };

      return { success: true };
    } catch (e: any) {
      return { success: false, error: e?.message ?? 'Error inesperado.' };
    }
  }
}
