const CACHE = "dutch-vocab-v14";
const ASSETS = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./data.js",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Network-first: when online, always load the latest version and refresh the
// cache in the background; when offline, fall back to the cached copy. This
// keeps the app fully usable offline while ensuring updates appear on the next
// refresh instead of getting stuck behind a stale cache.
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  // { cache: "no-store" } bypasses the browser's HTTP cache, so when online we
  // always get the freshly deployed file (GitHub Pages otherwise lets the
  // browser hold assets for ~10 min, which made updates look stuck). Offline,
  // the fetch rejects and we fall back to the cached copy.
  // Fetch by URL (not the Request object) so the { cache: "no-store" } init
  // actually takes effect — passing it alongside a Request does not override
  // the request's own cache mode.
  e.respondWith(
    fetch(e.request.url, { cache: "no-store" })
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});
