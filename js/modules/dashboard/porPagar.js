// ============================================================
// modules/dashboard/porPagar.js
// El aviso grande de "Mi mes" (como las alertas del Clima): lo
// vencido y lo que vence en los próximos 7 días, con el monto, cuándo
// vence y un botón: «Ya lo pagué» (gasto fijo / deuda: lo marca ☑)
// o «Pagar» (tarjeta). Rojo si algo venció o vence hoy, naranja si
// vence en 3 días o menos, amarillo para el resto de la semana.
// No se puede cerrar: desaparece cuando lo pagas.
// Cálculos en domain/porPagar.js.
// ============================================================

import { html } from "../../core/dom.js";
import { formatMonto } from "../../core/money.js";
import { resumenPorPagar, cuandoVence, tituloPorPagar } from "../../domain/porPagar.js";
import { icon } from "../../components/icons.js";

const MAXIMO = 5;

export function avisoPorPagar(lista) {
  if (!lista?.length) return "";
  const r = resumenPorPagar(lista);
  const visibles = lista.slice(0, MAXIMO);
  return html`<section class="por-pagar por-pagar--${r.nivel}" id="por-pagar" role="region" aria-label="Pagos por vencer">
    <div class="por-pagar__cabecera">
      <span class="por-pagar__icono" aria-hidden="true">${icon("alerta", { size: 26 })}</span>
      <div class="por-pagar__titulos">
        <p class="por-pagar__titulo">${tituloPorPagar(lista)}</p>
        <p class="por-pagar__sub">${lista.length === 1 ? "No se te pase" : `${lista.length} pagos · ${formatMonto(r.total)} en total`}</p>
      </div>
    </div>
    <ul class="por-pagar__lista">${visibles.map((x, i) => html`<li class="por-pagar__item por-pagar__item--${x.urgencia}">
      <div class="por-pagar__texto">
        <span class="por-pagar__nombre">${x.nombre}</span>
        <span class="por-pagar__cuando">${cuandoVence(x)}</span>
      </div>
      <div class="por-pagar__lado">
        <span class="por-pagar__monto">${formatMonto(x.monto)}</span>
        <button type="button" class="por-pagar__boton" data-por-pagar="${i}">${x.tipo === "tarjeta" ? "Pagar" : "Ya lo pagué"}</button>
      </div>
    </li>`)}</ul>
    ${lista.length > MAXIMO ? html`<p class="por-pagar__mas">y ${lista.length - MAXIMO} más en tu lista de gastos</p>` : ""}
    <button type="button" class="por-pagar__calendario" data-accion="recordatorios">${icon("plan", { size: 16 })} Que mi teléfono me avise (calendario)</button>
  </section>`;
}
