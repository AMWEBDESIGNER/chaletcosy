export type ChampContenu = {
  cle: string;
  page: string;
  libelle: string;
  type: 'texte' | 'image';
  valeur: string;
};

/**
 * Registre explicite des contenus éditables.
 *
 * Les clés sont stables : elles relient l'interface d'administration aux
 * attributs `data-contenu` du site public. Le serveur refuse toute clé qui
 * n'est pas listée ici, ce qui empêche un formulaire forgé de transformer
 * le CMS en stockage arbitraire.
 */
export const CHAMPS_CONTENU: ChampContenu[] = [
  { cle: 'accueil.hero.texte', page: 'Accueil', libelle: 'Texte du premier écran', type: 'texte', valeur: 'Un chalet de bois tout confort au pied de la montagne — à deux pas des thermes.' },
  { cle: 'accueil.introduction', page: 'Accueil', libelle: 'Introduction', type: 'texte', valeur: 'Un chalet de mélèze posé dans un jardin, au pied des montagnes de Digne. On y entend le vent dans les arbres, les oiseaux, et rien d’autre.' },
  { cle: 'accueil.presentation.image', page: 'Accueil', libelle: 'Grande photo de présentation', type: 'image', valeur: '/images/chalet/jardin-pelouse.webp' },
  { cle: 'accueil.presentation.texte1', page: 'Accueil', libelle: 'Présentation — paragraphe 1', type: 'texte', valeur: 'Du bois partout, dedans comme dehors : un cadre apaisant, entre nature et thermes, pensé pour les curistes, les randonneurs, les saisonniers et les professionnels en déplacement.' },
  { cle: 'accueil.presentation.texte2', page: 'Accueil', libelle: 'Présentation — paragraphe 2', type: 'texte', valeur: '30 m² de plain-pied. Une chambre, un canapé convertible, une salle d’eau. Jusqu’à 4 voyageurs. On loue le chalet entier.' },
  { cle: 'accueil.voyageurs.titre', page: 'Accueil', libelle: 'Titre des profils voyageurs', type: 'texte', valeur: 'Un chalet, cinq façons d’y venir.' },
  { cle: 'accueil.digne.texte', page: 'Accueil', libelle: 'Présentation de Digne-les-Bains', type: 'texte', valeur: 'Capitale de la lavande, ville thermale et ensoleillée, entre Alpes et Provence. Et à deux heures de la Côte d’Azur.' },
  { cle: 'accueil.conclusion', page: 'Accueil', libelle: 'Phrase de conclusion', type: 'texte', valeur: 'Le chalet entier, pour vous seuls.' },

  { cle: 'chalet.titre', page: 'Le chalet', libelle: 'Titre principal', type: 'texte', valeur: 'Le chalet' },
  { cle: 'chalet.introduction', page: 'Le chalet', libelle: 'Introduction', type: 'texte', valeur: 'Trente mètres carrés pensés pour vivre simplement, dedans comme dehors.' },
  { cle: 'chalet.presentation.titre', page: 'Le chalet', libelle: 'Titre de présentation', type: 'texte', valeur: 'Un chalet au pied de la montagne.' },
  { cle: 'chalet.longsejour.titre', page: 'Le chalet', libelle: 'Titre longs séjours', type: 'texte', valeur: 'Cures, missions, saisons.' },
  { cle: 'chalet.infos.titre', page: 'Le chalet', libelle: 'Titre informations pratiques', type: 'texte', valeur: 'Ce qu’il faut savoir avant de venir.' },

  { cle: 'galerie.titre', page: 'Galerie', libelle: 'Titre principal', type: 'texte', valeur: 'La galerie' },
  { cle: 'galerie.introduction', page: 'Galerie', libelle: 'Introduction', type: 'texte', valeur: 'Le chalet, de l’allée au jardin.' },
  { cle: 'galerie.conclusion', page: 'Galerie', libelle: 'Conclusion', type: 'texte', valeur: 'Un chalet, un jardin, la montagne. Dites-nous vos dates.' },

  { cle: 'digne.titre', page: 'Digne-les-Bains', libelle: 'Titre principal', type: 'texte', valeur: 'Digne-les-Bains' },
  { cle: 'digne.introduction', page: 'Digne-les-Bains', libelle: 'Introduction', type: 'texte', valeur: 'Une ville thermale entre Alpes et Provence, entourée de chemins, de géologie et de lavande.' },
  { cle: 'digne.distances.titre', page: 'Digne-les-Bains', libelle: 'Titre des distances', type: 'texte', valeur: 'À quelle distance ?' },
  { cle: 'digne.conclusion', page: 'Digne-les-Bains', libelle: 'Conclusion', type: 'texte', valeur: 'Le chalet est au milieu de tout cela, au calme de son jardin.' },

  { cle: 'contact.titre', page: 'Contact', libelle: 'Titre principal', type: 'texte', valeur: 'Nous contacter' },
  { cle: 'contact.introduction', page: 'Contact', libelle: 'Introduction', type: 'texte', valeur: 'Une question sur le chalet, les dates ou votre séjour ? Écrivez-nous.' },
  { cle: 'contact.formulaire.titre', page: 'Contact', libelle: 'Titre du formulaire', type: 'texte', valeur: 'Écrivez-nous' },
];

export const CHAMPS_PAR_CLE = new Map(CHAMPS_CONTENU.map((champ) => [champ.cle, champ]));
