-- ============================================================
-- JEU D'ESSAI — TARIFS PROVISOIRES
--
-- ⚠️ AUCUN CHIFFRE DE CE FICHIER NE VIENT DU PROPRIÉTAIRE.
--
-- Ce sont des ordres de grandeur, posés pour que l'interface se dessine
-- contre des montants réalistes : une grille tarifaire se compose
-- différemment selon qu'on y lit « 480 € » ou « 12 € », et concevoir un
-- récapitulatif sur des zéros donne une mise en page qui craque le jour
-- des vrais chiffres.
--
-- Ils sont plausibles pour un chalet de 30 m², une chambre, quatre
-- voyageurs, à Digne-les-Bains. Plausible n'est pas vrai.
--
-- ⚠️ DEUX CONDITIONS DE L'ANNONCE NE PASSENT PAS PAR CE MOTEUR :
--    - le supplément de 20 € par nuit au-delà de deux voyageurs : le
--      devis (`src/lib/reservation.ts`) ne connaît qu'un prix par nuit ;
--    - le ménage de fin de séjour, OPTIONNEL (50 €) : le moteur ne sait
--      facturer qu'un forfait obligatoire. Il est donc laissé à zéro.
--    Les deux sont affichés sur le site ; les intégrer au devis est un
--    chantier à part.
--
-- LE GARDE-FOU. Ce script lève `parametres.tarifs_provisoires`. Tant que
-- ce drapeau est levé, le tunnel de réservation refuse tout encaissement
-- réel et reste en mode test Stripe. Le drapeau ne s'abaisse qu'à la
-- main, depuis le back-office, une fois les vrais tarifs saisis.
--
-- Autrement dit : ces chiffres ne peuvent PAS partir en production par
-- oubli. C'est tout l'objet du drapeau, et c'est pourquoi il vit en base
-- plutôt qu'en commentaire.
--
--   psql -d <base> -f supabase/seed-provisoire.sql
-- ============================================================

-- ============================================================
-- LES SAISONS
--
-- L'ordre de `priorite` compte : la plus basse gagne. « Lavande » passe
-- donc devant « Été », qu'elle recouvre — la floraison est la période la
-- plus demandée de l'année en Haute-Provence.
-- ============================================================
delete from saisons;

insert into saisons (nom, debut, fin, nuit_cents, minimum, priorite) values
  ('Lavande',        '07-01', '07-31',   8500, 3, 10),
  ('Été',            '06-15', '08-31',   7500, 3, 20),
  ('Saison thermale','03-01', '06-14',   6000, 2, 30),
  ('Arrière-saison', '09-01', '11-15',   6000, 2, 30),
  -- Enjambe le Nouvel An : `debut` postérieur à `fin`, le test s'inverse.
  ('Hiver',          '11-16', '02-29',   5500, 2, 40);

-- ============================================================
-- LES PARAMÈTRES
--
-- ⚠️ LA TAXE DE SÉJOUR N'EST PAS UN CHOIX COMMERCIAL. Elle est fixée par
--    délibération de la commune de Digne-les-Bains et varie selon le
--    classement du meublé. Les 1,00 € ci-dessous sont un ordre de grandeur, PAS le
--    barème. Ce montant est à vérifier auprès de la mairie avant toute
--    mise en ligne : le sous-facturer se rattrape sur le loueur.
-- ============================================================
update parametres set
  menage_cents       = 0,       -- ménage optionnel (50 €), hors moteur — voir plus haut
  taxe_pppn_cents    = 100,     -- 1,00 € par personne et par nuit — À VÉRIFIER
  acompte_bps        = 3000,    -- 30 %
  option_minutes     = 30,      -- durée de validité d'une option non payée
  preavis_jours      = 2,       -- marge de sécurité face à la latence iCal d'Airbnb
  tarifs_provisoires = true     -- ⚠️ LE VERROU. Ne s'abaisse qu'à la main.
where id = true;

-- ============================================================
-- CONTRÔLE
-- ============================================================
\pset tuples_only on
select '';
select '  Saisons chargées : ' || count(*) from saisons;
select '  Verrou des tarifs provisoires : ' ||
       case when tarifs_provisoires then 'LEVÉ — aucun encaissement réel possible'
            else 'ABAISSÉ — les tarifs sont réputés réels' end
  from parametres where id = true;
select '';
