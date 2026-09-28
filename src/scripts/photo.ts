/* ============================================================
   Libération des photographies retenues.

   `Photo.astro` sait écrire `data-srcset` / `data-src` au lieu des attributs
   réels quand on lui passe `deferred` ; c'est ici qu'on les rétablit. Les
   deux moitiés du contrat vivent ainsi côte à côte : celle qui retient et
   celle qui libère. Un appelant n'a rien à savoir de la forme du balisage.
   ============================================================ */

/**
 * Rend leurs attributs aux photographies retenues sous `root`.
 * Sans effet sur celles qui les portent déjà.
 */
export function promote(root: ParentNode) {
  /* Les sources avant l'image : `<picture>` arrête son choix à l'instant où
     l'image reçoit son `src`, et ne le rejoue pas ensuite. Une source encore
     muette à cet instant serait tout simplement ignorée. */
  root.querySelectorAll<HTMLSourceElement>('source[data-srcset]').forEach((s) => {
    s.srcset = s.dataset.srcset!;
    s.removeAttribute('data-srcset');
  });
  root.querySelectorAll<HTMLImageElement>('img[data-src]').forEach((img) => {
    img.src = img.dataset.src!;
    img.removeAttribute('data-src');
  });
}
