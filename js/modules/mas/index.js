// ============================================================
// modules/mas/index.js
// Menú "Más": lo que no está en "Mi mes". Lo de todos los días
// arriba; las herramientas avanzadas abajo y marcadas como
// opcionales (la app funciona completa sin usarlas).
// ============================================================

import { html, render as renderHtml } from "../../core/dom.js";
import { icon } from "../../components/icons.js";

const GRUPOS = [
  { titulo: "Mi dinero", items: [
    { label: "Cajas", sub: "Crear, renombrar o quitar cajas", icon: "cajas", ruta: "cajas" },
    { label: "Todos los movimientos", sub: "Buscar y revisar todo lo registrado", icon: "movimientos", ruta: "movimientos" },
  ] },
  { titulo: "Avanzado (opcional)", items: [
    { label: "Deudas", sub: "Cuánto debes y cuándo terminas", icon: "deudas", ruta: "plan?tab=deudas" },
    { label: "¿Cuánto puedo gastar?", sub: "Proyección de los próximos días", icon: "plan", ruta: "plan" },
    { label: "Presupuesto", sub: "Límite por semana o mes", icon: "metas", ruta: "plan?tab=presupuesto" },
    { label: "Cuentas de banco", sub: "En qué banco está el dinero de cada caja", icon: "cuentas", ruta: "cuentas" },
  ] },
  { titulo: "Ajustes", items: [
    { label: "Configuración", sub: "Apariencia, categorías, actualizar la app", icon: "config", ruta: "configuracion" },
  ] },
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

    <ul class="lista card card--lista">
      <li><button type="button" class="fila fila--peligro" data-accion="cerrar-sesion">
        <span class="fila__icono">${icon("salir", { size: 18 })}</span>
        <span class="fila__texto"><span class="fila__titulo">Cerrar sesión</span></span>
      </button></li>
    </ul>`);
}
