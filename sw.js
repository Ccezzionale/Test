/* LEGA DEGLI EROI - Unico Service Worker per TUTTE le pagine.
 * Il comando prepara_sito.py sostituisce il segnaposto con la release reale.
 */
const SW_VERSION = "v20261113-push-route-v2";
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

// Il browser Android puo' riaprire la PWA sulla Home anche da una push con deep link.
// Conserviamo la destinazione per pochi secondi: la pagina riaperta chiede al worker
// il collegamento e completa la navigazione tramite location.assign().
const PUSH_ROUTE_CACHE = 'lega-push-route-v1';
const PUSH_ROUTE_TTL_MS = 90000;
function pushRouteKey() {
  return new URL('__pending_push_route__', self.registration.scope).href;
}
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
async function rememberPushRoute(url) {
  try {
    const cache = await caches.open(PUSH_ROUTE_CACHE);
    await cache.put(pushRouteKey(), new Response(JSON.stringify({ url, time: Date.now() }), {
      headers: { 'Content-Type': 'application/json' }
    }));
  } catch (error) {
    console.warn('Lega: impossibile memorizzare temporaneamente la destinazione push', error);
  }
}
async function getPendingPushRoute() {
  try {
    const cache = await caches.open(PUSH_ROUTE_CACHE);
    const response = await cache.match(pushRouteKey());
    if (!response) return null;
    const record = await response.json();
    if (!record?.time || Date.now() - record.time > PUSH_ROUTE_TTL_MS || record.time > Date.now() + 10000) {
      await cache.delete(pushRouteKey());
      return null;
    }
    const url = safePushDestination(record.url);
    return new URL(url).pathname === new URL(self.registration.scope).pathname ? null : url;
  } catch (_) {
    return null;
  }
}
async function clearPendingPushRoute(url) {
  try {
    const cache = await caches.open(PUSH_ROUTE_CACHE);
    const response = await cache.match(pushRouteKey());
    if (!response) return;
    const record = await response.json();
    if (safePushDestination(record?.url) === safePushDestination(url)) await cache.delete(pushRouteKey());
  } catch (_) { /* Non bloccare la navigazione */ }
}
function askClientToOpen(client, url) {
  try {
    client?.postMessage?.({ type: 'LEGA_PUSH_NAVIGATE', url });
  } catch (_) { /* La pagina completera' la navigazione al prossimo avvio */ }
}
self.addEventListener('message', (event) => {
  const source = event.source;
  const kind = event.data?.type;
  if (!source || (kind !== 'LEGA_PUSH_CLIENT_READY' && kind !== 'LEGA_PUSH_ROUTE_ACK')) return;
  event.waitUntil((async () => {
    const pending = await getPendingPushRoute();
    if (!pending) return;
    try {
      const current = new URL(source.url);
      const scope = new URL(self.registration.scope);
      if (current.origin !== scope.origin || !current.pathname.startsWith(scope.pathname)) return;
      if (kind === 'LEGA_PUSH_ROUTE_ACK') {
        const expected = new URL(pending);
        if (current.pathname === expected.pathname) await clearPendingPushRoute(pending);
      } else {
        askClientToOpen(source, pending);
      }
    } catch (_) { /* Origine o client non valido */ }
  })());
});

self.addEventListener("notificationclick", (event) => {
  const targetUrl = safePushDestination(event.notification?.data?.url);
  const expected = new URL(targetUrl);
  const scope = new URL(self.registration.scope);
  event.notification.close();

  event.waitUntil((async () => {
    // Senza destinazione specifica, mantenere il normale avvio sulla Home.
    const hasDeepLink = expected.pathname !== scope.pathname &&
      expected.pathname !== scope.pathname + 'index.html';
    if (hasDeepLink) await rememberPushRoute(targetUrl);

    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    // Reimpiega una pagina gia' aperta SOLO se e' la destinazione richiesta.
    for (const client of windows) {
      try {
        if (new URL(client.url).pathname !== expected.pathname) continue;
        if (typeof client.focus === 'function') await client.focus();
        if (hasDeepLink) askClientToOpen(client, targetUrl);
        return;
      } catch (_) { /* Prova un'altra finestra */ }
    }

    // Navigare alla pagina prima di portare la finestra in primo piano.
    for (const client of windows) {
      if (typeof client.navigate !== 'function') continue;
      try {
        const navigated = await client.navigate(targetUrl);
        if (!navigated || new URL(navigated.url).pathname !== expected.pathname) continue;
        if (typeof navigated.focus === 'function') await navigated.focus();
        if (hasDeepLink) askClientToOpen(navigated, targetUrl);
        return;
      } catch (_) { /* Android potrebbe gestire l'apertura tramite la PWA */ }
    }

    if (self.clients.openWindow) {
      try {
        let opened = await self.clients.openWindow(targetUrl);
        if (opened) {
          if (new URL(opened.url).pathname !== expected.pathname && typeof opened.navigate === 'function') {
            try { opened = await opened.navigate(targetUrl) || opened; } catch (_) {}
          }
          if (typeof opened.focus === 'function') await opened.focus();
          if (hasDeepLink) askClientToOpen(opened, targetUrl);
          return;
        }
      } catch (_) { /* Fallback sulla finestra esistente */ }
    }

    // Se il sistema operativo ha riaperto soltanto la Home, il messaggio
    // viene ricevuto appena app-updates.js torna attivo.
    if (hasDeepLink && windows.length) {
      try {
        if (typeof windows[0].focus === 'function') await windows[0].focus();
        askClientToOpen(windows[0], targetUrl);
      } catch (_) {}
    }
  })());
});
