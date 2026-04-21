// Genera migración 121 con 150 empresas en pool v2 aislado.
// Uso: node scripts/build_migration_121.mjs
import fs from 'node:fs';

const tiers = {
  mega_2000: [
    ['Bavaria', 'bavaria.co'],
    ['Postobón', 'postobon.com'],
    ['Colanta', 'colanta.com.co'],
    ['Alpina', 'alpina.com'],
    ['Alquería', 'alqueria.com.co'],
    ['Grupo Nutresa', 'gruponutresa.com'],
    ['Zenú', 'zenu.com.co'],
    ['Ramo', 'ramo.com.co'],
    ['Colombina', 'colombina.com'],
    ['Noel', 'alimentosnoel.com'],
    ['Quala', 'quala.com.co'],
    ['Bimbo', 'grupobimbo.com'],
    ['Colcafé', 'colcafe.com'],
    ['Juan Valdez', 'juanvaldezcafe.com'],
    ['OMA', 'oma.com.co'],
    ['Tosh', 'tosh.co'],
    ['Manitoba', 'manitoba.com.co'],
    ['La Fina', 'lafina.com.co'],
    ['Pony Malta', 'ponymalta.com'],
    ['Cerveza Águila', 'cervezaaguila.com.co'],
    ['Club Colombia', 'clubcolombia.com'],
    ['Don Maíz', 'donmaiz.com'],
    ['Frito-Lay', 'fritolay.com'],
    ['Crem Helado', 'cremhelado.com.co'],
    ['La Constancia', 'laconstancia.com.co'],
  ],
  mega_5000: [
    ['Éxito', 'exito.com'],
    ['Olímpica', 'olimpica.com'],
    ['Carulla', 'carulla.com'],
    ['Falabella', 'falabella.com.co'],
    ['Alkosto', 'alkosto.com'],
    ['Homecenter', 'homecenter.com.co'],
    ['Jumbo', 'tiendasjumbo.co'],
    ['Tiendas D1', 'tiendasd1.com'],
    ['Tiendas Ara', 'tiendasara.com'],
    ['Makro', 'makrovirtual.com'],
    ['PriceSmart', 'pricesmart.com'],
    ['Cencosud', 'cencosud.com'],
    ['Arturo Calle', 'arturocalle.com'],
    ['Leonisa', 'leonisa.com'],
    ['Studio F', 'studiofmoda.com'],
    ['Totto', 'totto.com'],
    ['Vélez', 'velez.com.co'],
    ['Mario Hernández', 'mariohernandez.com.co'],
    ['Ktronix', 'ktronix.com'],
    ['Panamericana', 'panamericana.com'],
    ['Unicentro', 'unicentro.com'],
    ['Ripley', 'ripley.com.co'],
    ['H&M', 'hm.com'],
    ['Zara', 'zara.com'],
    ['MercadoLibre', 'mercadolibre.com.co'],
  ],
  mega_10000: [
    ['Bancolombia', 'grupobancolombia.com'],
    ['Davivienda', 'davivienda.com'],
    ['BBVA Colombia', 'bbva.com.co'],
    ['Banco de Bogotá', 'bancodebogota.com'],
    ['Banco Popular', 'bancopopular.com.co'],
    ['Banco AV Villas', 'avvillas.com.co'],
    ['Banco Caja Social', 'bancocajasocial.com'],
    ['Banco Agrario', 'bancoagrario.gov.co'],
    ['Itaú Colombia', 'itau.com.co'],
    ['Scotiabank Colpatria', 'scotiabankcolpatria.com'],
    ['Claro', 'claro.com.co'],
    ['Movistar', 'movistar.co'],
    ['Tigo', 'tigo.com.co'],
    ['WOM', 'wom.co'],
    ['ETB', 'etb.com'],
    ['EPM', 'epm.com.co'],
    ['Enel Colombia', 'enel.com.co'],
    ['Colsanitas', 'colsanitas.com'],
    ['Sura', 'sura.com'],
    ['Compensar', 'compensar.com'],
    ['Coomeva', 'coomeva.com.co'],
    ['Colmena Seguros', 'colmenaseguros.com'],
    ['Protección', 'proteccion.com'],
    ['Seguros Bolívar', 'segurosbolivar.com'],
    ['Positiva Seguros', 'positiva.gov.co'],
  ],
  mega_20000: [
    ['Toyota Colombia', 'toyota.com.co'],
    ['Renault Colombia', 'renault.com.co'],
    ['Chevrolet Colombia', 'chevrolet.com.co'],
    ['Mazda Colombia', 'mazda.com.co'],
    ['Kia', 'kia.com'],
    ['Hyundai Colombia', 'hyundai.com.co'],
    ['Ford Colombia', 'ford.com.co'],
    ['Nissan Colombia', 'nissan.com.co'],
    ['Mercedes-Benz', 'mercedes-benz.com.co'],
    ['BMW Colombia', 'bmw.com.co'],
    ['Volkswagen', 'vw.com.co'],
    ['Audi Colombia', 'audi.com.co'],
    ['Ecopetrol', 'ecopetrol.com.co'],
    ['Terpel', 'terpel.com'],
    ['Primax', 'primax.com.co'],
    ['Cemex Colombia', 'cemexcolombia.com'],
    ['Cementos Argos', 'argos.co'],
    ['Corona', 'corona.com.co'],
    ['Promigas', 'promigas.com'],
    ['Grupo Aval', 'grupoaval.com'],
    ['Grupo Bolívar', 'grupobolivar.com'],
    ['ISA', 'isa.co'],
    ['Celsia', 'celsia.com'],
    ['Air-e', 'aire.com.co'],
    ['Tecnoglass', 'tecnoglass.com'],
  ],
  mega_50000: [
    ['Apple', 'apple.com'],
    ['Samsung', 'samsung.com'],
    ['LG', 'lg.com'],
    ['Sony', 'sony.com'],
    ['Huawei', 'huawei.com'],
    ['Xiaomi', 'mi.com'],
    ['Nike', 'nike.com'],
    ['Adidas', 'adidas.com'],
    ['Puma', 'puma.com'],
    ['Under Armour', 'underarmour.com'],
    ['Coca-Cola', 'coca-cola.com'],
    ['Pepsi', 'pepsi.com'],
    ['Red Bull', 'redbull.com'],
    ['Heineken', 'heineken.com'],
    ['AB InBev', 'ab-inbev.com'],
    ['Unilever', 'unilever.com'],
    ['Procter & Gamble', 'pg.com'],
    ['Johnson & Johnson', 'jnj.com'],
    ['L\u2019Oréal', 'loreal.com'],
    ['Nestlé', 'nestle.com'],
    ['IKEA', 'ikea.com'],
    ['Starbucks', 'starbucks.com'],
    ['McDonald\u2019s', 'mcdonalds.com'],
    ['KFC', 'kfc.com'],
    ['Burger King', 'bk.com'],
  ],
  mega_100000: [
    ['Microsoft', 'microsoft.com'],
    ['Google', 'google.com'],
    ['Amazon', 'amazon.com'],
    ['Meta', 'meta.com'],
    ['Netflix', 'netflix.com'],
    ['Spotify', 'spotify.com'],
    ['Disney', 'disney.com'],
    ['HBO Max', 'hbomax.com'],
    ['YouTube', 'youtube.com'],
    ['Intel', 'intel.com'],
    ['NVIDIA', 'nvidia.com'],
    ['AMD', 'amd.com'],
    ['IBM', 'ibm.com'],
    ['Oracle', 'oracle.com'],
    ['Salesforce', 'salesforce.com'],
    ['Adobe', 'adobe.com'],
    ['SAP', 'sap.com'],
    ['Cisco', 'cisco.com'],
    ['Tesla', 'tesla.com'],
    ['Uber', 'uber.com'],
    ['Airbnb', 'airbnb.com'],
    ['Visa', 'visa.com'],
    ['Mastercard', 'mastercard.com'],
    ['PayPal', 'paypal.com'],
    ['LinkedIn', 'linkedin.com'],
  ],
};

const rewardMap = {
  mega_2000: 2000,
  mega_5000: 5000,
  mega_10000: 10000,
  mega_20000: 20000,
  mega_50000: 50000,
  mega_100000: 100000,
};

function sqlEscape(s) {
  return s.replace(/'/g, "''");
}

const rows = [];
for (const [adType, companies] of Object.entries(tiers)) {
  if (companies.length !== 25) {
    console.error(`${adType} tiene ${companies.length} empresas, esperaba 25`);
    process.exit(1);
  }
  for (const [name, domain] of companies) {
    const title = sqlEscape(name);
    const desc = sqlEscape(`${name} anuncia en Publihazclick`);
    const url = `https://${domain}`;
    const img = `https://logo.clearbit.com/${domain}?size=400`;
    const reward = rewardMap[adType];
    rows.push(
      `  ('${title}', '${desc}', '${url}', '${img}', ${reward}, 30, 10000, 0, 'active', '${adType}'::ptc_ad_type, 'v2_pool', NOW())`
    );
  }
}

const sql = `-- =============================================================================
-- Migración 121: Pool v2 de 150 empresas reales para mega anuncios v2
--
-- Contexto:
--   Los 4 placeholders (mega_2000/5000/10000/20000) en location='app' usaban
--   todos la misma imagen de Unsplash. Se reemplaza por un pool de 150
--   empresas reales (logos vía Clearbit) distribuidas en 6 tiers × 25.
--
-- Aislamiento:
--   - Todas las filas usan location = 'v2_pool' (fuera del listado normal de
--     usuarios, que filtra por location = 'app').
--   - Solo se mostrarán al referidor cuando éste tenga grants activos en
--     referral_mega_grants (lógica v2 sin tocar).
--   - Los placeholders anteriores se pausan pero no se borran (auditoría).
-- =============================================================================

-- 1. Permitir el nuevo valor 'v2_pool' en la columna location.
ALTER TABLE ptc_tasks DROP CONSTRAINT IF EXISTS ptc_tasks_location_check;
ALTER TABLE ptc_tasks
  ADD CONSTRAINT ptc_tasks_location_check
  CHECK (location = ANY (ARRAY['landing'::text, 'app'::text, 'v2_pool'::text]));

-- 2. Pausar los placeholders v2 antiguos (location='app') para que no se
--    mezclen con el pool nuevo. No se borran; quedan como histórico.
UPDATE ptc_tasks
   SET status = 'paused',
       updated_at = NOW()
 WHERE location = 'app'
   AND ad_type::text LIKE 'mega\\_%'
   AND status = 'active';

-- 3. Insertar el pool real de 150 empresas (25 por tier).
INSERT INTO ptc_tasks (
  title, description, url, image_url,
  reward, duration, daily_limit, total_clicks,
  status, ad_type, location, created_at
)
VALUES
${rows.join(',\n')};
`;

fs.writeFileSync('supabase/migrations/121_mega_v2_pool_150_companies.sql', sql);
console.log(`OK ${rows.length} rows -> supabase/migrations/121_mega_v2_pool_150_companies.sql`);
