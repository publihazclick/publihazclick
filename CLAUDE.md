# Publihazclick - Plataforma PTC

## Descripción del Proyecto

Publihazclick es una plataforma PTC (Paid To Click) - una red social que paga a los usuarios por ver anuncios. Conecta anunciantes que desean promocionar sus productos/servicios con usuarios que ganan dinero por interactuar con contenido publicitario.

### Funcionalidades Principales

- **Para Usuarios**: Ganar dinero viendo anuncios PTC, sistema de referidos multinivel, cartera/wallet, retiros
- **Para Anunciantes**: Creación de campañas publicitarias, configuración de presupuestos, gestión de anuncios
- **Para Administradores**: Panel con métricas en tiempo real, moderación, gestión de usuarios y retiros

---

## Stack Tecnológico

| Categoría | Tecnología |
|-----------|------------|
| Framework | Angular 21.1 (Standalone Components) |
| Lenguaje | TypeScript 5.9 |
| SSR | Angular SSR con Express |
| Estilos | Tailwind CSS 3.4.19 |
| UI/UX | Lucide Angular, Material Symbols, Google Fonts |
| Backend | Supabase (PostgreSQL + Auth + RLS) |
| Testing | Vitest |
| Build | Angular CLI 21.1 |

---

## Arquitectura del Proyecto

```
src/app/
├── components/          # Landing page sections
│   ├── header/         # Navegación principal
│   ├── hero/           # Sección principal
│   ├── features/       # Características
│   ├── how-it-works/   # Cómo funciona
│   ├── business-models/# Modelos de negocio
│   ├── pricing/        # Precios y paquetes
│   ├── testimonials/   # Testimonios
│   ├── recent-posts/   # Publicaciones
│   ├── banner-slider/  # Estadísticas
│   └── footer/         # Pie de página
├── core/               # Lógica central
│   ├── guards/         # AuthGuard, AdminGuard
│   ├── interceptors/   # HttpAuthInterceptor
│   ├── models/         # Interfaces TypeScript
│   ├── providers/      # Configuración (lucide-icons)
│   └── services/       # AuthService, ProfileService
├── features/           # Módulos funcionales
│   ├── auth/           # Login, Register, Logout, Callback
│   └── admin/          # Dashboard, Users, Moderation, etc.
├── app.ts              # Componente raíz
├── app.routes.ts       # Rutas principales
└── app.config.ts       # Configuración de la app
```

---

## Convenciones de Código

### Componentes Angular
- Usar **Standalone Components** (sin NgModules)
- Nomenclatura: `*.component.ts`, `*.component.html`, `*.component.scss`
- Usar `ChangeDetectionStrategy.OnPush` para performance
- Signals para estado reactivo

### Estilos
- **Mobile-first** con Tailwind CSS
- Paleta de colores definida en `tailwind.config.js`:
  - Primary: `#00E5FF` (cyan)
  - Accent: `#FF007F` (magenta)
  - Background: `#000000` (dark)
- Fuentes: Montserrat (display), Inter (body)

### Servicios
- Usar `inject()` para inyección de dependencias
- Retornar Observables para operaciones async con Supabase
- Manejar errores con RxJS catchError

---

## Entidades Principales (Base de Datos)

### Tablas Core
- `profiles` - Perfiles de usuarios con sistema de referidos
- `referrals` - Registro de relaciones de referido
- `ptc_tasks` - Anuncios/tareas disponibles
- `ptc_clicks` - Registro de interacciones
- `campaigns` - Campañas publicitarias
- `withdrawal_requests` - Solicitudes de retiro

### Enums
- `user_role`: dev, admin, guest, advertiser
- `task_status`: active, paused, completed
- `campaign_status`: draft, active, paused, completed
- `withdrawal_status`: pending, approved, rejected, completed

---

## Comandos Importantes

```bash
# Desarrollo
ng serve                    # Servidor de desarrollo
ng build                    # Build de producción
ng build --configuration=production

# Testing
ng test                     # Ejecutar tests con Vitest

# Base de datos (Supabase)
# Las migraciones están en supabase/migrations/
```

---

## Rutas de la Aplicación

| Ruta | Descripción | Protección |
|------|-------------|------------|
| `/` | Landing page | Pública |
| `/login` | Inicio de sesión | Pública |
| `/register` | Registro (requiere código referido) | Pública |
| `/admin` | Dashboard admin | Admin/Dev |
| `/admin/users` | Gestión usuarios | Admin/Dev |
| `/admin/moderation` | Moderación contenido | Admin/Dev |
| `/admin/reports` | Reportes | Admin/Dev |
| `/admin/settings` | Configuraciones | Admin/Dev |
| `/admin/logs` | Logs del sistema | Admin/Dev |

---

## Configuración de Entorno

El archivo `src/environments/environment.ts` contiene:
- `supabaseUrl`: URL del proyecto Supabase
- `supabaseKey`: Anon Key para autenticación
- Configuración de persistencia de sesión

---

## Guías de Desarrollo

### Agregar un Nuevo Componente
1. Crear carpeta en la ubicación apropiada (`components/` o `features/{modulo}/components/`)
2. Generar archivos: `.ts`, `.html`, `.scss`
3. Usar `@Component({ standalone: true, ... })`
4. Importar dependencias directamente en el componente
5. Agregar ruta en `app.routes.ts` o feature routes si aplica

### Trabajar con Supabase
1. Usar los servicios existentes (`AuthService`, `ProfileService`)
2. Para nuevas entidades, crear servicio en `core/services/`
3. Definir interfaces en `core/models/`
4. Implementar RLS en migraciones SQL

### Reglas de Diseño
- Mantener consistencia con la paleta de colores existente
- Usar clases de Tailwind en templates (evitar CSS custom excesivo)
- Responsive: usar `sm:`, `md:`, `lg:`, `xl:` prefixes
- Iconos: usar Lucide Angular (`lucide-angular` package)

---

## Notas de Arquitectura

- **SSR habilitado**: La app usa Angular SSR con Express para mejor SEO y performance inicial
- **Standalone components**: No usar NgModules, importar directamente en componentes
- **Row Level Security**: Todas las tablas de Supabase tienen RLS activado
- **Sistema de referidos**: Los usuarios deben registrarse con un código de referido obligatorio
- **Multi-rol**: Un usuario puede tener múltiples roles (guest, advertiser, admin, dev)
