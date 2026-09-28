import sharp from 'sharp';

/* ---- Favicon : le pictogramme du chalet, miel sur forêt ----
   Le bloc complet est illisible à 16 px ; le chalet et son sapin, eux,
   tiennent à toute taille et disent le nom — Chalet Cosy. */
const star = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="Chalet Cosy">
  <rect width="64" height="64" fill="#1C2A20"/>
  <g fill="none" stroke="#E6C590" stroke-width="3.4" stroke-linejoin="round" stroke-linecap="round">
    <path d="M6 33 L32 12 L58 33"/>
    <path d="M13 29 V52 H51 V29"/>
    <path d="M27 52 V40 H37 V52"/>
  </g>
</svg>`;
import fs from 'fs';
fs.writeFileSync('public/favicon.svg', star);
await sharp(Buffer.from(star), { density: 400 }).resize(180, 180).png()
  .toFile('public/images/favicon-180.png');

/* ---- Image de partage : le chalet, signé du logo ----
   Une photographie attire le clic bien mieux qu'un logo seul ; le logo
   posé dessus dit de qui elle est. Voile dégradé en bas pour que le
   doré tienne quelle que soit la photo. */
const W = 1200, H = 630;
const photo = await sharp('public/images/chalet/chalet-face.webp')
  .resize(W, H, { fit: 'cover', position: 'centre' }).toBuffer();

const veil = Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
     <defs><linearGradient id="v" x1="0" y1="0" x2="0" y2="1">
       <stop offset="22%" stop-color="#1C2A20" stop-opacity="0"/>
       <stop offset="58%" stop-color="#1C2A20" stop-opacity="0.52"/>
       <stop offset="100%" stop-color="#1C2A20" stop-opacity="0.93"/>
     </linearGradient></defs>
     <rect width="${W}" height="${H}" fill="url(#v)"/>
   </svg>`);

const logo = await sharp('brand/logo-source.png').raw().toBuffer({ resolveWithObject: true })
  .then(({ data, info }) => {
    const BG = [0x1C, 0x2A, 0x20], GOLD = [0xE6, 0xC5, 0x90];
    const d = GOLD.map((v, i) => v - BG[i]);
    const dd = d.reduce((a, v) => a + v * v, 0);
    const out = Buffer.alloc(info.width * info.height * 4);
    for (let i = 0, o = 0; i < data.length; i += info.channels, o += 4) {
      let t = ((data[i] - BG[0]) * d[0] + (data[i+1] - BG[1]) * d[1] + (data[i+2] - BG[2]) * d[2]) / dd;
      t = Math.max(0, Math.min(1, t));
      out[o] = GOLD[0]; out[o+1] = GOLD[1]; out[o+2] = GOLD[2]; out[o+3] = Math.round(t * 255);
    }
    return sharp(out, { raw: { width: info.width, height: info.height, channels: 4 } })
      .extract({ left: 230, top: 320, width: 795, height: 645 })
      .resize({ width: 300 }).png().toBuffer();
  });

const LW = 300, lh = Math.round(LW * 645 / 795);
await sharp(photo)
  .composite([
    { input: veil },
    { input: logo, top: H - lh - 36, left: Math.round((W - LW) / 2) },
  ])
  .jpeg({ quality: 84 }).toFile('public/images/og.jpg');

console.log('favicon et image sociale régénérés');
