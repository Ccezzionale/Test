const SW_VERSION = "20261005-center2";

self.addEventListener("install", (event) => {
  console.log("Service Worker installato:", SW_VERSION);

  // La nuova versione non resta in attesa dietro quella precedente.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  console.log("Service Worker attivo:", SW_VERSION);

  event.waitUntil(
    (async () => {
      // Se in futuro dovessero comparire vecchie Cache Storage create
      // da versioni precedenti, le eliminiamo. Il worker attuale non
      // usa cache applicative, ma così evitiamo residui futuri.
      const cacheNames = await caches.keys();

      await Promise.all(
        cacheNames
          .filter((name) => name.startsWith("lega-eroi-") && name !== `lega-eroi-${SW_VERSION}`)
          .map((name) => caches.delete(name))
      );

      // Prende immediatamente controllo delle pagine/PWA già aperte.
      await self.clients.claim();

      // Comunica alle pagine che un nuovo worker è diventato attivo.
      // La pagina può così ricaricarsi una volta e prendere JS/CSS nuovi.
      const windows = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true
      });

      for (const client of windows) {
        client.postMessage({
          type: "SW_UPDATED",
          version: SW_VERSION
        });
      }
    })()
  );
});

self.addEventListener("push", (event) => {
  let data = {};

  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }

  event.waitUntil(
    self.registration.showNotification(data.title || "Lega degli Eroi", {
      body: data.body || "È il tuo turno",
      icon: "/Test/icon-192.png",
      badge: "/Test/icon-192.png",
      data: {
        url: data.url || "/Test/"
      }
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const targetUrl = event.notification?.data?.url || "/Test/";

  event.waitUntil(
    (async () => {
      const windows = await clients.matchAll({
        type: "window",
        includeUncontrolled: true
      });

      // Se l'app è già aperta, la riutilizziamo invece di aprire
      // l'ennesima scheda come un criceto iperattivo.
      for (const client of windows) {
        if ("focus" in client) {
          await client.focus();

          if ("navigate" in client) {
            try {
              await client.navigate(targetUrl);
            } catch {
              // Fallback sotto: apriamo una nuova finestra.
            }
          }

          return;
        }
      }

      if (clients.openWindow) {
        await clients.openWindow(targetUrl);
      }
    })()
  );
});
