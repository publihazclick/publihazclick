import { Injectable, signal } from '@angular/core';
import { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseClient } from '../supabase.client';

/**
 * Tipo para resultado de upload
 */
export interface UploadResult {
  success: boolean;
  url?: string;
  path?: string;
  error?: string;
}

/**
 * Interfaz para archivo de storage
 */
export interface StorageFileData {
  name: string;
  id: string;
  updated_at: string;
  created_at: string;
  last_accessed_at: string;
  metadata: Record<string, any>;
}

/**
 * Servicio para manejar almacenamiento de imágenes en Supabase Storage
 */
@Injectable({
  providedIn: 'root'
})
export class StorageService {
  private readonly supabase: SupabaseClient;
  
  // Buckets de storage
  readonly PTC_ADS_BUCKET = 'ptc-ads';
  readonly BANNERS_BUCKET = 'banners';
  readonly PROFILES_BUCKET = 'profiles';
  
  // Estado de carga
  readonly uploading = signal(false);
  readonly uploadProgress = signal(0);
  
  constructor() {
    this.supabase = getSupabaseClient();
  }

  /**
   * Sube una imagen a Supabase Storage
   */
  async uploadImage(
    bucket: string, 
    file: File, 
    folder: string = ''
  ): Promise<UploadResult> {
    this.uploading.set(true);
    this.uploadProgress.set(0);
    
    try {
      // Generar nombre de archivo único
      const timestamp = Date.now();
      const randomStr = Math.random().toString(36).substring(7);
      const extension = file.name.split('.').pop() || 'jpg';
      const fileName = folder 
        ? `${folder}/${timestamp}-${randomStr}.${extension}`
        : `${timestamp}-${randomStr}.${extension}`;
      
      // Subir archivo
      const { data, error } = await this.supabase.storage
        .from(bucket)
        .upload(fileName, file, {
          cacheControl: '3600',
          upsert: false,
          contentType: file.type
      });

      if (error) {
        console.error('Error uploading to Supabase:', error);
        return {
          success: false,
          error: error.message
        };
      }

      // Obtener URL pública
      const { data: urlData } = this.supabase.storage
        .from(bucket)
        .getPublicUrl(fileName);

      this.uploading.set(false);
      this.uploadProgress.set(100);
      
      return {
        success: true,
        url: urlData.publicUrl,
        path: data.path
      };
    } catch (error: any) {
      console.error('Upload error:', error);
      this.uploading.set(false);
      return {
        success: false,
        error: error.message || 'Error al subir imagen'
      };
    }
  }

  /**
   * Sube imagen de anuncio PTC
   */
  async uploadPtcAdImage(file: File): Promise<UploadResult> {
    return this.uploadImage(this.PTC_ADS_BUCKET, file, 'ads');
  }

  /**
   * Sube imagen de banner
   */
  async uploadBannerImage(file: File): Promise<UploadResult> {
    return this.uploadImage(this.BANNERS_BUCKET, file, 'banners');
  }

  /**
   * Sube imagen de perfil
   */
  async uploadProfileImage(file: File): Promise<UploadResult> {
    return this.uploadImage(this.PROFILES_BUCKET, file, 'profiles');
  }

  /**
   * Elimina una imagen del storage
   */
  async deleteImage(bucket: string, path: string): Promise<boolean> {
    try {
      const { error } = await this.supabase.storage
        .from(bucket)
        .remove([path]);

      if (error) {
        console.error('Error deleting image:', error);
        return false;
      }
      return true;
    } catch (error) {
      console.error('Delete error:', error);
      return false;
    }
  }

  /**
   * Obtiene la URL pública de una imagen
   */
  getPublicUrl(bucket: string, path: string): string {
    const { data } = this.supabase.storage
      .from(bucket)
      .getPublicUrl(path);
    return data.publicUrl;
  }

  /**
   * Lista imágenes en un bucket
   */
  async listImages(bucket: string, folder?: string): Promise<StorageFileData[]> {
    try {
      const { data, error } = await this.supabase.storage
        .from(bucket)
        .list(folder || '', {
          limit: 100,
          offset: 0,
          sortBy: { column: 'name', order: 'desc' }
        });

      if (error) {
        console.error('Error listing images:', error);
        return [];
      }

      return data || [];
    } catch (error) {
      console.error('List error:', error);
      return [];
    }
  }

  /**
   * Verifica si el archivo es una imagen válida
   */
  isValidImage(file: File): boolean {
    const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];
    return validTypes.includes(file.type);
  }

  /**
   * Valida el tamaño del archivo (máx 5MB)
   */
  isValidSize(file: File, maxSizeMB: number = 5): boolean {
    const maxSize = maxSizeMB * 1024 * 1024;
    return file.size <= maxSize;
  }
}
