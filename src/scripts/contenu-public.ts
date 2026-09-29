type Contenus = Record<string, string>;

let cache: Promise<Contenus> | null = null;

const charge = () => {
  cache ??= fetch('/api/contenu', { headers: { Accept: 'application/json' } })
    .then((reponse) => reponse.ok ? reponse.json() : {})
    .catch(() => ({}));
  return cache;
};

export async function appliqueContenu() {
  const contenus = await charge();

  document.querySelectorAll<HTMLElement>('[data-contenu]').forEach((element) => {
    const valeur = contenus[element.dataset.contenu || ''];
    if (typeof valeur === 'string' && valeur.trim()) element.textContent = valeur;
  });

  document.querySelectorAll<HTMLImageElement>('img[data-contenu-image]').forEach((image) => {
    const valeur = contenus[image.dataset.contenuImage || ''];
    if (!valeur) return;
    const picture = image.closest('picture');
    picture?.querySelectorAll('source').forEach((source) => source.remove());
    image.removeAttribute('srcset');
    image.src = valeur;
  });
}
