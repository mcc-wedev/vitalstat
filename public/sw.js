// ═══════════════════════════════════════════════════════════
// VITALSTAT SERVICE WORKER v7
// Strategy: Network-first for EVERYTHING except hashed assets
// This ensures users ALWAYS get the latest version
// ═══════════════════════════════════════════════════════════

const CACHE_VERSION = "v7";
const CACHE_NAME = `vitalstat-${CACHE_VERSION}`;

// On install: skip waiting immediately — activate instantly
self.addEventListener("install", () => self.skipWaiting());

// On activate: purge ALL old caches, claim all clients, notify reload
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
      .then(() => {
        // Force reload all open tabs when new SW activates
        self.clients.matchAll({ type: "window" }).then((clients) => {
          clients.forEach((c) => c.postMessage({ type: "SW_UPDATED" }));
        });
      })
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);

  // ONLY cache-first for hashed static assets (immutable by definition)
  const isHashed = /\.[a-f0-9]{8,}\./.test(url.pathname);

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

  // EVERYTHING else (HTML, non-hashed JS/CSS, workers): network-first
  // If network fails, fall back to cache (offline support)
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
    // Nuclear: delete all caches
    caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k))));
  }
});
