// ============================================================
// components/selectorMes.js
// ‹ septiembre 2026 ›  — cambia el mes que se muestra.
// Eventos: [data-mes-nav="-1" | "1"], [data-mes-nav="hoy"].
// ============================================================

import { html } from "../core/dom.js";
import { nombreMes, mesSiguiente, mesAnterior, mesDe, hoy } from "../core/dates.js";

export function selectorMes(mes) {
  const actual = mesDe(hoy());
  return html`<div class="selector-mes">
    <button type="button" class="btn-icono" data-mes-nav="-1" aria-label="Mes anterior">‹</button>
    <span class="selector-mes__nombre">${nombreMes(mes)}</span>
    <button type="button" class="btn-icono" data-mes-nav="1" aria-label="Mes siguiente">›</button>
    ${mes !== actual ? html`<button type="button" class="btn-texto" data-mes-nav="hoy">Este mes</button>` : ""}
  </div>`;
}

export function moverMes(mes, accion) {
  if (accion === "hoy") return mesDe(hoy());
  return accion === "-1" ? mesAnterior(mes) : mesSiguiente(mes);
}
