export const prerender = false;

import type { APIRoute } from 'astro';
import { config, lis } from '../../lib/serveur/base';

export const GET: APIRoute = async ({ locals }) => {
  const c = config((locals as any).runtime?.env);
  if (!c) return Response.json({}, { headers: { 'Cache-Control': 'no-store' } });

  try {
    const lignes = await lis(c, 'contenus_site?select=cle,valeur');
    const contenu = Object.fromEntries(lignes.map((ligne) => [ligne.cle, ligne.valeur]));
    return Response.json(contenu, {
      headers: { 'Cache-Control': 'public, max-age=30, stale-while-revalidate=120' },
    });
  } catch (e) {
    console.error('[contenu] lecture publique', e);
    return Response.json({}, { headers: { 'Cache-Control': 'no-store' } });
  }
};
