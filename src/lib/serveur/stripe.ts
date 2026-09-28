/* ============================================================
   Stripe — CÔTÉ SERVEUR EXCLUSIVEMENT.

   Comme pour la base, pas de SDK : l'API de Stripe est du HTTP en
   `application/x-www-form-urlencoded`, et l'on n'en appelle ici que deux
   points. Le SDK officiel pèse plus lourd que tout le JavaScript du site.

   ⚠️ LA CLÉ SECRÈTE NE SORT JAMAIS D'ICI. Ce qui part au navigateur est le
   `client_secret` d'une intention de paiement — un jeton lié à UN montant
   et à UNE intention, qui ne permet ni de lire un compte ni d'en créer une
   autre. La confusion entre les deux est l'erreur classique.
   ============================================================ */

export interface ConfigStripe {
  cle: string;
  /** `true` quand la clé est une clé de test (`sk_test_…`). */
  test: boolean;
  webhookSecret: string;
}

export function configStripe(runtime: any): ConfigStripe | null {
  const cle = runtime?.STRIPE_SECRET_KEY ?? (import.meta.env as any)?.STRIPE_SECRET_KEY ?? '';
  if (!cle) return null;
  return {
    cle,
    /* Le préfixe est la SEULE façon fiable de savoir dans quel monde on
       est. Une variable d'environnement « MODE=test » se désynchronise de
       la clé le jour où l'on remplace l'une sans l'autre — et ce jour-là,
       on croit tester alors qu'on encaisse. */
    test: cle.startsWith('sk_test_'),
    webhookSecret: runtime?.STRIPE_WEBHOOK_SECRET ?? (import.meta.env as any)?.STRIPE_WEBHOOK_SECRET ?? '',
  };
}

export class ErreurStripe extends Error {}

async function appelle(c: ConfigStripe, chemin: string, corps: Record<string, string>, idem?: string) {
  const entetes: Record<string, string> = {
    Authorization: `Bearer ${c.cle}`,
    'Content-Type': 'application/x-www-form-urlencoded',
  };
  /* La clé d'idempotence : un visiteur qui double-clique, ou un réseau qui
     rejoue la requête, ne doit pas produire deux intentions de paiement
     pour un même séjour. Stripe rend alors la première. */
  if (idem) entetes['Idempotency-Key'] = idem;

  const res = await fetch(`https://api.stripe.com/v1/${chemin}`, {
    method: 'POST',
    headers: entetes,
    body: new URLSearchParams(corps).toString(),
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    console.error('[stripe]', chemin, res.status, data?.error?.message);
    throw new ErreurStripe(data?.error?.message ?? `HTTP ${res.status}`);
  }
  return data;
}

export interface Intention {
  id: string;
  clientSecret: string;
}

/**
 * Crée l'intention de paiement de l'acompte.
 *
 * Le montant est en CENTIMES et vient du serveur — jamais du client. Les
 * métadonnées portent la référence du séjour : c'est par elles que le
 * webhook retrouvera quelle occupation confirmer, sans avoir à faire
 * confiance à quoi que ce soit d'autre que Stripe.
 */
export function creerIntention(
  c: ConfigStripe,
  args: { montantCents: number; reference: string; occupation: string; email: string },
): Promise<Intention> {
  return appelle(c, 'payment_intents', {
    amount: String(args.montantCents),
    currency: 'eur',
    'automatic_payment_methods[enabled]': 'true',
    receipt_email: args.email,
    description: `Acompte — séjour ${args.reference} — Chalet Cosy`,
    'metadata[reference]': args.reference,
    'metadata[occupation]': args.occupation,
  }, `lbe-${args.occupation}`).then((d: any) => ({ id: d.id, clientSecret: d.client_secret }));
}

/* ------------------------------------------------------------
   La signature des webhooks
   ------------------------------------------------------------ */

const encodeur = new TextEncoder();

const hex = (b: ArrayBuffer) =>
  [...new Uint8Array(b)].map((n) => n.toString(16).padStart(2, '0')).join('');

/** Comparaison à temps constant : une comparaison naïve fuit la signature
    attendue, octet par octet, par le temps qu'elle met à échouer. */
function memeChaine(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

/**
 * Vérifie la signature d'un webhook Stripe.
 *
 * ⚠️ SANS CETTE VÉRIFICATION, N'IMPORTE QUI PEUT CONFIRMER N'IMPORTE QUELLE
 *    RÉSERVATION. L'adresse du webhook est publique ; un POST forgé
 *    disant « paiement reçu » suffirait à faire passer un séjour en
 *    confirmé sans qu'un centime ait bougé. C'est la faille la plus
 *    courante des intégrations de paiement, et la plus coûteuse.
 *
 * La tolérance de cinq minutes ferme la porte au rejeu : une requête
 * légitime capturée hier ne peut pas être renvoyée aujourd'hui.
 */
export async function signatureValide(
  secret: string,
  entete: string | null,
  corpsBrut: string,
  toleranceSecondes = 300,
): Promise<boolean> {
  if (!secret || !entete) return false;

  const parts = Object.fromEntries(
    entete.split(',').map((p) => p.split('=', 2) as [string, string]),
  );
  const t = parts.t;
  const v1 = parts.v1;
  if (!t || !v1) return false;

  const age = Math.abs(Math.floor(Date.now() / 1000) - parseInt(t, 10));
  if (!Number.isFinite(age) || age > toleranceSecondes) return false;

  const cle = await crypto.subtle.importKey(
    'raw', encodeur.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', cle, encodeur.encode(`${t}.${corpsBrut}`));
  return memeChaine(hex(sig), v1);
}
