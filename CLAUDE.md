# Publihazclick - Plataforma PTC

## Descripción del Proyecto

Publihazclick es una plataforma PTC (Paid To Click) - una red social que paga a los usuarios por ver anuncios. Conecta anunciantes con usuarios que ganan dinero por interactuar con contenido publicitario.

### Funcionalidades Principales

- **Para Usuarios**: Ganar dinero viendo anuncios PTC, sistema de referidos multinivel, cartera/wallet, retiros, historial
- **Para Anunciantes**: Creación de campañas publicitarias, configuración de presupuestos, gestión de anuncios
- **Para Administradores**: Panel con métricas en tiempo real, moderación, gestión de usuarios, paquetes, anuncios y retiros

---

## Stack Tecnológico

| Categoría | Tecnología |
|-----------|------------|
| Framework | Angular 21.1 (Standalone Components) |
| Lenguaje | TypeScript 5.9 |
| SSR | Angular SSR con Express 5.1 |
| Estilos | Tailwind CSS 3.4.19 + SCSS |
| UI/UX | Lucide Angular 0.574, Material Symbols, Google Fonts |
| Backend | Supabase (PostgreSQL + Auth + RLS) `@supabase/supabase-js ^2.96` |
| Testing | Vitest 4.0.8 |
| Build | Angular CLI 21.1 |
| Package Manager | npm 11.8.0 |

---

## Arquitectura del Proyecto

```
src/app/
├── app.ts                    # Componente raíz
├── app.html / app.scss
├── app.config.ts             # Configuración de la app (providers)
├── app.config.server.ts      # Config SSR
├── app.routes.ts             # Rutas principales
├── app.routes.server.ts      # Rutas SSR
├── app.spec.ts
│
├── components/               # Secciones de la landing page
│   ├── banner-slider/        # Slider de estadísticas
│   ├── business-models/      # Modelos de negocio
│   ├── features/             # Características de la plataforma
│   ├── footer/               # Pie de página
│   ├── header/               # Navegación principal
│   ├── hero/                 # Sección hero
│   ├── how-it-works/         # Cómo funciona
│   ├── pricing/              # Precios y paquetes
│   ├── ptc-ads/              # Vista previa de anuncios PTC
│   ├── ptc-modal/            # Modal de PTC (solo .ts)
│   ├── recent-posts/         # Publicaciones recientes
│   ├── testimonials/         # Testimonios
│   ├── tiers/                # Niveles/tiers de la plataforma
│   └── video-section/        # Sección de video (solo .ts)
│
├── core/                     # Lógica central
│   ├── index.ts              # Barrel exports
│   ├── supabase.client.ts    # Cliente Supabase singleton (getSupabaseClient())
│   ├── guards/
│   │   ├── auth.guard.ts     # authGuard, guestGuard, roleRedirectGuard, verifiedGuard, roleGuard()
│   │   └── admin.guard.ts    # adminGuard
│   ├── interceptors/
│   │   └── auth.interceptor.ts
│   ├── models/
│   │   ├── profile.model.ts  # UserRole, Profile, Referral, UpdateProfileOptions, CreateUserOptions
│   │   └── admin.model.ts    # Todos los tipos admin (813 líneas): enums, stats, filtros, entidades
│   └── services/             # 14 servicios (ver lista abajo)
│
├── features/
│   ├── auth/
│   │   └── components/
│   │       ├── login/
│   │       ├── register/
│   │       ├── logout/
│   │       ├── auth-callback/
│   │       └── auth-ads/     # Anuncios mostrados durante el flujo de auth
│   ├── admin/
│   │   └── components/
│   │       ├── admin-layout/
│   │       ├── admin-referral-modal/
│   │       ├── dashboard/
│   │       ├── users/
│   │       ├── moderation/
│   │       ├── reports/
│   │       ├── settings/
│   │       ├── logs/
│   │       ├── packages/
│   │       └── ads/
│   └── user/
│       ├── index.ts
│       └── components/
│           ├── user-layout/
│           ├── user-referral-modal/
│           ├── dashboard/
│           ├── ads/          # Anuncios PTC disponibles
│           ├── wallet/       # Balance y retiros
│           ├── referrals/    # Red de referidos y ganancias
│           ├── history/      # Historial de clicks y ganancias
│           └── settings/
│
└── shared/
    └── components/
        └── referral-link/    # Componente reutilizable de enlace de referido
```

---

## Servicios (core/services/)

| Servicio | Responsabilidad |
|----------|----------------|
| `auth.service.ts` | Login, registro, logout, sesión, Observables de estado |
| `profile.service.ts` | Perfil de usuario, referidos, datos personales |
| `storage.service.ts` | Uploads y gestión de archivos en Supabase Storage |
| `countries.service.ts` | Listado de países |
| `currency.service.ts` | Conversión y tasas de moneda |
| `user-tracking.service.ts` | Tracking de actividad de usuario |
| `wallet-state.service.ts` | Estado del wallet y balance |
| `admin-dashboard.service.ts` | Estadísticas y métricas del dashboard |
| `admin-campaign.service.ts` | CRUD de campañas publicitarias |
| `admin-ptc-task.service.ts` | Gestión de tareas/anuncios PTC |
| `admin-banner.service.ts` | Gestión de banners publicitarios |
| `admin-withdrawal.service.ts` | Solicitudes de retiro |
| `admin-package.service.ts` | Gestión de paquetes/tiers |
| `admin-logs.service.ts` | Logs de actividad del sistema |

Todos los servicios usan `getSupabaseClient()` de `core/supabase.client.ts`.

---

## Guards (core/guards/)

| Guard | Uso |
|-------|-----|
| `authGuard` | Rutas privadas de usuario (requiere sesión activa) |
| `guestGuard` | Rutas para no autenticados (login, register) |
| `roleRedirectGuard` | Landing `/` — redirige según rol si ya está autenticado |
| `adminGuard` | Rutas admin (requiere rol `admin` o `dev`) |
| `verifiedGuard` | Verifica email confirmado |
| `roleGuard(roles[])` | Factory guard para roles específicos |

Los guards esperan carga de sesión antes de activar rutas (timeout de seguridad: 5s). Retornan `UrlTree` para compatibilidad con PendingTasks.

---

## Entidades Principales (Base de Datos)

### Tablas Core
- `profiles` - Perfiles con balance, roles, referral tracking
- `referrals` - Relaciones de referido
- `ptc_tasks` - Anuncios PTC disponibles
- `ptc_clicks` - Registro de clicks/interacciones
- `campaigns` - Campañas de anunciantes
- `withdrawal_requests` - Solicitudes de retiro
- `packages` - Tiers de suscripción
- `user_packages` - Paquetes activos por usuario
- `banner_ads` - Anuncios banner
- `activity_logs` - Auditoría del sistema

### Enums
- `user_role`: `dev | admin | guest | advertiser`
- `task_status`: `active | paused | completed`
- `campaign_status`: `draft | active | paused | completed`
- `withdrawal_status`: `pending | approved | rejected | completed`

### Migraciones (supabase/migrations/)
1. `001_phase1_initial_schema.sql` — Schema core
2. `002_referral_code_update.sql` — Códigos de referido
3. `003_packages_and_banners.sql` — Paquetes y banners
4. `004_fix_rls_policies.sql` — Políticas RLS
5. `005_business_logic_update.sql` — Triggers y funciones
6. `006_storage_buckets.sql` — Storage buckets
7. `007_sample_ads_and_banners.sql` — Datos de prueba

---

## Rutas de la Aplicación

| Ruta | Descripción | Guard |
|------|-------------|-------|
| `/` | Landing page | `roleRedirectGuard` |
| `/login` | Inicio de sesión | `guestGuard` |
| `/register` | Registro (código referido obligatorio) | `guestGuard` |
| `/ref/:code` | Link corto de referido | `guestGuard` |
| `/dashboard` | Dashboard de usuario | `authGuard` |
| `/dashboard/ads` | Anuncios PTC disponibles | `authGuard` |
| `/dashboard/wallet` | Wallet y balance | `authGuard` |
| `/dashboard/referrals` | Red de referidos | `authGuard` |
| `/dashboard/history` | Historial de actividad | `authGuard` |
| `/dashboard/settings` | Configuración de perfil | `authGuard` |
| `/admin` | Dashboard admin | `adminGuard` |
| `/admin/users` | Gestión de usuarios | `adminGuard` |
| `/admin/moderation` | Moderación de contenido | `adminGuard` |
| `/admin/reports` | Reportes y estadísticas | `adminGuard` |
| `/admin/settings` | Configuración de plataforma | `adminGuard` |
| `/admin/logs` | Logs del sistema | `adminGuard` |
| `/admin/packages` | Gestión de paquetes | `adminGuard` |
| `/admin/ads` | Gestión de anuncios | `adminGuard` |

---

## Convenciones de Código

### Componentes Angular
- **Standalone Components** (sin NgModules)
- Nomenclatura: `*.component.ts`, `*.component.html`, `*.component.scss`
- `ChangeDetectionStrategy.OnPush` para performance
- Signals para estado reactivo
- `inject()` para inyección de dependencias (NO constructor injection)

### Estilos
- **Mobile-first** con Tailwind CSS
- Paleta de colores (`tailwind.config.js`):
  - `primary`: `#00E5FF` (cyan)
  - `accent`: `#FF007F` (magenta)
  - `background-dark`: `#000000`
  - `card-dark`: `#121212`
  - `glass-dark`: `rgba(10,10,10,0.7)`
  - `sidebar-dark`: `#0a0a0a`
- Fuentes: Montserrat (display), Inter (body)
- Animaciones custom: `float`, `scroll`, `glow`
- Usar clases Tailwind en templates; evitar CSS custom innecesario
- Responsive: usar `sm:`, `md:`, `lg:`, `xl:` prefixes

### Servicios
- Retornar Observables para operaciones async con Supabase
- Manejar errores con RxJS `catchError`
- Cliente Supabase vía `getSupabaseClient()` (singleton en `core/supabase.client.ts`)

---

## Comandos Importantes

```bash
# Desarrollo
ng serve                              # Servidor de desarrollo
ng build                              # Build de producción
ng build --configuration=production

# SSR
node dist/publihazclick/server/server.mjs   # Servidor SSR producción

# Testing
ng test                               # Vitest

# Migraciones están en supabase/migrations/
```

---

## Configuración de Entorno

`src/environments/environment.ts`:
```typescript
{
  production: false,
  supabase: { url, anonKey, options: { persistSession, storageKey, autoRefreshToken, detectSessionInUrl } },
  redirect: { loginSuccess: '/dashboard', logoutSuccess: '/login', unauthorized: '/login' },
  whatsappNumber, whatsappDefaultMessage
}
```

---

## Notas de Arquitectura

- **SSR habilitado**: Angular SSR con Express para SEO y performance
- **Standalone components**: NO usar NgModules; importar directamente en cada componente
- **RLS activo**: Todas las tablas tienen Row Level Security en Supabase
- **Sistema de referidos**: Registro requiere código de referido obligatorio
- **Multi-rol**: Un usuario puede tener roles: `guest`, `advertiser`, `admin`, `dev`
- **Cliente Supabase**: Singleton via `getSupabaseClient()` — no instanciar directamente
- **Guards**: Retornan `UrlTree` (no `router.navigate`) para compatibilidad con PendingTasks de Angular
- **Prettier**: `printWidth: 100`, `singleQuote: true`, parser `angular` para HTML

---

## Guías de Desarrollo

### Agregar un Nuevo Componente
1. Crear carpeta en `components/` (landing), `features/{modulo}/components/` (feature) o `shared/components/` (reutilizable)
2. Archivos: `.ts`, `.html`, `.scss`
3. Usar `@Component({ standalone: true, changeDetection: ChangeDetectionStrategy.OnPush })`
4. Importar dependencias directamente (no NgModules)
5. Agregar ruta en `app.routes.ts` o en el feature correspondiente

### Agregar un Nuevo Servicio
1. Crear en `core/services/`
2. Usar `getSupabaseClient()` para DB access
3. Definir interfaces en `core/models/admin.model.ts` o `profile.model.ts`
4. Usar `inject()` en lugar de constructor injection
5. Exponer Observables, no Promises cuando sea posible

### Trabajar con Supabase
1. Usar servicios existentes antes de crear nuevos
2. Implementar RLS en migraciones SQL para toda tabla nueva
3. Agregar migración numerada en `supabase/migrations/`
