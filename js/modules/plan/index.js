// ============================================================
// modules/plan/index.js
// Contenedor móvil de Presupuesto · Obligaciones · Deudas ·
// Metas · Flujo · Escenarios. Se implementa en las Fases 2 y 3;
// por ahora muestra qué llega y cuándo.
// ============================================================

import { html, render as renderHtml } from "../../core/dom.js";
import { icon } from "../../components/icons.js";

const PROXIMAMENTE = [
  { icono: "plan", titulo: "Presupuesto", texto: "Semanal y mensual, con detección automática de déficit.", fase: 2 },
  { icono: "alerta", titulo: "Obligaciones y próximos pagos", texto: "Trabajadora, colegiatura, celular… con estados pagada / vencida.", fase: 2 },
  { icono: "deudas", titulo: "Deudas", texto: "Saldo restante, % pagado y fecha estimada de liquidación.", fase: 2 },
  { icono: "reportes", titulo: "Flujo proyectado", texto: "7, 30, 90 días y 12 meses; disponible real.", fase: 2 },
  { icono: "metas", titulo: "Metas y escenarios", texto: "Remodelación, viabilidad y simulaciones sin tocar datos reales.", fase: 3 },
];

export function render(container) {
  renderHtml(container, html`
    <p class="texto-sec intro">Aquí vivirá tu plan financiero. Estas secciones se activan en las siguientes fases:</p>
    <ul class="lista card card--lista">${PROXIMAMENTE.map((p) => html`<li><div class="fila">
      <span class="fila__icono">${icon(p.icono, { size: 18 })}</span>
      <span class="fila__texto"><span class="fila__titulo">${p.titulo}</span><span class="fila__sub">${p.texto}</span></span>
      <span class="badge">Fase ${p.fase}</span>
    </div></li>`)}</ul>`);
}
