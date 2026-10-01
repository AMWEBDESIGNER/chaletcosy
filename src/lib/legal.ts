/* ============================================================
   Informations légales — source unique.

   Chalet Cosy est une location saisonnière meublée, non une
   agence immobilière : les mentions de la loi Hoguet (carte
   professionnelle, garantie financière) ne s'appliquent pas ici.
   Ce qui s'applique : l'identification de l'éditeur du site
   (LCEN, art. 6-III), le numéro d'enregistrement du meublé de
   tourisme lorsque la commune l'impose, et l'information du
   consommateur sur la médiation (art. L.612-1).

   ⚠️ À COMPLÉTER AVANT MISE EN PRODUCTION : les valeurs marquées
   « 000 » sont des réservations de place, pas des données réelles.
   ============================================================ */

export const AGENCY = {
  name: 'Chalet Cosy',
  legalForm: 'Loueur en meublé non professionnel',
  capital: '—',
  siret: '000 000 000 00000',
  vat: 'Non assujettie',

  /* L'adresse du chalet n'est pas publiée : elle est communiquée
     au voyageur une fois la réservation confirmée. Ce champ porte
     l'adresse administrative de l'éditeur du site. */
  address: 'Adresse à compléter',
  postalCode: '04000',
  city: 'Digne-les-Bains',
  country: 'France',

  phone: '+33 4 92 00 00 00',
  phoneHref: 'tel:+33492000000',
  email: 'dvs240@yahoo.fr',
  director: 'À compléter',

  /** Numéro d'enregistrement du meublé de tourisme (mairie de Digne-les-Bains). */
  registration: {
    number: '000000000000',
    issuer: 'Mairie de Digne-les-Bains',
  },

  /** Médiation de la consommation — obligatoire (art. L.612-1). */
  mediator: {
    name: 'À désigner',
    url: 'https://www.economie.gouv.fr/mediation-conso',
    address: '—',
  },

  hosting: {
    name: 'Cloudflare, Inc.',
    address: '101 Townsend St, San Francisco, CA 94107, États-Unis',
    url: 'https://www.cloudflare.com',
  },

  /** Conception et réalisation du site. */
  agencyWeb: {
    name: 'AMWEBDESIGNER',
    address: '9 rue du Canada, 13010 Marseille',
  },
} as const;

export const fullAddress = () =>
  `${AGENCY.postalCode} ${AGENCY.city}`;
