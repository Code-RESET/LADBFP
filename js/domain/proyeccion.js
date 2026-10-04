// ============================================================
// domain/proyeccion.js
// Comprometido, disponible real y flujo proyectado.
//
// Comprometido (por caja, decisión E4, horizonte 30 días):
//   obligaciones y pagos de deuda pendientes o vencidos
// + transferencias programadas que SALEN de la caja
// + lo que falta del periodo actual de su presupuesto sostenible.
// Disponible real = saldo − comprometido (puede ser negativo).
// Lo que aún no entra (ingresos esperados) NO se suma: el
// disponible es conservador.
//
// Proyección día a día por caja:
//   saldo de hoy + ingresos esperados ± transferencias programadas
//   − obligaciones − deudas − gasto diario del presupuesto sostenible.
// Las vencidas se cargan hoy (hay que pagarlas).
// ============================================================

import { sumarDias } from "../core/dates.js";
import { restanteDelPeriodo, gastoDiario, esSostenible } from "./presupuesto.js";

const sumarEn = (obj, k, v) => { if (k) obj[k] = (obj[k] || 0) + v; };

/** { cajaId: centavos } comprometidos dentro del horizonte. */
export function comprometidoPorCaja({ eventos, presupuestos = [], hoy, horizonteDias = 30 }) {
  const hasta = sumarDias(hoy, horizonteDias);
  const out = {};
  for (const e of eventos) {
    if (e.fecha > hasta) continue;
    if (e.clase === "obligacion" || e.clase === "deuda" || e.clase === "transferencia") sumarEn(out, e.cajaId, e.monto);
  }
  for (const p of presupuestos.filter(esSostenible)) sumarEn(out, p.cajaId, restanteDelPeriodo(p, hoy));
  return out;
}

/**
 * Disponible por caja y total "para gastar".
 * cajas: lista con { id, tipo, disponibleParaGasto, activa }; saldos: { cajaId: centavos }.
 */
export function disponibleReal({ cajas, saldos, comprometido, cuentaParaGasto }) {
  const porCaja = {};
  let total = 0, comprometidoTotal = 0, saldoParaGasto = 0;
  for (const c of cajas) {
    const disp = (saldos[c.id] || 0) - (comprometido[c.id] || 0);
    porCaja[c.id] = disp;
    if (cuentaParaGasto(c)) {
      total += disp;                     // un déficit en una caja RESTA del total
      comprometidoTotal += comprometido[c.id] || 0;
      saldoParaGasto += saldos[c.id] || 0;
    }
  }
  return { porCaja, total, comprometidoTotal, saldoParaGasto };
}

/**
 * Simulación diaria. Devuelve:
 *  dias: [{ fecha, total, porCaja: {…}, entradas, salidas }]
 *  primerNegativo: { cajaId: fecha }  (primer día en que la caja queda < 0)
 *  entradas, salidas: totales del horizonte
 */
export function proyectar({ saldos, eventos, presupuestos = [], hoy, dias }) {
  const fin = sumarDias(hoy, dias);
  const actual = { ...saldos };
  const sostenibles = presupuestos.filter(esSostenible);
  const porFecha = {};
  for (const e of eventos) {
    const f = e.fecha < hoy ? hoy : e.fecha; // vencidas se cargan hoy
    if (f > fin) continue;
    (porFecha[f] ??= []).push(e);
  }

  const out = [];
  const primerNegativo = {};
  let entradasTot = 0, salidasTot = 0;
  for (let f = hoy, i = 0; f <= fin; f = sumarDias(f, 1), i++) {
    let entradas = 0, salidas = 0;
    for (const e of porFecha[f] || []) {
      if (e.clase === "ingreso") { sumarEn(actual, e.cajaId, e.monto); entradas += e.monto; }
      else if (e.clase === "transferencia") { sumarEn(actual, e.cajaId, -e.monto); sumarEn(actual, e.cajaDestinoId, e.monto); }
      else { sumarEn(actual, e.cajaId, -e.monto); salidas += e.monto; }
    }
    for (const p of sostenibles) {
      const g = Math.round(gastoDiario(p, f));
      sumarEn(actual, p.cajaId, -g);
      salidas += g;
    }
    entradasTot += entradas;
    salidasTot += salidas;
    for (const [caja, v] of Object.entries(actual)) {
      if (v < 0 && !primerNegativo[caja]) primerNegativo[caja] = f;
    }
    out.push({ fecha: f, total: Object.values(actual).reduce((a, b) => a + b, 0), porCaja: { ...actual }, entradas, salidas });
  }
  return { dias: out, primerNegativo, entradas: entradasTot, salidas: salidasTot };
}

/** Agrupa una proyección diaria en meses: saldo al cierre de cada mes. */
export function porMes(dias) {
  const meses = {};
  for (const d of dias) {
    const m = d.fecha.slice(0, 7);
    meses[m] = { mes: m, total: d.total, entradas: (meses[m]?.entradas || 0) + d.entradas, salidas: (meses[m]?.salidas || 0) + d.salidas };
  }
  return Object.values(meses);
}
