/* ============================================================
   Date de dernière modification de chaque page, relevée dans l'historique.

   `lastmod` n'a de valeur que s'il est exact : une date de build recopiée
   sur les sept adresses dirait que tout le site change à chaque
   déploiement, et les moteurs cessent alors d'en tenir compte. On la lit
   donc dans git, seule source qui sache vraiment quand une page a bougé.

   La liste des adresses n'est pas écrite ici : elle est lue dans
   `src/pages/`. Une page ajoutée entre donc d'elle-même au plan du site,
   une page supprimée en sort — sans qu'il faille y penser.

   Écrit `src/lib/lastmod.json`, que lit `src/pages/sitemap.xml.ts`.
   ============================================================ */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const PAGES_DIR = 'src/pages';
const OUT = 'src/lib/lastmod.json';

/** La page d'erreur n'a rien à faire dans un plan du site : elle est `noindex`. */
const HORS_PLAN = new Set(['404.astro']);

/** Le contenu chiffré est partagé : le modifier modifie toutes les pages. */
const PARTAGE = 'src/lib/villa.ts';

const git = (...args) =>
  execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();

/** Date du dernier commit touchant ce fichier, ou `null` si git ne sait pas. */
function committed(file) {
  try {
    return git('log', '-1', '--format=%cI', '--', file) || null;
  } catch {
    return null;
  }
}

/* Un clone superficiel n'a qu'un commit : `git log -1 -- <fichier>` y répond
   sa date pour tous les fichiers, sans jamais échouer. Écrire ce résultat
   remplacerait sept dates justes par sept fois la date du déploiement —
   l'inverse exact de ce que ce script existe pour produire. Cloudflare Pages
   clonant ainsi, on garde alors le fichier versionné, qui lui vient d'un
   dépôt complet. Hors dépôt (archive téléchargée), même raisonnement. */
let superficiel = true;
try {
  superficiel = git('rev-parse', '--is-shallow-repository') === 'true';
} catch {
  superficiel = true;
}
if (superficiel) {
  console.log(`${OUT} : pas d'historique exploitable, les dates versionnées sont conservées`);
  process.exit(0);
}

/** `index.astro` → `/`, `le-chalet.astro` → `/le-chalet`. */
const url = (file) => (file === 'index.astro' ? '/' : `/${file.replace(/\.astro$/, '')}`);

const day = (iso) => iso.slice(0, 10);
const fallback = (file) =>
  fs.existsSync(file) ? new Date(fs.statSync(file).mtimeMs).toISOString() : new Date().toISOString();

const datePartage = committed(PARTAGE) ?? fallback(PARTAGE);

const pages = fs
  .readdirSync(PAGES_DIR)
  .filter((f) => f.endsWith('.astro') && !HORS_PLAN.has(f))
  // L'accueil d'abord, le reste par ordre alphabétique : l'ordre du plan
  // n'intéresse aucun moteur, mais un fichier stable se relit mieux.
  .sort((a, b) => (a === 'index.astro' ? -1 : b === 'index.astro' ? 1 : a.localeCompare(b)));

const lastmod = Object.fromEntries(
  pages.map((f) => {
    const own = committed(path.join(PAGES_DIR, f)) ?? fallback(path.join(PAGES_DIR, f));
    return [url(f), day(own > datePartage ? own : datePartage)];
  }),
);

fs.writeFileSync(OUT, JSON.stringify(lastmod, null, 2) + '\n');
console.log(`${OUT} : ${pages.length} adresses`);
for (const [u, d] of Object.entries(lastmod)) console.log(`  ${u.padEnd(20)} ${d}`);
