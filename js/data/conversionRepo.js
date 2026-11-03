// ============================================================
// data/conversionRepo.js
// «Simplificar mi app» (v2.0.0): aplica el plan de domain/
// convertir.js en UN SOLO writeBatch (todo o nada, también sin
// conexión): cajas de las cuentas, transferencias que pasan cada
// saldo a su cuenta, gastos fijos/deudas/metas/presupuestos con su
// cuenta, cajas viejas desactivadas y el perfil en modo «cuentas».
// Deshacer arma el batch contrario.
// ============================================================

import { db, doc, docRef, writeBatch, conMarcas, serverTimestamp, confirmarSinEsperar } from "./firestore.js";
import { escribirMovimientos, anularEnBatch } from "./movimientosRepo.js";
import { construirMovimiento } from "../domain/movimientos.js";

/** Reemplaza un documento de plan completo (como planRepo.guardar), conservando su createdAt. */
function reemplazar(batch, uid, coleccion, datos, anterior) {
  const { id, createdAt, updatedAt, schemaVersion, ...resto } = datos;
  if (coleccion === "cuentas") {
    batch.set(docRef(uid, "cuentas", id), conMarcas({ cajaPredeterminadaId: resto.cajaPredeterminadaId ?? null }), { merge: true });
    return;
  }
  batch.set(docRef(uid, coleccion, id), { ...conMarcas(resto), ...(anterior?.createdAt ? { createdAt: anterior.createdAt } : {}) });
}

const perfil = (uid) => doc(db, "users", uid);

export const conversionRepo = {
  /** Aplica la conversión. Devuelve los ids de las transferencias (para Deshacer). */
  aplicar(uid, plan, { hoy, onError } = {}) {
    const batch = writeBatch(db);
    for (const { id, ...caja } of plan.cajasNuevas) batch.set(docRef(uid, "cajas", id), conMarcas(caja, { nuevo: true }), { merge: true });
    const ids = plan.movimientos.length ? escribirMovimientos(batch, uid, plan.movimientos, { origen: "conversion", tal: true }) : [];
    for (const c of plan.cambios) reemplazar(batch, uid, c.coleccion, c.despues, c.antes);
    for (const id of plan.desactivar) batch.set(docRef(uid, "cajas", id), conMarcas({ activa: false }), { merge: true });
    batch.set(perfil(uid), { config: { modo: "cuentas", convertidoEn: hoy }, updatedAt: serverTimestamp() }, { merge: true });
    confirmarSinEsperar(batch, onError);
    return ids;
  },

  /** Regresa todo como estaba: anula las transferencias, restaura lo cambiado y vuelve a modo cajas. */
  deshacer(uid, plan, ids, { onError } = {}) {
    const batch = writeBatch(db);
    if (ids.length) anularEnBatch(batch, uid, ids.map((id, i) => ({ id, ...construirMovimiento(plan.movimientos[i]) })), "Deshecho: simplificar mi app");
    for (const c of plan.cambios) reemplazar(batch, uid, c.coleccion, c.antes, c.despues);
    for (const id of plan.desactivar) batch.set(docRef(uid, "cajas", id), conMarcas({ activa: true }), { merge: true });
    for (const c of plan.cajasNuevas) batch.set(docRef(uid, "cajas", c.id), conMarcas({ activa: false }), { merge: true });
    batch.set(perfil(uid), { config: { modo: "cajas" }, updatedAt: serverTimestamp() }, { merge: true });
    confirmarSinEsperar(batch, onError);
  },
};
