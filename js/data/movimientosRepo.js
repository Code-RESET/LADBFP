// ============================================================
// data/movimientosRepo.js
// Crear, editar y anular movimientos. Cada operación escribe en
// UN SOLO writeBatch:  el movimiento + su historial + los deltas
// del agregado mensual. Así los saldos nunca quedan a medias, y
// el batch funciona sin conexión (las transacciones no).
// Los movimientos nunca se borran: se anulan con motivo.
// ============================================================

import {
  db, col, doc, docRef, nuevoId, conMarcas, writeBatch, serverTimestamp, increment,
  query, where, orderBy, limit, getDocs, onSnapshot, startAfter, documentId,
  getCountFromServer, confirmarSinEsperar, conTimeout, Paginador,
} from "./firestore.js";
import {
  construirMovimiento, deltasAgregados, cambiosRelevantes,
} from "../domain/movimientos.js";
import { contarDesdeAgregados } from "../domain/saldos.js";
import { mesSiguiente } from "../core/dates.js";

const MOV = "movimientos";
const AGG = "agregados";

const historialRef = (uid, movId) =>
  doc(col(uid, MOV), movId, "historial", nuevoId(uid, MOV));

/** Convierte { porCaja: { x: { ing: 500 } } } en increment() anidados. */
function aIncrementos(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    out[k] = typeof v === "number" ? increment(v) : aIncrementos(v);
  }
  return out;
}

function aplicarDeltas(batch, uid, deltasPorMes) {
  for (const [mes, deltas] of Object.entries(deltasPorMes)) {
    batch.set(docRef(uid, AGG, mes), { ...aIncrementos(deltas), mes, updatedAt: serverTimestamp() }, { merge: true });
  }
}

/** Quita campos de UI (_pendiente, id) antes de comparar o recalcular. */
function datosDe(mov) {
  const { id, _pendiente, ...resto } = mov;
  return resto;
}

export const movimientosRepo = {
  /** Crea un movimiento. Devuelve su id de inmediato (no espera al servidor). */
  crear(uid, entrada, { onError, origen = "manual" } = {}) {
    const id = nuevoId(uid, MOV);
    const datos = construirMovimiento(entrada);
    const ts = Date.now();
    const batch = writeBatch(db);
    batch.set(docRef(uid, MOV, id), conMarcas({ ...datos, ts, origen }, { nuevo: true }));
    batch.set(historialRef(uid, id), { accion: "crear", cambios: cambiosRelevantes(null, datos), ts, en: serverTimestamp() });
    aplicarDeltas(batch, uid, deltasAgregados(null, datos));
    confirmarSinEsperar(batch, onError);
    return id;
  },

  editar(uid, anterior, entrada, { onError } = {}) {
    if (anterior.estado === "anulado") throw new Error("No se puede editar un movimiento anulado.");
    const previo = datosDe(anterior);
    const datos = construirMovimiento({ ...entrada, estado: "activo" });
    const cambios = cambiosRelevantes(previo, datos);
    if (Object.keys(cambios).length === 0) return false;
    const batch = writeBatch(db);
    batch.set(docRef(uid, MOV, anterior.id), conMarcas({
      ...datos,
      ts: previo.ts,
      origen: previo.origen || "manual",
      ...(previo.createdAt ? { createdAt: previo.createdAt } : {}),
    }));
    batch.set(historialRef(uid, anterior.id), { accion: "editar", cambios, ts: Date.now(), en: serverTimestamp() });
    aplicarDeltas(batch, uid, deltasAgregados(previo, datos));
    confirmarSinEsperar(batch, onError);
    return true;
  },

  anular(uid, anterior, motivo, { onError } = {}) {
    if (anterior.estado === "anulado") return;
    const previo = datosDe(anterior);
    const batch = writeBatch(db);
    batch.update(docRef(uid, MOV, anterior.id), {
      estado: "anulado",
      anulacion: { motivo: motivo.trim(), ts: Date.now() },
      updatedAt: serverTimestamp(),
    });
    batch.set(historialRef(uid, anterior.id), {
      accion: "anular", cambios: { estado: { antes: "activo", despues: "anulado" } },
      motivo: motivo.trim(), ts: Date.now(), en: serverTimestamp(),
    });
    aplicarDeltas(batch, uid, deltasAgregados(previo, { ...previo, estado: "anulado" }));
    confirmarSinEsperar(batch, onError);
  },

  /** Restricciones de consulta para un filtro. Una sola dimensión array-contains a la vez. */
  restricciones(filtros = {}) {
    const r = [where("estado", "==", filtros.estado || "activo")];
    if (filtros.cajaId) r.push(where("cajaIds", "array-contains", filtros.cajaId));
    else if (filtros.cuentaId) r.push(where("cuentaIds", "array-contains", filtros.cuentaId));
    if (filtros.tipo) r.push(where("tipo", "==", filtros.tipo));
    if (filtros.mes) {
      r.push(where("fecha", ">=", `${filtros.mes}-01`));
      r.push(where("fecha", "<", `${mesSiguiente(filtros.mes)}-01`));
    }
    r.push(orderBy("fecha", "desc"), orderBy("ts", "desc"));
    return r;
  },

  paginador(uid, filtros, tamano) {
    return new Paginador(col(uid, MOV), this.restricciones(filtros), tamano);
  },

  /**
   * Total para "Mostrando 1–25 de N". Primero con agregados (gratis y
   * offline); si el filtro no lo permite, conteo del servidor; sin red, null.
   */
  async contar(uid, filtros, agregados) {
    const local = contarDesdeAgregados(agregados, filtros);
    if (local != null) return local;
    try {
      // Mismas restricciones que la lista (incluye orderBy) para usar los mismos índices.
      const q = query(col(uid, MOV), ...this.restricciones(filtros));
      const snap = await conTimeout(getCountFromServer(q), 5000);
      return snap ? snap.data().count : null;
    } catch {
      return null;
    }
  },

  /** Últimos N movimientos en vivo (Dashboard). */
  escucharUltimos(uid, n, onDatos, onError) {
    const q = query(col(uid, MOV), where("estado", "==", "activo"),
      orderBy("fecha", "desc"), orderBy("ts", "desc"), limit(n));
    return onSnapshot(q, { includeMetadataChanges: true }, (snap) => {
      onDatos(snap.docs.map((d) => ({ id: d.id, ...d.data(), _pendiente: d.metadata.hasPendingWrites })));
    }, onError);
  },

  /** Candidatos a duplicado (misma fecha y monto). No bloquea si la red es lenta. */
  async similares(uid, mov) {
    try {
      const q = query(col(uid, MOV), where("fecha", "==", mov.fecha),
        where("montoCentavos", "==", mov.montoCentavos), limit(10));
      const snap = await conTimeout(getDocs(q), 2000);
      return snap ? snap.docs.map((d) => ({ id: d.id, ...d.data() })) : [];
    } catch {
      return [];
    }
  },

  /** Gastos o ingresos activos de un mes (usa el índice estado + tipo + fecha). */
  async delMes(uid, mes, tipo) {
    const q = query(col(uid, MOV), ...this.restricciones({ mes, tipo }), limit(300));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data(), _pendiente: d.metadata.hasPendingWrites }));
  },

  /** Pagos vinculados a una deuda u obligación (sin índice compuesto: un solo filtro de igualdad). */
  async pagosDe(uid, campo, id) {
    const snap = await getDocs(query(col(uid, MOV), where(campo, "==", id), limit(300)));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      .filter((m) => m.estado !== "anulado")
      .sort((a, b) => b.fecha.localeCompare(a.fecha) || (b.ts || 0) - (a.ts || 0));
  },

  async historial(uid, movId) {
    const snap = await getDocs(query(collectionHistorial(uid, movId), orderBy("ts", "asc")));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  },

  /** Recorre TODOS los movimientos en lotes (solo para "Verificar saldos"). */
  async recorrerTodos(uid, onLote) {
    let cursor = null;
    for (;;) {
      const q = query(col(uid, MOV), orderBy(documentId()), ...(cursor ? [startAfter(cursor)] : []), limit(500));
      const snap = await getDocs(q);
      if (snap.empty) break;
      onLote(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      cursor = snap.docs[snap.docs.length - 1];
      if (snap.size < 500) break;
    }
  },
};

function collectionHistorial(uid, movId) {
  return col(uid, `${MOV}/${movId}/historial`);
}
