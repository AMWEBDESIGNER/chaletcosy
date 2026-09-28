-- ============================================================
-- Épreuve du schéma de réservation.
--
-- À jouer sur une base JETABLE, jamais sur la production : le script
-- vide `occupations` à chaque section.
--
--   createdb lbe_test
--   psql -d lbe_test -f supabase/schema.sql
--   psql -d lbe_test -f supabase/test-schema.sql
--
-- Chaque cas annonce ce qu'il attend. Un `ERROR` sous un cas marqué
-- « DOIT ÉCHOUER » est une RÉUSSITE ; l'absence d'erreur sous un tel cas
-- est une régression, et elle se paierait en double réservation.
--
-- ⚠️ `ON_ERROR_STOP` est volontairement à 0 : on veut voir tous les cas,
--    y compris après une erreur attendue.
-- ============================================================
\set ON_ERROR_STOP 0
\pset tuples_only on

-- ============================================================
\echo ''
\echo '=== A. LA FIN EXCLUSIVE — le jour du départ n est pas une nuit ==='
truncate occupations cascade;

insert into occupations (reference,periode,origine,statut,voyageurs,nom,email)
values ('A-1','[2026-07-10,2026-07-14)','site','confirme',4,'Durand','a@b.fr');

\echo '-- A-2 arrivée le 14, jour du départ du précédent : DOIT PASSER'
insert into occupations (reference,periode,origine,statut,nom,email)
values ('A-2','[2026-07-14,2026-07-18)','site','confirme','Martin','c@d.fr');

\echo '-- A-3 chevauchement d une nuit (13→17) : DOIT ÉCHOUER'
insert into occupations (reference,periode,origine,statut,nom,email)
values ('A-3','[2026-07-13,2026-07-17)','site','option','Petit','e@f.fr');

\echo '-- A-4 période englobante (9→20) : DOIT ÉCHOUER'
insert into occupations (reference,periode,origine,statut,nom,email)
values ('A-4','[2026-07-09,2026-07-20)','site','confirme','X','g@h.fr');

-- ============================================================
\echo ''
\echo '=== B. LE CONFLIT AIRBNB DOIT ÊTRE BRUYANT ==='
\echo '-- B-1 import Airbnb sur des nuits déjà vendues ici : DOIT ÉCHOUER'
insert into occupations (periode,origine,statut,uid_externe)
values ('[2026-07-12,2026-07-16)','airbnb','confirme','abnb-999');
\echo '   (la routine d import doit attraper cette erreur et alerter,'
\echo '    jamais l avaler : le conflit existe déjà dans le monde réel)'

-- ============================================================
\echo ''
\echo '=== C. CE QUI N OCCUPE PAS NE BLOQUE PAS ==='
truncate occupations cascade;
insert into occupations (reference,periode,origine,statut,nom,email)
values ('C-1','[2026-07-10,2026-07-14)','site','annule','Y','i@j.fr');
\echo '-- C-2 mêmes nuits qu un séjour ANNULÉ : DOIT PASSER'
insert into occupations (reference,periode,origine,statut,nom,email)
values ('C-2','[2026-07-10,2026-07-14)','site','confirme','Z','k@l.fr');

-- ============================================================
\echo ''
\echo '=== D. LES GARDE-FOUS DE SAISIE ==='
\echo '-- D-1 période vide (10→10) : DOIT ÉCHOUER'
insert into occupations (reference,periode,origine,statut,nom,email)
values ('D-1','[2026-09-10,2026-09-10)','site','confirme','W','m@n.fr');

\echo '-- D-2 réservation du site sans client : DOIT ÉCHOUER'
insert into occupations (reference,periode,origine,statut)
values ('D-2','[2026-10-01,2026-10-05)','site','confirme');

\echo '-- D-3 blocage manuel sans client (travaux) : DOIT PASSER'
insert into occupations (periode,origine,statut,message)
values ('[2026-11-01,2026-11-08)','manuel','confirme','Travaux');

-- ============================================================
\echo ''
\echo '=== E. LA PÉREMPTION DES OPTIONS ==='
truncate occupations cascade;
insert into occupations (reference,periode,origine,statut,nom,email,option_expire_le)
values ('E-vieux','[2026-09-01,2026-09-08)','site','option','V','v@v.fr', now() - interval '5 minutes');
insert into occupations (reference,periode,origine,statut,nom,email,option_expire_le)
values ('E-frais','[2026-09-10,2026-09-17)','site','option','F','f@f.fr', now() + interval '20 minutes');

\echo '-- E-1 une option NON périmée bloque : DOIT ÉCHOUER'
insert into occupations (reference,periode,origine,statut,nom,email)
values ('E-1','[2026-09-02,2026-09-05)','site','confirme','T','t@t.fr');

\echo '-- E-2 on périme (attendu : 1)'
select '   options périmées : ' || perimer_les_options();

\echo '-- E-3 les nuits libérées sont revendables : DOIT PASSER'
insert into occupations (reference,periode,origine,statut,nom,email)
values ('E-3','[2026-09-02,2026-09-05)','site','confirme','T','t@t.fr');

\echo '-- E-4 l option encore valide bloque toujours : DOIT ÉCHOUER'
insert into occupations (reference,periode,origine,statut,nom,email)
values ('E-4','[2026-09-11,2026-09-14)','site','confirme','U','u@u.fr');

-- ============================================================
\echo ''
\echo '=== F. LE TRIGGER ET LA SÉCURITÉ ==='
update occupations set message = 'test' where reference = 'E-frais';
select '   maj_le postérieur à cree_le (attendu true) : ' || (maj_le > cree_le)
  from occupations where reference = 'E-frais';

\echo '-- F-2 RLS actif partout (attendu : les quatre à true)'
select '   ' || string_agg(relname || '=' || relrowsecurity, '  ' order by relname)
  from pg_class
 where relname in ('occupations','saisons','parametres','journal');

\echo '-- F-3 aucune politique déclarée = tout est refusé à la clé anon'
select '   politiques déclarées (attendu 0) : ' || count(*) from pg_policies
 where tablename in ('occupations','saisons','parametres','journal');

-- ============================================================
-- LA CONCURRENCE ne se teste pas ici : il y faut DEUX sessions
-- simultanées. Le scénario, à jouer dans deux terminaux :
--
--   session 1 : begin;
--               insert ... '[2026-08-01,2026-08-08)' ...;
--               -- ne pas valider tout de suite
--   session 2 : begin;
--               insert ... '[2026-08-03,2026-08-10)' ...;   -- se met en attente
--   session 1 : commit;
--   session 2 : -> ERROR: conflicting key value violates exclusion constraint
--
-- C'est le seul comportement qu'une vérification applicative ne peut pas
-- offrir : entre son « ces dates sont-elles libres ? » et son « insérer »,
-- il existe toujours une fenêtre où l'autre transaction passe.
-- ============================================================
\echo ''
\echo '=== FIN — relire ci-dessus : chaque DOIT ÉCHOUER doit montrer un ERROR ==='
