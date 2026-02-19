import { Injectable, inject, signal } from '@angular/core';
import {
  SupabaseClient,
  createClient
} from '@supabase/supabase-js';
import {
  Profile,
  Referral,
  UpdateProfileOptions,
  ReferralValidationResult,
  UserRole
} from '../models/profile.model';
import { environment } from '../../../environments/environment';

/**
 * Servicio para gestionar perfiles de usuario
 */
@Injectable({
  providedIn: 'root'
})
export class ProfileService {
  private readonly supabase: SupabaseClient;

  constructor() {
    this.supabase = createClient(
      environment.supabase.url,
      environment.supabase.anonKey
    );
  }

  private readonly _profile = signal<Profile | null>(null);
  private readonly _referrals = signal<Referral[]>([]);
  private readonly _loading = signal<boolean>(false);
  private readonly _error = signal<string | null>(null);

  readonly profile = this._profile.asReadonly();
  readonly referrals = this._referrals.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly error = this._error.asReadonly();

  /**
   * Obtener perfil del usuario actual
   */
  async getCurrentProfile(): Promise<Profile | null> {
    this._loading.set(true);
    this._error.set(null);

    try {
      const { data: { user } } = await this.supabase.auth.getUser();

      if (!user) {
        this._profile.set(null);
        return null;
      }

      const { data, error } = await this.supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      if (error) throw error;

      this._profile.set(data as Profile);
      return data as Profile;
    } catch (error: any) {
      this._error.set(error.message);
      return null;
    } finally {
      this._loading.set(false);
    }
  }

  /**
   * Obtener perfil por ID
   */
  async getProfileById(id: string): Promise<Profile | null> {
    this._loading.set(true);
    this._error.set(null);

    try {
      const { data, error } = await this.supabase
        .from('profiles')
        .select('*')
        .eq('id', id)
        .single();

      if (error) throw error;

      return data as Profile;
    } catch (error: any) {
      this._error.set(error.message);
      return null;
    } finally {
      this._loading.set(false);
    }
  }

  /**
   * Actualizar perfil del usuario
   */
  async updateProfile(options: UpdateProfileOptions): Promise<Profile | null> {
    this._loading.set(true);
    this._error.set(null);

    try {
      const { data: { user } } = await this.supabase.auth.getUser();

      if (!user) throw new Error('No hay usuario autenticado');

      const updates = {
        ...options,
        updated_at: new Date().toISOString()
      };

      const { data, error } = await this.supabase
        .from('profiles')
        .update(updates)
        .eq('id', user.id)
        .select()
        .single();

      if (error) throw error;

      this._profile.set(data as Profile);
      return data as Profile;
    } catch (error: any) {
      this._error.set(error.message);
      return null;
    } finally {
      this._loading.set(false);
    }
  }

  /**
   * Validar código de referido
   */
  async validateReferralCode(code: string): Promise<ReferralValidationResult> {
    try {
      // El nuevo formato es: username + 5 digitos + - + año (ej: juan12345-2025)
      // No convertimos a mayúsculas porque el código ya está en minúsculas
      const normalizedCode = code.trim();
      
      const { data, error } = await this.supabase
        .from('profiles')
        .select('id, username, is_active')
        .eq('referral_code', normalizedCode)
        .single();

      if (error || !data) {
        return { valid: false, error: 'Código de referido inválido' };
      }

      if (!data.is_active) {
        return { valid: false, error: 'El usuario referidor no está activo' };
      }

      return {
        valid: true,
        referrer_id: data.id,
        referrer_username: data.username
      };
    } catch (error: any) {
      return { valid: false, error: error.message };
    }
  }

  /**
   * Obtener referidos del usuario actual
   */
  async getMyReferrals(): Promise<Referral[]> {
    this._loading.set(true);
    this._error.set(null);

    try {
      const { data: { user } } = await this.supabase.auth.getUser();

      if (!user) return [];

      const { data, error } = await this.supabase
        .from('referrals')
        .select('*')
        .eq('referrer_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      this._referrals.set(data as Referral[]);
      return data as Referral[];
    } catch (error: any) {
      this._error.set(error.message);
      return [];
    } finally {
      this._loading.set(false);
    }
  }

  /**
   * Obtener cantidad de referidos activos
   */
  async getActiveReferralsCount(): Promise<number> {
    try {
      const { data: { user } } = await this.supabase.auth.getUser();

      if (!user) return 0;

      const { count, error } = await this.supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true })
        .eq('referred_by', user.id)
        .eq('is_active', true);

      if (error) throw error;

      return count || 0;
    } catch (error: any) {
      return 0;
    }
  }

  /**
   * Obtener todos los usuarios (solo admin)
   */
  async getAllProfiles(page = 1, limit = 20): Promise<Profile[]> {
    this._loading.set(true);
    this._error.set(null);

    try {
      const from = (page - 1) * limit;
      const to = from + limit - 1;

      const { data, error } = await this.supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false })
        .range(from, to);

      if (error) throw error;

      return data as Profile[];
    } catch (error: any) {
      this._error.set(error.message);
      return [];
    } finally {
      this._loading.set(false);
    }
  }

  /**
   * Activar/desactivar usuario (solo admin)
   */
  async setUserActive(userId: string, isActive: boolean): Promise<boolean> {
    this._loading.set(true);
    this._error.set(null);

    try {
      const { error } = await this.supabase
        .from('profiles')
        .update({ is_active: isActive, updated_at: new Date().toISOString() })
        .eq('id', userId);

      if (error) throw error;

      return true;
    } catch (error: any) {
      this._error.set(error.message);
      return false;
    } finally {
      this._loading.set(false);
    }
  }

  /**
   * Cambiar rol de usuario (solo admin)
   */
  async setUserRole(userId: string, role: UserRole): Promise<boolean> {
    this._loading.set(true);
    this._error.set(null);

    try {
      const { error } = await this.supabase
        .from('profiles')
        .update({ role, updated_at: new Date().toISOString() })
        .eq('id', userId);

      if (error) throw error;

      return true;
    } catch (error: any) {
      this._error.set(error.message);
      return false;
    } finally {
      this._loading.set(false);
    }
  }

  /**
   * Actualizar balance de usuario (solo admin o sistema)
   */
  async updateBalance(userId: string, amount: number, type: 'add' | 'subtract'): Promise<boolean> {
    try {
      const profile = await this.getProfileById(userId);
      if (!profile) return false;

      const newBalance = type === 'add'
        ? profile.balance + amount
        : profile.balance - amount;

      if (newBalance < 0) return false;

      const { error } = await this.supabase
        .from('profiles')
        .update({
          balance: newBalance,
          updated_at: new Date().toISOString()
        })
        .eq('id', userId);

      return !error;
    } catch (error: any) {
      this._error.set(error.message);
      return false;
    }
  }

  /**
   * Generar link de referido
   */
  getReferralLink(): string {
    const profile = this._profile();
    if (!profile) return '';

    return `${window.location.origin}/register/${profile.referral_code}`;
  }
}
