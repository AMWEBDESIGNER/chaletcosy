# La base de réservation

Ce dossier ne contient que du SQL. Il n'est **pas** joué par le build : la
base se crée une fois, à la main, dans le projet Supabase.

## Mise en place

1. Créer un projet Supabase (région **eu-west-3 / Paris** — les données
   sont nominatives et n'ont aucune raison de quitter l'Union).
2. Ouvrir l'éditeur SQL et exécuter `schema.sql` en entier.
3. Relever dans *Project settings → API* :
   - l'URL du projet,
   - la clé **`service_role`**.

## Les variables, côté Cloudflare Pages

Dans *Settings → Environment variables* du projet Pages :

| Variable | Valeur |
|---|---|
| `SUPABASE_URL` | l'URL du projet |
| `SUPABASE_SERVICE_KEY` | la clé `service_role` |

⚠️ **La clé `service_role` contourne toutes les règles de sécurité de la
base.** Elle ne doit jamais apparaître dans du code envoyé au navigateur,
ni dans une variable préfixée `PUBLIC_` (Astro expose celles-là au client),
ni dans le dépôt. Elle vit dans les variables Cloudflare, et nulle part
ailleurs. Le site n'interroge jamais Supabase depuis le navigateur : tout
passe par une route serveur.

C'est aussi la raison pour laquelle `schema.sql` active RLS sans déclarer
la moindre politique. Supabase publie automatiquement chaque table sur son
API REST ; une table sans RLS est lisible par quiconque possède la clé
`anon`, qui est publique par conception. Sans ces lignes, le nom,
l'e-mail, le téléphone et les dates de séjour de tous les clients seraient
interrogeables depuis un navigateur. Aucune politique = tout est refusé,
et seule la clé `service_role` — donc seul le serveur — passe.

## Vérifier le schéma

Les garanties de ce schéma ne sont pas décoratives : la contrainte
d'exclusion est ce qui rend la double réservation **impossible**, y compris
entre deux visiteurs qui valident la même seconde. Elle se vérifie sur une
base jetable :

```bash
createdb lbe_test
psql -d lbe_test -f supabase/schema.sql
psql -d lbe_test -f supabase/test-schema.sql
```

Chaque cas annonce ce qu'il attend. Un `ERROR` sous un cas marqué
« DOIT ÉCHOUER » est une **réussite** ; son absence est une régression.

Éprouvé sur PostgreSQL 16.13. Le script est idempotent — le rejouer ne
casse rien.

## Ouvrir l'accès au back-office

L'identité vient de **Supabase Auth** : lui seul tient les mots de passe,
leur hachage et la limitation des tentatives. La table `profils` dit
ensuite lequel de ces comptes a le droit d'entrer — et c'est elle, pas le
compte, qui ouvre la porte.

```bash
node tools/creer-admin.mjs vous@exemple.fr 'un mot de passe long et unique'
```

Le script crée le compte s'il n'existe pas, puis pose son profil en
`admin`. Il est rejouable : sur un compte déjà connu, il se contente de
remettre le rôle — ce qui est aussi la façon de lever une suspension.

Il lit `SUPABASE_URL` et `SUPABASE_SERVICE_KEY` dans l'environnement, ou
à défaut dans `.env.local`. La connexion se fait ensuite sur
`/admin/connexion`.

**Retirer un accès**, sans perdre la trace de qui l'avait :

```sql
update profils set role = 'suspendu' where email = 'ancien@exemple.fr';
```

L'effet est immédiat — le rôle est relu à chaque affichage de page, il
n'est pas porté par le jeton. Un `delete` fonctionnerait aussi, mais on ne
pourrait plus répondre à « qui avait accès en mars ? ».

## Ce que le schéma ne fait pas

- **Il ne périme pas les options tout seul.** Une option non payée cesse
  d'occuper les nuits quand `perimer_les_options()` est appelée : une
  contrainte d'index ne peut pas lire l'heure. Cette fonction doit être
  appelée avant toute lecture de disponibilité et avant toute réservation.
- **Il ne synchronise rien.** L'import du calendrier Airbnb et l'export du
  nôtre sont des routes du site, pas du SQL.
- **Il ne journalise que deux actions** : `option_posee` et
  `acompte_encaisse`. La péremption d'une option et l'import d'un blocage
  Airbnb changent des occupations sans laisser de trace — une semaine
  libérée toute seule est donc invisible dans `/admin/journal`.
