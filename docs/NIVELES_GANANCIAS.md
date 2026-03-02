# Lógica de Niveles y Ganancias — Publihazclick PTC

> Documento de referencia para la lógica de negocio de ganancias por nivel.
> Última actualización: 2026-03-02

---

## Tipos de Anuncios

| Tipo | Código | Pago al Viewer | Quién lo recibe |
|------|--------|---------------|-----------------|
| Estándar 400 | `std_400` | 400 COP | El usuario que ve el anuncio |
| Mini Anuncio | `mini` | 83.33 COP | El usuario que ve el anuncio |
| Mini Anuncio por Invitar | `mini_referral` | 100 COP | El invitador — cantidad de slots por invitado varía según nivel |
| Mega Anuncio por Activación | `mega_activation` | 2,000 COP | El invitador (bonus único por activación de invitado) |

### Notas sobre `mini_referral`
- Es una **categoría nueva** separada de los mini anuncios normales.
- Siempre pagan **100 COP** al invitador cuando él los visualiza — el precio no cambia por nivel.
- Lo que cambia por nivel es la **cantidad de slots por invitado activo por día**.
- Total de slots diarios = slots_del_nivel × número_de_invitados_activos.
- El invitado debe tener su **paquete activo** (30 días) para que el invitador genere estos slots.

### Notas sobre `mega_activation`
- Se otorgan **5 mega anuncios** cada vez que un invitado activa su paquete.
- Cada mega anuncio paga **2,000 COP** → **10,000 COP por invitado activado**.
- Son anuncios de un solo uso: aparecen en la cola del invitador para que los visualice.
- Aplica para **todos los niveles** sin excepción.
- Si el invitado renueva su paquete al mes siguiente, se generan **5 mega anuncios nuevos**.
- No tienen fecha de vencimiento diaria — se acumulan hasta ser vistos.

---

## Reglas Generales

- Solo el rol `advertiser` recibe tareas PTC diarias.
- Los `guest` ven un CTA para comprar paquete — no tienen acceso a anuncios.
- La vigencia de las ganancias por invitados está atada a los **30 días activos** del paquete del invitado.
- Un paquete cuesta X COP y dura 30 días. Al vencerse, el invitador deja de generar slots por ese invitado.
- El nivel del invitador se determina por su **cantidad de invitados activos** en ese momento.

### Bonus por Activación de Invitado (REGLA GLOBAL — aplica a TODOS los niveles)

> Cada vez que un invitado **compra y activa** su paquete, el invitador recibe inmediatamente **5 mega anuncios** (`mega_activation`) en su cola de anuncios.

| Evento | Mega anuncios otorgados | Valor por mega | Total |
|--------|------------------------|---------------|-------|
| 1 invitado activa paquete | 5 | 2,000 COP | **10,000 COP** |
| 2 invitados activan paquete | 10 | 2,000 COP | **20,000 COP** |
| N invitados activan paquete | N × 5 | 2,000 COP | **N × 10,000 COP** |

- Aplica en la **primera activación** y en cada **renovación** mensual del invitado.
- Los mega anuncios se acumulan y no expiran hasta ser vistos.

---

## NIVEL 1 — JADE

**Requisito:** 1 a 2 invitados activos

### Anuncios Propios (diarios)

| Tipo | Cantidad/día | Pago | Total/día |
|------|-------------|------|-----------|
| `std_400` | 5 | 400 COP | 2,000 COP |
| `mini` | 4 | 83.33 COP | 333.32 COP |
| **Total propio** | | | **2,333.32 COP/día** |

**Ganancias propias al mes:** 2,333.32 × 30 = **~70,000 COP/mes**

---

### Ganancias por Invitados (comisión std_400)

Cuando un invitado ve un `std_400`, el invitador gana **100 COP por anuncio**.

| Invitados activos | Clicks invitado/día | Comisión/día | Comisión/mes (30 días) |
|-------------------|---------------------|--------------|------------------------|
| 1 invitado | 5 std_400 | 500 COP | 15,000 COP |
| 2 invitados | 5 std_400 c/u | 1,000 COP | 30,000 COP |

---

### Mini Anuncios por Invitar (`mini_referral`)

> En Jade se otorga **1 slot por invitado activo por día** a 100 COP cada uno.

| Invitados activos | Slots/día | Pago/slot | Total/día | Total/mes |
|-------------------|-----------|-----------|-----------|-----------|
| 1 invitado | 1 | 100 COP | 100 COP | 3,000 COP |
| 2 invitados | 2 | 100 COP | 200 COP | 6,000 COP |

---

### Bonus Activación (`mega_activation`) — Jade

| Invitados que activan | Mega anuncios | Total |
|-----------------------|--------------|-------|
| 1 invitado | 5 × 2,000 COP | 10,000 COP |
| 2 invitados | 10 × 2,000 COP | 20,000 COP |

> Este bono se cobra una vez por ciclo de activación (incluyendo renovaciones mensuales).

---

### Resumen Total — Nivel JADE

| Fuente | Mínimo (1 invitado) | Máximo (2 invitados) |
|--------|--------------------|--------------------|
| Anuncios propios | 70,000 COP | 70,000 COP |
| Comisión invitados std_400 | 15,000 COP | 30,000 COP |
| Mini anuncios por invitar | 3,000 COP | 6,000 COP |
| **Bonus activación (mega ads)** | **10,000 COP** | **20,000 COP** |
| **TOTAL** | **98,000 COP/mes** | **126,000 COP/mes** |

---

## NIVEL 2 — PERLA

**Requisito:** 3 a 5 invitados activos

### Anuncios Propios (diarios)

| Tipo | Cantidad/día | Pago | Total/día |
|------|-------------|------|-----------|
| `std_400` | 5 | 400 COP | 2,000 COP |
| `mini` | 4 | 83.33 COP | 333.32 COP |
| **Total propio** | | | **2,333.32 COP/día** |

**Ganancias propias al mes:** 2,333.32 × 30 = **~70,000 COP/mes**

---

### Ganancias por Invitados (comisión std_400)

Cuando un invitado ve un `std_400`, el invitador gana **200 COP por anuncio** en este nivel.

| Invitados activos | Clicks invitado/día | Comisión/día | Comisión/mes (30 días) |
|-------------------|---------------------|--------------|------------------------|
| 3 invitados | 5 std_400 c/u | 3,000 COP | 90,000 COP |
| 4 invitados | 5 std_400 c/u | 4,000 COP | 120,000 COP |
| 5 invitados | 5 std_400 c/u | 5,000 COP | 150,000 COP |

---

### Mini Anuncios por Invitar (`mini_referral`)

> En Perla se otorgan **2 slots por invitado activo por día** a 100 COP cada uno.

| Invitados activos | Slots/día | Pago/slot | Total/día | Total/mes |
|-------------------|-----------|-----------|-----------|-----------|
| 3 invitados | 6 | 100 COP | 600 COP | 18,000 COP |
| 4 invitados | 8 | 100 COP | 800 COP | 24,000 COP |
| 5 invitados | 10 | 100 COP | 1,000 COP | 30,000 COP |

---

### Bonus Activación (`mega_activation`) — Perla

| Invitados que activan | Mega anuncios | Total |
|-----------------------|--------------|-------|
| 3 invitados | 15 × 2,000 COP | 30,000 COP |
| 5 invitados | 25 × 2,000 COP | 50,000 COP |

---

### Resumen Total — Nivel PERLA

| Fuente | Mínimo (3 invitados) | Máximo (5 invitados) |
|--------|---------------------|---------------------|
| Anuncios propios | 70,000 COP | 70,000 COP |
| Comisión invitados std_400 | 90,000 COP | 150,000 COP |
| Mini anuncios por invitar | 18,000 COP | 30,000 COP |
| **Bonus activación (mega ads)** | **30,000 COP** | **50,000 COP** |
| **TOTAL** | **208,000 COP/mes** | **300,000 COP/mes** |

---

## NIVEL 3 — ZAFIRO

**Requisito:** 6 a 9 invitados activos

### Anuncios Propios (diarios)

| Tipo | Cantidad/día | Pago | Total/día |
|------|-------------|------|-----------|
| `std_400` | 5 | 400 COP | 2,000 COP |
| `mini` | 4 | 83.33 COP | 333.32 COP |
| **Total propio** | | | **2,333.32 COP/día** |

**Ganancias propias al mes:** 2,333.32 × 30 = **~70,000 COP/mes**

---

### Ganancias por Invitados (comisión std_400)

Cuando un invitado ve un `std_400`, el invitador gana **300 COP por anuncio** en este nivel.

| Invitados activos | Clicks invitado/día | Comisión/día | Comisión/mes (30 días) |
|-------------------|---------------------|--------------|------------------------|
| 6 invitados | 5 std_400 c/u | 9,000 COP | 270,000 COP |
| 7 invitados | 5 std_400 c/u | 10,500 COP | 315,000 COP |
| 8 invitados | 5 std_400 c/u | 12,000 COP | 360,000 COP |
| 9 invitados | 5 std_400 c/u | 13,500 COP | 405,000 COP |

---

### Mini Anuncios por Invitar (`mini_referral`)

> En Zafiro se otorgan **3 slots por invitado activo por día** a 100 COP cada uno.

| Invitados activos | Slots/día | Pago/slot | Total/día | Total/mes |
|-------------------|-----------|-----------|-----------|-----------|
| 6 invitados | 18 | 100 COP | 1,800 COP | 54,000 COP |
| 7 invitados | 21 | 100 COP | 2,100 COP | 63,000 COP |
| 8 invitados | 24 | 100 COP | 2,400 COP | 72,000 COP |
| 9 invitados | 27 | 100 COP | 2,700 COP | 81,000 COP |

---

### Bonus Activación (`mega_activation`) — Zafiro

| Invitados que activan | Mega anuncios | Total |
|-----------------------|--------------|-------|
| 6 invitados | 30 × 2,000 COP | 60,000 COP |
| 9 invitados | 45 × 2,000 COP | 90,000 COP |

---

### Resumen Total — Nivel ZAFIRO

| Fuente | Mínimo (6 invitados) | Máximo (9 invitados) |
|--------|---------------------|---------------------|
| Anuncios propios | 70,000 COP | 70,000 COP |
| Comisión invitados std_400 | 270,000 COP | 405,000 COP |
| Mini anuncios por invitar | 54,000 COP | 81,000 COP |
| **Bonus activación (mega ads)** | **60,000 COP** | **90,000 COP** |
| **TOTAL** | **454,000 COP/mes** | **646,000 COP/mes** |

---

## NIVEL 4 — RUBY

**Requisito:** 10 a 19 invitados activos

### Anuncios Propios (diarios)

| Tipo | Cantidad/día | Pago | Total/día |
|------|-------------|------|-----------|
| `std_400` | 5 | 400 COP | 2,000 COP |
| `mini` | 4 | 83.33 COP | 333.32 COP |
| **Total propio** | | | **2,333.32 COP/día** |

**Ganancias propias al mes:** 2,333.32 × 30 = **~70,000 COP/mes**

---

### Ganancias por Invitados (comisión std_400)

Cuando un invitado ve un `std_400`, el invitador gana **400 COP por anuncio** en este nivel.

| Invitados activos | Clicks invitado/día | Comisión/día | Comisión/mes (30 días) |
|-------------------|---------------------|--------------|------------------------|
| 10 invitados | 5 std_400 c/u | 20,000 COP | 600,000 COP |
| 13 invitados | 5 std_400 c/u | 26,000 COP | 780,000 COP |
| 16 invitados | 5 std_400 c/u | 32,000 COP | 960,000 COP |
| 19 invitados | 5 std_400 c/u | 38,000 COP | 1,140,000 COP |

---

### Mini Anuncios por Invitar (`mini_referral`)

> En este nivel se otorgan **4 slots por invitado activo por día** a 100 COP cada uno.

| Invitados activos | Slots/día | Pago/slot | Total/día | Total/mes |
|-------------------|-----------|-----------|-----------|-----------|
| 10 invitados | 40 | 100 COP | 4,000 COP | 120,000 COP |
| 13 invitados | 52 | 100 COP | 5,200 COP | 156,000 COP |
| 16 invitados | 64 | 100 COP | 6,400 COP | 192,000 COP |
| 19 invitados | 76 | 100 COP | 7,600 COP | 228,000 COP |

---

### Bonus Activación (`mega_activation`) — Ruby

| Invitados que activan | Mega anuncios | Total |
|-----------------------|--------------|-------|
| 10 invitados | 50 × 2,000 COP | 100,000 COP |
| 19 invitados | 95 × 2,000 COP | 190,000 COP |

---

### Resumen Total — Nivel RUBY

| Fuente | Mínimo (10 invitados) | Máximo (19 invitados) |
|--------|----------------------|----------------------|
| Anuncios propios | 70,000 COP | 70,000 COP |
| Comisión invitados std_400 | 600,000 COP | 1,140,000 COP |
| Mini anuncios por invitar | 120,000 COP | 228,000 COP |
| **Bonus activación (mega ads)** | **100,000 COP** | **190,000 COP** |
| **TOTAL** | **890,000 COP/mes** | **1,628,000 COP/mes** |

---

## NIVEL 5 — [PRÓXIMO]

> Pendiente de definición.

---

## Resumen Comparativo de Niveles

| Nivel | Invitados | Comisión std_400 | Slots mini_referral/invitado/día | Pago mini_referral | Máximo mensual |
|-------|-----------|-----------------|----------------------------------|--------------------|----------------|
| JADE | 1 – 2 | 100 COP | 1 | 100 COP | ~126,000 COP |
| PERLA | 3 – 5 | 200 COP | 2 | 100 COP | ~300,000 COP |
| ZAFIRO | 6 – 9 | 300 COP | 3 | 100 COP | ~646,000 COP |
| RUBY | 10 – 19 | 400 COP | 4 | 100 COP | ~1,628,000 COP |
| [Nivel 5] | – | – | – | – | – |

---

## Fórmulas de Cálculo

```
Ganancia propia/mes        = (std_400/día × 400 + mini/día × 83.33) × 30

Comisión invitados/mes     = invitados_activos × 5 × comisión_nivel × 30
                             (Jade=100 COP, Perla=200 COP, Zafiro=300 COP)

Mini referral/mes          = invitados_activos × slots_por_invitado_nivel × 100 COP × 30
                             (Jade: ×1, Perla: ×2, Zafiro: ×3 slots/invitado/día)

Bonus activación/mes       = invitados_que_activan × 5 × 2,000
                           = invitados_que_activan × 10,000 COP

TOTAL/mes = Ganancia propia
          + Comisión invitados
          + Mini referral
          + Bonus activación
```
