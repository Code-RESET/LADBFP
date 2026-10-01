// ============================================================
// components/fields.js
// Piezas de formulario reutilizables (estilo iOS) y utilidades
// para leer valores y mostrar errores por campo.
// ============================================================

import { html } from "../core/dom.js";

export function opciones(lista, seleccionado, { vacio = null, etiqueta = (x) => x.nombre } = {}) {
  return html`${vacio ? html`<option value="">${vacio}</option>` : ""}
    ${lista.map((x) => html`<option value="${x.id}" ${x.id === seleccionado ? "selected" : ""}>${etiqueta(x)}</option>`)}`;
}

export function campo({ label, nombre, control, ayuda = "" }) {
  return html`<label class="campo">
    <span class="campo__label">${label}</span>
    ${control}
    ${ayuda ? html`<span class="campo__ayuda">${ayuda}</span>` : ""}
    <span class="campo__error" data-error="${nombre}"></span>
  </label>`;
}

/** Muestra { campo: mensaje } bajo cada control; enfoca el primero con error. */
export function mostrarErrores(form, errores) {
  form.querySelectorAll("[data-error]").forEach((el) => { el.textContent = ""; });
  form.querySelectorAll("[aria-invalid]").forEach((el) => el.removeAttribute("aria-invalid"));
  let primero = null;
  for (const [nombre, msg] of Object.entries(errores || {})) {
    const slot = form.querySelector(`[data-error="${nombre}"]`);
    if (slot) slot.textContent = msg;
    const ctrl = form.elements[nombre];
    if (ctrl && ctrl.setAttribute) {
      ctrl.setAttribute("aria-invalid", "true");
      primero ??= ctrl;
    }
  }
  primero?.focus?.();
  return !primero && Object.keys(errores || {}).length === 0;
}

/** Control segmentado tipo iOS con radios. */
export function segmentado(nombre, items, seleccionado) {
  return html`<div class="segmentado" role="radiogroup">
    ${items.map((it) => html`<label class="segmentado__opcion">
      <input type="radio" name="${nombre}" value="${it.valor}" ${it.valor === seleccionado ? "checked" : ""} />
      <span>${it.label}</span>
    </label>`)}
  </div>`;
}

/** Lee preferencias "últimas usadas" de localStorage sin romper si no hay storage. */
export function leerLocal(clave, porDefecto = null) {
  try { return JSON.parse(localStorage.getItem(clave)) ?? porDefecto; } catch { return porDefecto; }
}

export function guardarLocal(clave, valor) {
  try { localStorage.setItem(clave, JSON.stringify(valor)); } catch { /* sin storage */ }
}
