/* ============================================================
   Déclinaisons responsives des photographies.

   Les photos du chalet sont livrées en 1920 px et servies telles quelles
   à tout le monde — y compris à un téléphone qui n'en affiche que 390.
   Ce script en tire les largeurs intermédiaires, une fois pour toutes.

   Sur le modèle de `brand/build-logo.mjs` : les fichiers produits sont
   versionnés, pas régénérés à chaque déploiement. L'AVIF coûte trois à dix
   secondes par image — le passer en revue à chaque `git push` ferait passer
   le déploiement Cloudflare de deux minutes à un quart d'heure. Le script
   est donc idempotent : il ne produit que les fichiers absents, et se
   contente de vérifier la présence des autres.

       node tools/build-images.mjs          # ce qui manque
       node tools/build-images.mjs --force  # tout, de nouveau — après avoir
                                            # retouché une photographie

   Il écrit aussi `src/lib/images.json`, que lit `Photo.astro` : dimensions
   natives (indispensables au `width`/`height`, donc au CLS), radical des
   fichiers produits, et liste des variantes réellement présentes. Le radical
   vient d'ici parce que c'est ici qu'on nomme : le composant n'a pas à
   deviner une convention qu'il ne contrôle pas.
   ============================================================ */
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';

/* Les trois largeurs couvrent les trois usages du site : la vignette d'une
   grille à trois colonnes (~360 px), la pleine largeur d'un téléphone à
   deux pixels par point (~780 px), et l'image pleine page sur un écran
   large. Une quatrième n'apporterait que des octets de plus à choisir. */
const WIDTHS = [480, 800, 1280];

/* Dossiers de photographies. Le logo n'est pas ici : il a son propre
   pipeline (`brand/build-logo.mjs`) et ses propres contraintes de détourage. */
const SOURCES = ['public/images/chalet', 'public/images/digne'];

const OUT_ROOT = 'public/images/rendus';
const MANIFEST = 'src/lib/images.json';

/* Les sources sont déjà du WebP compressé : redescendre en qualité 76 après
   réduction ne se voit pas — la réduction elle-même filtre le bruit que le
   premier encodage avait laissé. L'AVIF gagne ~37 % sur le WebP à qualité
   perçue égale, mesuré sur ce lot ; `effort` 4 est le palier au-delà duquel
   on paie beaucoup de temps pour très peu d'octets. */
const WEBP = { quality: 76, effort: 5 };
const AVIF = { quality: 52, effort: 4 };

const force = process.argv.includes('--force');

/** Toutes les photographies à décliner, chemin de fichier absolu au dépôt. */
function collect() {
  const files = [];
  for (const dir of SOURCES) {
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir).sort()) {
      if (f.endsWith('.webp')) files.push(path.join(dir, f));
    }
  }
  return files;
}

/**
 * Le fichier de sortie est-il à refaire ?
 *
 * Présence seule, jamais les dates : un clone git écrit tous les fichiers à
 * l'instant du checkout, dans un ordre arbitraire. Mesuré sur un clone neuf
 * de ce dépôt, une déclinaison ressortait 42 ms plus ancienne que sa source —
 * de quoi déclencher le réencodage des 180 AVIF, soit huit minutes, à chaque
 * déploiement. Retoucher une photographie sans la renommer demande donc un
 * `--force` explicite ; c'est le prix d'un build qui ne surprend jamais.
 */
const stale = (out) => force || !fs.existsSync(out);

/**
 * Décline une photographie.
 *
 * En WebP on ne produit que les largeurs strictement inférieures à la
 * source : à taille égale, le fichier d'origine fait déjà l'affaire et le
 * réencoder ne ferait que lui coûter une génération de qualité. En AVIF on
 * produit aussi la pleine taille — c'est là que les 37 % pèsent le plus lourd.
 */
async function derive(src) {
  const meta = await sharp(src).metadata();
  const { width: W, height: H } = meta;

  // `public/images/chalet/x.webp` → `public/images/rendus/chalet/x`
  const rel = path.relative('public/images', src).replace(/\.webp$/, '');
  const out = path.join(OUT_ROOT, rel);
  fs.mkdirSync(path.dirname(out), { recursive: true });

  // Les largeurs sous la source, puis la source elle-même : la liste ne
  // dépasse jamais `W`, donc aucun agrandissement à interdire par ailleurs.
  const targets = [...WIDTHS.filter((w) => w < W), W];
  const made = { webp: [], avif: [] };

  for (const w of targets) {
    if (w < W) {
      const f = `${out}-${w}.webp`;
      if (stale(f)) await sharp(src).resize({ width: w }).webp(WEBP).toFile(f);
      made.webp.push(w);
    }

    const a = `${out}-${w}.avif`;
    if (stale(a)) await sharp(src).resize({ width: w }).avif(AVIF).toFile(a);
    made.avif.push(w);
  }

  return [
    `/${path.relative('public', src)}`,
    { stem: `/${path.relative('public', out)}`, w: W, h: H, ...made },
  ];
}

/* Quatre encodages en vol. Mesuré sur ce lot : une seule voie prend 123 s,
   quatre en prennent 60, huit encore 59 — libvips parallélise déjà chaque
   opération en interne, au-delà de quatre on ne fait que se disputer les
   mêmes cœurs. */
async function pool(items, size, fn) {
  const out = [];
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (i < items.length) {
        const k = i++;
        out[k] = await fn(items[k]);
      }
    }),
  );
  return out;
}

const files = collect();
console.log(`${files.length} photographies · largeurs ${WIDTHS.join('/')} · WebP + AVIF`);

const t0 = Date.now();
let done = 0;
const entries = await pool(files, 4, async (f) => {
  const e = await derive(f);
  process.stdout.write(`\r  ${++done}/${files.length}  ${path.basename(f).padEnd(34)}`);
  return e;
});

const manifest = Object.fromEntries(entries.sort(([a], [b]) => a.localeCompare(b)));
fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + '\n');

const weigh = (dir) =>
  fs.existsSync(dir)
    ? fs.readdirSync(dir, { recursive: true, withFileTypes: true })
        .filter((d) => d.isFile())
        .reduce((a, d) => a + fs.statSync(path.join(d.parentPath ?? d.path, d.name)).size, 0)
    : 0;

console.log(
  `\r  ${files.length}/${files.length} terminé en ${((Date.now() - t0) / 1000) | 0} s` +
    `${' '.repeat(30)}\n` +
    `  ${OUT_ROOT} : ${(weigh(OUT_ROOT) / 1048576).toFixed(1)} Mo\n` +
    `  ${MANIFEST} : ${Object.keys(manifest).length} entrées`,
);
