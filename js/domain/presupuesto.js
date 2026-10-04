// ============================================================
// domain/presupuesto.js
// Presupuesto real (decisión A4): puede guardarse deficitario,
// pero solo es "sostenible" —y entra al disponible real y a la
// proyección— si ingreso + coberturas ≥ gastos presupuestados.
// Ejemplo: 3,500 − (2,500 + 831 + 690) = −521 → deficitario.
//
// El campo `ingreso` sirve para evaluar el déficit; en la
// proyección el dinero que entra viene de los ingresos/transfe-
// rencias programados (para no contarlo dos veces).
// ============================================================

import { esMontoValido, sumar } from "../core/money.js";
import { textoRequerido, resultado } from "../core/validation.js";
import { periodoDe, diasEntre } from "./periodos.js";

export const PERIODOS_PRESUPUESTO = { semanal: "Semanal", quincenal: "Quincenal", mensual: "Mensual" };

export function evaluarPresupuesto(p) {
  const gastos = sumar((p.lineas || []).map((l) => l.montoCentavos));
  const coberturas = sumar((p.coberturas || []).map((c) => c.montoCentavos));
  const resultadoNeto = (p.ingresoCentavos || 0) + coberturas - gastos;
  return {
    gastos,
    coberturas,
    resultado: resultadoNeto,                       // < 0 = déficit
    deficit: resultadoNeto < 0 ? -resultadoNeto : 0,
    sinCubrir: (p.ingresoCentavos || 0) - gastos,   // déficit antes de coberturas
    estado: resultadoNeto < 0 ? "deficitario" : "sostenible",
  };
}

export function validarPresupuesto(p) {
  const errores = {
    nombre: textoRequerido(p.nombre, { max: 60 }),
    periodo: PERIODOS_PRESUPUESTO[p.periodo] ? null : "Elige el periodo.",
    cajaId: p.cajaId ? null : "Elige la caja de este presupuesto.",
    ingresoCentavos: Number.isSafeInteger(p.ingresoCentavos) && p.ingresoCentavos >= 0 ? null : "Escribe el ingreso del periodo (puede ser 0).",
  };
  const lineas = p.lineas || [];
  if (!lineas.length) errores.lineas = "Agrega al menos un gasto.";
  else if (lineas.some((l) => !l.categoriaId || !esMontoValido(l.montoCentavos))) errores.lineas = "Cada gasto necesita categoría y monto.";
  else if (new Set(lineas.map((l) => l.categoriaId)).size !== lineas.length) errores.lineas = "Hay categorías repetidas.";
  if ((p.coberturas || []).some((c) => !c.desdeCajaId || !esMontoValido(c.montoCentavos))) {
    errores.coberturas = "Cada cobertura necesita caja de origen y monto.";
  }
  return resultado(errores);
}

/** Lo que falta por gastar del periodo actual, prorrateado por días (incluye hoy). */
export function restanteDelPeriodo(p, hoy) {
  const { fin, dias } = periodoDe(p.periodo, hoy);
  const restantes = diasEntre(hoy, fin) + 1;
  return Math.round((evaluarPresupuesto(p).gastos * restantes) / dias);
}

/** Gasto presupuestado por día en la fecha dada (para la proyección). */
export function gastoDiario(p, fecha) {
  return evaluarPresupuesto(p).gastos / periodoDe(p.periodo, fecha).dias;
}

export const esSostenible = (p) => p.activa !== false && evaluarPresupuesto(p).estado === "sostenible";
