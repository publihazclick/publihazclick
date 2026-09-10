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

> **Nota (2026-09-10).** Además del cambio de abajo, el push llevará las migraciones
> **281, 282 y 283**, que ya estaban aplicadas en producción desde el 08-09/09-09 pero
> nunca se habían commiteado (el repo llevaba dos días desfasado). **No necesitan
> desplegarse** — ya están vivas en la base, verificadas por md5 contra el catálogo de
> Postgres. Van solo para que el repo deje de mentir. Los scripts `aplicar-281.*` se
> quedaron fuera a propósito: tienen el token de Supabase en texto plano y ya están
> en `.gitignore`.


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
- **Toca**: `supabase` + `web` → por la regla 3, espera a que estén los dos.
- **Estado**: commiteado en local, **sin desplegar**.
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
