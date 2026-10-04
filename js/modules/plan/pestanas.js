// ============================================================
// modules/plan/pestanas.js
// Contenido de cada pestaña de Plan. Solo pinta: los números
// vienen de services/planCalculado.js (dominio puro).
// ============================================================

import { html } from "../../core/dom.js";
import { formatMonto } from "../../core/money.js";
import { formatFecha, mesCorto, nombreMes, sumarDias } from "../../core/dates.js";
import { cajaPorId, categoriaPorId } from "../../core/state.js";
import { cuentaParaGasto } from "../../domain/catalogos.js";
import { describirRegla } from "../../domain/periodos.js";
import { resumenDeuda } from "../../domain/compromisos.js";
import { evaluarPresupuesto, PERIODOS_PRESUPUESTO } from "../../domain/presupuesto.js";
import { porMes } from "../../domain/proyeccion.js";
import { graficaLinea } from "../../components/charts.js";
import { estadoVacio } from "../../components/states.js";
import { segmentado } from "../../components/fields.js";
import { icon } from "../../components/icons.js";
import { bloqueSugerencias, tarjetaAlerta, barra } from "./ui.js";
import { sugerenciasPendientes } from "./sugerencias.js";

const nombreCaja = (id) => cajaPorId(id)?.nombre || "—";

export const HORIZONTES = [
  { valor: "7", label: "7 días", dias: 7 },
  { valor: "30", label: "30 días", dias: 30 },
  { valor: "90", label: "90 días", dias: 90 },
  { valor: "365", label: "12 meses", dias: 365 },
];

// ---------------- Resumen ----------------

/** Puntos de la gráfica de proyección para un horizonte (diario o mensual). */
export function puntosProyeccion(plan, dias) {
  const tramo = plan.proyeccion.dias.slice(0, dias + 1);
  if (dias > 90) return porMes(tramo).map((m) => ({ etiqueta: nombreMes(m.mes), corto: mesCorto(m.mes), valor: m.total }));
  return tramo.map((d) => ({ etiqueta: formatFecha(d.fecha), corto: formatFecha(d.fecha).split(" ").slice(0, 2).join(" "), valor: d.total }));
}

export function pestanaResumen(s, plan, { horizonte, ancho }) {
  const h = HORIZONTES.find((x) => x.valor === horizonte) || HORIZONTES[1];
  const tramo = plan.proyeccion.dias.slice(0, h.dias + 1);
  const final = tramo.at(-1);
  const entradas = tramo.reduce((a, d) => a + d.entradas, 0);
  const salidas = tramo.reduce((a, d) => a + d.salidas, 0);
  const limite = sumarDias(plan.hoy, h.dias);
  const negativos = Object.entries(plan.proyeccion.primerNegativo).filter(([, f]) => f <= limite);
  const puntos = puntosProyeccion(plan, h.dias);
  const cajas = s.cajas.filter((c) => c.activa !== false);

  // Las de "quedará en negativo" se muestran abajo, junto a la proyección del horizonte elegido.
  const alertas = plan.alertas.filter((a) => a.tipo !== "flujo-negativo");

  return html`
    ${alertas.length ? html`<section class="seccion">
      <h2 class="seccion__titulo">Alertas</h2>
      <ul class="lista-alertas">${alertas.map(tarjetaAlerta)}</ul>
    </section>` : ""}

    <section class="seccion">
      <h2 class="seccion__titulo">Lo que puedes gastar · próximos ${plan.horizonte} días</h2>
      <p class="texto-sec intro">Lo que hay en cada caja menos lo apartado para pagos de los próximos ${plan.horizonte} días.</p>
      <div class="card card--lista">
        <table class="tabla-plan">
          <thead><tr><th>Caja</th><th>Tiene</th><th>Apartado</th><th>Puedes gastar</th></tr></thead>
          <tbody>${cajas.map((c) => {
            const d = plan.disponible.porCaja[c.id] || 0;
            return html`<tr class="${cuentaParaGasto(c) ? "" : "atenuada"}">
              <td><span class="punto" style="background:${c.color || "var(--accent)"}"></span> ${c.nombre}</td>
              <td>${formatMonto(plan.saldos[c.id] || 0)}</td>
              <td>${plan.comprometido[c.id] ? `-${formatMonto(plan.comprometido[c.id])}` : "—"}</td>
              <td class="${d < 0 ? "monto--negativo" : ""}"><strong>${formatMonto(d)}</strong></td></tr>`;
          })}</tbody>
          <tfoot><tr><td>Para gastar</td><td>${formatMonto(plan.disponible.saldoParaGasto)}</td>
            <td>${plan.disponible.comprometidoTotal ? `-${formatMonto(plan.disponible.comprometidoTotal)}` : "—"}</td>
            <td class="${plan.disponible.total < 0 ? "monto--negativo" : ""}"><strong>${formatMonto(plan.disponible.total)}</strong></td></tr></tfoot>
        </table>
      </div>
      <p class="campo__ayuda">Las cajas atenuadas (capital de crecimiento, ahorro) no cuentan como dinero para gastar.</p>
    </section>

    <section class="seccion">
      <h2 class="seccion__titulo">Si todo sigue igual…</h2>
      <div class="card card--grafica">
        <form class="horizonte">${segmentado("horizonte", HORIZONTES.map(({ valor, label }) => ({ valor, label })), h.valor)}</form>
        <div class="kpis">
          <div class="kpi"><p class="kpi__etiqueta">Entradas esperadas</p><p class="kpi__valor monto--positivo">+${formatMonto(entradas)}</p></div>
          <div class="kpi"><p class="kpi__etiqueta">Salidas</p><p class="kpi__valor">-${formatMonto(salidas)}</p></div>
          <div class="kpi"><p class="kpi__etiqueta">Saldo al ${formatFecha(final.fecha).split(" ").slice(0, 2).join(" ")}</p>
            <p class="kpi__valor ${final.total < 0 ? "monto--negativo" : ""}">${formatMonto(final.total)}</p></div>
        </div>
        <div class="hero__tendencia" data-grafica="proyeccion">
          ${graficaLinea({ puntos, ancho, alto: 110, titulo: "Saldo total proyectado" })}
          <div class="hero__tendencia-ejes"><span>${puntos[0].corto}</span><span>${puntos.at(-1).corto}</span></div>
        </div>
        ${negativos.length ? html`<ul class="lista-alertas">${negativos.map(([cajaId, f]) => tarjetaAlerta({
          nivel: "naranja", ruta: "plan?tab=resumen", titulo: `${nombreCaja(cajaId)} quedaría en negativo el ${formatFecha(f)}`,
          texto: "Ajusta ingresos, pagos o transfiere a tiempo." }))}</ul>` : html`<p class="aviso aviso--ok">✓ Ninguna caja queda en negativo en este periodo.</p>`}
        <p class="campo__ayuda">Incluye ingresos fijos, pases fijos entre cajas, gastos fijos, cuotas de deudas y presupuestos sostenibles.</p>
      </div>
    </section>

    <section class="seccion">
      <div class="seccion__cabecera"><h2 class="seccion__titulo">Pases fijos entre cajas</h2>
        <button type="button" class="btn-texto" data-nuevo-pase>+ Agregar</button></div>
      ${s.recurrentes.some((r) => r.tipo === "transferencia")
        ? html`<ul class="lista card card--lista">${s.recurrentes.filter((r) => r.tipo === "transferencia").map((r) => html`<li>
          <button type="button" class="fila ${r.activa === false ? "atenuada" : ""}" data-editar="recurrente:${r.id}">
            <span class="fila__icono">${icon("transferencia", { size: 18 })}</span>
            <span class="fila__texto"><span class="fila__titulo">${r.nombre}</span>
              <span class="fila__sub">${describirRegla(r.regla)} · ${nombreCaja(r.cajaId)} → ${nombreCaja(r.cajaDestinoId)}</span></span>
            <span class="fila__monto">${formatMonto(r.montoCentavos)}</span>
          </button></li>`)}</ul>`
        : html`<p class="texto-sec intro">Dinero que mueves cada cierto tiempo de una caja a otra (p. ej. tu sueldo de HD Crédit a Nu).</p>`}
    </section>`;
}

// ---------------- Presupuesto ----------------

export function pestanaPresupuesto(s) {
  const sug = sugerenciasPendientes("presupuesto", s.presupuestos);
  return html`
    <section class="seccion">
      <div class="seccion__cabecera"><h2 class="seccion__titulo">Presupuestos</h2>
        <button type="button" class="btn-texto" data-nuevo="presupuesto">+ Nuevo</button></div>
      ${s.presupuestos.length ? s.presupuestos.map((p) => {
        const ev = evaluarPresupuesto(p);
        return html`<button type="button" class="card tarjeta-presupuesto ${p.activa === false ? "atenuada" : ""}" data-editar="presupuesto:${p.id}">
          <div class="tarjeta-presupuesto__cabecera">
            <span class="fila__titulo">${p.nombre}</span>
            <span class="badge ${ev.estado === "deficitario" ? "badge--peligro" : "badge--ok"}">${ev.estado === "deficitario" ? "🔴 Deficitario" : "✓ Sostenible"}</span>
          </div>
          <p class="fila__sub">${PERIODOS_PRESUPUESTO[p.periodo]} · ${nombreCaja(p.cajaId)}</p>
          <dl class="lista-datos lista-datos--compacta">
            <div><dt>Ingreso</dt><dd>${formatMonto(p.ingresoCentavos)}</dd></div>
            ${p.lineas.map((l) => html`<div><dt>${categoriaPorId(l.categoriaId)?.nombre || "—"}</dt><dd>-${formatMonto(l.montoCentavos)}</dd></div>`)}
            ${(p.coberturas || []).map((c) => html`<div><dt>Cobertura desde ${nombreCaja(c.desdeCajaId)}</dt><dd>+${formatMonto(c.montoCentavos)}</dd></div>`)}
            <div class="lista-datos__total"><dt>${ev.resultado < 0 ? "Déficit" : "Sobrante"}</dt>
              <dd class="${ev.resultado < 0 ? "monto--negativo" : "monto--positivo"}">${formatMonto(ev.resultado, { signo: true })}</dd></div>
          </dl>
          ${ev.estado === "deficitario" ? html`<p class="campo__ayuda">No cuenta en el disponible real ni en la proyección hasta cubrir el déficit (reduce gastos o agrega una cobertura).</p>` : ""}
        </button>`;
      }) : html`<p class="texto-sec intro">El presupuesto real debe ser sostenible; si tiene déficit, la app lo marca en rojo.</p>`}
    </section>
    ${bloqueSugerencias("presupuesto", sug)}`;
}

// ---------------- Deudas ----------------

export function pestanaDeudas(s, plan) {
  const sug = sugerenciasPendientes("deuda", s.deudas);
  const total = s.deudas.filter((x) => x.activa !== false).reduce((a, dd) => a + resumenDeuda(dd, s.agregados, plan.hoy).saldoActual, 0);
  return html`
    <section class="seccion">
      <div class="seccion__cabecera"><h2 class="seccion__titulo">Deudas${total ? ` · debes ${formatMonto(total)}` : ""}</h2>
        <button type="button" class="btn-texto" data-nuevo="deuda">+ Nueva</button></div>
      ${s.deudas.length ? s.deudas.map((dd) => {
        const r = resumenDeuda(dd, s.agregados, plan.hoy);
        const evento = plan.eventos.find((e) => e.clase === "deuda" && e.ref.id === dd.id);
        return html`<div class="card tarjeta-deuda ${dd.activa === false ? "atenuada" : ""}">
          <button type="button" class="tarjeta-deuda__cabecera" data-editar="deuda:${dd.id}">
            <span class="fila__texto"><span class="fila__titulo">${dd.acreedor}</span>
              <span class="fila__sub">${dd.descripcion ? `${dd.descripcion} · ` : ""}${describirRegla(dd.regla)} · ${formatMonto(dd.pagoCentavos)}</span></span>
            ${icon("chevron", { size: 16, clase: "fila__chevron" })}
          </button>
          <div class="tarjeta-deuda__cifras">
            <div><p class="kpi__etiqueta">Saldo restante</p><p class="kpi__valor">${formatMonto(r.saldoActual)}</p></div>
            <div><p class="kpi__etiqueta">Pagado</p><p class="kpi__valor">${r.pct}%</p></div>
            <div><p class="kpi__etiqueta">Pagos restantes</p><p class="kpi__valor">${r.pagosRestantes}</p></div>
          </div>
          ${barra(r.pct)}
          <p class="fila__sub">${r.liquidada ? "✓ Liquidada" : r.fechaLiquidacion ? `Liquidación estimada: ${formatFecha(r.fechaLiquidacion)}` : ""}</p>
          <div class="acciones">
            <button type="button" class="btn btn--secundario" data-historial-deuda="${dd.id}">${icon("historial", { size: 16 })} Historial</button>
            ${evento ? html`<button type="button" class="btn btn--primario" data-pagar="deuda:${dd.id}:${evento.periodo}">Pagar ${formatMonto(evento.monto)}</button>` : ""}
          </div>
        </div>`;
      }) : html`<p class="texto-sec intro">Registra cada deuda con su saldo y pago por periodo: la app calcula saldo, % pagado y fecha de liquidación.</p>`}
    </section>
    ${bloqueSugerencias("deuda", sug)}`;
}
