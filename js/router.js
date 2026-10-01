// ============================================================
// router.js
// Router simple por hash (#/ruta). No recarga la página.
// Cada módulo nuevo del proyecto se registra en MODULES abajo:
// eso es lo único que hay que tocar para agregar una sección.
// ============================================================

import { renderDashboard } from "./modules/dashboard.js";

// Registro de módulos: agregar aquí cada módulo nuevo del proyecto.
// path   -> texto después del # en la URL
// label  -> texto que aparece en el menú de navegación
// render -> función que recibe (container, user) y pinta la vista
const MODULES = [
  { path: "dashboard", label: "Inicio", render: renderDashboard },
  // { path: "clientes", label: "Clientes", render: renderClientes },
  // { path: "reportes", label: "Reportes", render: renderReportes },
];

const nav = document.getElementById("app-nav");
const content = document.getElementById("app-content");

let currentUser = null;

function buildNav() {
  nav.innerHTML = MODULES.map(
    (m) => `<a href="#/${m.path}" data-path="${m.path}">${m.label}</a>`
  ).join("");
}

function setActiveLink(path) {
  nav.querySelectorAll("a").forEach((a) => {
    a.classList.toggle("active", a.dataset.path === path);
  });
}

function renderRoute() {
  const path = (location.hash.replace("#/", "") || MODULES[0]?.path);
  const mod = MODULES.find((m) => m.path === path) || MODULES[0];
  if (!mod) return;

  setActiveLink(mod.path);
  content.innerHTML = "";
  mod.render(content, currentUser);
}

export function initRouter(user) {
  currentUser = user;
  buildNav();
  window.addEventListener("hashchange", renderRoute);
  renderRoute();
}
