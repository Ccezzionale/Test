self.addEventListener("install", () => {
  console.log("Service Worker installato");
});

self.addEventListener("activate", () => {
  console.log("Service Worker attivo");
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
  event.waitUntil(
    clients.openWindow(event.notification?.data?.url || "/Test/")
  );
});
