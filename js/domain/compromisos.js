// ============================================================
// domain/compromisos.js
// Obligaciones, deudas e ingresos/transferencias programados:
// validación, estado de cada ocurrencia y lista de eventos.
//
// Un pago se "vincula" a su ocurrencia al registrarlo desde la
// app (obligacionId + obligacionPeriodo, deudaId + deudaPeriodo,
// recurrenteId + recurrentePeriodo). Los agregados mensuales
// suman lo pagado por vínculo en `porVinculo` y por deuda en
// `porDeuda`, así el estado se calcula sin leer movimientos.
//
// Regla anti doble conteo (A10): una deuda genera su propio
// calendario; una obligación no puede apuntar a una deuda.
// ============================================================

import { esMontoValido } from "../core/money.js";
import { sumarDias } from "../core/dates.js";
import { textoRequerido, textoOpcional, resultado } from "../core/validation.js";
import { ocurrencias, proximas, erroresRegla } from "./periodos.js";

export const PREFIJO = { obligacion: "o", deuda: "d", recurrente: "r" };
export const claveVinculo = (tipo, id, periodo) => `${PREFIJO[tipo]}:${id}__${periodo}`;

/** Lo pagado (o recibido) para una ocurrencia concreta, sumando todos los meses. */
export function pagadoVinculo(agregados, clave) {
  return Object.values(agregados || {}).reduce((a, doc) => a + (doc?.porVinculo?.[clave] || 0), 0);
}

/** Total pagado a una deuda (todos sus pagos, vinculados a periodo o no). */
export function pagadoDeuda(agregados, deudaId) {
  return Object.values(agregados || {}).reduce((a, doc) => a + (doc?.porDeuda?.[deudaId] || 0), 0);
}

export function estadoOcurrencia({ monto, pagado, fecha, hoy }) {
  if (pagado >= monto) return "pagada";
  if (pagado > 0) return fecha < hoy ? "vencida" : "parcial";
  return fecha < hoy ? "vencida" : "pendiente";
}

export const ETIQUETA_ESTADO = {
  pendiente: "Pendiente", pagada: "Pagada", vencida: "Vencida", parcial: "Parcialmente pagada",
};

// ---------- Validaciones ----------

export function validarObligacion(o) {
  const errores = {
    nombre: textoRequerido(o.nombre, { max: 60 }),
    montoCentavos: esMontoValido(o.montoCentavos) ? null : "Escribe el monto.",
    cajaId: o.cajaId ? null : "Toda obligación necesita una caja.",
    cuentaId: o.cuentaId ? null : "Elige la cuenta con que se paga.",
    categoriaId: o.categoriaId ? null : "Elige una categoría.",
    nota: textoOpcional(o.nota, { max: 200 }),
    ...erroresRegla(o.regla),
  };
  if (o.variable) {
    if (!esMontoValido(o.minimoCentavos)) errores.minimoCentavos = "Escribe el mínimo.";
    if (!esMontoValido(o.maximoCentavos)) errores.maximoCentavos = "Escribe el máximo.";
    if (o.minimoCentavos > o.maximoCentavos) errores.maximoCentavos = "El máximo debe ser mayor o igual al mínimo.";
    else if (o.montoCentavos < o.minimoCentavos || o.montoCentavos > o.maximoCentavos) {
      errores.montoCentavos = "El monto presupuestado debe estar entre el mínimo y el máximo.";
    }
  }
  return resultado(errores);
}

export function validarDeuda(dd) {
  return resultado({
    acreedor: textoRequerido(dd.acreedor, { max: 60 }),
    descripcion: textoOpcional(dd.descripcion, { max: 200 }),
    saldoInicialCentavos: esMontoValido(dd.saldoInicialCentavos) ? null : "Escribe cuánto se debía al inicio.",
    pagoCentavos: esMontoValido(dd.pagoCentavos) ? null : "Escribe el pago por periodo.",
    cajaId: dd.cajaId ? null : "Toda deuda necesita una caja que la pague.",
    cuentaId: dd.cuentaId ? null : "Elige la cuenta con que se paga.",
    ...erroresRegla(dd.regla),
  });
}

export function validarRecurrente(r) {
  const errores = {
    nombre: textoRequerido(r.nombre, { max: 60 }),
    tipo: ["ingreso", "transferencia"].includes(r.tipo) ? null : "Tipo inválido.",
    montoCentavos: esMontoValido(r.montoCentavos) ? null : "Escribe el monto.",
    cajaId: r.cajaId ? null : "Elige la caja.",
    cuentaId: r.cuentaId ? null : "Elige la cuenta.",
    ...erroresRegla(r.regla),
  };
  if (r.tipo === "ingreso" && !r.categoriaId) errores.categoriaId = "Elige una categoría.";
  if (r.tipo === "transferencia") {
    if (!r.cajaDestinoId) errores.cajaDestinoId = "Elige la caja de destino.";
    if (!r.cuentaDestinoId) errores.cuentaDestinoId = "Elige la cuenta de destino.";
    if (r.cajaId === r.cajaDestinoId && r.cuentaId === r.cuentaDestinoId) {
      errores.cajaDestinoId = "El origen y el destino son la misma caja y la misma cuenta.";
    }
  }
  return resultado(errores);
}

// ---------- Deudas ----------

/**
 * Resumen de una deuda: saldo actual, % pagado, pagos restantes y fecha
 * estimada de liquidación (según su calendario y lo que falta).
 */
export function resumenDeuda(deuda, agregados, hoy) {
  const pagado = pagadoDeuda(agregados, deuda.id);
  const saldoActual = Math.max(0, deuda.saldoInicialCentavos - pagado);
  const pct = deuda.saldoInicialCentavos ? Math.min(100, Math.round((pagado / deuda.saldoInicialCentavos) * 100)) : 0;
  const pagosRestantes = saldoActual > 0 ? Math.ceil(saldoActual / deuda.pagoCentavos) : 0;
  // Fechas futuras cuyo periodo aún no se ha pagado.
  const candidatas = pagosRestantes ? proximas(deuda.regla, hoy, pagosRestantes + 3) : [];
  const fechas = candidatas.filter((f) => pagadoVinculo(agregados, claveVinculo("deuda", deuda.id, f)) === 0).slice(0, pagosRestantes);
  return {
    pagado, saldoActual, pct, pagosRestantes,
    proximaFecha: fechas[0] || null,
    proximoMonto: Math.min(deuda.pagoCentavos, saldoActual),
    fechaLiquidacion: fechas.length === pagosRestantes ? fechas.at(-1) || null : null,
    liquidada: saldoActual === 0,
  };
}

// ---------- Eventos (calendario combinado) ----------

/**
 * Todos los eventos entre `desde` y `hasta` que aún no se han cubierto:
 * obligaciones y deudas (salidas), ingresos esperados y transferencias
 * programadas. Las obligaciones vencidas no pagadas desde `vencidasDesde`
 * se incluyen con su fecha original y estado 'vencida'.
 *
 * Devuelve [{ fecha, clase, ref, nombre, cajaId, cuentaId, cajaDestinoId?,
 *            cuentaDestinoId?, categoriaId?, monto (pendiente), estado, periodo }]
 */
export function eventos({ obligaciones = [], deudas = [], recurrentes = [], agregados, hoy, hasta, vencidasDesde = sumarDias(hoy, -60) }) {
  const out = [];

  for (const o of obligaciones.filter((x) => x.activa !== false)) {
    for (const f of ocurrencias(o.regla, vencidasDesde, hasta)) {
      const pagado = pagadoVinculo(agregados, claveVinculo("obligacion", o.id, f));
      const estado = estadoOcurrencia({ monto: o.montoCentavos, pagado, fecha: f, hoy });
      if (estado === "pagada" || (f < hoy && estado !== "vencida")) continue;
      out.push({ fecha: f, clase: "obligacion", ref: o, nombre: o.nombre, cajaId: o.cajaId, cuentaId: o.cuentaId,
        categoriaId: o.categoriaId, monto: o.montoCentavos - pagado, pagado, estado, periodo: f });
    }
  }

  for (const dd of deudas.filter((x) => x.activa !== false)) {
    let restante = Math.max(0, dd.saldoInicialCentavos - pagadoDeuda(agregados, dd.id));
    for (const f of ocurrencias(dd.regla, vencidasDesde, hasta)) {
      if (restante <= 0) break;
      const cuota = Math.min(dd.pagoCentavos, restante);
      const pagado = pagadoVinculo(agregados, claveVinculo("deuda", dd.id, f));
      const estado = estadoOcurrencia({ monto: cuota, pagado, fecha: f, hoy });
      if (estado === "pagada") continue; // ya descontado en `restante` vía porDeuda
      restante -= cuota - pagado;
      out.push({ fecha: f, clase: "deuda", ref: dd, nombre: dd.acreedor, cajaId: dd.cajaId, cuentaId: dd.cuentaId,
        categoriaId: dd.categoriaId, monto: cuota - pagado, pagado, estado, periodo: f });
    }
  }

  for (const r of recurrentes.filter((x) => x.activa !== false)) {
    for (const f of ocurrencias(r.regla, hoy, hasta)) {
      const recibido = pagadoVinculo(agregados, claveVinculo("recurrente", r.id, f));
      if (recibido >= r.montoCentavos) continue;
      out.push({ fecha: f, clase: r.tipo, ref: r, nombre: r.nombre, cajaId: r.cajaId, cuentaId: r.cuentaId,
        cajaDestinoId: r.cajaDestinoId, cuentaDestinoId: r.cuentaDestinoId, categoriaId: r.categoriaId,
        monto: r.montoCentavos - recibido, pagado: recibido, estado: "pendiente", periodo: f });
    }
  }

  return out.sort((a, b) => a.fecha.localeCompare(b.fecha) || a.nombre.localeCompare(b.nombre, "es"));
}

/** Salidas (obligaciones y deudas) pendientes o vencidas hasta `hasta`: la lista de "próximos pagos". */
export function proximosPagos(listaEventos, hasta) {
  return listaEventos.filter((e) => (e.clase === "obligacion" || e.clase === "deuda") && e.fecha <= hasta);
}
