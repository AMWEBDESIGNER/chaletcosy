/* ============================================================
   Chalet Cosy — source unique des informations du chalet.

   Toutes les pages lisent d'ici : un chiffre corrigé une fois l'est
   partout. Les données proviennent de la fiche de présentation du chalet
   (« Chalet 30 m² tout confort au pied de la montagne »).

   Le fichier et l'objet `VILLA` gardent leur nom d'origine : le site
   est issu du gabarit de La Belle Étoile, et ces identifiants sont lus
   par le moteur de réservation, le back-office et les routes d'API.
   Les renommer n'apporterait rien au visiteur.

   ⚠️ Volontairement absents de ce fichier : l'adresse exacte du chalet
   et le nom des personnes. Une location saisonnière ne publie pas sa
   rue — elle est communiquée à la réservation.
   ============================================================ */

export const VILLA = {
  name: 'Chalet Cosy',
  tagline: 'Chalet tout confort au pied de la montagne',
  city: 'Digne-les-Bains',
  postalCode: '04000',
  department: 'Alpes-de-Haute-Provence',
  region: 'Provence-Alpes-Côte d’Azur',
  country: 'France',

  /* Position approximative — celle que publie l'annonce. Elle sert à
     centrer la carte sur le quartier, jamais à pointer la maison. */
  lat: 44.1176,
  lng: 6.2344,

  /** Surface et capacité. */
  surface: 30,
  guests: 4,
  bedrooms: 1,
  /** Un lit double dans la chambre, un canapé convertible au salon. */
  beds: 2,
  bathrooms: 1,
  /** Tout est de plain-pied : aucune marche à l'intérieur. */
  levels: 1,
  /** Places de stationnement privées, dans l'allée. */
  parking: 2,

  /** Suppléments annoncés par le propriétaire. */
  extraGuestFrom: 2,
  extraGuestFee: 20,
  cleaningFee: 50,

  /** Note publique et nombre d'avis — l'annonce est récente. */
  rating: '5,0',
  reviews: 2,

  checkIn: '15:00 – 17:00',
  checkOut: 'avant 11:00',

} as const;

/**
 * Cadre de carte centré sur le quartier, jamais sur la maison.
 * `dLng`/`dLat` s'expriment en degrés : au défaut, la vue embrasse
 * Digne, la vallée de la Bléone et les premiers reliefs. Les bornes
 * sont arrondies pour éviter les `6.294399999999` dans l'URL.
 */
export function mapBbox(dLng = 0.06, dLat = 0.035) {
  const r = (n: number) => n.toFixed(5);
  return [
    r(VILLA.lng - dLng), r(VILLA.lat - dLat),
    r(VILLA.lng + dLng), r(VILLA.lat + dLat),
  ].join(',');
}

export const mapUrl = (dLng?: number, dLat?: number) =>
  `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(mapBbox(dLng, dLat))}&layer=mapnik`;

/* ------------------------------------------------------------
   Les espaces, dans l'ordre où on les traverse : on entre dans la
   pièce à vivre, on passe au coin nuit, on ressort sur la terrasse.
   Le chalet est de plain-pied — ce ne sont pas des étages mais trois
   temps d'une même visite. (Le nom `LEVELS` est celui du gabarit.)
   ------------------------------------------------------------ */
export interface Level {
  kicker: string;
  name: string;
  rooms: string[];
  img: string;
  alt: string;
}

export const LEVELS: Level[] = [
  {
    kicker: 'En entrant',
    name: 'La pièce à vivre',
    rooms: [
      'Salon lumineux, parquet clair et murs habillés de bois',
      'Canapé convertible pour deux personnes',
      'Cuisine équipée : four, plaques, micro-ondes, lave-vaisselle',
      'Télévision à écran plat, livres et jeux de société',
    ],
    img: '/images/chalet/salon-lumiere.webp',
    alt: 'Le salon avec son canapé, ses fenêtres sur le jardin et sa table ronde en bois',
  },
  {
    kicker: 'Côté nuit',
    name: 'La chambre et le bureau',
    rooms: [
      'Chambre avec lit double, linge de lit fourni',
      'Rideaux occultants et moustiquaire',
      'Coin bureau tout en pin, wifi haut débit et prise Ethernet',
      'Salle d’eau avec douche, et toilettes séparées avec lave-mains',
    ],
    img: '/images/chalet/chambre-lit-orange.webp',
    alt: 'La chambre : lit double au couvre-lit orange, applique murale et paroi de bois',
  },
  {
    kicker: 'Dehors',
    name: 'La terrasse et le jardin',
    rooms: [
      'Grande terrasse en bois surélevée, table et chaises',
      'Coursive qui fait le tour du chalet, éclairée le soir',
      'Jardin en pelouse, massifs fleuris et vue sur la montagne',
      'Deux places de stationnement privées dans l’allée',
    ],
    img: '/images/chalet/terrasse-table.webp',
    alt: 'La terrasse en bois, sa table en verre et ses chaises vertes face à la montagne',
  },
];

/* ------------------------------------------------------------
   Équipements, groupés comme on les découvre lors d'une visite.
   Repris de l'annonce, sans rien y ajouter.
   ------------------------------------------------------------ */
export const AMENITIES: { title: string; items: string[] }[] = [
  {
    title: 'Confort',
    items: [
      'Climatisation réversible — chaud l’hiver, frais l’été',
      'Wifi haut débit et connexion Ethernet',
      'Espace de travail dédié',
      'Télévision à écran plat',
      'Livres et jeux de société',
      'Logement de plain-pied, entrée privée',
    ],
  },
  {
    title: 'Cuisine',
    items: [
      'Four, plaques de cuisson et micro-ondes',
      'Lave-vaisselle',
      'Réfrigérateur et congélateur',
      'Cafetière, bouilloire et grille-pain',
      'Vaisselle, couverts et verres à vin',
      'Huile, sel, poivre — tout pour cuisiner',
    ],
  },
  {
    title: 'Linge et entretien',
    items: [
      'Draps, serviettes et linge de lit fournis',
      'Oreillers et couvertures supplémentaires',
      'Lave-linge, étendoir et fer à repasser',
      'Sèche-cheveux, shampoing et gel douche',
      'Rideaux occultants et moustiquaire',
      'Détecteur de fumée et extincteur',
    ],
  },
  {
    title: 'Dehors',
    items: [
      'Vélos à disposition',
      'Terrasse en bois et mobilier d’extérieur',
      'Repas en plein air',
      'Jardin et cadre naturel',
      'Deux places de parking privées et gratuites',
      'Séjours longs de 28 jours et plus acceptés',
    ],
  },
];

/* ------------------------------------------------------------
   Règles du séjour — annoncées avant la réservation, pas après.
   ------------------------------------------------------------ */
export const RULES: string[] = [
  `Arrivée entre ${VILLA.checkIn} · départ ${VILLA.checkOut}`,
  `${VILLA.guests} voyageurs maximum`,
  `Au-delà de ${VILLA.extraGuestFrom} voyageurs : supplément de ${VILLA.extraGuestFee} € par nuit`,
  'Non-fumeur à l’intérieur — fumeurs acceptés au jardin',
  'Les animaux ne sont pas acceptés',
  'Pas de fête ni de soirée',
  'Rendre le chalet propre et rangé, comme vous l’avez trouvé',
  `Ménage de fin de séjour possible sur demande : ${VILLA.cleaningFee} €`,
];

/* ------------------------------------------------------------
   La galerie. L'ordre compte : il raconte une visite, de l'allée au
   jardin, en passant par la terrasse et les pièces du chalet.
   ------------------------------------------------------------ */
export interface Photo { src: string; alt: string; group: string }

const p = (src: string, alt: string, group: string): Photo => ({
  src: `/images/chalet/${src}.webp`, alt, group,
});

export const GALLERY: Photo[] = [
  // Le chalet
  p('chalet-terrasse', 'Le chalet en mélèze et sa grande terrasse, au soleil du matin', 'Le chalet'),
  p('chalet-facade', 'Façade du chalet, sa porte, ses fenêtres et ses plantes en pot', 'Le chalet'),
  p('chalet-face', 'Le chalet de face, l’escalier de la terrasse et l’allée de gravier', 'Le chalet'),
  p('chalet-fleurs', 'Le chalet entre les arbres, fleurs mauves au premier plan', 'Le chalet'),
  p('chalet-contre-jour', 'Le chalet à contre-jour, la lumière filtrant entre les pins', 'Le chalet'),
  p('allee-chalet', 'L’allée de gravier bordée de lauriers qui mène au chalet', 'Le chalet'),
  p('allee-lauriers', 'L’arrivée au chalet par l’allée, entre lauriers-roses et arbustes', 'Le chalet'),

  // La terrasse
  p('terrasse-table', 'La terrasse en bois, sa table en verre et ses chaises vertes face à la montagne', 'La terrasse'),
  p('terrasse-gravier', 'Le plancher de la terrasse et l’allée de gravier en contrebas', 'La terrasse'),
  p('coursive-lumiere', 'La coursive en bois qui longe le chalet, éclairée à la nuit tombée', 'La terrasse'),
  p('coursive-soir', 'Le garde-corps de la coursive dans la lumière du soir', 'La terrasse'),
  p('terrasse-soir', 'La terrasse illuminée au crépuscule, sous les grands arbres', 'La terrasse'),

  // La pièce à vivre
  p('salon-lumiere', 'Le salon avec son canapé, ses fenêtres sur le jardin et sa table ronde en bois', 'La pièce à vivre'),
  p('salon-canape', 'Le coin salon : canapé, table basse ronde et tableaux de paysages', 'La pièce à vivre'),
  p('cuisine-entree', 'La cuisine équipée, la porte d’entrée vitrée et la petite fenêtre de bois', 'La pièce à vivre'),
  p('cuisine-porte-ouverte', 'Le salon avec son canapé et ses fenêtres ouvertes sur le jardin', 'La pièce à vivre'),
  p('cuisine-equipement', 'Micro-ondes, lave-vaisselle, évier et grand réfrigérateur', 'La pièce à vivre'),

  // Le coin nuit
  p('chambre-lit-orange', 'La chambre : lit double au couvre-lit orange, applique murale et paroi de bois', 'Le coin nuit'),
  p('chambre-linge-blanc', 'Le lit double dressé de blanc, tête de lit en bois et table de chevet', 'Le coin nuit'),
  p('chambre-serviettes', 'Le lit préparé, serviettes de toilette posées à l’arrivée', 'Le coin nuit'),
  p('chambre-applique', 'La chambre à la lumière douce des appliques', 'Le coin nuit'),
  p('bureau', 'Le coin bureau tout en pin, plan de travail jaune et carte du monde', 'Le coin nuit'),

  // La salle d'eau
  p('salle-eau-vasque', 'La salle d’eau : vasque noire, miroir et sèche-serviettes', 'La salle d’eau'),
  p('douche', 'La douche carrelée de blanc', 'La salle d’eau'),
  p('toilettes', 'Les toilettes séparées', 'La salle d’eau'),

  // Le jardin
  p('vue-montagne', 'Le jardin, la haie et la montagne boisée qui domine le chalet', 'Le jardin'),
  p('jardin-pelouse', 'La pelouse, le chemin de planches et la montagne sous le ciel bleu', 'Le jardin'),
  p('jardin-montagne', 'La pelouse et ses jeunes arbres fruitiers, les collines en fond', 'Le jardin'),
  p('jardin-falaises', 'Le jardin fleuri au pied des falaises calcaires', 'Le jardin'),
  p('chalet-collines', 'Le chalet et son jardin, les collines de Digne à l’horizon', 'Le jardin'),
  p('lagerstroemia', 'Un lilas des Indes en fleurs, rouge vif', 'Le jardin'),
  p('fleurs-coreopsis', 'Un massif de coréopsis jaunes et rouges', 'Le jardin'),
];

export const GALLERY_GROUPS = [...new Set(GALLERY.map((g) => g.group))];
