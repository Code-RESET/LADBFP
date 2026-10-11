// ============================================================
// data/respaldoRepo.js
// Lectura y escritura del respaldo (Fase 3). Necesita conexión:
// lee del servidor TODO (no solo lo que hay en la caché) y escribe
// esperando a cada lote, en orden:
//   1) cajas, bancos, categorías, plan y metas que falten
//   2) movimientos que falten (activos) + su historial
//   3) los que eran anulados se anulan con su motivo
//   4) la configuración, si esta cuenta aún no tiene
//   5) los saldos (agregados) se recalculan desde TODOS los movimientos
// Si un lote no pasa las reglas, se reintenta documento por
// documento y solo se omite el que falla (se cuenta).
// ============================================================

import { db, col, doc, docRef, getDoc, getDocs, writeBatch, serverTimestamp, conMarcas } from "./firestore.js";
import { movimientosRepo } from "./movimientosRepo.js";
import { COLECCIONES, documentoParaGuardar, movimientoParaCrear } from "../domain/respaldo.js";
import { agregadosDesdeMovimientos } from "../domain/movimientos.js";

const LOTE = 400;

/** Agrupa escrituras en lotes; si un lote falla, reintenta una por una. */
function escritor() {
  let ops = [];
  let fallidos = 0;
  let hechos = 0;
  async function confirmar() {
    if (!ops.length) return;
    const actuales = ops;
    ops = [];
    const batch = writeBatch(db);
    actuales.forEach((op) => op(batch));
    try {
      await batch.commit();
      hechos += actuales.length;
    } catch {
      for (const op of actuales) {
        const uno = writeBatch(db);
        op(uno);
        try { await uno.commit(); hechos++; } catch { fallidos++; }
      }
    }
  }
  return {
    async agregar(op) { ops.push(op); if (ops.length >= LOTE) await confirmar(); },
    confirmar,
    get fallidos() { return fallidos; },
    get hechos() { return hechos; },
  };
}

export const respaldoRepo = {
  /** Todo lo del usuario, del servidor. onProgreso({ fase, n, total }) */
  async leerTodo(uid, onProgreso) {
    const colecciones = {};
    for (const c of COLECCIONES) {
      const snap = await getDocs(col(uid, c));
      colecciones[c] = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    }
    const movimientos = [];
    await movimientosRepo.recorrerTodos(uid, (lote) => {
      movimientos.push(...lote);
      onProgreso?.({ fase: "movimientos", n: movimientos.length });
    });
    for (let i = 0; i < movimientos.length; i += 10) {
      await Promise.all(movimientos.slice(i, i + 10).map(async (m) => { m.historial = await movimientosRepo.historial(uid, m.id); }));
      onProgreso?.({ fase: "historial", n: Math.min(i + 10, movimientos.length), total: movimientos.length });
    }
    const perfil = await getDoc(doc(db, "users", uid));
    return { colecciones, movimientos, config: (perfil.exists() && perfil.data().config) || {} };
  },

  /** Ids que ya existen en la cuenta (para no tocarlos al restaurar). */
  async idsExistentes(uid) {
    const out = {};
    for (const c of COLECCIONES) out[c] = new Set((await getDocs(col(uid, c))).docs.map((d) => d.id));
    out.movimientos = new Set();
    await movimientosRepo.recorrerTodos(uid, (lote) => lote.forEach((m) => out.movimientos.add(m.id)));
    return out;
  },

  /** Restaura lo que falta según `plan` (domain/respaldo.js → planImportacion). Devuelve { creados, omitidos }. */
  async importar(uid, plan, { config = null, onProgreso } = {}) {
    const w = escritor();
    const movsCol = col(uid, "movimientos");

    for (const c of COLECCIONES) {
      for (const x of plan.porColeccion[c].nuevos) {
        await w.agregar((b) => b.set(docRef(uid, c, x.id), conMarcas(documentoParaGuardar(x), { nuevo: true })));
      }
    }
    await w.confirmar();
    onProgreso?.({ fase: "catalogos" });

    const anular = [];
    let n = 0;
    for (const m of plan.movimientos.nuevos) {
      const { datos, anulacion, historial } = movimientoParaCrear(m);
      await w.agregar((b) => b.set(docRef(uid, "movimientos", m.id), conMarcas(datos, { nuevo: true })));
      for (const h of historial) {
        const { id, ...resto } = h;
        await w.agregar((b) => b.set(doc(movsCol, m.id, "historial", id), { ...resto, en: serverTimestamp() }));
      }
      if (anulacion) anular.push({ id: m.id, anulacion });
      if (++n % 50 === 0) onProgreso?.({ fase: "movimientos", n, total: plan.movimientos.nuevos.length });
    }
    await w.confirmar();
    onProgreso?.({ fase: "movimientos", n, total: plan.movimientos.nuevos.length });

    for (const { id, anulacion } of anular) {
      await w.agregar((b) => b.update(docRef(uid, "movimientos", id), { estado: "anulado", anulacion, updatedAt: serverTimestamp() }));
    }
    await w.confirmar();

    // Configuración (tema, saldos iniciales listos, etc.): solo lo que esta cuenta no tenga ya.
    if (config && Object.keys(config).length) {
      const perfil = await getDoc(doc(db, "users", uid));
      const actual = (perfil.exists() && perfil.data().config) || {};
      const b = writeBatch(db);
      b.set(doc(db, "users", uid), { config: { ...config, ...actual }, updatedAt: serverTimestamp() }, { merge: true });
      await b.commit().catch(() => {});
    }

    onProgreso?.({ fase: "saldos" });
    await this.recalcularSaldos(uid);
    return { creados: w.hechos, omitidos: w.fallidos };
  },

  /** Reemplaza los agregados por los calculados desde TODOS los movimientos (esperando al servidor). */
  async recalcularSaldos(uid) {
    const movs = [];
    await movimientosRepo.recorrerTodos(uid, (lote) => movs.push(...lote));
    const calculados = agregadosDesdeMovimientos(movs);
    const existentes = (await getDocs(col(uid, "agregados"))).docs.map((d) => d.id);
    const b = writeBatch(db);
    for (const mes of new Set([...Object.keys(calculados), ...existentes])) {
      b.set(docRef(uid, "agregados", mes), {
        porCaja: {}, porCuenta: {}, porCajaCuenta: {}, porCategoria: {}, n: 0,
        ...calculados[mes], mes, updatedAt: serverTimestamp(),
      });
    }
    await b.commit();
  },
};
