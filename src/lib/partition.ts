/* ============================================================
   La partition de la galerie.

   LE PROBLÈME. Quarante-huit photographies servies dans une grille de
   trois colonnes au format 4:3 forment une planche-contact : chaque image
   y pèse exactement le même poids que sa voisine. Or il y a une hiérarchie
   évidente — le bassin face à la Méditerranée n'est pas la cafetière du
   plan de travail — et elle n'était simplement pas dessinée. Une galerie
   qui ne hiérarchise pas ne se parcourt pas, elle se subit.

   LA RÈGLE. Chaque groupe s'ouvre sur SA photographie maîtresse, en pleine
   largeur. Le reste suit une partition de rangées : diptyque inégal,
   triptyque, diptyque égal. Les formats alternent avec les largeurs — le
   cinq colonnes est un portrait, le quatre un carré, le sept un paysage —
   et ce sont ces hauteurs inégales, plus que les largeurs, qui font lire
   une double page plutôt qu'un tableau.

   POURQUOI DES RANGÉES ET NON UN FLUX. On pourrait poser une largeur par
   image et laisser la grille se remplir. Elle laisserait alors des trous
   en fin de groupe, variables selon le nombre de photographies — et
   `grid-auto-flow: dense` les comblerait en remontant une image tardive,
   c'est-à-dire en désaccordant l'ordre visuel de l'ordre du document. Or
   la visionneuse parcourt les `.gal` DANS l'ordre du document : le
   désaccord se paierait en navigation clavier incohérente. On compose donc
   des rangées complètes, et l'ordre reste celui du récit.
   ============================================================ */

/** Les six situations de `Photo.astro`, restreintes à celles qu'on emploie
    ici. Le lien largeur → `sizes` est fait une fois, à un seul endroit :
    une colonne changée de span ne peut plus oublier son `sizes`. */
type Taille = 'article' | 'deux-tiers' | 'moitie' | 'tiers';

export interface Cellule {
  /** Colonnes occupées sur les douze de la grille. */
  span: number;
  /** Le rapport du cadre. C'est lui qui porte la variété : à largeurs
      égales, deux rapports différents donnent deux hauteurs différentes,
      et la rangée cesse d'être un bandeau. */
  ratio: string;
  /** La valeur `sizes` à passer à `Photo.astro` pour cette largeur. */
  taille: Taille;
}

/* Le rôle de chaque largeur. Le portrait est réservé au cinq colonnes :
   c'est la largeur intermédiaire, celle qui sans lui se lirait comme un
   sept un peu court. Lui donner la hauteur le distingue franchement. */
const ROLES: Record<number, Omit<Cellule, 'span'>> = {
  /* `article` et non `pleine` : la galerie vit dans `.container-x`, plafonné
     à 1240 px. Annoncer 100vw ferait choisir au navigateur une définition
     qu'il n'affichera jamais. */
  12: { ratio: '2 / 1', taille: 'article' },
  8: { ratio: '4 / 3', taille: 'deux-tiers' },
  7: { ratio: '4 / 3', taille: 'deux-tiers' },
  6: { ratio: '3 / 2', taille: 'moitie' },
  5: { ratio: '4 / 5', taille: 'moitie' },
  4: { ratio: '1 / 1', taille: 'tiers' },
};

/* Le répertoire de rangées. Chacune fait exactement douze colonnes — c'est
   la seule contrainte, et elle garantit qu'aucun groupe ne se termine sur
   une rangée trouée.

   L'ordre du cycle n'est pas indifférent : le diptyque inégal ouvre, le
   triptyque respire, le diptyque inversé renvoie la composition de l'autre
   côté. Trois rangées de suite dans le même sens donneraient une page qui
   penche. */
const CYCLE: number[][] = [
  [7, 5],
  [4, 4, 4],
  [5, 7],
  [6, 6],
  [8, 4],
  [4, 4, 4],
];

/**
 * Compose la partition d'un groupe de `n` photographies.
 *
 * La première rangée est toujours la pleine largeur : c'est le plan
 * d'établissement, et l'ordre de `GALLERY` place déjà en tête de chaque
 * groupe l'image qui le résume.
 *
 * Le reste puise dans le cycle, sauf en fin de groupe où le reliquat
 * commande : une seule image restante repasse en pleine largeur (elle
 * ferme le groupe comme un panorama), deux forment un diptyque, trois un
 * triptyque. Ces trois cas sont ce qui rend la fonction totale — sans eux,
 * un reliquat de deux devant un motif de trois laisserait une rangée
 * incomplète.
 */
export function partition(n: number): Cellule[][] {
  if (n <= 0) return [];

  const rangees: number[][] = [[12]];
  let reste = n - 1;
  let c = 0;

  while (reste > 0) {
    if (reste === 1) { rangees.push([12]); break; }
    // Le sens alterne pour que deux diptyques successifs ne penchent pas
    // du même côté.
    if (reste === 2) { rangees.push(c % 2 === 0 ? [7, 5] : [5, 7]); break; }
    if (reste === 3) { rangees.push([4, 4, 4]); break; }

    /* Aucun motif du cycle ne compte plus de trois cellules, et l'on
       n'arrive ici qu'avec un reliquat d'au moins quatre : le motif tient
       toujours. La boucle ne peut donc pas tourner sans consommer. */
    const motif = CYCLE[c % CYCLE.length];
    rangees.push(motif);
    reste -= motif.length;
    c += 1;
  }

  return rangees.map((r) => r.map((span) => ({ span, ...ROLES[span] })));
}
