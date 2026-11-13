/* LEGA DEGLI EROI - Unico Service Worker per TUTTE le pagine.
 * Il comando prepara_sito.py sostituisce il segnaposto con la release reale.
 */
const SW_VERSION = "v20261113-push-deeplinks";
const APP_CACHE_PREFIX = "lega-eroi-";

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(n => n.startsWith(APP_CACHE_PREFIX)).map(n => caches.delete(n)));
    await self.clients.claim();
    const pages = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const page of pages) {
      page.postMessage({ type: "SW_UPDATED", version: SW_VERSION });
    }
  })());
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "GET_SW_VERSION") {
    const channel = event.ports && event.ports[0];
    if (channel) channel.postMessage({ version: SW_VERSION });
    else if (event.source) event.source.postMessage({ type: "SW_VERSION", version: SW_VERSION });
  }
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // Non toccare le fetch verso Supabase, servizi di pagamento o domini esterni.
  // Le risorse essenziali non devono mai provenire da una cache obsoleta.
  const essential = request.mode === "navigate" ||
    ["document", "script", "style", "worker", "sharedworker", "manifest", "image", "font"].includes(request.destination) ||
    /\.(?:json|webmanifest)$/i.test(url.pathname);
  if (!essential) return;

  event.respondWith((async () => {
    try {
      return await fetch(new Request(request, { cache: "no-store" }));
    } catch (error) {
      if (request.mode === "navigate") {
        const html = '<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Connessione necessaria</title></head><body style="font:16px system-ui;background:#071e34;color:white;padding:28px;max-width:600px;margin:auto"><h1>Connessione non disponibile</h1><p>Per evitare di mostrare dati o pagine non aggiornati, la Lega degli Eroi necessita della connessione Internet.</p><button style="padding:12px 20px;border-radius:10px;border:0;font:inherit" onclick="location.reload()">Riprova</button></body></html>';
        return new Response(html, { status: 503, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
      }
      return Response.error();
    }
  })());
});

// Notifiche push: volutamente identiche a quelle già usate dalla Lega.
self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = {}; }
  event.waitUntil(self.registration.showNotification(data.title || "Lega degli Eroi", {
    body: data.body || "È il tuo turno",
    icon: "/Test/icon-192.png",
    badge: "/Test/icon-192.png",
    data: { url: data.url || "/Test/" }
  }));
});

// Ogni push deve aprire la pagina prevista, non semplicemente riportare l'app in Home.
function safePushDestination(value) {
  const scope = new URL(self.registration.scope);
  try {
    const destination = new URL(value || scope.href, scope.href);
    if (destination.origin !== scope.origin || !destination.pathname.startsWith(scope.pathname)) {
      return scope.href;
    }
    return destination.href;
  } catch (_) {
    return scope.href;
  }
}

self.addEventListener("notificationclick", (event) => {
  const targetUrl = safePushDestination(event.notification?.data?.url);
  const expected = new URL(targetUrl);
  event.notification.close();

  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });

    // Se la destinazione è già aperta, riutilizzarla senza passare dalla Home.
    for (const client of windows) {
      try {
        const current = new URL(client.url);
        if (current.origin === expected.origin && current.pathname === expected.pathname) {
          await client.focus();
          return;
        }
      } catch (_) { /* Finestra non disponibile */ }
    }

    // Prima navigare, POI dare il focus. Un navigate() che restituisce null
    // non è un successo: altrimenti su alcuni dispositivi resta aperta la Home.
    for (const client of windows) {
      if (typeof client.navigate !== "function") continue;
      try {
        const navigated = await client.navigate(targetUrl);
        if (!navigated) continue;
        const actual = new URL(navigated.url);
        if (actual.origin !== expected.origin || actual.pathname !== expected.pathname) continue;
        if (typeof navigated.focus === "function") await navigated.focus();
        return;
      } catch (_) { /* Aprire una nuova finestra come fallback */ }
    }

    if (self.clients.openWindow) {
      const opened = await self.clients.openWindow(targetUrl);
      if (opened && typeof opened.focus === "function") await opened.focus();
    }
  })());
});
