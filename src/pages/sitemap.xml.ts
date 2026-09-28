import type { APIRoute } from 'astro';
/* Dates relevées dans l'historique git au build — voir `tools/build-lastmod.mjs`,
   qui lit lui-même `src/pages/`. Ce fichier fait donc aussi office de liste
   d'adresses : une page ajoutée là entre d'elle-même au plan du site, une page
   supprimée en sort. Rien à tenir à jour ici. */
import lastmod from '../lib/lastmod.json';

/* La priorité n'a jamais servi à grand-chose auprès des moteurs, mais elle
   dit tout de même l'ordre du site : l'accueil, puis les quatre pages qui
   vendent le séjour, puis les mentions obligatoires. */
const LOW = new Set(['/mentions-legales', '/confidentialite']);
const priority = (p: string) => (p === '/' ? '1.0' : LOW.has(p) ? '0.3' : '0.8');

export const GET: APIRoute = ({ site }) => {
  const base = (site?.href ?? 'https://chaletcosy.pages.dev/').replace(/\/$/, '');

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${Object.entries(lastmod)
  .map(
    ([p, date]) =>
      `  <url><loc>${base + p}</loc><lastmod>${date}</lastmod><priority>${priority(p)}</priority></url>`,
  )
  .join('\n')}
</urlset>
`;

  return new Response(body, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
};
