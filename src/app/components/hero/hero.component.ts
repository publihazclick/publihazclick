import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { environment } from '../../../environments/environment';

interface FloatingImage {
  src: string;
  alt: string;
  class: string;
}

@Component({
  selector: 'app-hero',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './hero.component.html',
  styleUrl: './hero.component.scss'
})
export class HeroComponent {
  // Número de WhatsApp de la empresa (configurable desde environment)
  protected readonly whatsappNumber = signal(environment.whatsappNumber);
  protected readonly whatsappMessage = signal('Hola! Me interesa conocer más sobre los servicios de publicidad digital de Publihazclick');

  protected readonly floatingImages: FloatingImage[] = [
    {
      src: 'https://lh3.googleusercontent.com/aida-public/AB6AXuA2RWuxdN5hyuEP7KMGu55VJWKBi_9LXMmpdJPiCTvKE5h57afgm-EAs_NdT7nn-rxG6c-T5OOdkoJBv1KTYm0Zza-I1bz8qutiJeCeV0Xue93aP_IiPEoOnKH4VzKWvD1VGrlgXbE25kFP_yB8zNBFIkUCbJkjazLUMduxnwHh6aCnxKWrfF6tFjRCuMVIlvqdQBSHNKL5XOnOsYknRnjMiFlUDrKoqnbTXz3DFUOYIuKxSc78ZbZSjX_IpLDhA9XPv75XSdH7X5vk',
      alt: 'Product',
      class: 'absolute top-0 left-4 md:left-20 w-36 h-36 float-animation hidden lg:block rotate-12'
    },
    {
      src: 'https://lh3.googleusercontent.com/aida-public/AB6AXuBBQ-EUBNbvxxuqMcq-HUfpaSBbmaT9zKyYzNZsrUyI8W7RNEjfeyAlOAlqt2hKJ9nkHbMMy2_H-H6D6541ImlrN0bP02MVbI4AGuUYy-woI4Ay6IXlYTBjAJXVpJtlgXmN1AGNMW08gxoFNUOLlrxvoeSycyhJm4to3etXrFCZJmD1XbJ5Du-HWAWneWg3E150e6q-D23Hbr-mISVnOzV3p4my4MWsSs3j-cQBi1tZzQIFm2iwSynatkSteSBCRBfmzE00pc26XY0A',
      alt: 'Apparel',
      class: 'absolute bottom-10 left-10 md:left-40 w-44 h-44 float-delayed hidden lg:block -rotate-12'
    },
    {
      src: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDkq_bmAVXZ2gGuaOOd_GLugkoAnEmWkclabP1a6Cp4EZkmUkqQwv14fohJPJbRbrcpzzEIngSaZ85qtAJpmiYt_amuZlQCCNOJNx94oOcNu_uA_Sbj-E6AkuVGkH_3A4meYzDCUj_VxOvSIVIStp8UDT3LhelzeHVOiF_8mxH7shfzlXPyrpUOiWArMvWk5-u2gIjDM5T5oVKHm7hxozGk494NAc3xJd9PcVYMwDxlP64hyCEEPr7Xcso7Eghmt2fHLAmce5ZhkFkn',
      alt: 'Tech',
      class: 'absolute top-20 right-4 md:right-20 w-48 h-48 float-delayed hidden lg:block rotate-6'
    },
    {
      src: 'https://lh3.googleusercontent.com/aida-public/AB6AXuCoNAZCWCjyBSJ2WBiR2Mcqe3sidstlACmycVRBJQhlhMnnWClyGrHKqvwhVr5IPyTlzwYWOiVTn6hb8BGBOoO5ajURDDPUl6ZSHBsqavZgAwrZ-jR59GwyIzN-yaI_5wM4rAKRubmUP8PJQWLpf4-lk93n664_qmN2lQoa-RrOh5Df8dPHXNvmDKQe5VctMuMUM7jG5Aj-nIf5o2gcNspl2jMDuevqJfVUf0mN6RR0P5Net3MgEVJ2m0uoo4jp7GY2p1uBKm_AbYe5',
      alt: 'Package',
      class: 'absolute bottom-0 right-10 md:right-40 w-44 h-44 float-animation hidden lg:block -rotate-6'
    }
  ];

  protected readonly tickerCompanies: { name: string; type: string; bg: string; icon: string }[] = [
    // ── Bancos y Finanzas ──
    { name: 'Bancolombia',      type: 'Banco',           bg: 'linear-gradient(135deg,#eab308,#ca8a04)',   icon: '🏦' },
    { name: 'Davivienda',       type: 'Banco',           bg: 'linear-gradient(135deg,#dc2626,#b91c1c)',   icon: '🏦' },
    { name: 'Banco de Bogotá',  type: 'Banco',           bg: 'linear-gradient(135deg,#1d4ed8,#1e3a8a)',   icon: '🏦' },
    { name: 'Nequi',            type: 'Fintech',         bg: 'linear-gradient(135deg,#9333ea,#7e22ce)',   icon: '💳' },
    { name: 'Bancamía',         type: 'Banco',           bg: 'linear-gradient(135deg,#f97316,#ea580c)',   icon: '🏦' },
    { name: 'BBVA Colombia',    type: 'Banco',           bg: 'linear-gradient(135deg,#0284c7,#0369a1)',   icon: '🏦' },
    { name: 'Coltefinanciera',  type: 'Finanzas',        bg: 'linear-gradient(135deg,#0d9488,#0f766e)',   icon: '💰' },
    // ── Telecom ──
    { name: 'Claro Colombia',   type: 'Telefonía',       bg: 'linear-gradient(135deg,#ef4444,#dc2626)',   icon: '📡' },
    { name: 'Tigo Colombia',    type: 'Telefonía',       bg: 'linear-gradient(135deg,#334155,#1e293b)',   icon: '📡' },
    { name: 'Movistar CO',      type: 'Telefonía',       bg: 'linear-gradient(135deg,#3b82f6,#2563eb)',   icon: '📡' },
    { name: 'WOM Colombia',     type: 'Telefonía',       bg: 'linear-gradient(135deg,#ec4899,#db2777)',   icon: '📱' },
    // ── Retail y Supermercados ──
    { name: 'Grupo Éxito',      type: 'Retail',          bg: 'linear-gradient(135deg,#7c3aed,#6d28d9)',   icon: '🛒' },
    { name: 'Falabella CO',     type: 'Retail',          bg: 'linear-gradient(135deg,#16a34a,#15803d)',   icon: '🛍️' },
    { name: 'Carulla',          type: 'Supermercado',    bg: 'linear-gradient(135deg,#f43f5e,#e11d48)',   icon: '🛒' },
    { name: 'Jumbo Colombia',   type: 'Supermercado',    bg: 'linear-gradient(135deg,#f87171,#f97316)',   icon: '🛒' },
    { name: 'D1 Colombia',      type: 'Supermercado',    bg: 'linear-gradient(135deg,#b91c1c,#991b1b)',   icon: '🏪' },
    { name: 'Ara Colombia',     type: 'Supermercado',    bg: 'linear-gradient(135deg,#10b981,#059669)',   icon: '🏪' },
    // ── Energía y Petróleo ──
    { name: 'Ecopetrol',        type: 'Energía',         bg: 'linear-gradient(135deg,#15803d,#166534)',   icon: '⛽' },
    { name: 'Celsia',           type: 'Energía',         bg: 'linear-gradient(135deg,#65a30d,#4d7c0f)',   icon: '⚡' },
    { name: 'ISA Colombia',     type: 'Energía',         bg: 'linear-gradient(135deg,#2563eb,#1d4ed8)',   icon: '⚡' },
    // ── Aerolíneas ──
    { name: 'Avianca',          type: 'Aerolínea',       bg: 'linear-gradient(135deg,#dc2626,#be123c)',   icon: '✈️' },
    { name: 'LATAM Colombia',   type: 'Aerolínea',       bg: 'linear-gradient(135deg,#ef4444,#dc2626)',   icon: '✈️' },
    { name: 'Wingo Airlines',   type: 'Aerolínea',       bg: 'linear-gradient(135deg,#d946ef,#ec4899)',   icon: '✈️' },
    // ── Tech y Delivery ──
    { name: 'Rappi',            type: 'Delivery',        bg: 'linear-gradient(135deg,#f97316,#ea580c)',   icon: '🛵' },
    { name: 'Merqueo',          type: 'E-commerce',      bg: 'linear-gradient(135deg,#6366f1,#4f46e5)',   icon: '📦' },
    { name: 'Frubana',          type: 'AgriTech',        bg: 'linear-gradient(135deg,#22c55e,#0d9488)',   icon: '🥦' },
    // ── Alimentos y Bebidas ──
    { name: 'Postobón',         type: 'Bebidas',         bg: 'linear-gradient(135deg,#3b82f6,#ef4444)',   icon: '🥤' },
    { name: 'Bavaria',          type: 'Cervecería',      bg: 'linear-gradient(135deg,#d97706,#b45309)',   icon: '🍺' },
    { name: 'Grupo Nutresa',    type: 'Alimentos',       bg: 'linear-gradient(135deg,#2563eb,#4338ca)',   icon: '🍫' },
    { name: 'Alpina',           type: 'Lácteos',         bg: 'linear-gradient(135deg,#38bdf8,#0ea5e9)',   icon: '🥛' },
    { name: 'Colanta',          type: 'Lácteos',         bg: 'linear-gradient(135deg,#60a5fa,#3b82f6)',   icon: '🥛' },
    // ── Restaurantes ──
    { name: 'Crepes & Waffles', type: 'Restaurante',     bg: 'linear-gradient(135deg,#f472b6,#f43f5e)',   icon: '🧇' },
    { name: 'El Corral',        type: 'Restaurante',     bg: 'linear-gradient(135deg,#dc2626,#b91c1c)',   icon: '🍔' },
    { name: 'Frisby',           type: 'Restaurante',     bg: 'linear-gradient(135deg,#f97316,#ef4444)',   icon: '🍗' },
    { name: 'Kokoriko',         type: 'Restaurante',     bg: 'linear-gradient(135deg,#fb923c,#f97316)',   icon: '🍗' },
    { name: 'Juan Valdez',      type: 'Café',            bg: 'linear-gradient(135deg,#92400e,#78350f)',   icon: '☕' },
    { name: 'OMA Café',         type: 'Café',            bg: 'linear-gradient(135deg,#a16207,#92400e)',   icon: '☕' },
    { name: 'Presto',           type: 'Restaurante',     bg: 'linear-gradient(135deg,#ef4444,#dc2626)',   icon: '🍔' },
    // ── Seguros y Salud ──
    { name: 'Sura Colombia',    type: 'Seguros',         bg: 'linear-gradient(135deg,#f97316,#ea580c)',   icon: '🛡️' },
    { name: 'Colsanitas',       type: 'Salud',           bg: 'linear-gradient(135deg,#3b82f6,#06b6d4)',   icon: '🏥' },
    { name: 'Nueva EPS',        type: 'Salud',           bg: 'linear-gradient(135deg,#14b8a6,#0d9488)',   icon: '🏥' },
    // ── Centros Comerciales ──
    { name: 'C.C. Andino',      type: 'C. Comercial',   bg: 'linear-gradient(135deg,#57534e,#44403c)',   icon: '🏬' },
    { name: 'El Tesoro',        type: 'C. Comercial',   bg: 'linear-gradient(135deg,#059669,#047857)',   icon: '🏬' },
    { name: 'C.C. Santafé',     type: 'C. Comercial',   bg: 'linear-gradient(135deg,#ea580c,#dc2626)',   icon: '🏬' },
    { name: 'Gran Estación',    type: 'C. Comercial',   bg: 'linear-gradient(135deg,#2563eb,#7c3aed)',   icon: '🏬' },
    { name: 'Unicentro Bogotá', type: 'C. Comercial',   bg: 'linear-gradient(135deg,#ef4444,#dc2626)',   icon: '🏬' },
    { name: 'Buenavista',       type: 'C. Comercial',   bg: 'linear-gradient(135deg,#0891b2,#0d9488)',   icon: '🏬' },
    { name: 'Chipichape',       type: 'C. Comercial',   bg: 'linear-gradient(135deg,#0284c7,#1d4ed8)',   icon: '🏬' },
    { name: 'Jardín Plaza',     type: 'C. Comercial',   bg: 'linear-gradient(135deg,#22c55e,#059669)',   icon: '🏬' },
    { name: 'Titan Plaza',      type: 'C. Comercial',   bg: 'linear-gradient(135deg,#3b82f6,#4f46e5)',   icon: '🏬' },
    { name: 'Hayuelos',         type: 'C. Comercial',   bg: 'linear-gradient(135deg,#8b5cf6,#7c3aed)',   icon: '🏬' },
    { name: 'Plaza Américas',   type: 'C. Comercial',   bg: 'linear-gradient(135deg,#ef4444,#f43f5e)',   icon: '🏬' },
    { name: 'Cosmocentro',      type: 'C. Comercial',   bg: 'linear-gradient(135deg,#4f46e5,#1d4ed8)',   icon: '🏬' },
  ];

  onSubmitWhatsapp(): void {
    const number = this.whatsappNumber();
    const message = this.whatsappMessage();
    // Codificar el mensaje para URL
    const encodedMessage = encodeURIComponent(message);
    // Redirigir a WhatsApp API
    window.open(`https://wa.me/${number}?text=${encodedMessage}`, '_blank');
  }
}
