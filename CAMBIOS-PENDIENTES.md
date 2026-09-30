# Cambios pendientes de subir a producción

> **Cómo funciona esto.** Cada cambio se trabaja y se commitea **en local**, sin push.
> Se anota acá abajo. Cuando el usuario diga *"vamos a subir los cambios a producción"*,
> se hace **un solo push** y todo sale junto.
>
> **Por qué.** Cloudflare Pages (plan gratuito) da **500 builds al mes** y cada push a
> `main` dispara uno, sin importar qué archivo se tocó. El 2026-09-05 se gastaron 7
> builds en un día, y 4 de ellos fueron por cambios que solo tocaban `supabase/**` —
> archivos que no cambian el sitio web en absoluto.

---

## Pendiente de subir

_(vacío — lo de abajo ya salió en el push de hoy, commit `8c9ef25`)_

---

## Subido el 2026-09-30, tarde (commit 8c9ef25)

### Plan de cierre: acortar el camino al link, urgencia honesta, prueba social real
- **Qué**: auditado el embudo completo — de 27 leads que sí califican, solo 6 se registraron
  (22%). El hueco más grande: 16 de 27 (59%) vieron el link y nunca confirmaron que lo abrieron.
  Cuatro cambios: (1) el link ahora sale apenas se elige el vehículo, sin esperar a confirmar el
  año — se reusa el camino de "No estoy seguro" que ya existía; (2) urgencia honesta ligada a la
  ventana real de 24h de WhatsApp; (3) prueba social real (conteo en vivo de conductores
  activos, nunca inventado); (4) los recordatorios 2 y 3 ahora distinguen en qué paso se quedó
  cada quien, en vez de mandar el mismo mensaje genérico a todos.
- **Toca**: `supabase` solamente.
- **Estado**: ✅ desplegado y verificado — probado en producción disparando los recordatorios
  2 y 3 reales contra un número de prueba, contenido distinto en cada uno.

### Videos en el bot de conductores (trabajo de otra sesión, publicado hoy)
- **Qué**: 4 videos reales (tutorial, recargas, gana invitando; uno apagado a propósito porque
  sus cifras no cuadran) que el bot manda en el momento de la conversación en que sirven.
  Migración 293 ya estaba aplicada; el código quedó sin desplegar hasta hoy.
- **Estado**: ✅ revisado, verificado contra el mismo patrón ya probado (subida de notas de voz
  a Meta), y desplegado junto con el plan de cierre.

### La app no guiaba bien al conductor para recoger al pasajero
- **Qué**: varios conductores reportaron que al dar *"Ir a recoger pasajero"* la app no los
  guía y que **no se ven a sí mismos en el mapa**. Eran **cinco causas acumuladas**, todas
  del lado conductor:
  1. **El marcador del conductor nunca se movía.** `_userMarker.setLngLat()` se llama en
     exactamente cuatro sitios del componente y **los cuatro son del lado pasajero**
     (`_startPassengerWatch`, `selectAddress`, `selectRecentOrigin`). El watch del conductor
     actualizaba `_currentLat/_currentLng`, la base y la **cámara**, pero jamás el marcador:
     el punto quedaba clavado donde se creó el mapa mientras la cámara se centraba en la
     posición real, así que su punto derivaba fuera de la pantalla.
  2. **Un solo umbral de precisión, y estricto.** El watch arrancaba con
     `if (accuracy > 50) return`: con 51 m no pasaba nada — ni marcador, ni cámara, ni voz,
     ni ETA, ni recálculo — en silencio, sin log ni aviso. Al revés de lo razonable: el watch
     del **pasajero** acepta hasta 300 m. Ahora hay dos umbrales (≤200 m para pintar y
     seguir, ≤50 m para recalcular ruta y autofinalizar) más un aviso *"Señal GPS débil"*.
  3. **Ningún pin en el punto de recogida.** `startInAppNav` dibujaba solo la línea; el único
     pin que existía lo crea `_drawRoute()`, que es la vista previa del **pasajero**. Veía una
     línea azul terminando en la nada.
  4. **El paneo no soltaba la cámara.** `dragstart` marcaba `driverMapPanned` pero no apagaba
     `_navFollowActive`, que es lo único que consulta la cámara de navegación: cada lectura de
     GPS le arrastraba el mapa de vuelta. CENTRAR ahora vuelve a engancharlo y acerca a zoom
     17 (a 15 no se distinguen los giros).
  5. **Sin rumbo no hay guía.** `pos.coords.heading` llega `null` muy seguido en Android a
     baja velocidad y la cámara se quedaba mirando al norte con pitch de 50°. Ahora se calcula
     del desplazamiento real y el marcador tiene flecha de dirección.
- **Extra**: el marcador del conductor era `draggable` y su `dragend` sobrescribe
  `_currentLat/_currentLng` — un roce con el pulgar le movía el origen desde donde se calcula
  la ruta. Se apaga al pasar a conductor.
- **Toca**: `web` solamente.
- **Verificado**: `tsc --noEmit` y **`ngc -p tsconfig.app.json`** en verde (ngc sí revisa las
  plantillas de Angular, `tsc` no).
- **Ojo**: `capacitor.config.ts` apunta a `https://www.publihazclick.com/anda-gana`, así que
  este cambio **llega al APK ya instalado sin recompilar ni publicar en Play Store**.
- **Falta**: prueba en calle con un conductor real. Debe ver su punto moviéndose con la flecha
  hacia donde va, el pin verde del pasajero, y el mapa quieto si lo mueve con el dedo.
- **Commit**: `32d9e32`

---

## Subido el 2026-09-30 (parte Supabase, ya desplegada antes del push)

Estos ya están **vivos en producción** (migraciones aplicadas por Management API y edge
functions desplegadas); viajan en este push solo para que el repo deje de estar desfasado.

### Captación automática de conductores desde la pauta de Facebook
- **Migraciones 285 y 287** + `ag-whatsapp`: embudo con botones (moto/carro/sin vehículo → año
  del vehículo → descarga), seguimiento a 20 min / 3 h / 20 h dentro de la ventana de 24h de
  Meta, y envío programado a las 9 a.m. para los leads que quedaron sin atender.
- **Por qué**: la primera noche de pauta llegaron 10 leads y los 10 recibieron "Ya te conecto
  con un asesor"; esperaron entre 2 h 26 min y 3 h 50 min. Con el embudo la respuesta llega en
  **0,9 segundos** (medido con un lead real).
- **Reglas de contenido**: nunca inventar un ingreso; si el modelo del vehículo no sirve se
  dice de frente con el año exacto; si preguntan si es un bot, se admite.
- **Commits**: `fbdea17`, `a4e31f1`, `9ad66cd`

### Acuses de entrega de WhatsApp
- **Migración 286** + `ag-whatsapp`: `wamid`, `estado_entrega`, `entregado_at`, `leido_at`,
  `error_meta` y vista `ag_wa_entregas_v`. Meta mandaba los acuses al mismo webhook (campo
  `messages`, verificado en la API) y el código los descartaba, así que "está en el log" solo
  significaba *"se lo pedimos a Meta"*.
- **Comprobado**: una respuesta del panel salió 06:10:22, **entregada 06:10:23 y leída
  06:10:31**.
- **Commit**: `fb1fc6b`

### Dos bugs con dientes que aparecieron en el camino
- **`ag_wa_faq_responder` adivinaba** a cuál pregunta contestaba el admin cuando había varias
  pendientes: reenvió el texto de prueba del admin a **dos conductores reales** y lo guardó
  como respuesta aprendida. Ahora, con más de una pendiente y sin cita, pide que se responda
  citando el aviso y no manda nada. Commit `add57fb`.
- **Un lead conocido que volvía a escribir** "quiero más información" caía al flujo viejo y
  recibía "te conecto con un asesor" — el mismo hueco que el embudo vino a tapar. Commit
  `fb1fc6b`.

---

## Subido el 2026-09-30 (1 solo build)

### La bandeja de soporte no mostraba lo que yo respondía, ni quién había contestado
- **Qué**: tres cosas, una sola causa de fondo.
  1. **Las respuestas del panel caían en otra conversación.** Al responder, `ag-whatsapp`
     mandaba el mensaje con `toE164()` y lo guardaba como `+573132326337`, mientras que
     todo lo entrante se guarda como Meta lo manda: `573132326337`, sin el `+`. Como la
     bandeja agrupa por `wa_phone`, la respuesta abría un **hilo fantasma de un solo
     mensaje** y dentro del hilo real no aparecía nunca. Ahora se normaliza al leer
     (`ag_wa_norm_phone`, `ag_wa_thread`) y al escribir (`normWaPhone` en `logWaMessage`).
  2. **No se sabía quién había contestado.** `ag_wa_message_log` solo guardaba
     `direction`, así que un mensaje del bot y uno escrito a mano se veían idénticos.
     Nueva columna `sent_by` (`bot` / `admin` / `sistema` / `alerta`) + `sent_by_name`.
     En el hilo, lo escrito a mano sale en **azul de marca con "Tú · nombre"** y lo del
     bot en verde con "Automático · bot".
  3. **Orden de la bandeja**: filtros *Todas / Sin responder / Respondí yo / Solo el bot*,
     con el contador de sin responder al lado; en cada fila, quién respondió de último y
     cuántas fueron a mano vs automáticas; y separadores de día (*Hoy / Ayer / fecha*)
     dentro del hilo, que antes era una pared de horas sueltas.
- **Por qué**: medido en producción antes del arreglo — **384 salientes** guardados con
  `+` sobre **9 números**, y **cero entrantes** con `+`: los 9 eran hilos de un solo lado.
  La prueba de que hacía daño de verdad: el **2026-09-30 a las 04:01–04:02 UTC el mismo
  saludo de asesora salió CUATRO veces al mismo conductor** (ids 2415-2418, en 80
  segundos) — se reenvió porque el panel no mostraba nada después de enviar. Por eso
  además el mensaje enviado ahora se pinta al instante con lo que devuelve el servidor:
  `logWaMessage()` inserta sin esperar, así que releer el hilo de inmediato puede traerlo
  todavía sin la respuesta.
- **De paso**: los avisos internos al número del admin (`573134453649`) eran **367
  mensajes**, el "hilo" más largo de toda la bandeja, tapando las conversaciones reales.
  Se siguen guardando (`sent_by = 'alerta'`) pero quedan fuera de la bandeja: pasajeros
  bajó de 39 conversaciones / 2.185 mensajes a **36 / 1.818**.
- **Y**: `/movi-admin` solo dejaba *leer*. Se le pusieron la caja de respuesta con el
  candado de las 24h y el refresco automático de 15 s que ya tenía `/admin/anda-gana`.
- **Toca**: `supabase` + `web`.
- **Estado**: ✅ todo desplegado y comprobado en producción el 2026-09-30.
  - Migración **284** aplicada por Management API (nunca `db push` en este proyecto).
  - **`ag-whatsapp` v193 → v194** y **`ag-admin-action` v15 → v16**, las dos con
    `--no-verify-jwt` (estaban en `verify_jwt: false`; sin el flag se rompía el webhook
    de Meta). No se confió en el "Deployed Functions" del CLI: se bajó el código que
    quedó **dentro** de producción por `GET /functions/{slug}/body` y se comprobó que
    trae `normWaPhone` + `sent_by` (ag-whatsapp) y `ag_wa_thread` (ag-admin-action).
  - Web: push `d40c1e3..10002b9`, commit `10002b9`. Publicado en el **segundo intento
    de verificación (~2 min)**, comprobado expandiendo los **144 chunks alcanzables**:
    `sin_responder`, `admin_count`, `Sin responder`, `Escribe tu respuesta`,
    `sent_by_name` aparecen en `chunk-DRXKKL72.js` y `chunk-VQLGJXRP.js` — dos chunks,
    o sea los **dos** paneles (`/admin/anda-gana` y `/movi-admin`).
  - **Ojo, pasó de verdad**: una fila entró **2 segundos antes** de que terminara el
    despliegue de `ag-whatsapp` (id 2421, 04:57:23 vs 04:57:25) y quedó con `sent_by
    NULL` y con `+`. Se corrigió a mano con la misma regla del relleno. Cuando se
    despliega sobre tráfico vivo, hay que volver a pasar el `UPDATE ... WHERE sent_by
    IS NULL` después del deploy.
- **Verificado en producción**: el relleno del histórico dejó `bot 1111 / alerta 367 /
  sistema 10 / admin 7` — los 7 de `admin` son los reales (id 1463 del 09-07 y los
  2415-2420 del 09-29), revisados uno por uno. `ag_wa_thread('573132326337')` ya devuelve
  el hilo completo y en orden: pregunta entrante → escalamiento del bot → las 4 respuestas
  a mano. `ag_wa_conversations_summary('conductor')` marca ese hilo con `admin_count 4`.
- **Verificado en local**: `tsc --noEmit` en verde y **`ngc -p tsconfig.app.json` en verde**
  (esto sí revisa las plantillas de Angular, que `tsc` no mira — ver nota abajo); las dos
  edge functions pasan esbuild.
- **Nota útil**: `ngc` **sí** corre en este PC (≈3 GB con `--max-old-space-size=3000`). Lo
  que no cabe en RAM es el `ng build` completo, no la compilación de plantillas. Corregir
  la memoria `movi_build_local_imposible_ram` en ese punto.

---

> **Nota (2026-09-10).** Las migraciones **281, 282 y 283** ya estaban aplicadas en
> producción desde el 08-09/09-09 pero nunca se habían commiteado (el repo llevaba dos
> días desfasado). **No necesitaban desplegarse** — ya estaban vivas en la base,
> verificadas por md5 contra el catálogo de Postgres. Los scripts `aplicar-281.*` se
> quedaron fuera a propósito: tienen el token de Supabase en texto plano y ya están
> en `.gitignore`.

## Subido el 2026-09-10 (1 solo build)

### La app dejaba registrarse a gente de otros países y nunca les llegaba el código
- **Qué**: ahora la app avisa *"Por ahora Movi solo opera en Colombia 🇨🇴"* en vez de dejar
  que la persona lo intente para siempre. Tres puntos:
  1. `ag-otp-send` rechaza el número **antes** de crear la fila en `ag_otp_codes` y antes
     de gastar el SMS, y devuelve el flag `fuera_de_cobertura`.
  2. La app lo valida también del lado del cliente (aviso instantáneo) y lo muestra como
     error del formulario, **sin** ofrecer el respaldo por WhatsApp — que en este caso
     tampoco funciona y solo alarga la frustración.
  3. `ag-whatsapp` responde el mismo aviso cuando quien escribe pidiendo el código llega
     con un número que no es `+57`.
- **Por qué**: la app arma el teléfono como `'+57' + lo que escriban`, sin selector de país.
  Alguien en México que escribe su número local `3329201647` queda guardado como
  `+573329201647` — un colombiano que no existe. El SMS se manda al vacío y el respaldo por
  WhatsApp tampoco lo encuentra, porque su WhatsApp real es `5213329201647`. **13 intentos
  así desde el 2026-08-04** (México, Argentina, EE.UU.), **todos con `used=false`**: ninguno
  completó el registro jamás. El 2026-09-10 llegaron dos seguidos y por eso se detectó.
- **Toca**: `supabase` + `web` → por la regla 3, esperó a que estuvieran los dos.
- **Estado**: ✅ subido y desplegado (commits `75c900e`, `1a8a24a`, `d40c1e3`).
- **Verificado**: `tsc --noEmit` en verde; las dos edge functions pasan esbuild; la regla
  probada contra los números reales de la base — **24 colombianos, 0 rechazados por error**;
  9 de 12 extranjeros bloqueados en la app y los 3 restantes (Guadalajara `332`, Rosario
  `341`) en WhatsApp.
- **Ojo — límite conocido**: la regla es floja a propósito (`+57` + 10 dígitos que empiecen
  por 3), **no** valida el prefijo del operador. Se intentó armar esa lista y se descartó:
  las listas publicadas de prefijos colombianos están desactualizadas — omiten `319` y
  `324`, que **sí** están en uso por conductores reales de esta base. Bloquear a un
  colombiano legítimo es mucho peor que dejar pasar a un extranjero, y para eso está la
  segunda capa en WhatsApp.
- **Efecto secundario a tener en cuenta**: el truco de diagnóstico de mandar un OTP al
  propio número de Telnyx (`+19713998284`) para ver si la cuenta está sana **ya no
  funciona** — ahora se rechaza por fuera de cobertura. De paso eso cierra un hueco real:
  ese endpoint no exige JWT, así que antes cualquiera podía usarlo para mandar SMS a
  números internacionales. Para el chequeo de salud, pegarle directo a la API de Telnyx.

---

## Subido el 2026-09-07 (1 solo build)

Un commit. Las partes de Supabase de este mismo arreglo ya estaban vivas desde antes
del push y viajaron gratis; lo único que necesitaba build era el refresco automático.

### La bandeja de soporte no mostraba arriba lo más reciente
- **Qué**: tres cosas distintas, mismo síntoma.
  1. La bandeja salía ordenada **por número de teléfono**, no por fecha:
     `ag_wa_conversations_summary` usa `DISTINCT ON (wa_phone)` y Postgres obliga a que
     el `ORDER BY` empiece por esa expresión — eso solo elige *cuál* fila sobrevive por
     teléfono, y nadie reordenaba por fecha después. Ahora el `DISTINCT ON` va dentro de
     una subconsulta y se reordena por `last_at DESC` afuera.
  2. Al abrir un hilo se pedían los **500 mensajes más viejos** (`ascending` + `limit`),
     descartando los nuevos. Ahora se pide por el lado nuevo y se voltea.
  3. No había refresco automático: la bandeja solo se cargaba al entrar o al recargar a
     mano. Ahora se refresca sola cada 15 s, en silencio.
- **Por qué**: medido en producción antes del arreglo — en conductores la conversación
  de ese mismo día salía en la **posición 5**, entre otras del 28 y 29 de agosto; en
  pasajeros, en la **12 de 24**. Los mensajes sí llegaban y sí se guardaban, pero
  aparecían salpicados en mitad de una lista ordenada por número, y desde el panel se
  veía igual que si no hubiera cargado nada. Lo del tope de 500 aún no se notaba, pero
  ya había hilos en 428 y 358 mensajes creciendo hacia él.
- **Toca**: `supabase` + `web`
- **Estado**: ✅ migración 280 aplicada por Management API y verificada en los dos roles;
  `ag-admin-action` desplegada con `--no-verify-jwt`; refresco automático en este push.
  Typecheck en verde (`tsc --noEmit`); el build entero no cabe en la RAM del PC (ver
  `movi_build_local_imposible_ram`).
- **Commit**: `c5ec613`

### Los mensajes DENTRO del chat siguen en orden normal
Decisión confirmada por el usuario el 2026-09-07: "las más recientes arriba" aplica a la
**lista de conversaciones**, no a los mensajes de un hilo. Dentro del chat se mantiene el
orden de lectura (viejo arriba → nuevo abajo), como cualquier chat.

---

## Subido el 2026-09-05 (1 solo build)

Ocho commits en un push. Lo único que de verdad necesitaba build era el techo de
contraofertas en la app; el resto ya estaba corriendo en Supabase y viajó gratis.

### La ubicación en vivo por WhatsApp llevaba semanas sin llegar
- **Qué**: el cron que le manda al pasajero la posición del conductor cada 4 minutos
  reventaba en cada corrida. Corregido (era `::text` donde va `::jsonb`).
- **Por qué**: Yolima esperó 15 minutos sin saber dónde venía su conductor. Escribió "?"
  tres veces. El cron corrió 5 veces en ese lapso y falló las 5. Pasaba desapercibido
  porque el cron reporta 99,7% de éxito: las corridas sin viajes activos no hacen nada
  y cuentan como exitosas.
- **Toca**: `supabase`
- **Estado**: ✅ aplicada (migración 269) y probada forzando una corrida con viaje activo.
- **Commit**: `ea40015`


### Techo a las contraofertas del conductor (150% del precio sugerido)
- **Qué**: un conductor ya no puede ofertar más del 150% del precio sugerido. Si lo
  intenta, se le dice cuál es el máximo real de ese viaje en vez de solo negarle.
- **Por qué**: caso del 2 de septiembre, El Llano → Cenabastos (6,2 km). El sugerido era
  $12.000, el pasajero ofreció $16.000 y un conductor pidió $25.000. Medido sobre 126
  ofertas reales: las que pasan del +50% sobre el sugerido se aceptan **1 de 14** — no
  venden, solo dejan al pasajero con mala impresión de la app. Simulado sobre los últimos
  25 días, habría bloqueado 4 ofertas y **las 4 eran de viajes que se cancelaron**;
  ningún viaje completado se habría impedido.
- **Toca**: `ambos`
- **Estado**:
  - ✅ **Base de datos ya aplicada** (migración 268, trigger sobre `ag_trip_offers`).
    Es la que de verdad garantiza la regla: `makeOffer()` inserta directo desde el
    cliente, así que sin el trigger la validación de la app se saltaría llamando a la API.
    Probada en vivo: bloquea $25.000 diciendo "el máximo es $18.500" y deja pasar $15.000.
  - ⏳ **App pendiente de subir**: el botón `+` se detiene en el techo y el aviso queda
    limpio. Sin esto la regla YA funciona, pero al conductor le sale el mensaje envuelto en
    "intenta cerrar sesión y volver a entrar", que no aplica.
- **Commit**: (este)

<!--
FORMATO de cada entrada:

### <título corto de qué cambia>
- **Qué**: una línea, en lenguaje del usuario.
- **Por qué**: el problema real que resuelve.
- **Toca**: `web` / `supabase` / `ambos`  ← si dice solo `supabase`, NO necesita build de Cloudflare
- **Estado**: commiteado en local / desplegado ya (edge o BD)
- **Commit**: `<hash>`
-->

---

## Reglas acordadas (2026-09-05)

1. **Nada se pushea sin que el usuario lo pida.** La frase es *"vamos a subir los cambios
   a producción"*.
2. **Los cambios de Supabase (edge functions y migraciones) sí se aplican de una.** No
   consumen builds de Cloudflare y suelen ser lo que de verdad arregla el comportamiento
   en producción. Se commitean en local igual, para que el repo no quede desfasado.
3. **Si un arreglo toca web Y backend, se espera con los dos.** Desplegar solo la mitad
   deja producción a medias — pasó el 2026-09-05 con la señal 3 del monitor, que quedó
   ciega entre el deploy de la función y el del frontend.
4. **Lo crítico no espera**, pero se avisa: si algo está roto para usuarios reales
   (nadie puede pedir viajes, se pierde plata, se filtra algo), se sube de inmediato y
   se dice por qué no se esperó.
5. Antes de cada push se revisa esta lista con el usuario, para que sepa qué va a salir.

## Optimización pendiente (ahorraría builds sin cambiar nada más)

En Cloudflare Pages → proyecto `publihazclick` → **Settings → Builds & deployments →
Build watch paths**, excluir `supabase/*`. Con eso, un push que solo toque funciones o
migraciones **no dispara build**. De los 7 builds del 2026-09-05, 4 se habrían ahorrado
solos. Requiere entrar al panel de Cloudflare.
