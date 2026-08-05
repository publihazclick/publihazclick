import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ── Configuración de vehículos ───────────────────────────────────
const VEHICLES: Record<string, { baseRate: number; ratePerKm: number; maxM3: number; maxKg: number; name: string }> = {
  moto:       { baseRate: 15000, ratePerKm: 600,  maxM3: 0.3, maxKg: 100,  name: 'Moto carga'       },
  pickup:     { baseRate: 35000, ratePerKm: 900,  maxM3: 2,   maxKg: 800,  name: 'Camioneta Pickup'  },
  van:        { baseRate: 55000, ratePerKm: 1200, maxM3: 10,  maxKg: 2000, name: 'Van / Furgón'      },
  camion_35t: { baseRate: 85000, ratePerKm: 1500, maxM3: 22,  maxKg: 3500, name: 'Camión 3.5T'       },
  camion_7t:  { baseRate: 140000,ratePerKm: 2000, maxM3: 45,  maxKg: 7000, name: 'Camión 7T'         },
};

// ── Primas por objetos especiales ────────────────────────────────
const SPECIAL_PREMIUMS: Record<string, number> = {
  piano:         180_000,
  safe:          100_000,
  motorcycle:     70_000,
  aquarium:       60_000,
  artwork:        80_000,
  refrigerator:   25_000,
  washer:         25_000,
  air_conditioner:30_000,
  pool_table:     90_000,
  jacuzzi:       120_000,
};

// ── Tasas de seguro ──────────────────────────────────────────────
const INSURANCE = {
  none:    { rate: 0,     coverage: 0,           label: 'Sin seguro'    },
  basic:   { rate: 0,     coverage: 200_000,     label: 'Básico (gratis)' },
  plus:    { rate: 0.015, coverage: 2_000_000,   label: 'Plus'          },
  premium: { rate: 0.03,  coverage: 10_000_000,  label: 'Premium'       },
};

function recommendVehicle(volumeM3: number, weightKg: number): string {
  if (volumeM3 <= 0.3  && weightKg <= 100)  return 'moto';
  if (volumeM3 <= 2    && weightKg <= 800)  return 'pickup';
  if (volumeM3 <= 10   && weightKg <= 2000) return 'van';
  if (volumeM3 <= 22   && weightKg <= 3500) return 'camion_35t';
  return 'camion_7t';
}

function floorPenalty(floor: number, elevator: boolean): number {
  if (floor <= 0) return 0;
  if (elevator)   return floor * 2000;  // Mínima penalidad con ascensor
  return floor * 8000;                  // 8k COP por piso sin ascensor
}

function getSurge(scheduledDateStr: string): { factor: number; label: string } {
  const d = new Date(scheduledDateStr);
  const dow  = d.getDay();   // 0=Dom
  const dom  = d.getDate();  // día del mes
  const mon  = d.getMonth(); // 0=Ene

  // Quincena y fin de mes — alta demanda de trasteos
  if (dom === 15 || dom >= 28 || dom === 1) return { factor: 1.45, label: '⚡ Quincena / fin de mes' };
  // Temporada navideña (dic + ene)
  if (mon === 11 || mon === 0)              return { factor: 1.30, label: '⚡ Temporada navideña'     };
  // Fin de semana
  if (dow === 0 || dow === 6)               return { factor: 1.20, label: '⚡ Fin de semana'           };
  // Viernes tarde
  if (dow === 5)                            return { factor: 1.15, label: '⚡ Viernes'                 };
  return { factor: 1.0, label: '' };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const body = await req.json();
    const {
      distanceKm     = 0,
      volumeM3       = 0,
      weightKg       = 0,
      originFloor    = 0,
      originElevator = false,
      destFloor      = 0,
      destElevator   = false,
      helpers        = 0,
      specialItems   = [] as string[],
      scheduledDate  = new Date().toISOString(),
      vehicleType    = 'any',
      insuranceType  = 'basic' as keyof typeof INSURANCE,
    } = body;

    // Seleccionar vehículo
    const vKey = vehicleType === 'any'
      ? recommendVehicle(volumeM3, weightKg)
      : (VEHICLES[vehicleType] ? vehicleType : recommendVehicle(volumeM3, weightKg));
    const veh = VEHICLES[vKey];

    // Costo transporte
    const transportCost = veh.baseRate + distanceKm * veh.ratePerKm;

    // Costo por volumen (12k COP/m³)
    const volumeCost = volumeM3 * 12_000;

    // Penalidades pisos
    const originPenalty = floorPenalty(originFloor, originElevator);
    const destPenalty   = floorPenalty(destFloor, destElevator);

    // Ayudantes: estimación de horas (mín 2h) × 20k COP/h/ayudante
    const estHours  = Math.max(2, distanceKm / 40 + volumeM3 / 2);
    const helperCost = helpers * estHours * 20_000;

    // Objetos especiales
    const specialCost = specialItems.reduce(
      (sum: number, item: string) => sum + (SPECIAL_PREMIUMS[item] ?? 0), 0
    );

    const subtotal = transportCost + volumeCost + originPenalty + destPenalty + helperCost + specialCost;

    // Surge
    const surge = getSurge(scheduledDate);
    const priceBase = Math.round(subtotal * surge.factor / 1000) * 1000;

    // Seguro
    const ins = INSURANCE[insuranceType] || INSURANCE.basic;
    const insurancePremium = Math.round(priceBase * ins.rate / 1000) * 1000;
    const totalPrice = priceBase + insurancePremium;

    // Rango sugerido para que el solicitante ponga precio
    const minSuggest = Math.round(priceBase * 0.75 / 1000) * 1000;
    const maxSuggest = Math.round(priceBase * 1.25 / 1000) * 1000;

    return new Response(JSON.stringify({
      vehicleRecommended: vKey,
      vehicleName: veh.name,
      breakdown: {
        transportBase:  Math.round(transportCost),
        volumeCost:     Math.round(volumeCost),
        originPenalty:  Math.round(originPenalty),
        destPenalty:    Math.round(destPenalty),
        helperCost:     Math.round(helperCost),
        specialCost:    Math.round(specialCost),
        subtotal:       Math.round(subtotal),
        surgeFactor:    surge.factor,
        surgeLabel:     surge.label,
        priceBase,
        insurancePremium,
      },
      totalPrice,
      minSuggest,
      maxSuggest,
      estimatedHours: Math.round(estHours * 10) / 10,
      insuranceCoverage: ins.coverage,
      insuranceLabel:    ins.label,
      depositAmount: Math.round(totalPrice * 0.3 / 1000) * 1000,
    }), { headers: { ...CORS, 'Content-Type': 'application/json' } });

  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }
});
