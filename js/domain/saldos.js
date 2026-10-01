// ============================================================
// domain/saldos.js
// Saldo = aperturas + ingresos − gastos + transferencias
// entrantes − transferencias salientes ± ajustes.
// Se calcula sumando los agregados mensuales (derivados de los
// movimientos). Funciones puras, probadas en tests/.
// ============================================================

import { CAMPOS_TOTALES, clavePar } from "./movimientos.js";

/** Saldo de un nodo de totales { ing, gas, tin, tout, ape, ajE, ajS }. */
export function saldoDeTotales(t = {}) {
  return (t.ape || 0) + (t.ing || 0) - (t.gas || 0)
    + (t.tin || 0) - (t.tout || 0) + (t.ajE || 0) - (t.ajS || 0);
}

function sumarNodo(destino, origen) {
  for (const k of CAMPOS_TOTALES) {
    if (origen?.[k]) destino[k] = (destino[k] || 0) + origen[k];
  }
  return destino;
}

/**
 * Totales acumulados por dimensión ('porCaja' | 'porCuenta' | 'porCajaCuenta')
 * sumando los agregados de todos los meses (o solo hasta `hastaMes` inclusive).
 */
export function totalesPor(agregados, dimension, { hastaMes = null, soloMes = null } = {}) {
  const out = {};
  for (const [mes, doc] of Object.entries(agregados || {})) {
    if (hastaMes && mes > hastaMes) continue;
    if (soloMes && mes !== soloMes) continue;
    for (const [id, nodo] of Object.entries(doc?.[dimension] || {})) {
      sumarNodo(out[id] ??= {}, nodo);
    }
  }
  return out;
}

/** { id: saldoCentavos } por caja o por cuenta. */
export function saldosPor(agregados, dimension = "porCaja", opciones) {
  const totales = totalesPor(agregados, dimension, opciones);
  return Object.fromEntries(Object.entries(totales).map(([id, t]) => [id, saldoDeTotales(t)]));
}

/** Patrimonio total: suma de todas las cajas. Las transferencias se anulan entre sí. */
export function patrimonio(agregados) {
  return Object.values(saldosPor(agregados, "porCaja")).reduce((a, b) => a + b, 0);
}

/** Desglose de una cuenta por caja (p. ej. BBVA como hub): [{ cajaId, saldo }]. */
export function desgloseCuenta(agregados, cuentaId) {
  const saldos = saldosPor(agregados, "porCajaCuenta");
  return Object.entries(saldos)
    .filter(([k, s]) => k.endsWith(`__${cuentaId}`) && s !== 0)
    .map(([k, saldo]) => ({ cajaId: k.slice(0, -(`__${cuentaId}`).length), saldo }));
}

/** Desglose de una caja por cuenta: [{ cuentaId, saldo }]. */
export function desgloseCaja(agregados, cajaId) {
  const saldos = saldosPor(agregados, "porCajaCuenta");
  return Object.entries(saldos)
    .filter(([k, s]) => k.startsWith(`${cajaId}__`) && s !== 0)
    .map(([k, saldo]) => ({ cuentaId: k.slice(`${cajaId}__`.length), saldo }));
}

/** ¿La caja o cuenta tiene movimientos activos? (para permitir o no borrarla) */
export function tieneMovimientos(agregados, dimension, id) {
  return (totalesPor(agregados, dimension)[id]?.n || 0) > 0;
}

/**
 * Total de movimientos activos para un filtro, usando solo agregados.
 * Soporta filtros { cajaId | cuentaId, mes }. Si el filtro incluye algo que
 * los agregados no cuentan (tipo, anulados), devuelve null.
 */
export function contarDesdeAgregados(agregados, filtros = {}) {
  if (filtros.tipo || (filtros.estado && filtros.estado !== "activo")) return null;
  if (filtros.cajaId && filtros.cuentaId) return null;
  let total = 0;
  for (const [mes, doc] of Object.entries(agregados || {})) {
    if (filtros.mes && mes !== filtros.mes) continue;
    if (filtros.cajaId) total += doc?.porCaja?.[filtros.cajaId]?.n || 0;
    else if (filtros.cuentaId) total += doc?.porCuenta?.[filtros.cuentaId]?.n || 0;
    else total += doc?.n || 0;
  }
  return total;
}

/**
 * Compara los agregados guardados contra los recalculados desde movimientos.
 * Devuelve [{ mes, dimension, id, guardado, calculado }] con cada saldo distinto.
 */
export function diferenciasAgregados(guardados, calculados) {
  const meses = new Set([...Object.keys(guardados || {}), ...Object.keys(calculados || {})]);
  const difs = [];
  for (const mes of meses) {
    for (const dim of ["porCaja", "porCuenta"]) {
      const g = guardados?.[mes]?.[dim] || {};
      const c = calculados?.[mes]?.[dim] || {};
      for (const id of new Set([...Object.keys(g), ...Object.keys(c)])) {
        const sg = saldoDeTotales(g[id]);
        const sc = saldoDeTotales(c[id]);
        if (sg !== sc || (g[id]?.n || 0) !== (c[id]?.n || 0)) {
          difs.push({ mes, dimension: dim, id, guardado: sg, calculado: sc });
        }
      }
    }
  }
  return difs;
}

export { clavePar };
