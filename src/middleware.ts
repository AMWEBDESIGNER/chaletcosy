/* ============================================================
   En-têtes de sécurité et normalisation d'hôte — exécutés avant tout rendu.
   ============================================================ */
import { defineMiddleware } from 'astro:middleware';

/* ============================================================
   En-têtes de sécurité.

   `public/_headers` ne couvre que les fichiers servis par Cloudflare
   Pages : les pages prérendues, les images, les polices. Tout ce que
   rend le Worker y échappait, et repartait donc sans la moindre
   protection.

   On les pose ici, à la sortie : la réponse traverse forcément ce point,
   quelle que soit la branche empruntée plus bas.

   Pas de `Content-Security-Policy` : le site s'appuie sur des scripts
   en ligne, et une directive posée sans être éprouvée casserait
   l'interface. Elle mérite d'être traitée à part.
   ============================================================ */
const SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'SAMEORIGIN',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
  // Sans `includeSubDomains` : le jour où un sous-domaine servira autre
  // chose, la directive ne doit pas le rendre injoignable.
  'Strict-Transport-Security': 'max-age=31536000',
};

export const onRequest = defineMiddleware(async (context, next) => {
  /* ----------------------------------------------------------------
     Une seule adresse indexable.
     `www.<domaine>` servirait exactement le même site que `<domaine>` :
     deux domaines pour un seul contenu, donc une popularité coupée en
     deux. On renvoie le sous-domaine vers le domaine nu — celui qu'annonce
     déjà `<link rel="canonical">` — en 301, permanente, pour que
     l'historique de la page suive.

     La normalisation des barres finales (`/contact/` → `/contact`) est
     volontairement laissée à Cloudflare Pages : la faire ici la ferait
     aussi jouer pendant le prérendu, où Astro construit les pages sous
     leur forme `/contact/` — et remplacerait chaque page statique par
     une redirection vers elle-même.
     ---------------------------------------------------------------- */
  const canonicalHost = context.site?.host;
  const { host, pathname, search } = context.url;

  if (canonicalHost && host === `www.${canonicalHost}`) {
    return Response.redirect(`https://${canonicalHost}${pathname}${search}`, 301);
  }

  const response = await next();

  // `Response.redirect()` scelle ses en-têtes : toute écriture y lève une
  // exception. On reconstruit alors la réponse, seule façon de les rouvrir.
  try {
    for (const [k, v] of Object.entries(SECURITY_HEADERS)) response.headers.set(k, v);
    return response;
  } catch {
    const reopened = new Response(response.body, response);
    for (const [k, v] of Object.entries(SECURITY_HEADERS)) reopened.headers.set(k, v);
    return reopened;
  }
});
