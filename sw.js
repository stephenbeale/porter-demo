// Porter's service worker: lets Porter open without a connection and install
// cleanly as an app. Reading documents still needs a connection (to Claude).
//  - The page itself: network first, so updates arrive straight away; the
//    saved copy is used when offline.
//  - Porter's own files (icons, guide): cached, refreshed in the background.
//  - The on-phone engines from jsdelivr (versioned URLs that never change):
//    cached after the first use.
// Nothing else is touched: calls to Claude, the beta server, Google and DVLA
// go straight to the network and are never stored.
const CACHE = "porter-v1";
const SHELL = ["./", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png", "./apple-touch-icon.png", "./beta.html", "./privacy.html"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  const ours = url.origin === location.origin && url.pathname.startsWith(new URL(self.registration.scope).pathname);
  if (ours && (req.mode === "navigate" || url.pathname.endsWith(".html") || url.pathname.endsWith("/"))) {
    if (url.searchParams.has("check")) return;   // the "is there a newer version?" check always asks the network
    e.respondWith(fetch(req).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(url.pathname, copy)); }
      return res;
    }).catch(() => caches.match(url.pathname).then(r => r || caches.match("./"))));
    return;
  }
  if (ours) {
    e.respondWith(caches.match(req).then(hit => {
      const fresh = fetch(req).then(res => { if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); } return res; });
      if (hit) { fresh.catch(() => {}); return hit; }
      return fresh;
    }));
    return;
  }
  if (url.hostname === "cdn.jsdelivr.net") {
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => {
      if (res.ok && res.type !== "opaque") { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      return res;
    })));
  }
});
