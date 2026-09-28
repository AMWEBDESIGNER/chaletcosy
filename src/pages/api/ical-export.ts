/* ============================================================
   Export iCalendar — synchronisation avec Airbnb.

   Cette route exporte en RFC 5545 les occupations confirmées
   et les options en attente. Airbnb peut importer cet iCal
   pour rester synchronisé.

   Les événements portent un UID stable dérivé de l'ID occupation,
   pour que les réimports soient idempotents.
   ============================================================ */
export const prerender = false;

import type { APIRoute } from 'astro';
import { config, pourExportICal } from '../../lib/serveur/base';
import { ecrireICal } from '../../lib/ical';

export const GET: APIRoute = async ({ request, locals }) => {
  const runtime = (locals as any).runtime?.env;
  const c = config(runtime);
  if (!c) {
    return new Response('Non configuré.', { status: 503 });
  }

  try {
    const occupations = await pourExportICal(c);

    const ical = ecrireICal(occupations.map(o => ({
      id: o.id,
      periode: o.periode,
    })));

    return new Response(ical, {
      status: 200,
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': 'attachment; filename="la-belle-etoile.ics"',
      },
    });
  } catch (e) {
    console.error('[ical-export]', e);
    return new Response('Erreur lors de l\'export.', { status: 500 });
  }
};
