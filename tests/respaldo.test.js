import { test, assert } from "./lib.js";
import { construirRespaldo, validarRespaldo, planImportacion, movimientoParaCrear, documentoParaGuardar, plano, nombreArchivo, etiqueta } from "../js/domain/respaldo.js";

const ts = { toMillis: () => 1760000000000 }; // así llegan los Timestamps de Firestore
const mov = (id, extra = {}) => ({ id, tipo: "gasto", fecha: "2026-10-05", mes: "2026-10", montoCentavos: 50000, cajaId: "a", cuentaId: "c",
  categoriaId: "ga-otros", nota: "Gasolina", estado: "activo", ts: 1, origen: "manual", createdAt: ts, cajaIds: ["a"], cuentaIds: ["c"], ...extra });

function ejemplo() {
  return construirRespaldo({
    uid: "u1", version: "v1.8.0", exportadoEn: "2026-10-11T20:00:00.000Z",
    colecciones: { cajas: [{ id: "a", nombre: "Personal", tipo: "operativa", createdAt: ts }], cuentas: [{ id: "c", nombre: "HSBC", tipo: "debito" }],
      metas: [{ id: "m1", nombre: "Remodelación" }] },
    movimientos: [
      mov("m1", { historial: [{ id: "h1", accion: "crear", cambios: { montoCentavos: { despues: 50000 } }, ts: 1, en: ts }] }),
      mov("m2", { estado: "anulado", anulacion: { motivo: "duplicado", ts: 5 } }),
    ],
    config: { tema: "dark", saldosIniciales: "listo" },
  });
}

test("respaldo: se arma con todos los datos en formato plano (sin Timestamps)", () => {
  const r = ejemplo();
  assert.eq([r.app, r.schemaVersion, r.conteos.cajas, r.conteos.movimientos, r.conteos.metas, r.conteos.deudas], ["finanzas-reset", 1, 1, 2, 1, 0]);
  assert.eq(r.data.cajas[0].createdAt, 1760000000000);
  assert.eq(r.data.movimientos[0].historial[0].en, 1760000000000);
  assert.eq(JSON.parse(JSON.stringify(r)).data.config.tema, "dark");
  assert.eq(plano({ a: [ts, { b: ts }] }), { a: [1760000000000, { b: 1760000000000 }] });
  assert.eq([nombreArchivo("2026-10-11"), etiqueta("movimientos", 1), etiqueta("cajas", 3)], ["Finanzas_Reset_respaldo_2026-10-11.json", "1 movimiento", "3 cajas"]);
});

test("respaldo: valida el archivo (otra app, versión más nueva, movimientos dañados)", () => {
  assert.ok(validarRespaldo(ejemplo()).ok);
  assert.eq(validarRespaldo({ app: "otra", data: {} }).ok, false);
  assert.eq(validarRespaldo(null).ok, false);
  assert.ok(validarRespaldo({ ...ejemplo(), schemaVersion: 9 }).error.includes("más nueva"));
  const danado = ejemplo();
  danado.data.movimientos.push({ id: "x", tipo: "gasto", fecha: "mal", montoCentavos: -5 });
  const v = validarRespaldo(danado);
  assert.eq([v.ok, v.conteos.movimientos, v.invalidos.movimientos], [true, 2, 1]);
});

test("respaldo: restaurar solo agrega lo que falta (no toca lo que ya existe)", () => {
  const p = planImportacion(ejemplo(), { cajas: new Set(["a"]), movimientos: new Set(["m1"]) });
  assert.eq([p.porColeccion.cajas.nuevos.length, p.porColeccion.cajas.existentes, p.porColeccion.cuentas.nuevos.length], [0, 1, 1]);
  assert.eq([p.movimientos.nuevos.map((m) => m.id), p.movimientos.existentes, p.movimientos.anulados], [["m2"], 1, 1]);
  assert.eq(p.totalNuevos, 3); // 1 banco + 1 meta + 1 movimiento
  assert.eq(planImportacion(ejemplo(), {}).totalNuevos, 5);
});

test("respaldo: un movimiento anulado se recrea activo y luego se anula con su motivo", () => {
  const { datos, anulacion, historial } = movimientoParaCrear(ejemplo().data.movimientos[1]);
  assert.eq([datos.estado, datos.ts, datos.origen, datos.mes, datos.cajaIds], ["activo", 1, "manual", "2026-10", ["a"]]);
  assert.eq(anulacion, { motivo: "duplicado", ts: 5 });
  assert.eq(historial, []);
  const otro = movimientoParaCrear(ejemplo().data.movimientos[0]);
  assert.eq([otro.anulacion, otro.historial.map((h) => [h.id, h.accion, h.ts])], [null, [["h1", "crear", 1]]]);
  assert.eq(documentoParaGuardar({ id: "a", nombre: "X", createdAt: 1, updatedAt: 2, schemaVersion: 1 }), { nombre: "X" });
});
