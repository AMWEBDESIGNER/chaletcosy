/* ============================================================
   Les nuits occupées, pour le calendrier du site.

   Ne renvoie QUE des couples de dates. Ni nom, ni statut, ni origine :
   savoir qu'une semaine est prise est nécessaire pour réserver, savoir
   QUI la occupe ne l'est jamais. La fonction SQL appelée derrière ne sait
   d'ailleurs pas lire autre chose — sa signature est `TABLE(debut date,
   fin date)`, et c'est ce qui rend la fuite structurellement impossible
   plutôt que simplement improbable.
   ============================================================ */
export const prerender = false;

import type { APIRoute } from 'astro';
import { config, occupations } from '../../lib/serveur/base.ts';
import { fusionne, estUnJour, ajoute } from '../../lib/reservation.ts';

const json = (statut: number, corps: unknown) =>
  new Response(JSON.stringify(corps), {
    status: statut,
    headers: {
      'Content-Type': 'application/json',
      /* Pas de cache. Une disponibilité périmée d'une minute, c'est un
         visiteur qui compose un séjour sur des nuits déjà vendues et se
         fait refuser à la validation. La contrainte de base le
         rattraperait, mais après lui avoir fait saisir ses coordonnées.
         Le volume — une villa — ne justifie aucun cache. */
      'Cache-Control': 'no-store',
    },
  });

/* Une fenêtre bornée : sans borne, un appelant demanderait dix ans et
   ferait balayer toute la table à chaque requête. Deux ans couvrent
   largement l'horizon de réservation d'une location saisonnière. */
const FENETRE_MAX_JOURS = 730;

export const GET: APIRoute = async ({ url, locals }) => {
  /* ⚠️ ON VALIDE AVANT DE REGARDER LA CONFIGURATION, et l'ordre compte.
     L'inverse — vérifier la base d'abord — renvoyait « service
     indisponible » à une requête malformée, ce qui est faux (la requête
     est en cause, pas le service) et rendait toute la validation
     invérifiable tant que la base n'est pas branchée. Valider ne demande
     aucune base ; on écarte donc le bruit avant de toucher au réseau. */
  const depuis = url.searchParams.get('depuis') ?? '';
  const jusqu_a = url.searchParams.get('jusqu_a') ?? '';

  if (!estUnJour(depuis) || !estUnJour(jusqu_a) || jusqu_a <= depuis) {
    return json(422, { erreur: 'Fenêtre de dates invalide.' });
  }
  if (jusqu_a > ajoute(depuis, FENETRE_MAX_JOURS)) {
    return json(422, { erreur: 'Fenêtre trop large.' });
  }

  const c = config((locals as any).runtime?.env);
  if (!c) {
    /* La base n'est pas configurée. On le dit franchement plutôt que de
       renvoyer un calendrier vide — un tableau vide signifierait « tout est
       libre », et le visiteur composerait un séjour sur des nuits peut-être
       vendues. Le même arbitrage que le formulaire de contact sans clé
       d'envoi : ne jamais laisser croire que ça a marché. */
    return json(503, { erreur: 'Le calendrier est momentanément indisponible.' });
  }

  try {
    const prises = await occupations(c, depuis, jusqu_a);
    /* Fusionner avant de servir : deux séjours consécutifs (l'un finit le
       14, l'autre commence le 14) sont deux entrées collées. Servies
       telles quelles, le calendrier dessinerait une nuit libre entre eux —
       qui n'existe pas. */
    return json(200, { occupees: fusionne(prises) });
  } catch (e) {
    console.error('[disponibilites]', e);
    return json(502, { erreur: 'Le calendrier est momentanément indisponible.' });
  }
};
