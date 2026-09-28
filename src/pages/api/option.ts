/* ============================================================
   Pose une option sur des dates et ouvre le paiement de l'acompte.

   L'ORDRE DES DEUX OPÉRATIONS EST UN ARBITRAGE, pas une commodité.

   On pose l'option D'ABORD, l'intention de paiement ensuite. Si les nuits
   viennent d'être prises, on le sait immédiatement et rien n'a été créé
   chez Stripe. Dans l'autre sens, un conflit de dates laisserait derrière
   lui une intention de paiement orpheline — que le visiteur pourrait
   régler, pour un séjour qui n'existe pas.

   Le risque symétrique existe : si Stripe échoue après la pose, l'option
   retient des nuits sans paiement possible. Il est borné — l'option périme
   toute seule au bout du délai réglé en base — et très inférieur à celui
   d'encaisser pour rien.
   ============================================================ */
export const prerender = false;

import type { APIRoute } from 'astro';
import { config, grille, poserOption, DatesPrises } from '../../lib/serveur/base.ts';
import { configStripe, creerIntention } from '../../lib/serveur/stripe.ts';
import { devis, estUnRefus, estUnJour, ajoute } from '../../lib/reservation.ts';
import { VILLA } from '../../lib/villa';

const json = (statut: number, corps: unknown) =>
  new Response(JSON.stringify(corps), {
    status: statut,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });

const propre = (v: unknown, max = 500) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const aujourdhui = () => new Date().toISOString().slice(0, 10);

/** `COSY-2026-A3F91C` — lisible au téléphone, et assez large pour ne pas
    se répéter. L'unicité reste garantie par la contrainte en base ; ceci
    n'est qu'une façon de la rendre improbable. */
function reference(): string {
  const h = [...crypto.getRandomValues(new Uint8Array(3))]
    .map((n) => n.toString(16).padStart(2, '0')).join('').toUpperCase();
  return `COSY-${new Date().getUTCFullYear()}-${h}`;
}

export const POST: APIRoute = async ({ request, locals }) => {
  const corps = await request.json().catch(() => null);
  if (!corps) return json(400, { erreur: 'Requête invalide.' });

  // Piège à robots, comme sur le formulaire de contact.
  if (propre(corps._hp)) return json(200, { ok: true });

  const debut = propre(corps.debut, 10);
  const fin = propre(corps.fin, 10);
  const voyageurs = Number(corps.voyageurs);
  const nom = propre(corps.nom, 120);
  const email = propre(corps.email, 160);
  const telephone = propre(corps.telephone, 40);
  const message = propre(corps.message, 2000);

  if (!estUnJour(debut) || !estUnJour(fin) || fin <= debut) {
    return json(422, { erreur: 'Dates invalides.' });
  }
  if (!Number.isInteger(voyageurs) || voyageurs < 1 || voyageurs > VILLA.guests) {
    return json(422, { erreur: `Le chalet accueille jusqu’à ${VILLA.guests} voyageurs.` });
  }
  if (!nom) return json(422, { erreur: 'Indiquez votre nom.' });
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return json(422, { erreur: 'Renseignez une adresse e-mail valide.' });
  }

  const runtime = (locals as any).runtime?.env;
  const c = config(runtime);
  const s = configStripe(runtime);
  if (!c || !s) return json(503, { erreur: 'La réservation en ligne est momentanément indisponible.' });

  try {
    const g = await grille(c);

    /* ⚠️ LE VERROU DES TARIFS PROVISOIRES, APPLIQUÉ ICI ET NULLE PART
       AILLEURS DANS LE TUNNEL.

       Tant que la grille en base est un jeu d'essai, aucune clé Stripe de
       PRODUCTION ne doit servir : on encaisserait de vrais euros calculés
       sur des prix inventés. Le drapeau vient de la base, le mode vient du
       préfixe de la clé — deux sources indépendantes, ce qui est exactement
       ce qu'il faut : une seule pourrait être oubliée.

       Refuser ici plutôt que d'avertir : un avertissement se ferme. */
    if (g.provisoires && !s.test) {
      console.error('[option] REFUS : clé Stripe de production avec des tarifs provisoires.');
      return json(409, {
        erreur: 'La réservation en ligne n’est pas encore ouverte. Écrivez-nous ou passez par Airbnb.',
      });
    }

    const plusTot = ajoute(aujourdhui(), g.preavisJours);
    if (debut < plusTot) {
      return json(422, {
        erreur: `Les arrivées se réservent au moins ${g.preavisJours} jour${g.preavisJours > 1 ? 's' : ''} à l’avance.`,
      });
    }

    /* Le devis est REFAIT ici. Celui qu'affiche la page a pu être calculé
       il y a dix minutes, avec une autre grille — ou avoir été modifié
       dans le navigateur. Le montant qui part chez Stripe est celui-ci. */
    const d = devis({ debut, fin }, voyageurs, g.saisons, g.frais);
    if (estUnRefus(d)) {
      return json(422, {
        erreur: d.motif === 'trop-court'
          ? `Cette période se loue à partir de ${d.exige} nuits.`
          : 'Ces dates ne peuvent pas être réservées en ligne. Écrivez-nous.',
      });
    }

    const ref = reference();
    const totalCents = Math.round(d.total * 100);
    const acompteCents = Math.round(d.acompte * 100);

    let occupation: string;
    try {
      occupation = await poserOption(c, {
        reference: ref, debut, fin, voyageurs, nom, email, telephone, message,
        totalCents, acompteCents,
      });
    } catch (e) {
      /* Le conflit n'est pas une panne : quelqu'un a réservé pendant que
         le visiteur remplissait le formulaire. Il mérite son propre code
         et son propre message. */
      if (e instanceof DatesPrises) {
        return json(409, { erreur: 'Ces dates viennent d’être réservées. Choisissez-en d’autres.' });
      }
      throw e;
    }

    const intention = await creerIntention(s, {
      montantCents: acompteCents, reference: ref, occupation, email,
    });

    return json(200, {
      ok: true,
      reference: ref,
      clientSecret: intention.clientSecret,
      acompte: d.acompte,
      total: d.total,
      /* Le mode remonte jusqu'à la page : elle doit pouvoir dire « paiement
         de test » plutôt que laisser croire à un vrai encaissement. */
      modeTest: s.test,
    });
  } catch (e) {
    console.error('[option]', e);
    return json(502, { erreur: 'La réservation est momentanément indisponible. Réessayez ou écrivez-nous.' });
  }
};
