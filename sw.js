const SW_VERSION = "20261005-center5";

self.addEventListener("install", (event) => {
  console.log("Service Worker installato:", SW_VERSION);
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  console.log("Service Worker attivo:", SW_VERSION);

  event.waitUntil(
    (async () => {
      const cacheNames = await caches.keys();

      await Promise.all(
        cacheNames
          .filter((name) => name.startsWith("lega-eroi-") && name !== `lega-eroi-${SW_VERSION}`)
          .map((name) => caches.delete(name))
      );

      await self.clients.claim();

      const windows = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true
      });

      for (const client of windows) {
        try {
          const currentUrl = new URL(client.url);

          if (currentUrl.searchParams.get("__appv") !== SW_VERSION) {
            currentUrl.searchParams.set("__appv", SW_VERSION);

            if ("navigate" in client) {
              await client.navigate(currentUrl.toString());
              continue;
            }
          }

          client.postMessage({
            type: "SW_UPDATED",
            version: SW_VERSION
          });
        } catch (error) {
          console.log("Impossibile aggiornare automaticamente una finestra:", String(error));
        }
      }
    })()
  );
});


self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  const freshDestinations = new Set(["document", "script", "style"]);
  if (!freshDestinations.has(request.destination)) return;

  event.respondWith(
    fetch(new Request(request, { cache: "no-store" }))
      .catch(() => fetch(request))
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

      for (const client of windows) {
        if ("focus" in client) {
          await client.focus();

          if ("navigate" in client) {
            try {
              await client.navigate(targetUrl);
              return;
            } catch {
            }
          }
        }
      }

      if (clients.openWindow) {
        await clients.openWindow(targetUrl);
      }
    })()
  );
});
