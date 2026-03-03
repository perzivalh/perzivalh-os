const CACHE_NAME = "perzivalh-chats-pwa-v9";
const SHELL_ASSETS = [
  "/",
  "/manifest.webmanifest?v=8",
  "/favicon-v8.ico",
  "/favicon-32-v8.png",
  "/apple-touch-icon-v8.png",
  "/pwa-icon-192-v8.png",
  "/pwa-icon-512-v8.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS)).catch(() => undefined)
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);
  const isSameOrigin = url.origin === self.location.origin;
  if (!isSameOrigin) {
    return;
  }

  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/socket.io/")) {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put("/", copy)).catch(() => undefined);
          return response;
        })
        .catch(async () => {
          const cachedRoot = await caches.match("/");
          return cachedRoot || Response.error();
        })
    );
    return;
  }

  const isStaticAsset =
    url.pathname.startsWith("/assets/") ||
    /\.(?:js|css|svg|png|jpg|jpeg|webp|gif|woff2?|ttf|ico|webmanifest)$/i.test(url.pathname);

  if (!isStaticAsset) {
    return;
  }

  event.respondWith(
    caches.match(request).then(async (cached) => {
      if (cached) {
        return cached;
      }
      const response = await fetch(request);
      if (response && response.ok) {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)).catch(() => undefined);
      }
      return response;
    })
  );
});

async function hasVisibleClient() {
  const clientList = await self.clients.matchAll({
    type: "window",
    includeUncontrolled: true,
  });
  return clientList.some(
    (client) =>
      client &&
      client.visibilityState === "visible"
  );
}

self.addEventListener("push", (event) => {
  if (!event.data) {
    return;
  }
  event.waitUntil(
    (async () => {
      let payload = {};
      try {
        payload = event.data.json();
      } catch (error) {
        payload = {
          title: "Nueva conversación pendiente",
          body: event.data.text(),
        };
      }

      if (await hasVisibleClient()) {
        return;
      }

      const title = payload.title || "Nueva conversación pendiente";
      const options = {
        body: payload.body || "Tienes una conversación pendiente por atender.",
        icon: payload.icon || "/pwa-icon-192-v8.png",
        badge: payload.badge || "/pwa-icon-192-v8.png",
        tag: payload.tag || "pending-conversation",
        renotify: payload.renotify !== false,
        requireInteraction: Boolean(payload.requireInteraction),
        data: payload.data || { url: "/" },
      };

      await self.registration.showNotification(title, options);
    })()
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    (async () => {
      const targetUrl = event.notification?.data?.url || "/";
      const clientList = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });

      for (const client of clientList) {
        if (!client) {
          continue;
        }
        if ("navigate" in client) {
          try {
            await client.navigate(targetUrl);
          } catch (error) {
            // ignore navigation errors
          }
        }
        if ("focus" in client) {
          return client.focus();
        }
      }

      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
      return undefined;
    })()
  );
});
