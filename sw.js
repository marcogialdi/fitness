// Service worker: shell dell'app disponibile offline. Mai in cache le chiamate a Supabase.
const V = "dash-v1", CDN = "cdn-v1";
const SHELL = ["index.html","fitness.html","alimentazione.html","allenamenti.html","wellness.html","carica.html","setup.html",
  "assets/style.css","assets/app.js","assets/sources.js","assets/help.js","assets/carica.js","assets/setup.js","assets/auth.js","assets/config.js","assets/pwa.js",
  "assets/icons/icon-192.png","manifest.webmanifest"];
self.addEventListener("install", e => { e.waitUntil(caches.open(V).then(c => Promise.all(SHELL.map(u => c.add(u).catch(() => {})))).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== V && x !== CDN).map(x => caches.delete(x)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", e => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== "GET") return;
  if (u.hostname.endsWith("supabase.co") || u.hostname.endsWith("supabase.in")) return;          // dati sempre dalla rete
  if (u.origin === location.origin) {                                                               // pagine e script: rete prima, cache se offline
    e.respondWith(fetch(r).then(res => { if (res.ok) { const c = res.clone(); caches.open(V).then(x => x.put(r, c)); } return res; }).catch(() => caches.match(r, { ignoreSearch: true })));
  } else if (u.hostname === "cdn.jsdelivr.net") {                                                  // librerie: cache prima
    e.respondWith(caches.match(r).then(h => h || fetch(r).then(res => { if (res.ok) { const c = res.clone(); caches.open(CDN).then(x => x.put(r, c)); } return res; })));
  }
});
