/* ============================================================
   Le calendrier de réservation — côté visiteur.

   Il ne décide RIEN. Il propose des dates, montre un prix, et transmet ;
   la disponibilité et le montant sont établis par le serveur, à chaque
   fois. Une page peut être modifiée, une base ne peut pas l'être : tout ce
   qui est calculé ici l'est pour l'œil, jamais pour la caisse.

   ⚠️ LE JOUR DE ROTATION EST LA RÈGLE QUI GOUVERNE TOUT L'AFFICHAGE.
      Un séjour du 10 au 14 occupe les nuits 10, 11, 12 et 13 — pas le 14.
      Le 14 reste donc un jour d'ARRIVÉE possible. Et symétriquement, on
      peut PARTIR le jour où le suivant arrive : on libère le matin, il
      entre l'après-midi. Un calendrier qui colorie « du 10 au 14 » refuse
      les deux, et fait perdre une semaine à chaque rotation d'été.
   ============================================================ */
import {
  ajoute, estUnJour, nuitsOccupees, departMaximum, nombreDeNuits,
  type Jour, type Periode,
} from '../lib/reservation';

const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet',
  'août', 'septembre', 'octobre', 'novembre', 'décembre'];
/* Lundi d'abord : c'est la semaine française. Un calendrier qui commence
   le dimanche fait compter les week-ends de travers. */
const JOURS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

const euros = new Intl.NumberFormat('fr-FR', {
  style: 'currency', currency: 'EUR', maximumFractionDigits: 0,
});
const eurosPrecis = new Intl.NumberFormat('fr-FR', {
  style: 'currency', currency: 'EUR', minimumFractionDigits: 2,
});

const aujourdhui = (): Jour => new Date().toISOString().slice(0, 10);
const jourDe = (j: Jour) => new Date(`${j}T00:00:00Z`);

/** L'index du jour dans la semaine, lundi = 0. */
const indexSemaine = (j: Jour) => (jourDe(j).getUTCDay() + 6) % 7;

const enLettres = (j: Jour) =>
  `${parseInt(j.slice(8), 10)} ${MOIS[parseInt(j.slice(5, 7), 10) - 1]} ${j.slice(0, 4)}`;

interface Etat {
  mois: Jour;            // le 1er du premier mois affiché
  arrivee: Jour | null;
  depart: Jour | null;
  survol: Jour | null;
  voyageurs: number;
  occupees: Periode[];
  prises: Set<Jour>;
  charge: boolean;
  panne: string | null;
}

export function initReserver(): () => void {
  const hote = document.querySelector<HTMLElement>('[data-reserver]');
  if (!hote) return () => {};

  const grilles = hote.querySelector<HTMLElement>('[data-cal-mois]')!;
  const titre = hote.querySelector<HTMLElement>('[data-cal-titre]')!;
  const prec = hote.querySelector<HTMLButtonElement>('[data-cal-prec]')!;
  const suiv = hote.querySelector<HTMLButtonElement>('[data-cal-suiv]')!;
  const champVoyageurs = hote.querySelector<HTMLSelectElement>('[data-voyageurs]')!;
  const panneau = hote.querySelector<HTMLElement>('[data-devis]')!;
  const resume = hote.querySelector<HTMLElement>('[data-resume]')!;
  const raz = hote.querySelector<HTMLButtonElement>('[data-raz]')!;

  /* Le préavis vient du serveur avec le devis ; avant le premier appel on
     retient simplement le jour même. Le serveur reste l'autorité : s'il
     refuse une arrivée trop proche, il le dit, et son message s'affiche. */
  const e: Etat = {
    mois: aujourdhui().slice(0, 8) + '01',
    arrivee: null, depart: null, survol: null,
    voyageurs: parseInt(champVoyageurs.value, 10) || 2,
    occupees: [], prises: new Set(), charge: false, panne: null,
  };

  const moisSuivant = (m: Jour, n: number) => {
    const d = jourDe(m);
    d.setUTCMonth(d.getUTCMonth() + n);
    return d.toISOString().slice(0, 10).slice(0, 8) + '01';
  };

  /* ---------- Les disponibilités ---------- */
  async function chargerDispos() {
    const depuis = aujourdhui();
    const jusqu_a = ajoute(depuis, 540);
    try {
      const r = await fetch(`/api/disponibilites?depuis=${depuis}&jusqu_a=${jusqu_a}`);
      const c = await r.json();
      if (!r.ok) throw new Error(c?.erreur || 'indisponible');
      e.occupees = c.occupees ?? [];
      e.prises = nuitsOccupees(e.occupees);
      e.charge = true;
      e.panne = null;
    } catch (err) {
      /* ⚠️ ON NE MONTRE PAS UN CALENDRIER VIDE. Sans disponibilités, tout
         paraîtrait libre, et le visiteur composerait un séjour sur des
         nuits peut-être vendues avant d'être refusé à la validation. On
         préfère dire que le calendrier est en panne et laisser Airbnb
         prendre le relais. */
      e.panne = err instanceof Error ? err.message : 'indisponible';
      e.charge = true;
    }
    peindre();
  }

  /* ---------- L'état d'un jour ---------- */
  type Etiquette = 'passe' | 'occupe' | 'libre' | 'hors-portee';

  function etiquette(j: Jour): Etiquette {
    if (j < aujourdhui()) return 'passe';
    if (e.prises.has(j)) {
      /* Une nuit occupée reste un DÉPART possible quand on a déjà une
         arrivée : on part le matin, l'autre entre l'après-midi. C'est le
         seul cas où un jour « pris » demeure cliquable. */
      if (e.arrivee && !e.depart && j > e.arrivee) {
        const max = departMaximum(e.arrivee, e.occupees);
        if (max && j === max) return 'libre';
      }
      return 'occupe';
    }
    if (e.arrivee && !e.depart) {
      if (j <= e.arrivee) return 'hors-portee';
      const max = departMaximum(e.arrivee, e.occupees);
      if (max && j > max) return 'hors-portee';
    }
    return 'libre';
  }

  const dansSejour = (j: Jour) => {
    const fin = e.depart ?? (e.arrivee && e.survol && e.survol > e.arrivee ? e.survol : null);
    return !!(e.arrivee && fin && j > e.arrivee && j < fin);
  };

  /* ---------- Peinture ---------- */
  function peindre() {
    titre.textContent = `${MOIS[parseInt(e.mois.slice(5, 7), 10) - 1]} ${e.mois.slice(0, 4)}`;
    prec.disabled = e.mois <= aujourdhui().slice(0, 8) + '01';

    grilles.innerHTML = '';
    if (e.panne) {
      grilles.innerHTML =
        '<p class="res-panne">Le calendrier est momentanément indisponible. ' +
        'Les dates restent réservables sur Airbnb, ou par le formulaire de contact.</p>';
      majResume();
      return;
    }
    if (!e.charge) {
      grilles.innerHTML = '<p class="res-panne">Chargement du calendrier…</p>';
      return;
    }

    // Deux mois côte à côte : on choisit rarement un séjour sans regarder
    // le mois suivant, et faire défiler pour cela casse la comparaison.
    for (const m of [e.mois, moisSuivant(e.mois, 1)]) grilles.appendChild(peindreMois(m));
    majResume();
  }

  function peindreMois(mois: Jour): HTMLElement {
    const bloc = document.createElement('div');
    bloc.className = 'res-mois';

    const legende = document.createElement('p');
    legende.className = 'res-mois__nom';
    legende.textContent = `${MOIS[parseInt(mois.slice(5, 7), 10) - 1]} ${mois.slice(0, 4)}`;
    bloc.appendChild(legende);

    const grille = document.createElement('div');
    grille.className = 'res-grille';
    grille.setAttribute('role', 'grid');

    for (const [i, l] of JOURS.entries()) {
      const c = document.createElement('span');
      c.className = 'res-jour-nom';
      c.setAttribute('aria-hidden', 'true');
      c.textContent = l;
      c.dataset.i = String(i);
      grille.appendChild(c);
    }

    // Les cases vides d'avant le 1er : le mois doit tomber sur le bon jour.
    for (let i = 0; i < indexSemaine(mois); i++) {
      const v = document.createElement('span');
      v.className = 'res-vide';
      grille.appendChild(v);
    }

    const finMois = moisSuivant(mois, 1);
    for (let j = mois; j < finMois; j = ajoute(j, 1)) {
      const et = etiquette(j);
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'res-jour';
      b.dataset.jour = j;
      b.textContent = String(parseInt(j.slice(8), 10));
      b.disabled = et !== 'libre';
      b.dataset.etat = et;

      if (j === e.arrivee) b.dataset.borne = 'arrivee';
      if (j === e.depart) b.dataset.borne = 'depart';
      if (dansSejour(j)) b.dataset.entre = '';

      const quoi = j === e.arrivee ? 'Arrivée le ' : j === e.depart ? 'Départ le ' : '';
      b.setAttribute('aria-label',
        et === 'occupe' ? `${enLettres(j)} — déjà réservé` : `${quoi || ''}${enLettres(j)}`);
      if (j === e.arrivee || j === e.depart) b.setAttribute('aria-pressed', 'true');

      grille.appendChild(b);
    }

    bloc.appendChild(grille);
    return bloc;
  }

  /* ---------- Le devis ---------- */
  let jeton = 0;

  async function majResume() {
    raz.hidden = !e.arrivee;

    if (!e.arrivee) {
      resume.textContent = 'Choisissez une date d’arrivée.';
      panneau.innerHTML = '';
      return;
    }
    if (!e.depart) {
      resume.textContent = `Arrivée le ${enLettres(e.arrivee)} — choisissez la date de départ.`;
      panneau.innerHTML = '';
      return;
    }

    const n = nombreDeNuits({ debut: e.arrivee, fin: e.depart });
    resume.textContent =
      `Du ${enLettres(e.arrivee)} au ${enLettres(e.depart)} — ${n} nuit${n > 1 ? 's' : ''}.`;

    panneau.innerHTML = '<p class="res-attente">Calcul du prix…</p>';

    /* Un jeton par appel : deux clics rapprochés lancent deux requêtes, et
       rien ne garantit qu'elles reviennent dans l'ordre. Sans ce garde, la
       réponse la plus lente écraserait la plus récente, et l'on afficherait
       le prix d'un séjour qui n'est plus sélectionné. */
    const mien = ++jeton;

    try {
      const r = await fetch('/api/devis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ debut: e.arrivee, fin: e.depart, voyageurs: e.voyageurs }),
      });
      const c = await r.json();
      if (mien !== jeton) return;

      if (!r.ok) { panneau.innerHTML = `<p class="res-refus">${texte(c?.erreur)}</p>`; return; }
      if (!c.possible) { panneau.innerHTML = `<p class="res-refus">${texte(c.message)}</p>`; return; }

      panneau.innerHTML = rendreDevis(c.devis, c.tarifsProvisoires);
    } catch {
      if (mien !== jeton) return;
      panneau.innerHTML =
        '<p class="res-refus">Le calcul est momentanément indisponible. Écrivez-nous, nous vous répondons sous 24 heures.</p>';
    }
  }

  /* Le contenu vient du serveur, mais il traverse `innerHTML` : on
     échappe. Un message d'erreur n'a aucune raison de porter du balisage,
     et l'oublier ici serait la porte d'entrée classique. */
  const texte = (s: unknown) =>
    String(s ?? 'Indisponible.').replace(/[&<>"]/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

  function rendreDevis(d: any, provisoires: boolean): string {
    const lignes = (d.lignes ?? []).map((l: any) =>
      `<div class="res-ligne"><span>${texte(l.saison)} · ${l.nuits} nuit${l.nuits > 1 ? 's' : ''} × ${euros.format(l.prixNuit)}</span><span class="num">${euros.format(l.total)}</span></div>`).join('');

    return `
      ${provisoires ? '<p class="res-provisoire">Tarifs en cours de mise à jour — ce montant est indicatif et n’engage pas la réservation.</p>' : ''}
      <div class="res-detail">
        ${lignes}
        <div class="res-ligne"><span>Ménage</span><span class="num">${euros.format(d.menage)}</span></div>
        <div class="res-ligne"><span>Taxe de séjour</span><span class="num">${euros.format(d.taxeSejour)}</span></div>
      </div>
      <div class="res-total">
        <span>Total</span><span class="num">${eurosPrecis.format(d.total)}</span>
      </div>
      <div class="res-acompte">
        <span>Acompte à la réservation</span><span class="num">${eurosPrecis.format(d.acompte)}</span>
      </div>
      <p class="res-solde">Solde de ${eurosPrecis.format(d.solde)} à régler avant l’arrivée.</p>`;
  }

  /* ---------- Les gestes ---------- */
  function choisir(j: Jour) {
    if (etiquette(j) !== 'libre') return;

    // Ni arrivée, ou séjour déjà complet : on repart d'une arrivée.
    if (!e.arrivee || e.depart) { e.arrivee = j; e.depart = null; }
    // Un clic avant l'arrivée déplace l'arrivée plutôt que de ne rien
    // faire : c'est ce que le geste veut dire, et refuser obligerait à
    // remettre à zéro pour avancer d'un jour.
    else if (j <= e.arrivee) { e.arrivee = j; }
    else { e.depart = j; }

    e.survol = null;
    peindre();
  }

  const surClic = (ev: Event) => {
    const b = (ev.target as HTMLElement).closest<HTMLElement>('[data-jour]');
    if (b && !(b as HTMLButtonElement).disabled) choisir(b.dataset.jour as Jour);
  };
  const surSurvol = (ev: Event) => {
    if (!e.arrivee || e.depart) return;
    const b = (ev.target as HTMLElement).closest<HTMLElement>('[data-jour]');
    const j = (b?.dataset.jour ?? null) as Jour | null;
    if (j !== e.survol) { e.survol = j; peindre(); }
  };
  const surSortie = () => { if (e.survol) { e.survol = null; peindre(); } };
  const surPrec = () => { e.mois = moisSuivant(e.mois, -1); peindre(); };
  const surSuiv = () => { e.mois = moisSuivant(e.mois, 1); peindre(); };
  const surVoyageurs = () => {
    e.voyageurs = parseInt(champVoyageurs.value, 10) || 2;
    majResume();
  };
  const surRaz = () => { e.arrivee = e.depart = e.survol = null; peindre(); };

  grilles.addEventListener('click', surClic);
  grilles.addEventListener('mouseover', surSurvol);
  grilles.addEventListener('mouseleave', surSortie);
  prec.addEventListener('click', surPrec);
  suiv.addEventListener('click', surSuiv);
  champVoyageurs.addEventListener('change', surVoyageurs);
  raz.addEventListener('click', surRaz);

  peindre();
  chargerDispos();

  return () => {
    jeton++; // toute réponse en vol devient caduque
    grilles.removeEventListener('click', surClic);
    grilles.removeEventListener('mouseover', surSurvol);
    grilles.removeEventListener('mouseleave', surSortie);
    prec.removeEventListener('click', surPrec);
    suiv.removeEventListener('click', surSuiv);
    champVoyageurs.removeEventListener('change', surVoyageurs);
    raz.removeEventListener('click', surRaz);
  };
}
