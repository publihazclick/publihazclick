// One-off: applies supabase/migrations/101_xzoom_en_vivo.sql via Management API.
// Usage: SUPABASE_ACCESS_TOKEN=... node scripts/apply-xzoom-migration.mjs
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const sqlPath = resolve(__dirname, '..', 'supabase', 'migrations', '101_xzoom_en_vivo.sql');
const PROJECT_REF = 'btkdmdhzouzvzgyuzgbh';
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;

if (!TOKEN) {
  console.error('Missing SUPABASE_ACCESS_TOKEN');
  process.exit(1);
}

const sql = readFileSync(sqlPath, 'utf8');
console.log(`[xzoom] Applying migration (${sql.length} chars) to ${PROJECT_REF}…`);

const res = await fetch(
  `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`,
  {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: sql }),
  },
);

const text = await res.text();
console.log(`[xzoom] HTTP ${res.status}`);
console.log(text);
if (!res.ok) process.exit(1);
console.log('[xzoom] ✅ Migration applied');
