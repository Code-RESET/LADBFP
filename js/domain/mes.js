// ============================================================
// domain/mes.js
// El mes como en la plantilla de Excel del usuario:
//   Hoja "Gastos del Mes": cada gasto fijo con su día de
//     vencimiento, forma de pago y estado (Pagado / Pendiente /
//     Vencido).
//   Hoja "Ingresos": lo que entra en el mes.
//   Hoja "Balance": Ingresos − Gastos (TODOS: pagados y
//     pendientes), más total pagado y total pendiente.
// Funciones puras, probadas en tests/.
// ============================================================

import { mesSiguiente, sumarDias } from "../core/dates.js";
import { ocurrencias } from "./periodos.js";
import { claveVinculo, pagadoVinculo, pagadoDeuda } from "./compromisos.js";
import { flujoDelMes } from "./metricas.js";

export const FORMAS_PAGO = ["Efectivo", "Transferencia", "Tarjeta", "Domiciliado", "Depósito"];

const rangoMes = (mes) => ({ inicio: `${mes}-01`, fin: sumarDias(`${mesSiguiente(mes)}-01`, -1) });

/** Estado como en la plantilla. */
export function estadoGasto({ monto, pagado, fecha, hoy }) {
  if (pagado >= monto) return "Pagado";
  return fecha < hoy ? "Vencido" : "Pendiente";
}

/**
 * Gastos fijos que vencen en `mes` (pagos fijos y cuotas de deuda),
 * ordenados por fecha de vencimiento, con su estado.
 * [{ clase, ref, nombre, categoriaId, formaPago, nota, fecha, dia, monto, pagado, pendiente, estado, periodo }]
 */
export function gastosFijosDelMes({ mes, obligaciones = [], deudas = [], agregados, hoy }) {
  const { inicio, fin } = rangoMes(mes);
  const out = [];
  for (const o of obligaciones.filter((x) => x.activa !== false)) {
    for (const f of ocurrencias(o.regla, inicio, fin)) {
      const pagado = pagadoVinculo(agregados, claveVinculo("obligacion", o.id, f));
      out.push({ clase: "obligacion", ref: o, nombre: o.nombre, categoriaId: o.categoriaId, formaPago: o.formaPago || "", nota: o.nota || "",
        fecha: f, dia: Number(f.slice(8)), monto: o.montoCentavos, pagado, pendiente: Math.max(0, o.montoCentavos - pagado),
        estado: estadoGasto({ monto: o.montoCentavos, pagado, fecha: f, hoy }), periodo: f });
    }
  }
  for (const dd of deudas.filter((x) => x.activa !== false)) {
    const saldo = Math.max(0, dd.saldoInicialCentavos - pagadoDeuda(agregados, dd.id));
    for (const f of ocurrencias(dd.regla, inicio, fin)) {
      const pagado = pagadoVinculo(agregados, claveVinculo("deuda", dd.id, f));
      // Una deuda ya liquidada no genera cuotas pendientes (sí muestra las ya pagadas).
      const monto = pagado > 0 ? Math.max(pagado, Math.min(dd.pagoCentavos, pagado + saldo)) : Math.min(dd.pagoCentavos, saldo);
      if (monto <= 0) continue;
      out.push({ clase: "deuda", ref: dd, nombre: dd.acreedor, categoriaId: dd.categoriaId || "ga-deudas", formaPago: dd.formaPago || "", nota: dd.descripcion || "",
        fecha: f, dia: Number(f.slice(8)), monto, pagado, pendiente: Math.max(0, monto - pagado),
        estado: estadoGasto({ monto, pagado, fecha: f, hoy }), periodo: f });
    }
  }
  return out.sort((a, b) => a.fecha.localeCompare(b.fecha) || a.nombre.localeCompare(b.nombre, "es"));
}

/** Ingresos fijos esperados en `mes` que aún no se registran ("por cobrar"). */
export function ingresosPorCobrar({ mes, recurrentes = [], agregados }) {
  const { inicio, fin } = rangoMes(mes);
  const out = [];
  for (const r of recurrentes.filter((x) => x.activa !== false && x.tipo === "ingreso")) {
    for (const f of ocurrencias(r.regla, inicio, fin)) {
      const recibido = pagadoVinculo(agregados, claveVinculo("recurrente", r.id, f));
      if (recibido >= r.montoCentavos) continue;
      out.push({ clase: "ingreso", ref: r, nombre: r.nombre, categoriaId: r.categoriaId, cajaId: r.cajaId, cuentaId: r.cuentaId,
        fecha: f, monto: r.montoCentavos - recibido, pagado: recibido, estado: "pendiente", periodo: f });
    }
  }
  return out.sort((a, b) => a.fecha.localeCompare(b.fecha));
}

/**
 * Balance del mes (hoja "Balance"):
 *  ingresos       = ingresos registrados (sin préstamos recibidos)
 *  pagado         = gastos registrados en el mes (fijos pagados + gastos de una vez)
 *  pendiente      = lo que falta pagar de los gastos fijos del mes (pendientes + vencidos)
 *  totalGastos    = pagado + pendiente
 *  balance        = ingresos − totalGastos
 *  porCobrar      = ingresos fijos esperados que aún no llegan (informativo, no se suma)
 */
export function balanceDelMes({ mes, obligaciones, deudas, recurrentes, agregados, categorias, hoy }) {
  const flujo = flujoDelMes(agregados?.[mes], categorias);
  const fijos = gastosFijosDelMes({ mes, obligaciones, deudas, agregados, hoy });
  const pendiente = fijos.reduce((a, g) => a + g.pendiente, 0);
  const vencido = fijos.filter((g) => g.estado === "Vencido").reduce((a, g) => a + g.pendiente, 0);
  const porCobrar = ingresosPorCobrar({ mes, recurrentes, agregados }).reduce((a, i) => a + i.monto, 0);
  const totalGastos = flujo.gastos + pendiente;
  return {
    mes,
    ingresos: flujo.ingresos,
    pagado: flujo.gastos,
    pendiente,
    vencido,
    totalGastos,
    balance: flujo.ingresos - totalGastos,
    porCobrar,
    fijos,
    cuentasPagadas: fijos.filter((g) => g.estado === "Pagado").length,
  };
}
