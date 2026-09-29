import { cpSync, existsSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';

/*
 * Astro Cloudflare écrit son Worker dans `dist/_worker.js`, tandis que
 * l'hébergeur Sites attend `dist/server/index.js`. On copie le répertoire
 * entier : l'entrée importe ses pages et chunks par chemins relatifs.
 * Cloudflare Pages continue d'utiliser `_worker.js` comme auparavant.
 */
if (!existsSync('dist/_worker.js/index.js')) {
  throw new Error('Worker Astro introuvable dans dist/_worker.js.');
}
rmSync('dist/server', { recursive: true, force: true });
cpSync('dist/_worker.js', 'dist/server', { recursive: true });
rmSync('dist/_worker.js', { recursive: true, force: true });

/*
 * Les variantes AVIF et WebP de chaque rendu doublent presque la taille de
 * l'archive. Sites a une limite d'envoi plus stricte que Cloudflare Pages :
 * on garde AVIF + l'image WebP d'origine, puis on retire seulement les
 * variantes WebP intermédiaires et leurs balises <source>.
 */
const visite = (repertoire, action) => {
  if (!existsSync(repertoire)) return;
  for (const nom of readdirSync(repertoire)) {
    const chemin = join(repertoire, nom);
    if (statSync(chemin).isDirectory()) visite(chemin, action);
    else action(chemin);
  }
};

visite('dist', (chemin) => {
  if (chemin.endsWith('.html')) {
    const html = readFileSync(chemin, 'utf8');
    writeFileSync(chemin, html.replace(/<source\b[^>]*type="image\/webp"[^>]*>/g, ''));
  }
});

visite('dist/images/rendus', (chemin) => {
  if (chemin.endsWith('.webp')) rmSync(chemin);
});

const imagesDeRepli = [];
for (const repertoire of ['dist/images/chalet', 'dist/images/digne']) {
  visite(repertoire, (chemin) => {
    if (chemin.endsWith('.webp')) imagesDeRepli.push(chemin);
  });
}
await Promise.all(imagesDeRepli.map(async (chemin) => {
  const temporaire = `${chemin}.optimise`;
  await sharp(chemin).webp({ quality: 76, effort: 5 }).toFile(temporaire);
  rmSync(chemin);
  cpSync(temporaire, chemin);
  rmSync(temporaire);
}));
