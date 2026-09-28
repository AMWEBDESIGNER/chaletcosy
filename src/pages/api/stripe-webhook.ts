/* ============================================================
   Le webhook Stripe : c'est LUI qui confirme une réservation.

   ⚠️ POURQUOI PAS LA PAGE DE RETOUR. Après paiement, le navigateur revient
      sur le site — et l'on serait tenté de confirmer là. C'est faux pour
      deux raisons : le visiteur peut fermer l'onglet avant le retour (le
      paiement a eu lieu, la réservation resterait en option puis
      périmerait), et l'adresse de retour est publique, donc forgeable. La
      seule source digne de foi sur un encaissement est Stripe lui-même.

   ⚠️ ET C'EST POURQUOI LA SIGNATURE EST VÉRIFIÉE AVANT TOUT. L'adresse de
      ce webhook est publique. Sans vérification, un simple POST disant
      « paiement reçu » confirmerait n'importe quel séjour sans qu'un
      centime ait bougé. C'est la faille la plus fréquente des
      intégrations de paiement, et l'une des plus coûteuses.
   ============================================================ */
export const prerender = false;

import type { APIRoute } from 'astro';
import { config, confirmer } from '../../lib/serveur/base.ts';
import { configStripe, signatureValide } from '../../lib/serveur/stripe.ts';

/* Stripe considère toute réponse 2xx comme un accusé de réception et
   cesse de réessayer. On ne rend donc 200 que lorsque l'événement est
   VRAIMENT traité — ou qu'il ne nous concerne pas. Une panne de base doit
   rendre 500, pour que Stripe rejoue plus tard. */
const ok = (corps: unknown = { recu: true }) =>
  new Response(JSON.stringify(corps), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  });

const refus = (statut: number, message: string) =>
  new Response(JSON.stringify({ erreur: message }), {
    status: statut, headers: { 'Content-Type': 'application/json' },
  });

export const POST: APIRoute = async ({ request, locals }) => {
  const runtime = (locals as any).runtime?.env;
  const s = configStripe(runtime);
  const c = config(runtime);
  if (!s || !c) return refus(503, 'Non configuré.');

  /* Le corps est lu en TEXTE BRUT, et la signature porte sur ce texte
     exact. Le relire depuis un objet analysé puis re-sérialisé changerait
     un espace ou l'ordre d'une clé, et la signature ne correspondrait
     plus jamais. */
  const brut = await request.text();

  if (!await signatureValide(s.webhookSecret, request.headers.get('stripe-signature'), brut)) {
    /* On ne dit pas POURQUOI la signature est refusée. « Horodatage trop
       ancien » et « signature fausse » sont deux informations utiles à
       qui cherche à forger. */
    console.error('[webhook] signature refusée');
    return refus(400, 'Signature invalide.');
  }

  let evt: any;
  try { evt = JSON.parse(brut); } catch { return refus(400, 'Corps illisible.'); }

  /* Tout ce qui n'est pas un acompte réussi est acquitté sans rien faire.
     Renvoyer une erreur ferait rejouer Stripe indéfiniment pour des
     événements dont on n'a que faire. */
  if (evt?.type !== 'payment_intent.succeeded') return ok({ ignore: evt?.type ?? null });

  const intent = evt.data?.object;
  const occupation = intent?.metadata?.occupation;
  const reference = intent?.metadata?.reference;

  if (!occupation) {
    console.error('[webhook] intention sans métadonnée d’occupation', intent?.id);
    // Acquitté : rejouer n'y changerait rien, la métadonnée ne réapparaîtra pas.
    return ok({ ignore: 'sans-occupation' });
  }

  try {
    const change = await confirmer(c, occupation, intent.id);

    /* `change` vaut `false` sur un REJEU — Stripe rejoue ses webhooks, un
       accusé de réception perdu suffit. C'est normal, pas une anomalie :
       on acquitte sans rien refaire, et surtout sans renvoyer un second
       courriel de confirmation au client. */
    if (!change) return ok({ dejaConfirme: true });

    console.log('[webhook] séjour confirmé', reference, occupation);
    return ok({ confirme: true });
  } catch (e) {
    /* 500 volontaire : la base est en panne, l'encaissement a bien eu
       lieu, et il ne faut SURTOUT PAS acquitter. Stripe rejouera, et la
       réservation sera confirmée au prochain passage. Un 200 ici perdrait
       définitivement le lien entre un paiement encaissé et un séjour. */
    console.error('[webhook] échec de confirmation', occupation, e);
    return refus(500, 'Réessayez.');
  }
};
