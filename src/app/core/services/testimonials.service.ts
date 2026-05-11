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
  // Nombres completos estilo colombiano
  'Andrea Marcela Torres', 'Luis Felipe García', 'Tatiana Ospina', 'Brayan Morales',
  'Yessica Ramírez', 'Jonatan Herrera', 'Paola Andrea Ríos', 'Steeven Muñoz',
  'Leidy Johana Cruz', 'Dairo Castellanos', 'Xiomara Pedraza', 'Wilmar Acevedo',
  'Nathaly Bermúdez', 'Jhon Jairo López', 'Karen Sofía Vega', 'Elkin Patiño',
  // Nombre + inicial apellido
  'Camilo V.', 'Juli R.', 'Pipe F.', 'Santi G.', 'Mafe L.', 'Dani B.',
  'Caro M.', 'Fer T.', 'Ale C.', 'Nata P.', 'Sebas H.', 'Vale O.',
  // Estilo usuario/apodo
  'juanchi_bogota', 'andres.movil', 'pipe_cali09', 'mary_oficial',
  'carlos2024col', 'laura_emprende', 'yessi.pays', 'miguelito_ptc',
  'sofi.trabaja', 'tato_gana', 'kikeguerrero', 'isabelitacol',
  'jota_retiros', 'cami_cash', 'natalia_real', 'dairo_inversiones',
  // Solo nombre (común en redes)
  'Yurany', 'Bladimir', 'Karent', 'Ferney', 'Yadira', 'Duvan',
  'Marisol', 'Kleiver', 'Lorena', 'Sneider', 'Vanessa', 'Robinsón',
];

const COMMENTS = [
  // Cortos / directos
  'Llegó. Sin más que decir. ✅',
  'Pago recibido. Primera vez y funcionó perfecto.',
  'Real. Sin trucos. Aquí está el comprobante 🔥',
  'Cobré hoy. No lo podía creer hasta que vi la notificación.',
  'Mi retiro en cuenta. Esto sí paga.',
  // Con contexto de tiempo
  'Llevo 3 semanas y ya van 2 retiros exitosos. Esto es constante 💸',
  'Primer mes completo y el pago llegó puntual. Seguiré así 💪',
  'Seis meses activa en la plataforma y jamás me han fallado. Récord personal este retiro 🏆',
  'Cuatro pagos recibidos desde que me uní. Cada vez mejor.',
  'Un año en Publihazclick. Doce meses, doce pagos. Eso lo dice todo.',
  // Reacción emocional / familiar
  'Mi mamá no me creía, le mostré esto y ya me está preguntando cómo se registra 😂',
  'Le dije a mi novio que esto era real y hoy le demostré con el comprobante. Jajaja 🎉',
  'Dudé mucho antes de unirme. Hoy me arrepiento de no haberlo hecho antes.',
  'Mi hermano me recomendó esto hace 2 meses. Ya recuperé lo que invertí y sigo sumando.',
  'Pensé que era una de tantas páginas falsas. Error mío. Esto paga y punto.',
  // Factual / frío
  'Retiro procesado. Sin retrasos.',
  'Comprobante verificado. Plataforma confiable.',
  'Pago #7. Todo correcto como siempre.',
  'Tercer retiro del mes. Proceso rápido.',
  'Acreditado hoy. Sin problema alguno.',
  // Recomendación activa
  'Si estás dudando, este screenshot es tu respuesta. Únete ya 👆',
  'Los que no están en Publihazclick se están perdiendo ingresos reales. Aquí la prueba.',
  'Comparto esto para que vean que sí funciona. No hay excusa para no intentarlo.',
  'Para los que preguntan si pagan: sí. Aquí está mi comprobante de hoy.',
  'Recomendado al 100%. No es cuento. Este es mi pago de esta semana 🙌',
  // Detalle de experiencia
  'Empecé solo viendo 3 o 4 anuncios al día y ya genero un ingreso extra que me ayuda bastante.',
  'Lo bueno de Publihazclick es que no te piden nada raro. Ves anuncios, acumulas, retiras.',
  'El proceso de retiro es rapidísimo. Lo solicité ayer y hoy ya estaba en mi cuenta.',
  'Me gustó que desde el primer día vi resultados. Sin esperas absurdas.',
  'Fácil de usar, pagos rápidos y sin letras pequeñas. Eso es lo que más valoro.',
  // Cantidad / logro
  'Este fue mi retiro más alto hasta ahora. Voy creciendo cada semana 📈',
  'Primer retiro pequeño pero importante. La constancia va sumando.',
  'Ya superé lo que ganaba haciendo cosas extra los fines de semana. Impresionante.',
  'No es para hacerse millonario, pero como ingreso complementario es excelente.',
  // Tono motivacional
  '¿Ves este comprobante? Tú también puedes tenerlo. Solo necesitas constancia.',
  'Cada día que no te unes es un día de ingresos perdidos. Así de simple.',
  'Empecé con cero experiencia y aquí estoy, retirando. Todo el mundo puede.',
  'La clave es ser constante. El pago llega solo.',
  // Tono casual / cotidiano
  'Che, llegó mi pago. Justo a tiempo para el mercado de la semana 😄',
  'Usé las ganancias de este mes para pagar el internet. Auto sostenible casi 😅',
  'Aburrida en casa y encontré Publihazclick. Ahora el aburrimiento me paga 😂',
  'Este dinero lo uso para los gusticos sin afectar el presupuesto familiar 🙏',
  // Específico de plataforma
  'El sistema de referidos también suma bastante. Ya tengo 4 amigos activos.',
  'Mis referidos me están generando ingresos pasivos. Esto escala bien.',
  'Aparte del pago por anuncios, los bonos por referidos son un extra nada despreciable.',
  // Sin emojis (más formal)
  'Comprobante de pago recibido satisfactoriamente. Plataforma seria y confiable.',
  'Segundo mes consecutivo recibiendo mi retiro sin inconvenientes. Muy conforme.',
  'Proceso transparente desde el inicio. El dinero llega cuando dicen que llega.',
  'Cuatro meses usando la plataforma. Ningún problema hasta la fecha.',
  'Recomendable para quienes buscan un ingreso adicional sin mayor complicación.',
  // Entusiasmo alto
  '¡LLEGÓÓÓ! 🎊🎊 No puedo creer que esto sea real. Gracias Publihazclick 🙌🙌',
  'PAGO RECIBIDO 🔥🔥 Esto sí funciona amigos, no pierdan tiempo y únanse ya!',
  '¡Woooo! Tercer pago del mes y subiendo. Alguien que me diga cómo parar 🚀😂',
  '¡Esto es una locura! Empecé sin creer y ahora no puedo parar de recibir pagos 🤩',
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
      .select('id, phash, image_url, username')
      .limit(500);
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
      .order('image_date', { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return data ?? [];
  }

  async getAll(): Promise<PaymentTestimonial[]> {
    const { data, error } = await this.client
      .from('payment_testimonials')
      .select('*')
      .order('image_date', { ascending: false })
      .limit(200);
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
