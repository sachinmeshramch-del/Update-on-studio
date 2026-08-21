self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "Gold Signal", body: event.data ? event.data.text() : "New signal fired" };
  }

  const title   = data.title  ?? "Gold Scalp AI";
  const body    = data.body   ?? "New trading signal";
  const signal  = data.signal ?? "";
  const icon    = "/favicon.svg";
  const badge   = "/favicon.svg";
  const tag     = "gold-signal";
  const vibrate = signal === "LONG" ? [100, 50, 100] : [200, 50, 200, 50, 200];

  const notifOptions = {
    body,
    icon,
    badge,
    tag,
    vibrate,
    renotify:        true,
    requireInteraction: false,
    data: { url: self.registration.scope, signal: data.signal, entryPrice: data.entryPrice },
    actions: [
      { action: "open", title: "Open App" },
    ],
  };

  event.waitUntil(self.registration.showNotification(title, notifOptions));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url ?? self.registration.scope;
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url === url && "focus" in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow(url);
    }),
  );
});
