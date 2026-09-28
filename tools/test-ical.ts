import { lireICal, ecrireICal } from '../src/lib/ical.ts';
import { fusionne, nombreDeNuits } from '../src/lib/reservation.ts';

let ko = 0;
const ok = (nom: string, cond: boolean, detail = '') => {
  if (!cond) ko++;
  console.log((cond ? 'ok  ' : 'ÉCHEC ') + nom + (detail ? '  → ' + detail : ''));
};

/* Un flux tel qu'Airbnb en émet : CRLF, propriétés dans le désordre,
   et surtout un UID replié à 75 octets — le piège qui coupe les
   identifiants en deux chez les analyseurs naïfs. */
const AIRBNB = [
  'BEGIN:VCALENDAR',
  'PRODID:-//Airbnb Inc//Hosting Calendar 0.8.8//EN',
  'CALSCALE:GREGORIAN',
  'VERSION:2.0',
  'BEGIN:VEVENT',
  'DTEND;VALUE=DATE:20260714',
  'DTSTART;VALUE=DATE:20260710',
  'UID:aaaaaaaabbbbbbbbccccccccddddddddeeeeeeeeffffffff00000000111111112',
  ' 2222222@airbnb.com',
  'SUMMARY:Airbnb (Not available)',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'DTEND;VALUE=DATE:20260718',
  'DTSTART;VALUE=DATE:20260714',
  'UID:second-sejour@airbnb.com',
  'SUMMARY:Reserved',
  'END:VEVENT',
  'END:VCALENDAR',
].join('\r\n');

console.log('--- Lecture d’un flux Airbnb ---');
const evts = lireICal(AIRBNB);
ok('deux événements lus', evts.length === 2, String(evts.length));
ok('DTEND exclusif : 10→14 fait 4 nuits',
   nombreDeNuits(evts[0].periode) === 4, JSON.stringify(evts[0].periode));
ok('la période est bien [2026-07-10, 2026-07-14)',
   evts[0].periode.debut === '2026-07-10' && evts[0].periode.fin === '2026-07-14');
ok('l’UID replié est recollé en entier',
   evts[0].uid === 'aaaaaaaabbbbbbbbccccccccddddddddeeeeeeeeffffffff000000001111111122222222@airbnb.com',
   evts[0].uid);
ok('le résumé est lu', evts[0].resume === 'Airbnb (Not available)', evts[0].resume);

console.log('\n--- Les deux séjours consécutifs ne laissent pas de fausse nuit libre ---');
const f = fusionne(evts.map((e) => e.periode));
ok('10→14 et 14→18 fusionnent en un seul bloc', f.length === 1, JSON.stringify(f));
ok('le bloc va du 10 au 18', f[0].debut === '2026-07-10' && f[0].fin === '2026-07-18');

console.log('\n--- Robustesse du format ---');
ok('fins de ligne LF acceptées', lireICal(AIRBNB.replace(/\r\n/g, '\n')).length === 2);
ok('fins de ligne CR acceptées', lireICal(AIRBNB.replace(/\r\n/g, '\r')).length === 2);

const sansFin = 'BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nDTSTART;VALUE=DATE:20260801\r\nUID:x\r\nEND:VEVENT\r\nEND:VCALENDAR';
const e2 = lireICal(sansFin);
ok('DTEND absent : une nuit par défaut, l’événement n’est pas perdu',
   e2.length === 1 && nombreDeNuits(e2[0].periode) === 1, JSON.stringify(e2));

const avecDuree = 'BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nDTSTART;VALUE=DATE:20260901\r\nDURATION:P3D\r\nUID:y\r\nEND:VEVENT\r\nEND:VCALENDAR';
const e3 = lireICal(avecDuree);
ok('DURATION:P3D donne trois nuits', e3.length === 1 && nombreDeNuits(e3[0].periode) === 3,
   JSON.stringify(e3[0]?.periode));

const dateHeure = 'BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nDTSTART:20261001T140000Z\r\nDTEND:20261005T110000Z\r\nUID:z\r\nEND:VEVENT\r\nEND:VCALENDAR';
const e4 = lireICal(dateHeure);
ok('DATE-TIME ramené au jour, sans décalage de fuseau',
   e4[0]?.periode.debut === '2026-10-01' && e4[0]?.periode.fin === '2026-10-05',
   JSON.stringify(e4[0]?.periode));

ok('un événement sans DTSTART est ignoré, pas fatal',
   lireICal('BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:vide\r\nEND:VEVENT\r\nEND:VCALENDAR').length === 0);
ok('une page HTML ne produit aucun événement (l’appelant doit y voir une panne)',
   lireICal('<!doctype html><html><body>403 Forbidden</body></html>').length === 0);

console.log('\n--- Écriture ---');
const sortie = ecrireICal(
  [{ id: 'abc-123', periode: { debut: '2026-07-10', fin: '2026-07-14' } }],
  { nom: 'Chalet Cosy', domaine: 'chaletcosy.fr', maintenant: new Date('2026-06-01T10:00:00Z') },
);
ok('les lignes sont en CRLF', sortie.includes('\r\n') && !/[^\r]\n/.test(sortie));
ok('VALUE=DATE est déclaré', sortie.includes('DTSTART;VALUE=DATE:20260710'));
ok('DTEND reste exclusif', sortie.includes('DTEND;VALUE=DATE:20260714'));
ok('l’UID est stable, dérivé de l’identifiant', sortie.includes('UID:abc-123@chaletcosy.fr'));
ok('aucune donnée personnelle n’est exportée',
   !/@(?!chaletcosy)|nom|email|€/i.test(sortie.replace('UID:abc-123@chaletcosy.fr','')),
   sortie.match(/SUMMARY:[^\r]*/)?.[0]);
ok('le résumé est neutre', sortie.includes('SUMMARY:Indisponible'));

console.log('\n--- Aller-retour ---');
const relu = lireICal(sortie);
ok('ce qu’on écrit se relit à l’identique',
   relu.length === 1 && relu[0].periode.debut === '2026-07-10' && relu[0].periode.fin === '2026-07-14',
   JSON.stringify(relu[0]?.periode));
ok('et fait toujours quatre nuits', nombreDeNuits(relu[0].periode) === 4);

console.log(ko ? `\n${ko} ÉCHEC(S)` : '\nTOUT PASSE');
process.exit(ko ? 1 : 0);
