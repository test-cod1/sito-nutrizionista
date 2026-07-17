const CACHE_VERSION = "v1";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// Nessuna cache offline per ora: ogni richiesta va sempre in rete.
// La presenza di un service worker attivo è comunque richiesta dai
// browser per considerare il sito "installabile" come app.
self.addEventListener("fetch", (event) => {
  event.respondWith(fetch(event.request));
});
