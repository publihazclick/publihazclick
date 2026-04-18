# Publicar Movi Conductor en iOS App Store

Esta guía requiere **Mac + Xcode** (Windows NO puede compilar apps iOS).

## Prerequisitos
- Mac con macOS 14+
- Xcode 15+ instalado desde App Store
- **Apple Developer Program** activo ($99 USD/año) — https://developer.apple.com/programs
- Cuenta App Store Connect configurada

## Setup único

```bash
# 1. Clonar repo en el Mac
git clone <tu-repo>
cd publihazclick

# 2. Instalar dependencias
npm install

# 3. Añadir plataforma iOS
npx cap add ios

# 4. Build Angular
npm run build

# 5. Sync assets a iOS
npx cap sync ios

# 6. Abrir Xcode
npx cap open ios
```

## Configurar permisos en iOS (Info.plist)

Xcode → Project → ios/App/App → Info.plist. Añade estas entradas:

```xml
<key>NSLocationWhenInUseUsageDescription</key>
<string>Movi usa tu ubicación para mostrarte viajes cercanos y permitir que los pasajeros vean dónde estás.</string>

<key>NSLocationAlwaysAndWhenInUseUsageDescription</key>
<string>Movi Conductor necesita ubicación en background para seguir recibiendo solicitudes cuando la app no está abierta.</string>

<key>NSLocationAlwaysUsageDescription</key>
<string>Movi Conductor necesita ubicación en background para seguir recibiendo solicitudes cuando la app no está abierta.</string>

<key>UIBackgroundModes</key>
<array>
  <string>location</string>
  <string>fetch</string>
  <string>remote-notification</string>
</array>

<key>NSCameraUsageDescription</key>
<string>Movi usa la cámara para subir documentos de verificación.</string>

<key>NSPhotoLibraryUsageDescription</key>
<string>Movi accede a tus fotos para subir documentos del vehículo.</string>
```

## Firma de código (Signing)

1. Xcode → App → Signing & Capabilities
2. "Automatically manage signing" ✓
3. Team: seleccionar tu Apple Developer Team
4. Bundle Identifier: `com.publihazclick.movi` (único a nivel global)
5. Capabilities → añadir: **Background Modes**, **Push Notifications**, **Location Services**

## Build para App Store

```bash
# 1. Product → Scheme → Edit Scheme → Run → Release
# 2. Product → Archive (esto genera un .ipa firmado)
# 3. Window → Organizer → Distribute App
# 4. App Store Connect → Upload
```

## Submit a App Store Connect

1. https://appstoreconnect.apple.com → My Apps → +
2. Nombre: **Movi Conductor**
3. Primary Language: Spanish
4. Bundle ID: `com.publihazclick.movi`
5. SKU: `movi-driver-001`

### Requisitos de ficha

- **Descripción**: "Movi Conductor es la app oficial para manejar con Movi, la plataforma de transporte colombiana donde tú decides el precio."
- **Keywords**: taxi, movi, conductor, transporte, indriver, uber, colombia
- **Support URL**: https://publihazclick.com/anda-gana
- **Privacy Policy URL**: https://publihazclick.com/privacy
- **Categoría primaria**: Business
- **Categoría secundaria**: Travel

### Capturas requeridas

- iPhone 6.7" (1290×2796) — 3 mín, 10 máx
- iPhone 6.5" (1284×2778) — mismo conteo
- iPhone 5.5" (1242×2208) — mismo conteo

### App Review

- Usuario test: crear un conductor y un pasajero de prueba
- Contraseñas: documentar en "App Review Information"
- Notes: "App de ride-hailing. Modelo inDriver (oferta/contraoferta). Para probar: registrarse como conductor, ir a modo online, aceptar una solicitud desde otra cuenta."

### Tiempo de revisión
Apple revisa en 24-72 horas.

## Después de aprobado

```bash
# Actualizar versiones iOS: Xcode → General → Version/Build
# Rebuild Archive → Distribute → Upload
# App Store Connect → Submit for Review
```

## Troubleshooting común

- **"Provisioning profile doesn't include push entitlement"**: activar Push Notifications en Capabilities.
- **Background location rejected**: asegurar que `UIBackgroundModes` tiene `location` Y el uso se justifica en `NSLocationAlwaysUsageDescription`.
- **Rejected por guideline 4.0 (Minimum Functionality)**: Apple exige que una app de ride-hailing tenga pagos integrados Y verificación de conductor. Ambos ya están (ePayco + KYC).

## Costo total

- Apple Developer Program: $99/año
- App Store Connect: gratis
- TestFlight para betas: gratis (hasta 10,000 beta testers)
