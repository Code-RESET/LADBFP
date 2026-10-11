// ============================================================
// domain/respaldo.js
// Respaldo (Fase 3): un archivo JSON con TODOS los datos del
// usuario para guardarlo fuera de la app y restaurarlo después
// (en la misma cuenta o en una nueva).
//
// Formato (schemaVersion 1):
//   { app: 'finanzas-reset', schemaVersion, version, exportadoEn, uid,
//     conteos: { cajas: 7, … },
//     data: { cajas, cuentas, categorias, obligaciones, deudas,
//             recurrentes, presupuestos, metas,
//             movimientos: [{ …, historial: [ … ] }], config } }
//
// Restaurar NUNCA borra ni cambia lo que ya existe: solo agrega lo
// que falta (mismo id = ya existe → se deja igual). Al final los
// saldos se recalculan desde los movimientos.
// Funciones puras, probadas en tests/.
// ============================================================

import { validarMovimiento, construirMovimiento } from "./movimientos.js";

export const APP = "finanzas-reset";
export const VERSION_RESPALDO = 1;
export const COLECCIONES = ["cajas", "cuentas", "categorias", "obligaciones", "deudas", "recurrentes", "presupuestos", "metas"];

export const ETIQUETAS = {
  cajas: ["caja", "cajas"], cuentas: ["banco", "bancos"], categorias: ["categoría", "categorías"],
  obligaciones: ["gasto fijo", "gastos fijos"], deudas: ["deuda", "deudas"], recurrentes: ["ingreso o pase fijo", "ingresos o pases fijos"],
  presupuestos: ["presupuesto", "presupuestos"], metas: ["meta", "metas"], movimientos: ["movimiento", "movimientos"],
};
export const etiqueta = (col, n) => `${n} ${ETIQUETAS[col]?.[n === 1 ? 0 : 1] || col}`;

/** Convierte Timestamps de Firestore (o cualquier objeto con toMillis) a milisegundos, en profundidad. */
export function plano(v) {
  if (v == null || typeof v !== "object") return v;
  if (typeof v.toMillis === "function") return v.toMillis();
  if (Array.isArray(v)) return v.map(plano);
  return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, plano(x)]));
}

export function nombreArchivo(fechaHoy) {
  return `Finanzas_Reset_respaldo_${fechaHoy}.json`;
}

/** Arma el objeto del respaldo (todo en datos planos, listo para JSON). */
export function construirRespaldo({ uid, version = null, exportadoEn, colecciones = {}, movimientos = [], config = {} }) {
  const data = Object.fromEntries(COLECCIONES.map((c) => [c, plano(colecciones[c] || [])]));
  data.movimientos = plano(movimientos);
  data.config = plano(config || {});
  const conteos = Object.fromEntries([...COLECCIONES, "movimientos"].map((c) => [c, data[c].length]));
  return { app: APP, schemaVersion: VERSION_RESPALDO, version, exportadoEn, uid, conteos, data };
}

/**
 * Revisa que el archivo sea un respaldo de esta app y que sus datos sirvan.
 * { ok, error?, conteos, invalidos: { movimientos: n, … } }
 */
export function validarRespaldo(r) {
  if (!r || typeof r !== "object") return { ok: false, error: "El archivo no es un respaldo de Finanzas Reset." };
  if (r.app !== APP || !r.data || typeof r.data !== "object") return { ok: false, error: "El archivo no es un respaldo de Finanzas Reset." };
  if (!Number.isInteger(r.schemaVersion) || r.schemaVersion > VERSION_RESPALDO) {
    return { ok: false, error: "Este respaldo es de una versión más nueva de la app. Actualiza la app y vuelve a intentarlo." };
  }
  const conteos = {};
  const invalidos = {};
  for (const c of [...COLECCIONES, "movimientos"]) {
    const lista = r.data[c] ?? [];
    if (!Array.isArray(lista)) return { ok: false, error: `El respaldo está dañado (${c}).` };
    const malos = lista.filter((x) => !x || typeof x !== "object" || typeof x.id !== "string" || !x.id
      || (c === "movimientos" && !validarMovimiento(x).ok)).length;
    conteos[c] = lista.length - malos;
    if (malos) invalidos[c] = malos;
  }
  return { ok: true, conteos, invalidos };
}

/**
 * Qué se va a agregar. `existentes` = { cajas: Set(ids), …, movimientos: Set(ids) }.
 * { porColeccion: { cajas: { nuevos: [docs], existentes: n }, … },
 *   movimientos: { nuevos: [docs], existentes: n, anulados: n },
 *   totalNuevos }
 */
export function planImportacion(r, existentes = {}) {
  const valido = (c, x) => x && typeof x === "object" && typeof x.id === "string" && x.id && (c !== "movimientos" || validarMovimiento(x).ok);
  const porColeccion = {};
  for (const c of COLECCIONES) {
    const lista = (r.data[c] || []).filter((x) => valido(c, x));
    const ya = existentes[c] || new Set();
    porColeccion[c] = { nuevos: lista.filter((x) => !ya.has(x.id)), existentes: lista.filter((x) => ya.has(x.id)).length };
  }
  const movs = (r.data.movimientos || []).filter((x) => valido("movimientos", x));
  const yaMovs = existentes.movimientos || new Set();
  const nuevos = movs.filter((m) => !yaMovs.has(m.id));
  const movimientos = { nuevos, existentes: movs.length - nuevos.length, anulados: nuevos.filter((m) => m.estado === "anulado").length };
  const totalNuevos = Object.values(porColeccion).reduce((a, p) => a + p.nuevos.length, 0) + nuevos.length;
  return { porColeccion, movimientos, totalNuevos };
}

/** Datos de un documento de catálogo/plan para volver a guardarlo (sin id ni marcas de tiempo). */
export function documentoParaGuardar(x) {
  const { id, createdAt, updatedAt, schemaVersion, ...resto } = x;
  return resto;
}

/**
 * Movimiento para recrearlo: siempre se crea ACTIVO (así lo exigen las
 * reglas) y, si era anulado, después se anula con su motivo original.
 * { datos, anulacion | null, historial: [...] }
 */
export function movimientoParaCrear(m) {
  const datos = { ...construirMovimiento({ ...m, estado: "activo" }), ts: Number.isInteger(m.ts) ? m.ts : Date.now(), origen: m.origen || "importado" };
  const anulacion = m.estado === "anulado"
    ? { motivo: String(m.anulacion?.motivo || "Anulado (restaurado de un respaldo)").slice(0, 300), ts: Number(m.anulacion?.ts) || Date.now() }
    : null;
  const historial = (Array.isArray(m.historial) ? m.historial : [])
    .filter((h) => h && typeof h.id === "string" && ["crear", "editar", "anular"].includes(h.accion))
    .map((h) => ({ id: h.id, accion: h.accion, cambios: h.cambios || {}, ...(h.motivo ? { motivo: String(h.motivo).slice(0, 300) } : {}), ts: Number.isInteger(h.ts) ? h.ts : datos.ts }));
  return { datos, anulacion, historial };
}
