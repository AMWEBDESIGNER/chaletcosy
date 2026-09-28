/* ============================================================
   Fermer la session.

   En POST uniquement. Répondant à un GET, cette adresse suffirait à
   déconnecter quelqu'un depuis n'importe où : une image `<img
   src="…/admin/deconnexion">` postée sur une page tierce, ou un simple
   préchargement de lien par le navigateur, viderait la session sans que
   personne n'ait rien demandé.

   Deux gestes, dans cet ordre d'importance :
   1. les cookies partent — c'est ce qui déconnecte réellement ;
   2. GoTrue est prévenu, pour que le jeton de renouvellement cesse d'être
      échangeable ailleurs. Ce second geste peut échouer sans conséquence
      sur le premier.
   ============================================================ */
export const prerender = false;

import type { APIRoute } from 'astro';
import { retireJetons, revoque, COOKIE_ACCES } from '../../lib/serveur/auth';

export const POST: APIRoute = async (context) => {
  const acces = context.cookies.get(COOKIE_ACCES)?.value ?? '';

  retireJetons(context);
  await revoque((context.locals as any).runtime?.env, acces);

  return context.redirect('/admin/connexion', 303);
};

/* Un GET sur cette adresse — un lien collé, un signet — n'est pas une
   erreur à afficher : on renvoie simplement au formulaire. */
export const GET: APIRoute = (context) => context.redirect('/admin/connexion', 303);
