/* ============================================================
   Le curseur sur-mesure.

   Un disque qui suit le pointeur avec un temps de retard, et qui s'ouvre
   en « VOIR » au-dessus des photographies. Le retard est tout l'effet :
   collé au pixel près, le disque n'aurait pas de poids.

   Le curseur du système n'est masqué QUE sur les photographies — là où il
   n'y a ni texte à sélectionner ni champ à viser, et où le disque dit déjà
   ce qu'on peut faire. Partout ailleurs il reste : masquer la flèche sur
   toute une page se paie en confort, jamais en élégance.

   Rien de tout cela ne s'arme sur écran tactile, ni en mouvement réduit :
   il n'y a pas de survol à accompagner.
   ============================================================ */
import { onFrame, lerp, type Cleanup } from './raf';

/* Les surfaces qui appellent le disque ouvert. `[data-index]` en est exclu :
   la table des matières de l'accueil a déjà sa propre vignette suiveuse, et
   deux objets qui poursuivent le même pointeur se disputeraient l'écran. */
const PHOTOS = '.gal, [data-reveal-img] img, .hover-zoom img';
const INTERACTIF = 'a, button, input, select, textarea, summary, [tabindex]';

export function initCursor(reduce: boolean): Cleanup {
  if (reduce || !matchMedia('(hover: hover) and (pointer: fine)').matches) return () => {};

  const dot = document.createElement('div');
  dot.className = 'cur';
  dot.setAttribute('aria-hidden', 'true');
  /* Deux couches : l'anneau s'inverse sur ce qu'il survole — il est donc
     lisible sur le calcaire comme sur la nuit sans qu'on ait à deviner le
     fond ; le libellé, lui, garde ses vraies couleurs. */
  dot.innerHTML = '<span class="cur-ring"></span><span class="cur-l">Voir</span>';
  document.body.appendChild(dot);
  document.documentElement.classList.add('has-cur');

  let x = innerWidth / 2, y = innerHeight / 2, cx = x, cy = y, vu = false;

  const move = (e: PointerEvent) => {
    x = e.clientX; y = e.clientY;
    if (!vu) { cx = x; cy = y; vu = true; dot.classList.add('is-on'); }

    const el = e.target as HTMLElement | null;
    const surPhoto = !!el?.closest(PHOTOS) && !el.closest('[data-index]');
    // Un lien ou un bouton : le disque se resserre, il ne commente plus.
    const surLien = !surPhoto && !!el?.closest(INTERACTIF);
    dot.classList.toggle('is-photo', surPhoto);
    dot.classList.toggle('is-lien', surLien);
  };

  const sortie = () => { dot.classList.remove('is-on'); vu = false; };

  addEventListener('pointermove', move, { passive: true });
  document.addEventListener('pointerleave', sortie);
  // Un clic marque le geste : le disque se contracte puis reprend sa taille.
  const appui = () => dot.classList.add('is-down');
  const relache = () => dot.classList.remove('is-down');
  addEventListener('pointerdown', appui, { passive: true });
  addEventListener('pointerup', relache, { passive: true });

  const stop = onFrame(() => {
    if (!vu) return;
    cx = lerp(cx, x, 0.16);
    cy = lerp(cy, y, 0.16);
    dot.style.translate = `${cx.toFixed(1)}px ${cy.toFixed(1)}px`;
  });

  return () => {
    stop();
    removeEventListener('pointermove', move);
    document.removeEventListener('pointerleave', sortie);
    removeEventListener('pointerdown', appui);
    removeEventListener('pointerup', relache);
    dot.remove();
    document.documentElement.classList.remove('has-cur');
  };
}
