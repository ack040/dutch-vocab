const CACHE = "dutch-vocab-v26";
const APP_VERSION = "1.12.1";
const ASSETS = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./data.js?v=" + APP_VERSION,
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
      // Tell open pages which version now controls them, so a page running
      // older code can offer a one-tap refresh.
      .then(() => self.clients.matchAll({ type: "window" }))
      .then((clients) => clients.forEach((c) => c.postMessage({ version: APP_VERSION })))
  );
});

// Network-first for app code: when online, always load the latest version and
// refresh the cache in the background; when offline, fall back to the cached
// copy. data.js is the exception — its URL carries the app version, so it is
// immutable and served cache-first: its ~490KB never re-downloads until the
// version (and thus the URL) changes.
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  // Never intercept cross-origin requests: opaque responses can't be
  // validated and are heavily padded against the storage quota.
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.endsWith("/data.js") && url.search) {
    e.respondWith(
      caches.match(e.request).then((hit) => hit ||
        fetch(e.request.url, { cache: "no-store" }).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(e.request, copy));
          }
          return res;
        }))
    );
    return;
  }

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
        // Only cache good responses — a 404/503 during a deploy or outage must
        // never overwrite the known-good offline copy. When we hold a cached
        // copy, prefer it over surfacing the error page at all.
        if (!res.ok) {
          return caches.match(e.request, { ignoreSearch: true }).then((hit) => hit || res);
        }
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});
