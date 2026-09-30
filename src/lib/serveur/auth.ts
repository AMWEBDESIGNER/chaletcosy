/* ============================================================
   L'entrée du back-office — CÔTÉ SERVEUR EXCLUSIVEMENT.

   Même règle que `base.ts`, et pour la même raison : ce module lit des
   secrets, il vit donc sous `lib/serveur/` pour que l'erreur se voie à la
   ligne d'import. Aucune de ses variables ne porte le préfixe `PUBLIC_`.

   CE QUE SUPABASE FAIT ICI, ET CE QU'IL NE FAIT PAS.
   Il tient les mots de passe : le hachage, sa mise à jour, la limitation
   des tentatives. Trois choses qu'on n'écrit pas soi-même, et la raison
   d'être de ce détour. Il ne fait rien d'autre : le navigateur ne parle
   jamais à Supabase, il parle à ce site, qui parle à Supabase.

   ⚠️ POURQUOI LE NAVIGATEUR NE REÇOIT PAS DE JETON EXPLOITABLE.
      Le schéma tient sur un principe — le navigateur ne touche pas la
      base (voir la section SÉCURITÉ de `schema.sql`). Un jeton posé dans
      `localStorage`, comme le fait le SDK Supabase par défaut, le
      contredirait deux fois : il serait lisible par tout script injecté,
      et il inviterait à interroger PostgREST depuis la page. Les jetons
      vivent donc dans des cookies `HttpOnly`, que le JavaScript de la
      page ne peut pas lire, et les données continuent d'être lues par le
      Worker avec la clé `service_role`.
   ============================================================ */
import type { AstroCookies } from 'astro';
import { config, type Config } from './base.ts';

/* Le strict nécessaire, plutôt qu'`AstroGlobal` : les mêmes fonctions
   servent aux pages (`Astro`) et aux routes d'API (`APIContext`), qui ne
   partagent pas leur type mais bien ces quatre membres. */
interface Contexte {
  cookies: AstroCookies;
  url: URL;
  locals: any;
  redirect: (chemin: string, statut?: number) => Response;
}

/** Le jeton d'accès. Court : GoTrue le taille à une heure environ. */
const COOKIE_ACCES = 'lbe_sess';
/** Le jeton de renouvellement. Long, donc plus sensible que le premier. */
const COOKIE_RENOUV = 'lbe_renouv';

/* Les deux cookies sont limités à `/admin` : ils ne partent alors avec
   aucune requête du site public — ni une image, ni une police, ni un
   appel au calendrier. Le chemin de renouvellement, lui, est encore plus
   étroit : ce jeton-là ne sert qu'à une seule route. */
const CHEMIN_SESSION = '/admin';
const CHEMIN_RENOUV = '/admin';

const TRENTE_JOURS = 60 * 60 * 24 * 30;

export interface Session {
  id: string;
  email: string;
}

interface ConfigAuth {
  url: string;
  /** La clé « anon ». Publique par conception — GoTrue la réclame pour
      identifier le projet, elle n'autorise rien à elle seule. */
  anon: string;
}

function configAuth(runtime: any): ConfigAuth | null {
  const env = (k: string) => runtime?.[k] ?? (import.meta.env as any)?.[k] ?? '';
  const url = env('SUPABASE_URL');
  const anon = env('SUPABASE_PUBLISHABLE_KEY') || env('SUPABASE_ANON_KEY');
  return url && anon ? { url: url.replace(/\/+$/, ''), anon } : null;
}

/**
 * Un appel à GoTrue, ou `null` s'il n'a pas pu être joint.
 *
 * ⚠️ LA PANNE DE RÉSEAU EST UN CAS NOMINAL, PAS UNE EXCEPTION. `fetch`
 *    lève quand l'hôte ne répond pas — DNS, coupure, incident Supabase.
 *    Laissée remonter, cette exception sortait en 500 brut sur le
 *    formulaire de connexion : une page d'erreur illisible là où il
 *    fallait une phrase. On la ramène ici à `null`, que les appelants
 *    distinguent d'un refus.
 */
async function gotrue(a: ConfigAuth, chemin: string, init: RequestInit): Promise<Response | null> {
  try {
    return await fetch(`${a.url}/auth/v1/${chemin}`, {
      ...init,
      headers: {
        apikey: a.anon,
        'Content-Type': 'application/json',
        ...(init.headers ?? {}),
      },
    });
  } catch (e) {
    console.error('[auth] GoTrue injoignable', chemin, e);
    return null;
  }
}

/* ------------------------------------------------------------
   Les trois échanges avec GoTrue
   ------------------------------------------------------------ */

interface Jetons {
  acces: string;
  renouvellement: string;
  /** Durée de vie du jeton d'accès, en secondes. */
  duree: number;
  id: string;
  email: string;
}

function lisJetons(corps: any): Jetons | null {
  if (!corps?.access_token || !corps?.user?.id) return null;
  return {
    acces: corps.access_token,
    renouvellement: corps.refresh_token ?? '',
    duree: corps.expires_in ?? 3600,
    id: corps.user.id,
    email: corps.user.email ?? '',
  };
}

/**
 * Échange un couple courriel/mot de passe contre des jetons.
 *
 * Rend `null` sur échec, sans dire lequel : « ce compte n'existe pas » et
 * « le mot de passe est faux » sont deux réponses différentes, et l'écart
 * entre les deux est ce qui permet d'énumérer les comptes existants.
 *
 * La limitation des tentatives est celle de GoTrue, qui compte par
 * adresse IP et par identifiant. La refaire ici n'apporterait rien : un
 * Worker Cloudflare n'a pas de mémoire partagée entre ses instances, un
 * compteur local se remettrait donc à zéro à chaque isolat.
 */
export type Tentative =
  | { jetons: Jetons; echec?: undefined }
  /** GoTrue a répondu, et il a dit non. */
  | { jetons?: undefined; echec: 'identifiants' }
  /** GoTrue n'a pas répondu, ou n'est pas configuré. On ne sait rien des
      identifiants — et le dire « incorrects » enverrait quelqu'un
      chercher un mot de passe qui n'a rien perdu. */
  | { jetons?: undefined; echec: 'indisponible' };

export async function connexion(
  runtime: any, email: string, motDePasse: string,
): Promise<Tentative> {
  const a = configAuth(runtime);
  if (!a) return { echec: 'indisponible' };

  const res = await gotrue(a, 'token?grant_type=password', {
    method: 'POST',
    body: JSON.stringify({ email, password: motDePasse }),
  });

  if (!res) return { echec: 'indisponible' };

  if (!res.ok) {
    /* 4xx : GoTrue a jugé. 5xx : GoTrue a trébuché — ce n'est pas la
       faute de qui tape son mot de passe. */
    console.error('[auth] connexion refusée', res.status);
    return { echec: res.status >= 500 ? 'indisponible' : 'identifiants' };
  }

  const jetons = lisJetons(await res.json());
  return jetons ? { jetons } : { echec: 'indisponible' };
}

/** Rend une session valide à partir du jeton de renouvellement, ou `null`. */
async function renouvelle(runtime: any, jeton: string): Promise<Jetons | null> {
  const a = configAuth(runtime);
  if (!a || !jeton) return null;

  const res = await gotrue(a, 'token?grant_type=refresh_token', {
    method: 'POST',
    body: JSON.stringify({ refresh_token: jeton }),
  });

  if (!res?.ok) return null;
  return lisJetons(await res.json());
}

/**
 * Demande à GoTrue à qui appartient ce jeton.
 *
 * ⚠️ ON NE VÉRIFIE PAS LA SIGNATURE SOI-MÊME, ET C'EST DÉLIBÉRÉ.
 *    Un projet Supabase signe ses jetons tantôt en HS256 avec un secret
 *    partagé, tantôt en ES256 avec une paire de clefs publiée en JWKS,
 *    selon son âge et ses réglages. Un vérificateur écrit pour l'un
 *    refuse tout chez l'autre — ou, réglé trop large, accepte ce qu'il
 *    devrait refuser. Et une signature valide ne dit rien d'une session
 *    déjà fermée : elle le reste jusqu'à l'expiration.
 *
 *    Le coût est un aller-retour par affichage de page. Sur un
 *    back-office ouvert par une ou deux personnes, il ne se voit pas ;
 *    l'erreur d'algorithme, elle, se verrait longtemps.
 */
async function utilisateurDu(runtime: any, acces: string): Promise<{ id: string; email: string } | null> {
  const a = configAuth(runtime);
  if (!a || !acces) return null;

  const res = await gotrue(a, 'user', {
    method: 'GET',
    headers: { Authorization: `Bearer ${acces}` },
  });

  if (!res?.ok) return null;
  const u = await res.json();
  return u?.id ? { id: u.id, email: u.email ?? '' } : null;
}

/** Ferme la session côté GoTrue, pour que le jeton cesse d'être renouvelable. */
async function revoque(runtime: any, acces: string): Promise<void> {
  const a = configAuth(runtime);
  if (!a || !acces) return;
  try {
    await gotrue(a, 'logout', {
      method: 'POST',
      headers: { Authorization: `Bearer ${acces}` },
    });
  } catch (e) {
    /* La déconnexion locale prime : les cookies partent quoi qu'il
       arrive, plus bas. Un GoTrue injoignable ne doit pas retenir
       quelqu'un dans une session dont il veut sortir. */
    console.error('[auth] révocation', e);
  }
}

/* ------------------------------------------------------------
   Le rôle, lu dans la base à chaque fois
   ------------------------------------------------------------ */

/**
 * Ce compte a-t-il le droit d'ouvrir l'administration ?
 *
 * Relu à chaque affichage, et non porté par le jeton : voir la note de la
 * table `profils` dans `schema.sql`. Retirer un accès doit prendre effet
 * au rechargement suivant, pas à l'expiration du jeton en cours.
 */
async function estAdmin(c: Config, id: string): Promise<boolean> {
  try {
    const res = await fetch(
      `${c.url}/rest/v1/profils?select=role&id=eq.${encodeURIComponent(id)}`,
      { headers: { apikey: c.cle, Authorization: `Bearer ${c.cle}` } },
    );
    if (!res.ok) {
      console.error('[auth] lecture du profil', res.status);
      return false;
    }
    const lignes = await res.json();
    return lignes?.[0]?.role === 'admin';
  } catch (e) {
    /* Base injoignable : on refuse. Le sens de la panne compte —
       « je ne sais pas si cette personne est administratrice » doit
       fermer la porte, jamais l'ouvrir. */
    console.error('[auth] lecture du profil', e);
    return false;
  }
}

/* ------------------------------------------------------------
   Les cookies
   ------------------------------------------------------------ */

function poseJetons(Astro: Contexte, j: Jetons): void {
  /* `Secure` seulement en HTTPS : posé sans condition, le cookie serait
     refusé par le navigateur en développement local, sur `http://`, et
     la connexion tournerait en rond sans dire pourquoi. */
  const secure = Astro.url.protocol === 'https:';
  const commun = { httpOnly: true, secure, sameSite: 'lax' as const };

  Astro.cookies.set(COOKIE_ACCES, j.acces, {
    ...commun, path: CHEMIN_SESSION, maxAge: j.duree,
  });
  if (j.renouvellement) {
    Astro.cookies.set(COOKIE_RENOUV, j.renouvellement, {
      ...commun, path: CHEMIN_RENOUV, maxAge: TRENTE_JOURS,
    });
  }
}

function retireJetons(Astro: Contexte): void {
  Astro.cookies.delete(COOKIE_ACCES, { path: CHEMIN_SESSION });
  Astro.cookies.delete(COOKIE_RENOUV, { path: CHEMIN_RENOUV });
}

/* ------------------------------------------------------------
   La garde
   ------------------------------------------------------------ */

export type Garde =
  | { session: Session; refus?: undefined }
  | { session?: undefined; refus: Response };

/**
 * À appeler en tête de CHAQUE page d'administration :
 *
 *     const garde = await exigeAdmin(Astro);
 *     if (garde.refus) return garde.refus;
 *
 * Rend la session, ou la réponse à renvoyer telle quelle — une
 * redirection vers la page de connexion dans presque tous les cas.
 *
 * La forme du retour n'est pas un caprice : une garde qui rendrait
 * `null` en cas de refus laisserait le rendu se poursuivre si l'appelant
 * oublie de tester. Ici, oublier le test laisse `garde.session` à
 * `undefined` et la page ne compile pas.
 */
export async function exigeAdmin(Astro: Contexte): Promise<Garde> {
  const runtime = (Astro.locals as any).runtime?.env;
  const c = config(runtime);
  const versConnexion = () => {
    /* On mémorise où l'on allait, pour y revenir après la connexion. */
    const suite = encodeURIComponent(Astro.url.pathname + Astro.url.search);
    return { refus: Astro.redirect(`/admin/connexion?suite=${suite}`) };
  };

  if (!c || !configAuth(runtime)) {
    return { refus: new Response('Administration non configurée.', { status: 503 }) };
  }

  let utilisateur = await utilisateurDu(runtime, Astro.cookies.get(COOKIE_ACCES)?.value ?? '');

  /* Jeton absent ou périmé : on tente le renouvellement avant de
     renvoyer quelqu'un au formulaire. Sans cela, une session tomberait
     toutes les heures, au milieu d'une saisie. */
  if (!utilisateur) {
    const j = await renouvelle(runtime, Astro.cookies.get(COOKIE_RENOUV)?.value ?? '');
    if (!j) {
      retireJetons(Astro);
      return versConnexion();
    }
    poseJetons(Astro, j);
    utilisateur = { id: j.id, email: j.email };
  }

  if (!(await estAdmin(c, utilisateur.id))) {
    /* Authentifié mais sans droit : on ferme la session plutôt que de
       laisser un cookie valide traîner sur une porte close. */
    retireJetons(Astro);
    return versConnexion();
  }

  return { session: utilisateur };
}

/* Réexports pour les deux routes qui ouvrent et ferment la session. */
export { poseJetons, retireJetons, revoque, COOKIE_ACCES };
