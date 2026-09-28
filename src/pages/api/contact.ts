/* ============================================================
   Réception des formulaires du site.

   Un courriel part vers l'agence via Resend, puis un accusé de réception
   part vers le visiteur. Sans clé Resend configurée, on le dit franchement
   plutôt que de laisser croire que le message est parti.
   ============================================================ */
export const prerender = false;

import type { APIRoute } from 'astro';
import { AGENCY } from '../../lib/legal';

const env = (key: string, runtime?: any): string =>
  runtime?.[key] ?? (import.meta.env as any)?.[key] ?? '';

const clean = (v: FormDataEntryValue | null, max = 2000) =>
  typeof v === 'string' ? v.trim().slice(0, max) : '';

const escape = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });

export const POST: APIRoute = async ({ request, locals }) => {
  const form = await request.formData().catch(() => null);
  if (!form) return json(400, { error: 'Requête invalide.' });

  // Piège à robots : un champ invisible que seul un automate remplit.
  if (clean(form.get('_hp'))) return json(200, { ok: true });

  const name = clean(form.get('Nom') ?? form.get('name'), 120);
  const email = clean(form.get('Email') ?? form.get('E-mail') ?? form.get('email'), 160);
  const phone = clean(form.get('Téléphone') ?? form.get('phone'), 40);
  const message = clean(form.get('Message') ?? form.get('message'));
  const subject = clean(form.get('_subject'), 200) || 'Demande — Chalet Cosy';
  const propertyRef = clean(form.get('Bien'), 200);

  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return json(422, { error: 'Renseignez une adresse e-mail valide.' });
  }
  if (!name && !message) {
    return json(422, { error: 'Merci de compléter le formulaire.' });
  }

  const runtime = (locals as any).runtime?.env;
  const apiKey = env('RESEND_API_KEY', runtime);
  const from = env('CONTACT_FROM', runtime) || 'Chalet Cosy <onboarding@resend.dev>';
  const to = env('CONTACT_TO', runtime) || AGENCY.email;

  if (!apiKey) {
    // Pas de service d'envoi : on ne ment pas au visiteur.
    return json(503, {
      ok: false,
      error: "L'envoi est momentanément indisponible. Appelez-nous ou écrivez directement à " + AGENCY.email + '.',
    });
  }

  const rows: [string, string][] = [
    ['Nom', name || '—'],
    ['E-mail', email],
    ['Téléphone', phone || '—'],
    ...(propertyRef ? ([['Bien concerné', propertyRef]] as [string, string][]) : []),
  ];

  const html = `
    <div style="font-family:Georgia,serif;max-width:560px;margin:0 auto;color:#1C2A20">
      <p style="font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:#8A6A3F;margin:0 0 6px">
        Nouvelle demande
      </p>
      <h1 style="font-size:22px;font-weight:500;margin:0 0 20px">${escape(subject)}</h1>
      <table style="width:100%;border-collapse:collapse;font-family:system-ui,sans-serif;font-size:14px">
        ${rows
          .map(
            ([k, v]) => `<tr>
              <td style="padding:8px 0;border-bottom:1px solid #E0DACE;color:#6E6A60;width:150px">${k}</td>
              <td style="padding:8px 0;border-bottom:1px solid #E0DACE">${escape(v)}</td>
            </tr>`,
          )
          .join('')}
      </table>
      ${
        message
          ? `<p style="font-family:system-ui,sans-serif;font-size:14px;line-height:1.7;
                border-left:2px solid #E0DACE;padding-left:16px;margin:22px 0 0;white-space:pre-line">${escape(message)}</p>`
          : ''
      }
      <p style="font-family:system-ui,sans-serif;font-size:12px;color:#9A958A;margin-top:28px">
        Envoyé depuis chaletcosy.pages.dev — répondez directement à ce message pour joindre le visiteur.
      </p>
    </div>`;

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from,
        to: [to],
        reply_to: email,
        subject: `${subject}${name ? ` — ${name}` : ''}`,
        html,
      }),
    });

    if (!res.ok) {
      console.error('[contact] Resend', res.status, await res.text());
      return json(502, { ok: false, error: "L'envoi a échoué. Réessayez ou appelez-nous." });
    }
  } catch (e) {
    console.error('[contact] réseau', e);
    return json(502, { ok: false, error: "L'envoi a échoué." });
  }

  /* Accusé de réception au visiteur (sans bloquer la réponse) */
  const ack = fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from,
      to: [email],
      subject: 'Votre demande a bien été reçue — Chalet Cosy',
      html: `
        <div style="font-family:Georgia,serif;max-width:520px;margin:0 auto;color:#1C2A20">
          <h1 style="font-size:22px;font-weight:500;margin:0 0 16px">Merci${name ? `, ${escape(name)}` : ''}.</h1>
          <p style="font-family:system-ui,sans-serif;font-size:14px;line-height:1.7;color:#33302A">
            Nous avons bien reçu votre demande. Un conseiller vous répond personnellement
            sous 24 heures ouvrées.
          </p>
          <p style="font-family:system-ui,sans-serif;font-size:14px;line-height:1.7;color:#33302A">
            Pour toute urgence : <a href="${AGENCY.phoneHref}" style="color:#8A6A3F">${AGENCY.phone}</a>
          </p>
          <p style="font-family:system-ui,sans-serif;font-size:12px;color:#9A958A;margin-top:26px">
            ${AGENCY.name} — ${AGENCY.address}, ${AGENCY.postalCode} ${AGENCY.city}<br>
            ${AGENCY.card.number}
          </p>
        </div>`,
    }),
  }).catch(() => null);

  const waitUntil = (locals as any).runtime?.ctx?.waitUntil;
  if (typeof waitUntil === 'function') waitUntil(ack);

  return json(200, {
    ok: true,
    notice: 'Votre demande est envoyée. Un conseiller vous répond sous 24 heures.',
  });
};
