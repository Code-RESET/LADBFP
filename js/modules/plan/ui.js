// ============================================================
// modules/plan/ui.js
// Piezas visuales compartidas por las pestañas de Plan e Inicio.
// ============================================================

import { html } from "../../core/dom.js";
import { formatMonto } from "../../core/money.js";
import { formatFecha, etiquetaDia, hoy } from "../../core/dates.js";
import { cajaPorId } from "../../core/state.js";
import { ETIQUETA_ESTADO } from "../../domain/compromisos.js";
import { icon } from "../../components/icons.js";
import { claveEvento } from "./acciones.js";

const ICONO = { obligacion: "plan", deuda: "deudas", ingreso: "ingreso", transferencia: "transferencia" };

/** Fila de un evento (pago, ingreso o transferencia) con su botón de acción. */
export function filaEvento(e) {
  const salida = e.clase === "obligacion" || e.clase === "deuda";
  const accion = salida ? "Pagar" : e.clase === "ingreso" ? "Registrar" : "Transferir";
  const cuando = e.estado === "vencida" ? `Vencido · ${formatFecha(e.fecha)}` : etiquetaDia(e.fecha, hoy());
  return html`<li><div class="fila fila--evento">
    <span class="fila__icono ${e.estado === "vencida" ? "fila__icono--peligro" : ""}">${icon(ICONO[e.clase], { size: 18 })}</span>
    <span class="fila__texto">
      <span class="fila__titulo">${e.nombre}</span>
      <span class="fila__sub ${e.estado === "vencida" ? "texto-peligro" : ""}">${cuando} · ${cajaPorId(e.cajaId)?.nombre || "—"}${
        e.estado === "parcial" ? ` · ${ETIQUETA_ESTADO.parcial.toLowerCase()}` : ""}</span>
    </span>
    <span class="fila__monto ${salida ? "" : "monto--positivo"}">${salida ? "" : "+"}${formatMonto(e.monto)}</span>
    <button type="button" class="btn btn--chico" data-pagar="${claveEvento(e)}">${accion}</button>
  </div></li>`;
}

/** Bloque de sugerencias (datos conocidos por confirmar). */
export function bloqueSugerencias(tipo, sugerencias, titulo = "Sugerencias con tus datos") {
  if (!sugerencias.length) return "";
  return html`<h2 class="seccion__titulo">${titulo}</h2>
    <ul class="lista card card--lista sugerencias">${sugerencias.map((s) => html`<li>
      <button type="button" class="fila" data-sugerencia="${tipo}:${s.i}">
        <span class="fila__icono">${icon("plus", { size: 18 })}</span>
        <span class="fila__texto"><span class="fila__titulo">${s.etiqueta}</span>
          ${s.confirmar ? html`<span class="fila__sub">${s.confirmar}</span>` : ""}</span>
        ${icon("chevron", { size: 16, clase: "fila__chevron" })}
      </button></li>`)}</ul>`;
}

/** Tarjeta de alerta. */
export function tarjetaAlerta(a) {
  const ic = a.nivel === "rojo" ? "alerta" : a.nivel === "naranja" ? "alerta" : "historial";
  return html`<li><a class="alerta alerta--${a.nivel}" href="#/${a.ruta}">
    <span class="alerta__icono">${icon(ic, { size: 18 })}</span>
    <span class="fila__texto"><span class="fila__titulo">${a.titulo}</span><span class="fila__sub">${a.texto}</span></span>
  </a></li>`;
}

/** Barra de progreso (pista del mismo tono, más clara). */
export function barra(pct) {
  return html`<div class="barra" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100">
    <span style="width:${Math.max(0, Math.min(100, pct))}%"></span></div>`;
}
