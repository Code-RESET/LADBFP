// ============================================================
// domain/cuadre.js
// "Cuadrar con mis bancos": escribes lo que dice cada banco hoy
// (cuenta + apartados + cajitas) y lo que debes en cada tarjeta;
// la app calcula la diferencia y el movimiento que la corrige:
//  - banco sin movimientos → su saldo inicial (apertura)
//  - banco con movimientos → ajuste de entrada o de salida
//  - tarjeta → ajuste en (caja, tarjeta): más deuda = salida
// Los ajustes no cuentan como ingreso ni gasto: sirven para
// rendimientos, descuentos automáticos o algo que no se registró.
// Funciones puras, probadas en tests/.
// ============================================================

import { formatFecha } from "../core/dates.js";
import { saldosPor, desgloseCuenta, tieneMovimientos } from "./saldos.js";
import { resumenDeuda } from "./compromisos.js";
import { esTarjeta } from "./tarjetas.js";

/** Lo que falta pagar de las compras a meses de una tarjeta. */
function msiDe(cuentaId, deudas, agregados, hoy) {
  return deudas.filter((d) => d.tarjetaId === cuentaId && d.activa !== false)
    .reduce((a, d) => a + resumenDeuda(d, agregados, hoy).saldoActual, 0);
}

/** Lo que dice la app: el saldo del banco, o lo que debes en la tarjeta (con sus compras a meses). */
export function enApp({ cuenta, agregados = {}, deudas = [], hoy }) {
  const saldo = saldosPor(agregados, "porCuenta")[cuenta.id] || 0;
  return esTarjeta(cuenta) ? -saldo + msiDe(cuenta.id, deudas, agregados, hoy) : saldo;
}

/**
 * A qué caja va la diferencia. Banco: la caja con más dinero ahí; si no
 * hay, la caja sugerida del banco o la que lo tiene de predeterminado.
 * Tarjeta: la caja que más debe ahí. Si no, la primera caja operativa.
 */
export function cajaSugerida({ cuenta, agregados = {}, cajas = [] }) {
  const activas = cajas.filter((c) => c.activa !== false);
  const ids = new Set(activas.map((c) => c.id));
  const tarjeta = esTarjeta(cuenta);
  const mejor = desgloseCuenta(agregados, cuenta.id)
    .filter((d) => ids.has(d.cajaId) && (tarjeta ? d.saldo < 0 : d.saldo > 0))
    .sort((a, b) => (tarjeta ? a.saldo - b.saldo : b.saldo - a.saldo))[0];
  if (mejor) return mejor.cajaId;
  if (ids.has(cuenta.cajaPredeterminadaId)) return cuenta.cajaPredeterminadaId;
  const suya = activas.find((c) => c.cuentaPredeterminadaId === cuenta.id);
  if (suya) return suya.id;
  return (activas.find((c) => c.tipo === "operativa") || activas[0])?.id || "";
}

/**
 * Cuadre de una cuenta. `real` en centavos: en un banco, lo que tienes;
 * en una tarjeta, lo que debes (su saldo actual).
 * → { enApp, real, diferencia, efectoCaja, movimiento | null }
 *   diferencia > 0: en el banco hay más (o en la tarjeta debes más) que en la app.
 *   efectoCaja: cuánto sube (+) o baja (−) la caja elegida.
 */
export function cuadreDe({ cuenta, real, cajaId, agregados = {}, deudas = [], hoy }) {
  const app = enApp({ cuenta, agregados, deudas, hoy });
  const diferencia = real - app;
  const tarjeta = esTarjeta(cuenta);
  const efectoCaja = tarjeta ? -diferencia : diferencia;
  if (!diferencia) return { enApp: app, real, diferencia: 0, efectoCaja: 0, movimiento: null };
  const base = { fecha: hoy, montoCentavos: Math.abs(diferencia), cajaId, cuentaId: cuenta.id };
  if (!tarjeta && diferencia > 0 && !tieneMovimientos(agregados, "porCuenta", cuenta.id)) {
    return { enApp: app, real, diferencia, efectoCaja,
      movimiento: { ...base, tipo: "apertura", nota: `Saldo inicial (cuadre con ${cuenta.nombre})` } };
  }
  return { enApp: app, real, diferencia, efectoCaja,
    movimiento: { ...base, tipo: "ajuste", direccion: efectoCaja > 0 ? "entrada" : "salida",
      nota: `Cuadre con ${cuenta.nombre} del ${formatFecha(hoy)}` } };
}

/** Lo que tienes en bancos, lo que debes (tarjetas, compras a meses y deudas) y lo que te queda. */
export function patrimonioReal({ cuentas = [], agregados = {}, deudas = [], hoy }) {
  const saldos = saldosPor(agregados, "porCuenta");
  const tienes = cuentas.filter((c) => !esTarjeta(c)).reduce((a, c) => a + (saldos[c.id] || 0), 0);
  const tarjetas = cuentas.filter(esTarjeta).reduce((a, c) => a + Math.max(0, -(saldos[c.id] || 0)), 0);
  const deudasActivas = deudas.filter((d) => d.activa !== false).reduce((a, d) => a + resumenDeuda(d, agregados, hoy).saldoActual, 0);
  const debes = tarjetas + deudasActivas;
  return { tienes, debes, neto: tienes - debes };
}
