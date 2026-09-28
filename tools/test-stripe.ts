import { signatureValide, configStripe } from '../src/lib/serveur/stripe.ts';

let ko = 0;
const ok = (nom: string, cond: boolean, detail = '') => {
  if (!cond) ko++;
  console.log((cond ? 'ok  ' : 'ÉCHEC ') + nom + (detail ? '  → ' + detail : ''));
};

const SECRET = 'whsec_epreuve_locale_0123456789';
const CORPS = JSON.stringify({ type: 'payment_intent.succeeded', data: { object: { id: 'pi_1' } } });

/* On fabrique une signature exactement comme Stripe : HMAC-SHA256 de
   « horodatage.corps », en hexadécimal. */
async function signer(secret: string, corps: string, t: number): Promise<string> {
  const cle = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', cle, new TextEncoder().encode(`${t}.${corps}`));
  const hex = [...new Uint8Array(sig)].map((n) => n.toString(16).padStart(2, '0')).join('');
  return `t=${t},v1=${hex}`;
}

const maintenant = () => Math.floor(Date.now() / 1000);

console.log('--- La signature du webhook ---');

const bonne = await signer(SECRET, CORPS, maintenant());
ok('une signature valide passe', await signatureValide(SECRET, bonne, CORPS));

ok('un secret différent est refusé',
   !(await signatureValide('whsec_autre_secret_totalement', bonne, CORPS)));

ok('un CORPS modifié est refusé',
   !(await signatureValide(SECRET, bonne, CORPS.replace('pi_1', 'pi_PIRATE'))),
   'c’est le cœur : on ne peut pas changer le montant ni l’intention');

ok('un en-tête absent est refusé', !(await signatureValide(SECRET, null, CORPS)));
ok('un en-tête vide est refusé', !(await signatureValide(SECRET, '', CORPS)));
ok('un en-tête sans v1 est refusé',
   !(await signatureValide(SECRET, `t=${maintenant()}`, CORPS)));
ok('un en-tête sans t est refusé',
   !(await signatureValide(SECRET, 'v1=deadbeef', CORPS)));
ok('un en-tête charabia est refusé',
   !(await signatureValide(SECRET, 'nimporte quoi', CORPS)));
ok('un secret vide est refusé — pas de webhook non configuré qui passe',
   !(await signatureValide('', bonne, CORPS)));

console.log('\n--- Le rejeu ---');
const vieille = await signer(SECRET, CORPS, maintenant() - 3600);
ok('une signature d’il y a une heure est refusée',
   !(await signatureValide(SECRET, vieille, CORPS)),
   'sinon une requête légitime capturée hier serait rejouable');
const limite = await signer(SECRET, CORPS, maintenant() - 290);
ok('une signature de moins de cinq minutes passe encore',
   await signatureValide(SECRET, limite, CORPS));
const future = await signer(SECRET, CORPS, maintenant() + 3600);
ok('une signature datée du futur est refusée',
   !(await signatureValide(SECRET, future, CORPS)));

console.log('\n--- Le mode test se déduit de la clé, pas d’une variable ---');
ok('sk_test_… est reconnu comme test',
   configStripe({ STRIPE_SECRET_KEY: 'sk_test_abc' })?.test === true);
ok('sk_live_… n’est PAS du test',
   configStripe({ STRIPE_SECRET_KEY: 'sk_live_abc' })?.test === false,
   'c’est ce booléen qui, croisé au verrou des tarifs provisoires, refuse l’encaissement');
ok('sans clé, pas de configuration', configStripe({}) === null);

console.log(ko ? `\n${ko} ÉCHEC(S)` : '\nTOUT PASSE');
process.exit(ko ? 1 : 0);
