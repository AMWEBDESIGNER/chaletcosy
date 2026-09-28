# Chalet Cosy — site vitrine

Site d'un **chalet unique** en location saisonnière à Digne-les-Bains
(Alpes-de-Haute-Provence) : chalet en bois de 30 m² de plain-pied, une
chambre + canapé convertible (4 voyageurs), terrasse, jardin, vélos, au pied
de la montagne, près du Musée Promenade et des thermes.
Annonce : https://www.airbnb.fr/rooms/1742976957181102288

Le site est une **copie adaptée du gabarit de La Belle Étoile** (villa à
Cassis, dépôt `labelleetoile`) : même pile, même mouvement, même moteur de
réservation. Seuls le contenu, les photographies, le logo et la palette
(« Forêt » : lin, bois, vert forêt, miel, lavande) ont changé. Plusieurs
identifiants internes hérités sont gardés tels quels — `villa.ts`, `VILLA`,
`LEVELS`, les jetons de couleur `bronze`/`azur`/`bougain`, la courbe `lbe`,
les cookies `lbe_*`, l'erreur SQL `LBE_DATES_PRISES` : ce sont des noms de
code, jamais affichés.

Ce n'est **pas** un site d'agence ni un catalogue : un seul bien. Tout le
contenu éditorial est en dur dans le code.

## Commandes

```bash
npm install
npm run dev      # http://localhost:4321
npm run build    # sortie dans dist/
npm run check    # vérification des types Astro
npm run images   # déclinaisons responsives — à relancer après ajout de photo
```

Node 18+ requis.

## Pile technique

- **Astro 5** en `output: 'static'`, adaptateur **Cloudflare**
- **Tailwind** (préréglage maison, voir `tailwind.config.mjs`)
- **GSAP 3.15** (ScrollTrigger, ScrollSmoother, SplitText, CustomEase) pour
  tout le mouvement — aucun framework d'interface côté client
- `build.format: 'file'` et `trailingSlash: 'never'` → une page = une adresse,
  sans barre finale (`/contact`, pas `/contact/`)

Deux routes seulement sont rendues à la demande (`export const prerender = false`) :
`src/pages/api/contact.ts` et `src/pages/robots.txt.ts`. Tout le reste est prérendu.

## Où se trouve quoi

```
src/lib/villa.ts        ← LA source de vérité : chiffres, espaces,
                          équipements, règles, galerie (nom hérité)
src/lib/serveur/        ← CÔTÉ SERVEUR EXCLUSIVEMENT — lit les clés
                          secrètes. base.ts (la base), auth.ts (l'entrée
                          du back-office), stripe.ts (l'encaissement)
src/lib/partition.ts    ← la mise en page de la galerie, en rangées de
                          12 colonnes toujours complètes
src/lib/legal.ts        ← informations de l'éditeur et mentions légales
src/lib/seo.ts          ← données structurées (fil d'Ariane, galerie, FAQ)
src/lib/images.json     ← généré ; dimensions et déclinaisons des photos
src/lib/lastmod.json    ← généré ; dates de dernière modification des pages
tools/                  ← scripts de build (voir plus bas)
src/pages/              ← une page = un fichier
  index.astro           ← accueil — structure de villadellatorre.it (voir plus bas)
  le-chalet.astro       ← esprit du lieu, trois espaces, équipements, séjour
  galerie.astro         ← 32 photos en partition éditoriale + visionneuse
  digne-les-bains.astro ← Géoparc, thermes, musées, via ferrata, lavande
  contact.astro         ← formulaire de demande de séjour
  admin/                ← le back-office, sous `Admin.astro` (voir plus bas)
src/components/         ← Header, Footer, Brand (logo), Photo, Breadcrumb,
                          Tile, Consent…
src/scripts/anim.ts     ← TOUT le mouvement, en GSAP (voir plus bas)
src/scripts/motion.ts   ← le fonctionnel : menu, visionneuse, formulaires
src/styles/global.css   ← design system : polices, classes, composants
brand/                  ← logo source + scripts de génération (voir son README)
```

### `src/lib/villa.ts` — à modifier en premier

Toutes les pages lisent d'ici. Un chiffre corrigé une fois l'est partout.
Il porte `VILLA` (surface, capacité, suppléments, note, coordonnées), `LEVELS`
(les trois espaces du chalet — pièce à vivre, coin nuit, dehors),
`AMENITIES`, `RULES`, `GALLERY` et l'aide `mapUrl()`.

**Volontairement absents** : l'adresse exacte du chalet et le nom des
personnes qui y travaillent. Une location saisonnière ne publie pas sa rue —
elle est communiquée à la réservation. Ne pas les ajouter sans demander.

## Les photographies — `Photo.astro`

L'adaptateur est `cloudflare({ imageService: 'passthrough' })` : l'optimisation
d'images d'Astro est désactivée et `<Image>` d'`astro:assets` ne produit rien.
Le site fait donc son propre travail.

`tools/build-images.mjs` décline chaque photo de `public/images/chalet` et
`public/images/digne` en 480 / 800 / 1280 / largeur d'origine, en WebP **et** en AVIF
(~37 % de moins à qualité perçue égale, mesuré sur ce lot). Il écrit dans
`public/images/rendus/` et inscrit le tout dans `src/lib/images.json`.

⚠️ **Les fichiers produits sont versionnés, comme ceux du logo.** Le script
n'est *pas* branché sur `build` : un AVIF coûte trois à dix secondes, les
régénérer à chaque déploiement porterait celui-ci à un quart d'heure. Il ne
produit que ce qui manque — retoucher une photo sans la renommer demande donc
`node tools/build-images.mjs --force`.

`Photo.astro` en tire un `<picture>`. Ses `sizes` sont nommés d'après la mise
en page : `pleine`, `article`, `deux-tiers`, `moitie`, `tiers`, `vignette`.
Une image absente du manifeste sort sans `<source>` et **sans `width`/`height`**
— le build l'annonce en clair, il ne faut pas l'ignorer.

`picture { display: contents }` (dans `global.css`) est ce qui rend l'ajout
invisible à la mise en page. C'est aussi pourquoi les sélecteurs de révélation
d'image sont écrits en descendant (`[data-anim='capsule'] img`) et non en
enfant direct : **ne pas les repasser en `>`**, la révélation cesserait.

## Design system

Défini dans `src/styles/global.css` et `tailwind.config.mjs`.

**Polices** — `serif` Newsreader (variable 300→700, axe optique),
`script` Pinyon Script (l'anglaise des accents), `sans` Switzer.
Toutes auto-hébergées dans `public/fonts/`.

**Couleurs** — palette « Forêt ». Les noms de jetons sont ceux du gabarit :
`ink` (vert forêt profond), `bone` (lin écru, fond principal), `sand` (bois
blond, bandes alternées), `bronze`/`bronze-lt` (le bois de mélèze sur fond
clair / le miel sur fond sombre), `azur` (la sauge), `bougain` (la lavande,
accent rare), `gold`/`nuit-logo` (les deux couleurs du logo : miel et forêt).

⚠️ Les tons de texte (`muted`, `faint`, `bronze`) sont **calés sur le seuil AA
(4.5:1)** mesuré contre `bone` *et* `sand`. Un gris choisi à l'œil passe presque
toujours sous la barre — vérifier tout changement de couleur de texte.

⚠️ `azur` (la sauge) est lisible sur `ink` mais **se confond avec le
feuillage** sur une photographie. Sur les fonds photographiques, préférer
`bone` ou `bronze-lt`.

**Classes utiles** — `.display` `.h-xl` `.h-lg` `.lead` `.prose-body`
`.eyebrow` `.chapter` `.manifest` `.script` `.arch` `.index-row` `.btn`
`.field` `.link-arrow` `.ul-link` `.hover-zoom` `.container-x` `.section`.

## Le mouvement — tout en GSAP

`src/scripts/anim.ts`. GSAP 3.15 avec ScrollTrigger, ScrollSmoother, SplitText
et CustomEase — tous gratuits depuis 2025. `motion.ts` ne garde plus que le
fonctionnel : menu, visionneuse, formulaires (et la vidéo du hero, que le
chalet n'utilise pas : sans `video[data-hero-video]`, rien ne se charge).

### La règle unique

**Une apparition se joue sur une HORLOGE, jamais sur la molette, et une seule
fois.** Le défilement DÉCLENCHE ; il ne pilote pas.

Le site a d'abord été construit à l'inverse — au « scrub », la position de
défilement commandant l'avancement image par image, avec des sections qui
épinglaient le défilement. Cela produisait quatre défauts, tous liés :

- il fallait **défiler** pour faire apparaître un texte : à l'arrêt, on restait
  devant un élément à moitié entré ;
- il fallait **attendre** : une section épinglée retient tant qu'elle n'est pas
  montée ;
- on n'avait **pas le temps de lire** : à défilement rapide tout passait d'un
  coup ;
- rien n'était **centré** : une scène épinglée se cale sur son cadre, pas sur
  le regard.

⚠️ **Ne pas réintroduire de `scrub` sur une apparition de texte ou d'image.**
Le scrub ne reste légitime que là où le lien au défilement est le sujet
lui-même : la parallaxe de fond (`data-speed`, géré par ScrollSmoother).

### Les trois nombres

Dans `anim.ts`, et ils se règlent à la lecture :

| Constante | Valeur | Rôle |
|---|---|---|
| `DEPART` | `top 85%` | l'élément part quand son haut atteint 85 % de la fenêtre — donc bien avant le centre : il a fini de se poser quand le regard l'atteint |
| `DUREE` | `0.9 s` | la course d'une apparition |
| `ECART` | `0.09 s` | le décalage entre deux éléments d'un groupe |

### Les gestes

Déclarés par `data-anim` dans le HTML :

| Valeur | Effet |
|---|---|
| `lignes` | titre découpé par SplitText, chaque ligne monte de son masque |
| `capsule` | le cadre s'ouvre d'une fente arrondie, l'image se desserre de 1,08 à 1 |
| `balayage` | le cadre s'ouvre d'un bord à l'autre, l'image se pose de 1,1 à 1 |
| `partition` | une RANGÉE de la galerie s'ouvre d'un coup, cellules décalées |
| `montee` | montée de 28 px + fondu — le geste par défaut |
| `trait` | un filet se tire à la règle |
| `groupe` | les enfants directs entrent l'un après l'autre |
| `lettres` | titre découpé par caractère — réservé au SEUL grand titre de l'accueil |
| `compteur` | un nombre se compte (typographie fr-FR) |

### Les sections entières

| Marqueur | Section |
|---|---|
| `data-bande` + `data-bande-piste` | la bande horizontale : une file de photographies qui défile de côté pendant qu'on descend |
| `data-pile` | les cartes qui s'empilent (les trois espaces de `/le-chalet`) |
| `data-colonnes` | les colonnes d'une composition dérivent à des vitesses différentes |
| `data-derive` | l'image glisse dans son cadre |
| `data-index` | la table des matières : noms en grand corps, une vignette qui suit le curseur (« pour qui ? », sur l'accueil) |
| `data-speed` | parallaxe déclarative, lue par ScrollSmoother |

⚠️ **`position: sticky` NE FONCTIONNE PAS sous ScrollSmoother.** Il déplace
`#smooth-content` par transformation, et un ancêtre transformé devient le bloc
conteneur de ses descendants : il n'existe alors plus aucun défilement
d'ancêtre contre lequel se coller. Tout empilement passe par `pin` de
ScrollTrigger, avec `pinSpacing: false` pour que les cartes se recouvrent au
lieu de se suivre.

⚠️ **La bande horizontale est le seul épinglage du site**, et il est justifié :
sans lui, une file plus large que l'écran serait inatteignable. Sa course
verticale égale exactement sa course horizontale — un pixel de molette, un
pixel de bande. Toute autre valeur donne la sensation d'un défilement qui
patine.

⚠️ **`capsule` et `balayage` animent une VARIABLE (`--capsule`, `--balayage`),
pas la chaîne `clip-path`.** Deux `inset()` complets s'interpolent mal d'un
navigateur à l'autre et le geste saccade. Le CSS recompose la découpe.

### La passe automatique

Le reste du contenu n'est **pas** balisé à la main. `anim.ts` parcourt chaque
`main section` et ramasse ce qui se lit (titres, paragraphes, figures, boutons,
lignes de liste) pour leur donner la montée par défaut, en cascade.

⚠️ **Le déclencheur est la SECTION, jamais l'élément.** Sur une rangée de
tuiles, déclencher chacune séparément les ferait entrer en désordre selon leur
hauteur. Une section, une cadence.

⚠️ **Mais une section n'est une cadence que si elle TIENT DANS LE REGARD.**
Une section de six lieux haute de trois écrans faisait partir ses vingt-quatre
éléments quand son *haut* atteignait 85 % : les derniers jouaient hors champ,
et l'on arrivait devant une chose déjà posée. Les sections de plus de huit
dixièmes d'écran se découpent donc en **bandes**, une par déclencheur. Une
section courte n'a qu'une bande et retrouve le comportement d'origine.

⚠️ **Un acteur ne joue jamais dans un acteur** : tout ce qui est déjà pris par
un `[data-anim]`, ou contenu dedans, est écarté — deux animations emboîtées
composeraient leurs déplacements.

### Les pièges d'intégration

⚠️ **L'en-tête, le menu et le bandeau de consentement sont HORS de
`#smooth-wrapper`.** ScrollSmoother déplace `#smooth-content` par
transformation : un élément `position: fixed` placé dedans devient solidaire de
ce déplacement et se met à défiler avec la page.

⚠️ **Pas de `scroll-behavior: smooth` sur `html`** : il se battrait avec
ScrollSmoother à chaque ancre.

⚠️ **Le découpage des titres attend les polices.** Découpé sur la police de
repli, les lignes tombent au mauvais endroit et le masque coupe un mot en deux.
`monterQuandPret()` attend `document.fonts.ready`.

⚠️ **`demonter()` doit défaire les SplitText** (`revert()`) : sans ça, chaque
navigation empilerait un nouveau découpage sur le précédent.

⚠️ **Rien n'est masqué par le CSS.** Un état masqué en CSS est un contenu perdu
si le script échoue. C'est GSAP qui pose l'état de départ, au montage, et lui
seul. En mouvement réduit, `anim.ts` ne monte rien du tout.

### La visionneuse

Le vol de la vignette vers le plein écran est calculé par **GSAP Flip**
(`motion.ts`). `scale: true` est indispensable : la vignette recadre en
`cover`, la visionneuse ajuste en `contain` — sans lui le vol est anisotrope
et l'image se déforme pendant la traversée.

**Coût** : le JS passe de 41 à 157 Ko (GSAP + cinq plugins).

### Emprunts

Deux techniques viennent des démos **Codrops** (licence MIT, `codrops/*`) :
le préfixe `clamp()` sur les plages de ScrollTrigger, qui empêche un élément
proche du haut ou du bas du document de jouer hors champ, et la dérive
différenciée des colonnes.

## Ce qu'il ne faut pas réintroduire

Trois motifs ont été retirés de l'accueil. Ne pas les ramener :

- **Le repère numéroté en tête de section** (`01 — La maison`…). Quatre sections
  qui disent des choses différentes portaient le même chiffre au même endroit.
- **Trois cartes alignées pour illustrer trois idées.** Elles se lisent comme
  trois produits au même prix.
- **Trois tuiles de même taille en rang.** Chez Torre les tuiles vont par deux.

Et : **pas de libellé d'action générique** quand un verbe concret existe.
`Tile.astro` n'a volontairement **pas** de valeur par défaut pour `cta` — un
défaut serait « Découvrir », et l'oubli ne compile pas.

## Le rideau — entrer dans le site

Un seul geste sert deux fois : **deux panneaux d'encre qui entrent par les
bords ou s'en retirent**. Le menu s'ouvre ainsi, la page s'ouvre ainsi. Ne pas
introduire un troisième mouvement d'entrée — c'est ce qui fait qu'on reconnaît
le site à sa navigation.

- **Le menu** (`Header.astro`) est plein écran **à toutes les largeurs** : il
  n'y a plus de barre de rubriques sur grand écran. Un chalet unique n'a pas
  quatre onglets à aligner. Le JS le pilote depuis `header()` dans `motion.ts`
  — les identifiants `#hdr`, `#burger`, `#overlay` sont le contrat entre les
  deux, ne pas les renommer.
- **L'ouverture de page** (`.veil`, posé par `Layout.astro`) ne joue **qu'une
  fois par session** et jamais en mouvement réduit. Elle ne retient rien : la
  page est peinte dessous, `pointer-events: none` de bout en bout. La décision
  se prend dans le script en ligne du `<head>` — il doit y rester, sinon le
  rideau apparaîtrait après la première peinture.
- Au survol, chaque libellé du menu **bascule du romain à l'italique miel**
  (`.mn-link`). Deux `<span>` du même mot dans une seule cellule de grille, le
  second `aria-hidden` : c'est un dessin, pas une information.

⚠️ Le rideau étant d'encre, l'en-tête passe **en clair** quand le menu est
ouvert — `paint()` dans `motion.ts`. C'était l'inverse du temps où le panneau
était ivoire ; ne pas rétablir l'ancienne condition.

## `Tile.astro` — la tuile qui se déplie

Au repos, la photographie n'est qu'une bande découpée au `clip-path` ; au
survol la découpe s'ouvre en grand pendant que l'image, décalée vers le haut,
redescend se mettre en place. Le résumé s'efface, le libellé d'action monte.

Deux propriétés animées seulement, `clip-path` et `transform` : aucun recalcul
de mise en page.

**À réserver aux blocs qui mènent ailleurs.** Le survol masque le résumé : sur
un contenu terminal — les espaces de `/le-chalet`, les lieux de `/digne-les-bains` — il
cacherait l'information au lieu de l'annoncer. C'est aussi pourquoi
`@media (hover: none)` ouvre la tuile d'emblée.

## Les courbes

`--ease` (l'historique), plus deux ajouts dans `:root` et dans Tailwind
(`ease-expo`, `ease-soft`) :

- **`--ease-expo`** — départ franc, arrêt très long. Tout ce qui a de la
  surface : rideau, tuiles, dézoom du hero.
- **`--ease-soft`** — symétrique, sans emphase. Ce qui part et revient.

## Le logo

`brand/logo-source.html` est la composition (pictogramme sapin + chalet,
« CHALET », « Cosy » à l'anglaise, filet, lieu), rendue par Chromium en
`brand/logo-source.png` : miel `#E6C590` sur forêt `#1C2A20`.
Les déclinaisons servies sont générées, **jamais éditées à la main** :

```bash
node brand/build-logo.mjs     # les 4 variantes (2 tons × 2 formats)
node brand/build-social.mjs   # favicon + image de partage
```

Le composant `Brand.astro` les expose via `variant` (`compact`/`full`) et
`tone` (`auto`/`or`/`nuit` — `or` est le ton clair, `nuit` le ton sombre).
Détail du pipeline dans `brand/README.md`.

## Le back-office — `/admin`

Quatre pages en SSR sous `src/pages/admin/`, dans `layouts/Admin.astro` —
un cadre **séparé** de `Layout.astro` : un tableau n'a que faire de GSAP,
du rideau et des polices maison.

**L'entrée se joue en trois temps**, et les trois sont côté serveur :

1. Supabase Auth vérifie le couple courriel/mot de passe. Lui seul tient
   les mots de passe et la limitation des tentatives.
2. Les jetons partent dans des cookies **`HttpOnly`, portée `/admin`** —
   le JavaScript de la page ne peut pas les lire, et ils n'accompagnent
   aucune requête du site public.
3. La table `profils` dit si ce compte a le droit d'entrer. Elle est
   **relue à chaque affichage** : retirer un accès prend effet au
   rechargement, pas à l'expiration du jeton.

```bash
node tools/creer-admin.mjs vous@exemple.fr 'un mot de passe long'
```

⚠️ **Toute page d'administration commence par la garde**, et son résultat
se teste :

```ts
const garde = await exigeAdmin(Astro);
if (garde.refus) return garde.refus;
```

La forme du retour est délibérée : une garde qui rendrait `null` en cas de
refus laisserait le rendu se poursuivre si l'on oublie le test. Ici,
l'oubli laisse `garde.session` à `undefined` et **la page ne compile pas**.

⚠️ **Le navigateur ne parle jamais à Supabase**, ici pas plus qu'ailleurs.
C'est le Worker qui lit, avec `service_role`, et `lis()` de `base.ts` est
la seule porte — à n'appeler que derrière la garde, puisqu'elle traverse
RLS. Ne pas introduire le SDK Supabase côté client : il range les jetons
dans `localStorage`, ce qui les rend lisibles par tout script injecté et
rouvre la porte que `schema.sql` ferme.

⚠️ **`/admin` est ajouté à la main dans `astro.config.mjs`.** L'adaptateur
n'émet que `/admin/*`, motif qui exige la barre suivante : sans cette
ligne, l'adresse qu'on tape à la main échapperait au Worker en production.

## Déploiement

**Cloudflare Pages**, branche `main` → https://chaletcosy.pages.dev
(projet Pages à créer — l'adresse est celle que suppose `astro.config.mjs`)
Chaque push déclenche un déploiement (1 à 3 minutes).

⚠️ **`_routes.json` exclut toutes les pages prérendues du Worker** : le
middleware ne s'exécute que pour `/api/*` et `/robots.txt`. Les en-têtes de
sécurité des pages se posent donc dans `public/_headers`, et nulle part
ailleurs — ce que `src/middleware.ts` y écrit n'atteint aucun visiteur.

Réglages du projet Pages, à ne pas casser :
- build `npm run build`, sortie `dist`
- **compatibility flag `nodejs_compat`** obligatoire (le code touche `node:buffer`)
- variables optionnelles : `RESEND_API_KEY`, `CONTACT_FROM`, `CONTACT_TO`
  (sans elles le formulaire de contact répond « envoi indisponible » ; le
  reste du site fonctionne)

Les variables attendues sont listées et commentées dans **`.env.example`**.
En local, `cp .env.example .env.local` puis remplir.

⚠️ **Aucun `.env*` n'est versionné** — c'est ce que dit `.gitignore`, et
c'est arrivé une fois. En production les clés vivent dans le tableau de
bord Cloudflare. Seule `PUBLIC_STRIPE_PUBLISHABLE_KEY` porte le préfixe
`PUBLIC_`, et c'est son rôle : Stripe Elements la lit dans la page. Aucune
autre ne doit le porter — Astro expose au navigateur tout ce qui l'a.

## Conventions

- **Tout est en français** : contenu, commentaires, messages de commit.
- Les commentaires expliquent **pourquoi**, pas quoi. Beaucoup de choix du code
  sont des arbitrages documentés sur place — les lire avant de « simplifier ».
- Chaque image porte un `alt` descriptif ; les images décoratives sont
  `alt=""` + `aria-hidden`.
- Les liens externes : `target="_blank" rel="noopener"`.

## À compléter avant ouverture au public

`src/lib/legal.ts` contient des **valeurs de réservation**, pas des données
réelles :

- `siret`, `legalForm`, `director`, `address`, `phone`, `email`
- `registration.number` — le numéro de meublé de tourisme délivré par la
  mairie de Digne-les-Bains, **obligatoire** pour une location saisonnière
- `mediator` — le médiateur de la consommation reste à désigner (art. L.612-1)

Le bouton « Réserver » pointe vers l'annonce Airbnb (`VILLA.airbnb`).

Le moteur de réservation directe (`src/lib/reservation.ts`) ne connaît
qu'un prix par nuit et un forfait ménage obligatoire. Deux conditions de
l'annonce n'y passent donc pas : le **supplément de 20 €/nuit au-delà de
deux voyageurs** et le **ménage optionnel à 50 €**. Elles sont affichées sur
le site (règlement, contact, FAQ) ; `supabase/seed-provisoire.sql` le rappelle.

Les photographies de `public/images/digne/` viennent de **Wikimedia
Commons** : leurs auteurs et licences sont dans `src/lib/credits.ts`, et la
page des mentions légales les affiche. Toute nouvelle photo de ce dossier
doit y être créditée.
