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

### Notas de voz del conductor (2026-09-06)

**Ya está en producción la parte de servidor:** bucket privado `movi-chat-audio`, columnas
`media_path`/`media_type`/`media_seconds`, el trigger que reenvía a WhatsApp ampliado, y la
función del bot que sube el audio a Meta y se lo manda al pasajero (migración 279).

**Falta el botón de grabar en la app** — es lo único que queda para que funcione de punta a
punta. El servicio ya tiene `sendChatVoiceNote()` y `urlNotaDeVoz()`; falta la interfaz:
mantener pulsado para grabar, soltar para enviar, y un reproductor en la burbuja del chat.

**Ojo con el sentido contrario:** el pasajero YA puede mandar notas de voz desde antes. El bot
las transcribe con Whisper y las mete al chat como texto — mejor que reenviar el audio, porque
el conductor lee de un vistazo en vez de ponerse a escuchar mientras maneja.

### Marca de leído del chat (2026-09-06)

**Qué cambia en la web:** el globo rojo de mensajes sin leer deja de vivir en la memoria del
navegador y pasa a leerse de la base de datos.

Antes: el conductor recibía tres mensajes, cerraba la app, la volvía a abrir — y el globo
aparecía en cero aunque nadie los hubiera leído. Y si nunca tuvo la app abierta cuando llegó
el mensaje, el contador jamás llegaba a subir, porque solo lo incrementaba la suscripción en
tiempo real.

Archivos: `anda-gana.service.ts` (métodos `contarChatSinLeer` y `marcarChatLeido`) y
`anda-gana.component.ts` (`refrescarChatSinLeer`, `_marcarChatLeido`, y el globo sembrado
desde la base al abrir la pantalla del viaje).

**Ya está en producción la parte de base de datos** (migración 277: columna `read_at` +
función `ag_chat_marcar_leido`). Es compatible hacia atrás: sin el frontend nuevo, la columna
simplemente no se usa y nada se rompe. Por eso se puede esperar al próximo build.

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
