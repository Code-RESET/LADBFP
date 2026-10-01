// ============================================================
// data/catalogosRepo.js
// Cajas, cuentas y categorías: colecciones pequeñas que se
// escuchan completas al iniciar sesión y viven en core/state.
// ============================================================

import {
  col, docRef, nuevoId, conMarcas, writeBatch, db,
  escucharColeccion, confirmarSinEsperar,
} from "./firestore.js";

function crearRepo(coleccion) {
  return {
    escuchar(uid, onDatos, onError) {
      return escucharColeccion(col(uid, coleccion), (items, meta) => {
        items.sort((a, b) => (a.orden ?? 999) - (b.orden ?? 999) || String(a.nombre).localeCompare(b.nombre, "es"));
        onDatos(items, meta);
      }, onError);
    },

    /** Crea o actualiza. Devuelve el id sin esperar al servidor. */
    guardar(uid, datos, { onError } = {}) {
      const { id: idExistente, ...resto } = datos;
      const id = idExistente || nuevoId(uid, coleccion);
      const batch = writeBatch(db);
      batch.set(docRef(uid, coleccion, id), conMarcas(resto, { nuevo: !idExistente }), { merge: true });
      confirmarSinEsperar(batch, onError);
      return id;
    },

    activar(uid, id, activa, { onError } = {}) {
      const batch = writeBatch(db);
      batch.set(docRef(uid, coleccion, id), conMarcas({ activa }), { merge: true });
      confirmarSinEsperar(batch, onError);
    },

    /** Solo para elementos sin movimientos (lo valida el módulo antes de llamar). */
    eliminar(uid, id, { onError } = {}) {
      const batch = writeBatch(db);
      batch.delete(docRef(uid, coleccion, id));
      confirmarSinEsperar(batch, onError);
    },
  };
}

export const cajasRepo = crearRepo("cajas");
export const cuentasRepo = crearRepo("cuentas");
export const categoriasRepo = crearRepo("categorias");
