// ============================================================
// service-worker.js
// Cache básico de los archivos estáticos del shell (cache-first).
// Al agregar módulos nuevos, súmalos a CORE_ASSETS si quieres que
// funcionen offline. Subir CACHE_VERSION cada vez que cambies
// archivos base para forzar actualización en los teléfonos.
// ============================================================

const CACHE_VERSION = "code-reset-v1";
const CORE_ASSETS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./css/styles.css",
  "./js/router.js",
  "./js/auth.js",
  "./js/firebase-config.js",
  "./js/modules/dashboard.js",
  "./assets/logo.svg",
  "./assets/icon-192.png",
  "./assets/icon-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(CORE_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  // No cachear llamadas a Firebase/Google — siempre red directa.
  if (event.request.url.includes("firebase") || event.request.url.includes("googleapis")) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
