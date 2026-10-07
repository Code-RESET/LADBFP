// ============================================================
// router.js
// Router por hash (#/ruta?param=valor). No recarga la página.
// Cada módulo nuevo se registra en MODULES: es lo único que hay
// que tocar para agregar una sección (aparece sola en la barra
// inferior / sidebar y en el routing).
//
// Contrato de un módulo (js/modules/<nombre>/index.js):
//   export function render(container, ctx) { ...; return cleanup }
//   ctx = { user, params: URLSearchParams, segmentos: [], navegar(ruta) }
//   cleanup() cancela listeners al salir de la pantalla.
// ============================================================

import { html, render } from "./core/dom.js";
import { icon } from "./components/icons.js";
import { cerrarTodas } from "./components/modal.js";
import { estadoError, skeletonLista } from "./components/states.js";

// path   -> texto después de #/ en la URL
// label  -> texto del menú
// nav    -> movil: 'tab' (barra inferior) | 'mas' (menú Más) | null; desktop: true/false (sidebar)
// load   -> import dinámico: el código del módulo se descarga solo al abrirlo
export const MODULES = [
  { path: "dashboard", label: "Mi mes", icon: "inicio", nav: { movil: "tab", desktop: true }, load: () => import("./modules/dashboard/index.js") },
  { path: "movimientos", label: "Todos los movimientos", icon: "movimientos", nav: { movil: "mas", desktop: true }, load: () => import("./modules/movimientos/index.js") },
  { path: "cajas", label: "Cajas", icon: "cajas", nav: { movil: "mas", desktop: true }, load: () => import("./modules/cajas/index.js") },
  { path: "mas", label: "Más", icon: "mas", nav: { movil: "tab", desktop: true }, load: () => import("./modules/mas/index.js") },
  { path: "plan", label: "Deudas y proyección", icon: "plan", nav: { movil: "mas", desktop: false }, load: () => import("./modules/plan/index.js") },
  { path: "cuentas", label: "Bancos", icon: "cuentas", nav: { movil: "mas", desktop: false }, load: () => import("./modules/cuentas/index.js") },
  { path: "configuracion", label: "Configuración", icon: "config", nav: { movil: "mas", desktop: false }, load: () => import("./modules/configuracion/index.js") },
];

const RUTA_INICIAL = "dashboard";

let ctxBase = null;
let cleanupActual = null;
let renderId = 0;

export function parseHash(hash = location.hash) {
  const limpio = hash.replace(/^#\/?/, "");
  const [ruta, qs = ""] = limpio.split("?");
  const segmentos = ruta.split("/").filter(Boolean).map(decodeURIComponent);
  return { path: segmentos[0] || RUTA_INICIAL, segmentos: segmentos.slice(1), params: new URLSearchParams(qs) };
}

export function navegar(ruta) {
  cerrarTodas({ mantenerHistorial: true });
  location.hash = `#/${ruta.replace(/^#?\/?/, "")}`;
}

/** Cambia los parámetros de la URL sin agregar historial ni re-renderizar. */
export function reemplazarParams(params) {
  const { path, segmentos } = parseHash();
  const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v != null && v !== "")).toString();
  const ruta = [path, ...segmentos].map(encodeURIComponent).join("/");
  history.replaceState(history.state, "", `#/${ruta}${qs ? `?${qs}` : ""}`);
}

function pintarNav(actual) {
  const tab = (m) => html`<a href="#/${m.path}" class="tabbar__item ${m.path === actual ? "activo" : ""}"
      ${m.path === actual ? html`aria-current="page"` : ""}>${icon(m.icon)}<span>${m.label}</span></a>`;
  const tabs = MODULES.filter((m) => m.nav.movil === "tab");
  const masActivo = MODULES.find((m) => m.path === actual)?.nav.movil === "mas";
  render(document.getElementById("tabbar"), html`
    ${tabs.slice(0, Math.ceil(tabs.length / 2)).map(tab)}
    <button type="button" class="tabbar__nuevo" data-accion="nuevo-movimiento" aria-label="Registrar gasto o ingreso">${icon("plus", { size: 28 })}</button>
    ${tabs.slice(Math.ceil(tabs.length / 2)).map((m) => m.path === "mas" && masActivo
      ? html`<a href="#/mas" class="tabbar__item activo">${icon(m.icon)}<span>${m.label}</span></a>`
      : tab(m))}`);

  render(document.getElementById("sidebar-nav"), html`${MODULES.filter((m) => m.nav.desktop).map((m) => html`
    <a href="#/${m.path}" class="sidebar__item ${m.path === actual ? "activo" : ""}">${icon(m.icon, { size: 20 })}<span>${m.label}</span></a>`)}`);
}

async function renderRuta() {
  const id = ++renderId;
  const { path, segmentos, params } = parseHash();
  const mod = MODULES.find((m) => m.path === path);
  if (!mod) { navegar(RUTA_INICIAL); return; }

  cerrarTodas({ mantenerHistorial: true }); // p. ej. un enlace dentro de una hoja
  cleanupActual?.();
  cleanupActual = null;
  pintarNav(mod.path);
  document.getElementById("titulo-pantalla").textContent = mod.label;
  document.title = `${mod.label} · Finanzas Reset`;

  const contenedor = document.getElementById("app-content");
  render(contenedor, skeletonLista(4));
  window.scrollTo(0, 0);

  try {
    const modulo = await mod.load();
    if (id !== renderId) return; // el usuario ya navegó a otra pantalla
    contenedor.innerHTML = "";
    const ctx = { ...ctxBase, params, segmentos, navegar };
    cleanupActual = modulo.render(contenedor, ctx) || null;
  } catch (err) {
    console.error(err);
    if (id !== renderId) return;
    render(contenedor, estadoError("No se pudo abrir esta sección. Revisa tu conexión."));
    contenedor.querySelector('[data-accion="reintentar"]')?.addEventListener("click", renderRuta);
  }
}

export function initRouter(ctx) {
  ctxBase = ctx;
  window.addEventListener("hashchange", renderRuta);
  renderRuta();
}

export function detenerRouter() {
  window.removeEventListener("hashchange", renderRuta);
  cleanupActual?.();
  cleanupActual = null;
  ctxBase = null;
  renderId++;
}
