/* ============================================================
   iCalendar (RFC 5545) — lecture du calendrier Airbnb, écriture du nôtre.

   C'est par ce format que les plateformes de location s'échangent leurs
   indisponibilités : Airbnb publie une adresse `.ics` que l'on importe, et
   accepte en retour une adresse que l'on publie. C'est le seul rempart
   contre la vente d'une même semaine des deux côtés.

   Comme `reservation.ts`, ce fichier est PUR : il prend du texte, il rend
   des périodes. Aucun réseau, aucune base. Le format réserve assez de
   pièges pour mériter d'être éprouvé seul.

   QUATRE PIÈGES DU FORMAT.

   1. `DTEND` EST EXCLUSIF pour une valeur de type DATE. La RFC 5545 est
      explicite (§3.6.1) : pour un événement en jours entiers, `DTEND` est
      « le premier jour NON compris ». Un séjour du 10 au 14 s'écrit donc
      DTSTART:20260710 / DTEND:20260714 et occupe quatre nuits. C'est
      exactement notre convention `[)`, et c'est heureux — mais beaucoup
      d'intégrations se trompent ici et bloquent une nuit de trop, ce qui
      fait perdre une arrivée à chaque enchaînement.

   2. LES LIGNES SONT PLIÉES À 75 OCTETS. La RFC impose de replier les
      longues lignes, la suite commençant par une espace ou une
      tabulation. Un analyseur qui lit ligne à ligne sans déplier coupe les
      valeurs en deux — et comme les UID d'Airbnb sont longs, il les coupe
      systématiquement.

   3. LES FINS DE LIGNE SONT `CRLF`, mais tout le monde n'en envoie pas.
      On accepte les trois formes plutôt que de rejeter un flux valide
      pour un caractère.

   4. UNE DATE N'A PAS DE FUSEAU. `20260710` est un jour, pas un instant.
      Le convertir en `Date` locale puis le reformater décale d'un jour à
      l'ouest de Greenwich. On ne le convertit donc jamais : on découpe la
      chaîne.
   ============================================================ */
/* Extension explicite, à rebours du reste du projet : Vite résout aussi
   bien `./reservation` que `./reservation.ts`, mais Node brut ne résout
   que la seconde — et c'est Node brut qui fait tourner `npm test`. La
   logique de calendrier est la seule partie du site où une erreur se paie
   en argent : elle doit pouvoir être éprouvée sans build. */
import type { Periode, Jour } from './reservation.ts';
import { ajoute, estUnJour } from './reservation.ts';

export interface EvenementICal {
  periode: Periode;
  /** L'identifiant de l'événement : c'est lui qui permet de reconnaître un
      blocage déjà importé plutôt que de le dupliquer à chaque synchro. */
  uid: string;
  resume: string;
}

/* ------------------------------------------------------------
   Lecture
   ------------------------------------------------------------ */

/**
 * Déplie les lignes repliées (RFC 5545 §3.1).
 *
 * Une ligne de continuation commence par une espace ou une tabulation, et
 * ce caractère ne fait PAS partie de la valeur : il est retiré, et le
 * reste est collé à la ligne précédente sans rien insérer.
 */
function deplie(texte: string): string[] {
  const lignes = texte.replace(/\r\n?/g, '\n').split('\n');
  const out: string[] = [];
  for (const l of lignes) {
    if ((l.startsWith(' ') || l.startsWith('\t')) && out.length) {
      out[out.length - 1] += l.slice(1);
    } else {
      out.push(l);
    }
  }
  return out;
}

/**
 * Le jour d'une valeur `DTSTART`/`DTEND`, quelle que soit sa forme.
 *
 * `20260710` (DATE) et `20260710T140000Z` (DATE-TIME) donnent tous deux
 * `2026-07-10`. On DÉCOUPE la chaîne au lieu de construire une `Date` :
 * voir le piège n° 4.
 */
function versJour(valeur: string): Jour | null {
  const m = /^(\d{4})(\d{2})(\d{2})/.exec(valeur.trim());
  if (!m) return null;
  const j = `${m[1]}-${m[2]}-${m[3]}`;
  return estUnJour(j) ? j : null;
}

/** Défait les échappements de texte de la RFC (§3.3.11). */
const desechappe = (s: string) =>
  s.replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1');

/**
 * Lit un flux iCalendar et rend ses événements.
 *
 * Les événements illisibles sont IGNORÉS plutôt que de faire échouer la
 * lecture entière : un flux Airbnb contient des entrées de service
 * (« Airbnb (Not available) » sans date exploitable, blocs de
 * disponibilité) et une synchronisation qui refuserait tout le calendrier
 * pour une entrée bancale laisserait les nuits ouvertes à la vente. Mieux
 * vaut importer ce qui est sûr.
 *
 * ⚠️ En revanche, un flux dont on ne lit AUCUN événement doit être traité
 *    par l'appelant comme une panne, jamais comme « rien de réservé » :
 *    une page d'erreur HTML se lit sans erreur ici, et rendrait un
 *    tableau vide qui déclarerait toute la saison disponible.
 */
export function lireICal(texte: string): EvenementICal[] {
  const lignes = deplie(texte);
  const out: EvenementICal[] = [];

  let dans = false;
  let debut: Jour | null = null;
  let fin: Jour | null = null;
  let dureeJours: number | null = null;
  let uid = '';
  let resume = '';

  for (const ligne of lignes) {
    const brut = ligne.trim();
    if (!brut) continue;

    if (brut === 'BEGIN:VEVENT') {
      dans = true;
      debut = fin = null; dureeJours = null; uid = ''; resume = '';
      continue;
    }

    if (brut === 'END:VEVENT') {
      if (dans && debut) {
        /* `DTEND` absent : la RFC (§3.6.1) donne à un événement en jours
           entiers une durée d'un jour. Sans cette règle, un blocage d'une
           nuit exporté sans `DTEND` serait perdu — donc revendu. */
        let bornee = fin;
        if (!bornee && dureeJours !== null) bornee = ajoute(debut, dureeJours);
        if (!bornee) bornee = ajoute(debut, 1);

        if (bornee > debut) {
          out.push({ periode: { debut, fin: bornee }, uid, resume });
        }
      }
      dans = false;
      continue;
    }

    if (!dans) continue;

    /* Une propriété s'écrit `NOM;PARAM=VAL:valeur`. Le nom s'arrête au
       premier `;` ou `:`, et la valeur commence après le PREMIER `:` —
       les suivants appartiennent à la valeur (une URL en contient). */
    const sep = brut.indexOf(':');
    if (sep < 0) continue;
    const gauche = brut.slice(0, sep);
    const valeur = brut.slice(sep + 1);
    const nom = gauche.split(';')[0].toUpperCase();

    if (nom === 'DTSTART') debut = versJour(valeur);
    else if (nom === 'DTEND') fin = versJour(valeur);
    else if (nom === 'UID') uid = valeur.trim();
    else if (nom === 'SUMMARY') resume = desechappe(valeur).trim();
    else if (nom === 'DURATION') {
      // Airbnb n'en émet pas, mais d'autres plateformes si. Seuls les
      // jours et les semaines ont un sens sur un calendrier de nuitées.
      const m = /^P(?:(\d+)W)?(?:(\d+)D)?/.exec(valeur.trim());
      if (m && (m[1] || m[2])) {
        dureeJours = (parseInt(m[1] || '0', 10) * 7) + parseInt(m[2] || '0', 10);
      }
    }
  }

  return out;
}

/* ------------------------------------------------------------
   Écriture
   ------------------------------------------------------------ */

const jjMMaaaa = (j: Jour) => j.replace(/-/g, '');

/** Replie une ligne à 75 octets (RFC 5545 §3.1), continuation par espace. */
function plie(ligne: string): string {
  if (ligne.length <= 75) return ligne;
  const morceaux: string[] = [ligne.slice(0, 75)];
  for (let i = 75; i < ligne.length; i += 74) morceaux.push(' ' + ligne.slice(i, i + 74));
  return morceaux.join('\r\n');
}

const echappe = (s: string) =>
  s.replace(/([\\,;])/g, '\\$1').replace(/\n/g, '\\n');

export interface OptionsExport {
  /** Le nom affiché du calendrier chez celui qui l'importe. */
  nom: string;
  /** Domaine servant à composer des UID stables. */
  domaine: string;
  /** Horodatage de génération. Injectable pour rendre la sortie testable. */
  maintenant?: Date;
}

/**
 * Écrit un flux iCalendar à partir de périodes occupées.
 *
 * ⚠️ AUCUNE DONNÉE PERSONNELLE N'Y ENTRE. Ce flux est servi à une adresse
 *    publique — c'est ce que réclame Airbnb pour l'importer, et une
 *    adresse publique finit toujours par être connue. Il ne dit donc que
 *    « ces nuits sont prises » : ni nom, ni e-mail, ni montant. Le
 *    `SUMMARY` est volontairement constant.
 *
 * Les UID sont STABLES : dérivés de l'identifiant de l'occupation et non
 * d'un compteur ou d'une date de génération. Un UID qui changerait à
 * chaque appel ferait voir à Airbnb une suppression suivie d'une création,
 * à chaque synchronisation.
 */
export function ecrireICal(
  occupations: readonly { id: string; periode: Periode }[],
  opts: OptionsExport,
): string {
  const now = opts.maintenant ?? new Date();
  const tampon = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

  const l: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Chalet Cosy//Reservation//FR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    plie(`X-WR-CALNAME:${echappe(opts.nom)}`),
  ];

  for (const o of occupations) {
    if (o.periode.fin <= o.periode.debut) continue;
    l.push(
      'BEGIN:VEVENT',
      plie(`UID:${o.id}@${opts.domaine}`),
      `DTSTAMP:${tampon}`,
      // `VALUE=DATE` est obligatoire : sans ce paramètre, un `20260710` nu
      // est un DATE-TIME mal formé, et les importateurs stricts le
      // rejettent.
      `DTSTART;VALUE=DATE:${jjMMaaaa(o.periode.debut)}`,
      `DTEND;VALUE=DATE:${jjMMaaaa(o.periode.fin)}`,
      'SUMMARY:Indisponible',
      'TRANSP:OPAQUE',
      'END:VEVENT',
    );
  }

  l.push('END:VCALENDAR');
  // CRLF, et une ligne vide finale : la RFC termine chaque ligne, y
  // compris la dernière.
  return l.join('\r\n') + '\r\n';
}
