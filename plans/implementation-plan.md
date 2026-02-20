# Plan de Implementación - PublihazClick

## Resumen Ejecutivo

Este documento presenta el plan de implementación para PublihazClick, una plataforma de publicidad MLM con sistema de referidos, anuncios PTC, y múltiples módulos de monetización.

---

## Fase 1: Landing Page y Sistema de Registro (Prioridad Alta)

### 1.1 Landing Page - Sección de Anuncios Demo

**Objetivo:** Mostrar anuncios demo antes del login para atraer usuarios.

**Componentes a crear:**
- [`HeroSection`](src/app/components/hero/) - Ya existe
- [`DemoAdsSection`](src/app/components/demo-ads/) - Nueva sección
- [`HowItWorks`](src/app/components/how-it-works/) - Ya existe
- [`RegistrationCTA`](src/app/components/registration-cta/) - Nuevo componente

**Tipos de anuncios en landing:**
| Tipo | Precio | Reward Demo | Descripción |
|------|--------|-------------|-------------|
| Mega Anuncios | $2,000 COP | $10 a donaciones | Solo simulación |
| Anuncios (400) | $400 COP | $10 a donaciones | Ganancias potenciales |
| Anuncios (600) | $600 COP | $10 a donaciones | Ganancias potenciales |
| Mini Anuncios | $100 COP | Aviso educativo | Para familiarizarse |

**Lógica del modal de anuncios demo:**
- Al hacer click → Modal con video YouTube
- Contador 60 segundos
- CAPTCHA matemático
- $10 COP van a "donaciones" (simulación)
- Mensaje: "Esto es lo que podrías ganar si te conviertes en anunciante"

### 1.2 Sección "¿Cómo Funciona?" 

**Componentes:**
- Video explicativo del modelo de negocio
- Botón "Regístrate en PublihazClick"
- **Link de referido obligatorio** en el botón

### 1.3 Sistema de Registro

**Campos obligatorios:**
```
- Nombres y apellidos
- Número de WhatsApp
- Correo electrónico (Gmail)
- Avatar (link corto del referidor)
- Contraseña
- Repetir contraseña
- País
- Departamento/Estado/Provincia (depende del país)
- Ciudad
```

**Validaciones:**
- Link de referido OBLIGATORIO
- Si no hay referido → Mensaje: "Para registrarte en nuestro sitio necesitas el link de alguien que ya participe en nuestro sistema"
- Validación de correo Gmail
- Contraseñas deben coincidir

**Recuperación de contraseña:**
- Implementar "Olvidé mi contraseña"
- Envío de correo con link de recuperación

---

## Fase 2: Menú de Usuario (Prioridad Alta)

### 2.1 Estructura del Menú

```
Inicio
├── Mis Tareas (submenú)
│   ├── Tareas Diarias - Anuncios
│   ├── Tareas Diarias - Mini Anuncios
│   └── Mega Anuncios
├── Tablero (gráfico de rendimiento)
├── Tus Invitados (lista de referidos)
├── Líder (info del upline)
├── Calculadora de Ganancias
├── Historial de Retiros
├── Comunidad
│   ├── Amigos (red social)
│   └── Testimonios
├── Proyectos Donaciones
│   ├── Ver Proyectos
│   └── Sube tu Proyecto
├── Paquetes Publicitarios
│   ├── Información de Paquetes
│   ├── Métodos de Pago
│   └── Mis Paquetes
├── Administración de Publicaciones
│   ├── Crea tu publicidad PTC
│   └── Crea tu publicidad Banner
├── Recomienda y Gana (link de referido)
├── Mundo Sorteos (link WhatsApp)
├── Trading Automático
├── Resultado de mi Trading
├── Juegos y Diversión
├── Publitransporte
├── Monetiza tu Contenido
├── Paquetes SMS
├── Crea tu Tienda Virtual
├── Comunidad en WhatsApp
└── Cerrar Sesión
```

---

## Fase 3: Sistema de Anuncios PTC (Prioridad Alta)

### 3.1 Tipos de Anuncios

| Tipo | Duración | Precio Click | Acumulado Donaciones | Acumulado Retiro |
|------|----------|--------------|---------------------|------------------|
| Anuncios | 90 seg | $410 COP | $10 | $400 |
| Mini Anuncios | 60 seg | $83.33 COP | $0 | $83.33 |
| Mega Anuncios | 120 seg | $2,000 COP | $0 | $2,000 |

### 3.2 Distribución de Anuncios por Paquete

**Paquete Básico ($25 USD) - Categoría JADE:**
- 5 anuncios diarios × 30 días
- 4 mini anuncios diarios × 30 días
- No acumulables

**Paquete Básico Plus ($50 USD):**
- Similar distribución
- Mayor pago por click

**Paquete Avanzado ($100 USD):**
- Categoría ESMERALDA
- Mayor rendimiento

**Paquete Avanzado Pro ($150 USD):**
- Máximos beneficios

### 3.3 Creación de Anuncio PTC

**Requisitos:**
- Título del anuncio
- Imagen cuadrada O video
- Link de redirección
- Descripción
- Botón previsualización
- **Botón "Clonar Anuncio"** para usar anuncios existentes

### 3.4 Sistema de Interacción

- Like en anuncios
- Comentarios en anuncios
- Compartir anuncios

---

## Fase 4: Sistema de Categorías y Ganancias (Prioridad Media)

### 4.1 Tabla de Categorías

| Categoría | Invitados Activos | Anuncios Propios | Mini Anuncios |
|-----------|-------------------|-------------------|----------------|
| JADE | 0-2 | 5/día | 4/día |
| PERLA | 3-5 | 5/día | 4/día |
| ZAFIRO | 6-9 | 5/día | 4/día |
| RUBY | 10-19 | 5/día | 4/día |
| ESMERALDA | 20-25 | 5/día | 4/día |
| DIAMANTE | 26-30 | 5/día | 4/día |
| DIAMANTE AZUL | 31-35 | 5/día | 4/día |
| DIAMANTE NEGRO | 36-39 | 5/día | 4/día |
| DIAMANTE CORONA | 40+ | 5/día | 4/día |

### 4.2 Calculadora de Ganancias

**Datos para implementación:**

```
N°INVITADOS | CATEGORÍA | TUS CLICKS | CLICKS INVITADOS | GANANCIA MES
1           | JADE      | $70,000    | $28,000          | $98,000
2           | JADE      | $70,000    | $56,000          | $126,000
3           | PERLA     | $70,000    | $138,000         | $208,000
4           | PERLA     | $70,000    | $184,000         | $254,000
5           | PERLA     | $70,000    | $230,000         | $300,000
6           | ZAFIRO    | $70,000    | $384,000         | $454,000
7           | ZAFIRO    | $70,000    | $448,000         | $518,000
8           | ZAFIRO    | $70,000    | $512,000         | $582,000
9           | ZAFIRO    | $70,000    | $576,000         | $646,000
10          | RUBY      | $70,000    | $820,000         | $890,000
11-19       | RUBY      | $70,000    | [varían]         | [varían]
20-25       | ESMERALDA | $70,000    | [varían]         | [varían]
26-30       | DIAMANTE  | $70,000    | [varían]         | [varían]
31-35       | DIAMANTE AZUL | $70,000 | [varían]        | [varían]
36-39       | DIAMANTE NEGRO| $70,000 | [varían]        | [varían]
40+         | DIAMANTE CORONA| $70,000 | [varían]       | [varían]
```

### 4.3 Comisiones por Referidos

**Por compra de paquete de invitado:**

| Paquete Invitado | Mega Anuncios | Comisión por Click | Mini Desbloqueados |
|------------------|---------------|--------------------|--------------------|
| $25 USD | 5 × $2,000 | $100/día × 30 días | 1 mini |
| $50 USD | 10 × $2,000 | $200/día × 30 días | 2 mini |
| $100 USD | 20 × $2,000 | $400/día × 30 días | 4 mini |
| $150 USD | 30 × $2,000 | $400/día × 30 días | 5 mini |

**Categorías multinivel (Diamante Corona+):**
- 2° nivel: $20/click
- 3° nivel: $30/click
- 4° nivel: $40/click
- 5° nivel: $50/click
- 6° nivel: $60/click

---

## Fase 5: Sistema de Retiros (Prioridad Media)

### 5.1 Estados de Solicitud

```
[En Proceso] → [Rechazado] o [Pago Exitoso]
```

### 5.2 Workflow

1. Usuario solicita retiro
2. Admin revisa datos (nombre titular = nombre registro)
3. Si no coincide → Rechazado
4. Si coincide → Admin sube comprobante + comentario obligatorio
5. Usuario debe comentar el pago
6. El comentario + imagen se publica en Testimonios
7. Opción de traducir comentarios

---

## Fase 6: Módulos Adicionales (Prioridad Baja)

### 6.1 Comunidad - Red Social
- Chat entre amigos
- Solicitudes de amistad
- Likes y comentarios
- Timeline

### 6.2 Proyectos Donaciones
- Admin sube videos de obras sociales
- Usuarios con paquete activo pueden proponer proyectos

### 6.3 Métodos de Pago
- Nequi
- Bancolombia
- Daviplata
- Epayco
- Binance
- PayPal
- Stripe

### 6.4 Módulos con Códigos Externos
- Trading Automático
- Resultado de mi Trading
- Juegos y Diversión
- Publitransporte
- Monetiza tu Contenido
- Paquetes SMS
- Crea tu Tienda Virtual

---

## Estructura de Base de Datos - Entidades Principales

```mermaid
erDiagram
    User ||--|| Profile : has
    User ||--|| Package : has
    User ||--|| Wallet : has
    User ||--|| Referral : "referred_by"
    User ||--o{ Referral : "referrals"
    User ||--o{ PtcAd : creates
    User ||--o{ BannerAd : creates
    User ||--o{ Withdrawal : requests
    User ||--o{ DonationProject : proposes
    
    Package ||--|| PackageType : is_type
    PackageType ||--|| Category : determines
    
    PtcAd ||--|| PtcAdType : is_type
    PtcAd ||--o{ PtcClick : receives
    
    Withdrawal ||--|| WithdrawalStatus : has
    WithdrawalStatus : "en_proceso, rechazado, exitoso"
    
    Category ||--|| TierLevel : determines
    TierLevel : "JADE, PERLA, ZAFIRO, RUBY, ESMERALDA, DIAMANTE, DIAMANTE_AZUL, DIAMANTE_NEGRO, DIAMANTE_CORONA"
```

---

## Orden de Implementación Sugerido

1. **Semana 1-2:** Landing page + Anuncios Demo + Video How-it-works
2. **Semana 3:** Sistema de Registro con referido obligatorio
3. **Semana 4:** Menú de usuario + Dashboard
4. **Semana 5-6:** Sistema de Anuncios PTC
5. **Semana 7:** Sistema de Categorías + Calculadora
6. **Semana 8:** Sistema de Retiros + Testimonios
7. **Semana 9:** Comunidad + Proyectos Donaciones
8. **Semana 10:** Métodos de pago + Integración códigos externos
9. **Semana 11-12:** Testing y ajustes

---

## Notas Técnicas

- Usar Angular 17+ con signals
- Supabase para base de datos
- Autenticación con JWT
- Implementar RLS (Row Level Security)
- Calendario para distribución diaria de anuncios
- Sistema de notificaciones en tiempo real

---

*Documento generado para planificación de implementación de PublihazClick*
