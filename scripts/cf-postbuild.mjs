// Ajuste del build SOLO para Cloudflare Pages. En cualquier otro entorno no hace nada.
//
// Contexto: Angular genera dos HTML en la salida del build:
//   - index.html      (~170 KB) la home YA prerenderizada
//   - index.csr.html  (~16 KB)  el shell vacio que arranca la app en el cliente
//
// En Vercel cada ruta desconocida se reescribia a index.csr.html (ver vercel.json), asi
// que /anda-gana cargaba el shell y la home conservaba su prerender.
//
// Cloudflare Pages funciona distinto y no permite copiar ese esquema:
//   1. Las reglas de _redirects se aplican SIEMPRE, existan o no los archivos
//      ("Redirects are always followed, regardless of whether or not an asset matches
//      the incoming request" - docs de Cloudflare). Un catch-all /* se traga hasta los
//      .js y las imagenes: verificado en produccion el 2026-09-02, logo.webp devolvia
//      <!doctype html>.
//   2. A cambio, cuando NO hay 404.html en la raiz, Pages ya trae fallback de SPA
//      nativo: toda ruta que no sea un archivo real sirve / con status 200.
//
// Entonces la forma correcta aqui es no usar catch-all y dejar que el fallback nativo
// haga el trabajo. Pero ese fallback siempre sirve index.html, asi que index.html tiene
// que ser el shell; si no, /anda-gana mostraria un instante la home prerenderizada antes
// de que Angular navegue.
//
// Precio de la decision: la home pierde el prerender (afecta SEO, no al funcionamiento).
// Movi carga bien, que es lo que sostiene la operacion. Si algun dia hace falta ese SEO,
// la salida es prerenderizar rutas de verdad, no volver al catch-all.
//
// NO existe 404.html en el proyecto: si alguien lo agrega, Pages desactiva el fallback
// de SPA y toda ruta profunda (incluida /anda-gana) se cae. Verificarlo antes de crearlo.

import { existsSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';

// Cloudflare Pages define CF_PAGES=1 en sus builds. Fuera de ahi (local, Vercel, CI)
// el build queda intacto y conserva el index.html prerenderizado.
if (!process.env.CF_PAGES) {
  console.log('[cf-postbuild] fuera de Cloudflare Pages: no se toca el build');
  process.exit(0);
}

const outDir = join('dist', 'publihazclick', 'browser');
const shell = join(outDir, 'index.csr.html');
const index = join(outDir, 'index.html');

if (!existsSync(shell)) {
  console.error(`[cf-postbuild] ERROR: no aparece ${shell}. Si Angular dejo de generar`);
  console.error('[cf-postbuild] index.csr.html, el fallback de Pages serviria el HTML que');
  console.error('[cf-postbuild] haya quedado en index.html. Revisar antes de desplegar.');
  process.exit(1);
}

copyFileSync(shell, index);
console.log('[cf-postbuild] index.csr.html copiado sobre index.html (fallback SPA de Pages)');
