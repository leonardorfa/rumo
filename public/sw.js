// Rede primeiro, cópia local se estiver sem internet. Os dados não passam
// por aqui: moram no armazenamento do app, não no cache.
const CACHE = "orbita-v1";
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) =>
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  )
);
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET" || !e.request.url.startsWith(self.location.origin)) return;
  e.respondWith(
    caches.open(CACHE).then(async (c) => {
      try {
        // página principal nunca vem do cache do navegador: sempre a versão nova
        const r = await fetch(e.request, e.request.mode === "navigate" ? { cache: "no-store" } : undefined);
        if (r.ok) c.put(e.request, r.clone());
        return r;
      } catch {
        return (await c.match(e.request, { ignoreSearch: true })) || (await c.match(self.registration.scope));
      }
    })
  );
});
