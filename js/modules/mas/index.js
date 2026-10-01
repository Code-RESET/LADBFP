// ============================================================
// modules/mas/index.js
// Menú "Más" en móvil (estilo iOS Settings). Se construye con
// los módulos registrados con nav.movil = 'mas' en router.js.
// ============================================================

import { html, render as renderHtml } from "../../core/dom.js";
import { icon } from "../../components/icons.js";
import { MODULES } from "../../router.js";

const FUTUROS = [
  { label: "Deudas", icon: "deudas", fase: 2 },
  { label: "Reportes y Excel", icon: "reportes", fase: 3 },
];

export function render(container) {
  const items = MODULES.filter((m) => m.nav.movil === "mas");
  renderHtml(container, html`
    <ul class="lista card card--lista">${items.map((m) => html`<li>
      <a class="fila" href="#/${m.path}">
        <span class="fila__icono">${icon(m.icon, { size: 18 })}</span>
        <span class="fila__texto"><span class="fila__titulo">${m.label}</span></span>
        ${icon("chevron", { size: 16, clase: "fila__chevron" })}
      </a></li>`)}</ul>

    <h2 class="seccion__titulo">Próximamente</h2>
    <ul class="lista card card--lista atenuada">${FUTUROS.map((f) => html`<li><div class="fila">
      <span class="fila__icono">${icon(f.icon, { size: 18 })}</span>
      <span class="fila__texto"><span class="fila__titulo">${f.label}</span></span>
      <span class="badge">Fase ${f.fase}</span></div></li>`)}</ul>

    <ul class="lista card card--lista">
      <li><button type="button" class="fila fila--peligro" data-accion="cerrar-sesion">
        <span class="fila__icono">${icon("salir", { size: 18 })}</span>
        <span class="fila__texto"><span class="fila__titulo">Cerrar sesión</span></span>
      </button></li>
    </ul>`);
}
