const CACHE = "aatakode-e9c650a3d2";
const SHELL = ["./", "index.html", "manifest.webmanifest", "icon.svg"];
self.addEventListener("install", (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener("activate", (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET") return;
  const cdn = u.hostname === "cdn.jsdelivr.net" && u.pathname.includes("/pyodide");
  if (cdn || u.origin === location.origin) {
    e.respondWith(caches.open(CACHE).then(async (c) => {
      const hit = await c.match(e.request, { ignoreSearch: true });
      if (hit && (cdn || u.pathname.indexOf("index.html") < 0 && !u.pathname.endsWith("/"))) return hit;
      try { const r = await fetch(e.request); if (r.ok || r.type === "opaque") c.put(e.request, r.clone()); return r; } catch (err) { if (hit) return hit; const f = await c.match("index.html"); if (f) return f; throw err; }
    }));
  }
});
