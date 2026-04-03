import { Component, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-sms-landing',
  standalone: true,
  imports: [CommonModule, RouterModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './sms-landing.component.html',
})
export class SmsPublicLandingComponent {
  readonly stats = [
    { value: '15', label: 'Países soportados', icon: 'public' },
    { value: '$0.03', label: 'USD por SMS', icon: 'paid' },
    { value: '24/7', label: 'Envío disponible', icon: 'schedule' },
    { value: '7', label: 'Paquetes de recarga', icon: 'account_balance_wallet' },
  ];

  readonly features = [
    { icon: 'contacts', title: 'Gestión de Contactos', desc: 'Agrega contactos manualmente o importa miles desde archivos CSV/Excel. Sistema de etiquetas, notas y validación automática de números telefónicos.', color: 'cyan' },
    { icon: 'draft', title: 'Plantillas con Variables', desc: 'Crea mensajes reutilizables con variables personalizadas como {nombre}, {telefono} y {empresa}. Ahorra tiempo en campañas repetitivas.', color: 'violet' },
    { icon: 'campaign', title: 'Campañas Masivas', desc: 'Envía SMS a todos tus contactos a la vez o divide el envío en partes programadas. Control total sobre cuándo y cómo se distribuyen tus mensajes.', color: 'blue' },
    { icon: 'analytics', title: 'Dashboard en Tiempo Real', desc: 'Monitorea contactos totales, campañas enviadas, tasa de entrega y costos. Estadísticas actualizadas al instante.', color: 'emerald' },
    { icon: 'upload_file', title: 'Importación Masiva', desc: 'Sube archivos CSV, Excel o TXT con tus contactos. Detección automática de formato, validación de números y eliminación de duplicados.', color: 'amber' },
    { icon: 'card_giftcard', title: 'Recomienda y Gana', desc: 'Comparte tu link de referido. Cuando alguien recargue su billetera SMS, tú ganas una comisión directa en tu billetera de retiro.', color: 'pink' },
  ];

  readonly countries = [
    { code: '+57', name: 'Colombia' }, { code: '+1', name: 'USA/Canadá' },
    { code: '+52', name: 'México' }, { code: '+54', name: 'Argentina' },
    { code: '+56', name: 'Chile' }, { code: '+51', name: 'Perú' },
    { code: '+593', name: 'Ecuador' }, { code: '+58', name: 'Venezuela' },
    { code: '+507', name: 'Panamá' }, { code: '+34', name: 'España' },
    { code: '+55', name: 'Brasil' }, { code: '+44', name: 'Reino Unido' },
    { code: '+49', name: 'Alemania' }, { code: '+33', name: 'Francia' },
    { code: '+39', name: 'Italia' },
  ];

  readonly packages = [
    { usd: 10, sms: 333 },
    { usd: 20, sms: 666 },
    { usd: 50, sms: 1666 },
    { usd: 150, sms: 5000 },
    { usd: 250, sms: 8333 },
    { usd: 500, sms: 16666 },
    { usd: 1000, sms: 33333 },
  ];

  readonly steps = [
    { num: '01', title: 'Crea tu cuenta', desc: 'Regístrate gratis en Publihazclick y accede al módulo SMS Masivos.', icon: 'person_add' },
    { num: '02', title: 'Recarga tu billetera', desc: 'Elige un paquete desde $10 USD y paga con ePayco (tarjetas, PSE, Nequi, Daviplata).', icon: 'account_balance_wallet' },
    { num: '03', title: 'Sube tus contactos', desc: 'Importa tu lista de contactos desde CSV/Excel o agrégalos manualmente uno por uno.', icon: 'upload_file' },
    { num: '04', title: 'Crea tu mensaje', desc: 'Escribe tu SMS o usa una plantilla con variables personalizadas. Ve en tiempo real los segmentos.', icon: 'edit_note' },
    { num: '05', title: 'Envía tu campaña', desc: 'Envía a todos de golpe o programa envíos divididos. Monitorea la entrega en tiempo real.', icon: 'send' },
  ];

  readonly faqs = [
    { q: '¿Cuánto cuesta cada SMS?', a: 'Cada SMS tiene un costo de $0.03 USD (3 centavos de dólar). Si tu mensaje excede los 160 caracteres, se divide en segmentos y cada segmento se cobra como un SMS individual.' },
    { q: '¿A qué países puedo enviar SMS?', a: 'Puedes enviar a 15 países: Colombia, USA/Canadá, México, Argentina, Chile, Perú, Ecuador, Venezuela, Panamá, España, Brasil, Reino Unido, Alemania, Francia e Italia.' },
    { q: '¿Cómo recargo mi billetera?', a: 'Selecciona un paquete desde $10 hasta $1,000 USD. El pago se procesa con ePayco que acepta tarjetas de crédito/débito, PSE, Nequi, Daviplata y otros medios colombianos.' },
    { q: '¿Qué formatos de archivo puedo importar?', a: 'Puedes importar contactos desde archivos CSV, Excel (.xls, .xlsx) y texto plano (.txt). El sistema detecta automáticamente el formato y valida cada número de teléfono.' },
    { q: '¿Qué son las plantillas con variables?', a: 'Las plantillas te permiten crear mensajes reutilizables con campos dinámicos como {nombre}, {telefono} y {empresa}. Cada variable se reemplaza automáticamente con los datos del contacto.' },
    { q: '¿Cómo funciona el programa de referidos?', a: 'Comparte tu link único de referido. Cuando alguien se registra con tu link y recarga su billetera SMS, tú recibes una comisión automática en tu billetera de retiro que puedes cobrar cuando quieras.' },
  ];

  expandedFaq = -1;

  toggleFaq(i: number): void {
    this.expandedFaq = this.expandedFaq === i ? -1 : i;
  }
}
