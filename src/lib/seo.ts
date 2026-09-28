/* ============================================================
   Données structurées — ce que les moteurs lisent en plus du texte.

   Une règle, une seule : **rien ici ne doit être absent de la page**.
   Un balisage qui annonce ce que le visiteur ne trouve pas est une
   promesse non tenue, et les moteurs la sanctionnent. Chaque valeur
   ci-dessous vient de `villa.ts` ou d'un paragraphe visible.
   ============================================================ */
import { VILLA, GALLERY } from './villa';

type Ld = Record<string, unknown>;

/** Adresse absolue — les données structurées n'admettent pas de chemin relatif. */
const abs = (path: string, site: URL | undefined) =>
  new URL(path, site ?? 'https://chaletcosy.pages.dev').href;

/**
 * Fil d'Ariane.
 *
 * `trail` part de la page courante ; l'accueil est ajouté en tête, il n'a
 * pas à être répété à chaque appel.
 */
export function breadcrumb(site: URL | undefined, trail: [name: string, path: string][]): Ld {
  const items = [['Accueil', '/'] as [string, string], ...trail];
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map(([name, path], i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name,
      item: abs(path, site),
    })),
  };
}

/** La galerie et ses photographies, chacune avec sa légende. */
export function imageGallery(site: URL | undefined): Ld {
  return {
    '@context': 'https://schema.org',
    '@type': 'ImageGallery',
    name: `${VILLA.name} — le chalet en ${GALLERY.length} photographies`,
    description:
      'Le chalet en bois, sa terrasse, la pièce à vivre, la chambre, le bureau, ' +
      'la salle d’eau et le jardin au pied de la montagne.',
    url: abs('/galerie', site),
    associatedMedia: GALLERY.map((p) => ({
      '@type': 'ImageObject',
      contentUrl: abs(p.src, site),
      caption: p.alt,
      // Le regroupement de la page — chalet, terrasse, coin nuit…
      genre: p.group,
    })),
  };
}

/**
 * Les quatre questions que pose tout voyageur avant de réserver.
 *
 * Chaque réponse reprend mot pour mot une information déjà affichée sur
 * `/le-chalet` : les horaires et la capacité dans « Le séjour », les
 * animaux dans « Le règlement », les longs séjours dans leur propre section.
 * Rien n'est ajouté ici qui ne s'y trouve.
 */
export function faq(): Ld {
  const qa: [string, string][] = [
    [
      'À quelle heure peut-on arriver et repartir ?',
      // Repris tel quel du tableau « Le séjour » : arrivée, puis départ.
      `Arrivée ${VILLA.checkIn}, départ ${VILLA.checkOut}.`,
    ],
    [
      'Combien de voyageurs le chalet peut-il accueillir ?',
      `Le chalet accueille ${VILLA.guests} voyageurs au maximum : un lit double dans la ` +
        `chambre et un canapé convertible au salon, sur ${VILLA.surface} m² de plain-pied. ` +
        `Au-delà de ${VILLA.extraGuestFrom} voyageurs, un supplément de ` +
        `${VILLA.extraGuestFee} € par nuit s’applique.`,
    ],
    [
      'Les animaux sont-ils acceptés ?',
      'Non, les animaux ne sont pas acceptés. Le chalet est non-fumeur à l’intérieur — ' +
        'les fumeurs sont acceptés au jardin —, et les fêtes et soirées n’y sont pas autorisées.',
    ],
    [
      'Le chalet se loue-t-il pour un long séjour ?',
      'Oui. Le chalet se loue à la semaine, les courts séjours restent possibles, et les ' +
        'séjours de 28 nuits et plus sont acceptés — cure thermale, mission ou saison. ' +
        'Tarifs sur demande.',
    ],
  ];

  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: qa.map(([name, text]) => ({
      '@type': 'Question',
      name,
      acceptedAnswer: { '@type': 'Answer', text },
    })),
  };
}
