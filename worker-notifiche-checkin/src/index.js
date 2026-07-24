// Worker separato dal sito principale (Cloudflare Pages), perché le Pages
// Functions non supportano l'esecuzione schedulata (cron) — serve un Worker
// a sé stante. Ogni giorno (vedi wrangler.toml) controlla quali pazienti
// hanno il check-in periodico in scadenza oggi e, se hanno una subscription
// attiva, invia loro una notifica push di promemoria.
//
// SUPABASE_SECRET_KEY e VAPID_PRIVATE_KEY vanno impostati come secret
// cifrati nel pannello del Worker (Settings → Variables and secrets).
// Il pannello da solo non basta a farli arrivare al runtime: il comando
// di deploy (Settings → Build configuration → Deploy command) li ripassa
// esplicitamente con "wrangler secret put" leggendoli dalle Build variables
// prima di eseguire "wrangler deploy".
//
// Si usa @pushforge/builder (basato su Web Crypto, nativo dei Workers) al
// posto della libreria "web-push": quest'ultima usa https.request di Node,
// non implementato dal runtime dei Cloudflare Workers ("[unenv] https.request
// is not implemented yet!"). VAPID_PRIVATE_KEY qui è una chiave JWK (stringa
// JSON), non più il formato base64url usato da web-push.
//
// Lo stesso cron giornaliero invia anche i promemoria email per gli
// appuntamenti in arrivo (circa 24-48h prima, per compensare la granularità
// giornaliera), tramite l'API HTTP di Brevo (BREVO_API_KEY, secret opzionale:
// i Worker non possono aprire connessioni SMTP dirette). Finché
// BREVO_API_KEY non è configurata l'invio viene saltato esplicitamente,
// senza errori.

import { buildPushHTTPRequest } from "@pushforge/builder";

const SUPABASE_URL = "https://scckmrmgbpvqqcungrsj.supabase.co";

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(inviaPromemoriaCheckin(env));
    ctx.waitUntil(inviaPromemoriaAppuntamenti(env));
  },

  // Trigger manuale (utile per testare senza aspettare il cron), protetto da un
  // token segreto: senza il token corretto risponde 404, così un estraneo non
  // può forzare l'invio di notifiche push ai pazienti né leggere i conteggi.
  // Il token va impostato come secret MANUAL_TRIGGER_TOKEN nelle impostazioni
  // del Worker; se non è impostato, l'endpoint è inerte (404) e resta attivo
  // solo il cron schedulato. Si passa come ?token=... oppure header
  // X-Trigger-Token. Confronto a tempo costante per non rivelare il token.
  async fetch(request, env) {
    const url = new URL(request.url);
    const fornito = url.searchParams.get("token") || request.headers.get("x-trigger-token") || "";
    if (!env.MANUAL_TRIGGER_TOKEN || !confrontoCostante(fornito, env.MANUAL_TRIGGER_TOKEN)) {
      return new Response("Not found", { status: 404 });
    }

    try {
      const checkin = await inviaPromemoriaCheckin(env);
      const appuntamenti = await inviaPromemoriaAppuntamenti(env);
      return new Response(JSON.stringify({ checkin, appuntamenti }, null, 2), {
        headers: { "Content-Type": "application/json" }
      });
    } catch (e) {
      return new Response(JSON.stringify({ errore: e.message }, null, 2), {
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }
  }
};

// Confronto di stringhe a tempo (quasi) costante, per non far dedurre il token
// dai tempi di risposta. La lunghezza non è segreta in questo contesto.
function confrontoCostante(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

async function inviaPromemoriaCheckin(env) {
  const richieste = ["SUPABASE_SECRET_KEY", "VAPID_PRIVATE_KEY", "VAPID_CONTACT_EMAIL"];
  const mancanti = richieste.filter((nome) => !env[nome]);
  if (mancanti.length > 0) {
    throw new Error(`Variabili/secret mancanti sul Worker: ${mancanti.join(", ")}. Aggiungile in Settings → Variables and secrets, poi rifai un deploy.`);
  }

  const privateJWK = JSON.parse(env.VAPID_PRIVATE_KEY);

  const pazienti = await chiamataRest(env, "GET", "/rest/v1/pazienti?frequenza_checkin=not.is.null&select=id,frequenza_checkin");

  let notificheInviate = 0;
  let subscriptionRimosse = 0;
  let errori = 0;
  const dettagliErrori = [];

  for (const paziente of pazienti) {
    const ultimoCheckin = await recuperaUltimoCheckin(env, paziente.id);
    const prossima = calcolaProssimoCheckin(ultimoCheckin?.data_rilevazione, paziente.frequenza_checkin);
    if (!prossima || !ScadeOggi(prossima)) continue;

    const subscriptions = await chiamataRest(env, "GET", `/rest/v1/push_subscriptions?paziente_id=eq.${paziente.id}&select=endpoint,p256dh,auth`);

    for (const sub of subscriptions) {
      try {
        const { endpoint, headers, body } = await buildPushHTTPRequest({
          privateJWK,
          subscription: { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          message: {
            payload: {
              title: "È ora del tuo check-in periodico",
              body: "Registra peso e circonferenze nella tua area personale."
            },
            adminContact: "mailto:" + env.VAPID_CONTACT_EMAIL
          }
        });

        const risposta = await fetch(endpoint, { method: "POST", headers, body });

        if (risposta.ok) {
          notificheInviate++;
        } else if (risposta.status === 404 || risposta.status === 410) {
          await rimuoviSubscription(env, sub.endpoint);
          subscriptionRimosse++;
        } else {
          const corpo = await risposta.text();
          console.error("Errore invio notifica push:", risposta.status, corpo);
          errori++;
          dettagliErrori.push({ statusCode: risposta.status, messaggio: corpo || null, corpo: null });
        }
      } catch (e) {
        console.error("Errore invio notifica push:", e);
        errori++;
        dettagliErrori.push({ statusCode: null, messaggio: e.message || String(e), corpo: null });
      }
    }
  }

  return {
    pazienti_con_frequenza: pazienti.length,
    notifiche_inviate: notificheInviate,
    subscription_rimosse: subscriptionRimosse,
    dettagli_errori: dettagliErrori,
    errori
  };
}

// ---------- Promemoria email appuntamenti ----------
// Finestra larga (oggi → +2 giorni) per compensare la granularità giornaliera
// del cron: "promemoria_inviato" evita che lo stesso appuntamento riceva più
// di un'email anche se il worker gira più volte nella finestra.

async function inviaPromemoriaAppuntamenti(env) {
  if (!env.BREVO_API_KEY) {
    return { brevo_non_configurato: true, promemoria_inviati: 0, promemoria_errori: 0, dettagli_errori_appuntamenti: [] };
  }

  const ora = new Date();
  const finestraFine = new Date(ora.getTime() + 2 * 24 * 60 * 60 * 1000);
  const appuntamenti = await chiamataRest(
    env,
    "GET",
    `/rest/v1/appuntamenti?promemoria_inviato=eq.false&data_ora=gte.${encodeURIComponent(ora.toISOString())}&data_ora=lte.${encodeURIComponent(finestraFine.toISOString())}&select=id,data_ora,tipologia,note,pazienti(nome,email)`
  );

  let inviati = 0;
  let errori = 0;
  const dettagliErrori = [];

  for (const app of appuntamenti) {
    const email = app.pazienti && app.pazienti.email;
    if (!email) {
      errori++;
      dettagliErrori.push({ appuntamentoId: app.id, messaggio: "Paziente senza email registrata nel profilo: promemoria non inviato." });
      continue;
    }

    try {
      await inviaEmailBrevo(env, {
        destinatarioEmail: email,
        destinatarioNome: (app.pazienti && app.pazienti.nome) || "",
        oggetto: "Promemoria appuntamento",
        testo: testoPromemoriaAppuntamento(app)
      });
      await chiamataRest(env, "PATCH", `/rest/v1/appuntamenti?id=eq.${app.id}`, { promemoria_inviato: true });
      inviati++;
    } catch (e) {
      console.error("Errore invio promemoria appuntamento:", e);
      errori++;
      dettagliErrori.push({ appuntamentoId: app.id, messaggio: e.message || String(e) });
    }
  }

  return {
    appuntamenti_in_finestra: appuntamenti.length,
    promemoria_inviati: inviati,
    promemoria_errori: errori,
    dettagli_errori_appuntamenti: dettagliErrori
  };
}

function testoPromemoriaAppuntamento(app) {
  const dataOra = new Date(app.data_ora);
  const dataFormattata = dataOra.toLocaleDateString("it-IT", { weekday: "long", day: "2-digit", month: "long", year: "numeric", timeZone: "Europe/Rome" });
  const oraFormattata = dataOra.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Rome" });
  const tipologiaLabel = app.tipologia === "remoto" ? "da remoto" : "in studio";
  let testo = `Ti ricordiamo il tuo appuntamento ${tipologiaLabel} di ${dataFormattata} alle ${oraFormattata}.`;
  if (app.note) testo += `\n\nNote dello studio: ${app.note}`;
  return testo;
}

async function inviaEmailBrevo(env, { destinatarioEmail, destinatarioNome, oggetto, testo }) {
  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "api-key": env.BREVO_API_KEY,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      sender: { email: env.VAPID_CONTACT_EMAIL, name: "NutriPlan" },
      to: [{ email: destinatarioEmail, name: destinatarioNome || undefined }],
      subject: oggetto,
      textContent: testo
    })
  });
  if (!res.ok) {
    throw new Error(`Errore invio email Brevo (${res.status}): ${await res.text()}`);
  }
}

function calcolaProssimoCheckin(ultimaData, frequenza) {
  if (!ultimaData || !frequenza) return null;
  const d = new Date(ultimaData);
  if (frequenza === "settimanale") d.setUTCDate(d.getUTCDate() + 7);
  else if (frequenza === "quindicinale") d.setUTCDate(d.getUTCDate() + 14);
  else if (frequenza === "mensile") d.setUTCMonth(d.getUTCMonth() + 1);
  else return null;
  return d;
}

function ScadeOggi(prossimaData) {
  const oggi = new Date();
  return prossimaData.toISOString().slice(0, 10) === oggi.toISOString().slice(0, 10);
}

async function recuperaUltimoCheckin(env, pazienteId) {
  const righe = await chiamataRest(
    env,
    "GET",
    `/rest/v1/checkin?paziente_id=eq.${pazienteId}&select=data_rilevazione&order=data_rilevazione.desc&limit=1`
  );
  return righe[0] || null;
}

async function rimuoviSubscription(env, endpoint) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/push_subscriptions?endpoint=eq.${encodeURIComponent(endpoint)}`, {
    method: "DELETE",
    headers: {
      apikey: env.SUPABASE_SECRET_KEY,
      Authorization: `Bearer ${env.SUPABASE_SECRET_KEY}`
    }
  });
  if (!res.ok) {
    console.error("Errore nella rimozione di una subscription scaduta:", await res.text());
  }
}

async function chiamataRest(env, metodo, percorso, corpo) {
  const headers = {
    apikey: env.SUPABASE_SECRET_KEY,
    Authorization: `Bearer ${env.SUPABASE_SECRET_KEY}`,
    "Content-Type": "application/json"
  };
  if (corpo !== undefined) headers.Prefer = "return=minimal";

  const res = await fetch(`${SUPABASE_URL}${percorso}`, {
    method: metodo,
    headers,
    body: corpo !== undefined ? JSON.stringify(corpo) : undefined
  });
  if (!res.ok) {
    throw new Error(`Errore chiamata Supabase (${res.status}): ${await res.text()}`);
  }
  if (corpo !== undefined) return null;
  return res.json();
}
