const CACHE_NAME = "perzivalh-chats-pwa-v3";
const SHELL_ASSETS = [
  "/",
  "/manifest.webmanifest?v=3",
  "/favicon-32.png?v=3",
  "/apple-touch-icon.png?v=3",
  "/pwa-icon-192.png?v=3",
  "/pwa-icon-512.png?v=3",
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
