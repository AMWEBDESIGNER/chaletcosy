/* ============================================================
   Le tunnel de paiement Stripe — côté client.

   Ce script gère l'ouverture de la modale de paiement, la soumission
   des coordonnées du visiteur, et le paiement de l'acompte via Stripe.

   ⚠️ JAMAIS DE VALIDATION CLIENT SUR LES PRIX. Les montants sont
   établis par le serveur ; le client n'en décide pas.
   ============================================================ */

export function initPaiement() {
  const modale = document.querySelector<HTMLDialogElement>('#paiement');
  const btnReserver = document.querySelector<HTMLButtonElement>('[data-reserver-btn]');
  const btnFerme = modale?.querySelector<HTMLButtonElement>('.fp-ferme');
  const formCoordonnees = modale?.querySelector<HTMLFormElement>('[data-fp-form]');
  const formPaiement = modale?.querySelector<HTMLFormElement>('[data-fp-paiement]');
  const reserver = document.querySelector('[data-reserver]');

  if (!modale || !btnReserver || !formCoordonnees || !formPaiement || !reserver) return () => {};

  type EtatPaiement = {
    arrivee: string | null;
    depart: string | null;
    voyageurs: number;
    total: number;
    acompte: number;
    clientSecret: string | null;
  };

  const etat: EtatPaiement = {
    arrivee: null, depart: null, voyageurs: 2,
    total: 0, acompte: 0, clientSecret: null,
  };

  const euros = new Intl.NumberFormat('fr-FR', {
    style: 'currency', currency: 'EUR', minimumFractionDigits: 2,
  });

  /* ---------- Mise à jour des infos de réservation ---------- */
  function mettreAJourInfos(data: {
    arrivee: string; depart: string; voyageurs: number;
    acompte: number; total: number;
  }) {
    Object.assign(etat, data);

    const recaps = modale!.querySelectorAll('[data-fp-recap]');
    for (const recap of recaps) {
      recap.innerHTML = `
        <div class="fp-recap-ligne">
          <span>Dates</span>
          <span>${etat.arrivee} → ${etat.depart}</span>
        </div>
        <div class="fp-recap-ligne">
          <span>Voyageurs</span>
          <span>${etat.voyageurs}</span>
        </div>
        <div class="fp-recap-total">
          <span>Acompte</span>
          <span>${euros.format(etat.acompte / 100)}</span>
        </div>
      `;
    }

    const btns = modale!.querySelectorAll<HTMLButtonElement>('[data-fp-soumettre]');
    for (const btn of btns) {
      const montant = btn.querySelector('[data-montant]');
      if (montant) montant.textContent = euros.format(etat.acompte / 100);
    }
  }

  /* ---------- Ouverture de la modale ---------- */
  function ouvrirModale(infos: {
    arrivee: string; depart: string; voyageurs: number;
    acompte: number; total: number;
  }) {
    mettreAJourInfos(infos);
    modale!.showModal();
    formCoordonnees.reset();
    afficherEtape('coordonnees');
  }

  function afficherEtape(etape: 'coordonnees' | 'paiement') {
    const etapes = modale!.querySelectorAll('[data-fp-etape]');
    for (const e of etapes) {
      if (e.getAttribute('data-fp-etape') === etape) {
        e.removeAttribute('hidden');
      } else {
        e.setAttribute('hidden', '');
      }
    }
  }

  /* ---------- Clôture ---------- */
  btnFerme?.addEventListener('click', () => modale!.close());
  modale!.addEventListener('cancel', (e) => {
    e.preventDefault();
    modale!.close();
  });

  /* ---------- Soumission des coordonnées → création intention ---------- */
  formCoordonnees.addEventListener('submit', async (e) => {
    e.preventDefault();

    const nom = (formCoordonnees.elements.namedItem('nom') as HTMLInputElement)?.value;
    const email = (formCoordonnees.elements.namedItem('email') as HTMLInputElement)?.value;
    const telephone = (formCoordonnees.elements.namedItem('telephone') as HTMLInputElement)?.value || undefined;
    const message = (formCoordonnees.elements.namedItem('message') as HTMLTextAreaElement)?.value || undefined;

    if (!nom || !email) return;

    try {
      const r = await fetch('/api/option', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          debut: etat.arrivee,
          fin: etat.depart,
          voyageurs: etat.voyageurs,
          nom, email, telephone, message,
        }),
      });

      const c = await r.json();
      if (!r.ok) {
        afficherErreur(formCoordonnees, c?.erreur || 'Erreur lors de la création de la réservation.');
        return;
      }

      etat.clientSecret = c.clientSecret;
      afficherEtape('paiement');
    } catch (err) {
      afficherErreur(formCoordonnees, 'Erreur de connexion. Vérifiez votre accès internet.');
    }
  });

  /* ---------- Paiement Stripe ---------- */
  let stripe: any = null;
  let elements: any = null;
  let cardElement: any = null;

  async function initStripe() {
    if (stripe) return;

    // Charger la librairie Stripe
    return new Promise<void>((resolve) => {
      const script = document.createElement('script');
      script.src = 'https://js.stripe.com/v3/';
      script.async = true;

      script.onload = () => {
        stripe = (window as any).Stripe(
          (document.querySelector('meta[name="stripe-publishable-key"]') as HTMLMetaElement)?.content
          || 'pk_test_dummy'
        );
        elements = stripe.elements();
        cardElement = elements.create('card');
        cardElement.mount('#card-element');
        cardElement.addEventListener('change', (event: any) => {
          const errorsDisplay = document.querySelector('#card-errors');
          if (errorsDisplay) {
            errorsDisplay.textContent = event.error ? event.error.message : '';
          }
        });
        resolve();
      };

      document.head.appendChild(script);
    });
  }

  formPaiement.addEventListener('submit', async (e) => {
    e.preventDefault();

    if (!etat.clientSecret) return;

    await initStripe();

    const btn = formPaiement.querySelector<HTMLButtonElement>('[data-fp-soumettre]');
    if (!btn) return;

    btn.disabled = true;
    const texteOrig = btn.textContent || '';
    btn.textContent = 'Traitement en cours...';

    try {
      const r = await stripe.confirmCardPayment(etat.clientSecret, {
        payment_method: {
          card: cardElement,
          billing_details: {
            name: (formCoordonnees.elements.namedItem('nom') as HTMLInputElement).value,
            email: (formCoordonnees.elements.namedItem('email') as HTMLInputElement).value,
          },
        },
      });

      if (r.error) {
        afficherErreur(formPaiement, r.error.message || 'Erreur de paiement.');
        btn.disabled = false;
        btn.textContent = texteOrig;
      } else if (r.paymentIntent?.status === 'succeeded') {
        window.location.href = '/confirmation?ref=' + encodeURIComponent(
          (r.paymentIntent.metadata?.reference || 'reservation') as string
        );
      }
    } catch (err) {
      afficherErreur(formPaiement, 'Erreur de traitement. Vérifiez votre connexion.');
      btn.disabled = false;
      btn.textContent = texteOrig;
    }
  });

  /* ---------- Gestion des erreurs ---------- */
  function afficherErreur(form: HTMLFormElement, msg: string) {
    const erreur = form.querySelector('.fp-erreur');
    if (erreur) erreur.textContent = msg;
  }

  /* ---------- Liaison avec le calendrier ---------- */
  function mettreAJourBouton() {
    const devis = document.querySelector('[data-devis]');
    const arriveeEl = document.querySelector('[data-jour][data-borne="arrivee"]') as HTMLElement;
    const departEl = document.querySelector('[data-jour][data-borne="depart"]') as HTMLElement;

    if (!devis || !devis.querySelector('.res-total') || !arriveeEl || !departEl) {
      btnReserver.disabled = true;
      return;
    }

    btnReserver.disabled = false;
  }

  const observer = new MutationObserver(() => {
    mettreAJourBouton();
  });

  observer.observe(reserver, {
    subtree: true,
    childList: true,
    characterData: true,
  });

  btnReserver.addEventListener('click', () => {
    const devis = document.querySelector('[data-devis]');
    const arriveeEl = document.querySelector('[data-jour][data-borne="arrivee"]') as HTMLElement;
    const departEl = document.querySelector('[data-jour][data-borne="depart"]') as HTMLElement;

    if (!devis || !arriveeEl || !departEl) return;

    const texteTotal = devis.querySelector('.res-total')?.textContent || '';
    const texteAcompte = devis.querySelector('.res-acompte')?.textContent || '';

    const acompteMontant = extraireMontant(texteAcompte);
    const totalMontant = extraireMontant(texteTotal);

    ouvrirModale({
      arrivee: arriveeEl.dataset.jour || '',
      depart: departEl.dataset.jour || '',
      voyageurs: parseInt(
        (document.querySelector('[data-voyageurs]') as HTMLSelectElement)?.value || '2'
      ),
      acompte: acompteMontant,
      total: totalMontant,
    });
  });

  mettreAJourBouton();

  return () => {
    observer.disconnect();
    modale?.close();
  };
}

function extraireMontant(texte: string): number {
  const match = texte.match(/([0-9\s]+(?:[.,][0-9]+)?)\s*€/);
  if (!match) return 0;

  const s = match[1].replace(/\s/g, '').replace(',', '.');
  return Math.round(parseFloat(s) * 100);
}
