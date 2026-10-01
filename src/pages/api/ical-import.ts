/* ============================================================
   Import iCalendar — synchronisation depuis plateforme externe.

   Reçoit un fichier iCal et importe les occupations avec
   idempotence via uid_externe. Les doublons sont ignorés.
   ============================================================ */
export const prerender = false;

import type { APIRoute } from 'astro';
import { config } from '../../lib/serveur/base';
import { lireICal } from '../../lib/ical';

export const POST: APIRoute = async ({ request, locals }) => {
  const runtime = (locals as any).runtime?.env;
  const c = config(runtime);
  if (!c) {
    return new Response(JSON.stringify({ erreur: 'Non configuré.' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  /* Vérifier la clé secrète — l'import iCal ne doit venir que d'une source
     de confiance (administrateur, webhook plateforme externe signé). */
  const cle = request.headers.get('Authorization')?.replace('Bearer ', '');
  if (!cle || cle !== runtime?.ICAL_IMPORT_SECRET) {
    return new Response(JSON.stringify({ erreur: 'Non autorisé.' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const contenu = await request.text();
    const lignes = lireICal(contenu);

    let importe = 0;
    let ignore = 0;

    for (const evt of lignes) {
      try {
        const debut = evt.periode.debut;
        const fin = evt.periode.fin;

        /* Appeler la base pour insérer ou ignorer si le UID existe déjà. */
        const r = await fetch(`${c.url}/rest/v1/rpc/api_importer_ical`, {
          method: 'POST',
          headers: {
            apikey: c.cle,
            Authorization: `Bearer ${c.cle}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            p_debut: debut,
            p_fin: fin,
            p_uid_externe: evt.uid,
          }),
        });

        if (r.ok) {
          importe++;
        } else {
          const txt = await r.text();
          if (txt.includes('duplicate key') || txt.includes('uid_externe')) {
            ignore++;
          } else {
            console.error('[ical-import] erreur insertion', debut, fin, await r.text());
          }
        }
      } catch (e) {
        console.error('[ical-import] erreur dans la boucle', e);
      }
    }

    return new Response(JSON.stringify({ importe, ignore, total: lignes.length }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('[ical-import]', e);
    return new Response(
      JSON.stringify({ erreur: e instanceof Error ? e.message : 'Erreur lors de l\'import.' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
