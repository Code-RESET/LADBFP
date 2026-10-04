// ============================================================
// modules/plan/index.js
// Planeación (en Más): Puedes gastar (disponible real por caja,
// avisos y proyección) · Deudas · Presupuesto.
// La pestaña activa vive en la URL: #/plan?tab=deudas
// ============================================================

import { html, render as renderHtml, on } from "../../core/dom.js";
import { formatMonto } from "../../core/money.js";
import { formatFecha } from "../../core/dates.js";
import { mensajeDeError } from "../../core/errors.js";
import { getState, subscribe, planListo } from "../../core/state.js";
import { movimientosRepo } from "../../data/movimientosRepo.js";
import { reemplazarParams } from "../../router.js";
import { calcularPlan } from "../../services/planCalculado.js";
import { skeletonLista } from "../../components/states.js";
import { abrirCapa } from "../../components/modal.js";
import { activarTooltips } from "../../components/charts.js";
import { pestanaResumen, pestanaPresupuesto, pestanaDeudas, puntosProyeccion, HORIZONTES } from "./pestanas.js";
import { abrirObligacion, abrirDeuda, abrirRecurrente, abrirPresupuesto } from "./formularios.js";
import { SUGERENCIAS } from "./sugerencias.js";
import { pagarEvento, claveEvento } from "./acciones.js";

// Los gastos e ingresos fijos viven en las pestañas Gastos e Ingresos;
// aquí queda lo de planeación: cuánto puedes gastar, deudas y presupuesto.
const PESTANAS = [
  { id: "resumen", label: "Puedes gastar" },
  { id: "deudas", label: "Deudas" },
  { id: "presupuesto", label: "Presupuesto" },
];

const ABRIR = { obligacion: abrirObligacion, deuda: abrirDeuda, recurrente: abrirRecurrente, presupuesto: abrirPresupuesto };
const LISTA = { obligacion: "obligaciones", deuda: "deudas", recurrente: "recurrentes", presupuesto: "presupuestos" };

export function render(container, ctx) {
  let tab = PESTANAS.some((p) => p.id === ctx.params.get("tab")) ? ctx.params.get("tab") : "resumen";
  let horizonte = ctx.params.get("h") || "30";

  renderHtml(container, html`
    <nav class="pestanas" role="tablist" aria-label="Secciones del plan">${PESTANAS.map((p) => html`
      <button type="button" role="tab" class="pestana" data-tab="${p.id}" aria-selected="${p.id === tab}">${p.label}</button>`)}</nav>
    <div data-panel></div>`);
  const panel = container.querySelector("[data-panel]");

  function ancho() {
    const cs = getComputedStyle(container);
    return container.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - 32;
  }

  function pintar() {
    container.querySelectorAll(".pestana").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.tab === tab)));
    const s = getState();
    if (!planListo()) { renderHtml(panel, skeletonLista(4)); return; }
    const plan = calcularPlan(s);
    const vistas = {
      resumen: () => pestanaResumen(s, plan, { horizonte, ancho: ancho() }),
      presupuesto: () => pestanaPresupuesto(s),
      deudas: () => pestanaDeudas(s, plan),
    };
    renderHtml(panel, vistas[tab]());
  }

  function cambiarTab(nuevo) {
    tab = nuevo;
    reemplazarParams({ tab: tab === "resumen" ? "" : tab, h: horizonte !== "30" ? horizonte : "" });
    pintar();
    window.scrollTo(0, 0);
  }

  const quitarClick = on(container, "click", "[data-tab], [data-nuevo], [data-nuevo-pase], [data-editar], [data-sugerencia], [data-pagar], [data-historial-deuda]", (e, el) => {
    const s = getState();
    if (el.hasAttribute("data-nuevo-pase")) return abrirRecurrente({ tipo: "transferencia", nombre: "" });
    if (el.dataset.tab) return cambiarTab(el.dataset.tab);
    if (el.dataset.nuevo) return ABRIR[el.dataset.nuevo]();
    if (el.dataset.editar) {
      const [tipo, id] = el.dataset.editar.split(":");
      const item = s[LISTA[tipo]].find((x) => x.id === id);
      return item && ABRIR[tipo](item);
    }
    if (el.dataset.sugerencia) {
      const [tipo, i] = el.dataset.sugerencia.split(":");
      return ABRIR[tipo]({ ...SUGERENCIAS[tipo][Number(i)].datos });
    }
    if (el.dataset.pagar) {
      const evento = calcularPlan(s).eventos.find((x) => claveEvento(x) === el.dataset.pagar);
      return evento && pagarEvento(evento);
    }
    if (el.dataset.historialDeuda) return historialDeuda(s, el.dataset.historialDeuda);
  });

  const quitarHorizonte = on(container, "change", "input[name='horizonte']", (e, el) => {
    horizonte = el.value;
    reemplazarParams({ tab: tab === "resumen" ? "" : tab, h: horizonte !== "30" ? horizonte : "" });
    pintar();
  });

  const quitarTooltips = activarTooltips(container, (grafica, i) => {
    if (grafica !== "proyeccion") return null;
    const dias = (HORIZONTES.find((h) => h.valor === horizonte) || HORIZONTES[1]).dias;
    const p = puntosProyeccion(calcularPlan(getState()), dias)[i];
    return p && { titulo: p.etiqueta, filas: [{ nombre: "Saldo proyectado", valor: formatMonto(p.valor) }] };
  });

  const cancelar = subscribe(pintar);
  pintar();
  return () => { cancelar(); quitarClick(); quitarHorizonte(); quitarTooltips(); };
}

async function historialDeuda(s, deudaId) {
  const deuda = s.deudas.find((d) => d.id === deudaId);
  const capa = abrirCapa({ titulo: `Pagos a ${deuda?.acreedor || ""}`, contenido: html`<div data-h><p class="texto-sec">Cargando…</p></div>` });
  const slot = capa.cuerpo.querySelector("[data-h]");
  try {
    const pagos = await movimientosRepo.pagosDe(s.user.uid, "deudaId", deudaId);
    renderHtml(slot, pagos.length
      ? html`<dl class="lista-datos">${pagos.map((m) => html`<div><dt>${formatFecha(m.fecha)}${m.nota ? ` · ${m.nota}` : ""}</dt><dd>${formatMonto(m.montoCentavos)}</dd></div>`)}</dl>`
      : html`<p class="texto-sec">Aún no hay pagos registrados. Usa «Pagar» para que queden vinculados a esta deuda.</p>`);
  } catch (err) {
    renderHtml(slot, html`<p class="aviso aviso--error">${mensajeDeError(err, "No se pudo cargar el historial.")}</p>`);
  }
}
