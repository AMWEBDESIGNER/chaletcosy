/* ============================================================
   Chalet Cosy — le mouvement, entièrement en GSAP.

   CE QUI A ÉTÉ JETÉ, ET POURQUOI. Le site pilotait ses apparitions au
   « scrub » : la position de défilement commandait l'avancement de chaque
   animation, image par image, et des sections épinglaient le défilement le
   temps de se composer. Sur le papier c'est séduisant ; à l'usage cela
   produisait exactement quatre défauts, tous liés :

     — il fallait DÉFILER pour faire apparaître un texte : arrêté, on
       restait devant un élément à moitié entré ;
     — il fallait ATTENDRE : une section épinglée retient le défilement
       tant qu'elle n'est pas montée ;
     — on n'avait PAS LE TEMPS DE LIRE : à défilement rapide, toute la
       chorégraphie passait en une fraction de seconde ;
     — rien n'était CENTRÉ : une scène épinglée se cale sur son propre
       cadre, pas sur le regard.

   LA RÈGLE QUI REMPLACE TOUT ÇA. Une apparition se joue sur une HORLOGE,
   jamais sur la molette, et une seule fois. Le défilement ne fait que
   DÉCLENCHER ; il ne pilote plus. L'élément part quand son haut atteint
   85 % de la fenêtre — donc bien avant le centre — et il a fini de se
   poser au moment où le regard l'atteint. On défile à son rythme, ça
   arrive tout seul, on lit.

   Le scrub n'est gardé QUE là où le lien au défilement est le sujet
   lui-même : la parallaxe et le desserrement du hero. Jamais pour un
   texte.
   ============================================================ */
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { ScrollSmoother } from 'gsap/ScrollSmoother';
import { SplitText } from 'gsap/SplitText';
import { CustomEase } from 'gsap/CustomEase';

gsap.registerPlugin(ScrollTrigger, ScrollSmoother, SplitText, CustomEase);

/* La courbe maison : départ franc, arrêt très long. C'est elle qui donne
   aux grandes surfaces l'impression d'avoir du poids, et au texte celle
   de se poser plutôt que de s'arrêter. */
CustomEase.create('lbe', '0.16, 1, 0.3, 1');

/* ---------- LA CADENCE ----------
   Trois nombres, et ils se règlent à la lecture.

   `DEPART` — l'élément part quand son haut atteint ce pourcentage de la
   fenêtre. À 85 %, il vient d'entrer par le bas : l'animation se joue
   pendant qu'on continue de défiler vers lui, et elle est terminée quand
   il arrive à hauteur d'œil. Plus bas (95 %) il partirait hors champ ;
   plus haut (60 %) on le verrait attendre son tour au milieu de l'écran.

   `DUREE` — la course d'une apparition, en secondes. Indépendante du
   défilement : c'est tout l'objet de la refonte.

   `ECART` — le décalage entre deux éléments d'un même groupe. À 0,09 s
   les gestes se chevauchent largement : une coulée, pas une file. */
const DEPART = 'top 85%';
const DUREE = 0.9;
const ECART = 0.09;

let smoother: ScrollSmoother | null = null;
let splits: SplitText[] = [];
/* Les écouteurs posés à la main (survol, curseur) : GSAP ne les connaît
   pas, il faut les retirer soi-même à chaque navigation. */
let ecouteurs: Array<() => void> = [];

const reduit = () => new URLSearchParams(location.search).has('edition')
  || matchMedia('(prefers-reduced-motion: reduce)').matches;
/* Sur iOS, les effets pilotés image par image par le scroll (lissage,
   parallaxe et pin) se battent avec l'inertie native et les variations de
   hauteur provoquées par les barres de Safari. Le résultat est un léger
   va-et-vient, surtout à l'entrée et à la sortie d'une section épinglée.
   Les animations ponctuelles restent actives ; seuls les effets continus
   sont remplacés par le défilement natif sur un écran tactile. */
const tactile = () => matchMedia('(hover: none), (pointer: coarse)').matches;

/* ============================================================
   LES GESTES
   Un rôle, un geste. Chacun est déclaré par `data-anim` dans le HTML.
   ============================================================ */

/** Commun à tous : déclencher une fois, sur une horloge, jamais scruber. */
function surEntree(cible: Element, vars: gsap.TweenVars, decl?: Element) {
  return {
    ...vars,
    scrollTrigger: {
      trigger: decl ?? cible,
      start: DEPART,
      once: true,
    },
  };
}

/* ---------- Le titre, ligne à ligne ----------
   SplitText découpe le titre en lignes réelles (celles que le navigateur
   a calculées, pas des sauts devinés), chacune dans son propre masque.
   Les lignes montent de leur cadre, décalées.

   ⚠️ Le découpage doit attendre les polices : découpé sur la police de
   repli, les lignes tombent au mauvais endroit et le masque coupe un mot
   en deux. `document.fonts.ready` est attendu avant tout montage. */
function gesteLignes(el: HTMLElement) {
  const split = new SplitText(el, {
    type: 'lines',
    linesClass: 'ligne',
    // Chaque ligne reçoit son propre masque : c'est ce qui fait qu'elle
    // monte DE quelque part au lieu de simplement glisser.
    mask: 'lines',
  });
  splits.push(split);

  gsap.from(split.lines, surEntree(el, {
    yPercent: 110,
    duration: DUREE + 0.15,
    ease: 'lbe',
    stagger: ECART,
  }));
}

/* ---------- La capsule ----------
   Reprise de l'idée du « capsule hero » : le cadre s'ouvre depuis une
   fente arrondie jusqu'à sa pleine taille, et l'image se desserre de 1,08
   à 1 pendant ce temps. Les deux mouvements ensemble donnent la sensation
   que l'image était déjà là, derrière une fenêtre qu'on ouvre.

   ⚠️ On anime `--capsule` — une simple valeur en pourcentage — et non la
   chaîne `clip-path` elle-même : les navigateurs interpolent mal deux
   `inset()` complets, et le résultat saccade. Le CSS recompose la chaîne
   à partir de la variable. */
function gesteCapsule(el: HTMLElement) {
  const img = el.querySelector('img');
  const tl = gsap.timeline(surEntree(el, {}));

  tl.fromTo(el, { '--capsule': '42%' }, {
    '--capsule': '0%', duration: DUREE + 0.35, ease: 'lbe',
  });
  if (img) {
    tl.fromTo(img, { scale: 1.08 }, {
      scale: 1, duration: DUREE + 0.55, ease: 'lbe',
    }, 0);
  }
}

/* ---------- Le balayage ----------
   L'idée du « wipe slider » : le cadre s'ouvre d'un bord à l'autre pendant
   que l'image se pose. Même précaution que la capsule — on anime une
   variable, pas une chaîne `clip-path`.
   Le sens est déclaré (`data-anim-sens`) : tout ce qui balaye dans une
   même section doit s'accorder, sinon on lit deux mouvements au lieu d'un. */
function gesteBalayage(el: HTMLElement) {
  const img = el.querySelector('img');
  const tl = gsap.timeline(surEntree(el, {}));

  tl.fromTo(el, { '--balayage': '100%' }, {
    '--balayage': '0%', duration: DUREE + 0.25, ease: 'lbe',
  });
  if (img) {
    tl.fromTo(img, { scale: 1.1 }, {
      scale: 1, duration: DUREE + 0.5, ease: 'lbe',
    }, 0);
  }
}

/* ---------- La montée ----------
   Le geste par défaut, et le plus fréquent : le texte monte un peu et se
   révèle. Volontairement court — 28 px. Un fondu qui vient de trop loin
   attire l'œil sur le mouvement au lieu du mot. */
function gesteMontee(el: HTMLElement) {
  gsap.from(el, surEntree(el, {
    y: 28, opacity: 0, duration: DUREE, ease: 'lbe',
  }));
}

/* ---------- Le trait ----------
   Un filet se tire à la règle, de gauche à droite. */
function gesteTrait(el: HTMLElement) {
  gsap.from(el, surEntree(el, {
    scaleX: 0, transformOrigin: 'left center',
    duration: DUREE + 0.2, ease: 'lbe',
  }));
}

/* ---------- Le groupe ----------
   Les enfants directs entrent l'un après l'autre. Le déclencheur est le
   GROUPE, pas chaque enfant : sans ça, le dernier d'une rangée large
   attendrait d'entrer lui-même dans l'écran et la rangée se composerait
   en désordre. */
function gesteGroupe(el: HTMLElement) {
  const enfants = Array.from(el.children) as HTMLElement[];
  if (!enfants.length) return;
  gsap.from(enfants, surEntree(el, {
    y: 32, opacity: 0, duration: DUREE, ease: 'lbe', stagger: ECART,
  }));
}

/* ---------- La partition ----------
   Le geste de la galerie. Une RANGÉE s'ouvre d'un coup, ses cellules
   décalées : les cadres se desserrent depuis une fente et les images se
   posent de 1,12 à 1.

   C'est la capsule appliquée à un ensemble, et c'est délibéré — il n'y
   avait aucune raison d'inventer une quatrième façon d'ouvrir un cadre
   alors que le site en a déjà une qui dit exactement cela. Ce qui change
   n'est pas le geste, c'est son SUJET : la rangée, et non l'image.

   Le gain n'est pas que visuel. L'ancienne grille posait un déclencheur
   par photographie — quarante-huit — plus autant d'effets de parallaxe.
   Une rangée en pose un pour deux ou trois images, et la page passe sous
   la vingtaine. */
function gestePartition(el: HTMLElement) {
  const cellules = Array.from(el.children) as HTMLElement[];
  if (!cellules.length) return;

  const images = cellules
    .map((c) => c.querySelector('img'))
    .filter((i): i is HTMLImageElement => !!i);

  const tl = gsap.timeline(surEntree(el, {}));

  tl.fromTo(cellules, { '--capsule': '34%' }, {
    '--capsule': '0%', duration: DUREE + 0.3, ease: 'lbe', stagger: ECART,
  });
  if (images.length) {
    /* Le desserrement de l'image dure plus longtemps que l'ouverture du
       cadre : elle finit donc de se poser APRÈS que la fente est ouverte,
       et c'est ce léger retard qui donne la sensation d'une image qui
       s'installe plutôt que d'une vignette qui apparaît. */
    tl.fromTo(images, { scale: 1.12 }, {
      scale: 1, duration: DUREE + 0.6, ease: 'lbe', stagger: ECART,
    }, 0);
  }
}

/* ---------- Le compteur ---------- */
function gesteCompteur(el: HTMLElement) {
  const fin = parseFloat(el.dataset.animCompte || el.textContent || '0');
  const nf = new Intl.NumberFormat('fr-FR');
  const objet = { v: 0 };
  gsap.to(objet, surEntree(el, {
    v: fin, duration: 1.6, ease: 'power2.out',
    onUpdate: () => { el.textContent = nf.format(Math.round(objet.v)); },
  }));
}

/* ---------- Le titre d'accueil, lettre à lettre ----------
   Réservé au SEUL grand titre de l'accueil. Le découpage par caractère est
   un geste coûteux à l'œil : appliqué partout il deviendrait un tic. Ici
   il ne joue qu'une fois, sur trois mots, au chargement. */
function gesteLettres(el: HTMLElement) {
  const split = new SplitText(el, { type: 'chars,words', charsClass: 'lettre' });
  splits.push(split);

  gsap.from(split.chars, {
    yPercent: 120,
    opacity: 0,
    duration: 1.1,
    ease: 'lbe',
    stagger: 0.022,
    delay: 0.15,
  });
}

const GESTES: Record<string, (el: HTMLElement) => void> = {
  lignes: gesteLignes,
  lettres: gesteLettres,
  capsule: gesteCapsule,
  balayage: gesteBalayage,
  partition: gestePartition,
  montee: gesteMontee,
  trait: gesteTrait,
  groupe: gesteGroupe,
  compteur: gesteCompteur,
};

/* ============================================================
   LE FRONTISPICE — la mise en scène du nom

   Une seule timeline, et c'est elle qui donne le ton du site entier.
   Trois principes la gouvernent :

   1. LE DESSERREMENT PORTE LE GESTE. Le nom entre avec un interlettrage
      resserré de 0,09 em sous sa valeur finale, et se desserre en même
      temps qu'il monte. C'est ce desserrement — pas la montée — qui donne
      l'impression que le nom se POSE plutôt qu'il n'arrive. Un titre qui
      monte sans respirer est une animation ; un titre qui respire est une
      composition.

   2. LES RANGS SE CHEVAUCHENT. Rien n'attend son tour. Le lieu est encore
      en train de se desserrer quand la première lettre part, la fiche
      commence avant que la dernière ne soit posée. Une cascade où chaque
      élément attend la fin du précédent se lit comme un diaporama.

   3. LE NOM RECULE ENSUITE. Au défilement, il monte un peu plus vite que
      l'image et perd un rien d'échelle : il passe derrière, au lieu de
      glisser hors champ. C'est ce qui donne la profondeur.
   ============================================================ */
function nomCinema() {
  const sec = document.querySelector<HTMLElement>('[data-frontispice]');
  if (!sec) return;

  const nom = sec.querySelector<HTMLElement>('[data-nom]');
  const lieu = sec.querySelector<HTMLElement>('[data-fronti-lieu]');
  const dit = sec.querySelector<HTMLElement>('[data-fronti-dit]');
  const cta = sec.querySelector<HTMLElement>('[data-fronti-cta]');
  const fiche = sec.querySelector<HTMLElement>('[data-fronti-fiche]');
  const repere = sec.querySelector<HTMLElement>('.hero-scroll');
  if (!nom) return;

  /* Le découpage en deux temps : les MOTS portent le masque, les
     CARACTÈRES portent le mouvement. Découper directement en caractères
     poserait un masque par lettre — et une lettre masquée individuellement
     ne peut plus déborder sur sa voisine, ce qui casse le crénage d'une
     serif à ce corps. */
  const split = new SplitText(nom, {
    type: 'words,chars',
    wordsClass: 'mot',
    charsClass: 'car',
  });
  splits.push(split);

  const tl = gsap.timeline({
    defaults: { ease: 'lbe' },
    // Le rideau d'ouverture couvre encore la page au premier instant :
    // le nom part quand les panneaux sont à mi-course, pas avant.
    delay: 0.35,
  });

  if (lieu) {
    tl.from(lieu, {
      opacity: 0,
      // Le lieu part de PLUS large et se resserre : l'inverse du nom.
      // Deux desserrements dans le même sens auraient fait bloc.
      letterSpacing: '0.75em',
      duration: 1.5,
    });
  }

  tl.from(split.chars, {
    yPercent: 118,
    duration: 1.25,
    // 0,035 s : à ce corps, c'est l'écart qui fait lire un mot qui se
    // compose. Au-delà de 0,06 on lit des lettres qui arrivent une à une.
    stagger: 0.035,
  }, lieu ? '-=1.1' : 0)
    .from(nom, {
      letterSpacing: '-0.135em',
      duration: 1.9,
      ease: 'power2.out',
    }, '<');

  if (dit) tl.from(dit, { opacity: 0, y: 22, duration: 1.1 }, '-=1.25');

  /* Le bouton entre APRÈS l'énoncé et AVANT le filet de la fiche : il
     conclut la phrase, il n'ouvre pas le pied de planche. Sans cette
     ligne, il serait le seul élément du frontispice à ne pas être monté
     par le script — donc présent d'emblée, immobile, pendant que le nom
     se compose autour de lui. */
  if (cta) tl.from(cta, { opacity: 0, y: 18, duration: 1 }, '-=0.9');

  if (fiche) {
    tl.from(fiche, { scaleX: 0, transformOrigin: 'left center', duration: 1.2 }, '-=0.95')
      .from(Array.from(fiche.children), {
        opacity: 0, y: 18, duration: 0.9, stagger: 0.07,
      }, '-=0.85');
  }

  if (repere) tl.from(repere, { opacity: 0, duration: 0.9 }, '-=0.5');

  // L'entrée cinématographique reste intacte sur mobile, mais son retrait
  // scrubé est supprimé : Safari doit rester l'unique pilote du scroll.
  if (tactile()) return;

  /* ---------- Le retrait ----------
     Scrub assumé : ce n'est pas une apparition mais un déplacement dans la
     profondeur, et il doit suivre le doigt exactement. */
  /* ⚠️ `fromTo` et non `to`. Un `to` scrubé relève l'état COURANT de
     l'élément au moment où ScrollTrigger s'initialise — c'est-à-dire au
     milieu de la timeline d'entrée, quand l'opacité vaut encore zéro. Il
     l'inscrit alors comme valeur de départ et l'y maintient pour toujours.
     `fromTo` déclare les deux bornes, et l'ordre de montage cesse de
     compter. */
  gsap.fromTo([nom, dit].filter(Boolean),
    { yPercent: 0, scale: 1, opacity: 1 },
    {
      yPercent: -22,
      scale: 0.94,
      opacity: 0,
      ease: 'none',
      immediateRender: false,
      scrollTrigger: {
        trigger: sec,
        start: 'top top',
        end: 'bottom 40%',
        scrub: 0.8,
      },
    });
}

/* ============================================================
   LES EFFETS LIÉS AU DÉFILEMENT
   Ici, et seulement ici, le scrub est légitime : ce qui suit n'est pas
   une APPARITION mais une profondeur. Un fond qui suit le regard plus
   lentement que la page ne « se montre » pas — il donne du relief. Rien
   de ce qui se lit n'en dépend.

   ⚠️ `start: 'clamp(top bottom)'` — le préfixe `clamp()` de ScrollTrigger
   borne la plage pour qu'un élément proche du haut ou du bas du document
   ne joue pas hors champ. Sans lui, une image en pied de page commence sa
   dérive alors qu'on ne peut plus défiler assez pour la voir finir.
   Technique relevée dans les démos de Codrops (MIT).
   ============================================================ */

/** La dérive : l'image glisse doucement dans son cadre. */
function deriveImages() {
  document.querySelectorAll<HTMLElement>('[data-derive] img').forEach((img) => {
    gsap.fromTo(img, { yPercent: -6 }, {
      yPercent: 6, ease: 'none',
      scrollTrigger: {
        trigger: img.closest('[data-derive]'),
        start: 'clamp(top bottom)',
        end: 'clamp(bottom top)',
        scrub: true,
      },
    });
  });
}

/** Les colonnes d'une composition ne descendent pas à la même vitesse.
    C'est ce décalage qui donne à la page sa profondeur de champ — repris
    des démos « OnScroll » de Codrops (MIT). */
function deriveColonnes() {
  document.querySelectorAll<HTMLElement>('[data-colonnes]').forEach((grille) => {
    const cols = Array.from(grille.children) as HTMLElement[];
    cols.forEach((col, i) => {
      // La première colonne ne bouge pas : il faut un repère fixe, sinon
      // c'est la page entière qui semble glisser.
      if (i === 0) return;
      gsap.to(col, {
        yPercent: -3.5 * i, ease: 'none',
        scrollTrigger: {
          trigger: grille,
          start: 'clamp(top bottom)',
          end: 'clamp(bottom top)',
          scrub: true,
        },
      });
    });
  });
}

/** La bande horizontale : une file de photographies qui défile de côté
    pendant qu'on descend. C'est le seul endroit du site où le défilement
    est détourné — et il l'est pour montrer, pas pour retenir : la bande
    avance exactement au rythme de la molette. */
function bandeHorizontale() {
  document.querySelectorAll<HTMLElement>('[data-bande]').forEach((sec) => {
    const piste = sec.querySelector<HTMLElement>('[data-bande-piste]');
    if (!piste) return;

    /* Sur iPhone, `pin` modifie la hauteur et la largeur du document pendant
       que les barres de Safari se replient. Le navigateur peut alors croire
       que la page est plus large que l'écran (effet de zoom) et retenir le
       défilement vertical. La composition reste horizontale, mais devient
       une galerie tactile native : inertie iOS, aimantation douce, et aucun
       verrou sur la descente. */
    if (tactile()) {
      sec.classList.add('bande-fil--tactile');
      piste.style.removeProperty('transform');
      return;
    }

    // `clientWidth` reste stable quand les barres de Safari apparaissent ou
    // disparaissent, contrairement aux dimensions du viewport visuel.
    const course = () => piste.scrollWidth - document.documentElement.clientWidth;
    if (course() <= 0) return;

    gsap.to(piste, {
      x: () => -course(),
      ease: 'none',
      scrollTrigger: {
        trigger: sec,
        start: 'top top',
        // La course verticale égale la course horizontale : un pixel de
        // molette, un pixel de bande. Toute autre valeur donne la
        // sensation d'un défilement qui « patine ».
        end: () => '+=' + course(),
        pin: true,
        // Sur tactile, aucun retard entre le doigt et la piste : le scrub
        // amorti peut continuer à rattraper sa cible après la fin du geste et
        // donner une impression de rebond. La version souris garde sa douceur.
        scrub: tactile() ? true : 0.6,
        invalidateOnRefresh: true,
        anticipatePin: 1,
      },
    });
  });
}

/** La pile : les cartes se posent l'une SUR l'autre à mesure qu'on descend.

    ⚠️ L'empilement NE PEUT PAS se faire en `position: sticky`.
    ScrollSmoother déplace `#smooth-content` par transformation : un
    ancêtre transformé devient le bloc conteneur de ses descendants, et il
    n'existe alors plus aucun défilement d'ancêtre contre lequel un élément
    `sticky` pourrait se coller. La carte se contente de défiler — c'est
    exactement ce qu'on a observé : elles glissaient l'une derrière l'autre
    en s'assombrissant, sans jamais tenir.

    C'est donc `pin` de ScrollTrigger qui empile, avec `pinSpacing: false`
    pour qu'aucune hauteur ne soit ajoutée : les cartes se recouvrent au
    lieu de se suivre. */
function pileCartes() {
  document.querySelectorAll<HTMLElement>('[data-pile]').forEach((pile) => {
    const cartes = Array.from(pile.children) as HTMLElement[];
    if (cartes.length < 2) return;

    const tete = () => {
      const v = getComputedStyle(document.documentElement).getPropertyValue('--header');
      return parseFloat(v) * (v.includes('rem') ? 16 : 1) || 80;
    };
    // Le décalage entre deux cartes : le haut de la précédente reste
    // visible sous la suivante, comme des tranches de jeu étalées.
    const CRAN = 26;

    cartes.forEach((carte, i) => {
      ScrollTrigger.create({
        trigger: carte,
        start: () => `top ${tete() + i * CRAN}`,
        endTrigger: cartes[cartes.length - 1],
        end: () => `top ${tete() + (cartes.length - 1) * CRAN}`,
        pin: true,
        pinSpacing: false,
        invalidateOnRefresh: true,
      });

      // La carte recouverte s'enfonce un peu : c'est ce retrait qui fait
      // lire une PILE plutôt qu'un empilement plat. La dernière n'est
      // recouverte par personne.
      //
      // ⚠️ PAS de `filter` ici. Un assombrissement paraissait juste sur le
      // papier ; à l'écran il posait un masque noir sur la carte. GSAP part
      // du `filter` calculé — `none` —, qu'il lit comme `brightness(0)` et
      // non `brightness(1)` : le « retrait de 10 % » se jouait en fait de 0
      // à 0,9, donc du noir complet vers presque rien. Le seul retrait est
      // désormais l'échelle, qui suffit à faire lire la profondeur.
      if (i === cartes.length - 1) return;
      gsap.to(carte, {
        scale: 0.95,
        ease: 'none',
        scrollTrigger: {
          trigger: cartes[i + 1],
          start: 'top bottom',
          end: () => `top ${tete() + i * CRAN}`,
          scrub: true,
          invalidateOnRefresh: true,
        },
      });
    });
  });
}

/* ============================================================
   LES INTERACTIONS
   Rien ici ne dépend du défilement : ce sont des réponses au geste.
   ============================================================ */

/** Le bouton magnétique : il vient au-devant du curseur, un peu, puis
    revient. Réservé aux appels à l'action — un lien de navigation qui
    fuit sous la souris est une gêne, pas une élégance. */
function boutonsMagnetiques() {
  if (!matchMedia('(hover: hover)').matches) return;

  document.querySelectorAll<HTMLElement>('[data-magnetique], .btn').forEach((el) => {
    const force = parseFloat(el.dataset.magnetique || '0.32');
    const surSouris = (e: MouseEvent) => {
      const r = el.getBoundingClientRect();
      gsap.to(el, {
        x: (e.clientX - (r.left + r.width / 2)) * force,
        y: (e.clientY - (r.top + r.height / 2)) * force,
        duration: 0.7, ease: 'power3.out',
      });
    };
    const surSortie = () => {
      // `elastic` sur le retour seulement : à l'aller il ferait dépasser
      // le bouton du curseur, ce qui se lit comme un défaut de suivi.
      gsap.to(el, { x: 0, y: 0, duration: 1, ease: 'elastic.out(1, 0.4)' });
    };
    el.addEventListener('mousemove', surSouris);
    el.addEventListener('mouseleave', surSortie);
    ecouteurs.push(() => {
      el.removeEventListener('mousemove', surSouris);
      el.removeEventListener('mouseleave', surSortie);
      gsap.set(el, { x: 0, y: 0 });
    });
  });
}

/** La table des matières et sa vignette.

    Les noms sont en très grand corps et UNE seule image les accompagne :
    elle suit le curseur et change de ligne en ligne. Une rangée de
    vignettes aurait dit cinq produits au même prix ; une liste dit un
    sommaire, et c'est ce qu'est une enfilade de chambres.

    ⚠️ LA VIGNETTE EST DÉPLACÉE SUR `body`. Elle est `position: fixed`, et
    ScrollSmoother déplace `#smooth-content` par transformation : un
    élément fixe laissé dedans devient solidaire de ce déplacement et se
    met à défiler avec la page. C'est le piège déjà documenté pour
    l'en-tête et le menu. Elle est écrite dans le HTML de la section — donc
    ses photographies restent lisibles et indexables — puis remontée ici.

    Sans souris, rien de tout ceci ne se monte : la liste reste une liste
    de liens, et c'est déjà l'information entière. */
function indexVignette() {
  if (!matchMedia('(hover: hover) and (pointer: fine)').matches) return;

  document.querySelectorAll<HTMLElement>('[data-index]').forEach((liste) => {
    const vignette = liste.querySelector<HTMLElement>('.index-peek');
    const lignes = Array.from(liste.querySelectorAll<HTMLElement>('.index-row'));
    if (!vignette || !lignes.length) return;

    const vues = Array.from(vignette.querySelectorAll('img'));
    document.body.appendChild(vignette);

    gsap.set(vignette, { xPercent: -50, yPercent: -50, scale: 0.92 });
    /* `quickTo` plutôt qu'un `gsap.to` par mouvement : il réutilise un
       seul tween au lieu d'en créer un à chaque pixel parcouru. */
    const versX = gsap.quickTo(vignette, 'x', { duration: 0.55, ease: 'power3' });
    const versY = gsap.quickTo(vignette, 'y', { duration: 0.55, ease: 'power3' });

    const suivre = (e: MouseEvent) => { versX(e.clientX); versY(e.clientY); };
    liste.addEventListener('mousemove', suivre);

    lignes.forEach((ligne, i) => {
      const entrer = () => {
        vignette.classList.add('is-on');
        gsap.to(vignette, { scale: 1, duration: 0.55, ease: 'lbe' });
        vues.forEach((v, j) => v.classList.toggle('is-on', i === j));
      };
      const sortir = () => {
        vignette.classList.remove('is-on');
        gsap.to(vignette, { scale: 0.92, duration: 0.45, ease: 'lbe' });
      };
      ligne.addEventListener('mouseenter', entrer);
      ligne.addEventListener('mouseleave', sortir);
      ecouteurs.push(() => {
        ligne.removeEventListener('mouseenter', entrer);
        ligne.removeEventListener('mouseleave', sortir);
      });
    });

    ecouteurs.push(() => {
      liste.removeEventListener('mousemove', suivre);
      /* Déplacée sur `body`, elle survivrait à la navigation : le nouveau
         document apporterait la sienne et l'ancienne resterait, fixe et
         invisible, à écouter dans le vide. */
      vignette.remove();
    });
  });
}

/** Le fil de progression : une ligne dorée sous l'en-tête, qui dit où
    l'on en est dans la page. Discret, mais c'est ce qui fait qu'un site
    paraît « suivi » plutôt que subi. */
function filProgression() {
  const fil = document.getElementById('progression');
  if (!fil) return;
  gsap.set(fil, { scaleX: 0, transformOrigin: 'left center' });
  gsap.to(fil, {
    scaleX: 1, ease: 'none',
    scrollTrigger: { start: 0, end: 'max', scrub: 0.3 },
  });
}

/* ============================================================
   MONTAGE
   ============================================================ */
export function monter() {
  demonter();

  /* Mouvement réduit : aucun déclencheur, aucun découpage de titre, rien
     de masqué. La page est simplement là, lisible, immédiatement. */
  if (reduit()) return;

  /* ---------- Le défilement lissé ----------
     ScrollSmoother remplace la bibliothèque tierce d'avant : une seule
     source de mouvement, et ScrollTrigger reste synchronisé avec elle
     sans qu'on ait à les recoller à la main.
     `effects: true` active `data-speed` et `data-lag` : la parallaxe des
     images devient déclarative, sans une ligne de script. */
  const enveloppe = document.getElementById('smooth-wrapper');
  const estTactile = tactile();
  if (estTactile) {
    // Les barres de Safari modifient fréquemment la hauteur visible pendant
    // un geste. Ne pas reconstruire tous les repères pour ces micro-resizes
    // évite le saut de la section épinglée sans bloquer les vrais changements
    // d'orientation ou de largeur.
    ScrollTrigger.config({ ignoreMobileResize: true });
  }
  if (enveloppe && !estTactile) {
    smoother = ScrollSmoother.create({
      wrapper: '#smooth-wrapper',
      content: '#smooth-content',
      smooth: 1.1,
      effects: true,
      // Le tactile garde le défilement natif : le lissage y combat l'inertie
      // du système et donne une sensation de flottement.
      smoothTouch: false,
      normalizeScroll: false,
    });
  }

  /* ---------- 1. Les gestes déclarés ----------
     Ceux qui demandent autre chose qu'une montée : un titre découpé, une
     capsule, un balayage. Ils sont marqués à la main dans le HTML parce
     qu'aucune règle automatique ne peut deviner qu'une image mérite une
     capsule plutôt qu'un balayage. */
  const declares = Array.from(document.querySelectorAll<HTMLElement>('[data-anim]'));
  declares.forEach((el) => {
    const geste = GESTES[el.dataset.anim || 'montee'];
    if (geste) geste(el);
  });

  /* ---------- 2. La passe automatique ----------
     Le reste du contenu n'a pas à être balisé un par un : baliser des
     centaines d'éléments à la main, c'est se garantir d'en oublier, et un
     élément oublié reste immobile au milieu d'une section qui bouge —
     l'incohérence se voit immédiatement.

     On parcourt donc chaque section et on ramasse ce qui se lit : titres,
     paragraphes, figures, boutons, lignes de liste. Le déclencheur est la
     SECTION, jamais l'élément : sur une rangée de trois tuiles, déclencher
     chacune séparément les ferait entrer en désordre selon leur hauteur
     respective. Une section, une cadence. */
  const MORCEAUX = 'h1, h2, h3, p, figure, blockquote, .btn, .link-arrow, .lire, .tile, dl > div, li';

  document.querySelectorAll<HTMLElement>('main section').forEach((sec) => {
    /* ⚠️ Le frontispice a sa PROPRE chorégraphie (`nomCinema`), réglée au
       centième. La passe automatique y voyait des `<p>` ordinaires et leur
       posait une seconde entrée : deux `gsap.from()` sur un même nœud, et
       le second relève comme état de départ ce que le premier était en
       train d'animer — les deux se figent à mi-course. C'est exactement ce
       qu'on observait : le lieu, l'énoncé et la fiche restaient
       transparents pour toujours. */
    if (sec.hasAttribute('data-frontispice')) return;

    const pris: HTMLElement[] = [];

    sec.querySelectorAll<HTMLElement>(MORCEAUX).forEach((el) => {
      // Déjà pris en charge par un geste déclaré, ou contenu dans un tel
      // élément : deux animations emboîtées composeraient leurs
      // déplacements et le geste partirait de travers.
      if (el.closest('[data-anim]')) return;
      // Un acteur ne joue jamais dans un acteur.
      if (pris.some((p) => p.contains(el))) return;
      pris.push(el);
    });

    if (!pris.length) return;

    /* ⚠️ « Une section, une cadence » suppose que la section TIENNE DANS LE
       REGARD. Une section de six lieux, haute de trois écrans, ne la
       contredit pas : elle sort de son domaine. Déclenchée en bloc, elle
       faisait partir ses vingt-quatre éléments quand son HAUT atteignait
       85 % — le cinquième et le sixième lieu jouaient donc leur entrée hors
       champ, et l'on arrivait devant une chose déjà posée, immobile au
       milieu d'une page qui bouge. Exactement le défaut que la refonte
       voulait supprimer.

       On découpe donc les sections hautes en BANDES de huit dixièmes
       d'écran, et chaque bande reçoit son déclencheur. Une section courte
       n'a qu'une bande et retrouve mot pour mot l'ancien comportement :
       elle déclenche sur elle-même, d'un seul tenant. */
    const BANDE = innerHeight * 0.8;
    const sommet = (el: Element) => el.getBoundingClientRect().top + scrollY;
    const origine = sommet(sec);

    const paquets = new Map<number, HTMLElement[]>();
    pris.forEach((el) => {
      const rang = Math.floor((sommet(el) - origine) / BANDE);
      const paquet = paquets.get(rang);
      if (paquet) paquet.push(el);
      else paquets.set(rang, [el]);
    });

    paquets.forEach((groupe) => {
      gsap.from(groupe, {
        y: 28,
        opacity: 0,
        duration: DUREE,
        ease: 'lbe',
        stagger: ECART,
        scrollTrigger: {
          /* Une seule bande : le déclencheur reste la section, comme avant.
             Plusieurs : chaque bande part sur son propre premier élément —
             ils sont à moins d'un écran les uns des autres, donc vus
             ensemble, et la cadence de groupe est préservée. */
          trigger: paquets.size === 1 ? sec : groupe[0],
          start: DEPART,
          once: true,
        },
      });
    });
  });

  /* ---------- 3. Le frontispice ----------
     Monté avant le reste : c'est la seule timeline du site qui joue au
     chargement, et elle donne le tempo de tout ce qui suit. */
  nomCinema();

  /* ---------- 4. La profondeur ----------
     Le hero garde sa parallaxe déclarative (`data-speed`, ScrollSmoother).
     Le reste suit ici. */
  if (!estTactile) {
    deriveImages();
    deriveColonnes();
    pileCartes();
  }
  // La traversée horizontale reste le geste signature sur tous les écrans.
  // Sur tactile elle fonctionne avec le scroll natif, sans ScrollSmoother.
  bandeHorizontale();

  /* ---------- 5. Les interactions ---------- */
  boutonsMagnetiques();
  indexVignette();
  filProgression();

  ScrollTrigger.refresh();
}

export function demonter() {
  ScrollTrigger.getAll().forEach((t) => t.kill());
  /* Les découpages doivent être défaits : SplitText réécrit le DOM du
     titre, et une navigation qui le laisserait en place empilerait les
     masques à chaque passage. */
  splits.forEach((s) => s.revert());
  splits = [];
  ecouteurs.forEach((f) => f());
  ecouteurs = [];
  if (smoother) { smoother.kill(); smoother = null; }
  gsap.killTweensOf('*');
}

/* Les polices changent la métrique des lignes : découper avant leur
   arrivée place les masques au mauvais endroit. On attend donc, mais sans
   bloquer — `document.fonts.ready` est déjà résolu au second passage. */
export function monterQuandPret() {
  if (document.fonts && document.fonts.status !== 'loaded') {
    document.fonts.ready.then(() => monter());
  } else {
    monter();
  }
}
