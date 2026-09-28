/* ============================================================
   Crédits des photographies de Digne-les-Bains et de ses environs.

   Elles viennent de Wikimedia Commons, sous licence libre : CC BY et
   CC BY-SA EXIGENT de nommer l'auteur et la licence. La page des
   mentions légales affiche cette liste — toute photo ajoutée à
   `public/images/digne/` doit y figurer.
   ============================================================ */
export interface Credit {
  /** Fichier servi, sous `public/images/digne/`. */
  file: string;
  subject: string;
  author: string;
  license: string;
  /** Page du fichier sur Wikimedia Commons. */
  source: string;
}

export const CREDITS: Credit[] = [
  {
    file: '/images/digne/vue-digne.webp',
    subject: 'Digne-les-Bains et le Rocher de Neuf-Heures',
    author: 'Denis Champollion',
    license: 'CC BY-SA 4.0',
    source: 'https://commons.wikimedia.org/wiki/File:Digne_devant_le_rocher_de_neuf_heures.jpg',
  },
  {
    file: '/images/digne/musee-promenade.webp',
    subject: 'La grande cascade du Musée Promenade',
    author: 'Datel04',
    license: 'CC BY-SA 4.0',
    source: 'https://commons.wikimedia.org/wiki/File:Mus%C3%A9e_Promenade_-_La_Grande_Cascade_-_Digne-les-Bains.jpg',
  },
  {
    file: '/images/digne/dalle-ammonites.webp',
    subject: 'La dalle aux ammonites',
    author: 'Zairon',
    license: 'CC BY 4.0',
    source: 'https://commons.wikimedia.org/wiki/File:Digne-les-Bains_Dalle_%C3%A0_Ammonites_2.jpg',
  },
  {
    file: '/images/digne/thermes.webp',
    subject: 'Les thermes de Digne-les-Bains',
    author: 'Etienne Baudon',
    license: 'CC BY-SA 3.0',
    source: 'https://commons.wikimedia.org/wiki/File:Digne_les_bains_thermes.jpg',
  },
  {
    file: '/images/digne/rocher-neuf-heures.webp',
    subject: 'Le Rocher de Neuf-Heures',
    author: 'Arnaud04',
    license: 'CC BY-SA 4.0',
    source: 'https://commons.wikimedia.org/wiki/File:Rocher_neuf_heures.jpg',
  },
  {
    file: '/images/digne/notre-dame-du-bourg.webp',
    subject: 'La cathédrale Notre-Dame-du-Bourg',
    author: 'Édouard Hue (User:EdouardHue)',
    license: 'CC BY-SA 3.0',
    source: 'https://commons.wikimedia.org/wiki/File:Cath%C3%A9drale_Notre-Dame-du-Bourg,_Digne-les-Bains,_France.jpg',
  },
  {
    file: '/images/digne/maison-david-neel.webp',
    subject: 'La maison d’Alexandra David-Néel',
    author: 'MERLEJP',
    license: 'CC BY-SA 4.0',
    source: 'https://commons.wikimedia.org/wiki/File:Maison-mus%C3%A9e_d%27Alexandra_David_Nee_%C3%A0_Digne-les-Bains_(Alpes_de_Haute_Provence).jpg',
  },
  {
    file: '/images/digne/montagne.webp',
    subject: 'Le Cousson',
    author: 'Arnaud04',
    license: 'CC BY-SA 4.0',
    source: 'https://commons.wikimedia.org/wiki/File:Le_Cousson_02.jpg',
  },
  {
    file: '/images/digne/lavande-valensole.webp',
    subject: 'La lavande du plateau de Valensole',
    author: 'Einaz80',
    license: 'CC BY-SA 4.0',
    source: 'https://commons.wikimedia.org/wiki/File:Lavender_field_near_Valensole.jpg',
  },
];
