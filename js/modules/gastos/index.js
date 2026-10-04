// ============================================================
// modules/gastos/index.js
// "Gastos del Mes" (hoja 1 de la plantilla del usuario):
//   gastos fijos ordenados por día de vencimiento, con forma de
//   pago y estado Pagado / Pendiente / Vencido; "Pagar" registra
//   el gasto vinculado. Debajo, los gastos de una vez del mes.
//   Resumen: Total del mes · Pagado · Pendiente.
// ============================================================

import { html, render as renderHtml, on } from "../../core/dom.js";
import { formatMonto } from "../../core/money.js";
import { mesDe, hoy } from "../../core/dates.js";
import { mensajeDeError } from "../../core/errors.js";
import { getState, subscribe, planListo, categoriaPorId } from "../../core/state.js";
import { balanceDelMes } from "../../domain/mes.js";
import { movimientosRepo } from "../../data/movimientosRepo.js";
import { reemplazarParams } from "../../router.js";
import { skeletonLista, estadoVacio } from "../../components/states.js";
import { selectorMes, moverMes } from "../../components/selectorMes.js";
import { filaMovimiento } from "../../components/movimientoItem.js";
import { abrirDetalleMovimiento } from "../../components/movimientoDetalle.js";
import { abrirFormularioMovimiento } from "../../components/movimientoForm.js";
import { icon } from "../../components/icons.js";
import { abrirObligacion, abrirDeuda } from "../plan/formularios.js";
import { pagarEvento } from "../plan/acciones.js";
import { bloqueSugerencias, barra } from "../plan/ui.js";
import { SUGERENCIAS, sugerenciasPendientes } from "../plan/sugerencias.js";


export function render(container, ctx) {
  const uid = ctx.user.uid;
  let mes = /^\d{4}-\d{2}$/.test(ctx.params.get("mes") || "") ? ctx.params.get("mes") : mesDe(hoy());
  let otros = null;
  let errorOtros = null;
  let balance = null;

  async function cargarOtros() {
    try {
      const gastos = await movimientosRepo.delMes(uid, mes, "gasto");
      otros = gastos.filter((m) => !m.obligacionId && !m.deudaId);
      errorOtros = null;
    } catch (err) {
      errorOtros = mensajeDeError(err, "No se pudieron cargar los gastos.");
    }
    pintar();
  }

  function pintar() {
    const s = getState();
    if (!planListo()) { renderHtml(container, skeletonLista(5)); return; }
    balance = balanceDelMes({ mes, obligaciones: s.obligaciones, deudas: s.deudas, recurrentes: s.recurrentes,
      agregados: s.agregados, categorias: s.categorias, hoy: hoy() });
    const b = balance;
    const totalFijos = b.fijos.reduce((a, g) => a + g.monto, 0);
    const pagadoFijos = b.fijos.reduce((a, g) => a + Math.min(g.pagado, g.monto), 0);
    const sug = sugerenciasPendientes("obligacion", s.obligaciones);

    renderHtml(container, html`
      ${selectorMes(mes)}

      <section class="card resumen-mes">
        <div class="resumen-mes__fila"><span>Total de gastos del mes</span><strong>${formatMonto(b.totalGastos)}</strong></div>
        <div class="resumen-mes__fila"><span>Total pagado</span><strong class="monto--positivo">${formatMonto(b.pagado)}</strong></div>
        <div class="resumen-mes__fila"><span>Total pendiente</span><strong class="${b.vencido ? "monto--negativo" : ""}">${formatMonto(b.pendiente)}</strong></div>
        ${b.vencido ? html`<p class="aviso aviso--error">${icon("alerta", { size: 14 })} ${formatMonto(b.vencido)} ya vencieron.</p>` : ""}
        ${totalFijos ? html`${barra(Math.round((pagadoFijos / totalFijos) * 100))}
          <p class="campo__ayuda">${b.cuentasPagadas} de ${b.fijos.length} gastos fijos pagados</p>` : ""}
      </section>

      <section class="seccion">
        <div class="seccion__cabecera"><h2 class="seccion__titulo">Gastos fijos</h2>
          <button type="button" class="btn-texto" data-accion="nuevo-fijo">+ Agregar</button></div>
        ${b.fijos.length ? html`<ul class="lista card card--lista">${b.fijos.map((g, i) => html`<li>
          <div class="fila fila--gasto ${g.estado === "Pagado" ? "fila--pagada" : ""}">
            <span class="dia ${g.estado === "Vencido" ? "dia--vencido" : ""}" title="Día de vencimiento">${g.dia}</span>
            <button type="button" class="fila__texto fila__texto--boton" data-editar-fijo="${i}">
              <span class="fila__titulo">${g.nombre}</span>
              <span class="fila__sub ${g.estado === "Vencido" ? "texto-peligro" : ""}">${[g.estado === "Pagado" ? "" : g.estado, categoriaPorId(g.categoriaId)?.nombre, g.formaPago].filter(Boolean).join(" · ")}</span>
            </button>
            <span class="fila__monto-doble">
              <span class="fila__monto">${formatMonto(g.monto)}</span>
              ${g.estado === "Pagado"
                ? html`<span class="badge badge--ok">✓ Pagado</span>`
                : html`<button type="button" class="btn btn--chico ${g.estado === "Vencido" ? "btn--chico-peligro" : ""}" data-pagar-fijo="${i}">${g.pagado ? `Pagar ${formatMonto(g.pendiente)}` : "Pagar"}</button>`}
            </span>
          </div></li>`)}</ul>`
          : estadoVacio({ icono: "plan", titulo: "Agrega tus gastos fijos",
            texto: "Hipoteca, internet, tarjetas, sueldos… Cada mes verás qué ya pagaste y qué falta.",
            accion: { label: "+ Agregar gasto fijo", accion: "nuevo-fijo" } })}
      </section>

      <section class="seccion">
        <div class="seccion__cabecera"><h2 class="seccion__titulo">Otros gastos del mes</h2>
          <button type="button" class="btn-texto" data-accion="nuevo-gasto">+ Registrar</button></div>
        ${errorOtros ? html`<p class="texto-sec">${errorOtros}</p>`
          : otros == null ? skeletonLista(2)
          : otros.length ? html`<ul class="lista card card--lista">${otros.map(filaMovimiento)}</ul>`
          : html`<p class="texto-sec intro">Gastos que no se repiten (comida, gasolina, compras…). Regístralos con el botón ＋.</p>`}
      </section>

      ${bloqueSugerencias("obligacion", sug, "Sugerencias")}`);
  }

  function cambiarMes(nuevo) {
    mes = nuevo;
    reemplazarParams({ mes: mes === mesDe(hoy()) ? "" : mes });
    otros = null;
    pintar();
    cargarOtros();
  }

  const quitarClick = on(container, "click", "[data-mes-nav], [data-pagar-fijo], [data-editar-fijo], [data-accion='nuevo-fijo'], [data-accion='nuevo-gasto'], [data-sugerencia], [data-mov]", (e, el) => {
    if (el.dataset.mesNav) return cambiarMes(moverMes(mes, el.dataset.mesNav));
    if (el.dataset.pagarFijo) {
      const g = balance.fijos[Number(el.dataset.pagarFijo)];
      return g && pagarEvento({ ...g, cajaId: g.ref.cajaId, cuentaId: g.ref.cuentaId, monto: g.pendiente });
    }
    if (el.dataset.editarFijo) {
      const g = balance.fijos[Number(el.dataset.editarFijo)];
      return g && (g.clase === "deuda" ? abrirDeuda(g.ref) : abrirObligacion(g.ref));
    }
    if (el.dataset.accion === "nuevo-fijo") return abrirObligacion();
    if (el.dataset.accion === "nuevo-gasto") return abrirFormularioMovimiento({ tipo: "gasto" });
    if (el.dataset.sugerencia) {
      const [tipo, i] = el.dataset.sugerencia.split(":");
      return abrirObligacion({ ...SUGERENCIAS[tipo][Number(i)].datos });
    }
    if (el.dataset.mov) {
      const m = otros?.find((x) => x.id === el.dataset.mov);
      if (m) abrirDetalleMovimiento(m);
    }
  });

  // Cada pago o gasto nuevo cambia los agregados: recargar la lista de "otros gastos".
  let firma = JSON.stringify(getState().agregados?.[mes] || {});
  const cancelar = subscribe((s) => {
    const nueva = JSON.stringify(s.agregados?.[mes] || {});
    if (nueva !== firma) { firma = nueva; cargarOtros(); }
    pintar();
  });
  pintar();
  cargarOtros();
  return () => { cancelar(); quitarClick(); };
}

