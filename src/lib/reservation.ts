/* ============================================================
   Le domaine de la réservation : les nuits, les conflits, le devis.

   Ce fichier ne connaît NI la base de données, NI le réseau, NI le DOM.
   C'est délibéré : tout ce qui suit est arithmétique de calendrier, et
   c'est très exactement l'endroit où les moteurs de réservation se
   trompent. Isolé et pur, il se vérifie ; noyé dans une route serveur,
   il ne se vérifie plus qu'en produisant de vraies doubles réservations.

   TROIS PIÈGES, ET ILS COÛTENT TOUS DE L'ARGENT.

   1. LE JOUR DU DÉPART N'EST PAS UNE NUIT OCCUPÉE. Un séjour du 10 au 14
      occupe les nuits du 10, 11, 12 et 13 — quatre nuits. Le 14, la villa
      est libre à partir de l'heure de remise : quelqu'un peut arriver ce
      jour-là. Compter le 14 comme occupé refuserait des séjours possibles ;
      compter une nuit de moins vendrait deux fois la nuit du 13. Toutes les
      périodes de ce fichier ont donc une FIN EXCLUSIVE, sans exception.

   2. LES DATES SONT DES JOURS DE CALENDRIER, PAS DES INSTANTS. `new Date()`
      lu dans le fuseau du visiteur décale d'un jour selon l'heure et la
      saison : un visiteur à Los Angeles qui choisit le 14 envoie le 13.
      Tout se calcule donc en UTC, à partir de chaînes `AAAA-MM-JJ`. Aucune
      heure n'entre jamais dans ce fichier.

   3. UN SÉJOUR SE TARIFE NUIT PAR NUIT. Une semaine qui commence en moyenne
      saison et finit en haute saison n'est pas une semaine en moyenne
      saison. Tarifer d'après la date d'arrivée est l'erreur la plus
      fréquente, et elle est toujours en votre défaveur : c'est aux
      changements de saison que les séjours se réservent le plus.
   ============================================================ */

/** Un jour de calendrier, `AAAA-MM-JJ`. Jamais un instant. */
export type Jour = string;

/**
 * Une période. `fin` est le jour du DÉPART, et il n'est pas occupé —
 * voir le piège n° 1. Une période dont `debut === fin` ne contient aucune
 * nuit et n'est donc pas un séjour.
 */
export interface Periode {
  debut: Jour;
  fin: Jour;
}

/**
 * Une saison tarifaire, récurrente d'année en année. `debut` et `fin`
 * s'écrivent `MM-JJ`, bornes incluses, et peuvent enjamber le Nouvel An
 * (`debut` postérieur à `fin` : voir `dansLaSaison`).
 */
export interface Saison {
  nom: string;
  debut: string;
  fin: string;
  /** Prix d'une nuit, en euros, taxe de séjour exclue. */
  nuit: number;
  /** Nombre de nuits minimum pour un séjour qui commence dans la saison. */
  minimum: number;
}

export interface Frais {
  /** Forfait ménage, facturé une fois par séjour. */
  menage: number;
  /** Taxe de séjour, par personne et par nuit. */
  taxeParPersonneParNuit: number;
  /** Part du total demandée à la réservation, entre 0 et 1. */
  acompte: number;
}

/* ------------------------------------------------------------
   Arithmétique de calendrier, entièrement en UTC.
   ------------------------------------------------------------ */

const MOTIF = /^\d{4}-\d{2}-\d{2}$/;

/** `true` si la chaîne est un jour réel — le 31 février est rejeté. */
export function estUnJour(j: unknown): j is Jour {
  if (typeof j !== 'string' || !MOTIF.test(j)) return false;
  // `Date` normalise silencieusement le 2026-02-31 en 3 mars : on ne
  // vérifie donc pas qu'elle accepte, mais qu'elle rend le même jour.
  const d = new Date(`${j}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === j;
}

const versDate = (j: Jour): Date => new Date(`${j}T00:00:00Z`);
const versJour = (d: Date): Jour => d.toISOString().slice(0, 10);

/** Décale un jour de `n` jours. `n` peut être négatif. */
export function ajoute(j: Jour, n: number): Jour {
  const d = versDate(j);
  d.setUTCDate(d.getUTCDate() + n);
  return versJour(d);
}

const JOUR_MS = 86_400_000;

/**
 * Le nombre de nuits d'une période. Zéro si la période est vide ou
 * inversée — jamais un nombre négatif, qu'un appelant distrait
 * multiplierait par un tarif.
 */
export function nombreDeNuits(p: Periode): number {
  const n = Math.round((versDate(p.fin).getTime() - versDate(p.debut).getTime()) / JOUR_MS);
  return n > 0 ? n : 0;
}

/** La liste des nuits occupées : du jour d'arrivée à la veille du départ. */
export function nuits(p: Periode): Jour[] {
  const out: Jour[] = [];
  for (let j = p.debut; j < p.fin; j = ajoute(j, 1)) out.push(j);
  return out;
}

/**
 * Deux périodes se chevauchent-elles ?
 *
 * ⚠️ Les comparaisons sont STRICTES aux deux bouts, et c'est tout l'objet
 * du piège n° 1 : un séjour qui finit le 14 et un séjour qui commence le
 * 14 ne se chevauchent pas. Le premier libère la villa le matin, le second
 * arrive l'après-midi. Un `<=` ici refuserait la moitié des enchaînements
 * de haute saison.
 */
export function chevauche(a: Periode, b: Periode): boolean {
  return a.debut < b.fin && b.debut < a.fin;
}

/** `true` si aucune période occupée n'empiète sur la période demandée. */
export function estLibre(demande: Periode, occupees: readonly Periode[]): boolean {
  return !occupees.some((o) => chevauche(demande, o));
}

/**
 * Fusionne les périodes qui se touchent ou se chevauchent.
 *
 * Les calendriers importés (Airbnb) livrent une entrée par réservation :
 * deux séjours consécutifs y sont deux blocs collés. Fusionnés, ils
 * deviennent une seule indisponibilité, et le calendrier cesse d'afficher
 * une fausse nuit libre entre les deux.
 */
export function fusionne(periodes: readonly Periode[]): Periode[] {
  const tri = [...periodes].filter((p) => nombreDeNuits(p) > 0)
    .sort((a, b) => (a.debut < b.debut ? -1 : a.debut > b.debut ? 1 : 0));

  const out: Periode[] = [];
  for (const p of tri) {
    const dernier = out[out.length - 1];
    // `<=` ici, à l'inverse de `chevauche` : deux blocs qui se touchent
    // (l'un finit le 14, l'autre commence le 14) n'ont aucune nuit libre
    // entre eux et ne forment qu'une seule indisponibilité.
    if (dernier && p.debut <= dernier.fin) {
      if (p.fin > dernier.fin) dernier.fin = p.fin;
    } else {
      out.push({ ...p });
    }
  }
  return out;
}

/**
 * L'ensemble des nuits occupées, pour peindre un calendrier.
 *
 * ⚠️ CE N'EST PAS « L'ENSEMBLE DES JOURS PRIS », et la nuance décide de la
 *    justesse du calendrier. Un séjour du 10 au 14 occupe les nuits 10, 11,
 *    12 et 13 : le 14 n'en fait pas partie. Peindre le 14 comme pris —
 *    l'erreur naturelle quand on colorie « du 10 au 14 » — interdirait une
 *    arrivée ce jour-là, c'est-à-dire refuserait un enchaînement parfaitement
 *    possible. Sur une villa qui se loue à la semaine en haute saison, c'est
 *    une semaine perdue à chaque départ.
 */
export function nuitsOccupees(periodes: readonly Periode[]): Set<Jour> {
  const s = new Set<Jour>();
  for (const p of periodes) for (const j of nuits(p)) s.add(j);
  return s;
}

/**
 * Le dernier jour de départ possible pour une arrivée donnée : la première
 * nuit occupée qui suit, ou `null` si rien ne borne le séjour.
 *
 * On peut PARTIR le jour où le suivant arrive — on libère le matin, il
 * entre l'après-midi. Le départ maximum est donc le premier jour occupé
 * lui-même, et non la veille. C'est le pendant exact de la règle
 * ci-dessus, vu depuis l'autre bout du séjour.
 */
export function departMaximum(
  arrivee: Jour,
  occupees: readonly Periode[],
  horizonJours = 365,
): Jour | null {
  const pris = nuitsOccupees(occupees);
  const limite = ajoute(arrivee, horizonJours);
  for (let j = ajoute(arrivee, 1); j < limite; j = ajoute(j, 1)) {
    // `j` est une nuit occupée : on peut encore partir CE jour-là, mais
    // pas le lendemain. C'est donc la borne.
    if (pris.has(j)) return j;
  }
  return null;
}

/* ------------------------------------------------------------
   Les saisons.
   ------------------------------------------------------------ */

/**
 * Un jour tombe-t-il dans une saison ?
 *
 * La comparaison porte sur `MM-JJ` seul : les saisons se répètent chaque
 * année. Une saison dont `debut` est postérieur à `fin` enjambe le Nouvel
 * An (par exemple `12-20` → `01-05`) ; le test s'inverse alors, sans quoi
 * la quinzaine des fêtes — la plus chère de l'année — serait tarifée au
 * prix de la basse saison.
 */
export function dansLaSaison(j: Jour, s: Saison): boolean {
  const md = j.slice(5);
  return s.debut <= s.fin
    ? md >= s.debut && md <= s.fin
    : md >= s.debut || md <= s.fin;
}

/**
 * La saison d'un jour, ou `null` si aucune ne le couvre. La PREMIÈRE qui
 * correspond l'emporte : l'ordre du tableau est donc une priorité, ce qui
 * permet de poser une période exceptionnelle (un festival, une semaine de
 * vacances scolaires) avant les saisons générales.
 */
export function saisonDe(j: Jour, saisons: readonly Saison[]): Saison | null {
  return saisons.find((s) => dansLaSaison(j, s)) ?? null;
}

/* ------------------------------------------------------------
   Le devis.
   ------------------------------------------------------------ */

export interface LigneDevis {
  saison: string;
  nuits: number;
  prixNuit: number;
  total: number;
}

export interface Devis {
  nuits: number;
  /** Le détail par saison — c'est ce qu'on montre au visiteur. */
  lignes: LigneDevis[];
  hebergement: number;
  menage: number;
  taxeSejour: number;
  total: number;
  acompte: number;
  solde: number;
}

export type RefusDevis =
  | { motif: 'periode-vide' }
  | { motif: 'jour-invalide' }
  | { motif: 'hors-saison'; jour: Jour }
  | { motif: 'trop-court'; exige: number; demande: number };

/**
 * Calcule le devis d'un séjour, ou dit pourquoi il ne peut pas l'être.
 *
 * Rend un refus TYPÉ plutôt que de jeter ou de rendre `null` : l'appelant
 * doit expliquer au visiteur ce qui coince — « quatre nuits minimum en
 * août » n'est pas le même message que « ces dates sortent du calendrier
 * tarifaire ». Un `null` l'aurait forcé à redevimer la cause.
 */
export function devis(
  p: Periode,
  voyageurs: number,
  saisons: readonly Saison[],
  frais: Frais,
): Devis | RefusDevis {
  if (!estUnJour(p.debut) || !estUnJour(p.fin)) return { motif: 'jour-invalide' };

  const total = nombreDeNuits(p);
  if (total === 0) return { motif: 'periode-vide' };

  /* Nuit par nuit — piège n° 3. On agrège ensuite par saison pour
     l'affichage, mais le calcul, lui, ne connaît que des nuits. */
  const parSaison = new Map<string, LigneDevis>();
  for (const j of nuits(p)) {
    const s = saisonDe(j, saisons);
    if (!s) return { motif: 'hors-saison', jour: j };

    const ligne = parSaison.get(s.nom);
    if (ligne) {
      ligne.nuits += 1;
      ligne.total += s.nuit;
    } else {
      parSaison.set(s.nom, { saison: s.nom, nuits: 1, prixNuit: s.nuit, total: s.nuit });
    }
  }

  /* Le minimum est celui de la saison D'ARRIVÉE, et lui seul. Retenir le
     plus exigeant des minimums traversés interdirait un séjour qui ne fait
     qu'effleurer la haute saison par sa dernière nuit. */
  const saisonArrivee = saisonDe(p.debut, saisons)!;
  if (total < saisonArrivee.minimum) {
    return { motif: 'trop-court', exige: saisonArrivee.minimum, demande: total };
  }

  const lignes = [...parSaison.values()];
  const hebergement = lignes.reduce((n, l) => n + l.total, 0);
  /* La taxe de séjour se calcule par personne ET par nuit : c'est une
     imposition communale, elle ne suit pas le prix. Arrondie au centime
     une seule fois, à la fin — arrondir chaque nuit ferait dériver le
     total de plusieurs centimes sur un long séjour. */
  const taxeSejour = arrondi(voyageurs * total * frais.taxeParPersonneParNuit);
  const somme = arrondi(hebergement + frais.menage + taxeSejour);
  const acompte = arrondi(somme * frais.acompte);

  return {
    nuits: total,
    lignes,
    hebergement,
    menage: frais.menage,
    taxeSejour,
    total: somme,
    acompte,
    // Par soustraction, jamais par un second pourcentage : `total × 0,7`
    // et `total − total × 0,3` diffèrent d'un centime une fois sur deux,
    // et c'est le genre d'écart qu'un client relève.
    solde: arrondi(somme - acompte),
  };
}

export const estUnRefus = (d: Devis | RefusDevis): d is RefusDevis =>
  'motif' in d;

/** Arrondi au centime, à l'abri des flottants (0,1 + 0,2 ≠ 0,3). */
const arrondi = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;
