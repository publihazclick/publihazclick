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

### Contraoferta del conductor: margen mínimo de $3.000 sobre el pasajero (2026-10-02)
- **Por qué**: un conductor dijo que "solo pudo subir $1.000" (era por un destino mal leído a
  200 m), y los datos mostraron el mismo apretón en viajes cortos (moto 1 km: solo +$500).
- **Regla**: techo = el MAYOR entre 150% del sugerido y (oferta del pasajero + $3.000). En viajes
  largos sigue mandando el 150% (10 km carro: hasta +$8.500/+$12.500).
- **Base (YA aplicada, migración 299)**: `ag_enforce_max_offer_price()`. Probado en transacción
  que se deshace: viaje de 0,2 km a $6.000 acepta $9.000 y rechaza $9.500.
- **App (WEB, falta push)**: `maxOfferFor()` con la misma regla, para que el botón "+" deje subir
  hasta el nuevo techo. `ng build` OK. No necesita APK.


### Código de verificación: WhatsApp primero, SMS de respaldo (2026-10-02)
- **Por qué**: medido en 30 días, por WhatsApp entra el 88% de quienes reciben el código y por
  SMS el 70% (16 personas pidieron SMS y nunca entraron). El usuario pensó en quitar el SMS; se
  dejó como respaldo porque sin él no entran quienes tienen el número oculto en WhatsApp ni
  quienes registran un número sin WhatsApp.
- **App (WEB, falta push — no necesita APK, la app carga publihazclick.com/anda-gana)**: en las
  dos pantallas del código (registro completo y registro rápido) el botón verde "Recibir código
  por WhatsApp" sale arriba de una; el SMS queda abajo ("Recibir por SMS" / "¿No tienes WhatsApp
  en este número? Recibir por SMS"). `ng build --configuration=production` OK.
- **Servidor (YA desplegado y probado 2026-10-02)**: `ag-otp-send` acepta `canal: 'whatsapp'` y
  deja el código listo sin mandar SMS (sin canal = SMS, como antes: las apps instaladas no
  cambian). `ag-whatsapp`: el aviso de número oculto apunta a "Recibir por SMS".
- **Toca**: `src/app/features/anda-gana/*` + `supabase`.

---

## Desplegado el 2026-10-02 (supabase; falta solo el push a GitHub)

### WA pasajeros: destino a 200 m, cambio de destino, conductor que no arranca
- **Por qué**: pasajero real (…833) al aeropuerto: "un taxi para la Urbanización X" (su casa) se
  tomó como destino; "es para el aeropuerto" mientras buscaba no corrigió nada; Jorge García
  aceptó y no arrancó en 16 min; las llamadas fallan (Telnyx bloqueado, D17); 6 avisos idénticos
  al admin. El pasajero terminó buscando carro en la autopista.
- **Destino a < 500 m de la recogida** -> "¿Esa dirección es donde te recojo o a donde vas?".
- **"Es para el aeropuerto" / "voy para X" / "el destino es X"** buscando o con conductor ->
  actualiza el viaje y se lo manda al conductor por el chat.
- **Conductor quieto** (migración **298**, cron `movi-conductor-quieto` cada minuto): aceptó hace
  5+ min, sin etapa ni ubicación -> el bot le pregunta al pasajero [Buscar otro] [Seguir
  esperando]; "Buscar otro" cancela, avisa al conductor y relanza el mismo pedido. Máx 2 veces.
- **Un solo aviso al admin por viaje** (antes uno por mensaje sin leer).
- Los informes de cada hora miden cuántas veces preguntó el bot y qué respondió el pasajero.
- **Toca**: `supabase` solamente.

---

## Subido el 2026-10-01, noche (tercera tanda) — WhatsApp de pasajeros

### Flujo rápido, Cotizar y recordatorio de viajes
- **Por qué**: quejas de "muy enredado, confuso y demorado". Medido: 58 conversaciones en 30
  días, solo 8 pedidos (14%), 16 mensajes del pasajero por pedido. Caso real …833: 8 preguntas
  y 6 minutos para saber el precio al aeropuerto, y su "es para mañana" terminó en un conductor
  saliendo esa misma noche.
- **Flujo rápido (Carro/Moto para uno mismo)**: ¿dónde te recojo? -> ¿a dónde vas? (si no lo
  dijo) -> UN resumen con recogida, destino y precio [Pedir] [Ofrecer otro] [Corregir]. Sin
  "¿para ti o para otra persona?" (solo si escribe "otra persona"), sin barrio, sin confirmar
  recogida y destino por separado. Dirección escrita + GPS seguidos = una sola recogida (queda
  el texto escrito y el punto del GPS). La conversación ya no se pega a la dirección.
- **Cotizar**: el menú pasa a lista (WhatsApp no admite más de 3 botones) con "💰 Cotizar un
  viaje"; también al preguntar el precio o responder solo con un destino. Muestra carro y moto
  a la vez, sin compromiso. Migración **296** (`cotizar`, `precio_moto` en la sesión).
- **"Es para mañana a las 9"** en cualquier paso antes de tener conductor -> recordatorio 30 min
  antes con el resumen y [Pedir]; si estaba buscando, se cancela esa búsqueda. No se crean
  recordatorios fuera de la ventana de 24 h (se le dice). Migración **297** (tabla
  `ag_wa_recordatorios` + cron `movi-recordatorios-viaje` cada 2 min).
- **Textos recortados**: saludo ("¿A dónde vas?"), precio (sin el párrafo de 4 líneas),
  "Buscando tu conductor" en una línea, y mientras busca ya no responde a todo con la cuenta
  regresiva.
- **Toca**: `supabase` solamente. Desplegado y probado en producción con 573148487506 hasta el
  resumen, SIN pedir (0 viajes creados por las pruebas).

---

## Subido el 2026-10-01, noche (segunda tanda)

### WA conductores: recordatorio #3, invitar, y fixes del informe horario
- **Recordatorio #3 (20 h) nunca salía**: los tiempos se sumaban desde el último mensaje del
  bot y caían después de la ventana de 23 h. Migración **295** (aplicada vía Management API):
  ahora se cuentan desde el último mensaje de la persona. Verificado: salió a …902 y …863.
- **Cierre con "Gana Invitando"**: al terminar el flujo, mensaje + video de invitados, con el
  ángulo "cada pasajero que invitas es un viaje más que te puede llegar a ti".
- **Sin el nombre escrito**: "¡Mucho gusto! 🙌" en vez de "¡Mucho gusto, Hbla!".
- **"¡Hola Usuario!"**: 39 cuentas tienen "Usuario" de relleno; ya no se usa como nombre
  (sirve también al bot de pasajeros). Nombres de cuenta capitalizados.
- **Nombre escrito en el paso del link** ya no escala a un humano.
- **"No estoy interesado" / "no gracias"** → se despide y deja de escribir (antes escalaba).
- **"Más información" a secas** → flujo normal (antes escalaba).
- **Mensaje del link recortado** hasta "Me avisas tan pronto la descargues para irte guiando."
  Link clickeable confirmado en la doc de Meta (reply buttons: "URLs are automatically hyperlinked").
- **Toca**: `supabase` solamente. Desplegado y probado en producción con 573148487506.

---

## Subido el 2026-10-01, noche

### WA conductores: guía paso a paso, sin bloques largos
- **Qué**: el embudo ahora pide UNA cosa por mensaje y espera: nombre → "el primer paso para
  ser conductor es descargar la app" + link + "avísame cuando la descargues" → al avisar, video
  de cómo funciona/registro + ¿moto o carro? → ¿modelo X o más nuevo? → "entra a Quiero ser
  conductor, primer viaje sin papeles, En línea + GPS". Antes caían discurso + link + 2 videos
  en 13 segundos. El tutorial ya no sale con el link sino cuando avisa que descargó.
- **Bonos**: el FAQ y la consulta de bonos dejan claro que van aumentando ($2.000/10,
  $3.500/25, $6.000/50, $24.000/100 y luego $24.000 cada 100 — no se dice que sigan subiendo).
- **Fixes de la primera revisión de conversaciones**: "Me interesa" suelto ya no escala a un
  humano; un lead en el embudo ya no queda callado 48 h por una escalada; el 12% se explica
  bien (sale de la billetera, no de la carrera); "¿cómo recargo? tengo Nequi" responde los
  medios reales (también a quien no tiene cuenta); cambiar de vehículo reinicia el año.
- **Nueva función** `informe-conductores`: datos de la revisión horaria + envío del informe al
  WhatsApp del admin. Secret `INFORME_KEY`.
- **Toca**: `supabase` solamente. Desplegado y probado en producción con 573148487506.

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
