// ============================================================
// domain/metas.js
// Metas de ahorro (Fase 3). Una meta junta dinero en SU caja de
// ahorro ("Remodelación" → caja "Ahorro casa"):
//   acumulado  = saldo de esa caja (todo lo que tiene cuenta)
//   aportación = cuánto se aparta y cada cuándo (regla, como los
//                gastos fijos), desde una caja de origen
//   fecha estimada = fecha de la última aportación que falta
//   viable     = la aportación cabe en lo que en promedio le sobra
//                al mes a la caja de origen (últimos 3 meses)
// Cada aportación es una transferencia con metaId + metaPeriodo:
// los agregados la suman en porVinculo["m:<id>__<periodo>"], así
// Mi mes sabe qué aportación del mes ya se hizo (☑) sin leer
// movimientos. Funciones puras, probadas en tests/.
// ============================================================

import { esMontoValido } from "../core/money.js";
import { mesSiguiente, sumarDias } from "../core/dates.js";
import { textoRequerido, resultado } from "../core/validation.js";
import { ocurrencias, proximas, erroresRegla, equivalenteMensual } from "./periodos.js";
import { claveVinculo, pagadoVinculo } from "./compromisos.js";
import { saldosPor } from "./saldos.js";

const rangoMes = (mes) => ({ inicio: `${mes}-01`, fin: sumarDias(`${mesSiguiente(mes)}-01`, -1) });

export function validarMeta(m, otras = []) {
  const errores = {
    nombre: textoRequerido(m.nombre, { max: 60 }),
    objetivoCentavos: esMontoValido(m.objetivoCentavos) ? null : "Escribe cuánto necesitas juntar.",
    aportacionCentavos: esMontoValido(m.aportacionCentavos) ? null : "Escribe cuánto vas a apartar.",
    cajaOrigenId: m.cajaOrigenId ? null : "Elige de qué caja sale el ahorro.",
    cajaAhorroId: m.cajaAhorroId ? null : "Elige dónde se guarda el ahorro.",
    ...erroresRegla(m.regla),
  };
  if (m.cajaOrigenId && m.cajaOrigenId === m.cajaAhorroId) errores.cajaAhorroId = "Tiene que ser una caja distinta a la de origen.";
  if (!errores.objetivoCentavos && !errores.aportacionCentavos && m.aportacionCentavos > m.objetivoCentavos) {
    errores.aportacionCentavos = "La aportación no puede ser mayor que la meta.";
  }
  // Una caja de ahorro guarda una sola meta activa (si no, el saldo se contaría dos veces).
  const ocupada = otras.find((o) => o.id !== m.id && o.activa !== false && o.cajaAhorroId === m.cajaAhorroId);
  if (m.cajaAhorroId && ocupada) errores.cajaAhorroId = `Esa caja ya guarda la meta «${ocupada.nombre}».`;
  return resultado(errores);
}

/** Lo aportado a una ocurrencia (periodo) de la meta. */
export const aportadoEn = (agregados, meta, periodo) => pagadoVinculo(agregados, claveVinculo("meta", meta.id, periodo));

/**
 * { acumulado, faltante, pct, cumplida, restantes, proxima, fechaEstimada }
 * Las fechas que faltan saltan las ocurrencias ya aportadas.
 */
export function resumenMeta({ meta, agregados, hoy }) {
  const acumulado = Math.max(0, saldosPor(agregados, "porCaja")[meta.cajaAhorroId] || 0);
  const faltante = Math.max(0, meta.objetivoCentavos - acumulado);
  const pct = meta.objetivoCentavos ? Math.min(100, Math.floor((acumulado * 100) / meta.objetivoCentavos)) : 0;
  const cumplida = faltante === 0;
  const restantes = cumplida ? 0 : Math.ceil(faltante / meta.aportacionCentavos);
  const inicio = meta.regla?.desde > hoy ? meta.regla.desde : hoy;
  const fechas = restantes
    ? proximas(meta.regla, inicio, restantes + 60).filter((f) => aportadoEn(agregados, meta, f) < meta.aportacionCentavos).slice(0, restantes)
    : [];
  return {
    acumulado, faltante, pct, cumplida, restantes,
    proxima: fechas[0] || null,
    fechaEstimada: fechas.length === restantes ? fechas.at(-1) || null : null,
  };
}

/** Suma de lo aportado (porVinculo "m:…") a las metas indicadas en un mes. */
function aportadoAMetasEnMes(doc, ids) {
  return Object.entries(doc?.porVinculo || {})
    .filter(([k]) => ids.some((id) => k.startsWith(`m:${id}__`)))
    .reduce((a, [, v]) => a + v, 0);
}

/**
 * ¿Te alcanza? Compara la aportación mensual con lo que en promedio le
 * SOBRA al mes a la caja de origen (últimos 3 meses completos con
 * movimientos): ingresos − gastos ± transferencias, sin contar las
 * aportaciones a metas (se suman de vuelta) y descontando lo que piden
 * las otras metas activas de esa caja.
 * { estado: 'viable' | 'inviable' | 'sin-datos', aportacionMensual, flujoLibre, meses }
 */
export function viabilidadMeta({ meta, metas = [], agregados, hoy }) {
  const caja = meta.cajaOrigenId;
  const aportacionMensual = equivalenteMensual(meta.aportacionCentavos, meta.regla);
  const mesActual = hoy.slice(0, 7);
  const meses = Object.keys(agregados || {})
    .filter((m) => m < mesActual && agregados[m]?.porCaja?.[caja]?.n)
    .sort()
    .slice(-3);
  if (!meses.length) return { estado: "sin-datos", aportacionMensual, flujoLibre: null, meses: 0 };

  const idsDesdeCaja = metas.filter((x) => x.cajaOrigenId === caja).map((x) => x.id).concat(meta.id);
  const netos = meses.map((m) => {
    const t = agregados[m].porCaja[caja] || {};
    return (t.ing || 0) - (t.gas || 0) + (t.tin || 0) - (t.tout || 0) + aportadoAMetasEnMes(agregados[m], [...new Set(idsDesdeCaja)]);
  });
  const promedio = Math.round(netos.reduce((a, b) => a + b, 0) / netos.length);
  const otras = metas
    .filter((x) => x.id !== meta.id && x.activa !== false && x.cajaOrigenId === caja)
    .reduce((a, x) => a + equivalenteMensual(x.aportacionCentavos, x.regla), 0);
  const flujoLibre = promedio - otras;
  return { estado: aportacionMensual <= flujoLibre ? "viable" : "inviable", aportacionMensual, flujoLibre, meses: meses.length };
}

/** Si apartas `porMes` cada mes desde hoy, ¿en qué mes juntas `faltante`? ('YYYY-MM' o null) */
export function mesConAporte(faltante, porMes, hoy) {
  if (!(porMes > 0)) return null;
  let mes = hoy.slice(0, 7);
  for (let i = 1; i < Math.ceil(faltante / porMes); i++) mes = mesSiguiente(mes);
  return mes;
}

/**
 * Aportaciones que tocan en `mes` (para la lista "Ahorro" de Mi mes),
 * como los ingresos fijos: [{ clase:'meta', ref, nombre, cajaId, cajaDestinoId, fecha, dia, monto, pagado, pendiente, estado, periodo }]
 * Una meta cumplida ya no pide aportaciones pendientes.
 */
export function aportacionesDelMes({ mes, metas = [], agregados, hoy }) {
  const { inicio, fin } = rangoMes(mes);
  const out = [];
  for (const meta of metas.filter((x) => x.activa !== false)) {
    const { cumplida } = resumenMeta({ meta, agregados, hoy });
    for (const f of ocurrencias(meta.regla, inicio, fin)) {
      const pagado = aportadoEn(agregados, meta, f);
      if (cumplida && !pagado) continue;
      const pendiente = Math.max(0, meta.aportacionCentavos - pagado);
      out.push({ clase: "meta", ref: meta, nombre: meta.nombre, cajaId: meta.cajaOrigenId, cajaDestinoId: meta.cajaAhorroId,
        fecha: f, dia: Number(f.slice(8)), monto: meta.aportacionCentavos, pagado, pendiente,
        estado: pendiente === 0 ? "Aportado" : "Pendiente", periodo: f });
    }
  }
  return out.sort((a, b) => a.fecha.localeCompare(b.fecha) || a.nombre.localeCompare(b.nombre, "es"));
}

/**
 * Aportaciones pendientes entre hoy y `hasta`, como eventos de "transferencia"
 * para el plan (comprometido de la caja de origen y proyección por caja).
 * Solo las que faltan para cumplir la meta.
 */
export function eventosMetas({ metas = [], agregados, hoy, hasta }) {
  const out = [];
  for (const meta of metas.filter((x) => x.activa !== false)) {
    const r = resumenMeta({ meta, agregados, hoy });
    if (r.cumplida) continue;
    let restantes = r.restantes;
    for (const f of ocurrencias(meta.regla, hoy, hasta)) {
      if (restantes <= 0) break;
      const pendiente = meta.aportacionCentavos - aportadoEn(agregados, meta, f);
      if (pendiente <= 0) continue;
      restantes--;
      out.push({ fecha: f, clase: "transferencia", meta: true, ref: meta, nombre: `Ahorro: ${meta.nombre}`,
        cajaId: meta.cajaOrigenId, cajaDestinoId: meta.cajaAhorroId, monto: pendiente, estado: "pendiente", periodo: f });
    }
  }
  return out;
}
