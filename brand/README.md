# Sources de la marque

`logo-source.html` — la composition du logo : pictogramme (un sapin et un
chalet au toit à large débord), « CHALET » en Switzer capitales espacées,
« Cosy » à l'anglaise (Pinyon Script), un filet, puis la ligne du lieu.
Miel `#E6C590` sur vert forêt `#1C2A20`. Les polices sont celles du site.

`logo-source.png` — son rendu à 1254 × 1254, produit par Chromium à partir
du HTML (les polices `public/fonts/*.woff2` doivent être copiées à côté du
fichier HTML le temps du rendu). C'est lui que lisent les scripts.

`build-logo.mjs` régénère les déclinaisons servies par le site. À relancer
depuis la racine du dépôt après toute modification du fichier source :

```bash
node brand/build-logo.mjs     # les 4 variantes (2 tons × 2 formats)
node brand/build-social.mjs   # favicon + image de partage
```

Il produit dans `public/images/` :

| Fichier | Usage |
|---|---|
| `logo-or.webp` | bloc complet, miel — pied de page et fonds sombres |
| `logo-nuit.webp` | bloc complet, forêt — fonds clairs |
| `logo-or-compact.webp` | CHALET + Cosy, miel — en-tête sur photographie |
| `logo-nuit-compact.webp` | CHALET + Cosy, forêt — en-tête sur fond clair |

(Les noms `or`/`nuit` sont hérités du gabarit d'origine : `or` est le ton
clair, `nuit` le ton sombre.)

Chacun est doublé d'une définition moitié (`-280` pour le bloc complet,
`-200` pour le compact) : le logo est posé à hauteur fixe, et un écran à un
pixel par point n'a jamais besoin de la grande. `Brand.astro` les expose en
`srcset` et laisse le navigateur choisir.

Le détourage calcule l'alpha en projetant chaque pixel sur l'axe
fond → miel : l'anticrénelage se place tout seul, sans halo sur les bords.

⚠️ Si la composition change, les rectangles `TRIM` et `crop` de
`build-logo.mjs` (et la découpe de `build-social.mjs`) sont à recalculer,
ainsi que les dimensions déclarées dans `Brand.astro`.
