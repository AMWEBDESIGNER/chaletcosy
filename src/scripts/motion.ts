/* ============================================================
   Chalet Cosy — Signature de mouvement
   Une seule source de vérité : mêmes durées, mêmes courbes, une seule boucle rAF.
   Tout est ré-initialisé proprement à chaque navigation (View Transitions).
   Aucune dépendance d'animation : les courbes vivent dans le CSS, le scroll
   dans une unique boucle. Objectif : 60 fps, JS minimal.
   ============================================================ */
import { gsap } from 'gsap';
import { Flip } from 'gsap/Flip';
import { initAtmosphere } from './atmosphere';
import { initCursor } from './cursor';
import { monterQuandPret, demonter as demonterAnim } from './anim';
import { initReserver } from './reserver';
import { initPaiement } from './paiement';
import { onFrame, lerp, clamp01, range, type Cleanup } from './raf';
import { appliqueContenu } from './contenu-public';

gsap.registerPlugin(Flip);

const mq = (q: string) => window.matchMedia(q);
const reduceMQ = mq('(prefers-reduced-motion: reduce)');
let reduce = reduceMQ.matches;

let cleanups: Cleanup[] = [];

function teardown() {
  cleanups.forEach((c) => c());
  cleanups = [];
}




/* ---------- Relève des libellés ----------
   Le CSS anime `.roll > span` ; il ne peut pas fabriquer ce balisage, car
   aucun sélecteur n'atteint un nœud texte. On l'enveloppe donc ici, une fois,
   comme on découpe les titres — et sans JS le libellé reste simplement un
   texte fixe.
   On n'enveloppe que le premier nœud texte non vide : les icônes en frère
   (la flèche de `.link-arrow`, le chevron des boutons) gardent leur place et
   leur propre transition. */
function rollLabels() {
  const els = document.querySelectorAll<HTMLElement>('.btn, .link-arrow, [data-roll]');
  els.forEach((el) => {
    if (el.dataset.roll === 'off' || el.querySelector('.roll')) return;

    const text = Array.from(el.childNodes).find(
      (n): n is Text => n.nodeType === Node.TEXT_NODE && !!n.textContent?.trim(),
    );
    if (!text) return;

    const roll = document.createElement('span');
    roll.className = 'roll';
    const inner = document.createElement('span');
    inner.textContent = text.textContent!.trim();
    roll.appendChild(inner);
    text.replaceWith(roll);
  });
}






/* ---------- Lightbox (fiche bien) ---------- */
function lightbox() {
  const lb = document.getElementById('lightbox');
  if (!lb) return;
  const img = document.getElementById('lb-img') as HTMLImageElement;
  const btns = Array.from(document.querySelectorAll<HTMLElement>('.gal'));
  if (!btns.length) return;

  let i = 0;
  let opener: HTMLElement | null = null;

  const show = (n: number) => {
    i = (n + btns.length) % btns.length;
    const b = btns[i];
    img.src = b.dataset.src!;
    img.alt = b.dataset.alt || '';
    lb.querySelector('[data-lb-count]')!.textContent = `${i + 1} / ${btns.length}`;
  };
  /* LE VOL — la photographie part de la vignette cliquée et grandit
     jusqu'à sa place. C'est GSAP Flip qui le calcule : on colle l'image de
     la visionneuse sur la vignette (`Flip.fit`), on relève cet état, on
     rend à l'image sa place naturelle, et Flip rejoue le trajet entre les
     deux. Aucune arithmétique à la main.

     Ce que Flip apporte par rapport au calcul manuel qu'il remplace : il
     gère l'écart de proportions. La vignette recadre en `cover`, la
     visionneuse ajuste en `contain` — le vol était donc anisotrope, et
     l'image se déformait pendant la traversée. `scale: true` fait porter
     la transformation à l'échelle plutôt qu'aux dimensions, ce qui garde
     le rapport de l'image intact d'un bout à l'autre. */
  const vol = (depuis: HTMLElement) => {
    if (reduce) return;
    const vignette = depuis.querySelector('img') || depuis;
    if (!vignette.getBoundingClientRect().width || !img.getBoundingClientRect().width) return;

    Flip.fit(img, vignette as HTMLElement, { scale: true });
    const etat = Flip.getState(img);
    gsap.set(img, { clearProps: 'transform,width,height' });

    Flip.from(etat, {
      duration: 0.75,
      ease: 'power3.inOut',
      scale: true,
      absolute: true,
    });
  };

  const open = (n: number, from: HTMLElement) => {
    opener = from;
    show(n);
    lb.hidden = false;
    lb.classList.add('is-open');
    // La visionneuse reste utilisable même si l'image est déjà en cache ou si
    // l'animation FLIP rencontre un navigateur qui ne la prend pas en charge.
    const ajuster = () => requestAnimationFrame(() => {
      try { vol(from); } catch { /* l'image reste affichée sans animation */ }
    });
    if (img.complete && img.naturalWidth > 0) ajuster();
    else img.addEventListener('load', ajuster, { once: true });
    document.documentElement.classList.add('menu-open');
    (lb.querySelector('#lb-close') as HTMLElement)?.focus();
  };
  const close = () => {
    lb.classList.remove('is-open');
    const done = (e: TransitionEvent) => {
      if (e.target !== lb) return; // ignore les transitions des enfants (survol des flèches)
      lb.hidden = true;
      lb.removeEventListener('transitionend', done);
    };
    lb.addEventListener('transitionend', done);
    document.documentElement.classList.remove('menu-open');
    opener?.focus();
  };

  btns.forEach((b, n) => {
    const fn = () => open(n, b);
    b.addEventListener('click', fn);
    cleanups.push(() => b.removeEventListener('click', fn));
  });
  lb.querySelector('#lb-close')?.addEventListener('click', close);
  lb.querySelector('[data-lb-prev]')?.addEventListener('click', () => show(i - 1));
  lb.querySelector('[data-lb-next]')?.addEventListener('click', () => show(i + 1));
  lb.addEventListener('click', (e) => { if (e.target === lb) close(); });

  const key = (e: KeyboardEvent) => {
    if (lb.hidden) return;
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowRight') show(i + 1);
    else if (e.key === 'ArrowLeft') show(i - 1);
    else if (e.key === 'Tab') { e.preventDefault(); (lb.querySelector('#lb-close') as HTMLElement)?.focus(); }
  };
  document.addEventListener('keydown', key);
  cleanups.push(() => {
    document.removeEventListener('keydown', key);
    document.documentElement.classList.remove('menu-open');
  });
}


/* ---------- Formulaires (mailto — site statique, pas de back-end) ---------- */
function forms() {
  document.querySelectorAll<HTMLFormElement>('form[data-form]').forEach((form) => {
    if (form.dataset.formBound) return; // le pied de page persiste entre les pages
    form.dataset.formBound = '1';

    // Champ leurre : invisible et hors du parcours clavier, seuls les
    // automates le remplissent.
    const hp = document.createElement('input');
    hp.type = 'text';
    hp.name = '_hp';
    hp.tabIndex = -1;
    hp.autocomplete = 'off';
    hp.setAttribute('aria-hidden', 'true');
    hp.style.cssText = 'position:absolute;left:-9999px;width:1px;height:1px;opacity:0';
    form.appendChild(hp);

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!form.reportValidity()) return;

      let note = form.querySelector<HTMLElement>('.form-note');
      if (!note) {
        note = document.createElement('p');
        note.className = 'form-note';
        note.setAttribute('role', 'status');
        form.appendChild(note);
      }

      const button = form.querySelector<HTMLButtonElement>('button:not([type="button"])');
      const label = button?.innerHTML;
      if (button) { button.disabled = true; button.textContent = 'Envoi…'; }
      note.textContent = '';
      note.classList.remove('form-note--err');

      const data = new FormData(form);
      data.set('_subject', form.dataset.subject || 'Demande — Chalet Cosy');

      try {
        const res = await fetch('/api/contact', { method: 'POST', body: data });
        const out = await res.json().catch(() => null);

        if (res.ok && out?.ok) {
          note.textContent = out.notice ?? 'Votre demande est envoyée. Merci.';
          form.reset();
        } else {
          note.classList.add('form-note--err');
          note.textContent = out?.error ?? "L'envoi a échoué. Réessayez dans un instant.";
        }
      } catch {
        note.classList.add('form-note--err');
        note.textContent = "L'envoi a échoué. Vérifiez votre connexion.";
      } finally {
        if (button && label) { button.disabled = false; button.innerHTML = label; }
      }
    });
  });
}

/* ---------- Vidéo du hero ----------
   Chargée partout, mais toujours après la peinture de la page, et dans une
   définition adaptée à l'écran. Seuls un refus d'animation, l'économie de
   données ou un réseau très lent y font renoncer — la taille de l'écran, elle,
   choisit le fichier, elle ne supprime plus la vidéo. */
function heroVideo() {
  const v = document.querySelector<HTMLVideoElement>('video[data-hero-video]');
  if (!v) return;
  const conn = (navigator as any).connection;
  // Attention au motif : « 4g » contient « 4g », pas « 2g » — mais « slow-2g »
  // et « 2g » doivent bien être exclus.
  const slow = /^(slow-2g|2g)$/.test(conn?.effectiveType ?? '');
  if (reduce || conn?.saveData || slow) return;

  const src = v.querySelector('source');
  if (!src?.dataset.src) return;

  // Version allégée sous 1024 px : même plan, deux fois moins de données.
  const file = (innerWidth < 1024 && src.dataset.srcSm) || src.dataset.src;

  let cancelled = false;
  const start = () => {
    if (cancelled) return;
    src.src = file;
    v.load();
    // iOS bloque la lecture automatique en mode économie d'énergie : on garde
    // alors l'affiche, sans rien casser.
    const cede = () => {
      v.classList.add('is-playing');
      // La vidéo recouvre entièrement le calque : le faire encore peindre
      // serait payer un plein écran par image pour rien.
      document.querySelector('[data-atmosphere]')?.classList.add('is-yielded');
    };
    const played = v.play();
    if (played) played.then(cede).catch(() => {});
    else cede();
  };
  const ric = (window as any).requestIdleCallback;
  const id = ric ? ric(start, { timeout: 2500 }) : window.setTimeout(start, 900);

  cleanups.push(() => {
    cancelled = true;
    if (ric) (window as any).cancelIdleCallback?.(id);
    else clearTimeout(id);
    try { v.pause(); } catch {}
  });
}

/* ---------- En-tête : fond au scroll, menu mobile ----------
   L'en-tête est persistant (View Transitions) : on lie une seule fois et on
   se contente de rafraîchir l'état actif à chaque navigation. */
function header() {
  const hdr = document.getElementById('hdr');
  if (!hdr) return;

  // État actif — recalculé à chaque page puisque le DOM, lui, ne change pas.
  // Les rubriques vivent désormais dans le rideau, hors de l'en-tête : on
  // interroge le document, sans quoi plus aucune ne serait marquée.
  const path = location.pathname.replace(/\/$/, '') || '/';
  document.querySelectorAll<HTMLAnchorElement>('[data-nav]').forEach((a) => {
    const href = a.getAttribute('href')!;
    const on = href === '/' ? path === '/' : path === href || path.startsWith(href + '/');
    a.classList.toggle('is-active', on);
    if (on) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });

  // En haut d'un hero sombre, l'en-tête doit s'écrire en clair : sinon le texte
  // encre se perd dans la photographie. Recalculé à chaque page.
  const overDark = !!document.querySelector('[data-hero="dark"]');
  const paint = () => {
    // Le rideau est d'encre : menu ouvert, l'en-tête doit passer en clair —
    // c'était l'inverse du temps où le panneau était ivoire.
    const menu = document.documentElement.classList.contains('menu-open');
    const top = window.scrollY <= 24;
    hdr.classList.toggle('is-solid', !top && !menu);
    hdr.classList.toggle('is-over-dark', menu || (top && overDark));
  };
  paint();

  if (hdr.dataset.bound) {
    // Le repeintre lié au scroll appartient à la page courante.
    (hdr as any)._paint = paint;
    return;
  }
  hdr.dataset.bound = '1';
  (hdr as any)._paint = paint;
  addEventListener('scroll', () => (hdr as any)._paint(), { passive: true });

  const burger = document.getElementById('burger')!;
  const overlay = document.getElementById('overlay')!;
  const links = Array.from(overlay.querySelectorAll<HTMLAnchorElement>('a'));
  let open = false;

  const label = burger.querySelector('[data-burger-label]');

  const setOpen = (next: boolean) => {
    open = next;
    overlay.classList.toggle('is-open', open);
    overlay.setAttribute('aria-hidden', String(!open));
    burger.setAttribute('aria-expanded', String(open));
    burger.classList.toggle('is-open', open);
    // `aria-expanded` dit l'état, pas l'action : un bouton qui s'annonce
    // « Ouvrir le menu » alors que le panneau est ouvert reste trompeur.
    if (label) label.textContent = open ? 'Fermer le menu' : 'Ouvrir le menu';
    document.documentElement.classList.toggle('menu-open', open);
    (hdr as any)._paint();
    // On amène le focus dans le panneau sans le poser sur un lien : la
    // navigation clavier démarre au bon endroit, sans halo au premier plan.
    if (open) overlay.focus();
  };

  burger.addEventListener('click', () => setOpen(!open));
  links.forEach((a) => a.addEventListener('click', () => open && setOpen(false)));
  addEventListener('keydown', (e) => {
    if (!open) return;
    if (e.key === 'Escape') { setOpen(false); burger.focus(); return; }
    if (e.key !== 'Tab') return;

    /* Le panneau couvre l'écran : derrière lui, la page entière reste dans
       le parcours clavier, et sept tabulations suffisaient à en sortir pour
       aller nourrir des liens que personne ne voit. On boucle donc sur les
       liens du panneau — Échap reste la sortie, et rend le focus au bouton.
       `offsetParent` écarte ceux qu'un affichage a repliés. */
    const items = links.filter((a) => a.offsetParent !== null);
    if (!items.length) return;
    const [first, last] = [items[0], items.at(-1)!];
    const here = document.activeElement;

    if (e.shiftKey && (here === first || here === overlay)) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && here === last) { e.preventDefault(); first.focus(); }
  });
  // Le menu ne survit pas à une navigation.
  document.addEventListener('astro:before-swap', () => open && setOpen(false));
}

/* ---------- Cycle de vie ---------- */
async function init() {
  teardown();
  reduce = reduceMQ.matches;

  /* Le CMS doit avoir remplacé les textes avant SplitText : modifier le
     contenu après le découpage détruirait ses masques et les animations
     garderaient des références vers des nœuds qui n'existent plus. */
  await appliqueContenu();

  header();
  rollLabels();
  lightbox();
  forms();
  heroVideo();
  cleanups.push(initAtmosphere(reduce));
  cleanups.push(initCursor(reduce));

  /* Le calendrier est FONCTIONNEL, pas décoratif : il se monte même en
     mouvement réduit. `reduce` ne gouverne que ce qui bouge, jamais ce qui
     sert — un visiteur qui a désactivé les animations veut toujours
     réserver. */
  cleanups.push(initReserver());
  cleanups.push(initPaiement());

  /* Le mouvement vit dans `anim.ts`, entièrement en GSAP. Monté en dernier :
     il découpe les titres, et doit trouver le DOM dans son état final. */
  monterQuandPret();
  cleanups.push(demonterAnim);
}

document.addEventListener('astro:page-load', () => { void init(); });
document.addEventListener('astro:before-swap', teardown);
