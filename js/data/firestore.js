// ============================================================
// data/firestore.js
// Punto único de acceso al SDK de Firestore. Los repositorios
// importan de aquí; los módulos visuales NUNCA importan el SDK.
// Incluye: rutas por usuario, escrituras que no bloquean la UI
// sin conexión y un paginador por cursores.
// ============================================================

import { db } from "../firebase-config.js";
import {
  collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, onSnapshot,
  query, where, orderBy, limit, startAfter, documentId,
  writeBatch, serverTimestamp, increment, getCountFromServer,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

export {
  db, collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, onSnapshot,
  query, where, orderBy, limit, startAfter, documentId,
  writeBatch, serverTimestamp, increment, getCountFromServer,
};

export const rutaUsuario = (uid, coleccion) => `users/${uid}/${coleccion}`;
export const col = (uid, coleccion) => collection(db, rutaUsuario(uid, coleccion));
export const docRef = (uid, coleccion, id) => doc(db, rutaUsuario(uid, coleccion), id);

/** ID generado en el cliente: reintentar la misma escritura no duplica. */
export const nuevoId = (uid, coleccion) => doc(col(uid, coleccion)).id;

export const conMarcas = (datos, { nuevo = false } = {}) => ({
  ...datos,
  ...(nuevo ? { createdAt: serverTimestamp() } : {}),
  updatedAt: serverTimestamp(),
  schemaVersion: 1,
});

/**
 * Confirma un batch SIN esperar al servidor. Sin conexión, el await de
 * commit() no termina hasta reconectar; la escritura local ya es visible
 * en los listeners al instante. Si el servidor la rechaza, Firestore la
 * revierte localmente y se avisa con onError.
 */
export function confirmarSinEsperar(batch, onError) {
  batch.commit().catch((err) => onError?.(err));
}

export const docsConId = (snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() }));

/** Escucha una colección completa (solo catálogos pequeños). */
export function escucharColeccion(ref, onDatos, onError) {
  return onSnapshot(ref, { includeMetadataChanges: true }, (snap) => {
    onDatos(docsConId(snap), snap.metadata);
  }, onError);
}

/** Promesa con tiempo límite: resuelve `alExpirar` si tarda demasiado. */
export function conTimeout(promesa, ms, alExpirar = null) {
  return Promise.race([promesa, new Promise((r) => setTimeout(() => r(alExpirar), ms))]);
}

/**
 * Paginador por cursores. Guarda el último documento de cada página para
 * volver a páginas visitadas o avanzar a la siguiente sin usar offset.
 * restricciones = [where(...), orderBy(...)] (sin limit ni cursor).
 */
export class Paginador {
  constructor(ref, restricciones, tamano) {
    this.ref = ref;
    this.restricciones = restricciones;
    this.tamano = tamano;
    this.cursores = [null]; // cursores[p - 1] = documento tras el cual empieza la página p
    this.maxVisitada = 1;
  }

  puedeIr(pagina) {
    return pagina >= 1 && pagina <= this.cursores.length;
  }

  async pagina(n) {
    if (!this.puedeIr(n)) throw new Error(`Página ${n} no alcanzable`);
    const cursor = this.cursores[n - 1];
    const q = query(this.ref, ...this.restricciones,
      ...(cursor ? [startAfter(cursor)] : []), limit(this.tamano + 1));
    const snap = await getDocs(q);
    const docs = snap.docs.slice(0, this.tamano);
    const hayMas = snap.docs.length > this.tamano;
    if (hayMas) this.cursores[n] = docs[docs.length - 1];
    else this.cursores.length = n; // no hay más allá de esta página
    this.maxVisitada = Math.max(this.maxVisitada, n);
    return {
      items: docs.map((d) => ({ id: d.id, ...d.data(), _pendiente: d.metadata.hasPendingWrites })),
      hayMas,
      desdeCache: snap.metadata.fromCache,
    };
  }
}
