// ============================================================
// domain/movimientos.js
// Reglas de integridad de movimientos y cálculo de los deltas
// que cada movimiento aplica a los agregados mensuales.
// Funciones puras: sin DOM, sin Firebase. Probadas en tests/.
// ============================================================

import { esMontoValido } from "../core/money.js";
import { esFechaValida, mesDe } from "../core/dates.js";
import { textoOpcional, resultado } from "../core/validation.js";

export const TIPOS = ["ingreso", "gasto", "transferencia", "apertura", "ajuste"];

export const ETIQUETA_TIPO = {
  ingreso: "Ingreso",
  gasto: "Gasto",
  transferencia: "Transferencia",
  apertura: "Saldo inicial",
  ajuste: "Ajuste",
};

const vacio = (v) => v == null || v === "";

/**
 * Valida un movimiento antes de guardarlo (sección 37 del prompt maestro).
 * ctx opcional { cajas, cuentas, categorias } para validar referencias.
 * Devuelve { ok, errores: { campo: mensaje } }.
 */
export function validarMovimiento(m, ctx = {}) {
  const tipoOk = TIPOS.includes(m.tipo);
  const esTransfer = m.tipo === "transferencia";
  const conCategoria = m.tipo === "ingreso" || m.tipo === "gasto";

  const activa = (lista, id) => {
    if (!lista || vacio(id)) return true;
    const x = lista.find((e) => e.id === id);
    return !!x && x.activa !== false;
  };

  const errores = {
    tipo: tipoOk ? null : "Tipo de movimiento inválido.",
    montoCentavos: esMontoValido(m.montoCentavos) ? null : "Escribe un monto mayor a cero.",
    fecha: esFechaValida(m.fecha) ? null : "Fecha inválida.",
    cajaId: vacio(m.cajaId)
      ? (esTransfer ? "Elige la caja de origen." : "Elige una caja.")
      : activa(ctx.cajas, m.cajaId) ? null : "Esa caja no existe o está desactivada.",
    cuentaId: vacio(m.cuentaId)
      ? "Elige una cuenta."
      : activa(ctx.cuentas, m.cuentaId) ? null : "Esa cuenta no existe o está desactivada.",
    nota: textoOpcional(m.nota, { max: 500 }),
  };

  if (esTransfer) {
    errores.cajaDestinoId = vacio(m.cajaDestinoId)
      ? "Elige la caja de destino."
      : activa(ctx.cajas, m.cajaDestinoId) ? null : "Esa caja no existe o está desactivada.";
    errores.cuentaDestinoId = vacio(m.cuentaDestinoId)
      ? "Elige la cuenta de destino."
      : activa(ctx.cuentas, m.cuentaDestinoId) ? null : "Esa cuenta no existe o está desactivada.";
    if (!vacio(m.cajaDestinoId) && m.cajaId === m.cajaDestinoId && m.cuentaId === m.cuentaDestinoId) {
      errores.cajaDestinoId = "El origen y el destino son la misma caja y la misma cuenta.";
    }
  }

  if (conCategoria) {
    if (vacio(m.categoriaId)) {
      errores.categoriaId = "Elige una categoría.";
    } else if (ctx.categorias) {
      const cat = ctx.categorias.find((c) => c.id === m.categoriaId);
      if (!cat || cat.activa === false) errores.categoriaId = "Esa categoría no existe o está desactivada.";
      else if (cat.tipo !== m.tipo) errores.categoriaId = `Esa categoría no es de ${m.tipo}.`;
    }
  }

  if (m.tipo === "ajuste") {
    errores.direccion = ["entrada", "salida"].includes(m.direccion) ? null : "Indica si el ajuste suma o resta.";
    if (vacio(m.nota?.trim?.())) errores.nota = "Explica el motivo del ajuste.";
  }

  return resultado(errores);
}

/**
 * Construye los campos de negocio del documento: quita lo que no aplica al
 * tipo y agrega los campos derivados (mes, cajaIds, cuentaIds) que permiten
 * filtrar con array-contains. No incluye timestamps (los pone el repositorio).
 */
export function construirMovimiento(m) {
  const doc = {
    tipo: m.tipo,
    fecha: m.fecha,
    mes: mesDe(m.fecha),
    montoCentavos: m.montoCentavos,
    cajaId: m.cajaId,
    cuentaId: m.cuentaId,
    nota: (m.nota || "").trim(),
    estado: m.estado || "activo",
  };
  if (m.tipo === "transferencia") {
    doc.cajaDestinoId = m.cajaDestinoId;
    doc.cuentaDestinoId = m.cuentaDestinoId;
  }
  if (m.tipo === "ingreso" || m.tipo === "gasto") doc.categoriaId = m.categoriaId;
  if (m.tipo === "ajuste") doc.direccion = m.direccion;
  doc.cajaIds = [...new Set([doc.cajaId, doc.cajaDestinoId].filter(Boolean))];
  doc.cuentaIds = [...new Set([doc.cuentaId, doc.cuentaDestinoId].filter(Boolean))];
  return doc;
}

// ---------- Agregados ----------
// Estructura de totales (por mes):
// { porCaja: { id: { ing, gas, tin, tout, ape, ajE, ajS, n } },
//   porCuenta: { ...igual }, porCajaCuenta: { 'caja__cuenta': { ...igual } },
//   porCategoria: { id: centavos }, n }

export const CAMPOS_TOTALES = ["ing", "gas", "tin", "tout", "ape", "ajE", "ajS", "n"];
export const clavePar = (cajaId, cuentaId) => `${cajaId}__${cuentaId}`;

function sumarEn(obj, ruta, valor) {
  let nodo = obj;
  for (let i = 0; i < ruta.length - 1; i++) nodo = nodo[ruta[i]] ??= {};
  const k = ruta[ruta.length - 1];
  nodo[k] = (nodo[k] || 0) + valor;
}

/** Suma (signo +1) o resta (signo -1) el efecto de un movimiento activo en `acc`. */
export function aplicarMovimiento(acc, mov, signo = 1) {
  if (!mov || mov.estado === "anulado") return acc;
  const m = mov.montoCentavos * signo;
  const lados = (caja, cuenta, campo) => {
    sumarEn(acc, ["porCaja", caja, campo], m);
    sumarEn(acc, ["porCuenta", cuenta, campo], m);
    sumarEn(acc, ["porCajaCuenta", clavePar(caja, cuenta), campo], m);
  };

  switch (mov.tipo) {
    case "ingreso": lados(mov.cajaId, mov.cuentaId, "ing"); break;
    case "gasto": lados(mov.cajaId, mov.cuentaId, "gas"); break;
    case "apertura": lados(mov.cajaId, mov.cuentaId, "ape"); break;
    case "ajuste": lados(mov.cajaId, mov.cuentaId, mov.direccion === "salida" ? "ajS" : "ajE"); break;
    case "transferencia":
      lados(mov.cajaId, mov.cuentaId, "tout");
      lados(mov.cajaDestinoId, mov.cuentaDestinoId, "tin");
      break;
    default: return acc;
  }
  if (mov.categoriaId) sumarEn(acc, ["porCategoria", mov.categoriaId], m);

  // Conteos para "Mostrando 1–25 de N" sin consultar al servidor.
  sumarEn(acc, ["n"], signo);
  new Set([mov.cajaId, mov.cajaDestinoId].filter(Boolean))
    .forEach((c) => sumarEn(acc, ["porCaja", c, "n"], signo));
  new Set([mov.cuentaId, mov.cuentaDestinoId].filter(Boolean))
    .forEach((c) => sumarEn(acc, ["porCuenta", c, "n"], signo));
  return acc;
}

function limpiarCeros(obj) {
  for (const [k, v] of Object.entries(obj)) {
    if (v && typeof v === "object") {
      limpiarCeros(v);
      if (Object.keys(v).length === 0) delete obj[k];
    } else if (v === 0) {
      delete obj[k];
    }
  }
  return obj;
}

/**
 * Deltas a aplicar a agregados/{YYYY-MM} al pasar de `anterior` a `nuevo`.
 * Crear: (null, mov). Editar: (viejo, nuevo). Anular: (viejo, {…viejo, estado:'anulado'}).
 * Devuelve { 'YYYY-MM': deltas } sin entradas en cero.
 */
export function deltasAgregados(anterior, nuevo) {
  const porMes = {};
  if (anterior && anterior.estado !== "anulado") {
    aplicarMovimiento(porMes[anterior.mes] ??= {}, anterior, -1);
  }
  if (nuevo && nuevo.estado !== "anulado") {
    aplicarMovimiento(porMes[nuevo.mes] ??= {}, nuevo, 1);
  }
  for (const mes of Object.keys(porMes)) {
    limpiarCeros(porMes[mes]);
    if (Object.keys(porMes[mes]).length === 0) delete porMes[mes];
  }
  return porMes;
}

/** Recalcula agregados completos desde una lista de movimientos (verificación). */
export function agregadosDesdeMovimientos(movs) {
  const porMes = {};
  for (const m of movs) aplicarMovimiento(porMes[m.mes] ??= {}, m, 1);
  return porMes;
}

/** Campos editables que se comparan para el historial de auditoría. */
const CAMPOS_AUDITADOS = ["tipo", "fecha", "montoCentavos", "cajaId", "cuentaId",
  "cajaDestinoId", "cuentaDestinoId", "categoriaId", "direccion", "nota", "estado"];

export function cambiosRelevantes(antes, despues) {
  const out = {};
  for (const c of CAMPOS_AUDITADOS) {
    const a = antes?.[c] ?? null;
    const d = despues?.[c] ?? null;
    if (a !== d) out[c] = { antes: a, despues: d };
  }
  return out;
}

/**
 * Posible duplicado: mismo tipo, caja, cuenta, monto y fecha, registrado
 * hace menos de `ventanaMs` (doble toque, o registrado en dos teléfonos).
 */
export function buscarDuplicado(nuevo, candidatos, { ahora = Date.now(), ventanaMs = 10 * 60 * 1000 } = {}) {
  return candidatos.find((c) =>
    c.id !== nuevo.id &&
    c.estado !== "anulado" &&
    c.tipo === nuevo.tipo &&
    c.cajaId === nuevo.cajaId &&
    c.cuentaId === nuevo.cuentaId &&
    c.montoCentavos === nuevo.montoCentavos &&
    c.fecha === nuevo.fecha &&
    typeof c.ts === "number" && ahora - c.ts < ventanaMs
  ) || null;
}
