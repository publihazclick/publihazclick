import { Component, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-trading-bot-landing',
  standalone: true,
  imports: [CommonModule, RouterModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './trading-bot-landing.component.html',
})
export class TradingBotLandingComponent {
  readonly stats = [
    { value: '9+', label: 'Años operando', icon: 'verified' },
    { value: '24/7', label: 'Monitoreo IA', icon: 'smart_toy' },
    { value: '42', label: 'Paquetes disponibles', icon: 'inventory_2' },
    { value: '30%', label: 'Rendimiento máximo/mes', icon: 'trending_up' },
  ];

  readonly features = [
    {
      icon: 'auto_graph',
      title: 'Análisis de Mercado 24/7',
      desc: 'Nuestros algoritmos de machine learning analizan Bitcoin, Ethereum, Solana y más criptomonedas en tiempo real, identificando patrones y oportunidades que un humano jamás detectaría.',
    },
    {
      icon: 'bolt',
      title: 'Ejecución en Milisegundos',
      desc: 'El bot ejecuta operaciones de compra y venta automáticamente en milisegundos. Sin intervención humana, sin emociones, sin errores. Solo lógica pura y velocidad.',
    },
    {
      icon: 'shield_with_heart',
      title: 'Gestión Inteligente de Riesgo',
      desc: 'Sistema de stop-loss inteligente que protege tu capital en mercados volátiles. Tu inversión está resguardada con protocolos de seguridad de nivel institucional.',
    },
    {
      icon: 'payments',
      title: 'Retiros Flexibles',
      desc: 'Después de los primeros 30 días, retira tus ganancias cuando quieras. Sin penalidades, sin tiempos de espera. Tu dinero, tus reglas.',
    },
    {
      icon: 'card_giftcard',
      title: 'Recomienda y Gana',
      desc: 'Invita amigos y gana el 1% mensual sobre el valor del paquete que adquiera cada invitado. Mientras su paquete esté activo, tú sigues ganando cada mes.',
    },
    {
      icon: 'monitoring',
      title: 'Terminal de Trading en Vivo',
      desc: 'Accede a Tu oficina virtual y veras los eventos en vivo las órdenes, gráficos de velas, historial de operaciones y tasa de aciertos del bot.',
    },
  ];

  readonly tiers = [
    { name: 'Semilla', price: 100, color: 'emerald' },
    { name: 'Bronce I', price: 1000, color: 'amber' },
    { name: 'Plata I', price: 2500, color: 'slate' },
    { name: 'Oro I', price: 4000, color: 'yellow' },
    { name: 'Diamante I', price: 10000, color: 'cyan' },
    { name: 'Apex', price: 20000, color: 'yellow' },
  ];

  readonly steps = [
    { num: '01', title: 'Crea tu cuenta', desc: 'Regístrate gratis en Publihazclick en menos de 1 minuto.', icon: 'person_add' },
    { num: '02', title: 'Elige tu paquete', desc: 'Selecciona uno de los 42 paquetes desde $100 hasta $20,000 USD.', icon: 'shopping_cart' },
    { num: '03', title: 'Realiza el pago', desc: 'Paga por Nequi, Daviplata o transferencia bancaria.', icon: 'account_balance_wallet' },
    { num: '04', title: 'El bot trabaja por ti', desc: 'La IA opera 24/7 y genera ganancias estimadas de 2.5% a 30% mensual.', icon: 'smart_toy' },
    { num: '05', title: 'Retira tus ganancias', desc: 'Después de 30 días, solicita retiros a tu cuenta bancaria cuando quieras.', icon: 'savings' },
  ];

  readonly faqs = [
    { q: '¿Cuánto puedo ganar mensualmente?', a: 'Las ganancias estimadas van desde el 2.5% hasta el 30% mensual sobre tu inversión, dependiendo de las condiciones del mercado y el paquete que elijas.' },
    { q: '¿Cuál es la inversión mínima?', a: 'Puedes empezar desde $100 USD con el paquete Semilla. Tenemos 42 niveles hasta $20,000 USD para que inviertas según tu capacidad.' },
    { q: '¿Cuándo puedo retirar mis ganancias?', a: 'Después de los primeros 30 días de activación de tu paquete, puedes solicitar retiros cuando quieras sin penalidades.' },
    { q: '¿Qué criptomonedas opera el bot?', a: 'El bot opera principalmente con Bitcoin (BTC), Ethereum (ETH), Solana (SOL) y Ripple (XRP), diversificando para minimizar riesgos.' },
    { q: '¿Cómo gano por mis invitados?', a: 'Recibes el 1% mensual sobre el valor del paquete de cada persona que invites y que adquiera un paquete de trading activo.' },
    { q: '¿Es seguro? ¿No es una estafa?', a: 'Llevamos más de 9 años operando como empresa con resultados sólidos. Priorizamos la transparencia y la sostenibilidad sobre las promesas irreales. No ofrecemos +100% porque eso no es sostenible.' },
  ];

  expandedFaq = -1;

  toggleFaq(i: number): void {
    this.expandedFaq = this.expandedFaq === i ? -1 : i;
  }
}
