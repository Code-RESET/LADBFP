// ============================================================
// modules/dashboard/metricas.js
// Widgets del Inicio con métricas reales:
// - Tendencia del saldo total (línea, en la tarjeta principal).
// - Flujo del mes: ingresos, gastos y flujo neto vs mes anterior.
// - Ingresos vs gastos de los últimos 6 meses (columnas) + tabla.
// Los cálculos viven en domain/metricas.js; aquí solo se pinta.
// ============================================================

import { html } from "../../core/dom.js";
import { formatMonto } from "../../core/money.js";
import { hoy, mesDe, mesCorto, nombreMes } from "../../core/dates.js";

const MESES_LARGOS = (mes) => nombreMes(mes).split(" ")[0];
const capitalizar = (t) => t.charAt(0).toUpperCase() + t.slice(1);
import { serieMensual, variacion, primerMesConDatos } from "../../domain/metricas.js";
import { graficaColumnas, graficaLinea, leyenda } from "../../components/charts.js";
import { icon } from "../../components/icons.js";

export const SERIES_FLUJO = [
  { clave: "ingresos", nombre: "Ingresos", color: "var(--serie-1)" },
  { clave: "gastos", nombre: "Gastos", color: "var(--serie-2)" },
];

/** Serie de hasta 6 meses, sin meses anteriores al primer registro. */
export function calcularSerie(agregados, categorias) {
  const actual = mesDe(hoy());
  const serie = serieMensual(agregados, categorias, actual, 6);
  const primero = primerMesConDatos(agregados);
  return primero ? serie.filter((p) => p.mes >= primero) : serie.slice(-1);
}

/** Datos del tooltip de cada gráfica (para activarTooltips). */
export function tooltipMetricas(serie, grafica, i) {
  const p = serie[i];
  if (!p) return null;
  if (grafica === "saldo") {
    return { titulo: nombreMes(p.mes), filas: [{ nombre: "Saldo al cierre", valor: formatMonto(p.saldo) }] };
  }
  return {
    titulo: nombreMes(p.mes),
    filas: [
      ...SERIES_FLUJO.map((s) => ({ color: s.color, nombre: s.nombre, valor: formatMonto(p[s.clave]) })),
      { nombre: "Flujo neto", valor: formatMonto(p.neto, { signo: true }) },
    ],
  };
}

/** Línea de tendencia del saldo, para la tarjeta principal. */
export function tendenciaSaldo(serie, ancho) {
  if (serie.length < 2) return "";
  return html`<div class="hero__tendencia" data-grafica="saldo">
    ${graficaLinea({ puntos: serie.map((p) => ({ etiqueta: nombreMes(p.mes), valor: p.saldo })), ancho, titulo: "Saldo total al cierre de cada mes" })}
    <div class="hero__tendencia-ejes"><span>${mesCorto(serie[0].mes)}</span><span>${mesCorto(serie.at(-1).mes)}</span></div>
  </div>`;
}

function deltaHtml(pct, { subirEsBueno }, mesPrevio) {
  if (pct == null) return html`<span class="kpi__delta kpi__delta--neutro">Sin datos de ${mesCorto(mesPrevio)}</span>`;
  if (pct === 0) return html`<span class="kpi__delta kpi__delta--neutro">Igual que ${mesCorto(mesPrevio)}</span>`;
  const sube = pct > 0;
  const bueno = sube === subirEsBueno;
  return html`<span class="kpi__delta ${bueno ? "kpi__delta--bueno" : "kpi__delta--malo"}">
    ${icon(sube ? "ingreso" : "gasto", { size: 12 })}${Math.abs(pct)}% vs ${mesCorto(mesPrevio)}</span>`;
}

/** Sección completa "Flujo del mes" + gráfica de 6 meses + tabla. */
export function seccionFlujo(serie, ancho) {
  const actual = serie.at(-1);
  const previo = serie.at(-2);
  const mesPrevio = previo?.mes ?? actual.mes;
  const sinFlujo = serie.every((p) => !p.ingresos && !p.gastos);

  const kpis = html`<div class="kpis">
    <div class="kpi">
      <p class="kpi__etiqueta"><span class="viz-muestra" style="background:var(--serie-1)"></span>Ingresos</p>
      <p class="kpi__valor">${formatMonto(actual.ingresos)}</p>
      ${deltaHtml(variacion(actual.ingresos, previo?.ingresos), { subirEsBueno: true }, mesPrevio)}
    </div>
    <div class="kpi">
      <p class="kpi__etiqueta"><span class="viz-muestra" style="background:var(--serie-2)"></span>Gastos</p>
      <p class="kpi__valor">${formatMonto(actual.gastos)}</p>
      ${deltaHtml(variacion(actual.gastos, previo?.gastos), { subirEsBueno: false }, mesPrevio)}
    </div>
    <div class="kpi">
      <p class="kpi__etiqueta">Flujo neto</p>
      <p class="kpi__valor ${actual.neto < 0 ? "monto--negativo" : ""}">${formatMonto(actual.neto, { signo: true })}</p>
      <span class="kpi__delta ${actual.neto < 0 ? "kpi__delta--malo" : "kpi__delta--bueno"}">
        ${icon(actual.neto < 0 ? "alerta" : "check", { size: 12 })}${actual.neto < 0 ? "Gastaste más de lo que entró" : "Entró más de lo que gastaste"}</span>
    </div>
  </div>`;

  const enCurso = actual.mes === mesDe(hoy()) && previo;

  return html`<section class="seccion">
    <div class="seccion__cabecera"><h2 class="seccion__titulo">Flujo de ${nombreMes(actual.mes)}</h2></div>
    <div class="card card--grafica">
      ${kpis}
      ${enCurso ? html`<p class="kpi__nota">${capitalizar(MESES_LARGOS(actual.mes))} va en curso: se compara contra ${MESES_LARGOS(mesPrevio)} completo.</p>` : ""}
      ${sinFlujo
        ? html`<p class="texto-sec grafica-vacia">Aún no hay ingresos ni gastos registrados. Las transferencias y saldos iniciales no cuentan como flujo.</p>`
        : html`
          <div class="grafica-cabecera">
            <p class="grafica-titulo">Ingresos vs gastos · ${serie.length === 1 ? "este mes" : `últimos ${serie.length} meses`}</p>
            ${leyenda(SERIES_FLUJO)}
          </div>
          <div class="grafica" data-grafica="flujo">
            ${graficaColumnas({
              datos: serie.map((p, i) => ({ etiqueta: mesCorto(p.mes), destacado: i === serie.length - 1, valores: p })),
              series: SERIES_FLUJO,
              ancho,
              titulo: "Ingresos y gastos por mes",
            })}
          </div>
          <details class="grafica-tabla">
            <summary>Ver como tabla</summary>
            <table>
              <thead><tr><th>Mes</th><th>Ingresos</th><th>Gastos</th><th>Flujo neto</th><th>Saldo al cierre</th></tr></thead>
              <tbody>${serie.map((p) => html`<tr>
                <td>${nombreMes(p.mes)}</td><td>${formatMonto(p.ingresos)}</td><td>${formatMonto(p.gastos)}</td>
                <td class="${p.neto < 0 ? "monto--negativo" : ""}">${formatMonto(p.neto, { signo: true })}</td><td>${formatMonto(p.saldo)}</td>
              </tr>`)}</tbody>
            </table>
          </details>`}
    </div>
  </section>`;
}
