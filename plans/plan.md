# Plan de Desarrollo - PublihazClick PTC Platform

## Visión General
Plataforma PTC (Paid To Click) donde empresas publican publicidad en forma de banners y tareas PTC. Los usuarios ganan dinero haciendo clic en anuncios y los anunciantes pagan por visibilidad.

**Modelo de Registro**: Solo mediante invitación (código de referido) o creación por Admin.

---

## Fase 1: Sistema de Usuarios, Perfiles y Referidos

### 1.1 Sistema de Roles
- **Roles definidos**:
  | Rol | Descripción | Permisos |
  |-----|-------------|----------|
  | `dev` | Desarrollador | Acceso total, gestión de admins |
  | `admin` | Administrador | Gestión de usuarios, campañas, pagos |
  | `guest` (invitado) | Usuario sin cuenta | Puede ver landing, necesita invitación |
  | `advertiser` | Anunciante | Crear campañas, gestionar publicidad |

### 1.2 Extender Sistema de Auth con Perfiles
- **Objetivo**: Conectar autenticación Supabase con tabla de perfiles
- **Tareas**:
  - [ ] Crear tabla `profiles` en Supabase con campos:
    - `id` (uuid, FK a auth.users)
    - `username` (varchar, UNIQUE) - nombre de usuario único
    - `referral_code` (varchar, UNIQUE) - código de referido único
    - `referred_by` (uuid, FK a profiles) - quién refiere
    - `email` (varchar)
    - `full_name` (varchar)
    - `avatar_url` (text)
    - `role` (enum: 'dev', 'admin', 'guest', 'advertiser')
    - `level` (integer, solo para advertisers)
    - `is_active` (boolean) - si está activo (solo admins pueden activar)
    - `balance` (decimal, saldo disponible)
    - `pending_balance` (decimal, saldo pendiente)
    - `total_earned` (decimal, total ganado)
    - `total_spent` (decimal, total gastado)
    - `referral_earnings` (decimal, ganancias por referidos)
    - `created_at` (timestamp)
    - `updated_at` (timestamp)
  - [ ] Crear trigger para auto-crear perfil al registrar usuario
  - [ ] Generar código de referido único (8 caracteres alfanumérico)
  - [ ] Validar username único

### 1.3 Sistema de Referidos
- **Estructura**:
  ```
  Usuario A (referral_code: ABC123)
       └── Referidos directos (referred_by = A)
            ├── Usuario B
            ├── Usuario C
            └── Usuario D
  ```
- **Funcionalidades**:
  - [ ] Cada usuario tiene código de referido único
  - [ ] Solo admins pueden crear usuarios sin referido
  - [ ] Registro requiere código de referido válido
  - [ ] Panel de referidos mostrando:
    - Total referidos activos
    - Lista de referidos con su nivel
    - Ganancias por referidos
- **Tabla referidos**:
  - `referrals`: Historial de referidos
    - `id`, `referrer_id` (FK a profiles)
    - `referred_id` (FK a profiles)
    - `referred_username` (copia para historial)
    - `referred_level` (nivel del referido)
    - `earnings` (ganancias generadas)
    - `created_at`

### 1.4 Sistema de Niveles para Anunciantes
- **Niveles**:
  | Nivel | Requisitos | Beneficios |
  |-------|------------|------------|
  | 1 - Básico | Nuevo | Hasta 5 campañas, 100 clicks/día |
  | 2 - Bronce | $50 gastados | Hasta 10 campañas, 500 clicks/día |
  | 3 - Plata | $200 gastados | Hasta 20 campañas, 2000 clicks/día |
  | 4 - Oro | $500 gastados | Hasta 50 campañas, ilimitados clicks |
  | 5 - Platino | $1000 gastados | Prioridad, soporte dedicado |

### 1.5 Modificar Auth Actual
- **Cambios en registro**:
  - [ ] Eliminar registro público (solo con código)
  - [ ] Agregar campo código de referido en registro
  - [ ] Validar código existente antes de permitir registro
  - [ ] Endpoint admin para crear usuarios directamente

---

## Fase 2: Dashboard de Usuario ( PTC Tasks )

### 2.1 Estructura del Dashboard
- **Ruta**: `/dashboard`
- **Componentes**:
  - Sidebar navegación
  - Stats overview (balance, clicks hoy, ganancias)
  - Lista de PTC tasks disponibles
  - Historial de clicks completados

### 2.2 Sistema de PTC Tasks
- **Tablas necesarias**:
  - `ptc_tasks`: Anuncios que los usuarios ven
    - `id`, `title`, `description`, `url`, `image_url`
    - `reward` (decimal, ganancia por click)
    - `duration` (integer, segundos requeridos)
    - `daily_limit` (integer)
    - `total_clicks` (integer)
    - `status` (enum: 'active', 'paused', 'completed')
    - `advertiser_id` (FK a profiles)
    - `created_at`
  - `ptc_clicks`: Historial de clicks
    - `id`, `user_id`, `task_id`, `reward_earned`
    - `completed_at`, `status`

### 2.3 Timer de Seguridad PTC
- Implementar tiempo mínimo de visualización (15-30 segundos)
- Validar que usuario realmente vio el anuncio

---

## Fase 3: Dashboard de Anunciante

### 3.1 Ruta y Estructura
- **Ruta**: `/advertiser`
- **Secciones**:
  - Overview: Campañas activas, presupuesto, clicks comprados
  - Mis Campañas: Listado y gestión
  - Crear Campaña: Formulario
  - Estadísticas: Gráficos de rendimiento
  - Pagos: Historial de pagos

### 3.2 Sistema de Campañas
- **Tablas**:
  - `campaigns`: Campañas de publicidad
    - `id`, `advertiser_id`, `name`, `description`
    - `type` (enum: 'banner', 'ptc', 'both')
    - `budget` (decimal)
    - `daily_budget` (decimal)
    - `bid_per_click` (decimal)
    - `status` (enum: 'draft', 'active', 'paused', 'completed')
    - `start_date`, `end_date`
    - `created_at`, `updated_at`
  - `banners`: Banners para campañas
    - `id`, `campaign_id`, `name`, `url`
    - `width`, `height`, `position`

---

## Fase 4: Sistema de Pagos y Retiros

### 4.1 Wallet del Usuario
- **Tabla**: `wallets`
  - `id`, `user_id`, `balance`, `pending_balance`
  - `total_withdrawn`, `created_at`

### 4.2 Solicitudes de Retiro
- **Tabla**: `withdrawal_requests`
  - `id`, `user_id`, `amount`, `method`
  - `status` (enum: 'pending', 'approved', 'rejected', 'completed')
  - `processed_at`

### 4.3 Métodos de Pago
- Soporte para: PayPal, Binance, transferencia bancaria (Colombia)

---

## Fase 5: Panel de Admin

### 5.1 Rutas de Admin
- `/admin` - Dashboard general
- `/admin/users` - Gestión de usuarios
- `/admin/campaigns` - Gestión de campañas
- `/admin/withdrawals` - Aprobar/rechazar retiros

### 5.2 Funcionalidades Admin
- [ ] Crear usuarios manualmente (sin código referido)
- [ ] Activar/desactivar usuarios
- [ ] Asignar roles
- [ ] Ver estadísticas globales
- [ ] Aprobar retiros

---

## Fase 6: Componentes UI

### 6.1 Estructura de Archivos
```
src/app/
├── components/
│   ├── dashboard/
│   │   ├── dashboard-layout.component.ts
│   │   ├── user-sidebar.component.ts
│   │   ├── advertiser-sidebar.component.ts
│   │   ├── admin-sidebar.component.ts
│   │   ├── stats-card.component.ts
│   │   └── ptc-task-list.component.ts
│   ├── profile/
│   │   ├── profile-form.component.ts
│   │   └── referral-panel.component.ts
│   └── campaigns/
│       ├── campaign-list.component.ts
│       ├── campaign-form.component.ts
│       └── banner-upload.component.ts
├── features/
│   ├── dashboard/
│   │   └── user-dashboard.component.ts
│   ├── advertiser/
│   │   └── advertiser-dashboard.component.ts
│   ├── admin/
│   │   ├── admin-dashboard.component.ts
│   │   └── user-management.component.ts
│   └── profile/
│       └── profile.component.ts
└── core/
    └── services/
        ├── profile.service.ts
        ├── referral.service.ts
        ├── ptc.service.ts
        ├── campaign.service.ts
        └── payment.service.ts
```

---

## Estructura de Base de Datos (SQL Actualizado)

```sql
-- Enums
CREATE TYPE user_role AS ENUM ('dev', 'admin', 'guest', 'advertiser');
CREATE TYPE task_status AS ENUM ('active', 'paused', 'completed');
CREATE TYPE campaign_status AS ENUM ('draft', 'active', 'paused', 'completed');
CREATE TYPE withdrawal_status AS ENUM ('pending', 'approved', 'rejected', 'completed');

-- Tabla Profiles (usuarios)
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username VARCHAR(50) UNIQUE NOT NULL,
  referral_code VARCHAR(8) UNIQUE NOT NULL,
  referred_by UUID REFERENCES profiles(id),
  email VARCHAR(255) NOT NULL,
  full_name VARCHAR(255),
  avatar_url TEXT,
  role user_role DEFAULT 'guest',
  level INTEGER DEFAULT 1,
  is_active BOOLEAN DEFAULT FALSE,  -- requiere activación por admin
  balance DECIMAL(12,2) DEFAULT 0,
  pending_balance DECIMAL(12,2) DEFAULT 0,
  total_earned DECIMAL(12,2) DEFAULT 0,
  total_spent DECIMAL(12,2) DEFAULT 0,
  referral_earnings DECIMAL(12,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabla de Referidos
CREATE TABLE referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  referred_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  referred_username VARCHAR(50),
  referred_level INTEGER DEFAULT 1,
  earnings DECIMAL(12,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(referred_id)  -- solo un referidor por usuario
);

-- Tabla PTC Tasks
CREATE TABLE ptc_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(255) NOT NULL,
  description TEXT,
  url TEXT NOT NULL,
  image_url TEXT,
  reward DECIMAL(10,2) NOT NULL,
  duration INTEGER DEFAULT 15,
  daily_limit INTEGER DEFAULT 1000,
  total_clicks INTEGER DEFAULT 0,
  status task_status DEFAULT 'active',
  advertiser_id UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabla PTC Clicks
CREATE TABLE ptc_clicks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id),
  task_id UUID REFERENCES ptc_tasks(id),
  reward_earned DECIMAL(10,2) NOT NULL,
  completed_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabla Campaigns
CREATE TABLE campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  advertiser_id UUID REFERENCES profiles(id),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  campaign_type VARCHAR(50) DEFAULT 'ptc',
  budget DECIMAL(12,2) NOT NULL,
  daily_budget DECIMAL(12,2),
  bid_per_click DECIMAL(10,2) NOT NULL,
  status campaign_status DEFAULT 'draft',
  start_date DATE,
  end_date DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabla Withdrawal Requests
CREATE TABLE withdrawal_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id),
  amount DECIMAL(10,2) NOT NULL,
  method VARCHAR(50) NOT NULL,
  details JSONB,
  status withdrawal_status DEFAULT 'pending',
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Functions
-- Generar código de referido único
CREATE OR REPLACE FUNCTION generate_referral_code()
RETURNS VARCHAR(8) AS $$
DECLARE
  code VARCHAR(8);
BEGIN
  LOOP
    code := upper(substring(md5(random()::text) from 1 for 8));
    EXIT WHEN NOT EXISTS (SELECT 1 FROM profiles WHERE referral_code = code);
  END LOOP;
  RETURN code;
END;
$$ LANGUAGE plpgsql;

-- Trigger para crear perfil automáticamente
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  new_username VARCHAR(50);
  new_code VARCHAR(8);
BEGIN
  -- Generar username único desde email
  new_username := split_part(NEW.email, '@', 1);
  new_username := substring(new_username from 1 for 30);
  
  -- Asegurar uniqueness
  IF EXISTS (SELECT 1 FROM profiles WHERE username = new_username) THEN
    new_username := new_username || floor(random() * 1000)::TEXT;
  END IF;
  
  -- Generar código de referido
  new_code := generate_referral_code();
  
  INSERT INTO profiles (id, username, referral_code, email, role, is_active)
  VALUES (NEW.id, new_username, new_code, NEW.email, 'guest', FALSE);
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
```

---

## Orden de Implementación

1. **Semana 1**: Modificar auth y crear tabla profiles con referidos
2. **Semana 2**: Panel admin para gestión de usuarios
3. **Semana 3**: Registro con código de referido
4. **Semana 4**: Dashboard usuario y PTC tasks
5. **Semana 5**: Dashboard anunciante y campañas
6. **Semana 6**: Sistema de pagos y retiros

---

## Rutas Actualizadas

```typescript
// app.routes.ts
export const routes: Routes = [
  // Auth (solo login - registro solo por admin o referido)
  { path: 'login', loadComponent: () => ... },
  { path: 'register/:code', loadComponent: () => ... }, // con código
  { path: 'auth/callback', loadComponent: () => ... },
  
  // Dashboards con guards por rol
  { path: 'dashboard', loadComponent: () => ..., canActivate: [authGuard] },
  { path: 'advertiser', loadComponent: () => ..., canActivate: [authGuard] },
  { path: 'admin', loadComponent: () => ..., canActivate: [adminGuard] },
  
  // Landing
  { path: '', loadComponent: () => ... },
  { path: '**', redirectTo: '' }
];
```
