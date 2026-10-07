// ============================================================
// service-worker.js
// - Precachea el shell, TODOS los módulos y el SDK de Firebase
//   (sin el SDK la app no abriría sin conexión).
// - Cache-first para archivos propios y librerías versionadas.
// - Firestore/Auth nunca pasan por aquí: Firestore tiene su
//   propia caché offline en IndexedDB.
// Subir CACHE_VERSION cada vez que cambies cualquier archivo de
// la app, para que los teléfonos instalados bajen la versión
// nueva. tests/ verifica que CORE_ASSETS incluya todos los .js.
// ============================================================

const CACHE_VERSION = "finanzas-reset-v1.4.0";
const FIREBASE_SDK = "https://www.gstatic.com/firebasejs/10.12.2";

const CORE_ASSETS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./css/themes.css",
  "./css/base.css",
  "./css/components.css",
  "./css/responsive.css",
  "./assets/logo.svg",
  "./assets/icon-192.png",
  "./assets/icon-512.png",
  "./assets/icon-maskable-512.png",
  "./assets/apple-touch-icon.png",
  "./assets/favicon-16.png",
  "./assets/favicon-32.png",
  "./js/app.js",
  "./js/firebase-config.js",
  "./js/router.js",
  "./js/core/auth.js",
  "./js/core/dates.js",
  "./js/core/dom.js",
  "./js/core/errors.js",
  "./js/core/money.js",
  "./js/core/paginacion.js",
  "./js/core/state.js",
  "./js/core/theme.js",
  "./js/core/validation.js",
  "./js/domain/alertas.js",
  "./js/domain/catalogos.js",
  "./js/domain/compromisos.js",
  "./js/domain/mes.js",
  "./js/domain/diagnostico.js",
  "./js/domain/reporte.js",
  "./js/domain/metricas.js",
  "./js/domain/movimientos.js",
  "./js/domain/periodos.js",
  "./js/domain/presupuesto.js",
  "./js/domain/proyeccion.js",
  "./js/domain/saldos.js",
  "./js/data/catalogosRepo.js",
  "./js/data/firestore.js",
  "./js/data/movimientosRepo.js",
  "./js/data/perfilRepo.js",
  "./js/data/planRepo.js",
  "./js/data/seed.js",
  "./js/data/sync.js",
  "./js/services/actualizacion.js",
  "./js/services/exportExcel.js",
  "./js/services/planCalculado.js",
  "./js/components/charts.js",
  "./js/components/confirmation.js",
  "./js/components/fields.js",
  "./js/components/icons.js",
  "./js/components/modal.js",
  "./js/components/movimientoDetalle.js",
  "./js/components/movimientoForm.js",
  "./js/components/movimientoItem.js",
  "./js/components/pagination.js",
  "./js/components/reglaFields.js",
  "./js/components/selectorMes.js",
  "./js/components/registroSimple.js",
  "./js/components/marcarPagado.js",
  "./js/components/states.js",
  "./js/components/toast.js",
  "./js/modules/cajas/index.js",
  "./js/modules/configuracion/categorias.js",
  "./js/modules/configuracion/index.js",
  "./js/modules/configuracion/verificar.js",
  "./js/modules/cuentas/index.js",
  "./js/modules/dashboard/bienvenida.js",
  "./js/modules/dashboard/index.js",
  "./js/modules/dashboard/metricas.js",
  "./js/modules/mas/index.js",
  "./js/modules/movimientos/index.js",
  "./js/modules/plan/acciones.js",
  "./js/modules/plan/formularios.js",
  "./js/modules/plan/index.js",
  "./js/modules/plan/pestanas.js",
  "./js/modules/plan/sugerencias.js",
  "./js/modules/plan/ui.js",
  `${FIREBASE_SDK}/firebase-app.js`,
  `${FIREBASE_SDK}/firebase-auth.js`,
  `${FIREBASE_SDK}/firebase-firestore.js`,
];

// Hosts cuyos archivos pueden servirse desde caché (versionados o estáticos).
const HOSTS_CACHEABLES = [self.location.host, "www.gstatic.com", "fonts.googleapis.com", "fonts.gstatic.com", "cdn.jsdelivr.net"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(CORE_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// La app pregunta qué versión está instalada (Configuración → Aplicación).
self.addEventListener("message", (event) => {
  if (event.data?.tipo === "version") {
    event.ports[0]?.postMessage({ version: CACHE_VERSION.replace("finanzas-reset-", "") });
  }
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  // Firestore, Auth y demás APIs de Google: siempre red directa.
  if (!HOSTS_CACHEABLES.includes(url.host)) return;
  // El SDK de Firebase solo desde la versión fijada (el resto de gstatic no se toca).
  if (url.host === "www.gstatic.com" && !url.pathname.startsWith("/firebasejs/")) return;

  // Navegación (abrir la app / recargar): index.html desde caché si no hay red.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).catch(() => caches.match("./index.html"))
    );
    return;
  }

  event.respondWith(
    caches.match(req, { ignoreSearch: url.host === self.location.host }).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((resp) => {
        // Guardar en caché lo que llegue después (fuentes, librerías bajo demanda).
        if (resp.ok && (resp.type === "basic" || resp.type === "cors")) {
          const copia = resp.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(req, copia));
        }
        return resp;
      });
    })
  );
});
