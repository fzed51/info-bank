// Gabarit du service worker : `vite build` remplace la version et la liste des fichiers.
// Coquille de l'app : cache d'abord. Page et données chiffrées : réseau d'abord, cache hors ligne.
const version = "2c3d42699d0e";
const precache = ["./","./assets/fraunces-latin-ext-opsz-normal-CJcjJNj7.woff2","./assets/fraunces-latin-opsz-normal-DihXLNYH.woff2","./assets/ibm-plex-mono-latin-400-normal-DMJ8VG8y.woff2","./assets/ibm-plex-mono-latin-500-normal-DSY6xOcd.woff2","./assets/ibm-plex-mono-latin-ext-400-normal-BmRBH3aV.woff2","./assets/ibm-plex-mono-latin-ext-500-normal-CAhNIIs5.woff2","./assets/index-1IoCpt9Z.js","./assets/index-DZohEJtU.css","./assets/source-serif-4-latin-ext-opsz-normal-HoL-AExg.woff2","./assets/source-serif-4-latin-opsz-normal-BpEBLj1O.woff2","./icons/apple-touch-icon.png","./icons/favicon-32.png","./icons/favicon.svg","./icons/icon-192.png","./icons/icon-512.png","./icons/icon-maskable-512.png","./icons/logo.svg","./manifest.webmanifest"];
const cacheName = `info-bank-${version}`;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(cacheName)
      .then((cache) => cache.addAll(precache))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k !== cacheName).map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

async function networkFirst(request) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request, { cache: "no-store" });
    if (response.ok) await cache.put(request, response.clone());
    return response;
  } catch (error) {
    const cached = await cache.match(request, { ignoreSearch: true });
    if (cached) return cached;
    throw error;
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(cacheName);
    await cache.put(request, response.clone());
  }
  return response;
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  const fresh =
    request.mode === "navigate" ||
    url.pathname.endsWith("/data.enc") ||
    url.pathname.endsWith(".webmanifest");
  event.respondWith(fresh ? networkFirst(request) : cacheFirst(request));
});
