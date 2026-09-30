#!/usr/bin/env node
/* ============================================================
   Créer — ou promouvoir — un compte d'administration.

     node tools/creer-admin.mjs a@exemple.fr 'un mot de passe long'

   Deux écritures, dans cet ordre :
   1. le compte dans `auth.users`, via l'API d'administration de GoTrue ;
   2. la ligne dans `profils`, qui est ce qui ouvre réellement la porte.

   La seconde est la seule qui donne le droit d'entrer : un compte
   Supabase sans ligne dans `profils` peut s'authentifier et se voit
   quand même refuser le back-office. C'est voulu — le jour où le projet
   servira à autre chose qu'à ce back-office, exister ne suffira pas.

   ⚠️ CE SCRIPT LIT LA CLÉ `service_role`. Il tourne sur un poste, jamais
      dans le navigateur, jamais dans un déploiement.
   ============================================================ */
import { readFileSync } from 'node:fs';

/* On accepte l'environnement du shell d'abord, `.env.local` ensuite : en
   production les clés viennent du tableau de bord Cloudflare, pas d'un
   fichier. */
function env(nom) {
  if (process.env[nom]) return process.env[nom];
  try {
    const fichier = readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
    for (const ligne of fichier.split('\n')) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(ligne);
      if (m && m[1] === nom) return m[2].trim().replace(/^["']|["']$/g, '');
    }
  } catch { /* pas de fichier : on retombe sur l'absence, signalée plus bas */ }
  return '';
}

const [email, motDePasse] = process.argv.slice(2);
const URL_BASE = env('SUPABASE_URL').replace(/\/+$/, '');
const SERVICE = env('SUPABASE_SECRET_KEY') || env('SUPABASE_SERVICE_KEY');

if (!email || !motDePasse) {
  console.error("usage : node tools/creer-admin.mjs <courriel> <mot de passe>");
  process.exit(1);
}
if (!URL_BASE || !SERVICE) {
  console.error('SUPABASE_URL et SUPABASE_SECRET_KEY doivent être définis');
  console.error('(dans le shell, ou dans .env.local à la racine du projet)');
  process.exit(1);
}
/* GoTrue refuse en dessous de six caractères ; on prévient avant l'appel,
   avec un seuil plus exigeant — c'est une clef de back-office. */
if (motDePasse.length < 12) {
  console.error('Mot de passe trop court : douze caractères au minimum.');
  process.exit(1);
}

const entetes = {
  apikey: SERVICE,
  Authorization: `Bearer ${SERVICE}`,
  'Content-Type': 'application/json',
};

/** Cherche un compte existant, pour que le script soit rejouable. */
async function trouve(adresse) {
  const r = await fetch(
    `${URL_BASE}/auth/v1/admin/users?filter=${encodeURIComponent(adresse)}`,
    { headers: entetes },
  );
  if (!r.ok) return null;
  const corps = await r.json();
  const liste = corps?.users ?? corps ?? [];
  return liste.find?.((u) => u.email?.toLowerCase() === adresse.toLowerCase()) ?? null;
}

async function principal() {
  let compte = await trouve(email);

  if (compte) {
    console.log(`• compte existant : ${compte.id}`);
  } else {
    const r = await fetch(`${URL_BASE}/auth/v1/admin/users`, {
      method: 'POST',
      headers: entetes,
      /* `email_confirm` évite le courriel de validation : le compte est
         créé par quelqu'un qui a déjà la clé `service_role`, il n'y a
         plus rien à prouver. */
      body: JSON.stringify({ email, password: motDePasse, email_confirm: true }),
    });
    if (!r.ok) {
      console.error('création du compte refusée :', r.status, await r.text());
      process.exit(1);
    }
    compte = await r.json();
    console.log(`• compte créé : ${compte.id}`);
  }

  /* `Prefer: resolution=merge-duplicates` fait de l'insertion un
     « poser ou remplacer » : rejouer le script sur un compte déjà promu
     le remet simplement à `admin`, ce qui est aussi la façon de lever une
     suspension. */
  const r = await fetch(`${URL_BASE}/rest/v1/profils`, {
    method: 'POST',
    headers: { ...entetes, Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify({ id: compte.id, email, role: 'admin' }),
  });

  if (!r.ok) {
    console.error('écriture du profil refusée :', r.status, await r.text());
    console.error("La table `profils` existe-t-elle ? Rejouez supabase/schema.sql.");
    process.exit(1);
  }

  console.log(`• profil « admin » posé pour ${email}`);
  console.log('\nConnexion : /admin/connexion');
}

principal().catch((e) => {
  console.error(e);
  process.exit(1);
});
