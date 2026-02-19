import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { environment } from '../../../environments/environment';

interface FloatingImage {
  src: string;
  alt: string;
  class: string;
}

@Component({
  selector: 'app-hero',
  standalone: true,
  imports: [CommonModule],
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

  protected readonly tickerItems: string[] = [
    'PREMIUM', 'DIGITAL', 'REACH', 'CLIK', 'GROWTH', 'GLOBAL'
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
