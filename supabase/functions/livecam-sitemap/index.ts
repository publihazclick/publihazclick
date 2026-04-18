// Edge Function: livecam-sitemap
// Genera sitemap.xml dinámico listando modelos activos.
// Acceso público: https://btkdmdhzouzvzgyuzgbh.supabase.co/functions/v1/livecam-sitemap
// Luego un rewrite en Vercel lo expone en /sitemap.xml.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL         = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const APP_URL = Deno.env.get('LIVECAM_APP_URL') ?? 'https://livecam-pro.vercel.app';

Deno.serve(async () => {
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
    const { data } = await supabase.from('livecam_models').select('slug, updated_at').eq('is_active', true).limit(2000);
    const staticUrls = ['/', '/register', '/login', '/terms', '/faq'];

    const xmlItems: string[] = [];
    for (const u of staticUrls) {
      xmlItems.push(`<url><loc>${APP_URL}${u}</loc><changefreq>daily</changefreq></url>`);
    }
    for (const m of data ?? []) {
      xmlItems.push(`<url><loc>${APP_URL}/m/${m.slug}</loc><lastmod>${(m.updated_at ?? '').split('T')[0] || ''}</lastmod><changefreq>hourly</changefreq></url>`);
    }
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${xmlItems.join('\n')}
</urlset>`;

    return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=3600' } });
  } catch (err) {
    console.error('sitemap error:', err);
    return new Response('<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>', { headers: { 'Content-Type': 'application/xml' } });
  }
});
