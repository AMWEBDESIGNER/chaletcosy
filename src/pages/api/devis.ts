/* ============================================================
   Le devis d'un séjour : prix, détail par saison, et disponibilité.

   Le calcul lui-même vit dans `lib/reservation.ts` et n'est pas refait
   ici — cette route ne fait que réunir les ingrédients (grille tarifaire,
   nuits déjà prises) et traduire un refus en message.

   ⚠️ LE PRIX EST TOUJOURS RECALCULÉ ICI, JAMAIS REÇU DU CLIENT. Le
   navigateur affiche un montant, il ne le décide pas. Accepter un total
   envoyé par la page, c'est accepter qu'on le modifie — et une réservation
   à 1 € est indiscernable d'une vraie une fois en base.
   ============================================================ */
export const prerender = false;

import type { APIRoute } from 'astro';
import { config, grille, occupations } from '../../lib/serveur/base.ts';
import { devis, estUnRefus, estLibre, estUnJour, ajoute } from '../../lib/reservation.ts';
import { VILLA } from '../../lib/villa';

const json = (statut: number, corps: unknown) =>
  new Response(JSON.stringify(corps), {
    status: statut,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });

/** Le jour courant en UTC — même convention que tout le domaine. */
const aujourdhui = () => new Date().toISOString().slice(0, 10);

export const POST: APIRoute = async ({ request, locals }) => {
  /* Validation d'abord, configuration ensuite — voir la note de
     `disponibilites.ts` : une requête malformée est en cause elle-même,
     et le dire ne réclame aucune base. */
  const corps = await request.json().catch(() => null);
  if (!corps) return json(400, { erreur: 'Requête invalide.' });

  const debut = String(corps.debut ?? '');
  const fin = String(corps.fin ?? '');
  const voyageurs = Number(corps.voyageurs);

  if (!estUnJour(debut) || !estUnJour(fin) || fin <= debut) {
    return json(422, { erreur: 'Choisissez une date d’arrivée et une date de départ.' });
  }
  if (!Number.isInteger(voyageurs) || voyageurs < 1 || voyageurs > VILLA.guests) {
    return json(422, { erreur: `Le chalet accueille jusqu’à ${VILLA.guests} voyageurs.` });
  }

  const c = config((locals as any).runtime?.env);
  if (!c) return json(503, { erreur: 'La réservation en ligne est momentanément indisponible.' });

  try {
    const g = await grille(c);

    /* Le préavis. La synchronisation iCal d'Airbnb n'est pas instantanée —
       quelques heures — et pendant ce délai le site ignore une réservation
       qui vient d'y être prise. Refuser les arrivées trop proches est ce
       qui empêche de vendre une nuit qu'Airbnb a déjà vendue sans nous
       l'avoir encore dit. C'est une perte commerciale assumée, très
       inférieure au coût d'une double réservation. */
    const plusTot = ajoute(aujourdhui(), g.preavisJours);
    if (debut < plusTot) {
      return json(200, {
        possible: false,
        motif: 'preavis',
        message: g.preavisJours === 0
          ? 'Cette date est déjà passée.'
          : `Les arrivées se réservent au moins ${g.preavisJours} jour${g.preavisJours > 1 ? 's' : ''} à l’avance. Appelez-nous pour un départ immédiat.`,
      });
    }

    const prises = await occupations(c, debut, fin);
    if (!estLibre({ debut, fin }, prises)) {
      return json(200, { possible: false, motif: 'occupe', message: 'Ces dates viennent d’être réservées.' });
    }

    const d = devis({ debut, fin }, voyageurs, g.saisons, g.frais);

    if (estUnRefus(d)) {
      /* Chaque refus a son message : « sept nuits minimum en août » et
         « ces dates sortent du calendrier tarifaire » n'appellent pas la
         même réaction du visiteur. C'est la raison d'être du refus typé. */
      const messages: Record<string, string> = {
        'periode-vide': 'Le départ doit suivre l’arrivée d’au moins une nuit.',
        'jour-invalide': 'Dates invalides.',
        'hors-saison': 'Ces dates ne sont pas encore ouvertes à la réservation. Écrivez-nous.',
        'trop-court': d.motif === 'trop-court'
          ? `Cette période se loue à partir de ${d.exige} nuits — vous en avez choisi ${d.demande}.`
          : '',
      };
      return json(200, { possible: false, motif: d.motif, message: messages[d.motif] });
    }

    return json(200, {
      possible: true,
      devis: d,
      /* Le verrou remonte jusqu'à l'interface : tant que la grille est
         provisoire, la page doit le dire et le paiement rester en test.
         Le cacher ici serait le meilleur moyen qu'il soit oublié. */
      tarifsProvisoires: g.provisoires,
    });
  } catch (e) {
    console.error('[devis]', e);
    return json(502, { erreur: 'Le calcul est momentanément indisponible.' });
  }
};
