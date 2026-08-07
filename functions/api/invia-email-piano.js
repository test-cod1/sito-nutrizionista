// Cloudflare Pages Function: invia via email al paziente selezionato il piano
// alimentare e la lista della spesa (contenuto HTML già pronto, costruito
// lato client riusando gli stessi generatori della stampa/PDF).
// Riusa la stessa API HTTP di Brevo già impiegata dal worker-notifiche-checkin
// per i promemoria appuntamento: BREVO_API_KEY e VAPID_CONTACT_EMAIL vanno
// configurati anche qui, nelle Environment variables/secrets del progetto
// Cloudflare Pages (sono un prodotto separato dal Worker, non condividono i
// secret automaticamente).

import { autorizzaAdmin, risposta } from "./_auth.js";

const SUPABASE_URL = "https://scckmrmgbpvqqcungrsj.supabase.co";

export async function onRequestPost(context) {
  const { request, env } = context;

  const auth = await autorizzaAdmin(env, request, {
    messaggioNonAdmin: "Solo un amministratore può inviare email ai pazienti."
  });
  if (auth.errore) return auth.errore;
  const { secretKey } = auth;

  const brevoKey = env.BREVO_API_KEY;
  const mittenteEmail = env.VAPID_CONTACT_EMAIL;
  if (!brevoKey || !mittenteEmail) {
    return risposta(500, { error: "Invio email non configurato sul server (BREVO_API_KEY o VAPID_CONTACT_EMAIL mancanti)." });
  }

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return risposta(400, { error: "Richiesta non valida." });
  }

  const pazienteId = body.pazienteId;
  // Il client NON invia più HTML arbitrario: passa solo un breve testo di
  // validità (in chiaro). Il corpo dell'email lo costruiamo qui lato server con
  // escaping, così una sessione admin compromessa non può far spedire HTML
  // arbitrario dal mittente dello studio.
  const validita = (body.validita || "").trim();
  const allegati = Array.isArray(body.allegati) ? body.allegati : [];

  if (!pazienteId) {
    return risposta(400, { error: "pazienteId è obbligatorio." });
  }
  if (validita.length > 500) {
    return risposta(400, { error: "Testo di validità troppo lungo." });
  }
  if (allegati.some(a => !a || !a.nome || !a.contenuto)) {
    return risposta(400, { error: "Ogni allegato richiede nome e contenuto." });
  }

  // Limiti di dimensione: evitano payload enormi verso Brevo (contenuti in
  // base64). Sono ampi ma finiti; oltre, la richiesta viene respinta.
  const MAX_ALLEGATI = 5;                // numero massimo di allegati
  const MAX_ALLEGATI_TOTALE = 15_000_000; // ~15 MB totali (base64)
  if (allegati.length > MAX_ALLEGATI) {
    return risposta(413, { error: `Troppi allegati (massimo ${MAX_ALLEGATI}).` });
  }
  const dimensioneAllegati = allegati.reduce((tot, a) => tot + (a.contenuto ? a.contenuto.length : 0), 0);
  if (dimensioneAllegati > MAX_ALLEGATI_TOTALE) {
    return risposta(413, { error: "Gli allegati superano la dimensione massima consentita." });
  }

  const paziente = await recuperaPaziente(secretKey, pazienteId);
  if (!paziente) {
    return risposta(404, { error: "Paziente non trovato." });
  }
  if (!paziente.email) {
    return risposta(400, { error: "Il paziente non ha un'email registrata nel profilo." });
  }
  const dominioDest = paziente.email.split("@")[1]?.trim().toLowerCase();
  if (dominioDest === "gmail.com" || dominioDest === "googlemail.com") {
    return risposta(400, { error: "Gmail/Googlemail scartano in modo silenzioso queste email (policy DMARC). Usa un altro indirizzo per questo paziente." });
  }

  // Corpo email costruito lato server, con escaping di nome e testo di validità.
  const html =
    `<p>Ciao${paziente.nome ? " " + escapeHtml(paziente.nome) : ""},</p>` +
    `<p>in allegato trovi il tuo piano alimentare aggiornato e la lista della spesa settimanale.</p>` +
    (validita ? `<p>${escapeHtml(validita)}</p>` : "");

  try {
    await inviaEmailBrevo(brevoKey, mittenteEmail, {
      destinatarioEmail: paziente.email,
      destinatarioNome: paziente.nome || "",
      oggetto: "Il tuo piano alimentare e lista della spesa",
      html,
      allegati
    });
  } catch (e) {
    return risposta(502, { error: e.message });
  }

  return risposta(200, { ok: true });
}

async function recuperaPaziente(secretKey, pazienteId) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/pazienti?id=eq.${encodeURIComponent(pazienteId)}&select=nome,email`, {
    headers: {
      apikey: secretKey,
      Authorization: `Bearer ${secretKey}`
    }
  });
  if (!res.ok) return null;
  const righe = await res.json();
  return righe[0] || null;
}

async function inviaEmailBrevo(brevoKey, mittenteEmail, { destinatarioEmail, destinatarioNome, oggetto, html, allegati }) {
  const corpo = {
    sender: { email: mittenteEmail, name: "NutriPlan" },
    to: [{ email: destinatarioEmail, name: destinatarioNome || undefined }],
    subject: oggetto,
    htmlContent: html
  };
  if (allegati && allegati.length > 0) {
    corpo.attachment = allegati.map(a => ({ name: a.nome, content: a.contenuto }));
  }

  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "api-key": brevoKey,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(corpo)
  });
  if (!res.ok) {
    // Non rimandiamo al client la risposta grezza di Brevo (può contenere
    // dettagli di account/quota): la logghiamo e restituiamo un errore generico.
    const dettaglio = await res.text().catch(() => "");
    console.error("Errore invio email Brevo:", res.status, dettaglio);
    throw new Error(`Invio email non riuscito (${res.status}).`);
  }
}

function escapeHtml(testo) {
  return String(testo)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
