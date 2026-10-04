// ============================================================
// services/planCalculado.js
// Une el estado (core/state) con las funciones puras de domain/
// para obtener, en un solo lugar: eventos, comprometido,
// disponible real, proyección y alertas. Inicio y Plan usan
// esto, así los números siempre coinciden.
// Se memoriza por referencia de estado (se recalcula solo si
// algo cambió).
// ============================================================

import { hoy as hoyMx, sumarDias } from "../core/dates.js";
import { saldosPor } from "../domain/saldos.js";
import { cuentaParaGasto } from "../domain/catalogos.js";
import { eventos as calcularEventos } from "../domain/compromisos.js";
import { comprometidoPorCaja, disponibleReal, proyectar } from "../domain/proyeccion.js";
import { generarAlertas } from "../domain/alertas.js";

export const HORIZONTE_DIAS = 30;
const DIAS_PROYECCION_MAX = 365;

let cache = { clave: null, valor: null };

export function calcularPlan(s) {
  const hoy = hoyMx();
  const horizonte = Number(s.perfil?.config?.horizonteComprometidoDias) || HORIZONTE_DIAS;
  const clave = [s.agregados, s.cajas, s.cuentas, s.obligaciones, s.deudas, s.recurrentes, s.presupuestos, hoy, horizonte];
  if (cache.clave && cache.clave.every((v, i) => v === clave[i])) return cache.valor;

  const saldos = saldosPor(s.agregados, "porCaja");
  const ev = calcularEventos({
    obligaciones: s.obligaciones, deudas: s.deudas, recurrentes: s.recurrentes,
    agregados: s.agregados, hoy, hasta: sumarDias(hoy, DIAS_PROYECCION_MAX),
  });
  const comprometido = comprometidoPorCaja({ eventos: ev, presupuestos: s.presupuestos, hoy, horizonteDias: horizonte });
  const disponible = disponibleReal({ cajas: s.cajas, saldos, comprometido, cuentaParaGasto });
  const proyeccion = proyectar({ saldos, eventos: ev, presupuestos: s.presupuestos, hoy, dias: DIAS_PROYECCION_MAX });
  const proyeccion90 = { ...proyeccion, primerNegativo: Object.fromEntries(
    Object.entries(proyeccion.primerNegativo).filter(([, f]) => f <= sumarDias(hoy, 90))) };
  const alertas = generarAlertas({
    hoy, cajas: s.cajas, cuentas: s.cuentas, presupuestos: s.presupuestos, deudas: s.deudas,
    eventos: ev.filter((e) => e.fecha <= sumarDias(hoy, horizonte)), disponible, proyeccion: proyeccion90, agregados: s.agregados,
  });

  const valor = { hoy, horizonte, saldos, eventos: ev, comprometido, disponible, proyeccion, alertas };
  cache = { clave, valor };
  return valor;
}

/** ¿Hay algo planificado? (para no mostrar "disponible real" vacío como si fuera un dato). */
export function hayPlan(s) {
  return [s.obligaciones, s.deudas, s.recurrentes, s.presupuestos].some((l) => l?.length);
}
