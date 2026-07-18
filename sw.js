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
