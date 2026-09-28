import { nombreDeNuits, nuits, chevauche, estLibre, fusionne, dansLaSaison,
         saisonDe, devis, estUnRefus, estUnJour, ajoute,
         nuitsOccupees, departMaximum } from '../src/lib/reservation.ts';

let ko = 0;
const ok = (nom: string, cond: boolean, detail = '') => {
  if (!cond) ko++;
  console.log((cond ? 'ok  ' : 'ÉCHEC ') + nom + (detail ? '  → ' + detail : ''));
};

const SAISONS = [
  { nom: 'Fêtes',   debut: '12-20', fin: '01-05', nuit: 900, minimum: 7 },
  { nom: 'Haute',   debut: '07-01', fin: '08-31', nuit: 850, minimum: 7 },
  { nom: 'Moyenne', debut: '05-01', fin: '06-30', nuit: 550, minimum: 4 },
  { nom: 'Moyenne2',debut: '09-01', fin: '10-15', nuit: 550, minimum: 4 },
  { nom: 'Basse',   debut: '10-16', fin: '04-30', nuit: 380, minimum: 3 },
];
const FRAIS = { menage: 350, taxeParPersonneParNuit: 2.3, acompte: 0.3 };

console.log('--- PIÈGE 1 : le jour du départ n’est pas une nuit ---');
ok('10→14 fait 4 nuits', nombreDeNuits({debut:'2026-07-10',fin:'2026-07-14'}) === 4);
ok('les nuits sont 10,11,12,13', nuits({debut:'2026-07-10',fin:'2026-07-14'}).join()==='2026-07-10,2026-07-11,2026-07-12,2026-07-13');
ok('un départ le 14 et une arrivée le 14 ne se chevauchent pas',
   !chevauche({debut:'2026-07-10',fin:'2026-07-14'},{debut:'2026-07-14',fin:'2026-07-18'}));
ok('un chevauchement réel est détecté',
   chevauche({debut:'2026-07-10',fin:'2026-07-14'},{debut:'2026-07-13',fin:'2026-07-18'}));
ok('englobement détecté',
   chevauche({debut:'2026-07-10',fin:'2026-07-20'},{debut:'2026-07-12',fin:'2026-07-14'}));
ok('libre juste après un séjour',
   estLibre({debut:'2026-07-14',fin:'2026-07-20'},[{debut:'2026-07-10',fin:'2026-07-14'}]));

console.log('\n--- PIÈGE 2 : jours de calendrier, pas d’instants ---');
ok('passage à l’heure d’été sans décalage', ajoute('2026-03-28',1) === '2026-03-29');
ok('fin de mois', ajoute('2026-02-28',1) === '2026-03-01');
ok('année bissextile 2028', ajoute('2028-02-28',1) === '2028-02-29');
ok('31 février refusé', !estUnJour('2026-02-31'));
ok('date bien formée acceptée', estUnJour('2026-07-14'));
ok('période inversée = 0 nuit, jamais négatif', nombreDeNuits({debut:'2026-07-14',fin:'2026-07-10'}) === 0);

console.log('\n--- PIÈGE 3 : tarification nuit par nuit ---');
const across = devis({debut:'2026-06-28',fin:'2026-07-05'}, 8, SAISONS, FRAIS);
if (estUnRefus(across)) { ok('séjour à cheval calculé', false, JSON.stringify(across)); }
else {
  ok('7 nuits', across.nuits === 7);
  ok('deux lignes de saison', across.lignes.length === 2, JSON.stringify(across.lignes));
  const m = across.lignes.find(l=>l.saison==='Moyenne'), h = across.lignes.find(l=>l.saison==='Haute');
  ok('3 nuits en moyenne (28,29,30 juin)', m?.nuits === 3, JSON.stringify(m));
  ok('4 nuits en haute (1..4 juil)', h?.nuits === 4, JSON.stringify(h));
  ok('hébergement = 3×550 + 4×850 = 5050', across.hebergement === 5050, String(across.hebergement));
  ok('taxe = 8 pers × 7 nuits × 2,30 = 128,80', across.taxeSejour === 128.8, String(across.taxeSejour));
  ok('total = 5050 + 350 + 128,80', across.total === 5528.8, String(across.total));
  ok('acompte + solde = total', +(across.acompte + across.solde).toFixed(2) === across.total,
     `${across.acompte} + ${across.solde}`);
}

console.log('\n--- Saison à cheval sur le Nouvel An ---');
ok('26 décembre est dans les Fêtes', dansLaSaison('2026-12-26', SAISONS[0]));
ok('2 janvier est dans les Fêtes', dansLaSaison('2027-01-02', SAISONS[0]));
ok('15 février n’est pas dans les Fêtes', !dansLaSaison('2027-02-15', SAISONS[0]));
ok('le 1er janvier est tarifé Fêtes et non Basse', saisonDe('2027-01-01', SAISONS)?.nom === 'Fêtes',
   saisonDe('2027-01-01', SAISONS)?.nom);

console.log('\n--- Fusion des blocs importés ---');
const f = fusionne([
  {debut:'2026-07-14',fin:'2026-07-20'},
  {debut:'2026-07-10',fin:'2026-07-14'},
  {debut:'2026-08-01',fin:'2026-08-05'},
]);
ok('deux séjours collés fusionnent en un', f.length === 2, JSON.stringify(f));
ok('le bloc fusionné va du 10 au 20', f[0].debut==='2026-07-10' && f[0].fin==='2026-07-20', JSON.stringify(f[0]));

console.log('\n--- Le calendrier : jour de rotation ---');
const OCC = [{debut:'2026-07-10',fin:'2026-07-14'},{debut:'2026-07-20',fin:'2026-07-27'}];
const prises = nuitsOccupees(OCC);
ok('la nuit du 10 est prise', prises.has('2026-07-10'));
ok('la nuit du 13 est prise', prises.has('2026-07-13'));
ok('le 14 n’est PAS pris — c’est un jour d’arrivée possible', !prises.has('2026-07-14'),
   'sinon on refuse un enchaînement, donc une semaine en haute saison');
ok('le 9 est libre', !prises.has('2026-07-09'));
ok('quatre nuits pour le premier séjour, sept pour le second', prises.size === 11, String(prises.size));

ok('arrivé le 14, on peut partir au plus tard le 20 (jour d’arrivée du suivant)',
   departMaximum('2026-07-14', OCC) === '2026-07-20', String(departMaximum('2026-07-14', OCC)));
ok('arrivé le 27, plus rien ne borne', departMaximum('2026-07-27', OCC) === null);
ok('arrivé le 14, un départ le 20 est bien libre',
   estLibre({debut:'2026-07-14',fin:'2026-07-20'}, OCC));
ok('arrivé le 14, un départ le 21 empiète',
   !estLibre({debut:'2026-07-14',fin:'2026-07-21'}, OCC));

console.log('\n--- Refus typés ---');
const court = devis({debut:'2026-07-10',fin:'2026-07-13'}, 4, SAISONS, FRAIS);
ok('3 nuits en haute saison refusées', estUnRefus(court) && court.motif==='trop-court', JSON.stringify(court));
ok('le refus dit le minimum exigé', estUnRefus(court) && (court as any).exige === 7);
const vide = devis({debut:'2026-07-10',fin:'2026-07-10'}, 4, SAISONS, FRAIS);
ok('période vide refusée', estUnRefus(vide) && vide.motif==='periode-vide');
const horsSaison = devis({debut:'2026-07-10',fin:'2026-07-20'}, 4, [SAISONS[2]], FRAIS);
ok('jour hors calendrier tarifaire refusé', estUnRefus(horsSaison) && horsSaison.motif==='hors-saison');

/* ------------------------------------------------------------
   La grille provisoire de `supabase/seed-provisoire.sql`, dans l'ordre de
   priorité où le serveur doit la charger (`order by priorite`).

   ⚠️ Les montants sont PROVISOIRES — voir l'en-tête du fichier SQL. Ce
   qu'on éprouve ici n'est pas leur valeur mais le MÉCANISME : une saison
   étroite et chère doit recouvrir une saison large et moins chère. Si ce
   recouvrement ne joue pas, la quinzaine du 15 août — la plus demandée de
   l'année — part au tarif de juillet, et personne ne s'en aperçoit avant
   de lire ses relevés.
   ------------------------------------------------------------ */
const GRILLE = [
  { nom: 'Fêtes',          debut: '12-20', fin: '01-05', nuit: 1100, minimum: 7 },
  { nom: 'Août',           debut: '08-01', fin: '08-20', nuit: 1380, minimum: 7 },
  { nom: 'Haute saison',   debut: '07-01', fin: '08-31', nuit: 1200, minimum: 7 },
  { nom: 'Moyenne saison', debut: '05-01', fin: '06-30', nuit:  750, minimum: 4 },
  { nom: 'Arrière-saison', debut: '09-01', fin: '10-15', nuit:  750, minimum: 4 },
  { nom: 'Basse saison',   debut: '10-16', fin: '04-30', nuit:  480, minimum: 3 },
];
const F2 = { menage: 450, taxeParPersonneParNuit: 3.3, acompte: 0.3 };

console.log('\n--- La grille provisoire : le recouvrement de saisons ---');
ok('le 10 août prend le tarif Août, pas Haute saison',
   saisonDe('2026-08-10', GRILLE)?.nom === 'Août', saisonDe('2026-08-10', GRILLE)?.nom);
ok('le 25 août retombe sur Haute saison',
   saisonDe('2026-08-25', GRILLE)?.nom === 'Haute saison', saisonDe('2026-08-25', GRILLE)?.nom);
ok('le 15 juillet est en Haute saison',
   saisonDe('2026-07-15', GRILLE)?.nom === 'Haute saison');
ok('le 2 janvier est en Fêtes, pas en Basse saison',
   saisonDe('2027-01-02', GRILLE)?.nom === 'Fêtes', saisonDe('2027-01-02', GRILLE)?.nom);
ok('le 15 novembre est en Basse saison',
   saisonDe('2026-11-15', GRILLE)?.nom === 'Basse saison');

console.log('\n--- Un séjour à cheval sur le recouvrement ---');
/* 18 → 25 août, sept nuits : 18, 19, 20, 21, 22, 23, 24.
   ⚠️ Les bornes d'une saison sont INCLUSES : « Août » va du 01 au 20 au
   soir, la nuit du 20 lui appartient donc. Trois nuits en Août (18, 19,
   20), quatre en Haute saison (21 à 24). Ce test a d'abord été écrit avec
   deux et cinq — l'erreur était dans l'attente, pas dans le calcul, et
   c'est précisément le genre de décalage d'un jour qu'on ne voit qu'en
   comptant à la main. */
const aout = devis({debut:'2026-08-18',fin:'2026-08-25'}, 10, GRILLE, F2);
if (estUnRefus(aout)) { ok('devis du 18 au 25 août', false, JSON.stringify(aout)); }
else {
  ok('7 nuits', aout.nuits === 7);
  ok('deux lignes : Août puis Haute saison', aout.lignes.length === 2, JSON.stringify(aout.lignes.map(l=>l.saison+':'+l.nuits)));
  ok('3 nuits au tarif Août (18, 19, 20 — borne incluse)',
     aout.lignes.find(l=>l.saison==='Août')?.nuits === 3);
  ok('4 nuits au tarif Haute saison (21 à 24)',
     aout.lignes.find(l=>l.saison==='Haute saison')?.nuits === 4);
  ok('hébergement = 3×1380 + 4×1200 = 8940', aout.hebergement === 8940, String(aout.hebergement));
  ok('taxe = 10 pers × 7 nuits × 3,30 = 231', aout.taxeSejour === 231, String(aout.taxeSejour));
  ok('total = 8940 + 450 + 231 = 9621', aout.total === 9621, String(aout.total));
  ok('acompte 30 % = 2886,30', aout.acompte === 2886.3, String(aout.acompte));
  ok('acompte + solde = total au centime',
     +(aout.acompte + aout.solde).toFixed(2) === aout.total, `${aout.acompte} + ${aout.solde}`);
}

console.log(ko ? `\n${ko} ÉCHEC(S)` : '\nTOUT PASSE');
process.exit(ko?1:0);
