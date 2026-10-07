// ============================================================
// services/actualizacion.js
// Registro del service worker y actualización de la app.
// - Al publicar mejoras se sube CACHE_VERSION en
//   service-worker.js; con eso el navegador detecta la versión
//   nueva.
// - Normalmente se detecta sola (aviso "Hay una versión nueva").
//   El botón de Configuración fuerza la revisión al momento.
// - La versión mostrada se le pregunta al service worker, así hay
//   una sola fuente de verdad: CACHE_VERSION.
// ============================================================

const DESACTIVADO = !("serviceWorker" in navigator) || new URLSearchParams(location.search).has("nosw");

export const MENSAJE_ACTUALIZACION = {
  "al-dia": "✓ Ya tienes la versión más reciente",
  "sin-conexion": "Conéctate a internet para buscar actualizaciones",
  "no-disponible": "Actualización automática no disponible en este navegador. Recarga la página.",
};

let recargando = false;
let actualizandoManual = false;

function recargar() {
  if (recargando) return;
  recargando = true;
  location.reload();
}

/**
 * Registra el service worker. onNuevaVersion se llama cuando una versión
 * nueva tomó el control sin que el usuario la pidiera (para ofrecer recargar).
 */
export function registrarServiceWorker({ onNuevaVersion } = {}) {
  if (DESACTIVADO) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("service-worker.js").then((reg) => {
      // Revisar en silencio si hay versión nueva: cada 30 min y al volver a la app
      // (en el teléfono la app casi nunca se "recarga", así que sin esto tardaría días).
      let ultima = Date.now();
      const revisar = () => {
        if (!navigator.onLine || Date.now() - ultima < 5 * 60_000) return;
        ultima = Date.now();
        reg.update().catch(() => {});
      };
      setInterval(revisar, 30 * 60_000);
      document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") revisar(); });
    }).catch((err) => {
      console.warn("Service worker no registrado:", err);
    });
  });
  const habiaControlador = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!habiaControlador || recargando) return;
    if (actualizandoManual) recargar();          // lo pidió el usuario: aplicar ya
    else onNuevaVersion?.(recargar);             // llegó sola: ofrecer recargar
  });
}

/** Versión instalada (CACHE_VERSION del service worker), o null si no se sabe. */
export function versionInstalada() {
  const sw = !DESACTIVADO && navigator.serviceWorker.controller;
  if (!sw) return Promise.resolve(null);
  return new Promise((resolve) => {
    const canal = new MessageChannel();
    const t = setTimeout(() => resolve(null), 1500);
    canal.port1.onmessage = (e) => { clearTimeout(t); resolve(e.data?.version ?? null); };
    sw.postMessage({ tipo: "version" }, [canal.port2]);
  });
}

function esperarActivacion(worker) {
  return new Promise((resolve) => {
    if (worker.state === "activated" || worker.state === "redundant") return resolve(worker.state);
    worker.addEventListener("statechange", () => {
      if (worker.state === "activated" || worker.state === "redundant") resolve(worker.state);
    });
  });
}

/**
 * Busca una versión nueva en el servidor.
 * Devuelve: 'actualizando' (se recargará sola) | 'al-dia' | 'sin-conexion' | 'no-disponible'.
 */
export async function buscarActualizacion() {
  if (DESACTIVADO) return "no-disponible";
  if (!navigator.onLine) return "sin-conexion";
  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg) return "no-disponible";
  try {
    await reg.update();
  } catch {
    return "sin-conexion";
  }
  const nuevo = reg.installing || reg.waiting;
  if (!nuevo) return "al-dia";
  actualizandoManual = true;
  // El service worker hace skipWaiting: al activarse cambia el controlador
  // y "controllerchange" recarga la página. Respaldo por si no ocurre.
  esperarActivacion(nuevo).then(() => setTimeout(recargar, 1500));
  return "actualizando";
}

/**
 * Último recurso si algo se ve raro: borra la caché de archivos de la app
 * (NO los datos de Firestore) y recarga desde el servidor.
 */
export async function reinstalarArchivos() {
  if (!navigator.onLine) return "sin-conexion";
  if ("caches" in window) {
    const claves = await caches.keys();
    await Promise.all(claves.filter((k) => k.startsWith("finanzas-reset-")).map((k) => caches.delete(k)));
  }
  if (!DESACTIVADO) {
    const reg = await navigator.serviceWorker.getRegistration();
    await reg?.unregister();
  }
  recargar();
  return "recargando";
}
