import { Injectable } from '@angular/core';
import { getSupabaseClient } from '../supabase.client';

export interface PaymentTestimonial {
  id: string;
  image_url: string;
  image_date: string;
  username: string;
  comment: string;
  phash: string;
  active: boolean;
  created_at: string;
}

export interface DuplicateCheckResult {
  isDuplicate: boolean;
  similarity: number;       // 0–100 (100 = idéntica)
  matchedImage?: string;    // URL de la imagen que hace match
  matchedUsername?: string;
  distance: number;         // bits distintos (0 = igual, 256 = opuesto)
}

// ─── Pool de nombres y comentarios ──────────────────────────────────────────

const USERNAMES = [
  'María J.', 'Carlos A.', 'Paola R.', 'Andrés M.', 'Laura V.',
  'Diego F.', 'Valentina G.', 'Sebastián H.', 'Natalia C.', 'Camilo T.',
  'Juliana O.', 'Felipe S.', 'Daniela B.', 'Mauricio L.', 'Catalina P.',
  'Jorge E.', 'Alejandra N.', 'Iván D.', 'Luisa Q.', 'Esteban W.',
  'Adriana K.', 'Hernán Z.', 'Pilar X.', 'Ricardo U.', 'Marcela Y.',
  'Gustavo I.', 'Ángela R.', 'Fabián M.', 'Verónica C.', 'William T.',
];

const COMMENTS = [
  '¡Por fin llegó mi pago! Muchas gracias a Publihazclick, llevo 3 meses recibiendo mis ganancias puntualmente 🙌',
  'Nunca pensé que ver anuncios me iba a generar este ingreso. Acabo de recibir mi retiro sin problemas ✅',
  'Excelente plataforma, segundo mes consecutivo recibiendo mi pago. Lo recomiendo al 100% 💸',
  'Hoy me llegó el pago y quiero que todos vean que esto sí funciona. ¡Inscríbanse! 🎉',
  'Llevo 6 meses en Publihazclick y siempre me pagan a tiempo. Esta semana fue mi mejor retiro 💰',
  'No lo podía creer pero aquí está mi comprobante. Gracias por el pago puntual como siempre 🙏',
  '¡Woooo! Ya recibí mi pago de esta semana. Esto es real, no hay trampa 🔥',
  'Tercer retiro del mes y todo perfecto. Publihazclick cumple siempre sus compromisos 😊',
  'Empecé con dudas pero los resultados hablan solos. Pago recibido y muy contento/a 👏',
  'Si estás pensando en unirte, este es el comprobante de que sí pagan. ¡Vale la pena! 💯',
  'Mi familia no me creía pero ya le mostré este comprobante. Publihazclick es legítimo ❤️',
  'Cuarto mes seguido recibiendo mi dinero sin retrasos. La mejor plataforma que he encontrado 🌟',
  'Gracias al equipo de Publihazclick por el pago de hoy. Siempre tan puntuales 🤝',
  'Esto cambia la vida, en serio. Ver anuncios y generar ingresos reales. ¡Acabo de cobrar! 🎊',
  'Mi segundo retiro ya en cuenta. Los que no se han inscrito se están perdiendo de algo bueno 💎',
  'Pago confirmado. Llevo más de 4 meses y nunca me han fallado. Totalmente recomendado ✨',
  '¡Listo! Llegó mi retiro. Cada semana es una alegría ver ese dinero llegar a mi cuenta 😄',
  'Ya suman varios pagos recibidos. Publihazclick es lo mejor que me ha pasado este año 🏆',
  'Comprobante de pago directo. Sin mentiras, sin trucos. Esto sí funciona de verdad 👍',
  'Hoy celebro porque recibí mi pago más alto hasta ahora. Gracias Publihazclick por todo 🥳',
  'Me recomendaron esta plataforma y pensé que era cuento, pero aquí está mi pago real 😮',
  'Cinco meses en la plataforma y mi pago siempre llega a tiempo. Sigan así 💪',
  'Les comparto mi pago de esta semana para que vean que Publihazclick sí paga 🎯',
  'Increíble cómo un pequeño esfuerzo diario genera estos resultados. ¡Pago recibido! 🌈',
  'Gracias infinitas. Este ingreso extra me ha ayudado muchísimo. Pago puntual como siempre 🙌',
  'Mi tercera semana cobrando y cada vez mejor. No paren de crecer Publihazclick 🚀',
  'Aquí el comprobante para los incrédulos. La plataforma paga, sin excusas ✔️',
  'Inicio de semana con buen pie gracias a mi pago de Publihazclick. Así da gusto trabajar 😎',
  '¡Ya llegó! Comprobante de retiro exitoso. Esta comunidad es lo mejor 🤩',
  'Llevo un año recibiendo pagos puntuales. La confianza que les tengo es total 💙',
];

// ─── Hash Perceptual (aHash 16×16 = 256 bits) ───────────────────────────────
// Algoritmo: redimensionar a 16×16, escala de grises, media, bit = pixel > media
// Resultado: string hex de 64 caracteres (256 bits)

const HASH_SIZE = 16; // 16×16 = 256 bits

/**
 * Calcula el hash perceptual de un File de imagen.
 * Usa HTML Canvas para procesar la imagen en el navegador.
 */
export async function computeImageHash(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = HASH_SIZE;
        canvas.height = HASH_SIZE;
        const ctx = canvas.getContext('2d')!;

        // Dibujar imagen escalada a 16×16
        ctx.drawImage(img, 0, 0, HASH_SIZE, HASH_SIZE);
        const pixels = ctx.getImageData(0, 0, HASH_SIZE, HASH_SIZE).data;

        // Convertir a escala de grises
        const grays: number[] = [];
        for (let i = 0; i < pixels.length; i += 4) {
          grays.push(0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2]);
        }

        // Media de todos los grises
        const mean = grays.reduce((a, b) => a + b, 0) / grays.length;

        // Generar bits: 1 si > media, 0 si <=
        let bits = '';
        for (const g of grays) {
          bits += g > mean ? '1' : '0';
        }

        // Convertir bits a hex (cada 4 bits = 1 nibble hex)
        let hex = '';
        for (let i = 0; i < bits.length; i += 4) {
          hex += parseInt(bits.slice(i, i + 4), 2).toString(16);
        }

        URL.revokeObjectURL(url);
        resolve(hex);
      } catch (err) {
        URL.revokeObjectURL(url);
        reject(err);
      }
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('No se pudo cargar la imagen'));
    };

    img.src = url;
  });
}

/**
 * Distancia de Hamming entre dos hashes hex.
 * Devuelve el número de bits distintos (0 = idénticos, 256 = opuestos).
 */
export function hammingDistance(a: string, b: string): number {
  if (a.length !== b.length) return 256;
  let dist = 0;
  for (let i = 0; i < a.length; i++) {
    const xor = parseInt(a[i], 16) ^ parseInt(b[i], 16);
    // Contar bits en 1 del nibble (popcount)
    dist += (xor & 1) + ((xor >> 1) & 1) + ((xor >> 2) & 1) + ((xor >> 3) & 1);
  }
  return dist;
}

// Umbral: ≤ 15 bits distintos de 256 → duplicado (≈6%)
// Imágenes del mismo captura de pantalla: 0–5 bits
// Imágenes muy parecidas (mismo app, diferente monto): 10–20 bits
// Imágenes distintas: > 40 bits
const DUPLICATE_THRESHOLD = 15;

// ─── Servicio ─────────────────────────────────────────────────────────────

@Injectable({ providedIn: 'root' })
export class TestimonialsService {
  private readonly client = getSupabaseClient();

  // Cache de hashes existentes para no re-consultar en cada imagen
  private cachedHashes: Array<{ id: string; phash: string; image_url: string; username: string }> = [];
  private cacheLoaded = false;

  async loadHashCache(): Promise<void> {
    const { data } = await this.client
      .from('payment_testimonials')
      .select('id, phash, image_url, username');
    this.cachedHashes = (data ?? []).filter(r => r.phash && r.phash.length === 64);
    this.cacheLoaded = true;
  }

  /** Compara el hash de una imagen contra todos los existentes en la DB. */
  async checkDuplicate(file: File): Promise<DuplicateCheckResult> {
    if (!this.cacheLoaded) await this.loadHashCache();

    const newHash = await computeImageHash(file);

    let minDistance = 256;
    let bestMatch: typeof this.cachedHashes[0] | null = null;

    for (const existing of this.cachedHashes) {
      const d = hammingDistance(newHash, existing.phash);
      if (d < minDistance) {
        minDistance = d;
        bestMatch = existing;
      }
    }

    const isDuplicate = minDistance <= DUPLICATE_THRESHOLD;
    const similarity = Math.round(((256 - minDistance) / 256) * 100);

    return {
      isDuplicate,
      similarity,
      distance: minDistance,
      matchedImage: bestMatch?.image_url,
      matchedUsername: bestMatch?.username,
    };
  }

  async getActive(): Promise<PaymentTestimonial[]> {
    const { data, error } = await this.client
      .from('payment_testimonials')
      .select('*')
      .eq('active', true)
      .order('image_date', { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  }

  async getAll(): Promise<PaymentTestimonial[]> {
    const { data, error } = await this.client
      .from('payment_testimonials')
      .select('*')
      .order('image_date', { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  }

  async uploadAndCreate(file: File, index: number, phash: string): Promise<PaymentTestimonial> {
    const ext = file.name.split('.').pop() ?? 'jpg';
    const path = `proofs/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;

    const { error: uploadError } = await this.client.storage
      .from('testimonials')
      .upload(path, file, { contentType: file.type, upsert: false });

    if (uploadError) throw new Error(uploadError.message);

    const { data: { publicUrl } } = this.client.storage
      .from('testimonials')
      .getPublicUrl(path);

    const imageDate = new Date(file.lastModified).toISOString();

    const nameIdx    = (index * 7  + file.name.charCodeAt(0)) % USERNAMES.length;
    const commentIdx = (index * 11 + file.name.charCodeAt(file.name.length - 2 || 0)) % COMMENTS.length;

    const { data, error } = await this.client
      .from('payment_testimonials')
      .insert({
        image_url:  publicUrl,
        image_date: imageDate,
        username:   USERNAMES[nameIdx],
        comment:    COMMENTS[commentIdx],
        phash,
        active: true,
      })
      .select()
      .single();

    if (error) throw new Error(error.message);

    // Actualizar cache local con el nuevo registro
    this.cachedHashes.push({ id: data.id, phash, image_url: publicUrl, username: data.username });

    return data;
  }

  async toggleActive(id: string, active: boolean): Promise<void> {
    const { error } = await this.client
      .from('payment_testimonials')
      .update({ active })
      .eq('id', id);
    if (error) throw new Error(error.message);
  }

  async delete(id: string): Promise<void> {
    const { error } = await this.client
      .from('payment_testimonials')
      .delete()
      .eq('id', id);
    if (error) throw new Error(error.message);
    this.cachedHashes = this.cachedHashes.filter(h => h.id !== id);
  }

  /** Invalida el cache para forzar re-carga */
  invalidateCache(): void {
    this.cacheLoaded = false;
    this.cachedHashes = [];
  }
}
