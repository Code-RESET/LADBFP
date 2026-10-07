// ============================================================
// domain/reporte.js
// Datos del Excel del mes ("balance real"). Solo calcula; el
// archivo lo arma services/exportExcel.js. Funciones puras.
//
//  balance     como la hoja Balance del usuario: Ingresos − Gastos
//              del mes (pagados + pendientes) = Te quedan.
//  dineroReal  lo que de verdad pasó con el dinero:
//              al empezar + entró − salió ± saldo inicial/ajustes
//              = al cerrar el mes (cuadra con "Mis cajas").
//  gastos / ingresos / cajas / movimientos / meses: tablas.
// ============================================================

import { mesAnterior } from "../core/dates.js";
import { saldosPor, totalesPor } from "./saldos.js";
import { serieMensual, saldoAlCierre, primerMesConDatos } from "./metricas.js";
import { balanceDelMes, ingresosFijosDelMes } from "./mes.js";

const porId = (lista) => Object.fromEntries((lista || []).map((x) => [x.id, x]));

/** Monto con signo según lo que hace con tu dinero (transferencia = 0: solo lo cambia de caja). */
export function montoConSigno(m) {
  if (m.tipo === "gasto") return -m.montoCentavos;
  if (m.tipo === "ajuste") return m.direccion === "salida" ? -m.montoCentavos : m.montoCentavos;
  if (m.tipo === "transferencia") return 0;
  return m.montoCentavos;
}

const TIPO = { ingreso: "Ingreso", gasto: "Gasto", transferencia: "Transferencia", apertura: "Saldo inicial", ajuste: "Ajuste" };

/**
 * reporteMes({ mes, hoy, cajas, cuentas, categorias, obligaciones, deudas, recurrentes, agregados, movimientos })
 * `movimientos` = movimientos ACTIVOS del mes (todos los tipos).
 */
export function reporteMes({ mes, hoy, cajas = [], cuentas = [], categorias = [], obligaciones = [], deudas = [], recurrentes = [], agregados = {}, movimientos = [] }) {
  const caja = porId(cajas);
  const cuenta = porId(cuentas);
  const cat = porId(categorias);
  const nombre = (m) => m.nota || cat[m.categoriaId]?.nombre || TIPO[m.tipo];
  const activos = movimientos.filter((m) => m.estado !== "anulado" && m.mes === mes);

  const b = balanceDelMes({ mes, obligaciones, deudas, recurrentes, agregados, categorias, hoy });

  // Gastos: fijos (con su estado) + los de una vez (ya pagados).
  const gastos = [
    ...b.fijos.map((g) => ({ fecha: g.fecha, concepto: g.nombre, caja: caja[g.ref.cajaId]?.nombre || "", categoria: cat[g.categoriaId]?.nombre || "",
      monto: g.monto, pagado: Math.min(g.pagado, g.monto), estado: g.estado, fijo: "Sí", formaPago: g.formaPago || "" })),
    ...activos.filter((m) => m.tipo === "gasto" && !m.obligacionId && !m.deudaId).map((m) => ({ fecha: m.fecha, concepto: nombre(m),
      caja: caja[m.cajaId]?.nombre || "", categoria: cat[m.categoriaId]?.nombre || "", monto: m.montoCentavos, pagado: m.montoCentavos,
      estado: "Pagado", fijo: "No", formaPago: m.formaPago || "" })),
  ].sort((x, y) => x.fecha.localeCompare(y.fecha) || x.concepto.localeCompare(y.concepto, "es"));

  const ingresos = [
    ...ingresosFijosDelMes({ mes, recurrentes, agregados }).map((i) => ({ fecha: i.fecha, concepto: i.nombre, caja: caja[i.cajaId]?.nombre || "",
      categoria: cat[i.categoriaId]?.nombre || "", monto: i.monto, recibido: Math.min(i.pagado, i.monto), estado: i.estado, fijo: "Sí" })),
    ...activos.filter((m) => m.tipo === "ingreso" && !m.recurrenteId).map((m) => ({ fecha: m.fecha, concepto: nombre(m),
      caja: caja[m.cajaId]?.nombre || "", categoria: cat[m.categoriaId]?.nombre || "", monto: m.montoCentavos, recibido: m.montoCentavos,
      estado: cat[m.categoriaId]?.esFinanciamiento ? "Préstamo (no cuenta)" : "Recibido", fijo: "No" })),
  ].sort((x, y) => x.fecha.localeCompare(y.fecha) || x.concepto.localeCompare(y.concepto, "es"));

  // Cajas: saldo al empezar el mes → movimientos del mes → saldo al cerrar.
  const inicioCaja = saldosPor(agregados, "porCaja", { hastaMes: mesAnterior(mes) });
  const cierreCaja = saldosPor(agregados, "porCaja", { hastaMes: mes });
  const delMes = totalesPor(agregados, "porCaja", { soloMes: mes });
  const filasCajas = cajas
    .filter((c) => c.activa !== false || inicioCaja[c.id] || cierreCaja[c.id])
    .map((c) => {
      const t = delMes[c.id] || {};
      return { caja: c.nombre, banco: cuenta[c.cuentaPredeterminadaId]?.nombre || "", inicio: inicioCaja[c.id] || 0,
        entro: t.ing || 0, salio: t.gas || 0, transferencias: (t.tin || 0) - (t.tout || 0),
        otros: (t.ape || 0) + (t.ajE || 0) - (t.ajS || 0), cierre: cierreCaja[c.id] || 0 };
    });

  // Con todas las cajas (también desactivadas): al empezar + entró − salió + otros = al cerrar.
  const total = Object.values(delMes).reduce((a, t) => {
    for (const k of ["ing", "gas", "ape", "ajE", "ajS"]) a[k] += t[k] || 0;
    return a;
  }, { ing: 0, gas: 0, ape: 0, ajE: 0, ajS: 0 });
  const dineroReal = {
    inicio: saldoAlCierre(agregados, mesAnterior(mes)),
    entro: total.ing,
    salio: total.gas,
    otros: total.ape + total.ajE - total.ajS,
    cierre: saldoAlCierre(agregados, mes),
  };

  const filasMovs = activos
    .slice()
    .sort((x, y) => x.fecha.localeCompare(y.fecha) || (x.ts || 0) - (y.ts || 0))
    .map((m) => ({
      fecha: m.fecha, tipo: TIPO[m.tipo] || m.tipo, concepto: nombre(m),
      caja: m.tipo === "transferencia" ? `${caja[m.cajaId]?.nombre || ""} → ${caja[m.cajaDestinoId]?.nombre || ""}` : caja[m.cajaId]?.nombre || "",
      banco: m.tipo === "transferencia" ? `${cuenta[m.cuentaId]?.nombre || ""} → ${cuenta[m.cuentaDestinoId]?.nombre || ""}` : cuenta[m.cuentaId]?.nombre || "",
      categoria: cat[m.categoriaId]?.nombre || "", monto: montoConSigno(m), importe: m.montoCentavos, formaPago: m.formaPago || "",
    }));

  return {
    mes,
    balance: { ingresos: b.ingresos, pagado: b.pagado, pendiente: b.pendiente, vencido: b.vencido, totalGastos: b.totalGastos, balance: b.balance, porCobrar: b.porCobrar },
    dineroReal,
    gastos,
    ingresos,
    cajas: filasCajas,
    movimientos: filasMovs,
    // Hasta 12 meses, sin los anteriores a tu primer registro.
    meses: serieMensual(agregados, categorias, mes, 12).filter((p) => p.mes >= (primerMesConDatos(agregados) || mes)),
  };
}
