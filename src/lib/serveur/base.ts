/* ============================================================
   L'accès à la base — CÔTÉ SERVEUR EXCLUSIVEMENT.

   ⚠️ CE FICHIER LIT LA CLÉ `service_role`, QUI CONTOURNE TOUTE LA
   SÉCURITÉ DE LA BASE. Il ne doit jamais être importé depuis un script
   client, ni depuis un composant rendu côté navigateur. Il vit sous
   `lib/serveur/` pour que l'erreur se voie à la ligne d'import, avant de
   se voir dans un fichier JavaScript public.

   La règle qui va avec : aucune variable de ce module ne porte le préfixe
   `PUBLIC_`. Astro expose au navigateur tout ce qui le porte — c'est
   exactement ainsi qu'une clé secrète part en production.

   POURQUOI PAS LE SDK SUPABASE. Il pèse plusieurs centaines de kilo-octets
   pour ce qu'on en fait ici : trois appels de fonction et deux lectures de
   table. PostgREST est une API HTTP ordinaire, `fetch` suffit, et le
   Worker reste léger. Le projet fabrique déjà ses images et son WebGL à la
   main ; une dépendance de plus se justifierait par le service rendu, pas
   par l'habitude.
   ============================================================ */
import type { Periode, Saison, Frais } from '../reservation.ts';

export interface Config {
  url: string;
  cle: string;
}

/** Lit la configuration, ou dit qu'elle manque — sans jamais divulguer la clé. */
export function config(runtime: any): Config | null {
  const url = runtime?.SUPABASE_URL ?? (import.meta.env as any)?.SUPABASE_URL ?? '';
  const cle = runtime?.SUPABASE_SECRET_KEY
    ?? (import.meta.env as any)?.SUPABASE_SECRET_KEY
    ?? runtime?.SUPABASE_SERVICE_KEY
    ?? (import.meta.env as any)?.SUPABASE_SERVICE_KEY
    ?? '';
  return url && cle ? { url: url.replace(/\/+$/, ''), cle } : null;
}

/** Erreur portant le code renvoyé par PostgreSQL, quand il y en a un. */
export class ErreurBase extends Error {
  constructor(message: string, readonly code?: string, readonly statut = 500) {
    super(message);
  }
}

async function appelle(c: Config, chemin: string, init: RequestInit): Promise<any> {
  const res = await fetch(`${c.url}/rest/v1/${chemin}`, {
    ...init,
    headers: {
      apikey: c.cle,
      Authorization: `Bearer ${c.cle}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });

  const texte = await res.text();
  let corps: any = null;
  try { corps = texte ? JSON.parse(texte) : null; } catch { /* laissé brut */ }

  if (!res.ok) {
    /* On remonte le code PostgreSQL, jamais le message brut vers le
       visiteur : il contient le nom des contraintes et des colonnes,
       c'est-à-dire une carte de la base. Le message part dans les
       journaux, le code sert à décider quoi dire. */
    const code = corps?.code ?? String(res.status);
    const msg = corps?.message ?? texte.slice(0, 300);
    console.error('[base]', chemin, res.status, code, msg);
    throw new ErreurBase(msg, code, res.status);
  }
  return corps;
}

const rpc = (c: Config, fn: string, args: Record<string, unknown>) =>
  appelle(c, `rpc/${fn}`, { method: 'POST', body: JSON.stringify(args) });

/* ------------------------------------------------------------
   Lectures
   ------------------------------------------------------------ */

/** Les nuits occupées d'une fenêtre. Deux dates par ligne, rien d'autre. */
export async function occupations(c: Config, depuis: string, jusqu_a: string): Promise<Periode[]> {
  const lignes = await rpc(c, 'api_disponibilites', { depuis, jusqu_a });
  return (lignes ?? []).map((l: any) => ({ debut: l.debut, fin: l.fin }));
}

export interface Grille {
  saisons: Saison[];
  frais: Frais;
  /** Voir `parametres.tarifs_provisoires` : tant qu'il est levé, aucun
      encaissement réel ne doit avoir lieu. */
  provisoires: boolean;
  preavisJours: number;
}

/**
 * La grille tarifaire, saisons triées par priorité croissante.
 *
 * ⚠️ LE TRI N'EST PAS COSMÉTIQUE. `saisonDe()` retient la PREMIÈRE saison
 *    qui correspond : l'ordre du tableau EST la priorité. Servi dans
 *    l'ordre d'insertion, une saison étroite et chère posée par-dessus une
 *    saison large — la quinzaine du 15 août sur juillet-août — ne
 *    l'emporterait qu'une fois sur deux, selon l'humeur du planificateur.
 *    Le `order` ci-dessous est ce qui rend le recouvrement fiable.
 */
export async function grille(c: Config): Promise<Grille> {
  const [saisons, params] = await Promise.all([
    appelle(c, 'saisons?select=nom,debut,fin,nuit_cents,minimum&order=priorite.asc', { method: 'GET' }),
    appelle(c, 'parametres?select=*&id=eq.true', { method: 'GET' }),
  ]);

  const p = params?.[0] ?? {};
  return {
    saisons: (saisons ?? []).map((s: any) => ({
      nom: s.nom,
      debut: s.debut,
      fin: s.fin,
      nuit: s.nuit_cents / 100,
      minimum: s.minimum,
    })),
    frais: {
      menage: (p.menage_cents ?? 0) / 100,
      taxeParPersonneParNuit: (p.taxe_pppn_cents ?? 0) / 100,
      acompte: (p.acompte_bps ?? 3000) / 10000,
    },
    provisoires: p.tarifs_provisoires !== false,
    preavisJours: p.preavis_jours ?? 0,
  };
}

/* ------------------------------------------------------------
   Écritures
   ------------------------------------------------------------ */

export interface DemandeOption {
  reference: string;
  debut: string;
  fin: string;
  voyageurs: number;
  nom: string;
  email: string;
  telephone?: string;
  message?: string;
  totalCents: number;
  acompteCents: number;
}

/** Levée quand les nuits viennent d'être prises par quelqu'un d'autre. */
export class DatesPrises extends Error {}

/**
 * Pose une option. Rend l'identifiant, ou lève `DatesPrises`.
 *
 * Le conflit n'est PAS une anomalie : c'est le cas nominal de deux
 * visiteurs qui visent la même semaine. Il a donc son propre type d'erreur,
 * pour que la route lui réponde autre chose qu'une panne.
 */
export async function poserOption(c: Config, d: DemandeOption): Promise<string> {
  try {
    return await rpc(c, 'api_poser_option', {
      p_reference: d.reference,
      p_debut: d.debut,
      p_fin: d.fin,
      p_voyageurs: d.voyageurs,
      p_nom: d.nom,
      p_email: d.email,
      p_telephone: d.telephone ?? '',
      p_message: d.message ?? '',
      p_total_cents: d.totalCents,
      p_acompte_cents: d.acompteCents,
    });
  } catch (e) {
    if (e instanceof ErreurBase && /LBE_DATES_PRISES/.test(e.message)) throw new DatesPrises();
    throw e;
  }
}

/**
 * Confirme un séjour après encaissement. Rend `true` si le statut a
 * réellement changé, `false` si l'occupation était déjà confirmée.
 *
 * Ce booléen n'est pas décoratif : c'est lui qui permet au webhook de
 * distinguer un premier passage d'un rejeu, et de n'envoyer le courriel de
 * confirmation qu'une fois.
 */
export function confirmer(c: Config, occupation: string, intent: string): Promise<boolean> {
  return rpc(c, 'api_confirmer', { p_occupation: occupation, p_intent: intent });
}

/* ------------------------------------------------------------
   Le back-office
   ------------------------------------------------------------ */

/**
 * Lecture directe d'une table, réservée aux pages d'administration.
 *
 * Le site public, lui, ne compose JAMAIS de requête : il appelle les
 * fonctions `api_*`, dont la signature l'empêche structurellement de lire
 * une donnée personnelle (voir la note en tête de `schema.sql`). Le
 * back-office a le besoin inverse — il est là pour voir les clients — et
 * ne peut donc pas passer par elles.
 *
 * ⚠️ N'appeler que derrière `exigeAdmin()`. Cette fonction lit avec la
 *    clé `service_role`, qui traverse RLS : ce qu'elle rend n'est filtré
 *    par personne d'autre que l'appelant.
 */
export function lis(c: Config, requete: string): Promise<any[]> {
  return appelle(c, requete, { method: 'GET' }).then((r) => r ?? []);
}

/** Modifie le statut d'une occupation et journalise l'action en base. */
export function changeStatutOccupation(
  c: Config,
  occupation: string,
  statut: 'option' | 'confirme' | 'annule',
  acteur: string,
): Promise<boolean> {
  return rpc(c, 'admin_modifier_statut', {
    p_occupation: occupation,
    p_statut: statut,
    p_acteur: acteur,
  });
}

/** Enregistre un texte ou une URL d'image modifiable depuis le back-office. */
export async function enregistreContenu(
  c: Config,
  cle: string,
  valeur: string,
  type: 'texte' | 'image',
  acteur: string,
): Promise<void> {
  await appelle(c, 'contenus_site?on_conflict=cle', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ cle, valeur, type, maj_par: acteur }),
  });
  await appelle(c, 'journal', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ action: 'contenu_modifie', detail: { cle, type }, acteur }),
  });
}

/** Dépose une image dans le bucket public du site et rend son URL. */
export async function enregistreImage(
  c: Config,
  fichier: File,
  cle: string,
): Promise<string> {
  const extension = fichier.type === 'image/png' ? 'png'
    : fichier.type === 'image/avif' ? 'avif'
      : fichier.type === 'image/webp' ? 'webp' : 'jpg';
  const nom = `${cle.replace(/[^a-z0-9.-]+/gi, '-')}-${Date.now()}.${extension}`;
  const chemin = `contenu/${nom}`;
  const res = await fetch(`${c.url}/storage/v1/object/medias-site/${chemin}`, {
    method: 'POST',
    headers: {
      apikey: c.cle,
      Authorization: `Bearer ${c.cle}`,
      'Content-Type': fichier.type,
      'x-upsert': 'false',
    },
    body: await fichier.arrayBuffer(),
  });
  if (!res.ok) {
    console.error('[contenu] upload image', res.status, (await res.text()).slice(0, 300));
    throw new ErreurBase('Envoi de l’image impossible.', String(res.status), res.status);
  }
  return `${c.url}/storage/v1/object/public/medias-site/${chemin}`;
}

/**
 * Décode un `daterange` tel que PostgREST le sert : `[2026-07-10,2026-07-14)`.
 *
 * Les fonctions `api_*` rendent déjà deux colonnes séparées ; une lecture
 * de table, elle, rend la chaîne brute. C'est le seul endroit qui sait la
 * lire — trois pages qui la découperaient chacune à leur façon finiraient
 * par ne pas s'accorder sur la borne haute.
 *
 * ⚠️ `fin` reste EXCLUE, conformément à la convention du schéma : c'est
 *    le jour du départ, pas une nuit occupée. L'affichage peut la
 *    présenter comme « départ le », jamais comme « dernière nuit ».
 */
export function bornes(periode: string): Periode | null {
  const m = /^[[(]([^,]*),([^,]*)[\])]$/.exec(String(periode ?? '').trim());
  return m && m[1] && m[2] ? { debut: m[1], fin: m[2] } : null;
}

/** Les occupations à publier en iCal : un identifiant, deux dates. */
export async function pourExportICal(c: Config): Promise<{ id: string; periode: Periode }[]> {
  const lignes = await rpc(c, 'api_export_ical', {});
  return (lignes ?? []).map((l: any) => ({ id: l.id, periode: { debut: l.debut, fin: l.fin } }));
}
