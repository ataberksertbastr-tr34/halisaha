/// <reference lib="webworker" />
/**
 * Service worker: uygulama kabuğunu ve tüm dosyaları önbelleğe alır,
 * internet olmadan tamamen çalışmayı sağlar.
 *
 * Derleme sırasında __PRECACHE__ ve __VERSION__ gerçek değerlerle
 * değiştirilir (scripts/vite-plugin-sw.ts). Yeni sürüm kendiliğinden devreye
 * girmez; uygulama "Güncelle" dediğinde SKIP_WAITING mesajıyla etkinleşir.
 */
declare const __PRECACHE__: string[];
declare const __VERSION__: string;

const sw = self as unknown as ServiceWorkerGlobalScope;
const CACHE = "halisaha-" + __VERSION__;
const FILES: string[] = __PRECACHE__;
const SCOPE = new URL("./", sw.location.href).href;
const INDEX = new URL("./index.html", SCOPE).href;

sw.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(FILES.map((f) => new Request(new URL(f, SCOPE).href, { cache: "reload" })))),
  );
});

sw.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k.startsWith("halisaha-") && k !== CACHE).map((k) => caches.delete(k)));
      await sw.clients.claim();
    })(),
  );
});

sw.addEventListener("message", (event) => {
  const data = event.data as { type?: string } | null;
  if (data && data.type === "SKIP_WAITING") sw.skipWaiting();
  if (data && data.type === "VERSION") event.ports[0]?.postMessage(__VERSION__);
});

sw.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== sw.location.origin) return;

  // Sayfa açılışları: önbellekteki uygulama kabuğu (hash yönlendirme kullanıldığı için tek sayfa).
  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        const cached = await caches.match(INDEX, { cacheName: CACHE });
        if (cached) return cached;
        try {
          return await fetch(req);
        } catch {
          return (await caches.match(INDEX)) || Response.error();
        }
      })(),
    );
    return;
  }

  // Diğer dosyalar: önce önbellek, yoksa ağ (dosya adları içerik özetli olduğu için güvenli).
  event.respondWith(
    (async () => {
      const cached = await caches.match(req, { cacheName: CACHE, ignoreSearch: true });
      if (cached) return cached;
      const res = await fetch(req);
      if (res.ok && url.href.startsWith(SCOPE)) {
        const c = await caches.open(CACHE);
        c.put(req, res.clone());
      }
      return res;
    })(),
  );
});
