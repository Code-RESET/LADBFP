// ============================================================
// modules/dashboard/metricas.js
// Gráfica plegada del Inicio: lo que entró y salió en los
// últimos meses (columnas), con tooltip.
// Los cálculos viven en domain/metricas.js; aquí solo se pinta.
// ============================================================

import { html } from "../../core/dom.js";
import { formatMonto } from "../../core/money.js";
import { hoy, mesDe, mesCorto, nombreMes } from "../../core/dates.js";
import { serieMensual, primerMesConDatos } from "../../domain/metricas.js";
import { graficaColumnas, leyenda } from "../../components/charts.js";

export const SERIES_FLUJO = [
  { clave: "ingresos", nombre: "Entró", color: "var(--serie-1)" },
  { clave: "gastos", nombre: "Salió", color: "var(--serie-2)" },
];

const soloMes = (mes) => nombreMes(mes).split(" ")[0];

/** Serie de hasta 6 meses, sin meses anteriores al primer registro. */
export function calcularSerie(agregados, categorias) {
  const serie = serieMensual(agregados, categorias, mesDe(hoy()), 6);
  const primero = primerMesConDatos(agregados);
  return primero ? serie.filter((p) => p.mes >= primero) : serie.slice(-1);
}

/** Datos del tooltip de la gráfica. */
export function tooltipMetricas(serie, grafica, i) {
  const p = serie[i];
  if (!p || grafica !== "flujo") return null;
  return {
    titulo: nombreMes(p.mes),
    filas: [
      ...SERIES_FLUJO.map((s) => ({ color: s.color, nombre: s.nombre, valor: formatMonto(p[s.clave]) })),
      { nombre: p.neto < 0 ? "Faltó" : "Quedó", valor: formatMonto(p.neto, { signo: true }) },
    ],
  };
}

/** Solo la gráfica de los últimos meses, plegada (para el Inicio). */
export function graficaMeses(serie, ancho, { abierta = false } = {}) {
  if (serie.length < 2 || !serie.some((p) => p.ingresos || p.gastos)) return "";
  return html`<section class="seccion">
    <details class="card mes-grafica" ${abierta ? "open" : ""}>
      <summary>Cómo te ha ido en los últimos ${serie.length} meses</summary>
      <div class="grafica-cabecera">${leyenda(SERIES_FLUJO)}</div>
      <div class="grafica" data-grafica="flujo">
        ${graficaColumnas({
          datos: serie.map((p, i) => ({ etiqueta: mesCorto(p.mes), destacado: i === serie.length - 1, valores: p })),
          series: SERIES_FLUJO, ancho, alto: 180, titulo: "Lo que entró y salió cada mes",
        })}
      </div>
    </details>
  </section>`;
}
