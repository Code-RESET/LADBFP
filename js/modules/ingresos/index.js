// ============================================================
// modules/ingresos/index.js
// "Ingresos del Mes" (hoja 2 de la plantilla del usuario):
//   lo que ya entró este mes (concepto, categoría, monto, fecha,
//   forma de recepción) y lo que aún está "por cobrar" de los
//   ingresos fijos (nómina, cobranza…), con botón Registrar.
// ============================================================

import { html, render as renderHtml, on } from "../../core/dom.js";
import { formatMonto } from "../../core/money.js";
import { mesDe, hoy } from "../../core/dates.js";
import { mensajeDeError } from "../../core/errors.js";
import { getState, subscribe, planListo } from "../../core/state.js";
import { describirRegla } from "../../domain/periodos.js";
import { balanceDelMes, ingresosPorCobrar } from "../../domain/mes.js";
import { movimientosRepo } from "../../data/movimientosRepo.js";
import { reemplazarParams } from "../../router.js";
import { skeletonLista, estadoVacio } from "../../components/states.js";
import { selectorMes, moverMes } from "../../components/selectorMes.js";
import { filaMovimiento } from "../../components/movimientoItem.js";
import { abrirDetalleMovimiento } from "../../components/movimientoDetalle.js";
import { abrirFormularioMovimiento } from "../../components/movimientoForm.js";
import { icon } from "../../components/icons.js";
import { abrirRecurrente } from "../plan/formularios.js";
import { pagarEvento, claveEvento } from "../plan/acciones.js";
import { filaEvento, bloqueSugerencias } from "../plan/ui.js";
import { SUGERENCIAS, sugerenciasPendientes } from "../plan/sugerencias.js";

export function render(container, ctx) {
  const uid = ctx.user.uid;
  let mes = /^\d{4}-\d{2}$/.test(ctx.params.get("mes") || "") ? ctx.params.get("mes") : mesDe(hoy());
  let recibidos = null;
  let error = null;
  let porCobrar = [];

  async function cargar() {
    try {
      recibidos = await movimientosRepo.delMes(uid, mes, "ingreso");
      error = null;
    } catch (err) {
      error = mensajeDeError(err, "No se pudieron cargar los ingresos.");
    }
    pintar();
  }

  function pintar() {
    const s = getState();
    if (!planListo()) { renderHtml(container, skeletonLista(5)); return; }
    const b = balanceDelMes({ mes, obligaciones: s.obligaciones, deudas: s.deudas, recurrentes: s.recurrentes,
      agregados: s.agregados, categorias: s.categorias, hoy: hoy() });
    porCobrar = ingresosPorCobrar({ mes, recurrentes: s.recurrentes, agregados: s.agregados });
    const fijos = s.recurrentes.filter((r) => r.tipo === "ingreso");
    const sug = sugerenciasPendientes("recurrente", s.recurrentes).filter((x) => x.datos.tipo === "ingreso");

    renderHtml(container, html`
      ${selectorMes(mes)}

      <section class="card resumen-mes">
        <div class="resumen-mes__fila"><span>Total de ingresos del mes</span><strong class="monto--positivo">${formatMonto(b.ingresos)}</strong></div>
        ${b.porCobrar ? html`<div class="resumen-mes__fila"><span>Por cobrar (ingresos fijos)</span><strong>${formatMonto(b.porCobrar)}</strong></div>` : ""}
        <p class="campo__ayuda">No cuentan los préstamos que te hicieron ni el dinero que pasas entre tus cajas.</p>
      </section>

      <button type="button" class="btn btn--primario btn--bloque" data-accion="nuevo-ingreso">+ Registrar ingreso</button>

      ${porCobrar.length ? html`<section class="seccion">
        <h2 class="seccion__titulo">Por cobrar</h2>
        <ul class="lista card card--lista">${porCobrar.map(filaEvento)}</ul>
      </section>` : ""}

      <section class="seccion">
        <h2 class="seccion__titulo">Recibidos</h2>
        ${error ? html`<p class="texto-sec">${error}</p>`
          : recibidos == null ? skeletonLista(3)
          : recibidos.length ? html`<ul class="lista card card--lista">${recibidos.map(filaMovimiento)}</ul>`
          : estadoVacio({ icono: "ingreso", titulo: "Todavía no registras ingresos este mes." })}
      </section>

      <section class="seccion">
        <div class="seccion__cabecera"><h2 class="seccion__titulo">Ingresos fijos</h2>
          <button type="button" class="btn-texto" data-accion="nuevo-fijo">+ Agregar</button></div>
        ${fijos.length ? html`<ul class="lista card card--lista">${fijos.map((r) => html`<li>
          <button type="button" class="fila ${r.activa === false ? "atenuada" : ""}" data-editar="${r.id}">
            <span class="fila__icono">${icon("ingreso", { size: 18 })}</span>
            <span class="fila__texto"><span class="fila__titulo">${r.nombre}</span><span class="fila__sub">${describirRegla(r.regla)}</span></span>
            <span class="fila__monto">${formatMonto(r.montoCentavos)}</span>
            ${icon("chevron", { size: 16, clase: "fila__chevron" })}
          </button></li>`)}</ul>`
          : html`<p class="texto-sec intro">Nómina, honorarios fijos, cobranza… Agrégalos para ver cada mes qué falta por cobrar.</p>`}
      </section>

      ${bloqueSugerencias("recurrente", sug, "Sugerencias")}`);
  }

  function cambiarMes(nuevo) {
    mes = nuevo;
    reemplazarParams({ mes: mes === mesDe(hoy()) ? "" : mes });
    recibidos = null;
    pintar();
    cargar();
  }

  const quitarClick = on(container, "click", "[data-mes-nav], [data-pagar], [data-editar], [data-accion='nuevo-ingreso'], [data-accion='nuevo-fijo'], [data-sugerencia], [data-mov]", (e, el) => {
    const s = getState();
    if (el.dataset.mesNav) return cambiarMes(moverMes(mes, el.dataset.mesNav));
    if (el.dataset.pagar) {
      const ev = porCobrar.find((x) => claveEvento(x) === el.dataset.pagar);
      return ev && pagarEvento(ev);
    }
    if (el.dataset.editar) return abrirRecurrente(s.recurrentes.find((r) => r.id === el.dataset.editar));
    if (el.dataset.accion === "nuevo-ingreso") return abrirFormularioMovimiento({ tipo: "ingreso" });
    if (el.dataset.accion === "nuevo-fijo") return abrirRecurrente({ tipo: "ingreso" });
    if (el.dataset.sugerencia) {
      const [tipo, i] = el.dataset.sugerencia.split(":");
      return abrirRecurrente({ ...SUGERENCIAS[tipo][Number(i)].datos });
    }
    if (el.dataset.mov) {
      const m = recibidos?.find((x) => x.id === el.dataset.mov);
      if (m) abrirDetalleMovimiento(m);
    }
  });

  let firma = JSON.stringify(getState().agregados?.[mes] || {});
  const cancelar = subscribe((s) => {
    const nueva = JSON.stringify(s.agregados?.[mes] || {});
    if (nueva !== firma) { firma = nueva; cargar(); }
    pintar();
  });
  pintar();
  cargar();
  return () => { cancelar(); quitarClick(); };
}
