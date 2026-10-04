// ============================================================
// data/planRepo.js
// Obligaciones, deudas, ingresos/transferencias programados y
// presupuestos. Colecciones pequeñas: se escuchan completas al
// iniciar sesión (como los catálogos).
// Se guardan con reemplazo completo (no merge) para que al
// cambiar la frecuencia no queden campos viejos en la regla.
// ============================================================

import {
  col, docRef, nuevoId, conMarcas, writeBatch, db, escucharColeccion, confirmarSinEsperar,
} from "./firestore.js";

function crearRepo(coleccion, campoOrden = "nombre") {
  return {
    escuchar(uid, onDatos, onError) {
      return escucharColeccion(col(uid, coleccion), (items, meta) => {
        items.sort((a, b) => String(a[campoOrden] || "").localeCompare(String(b[campoOrden] || ""), "es"));
        onDatos(items, meta);
      }, onError);
    },

    /** Crea o reemplaza el documento completo. `anterior` conserva createdAt. */
    guardar(uid, datos, { anterior = null, onError } = {}) {
      const { id: idExistente, createdAt, updatedAt, schemaVersion, ...resto } = datos;
      const id = idExistente || nuevoId(uid, coleccion);
      const batch = writeBatch(db);
      batch.set(docRef(uid, coleccion, id), {
        ...conMarcas(resto, { nuevo: !anterior }),
        ...(anterior?.createdAt ? { createdAt: anterior.createdAt } : {}),
      });
      confirmarSinEsperar(batch, onError);
      return id;
    },

    activar(uid, id, activa, { onError } = {}) {
      const batch = writeBatch(db);
      batch.set(docRef(uid, coleccion, id), conMarcas({ activa }), { merge: true });
      confirmarSinEsperar(batch, onError);
    },

    eliminar(uid, id, { onError } = {}) {
      const batch = writeBatch(db);
      batch.delete(docRef(uid, coleccion, id));
      confirmarSinEsperar(batch, onError);
    },
  };
}

export const obligacionesRepo = crearRepo("obligaciones");
export const deudasRepo = crearRepo("deudas", "acreedor");
export const recurrentesRepo = crearRepo("recurrentes");
export const presupuestosRepo = crearRepo("presupuestos");
