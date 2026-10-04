// ============================================================
// domain/metricas.js
// Métricas del Dashboard a partir de los agregados mensuales
// (sin leer movimientos). Funciones puras, probadas en tests/.
//
// Reglas:
// - Ingresos del mes = ingresos registrados, SIN préstamos
//   recibidos (categorías esFinanciamiento): no son ingreso real.
// - Gastos del mes = gastos registrados.
// - Transferencias, saldos iniciales y ajustes no son flujo:
//   mueven o corrigen dinero, no lo ganan ni lo gastan.
// - Saldo al cierre = patrimonio acumulado hasta ese mes.
// ============================================================

import { ultimosMeses } from "../core/dates.js";
import { saldosPor } from "./saldos.js";

function sumaCampo(nodos, campo) {
  return Object.values(nodos || {}).reduce((a, n) => a + (n?.[campo] || 0), 0);
}

/** Ingresos, gastos y flujo neto de un mes. */
export function flujoDelMes(agregadoMes, categorias = []) {
  const financiamiento = categorias.filter((c) => c.esFinanciamiento).map((c) => c.id);
  const prestamos = financiamiento.reduce((a, id) => a + (agregadoMes?.porCategoria?.[id] || 0), 0);
  const ingresos = sumaCampo(agregadoMes?.porCaja, "ing") - prestamos;
  const gastos = sumaCampo(agregadoMes?.porCaja, "gas");
  return { ingresos, gastos, neto: ingresos - gastos };
}

/** Patrimonio al cierre de `mes` (todo lo registrado hasta ese mes inclusive). */
export function saldoAlCierre(agregados, mes) {
  return Object.values(saldosPor(agregados, "porCaja", { hastaMes: mes })).reduce((a, b) => a + b, 0);
}

/**
 * Serie de los últimos `n` meses terminando en `hasta`:
 * [{ mes, ingresos, gastos, neto, saldo }] del más antiguo al más reciente.
 */
export function serieMensual(agregados, categorias, hasta, n = 6) {
  return ultimosMeses(hasta, n).map((mes) => ({
    mes,
    ...flujoDelMes(agregados?.[mes], categorias),
    saldo: saldoAlCierre(agregados, mes),
  }));
}

/** Variación porcentual redondeada; null si no hay base para comparar. */
export function variacion(actual, anterior) {
  if (!anterior) return null;
  return Math.round(((actual - anterior) / Math.abs(anterior)) * 100);
}

/** El primer mes con cualquier registro (para no dibujar meses vacíos antes de empezar a usar la app). */
export function primerMesConDatos(agregados) {
  const meses = Object.keys(agregados || {}).filter((m) => agregados[m]?.n).sort();
  return meses[0] || null;
}
