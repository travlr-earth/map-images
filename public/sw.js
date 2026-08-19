// mapimages service worker.
// Strategy: precache the app shell at install; cache-first for map tiles
// and same-origin static assets; network-first (shell fallback) for
// navigations. Bump the cache names to invalidate.

const SHELL_CACHE = "mapimages-static-v1";
const TILE_CACHE = "mapimages-tiles-v1";
const KEEP_CACHES = [SHELL_CACHE, TILE_CACHE];

const TILE_ORIGINS = ["https://tiles.openfreemap.org"];

const SHELL_URLS = [
  "/",
  "/index.html",
  "/site.webmanifest",
  "/assets/icon-192.png",
  "/assets/icon-512.png",
  "/assets/icon-maskable.png",
  "/assets/favicon-32.png",
  "/assets/favicon-16.png",
  "/assets/apple-touch-icon.png",
];

async function precacheShell() {
  const cache = await caches.open(SHELL_CACHE);
  // Fetch each asset individually so one 404 doesn't sink the install.
  await Promise.allSettled(
    SHELL_URLS.map(async (url) => {
      const res = await fetch(url, { cache: "no-cache" });
      if (res.ok) {
        await cache.put(url, res);
      }
    }),
  );
  await self.skipWaiting();
}

async function dropStaleCaches() {
  const names = await caches.keys();
  await Promise.all(
    names
      .filter((name) => !KEEP_CACHES.includes(name))
      .map((name) => caches.delete(name)),
  );
}

async function tileCacheFirst(request) {
  const cache = await caches.open(TILE_CACHE);
  const hit = await cache.match(request);
  if (hit) {
    return hit;
  }
  const res = await fetch(request);
  if (res.ok) {
    cache.put(request, res.clone());
  }
  return res;
}

self.addEventListener("install", (event) => {
  event.waitUntil(precacheShell());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(dropStaleCaches());
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);

  // Map tiles: long-lived, served cache-first.
  if (TILE_ORIGINS.includes(url.origin)) {
    event.respondWith(tileCacheFirst(request));
    return;
  }

  // Everything else only when same-origin.
  if (url.origin !== self.location.origin) {
    return;
  }

  // Navigations: try the network, fall back to the cached shell offline.
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match("/index.html")));
    return;
  }

  // Static assets: cache-first with network fallback.
  event.respondWith(
    caches.match(request).then((hit) => hit || fetch(request)),
  );
});
