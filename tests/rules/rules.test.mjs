// ============================================================
// tests/rules/rules.test.mjs — Pruebas de firestore.rules contra
// el emulador de Firestore. HERRAMIENTA DE DESARROLLO: la app no
// la necesita para funcionar.
//
//   cd tests/rules && npm install
//   npx firebase emulators:exec --only firestore --project demo-finanzas-reset \
//       --config ../../firebase.json "node rules.test.mjs"
//
// Incluye la prueba "anti-NEXORA": otro usuario no puede leer
// ni escribir nada del dueño.
// ============================================================

import { readFileSync } from "node:fs";
import { initializeTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { doc, setDoc, getDoc, getDocs, updateDoc, deleteDoc, collection, writeBatch, increment } from "firebase/firestore";

const env = await initializeTestEnvironment({
  projectId: "demo-finanzas-reset",
  firestore: { rules: readFileSync(new URL("../../firestore.rules", import.meta.url), "utf8") },
});

const ANGEL = "angel";
const INTRUSO = "intruso";
const ahora = Date.now();

const movBase = {
  tipo: "gasto", fecha: "2026-10-01", mes: "2026-10", montoCentavos: 69000,
  cajaId: "sueldo-personal", cuentaId: "nu", categoriaId: "ga-comida",
  cajaIds: ["sueldo-personal"], cuentaIds: ["nu"], nota: "", estado: "activo", ts: ahora, origen: "manual",
};
const transferencia = {
  tipo: "transferencia", fecha: "2026-10-01", mes: "2026-10", montoCentavos: 350000,
  cajaId: "hd-credit", cuentaId: "bbva-hd", cajaDestinoId: "sueldo-personal", cuentaDestinoId: "nu",
  cajaIds: ["hd-credit", "sueldo-personal"], cuentaIds: ["bbva-hd", "nu"], nota: "", estado: "activo", ts: ahora,
};

let ok = 0;
const fallas = [];
async function prueba(nombre, fn) {
  try { await fn(); ok++; console.log(`✓ ${nombre}`); }
  catch (e) { fallas.push(nombre); console.log(`✗ ${nombre}\n  ${e.message}`); }
}

const db = (uid) => (uid ? env.authenticatedContext(uid) : env.unauthenticatedContext()).firestore();
const ruta = (uid, ...p) => ["users", uid, ...p].join("/");

await env.clearFirestore();
await env.withSecurityRulesDisabled(async (ctx) => {
  const f = ctx.firestore();
  await setDoc(doc(f, ruta(ANGEL, "movimientos/existente")), movBase);
  await setDoc(doc(f, ruta(ANGEL, "movimientos/anulado")), { ...movBase, estado: "anulado", anulacion: { motivo: "duplicado", ts: ahora } });
  await setDoc(doc(f, ruta(ANGEL, "cajas/hd-credit")), { nombre: "HD Crédit", tipo: "operativa", activa: true });
  await setDoc(doc(f, ruta(ANGEL)), { config: { tema: "dark" } });
});

// ---------- Aislamiento por usuario (lección NEXORA) ----------
await prueba("sin sesión no se puede leer nada", () =>
  assertFails(getDoc(doc(db(null), ruta(ANGEL, "cajas/hd-credit")))));
await prueba("otro usuario NO puede leer cajas del dueño", () =>
  assertFails(getDoc(doc(db(INTRUSO), ruta(ANGEL, "cajas/hd-credit")))));
await prueba("otro usuario NO puede listar movimientos del dueño", () =>
  assertFails(getDocs(collection(db(INTRUSO), ruta(ANGEL, "movimientos")))));
await prueba("otro usuario NO puede leer el perfil del dueño", () =>
  assertFails(getDoc(doc(db(INTRUSO), ruta(ANGEL)))));
await prueba("otro usuario NO puede crear movimientos en la cuenta del dueño", () =>
  assertFails(setDoc(doc(db(INTRUSO), ruta(ANGEL, "movimientos/x")), movBase)));
await prueba("otro usuario NO puede escribir agregados del dueño", () =>
  assertFails(setDoc(doc(db(INTRUSO), ruta(ANGEL, "agregados/2026-10")), { mes: "2026-10", n: 1 })));
await prueba("colecciones no declaradas están cerradas (incluso para el dueño)", () =>
  assertFails(setDoc(doc(db(ANGEL), ruta(ANGEL, "secreta/x")), { a: 1 })));
await prueba("colección raíz ajena cerrada", () =>
  assertFails(getDoc(doc(db(ANGEL), "otra/x"))));

// ---------- Dueño ----------
await prueba("el dueño lee sus datos", () =>
  assertSucceeds(getDoc(doc(db(ANGEL), ruta(ANGEL, "cajas/hd-credit")))));
await prueba("el dueño crea un gasto válido", () =>
  assertSucceeds(setDoc(doc(db(ANGEL), ruta(ANGEL, "movimientos/g1")), movBase)));
await prueba("el dueño crea una transferencia válida", () =>
  assertSucceeds(setDoc(doc(db(ANGEL), ruta(ANGEL, "movimientos/t1")), transferencia)));
await prueba("transferencia misma caja, distinta cuenta: permitida", () =>
  assertSucceeds(setDoc(doc(db(ANGEL), ruta(ANGEL, "movimientos/t2")), {
    ...transferencia, cajaDestinoId: "hd-credit", cajaIds: ["hd-credit"] })));
await prueba("batch: movimiento + historial + agregado con increment()", async () => {
  const f = db(ANGEL);
  const b = writeBatch(f);
  b.set(doc(f, ruta(ANGEL, "movimientos/b1")), movBase);
  b.set(doc(f, ruta(ANGEL, "movimientos/b1/historial/h1")), { accion: "crear", cambios: {}, ts: ahora });
  b.set(doc(f, ruta(ANGEL, "agregados/2026-10")), { mes: "2026-10", n: increment(1), porCaja: { "sueldo-personal": { gas: increment(69000), n: increment(1) } } }, { merge: true });
  await assertSucceeds(b.commit());
});

// ---------- Integridad de movimientos (servidor) ----------
const rechaza = (nombre, datos) => prueba(`rechaza: ${nombre}`, () =>
  assertFails(setDoc(doc(db(ANGEL), ruta(ANGEL, `movimientos/${Math.random().toString(36).slice(2)}`)), datos)));

await rechaza("movimiento sin caja", (({ cajaId, ...r }) => r)(movBase));
await rechaza("monto cero", { ...movBase, montoCentavos: 0 });
await rechaza("monto negativo", { ...movBase, montoCentavos: -100 });
await rechaza("monto decimal (no centavos)", { ...movBase, montoCentavos: 690.5 });
await rechaza("monto como texto", { ...movBase, montoCentavos: "69000" });
await rechaza("tipo inventado", { ...movBase, tipo: "regalo" });
await rechaza("fecha inválida", { ...movBase, fecha: "01/10/2026" });
await rechaza("mes incoherente con la fecha", { ...movBase, mes: "2026-11" });
await rechaza("gasto sin categoría", (({ categoriaId, ...r }) => r)(movBase));
await rechaza("transferencia sin destino", (({ cajaDestinoId, cuentaDestinoId, ...r }) => r)(transferencia));
await rechaza("transferencia al mismo par (caja, cuenta)", { ...transferencia, cajaDestinoId: "hd-credit", cuentaDestinoId: "bbva-hd", cajaIds: ["hd-credit"], cuentaIds: ["bbva-hd"] });
await rechaza("transferencia con categoría (duplicación como ingreso)", { ...transferencia, categoriaId: "in-cobranza" });
await rechaza("ajuste sin motivo", (({ categoriaId, ...r }) => ({ ...r, tipo: "ajuste", direccion: "salida", nota: "" }))(movBase));
await prueba("ajuste con motivo: permitido", () =>
  assertSucceeds(setDoc(doc(db(ANGEL), ruta(ANGEL, "movimientos/aj1")), (({ categoriaId, ...r }) => ({ ...r, tipo: "ajuste", direccion: "salida", nota: "comisión bancaria" }))(movBase))));
await rechaza("crear directamente como anulado", { ...movBase, estado: "anulado", anulacion: { motivo: "x" } });
await rechaza("campos extra no permitidos", { ...movBase, saldoManual: 999999 });

// ---------- Nunca borrar, anulados congelados, historial inmutable ----------
await prueba("NO se puede borrar un movimiento", () =>
  assertFails(deleteDoc(doc(db(ANGEL), ruta(ANGEL, "movimientos/existente")))));
await prueba("anular sin motivo: rechazado", () =>
  assertFails(updateDoc(doc(db(ANGEL), ruta(ANGEL, "movimientos/existente")), { estado: "anulado" })));
await prueba("anular con motivo: permitido", () =>
  assertSucceeds(updateDoc(doc(db(ANGEL), ruta(ANGEL, "movimientos/existente")), { estado: "anulado", anulacion: { motivo: "registrado dos veces", ts: ahora } })));
await prueba("un anulado no se puede reactivar ni editar", () =>
  assertFails(updateDoc(doc(db(ANGEL), ruta(ANGEL, "movimientos/anulado")), { estado: "activo" })));
await prueba("el historial no se puede modificar", async () => {
  await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), ruta(ANGEL, "movimientos/g1/historial/h")), { accion: "crear", ts: ahora }));
  await assertFails(updateDoc(doc(db(ANGEL), ruta(ANGEL, "movimientos/g1/historial/h")), { accion: "editar" }));
  await assertFails(deleteDoc(doc(db(ANGEL), ruta(ANGEL, "movimientos/g1/historial/h"))));
});
await prueba("las categorías no se borran (se desactivan)", () =>
  assertFails(deleteDoc(doc(db(ANGEL), ruta(ANGEL, "categorias/ga-casa")))));

// ---------- Catálogos ----------
await prueba("caja válida", () =>
  assertSucceeds(setDoc(doc(db(ANGEL), ruta(ANGEL, "cajas/nueva")), { nombre: "Ahorro", tipo: "ahorro", activa: true, disponibleParaGasto: false })));
await prueba("caja sin nombre: rechazada", () =>
  assertFails(setDoc(doc(db(ANGEL), ruta(ANGEL, "cajas/mala")), { nombre: "", tipo: "operativa" })));
await prueba("cuenta con tipo inválido: rechazada", () =>
  assertFails(setDoc(doc(db(ANGEL), ruta(ANGEL, "cuentas/mala")), { nombre: "X", tipo: "cripto" })));
await prueba("agregado con id de mes inválido: rechazado", () =>
  assertFails(setDoc(doc(db(ANGEL), ruta(ANGEL, "agregados/octubre")), { mes: "octubre" })));
await prueba("perfil: solo config", () =>
  assertFails(setDoc(doc(db(ANGEL), ruta(ANGEL)), { admin: true }, { merge: true })));

// ---------- Fase 2: plan ----------
const regla = { frecuencia: "mensual", diaMes: 15, desde: "2026-10-01" };
const obligacion = { nombre: "Trabajadora", montoCentavos: 800000, variable: true, minimoCentavos: 320000, maximoCentavos: 800000,
  regla, cajaId: "reset-alarmas", cuentaId: "mercado-pago", categoriaId: "ga-negocio", activa: true };
const deudaOk = { acreedor: "Dra. Marcela", saldoInicialCentavos: 3000000, pagoCentavos: 600000, regla,
  cajaId: "reset-alarmas", cuentaId: "mercado-pago", categoriaId: "ga-deudas", activa: true };
const recurrente = { nombre: "Sueldo", tipo: "transferencia", montoCentavos: 350000, regla: { frecuencia: "semanal", diaSemana: 5, desde: "2026-10-01" },
  cajaId: "hd-credit", cuentaId: "bbva-hd", cajaDestinoId: "sueldo-personal", cuentaDestinoId: "nu", activa: true };
const presupuesto = { nombre: "Sueldo semanal", periodo: "semanal", cajaId: "sueldo-personal", ingresoCentavos: 350000,
  lineas: [{ categoriaId: "ga-casa", montoCentavos: 250000 }], coberturas: [], activa: true };

await prueba("obligación válida", () => assertSucceeds(setDoc(doc(db(ANGEL), ruta(ANGEL, "obligaciones/o1")), obligacion)));
await prueba("rechaza: obligación sin caja", () => assertFails(setDoc(doc(db(ANGEL), ruta(ANGEL, "obligaciones/o2")), (({ cajaId, ...r }) => r)(obligacion))));
await prueba("rechaza: obligación con frecuencia inválida", () => assertFails(setDoc(doc(db(ANGEL), ruta(ANGEL, "obligaciones/o3")), { ...obligacion, regla: { frecuencia: "diaria", desde: "2026-10-01" } })));
await prueba("deuda válida", () => assertSucceeds(setDoc(doc(db(ANGEL), ruta(ANGEL, "deudas/d1")), deudaOk)));
await prueba("rechaza: deuda sin caja", () => assertFails(setDoc(doc(db(ANGEL), ruta(ANGEL, "deudas/d2")), { ...deudaOk, cajaId: "" })));
await prueba("transferencia programada válida", () => assertSucceeds(setDoc(doc(db(ANGEL), ruta(ANGEL, "recurrentes/r1")), recurrente)));
await prueba("rechaza: transferencia programada a la misma caja y cuenta", () => assertFails(setDoc(doc(db(ANGEL), ruta(ANGEL, "recurrentes/r2")),
  { ...recurrente, cajaDestinoId: "hd-credit", cuentaDestinoId: "bbva-hd" })));
await prueba("presupuesto válido (aunque sea deficitario)", () => assertSucceeds(setDoc(doc(db(ANGEL), ruta(ANGEL, "presupuestos/p1")), presupuesto)));
await prueba("rechaza: presupuesto sin líneas", () => assertFails(setDoc(doc(db(ANGEL), ruta(ANGEL, "presupuestos/p2")), { ...presupuesto, lineas: [] })));
await prueba("otro usuario NO puede leer obligaciones, deudas ni presupuestos", async () => {
  await assertFails(getDoc(doc(db(INTRUSO), ruta(ANGEL, "obligaciones/o1"))));
  await assertFails(getDocs(collection(db(INTRUSO), ruta(ANGEL, "deudas"))));
  await assertFails(getDoc(doc(db(INTRUSO), ruta(ANGEL, "presupuestos/p1"))));
});
await prueba("pago de deuda vinculado (gasto) permitido", () => assertSucceeds(setDoc(doc(db(ANGEL), ruta(ANGEL, "movimientos/pd1")),
  { ...movBase, categoriaId: "ga-deudas", deudaId: "d1", deudaPeriodo: "2026-10-15" })));
await prueba("rechaza: pago de obligación sin periodo", () => assertFails(setDoc(doc(db(ANGEL), ruta(ANGEL, "movimientos/po1")),
  { ...movBase, obligacionId: "o1" })));
await prueba("rechaza: transferencia que dice pagar una deuda", () => assertFails(setDoc(doc(db(ANGEL), ruta(ANGEL, "movimientos/pt1")),
  { ...transferencia, deudaId: "d1" })));
await prueba("agregado con porVinculo y porDeuda permitido", () => assertSucceeds(setDoc(doc(db(ANGEL), ruta(ANGEL, "agregados/2026-10")),
  { mes: "2026-10", porVinculo: { "d:d1__2026-10-15": increment(600000) }, porDeuda: { d1: increment(600000) } }, { merge: true })));

await env.cleanup();
console.log(`\n${ok} de ${ok + fallas.length} pruebas de reglas correctas`);
process.exit(fallas.length ? 1 : 0);
