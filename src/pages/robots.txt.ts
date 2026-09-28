/* Servi à la demande, parce que la réponse dépend de l'hôte appelé :
   le domaine officiel s'ouvre aux moteurs, les autres se ferment. */
export const prerender = false;

import type { APIRoute } from 'astro';

/* Routes techniques : rien à indexer, et surtout rien à proposer dans
   les résultats. */
const PRIVATE = ['/api/'];

export const GET: APIRoute = ({ site, url }) => {
  const base = (site?.href ?? 'https://chaletcosy.pages.dev/').replace(/\/$/, '');

  /* Chaque déploiement Cloudflare reçoit sa propre adresse
     (`<hash>.chaletcosy.pages.dev`), qui sert le site entier. Indexées,
     ces copies concurrenceraient le vrai domaine sur ses propres mots.
     On les ferme donc franchement plutôt que d'espérer que la balise
     canonique suffise. */
  if (site && url.host !== site.host) {
    return new Response('User-agent: *\nDisallow: /\n', {
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }

  const body = [
    'User-agent: *',
    'Allow: /',
    ...PRIVATE.map((p) => `Disallow: ${p}`),
    '',
    `Sitemap: ${base}/sitemap.xml`,
    '',
  ].join('\n');

  return new Response(body, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
};
