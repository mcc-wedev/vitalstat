// ═══════════════════════════════════════════════════════════
// VITALSTAT SERVICE WORKER — aggressive cache busting
// Bump BUILD_TS on each deploy via next.config.ts inject
// ═══════════════════════════════════════════════════════════

const CACHE_VERSION = "v5";
const CACHE_NAME = `vitalstat-${CACHE_VERSION}`;

// On install: skip waiting immediately — don't wait for old tabs
self.addEventListener("install", () => self.skipWaiting());

// On activate: purge ALL old caches, claim all clients
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
      .then(() => {
        // Notify all open tabs to reload
        self.clients.matchAll({ type: "window" }).then((clients) => {
          clients.forEach((c) => c.postMessage({ type: "SW_UPDATED" }));
        });
      })
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  // HTML pages: ALWAYS network-first (never serve stale HTML)
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // JS/CSS with hashed filenames: cache-first (hash guarantees uniqueness)
  const url = new URL(event.request.url);
  const isHashed = /\.[a-f0-9]{8,}\./.test(url.pathname) || url.pathname.includes("/_next/static/");

  if (isHashed) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        });
      })
    );
    return;
  }

  // Everything else: network-first with cache fallback
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});

// Listen for messages from the app
self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") {
    self.skipWaiting();
  }
  if (event.data === "FORCE_REFRESH") {
    // Nuclear option: delete all caches and reload
    caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k))));
  }
});
