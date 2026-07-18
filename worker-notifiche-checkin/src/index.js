// Worker separato dal sito principale (Cloudflare Pages), perché le Pages
// Functions non supportano l'esecuzione schedulata (cron) — serve un Worker
// a sé stante. Ogni giorno (vedi wrangler.toml) controlla quali pazienti
// hanno il check-in periodico in scadenza oggi e, se hanno una subscription
// attiva, invia loro una notifica push di promemoria.

import webpush from "web-push";

const SUPABASE_URL = "https://scckmrmgbpvqqcungrsj.supabase.co";

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(inviaPromemoriaCheckin(env));
  },

  // GET su "/" esegue lo stesso controllo su richiesta manuale, utile per
  // verificare che il worker sia configurato correttamente senza aspettare
  // l'orario del cron.
  async fetch(request, env) {
    try {
      const risultato = await inviaPromemoriaCheckin(env);
      return new Response(JSON.stringify(risultato, null, 2), {
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

async function inviaPromemoriaCheckin(env) {
  webpush.setVapidDetails(
    "mailto:" + env.VAPID_CONTACT_EMAIL,
    env.VAPID_PUBLIC_KEY,
    env.VAPID_PRIVATE_KEY
  );

  const pazienti = await chiamataRest(env, "GET", "/rest/v1/pazienti?frequenza_checkin=not.is.null&select=id,frequenza_checkin");

  let notificheInviate = 0;
  let subscriptionRimosse = 0;
  let errori = 0;

  for (const paziente of pazienti) {
    const ultimoCheckin = await recuperaUltimoCheckin(env, paziente.id);
    const prossima = calcolaProssimoCheckin(ultimoCheckin?.data_rilevazione, paziente.frequenza_checkin);
    if (!prossima || !ScadeOggi(prossima)) continue;

    const subscriptions = await chiamataRest(env, "GET", `/rest/v1/push_subscriptions?paziente_id=eq.${paziente.id}&select=endpoint,p256dh,auth`);

    for (const sub of subscriptions) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify({
            title: "È ora del tuo check-in periodico",
            body: "Registra peso e circonferenze nella tua area personale."
          })
        );
        notificheInviate++;
      } catch (e) {
        if (e.statusCode === 404 || e.statusCode === 410) {
          await rimuoviSubscription(env, sub.endpoint);
          subscriptionRimosse++;
        } else {
          console.error("Errore invio notifica push:", e);
          errori++;
        }
      }
    }
  }

  return {
    pazienti_con_frequenza: pazienti.length,
    notifiche_inviate: notificheInviate,
    subscription_rimosse: subscriptionRimosse,
    errori
  };
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

async function chiamataRest(env, metodo, percorso) {
  const res = await fetch(`${SUPABASE_URL}${percorso}`, {
    method: metodo,
    headers: {
      apikey: env.SUPABASE_SECRET_KEY,
      Authorization: `Bearer ${env.SUPABASE_SECRET_KEY}`,
      "Content-Type": "application/json"
    }
  });
  if (!res.ok) {
    throw new Error(`Errore chiamata Supabase (${res.status}): ${await res.text()}`);
  }
  return res.json();
}
