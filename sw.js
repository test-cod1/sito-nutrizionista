// Service worker: rende il sito installabile come PWA, riceve le notifiche
// push e fornisce un funzionamento offline SENZA mai mostrare dati vecchi.
//
// Strategia di caching:
//   - App shell (HTML/CSS/JS/icone/foods.json/CDN): network-first. Online → si
//     vede sempre la versione aggiornata; la copia in cache serve solo offline.
//   - Piano alimentare (/rest/v1/diete): network-first sulla cache-dati, così il
//     paziente può consultare il proprio piano anche offline.
//   - TUTTI gli altri dati Supabase (/rest/...): rete diretta, MAI in cache.
//     Sono dati sanitari (peso, allergie, check-in e — per l'admin — l'elenco
//     pazienti) che non devono restare in chiaro nella Cache Storage. Offline
//     non sono disponibili (l'app mostra un messaggio di errore di caricamento).
//   - Auth Supabase (/auth/...) e Pages Functions (/api/...): mai dalla cache
//     (servire una sessione o una risposta d'azione "vecchia" sarebbe sbagliato).
//   - Solo le richieste GET vengono gestite: le mutazioni (POST/PATCH/DELETE:
//     invio check-in, salvataggio piano, invio email...) passano sempre in rete.
//
// Poiché la shell è network-first, NON serve cambiare CACHE_VERSION a ogni
// deploy: la freschezza è garantita dalla rete. CACHE_VERSION serve a dare un
// nome alle cache e a ripulire quelle vecchie se se ne cambia la struttura, MA
// è anche la leva per PROPAGARE un aggiornamento alle sessioni già aperte:
// cambiando questa stringa il browser rileva un nuovo service worker, lo attiva
// (skipWaiting + clients.claim) e la pagina riceve "controllerchange" →
// - paziente: overlay bloccante "Ricarica" (mostraAggiornamentoBloccante)
// - admin: barra non invasiva "Ricarica" (mostraAvvisoAggiornamento)
// Quindi: per le modifiche importanti che devono arrivare SUBITO a tutti,
// incrementa CACHE_VERSION nello stesso commit.

const CACHE_VERSION = "v2";
const SHELL_CACHE = `nutriplan-shell-${CACHE_VERSION}`;
// v2: nome nuovo per far ELIMINARE (all'activate) la vecchia cache-dati v1 che
// conteneva TUTTE le tabelle /rest/. Da ora questa cache contiene solo /diete.
const DATA_CACHE = "nutriplan-data-v2";

const SUPABASE_ORIGIN = "https://scckmrmgbpvqqcungrsj.supabase.co";

// File statici dell'app (stessa origine): precaricati all'installazione così il
// sito è consultabile offline anche su pagine non ancora aperte.
// File essenziali per far girare l'app offline: devono esserci TUTTI (addAll
// atomico). Se manca uno di questi il guscio offline sarebbe inservibile.
const APP_SHELL_CRITICO = [
  "./",
  "index.html",
  "style.css",
  "script.js",
  "tema-init.js",
  "config.js",
  "foods.json"
];

// File utili ma non indispensabili all'avvio (giochi, icone, manifest, privacy):
// best-effort. Se uno non è raggiungibile al momento dell'install NON deve far
// fallire l'intera installazione della PWA (verrà ricachato al primo uso).
const APP_SHELL_OPZIONALE = [
  "manifest.json",
  "privacy.html",
  "giochi.html",
  "giochi.css",
  "giochi.js",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/apple-touch-icon.png"
];

// Librerie caricate da CDN: servono per far partire l'app anche offline
// (altrimenti la pagina non riesce nemmeno a mostrare il piano già in cache).
// Gli URL sono "pinnati" a una versione precisa, quindi cacharli è sicuro.
const CDN_LIBS = [
  "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.111.0/dist/umd/supabase.min.js",
  "https://cdn.jsdelivr.net/npm/html5-qrcode@2.3.8/html5-qrcode.min.js",
  "https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js",
  "https://cdn.jsdelivr.net/npm/jspdf-autotable@3.8.2/dist/jspdf.plugin.autotable.min.js"
];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    // Solo i file essenziali sono atomici: se uno di questi manca meglio far
    // fallire l'installazione che avere un guscio offline inservibile.
    await cache.addAll(APP_SHELL_CRITICO);
    // File opzionali e librerie CDN: best-effort. Un file non critico mancante
    // (es. un'icona rinominata in un deploy futuro) non deve più bloccare
    // l'installazione dell'intera PWA.
    await Promise.allSettled([...APP_SHELL_OPZIONALE, ...CDN_LIBS].map((url) => cache.add(url)));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    // Tiene solo la shell corrente e la cache-dati corrente (DATA_CACHE = v2,
    // solo /diete); elimina tutto il resto, inclusa la vecchia "nutriplan-data-v1"
    // che conteneva TUTTE le tabelle /rest/ → i dati sanitari cachati in
    // precedenza vengono così purgati.
    const nomi = await caches.keys();
    await Promise.all(
      nomi
        .filter((n) => n !== SHELL_CACHE && n !== DATA_CACHE)
        .map((n) => caches.delete(n))
    );
    await self.clients.claim();
  })());
});

// Strategia comune: prova la rete, in caso di successo aggiorna la cache e
// restituisce la risposta fresca; se la rete fallisce (offline) usa la copia
// in cache. Per le navigazioni offline, ripiega sulla home in cache.
async function networkFirst(req, nomeCache) {
  const cache = await caches.open(nomeCache);
  try {
    const risposta = await fetch(req);
    // Salva solo risposte valide (ok) oppure opache (librerie CDN no-cors).
    if (risposta && (risposta.ok || risposta.type === "opaque")) {
      cache.put(req, risposta.clone());
    }
    return risposta;
  } catch (errore) {
    const inCache = await cache.match(req);
    if (inCache) return inCache;
    if (req.mode === "navigate") {
      const home = (await cache.match("index.html")) || (await cache.match("./"));
      if (home) return home;
    }
    throw errore;
  }
}

self.addEventListener("fetch", (event) => {
  const req = event.request;

  // Solo GET: ogni mutazione (invio check-in, salvataggio piano, email, ecc.)
  // passa direttamente in rete, senza cache.
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // Auth Supabase e Pages Functions (/api/): sempre e solo rete diretta.
  const isAuth = url.origin === SUPABASE_ORIGIN && url.pathname.startsWith("/auth/");
  const isApi = url.origin === self.location.origin && url.pathname.startsWith("/api/");
  if (isAuth || isApi) return; // non intercettata: la gestisce il browser

  // Piano alimentare (/rest/v1/diete): network-first sulla cache-dati, così il
  // paziente può consultarlo offline. È l'UNICA tabella /rest/ che cachiamo.
  const isPiano = url.origin === SUPABASE_ORIGIN && url.pathname.startsWith("/rest/v1/diete");
  if (isPiano) {
    event.respondWith(networkFirst(req, DATA_CACHE));
    return;
  }

  // Ogni ALTRO dato Supabase (/rest/): rete diretta, MAI in cache. Sono dati
  // sanitari (peso, allergie, check-in, elenco pazienti) che non vanno lasciati
  // in chiaro nella Cache Storage. Offline non sono disponibili: l'app mostra un
  // messaggio di errore di caricamento.
  const isAltriDatiSupabase = url.origin === SUPABASE_ORIGIN && url.pathname.startsWith("/rest/");
  if (isAltriDatiSupabase) return; // non intercettata: la gestisce il browser (nessuna cache)

  // Risorse esterne dinamiche (es. immagini prodotto Open Food Facts): rete
  // diretta, NON in cache-shell. Altrimenti si accumulerebbero risposte che non
  // vengono mai invalidate (la shell si aggiorna solo con network-first sui suoi
  // file). Le librerie CDN note restano invece cache-abili.
  const isSameOrigin = url.origin === self.location.origin;
  const isCdnLib = url.origin === "https://cdn.jsdelivr.net";
  if (!isSameOrigin && !isCdnLib) return; // non intercettata: la gestisce il browser

  // App shell (HTML/CSS/JS/icone/foods.json/CDN): network-first sulla cache-shell.
  event.respondWith(networkFirst(req, SHELL_CACHE));
});

// Nota: la pulizia della cache-dati al logout (privacy su dispositivi condivisi)
// è gestita direttamente dalla pagina in effettuaLogout(), che cancella tutte le
// cache "nutriplan-data-*" via Cache API. Non serve un handler di messaggi qui.

// Promemoria check-in periodico, inviato dal job schedulato lato server.
self.addEventListener("push", (event) => {
  let dati = {};
  try {
    dati = event.data ? event.data.json() : {};
  } catch (e) {
    dati = { title: "NutriPlan", body: event.data ? event.data.text() : "" };
  }

  const titolo = dati.title || "È ora del tuo check-in periodico";
  const opzioni = {
    body: dati.body || "Registra peso e circonferenze nella tua area personale.",
    icon: "icons/icon-192.png",
    badge: "icons/icon-192.png",
    tag: "checkin-promemoria"
  };

  event.waitUntil(self.registration.showNotification(titolo, opzioni));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((elenco) => {
      for (const client of elenco) {
        if ("focus" in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow("/");
    })
  );
});
