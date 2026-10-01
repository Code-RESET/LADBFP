// ============================================================
// data/perfilRepo.js
// users/{uid}: configuración del usuario y agregados mensuales.
// ============================================================

import {
  db, doc, col, docRef, onSnapshot, writeBatch, serverTimestamp, confirmarSinEsperar,
  escucharColeccion,
} from "./firestore.js";

export const perfilRepo = {
  escuchar(uid, onDatos, onError) {
    return onSnapshot(doc(db, "users", uid), (snap) => onDatos(snap.exists() ? snap.data() : {}), onError);
  },

  /** Actualiza claves de config (merge), p. ej. { tema: 'dark' }. */
  guardarConfig(uid, parcial, { onError } = {}) {
    const batch = writeBatch(db);
    batch.set(doc(db, "users", uid), { config: parcial, updatedAt: serverTimestamp() }, { merge: true });
    confirmarSinEsperar(batch, onError);
  },
};

export const agregadosRepo = {
  /** Escucha todos los meses (≈12 documentos por año). Entrega { 'YYYY-MM': doc }. */
  escuchar(uid, onDatos, onError) {
    return escucharColeccion(col(uid, "agregados"), (items, meta) => {
      onDatos(Object.fromEntries(items.map(({ id, ...d }) => [id, d])), meta);
    }, onError);
  },

  /**
   * Reemplaza los agregados por los recalculados desde movimientos
   * (reparación desde "Verificar saldos"). Los meses sin movimientos
   * quedan en cero.
   */
  reemplazar(uid, calculados, mesesExistentes, { onError } = {}) {
    const batch = writeBatch(db);
    const meses = new Set([...Object.keys(calculados), ...mesesExistentes]);
    for (const mes of meses) {
      batch.set(docRef(uid, "agregados", mes), {
        porCaja: {}, porCuenta: {}, porCajaCuenta: {}, porCategoria: {}, n: 0,
        ...calculados[mes], mes, updatedAt: serverTimestamp(),
      });
    }
    confirmarSinEsperar(batch, onError);
  },
};
