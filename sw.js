// Service worker: rende il sito installabile come PWA, riceve le notifiche
// push e fornisce un funzionamento offline SENZA mai mostrare dati vecchi.
//
// Strategia di caching (tutta network-first, la cache è solo una riserva):
//   - Dati Supabase (/rest/...) e app shell (HTML/CSS/JS/icone/foods.json/CDN):
//     si prova SEMPRE la rete per prima. Online → si vede sempre la versione
//     aggiornata (piano modificato, codice appena deployato); la copia in cache
//     viene usata solo quando la rete non è disponibile (offline).
//   - Auth Supabase (/auth/...) e Pages Functions (/api/...): mai dalla cache
//     (servire una sessione o una risposta d'azione "vecchia" sarebbe sbagliato).
//   - Solo le richieste GET vengono gestite: le mutazioni (POST/PATCH/DELETE:
//     invio check-in, salvataggio piano, invio email...) passano sempre in rete.
//
// Poiché tutto è network-first, NON serve cambiare CACHE_VERSION a ogni deploy:
// la freschezza è garantita dalla rete. CACHE_VERSION serve solo a dare un nome
// alle cache e a ripulire quelle vecchie se in futuro se ne cambia la struttura.

const CACHE_VERSION = "v1";
const SHELL_CACHE = `nutriplan-shell-${CACHE_VERSION}`;
const DATA_CACHE = `nutriplan-data-${CACHE_VERSION}`;

const SUPABASE_ORIGIN = "https://scckmrmgbpvqqcungrsj.supabase.co";

// File statici dell'app (stessa origine): precaricati all'installazione così il
// sito è consultabile offline anche su pagine non ancora aperte.
const APP_SHELL = [
  "./",
  "index.html",
  "style.css",
  "script.js",
  "config.js",
  "foods.json",
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
  "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js",
  "https://cdn.jsdelivr.net/npm/html5-qrcode@2.3.8/html5-qrcode.min.js",
  "https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js",
  "https://cdn.jsdelivr.net/npm/jspdf-autotable@3.8.2/dist/jspdf.plugin.autotable.min.js"
];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    // I file di base devono esserci tutti: se uno fallisce, meglio far fallire
    // l'installazione che avere un guscio offline incompleto.
    await cache.addAll(APP_SHELL);
    // Le librerie CDN sono "best-effort": se una non è raggiungibile in questo
    // momento non deve impedire l'installazione (verrà ricachata al primo uso).
    await Promise.allSettled(CDN_LIBS.map((url) => cache.add(url)));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    // Rimuove eventuali cache di versioni precedenti.
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

  // Dati dinamici Supabase (piano, profilo, check-in...): network-first sulla
  // cache-dati, così online si vede sempre la versione aggiornata.
  const isDatiSupabase = url.origin === SUPABASE_ORIGIN && url.pathname.startsWith("/rest/");
  if (isDatiSupabase) {
    event.respondWith(networkFirst(req, DATA_CACHE));
    return;
  }

  // App shell (HTML/CSS/JS/icone/foods.json/CDN): network-first sulla cache-shell.
  event.respondWith(networkFirst(req, SHELL_CACHE));
});

// Al logout la pagina chiede di svuotare la cache-dati (privacy su dispositivi
// condivisi): così l'eventuale copia offline dei dati di un utente non resta
// disponibile dopo l'uscita.
self.addEventListener("message", (event) => {
  if (event.data === "clear-data-cache") {
    event.waitUntil(caches.delete(DATA_CACHE));
  }
});

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
