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
