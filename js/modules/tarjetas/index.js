// ============================================================
// modules/tarjetas/index.js
// Tarjetas de crédito: una tarjeta (card) por cada una con lo que
// debes, cuánto te queda disponible, cuánto pagar para no generar
// intereses y antes de qué día, con qué caja la pagas y sus compras
// a meses.
// Cálculos en domain/tarjetas.js (vía services/tarjetas.js);
// hojas en ./formulario.js y ./pago.js.
// ============================================================

import { html, render as renderHtml, on } from "../../core/dom.js";
import { formatMonto } from "../../core/money.js";
import { formatFecha } from "../../core/dates.js";
import { getState, subscribe, catalogosListos, planListo, cuentaPorId } from "../../core/state.js";
import { etiquetaMsi, cajaDeTarjeta } from "../../domain/tarjetas.js";
import { skeletonLista } from "../../components/states.js";
import { icon } from "../../components/icons.js";
import { estadosTarjetas, tarjetasDe } from "../../services/tarjetas.js";
import { abrirTarjeta, abrirCompraMsi, nombreCaja } from "./formulario.js";
import { abrirPagoTarjeta } from "./pago.js";
import { lineaEstado } from "./linea.js";
import { otrasCajasDe, textoOtrasCajas, pasarACajaQuePaga } from "./cajaQuePaga.js";

const corto = (c) => formatMonto(c).replace(/\.00$/, "");

function tarjeta(cuenta, info) {
  const e = info?.estado;
  const linea = lineaEstado(e);
  const inactiva = cuenta.activa === false;
  const s = getState();
  const cajaPaga = cajaDeTarjeta(cuenta, s.cajas);
  const otras = otrasCajasDe(cuenta, s, cajaPaga);
  const usado = e?.limite ? Math.min(100, Math.max(0, Math.round((e.deudaTotal / e.limite) * 100))) : null;
  return html`<li class="card tarjeta-credito ${inactiva ? "atenuada" : ""}" data-tarjeta="${cuenta.id}">
    <div class="tarjeta-credito__cabecera">
      <span class="tarjeta-credito__icono">${icon("tarjeta", { size: 20 })}</span>
      <h3 class="tarjeta-credito__nombre">${cuenta.nombre}</h3>
      <span class="tarjeta-credito__deuda">${e ? (e.deudaTotal ? html`Debes <strong>${corto(e.deudaTotal)}</strong>` : e.aFavor ? html`A favor <strong>${corto(e.aFavor)}</strong>` : "Sin deuda") : ""}</span>
    </div>
    ${usado != null ? html`<div class="barra-meta barra-meta--tarjeta" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${usado}"
        aria-label="Crédito usado de ${cuenta.nombre}"><span style="width:${usado}%"></span></div>
      <p class="campo__ayuda">Disponible ${corto(e.disponible)} de ${corto(e.limite)}</p>` : ""}
    <p class="tarjeta-credito__estado ${linea.clase}">${linea.texto}</p>
    <p class="tarjeta-credito__caja">${cajaPaga ? html`La pagas con <strong>${nombreCaja(cajaPaga)}</strong>`
      : inactiva ? "" : html`<button type="button" class="btn-texto" data-editar="${cuenta.id}">Elige con qué caja la pagas</button>`}</p>
    ${otras ? html`<div class="aviso tarjeta-credito__otras">
      <p>Parte de esta tarjeta está en otra caja: ${textoOtrasCajas(otras)}.</p>
      <button type="button" class="btn btn--pastilla" data-pasar="${cuenta.id}">Pasar todo a ${nombreCaja(cajaPaga)}</button>
    </div>` : ""}
    ${e?.configurada && (e.pendienteCorte || e.cuotas.length || e.paraElSiguiente) ? html`<ul class="sublista">
      ${e.pendienteCorte ? html`<li><span>Debías al corte del ${formatFecha(e.corte)}</span><span>${formatMonto(e.pendienteCorte)}</span></li>` : ""}
      ${e.cuotas.length ? html`<li><span>Mensualidades a meses</span><span>${formatMonto(e.pendienteMsi)}</span></li>` : ""}
      ${e.paraElSiguiente ? html`<li class="texto-sec"><span>Compras después del corte (van al siguiente)</span><span>${formatMonto(e.paraElSiguiente)}</span></li>` : ""}
    </ul>` : ""}
    ${info?.aproximado ? html`<p class="campo__ayuda">No se pudieron leer las compras de después del corte (¿sin conexión?): se muestra todo lo que debes.</p>` : ""}

    ${e?.msi.length ? html`<p class="campo__label tarjeta-credito__subtitulo">Compras a meses</p>
      <ul class="lista card--lista tarjeta-credito__msi">${e.msi.map((x) => html`<li><button type="button" class="fila" data-msi="${x.deuda.id}">
        <span class="fila__texto"><span class="fila__titulo">${x.deuda.descripcion || x.deuda.acreedor}</span>
          <span class="fila__sub">${x.resumen.proximaFecha ? `${etiquetaMsi(x.deuda, x.resumen.proximaFecha)} · ${corto(x.resumen.proximoMonto)} el ${formatFecha(x.resumen.proximaFecha)}` : ""} · ${nombreCaja(x.deuda.cajaId)}</span></span>
        <span class="fila__monto">${formatMonto(x.resumen.saldoActual)}</span>
        ${icon("chevron", { size: 16, clase: "fila__chevron" })}</button></li>`)}</ul>` : ""}

    <div class="meta__acciones">
      ${!inactiva && e?.todo ? html`<button type="button" class="btn btn--pastilla" data-pagar="${cuenta.id}">Pagar</button>` : ""}
      ${inactiva ? "" : html`<button type="button" class="btn btn--pastilla" data-nueva-msi="${cuenta.id}">+ Compra a meses</button>`}
      <button type="button" class="btn-texto" data-editar="${cuenta.id}">${e && !e.configurada ? "Completar datos" : "Editar"}</button>
      <a class="btn-texto" href="#/movimientos?cuenta=${cuenta.id}">Movimientos</a>
    </div>
  </li>`;
}

export function render(container) {
  let estados = null; // Map id → { estado, aproximado }
  let error = null;
  let pedido = 0;
  let viva = true;

  async function cargar() {
    const s = getState();
    if (!catalogosListos() || !planListo()) return;
    const n = ++pedido;
    try {
      const lista = await estadosTarjetas(s);
      if (!viva || n !== pedido) return;
      estados = new Map(lista.map((x) => [x.cuenta.id, x]));
      error = null;
    } catch (err) {
      if (!viva || n !== pedido) return;
      error = err;
    }
    pintar();
  }

  function pintar() {
    const s = getState();
    if (!catalogosListos() || !planListo()) { renderHtml(container, skeletonLista(3)); return; }
    const todas = tarjetasDe(s);
    const activas = todas.filter((c) => c.activa !== false);
    const inactivas = todas.filter((c) => c.activa === false);
    const total = estados ? [...estados.values()].reduce((a, x) => a + x.estado.deudaTotal, 0) : null;
    renderHtml(container, html`
      <p class="texto-sec intro">Lo que debes en cada tarjeta, cuánto pagar para no generar intereses y tus compras a meses.
        Lo que compras con tarjeta se resta en ese momento de la caja que la paga; pagar la tarjeta solo baja el dinero del banco.</p>
      <div class="barra-acciones">
        ${total ? html`<span class="tarjetas__total">Debes en total <strong>${formatMonto(total)}</strong></span>` : ""}
        <button type="button" class="btn btn--primario" data-accion="nueva-tarjeta">+ Nueva tarjeta</button>
      </div>
      ${error ? html`<p class="aviso aviso--error">${icon("alerta", { size: 16 })} No se pudo calcular el estado de tus tarjetas. Revisa tu conexión.</p>` : ""}
      ${activas.length ? html`<ul class="lista-metas">${activas.map((c) => tarjeta(c, estados?.get(c.id)))}</ul>`
        : html`<button type="button" class="card hoja-vacia" data-accion="nueva-tarjeta">
            <strong>+ Agrega tu tarjeta de crédito</strong>
            <span>Con su día de corte y de pago, la app te dice cuánto pagar para no generar intereses y lleva tus compras a meses.</span></button>`}
      ${inactivas.length ? html`<h2 class="seccion__titulo">Desactivadas</h2><ul class="lista-metas">${inactivas.map((c) => tarjeta(c, estados?.get(c.id)))}</ul>` : ""}`);
  }

  const plan = (id) => getState().deudas.find((d) => d.id === id);
  const quitar = on(container, "click", "[data-accion='nueva-tarjeta'], [data-pagar], [data-nueva-msi], [data-editar], [data-msi], [data-pasar]", (e, el) => {
    if (el.dataset.accion === "nueva-tarjeta") return abrirTarjeta();
    if (el.dataset.pasar) {
      const t = cuentaPorId(el.dataset.pasar);
      const caja = cajaDeTarjeta(t, getState().cajas);
      return pasarACajaQuePaga(t, caja, otrasCajasDe(t, getState(), caja));
    }
    if (el.dataset.editar) return abrirTarjeta(cuentaPorId(el.dataset.editar));
    if (el.dataset.nuevaMsi) return abrirCompraMsi({ tarjetaId: el.dataset.nuevaMsi });
    if (el.dataset.msi) return abrirCompraMsi(plan(el.dataset.msi));
    if (el.dataset.pagar) {
      const info = estados?.get(el.dataset.pagar);
      if (info) abrirPagoTarjeta(cuentaPorId(el.dataset.pagar) || info.cuenta, info.estado);
    }
  });
  const cancelar = subscribe(() => { pintar(); cargar(); });
  pintar();
  cargar();
  return () => { viva = false; cancelar(); quitar(); };
}
