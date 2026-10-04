// ============================================================
// modules/mas/index.js
// Menú "Más" (estilo iOS Settings), agrupado en lenguaje simple:
// planeación, registros y ajustes.
// ============================================================

import { html, render as renderHtml } from "../../core/dom.js";
import { icon } from "../../components/icons.js";

const GRUPOS = [
  { titulo: "Planeación", items: [
    { label: "¿Cuánto puedo gastar?", sub: "Lo libre de cada caja y cómo vas a terminar el mes", icon: "plan", ruta: "plan" },
    { label: "Deudas", sub: "Cuánto debes, cuánto llevas y cuándo terminas", icon: "deudas", ruta: "plan?tab=deudas" },
    { label: "Presupuesto", sub: "Cuánto quieres gastar por semana o mes", icon: "metas", ruta: "plan?tab=presupuesto" },
  ] },
  { titulo: "Registros", items: [
    { label: "Todos los movimientos", icon: "movimientos", ruta: "movimientos" },
    { label: "Cajas", sub: "Para qué es tu dinero", icon: "cajas", ruta: "cajas" },
    { label: "Cuentas", sub: "Dónde está tu dinero (bancos, efectivo)", icon: "cuentas", ruta: "cuentas" },
  ] },
  { titulo: "Ajustes", items: [
    { label: "Configuración", sub: "Apariencia, categorías, actualizar la app", icon: "config", ruta: "configuracion" },
  ] },
];

const FUTUROS = [
  { label: "Metas de ahorro", icon: "metas", fase: 3 },
  { label: "Reportes y Excel", icon: "reportes", fase: 3 },
];

export function render(container) {
  renderHtml(container, html`
    ${GRUPOS.map((g) => html`<h2 class="seccion__titulo">${g.titulo}</h2>
      <ul class="lista card card--lista">${g.items.map((it) => html`<li>
        <a class="fila" href="#/${it.ruta}">
          <span class="fila__icono">${icon(it.icon, { size: 18 })}</span>
          <span class="fila__texto"><span class="fila__titulo">${it.label}</span>${it.sub ? html`<span class="fila__sub">${it.sub}</span>` : ""}</span>
          ${icon("chevron", { size: 16, clase: "fila__chevron" })}
        </a></li>`)}</ul>`)}

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
