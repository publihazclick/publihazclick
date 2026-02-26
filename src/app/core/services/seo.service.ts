import { Injectable, inject } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { Router, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';
import { DOCUMENT } from '@angular/common';

interface SeoConfig {
  title: string;
  description: string;
  ogType?: string;
  noIndex?: boolean;
}

const BASE_TITLE = 'Publihazclick';
const BASE_URL = 'https://www.publihazclick.com';

const ROUTE_SEO: Record<string, SeoConfig> = {
  '/': {
    title: 'Publihazclick — Gana Dinero Viendo Anuncios | Plataforma PTC Colombia',
    description:
      'Publihazclick es la plataforma PTC líder en Colombia. Gana dinero real viendo anuncios, crea campañas publicitarias y construye tu red de referidos. Regístrate gratis.',
  },
  '/login': {
    title: 'Iniciar Sesión — Publihazclick',
    description:
      'Inicia sesión en Publihazclick para ver anuncios, ganar dinero y gestionar tu red de referidos.',
  },
  '/register': {
    title: 'Registro Gratis — Publihazclick | Empieza a Ganar Hoy',
    description:
      'Regístrate gratis en Publihazclick con tu código de referido. Empieza a ganar dinero viendo anuncios PTC en Colombia.',
  },
  '/quienes-somos': {
    title: 'Quiénes Somos — Publihazclick',
    description:
      'Conoce al equipo detrás de Publihazclick, la plataforma PTC colombiana que conecta anunciantes con usuarios que ganan dinero viendo anuncios.',
  },
  '/terminos': {
    title: 'Términos y Condiciones — Publihazclick',
    description:
      'Lee los términos y condiciones de uso de la plataforma Publihazclick. Información legal sobre pagos, referidos y uso del servicio.',
  },
  '/dashboard': {
    title: 'Mi Panel — Publihazclick',
    description: 'Accede a tu panel de usuario en Publihazclick. Visualiza tu balance, tareas disponibles y red de referidos.',
    noIndex: true,
  },
  '/admin': {
    title: 'Administración — Publihazclick',
    description: 'Panel de administración de Publihazclick.',
    noIndex: true,
  },
  '/advertiser': {
    title: 'Panel Anunciante — Publihazclick',
    description: 'Gestiona tus campañas publicitarias y tareas PTC en Publihazclick.',
    noIndex: true,
  },
  '/social': {
    title: 'Red Social — Publihazclick',
    description: 'Conecta con otros anunciantes en la red social de Publihazclick.',
    noIndex: true,
  },
};

@Injectable({ providedIn: 'root' })
export class SeoService {
  private readonly meta = inject(Meta);
  private readonly titleService = inject(Title);
  private readonly router = inject(Router);
  private readonly document = inject(DOCUMENT);

  init(): void {
    this.updateMetaForUrl(this.router.url);

    this.router.events
      .pipe(filter((e) => e instanceof NavigationEnd))
      .subscribe((e) => {
        this.updateMetaForUrl((e as NavigationEnd).urlAfterRedirects);
      });
  }

  private updateMetaForUrl(url: string): void {
    const path = url.split('?')[0].split('#')[0];
    const config = this.findConfig(path);

    // Title
    this.titleService.setTitle(config.title);

    // Standard meta
    this.meta.updateTag({ name: 'description', content: config.description });

    // Robots
    if (config.noIndex) {
      this.meta.updateTag({ name: 'robots', content: 'noindex, nofollow' });
    } else {
      this.meta.updateTag({
        name: 'robots',
        content: 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1',
      });
    }

    // Canonical
    this.updateCanonical(config.noIndex ? null : `${BASE_URL}${path === '/' ? '' : path}`);

    // Open Graph
    this.meta.updateTag({ property: 'og:title', content: config.title });
    this.meta.updateTag({ property: 'og:description', content: config.description });
    this.meta.updateTag({ property: 'og:url', content: `${BASE_URL}${path}` });
    this.meta.updateTag({ property: 'og:type', content: config.ogType || 'website' });

    // Twitter
    this.meta.updateTag({ name: 'twitter:title', content: config.title });
    this.meta.updateTag({ name: 'twitter:description', content: config.description });
  }

  private findConfig(path: string): SeoConfig {
    // Exact match
    if (ROUTE_SEO[path]) return ROUTE_SEO[path];

    // Prefix match (e.g. /dashboard/ads → /dashboard)
    const prefix = Object.keys(ROUTE_SEO)
      .filter((k) => k !== '/' && path.startsWith(k))
      .sort((a, b) => b.length - a.length)[0];

    if (prefix) return ROUTE_SEO[prefix];

    // Referral route
    if (path.startsWith('/ref/')) {
      return {
        title: 'Únete a Publihazclick — Invitación de Referido',
        description:
          'Te han invitado a Publihazclick. Regístrate y empieza a ganar dinero viendo anuncios PTC en Colombia.',
      };
    }

    // Default
    return {
      title: `${BASE_TITLE} — Plataforma PTC Colombia`,
      description:
        'Publihazclick es la plataforma PTC líder en Colombia. Gana dinero real viendo anuncios.',
    };
  }

  private updateCanonical(url: string | null): void {
    const head = this.document.head;
    let link = head.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;

    if (url) {
      if (!link) {
        link = this.document.createElement('link');
        link.setAttribute('rel', 'canonical');
        head.appendChild(link);
      }
      link.setAttribute('href', url);
    } else if (link) {
      link.remove();
    }
  }
}
