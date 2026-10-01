// ============================================================
// components/states.js
// Estados de interfaz comunes a todos los módulos (sección 39):
// cargando (skeleton), vacío y error.
// ============================================================

import { html } from "../core/dom.js";
import { icon } from "./icons.js";

/** Skeleton de lista: n filas grises animadas. */
export function skeletonLista(n = 5) {
  return html`<div class="skeleton-lista" aria-busy="true" aria-label="Cargando">
    ${Array.from({ length: n }, () => html`<div class="skeleton-fila">
      <span class="sk sk--circulo"></span>
      <span class="sk-col"><span class="sk sk--linea"></span><span class="sk sk--linea sk--corta"></span></span>
      <span class="sk sk--monto"></span>
    </div>`)}
  </div>`;
}

export function skeletonTarjeta() {
  return html`<div class="card skeleton-card" aria-busy="true">
    <span class="sk sk--linea sk--corta"></span><span class="sk sk--titulo"></span>
  </div>`;
}

/** Estado vacío con acción opcional: { icono, titulo, texto, accion: { label, attr } } */
export function estadoVacio({ icono = "movimientos", titulo, texto = "", accion = null }) {
  return html`<div class="estado-vacio">
    <div class="estado-vacio__icono">${icon(icono, { size: 34 })}</div>
    <p class="estado-vacio__titulo">${titulo}</p>
    ${texto ? html`<p class="estado-vacio__texto">${texto}</p>` : ""}
    ${accion ? html`<button type="button" class="btn btn--primario" data-accion="${accion.accion}">${accion.label}</button>` : ""}
  </div>`;
}

export function estadoError(mensaje, { reintentar = true } = {}) {
  return html`<div class="estado-vacio estado-vacio--error" role="alert">
    <div class="estado-vacio__icono">${icon("alerta", { size: 34 })}</div>
    <p class="estado-vacio__titulo">${mensaje}</p>
    ${reintentar ? html`<button type="button" class="btn btn--secundario" data-accion="reintentar">Reintentar</button>` : ""}
  </div>`;
}
