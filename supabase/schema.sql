-- ============================================================
-- Chalet Cosy — schéma de réservation (PostgreSQL / Supabase)
--
-- À exécuter dans l'éditeur SQL du projet Supabase. Le script est
-- IDEMPOTENT : on peut le rejouer sans casser des données existantes.
--
-- DEUX PARTIS PRIS QUI GOUVERNENT TOUT LE RESTE.
--
-- 1. C'EST LA BASE QUI INTERDIT LA DOUBLE RÉSERVATION, PAS LE CODE.
--    Une vérification applicative — « ces dates sont-elles libres ? » puis
--    « insérer » — laisse toujours une fenêtre entre les deux. Deux
--    visiteurs qui valident la même seconde passent tous les deux le test
--    et écrivent tous les deux. C'est rare, et c'est précisément ce qui
--    arrive un samedi de juillet quand deux personnes visent la même
--    semaine. Une contrainte d'exclusion rend le chevauchement
--    IMPOSSIBLE : la seconde transaction est rejetée par le moteur, quoi
--    que fasse l'application.
--
-- 2. TOUTES LES OCCUPATIONS VIVENT DANS UNE SEULE TABLE.
--    Les nuits vendues sur Airbnb et celles vendues ici occupent la même
--    chalet. Réparties dans deux tables, aucune contrainte ne pourrait les
--    comparer — PostgreSQL n'exclut qu'à l'intérieur d'une table. Une
--    seule table, une seule contrainte, une seule vérité.
--
-- ⚠️ CONVENTION DE BORNES : `[)`, début inclus, fin EXCLUE. Le jour du
--    départ n'est pas une nuit occupée : un séjour du 10 au 14 occupe
--    quatre nuits et laisse le 14 libre à l'arrivant suivant. C'est la
--    même convention que `src/lib/reservation.ts`, et elle n'est
--    négociable ni d'un côté ni de l'autre.
-- ============================================================

-- `daterange` avec exclusion réclame l'opérateur GiST sur les types
-- scalaires : c'est ce qu'apporte btree_gist.
create extension if not exists btree_gist;
create extension if not exists pgcrypto;

-- ============================================================
-- LES OCCUPATIONS
-- ============================================================
create table if not exists occupations (
  id            uuid primary key default gen_random_uuid(),

  -- Référence communicable au client : « LBE-2026-0007 ». Nulle pour un
  -- blocage importé, qui n'a pas de client à qui parler.
  reference     text unique,

  -- [arrivée, départ). Voir la convention de bornes en tête de fichier.
  periode       daterange not null,

  origine       text not null check (origine in ('site', 'airbnb', 'manuel')),

  -- `option`   : dates retenues, acompte pas encore encaissé.
  -- `confirme` : acompte encaissé (ou blocage ferme).
  -- `annule`   : annulé, libère les nuits.
  -- `expire`   : option non payée dans le délai, libère les nuits.
  statut        text not null check (statut in ('option', 'confirme', 'annule', 'expire')),

  voyageurs     integer check (voyageurs is null or voyageurs between 1 and 4),
  nom           text,
  email         text,
  telephone     text,
  message       text,

  -- Les montants sont FIGÉS à la réservation, en centimes.
  --
  -- En centimes parce qu'un prix n'est pas un flottant : 0,1 + 0,2 ne fait
  -- pas 0,3 en binaire, et l'écart finit par se voir sur une facture.
  --
  -- Figés parce que le tarif d'un séjour est celui du jour où il a été
  -- accepté. Recalculés à l'affichage, ils changeraient rétroactivement le
  -- jour où l'on ajuste une saison — un client verrait son séjour déjà
  -- payé changer de prix.
  total_cents   integer check (total_cents is null or total_cents >= 0),
  acompte_cents integer check (acompte_cents is null or acompte_cents >= 0),
  devise        text not null default 'eur',

  stripe_payment_intent text unique,

  -- Au-delà de cette date, une option non payée cesse d'occuper les nuits.
  -- Voir la note sur la péremption, plus bas.
  option_expire_le timestamptz,

  -- UID de l'événement iCal, pour reconnaître un blocage déjà importé et
  -- ne pas le dupliquer à chaque synchronisation.
  uid_externe   text,

  cree_le       timestamptz not null default now(),
  maj_le        timestamptz not null default now(),

  -- Une période vide ou inversée n'est pas un séjour. Sans cette
  -- contrainte, `daterange('2026-07-14','2026-07-10')` lèverait une erreur
  -- Postgres, mais `daterange('2026-07-10','2026-07-10')` passerait — et
  -- une occupation de zéro nuit n'entrerait en conflit avec rien.
  constraint periode_non_vide check (not isempty(periode)),

  -- Une réservation venue du site a forcément un client.
  constraint client_si_site check (
    origine <> 'site' or (email is not null and nom is not null)
  )
);

-- ============================================================
-- LA CONTRAINTE QUI EMPÊCHE DE VENDRE DEUX FOIS LA MÊME NUIT
--
-- Seuls `option` et `confirme` occupent. Un séjour annulé ou une option
-- périmée ne bloquent rien : c'est tout l'objet du `where`.
--
-- ⚠️ CONSÉQUENCE VOULUE À L'IMPORT AIRBNB. Si Airbnb annonce des nuits que
--    le site a déjà vendues, l'insertion ÉCHOUE au lieu de passer. C'est
--    le comportement souhaitable : le conflit existe déjà dans le monde
--    réel, et il vaut mieux qu'un import bruyant vous le signale plutôt
--    qu'un client sur le pas de la porte. La routine d'import doit
--    attraper cette erreur et vous alerter, jamais l'avaler.
--
-- ⚠️ POURQUOI LA PÉREMPTION N'EST PAS DANS LE `where`. On aimerait écrire
--    `option_expire_le > now()`. C'est impossible : un index n'admet que
--    des expressions immuables, et `now()` change à chaque appel. La
--    péremption est donc balayée par `perimer_les_options()` plus bas, à
--    appeler avant toute lecture de disponibilité.
-- ============================================================
alter table occupations drop constraint if exists occupations_sans_chevauchement;
alter table occupations add constraint occupations_sans_chevauchement
  exclude using gist (periode with &&)
  where (statut in ('option', 'confirme'));

create index if not exists occupations_periode_idx on occupations using gist (periode);
create index if not exists occupations_statut_idx on occupations (statut);
create unique index if not exists occupations_uid_externe_idx
  on occupations (uid_externe) where uid_externe is not null;

-- ============================================================
-- LES SAISONS TARIFAIRES
--
-- `debut`/`fin` en `MM-JJ`, bornes incluses, récurrentes chaque année.
-- Une saison dont `debut` est postérieur à `fin` enjambe le Nouvel An
-- (« 12-20 » → « 01-05 ») — sans quoi la quinzaine des fêtes, la plus
-- chère de l'année, serait facturée au tarif de la basse saison.
--
-- `priorite` croissante : la plus basse gagne. Elle permet de poser une
-- semaine exceptionnelle par-dessus les saisons générales sans les
-- découper.
-- ============================================================
create table if not exists saisons (
  id           uuid primary key default gen_random_uuid(),
  nom          text not null,
  debut        text not null check (debut ~ '^\d{2}-\d{2}$'),
  fin          text not null check (fin ~ '^\d{2}-\d{2}$'),
  nuit_cents   integer not null check (nuit_cents >= 0),
  minimum      integer not null default 1 check (minimum >= 1),
  priorite     integer not null default 100,
  cree_le      timestamptz not null default now()
);

-- ============================================================
-- LES PARAMÈTRES — une seule ligne, garantie par la contrainte.
-- ============================================================
create table if not exists parametres (
  id                    boolean primary key default true check (id),
  menage_cents          integer not null default 0 check (menage_cents >= 0),
  taxe_pppn_cents       integer not null default 0 check (taxe_pppn_cents >= 0),
  -- En points de base (3000 = 30 %). Un entier, pour la même raison que
  -- les montants : un pourcentage en flottant dérive.
  acompte_bps           integer not null default 3000 check (acompte_bps between 0 and 10000),
  -- Durée de validité d'une option non payée.
  option_minutes        integer not null default 30 check (option_minutes > 0),
  -- Marge de sécurité côté Airbnb : leur synchronisation iCal n'est pas
  -- instantanée (quelques heures). Refuser les arrivées trop proches
  -- évite de vendre une nuit qu'Airbnb vient de vendre sans nous l'avoir
  -- encore dit.
  preavis_jours         integer not null default 2 check (preavis_jours >= 0),
  airbnb_ical_url       text,
  derniere_synchro      timestamptz,

  -- ⚠️ LE VERROU DES TARIFS PROVISOIRES.
  --
  -- Tant que ce drapeau est levé, la grille tarifaire en base est un jeu
  -- d'essai — des chiffres plausibles posés pour dessiner l'interface, pas
  -- les prix du propriétaire. Le tunnel de réservation DOIT alors refuser
  -- tout encaissement réel et rester en mode test Stripe.
  --
  -- Il vit ici, en base, et non dans un commentaire de fichier : un
  -- commentaire ne se relit pas le jour de la mise en ligne. Une colonne
  -- se lit à chaque requête, et le code peut s'y opposer.
  --
  -- Il ne s'abaisse qu'à la main, une fois les vrais tarifs saisis —
  -- jamais par une migration, jamais par un script de démarrage.
  tarifs_provisoires    boolean not null default true,

  maj_le                timestamptz not null default now()
);
-- Rejouable sur une base déjà en service, où la colonne peut manquer.
alter table parametres add column if not exists tarifs_provisoires boolean not null default true;
insert into parametres (id) values (true) on conflict (id) do nothing;

-- ============================================================
-- LE JOURNAL — qui a changé quoi, et quand.
--
-- « Gérer dans les moindres détails » suppose de pouvoir revenir en
-- arrière et de savoir d'où vient un changement de statut : une
-- annulation contestée se tranche sur une trace, pas sur un souvenir.
-- ============================================================
create table if not exists journal (
  id           bigserial primary key,
  occupation   uuid references occupations(id) on delete set null,
  action       text not null,
  detail       jsonb,
  acteur       text,
  cree_le      timestamptz not null default now()
);
create index if not exists journal_occupation_idx on journal (occupation, cree_le desc);

-- ============================================================
-- LE CONTENU ÉDITABLE DU SITE
--
-- Une ligne par bloc de texte ou photographie. Les valeurs par défaut
-- restent dans le code : supprimer une ligne restaure donc proprement le
-- contenu livré avec le site, sans migration inverse.
-- ============================================================
create table if not exists contenus_site (
  cle       text primary key,
  valeur    text not null,
  type      text not null check (type in ('texte', 'image')),
  maj_par   text,
  maj_le    timestamptz not null default now()
);
create index if not exists contenus_site_maj_le_idx on contenus_site (maj_le desc);

-- Le bucket est public en lecture : les photographies doivent pouvoir être
-- servies aux visiteurs. Seul le serveur, muni de la clé service_role,
-- écrit dedans ; aucune politique d'upload anonyme n'est créée.
do $$
begin
  if exists (select 1 from information_schema.tables
              where table_schema = 'storage' and table_name = 'buckets') then
    insert into storage.buckets (id, name, public)
    values ('medias-site', 'medias-site', true)
    on conflict (id) do update set public = excluded.public;
  end if;
end $$;

-- Changement de statut atomique avec sa trace. La clé service_role est le
-- seul appelant ; le contrôle administrateur a déjà eu lieu côté serveur.
create or replace function admin_modifier_statut(
  p_occupation uuid,
  p_statut text,
  p_acteur text
) returns boolean as $$
declare ancien text;
begin
  if p_statut not in ('option', 'confirme', 'annule') then
    raise exception 'STATUT_INVALIDE';
  end if;

  select statut into ancien from occupations where id = p_occupation for update;
  if ancien is null then raise exception 'OCCUPATION_INTROUVABLE'; end if;
  if ancien = p_statut then return false; end if;

  update occupations set statut = p_statut where id = p_occupation;
  insert into journal (occupation, action, detail, acteur)
  values (
    p_occupation,
    'statut_modifie',
    jsonb_build_object('avant', ancien, 'apres', p_statut),
    p_acteur
  );
  return true;
end;
$$ language plpgsql;

-- ============================================================
-- QUI A LE DROIT D'ENTRER DANS LE BACK-OFFICE
--
-- L'identité vient de Supabase Auth (`auth.users`) : c'est lui qui tient
-- les mots de passe, leur hachage et leur renouvellement — trois choses
-- qu'on n'écrit pas soi-même. Cette table ne dit qu'UNE chose de plus :
-- lequel de ces comptes a le droit d'ouvrir l'administration.
--
-- POURQUOI UNE TABLE PLUTÔT QUE `app_metadata` SUR L'UTILISATEUR.
-- Le rôle porté par le jeton ne change qu'au renouvellement de celui-ci :
-- un accès retiré resterait valable jusqu'à l'expiration du jeton en
-- cours. Ici le rôle est relu à CHAQUE affichage de page — retirer un
-- accès prend effet au rechargement suivant, pas une heure plus tard.
--
-- ⚠️ `suspendu` existe pour que la révocation soit un `update`, pas un
--    `delete`. On veut pouvoir répondre « qui avait accès en mars ? » ;
--    une ligne supprimée ne répond plus rien.
-- ============================================================
create table if not exists profils (
  -- Même identifiant que dans `auth.users`. La clef étrangère est posée
  -- plus bas, seulement si le schéma `auth` existe : `schema.sql` doit
  -- rester jouable sur un PostgreSQL nu, c'est ainsi que tourne
  -- `test-schema.sql`.
  id       uuid primary key,
  email    text not null,
  role     text not null default 'admin' check (role in ('admin', 'suspendu')),
  cree_le  timestamptz not null default now()
);

do $$
begin
  if exists (select 1 from information_schema.tables
              where table_schema = 'auth' and table_name = 'users')
     and not exists (select 1 from pg_constraint where conname = 'profils_id_fkey') then
    execute 'alter table profils add constraint profils_id_fkey
               foreign key (id) references auth.users(id) on delete cascade';
  end if;
end $$;

-- ============================================================
-- LA PÉREMPTION DES OPTIONS
--
-- À appeler AVANT toute lecture de disponibilité et avant toute tentative
-- de réservation. Sans cela, un panier abandonné garderait la semaine
-- indéfiniment : la contrainte d'exclusion ne sait pas lire l'heure.
-- ============================================================
create or replace function perimer_les_options() returns integer as $$
declare n integer;
begin
  update occupations
     set statut = 'expire', maj_le = now()
   where statut = 'option'
     and option_expire_le is not null
     and option_expire_le < now();
  get diagnostics n = row_count;
  return n;
end;
$$ language plpgsql;

-- Tenir `maj_le` à jour sans compter sur l'application.
create or replace function touche_maj_le() returns trigger as $$
begin new.maj_le = now(); return new; end;
$$ language plpgsql;

drop trigger if exists occupations_maj_le on occupations;
create trigger occupations_maj_le before update on occupations
  for each row execute function touche_maj_le();

-- ============================================================
-- LA SÉCURITÉ — ET C'EST LE POINT LE PLUS IMPORTANT DU FICHIER
--
-- Supabase expose AUTOMATIQUEMENT toute table via son API REST. Une table
-- créée sans RLS est donc lisible par quiconque possède la clé « anon » —
-- et cette clé est publique par conception, elle vit dans le JavaScript de
-- n'importe quel site qui l'utilise. Sans les lignes ci-dessous, le nom,
-- l'e-mail, le téléphone et les dates de séjour de tous vos clients
-- seraient interrogeables depuis un navigateur. Ce n'est pas une
-- hypothèse : c'est le comportement par défaut, et c'est l'origine de la
-- majorité des fuites Supabase publiées.
--
-- On active donc RLS et l'on ne déclare AUCUNE politique. Aucune politique
-- signifie : tout est refusé. Le site n'accède jamais à ces tables depuis
-- le navigateur ; seul le Worker les lit, avec la clé `service_role`, qui
-- contourne RLS et ne quitte jamais le serveur.
--
-- ⚠️ NE PAS créer de vue « publique » des disponibilités pour contourner
--    ceci. Une vue s'exécute avec les droits de son propriétaire et
--    traverse donc RLS sans le voir : ce serait rouvrir exactement la
--    porte qu'on ferme ici. Les disponibilités se servent par une route
--    du site, qui ne renvoie que des dates et jamais un client.
-- ============================================================
alter table occupations enable row level security;
alter table saisons     enable row level security;
alter table parametres  enable row level security;
alter table journal     enable row level security;
alter table profils     enable row level security;
alter table contenus_site enable row level security;

alter table occupations force row level security;
alter table saisons     force row level security;
alter table parametres  force row level security;
alter table journal     force row level security;
alter table profils     force row level security;
alter table contenus_site force row level security;

-- ============================================================
-- LES FONCTIONS D'ACCÈS
--
-- Le site ne compose jamais de requête sur les tables : il appelle ces
-- fonctions. Trois raisons, et la troisième est la vraie.
--
-- 1. La péremption des options doit précéder toute lecture de
--    disponibilité. Confiée à l'appelant, elle serait oubliée une fois
--    sur deux ; ici elle est dans la fonction.
--
-- 2. Poser une option est une opération ATOMIQUE — périmer, vérifier,
--    insérer. Découpée en trois requêtes depuis le Worker, elle rouvre
--    exactement la fenêtre que la contrainte d'exclusion sert à fermer.
--
-- 3. `api_disponibilites` ne peut PAS renvoyer de donnée personnelle,
--    parce qu'elle ne sait pas en lire : sa signature ne rend que deux
--    dates. Un `select` composé côté application aurait pu, un jour, se
--    voir ajouter une colonne « pour le back-office » et fuiter vers le
--    calendrier public. Ici, c'est structurellement impossible.
--
-- ⚠️ PAS de `security definer`. Ces fonctions s'exécutent avec les droits
--    de l'appelant, donc du `service_role`, qui traverse RLS de toute
--    façon. Les déclarer `definer` les rendrait appelables par la clé
--    `anon` — c'est-à-dire par n'importe qui — et l'on rouvrirait la porte
--    fermée juste au-dessus.
-- ============================================================

/* Les nuits occupées d'une fenêtre. Rien d'autre : ni nom, ni statut, ni
   origine. C'est ce que mange le calendrier du site. */
create or replace function api_disponibilites(depuis date, jusqu_a date)
returns table (debut date, fin date) as $$
begin
  perform perimer_les_options();
  return query
    select lower(o.periode), upper(o.periode)
      from occupations o
     where o.statut in ('option', 'confirme')
       and o.periode && daterange(depuis, jusqu_a, '[)')
     order by 1;
end;
$$ language plpgsql;

/* Pose une option sur des dates, ou dit précisément pourquoi elle ne peut
   pas l'être.

   Rend l'identifiant en cas de succès. En cas de conflit, lève
   `LBE_DATES_PRISES` — un code que la route traduit en message. On ne rend
   pas `null` : l'appelant devrait alors deviner s'il s'agit d'un conflit,
   d'une panne ou d'une erreur de saisie, et il devinerait mal. */
create or replace function api_poser_option(
  p_reference     text,
  p_debut         date,
  p_fin           date,
  p_voyageurs     integer,
  p_nom           text,
  p_email         text,
  p_telephone     text,
  p_message       text,
  p_total_cents   integer,
  p_acompte_cents integer
) returns uuid as $$
declare
  v_id      uuid;
  v_minutes integer;
begin
  perform perimer_les_options();
  select option_minutes into v_minutes from parametres where id = true;

  insert into occupations (
    reference, periode, origine, statut, voyageurs, nom, email, telephone,
    message, total_cents, acompte_cents, option_expire_le
  ) values (
    p_reference, daterange(p_debut, p_fin, '[)'), 'site', 'option',
    p_voyageurs, p_nom, p_email, p_telephone, p_message,
    p_total_cents, p_acompte_cents, now() + (v_minutes || ' minutes')::interval
  ) returning id into v_id;

  insert into journal (occupation, action, detail, acteur)
  values (v_id, 'option_posee',
          jsonb_build_object('debut', p_debut, 'fin', p_fin, 'total_cents', p_total_cents),
          'site');

  return v_id;
exception
  -- 23P01 : violation de contrainte d'exclusion. C'est le cas nominal du
  -- conflit, pas une anomalie : deux visiteurs ont visé les mêmes nuits.
  when exclusion_violation then
    raise exception 'LBE_DATES_PRISES' using errcode = 'P0001';
end;
$$ language plpgsql;

/* Confirme un séjour après encaissement de l'acompte.
   Appelée UNIQUEMENT par le webhook Stripe, après vérification de la
   signature.

   ⚠️ IDEMPOTENTE. Stripe rejoue ses webhooks — c'est documenté et normal :
      un accusé de réception perdu suffit. Le `where statut = 'option'`
      fait que le second passage ne trouve rien à mettre à jour et ne
      journalise rien. Sans cette clause, un rejeu ajouterait une ligne de
      journal par tentative, et le jour où l'on facturera d'après le
      journal, on facturerait deux fois. */
create or replace function api_confirmer(p_occupation uuid, p_intent text)
returns boolean as $$
declare v_touche integer;
begin
  update occupations
     set statut = 'confirme',
         stripe_payment_intent = p_intent,
         option_expire_le = null
   where id = p_occupation
     and statut = 'option';
  get diagnostics v_touche = row_count;

  if v_touche > 0 then
    insert into journal (occupation, action, detail, acteur)
    values (p_occupation, 'acompte_encaisse',
            jsonb_build_object('payment_intent', p_intent), 'stripe');
  end if;

  return v_touche > 0;
end;
$$ language plpgsql;

/* Les occupations à exporter en iCal. Comme au-dessus : deux dates et un
   identifiant, rien qui désigne une personne. */
create or replace function api_importer_ical(
  p_debut date,
  p_fin date,
  p_uid_externe text
) returns uuid as $$
declare v_id uuid;
begin
  -- Ignorer silencieusement si ce UID existe déjà (import idempotent)
  select id into v_id from occupations
   where uid_externe = p_uid_externe;
  if v_id is not null then
    return v_id;
  end if;

  -- Insérer l'occupation comme confirme/airbnb (le bloc est établi)
  insert into occupations (periode, origine, statut, uid_externe)
    values (daterange(p_debut, p_fin), 'airbnb', 'confirme', p_uid_externe)
    returning id into v_id;

  return v_id;
end;
$$ language plpgsql;

create or replace function api_export_ical()
returns table (id uuid, debut date, fin date) as $$
begin
  perform perimer_les_options();
  return query
    select o.id, lower(o.periode), upper(o.periode)
      from occupations o
     where o.statut in ('option', 'confirme')
       and upper(o.periode) >= current_date
     order by 2;
end;
$$ language plpgsql;

-- Ces fonctions ne sont jamais appelées depuis un navigateur. On retire
-- explicitement le droit aux rôles publics de Supabase, plutôt que de
-- compter sur le fait que personne n'essaiera.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on function api_disponibilites(date, date) from anon, authenticated';
    execute 'revoke all on function api_poser_option(text,date,date,integer,text,text,text,text,integer,integer) from anon, authenticated';
    execute 'revoke all on function api_importer_ical(date, date, text) from anon, authenticated';
    execute 'revoke all on function api_export_ical() from anon, authenticated';
  end if;
end $$;
