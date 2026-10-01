// ============================================================
// modules/dashboard/index.js
// Pantalla principal. Fase 1: saldo total, saldo por caja,
// dónde está el dinero (por cuenta) y últimos movimientos.
// "Disponible real" (saldo − comprometido) llega en Fase 2,
// cuando existan obligaciones, deudas y metas: no se muestra
// un número inventado antes.
// ============================================================

import { html, render as renderHtml, on } from "../../core/dom.js";
import { formatMonto } from "../../core/money.js";
import { subscribe, getState, catalogosListos, cajaPorId } from "../../core/state.js";
import { mensajeDeError } from "../../core/errors.js";
import { saldosPor, patrimonio, desgloseCuenta } from "../../domain/saldos.js";
import { cuentaParaGasto, TIPOS_CAJA } from "../../domain/catalogos.js";
import { movimientosRepo } from "../../data/movimientosRepo.js";
import { perfilRepo } from "../../data/perfilRepo.js";
import { skeletonTarjeta, skeletonLista, estadoVacio } from "../../components/states.js";
import { filaMovimiento } from "../../components/movimientoItem.js";
import { abrirDetalleMovimiento } from "../../components/movimientoDetalle.js";
import { icon } from "../../components/icons.js";
import { pasoCatalogos, pasoSaldosIniciales } from "./bienvenida.js";

export function render(container, ctx) {
  const uid = ctx.user.uid;
  let ultimos = null;
  let errorUltimos = null;

  const cancelarUltimos = movimientosRepo.escucharUltimos(uid, 5,
    (items) => { ultimos = items; pintar(); },
    (err) => { errorUltimos = mensajeDeError(err); pintar(); });

  let modo = null; // clave de lo pintado: 'cargando', 'conectando', 'catalogos', 'saldos:…' o 'vista'

  function pintar() {
    const s = getState();
    const nuevoModo = !catalogosListos() ? "cargando"
      : s.cajas.length === 0 ? (s.cajasDesdeCache ? "conectando" : "catalogos")
      : (Object.values(s.agregados).every((a) => !a?.n) && !s.perfil?.config?.saldosIniciales) ? "saldos"
      : "vista";
    // Los pasos del asistente tienen formularios: no repintarlos mientras el
    // modo y el catálogo que muestran sigan iguales (se perdería lo escrito).
    const clave = nuevoModo === "saldos"
      ? `saldos:${s.cajas.map((c) => c.id)}:${s.cuentas.map((c) => c.id)}`
      : nuevoModo;
    if (clave === modo && nuevoModo !== "vista") return;
    modo = clave;

    if (nuevoModo === "cargando") renderHtml(container, html`${skeletonTarjeta()}${skeletonLista(4)}`);
    else if (nuevoModo === "conectando") renderHtml(container, estadoVacio({ icono: "nube", titulo: "Conectando…", texto: "Descargando tus datos por primera vez en este dispositivo." }));
    else if (nuevoModo === "catalogos") pasoCatalogos(container);
    else if (nuevoModo === "saldos") pasoSaldosIniciales(container, { onListo: () => perfilRepo.guardarConfig(uid, { saldosIniciales: "listo" }) });
    else renderHtml(container, vista(s));
  }

  function vista(s) {
    const porCaja = saldosPor(s.agregados, "porCaja");
    const porCuenta = saldosPor(s.agregados, "porCuenta");
    const total = patrimonio(s.agregados);
    const cajas = s.cajas.filter((c) => c.activa !== false || porCaja[c.id]);
    const cuentas = s.cuentas.filter((c) => c.activa !== false || porCuenta[c.id]);
    const operativo = cajas.filter(cuentaParaGasto).reduce((a, c) => a + (porCaja[c.id] || 0), 0);
    const reservado = total - operativo;

    return html`
      <section class="hero card">
        <p class="hero__etiqueta">Saldo total</p>
        <p class="hero__monto ${total < 0 ? "monto--negativo" : ""}">${formatMonto(total)}</p>
        <div class="hero__desglose">
          <span>Cajas operativas <strong>${formatMonto(operativo)}</strong></span>
          ${reservado ? html`<span>Capital / ahorro <strong>${formatMonto(reservado)}</strong></span>` : ""}
        </div>
        <p class="hero__nota">Próximamente: <em>disponible real</em>, descontando pagos comprometidos.</p>
      </section>

      <div class="acciones-rapidas">
        <button type="button" class="accion-rapida" data-accion="nuevo-movimiento" data-tipo="gasto">${icon("gasto")}<span>Gasto</span></button>
        <button type="button" class="accion-rapida" data-accion="nuevo-movimiento" data-tipo="ingreso">${icon("ingreso")}<span>Ingreso</span></button>
        <button type="button" class="accion-rapida" data-accion="nuevo-movimiento" data-tipo="transferencia">${icon("transferencia")}<span>Transferir</span></button>
      </div>

      <div class="dash-grid">
        <section class="seccion">
          <div class="seccion__cabecera"><h2 class="seccion__titulo">Mis cajas</h2><a href="#/cajas" class="link">Administrar</a></div>
          <ul class="lista card card--lista">${cajas.map((c) => html`<li>
            <a class="fila" href="#/movimientos?caja=${c.id}">
              <span class="punto" style="background:${c.color || "var(--accent)"}"></span>
              <span class="fila__texto"><span class="fila__titulo">${c.nombre}</span>
                ${c.tipo !== "operativa" ? html`<span class="fila__sub">${TIPOS_CAJA[c.tipo]}</span>` : ""}</span>
              <span class="fila__monto ${porCaja[c.id] < 0 ? "monto--negativo" : ""}">${formatMonto(porCaja[c.id] || 0)}</span>
              ${icon("chevron", { size: 16, clase: "fila__chevron" })}
            </a></li>`)}</ul>
        </section>

        <section class="seccion">
          <div class="seccion__cabecera"><h2 class="seccion__titulo">Dónde está el dinero</h2><a href="#/cuentas" class="link">Cuentas</a></div>
          <ul class="lista card card--lista">${cuentas.map((c) => {
            const desglose = desgloseCuenta(s.agregados, c.id);
            return html`<li>
              <details class="fila-expandible" ${desglose.length > 1 ? "" : "data-simple"}>
                <summary class="fila">
                  <span class="fila__icono">${icon("cuentas", { size: 18 })}</span>
                  <span class="fila__texto"><span class="fila__titulo">${c.nombre}</span>
                    ${desglose.length > 1 ? html`<span class="fila__sub">${desglose.length} cajas</span>` : ""}</span>
                  <span class="fila__monto ${porCuenta[c.id] < 0 ? "monto--negativo" : ""}">${formatMonto(porCuenta[c.id] || 0)}</span>
                </summary>
                ${desglose.length > 1 ? html`<ul class="sublista">${desglose.map((d) => html`<li>
                  <span>${cajaPorId(d.cajaId)?.nombre || "—"}</span><span>${formatMonto(d.saldo)}</span></li>`)}</ul>` : ""}
              </details></li>`;
          })}</ul>
        </section>
      </div>

      <section class="seccion">
        <div class="seccion__cabecera"><h2 class="seccion__titulo">Últimos movimientos</h2><a href="#/movimientos" class="link">Ver todos</a></div>
        ${errorUltimos ? html`<p class="texto-sec">${errorUltimos}</p>`
          : ultimos == null ? skeletonLista(3)
          : ultimos.length === 0 ? estadoVacio({ titulo: "Todavía no tienes movimientos.", accion: { label: "+ Registrar movimiento", accion: "nuevo-movimiento" } })
          : html`<ul class="lista card card--lista">${ultimos.map(filaMovimiento)}</ul>`}
      </section>`;
  }

  const quitarClick = on(container, "click", "[data-mov]", (e, el) => {
    const m = ultimos?.find((x) => x.id === el.dataset.mov);
    if (m) abrirDetalleMovimiento(m);
  });

  const cancelarState = subscribe(pintar);
  pintar();

  return () => {
    cancelarUltimos();
    cancelarState();
    quitarClick();
  };
}
