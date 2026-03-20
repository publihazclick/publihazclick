import { Injectable } from '@angular/core';
import { getSupabaseClient } from '../supabase.client';

export interface PaymentTestimonial {
  id: string;
  image_url: string;
  image_date: string;
  username: string;
  comment: string;
  active: boolean;
  created_at: string;
}

// Pool de nombres colombianos realistas
const USERNAMES = [
  'María J.', 'Carlos A.', 'Paola R.', 'Andrés M.', 'Laura V.',
  'Diego F.', 'Valentina G.', 'Sebastián H.', 'Natalia C.', 'Camilo T.',
  'Juliana O.', 'Felipe S.', 'Daniela B.', 'Mauricio L.', 'Catalina P.',
  'Jorge E.', 'Alejandra N.', 'Iván D.', 'Luisa Q.', 'Esteban W.',
  'Adriana K.', 'Hernán Z.', 'Pilar X.', 'Ricardo U.', 'Marcela Y.',
  'Gustavo I.', 'Ángela R.', 'Fabián M.', 'Verónica C.', 'William T.',
];

// Pool de comentarios auténticos sobre pagos recibidos de Publihazclick
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

@Injectable({ providedIn: 'root' })
export class TestimonialsService {
  private readonly client = getSupabaseClient();

  /** Carga testimonials activos ordenados por fecha de imagen DESC (más reciente primero) */
  async getActive(): Promise<PaymentTestimonial[]> {
    const { data, error } = await this.client
      .from('payment_testimonials')
      .select('*')
      .eq('active', true)
      .order('image_date', { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  }

  /** Carga TODOS los testimonials para el panel admin */
  async getAll(): Promise<PaymentTestimonial[]> {
    const { data, error } = await this.client
      .from('payment_testimonials')
      .select('*')
      .order('image_date', { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  }

  /** Sube una imagen y crea el registro con usuario y comentario auto-generados */
  async uploadAndCreate(file: File, index: number): Promise<PaymentTestimonial> {
    // Nombre único para el archivo
    const ext = file.name.split('.').pop() ?? 'jpg';
    const path = `proofs/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;

    const { error: uploadError } = await this.client.storage
      .from('testimonials')
      .upload(path, file, { contentType: file.type, upsert: false });

    if (uploadError) throw new Error(uploadError.message);

    const { data: { publicUrl } } = this.client.storage
      .from('testimonials')
      .getPublicUrl(path);

    // Fecha de la imagen: lastModified del archivo (fecha de captura / guardado)
    const imageDate = new Date(file.lastModified).toISOString();

    // Asignar comentario y nombre de forma determinista según el índice global
    const totalNames = USERNAMES.length;
    const totalComments = COMMENTS.length;
    // Usar el índice global + un hash del nombre del archivo para variar
    const nameIdx  = (index * 7 + file.name.charCodeAt(0)) % totalNames;
    const commentIdx = (index * 11 + file.name.charCodeAt(file.name.length - 2 || 0)) % totalComments;

    const { data, error } = await this.client
      .from('payment_testimonials')
      .insert({
        image_url: publicUrl,
        image_date: imageDate,
        username: USERNAMES[nameIdx],
        comment: COMMENTS[commentIdx],
        active: true,
      })
      .select()
      .single();

    if (error) throw new Error(error.message);
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
  }
}
