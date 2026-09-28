import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';
import cloudflare from '@astrojs/cloudflare';

// Rendu hybride : le site vitrine reste pré-rendu (statique, donc rapide et
// cacheable), seules quelques routes techniques (formulaire de contact,
// robots.txt) basculent en SSR via `export const prerender = false`.
export default defineConfig({
  site: 'https://chaletcosy.pages.dev',
  output: 'static',
  /* Une page, une adresse. En `directory` (le défaut), Astro écrit
     `contact/index.html` et Cloudflare redirige alors `/contact` vers
     `/contact/` — au rebours de la balise canonique et de tous nos liens
     internes, qui pointent vers la forme sans barre finale. En `file`,
     la page est écrite `contact.html` et servie directement sur
     `/contact` : plus de redirection, plus de contradiction. */
  build: { format: 'file' },
  trailingSlash: 'never',
  adapter: cloudflare({
    imageService: 'passthrough',
    /* ⚠️ L'adaptateur regroupe les pages du back-office sous `/admin/*`,
       et ce motif réclame la barre qui suit : il couvre
       `/admin/reservations`, mais PAS `/admin` tout court. Sans la ligne
       ci-dessous, le tableau de bord échapperait au Worker en production
       et Cloudflare répondrait 404 sur la seule adresse que l'on tape à
       la main. Le doublon est sans effet si le motif la couvrait déjà. */
    routes: { extend: { include: [{ pattern: '/admin' }] } },
  }),
  integrations: [tailwind({ applyBaseStyles: false })],
  server: {
    host: '0.0.0.0',
    port: 4321,
  },
  vite: {
    ssr: { external: ['node:buffer'] },
  },
});
