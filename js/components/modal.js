// ============================================================
// components/modal.js
// Capa base para hojas inferiores (móvil) y diálogos (desktop).
// - Escape o tocar el fondo cierra.
// - El botón "atrás" del teléfono cierra la hoja en lugar de
//   salir de la pantalla (se agrega una entrada al historial).
// ============================================================

import { html, render } from "../core/dom.js";
import { icon } from "./icons.js";

const abiertas = [];
let popsPropios = 0; // popstate provocados por nuestro propio history.back()

window.addEventListener("popstate", () => {
  if (popsPropios > 0) { popsPropios--; return; }
  const ultima = abiertas[abiertas.length - 1];
  if (ultima) ultima.cerrar({ desdeHistorial: true });
});

/**
 * abrirCapa({ titulo, contenido, variante: 'sheet'|'dialog', onClose, ancho })
 * Devuelve { el, cuerpo, cerrar }.
 */
export function abrirCapa({ titulo = "", contenido = "", variante = "sheet", onClose, cerrable = true } = {}) {
  const capa = document.createElement("div");
  capa.className = `capa capa--${variante}`;
  capa.innerHTML = `<div class="capa__fondo" data-cerrar></div>
    <div class="capa__panel" role="dialog" aria-modal="true" aria-label="">
      <div class="capa__asa" aria-hidden="true"></div>
      <header class="capa__header"></header>
      <div class="capa__cuerpo"></div>
    </div>`;
  const panel = capa.querySelector(".capa__panel");
  panel.setAttribute("aria-label", titulo);
  render(capa.querySelector(".capa__header"), html`
    <h2 class="capa__titulo">${titulo}</h2>
    ${cerrable ? html`<button type="button" class="btn-icono" data-cerrar aria-label="Cerrar">${icon("cerrar", { size: 20 })}</button>` : ""}`);
  const cuerpo = capa.querySelector(".capa__cuerpo");
  render(cuerpo, contenido);

  const focoPrevio = document.activeElement;
  let cerrada = false;

  const onKey = (e) => {
    if (e.key === "Escape" && cerrable) cerrar();
  };

  function cerrar({ desdeHistorial = false } = {}) {
    if (cerrada) return;
    cerrada = true;
    const i = abiertas.indexOf(api);
    if (i >= 0) abiertas.splice(i, 1);
    document.removeEventListener("keydown", onKey);
    capa.classList.remove("capa--visible");
    setTimeout(() => capa.remove(), 220);
    if (!abiertas.length) document.body.classList.remove("sin-scroll");
    if (!desdeHistorial) { popsPropios++; history.back(); }
    focoPrevio?.focus?.({ preventScroll: true });
    onClose?.();
  }

  if (cerrable) {
    capa.addEventListener("click", (e) => {
      if (e.target.closest("[data-cerrar]")) cerrar();
    });
  }
  document.addEventListener("keydown", onKey);

  document.body.appendChild(capa);
  document.body.classList.add("sin-scroll");
  history.pushState({ capa: true }, "");
  requestAnimationFrame(() => capa.classList.add("capa--visible"));

  const api = { el: capa, cuerpo, cerrar };
  abiertas.push(api);
  return api;
}

/**
 * Cierra todas las capas. Con { mantenerHistorial: true } no retrocede el
 * historial (se usa justo antes de navegar a otra ruta, para que el
 * history.back() asíncrono no deshaga la navegación).
 */
export function cerrarTodas({ mantenerHistorial = false } = {}) {
  const n = abiertas.length;
  if (!n) return;
  [...abiertas].reverse().forEach((c) => c.cerrar({ desdeHistorial: true }));
  if (!mantenerHistorial) { popsPropios++; history.go(-n); }
}
