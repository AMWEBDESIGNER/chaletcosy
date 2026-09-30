export const prerender = false;

import type { APIRoute } from 'astro';
import { exigeAdmin } from '../../../lib/serveur/auth';
import { config, enregistreContenu, enregistreImage } from '../../../lib/serveur/base';
import { CHAMPS_PAR_CLE } from '../../../lib/contenu-site';

export const POST: APIRoute = async (contexte) => {
  const garde = await exigeAdmin(contexte);
  if (garde.refus) return garde.refus;

  const origine = contexte.request.headers.get('origin');
  if (origine && origine !== contexte.url.origin) {
    return Response.json({ erreur: 'Origine refusée.' }, { status: 403 });
  }

  const c = config((contexte.locals as any).runtime?.env);
  if (!c) return Response.json({ erreur: 'Base non configurée.' }, { status: 503 });

  try {
    const formulaire = await contexte.request.formData();
    const cle = String(formulaire.get('cle') ?? '');
    const champ = CHAMPS_PAR_CLE.get(cle);
    if (!champ) return Response.json({ erreur: 'Ce contenu n’est pas modifiable.' }, { status: 400 });

    let valeur: string;
    if (champ.type === 'image') {
      const fichier = formulaire.get('image');
      if (!(fichier instanceof File) || fichier.size === 0) {
        return Response.json({ erreur: 'Choisissez une image.' }, { status: 400 });
      }
      if (!['image/jpeg', 'image/png', 'image/webp', 'image/avif'].includes(fichier.type)) {
        return Response.json({ erreur: 'Format accepté : JPEG, PNG, WebP ou AVIF.' }, { status: 400 });
      }
      if (fichier.size > 8 * 1024 * 1024) {
        return Response.json({ erreur: 'L’image ne doit pas dépasser 8 Mo.' }, { status: 400 });
      }
      valeur = await enregistreImage(c, fichier, cle);
    } else {
      valeur = String(formulaire.get('valeur') ?? '').trim();
      if (!valeur) return Response.json({ erreur: 'Le texte ne peut pas être vide.' }, { status: 400 });
      if (valeur.length > 3000) return Response.json({ erreur: 'Le texte est trop long.' }, { status: 400 });
    }

    await enregistreContenu(c, cle, valeur, champ.type, garde.session.email);
    return Response.json({ ok: true, cle, valeur });
  } catch (e) {
    console.error('[admin] édition visuelle', e);
    return Response.json({ erreur: e instanceof Error ? e.message : 'Enregistrement impossible.' }, { status: 500 });
  }
};
