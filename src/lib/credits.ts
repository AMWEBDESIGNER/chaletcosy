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

export const CREDITS: Credit[] = [];
