import sharp from 'sharp';
import fs from 'fs';

const SRC = 'brand/logo-source.png';
const BG   = [0x1C, 0x2A, 0x20];   // le fond du logo — vert forêt
const GOLD = [0xE6, 0xC5, 0x90];   // son miel doré
const TRIM = { left: 230, top: 320, width: 795, height: 645 };

const { data, info } = await sharp(SRC).raw().toBuffer({ resolveWithObject: true });
const { width: W, height: H, channels: C } = info;

/* Alpha par projection du pixel sur l'axe fond→doré : l'anticrénelage se
   place naturellement entre les deux, sans halo sur les bords. */
const d = GOLD.map((v, i) => v - BG[i]);
const dd = d.reduce((a, v) => a + v * v, 0);

const paint = (rgb) => {
  const out = Buffer.alloc(W * H * 4);
  for (let i = 0, o = 0; i < data.length; i += C, o += 4) {
    let t = ((data[i] - BG[0]) * d[0] + (data[i+1] - BG[1]) * d[1] + (data[i+2] - BG[2]) * d[2]) / dd;
    t = Math.max(0, Math.min(1, t));
    out[o] = rgb[0]; out[o+1] = rgb[1]; out[o+2] = rgb[2];
    out[o+3] = Math.round(t * 255);
  }
  return sharp(out, { raw: { width: W, height: H, channels: 4 } }).extract(TRIM);
};

/* Deux tons — miel pour les fonds sombres, forêt pour les fonds clairs —
   et deux formats : le bloc complet, et une version compacte (CHALET et
   l'anglaise, sans le pictogramme ni la ligne du lieu) car sous 80 px de
   haut la ligne « DIGNE-LES-BAINS · PROVENCE » deviendrait illisible. */
const wide = { or: GOLD, nuit: BG };
const enc = { quality: 74, alphaQuality: 92, effort: 6 };

/* Deux définitions par format. L'en-tête pose le bloc compact sur ~60 px de
   large, le pied de page le bloc complet sur ~160 px : à un pixel par point,
   la grande définition est deux fois trop lourde pour rien ; à deux, c'est
   elle qu'il faut. `srcset` laisse le navigateur trancher (voir Brand.astro).
   La plus grande garde son nom historique — c'est elle que désignent le
   `src` de repli et tous les liens existants. */
const FORMATS = {
  '': { widths: [280, 560], crop: null },
  '-compact': { widths: [200, 400], crop: { left: 210, top: 150, width: 420, height: 385 } },
};

const written = [];
for (const [ton, rgb] of Object.entries(wide)) {
  // Sharp n'enchaîne pas deux découpes : on matérialise le bloc détouré,
  // puis on y taille la variante compacte.
  const full = await paint(rgb).png().toBuffer();
  for (const [suffix, { widths, crop }] of Object.entries(FORMATS)) {
    const base = crop ? await sharp(full).extract(crop).png().toBuffer() : full;
    for (const w of widths) {
      const name = `logo-${ton}${suffix}${w === widths.at(-1) ? '' : `-${w}`}`;
      await sharp(base).resize({ width: w }).webp(enc).toFile(`public/images/${name}.webp`);
      written.push(name);
    }
  }
}

for (const f of written.sort()) {
  const p = `public/images/${f}.webp`;
  const m = await sharp(p).metadata();
  console.log(`${f.padEnd(24)} ${m.width}×${m.height}  ${(fs.statSync(p).size / 1024) | 0} Ko`);
}
