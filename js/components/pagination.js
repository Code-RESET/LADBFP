// ============================================================
// components/pagination.js
// Controles de paginación. Desktop: ‹ Anterior | 1 | 2 | 3 | Siguiente ›
// Móvil: ‹ 25 anteriores · Página 2 de 14 · 25 siguientes ›
// (Ambas variantes se pintan; el CSS muestra la adecuada.)
// Eventos: [data-pag="n"], [data-pag="prev"|"next"], select[data-tamano].
// ============================================================

import { html } from "../core/dom.js";
import { TAMANOS_PAGINA, rango, textoRango, totalPaginas, paginasVisibles } from "../core/paginacion.js";

export function paginacion({ pagina, tamano, enPagina, hayMas, total, maxVisitada, sustantivo = "movimientos" }) {
  const r = rango(pagina, tamano, enPagina, total);
  const paginas = totalPaginas(total, tamano);
  const hayPrev = pagina > 1;
  const nums = paginasVisibles({ pagina, maxVisitada, hayMas, total, tamano });

  return html`<nav class="paginacion" aria-label="Paginación">
    <p class="paginacion__rango">${textoRango(r, sustantivo)}</p>

    <div class="paginacion__desktop">
      <button type="button" class="pag-btn" data-pag="prev" ${hayPrev ? "" : "disabled"}>‹ Anterior</button>
      ${nums.map((p) => p.n === "…"
        ? html`<span class="pag-hueco">…</span>`
        : p.actual
          ? html`<span class="pag-num pag-num--actual" aria-current="page">${p.n}</span>`
          : p.navegable
            ? html`<button type="button" class="pag-num" data-pag="${p.n}">${p.n}</button>`
            : html`<span class="pag-num pag-num--inactivo" title="Avanza página por página">${p.n}</span>`)}
      <button type="button" class="pag-btn" data-pag="next" ${hayMas ? "" : "disabled"}>Siguiente ›</button>
    </div>

    <div class="paginacion__movil">
      <button type="button" class="pag-btn" data-pag="prev" ${hayPrev ? "" : "disabled"}>‹ ${tamano} anteriores</button>
      <span class="pag-texto">Página ${pagina}${paginas ? ` de ${paginas}` : ""}</span>
      <button type="button" class="pag-btn" data-pag="next" ${hayMas ? "" : "disabled"}>${tamano} siguientes ›</button>
    </div>

    <label class="paginacion__tamano">
      <span>Por página</span>
      <select data-tamano aria-label="Registros por página">
        ${TAMANOS_PAGINA.map((t) => html`<option value="${t}" ${t === tamano ? "selected" : ""}>${t}</option>`)}
      </select>
    </label>
  </nav>`;
}
